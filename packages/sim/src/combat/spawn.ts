// Night spawning (Rising difficulty: the night budget and its factors;
// Table 8: claimed land, the dark edge, light and unit weights, first
// night, split and picking, first appearance, depth weighting, lairs and
// the blood night; Threats). As night falls, each player's night is
// planned: its budget, grown by their town, what they provoked and how
// deep they stand, is spent on the mobs unlocked so far, and each mob is
// given a time by how it comes (a wave at once, packs, a trickle, or
// alone). A group's spawn point is chosen when its first member arrives: a
// spot on the dark edge, at least 50 m from claimed land and 30 m from any
// of the players' units, weighted away from lights and units. A fifth of
// the budget comes out of the player's lairs (none spawns without one), and
// the depth weighting's extras come out of the dark edge nearest the
// player's deepest asset and go for it.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, claimShapes, dist2, isLit } from '../buildings/lights.ts';
import { clockAt, nightLength, Period } from '../clock.ts';
import { floorDiv, isqrt, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { UnitKind, type PendingSpawn, type SimState } from '../state.ts';
import { chunkKeyX, chunkKeyZ } from '../world/chunk.ts';
import { FOG_TILE_COLUMNS, FOG_TILES_PER_CHUNK } from '../world/world.ts';
import { addMob, townCentre } from './mob-ai.ts';
import { Comes, Mob, MOBS, mobSpec } from './mobs.ts';
import { DEPTH_AHEAD, LAIR_SHARE_DELAY_STEPS } from '../threats/data.ts';
import { fogged, throughFog } from '../threats/fog.ts';
import { lairsOf, lairSpawns } from '../threats/lairs.ts';
import { Role } from '../threats/types.ts';

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
/** The dark edge's share of the night's budget, per mille: 80%; the lairs' 20% comes only out of live lairs. */
const EDGE_SHARE_PM = 800;
const LAIR_SHARE_PM = 200;
/** On a fog night spawns stand off only 40 m from claimed land (s). */
const FOG_CLAIM_STANDOFF_M = 40;
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
export function unlocked(night: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of MOBS) {
    if (m.comes === Comes.Never || m.firstNight > night) continue;
    out.push([m.id, m.firstNight > night - 10 ? 3 : 1]);
  }
  return out;
}

/** A blood night's rarer types (Table 8): the half of tonight's unlocked mobs with the highest threat (ties to the lower id), evenly weighted (s). */
export function rarer(night: number): Array<[number, number]> {
  const all = unlocked(night).sort((a, b) => mobSpec(b[0]).threatTenths - mobSpec(a[0]).threatTenths || a[0] - b[0]);
  return all.slice(0, Math.max(1, (all.length + 1) >> 1)).map(([m]) => [m, 1]);
}

/** Picks the night's mobs for one player: Night 0's fixed list, else weighted picks until the edge's share of the base budget is spent. */
export function pickNight(state: SimState, night: number): number[] {
  if (night === 0) {
    const out: number[] = [];
    for (const [m, n] of FIRST_NIGHT) for (let k = 0; k < n; k++) out.push(m);
    return out;
  }
  return pickMobs(state, floorDiv(nightBudgetTenths(night) * EDGE_SHARE_PM, 1000), unlocked(night), night);
}

/** Weighted picks from a list until a budget (tenths of threat) is spent; a mob's first night sends at most 3 of it (1 of a lone one). */
export function pickMobs(state: SimState, budget: number, choices: ReadonlyArray<readonly [number, number]>, night: number, count = new Map<number, number>()): number[] {
  const rng = state.rng.spawns;
  const out: number[] = [];
  let spent = 0;
  // The last pick may overrun the budget by one mob.
  for (let guard = 0; spent < budget && guard < 2000; guard++) {
    const open = choices.filter(([m]) => {
      const sp = mobSpec(m);
      // The archfiend comes at most once a night, the Rift colossus twice (roster 5.22 and 5.23; s: per player).
      if (sp.perNight > 0 && (count.get(m) ?? 0) >= sp.perNight) return false;
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

/** A mob to plan: its kind, the role it comes as with its aim point, and the lair it comes out of (0 for the edge). */
interface Planned {
  mob: number;
  role: number;
  ax: number;
  az: number;
  src: number;
}

/**
 * The mobs of a player's night (Rising difficulty; Table 8): the base
 * budget times their town and provoked factors (doubled on a blood night,
 * the extra spent on the rarer types), 80% from the dark edge and 20% out
 * of their lairs, plus the depth weighting's extras drawn from later
 * nights, sent for their deepest asset. Night 0 is its fixed pick only.
 */
export function nightMobs(state: SimState, player: number, night: number): Planned[] {
  const edge = (mob: number): Planned => ({ mob, role: Role.Night, ax: 0, az: 0, src: 0 });
  if (night === 0) return pickNight(state, 0).map(edge);
  const base = nightBudgetTenths(night);
  const r = state.threats.dusk[player];
  const total = r ? floorDiv(floorDiv(base * r.townPm, 1000) * r.provokedPm, 1000) : base;
  const blood = state.blood.includes(night);
  const choices = unlocked(night);
  const count = new Map<number, number>();
  const out: Planned[] = pickMobs(state, floorDiv(total * EDGE_SHARE_PM, 1000), choices, night, count).map(edge);
  if (blood) out.push(...pickMobs(state, floorDiv(total * EDGE_SHARE_PM, 1000), rarer(night), night, count).map(edge));
  // The lairs' fifth, shared equally among the player's live lairs (doubled on a blood night too).
  const lairs = lairsOf(state, player);
  if (lairs.length > 0) {
    const share = floorDiv(floorDiv(total * LAIR_SHARE_PM, 1000) * (blood ? 2 : 1), lairs.length);
    for (const l of lairs) {
      const kinds = lairSpawns(state.entities.mob[l]!);
      const own = choices.filter(([m]) => kinds.includes(m));
      for (const mob of pickMobs(state, share, own.length > 0 ? own : choices, night, count)) out.push({ mob, role: Role.Night, ax: 0, az: 0, src: state.entities.id[l]! });
    }
  }
  // Depth weighting: deeper assets draw extras from later nights, sent for the deepest of them.
  if (r && r.depthPm > 0) {
    const ahead = DEPTH_AHEAD[r.band] ?? 0;
    for (const mob of pickMobs(state, floorDiv(base * r.depthPm, 1000), unlocked(night + ahead), night + ahead, count)) out.push({ mob, role: Role.Aimed, ax: r.ax, az: r.az, src: 0 });
  }
  return out;
}

/**
 * Plans a player's night as night falls: each mob's arrival time and group.
 * Waves come in the first 10 s, packs through the first two thirds of the
 * night, the trickle through the first three quarters, and lone mobs in
 * the first half (s). A lair's share comes out of its mouth 20 s after
 * night falls, a mob every half second.
 */
export function planNight(state: SimState, player: number, night: number, start: number): PendingSpawn[] {
  const rng = state.rng.spawns;
  const mobs = nightMobs(state, player, night);
  const out: PendingSpawn[] = [];
  const length = nightLength(night, state.blood);
  let group = state.spawns.reduce((g, s) => Math.max(g, s.group), 0) + 1;
  const spawn = (at: number, p: Planned, g: number): PendingSpawn => ({ at, mob: p.mob, player, group: g, x: 0, z: 0, placed: 0, role: p.role, ax: p.ax, az: p.az, src: p.src });
  const fromLairs = new Map<number, Planned[]>();
  // Grouped by role, then kind: the depth weighting's extras come apart from the rest.
  const byKind = new Map<number, Planned[]>();
  for (const p of mobs) {
    if (p.src !== 0) {
      const list = fromLairs.get(p.src) ?? [];
      list.push(p);
      fromLairs.set(p.src, list);
      continue;
    }
    const key = p.role * 1024 + p.mob;
    const list = byKind.get(key) ?? [];
    list.push(p);
    byKind.set(key, list);
  }
  // Out of the lairs: one group per lair.
  for (const src of [...fromLairs.keys()].sort((a, b) => a - b)) {
    const g = group++;
    fromLairs.get(src)!.forEach((p, k) => out.push(spawn(start + LAIR_SHARE_DELAY_STEPS + k * (STEPS_PER_SECOND >> 1), p, g)));
  }
  for (const key of [...byKind.keys()].sort((a, b) => a - b)) {
    const list = byKind.get(key)!;
    const comes = mobSpec(list[0]!.mob).comes;
    if (comes === Comes.Wave) {
      // One wave of each kind, all from one spot.
      const at = start + rng.nextInt(10 * STEPS_PER_SECOND);
      const g = group++;
      for (const p of list) out.push(spawn(at + rng.nextInt(STEPS_PER_SECOND), p, g));
    } else if (comes === Comes.Pack) {
      let k = 0;
      while (k < list.length) {
        const n = Math.min(list.length - k, PACK_MIN + rng.nextInt(PACK_MAX - PACK_MIN + 1));
        const at = start + rng.nextInt(floorDiv(length * 2, 3));
        const g = group++;
        for (let q = 0; q < n; q++) out.push(spawn(at + q * 5, list[k++]!, g));
      }
    } else {
      const span = comes === Comes.Trickle ? floorDiv(length * 3, 4) : floorDiv(length, 2);
      for (const p of list) out.push(spawn(start + rng.nextInt(span), p, group++));
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
    lights.push([x, z, throughFog(state, l.lightM * WU_PER_METRE)]);
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

/** Spawns stand off this far from claimed land tonight: 50 m, 40 m in fog. */
function claimStandoff2(state: SimState): number {
  return ((fogged(state) ? FOG_CLAIM_STANDOFF_M : CLAIM_STANDOFF_M) * WU_PER_METRE) ** 2;
}

/** The dark edge's tiles where a player's mobs may come out (explored, next to unexplored land, far enough from claimed land and units), with their weights. */
function edgeCandidates(state: SimState, player: number, shapes: ReturnType<typeof claimShapes>): Array<[number, number, number]> {
  const world = state.world;
  const claim2 = claimStandoff2(state);
  const unit2 = (UNIT_STANDOFF_M * WU_PER_METRE) ** 2;
  const w = weightsFor(state);
  const keys = [...world.explored[player]!.keys()].sort((a, b) => a - b);
  const candidates: Array<[number, number, number]> = [];
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
      candidates.push([x, z, weightAt(w, x, z)]);
    }
  }
  return candidates;
}

/**
 * A spawn point for a player's group: a tile on the dark edge (explored,
 * next to unexplored land) at least 50 m from their claimed land and 30 m
 * from any of the players' units, picked by weight on the 'spawns' stream;
 * if there is none, the nearest unexplored spot 50 m from claimed land.
 */
export function spawnPoint(state: SimState, player: number): [number, number] {
  const shapes = claimShapes(state, player);
  const candidates = edgeCandidates(state, player, shapes);
  let total = 0;
  for (const c of candidates) total += c[2];
  if (candidates.length > 0) {
    let r = state.rng.spawns.nextInt(total);
    for (const [x, z, wt] of candidates) {
      if (r < wt) return [x, z];
      r -= wt;
    }
  }
  return fallbackPoint(state, player, shapes, claimStandoff2(state));
}

/** The dark edge's spot nearest a point (the depth weighting's extras, the dusk goblins), or the fallback when there is none. */
export function edgePointNear(state: SimState, player: number, x: number, z: number): [number, number] {
  const shapes = claimShapes(state, player);
  let best: [number, number] | null = null;
  let bestD = 0;
  for (const [cx, cz] of edgeCandidates(state, player, shapes)) {
    const d = dist2(cx, cz, x, z);
    if (best && d >= bestD) continue;
    best = [cx, cz];
    bestD = d;
  }
  return best ?? fallbackPoint(state, player, shapes, claimStandoff2(state));
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
  const c = clockAt(state.step, state.blood);
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
    if (s.src !== 0) {
      // Out of a lair's mouth; a lair broken since nightfall sends nothing more.
      const l = state.entities.indexOf(s.src);
      if (l < 0 || state.entities.hp[l]! <= 0) continue;
      x = state.entities.x[l]!;
      z = state.entities.z[l]!;
    } else if (!s.placed) {
      [x, z] = s.role === Role.Aimed ? edgePointNear(state, s.player, s.ax, s.az) : spawnPoint(state, s.player);
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
    const i = addMob(state, s.mob, s.player, ok ? x + ox : x, ok ? z + oz : z, c.cycle);
    if (s.role === Role.Aimed) {
      const e = state.entities;
      e.role[i] = Role.Aimed;
      e.homeX[i] = s.ax;
      e.homeZ[i] = s.az;
    }
  }
}
