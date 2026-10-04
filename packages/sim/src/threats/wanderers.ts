// Wandering night monsters (Jade's patch notes 1, 2026-10-03; picks in
// blueprint/wanderers-picks.md). At night monsters roam the wild: the land
// the players have explored but not claimed. The wild is cut into 25 m
// patches. A patch is filled the first time that night one of the players'
// units, or of a people they have found, comes within 60 m of it: 1 or 2
// monsters of one kind out of the night's pool (the weak common, the strong
// rare), from night 5 now and then a larger group of one weak kind, and less
// often where less of the patch is open ground far from towns, villages,
// lairs and lights. They come out at least 35 m from the players' units, out
// of sight, and a patch no one comes near for a while is emptied again until
// someone does (unless its monsters fought), so the wild is full wherever
// anyone goes and nothing runs where no one sees it. A wanderer roams round
// its spot and goes only for prey it could reach in 2 s were the prey to
// stand still, or prey within 3 m whatever lies between, and gives up when
// the prey gets away or leaves its ground. The sun burns it at dawn like the
// night's waves (or it flees and is gone), and it never counts towards them.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, claimShapes, dist2, enclosedKey, isLit, type ClaimShapes } from '../buildings/lights.ts';
import { clockOf, Period } from '../clock.ts';
import { bomber, Comes, flies, mobSpec, MOBS, Sun, type MobSpec } from '../combat/mobs.ts';
import { addMob, engageUnit, explode, lateHooks, mobMover, townCentre, vanish, walkMob } from '../combat/mob-ai.ts';
import { forward, gap, Side, sideOf } from '../combat/combat.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { TILE_COLUMNS } from '../nav/path.ts';
import { WALKER, type Mover } from '../nav/grid.ts';
import { factionById } from '../peoples/types.ts';
import { hash32 } from '../rng.ts';
import { OrderKind, PEOPLES, UnitKind, type SimState } from '../state.ts';
import { FOG_TILE_COLUMNS } from '../world/world.ts';
import { CAMP_RADIUS_WU } from './data.ts';
import { Role, type WildPatch } from './types.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

// ----- the numbers (Jade's patch notes 1; the picks are marked s in wanderers-picks.md) -----

/** The wild is cut into square patches this many metres wide; each holds its own wanderers. */
export const WILD_PATCH_M = 25;
/** Spots tested across a patch, per side (5 by 5, 5 m apart): the share that pass is how much of the patch is wild. */
export const WILD_SAMPLES = 5;
/** Wanderers come out from this night on. */
export const WILD_FROM_NIGHT = 0;
/** A wholly wild patch holds 1 monster, or 2 of the same kind this often (a lone kind such as the goblin chief always 1). */
export const WILD_PAIR_PCT = 50;
/** A wanderer's kind is picked from the night's pool (every kind the waves have brought so far, less the archfiend and the Rift colossus) with weight 1 / threat to this power: the weak are common and the strong rare; at 1 each kind brings the same threat on average. */
export const WILD_RARITY_POWER = 1;
/** From this night a patch may hold a larger group of one weak kind instead... */
export const WILD_HORDE_FROM_NIGHT = 5;
/** ...a chance that grows by this much each night from then, up to the most. */
export const WILD_HORDE_PCT_PER_NIGHT = 1;
export const WILD_HORDE_MAX_PCT = 20;
/** The group is this big at first, one more every so many nights, up to the most. */
export const WILD_HORDE_MIN = 3;
export const WILD_HORDE_GROW_NIGHTS = 10;
export const WILD_HORDE_MAX = 8;
/** Kinds of at most this threat (tenths) are weak enough to come as a group: the zombie, cave bat, giant rat, the goblin cutter and slinger, the cinderling. */
export const WILD_WEAK_THREAT_TENTHS = 15;
/** A wild spot keeps at least this many metres from every player's claimed land (towns, walls, torches, enclosures)... */
export const WILD_CLAIM_GAP_M = 40;
/** ...stays outside this many times a lit light's radius (a bonfire, a torch post, a tribe's camp fire)... */
export const WILD_LIGHT_TIMES = 3;
/** ...and keeps this many metres from the buildings of the peoples' villages, goblin villages and lairs. */
export const WILD_VILLAGE_GAP_M = 50;
/** A patch is filled once one of the players' units, or of a people they have found, comes within this many metres of it... */
export const WILD_WAKE_M = 60;
/** ...and its monsters come out at least this many metres from every one of the players' units: out of sight (a rider sees 30 m). */
export const WILD_UNIT_GAP_M = 35;
/** A patch that no such unit has been within this many metres of is emptied again (its monsters slip away unseen) while none of them has fought; it fills again when someone comes back. */
export const WILD_SLEEP_M = 100;
/** At most this many wanderers per player still in the game at once (a guard on the step's work). */
export const WILD_CAP_PER_PLAYER = 150;
/** Patches are filled and emptied once a second. */
export const WILD_CHECK_STEPS = SEC;
/** A wanderer goes for prey it could reach in this long were the prey to stand still: a straight run over open ground, or any line for a flyer... */
export const WILD_AGGRO_STEPS = 2 * SEC;
/** ...or prey within this many metres of it, whatever lies between (it sees it across a cliff edge). */
export const WILD_AGGRO_MIN_M = 3;
/** It gives prey up once the prey is this many metres beyond that... */
export const WILD_GIVE_UP_M = 8;
/** ...or more than this many metres from its spot, unless the prey hurt it in the last 5 s. */
export const WILD_LEASH_M = 30;
/** What hurt it in this long it fights back, wherever. */
export const WILD_PROVOKED_STEPS = 5 * SEC;
/** Its group's monsters within this many metres join its fight. */
export const WILD_ASSIST_M = 10;
/** Idle, it strolls on to a spot up to this many metres off (at least a third of it) every 4 to 12 s, mostly ahead, so it drifts through the wild and a unit standing still there is found too. */
export const WILD_ROAM_M = 20;
/** How far a stroll may turn from where it faces, degrees either way. */
export const WILD_TURN_DEG = 90;
export const WILD_REST_MIN_STEPS = 4 * SEC;
export const WILD_REST_MAX_STEPS = 12 * SEC;
/** An idle wanderer looks round for prey every this many steps (each on its own beat). */
export const WILD_LOOK_STEPS = 4;

const PATCH_WU = WILD_PATCH_M * M;
const WILD_TURN_STEPS = floorDiv(WILD_TURN_DEG * 65536, 360);
const FOG_TILE_WU = FOG_TILE_COLUMNS * WU_PER_COLUMN;
const NAV_TILE_WU = TILE_COLUMNS * WU_PER_COLUMN;
/** A tag mixed into the patches' hashes so they draw on nothing else's numbers. */
const SALT = 0x77696c64;

// ----- who is prey -----

/**
 * Whether a unit is prey for a wanderer: the players' (out in the open,
 * alive), or the peoples' they have found (any player has seen the
 * faction), never their buildings. Traders the players have not met yet,
 * such as an Elf caravan on its way, are spared so they arrive.
 */
export function wildPrey(state: SimState, j: number): boolean {
  const e = state.entities;
  if (e.hp[j]! <= 0 || e.inside[j] !== 0) return false;
  const side = sideOf(state, j);
  if (side === Side.Players) return true;
  if (side !== Side.Peoples || e.role[j] === Role.Structure) return false;
  return (factionById(state.peoples, e.group[j]!)?.seen ?? 0) !== 0;
}

/** How far off a wanderer goes for prey, wu: what it runs in 2 s, but never under 3 m. */
export function aggroReach(state: SimState, i: number): number {
  return Math.max(state.entities.speed[i]! * WILD_AGGRO_STEPS, WILD_AGGRO_MIN_M * M);
}

/**
 * Whether a mover can run straight from a point to another, column by
 * column, with no cliff, building or deep water on the way (the walk map's
 * steps, from the walk level at height y).
 */
export function clearRun(state: SimState, m: Mover, x0: number, y0: number, z0: number, x1: number, z1: number): boolean {
  const nav = state.nav;
  const ax = floorDiv(x0, WU_PER_COLUMN);
  const az = floorDiv(z0, WU_PER_COLUMN);
  const bx = floorDiv(x1, WU_PER_COLUMN);
  const bz = floorDiv(z1, WU_PER_COLUMN);
  const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
  let cx = ax;
  let cz = az;
  let layer = nav.layerAt(cx, cz, floorDiv(y0, WU_PER_TERRAIN_UNIT));
  for (let k = 1; k <= n; k++) {
    const nx = ax + floorDiv((bx - ax) * k * 2 + n, 2 * n);
    const nz = az + floorDiv((bz - az) * k * 2 + n, 2 * n);
    if (nav.stepCostFrom(cx, cz, layer, nx, nz, m) < 0) return false;
    layer = nav.layerTo(cx, cz, layer, nx, nz, m);
    cx = nx;
    cz = nz;
  }
  return true;
}

/** Whether a wanderer could close on a unit now: within 3 m, or within its 2 s run on a clear line (a flyer always has one). */
function inAggro(state: SimState, i: number, spec: MobSpec, j: number, reach: number): boolean {
  const d = gap(state, i, j);
  if (d > reach) return false;
  if (d <= WILD_AGGRO_MIN_M * M || flies(spec)) return true;
  const e = state.entities;
  return clearRun(state, mobMover(spec), e.x[i]!, e.y[i]!, e.z[i]!, e.x[j]!, e.z[j]!);
}

/** The prey a wanderer would go for now: the nearest in its aggro (ties to the lowest id), or -1. */
function lookForPrey(state: SimState, i: number, spec: MobSpec): number {
  const e = state.entities;
  const reach = aggroReach(state, i);
  const near: Array<[number, number]> = [];
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, reach + 2 * M)) {
    if (!wildPrey(state, j)) continue;
    const d = gap(state, i, j);
    if (d <= reach) near.push([d, j]);
  }
  near.sort((a, b) => a[0] - b[0] || e.id[a[1]]! - e.id[b[1]]!);
  for (const [, j] of near) if (inAggro(state, i, spec, j, reach)) return j;
  return -1;
}

/** What hurt a wanderer in the last 5 s, if it is still prey; -1 for none. */
function provokedBy(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.attacker[i] || state.step - e.hurtAt[i]! > WILD_PROVOKED_STEPS) return -1;
  const a = e.indexOf(e.attacker[i]!);
  return a >= 0 && wildPrey(state, a) ? a : -1;
}

// ----- what a wanderer does -----

/**
 * One step of a wanderer (runMob's foe hook, after its attack and recovery
 * timers): what hurt it, else the prey it has while that stays close and on
 * its ground, else new prey in its aggro; with none it roams round its spot.
 */
export function runWild(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  let t = provokedBy(state, i);
  if (t < 0 && e.target[i]) {
    const c = e.indexOf(e.target[i]!);
    if (c >= 0 && wildPrey(state, c) && gap(state, i, c) <= aggroReach(state, i) + WILD_GIVE_UP_M * M && length2d(e.x[c]! - hx, e.z[c]! - hz) <= WILD_LEASH_M * M) t = c;
  }
  if (t < 0 && (state.step + e.id[i]!) % WILD_LOOK_STEPS === 0) {
    const p = lookForPrey(state, i, spec);
    if (p >= 0 && length2d(e.x[p]! - hx, e.z[p]! - hz) <= WILD_LEASH_M * M) t = p;
  }
  if (t >= 0) {
    if (e.target[i] !== e.id[t]) rally(state, i, t);
    fight(state, i, spec, t);
    return;
  }
  if (e.target[i] !== 0) {
    // Its fight is over: it strolls on from here (a flyer's swoop kept where its prey stood in targetX and targetZ).
    e.target[i] = 0;
    e.targetX[i] = e.x[i]!;
    e.targetZ[i] = e.z[i]!;
  }
  roam(state, i, spec);
}

/** Its group's idle monsters near it take up its prey. */
function rally(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const g = e.group[i]!;
  const r = WILD_ASSIST_M * M;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.kind[j] !== UnitKind.Mob || e.role[j] !== Role.Wild || e.group[j] !== g || e.hp[j]! <= 0 || e.target[j] !== 0) continue;
    if (length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r) continue;
    e.target[j] = e.id[t]!;
  }
}

/** Goes for its prey: a bomber blows itself up against it, a late mob uses its abilities, the rest fight as the night's mobs do. */
function fight(state: SimState, i: number, spec: MobSpec, t: number): void {
  const e = state.entities;
  if (bomber(spec)) {
    e.target[i] = e.id[t]!;
    if (gap(state, i, t) <= spec.reach) explode(state, i, false);
    else walkMob(state, i, spec, e.x[t]!, e.z[t]!);
    return;
  }
  if (spec.firstNight >= 25 && lateHooks.act(state, i, spec, t)) return;
  engageUnit(state, i, spec, t);
}

/**
 * Strolls through the wild: every few seconds a new spot up to 20 m on,
 * mostly ahead (within 90 degrees of where it faces), taken only if it is
 * wild and it can run there straight; the spot becomes its home, so it
 * drifts slowly through the wild and finds a unit standing still there
 * too. Where the wild ends it turns round. After a chase it goes back home.
 */
function roam(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const hx = e.homeX[i]!;
  const hz = e.homeZ[i]!;
  const away = length2d(e.x[i]! - hx, e.z[i]! - hz);
  if (away > WILD_ROAM_M * M + 2 * M) {
    e.targetX[i] = hx;
    e.targetZ[i] = hz;
    e.wanderAt[i] = state.step + WILD_REST_MIN_STEPS;
  } else if (state.step >= e.wanderAt[i]!) {
    const h = hash32(state.seed, SALT, e.id[i]!, state.step);
    const r = WILD_ROAM_M * M;
    const turn = (h & 0xffff) % (2 * WILD_TURN_STEPS + 1) - WILD_TURN_STEPS;
    const [fx, fz] = forward((e.heading[i]! + turn) & 0xffff);
    const d = floorDiv(r, 3) + (hash32(h, 1) % (r - floorDiv(r, 3) + 1));
    const x = e.x[i]! + floorDiv(fx * d, 65536);
    const z = e.z[i]! + floorDiv(fz * d, 65536);
    if (wildSpot(state, wildsNow(state), x, z) && (flies(spec) || clearRun(state, mobMover(spec), e.x[i]!, e.y[i]!, e.z[i]!, x, z))) {
      e.homeX[i] = x;
      e.homeZ[i] = z;
      e.targetX[i] = x;
      e.targetZ[i] = z;
      e.wanderAt[i] = state.step + WILD_REST_MIN_STEPS + (hash32(h, 2) % (WILD_REST_MAX_STEPS - WILD_REST_MIN_STEPS + 1));
    } else {
      // The wild ends that way (or a cliff is in the way): it turns round and tries again in a second.
      e.heading[i] = (e.heading[i]! + 0x8000) & 0xffff;
      e.wanderAt[i] = state.step + SEC;
    }
  }
  if (walkMob(state, i, spec, e.targetX[i]!, e.targetZ[i]!)) {
    e.targetX[i] = e.x[i]!;
    e.targetZ[i] = e.z[i]!;
    e.order[i] = OrderKind.Idle;
  }
}

// ----- filling and emptying the wild -----

/** The night's pool for the wild with each kind's weight (1 / threat ^ power, scaled): the waves' kinds so far, less those a night caps. */
export function wildPool(night: number, weakOnly = false): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of MOBS) {
    if (m.role !== 0 || m.comes === Comes.Never || m.firstNight > night || m.perNight > 0 || m.threatTenths <= 0) continue;
    if (weakOnly && m.threatTenths > WILD_WEAK_THREAT_TENTHS) continue;
    out.push([m.id, Math.max(1, floorDiv(100_000_000, m.threatTenths ** WILD_RARITY_POWER))]);
  }
  return out;
}

function pickWeighted(list: ReadonlyArray<readonly [number, number]>, r: number): number {
  let total = 0;
  for (const [, w] of list) total += w;
  let k = r % total;
  for (const [m, w] of list) {
    if (k < w) return m;
    k -= w;
  }
  return list[list.length - 1]![0];
}

/** The chance a patch holds a horde on a night, percent. */
export function hordePct(night: number): number {
  if (night < WILD_HORDE_FROM_NIGHT) return 0;
  return Math.min(WILD_HORDE_MAX_PCT, (night - WILD_HORDE_FROM_NIGHT + 1) * WILD_HORDE_PCT_PER_NIGHT);
}

/** A horde's size on a night. */
export function hordeSize(night: number): number {
  return Math.min(WILD_HORDE_MAX, WILD_HORDE_MIN + floorDiv(Math.max(0, night - WILD_HORDE_FROM_NIGHT), WILD_HORDE_GROW_NIGHTS));
}

/**
 * What a patch holds on a night, by its hash alone (so the same patch
 * holds the same again if it is emptied and filled): nothing (with the
 * chance that its spots are not wild), else a horde of one weak kind, else
 * 1 or 2 of a kind. Returns the kind and how many.
 */
export function patchRoll(seed: number, night: number, px: number, pz: number, wildPm: number): [number, number] {
  const h = (k: number): number => hash32(seed, SALT, night, px, pz, k);
  if (h(0) % 1000 >= wildPm) return [0, 0];
  if (h(1) % 100 < hordePct(night)) {
    const weak = wildPool(night, true);
    if (weak.length > 0) return [pickWeighted(weak, h(2)), hordeSize(night)];
  }
  const pool = wildPool(night);
  if (pool.length === 0) return [0, 0];
  const mob = pickWeighted(pool, h(3));
  return [mob, mobSpec(mob).comes === Comes.Alone || h(4) % 100 >= WILD_PAIR_PCT ? 1 : 2];
}

/** What a pass of filling needs to know about where the wild ends, worked out once. */
interface Wilds {
  claims: Array<{ shapes: ClaimShapes; box: [number, number, number, number] }>;
  /** Lights: x, z and how far out they keep the wild, wu. */
  lights: Array<[number, number, number]>;
  /** The peoples', goblin villages' and lairs' buildings: x, z. */
  sites: Array<[number, number]>;
}

function wilds(state: SimState): Wilds {
  const claims: Wilds['claims'] = [];
  for (let p = 0; p < state.players.length; p++) {
    const shapes = claimShapes(state, p);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [cx, cz, r] of shapes.circles) grow(box, cx - r, cz - r, cx + r, cz + r);
    for (const [x0, z0, x1, z1] of shapes.rects) grow(box, x0, z0, x1, z1);
    if (box[0] !== Infinity) claims.push({ shapes, box });
  }
  const lights: Wilds['lights'] = [];
  for (const b of state.buildings.list) {
    const l = buildingSpec(b.kind).light;
    if (!l || !isLit(b)) continue;
    const [x, z] = buildingCentre(b);
    lights.push([x, z, l.lightM * M * WILD_LIGHT_TIMES]);
  }
  for (const band of state.threats.bands) if (band.camp) lights.push([band.campX, band.campZ, CAMP_RADIUS_WU * WILD_LIGHT_TIMES]);
  const sites: Wilds['sites'] = [];
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0 || e.role[i] !== Role.Structure) continue;
    sites.push([e.x[i]!, e.z[i]!]);
  }
  for (const v of state.threats.villages) sites.push([v.x, v.z]);
  return { claims, lights, sites };
}

/** The wild for this step, worked out once and shared by every wanderer that strolls in it (a cache: the same state on the same step gives the same answer). */
const wildsCache = new WeakMap<SimState, { step: number; w: Wilds }>();
function wildsNow(state: SimState): Wilds {
  const c = wildsCache.get(state);
  if (c && c.step === state.step) return c.w;
  const w = wilds(state);
  wildsCache.set(state, { step: state.step, w });
  return w;
}

function grow(box: [number, number, number, number], x0: number, z0: number, x1: number, z1: number): void {
  box[0] = Math.min(box[0], x0);
  box[1] = Math.min(box[1], z0);
  box[2] = Math.max(box[2], x1);
  box[3] = Math.max(box[3], z1);
}

/** Whether a spot is wild: explored, open ground a walker stands on, off every player's claimed land by the gap, clear of lights, villages and lairs. */
export function wildSpot(state: SimState, w: Wilds, x: number, z: number): boolean {
  if (!state.world.isExplored(floorDiv(x, FOG_TILE_WU), floorDiv(z, FOG_TILE_WU))) return false;
  if (!state.nav.standable(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN), WALKER)) return false;
  const gapWu = WILD_CLAIM_GAP_M * M;
  for (const c of w.claims) {
    const [x0, z0, x1, z1] = c.box;
    if (x < x0 - gapWu || x > x1 + gapWu || z < z0 - gapWu || z > z1 + gapWu) continue;
    for (const [cx, cz, r] of c.shapes.circles) if (dist2(x, z, cx, cz) < (r + gapWu) * (r + gapWu)) return false;
    for (const [rx0, rz0, rx1, rz1] of c.shapes.rects) {
      const dx = x < rx0 ? rx0 - x : x > rx1 ? x - rx1 : 0;
      const dz = z < rz0 ? rz0 - z : z > rz1 ? z - rz1 : 0;
      if (dx * dx + dz * dz < gapWu * gapWu) return false;
    }
  }
  // Inside a closed-off region that holds a building: claimed, however far from its walls.
  const tx = floorDiv(x, NAV_TILE_WU);
  const tz = floorDiv(z, NAV_TILE_WU);
  for (let p = 0; p < state.players.length; p++) if (sortedHas(state.enclosed, enclosedKey(p, tx, tz))) return false;
  for (const [lx, lz, r] of w.lights) if (dist2(x, z, lx, lz) < r * r) return false;
  const site = WILD_VILLAGE_GAP_M * M;
  for (const [sx, sz] of w.sites) if (dist2(x, z, sx, sz) < site * site) return false;
  return true;
}

function sortedHas(list: readonly number[], k: number): boolean {
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

/** Whether any of the players' units stands within a distance of a point. */
function playersNear(state: SimState, x: number, z: number, r: number): boolean {
  const e = state.entities;
  for (const j of state.grid.nearOthers(x, z, r)) {
    if (e.owner[j]! >= state.players.length || e.hp[j]! <= 0) continue;
    if (dist2(x, z, e.x[j]!, e.z[j]!) < r * r) return true;
  }
  return false;
}

/** The units that wake the wild: the players' out in the open, and the found peoples'. Their spots, wu. */
function wakers(state: SimState): Array<[number, number]> {
  const e = state.entities;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < e.count; i++) {
    if (e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
    if (e.owner[i]! < state.players.length || (e.owner[i] === PEOPLES && wildPrey(state, i))) out.push([e.x[i]!, e.z[i]!]);
  }
  return out;
}

/** Patch keys within a distance of any waker. */
function patchesNear(spots: ReadonlyArray<readonly [number, number]>, r: number): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const [x, z] of spots) {
    for (let pz = floorDiv(z - r, PATCH_WU); pz <= floorDiv(z + r, PATCH_WU); pz++) {
      for (let px = floorDiv(x - r, PATCH_WU); px <= floorDiv(x + r, PATCH_WU); px++) {
        const k = patchKey(px, pz);
        if (out.has(k)) continue;
        const dx = x < px * PATCH_WU ? px * PATCH_WU - x : x > (px + 1) * PATCH_WU ? x - (px + 1) * PATCH_WU : 0;
        const dz = z < pz * PATCH_WU ? pz * PATCH_WU - z : z > (pz + 1) * PATCH_WU ? z - (pz + 1) * PATCH_WU : 0;
        if (dx * dx + dz * dz <= r * r) out.set(k, [px, pz]);
      }
    }
  }
  return out;
}

function patchKey(px: number, pz: number): number {
  return (pz + 0x8000) * 0x10000 + (px + 0x8000);
}

/** Live wanderers by group. */
function wandererGroups(state: SimState): Map<number, number[]> {
  const e = state.entities;
  const out = new Map<number, number[]>();
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.role[i] !== Role.Wild || e.hp[i]! <= 0) continue;
    const list = out.get(e.group[i]!);
    if (list) list.push(i);
    else out.set(e.group[i]!, [i]);
  }
  return out;
}

/** Whether a wanderer has kept to itself: unhurt, after no prey, not running from the sun. */
function untouched(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.hp[i] === e.maxHp[i] && e.target[i] === 0 && e.atkAt[i] === 0 && !e.fleeing[i];
}

/**
 * Each step: at night, once a second, the patches near the players' (and
 * the found peoples') units are filled and the patches no one has come near
 * are emptied; out of the night the record is cleared, and a wanderer the
 * sun does not touch leaves at dawn.
 */
export function updateWild(state: SimState): void {
  const c = clockOf(state);
  const t = state.threats;
  if (c.period !== Period.Night) {
    if (t.wild.length > 0) t.wild = [];
    if (c.period === Period.Dawn && c.into === 0) sunProofLeave(state);
    return;
  }
  if (state.peaceful || c.cycle < WILD_FROM_NIGHT || c.into % WILD_CHECK_STEPS !== 0) return;
  const spots = wakers(state);
  const groups = wandererGroups(state);
  emptyQuiet(state, spots, groups);
  fill(state, spots, groups, c.cycle);
}

/**
 * Empties patches no one has come near: a patch's monsters slip away unseen
 * when none of them is within 100 m of a waker (judged by the patches they
 * stand in now, for they drift) and all of them are there and untouched;
 * the patch fills again when someone comes back. An empty patch is judged
 * afresh then too.
 */
function emptyQuiet(state: SimState, spots: ReadonlyArray<readonly [number, number]>, groups: Map<number, number[]>): void {
  const near = patchesNear(spots, WILD_SLEEP_M * M);
  const e = state.entities;
  const keep: WildPatch[] = [];
  for (const p of state.threats.wild) {
    const members = p.group ? (groups.get(p.group) ?? []) : [];
    const awake =
      p.size === 0
        ? near.has(patchKey(p.px, p.pz))
        : members.length !== p.size || members.some((i) => !untouched(state, i) || near.has(patchKey(floorDiv(e.x[i]!, PATCH_WU), floorDiv(e.z[i]!, PATCH_WU))));
    if (awake) {
      keep.push(p);
      continue;
    }
    for (const i of members) vanish(state, i);
    groups.delete(p.group);
  }
  state.threats.wild = keep;
}

/** Fills the patches near the wakers not filled tonight, in key order, while the cap allows. */
function fill(state: SimState, spots: ReadonlyArray<readonly [number, number]>, groups: Map<number, number[]>, night: number): void {
  const t = state.threats;
  const done = new Set(t.wild.map((p) => patchKey(p.px, p.pz)));
  const todo = [...patchesNear(spots, WILD_WAKE_M * M).entries()].filter(([k]) => !done.has(k)).sort((a, b) => a[0] - b[0]);
  if (todo.length === 0) return;
  let live = 0;
  for (const list of groups.values()) live += list.length;
  const cap = WILD_CAP_PER_PLAYER * Math.max(1, state.players.filter((p) => !p.out).length);
  const w = wildsNow(state);
  const step = floorDiv(PATCH_WU, WILD_SAMPLES);
  for (const [, [px, pz]] of todo) {
    if (live >= cap) return;
    // How much of the patch is wild, and the wild spots out of sight of the players' units.
    let wild = 0;
    const open: Array<[number, number]> = [];
    for (let sz = 0; sz < WILD_SAMPLES; sz++) {
      for (let sx = 0; sx < WILD_SAMPLES; sx++) {
        const x = px * PATCH_WU + sx * step + (step >> 1);
        const z = pz * PATCH_WU + sz * step + (step >> 1);
        if (!wildSpot(state, w, x, z)) continue;
        wild++;
        if (!playersNear(state, x, z, WILD_UNIT_GAP_M * M)) open.push([x, z]);
      }
    }
    if (wild === 0) {
      t.wild.push({ px, pz, group: 0, size: 0 });
      continue;
    }
    // Every wild spot is in someone's sight: try again once they move on.
    if (open.length === 0) continue;
    const [mob, n] = patchRoll(state.seed, night, px, pz, floorDiv(wild * 1000, WILD_SAMPLES * WILD_SAMPLES));
    if (n === 0) {
      t.wild.push({ px, pz, group: 0, size: 0 });
      continue;
    }
    const [x, z] = open[hash32(state.seed, SALT, night, px, pz, 5) % open.length]!;
    const group = state.nextEntityId++;
    const foe = nearestTown(state, x, z);
    for (let k = 0; k < n; k++) {
      // The first on the spot, the rest in a ring 1.5 m round it (a second ring past 7).
      const [fx, fz] = forward(floorDiv(k * 65536, Math.min(6, Math.max(1, n - 1))) + (group & 0x3fff));
      const r = k === 0 ? 0 : k > 6 ? 3 * M : floorDiv(3 * M, 2);
      const ox = floorDiv(fx * r, 65536);
      const oz = floorDiv(fz * r, 65536);
      const ok = state.nav.standable(floorDiv(x + ox, WU_PER_COLUMN), floorDiv(z + oz, WU_PER_COLUMN), WALKER);
      const i = addWanderer(state, mob, ok ? x + ox : x, ok ? z + oz : z, night, group, foe);
      state.entities.homeX[i] = x;
      state.entities.homeZ[i] = z;
    }
    t.wild.push({ px, pz, group, size: n });
    live += n;
  }
}

/**
 * Sets down one wandering monster at a spot (its home), out of a group (0
 * for none), running from a player's town at dawn (the nearest when not
 * given). Its first stroll starts within 12 s.
 */
export function addWanderer(state: SimState, mob: number, x: number, z: number, night: number, group = 0, foe = nearestTown(state, x, z)): number {
  const i = addMob(state, mob, foe, x, z, night);
  const e = state.entities;
  e.role[i] = Role.Wild;
  e.group[i] = group;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  e.targetX[i] = x;
  e.targetZ[i] = z;
  e.wanderAt[i] = state.step + 1 + (hash32(state.seed, SALT, e.id[i]!) % WILD_REST_MAX_STEPS);
  return i;
}

/** The player whose town is nearest a point (whom a wanderer runs from at dawn), else the first still in the game. */
function nearestTown(state: SimState, x: number, z: number): number {
  let best = -1;
  let bestD = 0;
  for (let p = 0; p < state.players.length; p++) {
    if (state.players[p]!.out) continue;
    const town = townCentre(state, p);
    if (!town) continue;
    const d = dist2(town[0], town[1], x, z);
    if (best < 0 || d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (best >= 0) return best;
  const any = state.players.findIndex((p) => !p.out);
  return Math.max(0, any);
}

/** At dawn a wanderer of a kind the sun neither burns nor drives off leaves the wild all the same (none of tonight's pool is such a kind; a guard). */
function sunProofLeave(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.role[i] !== Role.Wild || e.hp[i]! <= 0) continue;
    if (mobSpec(e.mob[i]!).sun === Sun.Proof) vanish(state, i);
  }
}

/** Whether a mob is a wanderer (for tests and the debug readout). */
export function isWanderer(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob && e.role[i] === Role.Wild;
}
