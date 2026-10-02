// Building placement (Controls, Building placement): which tiles of a ghost
// are green. A tile is red when the land is too steep, under water, under
// another building, holds a resource node, or is unexplored. Units never
// block a tile: they step aside when the building goes up.

import { floorDiv } from '../fixed.ts';
import { Band } from '../world/layout.ts';
import { CHUNK_SHIFT, NO_WATER, WATER_PER_UNIT } from '../world/chunk.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import type { SimState } from '../state.ts';
import { BuildingKind, buildingSpec, footprintDims, levelSpec } from './data.ts';
import { Mat } from '../world/materials.ts';
import { RESEARCH } from '../combat/items.ts';
import type { Cost } from '../economy/resources.ts';
import { footprintRect } from './store.ts';

/** Why a tile is red; 0 is green. */
export const Blocked = {
  None: 0,
  Steep: 1,
  Water: 2,
  Building: 3,
  Node: 4,
  Unexplored: 5,
  NoWall: 6,
  /** A mineshaft stands on bare rock. */
  NotStone: 7,
  /** A fishing dock stands at the water's edge. */
  NoShore: 8,
} as const;
export type Blocked = (typeof Blocked)[keyof typeof Blocked];

export const BLOCKED_TEXT = ['', 'The ground is too steep.', 'It cannot be built on water.', 'Another building is in the way.', 'A resource is in the way.', 'That land is unexplored.', 'A wall torch must stand against a wall.', 'A mineshaft must stand on flat bare stone.', 'A fishing dock must stand at the water\'s edge.'] as const;

/** How far a column may stand above or below the building's floor, in terrain units (about 45 cm). */
export const LEVEL_TOLERANCE_UNITS = 4;

/**
 * The tiles of a footprint with the corner at (x, z), row by row, each a
 * Blocked reason. The floor is the height of the footprint's middle column.
 */
export function placementTiles(state: SimState, player: number, kind: number, x: number, z: number, variant = 0): Uint8Array {
  const spec = footprintDims(kind, variant);
  const world = state.world;
  const out = new Uint8Array(spec.w * spec.d);
  const floor = world.topAt(x + (spec.w >> 1), z + (spec.d >> 1));
  // Props per chunk, looked up once.
  const propCols = new Set<number>();
  const [x0, z0, x1, z1] = footprintRect({ kind, x, z, variant });
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
export function placementBlocked(state: SimState, player: number, kind: number, x: number, z: number, variant = 0): Blocked {
  for (const r of placementTiles(state, player, kind, x, z, variant)) if (r !== Blocked.None) return r as Blocked;
  if (kind === BuildingKind.WallTorch && !wallBeside(state, x, z)) return Blocked.NoWall;
  if (kind === BuildingKind.Mineshaft && !onStone(state, x, z, variant)) return Blocked.NotStone;
  if (kind === BuildingKind.FishingDock && !waterBeside(state, { kind, x, z, variant })) return Blocked.NoShore;
  return Blocked.None;
}

/** Rock a mineshaft can be sunk through: stone, marble or an ore at the top of the column. */
const ROCK: ReadonlySet<number> = new Set([Mat.Stone, Mat.Marble, Mat.CopperOre, Mat.TinOre, Mat.IronRock, Mat.VeinIron, Mat.Coal]);

/** Whether at least half of a footprint's columns are bare rock (Mineshafts: built on flat stone; the half is (s)). */
export function onStone(state: SimState, x: number, z: number, variant = 0): boolean {
  const spec = footprintDims(BuildingKind.Mineshaft, variant);
  let rock = 0;
  for (let dz = 0; dz < spec.d; dz++) {
    for (let dx = 0; dx < spec.w; dx++) {
      const layers = state.world.columnAt(x + dx, z + dz);
      if (ROCK.has(layers[layers.length - 1]!)) rock++;
    }
  }
  return rock * 2 >= spec.w * spec.d;
}

/** Whether a wall column stands right next to a column (a wall torch hangs on it). */
export function wallBeside(state: SimState, x: number, z: number): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const id = state.buildings.solidAt(x + dx, z + dz);
    const b = id ? state.buildings.get(id) : undefined;
    if (b && buildingSpec(b.kind).defence === 'wall') return true;
  }
  return false;
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
  if (l.research && (state.players[player]!.research & (1 << l.research)) === 0) return `Needs ${RESEARCH[l.research]!.name} researched first.`;
  if (kind === BuildingKind.ScholarsLodge && countOf(state, player, kind) >= RESEARCH_FACILITY_CAP) return `At most ${RESEARCH_FACILITY_CAP} research buildings.`;
  return '';
}

/** At most 10 research facilities (Research). */
export const RESEARCH_FACILITY_CAP = 10;

/** Buildings of a kind a player has, finished or not. */
export function countOf(state: SimState, player: number, kind: number): number {
  let n = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.kind === kind) n++;
  return n;
}

/** What a new building costs: its level 1 cost, times one more than the research facilities already standing for a Scholar's Lodge (Research: rising facility cost). */
export function costMultiplier(state: SimState, player: number, kind: number): number {
  return kind === BuildingKind.ScholarsLodge ? countOf(state, player, kind) + 1 : 1;
}

export function buildCost(state: SimState, player: number, kind: number): Cost {
  const m = costMultiplier(state, player, kind);
  return levelSpec(kind, 1).cost.map(([r, n]) => [r, n * m] as const);
}

/** The band of the land under a column. */
export function bandAt(state: SimState, x: number, z: number): Band {
  const layout = state.world.layout;
  return layout.cell(layout.nearest(x, z)).band;
}

function hasWater(w: number, top: number): boolean {
  return w !== NO_WATER && w > top * WATER_PER_UNIT;
}

/** Whether a column holds open water. */
export function hasWaterAt(state: SimState, x: number, z: number): boolean {
  return hasWater(state.world.waterAt(x, z), state.world.topAt(x, z));
}

/** Whether any column in the ring just outside a footprint holds water (a waterwheel needs a stream beside the mill). */
export function waterBeside(state: SimState, b: { kind: number; x: number; z: number; variant?: number }, reach = 2): boolean {
  const [x0, z0, x1, z1] = footprintRect(b);
  for (let z = z0 - reach; z <= z1 + reach; z++) {
    for (let x = x0 - reach; x <= x1 + reach; x++) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue;
      if (hasWater(state.world.waterAt(x, z), state.world.topAt(x, z))) return true;
    }
  }
  return false;
}
