// The command card's right-click dropdown (Patch 5, Jade's GP-3: "dropdown on
// right click to open dropdown with options scrap 1, scrap 10, scrap all"): a
// column of menu buttons just above the card button right clicked, framed like
// the training cards' tier strip. A pick, Esc, a press anywhere else or the
// card losing that button closes it.
import type { ButtonRegistry } from './buttons.ts';
import type { CardChoice } from './commands.ts';

export class CardPop {
  private ids: string[] = [];
  /** The action of the card button it belongs to. */
  action = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly buttons: ButtonRegistry,
  ) {}

  get open(): boolean {
    return !this.el.hidden;
  }

  /** Opens the choices over a card button. */
  show(at: HTMLElement, action: string, choices: readonly CardChoice[]): void {
    this.clear();
    if (choices.length === 0) return;
    this.action = action;
    choices.forEach((c, k) => {
      const id = `card-pop-${k}`;
      const b = this.buttons.add({
        id,
        face: c.name,
        name: c.name,
        keys: [],
        description: c.description,
        className: 'cmd menu-item pop-item',
        onPress: () => {
          this.close();
          c.run();
        },
      });
      this.ids.push(id);
      this.el.append(b.el);
    });
    this.el.hidden = false;
    // Just above the button, scaled with the rest of the HUD.
    const s = Number(getComputedStyle(this.el.parentElement ?? this.el).getPropertyValue('--hud-s')) || 1;
    const r = at.getBoundingClientRect();
    const w = this.el.offsetWidth * s;
    const h = this.el.offsetHeight * s;
    const st = this.el.style;
    st.transformOrigin = '0 0';
    st.transform = s === 1 ? '' : `scale(${s})`;
    st.left = `${Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)))}px`;
    st.top = `${Math.round(Math.max(4, r.top - h - 4))}px`;
  }

  /** Closes it; true when it was open. */
  close(): boolean {
    if (!this.open) return false;
    this.clear();
    return true;
  }

  /** Any press while it is open: one on it is its own; anything else closes it, and a press in the game view does nothing more. True to swallow the press. */
  pressed(inHud: boolean, el: Element | null): boolean {
    if (!this.open) return false;
    if (el && this.el.contains(el)) return false;
    this.close();
    return !inHud;
  }

  private clear(): void {
    for (const id of this.ids) this.buttons.remove(id);
    this.ids = [];
    this.action = '';
    this.el.replaceChildren();
    this.el.hidden = true;
  }
}
