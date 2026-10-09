// The ground drawn under the Big House matches what it stands on (Jade,
// after Patch 5: "Make it match what it's on. If even one part of the big
// house is touching a bit of grass, draw it as being on grass."). The sim
// worker reads the land under it (grassUnder) and sends that with the
// building; ground-marks.ts draws it in place of a trodden path. Kept apart
// from ground-marks.ts so the worker does not load three.
import { BuildingKind, CHUNK_SHIFT, COLUMNS_PER_CHUNK as N, Mat } from '@blockyrts/sim';

/** The players' buildings whose ground matches what they stand on, with no trodden path under or round them: the Big House. */
export const MATCHES_GROUND: ReadonlySet<number> = new Set([BuildingKind.MainBase]);

/** The land as grassUnder reads it: a chunk's columns, by chunk (sim World.columns). */
export interface LandTops {
  columns(cx: number, cz: number): { topMaterial(i: number): number };
}

/**
 * The grass a footprint (global columns, inclusive: x0, z0, x1, z1) touches:
 * Mat.Grass if the top of any of its columns is grass, else Mat.DryGrass if
 * any is dry grass, else 0.
 */
export function grassUnder(land: LandTops, [x0, z0, x1, z1]: readonly [number, number, number, number]): number {
  let dry = false;
  for (let z = z0; z <= z1; z++) {
    const cz = z >> CHUNK_SHIFT;
    for (let x = x0; x <= x1; x++) {
      const cx = x >> CHUNK_SHIFT;
      const m = land.columns(cx, cz).topMaterial((z - cz * N) * N + (x - cx * N));
      if (m === Mat.Grass) return Mat.Grass;
      if (m === Mat.DryGrass) dry = true;
    }
  }
  return dry ? Mat.DryGrass : 0;
}
