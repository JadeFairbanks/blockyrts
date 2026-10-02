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
}

/** Not state: fields per world (one world per game), per player and class. */
const cache = new WeakMap<World, Map<number, Field>>();

function moverOf(cls: MobClass): Mover {
  return cls === MobClass.Climber ? CLIMBER_PLAN : MOB_PLAN;
}

/** Whether a building is something mobs come for, rather than a barrier on the way (walls, gates, towers) or a light. */
export function isGoal(kind: number): boolean {
  const s = buildingSpec(kind);
  return !s.defence && !s.light && !s.site;
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

function windowOf(state: SimState, player: number): { x0: number; z0: number; w: number; h: number } | null {
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
  if (!m) {
    m = new Map();
    cache.set(state.world, m);
  }
  const win = windowOf(state, player);
  if (!win) return null;
  const sig = signature(state, win);
  const key = player * 4 + cls;
  const old = m.get(key);
  if (old && old.sig.length === sig.length && old.sig.every((v, k) => v === sig[k])) return old;
  const f = build(state, player, cls, win, sig);
  m.set(key, f);
  return f;
}

function build(state: SimState, player: number, cls: MobClass, win: { x0: number; z0: number; w: number; h: number }, sig: number[]): Field {
  const { x0, z0, w, h } = win;
  const n = w * h;
  const cost = new Int32Array(n).fill(UNREACHED);
  const pen = new Int32Array(n);
  const goal = new Uint8Array(n);
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
  const heap = new Heap();
  for (let k = 0; k < n; k++) {
    if (!goal[k]) continue;
    cost[k] = 0;
    heap.push(0, k);
  }
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
  return { x0, z0, w, h, cost, pen, goal, cls, sig };
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
  if (best === UNREACHED) return null;
  const half = (TILE_COLUMNS * WU_PER_COLUMN) >> 1;
  return [bx * TILE_COLUMNS * WU_PER_COLUMN + half, bz * TILE_COLUMNS * WU_PER_COLUMN + half];
}
