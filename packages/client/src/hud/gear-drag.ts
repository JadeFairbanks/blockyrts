// Drag and drop of gear (Patch 7, plan section 7: "Drag a stock or bag item
// onto a unit, or onto its portrait, to equip it. Drag a bag item onto
// another unit to give it. Drag an item onto the Workshop to scrap it."). A
// left press on a piece in the stockpile, in one unit's bag or on its kit
// slots that moves on picks it up (input-manager.ts DragHooks): its picture
// follows the cursor with a word for what letting go there does, and letting
// go does it. A right click or Esc puts it back. Menus stay the main way;
// dragging is a shortcut (Jade's G-13), so it works with the mouse alone and
// with the cursor locked, as every HUD button does.
//
// Letting go on a unit the piece does not fit still sends the order: the
// unit says why in its bubble (the Dreadnought: "I need something for
// smashing.").
import type { DragHooks } from '../input/input-manager.ts';
import type { HeldPiece, HudButton } from './buttons.ts';
import { goodIcon, iconUrl } from './inventory-icons.ts';
import type { Pt } from './rects.ts';

/** What is under the cursor: one of the player's units, one of their Workshops, their stockpile (mini patch 7.3), or nothing it can go to. */
export type DropOn = { kind: 'unit'; unit: number } | { kind: 'workshop'; building: number } | { kind: 'stock' } | { kind: 'none' };

/** What letting go would do: its word under the picture, and the order it sends. */
export interface DropPlan {
  /** "Equip", "Give to Iron swordsman", "Scrap at the Workshop". */
  label: string;
  /** Why it will not take (the unit will say so), shown in amber; '' when it should. */
  why: string;
  run(): void;
}

export interface GearDragDeps {
  /** What is under the cursor, and the element there. */
  target(p: Pt, el: Element | null): DropOn;
  /** What letting go of a piece there does, or null for nothing. */
  plan(from: HeldPiece, on: DropOn): DropPlan | null;
}

/** The picture's offset from the cursor, px, so the cursor's own point stays in sight. */
const OFFSET = 10;

export class GearDrag implements DragHooks {
  private readonly ghost: HTMLElement;
  private readonly pic: HTMLImageElement;
  private readonly word: HTMLElement;
  private held: HeldPiece | null = null;

  constructor(
    root: HTMLElement,
    private readonly d: GearDragDeps,
  ) {
    this.ghost = document.createElement('div');
    this.ghost.className = 'gear-ghost';
    this.ghost.hidden = true;
    this.pic = document.createElement('img');
    this.pic.alt = '';
    this.pic.draggable = false;
    this.word = document.createElement('span');
    this.word.className = 'gear-ghost-word';
    this.ghost.append(this.pic, this.word);
    root.append(this.ghost);
  }

  /** Whether a piece is being dragged. */
  get active(): boolean {
    return this.held !== null;
  }

  start(btn: HudButton, p: Pt): boolean {
    const from = btn.def.holds;
    if (!from) return false;
    this.held = from;
    const icon = goodIcon(from.res);
    this.pic.src = icon ? iconUrl(icon.file) : '';
    this.pic.style.filter = icon?.tint ?? '';
    this.ghost.hidden = false;
    this.place(p);
    return true;
  }

  move(p: Pt): void {
    if (!this.held) return;
    this.place(p);
    const el = document.elementFromPoint(p.x, p.y);
    const plan = this.d.plan(this.held, this.d.target(p, el));
    const text = plan ? (plan.why ? `${plan.label}: ${plan.why}` : plan.label) : '';
    if (this.word.textContent !== text) this.word.textContent = text;
    this.word.hidden = text === '';
    this.ghost.classList.toggle('ok', plan !== null && plan.why === '');
    this.ghost.classList.toggle('no', plan !== null && plan.why !== '');
  }

  drop(p: Pt, el: Element | null): void {
    const from = this.held;
    this.cancel();
    if (!from) return;
    this.d.plan(from, this.d.target(p, el))?.run();
  }

  cancel(): void {
    this.held = null;
    this.ghost.hidden = true;
    this.ghost.classList.remove('ok', 'no');
    this.word.textContent = '';
  }

  private place(p: Pt): void {
    this.ghost.style.transform = `translate(${Math.round(p.x + OFFSET)}px, ${Math.round(p.y + OFFSET)}px)`;
  }
}
