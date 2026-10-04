// The selection rules of Controls > Selecting units and buildings, as pure
// functions over screen-projected items. No DOM, no three.js.
import { BuildingKind } from '@blockyrts/sim';
import { pointInRect, padRect, rectsIntersect, type Pt, type Rect } from '../hud/rects.ts';
import type { Selectable } from './types.ts';

/** A press that moves this far (or more) while held is a drag, otherwise a click. */
export const DRAG_PX = 4;
/** Two clicks within this time and distance are a double click. */
export const DOUBLE_CLICK_MS = 300;
export const DOUBLE_CLICK_PX = 4;
/** The generous hit area: each thing's screen box grows by this much on every side. */
export const HIT_PAD_PX = 5;

/** The fields of a Selectable the rules look at. */
export type SelInfo = Pick<Selectable, 'key' | 'kind' | 'owner' | 'typeKey'>;

/** Walls, gates, towers, earthworks, ramps and lights: a drag box takes them only when it catches nothing else of the player's. */
const LINE_KINDS: ReadonlySet<number> = new Set([
  BuildingKind.Wall,
  BuildingKind.WallHardwood,
  BuildingKind.WallStone,
  BuildingKind.Gate,
  BuildingKind.GateHardwood,
  BuildingKind.GateStone,
  BuildingKind.Tower,
  BuildingKind.TowerHardwood,
  BuildingKind.TowerStone,
  BuildingKind.Earthworks,
  BuildingKind.Ramp,
  BuildingKind.TorchPost,
]);

/** Whether a selectable is one of a wall line's pieces or a light (building type keys are 'building:kind:level'). */
export function lineStructure(t: SelInfo): boolean {
  if (t.kind !== 'building' || !t.typeKey.startsWith('building:')) return false;
  return LINE_KINDS.has(Number(t.typeKey.split(':')[1]));
}

/** A selectable thing as it appears on screen this frame. */
export interface ScreenItem<T extends SelInfo = SelInfo> {
  item: T;
  /** The projected bounding box, before padding. */
  rect: Rect;
  /** Screen position of its centre. */
  x: number;
  y: number;
  /** Distance from the camera; smaller is nearer. */
  depth: number;
}

export function isDrag(down: Pt, now: Pt): boolean {
  return Math.hypot(now.x - down.x, now.y - down.y) >= DRAG_PX;
}

export interface ClickRecord {
  /** Milliseconds. */
  t: number;
  x: number;
  y: number;
}

export function isDoubleClick(prev: ClickRecord | null, cur: ClickRecord): boolean {
  return (
    prev !== null &&
    cur.t - prev.t <= DOUBLE_CLICK_MS &&
    cur.t >= prev.t &&
    Math.hypot(cur.x - prev.x, cur.y - prev.y) < DOUBLE_CLICK_PX
  );
}

/**
 * Another player's unit or building this player may order (Allies panel:
 * shared control; When a player is eliminated or leaves: shared by everyone).
 * Set by the game shell; nothing is shared until it is.
 */
let sharedWith: (t: SelInfo, player: number) => boolean = () => false;

export function setSharedControl(f: (t: SelInfo, player: number) => boolean): void {
  sharedWith = f;
}

/** Can be ordered by the player: own units and buildings, and those shared with them (nodes never are). */
export function isOwn(t: SelInfo, player: number): boolean {
  if (t.kind === 'node') return false;
  return t.owner === player || sharedWith(t, player);
}

/**
 * The thing under a screen point: the nearest to the camera among those whose
 * padded box holds the point, except that a unit wins over a building, so a
 * worker standing behind the Big House can still be clicked (Jade's patch
 * notes 1).
 */
export function pickAt<T extends SelInfo>(items: readonly ScreenItem<T>[], p: Pt, pad = HIT_PAD_PX): ScreenItem<T> | null {
  let best: ScreenItem<T> | null = null;
  let unit: ScreenItem<T> | null = null;
  for (const s of items) {
    if (!pointInRect(p, padRect(s.rect, pad))) continue;
    if (!best || s.depth < best.depth) best = s;
    if (s.item.kind === 'unit' && (!unit || s.depth < unit.depth)) unit = s;
  }
  return best && best.item.kind === 'building' && unit ? unit : best;
}

/** Everything any part of whose padded box is inside the drag box. */
export function inBox<T extends SelInfo>(items: readonly ScreenItem<T>[], box: Rect, pad = HIT_PAD_PX): ScreenItem<T>[] {
  return items.filter((s) => rectsIntersect(padRect(s.rect, pad), box));
}

/**
 * What a drag box picks up: own units if there are any (so a box round troops
 * beside the Big House takes the troops), else own buildings, leaving out a
 * wall line's pieces and the lights unless they are all the box holds; else
 * the single thing nearest to where the drag started (inspect only). Units
 * and buildings join in one selection with Shift (patch notes 1).
 */
export function priorityFilter<T extends SelInfo>(items: readonly ScreenItem<T>[], player: number, dragStart: Pt): T[] {
  const units = items.filter((s) => isOwn(s.item, player) && s.item.kind === 'unit');
  if (units.length > 0) return units.map((s) => s.item);
  const buildings = items.filter((s) => isOwn(s.item, player) && s.item.kind === 'building');
  if (buildings.length > 0) {
    const main = buildings.filter((s) => !lineStructure(s.item));
    return (main.length > 0 ? main : buildings).map((s) => s.item);
  }
  let best: ScreenItem<T> | null = null;
  let bestD = Infinity;
  for (const s of items) {
    const d = Math.hypot(s.x - dragStart.x, s.y - dragStart.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best ? [best.item] : [];
}

/**
 * "All of this type in the game view": own units (or own buildings) of the
 * clicked thing's type; for a resource node, the nodes of its type; for
 * anything else not owned, just that thing (it can only be inspected).
 */
export function sameTypeInView<T extends SelInfo>(inView: readonly ScreenItem<T>[], clicked: T, player: number): T[] {
  let out: T[];
  if (isOwn(clicked, player)) {
    out = inView
      .map((s) => s.item)
      .filter((t) => isOwn(t, player) && t.kind === clicked.kind && t.typeKey === clicked.typeKey);
  } else if (clicked.kind === 'node') {
    out = inView.map((s) => s.item).filter((t) => t.kind === 'node' && t.typeKey === clicked.typeKey);
  } else {
    return [clicked];
  }
  if (!out.some((t) => t.key === clicked.key)) out.unshift(clicked);
  return out;
}

/** Whether a thing may join an existing selection: own things with own things, nodes with nodes. */
export function compatible(current: readonly SelInfo[], t: SelInfo, player: number): boolean {
  if (current.length === 0) return true;
  if (isOwn(t, player)) return current.every((c) => isOwn(c, player));
  if (t.kind === 'node') return current.every((c) => c.kind === 'node');
  return false;
}

function union<T extends SelInfo>(a: readonly T[], b: readonly T[]): T[] {
  const keys = new Set(a.map((t) => t.key));
  return [...a, ...b.filter((t) => !keys.has(t.key))];
}

export interface ClickMods {
  shift: boolean;
  /** Ctrl, or Cmd on a Mac. */
  ctrl: boolean;
  /** The second click of a double click (acts like Ctrl). */
  double: boolean;
}

/**
 * The new selection after a left click on a thing.
 * - plain: that thing only
 * - Shift: toggle it (if it cannot join the selection, select it alone)
 * - Ctrl/Cmd or double click: all of its type in the game view
 * - Ctrl/Cmd + Shift: add that whole type, or remove it if the clicked thing was already selected
 */
export function applyClick<T extends SelInfo>(
  current: readonly T[],
  clicked: T,
  mods: ClickMods,
  inView: readonly ScreenItem<T>[],
  player: number,
): T[] {
  const typeWide = mods.ctrl || mods.double;
  const fits = compatible(current, clicked, player);
  if (typeWide) {
    const group = sameTypeInView(inView, clicked, player);
    if (!mods.shift || !fits) return group;
    if (current.some((t) => t.key === clicked.key)) {
      const drop = new Set(group.map((t) => t.key));
      return current.filter((t) => !drop.has(t.key));
    }
    return union(current, group);
  }
  if (mods.shift && fits) {
    return current.some((t) => t.key === clicked.key)
      ? current.filter((t) => t.key !== clicked.key)
      : [...current, clicked];
  }
  return [clicked];
}

/**
 * The new selection after a drag box. An empty box keeps the selection.
 * Shift adds; a box result that cannot join the selection (a thing to inspect
 * while own units are selected) leaves a Shift selection as it was.
 */
export function applyBox<T extends SelInfo>(current: readonly T[], picked: readonly T[], shift: boolean, player: number): T[] {
  if (picked.length === 0) return [...current];
  if (!shift) return [...picked];
  if (!compatible(current, picked[0]!, player)) return [...current];
  return union(current, picked);
}
