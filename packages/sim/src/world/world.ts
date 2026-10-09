// The world as the simulation holds it: generated chunks cached by position,
// the chunks players have changed (the save's chunk deltas), prop changes and
// regrowth, water that flows near changed land, and the land the players have
// explored (fog of war), one picture shared by the whole co-op side. Only the
// changes are state; everything else is
// regenerated from the seed on demand and never affects a result
// (Technology, World generation and terrain; technical decision 5).

import { COLUMNS_PER_CHUNK, floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { standLevel, waterFlag } from '../nav/grid.ts';
import {
  CHUNK_SHIFT,
  chunkKey,
  chunkKeyX,
  chunkKeyZ,
  NO_WATER,
  WATER_PER_UNIT,
  type ChunkColumns,
} from './chunk.ts';
import { NATURAL_FLOOR_UNITS, WorldGen, type PropRecord } from './generate.ts';
import { Band, WorldLayout } from './layout.ts';
import { Mat } from './materials.ts';
import { hash2 } from './noise.ts';
import { fishAt, growth, growthStages, isFish, isTree, MUSHROOM_SPREAD, propInfo, PROPS, spreads, Stage } from './props.ts';

const N = COLUMNS_PER_CHUNK;
/** A column and its four sides; the four sides alone. */
const AROUND = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
/** Walk-map changes remembered per chunk (navChangesSince); a cache further behind redoes the whole chunk. */
const NAV_LOG_MAX = 512;
/** Generated chunks kept in memory (technical decision 5: 2,048, least recently used first out). */
export const CHUNK_CACHE_BUDGET = 2048;
/** Fog tiles: 4 x 4 columns (1.8 m), 16 x 16 per chunk, one bit each. */
export const FOG_TILE_COLUMNS = 4;
export const FOG_TILES_PER_CHUNK = 16;
const FOG_BYTES = (FOG_TILES_PER_CHUNK * FOG_TILES_PER_CHUNK) >> 3;
/** Dig limit: 3 m below sea level or below the natural ground where that is lower (Terrain, Digging). */
export const DIG_LIMIT_UNITS = 27;
/**
 * A felled tree's seeds take root only this far from every other tree,
 * metres (Jade's Patch 5, WL-1: forests "become impassable" as the game goes
 * on; s), so a wood never grows thicker than this.
 */
export const SEED_SPACING_M = 4;

/**
 * How deep digging goes at a column whose natural ground is at `natural`,
 * terrain units: the dig limit, but never more than 6 m below sea level
 * (Jade's Patch 5, WL-2: "Players dig depths still have the same limits
 * unless where it conflicts with the hard cap").
 */
export function digFloor(natural: number): number {
  return Math.max(-NATURAL_FLOOR_UNITS, Math.min(0, natural) - DIG_LIMIT_UNITS);
}
/** Water flow work per step, in columns. */
const WATER_BUDGET = 8192;

/** A change to a generated or planted prop. */
export interface PropChange {
  /**
   * What it holds now. For a plant still growing, what it would hold when
   * grown less everything taken from it, so a part-taken young plant keeps
   * growing; 0 with cutAt set is a plant picked bare, nothing taken since.
   */
  amount: number;
  /** Step it was cut down to the stump or picked bare, from which it regrows; -1 if not. */
  cutAt: number;
  /** Felled trees are gone (their seeds are new props). */
  removed: boolean;
}

/** A prop as it stands at a step: its record with changes and growth applied. */
export interface PropView {
  index: number;
  kind: number;
  lx: number;
  lz: number;
  y: number;
  variant: number;
  /** Age at this step (trees). */
  age: number;
  amount: number;
  /** Fish stretches: the most fish the water holds. */
  most: number;
  /** Growth stage (props.ts Stage; Grown for props that do not grow) and drawn size, per mille of full size. */
  stage: number;
  size: number;
  /** Steps until its next growth stage, or -1 once grown. */
  next: number;
}

/** Global column key for water bookkeeping. */
export function colKey(x: number, z: number): number {
  return (x + 0x40000) * 0x80000 + (z + 0x40000);
}
export function colKeyX(k: number): number {
  return floorDiv(k, 0x80000) - 0x40000;
}
export function colKeyZ(k: number): number {
  return (k % 0x80000) - 0x40000;
}

export class World {
  readonly seed: number;
  readonly players: number;
  readonly layout: WorldLayout;
  readonly gen: WorldGen;
  /** Generated chunks, least recently used first (a cache, not state). */
  private readonly cache = new Map<number, { columns: ChunkColumns; props: PropRecord[] }>();
  /** State: chunks with changed columns or water, as full copies. */
  readonly edited = new Map<number, ChunkColumns>();
  /** State: which columns of an edited chunk differ from the generated land. */
  readonly editedColumns = new Map<number, Set<number>>();
  /** State: edited chunks whose water differs from the generated water. */
  readonly waterMoved = new Set<number>();
  /** State: prop changes per chunk, by prop index. */
  readonly propChanges = new Map<number, Map<number, PropChange>>();
  /** State: props added to a chunk (dropped seeds), indexed after the generated ones. */
  readonly addedProps = new Map<number, PropRecord[]>();
  /** State: explored fog tiles per chunk, one picture for every player (the players share their vision). */
  readonly explored = new Map<number, Uint8Array>();
  /** State: columns where water may still move. */
  readonly waterActive = new Set<number>();
  /** Not state: chunks whose columns, water or props changed since the client last asked, for redrawing. */
  readonly dirty = new Set<number>();
  /** Not state: chunks whose explored tiles changed. */
  readonly fogDirty = new Set<number>();
  /** Not state: bumped whenever a tile is newly explored, so the dark edge knows when to look again. */
  exploredVersion = 0;
  /** Not state: the dark edge as last worked out, and the explored version it was worked out at. */
  private edge: { version: number; tiles: number[] } | null = null;
  /** Not state: a counter per chunk, bumped whenever its land, water or buildings change, so walk maps know to rebuild. */
  readonly navVersions = new Map<number, number>();
  /** Whether a building stands on a column (set by the simulation); seeds never land there. */
  builtOn: ((x: number, z: number) => boolean) | null = null;
  /** Not state: bumped with every walk-map version, so a cache can tell nothing changed at all with one compare. */
  navEpoch = 0;
  /**
   * Not state: per chunk, the column behind each of its recent walk-map
   * versions (-1 for the whole chunk), from the version after `base` on, so a
   * cache a few versions behind can redo only what those columns touch
   * (navChangesSince).
   */
  private readonly navLog = new Map<number, { base: number; cols: number[] }>();
  /** Not state: the generated chunk asked for last. */
  private lastKey = Number.NaN;
  private last: { columns: ChunkColumns; props: PropRecord[] } | null = null;

  constructor(seed: number, players: number) {
    this.seed = seed >>> 0;
    this.layout = new WorldLayout(seed, players);
    this.players = this.layout.players;
    this.gen = new WorldGen(this.layout);
  }

  // ----- chunks and columns -----

  /** The generated chunk, from the cache or freshly made. */
  generated(cx: number, cz: number): { columns: ChunkColumns; props: PropRecord[] } {
    const key = chunkKey(cx, cz);
    // The chunk asked for last is the most recently used already: no need to move it up again
    // (water flow asks for a column's chunk several times per column).
    if (key === this.lastKey && this.last) return this.last;
    let g = this.cache.get(key);
    if (g) {
      this.cache.delete(key);
      this.cache.set(key, g);
    } else {
      g = this.gen.generateChunk(cx, cz);
      this.cache.set(key, g);
      if (this.cache.size > CHUNK_CACHE_BUDGET) {
        const oldest = this.cache.keys().next().value!;
        this.cache.delete(oldest);
      }
    }
    this.lastKey = key;
    this.last = g;
    return g;
  }

  /** Whether a chunk is generated and cached already (for spreading generation over steps). */
  isCached(cx: number, cz: number): boolean {
    return this.cache.has(chunkKey(cx, cz)) || this.edited.has(chunkKey(cx, cz));
  }

  /** The chunk's columns as they stand now. */
  columns(cx: number, cz: number): ChunkColumns {
    return this.edited.get(chunkKey(cx, cz)) ?? this.generated(cx, cz).columns;
  }

  private editable(cx: number, cz: number): ChunkColumns {
    const key = chunkKey(cx, cz);
    let c = this.edited.get(key);
    if (!c) {
      c = this.generated(cx, cz).columns.clone();
      this.edited.set(key, c);
      this.editedColumns.set(key, new Set());
    }
    return c;
  }

  /** Chunk and index of a global column. */
  private locate(x: number, z: number): { cx: number; cz: number; i: number } {
    const cx = x >> CHUNK_SHIFT;
    const cz = z >> CHUNK_SHIFT;
    return { cx, cz, i: (z - cz * N) * N + (x - cx * N) };
  }

  /** Top of the highest layer of a global column, terrain units. */
  topAt(x: number, z: number): number {
    const l = this.locate(x, z);
    return this.columns(l.cx, l.cz).top(l.i);
  }

  /** Water surface of a global column in 32nds of a terrain unit, or NO_WATER. */
  waterAt(x: number, z: number): number {
    const l = this.locate(x, z);
    return this.columns(l.cx, l.cz).water[l.i]!;
  }

  /** The layers of a global column, as (bottom, top, material) triples. */
  columnAt(x: number, z: number): number[] {
    const l = this.locate(x, z);
    return this.columns(l.cx, l.cz).column(l.i);
  }

  /**
   * The height in world units a unit at (x, z) stands on: the top of the
   * layer whose surface is nearest its current height and has room above it.
   */
  groundY(x: number, z: number, currentY: number): number {
    const cxl = floorDiv(x, WU_PER_COLUMN);
    const czl = floorDiv(z, WU_PER_COLUMN);
    const l = this.locate(cxl, czl);
    const c = this.columns(l.cx, l.cz);
    const s = c.start[l.i]! * 3;
    const n = c.count[l.i]!;
    let best = c.layers[s + (n - 1) * 3 + 1]! * WU_PER_TERRAIN_UNIT;
    let bestD = Math.abs(best - currentY);
    for (let k = 0; k < n - 1; k++) {
      const top = c.layers[s + k * 3 + 1]!;
      const nextBottom = c.layers[s + (k + 1) * 3]!;
      if (nextBottom - top < 16) continue; // no headroom for a person (1.8 m)
      const y = top * WU_PER_TERRAIN_UNIT;
      const d = Math.abs(y - currentY);
      if (d < bestD) {
        best = y;
        bestD = d;
      }
    }
    return best;
  }

  /** The natural ground of a column: the top of its generated land. */
  naturalTop(x: number, z: number): number {
    const l = this.locate(x, z);
    return this.generated(l.cx, l.cz).columns.top(l.i);
  }

  /** Restores a chunk's saved changes onto its generated land (snapshots and saves). */
  restoreChunk(cx: number, cz: number, columns: ReadonlyMap<number, readonly number[]>, water: Int16Array | null): void {
    const key = chunkKey(cx, cz);
    const c = this.editable(cx, cz);
    const set = this.editedColumns.get(key)!;
    for (const [i, triples] of columns) {
      c.setColumn(i, triples);
      set.add(i);
    }
    if (water) {
      c.water.set(water);
      this.waterMoved.add(key);
    }
  }

  // ----- terrain edits -----

  /**
   * Sets the solid range [bottom, top) of every column in the box to a
   * material, or carves it to air when material is Air. Carving never goes
   * below the dig limit. Returns the number of columns changed.
   */
  editBox(x0: number, z0: number, x1: number, z1: number, bottom: number, top: number, material: number): number {
    let changed = 0;
    const xa = Math.min(x0, x1);
    const xb = Math.max(x0, x1);
    const za = Math.min(z0, z1);
    const zb = Math.max(z0, z1);
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) {
        let lo = bottom;
        if (material === Mat.Air) lo = Math.max(lo, digFloor(this.naturalTop(x, z)));
        if (top <= lo) continue;
        if (this.editColumn(x, z, lo, top, material)) changed++;
      }
    }
    return changed;
  }

  private editColumn(x: number, z: number, lo: number, hi: number, material: number): boolean {
    const l = this.locate(x, z);
    const before = this.columns(l.cx, l.cz).column(l.i);
    const out: number[] = [];
    for (let k = 0; k < before.length; k += 3) {
      const y0 = before[k]!;
      const y1 = before[k + 1]!;
      const m = before[k + 2]!;
      if (y1 <= lo || y0 >= hi) out.push(y0, y1, m);
      else {
        if (y0 < lo) out.push(y0, lo, m);
        if (y1 > hi) out.push(hi, y1, m);
      }
    }
    if (material !== Mat.Air) {
      // Insert the new solid range in order.
      let at = 0;
      while (at < out.length && out[at]! < lo) at += 3;
      out.splice(at, 0, lo, hi, material);
    }
    // Merge touching layers of the same material.
    const merged: number[] = [];
    for (let k = 0; k < out.length; k += 3) {
      const n = merged.length;
      if (n > 0 && merged[n - 1] === out[k + 2] && merged[n - 2] === out[k]) merged[n - 2] = out[k + 1]!;
      else merged.push(out[k]!, out[k + 1]!, out[k + 2]!);
    }
    if (merged.length === 0) return false; // never remove a column's last layer
    if (merged.length === before.length && merged.every((v, k) => v === before[k])) return false;
    const c = this.editable(l.cx, l.cz);
    c.setColumn(l.i, merged);
    const key = chunkKey(l.cx, l.cz);
    this.editedColumns.get(key)!.add(l.i);
    // Water on the column keeps its depth on the new top, so an edit never
    // makes or loses water; water next to changed land may then move.
    const oldTop = before[before.length - 2]!;
    const top = merged[merged.length - 2]!;
    const wl = c.water[l.i]!;
    if (wl !== NO_WATER && top !== oldTop) {
      c.water[l.i] = wl > oldTop * WATER_PER_UNIT ? wl + (top - oldTop) * WATER_PER_UNIT : NO_WATER;
      this.waterMoved.add(key);
    }
    for (const [dx, dz] of AROUND) this.waterActive.add(colKey(x + dx, z + dz));
    this.dirty.add(key);
    this.touchNav(key, l.i);
    // Scenery and props on a dug or built column go.
    this.removePropsOn(l.cx, l.cz, l.i);
    return true;
  }

  /** Clears every prop on the columns of a rectangle (inclusive, global columns): a building goes up there. */
  clearProps(x0: number, z0: number, x1: number, z1: number): void {
    for (let cz = z0 >> CHUNK_SHIFT; cz <= z1 >> CHUNK_SHIFT; cz++) {
      for (let cx = x0 >> CHUNK_SHIFT; cx <= x1 >> CHUNK_SHIFT; cx++) {
        const list = this.propRecords(cx, cz);
        const changes = this.propChanges.get(chunkKey(cx, cz));
        for (let k = 0; k < list.length; k++) {
          const p = list[k]!;
          const gx = cx * N + p.lx;
          const gz = cz * N + p.lz;
          if (gx < x0 || gx > x1 || gz < z0 || gz > z1 || changes?.get(k)?.removed) continue;
          this.changeProp(cx, cz, k, { amount: 0, cutAt: -1, removed: true });
        }
      }
    }
  }

  /** Pulls up one prop for good (a builder clearing a sapling off a building spot). */
  removeProp(cx: number, cz: number, index: number): void {
    this.changeProp(cx, cz, index, { amount: 0, cutAt: -1, removed: true });
  }

  private removePropsOn(cx: number, cz: number, i: number): void {
    const lx = i % N;
    const lz = floorDiv(i, N);
    const list = this.propRecords(cx, cz);
    for (let k = 0; k < list.length; k++) {
      const p = list[k]!;
      if (p.lx === lx && p.lz === lz) this.changeProp(cx, cz, k, { amount: 0, cutAt: -1, removed: true });
    }
  }

  // ----- water -----

  private setWater(x: number, z: number, w: number): void {
    const l = this.locate(x, z);
    const c = this.editable(l.cx, l.cz);
    const was = c.water[l.i]!;
    if (was === w) return;
    c.water[l.i] = w;
    const key = chunkKey(l.cx, l.cz);
    this.waterMoved.add(key);
    this.dirty.add(key);
    // Only a change the walk map can see makes it out of date: flowing water
    // moves a 32nd at a time on many columns every step, and touching the walk
    // map for each threw away the walk maps, the coarse crossings and the
    // monsters' town fields round it over and over (the late-night lag,
    // Patch 5 BG-2).
    const top = c.top(l.i);
    if (waterFlag(top, was) !== waterFlag(top, w) || standLevel(top, was) !== standLevel(top, w)) this.touchNav(key, l.i);
  }

  /** Marks a chunk's walk map out of date (land, water or a building changed): at one column (a local index), or all of it (-1). */
  touchNav(key: number, col = -1): void {
    const v = (this.navVersions.get(key) ?? 0) + 1;
    this.navVersions.set(key, v);
    this.navEpoch++;
    let log = this.navLog.get(key);
    if (!log) {
      log = { base: v - 1, cols: [] };
      this.navLog.set(key, log);
    }
    log.cols.push(col);
    if (log.cols.length > NAV_LOG_MAX) {
      const drop = log.cols.length - (NAV_LOG_MAX >> 1);
      log.cols.splice(0, drop);
      log.base += drop;
    }
  }

  /**
   * The columns whose walk-map data changed in a chunk since a version of it,
   * as global x, z pairs (a column may come more than once); null when that
   * is not known: too many versions ago, or a change to the whole chunk (a
   * building's marks).
   */
  navChangesSince(key: number, version: number): number[] | null {
    const now = this.navVersion(key);
    if (version === now) return [];
    const log = this.navLog.get(key);
    if (!log || version < log.base || version > now) return null;
    const x0 = chunkKeyX(key) * N;
    const z0 = chunkKeyZ(key) * N;
    const out: number[] = [];
    for (let j = version - log.base; j < log.cols.length; j++) {
      const i = log.cols[j]!;
      if (i < 0) return null;
      out.push(x0 + (i % N), z0 + floorDiv(i, N));
    }
    return out;
  }

  /** The walk-map version of a chunk. */
  navVersion(key: number): number {
    return this.navVersions.get(key) ?? 0;
  }

  /**
   * One step of water flow near changed land (Water: it flows downhill,
   * fills low ground and settles; rivers and streams keep their level).
   * Integer volumes in 32nds of a terrain unit. Columns are worked in key
   * order and each one evens its level with each lower neighbour in turn,
   * moving half the difference at once, so volume is kept, nothing
   * overshoots and the water settles flat to within a 32nd.
   */
  flowWater(): void {
    if (this.waterActive.size === 0) return;
    const keys = [...this.waterActive].sort((a, b) => a - b);
    const work = keys.slice(0, WATER_BUDGET);
    for (const k of work) this.waterActive.delete(k);
    const wake = (x: number, z: number): void => {
      for (const [dx, dz] of AROUND) this.waterActive.add(colKey(x + dx, z + dz));
    };
    // The columns as they stand and the generated sources (rivers and
    // streams) of the chunk last looked in, as topAt and waterAt give them,
    // without a chunk lookup for every read: up to WATER_BUDGET columns a
    // step, each read several times. Looked up afresh after any change, which
    // may have made the chunk's own copy.
    let ck = Number.NaN;
    let cols: ChunkColumns | null = null;
    let src: Uint8Array | null = null;
    const at = (x: number, z: number): number => {
      const cx = x >> CHUNK_SHIFT;
      const cz = z >> CHUNK_SHIFT;
      const key = chunkKey(cx, cz);
      if (key !== ck) {
        const g = this.generated(cx, cz).columns;
        ck = key;
        cols = this.edited.get(key) ?? g;
        src = g.source;
      }
      return (z - cz * N) * N + (x - cx * N);
    };
    for (const k of work) {
      const x = colKeyX(k);
      const z = colKeyZ(k);
      let i = at(x, z);
      const ground = cols!.top(i) * WATER_PER_UNIT;
      const source = src![i] === 1;
      for (const [dx, dz] of SIDES) {
        i = at(x, z);
        const w = cols!.water[i]!;
        if (w === NO_WATER || w <= ground) break;
        const nx = x + dx;
        const nz = z + dz;
        const j = at(nx, nz);
        const nGround = cols!.top(j) * WATER_PER_UNIT;
        const nw = cols!.water[j]!;
        const nSource = src![j] === 1;
        const ln = nw === NO_WATER ? nGround : nw;
        const f = Math.min((w - ln) >> 1, w - ground);
        if (f <= 0) continue;
        // A river or stream keeps its level: its inflow replaces what flows out.
        if (!source) this.setWater(x, z, w - f > ground ? w - f : NO_WATER);
        if (!nSource) this.setWater(nx, nz, ln + f);
        ck = Number.NaN;
        wake(x, z);
        wake(nx, nz);
      }
    }
  }

  // ----- props -----

  /** The chunk's prop records: generated ones, then added ones. */
  propRecords(cx: number, cz: number): PropRecord[] {
    const gen = this.generated(cx, cz).props;
    const added = this.addedProps.get(chunkKey(cx, cz));
    return added ? gen.concat(added) : gen;
  }

  private changeProp(cx: number, cz: number, index: number, change: PropChange): void {
    const key = chunkKey(cx, cz);
    let m = this.propChanges.get(key);
    if (!m) {
      m = new Map();
      this.propChanges.set(key, m);
    }
    m.set(index, change);
    this.dirty.add(key);
  }

  /** The chunk's props as they stand at a step, with growth and regrowth applied. Felled ones are left out. */
  props(cx: number, cz: number, step: number): PropView[] {
    const records = this.propRecords(cx, cz);
    const changes = this.propChanges.get(chunkKey(cx, cz));
    const out: PropView[] = [];
    for (let i = 0; i < records.length; i++) {
      const v = this.viewOf(records[i]!, changes?.get(i), i, step);
      if (v) out.push(v);
    }
    return out;
  }

  /** One prop as it stands at a step, or undefined if it is gone. */
  prop(cx: number, cz: number, index: number, step: number): PropView | undefined {
    const r = this.propRecords(cx, cz)[index];
    return r ? this.viewOf(r, this.propChanges.get(chunkKey(cx, cz))?.get(index), index, step) : undefined;
  }

  private viewOf(r: PropRecord, ch: PropChange | undefined, i: number, step: number): PropView | undefined {
    if (ch?.removed) return undefined;
    // A mushroom come up again elsewhere (GP-30) is not there until its time: its record's age counts from then.
    if (r.age + step < 0 && spreads(r.kind)) return undefined;
    const info = propInfo(r.kind);
    // Added props store the step they were dropped as a negative age.
    const age = r.age + step;
    let amount = ch ? ch.amount : r.amount;
    let size = 1000;
    let stage: number = Stage.Grown;
    let next = -1;
    if (isFish(r.kind)) {
      amount = fishAt(info.regrowSteps, r.amount, amount, ch ? ch.cutAt : -1, step);
    } else if (growthStages(r.kind)) {
      // Trees grow from the seed; bushes and plants grow back from the stump once picked bare (cutAt).
      const tree = isTree(r.kind);
      const regrowing = !tree && ch !== undefined && ch.cutAt >= 0;
      if (tree || regrowing) {
        const g = growth(r.kind, tree ? age : step - ch!.cutAt);
        stage = g.stage;
        size = g.size;
        next = g.next;
        // It holds its stage's share of its yield, less what was taken from it since it was picked bare (an amount of 0 while regrowing: nothing taken yet).
        const taken = ch && (tree || ch.amount > 0) ? r.amount - ch.amount : 0;
        amount = Math.max(0, floorDiv(r.amount * g.yieldPm, 1000) - taken);
      }
    }
    return { index: i, kind: r.kind, lx: r.lx, lz: r.lz, y: r.y, variant: r.variant, age, amount, most: r.amount, stage, size, next };
  }

  /**
   * Takes up to `amount` from a prop (gathering arrives in M2; tests and the
   * debug tools use this). Felling a tree, grown or young, removes it and
   * drops its seeds around it; a hazel bush or a plant picked bare grows back
   * from the stump in steps (props.ts growth stages).
   * Returns what was taken.
   */
  harvest(cx: number, cz: number, index: number, amount: number, step: number): number {
    const records = this.propRecords(cx, cz);
    const r = records[index];
    if (!r) return 0;
    const view = this.prop(cx, cz, index, step);
    if (!view || view.amount <= 0) return 0;
    const taken = Math.min(amount, view.amount);
    const left = view.amount - taken;
    const info = propInfo(r.kind);
    // A fish stretch is never used up: what is left breeds again from now (Fish).
    if (isFish(r.kind)) {
      this.changeProp(cx, cz, index, { amount: left, cutAt: step, removed: false });
      return taken;
    }
    if (left > 0) {
      // Stored as what it would hold when grown, less what has been taken (PropChange), so a plant part-taken
      // while still growing grows on; a bush growing back keeps growing from when it was picked bare.
      const ch = this.propChanges.get(chunkKey(cx, cz))?.get(index);
      const untaken = ch && !(ch.amount === 0 && ch.cutAt >= 0) ? ch.amount : r.amount;
      const since = isTree(r.kind) ? -1 : (ch?.cutAt ?? -1);
      this.changeProp(cx, cz, index, { amount: untaken - taken, cutAt: since, removed: false });
      return taken;
    }
    if (isTree(r.kind)) {
      this.changeProp(cx, cz, index, { amount: 0, cutAt: step, removed: true });
      this.dropSeeds(cx, cz, r, info.seeds, step);
    } else if (spreads(r.kind)) {
      this.spread(cx, cz, index, r, step);
    } else if (info.regrowSteps > 0) {
      this.changeProp(cx, cz, index, { amount: 0, cutAt: step, removed: false });
    } else {
      this.changeProp(cx, cz, index, { amount: 0, cutAt: step, removed: true });
      // A coal rock's stone, a silver or gold node's, stays where it stood (Jade's Patch 5, WL-4 and WL-7).
      const left = info.leaves;
      if (left) this.addProp(cx * N + r.lx, cz * N + r.lz, left.kind, hash2(r.variant, 0x6c656674, 0), left.min + ((r.variant >>> 7) % (left.max - left.min + 1)), step);
    }
    return taken;
  }

  /** Puts a new prop on a column (a carcass where an animal fell, a fish stretch): its record joins the chunk's added props. */
  addProp(gx: number, gz: number, kind: number, variant: number, amount: number, step: number): { cx: number; cz: number; i: number } {
    const cx = gx >> CHUNK_SHIFT;
    const cz = gz >> CHUNK_SHIFT;
    const lx = gx - cx * N;
    const lz = gz - cz * N;
    const c = this.columns(cx, cz);
    const key = chunkKey(cx, cz);
    const list = this.addedProps.get(key) ?? [];
    list.push({ kind, lx, lz, y: c.top(lz * N + lx), variant, age: -step, amount });
    this.addedProps.set(key, list);
    this.dirty.add(key);
    return { cx, cz, i: this.generated(cx, cz).props.length + list.length - 1 };
  }

  /**
   * A picked mushroom comes up again (Jade's GP-30, MUSHROOM_SPREAD): on a
   * column within its radius, chosen from the pick, in whatever chunk that
   * column lies, and only once its delay has passed. Its record moves there
   * when it can (an added one staying in its chunk, or one picked in that
   * chunk before and not yet come back), so mushrooms that wander do not
   * pile up records. Where no column in a few tries will do, it comes back
   * where it stood.
   */
  private spread(cx: number, cz: number, index: number, r: PropRecord, step: number): void {
    const s = MUSHROOM_SPREAD;
    const reach = floorDiv(s.radiusM * 20, 9);
    const gx = cx * N + r.lx;
    const gz = cz * N + r.lz;
    const h = hash2(r.variant, step, gx * 65536 + gz);
    const from = step + (s.minS + (h % (s.maxS - s.minS + 1))) * STEPS_PER_SECOND;
    let x = gx;
    let z = gz;
    for (let t = 1; t <= 8; t++) {
      const k = hash2(h, t, 0);
      const dx = (k % (2 * reach + 1)) - reach;
      const dz = ((k >>> 8) % (2 * reach + 1)) - reach;
      if ((dx === 0 && dz === 0) || dx * dx + dz * dz > reach * reach || !this.roomForMushroom(gx + dx, gz + dz, step)) continue;
      x = gx + dx;
      z = gz + dz;
      break;
    }
    const tcx = x >> CHUNK_SHIFT;
    const tcz = z >> CHUNK_SHIFT;
    const key = chunkKey(tcx, tcz);
    const first = this.generated(tcx, tcz).props.length;
    const list = this.addedProps.get(key) ?? [];
    const changes = this.propChanges.get(key);
    const same = tcx === cx && tcz === cz && index >= first;
    const j = same ? index - first : list.findIndex((p, k) => p.kind === r.kind && changes?.get(first + k)?.removed === true);
    if (!same) this.changeProp(cx, cz, index, { amount: 0, cutAt: step, removed: true });
    const lx = x - tcx * N;
    const lz = z - tcz * N;
    const rec: PropRecord = { kind: r.kind, lx, lz, y: this.columns(tcx, tcz).top(lz * N + lx), variant: hash2(h, x, z), age: -from, amount: PROPS[r.kind]!.yield };
    if (j < 0) {
      list.push(rec);
      this.addedProps.set(key, list);
    } else {
      list[j] = rec;
      this.changeProp(tcx, tcz, first + j, { amount: rec.amount, cutAt: -1, removed: false });
    }
    this.dirty.add(key);
  }

  /** Whether a mushroom may come up on a column (GP-30): dry, not built on, nothing else growing there, and not in the Barrens or Deadlands. */
  private roomForMushroom(x: number, z: number, step: number): boolean {
    const tcx = x >> CHUNK_SHIFT;
    const tcz = z >> CHUNK_SHIFT;
    const lx = x - tcx * N;
    const lz = z - tcz * N;
    if (this.columns(tcx, tcz).water[lz * N + lx] !== NO_WATER || this.builtOn?.(x, z)) return false;
    if (this.gen.columnBand(x, z) >= Band.Barrens) return false;
    return !this.props(tcx, tcz, step).some((p) => p.lx === lx && p.lz === lz);
  }

  /** Whether a tree (a seed or bigger) stands within SEED_SPACING_M of a column. */
  private treeNear(gx: number, gz: number, step: number): boolean {
    const r = floorDiv(SEED_SPACING_M * 20, 9);
    for (let cz = (gz - r) >> CHUNK_SHIFT; cz <= (gz + r) >> CHUNK_SHIFT; cz++) {
      for (let cx = (gx - r) >> CHUNK_SHIFT; cx <= (gx + r) >> CHUNK_SHIFT; cx++) {
        for (const v of this.props(cx, cz, step)) {
          if (!isTree(v.kind)) continue;
          const dx = cx * N + v.lx - gx;
          const dz = cz * N + v.lz - gz;
          if (dx * dx + dz * dz <= r * r) return true;
        }
      }
    }
    return false;
  }

  /** Felled trees drop seeds around them that grow into saplings (The world, Regrowth), never nearer another tree than SEED_SPACING_M. */
  private dropSeeds(cx: number, cz: number, tree: PropRecord, seeds: number, step: number): void {
    for (let s = 0; s < seeds; s++) {
      const h = hash2(tree.variant, step, s);
      const dx = ((h & 15) - 7) | 0;
      const dz = (((h >>> 4) & 15) - 7) | 0;
      // Keep at least 3 columns away from the stump.
      const gx = cx * N + tree.lx + (Math.abs(dx) < 3 ? (dx < 0 ? -3 : 3) : dx);
      const gz = cz * N + tree.lz + dz;
      const tcx = gx >> CHUNK_SHIFT;
      const tcz = gz >> CHUNK_SHIFT;
      const lx = gx - tcx * N;
      const lz = gz - tcz * N;
      const c = this.columns(tcx, tcz);
      const i = lz * N + lx;
      if (c.water[i] !== NO_WATER || this.builtOn?.(gx, gz) || this.treeNear(gx, gz, step)) continue;
      const key = chunkKey(tcx, tcz);
      const list = this.addedProps.get(key) ?? [];
      list.push({ kind: tree.kind, lx, lz, y: c.top(i), variant: hash2(h, gx, gz), age: -step, amount: PROPS[tree.kind]!.yield });
      this.addedProps.set(key, list);
      this.dirty.add(key);
    }
  }

  // ----- fog of war -----

  /** Marks the fog tiles within `radius` world units of (x, z) explored. */
  reveal(x: number, z: number, radius: number): void {
    this.revealRect(x, z, x, z, radius);
  }

  /**
   * Marks the fog tiles whose centre lies within `radius` world units of the
   * rectangle x0..x1, z0..z1 explored: a point for a unit, a footprint for a
   * building. Integer maths throughout, so the client can draw the same tiles.
   */
  revealRect(x0: number, z0: number, x1: number, z1: number, radius: number): void {
    const tileWu = WU_PER_COLUMN * FOG_TILE_COLUMNS;
    const tx0 = floorDiv(x0 - radius, tileWu);
    const tx1 = floorDiv(x1 + radius, tileWu);
    const tz0 = floorDiv(z0 - radius, tileWu);
    const tz1 = floorDiv(z1 + radius, tileWu);
    const r2 = radius * radius;
    let key = Number.NaN;
    let bits: Uint8Array | undefined;
    for (let tz = tz0; tz <= tz1; tz++) {
      const cz = floorDiv(tz, FOG_TILES_PER_CHUNK);
      const ccz = tz * tileWu + (tileWu >> 1);
      const dz = ccz < z0 ? z0 - ccz : ccz > z1 ? ccz - z1 : 0;
      for (let tx = tx0; tx <= tx1; tx++) {
        const ccx = tx * tileWu + (tileWu >> 1);
        const dx = ccx < x0 ? x0 - ccx : ccx > x1 ? ccx - x1 : 0;
        if (dx * dx + dz * dz > r2) continue;
        const cx = floorDiv(tx, FOG_TILES_PER_CHUNK);
        // One chunk lookup per run of tiles in the same chunk.
        const k = chunkKey(cx, cz);
        if (k !== key) {
          key = k;
          bits = this.explored.get(k);
          if (!bits) {
            bits = new Uint8Array(FOG_BYTES);
            this.explored.set(k, bits);
          }
        }
        const t = (tz - cz * FOG_TILES_PER_CHUNK) * FOG_TILES_PER_CHUNK + (tx - cx * FOG_TILES_PER_CHUNK);
        const b = 1 << (t & 7);
        if ((bits![t >> 3]! & b) === 0) {
          bits![t >> 3] = bits![t >> 3]! | b;
          this.fogDirty.add(k);
          this.exploredVersion++;
        }
      }
    }
  }

  /** Whether a fog tile (global tile coordinates) is explored. */
  isExplored(tx: number, tz: number): boolean {
    const cx = floorDiv(tx, FOG_TILES_PER_CHUNK);
    const cz = floorDiv(tz, FOG_TILES_PER_CHUNK);
    const bits = this.explored.get(chunkKey(cx, cz));
    if (!bits) return false;
    const t = (tz - cz * FOG_TILES_PER_CHUNK) * FOG_TILES_PER_CHUNK + (tx - cx * FOG_TILES_PER_CHUNK);
    return (bits[t >> 3]! & (1 << (t & 7))) !== 0;
  }

  /** Joins explored tiles into a chunk (loading a save, whose older form kept one picture per player). */
  addExplored(key: number, bits: Uint8Array): void {
    const have = this.explored.get(key);
    if (!have) this.explored.set(key, bits);
    else for (let i = 0; i < have.length; i++) have[i] = have[i]! | bits[i]!;
    this.exploredVersion++;
  }

  /**
   * The dark edge: explored tiles beside unexplored land, as flat [tx, tz]
   * pairs, by chunk key and then tile. Worked out again only when land has
   * been newly explored; it depends on the explored tiles alone, so it is the
   * same whenever it is asked for.
   */
  darkEdge(): readonly number[] {
    if (this.edge && this.edge.version === this.exploredVersion) return this.edge.tiles;
    const tiles: number[] = [];
    const keys = [...this.explored.keys()].sort((a, b) => a - b);
    for (const key of keys) {
      const bits = this.explored.get(key)!;
      const cx = chunkKeyX(key);
      const cz = chunkKeyZ(key);
      for (let t = 0; t < FOG_TILES_PER_CHUNK * FOG_TILES_PER_CHUNK; t++) {
        if ((bits[t >> 3]! & (1 << (t & 7))) === 0) continue;
        const tx = cx * FOG_TILES_PER_CHUNK + (t % FOG_TILES_PER_CHUNK);
        const tz = cz * FOG_TILES_PER_CHUNK + floorDiv(t, FOG_TILES_PER_CHUNK);
        if (this.isExplored(tx + 1, tz) && this.isExplored(tx - 1, tz) && this.isExplored(tx, tz + 1) && this.isExplored(tx, tz - 1)) continue;
        tiles.push(tx, tz);
      }
    }
    this.edge = { version: this.exploredVersion, tiles };
    return tiles;
  }
}
