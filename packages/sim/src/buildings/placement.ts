// Building placement (Controls, Building placement): which tiles of a ghost
// are green. A tile is red when the land is too steep, under water, under
// another building, holds a resource node, or is unexplored. Units never
// block a tile: they step aside when the building goes up. Small things that
// are easy to remove (seeds, saplings, sprouting plants: the growth stages
// with buildOver in world/props.ts) never block one either: seeds are
// trampled, and the first builder pulls the rest up before building starts.

import { floorDiv } from '../fixed.ts';
import { Band } from '../world/layout.ts';
import { CHUNK_SHIFT, NO_WATER, WATER_PER_UNIT } from '../world/chunk.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import { isGod, type SimState } from '../state.ts';
import { BuildingKind, buildingSpec, levelSpec } from './data.ts';
import { footprintDims } from './footprints.ts';
import { Mat } from '../world/materials.ts';
import { canBuildOver, stageInfo } from '../world/props.ts';
import { RESEARCH } from '../combat/items.ts';
import type { Cost } from '../economy/resources.ts';
import { canAffordAny } from '../economy/food-kinds.ts';
import { footprintRect, type Building } from './store.ts';

/** Why a tile is red; 0 is green. */
export const Blocked = {
  None: 0,
  Steep: 1,
  Water: 2,
  Building: 3,
  Node: 4,
  Unexplored: 5,
  /** Retired with the wall torch (Patch 2); the number stays so the others keep theirs. */
  NoWall: 6,
  /** A mineshaft stands on bare rock. */
  NotStone: 7,
  /** A fishing dock stands at the water's edge. */
  NoShore: 8,
  /** A farm is never built on stone (Jade, after Patch 5): rock, marble, ore or volcanic rock at the top of a column. */
  Stone: 9,
} as const;
export type Blocked = (typeof Blocked)[keyof typeof Blocked];

export const BLOCKED_TEXT = ['', 'The ground is too steep.', 'It cannot be built on water.', 'Another building is in the way.', 'A resource is in the way.', 'That land is unexplored.', '', 'A mineshaft must stand on flat bare stone.', 'A fishing dock must stand at the water\'s edge.', 'A farm cannot be built on stone.'] as const;

/** How far a column may stand above or below the building's floor, in terrain units (about 45 cm). */
export const LEVEL_TOLERANCE_UNITS = 4;

/**
 * The tiles of a footprint with the corner at (x, z), row by row, each a
 * Blocked reason. The floor is the height of the footprint's middle column.
 */
export function placementTiles(state: SimState, player: number, kind: number, x: number, z: number, variant = 0): Uint8Array {
  const spec = footprintDims(kind, variant);
  const out = new Uint8Array(spec.w * spec.d);
  const floor = state.world.topAt(x + (spec.w >> 1), z + (spec.d >> 1));
  const [x0, z0, x1, z1] = footprintRect({ kind, x, z, variant });
  const props = propColumns(state, x0, z0, x1, z1);
  const farm = kind === BuildingKind.Farm;
  for (let dz = 0; dz < spec.d; dz++) {
    for (let dx = 0; dx < spec.w; dx++) {
      const r = tileBlocked(state, x + dx, z + dz, floor, props.has(dz * spec.w + dx));
      out[dz * spec.w + dx] = r === Blocked.None && farm && onRock(state, x + dx, z + dz) ? Blocked.Stone : r;
    }
  }
  return out;
}

/** The columns of a rectangle (inclusive) with a plant or resource node on them, as (z - z0) x width + (x - x0). */
function propColumns(state: SimState, x0: number, z0: number, x1: number, z1: number): Set<number> {
  const out = new Set<number>();
  const w = x1 - x0 + 1;
  for (let cz = z0 >> CHUNK_SHIFT; cz <= z1 >> CHUNK_SHIFT; cz++) {
    for (let cx = x0 >> CHUNK_SHIFT; cx <= x1 >> CHUNK_SHIFT; cx++) {
      for (const p of state.world.props(cx, cz, state.step)) {
        // Seeds are trampled and saplings cleared; anything grown blocks.
        if (canBuildOver(p.kind, p.stage)) continue;
        // Only props on the footprint: one beside it would otherwise land on a tile of the row before or after.
        const dx = (cx << CHUNK_SHIFT) + p.lx - x0;
        const dz = (cz << CHUNK_SHIFT) + p.lz - z0;
        if (dx < 0 || dz < 0 || dx > x1 - x0 || dz > z1 - z0) continue;
        out.add(dz * w + dx);
      }
    }
  }
  return out;
}

/** Why one column cannot be built on, for a building whose floor is at `floor` terrain units. */
function tileBlocked(state: SimState, x: number, z: number, floor: number, prop: boolean): Blocked {
  const world = state.world;
  const top = world.topAt(x, z);
  if (!world.isExplored(floorDiv(x, FOG_TILE_COLUMNS), floorDiv(z, FOG_TILE_COLUMNS))) return Blocked.Unexplored;
  if (state.buildings.footprintAt(x, z) !== 0) return Blocked.Building;
  if (hasWater(world.waterAt(x, z), top)) return Blocked.Water;
  if (top > floor + LEVEL_TOLERANCE_UNITS || top < floor - LEVEL_TOLERANCE_UNITS) return Blocked.Steep;
  if (prop) return Blocked.Node;
  return Blocked.None;
}

/**
 * Why an upgrade cannot take the land its bigger footprint needs (a main
 * base level that grows round its anchor), or None: the columns it adds are
 * checked as a new building's would be, against the building's own floor.
 */
export function growthBlocked(state: SimState, b: Building, level: number): Blocked {
  const [ox0, oz0, ox1, oz1] = footprintRect(b);
  const [x0, z0, x1, z1] = footprintRect({ kind: b.kind, x: b.x, z: b.z, variant: b.variant, level });
  if (x0 === ox0 && z0 === oz0 && x1 === ox1 && z1 === oz1) return Blocked.None;
  const props = propColumns(state, x0, z0, x1, z1);
  const w = x1 - x0 + 1;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= ox0 && x <= ox1 && z >= oz0 && z <= oz1) continue;
      const r = tileBlocked(state, x, z, b.y, props.has((z - z0) * w + (x - x0)));
      if (r !== Blocked.None) return r;
    }
  }
  return Blocked.None;
}

/**
 * The first small thing on a building's spot that a builder has to pull up
 * before building starts (a sapling or a sprouting plant), and how long that
 * takes; null when there is none. Seeds need no work: they are trampled.
 */
export function clearingOn(state: SimState, kind: number, x: number, z: number, variant = 0): { cx: number; cz: number; i: number; gx: number; gz: number; steps: number } | null {
  const [x0, z0, x1, z1] = footprintRect({ kind, x, z, variant });
  for (let cz = z0 >> CHUNK_SHIFT; cz <= z1 >> CHUNK_SHIFT; cz++) {
    for (let cx = x0 >> CHUNK_SHIFT; cx <= x1 >> CHUNK_SHIFT; cx++) {
      for (const p of state.world.props(cx, cz, state.step)) {
        const gx = (cx << CHUNK_SHIFT) + p.lx;
        const gz = (cz << CHUNK_SHIFT) + p.lz;
        if (gx < x0 || gx > x1 || gz < z0 || gz > z1) continue;
        const row = stageInfo(p.kind, p.stage);
        if (row && row.buildOver && row.clearSteps > 0) return { cx, cz, i: p.index, gx, gz, steps: row.clearSteps };
      }
    }
  }
  return null;
}

/** The first red tile's reason, or None when every tile is green. */
export function placementBlocked(state: SimState, player: number, kind: number, x: number, z: number, variant = 0): Blocked {
  for (const r of placementTiles(state, player, kind, x, z, variant)) if (r !== Blocked.None) return r as Blocked;
  if (kind === BuildingKind.Mineshaft && !onStone(state, x, z, variant)) return Blocked.NotStone;
  if (kind === BuildingKind.FishingDock && !waterBeside(state, { kind, x, z, variant })) return Blocked.NoShore;
  return Blocked.None;
}

/** Rock a mineshaft can be sunk through: stone, marble or an ore at the top of the column. */
const ROCK: ReadonlySet<number> = new Set([Mat.Stone, Mat.Marble, Mat.CopperOre, Mat.TinOre, Mat.IronRock, Mat.VeinIron, Mat.Coal]);

/** Whether a column's top is stone a farm cannot stand on: bare rock, marble, an ore or volcanic rock. */
function onRock(state: SimState, x: number, z: number): boolean {
  const layers = state.world.columnAt(x, z);
  const top = layers[layers.length - 1]!;
  return ROCK.has(top) || top === Mat.Basalt;
}

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


/** The highest tier of a complete main base the player has (0 for none). */
export function mainBaseLevel(state: SimState, player: number): number {
  let best = 0;
  for (const b of state.buildings.list) {
    if (b.owner === player && b.kind === BuildingKind.MainBase && b.complete && b.level > best) best = b.level;
  }
  return best;
}

/** Why a building (level 1) cannot be ordered at all, or '' if it can: not live yet, a missing research, or the main base tier. */
export function buildRequirement(state: SimState, player: number, kind: number): string {
  const spec = buildingSpec(kind);
  if (!spec.live) return spec.comesWith;
  const l = levelSpec(kind, 1);
  if (l.needs) return l.needs;
  // Godmode needs no main base tier or research first, and has no cap on research buildings (Jade's Patch 5).
  if (isGod(state, player)) return '';
  if (l.needsBase > mainBaseLevel(state, player)) return `Needs a tier ${l.needsBase} main base.`;
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

/** What placing a building costs a player: its level 1 cost, or its other way to pay (`alt`, Patch 5) when the stock covers only that. */
export function buildCost(state: SimState, player: number, kind: number): Cost {
  const m = costMultiplier(state, player, kind);
  const l = levelSpec(kind, 1);
  const pool = state.players[player]?.pool;
  const cost = l.alt && pool && !canAffordAny(pool, l.cost) && canAffordAny(pool, l.alt) ? l.alt : l.cost;
  return cost.map(([r, n]) => [r, n * m] as const);
}

/** The band of the land under a column: by its distance from the nearest main base (Jade's Patch 5, WL-8). */
export function bandAt(state: SimState, x: number, z: number): Band {
  return state.world.gen.columnBand(x, z);
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
