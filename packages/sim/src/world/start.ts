// The start basin and each player's pocket (The world: Start basin, Each
// player's pocket; Table 9: Start pocket contents). Pocket places are pure
// functions of the seed and the player count.

import { cos16, floorDiv, length2d, sin16 } from '../fixed.ts';
import { metresToColumns, type WorldLayout } from './layout.ts';
import { hash2 } from './noise.ts';

export interface Pocket {
  player: number;
  /** Centre in columns: where the Big House stands. */
  x: number;
  z: number;
  /** 16-bit angle pointing away from the basin's middle; the pocket's resources lie that way. */
  outward: number;
  /** Table 9 water: a stream stretch of at least 60 m2 or a pond of 40 m2, within 60 m. */
  water: PocketWater;
  /** Table 9 iron: a bog with 40 bog iron (80% of pockets) or an iron rock of 60 (20%). */
  bog: boolean;
}

export interface PocketWater {
  kind: 'stream' | 'pond';
  /** Centre (pond) or the middle of the stretch (stream), columns. */
  x: number;
  z: number;
  /** Pond radius or the stream's half width, columns. */
  radius: number;
  /** Stream: half the stretch's length and its direction (16-bit angle). */
  halfLength: number;
  angle: number;
}

/** A flat site kept for a Halfling village (Table 9; the villages themselves arrive with the neutral peoples). */
export interface VillageSite {
  x: number;
  z: number;
  radius: number;
}

/** Flat radius of a pocket and the width of its blend back into the land (Table 9: about 60 m across). */
export const POCKET_FLAT_COLUMNS = metresToColumns(30);
export const POCKET_BLEND_COLUMNS = metresToColumns(25);
/** Table 9: pockets at least 80 m apart. */
export const POCKET_SPACING_COLUMNS = metresToColumns(80);

/** A point at `dist` columns and 16-bit angle `a` from (x, z). */
export function polar(x: number, z: number, a: number, dist: number): { x: number; z: number } {
  return { x: x + floorDiv(dist * cos16(a), 65536), z: z + floorDiv(dist * sin16(a), 65536) };
}

export class StartBasin {
  readonly pockets: Pocket[] = [];
  readonly villages: VillageSite[] = [];

  constructor(layout: WorldLayout) {
    const seed = layout.seed;
    const n = layout.players;
    const h = (k: number): number => hash2(seed, 0x706f636b, k);
    const rot = h(0) & 0xffff;
    // Basin middle: the mean of the basin sites.
    let mx = 0;
    let mz = 0;
    const basin = layout.basinIds().map((id) => layout.site(id));
    for (const s of basin) {
      mx += s.x;
      mz += s.z;
    }
    mx = floorDiv(mx, basin.length);
    mz = floorDiv(mz, basin.length);
    // Pockets round a circle whose chord between neighbours is the 80 m spacing: r = 80 / (2 sin(pi / n)).
    const chord = POCKET_SPACING_COLUMNS + metresToColumns(4);
    const radius = n === 1 ? 0 : floorDiv(chord * 65536, 2 * Math.max(1, sin16(floorDiv(32768, n))));
    for (let p = 0; p < n; p++) {
      const a = (rot + floorDiv(p * 65536, n)) & 0xffff;
      const c = polar(mx, mz, a, radius);
      const outward = n === 1 ? rot : a;
      const hp = h(10 + p);
      // Water at 35 to 50 m, iron at 40 to 55 m, on their own bearings away from the stand.
      const wa = (outward + 24000 + ((hp & 0xfff) - 2048)) & 0xffff;
      const wd = metresToColumns(35 + ((hp >>> 12) % 16));
      const wc = polar(c.x, c.z, wa, wd);
      const stream = ((hp >>> 20) & 1) === 0;
      const water: PocketWater = stream
        ? { kind: 'stream', x: wc.x, z: wc.z, radius: metresToColumns(1) + 1, halfLength: metresToColumns(18), angle: (wa + 16384) & 0xffff }
        : { kind: 'pond', x: wc.x, z: wc.z, radius: metresToColumns(4), halfLength: 0, angle: 0 };
      this.pockets.push({ player: p, x: c.x, z: c.z, outward, water, bog: (hp >>> 21) % 10 < 8 });
    }
    // Table 9 (s): one Halfling village per basin cell, each in its own pocket at least 120 m from every player
    // pocket. The basin is too small to hold them beside the player pockets, so they sit in the first ring.
    const minDist = metresToColumns(120);
    const ring1 = layout.ringCellCount(1);
    for (let v = 0; v < layout.basinCells; v++) {
      for (let tries = 0; tries < ring1; tries++) {
        const k = (floorDiv(v * ring1, layout.basinCells) + tries + (h(100) % ring1)) % ring1;
        const s = layout.site(65536 + k);
        const far = this.pockets.every((pk) => length2d(pk.x - s.x, pk.z - s.z) >= minDist + POCKET_FLAT_COLUMNS);
        const apart = this.villages.every((vs) => length2d(vs.x - s.x, vs.z - s.z) >= minDist);
        if (far && apart) {
          this.villages.push({ x: s.x, z: s.z, radius: metresToColumns(25) });
          break;
        }
      }
    }
  }

  /**
   * How much a column is pulled flat towards sea level by a pocket or a
   * village site, 0 to 1024.
   */
  flatness(x: number, z: number): number {
    let best = 0;
    const far = POCKET_FLAT_COLUMNS + POCKET_BLEND_COLUMNS;
    for (const p of this.pockets) {
      if (Math.abs(x - p.x) >= far || Math.abs(z - p.z) >= far) continue;
      best = Math.max(best, falloff(length2d(x - p.x, z - p.z), POCKET_FLAT_COLUMNS, POCKET_BLEND_COLUMNS));
    }
    for (const v of this.villages) {
      const vfar = v.radius + POCKET_BLEND_COLUMNS;
      if (Math.abs(x - v.x) >= vfar || Math.abs(z - v.z) >= vfar) continue;
      best = Math.max(best, falloff(length2d(x - v.x, z - v.z), v.radius, POCKET_BLEND_COLUMNS));
    }
    return best;
  }
}

/** 1024 inside `inner`, falling smoothly to 0 over `blend` beyond it. */
export function falloff(d: number, inner: number, blend: number): number {
  if (d <= inner) return 1024;
  if (d >= inner + blend) return 0;
  const t = 1024 - floorDiv((d - inner) * 1024, blend);
  return (t * t * (3072 - 2 * t)) >> 20;
}
