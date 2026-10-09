// How night mobs find the town (Monsters and terrain: a coarse navigation
// map with a cost per kind of monster, flow fields per target and kind, and
// the break cost against walking round). One field per player and kind of
// mover covers the town and 86 m round it: every coarse tile's cost to
// reach one of the player's buildings, walking round what can be walked
// round and paying a break cost to go through walls and buildings in the
// way. Walkers pay for the time it takes to chew through; climbers for the
// time to climb; breakers barely mind walls, and alone may smash natural
// terrain, which counts three times as hard (the x3 rule). The field is a
// pure cache: it is rebuilt from the state whenever the land or the
// buildings in its window change, so loading a save gives the same paths.

import { buildingSpec } from '../buildings/data.ts';
import { levelSpec } from '../buildings/data.ts';
import { solidRect } from '../buildings/store.ts';
import { floorDiv, WU_PER_COLUMN } from '../fixed.ts';
import { CLIMBER_PLAN, MOB_PLAN, type Mover } from '../nav/grid.ts';
import { DIRS, Heap, TILE_COLUMNS } from '../nav/path.ts';
import type { SimState } from '../state.ts';
import { chunkKey } from '../world/chunk.ts';
import type { World } from '../world/world.ts';

/** The kinds of mover a field is made for. Flyers need none. */
export const MobClass = { Walker: 0, Climber: 1, Breaker: 2 } as const;
export type MobClass = (typeof MobClass)[keyof typeof MobClass];

/** Tiles of slack round the town (86 m), where spawns at the 50 m stand-off land. */
const PAD_TILES = 48;
/** The largest field, tiles a side. */
const MAX_TILES = 320;
export const UNREACHED = 0x3fffffff;
/** Natural terrain a breaker would smash, in field cost: a 2 m soil trench (400) x3 (the x3 rule), in walking cost (s). */
const TERRAIN_BREAK = 400 * 3 * 4;

export interface Field {
  x0: number;
  z0: number;
  w: number;
  h: number;
  cost: Int32Array;
  /** Break costs of the walls and buildings in each tile (0 for goal tiles). */
  pen: Int32Array;
  goal: Uint8Array;
  cls: MobClass;
  /** What it was built from: the window and the walk-map versions of its chunks. */
  sig: number[];
  /**
   * Not state: nextStep's answer per tile, filled as asked (0 not yet, -1
   * none, else the neighbour's index + 1). It reads only the field and the
   * walk map inside its window, and any change to that walk map makes a new
   * field, so an answer once found holds for the field's life.
   */
  next?: Int32Array | undefined;
}

/** Not state: fields per world (one world per game), per player and class. */
const cache = new WeakMap<World, Map<number, Field>>();
/**
 * Not state: when each field was last checked against the town, as the
 * walk-map epoch and the building store's revision then. While neither has
 * moved, its window and signature cannot have either, so the check is
 * skipped: every monster asks every step, and the answer is the same field.
 */
const checked = new WeakMap<World, Map<number, readonly [number, number, Field]>>();

function moverOf(cls: MobClass): Mover {
  return cls === MobClass.Climber ? CLIMBER_PLAN : MOB_PLAN;
}

/** Whether a building is something mobs come for, rather than a barrier on the way (walls, gates, towers) or a light. */
export function isGoal(kind: number): boolean {
  const s = buildingSpec(kind);
  return !s.defence && !s.light;
}

/**
 * The field cost of going through a building's tile for a kind of mover:
 * walkers the seconds it takes them to break it (about 2.5 a second in
 * walking cost, 12 per point of health); climbers the seconds to climb it;
 * breakers a little, as walls are what they want.
 */
export function breakCost(kind: number, cls: MobClass): number {
  const s = buildingSpec(kind);
  const hp = levelSpec(kind, 1).health;
  if (cls === MobClass.Climber) return s.heightCm * 2;
  if (cls === MobClass.Breaker) return 200;
  return hp * 12;
}

/** The tiles a player's field covers: the town and PAD_TILES round it, at most MAX_TILES a side; null with no building to come for. */
export function fieldWindow(state: SimState, player: number): { x0: number; z0: number; w: number; h: number } | null {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const b of state.buildings.list) {
    if (b.owner !== player || !isGoal(b.kind)) continue;
    const [sx0, sz0, sx1, sz1] = solidRect(b);
    x0 = Math.min(x0, floorDiv(sx0, TILE_COLUMNS));
    z0 = Math.min(z0, floorDiv(sz0, TILE_COLUMNS));
    x1 = Math.max(x1, floorDiv(sx1, TILE_COLUMNS));
    z1 = Math.max(z1, floorDiv(sz1, TILE_COLUMNS));
  }
  if (x0 === Infinity) return null;
  // A sprawling town gets a field round its middle at most MAX_TILES across.
  const w = Math.min(MAX_TILES, x1 - x0 + 1 + 2 * PAD_TILES);
  const h = Math.min(MAX_TILES, z1 - z0 + 1 + 2 * PAD_TILES);
  const cx = (x0 + x1) >> 1;
  const cz = (z0 + z1) >> 1;
  return { x0: cx - (w >> 1), z0: cz - (h >> 1), w, h };
}

function signature(state: SimState, win: { x0: number; z0: number; w: number; h: number }): number[] {
  const sig = [win.x0, win.z0, win.w, win.h];
  const c0x = floorDiv(win.x0, 16);
  const c0z = floorDiv(win.z0, 16);
  const c1x = floorDiv(win.x0 + win.w - 1, 16);
  const c1z = floorDiv(win.z0 + win.h - 1, 16);
  for (let cz = c0z - 1; cz <= c1z + 1; cz++) for (let cx = c0x - 1; cx <= c1x + 1; cx++) sig.push(state.world.navVersion(chunkKey(cx, cz)));
  return sig;
}

/** The field for a player's buildings and a kind of mover, or null when the player has no building to come for. */
export function fieldFor(state: SimState, player: number, cls: MobClass): Field | null {
  let m = cache.get(state.world);
  let seen = checked.get(state.world);
  if (!m || !seen) {
    m = new Map();
    seen = new Map();
    cache.set(state.world, m);
    checked.set(state.world, seen);
  }
  const key = player * 4 + cls;
  const epoch = state.world.navEpoch;
  const rev = state.buildings.rev;
  const last = seen.get(key);
  if (last && last[0] === epoch && last[1] === rev) return last[2];
  const win = fieldWindow(state, player);
  if (!win) {
    seen.delete(key);
    return null;
  }
  const sig = signature(state, win);
  const old = m.get(key);
  let f: Field;
  if (old && old.sig.length === sig.length && old.sig.every((v, k) => v === sig[k])) f = old;
  else if (old && old.sig.length === sig.length && repair(state, player, old, sig)) f = old;
  else {
    f = build(state, player, cls, win, sig);
    m.set(key, f);
  }
  seen.set(key, [epoch, rev, f]);
  return f;
}

/** The goal tiles and the break costs of the walls and buildings in a window. */
function marks(state: SimState, player: number, cls: MobClass, win: { x0: number; z0: number; w: number; h: number }): { pen: Int32Array; goal: Uint8Array } {
  const { x0, z0, w, h } = win;
  const pen = new Int32Array(w * h);
  const goal = new Uint8Array(w * h);
  const inWin = (tx: number, tz: number): boolean => tx >= x0 && tz >= z0 && tx < x0 + w && tz < z0 + h;
  for (const b of state.buildings.list) {
    const [sx0, sz0, sx1, sz1] = solidRect(b);
    const isG = b.owner === player && isGoal(b.kind);
    const p = breakCost(b.kind, cls);
    for (let tz = floorDiv(sz0, TILE_COLUMNS); tz <= floorDiv(sz1, TILE_COLUMNS); tz++) {
      for (let tx = floorDiv(sx0, TILE_COLUMNS); tx <= floorDiv(sx1, TILE_COLUMNS); tx++) {
        if (!inWin(tx, tz)) continue;
        const k = (tz - z0) * w + (tx - x0);
        if (isG) goal[k] = 1;
        else if (p > pen[k]!) pen[k] = p;
      }
    }
  }
  return { pen, goal };
}

function build(state: SimState, player: number, cls: MobClass, win: { x0: number; z0: number; w: number; h: number }, sig: number[]): Field {
  const { x0, z0, w, h } = win;
  const n = w * h;
  const cost = new Int32Array(n).fill(UNREACHED);
  const { pen, goal } = marks(state, player, cls, win);
  const heap = new Heap();
  for (let k = 0; k < n; k++) {
    if (!goal[k]) continue;
    cost[k] = 0;
    heap.push(0, k);
  }
  const f: Field = { x0, z0, w, h, cost, pen, goal, cls, sig };
  flood(state, f, heap);
  return f;
}


/**
 * Brings a field up to date in place after walk-map changes in its window,
 * with the same window, goals and break costs; false when those differ (a
 * full build is then needed). The field holds each tile's cheapest cost to
 * the town, which is one answer however it is found, so the result is the
 * same as a full build's. A changed column alters the crossings of the tiles
 * it lies in or borders (a chunk changed as a whole, those of its tiles and
 * the ring round them); every way through an altered crossing then reaches
 * the town from one of those tiles or a neighbour of one, so it costs at
 * least the cheapest such tile's old cost T. A tile already cheaper than T
 * kept its old way, which is untouched and still the cheapest; only the
 * tiles at T or more are worked out again, from those below it. Flowing
 * water and smashed ground (the breakers) change the walk map near the town
 * nearly every step of a siege, and a full build of every field each step
 * was the late-night lag (Patch 5 BG-2).
 */
function repair(state: SimState, player: number, f: Field, sig: number[]): boolean {
  const { x0, z0, w, h } = f;
  if (sig[0] !== x0 || sig[1] !== z0 || sig[2] !== w || sig[3] !== h) return false;
  const { pen, goal } = marks(state, player, f.cls, f);
  for (let k = 0; k < w * h; k++) if (pen[k] !== f.pen[k] || goal[k] !== f.goal[k]) return false;
  // The signature's chunk versions, row by row over the window's chunks and one more round them.
  const c0x = floorDiv(x0, 16) - 1;
  const c0z = floorDiv(z0, 16) - 1;
  const cw = floorDiv(x0 + w - 1, 16) + 1 - c0x + 1;
  const cost = f.cost;
  let t = UNREACHED;
  let near = false;
  // The tiles whose crossings changed, and their neighbours: one tile round them.
  const reach = (ax: number, az: number, bx: number, bz: number): void => {
    for (let tz = Math.max(z0, az - 1); tz <= Math.min(z0 + h - 1, bz + 1); tz++) {
      for (let tx = Math.max(x0, ax - 1); tx <= Math.min(x0 + w - 1, bx + 1); tx++) {
        near = true;
        t = Math.min(t, cost[(tz - z0) * w + (tx - x0)]!);
      }
    }
  };
  for (let k = 4; k < sig.length; k++) {
    if (sig[k] === f.sig[k]) continue;
    const cx = c0x + ((k - 4) % cw);
    const cz = c0z + floorDiv(k - 4, cw);
    const cols = state.world.navChangesSince(chunkKey(cx, cz), f.sig[k]!);
    if (cols === null) {
      reach(cx * 16 - 1, cz * 16 - 1, cx * 16 + 16, cz * 16 + 16);
      continue;
    }
    for (let q = 0; q < cols.length; q += 2) reach(floorDiv(cols[q]! - 1, TILE_COLUMNS), floorDiv(cols[q + 1]! - 1, TILE_COLUMNS), floorDiv(cols[q]! + 1, TILE_COLUMNS), floorDiv(cols[q + 1]! + 1, TILE_COLUMNS));
  }
  if (t === 0) return false;
  f.sig = sig;
  f.next = undefined;
  // Changes only in the ring of chunks round the window, out of reach of its tiles: every cost stands.
  if (!near) return true;
  for (let k = 0; k < w * h; k++) if (cost[k]! >= t) cost[k] = UNREACHED;
  // Start again from every settled tile beside one to work out.
  const heap = new Heap();
  for (let k = 0; k < w * h; k++) {
    if (cost[k] === UNREACHED) continue;
    const tx = k % w;
    const tz = floorDiv(k, w);
    for (let d = 0; d < 8; d++) {
      const nx = tx + DIRS[d]![0];
      const nz = tz + DIRS[d]![1];
      if (nx < 0 || nz < 0 || nx >= w || nz >= h || cost[nz * w + nx] !== UNREACHED) continue;
      heap.push(cost[k]!, k);
      break;
    }
  }
  flood(state, f, heap);
  return true;
}

/** Dijkstra out from the tiles in the heap: each tile's cheapest cost to reach a goal, walking round or breaking through. */
function flood(state: SimState, f: Field, heap: Heap): void {
  const { x0, z0, w, h, cost, pen, goal, cls } = f;
  const inWin = (tx: number, tz: number): boolean => tx >= x0 && tz >= z0 && tx < x0 + w && tz < z0 + h;
  const mover = moverOf(cls);
  const paths = state.paths;
  while (heap.size > 0) {
    const cur = heap.pop();
    const c = cost[cur]!;
    const tx = (cur % w) + x0;
    const tz = floorDiv(cur, w) + z0;
    for (let d = 0; d < 8; d++) {
      const nx = tx + DIRS[d]![0];
      const nz = tz + DIRS[d]![1];
      if (!inWin(nx, nz)) continue;
      const k = (nz - z0) * w + (nx - x0);
      // The step from the neighbour into this tile.
      let step = paths.edgeCost(nx, nz, backDir(d), mover);
      if (step === 0) {
        if (cls !== MobClass.Breaker) continue;
        step = TERRAIN_BREAK;
      }
      const nc = c + step + (goal[cur] ? 0 : pen[cur]!);
      if (nc >= cost[k]!) continue;
      cost[k] = nc;
      heap.push(nc, k);
    }
  }
}

/** The opposite of a DIRS index. */
function backDir(d: number): number {
  return [1, 0, 3, 2, 7, 6, 5, 4][d]!;
}

/** A tile's cost in a field, or UNREACHED outside it. */
export function costAt(f: Field, tx: number, tz: number): number {
  if (tx < f.x0 || tz < f.z0 || tx >= f.x0 + f.w || tz >= f.z0 + f.h) return UNREACHED;
  return f.cost[(tz - f.z0) * f.w + (tx - f.x0)]!;
}

/**
 * The next tile down the field from a tile: the neighbour that is cheapest
 * to step to and go on from, as the tile's middle in wu; null when the tile
 * is outside the field or it is a goal tile.
 */
export function nextStep(state: SimState, f: Field, tx: number, tz: number): [number, number] | null {
  const here = costAt(f, tx, tz);
  if (here === UNREACHED || here === 0) return null;
  const memo = (f.next ??= new Int32Array(f.w * f.h));
  const at = (tz - f.z0) * f.w + (tx - f.x0);
  if (memo[at] === 0) memo[at] = bestNext(state, f, tx, tz);
  const k = memo[at]!;
  if (k < 0) return null;
  const half = (TILE_COLUMNS * WU_PER_COLUMN) >> 1;
  const bx = ((k - 1) % f.w) + f.x0;
  const bz = floorDiv(k - 1, f.w) + f.z0;
  return [bx * TILE_COLUMNS * WU_PER_COLUMN + half, bz * TILE_COLUMNS * WU_PER_COLUMN + half];
}

/** The cheapest neighbour to step to and go on from, as its index in the field + 1, or -1. */
function bestNext(state: SimState, f: Field, tx: number, tz: number): number {
  const mover = moverOf(f.cls);
  let best = UNREACHED;
  let bx = 0;
  let bz = 0;
  for (let d = 0; d < 8; d++) {
    const nx = tx + DIRS[d]![0];
    const nz = tz + DIRS[d]![1];
    const c = costAt(f, nx, nz);
    if (c === UNREACHED) continue;
    let step = state.paths.edgeCost(tx, tz, d, mover);
    if (step === 0) {
      if (f.cls !== MobClass.Breaker) continue;
      step = TERRAIN_BREAK;
    }
    const k = (nz - f.z0) * f.w + (nx - f.x0);
    const total = c + step + (f.goal[k] ? 0 : f.pen[k]!);
    if (total < best) {
      best = total;
      bx = nx;
      bz = nz;
    }
  }
  if (best === UNREACHED) return -1;
  return (bz - f.z0) * f.w + (bx - f.x0) + 1;
}
