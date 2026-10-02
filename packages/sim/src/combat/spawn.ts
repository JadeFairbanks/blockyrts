// Night spawning (Rising difficulty: the night budget; Table 8: claimed
// land, the dark edge, light and unit weights, first night, split and
// picking, first appearance; Threats). As night falls, each player's night
// is planned: its budget is spent on the mobs unlocked so far, and each mob
// is given a time by how it comes (a wave at once, packs, a trickle, or
// alone). A group's spawn point is chosen when its first member arrives: a
// spot on the dark edge, at least 50 m from claimed land and 30 m from any
// of the players' units, weighted away from lights and units. Lairs (the
// other 20%) come with milestone 5; with no live lair that fifth is not
// spawned, so only the edge's 80% comes for now.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, claimShapes, dist2, isLit } from '../buildings/lights.ts';
import { clockAt, Period } from '../clock.ts';
import { floorDiv, isqrt, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { NIGHT_STEPS } from '../rules.ts';
import { UnitKind, type PendingSpawn, type SimState } from '../state.ts';
import { chunkKeyX, chunkKeyZ } from '../world/chunk.ts';
import { FOG_TILE_COLUMNS, FOG_TILES_PER_CHUNK } from '../world/world.ts';
import { addMob, townCentre } from './mob-ai.ts';
import { Comes, Mob, MOBS, mobSpec } from './mobs.ts';

/** Spawns stand off at least this far from claimed land and from the players' units (Table 8). */
export const CLAIM_STANDOFF_M = 50;
export const UNIT_STANDOFF_M = 30;
/** Night 0's fixed pick (Table 8, First night). */
export const FIRST_NIGHT: ReadonlyArray<readonly [Mob, number]> = [
  [Mob.Zombie, 4],
  [Mob.CaveBat, 2],
  [Mob.GiantRat, 2],
  [Mob.GiantSpider, 1],
  [Mob.Slime, 1],
];
/** The dark edge's share of the night's budget, per mille: 80% (the lairs' 20% waits for live lairs). */
const EDGE_SHARE_PM = 800;
/** Packs are 3 to 6 strong (s). */
const PACK_MIN = 3;
const PACK_MAX = 6;
/** A group spreads round its spawn point by up to 2 m. */
const GROUP_SPREAD_WU = 2 * WU_PER_METRE;
const TILE_WU = WU_PER_COLUMN * FOG_TILE_COLUMNS;

/** The night's budget in tenths of threat: 12 + 3n + 0.04n^2 (Rising difficulty). */
export function nightBudgetTenths(night: number): number {
  return 120 + 30 * night + floorDiv(4 * night * night, 10);
}

/** The mobs that may come on a night, with their pick weights: 3 for those unlocked in the last 10 nights, else 1. */
function unlocked(night: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of MOBS) {
    if (m.comes === Comes.Never || m.firstNight > night) continue;
    out.push([m.id, m.firstNight > night - 10 ? 3 : 1]);
  }
  return out;
}

/** Picks the night's mobs for one player: Night 0's fixed list, else weighted picks until the edge's share is spent. */
export function pickNight(state: SimState, night: number): number[] {
  if (night === 0) {
    const out: number[] = [];
    for (const [m, n] of FIRST_NIGHT) for (let k = 0; k < n; k++) out.push(m);
    return out;
  }
  const rng = state.rng.spawns;
  const budget = floorDiv(nightBudgetTenths(night) * EDGE_SHARE_PM, 1000);
  const choices = unlocked(night);
  const count = new Map<number, number>();
  const out: number[] = [];
  let spent = 0;
  // The last pick may overrun the budget by one mob.
  for (let guard = 0; spent < budget && guard < 2000; guard++) {
    const open = choices.filter(([m]) => {
      const sp = mobSpec(m);
      // A mob's first night sends at most 3 of it; one that comes alone, 1 (Table 8, First appearance).
      if (sp.firstNight === night) return (count.get(m) ?? 0) < (sp.comes === Comes.Alone ? 1 : 3);
      return true;
    });
    if (open.length === 0) break;
    let total = 0;
    for (const [, w] of open) total += w;
    let r = rng.nextInt(total);
    let pick = open[0]![0];
    for (const [m, w] of open) {
      if (r < w) {
        pick = m;
        break;
      }
      r -= w;
    }
    out.push(pick);
    count.set(pick, (count.get(pick) ?? 0) + 1);
    spent += mobSpec(pick).threatTenths;
  }
  return out;
}

/**
 * Plans a player's night as night falls: each mob's arrival time and group.
 * Waves come in the first 10 s, packs through the first two thirds of the
 * night, the trickle through the first three quarters, and lone mobs in
 * the first half (s).
 */
export function planNight(state: SimState, player: number, night: number, start: number): PendingSpawn[] {
  const rng = state.rng.spawns;
  const mobs = pickNight(state, night);
  const out: PendingSpawn[] = [];
  let group = state.spawns.reduce((g, s) => Math.max(g, s.group), 0) + 1;
  const byKind = new Map<number, number[]>();
  for (const m of mobs) {
    const list = byKind.get(m) ?? [];
    list.push(m);
    byKind.set(m, list);
  }
  const kinds = [...byKind.keys()].sort((a, b) => a - b);
  for (const m of kinds) {
    const list = byKind.get(m)!;
    const comes = mobSpec(m).comes;
    if (comes === Comes.Wave) {
      // One wave of each kind, all from one spot.
      const at = start + rng.nextInt(10 * STEPS_PER_SECOND);
      const g = group++;
      for (const mob of list) out.push({ at: at + rng.nextInt(STEPS_PER_SECOND), mob, player, group: g, x: 0, z: 0, placed: 0 });
    } else if (comes === Comes.Pack) {
      let left = list.length;
      while (left > 0) {
        const n = Math.min(left, PACK_MIN + rng.nextInt(PACK_MAX - PACK_MIN + 1));
        const at = start + rng.nextInt(floorDiv(NIGHT_STEPS * 2, 3));
        const g = group++;
        for (let k = 0; k < n; k++) out.push({ at: at + k * 5, mob: m, player, group: g, x: 0, z: 0, placed: 0 });
        left -= n;
      }
    } else {
      const span = comes === Comes.Trickle ? floorDiv(NIGHT_STEPS * 3, 4) : floorDiv(NIGHT_STEPS, 2);
      for (const mob of list) out.push({ at: start + rng.nextInt(span), mob, player, group: group++, x: 0, z: 0, placed: 0 });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.group - b.group || a.mob - b.mob);
}

/** Squared distance, wu, from a point to a player's claimed land (0 inside it). */
function claimDistance2(shapes: ReturnType<typeof claimShapes>, x: number, z: number): number {
  let best = Infinity;
  for (const [cx, cz, r] of shapes.circles) {
    const d = isqrt(dist2(x, z, cx, cz));
    const out = Math.max(0, d - r);
    best = Math.min(best, out * out);
  }
  for (const [x0, z0, x1, z1] of shapes.rects) {
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return best;
}

interface Weights {
  lights: Array<[number, number, number]>;
  units: Array<[number, number]>;
  torches: Array<[number, number]>;
}

function weightsFor(state: SimState): Weights {
  const lights: Array<[number, number, number]> = [];
  for (const b of state.buildings.list) {
    const l = buildingSpec(b.kind).light;
    if (!l || !isLit(b, state.step)) continue;
    const [x, z] = buildingCentre(b);
    lights.push([x, z, l.lightM * WU_PER_METRE]);
  }
  const e = state.entities;
  const units: Array<[number, number]> = [];
  const torches: Array<[number, number]> = [];
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i]! >= state.players.length || e.kind[i] === UnitKind.Wanderer) continue;
    units.push([e.x[i]!, e.z[i]!]);
    if (e.torchUntil[i]! > state.step) torches.push([e.x[i]!, e.z[i]!]);
  }
  return { lights, units, torches };
}

/** A spot's spawn weight in 64ths (Table 8): x0.25 within twice a light's radius, x0.5 within three times; x0.5 near units and hand torches. */
function weightAt(w: Weights, x: number, z: number): number {
  let wt = 64;
  for (const [lx, lz, r] of w.lights) {
    const d2 = dist2(x, z, lx, lz);
    if (d2 <= 4 * r * r) wt = wt >> 2;
    else if (d2 <= 9 * r * r) wt = wt >> 1;
  }
  const near = 20 * WU_PER_METRE;
  for (const [ux, uz] of w.units) {
    if (dist2(x, z, ux, uz) <= near * near) {
      wt = wt >> 1;
      break;
    }
  }
  const torch = 8 * WU_PER_METRE;
  for (const [tx, tz] of w.torches) {
    if (dist2(x, z, tx, tz) <= torch * torch) {
      wt = wt >> 1;
      break;
    }
  }
  return Math.max(1, wt);
}

/**
 * A spawn point for a player's group: a tile on the dark edge (explored,
 * next to unexplored land) at least 50 m from their claimed land and 30 m
 * from any of the players' units, picked by weight on the 'spawns' stream;
 * if there is none, the nearest unexplored spot 50 m from claimed land.
 */
export function spawnPoint(state: SimState, player: number): [number, number] {
  const world = state.world;
  const shapes = claimShapes(state, player);
  const claim2 = (CLAIM_STANDOFF_M * WU_PER_METRE) ** 2;
  const unit2 = (UNIT_STANDOFF_M * WU_PER_METRE) ** 2;
  const w = weightsFor(state);
  const keys = [...world.explored[player]!.keys()].sort((a, b) => a - b);
  const candidates: Array<[number, number, number]> = [];
  let total = 0;
  const explored = (tx: number, tz: number): boolean => world.isExplored(player, tx, tz);
  for (const key of keys) {
    const bits = world.explored[player]!.get(key)!;
    const cx = chunkKeyX(key);
    const cz = chunkKeyZ(key);
    for (let t = 0; t < FOG_TILES_PER_CHUNK * FOG_TILES_PER_CHUNK; t++) {
      if ((bits[t >> 3]! & (1 << (t & 7))) === 0) continue;
      const tx = cx * FOG_TILES_PER_CHUNK + (t % FOG_TILES_PER_CHUNK);
      const tz = cz * FOG_TILES_PER_CHUNK + floorDiv(t, FOG_TILES_PER_CHUNK);
      if (explored(tx + 1, tz) && explored(tx - 1, tz) && explored(tx, tz + 1) && explored(tx, tz - 1)) continue;
      const x = tx * TILE_WU + (TILE_WU >> 1);
      const z = tz * TILE_WU + (TILE_WU >> 1);
      if (claimDistance2(shapes, x, z) < claim2) continue;
      if (w.units.some(([ux, uz]) => dist2(x, z, ux, uz) < unit2)) continue;
      const cxl = floorDiv(x, WU_PER_COLUMN);
      const czl = floorDiv(z, WU_PER_COLUMN);
      if (!state.nav.standable(cxl, czl, WALKER)) continue;
      const wt = weightAt(w, x, z);
      candidates.push([x, z, wt]);
      total += wt;
    }
  }
  if (candidates.length > 0) {
    let r = state.rng.spawns.nextInt(total);
    for (const [x, z, wt] of candidates) {
      if (r < wt) return [x, z];
      r -= wt;
    }
  }
  return fallbackPoint(state, player, shapes, claim2);
}

/** The nearest unexplored tile 50 m from claimed land, searched in rings out from the player's town. */
function fallbackPoint(state: SimState, player: number, shapes: ReturnType<typeof claimShapes>, claim2: number): [number, number] {
  const town = townCentre(state, player) ?? [0, 0];
  const tx0 = floorDiv(town[0], TILE_WU);
  const tz0 = floorDiv(town[1], TILE_WU);
  for (let r = 1; r < 400; r++) {
    for (let k = -r; k <= r; k++) {
      for (const [tx, tz] of [[tx0 + k, tz0 - r], [tx0 + r, tz0 + k], [tx0 - k, tz0 + r], [tx0 - r, tz0 - k]] as const) {
        if (state.world.isExplored(player, tx, tz)) continue;
        const x = tx * TILE_WU + (TILE_WU >> 1);
        const z = tz * TILE_WU + (TILE_WU >> 1);
        if (claimDistance2(shapes, x, z) < claim2) continue;
        if (!state.nav.standable(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN), WALKER)) continue;
        return [x, z];
      }
    }
  }
  return [town[0] + 60 * WU_PER_METRE, town[1]];
}

/**
 * Each step: at nightfall the night is planned for every player still in
 * the game; through the night mobs come at their times; at dawn whatever
 * has not come yet never does.
 */
export function updateSpawns(state: SimState): void {
  const c = clockAt(state.step);
  if (c.period === Period.Night && c.into === 0 && !state.peaceful) {
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p]!.out) continue;
      state.spawns.push(...planNight(state, p, c.cycle, state.step));
    }
    state.spawns.sort((a, b) => a.at - b.at || a.group - b.group || a.player - b.player);
  }
  if (c.period !== Period.Night) {
    if (state.spawns.length > 0) state.spawns = [];
    return;
  }
  while (state.spawns.length > 0 && state.spawns[0]!.at <= state.step) {
    const s = state.spawns.shift()!;
    if (state.players[s.player]?.out) continue;
    let x = s.x;
    let z = s.z;
    if (!s.placed) {
      [x, z] = spawnPoint(state, s.player);
      // The rest of the group comes out at the same spot.
      for (const o of state.spawns) {
        if (o.group !== s.group) continue;
        o.x = x;
        o.z = z;
        o.placed = 1;
      }
    }
    const rng = state.rng.spawns;
    const ox = rng.range(-GROUP_SPREAD_WU, GROUP_SPREAD_WU);
    const oz = rng.range(-GROUP_SPREAD_WU, GROUP_SPREAD_WU);
    const cx = floorDiv(x + ox, WU_PER_COLUMN);
    const cz = floorDiv(z + oz, WU_PER_COLUMN);
    const ok = state.nav.standable(cx, cz, WALKER);
    addMob(state, s.mob, s.player, ok ? x + ox : x, ok ? z + oz : z, c.cycle);
  }
}
