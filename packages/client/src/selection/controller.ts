// Left button in the game view: click versus 4 px drag, the clamped drag box
// with its live highlight, double click and the modifier keys
// (Controls > Selecting units and buildings).
import type * as THREE from 'three';
import type { RtsCamera } from '../camera/rts-camera.ts';
import type { HudPanels } from '../hud/panels.ts';
import { clampBoxCorner, rectFromCorners, type Pt, type Rect } from '../hud/rects.ts';
import type { Mods } from '../input/input-manager.ts';
import {
  applyBox,
  applyClick,
  inBox,
  isDoubleClick,
  isDrag,
  pickAt,
  priorityFilter,
  typeWithin,
  type ClickRecord,
  type ScreenItem,
} from './rules.ts';
import type { SelectionSet } from './selection.ts';
import type { Selectable } from './types.ts';

export class SelectionController {
  /** True while a drag box is out. */
  dragging = false;
  /** What the drag box would select now, or the thing under the cursor; drawn with the strong highlight. */
  highlighted: Selectable[] = [];
  private press: { p: Pt; world: THREE.Vector3 | null } | null = null;
  private lastClick: ClickRecord | null = null;
  /** The selection before the first click of a double click, for a double click within a mixed selection (CT-5). */
  private beforeClick: readonly Selectable[] = [];
  private readonly cursor: Pt = { x: 0, y: 0 };
  private readonly startScreen: Pt = { x: 0, y: 0 };
  private box: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(
    private readonly cam: RtsCamera,
    private readonly panels: HudPanels,
    private readonly selection: SelectionSet,
    private readonly player: number,
    private readonly items: () => readonly ScreenItem<Selectable>[],
    private readonly boxEl: HTMLElement,
  ) {}

  /** Left button down in the game view (never on the HUD: the input manager sees to that). */
  down(p: Pt): void {
    this.press = { p: { x: p.x, y: p.y }, world: this.cam.pick(p) };
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    this.dragging = false;
  }

  move(p: Pt): void {
    this.cursor.x = p.x;
    this.cursor.y = p.y;
    if (this.press && !this.dragging && isDrag(this.press.p, p)) this.dragging = true;
  }

  up(p: Pt, mods: Mods): void {
    this.move(p);
    const press = this.press;
    if (!press) return;
    if (this.dragging) this.layoutBox();
    this.press = null;
    if (this.dragging) {
      this.dragging = false;
      this.boxEl.hidden = true;
      const picked = priorityFilter(inBox(this.items(), this.box), this.player, this.startScreen);
      this.selection.set(applyBox(this.selection.list(), picked, mods.shift, this.player));
      return;
    }
    const rec: ClickRecord = { t: performance.now(), x: p.x, y: p.y };
    const double = isDoubleClick(this.lastClick, rec);
    // A third quick click stays a double click, so the type selection is not undone.
    this.lastClick = rec;
    const hit = pickAt(this.items(), press.p);
    // Clicking empty ground keeps the selection.
    if (!hit) return;
    if (!double) this.beforeClick = [...this.selection.list()];
    // A double click on a unit of a mixed selection keeps only its type there (Jade's Patch 5, CT-5).
    const within = double && !mods.shift && !mods.ctrl ? typeWithin(this.beforeClick, hit.item) : null;
    if (within) {
      this.selection.set(within);
      return;
    }
    this.selection.set(
      applyClick(this.selection.list(), hit.item, { shift: mods.shift, ctrl: mods.ctrl, double }, this.items(), this.player),
    );
  }

  /** Drops a press or drag without selecting anything. */
  cancel(): void {
    this.press = null;
    this.dragging = false;
    this.boxEl.hidden = true;
  }

  /** The drag box's start corner stays pinned to its world point while the camera moves. */
  private layoutBox(): void {
    const press = this.press;
    if (!press) return;
    if (!press.world || !this.cam.project(press.world, this.startScreen)) {
      this.startScreen.x = press.p.x;
      this.startScreen.y = press.p.y;
    }
    const end = clampBoxCorner(this.startScreen, this.cursor, this.panels.rects(), window.innerWidth, window.innerHeight);
    this.box = rectFromCorners(this.startScreen, end);
  }

  /** Once a frame, after the camera moved: redraw the box and the live highlight. */
  frame(cursorInGameView: boolean): void {
    if (this.dragging && this.press) {
      this.layoutBox();
      const b = this.box;
      const s = this.boxEl.style;
      s.transform = `translate(${b.x0}px, ${b.y0}px)`;
      s.width = `${b.x1 - b.x0}px`;
      s.height = `${b.y1 - b.y0}px`;
      this.boxEl.hidden = false;
      this.highlighted = priorityFilter(inBox(this.items(), b), this.player, this.startScreen);
      return;
    }
    const hit = cursorInGameView && !this.press ? pickAt(this.items(), this.cursor) : null;
    this.highlighted = hit ? [hit.item] : [];
  }

  /** Called on every cursor move over the game view, to keep the hover highlight current. */
  hover(p: Pt): void {
    if (!this.press) {
      this.cursor.x = p.x;
      this.cursor.y = p.y;
    }
  }
}
