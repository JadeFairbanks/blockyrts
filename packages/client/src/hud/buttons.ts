// HUD buttons: every one shows its hotkey in a corner and in its tooltip
// (Controls > Screen layout). They are driven by the input manager, never by
// DOM click events, so they work the same with the cursor locked or not.
import { keyLabel } from '../input/keys.ts';
import { kitUrl } from './kit-icons.ts';
import { oneIsSingular } from './wording.ts';

export interface ButtonPress {
  shift: boolean;
  ctrl: boolean;
}

/** A small pixel mark on an icon's corner: better (up), the best (max), worse (down), off (cross), confirm (ok), next page. */
export type IconBadge = 'up' | 'max' | 'down' | 'cross' | 'ok' | 'next';

/**
 * A button's picture (patch notes 1: pictures instead of words on the command
 * card): kit pictures drawn over each other, the first at the back (two
 * swords, one mirrored, cross for Attack), with a badge and a short tag.
 */
export interface ButtonIcon {
  /** Shift: drawn a little to one side, so two pictures sit side by side (Upgrade equipment's weapon and armour). */
  layers: ReadonlyArray<{ file: string; mirror?: boolean; filter?: string; shift?: 'left' | 'right' }>;
  badge?: IconBadge;
  /** A word or number in the bottom corner: a page, a mode. */
  tag?: string;
}

export interface HudButtonDef {
  id: string;
  /** A picture instead of the face (the face is then only in the tooltip). */
  icon?: ButtonIcon | undefined;
  /** Text or a glyph on the button face. */
  face: string;
  /** Name in the tooltip. */
  name: string;
  /** Binding names that press it (see keyId), first one shown on the badge; empty for none. */
  keys: string[];
  /** Badge text when it differs from the first key's label (e.g. "Shift" for a hold key). */
  badge?: string;
  /** What it does, for the tooltip (a line per line). */
  description: string;
  /** A last, quieter tooltip line: what a click does ("Click to pick it."). */
  foot?: string;
  /** The tooltip leads with why it is greyed out (Patch 2: a training card's picture). */
  reasonFirst?: boolean;
  /** Extra classes for the button element. */
  className?: string;
  onPress?: (p: ButtonPress) => void;
  onRightClick?: (p: ButtonPress) => void;
  /** The right click works while it is greyed out too (Patch 5: a spell's autocast). */
  rightWhenGrey?: boolean;
  onDoubleClick?: (p: ButtonPress) => void;
  /** A click or its key while it is greyed out (Patch 3: the command card asks those who can sort out why). */
  onGreyPress?: () => void;
}

export class HudButton {
  readonly el: HTMLElement;
  private readonly keyEl: HTMLElement;
  private readonly faceEl: HTMLElement;
  private iconEl: HTMLElement | null = null;
  private coolEl: HTMLElement | null = null;
  private iconSig = '';
  enabled = true;
  /** Why it is greyed out, for the tooltip. */
  disabledReason = '';

  constructor(public def: HudButtonDef) {
    this.el = document.createElement('div');
    this.el.className = `hud-btn ${def.className ?? ''}`.trim();
    this.el.dataset.btn = def.id;
    this.faceEl = document.createElement('span');
    this.faceEl.className = 'face';
    this.faceEl.textContent = def.face;
    this.keyEl = document.createElement('span');
    this.keyEl.className = 'key';
    this.keyEl.textContent = this.badge();
    this.el.append(this.faceEl, this.keyEl);
    this.el.setAttribute('aria-label', def.name);
    this.setIcon(def.icon);
  }

  /** Draws the button's picture, or takes it away; the text face shows when there is none (or the kit lacks it). */
  private setIcon(icon: ButtonIcon | undefined): void {
    const layers = icon ? icon.layers.filter((l) => kitUrl(l.file) !== '') : [];
    const sig = layers.length > 0 ? JSON.stringify([layers, icon!.badge, icon!.tag]) : '';
    if (sig === this.iconSig) return;
    this.iconSig = sig;
    this.iconEl?.remove();
    this.iconEl = null;
    this.el.classList.toggle('has-icon', sig !== '');
    if (!sig) return;
    const host = document.createElement('span');
    host.className = 'btn-icon';
    for (const l of layers) {
      const img = document.createElement('img');
      img.src = kitUrl(l.file);
      img.alt = '';
      img.draggable = false;
      img.className = [l.mirror ? 'mirror' : '', l.shift ? `shift-${l.shift}` : ''].filter((c) => c).join(' ');
      if (l.filter) img.style.filter = l.filter;
      host.append(img);
    }
    if (icon!.badge) {
      const b = document.createElement('span');
      b.className = `btn-badge ${icon!.badge}`;
      b.innerHTML = badgeSvg(icon!.badge);
      host.append(b);
    }
    if (icon!.tag) {
      const t = document.createElement('span');
      t.className = 'btn-tag';
      t.textContent = icon!.tag;
      host.append(t);
    }
    this.el.insertBefore(host, this.faceEl);
    this.iconEl = host;
  }

  badge(): string {
    return this.def.badge ?? (this.def.keys[0] ? keyLabel(this.def.keys[0]) : '');
  }

  setEnabled(on: boolean, reason = ''): this {
    this.enabled = on;
    this.disabledReason = on ? '' : reason;
    this.el.classList.toggle('disabled', !on);
    return this;
  }

  setLit(on: boolean): this {
    this.el.classList.toggle('lit', on);
    return this;
  }

  /** A spell's cooldown (Patch 5, VX-9): the share of it still to run, 0 to 1; dark over the button, which a clock hand sweeps off (hud.css .cool). */
  setCool(left: number): this {
    if (left > 0 && !this.coolEl) {
      this.coolEl = document.createElement('span');
      this.coolEl.className = 'cool';
      this.el.append(this.coolEl);
    }
    if (this.coolEl) {
      this.coolEl.hidden = left <= 0;
      this.coolEl.style.setProperty('--cool', String(Math.max(0, Math.min(1, left))));
    }
    return this;
  }

  /** Gives the button a new meaning (the command card's slots change with the selection). */
  redefine(def: HudButtonDef): this {
    this.def = def;
    this.faceEl.textContent = def.face;
    this.keyEl.textContent = this.badge();
    this.el.className = `hud-btn ${def.className ?? ''}`.trim();
    this.el.classList.toggle('disabled', !this.enabled);
    this.el.setAttribute('aria-label', def.name);
    this.el.classList.toggle('has-icon', this.iconSig !== '');
    this.setIcon(def.icon);
    return this;
  }

  setFace(text: string): this {
    this.faceEl.textContent = text;
    return this;
  }

  /** On screen: attached and not inside anything hidden. */
  visible(): boolean {
    return this.el.isConnected && this.el.getClientRects().length > 0;
  }

  /** The tooltip lines: name and hotkey, what it does, why it is greyed out (or another reason it gives), and what a click does. */
  tooltip(): { title: string; key: string; body: string; reason: string; foot: string; reasonFirst: boolean } {
    return { title: this.def.name, key: this.badge(), body: this.def.description, reason: this.disabledReason || this.note, foot: this.def.foot ?? '', reasonFirst: this.def.reasonFirst === true };
  }

  /** An orange tooltip line on a button that still works (a tier the stock is short of: it can be picked). */
  note = '';
}

export class ButtonRegistry {
  private readonly byId = new Map<string, HudButton>();

  add(def: HudButtonDef): HudButton {
    const b = new HudButton(def);
    this.byId.set(def.id, b);
    return b;
  }

  remove(id: string): void {
    const b = this.byId.get(id);
    if (!b) return;
    b.el.remove();
    this.byId.delete(id);
  }

  get(id: string): HudButton | undefined {
    return this.byId.get(id);
  }

  /** The button an element belongs to, if any. */
  fromElement(el: Element | null): HudButton | null {
    const host = el?.closest<HTMLElement>('[data-btn]');
    return host ? (this.byId.get(host.dataset.btn!) ?? null) : null;
  }

  /** The visible button bound to a key, if any. */
  forKey(id: string): HudButton | null {
    for (const b of this.byId.values()) if (b.def.keys.includes(id) && b.visible()) return b;
    return null;
  }
}

/** One tooltip element for every HUD button, placed next to the button it describes. */
export class Tooltip {
  private readonly el: HTMLElement;
  private current: HudButton | null = null;
  private sig = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(b: HudButton | null): void {
    if (b === this.current && (b === null || !this.el.hidden)) {
      if (b) this.fill(b); // the reason may have changed
      return;
    }
    this.current = b;
    if (!b) {
      this.el.hidden = true;
      return;
    }
    this.fill(b);
    this.el.hidden = false;
    const r = b.el.getBoundingClientRect();
    const t = this.el.getBoundingClientRect();
    const margin = 6;
    let x = r.left + r.width / 2 - t.width / 2;
    x = Math.max(margin, Math.min(window.innerWidth - t.width - margin, x));
    // Above the button if there is room, else below.
    let y = r.top - t.height - margin;
    if (y < margin) y = r.bottom + margin;
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private fill(b: HudButton): void {
    const raw = b.tooltip();
    const t = { title: oneIsSingular(raw.title), key: raw.key, body: oneIsSingular(raw.body), reason: oneIsSingular(raw.reason), foot: oneIsSingular(raw.foot) };
    const sig = `${t.title}|${t.key}|${t.body}|${t.reason}|${t.foot}|${raw.reasonFirst}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tt-head';
    head.textContent = t.title;
    if (t.key) {
      const k = document.createElement('span');
      k.className = 'tt-key';
      k.textContent = t.key;
      head.append(' ', k);
    }
    const body = document.createElement('div');
    body.className = 'tt-body';
    body.textContent = t.body;
    body.hidden = t.body === '';
    const reason = document.createElement('div');
    reason.className = 'tt-reason';
    reason.textContent = t.reason;
    reason.hidden = t.reason === '';
    this.el.append(head, ...(raw.reasonFirst ? [reason, body] : [body, reason]));
    if (t.foot) {
      const foot = document.createElement('div');
      foot.className = 'tt-foot';
      foot.textContent = t.foot;
      this.el.append(foot);
    }
  }
}

/** The badges as 7 x 7 pixel pictures with a dark outline, so they read on any icon. */
const BADGES: Record<IconBadge, { colour: string; rows: string[] }> = {
  up: { colour: '#7ee86a', rows: ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'] },
  max: { colour: '#ffd84a', rows: ['...#...', '..###..', '.#####.', '...#...', '..###..', '.#####.', '#######'] },
  down: { colour: '#ff9a4a', rows: ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'] },
  cross: { colour: '#ff5a46', rows: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'] },
  ok: { colour: '#7ee86a', rows: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'] },
  next: { colour: '#f4ecd2', rows: ['...#...', '...##..', '#######', '#######', '...##..', '...#...', '.......'] },
};

const badgeCache = new Map<IconBadge, string>();

/** A badge's SVG: the shape grown by a pixel in dark brown, then the shape in its colour. */
export function badgeSvg(b: IconBadge): string {
  const hit = badgeCache.get(b);
  if (hit) return hit;
  const { colour, rows } = BADGES[b];
  const on = (x: number, y: number): boolean => rows[y]?.[x] === '#';
  let dark = '';
  let lit = '';
  for (let y = -1; y <= 7; y++) {
    for (let x = -1; x <= 7; x++) {
      if (on(x, y)) lit += `M${x + 1} ${y + 1}h1v1h-1z`;
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) dark += `M${x + 1} ${y + 1}h1v1h-1z`;
    }
  }
  const svg = `<svg viewBox="0 0 9 9" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true"><path d="${dark}" fill="#1a120c"/><path d="${lit}" fill="${colour}"/></svg>`;
  badgeCache.set(b, svg);
  return svg;
}
