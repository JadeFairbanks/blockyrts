// The message panel (Unit speech and the message panel): what the player's
// units say, with the speaker's name, the peoples' important lines, game
// alerts, and (from milestone 9) the other players' chat. It keeps the
// latest 60 messages and every player message, scrolls, filters three ways,
// collapses to a small button that flashes on an urgent message, and a
// click on a message jumps the camera to the unit that said it or to where
// it happened. Urgent messages stand out and ping the minimap.
import type { ButtonRegistry, HudButton } from './buttons.ts';
import type { HudPanels } from './panels.ts';

/** Kept messages, player messages aside (doc: the latest 60). */
export const MESSAGES_KEPT = 60;

/** What a message is, for its look and the filter. */
export type MessageKind = 'system' | 'alert' | 'speech' | 'player';

export interface PanelMessage {
  text: string;
  kind: MessageKind;
  /** Who said it: a unit's name, another player's name, or none. */
  name?: string | undefined;
  /** Needs the player's attention: stands out, pings the minimap, flashes the collapsed button. */
  urgent?: boolean | undefined;
  /** Where it happened, metres. */
  at?: { x: number; z: number } | undefined;
  /** The unit that said it (entity id): a click follows it to where it is now. */
  unit?: number | undefined;
}

/** The three views of the filter button (doc): everything; alerts and player messages; player messages only. */
export const FILTERS = ['All messages', 'Alerts and players', 'Players only'] as const;

/** Whether a message shows under a filter. */
export function shownUnder(filter: number, m: Pick<PanelMessage, 'kind' | 'urgent'>): boolean {
  if (filter === 0) return true;
  if (filter === 1) return m.kind === 'player' || m.kind === 'alert' || m.urgent === true;
  return m.kind === 'player';
}

/**
 * Which messages to drop when one more comes in: the oldest ones that are
 * not player messages, while more than `keep` of those remain.
 */
export function overflow(kinds: readonly MessageKind[], keep = MESSAGES_KEPT): number[] {
  const out: number[] = [];
  let others = kinds.filter((k) => k !== 'player').length;
  for (let i = 0; i < kinds.length && others > keep; i++) {
    if (kinds[i] === 'player') continue;
    out.push(i);
    others--;
  }
  return out;
}

export interface MessagePanelActions {
  /** The camera to a point, metres. */
  jumpTo(x: number, z: number): void;
  /** The camera to a unit where it stands now; false when it is gone. */
  jumpToUnit(id: number): boolean;
  /** A ping on the minimap, metres. */
  ping(x: number, z: number): void;
  /** Seconds since the match began, for the time stamp. */
  clock(): string;
}

interface Row {
  el: HTMLElement;
  kind: MessageKind;
  urgent: boolean;
  btn: string;
}

export class MessagePanel {
  private readonly rows: Row[] = [];
  private filter = 0;
  private collapsed = false;
  private seq = 0;
  private readonly filterBtn: HudButton;
  private readonly collapseBtn: HudButton;
  private readonly openBtn: HudButton;
  private readonly openPanel: HTMLElement;

  constructor(
    private readonly panel: HTMLElement,
    private readonly list: HTMLElement,
    root: HTMLElement,
    panels: HudPanels,
    private readonly buttons: ButtonRegistry,
    private readonly a: MessagePanelActions,
  ) {
    const head = document.createElement('div');
    head.className = 'msg-head';
    panel.prepend(head);
    this.filterBtn = buttons.add({
      id: 'msg-filter',
      face: FILTERS[0],
      name: 'Message filter',
      keys: [],
      description: 'Switches between everything, alerts and player messages only, and player messages only.',
      className: 'msg-tool msg-filter',
      onPress: () => this.setFilter((this.filter + 1) % FILTERS.length),
    });
    this.collapseBtn = buttons.add({
      id: 'msg-collapse',
      face: '–',
      name: 'Collapse messages',
      keys: [],
      description: 'Folds the message panel away to a small button, which flashes when something urgent comes in.',
      className: 'msg-tool',
      onPress: () => this.setCollapsed(true),
    });
    head.append(this.filterBtn.el, this.collapseBtn.el);
    this.openPanel = document.createElement('div');
    this.openPanel.className = 'panel messages-open';
    this.openPanel.hidden = true;
    this.openBtn = buttons.add({
      id: 'msg-open',
      face: '✉',
      name: 'Messages',
      keys: [],
      description: 'Opens the message panel again.',
      className: 'msg-open',
      onPress: () => this.setCollapsed(false),
    });
    this.openPanel.append(this.openBtn.el);
    root.append(this.openPanel);
    panels.register('messages-open', this.openPanel);
  }

  /** Adds a message at the bottom; the oldest beyond 60 go (never another player's). */
  add(m: PanelMessage): void {
    const id = `msg${this.seq++}`;
    const target = m.unit !== undefined || m.at !== undefined;
    const b = this.buttons.add({
      id,
      face: '',
      name: target ? 'Go there' : 'Message',
      keys: [],
      description: target ? 'Click to jump the camera to the unit that said it, or to where it happened. Space jumps to the latest urgent message.' : 'Nothing to jump to.',
      className: `msg msg-btn ${m.kind}${m.urgent ? ' urgent' : ''}`,
      onPress: () => this.open(m),
    });
    const row = b.el;
    row.replaceChildren();
    const t = document.createElement('span');
    t.className = 'msg-time';
    t.textContent = this.a.clock();
    row.append(t);
    if (m.name) {
      const n = document.createElement('span');
      n.className = 'msg-name';
      n.textContent = `${m.name}: `;
      row.append(n);
    }
    row.append(document.createTextNode(m.text));
    row.hidden = !shownUnder(this.filter, m);
    const atBottom = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 4;
    this.list.append(row);
    this.rows.push({ el: row, kind: m.kind, urgent: m.urgent === true, btn: id });
    for (const k of overflow(this.rows.map((r) => r.kind)).reverse()) {
      const [r] = this.rows.splice(k, 1);
      this.buttons.remove(r!.btn);
    }
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
    if (m.urgent) {
      if (m.at) this.a.ping(m.at.x, m.at.z);
      if (this.collapsed) this.openPanel.classList.add('flash');
    }
  }

  /** Chat for milestone 9: a message from another player (highlighted, kept beyond the 60). */
  addPlayer(name: string, text: string): void {
    this.add({ text, kind: 'player', name });
  }

  setFilter(f: number): void {
    this.filter = f;
    this.filterBtn.setFace(FILTERS[f]!).setLit(f !== 0);
    for (const r of this.rows) r.el.hidden = !shownUnder(f, r);
    this.list.scrollTop = this.list.scrollHeight;
  }

  setCollapsed(on: boolean): void {
    this.collapsed = on;
    this.panel.hidden = on;
    this.openPanel.hidden = !on;
    this.openPanel.classList.remove('flash');
    if (!on) this.list.scrollTop = this.list.scrollHeight;
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  private open(m: PanelMessage): void {
    if (m.unit !== undefined && this.a.jumpToUnit(m.unit)) return;
    if (m.at) this.a.jumpTo(m.at.x, m.at.z);
  }
}
