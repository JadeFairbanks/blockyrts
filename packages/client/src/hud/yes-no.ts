// Yes and No buttons (Patch 2, round 3): a green tick and the red cross the
// action menu's Cancel uses, small enough to sit in a speech bubble. They
// are HUD buttons in a HUD panel of their own, so the mouse, a tap with
// touch controls and the locked cursor all work on them as on any button,
// each with its full meaning in its tooltip, while a click beside them still
// reaches the world. The question bubbles use them, and the tips' "Turn tips
// off?" (Patch 2, round 4) can too: new YesNoButtons(...), then dispose().
import { badgeSvg, type ButtonRegistry, type HudButton } from './buttons.ts';
import type { HudPanels } from './panels.ts';

/** The tick picture (the model thread's, Patch 2); until the kit has it, a pixel tick drawn here stands in. */
export const YES_ICON = 'icon_cmd_confirm';
/** The cross on the action menu's Cancel. */
export const NO_ICON = 'icon_cmd_cancel';

export interface YesNoSide {
  /** The tooltip's title: "Yes" or "No" unless given. */
  name?: string;
  /** What it does, in full, for the tooltip. */
  description: string;
  onPress: () => void;
}

export interface YesNoDef {
  /** A key no other pair on screen has: the buttons are `yes-no:${key}:yes` and `:no`. */
  key: string;
  yes: YesNoSide;
  no: YesNoSide;
}

export class YesNoButtons {
  /** The pair, side by side: put it where it belongs (a bubble, a tip). */
  readonly el: HTMLElement;
  private readonly yes: HudButton;
  private readonly no: HudButton;
  private disposed = false;

  constructor(
    private readonly buttons: ButtonRegistry,
    private readonly panels: HudPanels,
    private readonly def: YesNoDef,
  ) {
    this.el = document.createElement('span');
    this.el.className = 'yes-no';
    this.yes = this.button('yes', YES_ICON, 'Yes', def.yes);
    this.no = this.button('no', NO_ICON, 'No', def.no);
    this.el.append(this.yes.el, this.no.el);
    panels.register(`yes-no:${def.key}`, this.el);
  }

  private button(side: 'yes' | 'no', file: string, name: string, s: YesNoSide): HudButton {
    const b = this.buttons.add({
      id: `yes-no:${this.def.key}:${side}`,
      icon: { layers: [{ file }] },
      face: '',
      name: s.name ?? name,
      keys: [],
      description: s.description,
      className: `yes-no-btn ${side}`,
      onPress: () => {
        if (!this.disposed) s.onPress();
      },
    });
    // Without the kit's picture the face shows: a pixel tick or cross.
    const face = b.el.querySelector<HTMLElement>('.face');
    if (face) face.innerHTML = badgeSvg(side === 'yes' ? 'ok' : 'cross');
    return b;
  }

  /** Takes the buttons away for good: out of the page, the buttons and the panels. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.buttons.remove(this.yes.def.id);
    this.buttons.remove(this.no.def.id);
    this.panels.unregister(this.el);
    this.el.remove();
  }
}
