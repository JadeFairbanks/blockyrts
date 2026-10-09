// The ground the players' buildings wear (Patch 5, the art set's terrain
// tiles "path: trodden ground round buildings" and "soil_tilled: farm
// fields", with "soil_tilled_wet, a shade darker, for watered or freshly
// seeded fields"). A map of marks a column a texel round the camera, which
// the land's shader (terrain-textures.ts) reads to draw those tiles on the
// tops of loose ground: a trodden path under each building and PATH_RING
// columns round it, and a Farm's field tilled, wet while bonemeal works it
// or freshly sown.
import * as THREE from 'three';
import { buildingSpec, BuildingKind, footprintRect, solidRect } from '@blockyrts/sim';
import type { BuildingInfo } from '../messages.ts';
import { COLUMN_M } from './mesher.ts';

/** What a column's top wears: nothing, a trodden path, a tilled field, a wet tilled field. */
export const Mark = { None: 0, Path: 1, Tilled: 2, TilledWet: 3 } as const;
/** The map's side, columns (230 m), centred on the camera's focus in steps of RECENTRE columns. */
export const MARK_COLUMNS = 512;
const RECENTRE = 64;
/** The path round a building, columns (s: 0.9 m). */
export const PATH_RING = 2;
/** A field is freshly sown for the first part of each harvest, per mille of its bar (s). */
const FRESH_PER_MILLE = 150;

type Marked = Pick<BuildingInfo, 'id' | 'owner' | 'kind' | 'variant' | 'level' | 'upgrading' | 'x' | 'z' | 'farm' | 'boost'>;

/** Whether a Farm's field shows wet: bonemeal at work in it, or sown again after a harvest. */
export function fieldWet(b: Pick<BuildingInfo, 'farm' | 'boost'>): boolean {
  return (b.boost?.left ?? 0) > 0 || (b.farm !== null && b.farm.grows && b.farm.done < FRESH_PER_MILLE);
}

/**
 * The marks of the players' buildings over the map whose corner is column
 * (x0, z0), `size` columns a side, row by row. A path never covers a field,
 * and walls leave the ground as it is.
 */
export function groundMarks(buildings: Iterable<Marked>, x0: number, z0: number, size: number): Uint8Array {
  const out = new Uint8Array(size * size);
  const fill = (ax: number, az: number, bx: number, bz: number, mark: number, over: boolean): void => {
    for (let z = Math.max(az, z0); z <= Math.min(bz, z0 + size - 1); z++) {
      for (let x = Math.max(ax, x0); x <= Math.min(bx, x0 + size - 1); x++) {
        const k = (z - z0) * size + (x - x0);
        if (over || out[k] === Mark.None) out[k] = mark;
      }
    }
  };
  const fields: Marked[] = [];
  for (const b of buildings) {
    if (b.owner >= 8 || buildingSpec(b.kind).defence === 'wall') continue;
    const [ax, az, bx, bz] = footprintRect(b);
    fill(ax - PATH_RING, az - PATH_RING, bx + PATH_RING, bz + PATH_RING, Mark.Path, false);
    if (b.kind === BuildingKind.Farm) fields.push(b);
  }
  // The fields last, over any path, the farmhouse's own columns trodden.
  for (const b of fields) {
    const [ax, az, bx, bz] = footprintRect(b);
    fill(ax, az, bx, bz, fieldWet(b) ? Mark.TilledWet : Mark.Tilled, true);
    const [sx, sz, ex, ez] = solidRect(b);
    fill(sx, sz, ex, ez, Mark.Path, true);
  }
  return out;
}

export interface MarkUniforms {
  terrainMarks: { value: THREE.DataTexture };
  /** The map's corner, global columns (x, z). */
  terrainMarkOrigin: { value: THREE.Vector2 };
}

export function markUniforms(): MarkUniforms {
  const t = new THREE.DataTexture(new Uint8Array(MARK_COLUMNS * MARK_COLUMNS), MARK_COLUMNS, MARK_COLUMNS, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return { terrainMarks: { value: t }, terrainMarkOrigin: { value: new THREE.Vector2(-1e9, -1e9) } };
}

/** Keeps the map in line with the buildings and the camera: redrawn when either has changed. */
export class GroundMarks {
  private sig = '';

  constructor(readonly uniforms: MarkUniforms) {}

  update(buildings: ReadonlyMap<number, BuildingInfo>, focus: THREE.Vector3): void {
    const half = MARK_COLUMNS / 2;
    const x0 = Math.round(focus.x / COLUMN_M / RECENTRE) * RECENTRE - half;
    const z0 = Math.round(focus.z / COLUMN_M / RECENTRE) * RECENTRE - half;
    let h = 0;
    for (const b of buildings.values()) {
      if (b.owner >= 8) continue;
      h = (Math.imul(h, 31) + b.id * 7 + b.kind * 13 + b.level * 17 + Math.max(b.level, b.upgrading) * 19 + b.variant + b.x * 3 + b.z * 5 + (b.kind === BuildingKind.Farm && fieldWet(b) ? 1 : 0)) | 0;
    }
    const sig = `${x0},${z0},${buildings.size},${h}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const t = this.uniforms.terrainMarks.value;
    (t.image.data as Uint8Array).set(groundMarks(buildings.values(), x0, z0, MARK_COLUMNS));
    t.needsUpdate = true;
    this.uniforms.terrainMarkOrigin.value.set(x0, z0);
  }
}
