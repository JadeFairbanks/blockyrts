// The quest menu (Jade's Patch 5, QV-14): "small (same size as chat)
// collapsible button right above chat button that also starts collapsed".
// It opens on the player's quests, each with what to do, how far along it
// is, the reward, and a Hint: a tooltip (the Halflings' and the Elves',
// QV-19 and QV-30), or a ping on the minimap where the band or beast is
// (the Runkin's, QV-25, and the Dwarves'). Under them it tracks the Stone
// Circle timers (decisions 3.6, QoL 3): the Goddess's blessing and the
// nights to the next Bright Night, with any rows the sim adds (questTimers).
// A quest newly taken or done that the player has not looked at marks the
// button the way the messages button is marked for unread messages.
import { BLESSED_EVERY_NIGHTS, WU_PER_METRE, type QuestView } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { ButtonRegistry, HudButton } from './buttons.ts';
import type { HudPanels } from './panels.ts';
import { Buttons, el, frame } from './peoples-ui.ts';

export interface QuestsActions {
  /** Metres. */
  ping(x: number, z: number): void;
  jumpTo(x: number, z: number): void;
}

/** A quest as the unread mark knows it: new when taken, new again when done. */
export function questKey(q: Pick<QuestView, 'faction' | 'stage' | 'ready'>): string {
  return `${q.faction}:${q.ready ? 'ready' : q.stage}`;
}

/** The nights to the next Bright Night in words (0: the coming night). */
export function brightWords(n: number): string {
  if (n === 0) return 'Tonight';
  if (n === 1) return 'Tomorrow night';
  return `In ${n} nights`;
}

/** The Stone Circle rows the menu tracks: the blessing, the next Bright Night, then the sim's own rows. */
export function timerRows(circles: { blessed: boolean; nextBright: number } | undefined, extra: ReadonlyArray<readonly [string, string]>): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (circles?.blessed) rows.push(["The Goddess's blessing", `Yours: one Bright Night in ${BLESSED_EVERY_NIGHTS}, for the rest of the game.`]);
  if (circles && circles.nextBright >= 0) rows.push(['Next Bright Night', brightWords(circles.nextBright)]);
  for (const [a, b] of extra) rows.push([a, b]);
  return rows;
}

export class QuestsUi {
  private readonly holder: HTMLElement;
  private readonly openBtn: HudButton;
  private readonly badge: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly btns: Buttons;
  private collapsed = true;
  private sig = '';
  /** The quests the player has looked at (questKey). */
  private readonly seen = new Set<string>();
  /** The quests whose Hint is showing in the menu (faction ids). */
  private readonly hints = new Set<number>();

  constructor(
    root: HTMLElement,
    panels: HudPanels,
    buttons: ButtonRegistry,
    private readonly game: GameInfo,
    private readonly a: QuestsActions,
  ) {
    this.holder = el('div', 'panel quests-open', root);
    this.openBtn = buttons.add({
      id: 'quests-open',
      face: '!',
      name: 'Quests',
      keys: [],
      description: 'Opens your quests: what each asks, how far along it is, its reward and a hint. A number on it counts quests you have not looked at yet.',
      className: 'quest-open',
      onPress: () => this.setCollapsed(false),
    });
    this.badge = el('span', 'msg-unread', this.openBtn.el);
    this.badge.hidden = true;
    this.holder.append(this.openBtn.el);
    panels.register('quests-open', this.holder);
    this.panel = el('div', 'panel quests-panel', root);
    this.panel.hidden = true;
    this.panel.dataset.scroll = '';
    panels.register('quests', this.panel);
    this.btns = new Buttons(buttons, 'quest');
  }

  private quests(): QuestView[] {
    return this.game.info?.quests ?? [];
  }

  setCollapsed(on: boolean): void {
    this.collapsed = on;
    this.holder.hidden = !on;
    this.panel.hidden = on;
    this.sig = '';
    if (!on) for (const q of this.quests()) this.seen.add(questKey(q));
    this.refresh();
  }

  /** Esc folds the menu back to its button. */
  closeTop(): boolean {
    if (this.collapsed) return false;
    this.setCollapsed(true);
    return true;
  }

  /** Each info update: the unread mark, where the button sits (above the message panel while it is open), and the menu. */
  refresh(messagesOpen = false): void {
    const list = this.quests();
    this.holder.classList.toggle('over-messages', messagesOpen);
    this.panel.classList.toggle('over-messages', messagesOpen);
    if (!this.collapsed) for (const q of list) this.seen.add(questKey(q));
    const unread = list.filter((q) => !this.seen.has(questKey(q))).length;
    this.badge.hidden = unread === 0;
    this.badge.textContent = unread > 9 ? '9+' : String(unread);
    this.holder.classList.toggle('unread', unread > 0);
    if (this.collapsed) return;
    const info = this.game.info;
    const timers = timerRows(info?.circles, info?.questTimers ?? []);
    const sig = JSON.stringify([list, timers, [...this.hints]]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.draw(list, timers);
  }

  private draw(list: readonly QuestView[], timers: ReadonlyArray<readonly [string, string]>): void {
    this.btns.clear();
    const { head, body } = frame(this.panel, 'Quests');
    this.btns.add(head, { face: '–', name: 'Collapse quests', description: 'Folds the quest menu back to its button.', className: 'dlg-close', onPress: () => this.setCollapsed(true) });
    if (list.length === 0) {
      el('p', 'quest-none', body, 'No quests yet. The leaders of the peoples you meet offer them: look for the question over their heads, and answer it with a unit of yours nearby.');
    }
    for (const q of list) {
      const row = el('div', `quest-row${q.ready ? ' ready' : ''}`, body);
      el('h4', 'quest-title', row, q.ready ? `${q.title}: ready to claim` : q.title);
      el('div', 'quest-giver', row, q.giver);
      el('div', 'quest-task', row, q.task);
      el('div', 'quest-progress', row, q.progress);
      el('div', 'quest-reward', row, `Reward: ${q.reward}`);
      const tools = el('div', 'quest-tools', row);
      const pinged = q.ping !== null;
      this.btns.add(tools, {
        face: 'Hint',
        name: 'Hint',
        description: pinged ? `${q.hint} Click to ping it again.` : q.hint,
        className: 'mini',
        onPress: () => {
          if (q.ping) this.a.ping(q.ping[0] / WU_PER_METRE, q.ping[1] / WU_PER_METRE);
          else if (this.hints.has(q.faction)) this.hints.delete(q.faction);
          else this.hints.add(q.faction);
          this.refresh();
        },
      });
      this.btns.add(tools, {
        face: 'Show giver',
        name: 'Show giver',
        description: `Moves the camera to ${q.giver.charAt(0).toLowerCase()}${q.giver.slice(1)}.`,
        className: 'mini',
        onPress: () => this.a.jumpTo(q.x / WU_PER_METRE, q.z / WU_PER_METRE),
      });
      if (!pinged && this.hints.has(q.faction)) el('div', 'quest-hint', row, q.hint);
    }
    if (timers.length > 0) {
      el('h4', 'quest-section', body, 'Stone circles');
      for (const [a, b] of timers) {
        const t = el('div', 'quest-timer', body);
        el('span', 'quest-timer-name', t, a);
        el('span', 'quest-timer-text', t, b);
      }
    }
  }
}
