// Building placement (Controls, Building placement): which tiles of a ghost
// are green. A tile is red when the land is too steep, under water, under
// another building, holds a resource node, or is unexplored. Units never
// block a tile: they step aside when the building goes up.

import { floorDiv } from '../fixed.ts';
import { Band } from '../world/layout.ts';
import { CHUNK_SHIFT, NO_WATER, WATER_PER_UNIT } from '../world/chunk.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import type { SimState } from '../state.ts';
import { BuildingKind, buildingSpec, levelSpec } from './data.ts';
import { footprintRect } from './store.ts';

/** Why a tile is red; 0 is green. */
export const Blocked = {
  None: 0,
  Steep: 1,
  Water: 2,
  Building: 3,
  Node: 4,
  Unexplored: 5,
} as const;
export type Blocked = (typeof Blocked)[keyof typeof Blocked];

export const BLOCKED_TEXT = ['', 'The ground is too steep.', 'It cannot be built on water.', 'Another building is in the way.', 'A resource is in the way.', 'That land is unexplored.'] as const;

/** How far a column may stand above or below the building's floor, in terrain units (about 45 cm). */
export const LEVEL_TOLERANCE_UNITS = 4;

/**
 * The tiles of a footprint with the corner at (x, z), row by row, each a
 * Blocked reason. The floor is the height of the footprint's middle column.
 */
export function placementTiles(state: SimState, player: number, kind: number, x: number, z: number): Uint8Array {
  const spec = buildingSpec(kind);
  const world = state.world;
  const out = new Uint8Array(spec.w * spec.d);
  const floor = world.topAt(x + (spec.w >> 1), z + (spec.d >> 1));
  // Props per chunk, looked up once.
  const propCols = new Set<number>();
  const [x0, z0, x1, z1] = footprintRect({ kind, x, z });
  for (let cz = z0 >> CHUNK_SHIFT; cz <= z1 >> CHUNK_SHIFT; cz++) {
    for (let cx = x0 >> CHUNK_SHIFT; cx <= x1 >> CHUNK_SHIFT; cx++) {
      for (const p of world.props(cx, cz, state.step)) {
        // Seeds are trampled; saplings and anything grown block.
        if (p.stage === 0) continue;
        propCols.add(((cz << CHUNK_SHIFT) + p.lz - z0) * spec.w + ((cx << CHUNK_SHIFT) + p.lx - x0));
      }
    }
  }
  for (let dz = 0; dz < spec.d; dz++) {
    for (let dx = 0; dx < spec.w; dx++) {
      const gx = x + dx;
      const gz = z + dz;
      let r: Blocked = Blocked.None;
      const top = world.topAt(gx, gz);
      if (!world.isExplored(player, floorDiv(gx, FOG_TILE_COLUMNS), floorDiv(gz, FOG_TILE_COLUMNS))) r = Blocked.Unexplored;
      else if (state.buildings.footprintAt(gx, gz) !== 0) r = Blocked.Building;
      else if (hasWater(world.waterAt(gx, gz), top)) r = Blocked.Water;
      else if (top > floor + LEVEL_TOLERANCE_UNITS || top < floor - LEVEL_TOLERANCE_UNITS) r = Blocked.Steep;
      else if (propCols.has(dz * spec.w + dx)) r = Blocked.Node;
      out[dz * spec.w + dx] = r;
    }
  }
  return out;
}

/** The first red tile's reason, or None when every tile is green. */
export function placementBlocked(state: SimState, player: number, kind: number, x: number, z: number): Blocked {
  for (const r of placementTiles(state, player, kind, x, z)) if (r !== Blocked.None) return r as Blocked;
  return Blocked.None;
}

/** The highest level of a complete main base the player has (0 for none). */
export function mainBaseLevel(state: SimState, player: number): number {
  let best = 0;
  for (const b of state.buildings.list) {
    if (b.owner === player && b.kind === BuildingKind.MainBase && b.complete && b.level > best) best = b.level;
  }
  return best;
}

/** Why a building (level 1) cannot be ordered at all, or '' if it can: not live yet, a missing research, or the main base level. */
export function buildRequirement(state: SimState, player: number, kind: number): string {
  const spec = buildingSpec(kind);
  if (!spec.live) return spec.comesWith;
  const l = levelSpec(kind, 1);
  if (l.needs) return l.needs;
  if (l.needsBase > mainBaseLevel(state, player)) return `Needs a level ${l.needsBase} main base.`;
  return '';
}

/** The band of the land under a column. */
export function bandAt(state: SimState, x: number, z: number): Band {
  const layout = state.world.layout;
  return layout.cell(layout.nearest(x, z)).band;
}

function hasWater(w: number, top: number): boolean {
  return w !== NO_WATER && w > top * WATER_PER_UNIT;
}

/** Whether any column in the ring just outside a footprint holds water (a waterwheel needs a stream beside the mill). */
export function waterBeside(state: SimState, b: { kind: number; x: number; z: number }, reach = 2): boolean {
  const [x0, z0, x1, z1] = footprintRect(b);
  for (let z = z0 - reach; z <= z1 + reach; z++) {
    for (let x = x0 - reach; x <= x1 + reach; x++) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue;
      if (hasWater(state.world.waterAt(x, z), state.world.topAt(x, z))) return true;
    }
  }
  return false;
}
