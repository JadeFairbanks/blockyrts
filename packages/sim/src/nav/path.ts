// Pathfinding (technical decision 6; Patch 5, Jade's GP-22): A* on the
// 45 cm columns for a short trip; for a longer one, A* over the regions of
// the 1.8 m coarse tiles (nav/regions.ts) to find a corridor, then A* on the
// columns inside it, with the doc's step, clamber, drop and climb rules. A
// long trip is walked a leg at a time, each leg planned from the end of the
// last, so no one search ranges over the whole of it. Paths are straightened
// over plain ground so units walk in straight lines rather than along the
// grid. Integer costs, binary heaps with fixed tie-breaking and bounded
// searches keep every machine on the same path. The coarse tiles' own
// crossings (edgeCost) stay for the monsters' fields round the towns
// (combat/fields.ts).

import { floorDiv } from '../fixed.ts';
import { chunkKey, CHUNK_SHIFT } from '../world/chunk.ts';
import { NO_FLOOR, PERSON, TOP, UNDER, type Mover, type NavGrid } from './grid.ts';
import { NO_REGION, NODES_PER_TILE, RegionMap, SAME_TILE, TILE_SHIFT, wayCost, wayDir, wayFrom, wayTo } from './regions.ts';

/** Coarse tiles are 4 x 4 columns (1.8 m), 16 x 16 per chunk. */
export const TILE_COLUMNS = 4;
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
  /** Optional: the standing level must be within [ylo, yhi], terrain units (a tunnel's worker stands in the tunnel, not on the hill above it). */
  ylo?: number;
  yhi?: number;
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

/** Whether a column, and the standing level on it if the goal bounds one, is in the goal. */
export function atGoal(g: Goal, x: number, z: number, level?: number): boolean {
  const d = rectDistance(g, x, z);
  if (d < g.min || d > g.max) return false;
  if (level === undefined) return true;
  return (g.ylo === undefined || level >= g.ylo) && (g.yhi === undefined || level <= g.yhi);
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
  /** A long trip's first leg (Patch 5, GP-22): the way goes on, so plan the next leg from its end. */
  more?: boolean;
}

export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

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
  /** The walk-map epoch it was last found current at: while the epoch stands, no version can have moved. */
  epoch: number;
  /** Per tile, 8 costs in DIRS order; 0 = no way through. */
  edges: Uint16Array;
}

/** Search limits (s): enough for a long walk round a barrier, small enough for the step budget. */
export const FINE_BUDGET_SHORT = 6000;
export const FINE_BUDGET_LONG = 20000;
/** Regions a search over the regions expands at most (s): a walk round a ridge or a lake a few hundred metres long. */
export const COARSE_BUDGET = 20000;
/** Regions it expands to come near a goal whose regions are shut off (s). */
export const NEAR_BUDGET = 2000;
/** Regions a goal's regions are walked back over to see whether they are shut off (s). */
const SHUT_OFF_LIMIT = 512;
/**
 * The estimate a search over the regions makes of the way left, per tile of
 * octile distance: a tile's cheapest crossing is 4 columns' walk (x4), and
 * the estimate is a quarter more (s), so a search heads for the goal and
 * looks round far less, for a way at most a quarter dearer than the
 * cheapest (a 300 m walk over hills: 600 regions looked at, not 4,000).
 */
const HEURISTIC_PER_TILE = 5;
/** Regions a search over the regions looks at before it asks whether the goal is shut off. */
const SHUT_OFF_AFTER = 1000;
/** Slack round the start and the goal of a search over the regions, tiles (s: 173 m). */
const REGION_PAD_TILES = 96;
/** Regions in a leg of a long trip (Patch 5, GP-22) (s: about 58 m on open ground). */
export const LEG_REGIONS = 32;
/** A goal of up to this many columns has its regions listed; a bigger one is any region of its tiles. */
const GOAL_COLUMNS_LISTED = 4096;
const SHORT_COLUMNS = 48;
/** Tiles of the world each way from 0 (it ends at 100 km, 55,556 tiles), for regionKey(). */
const TILE_OFFSET = 1 << 16;
const TILE_SPAN = 1 << 17;

/** One number for a region of a tile (the search's keys). */
export function regionKey(tx: number, tz: number, r: number): number {
  return ((tz + TILE_OFFSET) * TILE_SPAN + (tx + TILE_OFFSET)) * NODES_PER_TILE + r;
}

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
  /** Regions expanded by searches over the regions, all told (a measure for tests). */
  regionExpansions = 0;
  /** The regions of the coarse tiles (Patch 5, GP-22). */
  readonly regions: RegionMap;
  /** A search over the regions: each window tile's first node (-1 until touched), the touched tiles, and per node its cost, parent, state, tile and region. */
  private tileSlot = new Int32Array(0);
  private readonly slotted: number[] = [];
  private nodes = 0;
  private rg = new Int32Array(0);
  private rparent = new Int32Array(0);
  private rstate = new Uint8Array(0);
  private rtile = new Int32Array(0);
  private rregion = new Uint8Array(0);

  constructor(readonly grid: NavGrid) {
    this.regions = new RegionMap(grid);
  }

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
   * A* on columns and their walk levels inside a window (and inside the
   * tile mask, if given), from walk level sl of the start. Returns the raw
   * column path from start to the goal with the walk level of each column,
   * or to the explored column nearest the goal when it cannot be reached
   * within the budget.
   */
  private fine(
    m: Mover,
    sx: number,
    sz: number,
    sl: number,
    goal: Goal,
    win: Window,
    budget: number,
    tileMask: { x0: number; z0: number; w: number; bits: Uint8Array } | null,
    accept: ((x: number, z: number, layer: number) => boolean) | null = null,
  ): { cols: number[]; layers: number[]; reached: boolean } {
    const W = win.w;
    const H = win.h;
    this.ensure(W * H * 2);
    this.reset();
    const grid = this.grid;
    // Node index: column index * 2 + walk level.
    const idx = (x: number, z: number, l: number): number => ((z - win.z0) * W + (x - win.x0)) * 2 + l;
    const inMask = (x: number, z: number): boolean => {
      if (!tileMask) return true;
      const tx = (x >> TILE_SHIFT) - tileMask.x0;
      const tz = (z >> TILE_SHIFT) - tileMask.z0;
      if (tx < 0 || tz < 0 || tx >= tileMask.w) return false;
      const k = tz * tileMask.w + tx;
      return k < tileMask.bits.length && tileMask.bits[k] === 1;
    };
    const s = idx(sx, sz, sl);
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
      const cl = cur & 1;
      const cc = cur >> 1;
      const cx = (cc % W) + win.x0;
      const cz = floorDiv(cc, W) + win.z0;
      if (atGoal(goal, cx, cz, grid.levelOf(cx, cz, cl)) && (accept === null || accept(cx, cz, cl))) {
        found = cur;
        break;
      }
      if (++expanded > budget) break;
      const gc = this.g[cur]!;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d]![0];
        const nz = cz + DIRS[d]![1];
        if (nx < win.x0 || nz < win.z0 || nx >= win.x0 + W || nz >= win.z0 + H) continue;
        if (!inMask(nx, nz)) continue;
        const nl = grid.layerTo(cx, cz, cl, nx, nz, m);
        if (nl < 0) continue;
        const ni = idx(nx, nz, nl);
        if (this.state[ni] === 2) continue;
        const c = grid.stepCostFrom(cx, cz, cl, nx, nz, m);
        if (c < 0) continue;
        const ng = gc + c;
        if (this.state[ni] === 1 && ng >= this.g[ni]!) continue;
        if (this.state[ni] === 0) this.touched.push(ni);
        this.state[ni] = 1;
        this.g[ni] = ng;
        // The direction in the low 3 bits, the walk level it came from in bit 3.
        this.from[ni] = d | (cl << 3);
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
    const layers: number[] = [];
    let at = end;
    while (at !== s) {
      const c = at >> 1;
      const x = (c % W) + win.x0;
      const z = floorDiv(c, W) + win.z0;
      cols.push(z, x);
      layers.push(at & 1);
      const f = this.from[at]!;
      const d = DIRS[f & 7]!;
      at = idx(x - d[0], z - d[1], f >> 3);
    }
    cols.reverse();
    layers.reverse();
    return { cols, layers, reached: found >= 0 };
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
    const c = cache.get(key);
    if (c && c.epoch === w.navEpoch) return c;
    const versions: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) versions.push(w.navVersion(chunkKey(cx + dx, cz + dz)));
    if (c && c.versions.every((v, i) => v === versions[i])) {
      c.epoch = w.navEpoch;
      return c;
    }
    if (c) {
      // Redo only the tiles whose crossings can have changed. A tile's
      // crossings read its own columns and the ring of columns round it, so
      // a changed column touches the tiles it lies in or borders; a chunk
      // changed as a whole (or too long ago to say where) touches its own
      // tiles and the ring of tiles round it. The rest are as a full rebuild
      // would make them. Flowing water and smashed ground change a column or
      // two at a time, and rebuilding the whole chunk and its eight
      // neighbours for each was most of the late-night lag (Patch 5 BG-2).
      const redo = new Uint8Array(TILES_PER_CHUNK * TILES_PER_CHUNK);
      const tx0 = cx << 4;
      const tz0 = cz << 4;
      const mark = (ax: number, az: number, bx: number, bz: number): void => {
        for (let tz = Math.max(az, tz0); tz <= Math.min(bz, tz0 + TILES_PER_CHUNK - 1); tz++) {
          for (let tx = Math.max(ax, tx0); tx <= Math.min(bx, tx0 + TILES_PER_CHUNK - 1); tx++) redo[(tz - tz0) * TILES_PER_CHUNK + (tx - tx0)] = 1;
        }
      };
      for (let n = 0; n < 9; n++) {
        if (c.versions[n] === versions[n]) continue;
        const ncx = cx + (n % 3) - 1;
        const ncz = cz + floorDiv(n, 3) - 1;
        const cols = w.navChangesSince(chunkKey(ncx, ncz), c.versions[n]!);
        if (cols === null) {
          mark((ncx << 4) - 1, (ncz << 4) - 1, (ncx << 4) + TILES_PER_CHUNK, (ncz << 4) + TILES_PER_CHUNK);
          continue;
        }
        for (let k = 0; k < cols.length; k += 2) mark(floorDiv(cols[k]! - 1, TILE_COLUMNS), floorDiv(cols[k + 1]! - 1, TILE_COLUMNS), floorDiv(cols[k]! + 1, TILE_COLUMNS), floorDiv(cols[k + 1]! + 1, TILE_COLUMNS));
      }
      for (let t = 0; t < TILES_PER_CHUNK * TILES_PER_CHUNK; t++) {
        if (!redo[t]) continue;
        for (let d = 0; d < 8; d++) c.edges[t * 8 + d] = this.tileEdge(tx0 + (t & 15), tz0 + (t >> 4), d, m);
      }
      c.versions = versions;
      c.epoch = w.navEpoch;
      return c;
    }
    const edges = new Uint16Array(TILES_PER_CHUNK * TILES_PER_CHUNK * 8);
    for (let t = 0; t < TILES_PER_CHUNK * TILES_PER_CHUNK; t++) {
      const tx = (cx << 4) + (t & 15);
      const tz = (cz << 4) + (t >> 4);
      for (let d = 0; d < 8; d++) edges[t * 8 + d] = this.tileEdge(tx, tz, d, m);
    }
    const out = { versions, epoch: w.navEpoch, edges };
    cache.set(key, out);
    if (cache.size > 2048) cache.delete(cache.keys().next().value!);
    return out;
  }

  /** Whether a chunk's coarse edges for a mover are built and current, so no search has to build them (warmCaches). */
  coarseReady(cx: number, cz: number, m: Mover): boolean {
    const c = this.coarse.get(m.id)?.get(chunkKey(cx, cz));
    if (!c) return false;
    const w = this.grid.world;
    if (c.epoch === w.navEpoch) return true;
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.navVersion(chunkKey(cx + dx, cz + dz)) !== c.versions[n++]) return false;
    return true;
  }

  /** Builds (or brings up to date) a chunk's coarse edges for a mover ahead of need (warmCaches). */
  warmCoarse(cx: number, cz: number, m: Mover): void {
    this.coarseChunk(cx, cz, m);
  }

  /** The cheapest crossing from tile (tx, tz) to its neighbour in direction d, x4, or 0 if there is none. */
  private tileEdge(tx: number, tz: number, d: number, m: Mover): number {
    const [dx, dz] = DIRS[d]!;
    const grid = this.grid;
    let best = -1;
    const bx = tx << TILE_SHIFT;
    const bz = tz << TILE_SHIFT;
    // Either walk level of the column on this side may cross (a tunnel's floor or the top).
    const cost = (ax: number, az: number): number => {
      const top = grid.stepCostFrom(ax, az, TOP, ax + dx, az + dz, m);
      const under = grid.standable(ax, az, m, 1) ? grid.stepCostFrom(ax, az, 1, ax + dx, az + dz, m) : -1;
      return top < 0 ? under : under < 0 ? top : Math.min(top, under);
    };
    if (dx !== 0 && dz !== 0) {
      const ax = dx > 0 ? bx + 3 : bx;
      const az = dz > 0 ? bz + 3 : bz;
      const c = cost(ax, az);
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
      const c = cost(ax, az);
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

  // ----- regions (Patch 5, Jade's GP-22) -----

  /** A search's tile slot for the regions of a window tile, made the first time the search touches the tile. */
  private regionNode(wt: number, tx: number, tz: number, r: number, m: Mover): number {
    let base = this.tileSlot[wt]!;
    if (base < 0) {
      const n = this.regions.count(tx, tz, m);
      base = this.nodes;
      this.nodes += n;
      if (this.rg.length < this.nodes) {
        const size = Math.max(this.nodes, this.rg.length * 2, 4096);
        const grow = <T extends Int32Array | Uint8Array>(a: T, make: (k: number) => T): T => {
          const b = make(size);
          b.set(a);
          return b;
        };
        this.rg = grow(this.rg, (k) => new Int32Array(k));
        this.rparent = grow(this.rparent, (k) => new Int32Array(k));
        this.rstate = grow(this.rstate, (k) => new Uint8Array(k));
        this.rtile = grow(this.rtile, (k) => new Int32Array(k));
        this.rregion = grow(this.rregion, (k) => new Uint8Array(k));
      }
      for (let k = 0; k < n; k++) {
        this.rstate[base + k] = 0;
        this.rtile[base + k] = wt;
        this.rregion[base + k] = k;
      }
      this.tileSlot[wt] = base;
      this.slotted.push(wt);
    }
    return base + r;
  }

  /** Readies the window's tile slots for a search over a window of W x H tiles. */
  private regionWindow(n: number): void {
    for (const wt of this.slotted) this.tileSlot[wt] = -1;
    this.slotted.length = 0;
    this.nodes = 0;
    this.heap.clear();
    if (this.tileSlot.length < n) this.tileSlot = new Int32Array(n).fill(-1);
  }

  /**
   * The regions holding a goal's columns (on the walk levels it allows), as
   * regionKey()s; null for a goal too big to list, which any region of its
   * tiles then stands for.
   */
  private goalRegions(goal: Goal, m: Mover): Set<number> | null {
    const x0 = goal.x0 - goal.max;
    const z0 = goal.z0 - goal.max;
    const x1 = goal.x1 + goal.max;
    const z1 = goal.z1 + goal.max;
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > GOAL_COLUMNS_LISTED) return null;
    const out = new Set<number>();
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d = rectDistance(goal, x, z);
        if (d < goal.min || d > goal.max) continue;
        for (let layer = TOP; layer <= UNDER; layer++) {
          const level = this.grid.levelOf(x, z, layer);
          if (level === NO_FLOOR || !atGoal(goal, x, z, level)) continue;
          const r = this.regions.regionAt(x, z, layer, m);
          if (r !== NO_REGION) out.add(regionKey(x >> TILE_SHIFT, z >> TILE_SHIFT, r));
        }
      }
    }
    return out;
  }

  /**
   * Whether the regions a goal's columns lie in are shut off: walking
   * backwards from them over the ways into them, the regions that can reach
   * them run out within `limit` regions, and the start's is not among them.
   * Then no path there exists, and a long search for one is spared.
   */
  private goalShutOff(goals: Set<number>, start: number, m: Mover, limit: number): boolean {
    const seen = new Set<number>(goals);
    const queue = [...goals];
    for (let q = 0; q < queue.length; q++) {
      if (seen.size > limit) return false;
      const key = queue[q]!;
      const r = key % NODES_PER_TILE;
      const tile = floorDiv(key, NODES_PER_TILE);
      const tx = (tile % TILE_SPAN) - TILE_OFFSET;
      const tz = floorDiv(tile, TILE_SPAN) - TILE_OFFSET;
      // Ways into it: from the tiles round it, and from its own tile's other regions.
      for (let d = 0; d <= SAME_TILE; d++) {
        const ftx = d === SAME_TILE ? tx : tx - DIRS[d]![0];
        const ftz = d === SAME_TILE ? tz : tz - DIRS[d]![1];
        for (const w of this.regions.waysOut(ftx, ftz, m)) {
          if (wayDir(w) !== d || wayTo(w) !== r) continue;
          const from = regionKey(ftx, ftz, wayFrom(w));
          if (from === start) return false;
          if (seen.has(from)) continue;
          seen.add(from);
          queue.push(from);
        }
      }
    }
    return true;
  }

  /**
   * A* over the regions of the coarse tiles from a column's walk level to
   * the regions of a goal (Patch 5, GP-22). Returns the regions on the way,
   * start first, as tile x, tile z, region triples; when the goal is out of
   * reach (or past the budget), the way to the region found nearest it.
   */
  private regionPath(m: Mover, sx: number, sz: number, sl: number, goal: Goal, budget: number): { regions: number[]; reached: boolean } {
    const R = this.regions;
    const grid = this.grid;
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
    const pad = REGION_PAD_TILES;
    const wx0 = Math.min(stx, tg.x0) - pad;
    const wz0 = Math.min(stz, tg.z0) - pad;
    const W = Math.max(stx, tg.x1) - wx0 + 1 + pad;
    const H = Math.max(stz, tg.z1) - wz0 + 1 + pad;
    const goals = this.goalRegions(goal, m);
    const inGoal = (tx: number, tz: number, r: number): boolean => (goals ? goals.has(regionKey(tx, tz, r)) : atGoal(tg, tx, tz));
    // A unit off any region (where its mover cannot stand) starts from the regions it can step onto.
    const seeds: number[] = [];
    const r0 = R.regionAt(sx, sz, sl, m);
    if (r0 !== NO_REGION) seeds.push(stx, stz, r0, 0);
    else {
      for (const [dx, dz] of DIRS) {
        const nx = sx + dx;
        const nz = sz + dz;
        const lb = grid.layerTo(sx, sz, sl, nx, nz, m);
        if (lb < 0) continue;
        const c = grid.stepCostFrom(sx, sz, sl, nx, nz, m);
        const r = c < 0 ? NO_REGION : R.regionAt(nx, nz, lb, m);
        if (r !== NO_REGION) seeds.push(nx >> TILE_SHIFT, nz >> TILE_SHIFT, r, c);
      }
    }
    if (seeds.length === 0) return { regions: [], reached: false };
    // A goal its regions shut off: only far enough to come near it.
    const startKey = regionKey(stx, stz, r0);
    if (goals && goals.size === 0) budget = Math.min(budget, NEAR_BUDGET);
    // Whether the goal is shut off is asked only of a search that has not found it soon.
    let asked = !goals || r0 === NO_REGION || goals.has(startKey);
    this.regionWindow(W * H);
    const hc = (tx: number, tz: number): number => heuristic(tg, tx, tz) * HEURISTIC_PER_TILE;
    let best = -1;
    let bestH = Infinity;
    for (let k = 0; k < seeds.length; k += 4) {
      const tx = seeds[k]!;
      const tz = seeds[k + 1]!;
      const n = this.regionNode((tz - wz0) * W + (tx - wx0), tx, tz, seeds[k + 2]!, m);
      if (this.rstate[n] === 1 && this.rg[n]! <= seeds[k + 3]!) continue;
      this.rstate[n] = 1;
      this.rg[n] = seeds[k + 3]!;
      this.rparent[n] = -1;
      const h = hc(tx, tz);
      this.heap.push(seeds[k + 3]! + h, n);
      if (h < bestH) {
        bestH = h;
        best = n;
      }
    }
    let found = -1;
    let expanded = 0;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (this.rstate[cur] === 2) continue;
      this.rstate[cur] = 2;
      const wt = this.rtile[cur]!;
      const tx = (wt % W) + wx0;
      const tz = floorDiv(wt, W) + wz0;
      const r = this.rregion[cur]!;
      if (inGoal(tx, tz, r)) {
        found = cur;
        break;
      }
      if (++expanded > budget) break;
      if (!asked && expanded > SHUT_OFF_AFTER) {
        asked = true;
        // A goal its regions shut off: only far enough to come near it.
        if (this.goalShutOff(goals!, startKey, m, SHUT_OFF_LIMIT)) budget = Math.min(budget, Math.max(NEAR_BUDGET, expanded));
      }
      const gc = this.rg[cur]!;
      for (const w of R.waysOut(tx, tz, m)) {
        if (wayFrom(w) !== r) continue;
        const d = wayDir(w);
        const ntx = d === SAME_TILE ? tx : tx + DIRS[d]![0];
        const ntz = d === SAME_TILE ? tz : tz + DIRS[d]![1];
        if (ntx < wx0 || ntz < wz0 || ntx >= wx0 + W || ntz >= wz0 + H) continue;
        const nn = this.regionNode((ntz - wz0) * W + (ntx - wx0), ntx, ntz, wayTo(w), m);
        if (this.rstate[nn] === 2) continue;
        const ng = gc + wayCost(w);
        if (this.rstate[nn] === 1 && ng >= this.rg[nn]!) continue;
        this.rstate[nn] = 1;
        this.rg[nn] = ng;
        this.rparent[nn] = cur;
        const h = hc(ntx, ntz);
        if (h < bestH) {
          bestH = h;
          best = nn;
        }
        this.heap.push(ng + h, nn);
      }
    }
    this.regionExpansions += expanded;
    const regions: number[] = [];
    for (let at = found >= 0 ? found : best; at >= 0; at = this.rparent[at]!) {
      const wt = this.rtile[at]!;
      regions.push(this.rregion[at]!, floorDiv(wt, W) + wz0, (wt % W) + wx0);
    }
    regions.reverse();
    return { regions, reached: found >= 0 };
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
   * the columns directly; long ones, or short ones that fail, plan over the
   * regions first and walk the fine path inside their tiles. A long trip is
   * walked a leg at a time (more): the fine path goes as far as the
   * LEG_REGIONS-th region of the way, and the unit plans the next leg from
   * there, so no one search ever ranges over the whole trip.
   */
  find(m: Mover, sx: number, sz: number, goal: Goal, sl = TOP, budget = COARSE_BUDGET): PathResult {
    this.searches++;
    if (atGoal(goal, sx, sz, this.grid.levelOf(sx, sz, sl))) return { points: [], reached: true };
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
      const r = this.fine(m, sx, sz, sl, goal, win, FINE_BUDGET_SHORT, null);
      if (r.reached) return { points: this.straighten(m, sx, sz, sl, r.cols, r.layers), reached: true };
    }
    const rp = this.regionPath(m, sx, sz, sl, goal, budget);
    return this.alongRegions(m, sx, sz, sl, goal, rp.regions, rp.reached);
  }

  /**
   * The fine path along a way over regions (tile x, tile z, region triples):
   * to the goal when the way reaches it within a leg, else to the end of the
   * first leg, on a column of that leg's last region (more: plan again from
   * there). A way that does not reach the goal is walked to its end.
   */
  private alongRegions(m: Mover, sx: number, sz: number, sl: number, goal: Goal, regions: readonly number[], reached: boolean): PathResult {
    const n = floorDiv(regions.length, 3);
    if (n === 0) return { points: [], reached: false };
    const leg = reached && n - 1 > LEG_REGIONS;
    const last = leg ? LEG_REGIONS : n - 1;
    const tiles: number[] = [];
    for (let k = 0; k <= last; k++) tiles.push(regions[3 * k]!, regions[3 * k + 1]!);
    const { mask, win } = this.corridor(tiles);
    let g = goal;
    let accept: ((x: number, z: number, layer: number) => boolean) | null = null;
    if (leg || !reached) {
      // The leg ends on a column of its last region.
      const tx = regions[3 * last]!;
      const tz = regions[3 * last + 1]!;
      const r = regions[3 * last + 2]!;
      g = { x0: tx << TILE_SHIFT, z0: tz << TILE_SHIFT, x1: (tx << TILE_SHIFT) + 3, z1: (tz << TILE_SHIFT) + 3, min: 0, max: 0 };
      accept = (x, z, layer) => this.regions.regionAt(x, z, layer, m) === r;
    }
    const f = this.fine(m, sx, sz, sl, g, win, FINE_BUDGET_LONG, mask, accept);
    const points = this.straighten(m, sx, sz, sl, f.cols, f.layers);
    if (leg) return f.reached && points.length > 0 ? { points, reached: false, more: true } : { points, reached: false };
    return { points, reached: reached && f.reached };
  }

  /**
   * Drops waypoints that a straight walk over plain ground can skip, as long
   * as the walk ends on the same walk level as the path. Input and output are
   * x, z pairs.
   */
  private straighten(m: Mover, sx: number, sz: number, sl: number, cols: readonly number[], layers: readonly number[]): number[] {
    const n = cols.length >> 1;
    if (n <= 1) return cols.slice();
    const out: number[] = [];
    let px = sx;
    let pz = sz;
    let pl = sl;
    let i = -1;
    while (i < n - 1) {
      let j = Math.min(n - 1, i + 24);
      while (j > i + 1 && this.plainLine(m, px, pz, cols[2 * j]!, cols[2 * j + 1]!, pl) !== layers[j]) j--;
      px = cols[2 * j]!;
      pz = cols[2 * j + 1]!;
      pl = layers[j]!;
      out.push(px, pz);
      i = j;
    }
    return out;
  }

  /** The walk level a straight walk over plain ground between two columns ends on, from walk level la (a supercover walk), or -1. */
  plainLine(m: Mover, ax: number, az: number, bx: number, bz: number, la = TOP): number {
    const dx = Math.abs(bx - ax);
    const dz = Math.abs(bz - az);
    const sx = bx > ax ? 1 : -1;
    const sz = bz > az ? 1 : -1;
    let x = ax;
    let z = az;
    let l = la;
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
      l = this.grid.plainStep(x, z, l, nx, nz, m);
      if (l < 0) return -1;
      x = nx;
      z = nz;
    }
    return l;
  }
}

/** The coarse tile of a column, as used by the walk map. */
export function tileOf(x: number): number {
  return x >> TILE_SHIFT;
}

export { CHUNK_SHIFT };
