// Night spawning (Rising difficulty: the night budget and its factors;
// Table 8: claimed land, the dark edge, light and unit weights, first
// night, split and picking, first appearance, depth weighting and lairs;
// Threats). As night falls, each player's night is planned: its budget,
// grown by their town, what they provoked and how deep they stand, is spent
// on the mobs unlocked so far, and each mob is given a time by how it comes
// (a wave at once, packs, a trickle, or alone). A group's spawn point is
// chosen when its first member arrives: a spot on the dark edge, at least
// 50 m from claimed land and 30 m from any of the players' units, weighted
// away from lights and units. The players share what they have explored, so
// the dark edge is the whole side's, and a spawn keeps off every player's
// claimed land, not only its target's. Four fifths of the budget come out of
// the dark edge, and each of the player's lairs sends monsters worth its own
// sleepers' threat besides (Jade's Patch 3 notes: a budget per lair by its
// threat); the depth weighting's extras come out of the dark edge nearest
// the player's deepest asset and go for it. Since Patch 5 (MB-1) every
// group goes for one of the player's targets, a base or a party out in the
// open, picked by worth (combat/aims.ts), and comes out of the dark edge
// near it; a lair's own go for the target nearest the lair. On a player's
// Bright Night their share is left out (threats/bright.ts).

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, claimShapes, dist2, isLit, type ClaimShapes } from '../buildings/lights.ts';
import { clockAt, Period } from '../clock.ts';
import { floorDiv, isqrt, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { WALKER } from '../nav/grid.ts';
import { BP, NIGHT_STEPS } from '../rules.ts';
import { UnitKind, type PendingSpawn, type SimState } from '../state.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import { aimsOf, nearestAim, pickAim, WAVE_AIMS } from './aims.ts';
import { addMob, townCentre } from './mob-ai.ts';
import { Comes, Mob, MOBS, mobSpec } from './mobs.ts';
import { DEPTH_AHEAD, LAIR_SHARE_DELAY_STEPS } from '../threats/data.ts';
import { fogged, throughFog } from '../threats/fog.ts';
import { lairBudgetTenths, lairsOf, lairSpawns } from '../threats/lairs.ts';
import { brightTonight } from '../threats/bright.ts';
import { necromancerNight } from '../threats/necromancer.ts';
import { headlessTonight, unleash, unleashedSpot } from '../threats/headless.ts';
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
/** The dark edge's share of the night's budget, per mille: 80% (the lairs send their own on top, threats/data.ts LAIR_BUDGET_PCT). */
const EDGE_SHARE_PM = 800;
/** On a fog night spawns stand off only 40 m from claimed land (s). */
const FOG_CLAIM_STANDOFF_M = 40;
/** Packs are 3 to 6 strong (s). */
const PACK_MIN = 3;
const PACK_MAX = 6;
/** A group spreads round its spawn point by up to 2 m. */
const GROUP_SPREAD_WU = 2 * WU_PER_METRE;
const TILE_WU = WU_PER_COLUMN * FOG_TILE_COLUMNS;

/** The terms of the night's budget (Rising difficulty; Jade 2026-10-04): 12 + (n - 1) + 3n + 0.04n^2 threat on night n, scaled by scalePct, and (mini patch 7.3) raised at the start. */
export interface NightBudget {
  /** The start: threat every night begins with (the 12), held in tenths. */
  startTenths: number;
  /** Added for each night after the first (the n - 1), held in tenths. */
  rampTenths: number;
  /** Added for each night (the 3n), held in tenths. */
  perNightTenths: number;
  /** The curve: this times the night squared (the 0.04n^2), held in thousandths. */
  curveThousandths: number;
  /** The whole budget scaled up or down, percent. */
  scalePct: number;
  /**
   * Mini patch 7.3 (Jade, 2026-10-10: "increase night difficulty in a front
   * loaded way such that night one is roughly 10% harder ... and by night 50
   * it is back to the same per night as before this patch, but it should
   * never get easier from one night to the next"): night 1's budget is
   * raised by this much, bp (10%), the raise falling to nothing by night
   * frontEndNight. Rounded down, never below the budget without the raise,
   * and never below the night before's.
   */
  frontBonusBp: number;
  /** The night the raise is gone by (50). */
  frontEndNight: number;
  /** How the raise falls: 1 in a straight line from night 1 to frontEndNight, 2 or more falling faster at first (the share left to that power). */
  frontShape: number;
  /** The raised budget is rounded down to this many tenths of threat (1: a tenth; 10: whole threat points). */
  frontRoundTenths: number;
}

export const NIGHT_BUDGET: NightBudget = {
  startTenths: 120,
  rampTenths: 10,
  perNightTenths: 30,
  curveThousandths: 40,
  scalePct: 100,
  frontBonusBp: 1000,
  frontEndNight: 50,
  frontShape: 1,
  frontRoundTenths: 1,
};

/** The night's budget before mini patch 7.3's raise: 12 + (n - 1) + 3n + 0.04n^2 (each term rounded down to a tenth), times the scale. */
function plainBudgetTenths(night: number, b: NightBudget): number {
  const raw = b.startTenths + b.rampTenths * Math.max(0, night - 1) + b.perNightTenths * night + floorDiv(b.curveThousandths * night * night, 100);
  return floorDiv(raw * b.scalePct, 100);
}

/** Mini patch 7.3's raise on a night, bp: frontBonusBp on night 1, falling to 0 by frontEndNight (frontShape), none on night 0. */
export function frontBonusBp(night: number, b: NightBudget = NIGHT_BUDGET): number {
  const span = (b.frontEndNight ?? 0) - 1;
  if (night < 1 || span <= 0 || night >= b.frontEndNight || !(b.frontBonusBp > 0)) return 0;
  // The share of the raise left, bp, to the shape's power.
  const leftBp = floorDiv((b.frontEndNight - night) * BP, span);
  let bonus = b.frontBonusBp;
  for (let k = 0; k < Math.max(1, b.frontShape ?? 1); k++) bonus = floorDiv(bonus * leftBp, BP);
  return bonus;
}

/** A night's budget with its raise: rounded down to frontRoundTenths, never below the plain budget. */
function raisedBudgetTenths(night: number, b: NightBudget): number {
  const plain = plainBudgetTenths(night, b);
  const step = Math.max(1, b.frontRoundTenths ?? 1);
  const raised = floorDiv(floorDiv(plain * (BP + frontBonusBp(night, b)), BP), step) * step;
  return Math.max(plain, raised);
}

/**
 * The night's budget in tenths of threat: 12 + (n - 1) + 3n + 0.04n^2 (each
 * term rounded down to a tenth), times the scale, raised by mini patch 7.3's
 * front-loaded share (frontBonusBp) and never less than the night before's.
 * Necromancers, Morvath and the other special arrivals come on top of it.
 */
export function nightBudgetTenths(night: number, b: NightBudget = NIGHT_BUDGET): number {
  let most = raisedBudgetTenths(night, b);
  // Never easier than an earlier night: the raise only runs to frontEndNight, so only those nights can be above.
  for (let n = 1; n < night && n < b.frontEndNight; n++) most = Math.max(most, raisedBudgetTenths(n, b));
  return most;
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
 * budget times their town and provoked factors, 80% from the dark edge;
 * each of their lairs' own budget out of it (its sleepers' threat); plus
 * the depth weighting's extras drawn from later nights, sent for their
 * deepest asset. Night 0 is its fixed pick only.
 */
export function nightMobs(state: SimState, player: number, night: number): Planned[] {
  const edge = (mob: number): Planned => ({ mob, role: Role.Night, ax: 0, az: 0, src: 0 });
  if (night === 0) return pickNight(state, 0).map(edge);
  const base = nightBudgetTenths(night);
  const r = state.threats.dusk[player];
  const total = r ? floorDiv(floorDiv(base * r.townPm, 1000) * r.provokedPm, 1000) : base;
  const choices = unlocked(night);
  const count = new Map<number, number>();
  const out: Planned[] = pickMobs(state, floorDiv(total * EDGE_SHARE_PM, 1000), choices, night, count).map(edge);
  // Each live lair's own budget: its sleepers' threat (Jade's Patch 3 notes).
  for (const l of lairsOf(state, player)) {
    const lair = state.entities.mob[l]!;
    const kinds = lairSpawns(lair);
    const own = choices.filter(([m]) => kinds.includes(m));
    for (const mob of pickMobs(state, lairBudgetTenths(lair, night), own.length > 0 ? own : choices, night, count)) out.push({ mob, role: Role.Night, ax: 0, az: 0, src: state.entities.id[l]! });
  }
  // Depth weighting: deeper assets draw extras from later nights, sent for the deepest of them.
  if (r && r.depthPm > 0) {
    const ahead = DEPTH_AHEAD[r.band] ?? 0;
    for (const mob of pickMobs(state, floorDiv(base * r.depthPm, 1000), unlocked(night + ahead), night + ahead, count)) out.push({ mob, role: Role.Aimed, ax: r.ax, az: r.az, src: 0 });
  }
  // A necromancer on his nights, on top of the budget (Jade's Patch 5, MB-5).
  if (necromancerNight(night)) out.push(edge(Mob.Necromancer));
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
    // A necromancer (never bought, Comes.Never) comes as a wave does, at the start of the night.
    if (comes === Comes.Wave || comes === Comes.Never) {
      // One wave of each kind, all from one spot.
      const at = start + rng.nextInt(10 * STEPS_PER_SECOND);
      const g = group++;
      for (const p of list) out.push(spawn(at + rng.nextInt(STEPS_PER_SECOND), p, g));
    } else if (comes === Comes.Pack) {
      let k = 0;
      while (k < list.length) {
        const n = Math.min(list.length - k, PACK_MIN + rng.nextInt(PACK_MAX - PACK_MIN + 1));
        const at = start + rng.nextInt(floorDiv(NIGHT_STEPS * 2, 3));
        const g = group++;
        for (let q = 0; q < n; q++) out.push(spawn(at + q * 5, list[k++]!, g));
      }
    } else {
      const span = comes === Comes.Trickle ? floorDiv(NIGHT_STEPS * 3, 4) : floorDiv(NIGHT_STEPS, 2);
      for (const p of list) out.push(spawn(start + rng.nextInt(span), p, group++));
    }
  }
  aimGroups(state, player, out);
  return out.sort((a, b) => a.at - b.at || a.group - b.group || a.mob - b.mob);
}

/**
 * Sends each group of a player's night for one of their targets (MB-1): a
 * base or a party, picked by worth on the 'spawns' stream, a lair's own for
 * the target nearest the lair. The depth weighting's extras keep their aim.
 * With no target (no building, nobody out) a group marches on the town.
 */
function aimGroups(state: SimState, player: number, plan: PendingSpawn[]): void {
  const aims = aimsOf(state, player);
  if (aims.length === 0) return;
  const chosen = new Map<number, readonly [number, number]>();
  for (const s of plan) {
    if (s.role !== Role.Night) continue;
    let at = chosen.get(s.group);
    if (!at) {
      const l = s.src !== 0 ? state.entities.indexOf(s.src) : -1;
      const a = l >= 0 ? nearestAim(aims, state.entities.x[l]!, state.entities.z[l]!) : pickAim(state.rng.spawns, aims);
      if (!a) continue;
      at = [a.x, a.z];
      chosen.set(s.group, at);
    }
    s.role = Role.Aimed;
    s.ax = at[0];
    s.az = at[1];
  }
}

/** Squared distance, wu, from a point to a player's claimed land (0 inside it). */
function claimDistance2(shapes: ClaimShapes, x: number, z: number): number {
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
}

function weightsFor(state: SimState): Weights {
  const lights: Array<[number, number, number]> = [];
  for (const b of state.buildings.list) {
    const l = buildingSpec(b.kind).light;
    if (!l || !isLit(b)) continue;
    const [x, z] = buildingCentre(b);
    lights.push([x, z, throughFog(state, l.lightM * WU_PER_METRE)]);
  }
  const e = state.entities;
  const units: Array<[number, number]> = [];
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i]! >= state.players.length || e.kind[i] === UnitKind.Wanderer) continue;
    units.push([e.x[i]!, e.z[i]!]);
  }
  return { lights, units };
}

/** A spot's spawn weight in 64ths (Table 8): x0.25 within twice a light's radius, x0.5 within three times; x0.5 near units (hand torches went with the items). */
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
  return Math.max(1, wt);
}

/** Spawns stand off this far from claimed land tonight, wu: 50 m, 40 m in fog. */
function claimStandoff(state: SimState): number {
  return (fogged(state) ? FOG_CLAIM_STANDOFF_M : CLAIM_STANDOFF_M) * WU_PER_METRE;
}

/** One player's claimed land and the box round it (to skip it quickly for spots far off). */
interface Claims {
  shapes: ClaimShapes;
  box: [number, number, number, number];
}

/** Every player's claimed land: spawns keep off all of it, as the players share the dark edge. */
function sideClaims(state: SimState): Claims[] {
  const out: Claims[] = [];
  for (let p = 0; p < state.players.length; p++) {
    const shapes = claimShapes(state, p);
    if (shapes.circles.length === 0 && shapes.rects.length === 0) continue;
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [cx, cz, r] of shapes.circles) {
      box[0] = Math.min(box[0], cx - r);
      box[1] = Math.min(box[1], cz - r);
      box[2] = Math.max(box[2], cx + r);
      box[3] = Math.max(box[3], cz + r);
    }
    for (const [x0, z0, x1, z1] of shapes.rects) {
      box[0] = Math.min(box[0], x0);
      box[1] = Math.min(box[1], z0);
      box[2] = Math.max(box[2], x1);
      box[3] = Math.max(box[3], z1);
    }
    out.push({ shapes, box });
  }
  return out;
}

/** Whether a spot is nearer than the stand-off to any player's claimed land. */
function nearClaims(claims: readonly Claims[], x: number, z: number, reach: number): boolean {
  for (const c of claims) {
    const [x0, z0, x1, z1] = c.box;
    if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) continue;
    if (claimDistance2(c.shapes, x, z) < reach * reach) return true;
  }
  return false;
}

/** The dark edge's tiles where mobs may come out (explored, next to unexplored land, far enough from claimed land and units), with their weights. */
function edgeCandidates(state: SimState, claims: readonly Claims[]): Array<[number, number, number]> {
  const reach = claimStandoff(state);
  const unit2 = (UNIT_STANDOFF_M * WU_PER_METRE) ** 2;
  const w = weightsFor(state);
  const edge = state.world.darkEdge();
  const candidates: Array<[number, number, number]> = [];
  for (let k = 0; k < edge.length; k += 2) {
    const x = edge[k]! * TILE_WU + (TILE_WU >> 1);
    const z = edge[k + 1]! * TILE_WU + (TILE_WU >> 1);
    if (nearClaims(claims, x, z, reach)) continue;
    if (w.units.some(([ux, uz]) => dist2(x, z, ux, uz) < unit2)) continue;
    const cxl = floorDiv(x, WU_PER_COLUMN);
    const czl = floorDiv(z, WU_PER_COLUMN);
    if (!state.nav.standable(cxl, czl, WALKER)) continue;
    candidates.push([x, z, weightAt(w, x, z)]);
  }
  return candidates;
}

/**
 * A spawn point for a player's group: a tile on the dark edge (explored,
 * next to unexplored land) at least 50 m from every player's claimed land
 * and 30 m from any of the players' units, picked by weight on the 'spawns'
 * stream; if there is none, the nearest unexplored spot 50 m from claimed
 * land, searched out from the player's town.
 */
export function spawnPoint(state: SimState, player: number): [number, number] {
  const claims = sideClaims(state);
  const candidates = edgeCandidates(state, claims);
  let total = 0;
  for (const c of candidates) total += c[2];
  if (candidates.length > 0) {
    let r = state.rng.spawns.nextInt(total);
    for (const [x, z, wt] of candidates) {
      if (r < wt) return [x, z];
      r -= wt;
    }
  }
  return fallbackPoint(state, player, claims);
}

/** The dark edge's spot nearest a point (the depth weighting's extras, the dusk goblins), or the fallback when there is none. */
export function edgePointNear(state: SimState, player: number, x: number, z: number): [number, number] {
  const claims = sideClaims(state);
  let best: [number, number] | null = null;
  let bestD = 0;
  for (const [cx, cz] of edgeCandidates(state, claims)) {
    const d = dist2(cx, cz, x, z);
    if (best && d >= bestD) continue;
    best = [cx, cz];
    bestD = d;
  }
  return best ?? fallbackPoint(state, player, claims);
}

/**
 * A group's spawn point for its target (MB-1): a dark-edge tile no more
 * than WAVE_AIMS.edgeSpreadM farther from the target than the nearest one,
 * picked by weight on the 'spawns' stream (so a base is come at from more
 * than one side), or the fallback when there is none.
 */
export function edgePointAround(state: SimState, player: number, x: number, z: number): [number, number] {
  const claims = sideClaims(state);
  const candidates = edgeCandidates(state, claims);
  if (candidates.length === 0) return fallbackPoint(state, player, claims);
  const d = candidates.map(([cx, cz]) => isqrt(dist2(cx, cz, x, z)));
  const near = Math.min(...d) + WAVE_AIMS.edgeSpreadM * WU_PER_METRE;
  let total = 0;
  for (let k = 0; k < candidates.length; k++) if (d[k]! <= near) total += candidates[k]![2];
  let r = state.rng.spawns.nextInt(total);
  for (let k = 0; k < candidates.length; k++) {
    if (d[k]! > near) continue;
    const [cx, cz, wt] = candidates[k]!;
    if (r < wt) return [cx, cz];
    r -= wt;
  }
  return [candidates[0]![0], candidates[0]![1]];
}

/** The nearest unexplored tile 50 m from claimed land, searched in rings out from the player's town. */
function fallbackPoint(state: SimState, player: number, claims: readonly Claims[]): [number, number] {
  const town = townCentre(state, player) ?? [0, 0];
  const reach = claimStandoff(state);
  const tx0 = floorDiv(town[0], TILE_WU);
  const tz0 = floorDiv(town[1], TILE_WU);
  for (let r = 1; r < 400; r++) {
    for (let k = -r; k <= r; k++) {
      for (const [tx, tz] of [[tx0 + k, tz0 - r], [tx0 + r, tz0 + k], [tx0 - k, tz0 + r], [tx0 - r, tz0 - k]] as const) {
        if (state.world.isExplored(tx, tz)) continue;
        const x = tx * TILE_WU + (TILE_WU >> 1);
        const z = tz * TILE_WU + (TILE_WU >> 1);
        if (nearClaims(claims, x, z, reach)) continue;
        if (!state.nav.standable(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN), WALKER)) continue;
        return [x, z];
      }
    }
  }
  return [town[0] + 60 * WU_PER_METRE, town[1]];
}

/**
 * Each step: at nightfall the night is planned for every player still in
 * the game but those with a Bright Night; through the night mobs come at
 * their times; at dawn whatever has not come yet never does.
 */
export function updateSpawns(state: SimState): void {
  const c = clockAt(state.step);
  if (c.period === Period.Night && c.into === 0 && !state.peaceful) {
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p]!.out || brightTonight(state, p)) continue;
      const planned = planNight(state, p, c.cycle, state.step);
      // Jade's SCB-4: the Headless God Idol turns tonight's waves on a faction.
      const f = headlessTonight(state, p, c.cycle);
      if (f) unleash(state, planned, p, f);
      state.spawns.push(...planned);
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
      [x, z] = s.role === Role.Unleashed ? unleashedSpot(state, s.ax, s.az, s.group) : s.role === Role.Aimed ? edgePointAround(state, s.player, s.ax, s.az) : spawnPoint(state, s.player);
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
    if (s.role === Role.Aimed || s.role === Role.Unleashed) {
      const e = state.entities;
      e.role[i] = s.role;
      e.homeX[i] = s.ax;
      e.homeZ[i] = s.az;
      // Unleashed (SCB-4): on the faction the idol named, not on the player.
      if (s.role === Role.Unleashed) e.group[i] = state.circles.headlessFaction[s.player] ?? 0;
    }
  }
}
