// Chunk meshing on the drawing side (Terrain, What the land is made of:
// "only the faces of the land that touch air are drawn, and neighbouring
// columns of the same material and height are merged into one large face").
// Pure functions from columns to typed arrays, run in the mesh workers.
//
// Positions are metres relative to the chunk's corner. Colours are the
// material's colour; the terrain shader adds the pixel texture and the fog.

import { CHUNK_COLUMNS, COLUMNS_PER_CHUNK as N, MATERIALS, NO_WATER, WATER_PER_UNIT, type ChunkColumns, type LowResChunk } from '@blockyrts/sim';

/** A column stride in metres (45 cm). */
export const COLUMN_M = 0.45;
/** A terrain unit in metres (11.25 cm). */
export const UNIT_M = 0.1125;
export const CHUNK_M = N * COLUMN_M;

export interface MeshArrays {
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  indices: Uint32Array;
}

/** Collects quads; each is a corner and two edge vectors, wound to face its normal. */
export class QuadBuffer {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  quads = 0;

  add(x: number, y: number, z: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, nx: number, ny: number, nz: number, rgb: number): void {
    // (u x v) must point along n for counter-clockwise front faces.
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (cx * nx + cy * ny + cz * nz < 0) {
      let t = ux; ux = vx; vx = t;
      t = uy; uy = vy; vy = t;
      t = uz; uz = vz; vz = t;
    }
    this.pos.push(x, y, z, x + ux, y + uy, z + uz, x + ux + vx, y + uy + vy, z + uz + vz, x + vx, y + vy, z + vz);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    for (let k = 0; k < 4; k++) {
      this.nrm.push(nx * 127, ny * 127, nz * 127);
      this.col.push(r, g, b);
    }
    this.quads++;
  }

  finish(): MeshArrays {
    const indices = new Uint32Array(this.quads * 6);
    for (let q = 0; q < this.quads; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    return { positions: new Float32Array(this.pos), normals: new Int8Array(this.nrm), colors: new Uint8Array(this.col), indices };
  }
}

const colourOf = (mat: number): number => MATERIALS[mat]?.colour ?? 0xff00ff;

/**
 * Below all land, terrain units: the generator's lowest ground is a few
 * hundred units under sea level and digging stops 27 under that. The void
 * under the world showed in ravines (Patch 5 BG-4) wherever a side stopped
 * short of the land next to it: a column's layers end at its own bottom
 * (36 units under its ground or sea level), which a ravine floor or a dug
 * pit beside it can lie below, and far chunks' skirts hung only 24 units
 * while the land drops up to 25 m across a chunk's edge. So the lowest
 * layer's sides reach down to whatever the neighbour shows, and skirts reach
 * here.
 */
const FLOOR = -1024;

/**
 * The lowest top a neighbouring chunk can draw along its edge next to a
 * border column, at any detail: its own edge column, or a far chunk's
 * sample up to two columns in, within the 4-column cell holding it.
 */
function lowestAlong(nb: ChunkColumns, alongX: boolean, sign: 1 | -1, b: number): number {
  const b0 = b & ~3;
  let low = Infinity;
  for (let d = 0; d < 4; d++) {
    const across = sign > 0 ? d : N - 1 - d;
    for (let t = b0; t < b0 + 4; t++) low = Math.min(low, nb.top(alongX ? t * N + across : across * N + t));
  }
  return low;
}

/** The chunk and its four neighbours (-x, +x, -z, +z); a missing neighbour hides that border's faces. */
export interface ChunkNeighbourhood {
  centre: ChunkColumns;
  west: ChunkColumns | null;
  east: ChunkColumns | null;
  north: ChunkColumns | null;
  south: ChunkColumns | null;
}

/** The parts of [a0, a1) not covered by the neighbour's solid layers (nor below its lowest layer). */
function exposed(a0: number, a1: number, nb: ChunkColumns | null, ni: number, out: number[]): void {
  out.length = 0;
  if (!nb) return;
  const s = nb.start[ni]! * 3;
  const n = nb.count[ni]!;
  let lo = Math.max(a0, nb.layers[s]!); // below the neighbour's lowest layer counts as solid
  for (let k = 0; k < n && lo < a1; k++) {
    const b0 = nb.layers[s + k * 3]!;
    const b1 = nb.layers[s + k * 3 + 1]!;
    if (b1 <= lo) continue;
    if (b0 >= a1) break;
    if (b0 > lo) out.push(lo, b0);
    lo = Math.max(lo, b1);
  }
  if (lo < a1) out.push(lo, a1);
}

/** The full-detail mesh of a chunk's land. */
export function meshChunk(h: ChunkNeighbourhood): MeshArrays {
  const c = h.centre;
  const q = new QuadBuffer();
  const L = c.layers;

  // Surface tops, merged into rectangles of the same height and material.
  const key = new Int32Array(CHUNK_COLUMNS);
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    const p = (c.start[i]! + c.count[i]! - 1) * 3;
    key[i] = (L[p + 1]! + 32768) * 256 + L[p + 2]!;
  }
  const done = new Uint8Array(CHUNK_COLUMNS);
  for (let lz = 0; lz < N; lz++) {
    for (let lx = 0; lx < N; lx++) {
      const i = lz * N + lx;
      if (done[i]) continue;
      const k = key[i]!;
      let w = 1;
      while (lx + w < N && !done[i + w] && key[i + w] === k) w++;
      let d = 1;
      grow: while (lz + d < N) {
        const row = (lz + d) * N + lx;
        for (let t = 0; t < w; t++) if (done[row + t] || key[row + t] !== k) break grow;
        d++;
      }
      for (let r = 0; r < d; r++) done.fill(1, (lz + r) * N + lx, (lz + r) * N + lx + w);
      const top = Math.floor(k / 256) - 32768;
      q.add(lx * COLUMN_M, top * UNIT_M, lz * COLUMN_M, w * COLUMN_M, 0, 0, 0, 0, d * COLUMN_M, 0, 1, 0, colourOf(k & 255));
    }
  }

  // Tops of lower layers (under overhangs, in caves) and undersides of upper layers.
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    const n = c.count[i]!;
    if (n < 2) continue;
    const lx = i % N;
    const lz = (i - lx) / N;
    const s = c.start[i]! * 3;
    for (let k = 0; k < n; k++) {
      const y0 = L[s + k * 3]!;
      const y1 = L[s + k * 3 + 1]!;
      const m = L[s + k * 3 + 2]!;
      // Only where air touches: layers often sit right on one another.
      if (k < n - 1 && L[s + (k + 1) * 3]! > y1) q.add(lx * COLUMN_M, y1 * UNIT_M, lz * COLUMN_M, COLUMN_M, 0, 0, 0, 0, COLUMN_M, 0, 1, 0, colourOf(m));
      if (k > 0 && L[s + (k - 1) * 3 + 1]! < y0) q.add(lx * COLUMN_M, y0 * UNIT_M, lz * COLUMN_M, COLUMN_M, 0, 0, 0, 0, COLUMN_M, 0, -1, 0, colourOf(m));
    }
  }

  // Sides, merged along each line of columns where the exposed piece is the same.
  const pieces: number[] = [];
  const open = new Map<number, number>();
  const seen = new Set<number>();
  const sides = (alongX: boolean, sign: 1 | -1): void => {
    // alongX: faces point along +-x; lines run along z at each x.
    for (let a = 0; a < N; a++) {
      open.clear();
      const emit = (k: number, from: number, to: number): void => {
        const mat = k % 64;
        const rest = (k - mat) / 64;
        const y1 = (rest % 32768) - 16384;
        const y0 = Math.floor(rest / 32768) - 16384;
        const plane = (sign > 0 ? a + 1 : a) * COLUMN_M;
        if (alongX) q.add(plane, y0 * UNIT_M, from * COLUMN_M, 0, 0, (to - from) * COLUMN_M, 0, (y1 - y0) * UNIT_M, 0, sign, 0, 0, colourOf(mat));
        else q.add(from * COLUMN_M, y0 * UNIT_M, plane, (to - from) * COLUMN_M, 0, 0, 0, (y1 - y0) * UNIT_M, 0, 0, 0, sign, colourOf(mat));
      };
      for (let b = 0; b <= N; b++) {
        seen.clear();
        if (b < N) {
          const lx = alongX ? a : b;
          const lz = alongX ? b : a;
          const i = lz * N + lx;
          // The neighbour column, possibly in the next chunk.
          let nb: ChunkColumns | null = c;
          let nx = lx + (alongX ? sign : 0);
          let nz = lz + (alongX ? 0 : sign);
          if (nx < 0) { nb = h.west; nx += N; }
          else if (nx >= N) { nb = h.east; nx -= N; }
          else if (nz < 0) { nb = h.north; nz += N; }
          else if (nz >= N) { nb = h.south; nz -= N; }
          const ni = nz * N + nx;
          const s = c.start[i]! * 3;
          // At the chunk's edge the neighbour may be drawn at less detail, lower
          // than its real columns, so the sides are drawn down to the lowest it
          // can show there; inside the neighbour's land they are never seen.
          const low = nb && nb !== c ? lowestAlong(nb, alongX, sign, b) : Infinity;
          for (let k = 0; k < c.count[i]!; k++) {
            const m = L[s + k * 3 + 2]!;
            const y0 = k === 0 ? FLOOR : L[s + k * 3]!;
            const y1 = L[s + k * 3 + 1]!;
            exposed(y0, Math.min(y1, low), nb, ni, pieces);
            const from = Math.max(y0, low);
            if (from < y1) {
              if (pieces.length > 0 && pieces[pieces.length - 1] === from) pieces[pieces.length - 1] = y1;
              else pieces.push(from, y1);
            }
            for (let p = 0; p < pieces.length; p += 2) {
              const key = ((pieces[p]! + 16384) * 32768 + (pieces[p + 1]! + 16384)) * 64 + m;
              seen.add(key);
              if (!open.has(key)) open.set(key, b);
            }
          }
        }
        for (const [k, from] of open) {
          if (!seen.has(k)) {
            emit(k, from, b);
            open.delete(k);
          }
        }
      }
    }
  };
  sides(true, 1);
  sides(true, -1);
  sides(false, 1);
  sides(false, -1);
  return q.finish();
}

/** Water surfaces (merged by level) and the edges where water meets lower dry land. */
export function meshWater(h: ChunkNeighbourhood): MeshArrays | null {
  const c = h.centre;
  const q = new QuadBuffer();
  const level = new Int32Array(CHUNK_COLUMNS).fill(NO_WATER);
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    const w = c.water[i]!;
    if (w !== NO_WATER && w > c.top(i) * WATER_PER_UNIT) level[i] = w;
  }
  const done = new Uint8Array(CHUNK_COLUMNS);
  const colour = 0x3b6fa8;
  for (let lz = 0; lz < N; lz++) {
    for (let lx = 0; lx < N; lx++) {
      const i = lz * N + lx;
      const k = level[i]!;
      if (done[i] || k === NO_WATER) continue;
      let w = 1;
      while (lx + w < N && !done[i + w] && level[i + w] === k) w++;
      let d = 1;
      grow: while (lz + d < N) {
        const row = (lz + d) * N + lx;
        for (let t = 0; t < w; t++) if (done[row + t] || level[row + t] !== k) break grow;
        d++;
      }
      for (let r = 0; r < d; r++) done.fill(1, (lz + r) * N + lx, (lz + r) * N + lx + w);
      q.add(lx * COLUMN_M, (k / WATER_PER_UNIT) * UNIT_M, lz * COLUMN_M, w * COLUMN_M, 0, 0, 0, 0, d * COLUMN_M, 0, 1, 0, colour);
    }
  }
  // Edges: water standing above a dry neighbour's top shows its side.
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    const w = level[i]!;
    if (w === NO_WATER) continue;
    const lx = i % N;
    const lz = (i - lx) / N;
    const own = c.top(i) * WATER_PER_UNIT;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      let nb: ChunkColumns | null = c;
      let nx = lx + dx;
      let nz = lz + dz;
      if (nx < 0) { nb = h.west; nx += N; }
      else if (nx >= N) { nb = h.east; nx -= N; }
      else if (nz < 0) { nb = h.north; nz += N; }
      else if (nz >= N) { nb = h.south; nz -= N; }
      if (!nb) continue;
      const ni = nz * N + nx;
      if (nb.water[ni] !== NO_WATER) continue;
      const bottom = Math.max(own, nb.top(ni) * WATER_PER_UNIT);
      if (bottom >= w) continue;
      const y0 = (bottom / WATER_PER_UNIT) * UNIT_M;
      const y1 = (w / WATER_PER_UNIT) * UNIT_M;
      const px = (dx > 0 ? lx + 1 : lx) * COLUMN_M;
      const pz = (dz > 0 ? lz + 1 : lz) * COLUMN_M;
      if (dx !== 0) q.add(px, y0, lz * COLUMN_M, 0, 0, COLUMN_M, 0, y1 - y0, 0, dx, 0, 0, colour);
      else q.add(lx * COLUMN_M, y0, pz, COLUMN_M, 0, 0, 0, y1 - y0, 0, 0, 0, dz, colour);
    }
  }
  return q.quads > 0 ? q.finish() : null;
}

/** A far chunk at less detail: one cuboid top per sample, sides between them, and skirts at the border. */
export function meshLowRes(lr: LowResChunk): { land: MeshArrays; water: MeshArrays | null } {
  const q = new QuadBuffer();
  const wq = new QuadBuffer();
  const { size, step } = lr;
  const cell = step * COLUMN_M;
  const key = new Int32Array(size * size);
  for (let k = 0; k < size * size; k++) key[k] = (lr.top[k]! + 32768) * 256 + lr.material[k]!;
  const done = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k0 = j * size + i;
      if (done[k0]) continue;
      const k = key[k0]!;
      let w = 1;
      while (i + w < size && !done[k0 + w] && key[k0 + w] === k) w++;
      let d = 1;
      grow: while (j + d < size) {
        const row = (j + d) * size + i;
        for (let t = 0; t < w; t++) if (done[row + t] || key[row + t] !== k) break grow;
        d++;
      }
      for (let r = 0; r < d; r++) done.fill(1, (j + r) * size + i, (j + r) * size + i + w);
      q.add(i * cell, (Math.floor(k / 256) - 32768) * UNIT_M, j * cell, w * cell, 0, 0, 0, 0, d * cell, 0, 1, 0, colourOf(k & 255));
    }
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const top = lr.top[k]!;
      const colour = colourOf(lr.material[k] === 1 || lr.material[k] === 2 ? 3 : lr.material[k]!);
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        const inside = ni >= 0 && nj >= 0 && ni < size && nj < size;
        const low = inside ? lr.top[nj * size + ni]! : FLOOR;
        if (low >= top) continue;
        const y0 = low * UNIT_M;
        const y1 = top * UNIT_M;
        if (di !== 0) q.add((di > 0 ? i + 1 : i) * cell, y0, j * cell, 0, 0, cell, 0, y1 - y0, 0, di, 0, 0, colour);
        else q.add(i * cell, y0, (dj > 0 ? j + 1 : j) * cell, cell, 0, 0, 0, y1 - y0, 0, 0, 0, dj, colour);
      }
      const w = lr.water[k]!;
      if (w !== NO_WATER && w > top * WATER_PER_UNIT) wq.add(i * cell, (w / WATER_PER_UNIT) * UNIT_M, j * cell, cell, 0, 0, 0, 0, cell, 0, 1, 0, 0x3b6fa8);
    }
  }
  return { land: q.finish(), water: wq.quads > 0 ? wq.finish() : null };
}
