// Light and torches (Table 18) and claimed land (Table 8): which lights
// burn, refuelling from the pool near a main base, the land the players
// claim (5 m round a lit torch, 10 m round a building, and regions closed
// off by barriers that hold a building) and the outlying light count at dusk.

import { floorDiv, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { Walk, WALKER } from '../nav/grid.ts';
import { TILE_COLUMNS } from '../nav/path.ts';
import type { SimState } from '../state.ts';
import { AUTO_REFUEL_M, BUILDING_CLAIM_M, BuildingKind, buildingSpec, footprintDims, OUTLYING_M } from './data.ts';
import { footprintRect, type Building, type Placed } from './store.ts';

/** A region bigger than this many coarse tiles (about 13,000 m2) is open land, not an enclosure. */
export const ENCLOSURE_MAX_TILES = 4096;
const ENCLOSURE_MAX_COLUMNS = ENCLOSURE_MAX_TILES * TILE_COLUMNS * TILE_COLUMNS;
/** Auto-refuel tops a light up when it has less than this left. */
const REFUEL_MARGIN_STEPS = 20 * 20;

export function isLit(b: Building, step: number): boolean {
  return b.complete && buildingSpec(b.kind).light !== undefined && b.fuelUntil > step;
}

/** The middle of a building's footprint, wu. */
export function buildingCentre(b: Placed): [number, number] {
  const s = footprintDims(b.kind, b.variant ?? 0);
  return [(b.x * 2 + s.w) * (WU_PER_COLUMN >> 1), (b.z * 2 + s.d) * (WU_PER_COLUMN >> 1)];
}

/** Squared distance between two points in wu, as a float-free integer (fits in a double up to about 9e15). */
export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Whether a light is within `m` metres of a complete main base of its owner. */
export function nearMainBase(state: SimState, b: Building, m: number): boolean {
  const [x, z] = buildingCentre(b);
  const r = m * WU_PER_METRE;
  for (const o of state.buildings.list) {
    if (o.owner !== b.owner || o.kind !== BuildingKind.MainBase || !o.complete) continue;
    const [ox, oz] = buildingCentre(o);
    if (dist2(x, z, ox, oz) <= r * r) return true;
  }
  return false;
}

/** Lights burn down; those near a main base are topped up from the pool, and one that goes out says so once. */
export function updateLights(state: SimState): void {
  for (const b of state.buildings.list) {
    const light = buildingSpec(b.kind).light;
    if (!light || !b.complete) continue;
    const left = b.fuelUntil - state.step;
    if (left < REFUEL_MARGIN_STEPS && nearMainBase(state, b, AUTO_REFUEL_M)) {
      const pool = state.players[b.owner]!.pool;
      if (pool[light.fuel]! > 0) {
        pool[light.fuel] = pool[light.fuel]! - 1;
        b.fuelUntil = Math.max(b.fuelUntil, state.step) + light.fuelSteps;
        b.alerted &= ~2;
        continue;
      }
    }
    if (left === 0 && (b.alerted & 2) === 0) {
      b.alerted |= 2;
      const [x, z] = buildingCentre(b);
      state.events.push({ player: b.owner, kind: 'alert', text: `A ${buildingSpec(b.kind).name.toLowerCase()} has burnt out. Send a worker to refuel it.`, x, z });
    }
  }
}

/** Claimed land as circles (lit torches, 5 m) and rectangles grown by 10 m (buildings), wu. */
export interface ClaimShapes {
  circles: Array<[number, number, number]>;
  rects: Array<[number, number, number, number]>;
}

export function claimShapes(state: SimState, player: number): ClaimShapes {
  const out: ClaimShapes = { circles: [], rects: [] };
  const grow = BUILDING_CLAIM_M * WU_PER_METRE;
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    const light = buildingSpec(b.kind).light;
    if (light) {
      // No light other than torches claims land (Table 8, Jade).
      if (light.claimM > 0 && isLit(b, state.step)) {
        const [x, z] = buildingCentre(b);
        out.circles.push([x, z, light.claimM * WU_PER_METRE]);
      }
      continue;
    }
    const [x0, z0, x1, z1] = footprintRect(b);
    out.rects.push([x0 * WU_PER_COLUMN - grow, z0 * WU_PER_COLUMN - grow, (x1 + 1) * WU_PER_COLUMN + grow, (z1 + 1) * WU_PER_COLUMN + grow]);
  }
  return out;
}

/** Whether a point (wu) is on a player's claimed land. */
export function isClaimed(state: SimState, player: number, x: number, z: number): boolean {
  const s = claimShapes(state, player);
  for (const [cx, cz, r] of s.circles) if (dist2(x, z, cx, cz) <= r * r) return true;
  for (const [x0, z0, x1, z1] of s.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true;
  const tile = floorDiv(x, WU_PER_COLUMN * TILE_COLUMNS);
  const tz = floorDiv(z, WU_PER_COLUMN * TILE_COLUMNS);
  return binaryHas(state.enclosed, enclosedKey(player, tile, tz));
}

/** Enclosed tiles are kept as one sorted list of keys: player, then tile z, then tile x. */
export function enclosedKey(player: number, tx: number, tz: number): number {
  return (player * 0x10000 + (tz + 0x8000)) * 0x10000 + (tx + 0x8000);
}

export function enclosedKeyParts(k: number): [number, number, number] {
  const tx = (k % 0x10000) - 0x8000;
  const rest = floorDiv(k, 0x10000);
  return [floorDiv(rest, 0x10000), (rest % 0x10000) - 0x8000, tx];
}

function binaryHas(list: readonly number[], k: number): boolean {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!;
    if (v === k) return true;
    if (v < k) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

const DIRS4: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function colKey(x: number, z: number): number {
  return (z + 0x40000) * 0x80000 + (x + 0x40000);
}

/**
 * Finds the regions closed off by barriers (cliffs, water too deep to wade,
 * walls and shut gates) that hold a player building: a flood over the 45 cm
 * columns from the ground in front of each building, going backwards along
 * every step a walker that cannot swim could take into the region. A flood
 * that runs past ENCLOSURE_MAX_TILES worth of columns, or into land already
 * found open, is open land. The coarse tiles a closed region touches are its
 * claimed land. Run at dusk and whenever a building is finished or destroyed.
 */
export function computeEnclosed(state: SimState): void {
  const keys: number[] = [];
  const open = new Set<number>();
  /** Closed columns to their region, and each region's tiles (x, z pairs). */
  const shut = new Map<number, number>();
  const regions: number[][] = [];
  const nav = state.nav;
  for (const b of state.buildings.list) {
    const s = buildingSpec(b.kind);
    if (!b.complete || s.light || s.defence) continue;
    const d = footprintDims(b.kind, b.variant);
    // The column in front of the building: just south of its footprint's middle.
    const sx = b.x + (d.w >> 1);
    let sz = b.z + d.d;
    if (nav.flags(sx, sz) & Walk.Blocked) sz++;
    const k0 = colKey(sx, sz);
    if (open.has(k0)) continue;
    const region = shut.get(k0);
    if (region !== undefined) {
      // Another building in a region already closed off: its owner claims it too.
      const tiles = regions[region]!;
      for (let q = 0; q < tiles.length; q += 2) keys.push(enclosedKey(b.owner, tiles[q]!, tiles[q + 1]!));
      continue;
    }
    const seen = new Set<number>([k0]);
    const queue: number[] = [sx, sz];
    let overflow = false;
    for (let q = 0; q < queue.length && !overflow; q += 2) {
      const x = queue[q]!;
      const z = queue[q + 1]!;
      for (const [dx, dz] of DIRS4) {
        const nx = x + dx;
        const nz = z + dz;
        const k = colKey(nx, nz);
        if (seen.has(k)) continue;
        if (open.has(k)) {
          overflow = true;
          break;
        }
        // Could a walker standing there step in here?
        if (nav.stepCost(nx, nz, x, z, WALKER) < 0) continue;
        seen.add(k);
        queue.push(nx, nz);
        if (seen.size > ENCLOSURE_MAX_COLUMNS) {
          overflow = true;
          break;
        }
      }
    }
    if (overflow) {
      for (const k of seen) open.add(k);
      continue;
    }
    const tileSet = new Set<number>();
    const tiles: number[] = [];
    for (let q = 0; q < queue.length; q += 2) {
      shut.set(colKey(queue[q]!, queue[q + 1]!), regions.length);
      const tx = floorDiv(queue[q]!, TILE_COLUMNS);
      const tz = floorDiv(queue[q + 1]!, TILE_COLUMNS);
      const tk = colKey(tx, tz);
      if (tileSet.has(tk)) continue;
      tileSet.add(tk);
      tiles.push(tx, tz);
      keys.push(enclosedKey(b.owner, tx, tz));
    }
    regions.push(tiles);
  }
  state.enclosed = [...new Set(keys)].sort((a, c) => a - c);
}

/**
 * Lights more than 40 m from any of the player's main bases, counted in
 * halves (wall torches count half), and the limit for the coming night:
 * 4 + night / 5 (Table 8). Over the limit, goblins come at dusk (M5).
 */
export function outlyingLights(state: SimState, player: number, night: number): { halves: number; limit: number } {
  let halves = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    const light = buildingSpec(b.kind).light;
    if (!light || light.outlyingHalves === 0 || !isLit(b, state.step)) continue;
    if (!nearMainBase(state, b, OUTLYING_M)) halves += light.outlyingHalves;
  }
  return { halves, limit: 4 + floorDiv(night, 5) };
}
