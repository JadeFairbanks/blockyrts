// The ground drawn under a building matches what it stands on (Jade, after
// Patch 5): the Big House, and every building with walk space in its
// footprint, draw the ground under them in place of a trodden path. Grass
// comes first, if even one column of the footprint is grass; else the ground
// most of its columns have. A Barn stands on grass or else dirt, never
// stone, and a Farm always on dirt. The sim worker reads the land under each
// building (GroundCache) and sends it with the building; ground-marks.ts
// draws it. Kept apart from ground-marks.ts so the worker does not load
// three. Not state: nothing here reaches the sim or a save.
import { BuildingKind, buildingSpec, CHUNK_SHIFT, chunkKey, COLUMNS_PER_CHUNK as N, footprintRect, Mat, placedDims, type Placed } from '@blockyrts/sim';

/** Whether a building draws the ground it stands on: the Big House at every tier, and any other with walk space in its footprint (walls aside). */
export function drawsGround(b: Placed): boolean {
  if (b.kind === BuildingKind.MainBase) return true;
  if (buildingSpec(b.kind).defence === 'wall') return false;
  const d = placedDims(b);
  return d.cells.length < d.w * d.d;
}

/** The land as groundUnder reads it: a chunk's columns, by chunk (sim World.columns). */
export interface LandTops {
  columns(cx: number, cz: number): { topMaterial(i: number): number };
}

/**
 * The material a building's ground is drawn as: grass if the top of any
 * column of its footprint is grass (dry grass if that is all), else the
 * material most of its columns have (the lower material on a tie); a Barn
 * dirt when no grass, a Farm dirt always.
 */
export function groundUnder(land: LandTops, b: Placed): number {
  if (b.kind === BuildingKind.Farm) return Mat.Soil;
  const [x0, z0, x1, z1] = footprintRect(b);
  const count = new Uint16Array(256);
  for (let z = z0; z <= z1; z++) {
    const cz = z >> CHUNK_SHIFT;
    for (let x = x0; x <= x1; x++) {
      const cx = x >> CHUNK_SHIFT;
      count[land.columns(cx, cz).topMaterial((z - cz * N) * N + (x - cx * N))]!++;
    }
  }
  if (count[Mat.Grass]! > 0) return Mat.Grass;
  if (count[Mat.DryGrass]! > 0) return Mat.DryGrass;
  if (b.kind === BuildingKind.Barn) return Mat.Soil;
  let best = 0;
  for (let m = 1; m < count.length; m++) if (count[m]! > count[best]!) best = m;
  return best;
}

/** The land with its change counters (sim World): a chunk's counter goes up whenever its land changes. */
export interface Land extends LandTops {
  navEpoch: number;
  navVersion(key: number): number;
}

/** The ground under each building, by id, worked out again only when its footprint or the land under it changes. */
export class GroundCache {
  private readonly seen = new Map<number, { epoch: number; rect: string; versions: number; ground: number }>();

  /** The material a building's ground is drawn as, or undefined when it keeps its trodden path. */
  of(land: Land, b: Placed & { id: number }): number | undefined {
    if (!drawsGround(b)) return undefined;
    const r = footprintRect(b);
    const rect = r.join();
    const seen = this.seen.get(b.id);
    if (seen && seen.rect === rect && seen.epoch === land.navEpoch) return seen.ground;
    let versions = 0;
    for (let cz = r[1] >> CHUNK_SHIFT; cz <= r[3] >> CHUNK_SHIFT; cz++) {
      for (let cx = r[0] >> CHUNK_SHIFT; cx <= r[2] >> CHUNK_SHIFT; cx++) versions += land.navVersion(chunkKey(cx, cz));
    }
    if (seen && seen.rect === rect && seen.versions === versions) {
      seen.epoch = land.navEpoch;
      return seen.ground;
    }
    const ground = groundUnder(land, b);
    this.seen.set(b.id, { epoch: land.navEpoch, rect, versions, ground });
    return ground;
  }

  clear(): void {
    this.seen.clear();
  }
}
