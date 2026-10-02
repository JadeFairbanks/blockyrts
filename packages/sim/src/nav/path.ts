// Pathfinding (technical decision 6): A* on the 1.8 m coarse tiles to find a
// corridor, then A* on the 45 cm columns inside it, with the doc's step,
// clamber and drop rules; a flow field over the coarse tiles for groups of 8
// or more; and straightening over plain ground so units walk in straight
// lines rather than along the grid. Integer costs, binary heaps with fixed
// tie-breaking and bounded searches keep every machine on the same path.

import { floorDiv } from '../fixed.ts';
import { chunkKey, CHUNK_SHIFT } from '../world/chunk.ts';
import { PERSON, type Mover, type NavGrid } from './grid.ts';

/** Coarse tiles are 4 x 4 columns (1.8 m), 16 x 16 per chunk. */
export const TILE_COLUMNS = 4;
const TILE_SHIFT = 2;
const TILES_PER_CHUNK = 16;

/**
 * What a path is looking for: a column whose Chebyshev distance to the
 * rectangle [x0, x1] x [z0, z1] (inclusive, columns) is between min and max.
 * A point is a 1 x 1 rectangle with min = max = 0; standing next to a
 * building is its solid rectangle with min 1.
 */
export interface Goal {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  min: number;
  max: number;
}

export function pointGoal(x: number, z: number): Goal {
  return { x0: x, z0: z, x1: x, z1: z, min: 0, max: 0 };
}

/** Chebyshev distance from a column to a goal's rectangle. */
export function rectDistance(g: Goal, x: number, z: number): number {
  const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0;
  const dz = z < g.z0 ? g.z0 - z : z > g.z1 ? z - g.z1 : 0;
  return Math.max(dx, dz);
}

export function atGoal(g: Goal, x: number, z: number): boolean {
  const d = rectDistance(g, x, z);
  return d >= g.min && d <= g.max;
}

/** An admissible estimate of the cost to reach the goal (octile distance at the cheapest step costs). */
function heuristic(g: Goal, x: number, z: number): number {
  let dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0;
  let dz = z < g.z0 ? g.z0 - z : z > g.z1 ? z - g.z1 : 0;
  dx = Math.max(0, dx - g.max);
  dz = Math.max(0, dz - g.max);
  return dx > dz ? 10 * dx + 4 * dz : 10 * dz + 4 * dx;
}

export interface PathResult {
  /** Waypoints after the start, as global columns: x0, z0, x1, z1, ... */
  points: number[];
  /** False when the goal could not be reached; the path then ends at the nearest place found. */
  reached: boolean;
}

export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The opposite of each direction in DIRS. */
const BACK = [1, 0, 3, 2, 7, 6, 5, 4] as const;

function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** A binary min-heap of (key, value) with ties broken by insertion order, so pops are the same everywhere. */
export class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  private seq: number[] = [];
  private n = 0;
  private counter = 0;

  get size(): number {
    return this.n;
  }

  clear(): void {
    this.n = 0;
    this.counter = 0;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a]!;
    const kb = this.keys[b]!;
    return ka < kb || (ka === kb && this.seq[a]! < this.seq[b]!);
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a]!;
    const v = this.vals[a]!;
    const s = this.seq[a]!;
    this.keys[a] = this.keys[b]!;
    this.vals[a] = this.vals[b]!;
    this.seq[a] = this.seq[b]!;
    this.keys[b] = k;
    this.vals[b] = v;
    this.seq[b] = s;
  }

  push(key: number, val: number): void {
    let i = this.n++;
    this.keys[i] = key;
    this.vals[i] = val;
    this.seq[i] = this.counter++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.vals[0]!;
    this.n--;
    if (this.n > 0) {
      this.keys[0] = this.keys[this.n]!;
      this.vals[0] = this.vals[this.n]!;
      this.seq[0] = this.seq[this.n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.n && this.less(l, m)) m = l;
        if (r < this.n && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

interface Window {
  x0: number;
  z0: number;
  w: number;
  h: number;
}

/** Edge costs between coarse tiles, cached per chunk with the walk-map versions it was built from. */
interface CoarseChunk {
  versions: number[];
  /** Per tile, 8 costs in DIRS order; 0 = no way through. */
  edges: Uint16Array;
}

/** Search limits (s): enough for a long walk round a barrier, small enough for the step budget. */
export const FINE_BUDGET_SHORT = 6000;
export const FINE_BUDGET_LONG = 20000;
export const COARSE_BUDGET = 6000;
const SHORT_COLUMNS = 48;

export class Pathfinder {
  private g = new Int32Array(0);
  private from = new Uint8Array(0);
  private state = new Uint8Array(0);
  private mask = new Uint8Array(0);
  private readonly touched: number[] = [];
  private readonly heap = new Heap();
  /** Coarse edge caches, one per mover id. */
  private readonly coarse = new Map<number, Map<number, CoarseChunk>>();
  /** Searches run since the counter was last reset (the step budget). */
  searches = 0;

  constructor(readonly grid: NavGrid) {}

  private ensure(n: number): void {
    if (this.g.length >= n) return;
    this.g = new Int32Array(n);
    this.from = new Uint8Array(n);
    this.state = new Uint8Array(n);
  }

  private reset(): void {
    for (const i of this.touched) this.state[i] = 0;
    this.touched.length = 0;
    this.heap.clear();
  }

  /**
   * A* on columns inside a window (and inside the tile mask, if given).
   * Returns the raw column path from start to the goal, or to the explored
   * column nearest the goal when it cannot be reached within the budget.
   */
  private fine(m: Mover, sx: number, sz: number, goal: Goal, win: Window, budget: number, tileMask: { x0: number; z0: number; w: number; bits: Uint8Array } | null): { cols: number[]; reached: boolean } {
    const W = win.w;
    const H = win.h;
    this.ensure(W * H);
    this.reset();
    const grid = this.grid;
    const idx = (x: number, z: number): number => (z - win.z0) * W + (x - win.x0);
    const inMask = (x: number, z: number): boolean => {
      if (!tileMask) return true;
      const tx = (x >> TILE_SHIFT) - tileMask.x0;
      const tz = (z >> TILE_SHIFT) - tileMask.z0;
      if (tx < 0 || tz < 0 || tx >= tileMask.w) return false;
      const k = tz * tileMask.w + tx;
      return k < tileMask.bits.length && tileMask.bits[k] === 1;
    };
    const s = idx(sx, sz);
    this.g[s] = 0;
    this.state[s] = 1;
    this.touched.push(s);
    this.heap.push(heuristic(goal, sx, sz), s);
    let best = s;
    let bestH = heuristic(goal, sx, sz);
    let found = -1;
    let expanded = 0;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      const cx = (cur % W) + win.x0;
      const cz = floorDiv(cur, W) + win.z0;
      if (atGoal(goal, cx, cz)) {
        found = cur;
        break;
      }
      if (++expanded > budget) break;
      const gc = this.g[cur]!;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d]![0];
        const nz = cz + DIRS[d]![1];
        if (nx < win.x0 || nz < win.z0 || nx >= win.x0 + W || nz >= win.z0 + H) continue;
        const ni = idx(nx, nz);
        if (this.state[ni] === 2) continue;
        if (!inMask(nx, nz)) continue;
        const c = grid.stepCost(cx, cz, nx, nz, m);
        if (c < 0) continue;
        const ng = gc + c;
        if (this.state[ni] === 1 && ng >= this.g[ni]!) continue;
        if (this.state[ni] === 0) this.touched.push(ni);
        this.state[ni] = 1;
        this.g[ni] = ng;
        this.from[ni] = d;
        const h = heuristic(goal, nx, nz);
        if (h < bestH) {
          bestH = h;
          best = ni;
        }
        this.heap.push(ng + h, ni);
      }
    }
    const end = found >= 0 ? found : best;
    const cols: number[] = [];
    let at = end;
    while (at !== s) {
      const x = (at % W) + win.x0;
      const z = floorDiv(at, W) + win.z0;
      cols.push(z, x);
      const d = DIRS[this.from[at]!]!;
      at = idx(x - d[0], z - d[1]);
    }
    cols.reverse();
    return { cols, reached: found >= 0 };
  }

  // ----- coarse tiles -----

  private coarseChunk(cx: number, cz: number, m: Mover): CoarseChunk {
    const key = chunkKey(cx, cz);
    let cache = this.coarse.get(m.id);
    if (!cache) {
      cache = new Map();
      this.coarse.set(m.id, cache);
    }
    const w = this.grid.world;
    const versions: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) versions.push(w.navVersion(chunkKey(cx + dx, cz + dz)));
    const c = cache.get(key);
    if (c && c.versions.every((v, i) => v === versions[i])) return c;
    const edges = new Uint16Array(TILES_PER_CHUNK * TILES_PER_CHUNK * 8);
    for (let t = 0; t < TILES_PER_CHUNK * TILES_PER_CHUNK; t++) {
      const tx = (cx << 4) + (t & 15);
      const tz = (cz << 4) + (t >> 4);
      for (let d = 0; d < 8; d++) edges[t * 8 + d] = this.tileEdge(tx, tz, d, m);
    }
    const out = { versions, edges };
    cache.set(key, out);
    if (cache.size > 2048) cache.delete(cache.keys().next().value!);
    return out;
  }

  /** The cheapest crossing from tile (tx, tz) to its neighbour in direction d, x4, or 0 if there is none. */
  private tileEdge(tx: number, tz: number, d: number, m: Mover): number {
    const [dx, dz] = DIRS[d]!;
    const grid = this.grid;
    let best = -1;
    const bx = tx << TILE_SHIFT;
    const bz = tz << TILE_SHIFT;
    if (dx !== 0 && dz !== 0) {
      const ax = dx > 0 ? bx + 3 : bx;
      const az = dz > 0 ? bz + 3 : bz;
      const c = grid.stepCost(ax, az, ax + dx, az + dz, m);
      return c < 0 ? 0 : c * 4;
    }
    for (let k = 0; k < TILE_COLUMNS; k++) {
      let ax: number;
      let az: number;
      if (dx !== 0) {
        ax = dx > 0 ? bx + 3 : bx;
        az = bz + k;
      } else {
        ax = bx + k;
        az = dz > 0 ? bz + 3 : bz;
      }
      const c = grid.stepCost(ax, az, ax + dx, az + dz, m);
      if (c >= 0 && (best < 0 || c < best)) best = c;
    }
    return best < 0 ? 0 : best * 4;
  }

  /** The cost of going from tile (tx, tz) in direction d (0 = none), for a mover (the players' units by default). */
  edgeCost(tx: number, tz: number, d: number, m: Mover = PERSON): number {
    const cx = tx >> 4;
    const cz = tz >> 4;
    const c = this.coarseChunk(cx, cz, m);
    return c.edges[((tz - (cz << 4)) * 16 + (tx - (cx << 4))) * 8 + d]!;
  }

  /** A* over coarse tiles from the start tile towards the goal's tiles. Returns the tiles on the way, start first. */
  private coarsePath(m: Mover, sx: number, sz: number, goal: Goal, budget: number): { tiles: number[]; reached: boolean } {
    const tg: Goal = {
      x0: (goal.x0 - goal.max) >> TILE_SHIFT,
      z0: (goal.z0 - goal.max) >> TILE_SHIFT,
      x1: (goal.x1 + goal.max) >> TILE_SHIFT,
      z1: (goal.z1 + goal.max) >> TILE_SHIFT,
      min: 0,
      max: 0,
    };
    const stx = sx >> TILE_SHIFT;
    const stz = sz >> TILE_SHIFT;
    // A window of tiles round the start and the goal, 64 tiles (115 m) of slack each way.
    const pad = 64;
    const win: Window = {
      x0: Math.min(stx, tg.x0) - pad,
      z0: Math.min(stz, tg.z0) - pad,
      w: Math.max(stx, tg.x1) - Math.min(stx, tg.x0) + 1 + 2 * pad,
      h: Math.max(stz, tg.z1) - Math.min(stz, tg.z0) + 1 + 2 * pad,
    };
    const W = win.w;
    this.ensure(W * win.h);
    this.reset();
    const idx = (x: number, z: number): number => (z - win.z0) * W + (x - win.x0);
    const hc = (x: number, z: number): number => heuristic(tg, x, z) * 4;
    const s = idx(stx, stz);
    this.g[s] = 0;
    this.state[s] = 1;
    this.touched.push(s);
    this.heap.push(hc(stx, stz), s);
    let best = s;
    let bestH = hc(stx, stz);
    let found = -1;
    let expanded = 0;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      const cx = (cur % W) + win.x0;
      const cz = floorDiv(cur, W) + win.z0;
      if (atGoal(tg, cx, cz)) {
        found = cur;
        break;
      }
      if (++expanded > budget) break;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d]![0];
        const nz = cz + DIRS[d]![1];
        if (nx < win.x0 || nz < win.z0 || nx >= win.x0 + W || nz >= win.z0 + win.h) continue;
        const ni = idx(nx, nz);
        if (this.state[ni] === 2) continue;
        const c = this.edgeCost(cx, cz, d, m);
        if (c === 0) continue;
        const ng = this.g[cur]! + c;
        if (this.state[ni] === 1 && ng >= this.g[ni]!) continue;
        if (this.state[ni] === 0) this.touched.push(ni);
        this.state[ni] = 1;
        this.g[ni] = ng;
        this.from[ni] = d;
        const h = hc(nx, nz);
        if (h < bestH) {
          bestH = h;
          best = ni;
        }
        this.heap.push(ng + h, ni);
      }
    }
    const end = found >= 0 ? found : best;
    const tiles: number[] = [];
    let at = end;
    for (;;) {
      const x = (at % W) + win.x0;
      const z = floorDiv(at, W) + win.z0;
      tiles.push(z, x);
      if (at === s) break;
      const d = DIRS[this.from[at]!]!;
      at = idx(x - d[0], z - d[1]);
    }
    tiles.reverse();
    return { tiles, reached: found >= 0 };
  }

  /** A mask of the given tiles, each grown by one tile, for the fine search. */
  private corridor(tiles: readonly number[]): { mask: { x0: number; z0: number; w: number; bits: Uint8Array }; win: Window } {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < tiles.length; i += 2) {
      x0 = Math.min(x0, tiles[i]!);
      x1 = Math.max(x1, tiles[i]!);
      z0 = Math.min(z0, tiles[i + 1]!);
      z1 = Math.max(z1, tiles[i + 1]!);
    }
    x0 -= 1;
    z0 -= 1;
    x1 += 1;
    z1 += 1;
    const w = x1 - x0 + 1;
    const h = z1 - z0 + 1;
    if (this.mask.length < w * h) this.mask = new Uint8Array(w * h);
    const bits = this.mask.subarray(0, w * h);
    bits.fill(0);
    for (let i = 0; i < tiles.length; i += 2) {
      const tx = tiles[i]! - x0;
      const tz = tiles[i + 1]! - z0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) bits[(tz + dz) * w + tx + dx] = 1;
    }
    return { mask: { x0, z0, w, bits }, win: { x0: x0 << TILE_SHIFT, z0: z0 << TILE_SHIFT, w: w << TILE_SHIFT, h: h << TILE_SHIFT } };
  }

  /**
   * A path for a mover from column (sx, sz) to a goal. Short trips search
   * the columns directly; long ones, or short ones that fail, find a
   * corridor on the coarse tiles first.
   */
  find(m: Mover, sx: number, sz: number, goal: Goal): PathResult {
    this.searches++;
    if (atGoal(goal, sx, sz)) return { points: [], reached: true };
    const far = rectDistance(goal, sx, sz);
    if (far <= SHORT_COLUMNS) {
      const pad = 24;
      const win: Window = {
        x0: Math.min(sx, goal.x0) - pad - goal.max,
        z0: Math.min(sz, goal.z0) - pad - goal.max,
        w: 0,
        h: 0,
      };
      win.w = Math.max(sx, goal.x1) + pad + goal.max - win.x0 + 1;
      win.h = Math.max(sz, goal.z1) + pad + goal.max - win.z0 + 1;
      const r = this.fine(m, sx, sz, goal, win, FINE_BUDGET_SHORT, null);
      if (r.reached) return { points: this.straighten(m, sx, sz, r.cols), reached: true };
    }
    const cp = this.coarsePath(m, sx, sz, goal, COARSE_BUDGET);
    return this.alongTiles(m, sx, sz, goal, cp.tiles, cp.reached);
  }

  /** Fine search inside a corridor of coarse tiles; towards the corridor's end when the goal itself is out of reach. */
  private alongTiles(m: Mover, sx: number, sz: number, goal: Goal, tiles: readonly number[], reached: boolean): PathResult {
    const { mask, win } = this.corridor(tiles);
    let g = goal;
    if (!reached) {
      const n = tiles.length;
      const tx = tiles[n - 2]!;
      const tz = tiles[n - 1]!;
      g = { x0: tx << TILE_SHIFT, z0: tz << TILE_SHIFT, x1: (tx << TILE_SHIFT) + 3, z1: (tz << TILE_SHIFT) + 3, min: 0, max: 0 };
    }
    const r = this.fine(m, sx, sz, g, win, FINE_BUDGET_LONG, mask);
    return { points: this.straighten(m, sx, sz, r.cols), reached: reached && r.reached };
  }

  /**
   * A flow field over coarse tiles towards a goal, for a group of 8 or more:
   * one search shared by the whole group (technical decision 6). Covers the
   * box round the group and the goal with 32 tiles of slack.
   */
  flowField(goal: Goal, box: { x0: number; z0: number; x1: number; z1: number }): FlowField {
    this.searches++;
    const gx = (goal.x0 + goal.x1) >> (1 + TILE_SHIFT);
    const gz = (goal.z0 + goal.z1) >> (1 + TILE_SHIFT);
    const pad = 32;
    const x0 = Math.min(gx, box.x0 >> TILE_SHIFT) - pad;
    const z0 = Math.min(gz, box.z0 >> TILE_SHIFT) - pad;
    const x1 = Math.max(gx, box.x1 >> TILE_SHIFT) + pad;
    const z1 = Math.max(gz, box.z1 >> TILE_SHIFT) + pad;
    const W = x1 - x0 + 1;
    const H = z1 - z0 + 1;
    const cost = new Int32Array(W * H).fill(-1);
    const done = new Uint8Array(W * H);
    const heap = new Heap();
    const s = (gz - z0) * W + (gx - x0);
    cost[s] = 0;
    heap.push(0, s);
    let expanded = 0;
    while (heap.size > 0 && expanded < COARSE_BUDGET * 2) {
      const cur = heap.pop();
      if (done[cur] === 1) continue;
      done[cur] = 1;
      expanded++;
      const cx = (cur % W) + x0;
      const cz = floorDiv(cur, W) + z0;
      const cc = cost[cur]!;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d]![0];
        const nz = cz + DIRS[d]![1];
        if (nx < x0 || nz < z0 || nx > x1 || nz > z1) continue;
        // The way from the neighbour back to this tile: the opposite direction.
        const back = BACK[d]!;
        const c = this.edgeCost(nx, nz, back);
        if (c === 0) continue;
        const ni = (nz - z0) * W + (nx - x0);
        const nc = cc + c;
        if (cost[ni]! >= 0 && cost[ni]! <= nc) continue;
        cost[ni] = nc;
        heap.push(nc, ni);
      }
    }
    return new FlowField(this, x0, z0, W, H, cost, gx, gz);
  }

  /** A path for one member of a group: the field gives its corridor, then a fine search inside it. */
  findWithField(field: FlowField, m: Mover, sx: number, sz: number, goal: Goal): PathResult {
    this.searches++;
    if (atGoal(goal, sx, sz)) return { points: [], reached: true };
    const tiles = field.tilesFrom(sx >> TILE_SHIFT, sz >> TILE_SHIFT);
    if (!tiles) return this.find(m, sx, sz, goal);
    // The field leads to the goal's tile; the member's own goal may sit a few tiles off it.
    const gx = (goal.x0 + goal.x1) >> (1 + TILE_SHIFT);
    const gz = (goal.z0 + goal.z1) >> (1 + TILE_SHIFT);
    const extra: number[] = [];
    if (gx !== field.gx || gz !== field.gz) {
      let x = field.gx;
      let z = field.gz;
      while (x !== gx || z !== gz) {
        x += sign(gx - x);
        z += sign(gz - z);
        extra.push(x, z);
      }
    }
    const all = tiles.concat(extra);
    const r = this.alongTiles(m, sx, sz, goal, all, true);
    if (r.reached) return r;
    return this.find(m, sx, sz, goal);
  }

  /** Drops waypoints that a straight walk over plain ground can skip. Input and output are x, z pairs. */
  private straighten(m: Mover, sx: number, sz: number, cols: readonly number[]): number[] {
    const n = cols.length >> 1;
    if (n <= 1) return cols.slice();
    const out: number[] = [];
    let px = sx;
    let pz = sz;
    let i = -1;
    while (i < n - 1) {
      let j = Math.min(n - 1, i + 24);
      while (j > i + 1 && !this.plainLine(m, px, pz, cols[2 * j]!, cols[2 * j + 1]!)) j--;
      px = cols[2 * j]!;
      pz = cols[2 * j + 1]!;
      out.push(px, pz);
      i = j;
    }
    return out;
  }

  /** Whether every step on the straight line between two columns is plain ground (a supercover walk). */
  plainLine(m: Mover, ax: number, az: number, bx: number, bz: number): boolean {
    const dx = Math.abs(bx - ax);
    const dz = Math.abs(bz - az);
    const sx = bx > ax ? 1 : -1;
    const sz = bz > az ? 1 : -1;
    let x = ax;
    let z = az;
    let ix = 0;
    let iz = 0;
    while (ix < dx || iz < dz) {
      const decision = (1 + 2 * ix) * dz - (1 + 2 * iz) * dx;
      let nx = x;
      let nz = z;
      if (decision === 0) {
        nx += sx;
        nz += sz;
        ix++;
        iz++;
      } else if (decision < 0) {
        nx += sx;
        ix++;
      } else {
        nz += sz;
        iz++;
      }
      if (!this.grid.plainStep(x, z, nx, nz, m)) return false;
      x = nx;
      z = nz;
    }
    return true;
  }
}

/** Coarse tile costs to a goal; a member walks downhill on them. */
export class FlowField {
  constructor(
    private readonly pf: Pathfinder,
    readonly x0: number,
    readonly z0: number,
    readonly w: number,
    readonly h: number,
    readonly cost: Int32Array,
    readonly gx: number,
    readonly gz: number,
  ) {}

  costAt(tx: number, tz: number): number {
    const x = tx - this.x0;
    const z = tz - this.z0;
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return -1;
    return this.cost[z * this.w + x]!;
  }

  /** The tiles from (tx, tz) down the field to the goal, as x, z pairs; null if the start is outside the field. */
  tilesFrom(tx: number, tz: number): number[] | null {
    let c = this.costAt(tx, tz);
    if (c < 0) return null;
    const out: number[] = [tx, tz];
    let x = tx;
    let z = tz;
    let guard = this.w * this.h;
    while (c > 0 && guard-- > 0) {
      let bestD = -1;
      let bestC = c;
      for (let d = 0; d < 8; d++) {
        const nx = x + DIRS[d]![0];
        const nz = z + DIRS[d]![1];
        const nc = this.costAt(nx, nz);
        if (nc < 0 || nc >= bestC) continue;
        if (this.pf.edgeCost(x, z, d) === 0) continue;
        bestC = nc;
        bestD = d;
      }
      if (bestD < 0) break;
      x += DIRS[bestD]![0];
      z += DIRS[bestD]![1];
      c = bestC;
      out.push(x, z);
    }
    return out;
  }
}

/** The coarse tile of a column, as used by the walk map. */
export function tileOf(x: number): number {
  return x >> TILE_SHIFT;
}

export { CHUNK_SHIFT };
