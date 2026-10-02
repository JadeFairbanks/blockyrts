// A chunk of 64 x 64 columns (technical decision 5): per column a run of solid
// layers (bottom, top, material) in a flat pool, a water surface and a flag for
// water that has a fixed inflow (rivers and streams).

import { COLUMNS_PER_CHUNK, floorDiv } from '../fixed.ts';

export const CHUNK_COLUMNS = COLUMNS_PER_CHUNK * COLUMNS_PER_CHUNK;
export const CHUNK_SHIFT = 6;
/** No water on this column. */
export const NO_WATER = -32768;
/** Water levels are kept in 32nds of a terrain unit (0.35 cm) so thin layers can spread and settle nearly flat; Int16 then covers +-1,000 terrain units (+-115 m), well beyond the land's range. */
export const WATER_PER_UNIT = 32;

/** Packs chunk coordinates (each within +-2^20) into one integer key. */
export function chunkKey(cx: number, cz: number): number {
  return (cx + 0x100000) * 0x200000 + (cz + 0x100000);
}
export function chunkKeyX(key: number): number {
  return floorDiv(key, 0x200000) - 0x100000;
}
export function chunkKeyZ(key: number): number {
  return (key % 0x200000) - 0x100000;
}

/** Index of a column inside its chunk, x fastest. */
export function columnIndex(lx: number, lz: number): number {
  return lz * COLUMNS_PER_CHUNK + lx;
}

export class ChunkColumns {
  readonly cx: number;
  readonly cz: number;
  /** First layer of each column, counted in layers. */
  start: Uint32Array;
  count: Uint8Array;
  /** Triples: bottom, top, material. Heights are terrain units relative to sea level. */
  layers: Int16Array;
  /** Water surface in 32nds of a terrain unit, or NO_WATER. Water sits on the column's top layer. */
  water: Int16Array;
  /** 1 where the water is a river or stream with a fixed inflow, which keeps its level. */
  source: Uint8Array;

  constructor(cx: number, cz: number, layers: Int16Array, start: Uint32Array, count: Uint8Array, water: Int16Array, source: Uint8Array) {
    this.cx = cx;
    this.cz = cz;
    this.layers = layers;
    this.start = start;
    this.count = count;
    this.water = water;
    this.source = source;
  }

  /** Top of the column's highest layer, in terrain units. */
  top(i: number): number {
    return this.layers[(this.start[i]! + this.count[i]! - 1) * 3 + 1]!;
  }

  /** Material of the column's highest layer. */
  topMaterial(i: number): number {
    return this.layers[(this.start[i]! + this.count[i]! - 1) * 3 + 2]!;
  }

  /** A copy of one column's layers as triples. */
  column(i: number): number[] {
    const s = this.start[i]! * 3;
    return Array.from(this.layers.subarray(s, s + this.count[i]! * 3));
  }

  /** Replaces one column's layers (triples, bottom to top, non-overlapping, at least one). Rebuilds the pool. */
  setColumn(i: number, triples: readonly number[]): void {
    const n = floorDiv(triples.length, 3);
    if (n < 1 || n > 255 || n * 3 !== triples.length) throw new Error('a column holds 1 to 255 layers');
    const old = this.count[i]!;
    const total = floorDiv(this.layers.length, 3) - old + n;
    const layers = new Int16Array(total * 3);
    const start = new Uint32Array(CHUNK_COLUMNS);
    let at = 0;
    for (let c = 0; c < CHUNK_COLUMNS; c++) {
      start[c] = at;
      if (c === i) {
        layers.set(triples, at * 3);
        at += n;
      } else {
        const s = this.start[c]! * 3;
        const len = this.count[c]! * 3;
        layers.set(this.layers.subarray(s, s + len), at * 3);
        at += this.count[c]!;
      }
    }
    this.count[i] = n;
    this.layers = layers;
    this.start = start;
  }

  clone(): ChunkColumns {
    return new ChunkColumns(this.cx, this.cz, this.layers.slice(), this.start.slice(), this.count.slice(), this.water.slice(), this.source.slice());
  }
}

/** Builds a chunk's layer pool one column at a time, in column order. */
export class ChunkBuilder {
  private layers: Int16Array;
  private n = 0;
  readonly start = new Uint32Array(CHUNK_COLUMNS);
  readonly count = new Uint8Array(CHUNK_COLUMNS);
  readonly water = new Int16Array(CHUNK_COLUMNS).fill(NO_WATER);
  readonly source = new Uint8Array(CHUNK_COLUMNS);
  private col = -1;

  constructor(expectedLayers = CHUNK_COLUMNS * 4) {
    this.layers = new Int16Array(expectedLayers * 3);
  }

  beginColumn(i: number): void {
    this.col = i;
    this.start[i] = this.n;
    this.count[i] = 0;
  }

  /** Adds a layer above the previous one; merges with it when the material matches and they touch. */
  layer(bottom: number, top: number, material: number): void {
    if (top <= bottom) return;
    const c = this.count[this.col]!;
    if (c > 0) {
      const p = (this.n - 1) * 3;
      if (this.layers[p + 2] === material && this.layers[p + 1] === bottom) {
        this.layers[p + 1] = top;
        return;
      }
    }
    if ((this.n + 1) * 3 > this.layers.length) {
      const next = new Int16Array(this.layers.length * 2);
      next.set(this.layers);
      this.layers = next;
    }
    const p = this.n * 3;
    this.layers[p] = bottom;
    this.layers[p + 1] = top;
    this.layers[p + 2] = material;
    this.n++;
    this.count[this.col] = c + 1;
  }

  finish(cx: number, cz: number): ChunkColumns {
    return new ChunkColumns(cx, cz, this.layers.slice(0, this.n * 3), this.start, this.count, this.water, this.source);
  }
}
