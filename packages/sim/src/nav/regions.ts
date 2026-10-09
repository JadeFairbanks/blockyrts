// The region map a long path is planned on (Patch 5, Jade's GP-22). The
// coarse tiles (4 x 4 columns, 1.8 m) were taken as open inside, so a tile a
// wall, a building or a cliff ran through counted as a way across: a long
// path went straight through the wall of a village or a ridge, the fine
// search inside its corridor found no way, and the unit stopped at the wall.
// Here each tile is split into its regions, the places in it a mover can walk
// between and back without leaving the tile, and the map is a graph of those
// regions: one region's ways out to the regions next to it, with the cost of
// the cheapest step across. A path over the regions is a path a unit can
// really walk, inside the tiles it names, so the fine search always finds it.
//
// Built per chunk and per kind of mover from the walk map on demand, and redone
// only for the tiles whose columns changed (the world logs which columns of a
// chunk's walk map changed). Like the walk map, it is a pure function of the
// state, so caching it can never cause a desync.

import { COLUMNS_PER_CHUNK, floorDiv } from '../fixed.ts';
import { chunkKey, CHUNK_SHIFT } from '../world/chunk.ts';
import { CLAMBER_UNITS, DROP_UNITS, NO_FLOOR, STEP_UNITS, TOP, type Mover, type NavGrid } from './grid.ts';

/** Coarse tiles are 4 x 4 columns (1.8 m), 16 x 16 per chunk. */
export const TILE_SHIFT = 2;
const TILES_PER_CHUNK = COLUMNS_PER_CHUNK >> TILE_SHIFT;
const TILE_CHUNK_SHIFT = CHUNK_SHIFT - TILE_SHIFT;
const TILES = TILES_PER_CHUNK * TILES_PER_CHUNK;
/** A tile's walk nodes: its 16 columns on their two walk levels (local column * 2 + walk level). */
export const NODES_PER_TILE = 32;
/** A node no region holds: the mover cannot stand there. */
export const NO_REGION = 255;
/** A way out to another region of the same tile (a one-way drop inside it); 0 to 7 are the eight directions. */
export const SAME_TILE = 8;
/** The eight directions, in nav/path.ts DIRS order. */
const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DZ = [0, 0, 1, -1, 1, -1, 1, -1] as const;

/** The regions of a chunk's tiles for one mover, each tile labelled the first time something asks. */
interface Labels {
  cx: number;
  cz: number;
  version: number;
  epoch: number;
  /** Per tile: 1 once labelled (and while its columns stand as they were). */
  done: Uint8Array;
  /** Per tile, per node: its region in the tile, or NO_REGION. */
  label: Uint8Array;
  count: Uint8Array;
  /** Per tile: 1 when it is a single region on its top that a mover walks all over both ways (no walk level under). */
  plain: Uint8Array;
  /** Per tile: its one-way ways from one of its regions to another, packed as ways are (SAME_TILE). */
  inner: Uint32Array[];
}

/** The ways out of a chunk's regions, for one mover. */
interface Ways {
  cx: number;
  cz: number;
  versions: number[];
  epoch: number;
  /** Per tile: its regions' ways out, packed (way()); null until a search first asks, so a search pays only for the tiles it looks at. */
  out: (Uint32Array | null)[];
  /** The labels of the chunk and the eight round it, while the walk map stands. */
  near: Labels[] | null;
}

const EMPTY = new Uint32Array(0);

/** A way packed in 32 bits: the region it leaves, the region it reaches, the direction to that region's tile (or SAME_TILE), and its cost. */
export function way(from: number, to: number, d: number, cost: number): number {
  return (from | (to << 5) | (d << 10) | (Math.min(cost, 0x3ffff) << 14)) >>> 0;
}
export function wayFrom(w: number): number {
  return w & 31;
}
export function wayTo(w: number): number {
  return (w >>> 5) & 31;
}
export function wayDir(w: number): number {
  return (w >>> 10) & 15;
}
export function wayCost(w: number): number {
  return w >>> 14;
}

/** The node of a column of a tile on a walk level. */
function nodeOf(lx: number, lz: number, layer: number): number {
  return (((lz << TILE_SHIFT) | lx) << 1) | layer;
}

export class RegionMap {
  private readonly labels = new Map<number, Map<number, Labels>>();
  private readonly ways = new Map<number, Map<number, Ways>>();
  private lastLabels: Labels | null = null;
  private lastLabelsKey = 0;
  private lastLabelsMover = -1;
  private lastWays: Ways | null = null;
  private lastWaysKey = 0;
  private lastWaysMover = -1;
  /** Scratch for labelling a tile: union-find parents and the steps found. */
  private readonly parent = new Int8Array(NODES_PER_TILE);
  private readonly stepCost = new Int32Array(NODES_PER_TILE * NODES_PER_TILE);
  private readonly stepsFound: number[] = [];
  /** Scratch for a tile's ways: the cheapest step between two regions (+1, 0 for none), the pairs seen, the ways. */
  private readonly pairCost = new Int32Array(NODES_PER_TILE * NODES_PER_TILE);
  private readonly pairs: number[] = [];
  private readonly outScratch: number[] = [];

  constructor(readonly grid: NavGrid) {}

  // ----- lookups -----

  /** How many regions a tile holds for a mover. */
  count(tx: number, tz: number, m: Mover): number {
    const l = this.labelsOf(tx >> TILE_CHUNK_SHIFT, tz >> TILE_CHUNK_SHIFT, m);
    const t = this.tileIndex(tx, tz);
    if (l.done[t] === 0) this.labelTile(l, t, m);
    return l.count[t]!;
  }

  /** The region of a column's walk level for a mover, or NO_REGION. */
  regionAt(x: number, z: number, layer: number, m: Mover): number {
    const tx = x >> TILE_SHIFT;
    const tz = z >> TILE_SHIFT;
    const l = this.labelsOf(tx >> TILE_CHUNK_SHIFT, tz >> TILE_CHUNK_SHIFT, m);
    const t = this.tileIndex(tx, tz);
    if (l.done[t] === 0) this.labelTile(l, t, m);
    return l.label[t * NODES_PER_TILE + nodeOf(x & 3, z & 3, layer)]!;
  }

  /** The ways out of a tile's regions for a mover, packed (way()). */
  waysOut(tx: number, tz: number, m: Mover): Uint32Array {
    const c = this.waysOf(tx >> TILE_CHUNK_SHIFT, tz >> TILE_CHUNK_SHIFT, m);
    const t = this.tileIndex(tx, tz);
    let o = c.out[t]!;
    if (o === null) {
      if (c.near === null) {
        c.near = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) c.near.push(this.labelsOf(c.cx + dx, c.cz + dz, m));
      }
      o = c.out[t] = this.tileWays(t, c.cx, c.cz, m, c.near);
    }
    return o;
  }

  private tileIndex(tx: number, tz: number): number {
    return ((tz & (TILES_PER_CHUNK - 1)) << TILE_CHUNK_SHIFT) | (tx & (TILES_PER_CHUNK - 1));
  }

  // ----- labels -----

  private labelsOf(cx: number, cz: number, m: Mover): Labels {
    const key = chunkKey(cx, cz);
    const w = this.grid.world;
    if (this.lastLabels && this.lastLabelsKey === key && this.lastLabelsMover === m.id && this.lastLabels.epoch === w.navEpoch) return this.lastLabels;
    let cache = this.labels.get(m.id);
    if (!cache) {
      cache = new Map();
      this.labels.set(m.id, cache);
    }
    let l = cache.get(key);
    const version = w.navVersion(key);
    if (!l) {
      l = { cx, cz, version, epoch: w.navEpoch, done: new Uint8Array(TILES), label: new Uint8Array(TILES * NODES_PER_TILE), count: new Uint8Array(TILES), plain: new Uint8Array(TILES), inner: new Array<Uint32Array>(TILES).fill(EMPTY) };
      cache.set(key, l);
      if (cache.size > 4096) cache.delete(cache.keys().next().value!);
    } else if (l.version !== version) {
      // Forget only the tiles whose columns changed: a tile's regions read its own columns alone.
      const cols = w.navChangesSince(key, l.version);
      if (cols === null) l.done.fill(0);
      else for (let k = 0; k < cols.length; k += 2) l.done[this.tileIndex(cols[k]! >> TILE_SHIFT, cols[k + 1]! >> TILE_SHIFT)] = 0;
      l.version = version;
    }
    l.epoch = w.navEpoch;
    this.lastLabels = l;
    this.lastLabelsKey = key;
    this.lastLabelsMover = m.id;
    return l;
  }

  /** The most a mover rises, and drops, in one step it can also take back, terrain units (a climb either way counts). */
  private static reach(m: Mover): number {
    if (m.climbs) return Infinity;
    const climb = m.climb ?? 0;
    const both = Math.min(Math.max(m.clamber ?? CLAMBER_UNITS, climb), Math.max(m.drop ?? DROP_UNITS, climb));
    return m.wheels ? Math.min(both, STEP_UNITS) : both;
  }

  /**
   * Splits one tile into its regions: nodes joined where the mover steps
   * from one to the other and back, inside the tile; regions numbered in
   * node order. A step one way only (a drop it cannot climb back) is a way
   * from its region to the other's (inner).
   */
  private labelTile(l: Labels, t: number, m: Mover): void {
    const g = this.grid;
    const cx = l.cx;
    const cz = l.cz;
    l.done[t] = 1;
    const x0 = (cx << CHUNK_SHIFT) + ((t & (TILES_PER_CHUNK - 1)) << TILE_SHIFT);
    const z0 = (cz << CHUNK_SHIFT) + ((t >> TILE_CHUNK_SHIFT) << TILE_SHIFT);
    const base = t * NODES_PER_TILE;
    l.inner[t] = EMPTY;
    // Most tiles: every column open on top, nothing under, and each step between neighbours one the mover takes both ways.
    const reach = RegionMap.reach(m);
    let plain = true;
    for (let lz = 0; lz < 4 && plain; lz++) {
      for (let lx = 0; lx < 4 && plain; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        if (!g.standable(x, z, m, TOP) || g.under(x, z) !== NO_FLOOR) plain = false;
        else if (lx < 3 && Math.abs(g.level(x + 1, z) - g.level(x, z)) > reach) plain = false;
        else if (lz < 3 && Math.abs(g.level(x, z + 1) - g.level(x, z)) > reach) plain = false;
      }
    }
    if (plain) {
      for (let n = 0; n < NODES_PER_TILE; n++) l.label[base + n] = (n & 1) === TOP ? 0 : NO_REGION;
      l.count[t] = 1;
      l.plain[t] = 1;
      return;
    }
    l.plain[t] = 0;
    // Union-find over the nodes the mover can stand on, joined by steps it takes both ways.
    const parent = this.parent;
    for (let lz = 0; lz < 4; lz++) {
      for (let lx = 0; lx < 4; lx++) {
        for (let layer = 0; layer < 2; layer++) parent[nodeOf(lx, lz, layer)] = g.standable(x0 + lx, z0 + lz, m, layer) ? nodeOf(lx, lz, layer) : -1;
      }
    }
    const cost = this.stepCost;
    const found = this.stepsFound;
    found.length = 0;
    for (let a = 0; a < NODES_PER_TILE; a++) {
      if (parent[a]! < 0) continue;
      const la = a & 1;
      const alx = (a >> 1) & 3;
      const alz = a >> 3;
      for (let d = 0; d < 8; d++) {
        const blx = alx + DX[d]!;
        const blz = alz + DZ[d]!;
        if (blx < 0 || blz < 0 || blx > 3 || blz > 3) continue;
        const ax = x0 + alx;
        const az = z0 + alz;
        const lb = g.layerTo(ax, az, la, x0 + blx, z0 + blz, m);
        if (lb < 0) continue;
        const c = g.stepCostFrom(ax, az, la, x0 + blx, z0 + blz, m);
        if (c < 0) continue;
        const b = nodeOf(blx, blz, lb);
        if (parent[b]! < 0) continue;
        cost[a * NODES_PER_TILE + b] = c + 1;
        found.push(a, b);
      }
    }
    const root = (n: number): number => {
      while (parent[n] !== n) n = parent[n]!;
      return n;
    };
    for (let k = 0; k < found.length; k += 2) {
      const a = found[k]!;
      const b = found[k + 1]!;
      if (cost[b * NODES_PER_TILE + a]! === 0) continue;
      const ra = root(a);
      const rb = root(b);
      // The lower node is the root, so the numbering never depends on the order of the joins.
      if (ra < rb) parent[rb] = ra;
      else if (rb < ra) parent[ra] = rb;
    }
    // Regions numbered in node order.
    let count = 0;
    const number = new Int8Array(NODES_PER_TILE).fill(-1);
    for (let n = 0; n < NODES_PER_TILE; n++) {
      if (parent[n]! < 0) {
        l.label[base + n] = NO_REGION;
        continue;
      }
      const r = root(n);
      if (number[r]! < 0) number[r] = count++;
      l.label[base + n] = number[r]!;
    }
    l.count[t] = count;
    // One-way steps between two of its regions: the cheapest each way.
    let inner: number[] | null = null;
    const best = new Map<number, number>();
    for (let k = 0; k < found.length; k += 2) {
      const a = found[k]!;
      const b = found[k + 1]!;
      const ra = l.label[base + a]!;
      const rb = l.label[base + b]!;
      if (ra === rb) continue;
      const c = cost[a * NODES_PER_TILE + b]! - 1;
      const pair = ra * NODES_PER_TILE + rb;
      const was = best.get(pair);
      if (was === undefined) {
        (inner ??= []).push(pair);
        best.set(pair, c);
      } else if (c < was) best.set(pair, c);
    }
    if (inner) l.inner[t] = Uint32Array.from(inner, (pair) => way(pair >> 5, pair & 31, SAME_TILE, best.get(pair)!));
    for (let k = 0; k < found.length; k += 2) cost[found[k]! * NODES_PER_TILE + found[k + 1]!] = 0;
    found.length = 0;
  }

  // ----- ways -----

  private waysOf(cx: number, cz: number, m: Mover): Ways {
    const key = chunkKey(cx, cz);
    const w = this.grid.world;
    if (this.lastWays && this.lastWaysKey === key && this.lastWaysMover === m.id && this.lastWays.epoch === w.navEpoch) return this.lastWays;
    let cache = this.ways.get(m.id);
    if (!cache) {
      cache = new Map();
      this.ways.set(m.id, cache);
    }
    const versions: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) versions.push(w.navVersion(chunkKey(cx + dx, cz + dz)));
    let c = cache.get(key);
    if (!c) {
      c = { cx, cz, versions, epoch: w.navEpoch, out: new Array<Uint32Array | null>(TILES).fill(null), near: null };
      cache.set(key, c);
      if (cache.size > 4096) cache.delete(cache.keys().next().value!);
    } else if (!c.versions.every((v, i) => v === versions[i])) {
      // Forget the tiles whose ways can have changed: a tile's ways read its own columns, its neighbours' and their regions,
      // so a changed column touches the tile it lies in and the ring of tiles round that one.
      const tx0 = cx << TILE_CHUNK_SHIFT;
      const tz0 = cz << TILE_CHUNK_SHIFT;
      const out = c.out;
      const mark = (ax: number, az: number, bx: number, bz: number): void => {
        for (let tz = Math.max(az, tz0); tz <= Math.min(bz, tz0 + TILES_PER_CHUNK - 1); tz++) {
          for (let tx = Math.max(ax, tx0); tx <= Math.min(bx, tx0 + TILES_PER_CHUNK - 1); tx++) out[((tz - tz0) << TILE_CHUNK_SHIFT) | (tx - tx0)] = null;
        }
      };
      for (let n = 0; n < 9; n++) {
        if (c.versions[n] === versions[n]) continue;
        const ncx = cx + (n % 3) - 1;
        const ncz = cz + floorDiv(n, 3) - 1;
        const cols = w.navChangesSince(chunkKey(ncx, ncz), c.versions[n]!);
        if (cols === null) {
          mark((ncx << TILE_CHUNK_SHIFT) - 1, (ncz << TILE_CHUNK_SHIFT) - 1, (ncx << TILE_CHUNK_SHIFT) + TILES_PER_CHUNK, (ncz << TILE_CHUNK_SHIFT) + TILES_PER_CHUNK);
          continue;
        }
        for (let k = 0; k < cols.length; k += 2) {
          const tx = cols[k]! >> TILE_SHIFT;
          const tz = cols[k + 1]! >> TILE_SHIFT;
          mark(tx - 1, tz - 1, tx + 1, tz + 1);
        }
      }
      c.versions = versions;
    }
    if (c.epoch !== w.navEpoch) c.near = null;
    c.epoch = w.navEpoch;
    this.lastWays = c;
    this.lastWaysKey = key;
    this.lastWaysMover = m.id;
    return c;
  }

  /**
   * The ways out of one tile's regions: to the regions of the eight tiles
   * round it, the cheapest step across between each two regions (cost x4,
   * a tile being four columns' walk), then its own one-way ways inside it.
   * `near` holds the labels of the chunk and the eight round it.
   */
  private tileWays(t: number, cx: number, cz: number, m: Mover, near: readonly Labels[]): Uint32Array {
    const g = this.grid;
    const tx = (cx << TILE_CHUNK_SHIFT) + (t & (TILES_PER_CHUNK - 1));
    const tz = (cz << TILE_CHUNK_SHIFT) + (t >> TILE_CHUNK_SHIFT);
    const x0 = tx << TILE_SHIFT;
    const z0 = tz << TILE_SHIFT;
    const here = near[4]!;
    if (here.done[t] === 0) this.labelTile(here, t, m);
    if (here.count[t] === 0) return here.inner[t]!;
    const plainHere = here.plain[t] === 1;
    const out = this.outScratch;
    out.length = 0;
    const pairCost = this.pairCost;
    const pairs = this.pairs;
    for (let d = 0; d < 8; d++) {
      const ntx = tx + DX[d]!;
      const ntz = tz + DZ[d]!;
      const nl = near[((ntz >> TILE_CHUNK_SHIFT) - cz + 1) * 3 + ((ntx >> TILE_CHUNK_SHIFT) - cx + 1)]!;
      const nt = this.tileIndex(ntx, ntz);
      if (nl.done[nt] === 0) this.labelTile(nl, nt, m);
      if (nl.count[nt] === 0) continue;
      const straight = DX[d] === 0 || DZ[d] === 0;
      if (plainHere && nl.plain[nt] === 1) {
        // Two plain tiles: one region each on top, and a straight step is the cheapest way across (a slanting one needs the straight one beside it open).
        let best = -1;
        if (straight) {
          for (let k = 0; k < 4; k++) {
            const ax = x0 + (DX[d] === 0 ? k : DX[d]! > 0 ? 3 : 0);
            const az = z0 + (DZ[d] === 0 ? k : DZ[d]! > 0 ? 3 : 0);
            const c = g.stepCostFrom(ax, az, TOP, ax + DX[d]!, az + DZ[d]!, m);
            if (c >= 0 && (best < 0 || c < best)) best = c;
          }
        } else {
          const ax = x0 + (DX[d]! > 0 ? 3 : 0);
          const az = z0 + (DZ[d]! > 0 ? 3 : 0);
          best = g.stepCostFrom(ax, az, TOP, ax + DX[d]!, az + DZ[d]!, m);
        }
        if (best >= 0) out.push(way(0, 0, d, best * 4));
        continue;
      }
      // Each step from a column of this tile onto a column of that one, on either walk level.
      pairs.length = 0;
      const k1 = straight ? 4 : 1;
      for (let k = 0; k < k1; k++) {
        const lx = DX[d] === 0 ? k : DX[d]! > 0 ? 3 : 0;
        const lz = DZ[d] === 0 ? k : DZ[d]! > 0 ? 3 : 0;
        const ax = x0 + lx;
        const az = z0 + lz;
        for (let e = 0; e < 8; e++) {
          if (!straight && e !== d) continue;
          const bx = ax + DX[e]!;
          const bz = az + DZ[e]!;
          if (bx >> TILE_SHIFT !== ntx || bz >> TILE_SHIFT !== ntz) continue;
          for (let la = 0; la < 2; la++) {
            const ra = here.label[t * NODES_PER_TILE + nodeOf(lx, lz, la)]!;
            if (ra === NO_REGION) continue;
            const lb = g.layerTo(ax, az, la, bx, bz, m);
            if (lb < 0) continue;
            const c = g.stepCostFrom(ax, az, la, bx, bz, m);
            if (c < 0) continue;
            const rb = nl.label[nt * NODES_PER_TILE + nodeOf(bx & 3, bz & 3, lb)]!;
            if (rb === NO_REGION) continue;
            const pair = ra * NODES_PER_TILE + rb;
            const was = pairCost[pair]!;
            if (was === 0) pairs.push(pair);
            if (was === 0 || c + 1 < was) pairCost[pair] = c + 1;
          }
        }
      }
      for (const pair of pairs) {
        out.push(way(pair >> 5, pair & 31, d, (pairCost[pair]! - 1) * 4));
        pairCost[pair] = 0;
      }
    }
    for (const w of here.inner[t]!) out.push(w);
    return out.length === 0 ? EMPTY : Uint32Array.from(out);
  }
}

/** The tile of a column. */
export function tileOfColumn(x: number): number {
  return x >> TILE_SHIFT;
}
