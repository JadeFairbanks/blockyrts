// HUD buttons: every one shows its hotkey in a corner and in its tooltip
// (Controls > Screen layout). They are driven by the input manager, never by
// DOM click events, so they work the same with the cursor locked or not.
import { keyLabel } from '../input/keys.ts';

export interface ButtonPress {
  shift: boolean;
  ctrl: boolean;
}

export interface HudButtonDef {
  id: string;
  /** Text or a glyph on the button face. */
  face: string;
  /** Name in the tooltip. */
  name: string;
  /** Binding names that press it (see keyId), first one shown on the badge; empty for none. */
  keys: string[];
  /** Badge text when it differs from the first key's label (e.g. "Shift" for a hold key). */
  badge?: string;
  /** What it does, for the tooltip. */
  description: string;
  /** Extra classes for the button element. */
  className?: string;
  onPress?: (p: ButtonPress) => void;
  onRightClick?: (p: ButtonPress) => void;
  onDoubleClick?: (p: ButtonPress) => void;
}

export class HudButton {
  readonly el: HTMLElement;
  private readonly keyEl: HTMLElement;
  private readonly faceEl: HTMLElement;
  enabled = true;
  /** Why it is greyed out, for the tooltip. */
  disabledReason = '';

  constructor(readonly def: HudButtonDef) {
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

  setFace(text: string): this {
    this.faceEl.textContent = text;
    return this;
  }

  /** On screen: attached and not inside anything hidden. */
  visible(): boolean {
    return this.el.isConnected && this.el.getClientRects().length > 0;
  }

  /** The tooltip lines: name and hotkey, what it does, and why it is greyed out. */
  tooltip(): { title: string; key: string; body: string; reason: string } {
    return { title: this.def.name, key: this.badge(), body: this.def.description, reason: this.disabledReason };
  }
}

export class ButtonRegistry {
  private readonly byId = new Map<string, HudButton>();

  add(def: HudButtonDef): HudButton {
    const b = new HudButton(def);
    this.byId.set(def.id, b);
    return b;
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
    const t = b.tooltip();
    const sig = `${t.title}|${t.key}|${t.body}|${t.reason}`;
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
    this.el.append(head, body);
    if (t.reason) {
      const reason = document.createElement('div');
      reason.className = 'tt-reason';
      reason.textContent = t.reason;
      this.el.append(reason);
    }
  }
}
