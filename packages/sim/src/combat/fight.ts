// How the players' units fight (Controls: Unit orders, the leash and target
// choice; Combat: melee, long melee and the edge of reach, flying enemies,
// ranged attacks and the clear shot; Warriors: the ranged and melee lock).
// Fighting runs before a unit's orders each step: a unit that is idle, on
// Stop, attack-moving or patrolling picks its own targets, one on Hold never
// moves, one told to attack chases its target, and every other order (move,
// gather, build) ignores enemies. Workers do not pick fights: when a monster
// hurts one that is not fighting, it runs 10 m (Table 1).

import { isDark } from '../clock.ts';
import type { Building } from '../buildings/store.ts';
import { floorDiv, headingTowards, isqrt, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { buildingSight, landAt, NEUTRAL, OrderKind, seesForSide, sightOf, UnitKind, type SimState } from '../state.ts';
import { placedDims } from '../buildings/store.ts';
import { SALVAGE } from '../peoples/data.ts';
import { sayAttacked, sayUpTop } from '../peoples/speech.ts';
import { Act, fleeFrom, moverOf, moveSpeed, resetWalk, unitLevel, walkTo } from '../units/behaviour.ts';
import { canReach, dealt, flyingHigh, gap, hexed, hostile, huntable, isMob, landPlayerSwing, meleeOf, Side, sideOf, soaring, startSwing } from './combat.ts';
import { MOUNTED } from '../mounts/data.ts';
import { CREW_GUARD_WU } from '../siege/data.ts';
import { cloaked } from '../threats/late-mobs.ts';
import { Shot, type MeleeStats, type RangedStats } from './items.ts';
import { gearSpec, Slot } from '../units/kits.ts';
import { flies, isStructure, Mob, mobSpec } from './mobs.ts';
import { clearLob, fireAt, HAND_HEIGHT, ProjectileFlag } from './projectiles.ts';
import { mageStep } from '../magic/cast.ts';
import { mayMan, onTop, topOf } from '../units/top.ts';
import { School } from '../magic/spells.ts';
import { beyondReach } from '../units/forage.ts';
import { chatter } from '../peoples/speech.ts';

/** How far a unit chases a target it picked itself before giving up (the leash, s): 20 m. */
export const LEASH_WU = 20 * WU_PER_METRE;
/** An idle unit or one on Stop fights back against hostiles this close (s): 12 m. */
export const IDLE_ACQUIRE_WU = 12 * WU_PER_METRE;
/** Closer than this a unit with both fights in melee (s): 4 m. */
export const RANGED_MIN_WU = 4 * WU_PER_METRE;
/** A target told to attack is given up once it is this much farther than the unit can see, and out of its side's sight. */
const LOST_WU = 20 * WU_PER_METRE;
/** A chase looks again for its moving target this often. */
const REPATH_STEPS = 10;
/** Bit 0 of a unit's skills: trained in archery (Table 7). */
export const SKILL_ARCHERY = 1;
/** The lock (Warriors): 0 switches by itself, 1 melee only, 2 ranged only. */
export const Lock = { Auto: 0, Melee: 1, Ranged: 2 } as const;

const enum Mode {
  None,
  Idle,
  Seek,
  Hold,
  Attack,
  /** N Hunt: chase the quarry the hunt order names (an animal not hostile by itself). */
  Hunt,
  /** An engine's crew: fight what comes close, then the crew order walks them back to it. */
  Guard,
}

function modeOf(state: SimState, i: number): Mode {
  const e = state.entities;
  const o = e.queue[i]![0];
  if (!o) return e.kind[i] === UnitKind.Worker ? Mode.None : Mode.Idle;
  switch (o.t) {
    case 'attack':
      return Mode.Attack;
    case 'hunt':
      // Home for the night, a hunter out with Hunt stands by like an idle unit and fights back; one sent after an animal goes on after it.
      return e.kind[i] !== UnitKind.Warrior ? Mode.None : o.auto && isDark(state.step, state.blood) ? Mode.Idle : Mode.Hunt;
    case 'loot':
      // Fetching loot or handing it in by itself, a fighter still fights back as an idle one does.
      return o.back !== 0 && e.kind[i] !== UnitKind.Worker ? Mode.Idle : Mode.None;
    case 'attackMove':
    case 'patrol':
      return Mode.Seek;
    case 'hold':
      return Mode.Hold;
    case 'crew':
      return Mode.Guard;
    default:
      return Mode.None;
  }
}

/** The ranged weapon a unit can use now, or null. Ammunition is unlimited (Troops and gear). */
export function rangedOf(state: SimState, i: number): RangedStats | null {
  const id = state.entities.ranged[i]!;
  return id ? (gearSpec(id).ranged ?? null) : null;
}

/**
 * Not state: what sideSees answered during this step, by the target's id, so
 * a crowd chasing one far target looks round the side once a step, not once
 * each. Forgotten at the start and the end of every step (step.ts), so it
 * never outlives the step that filled it.
 */
const seenThisStep = new WeakMap<SimState, Map<number, boolean>>();

export function forgetSideSight(state: SimState): void {
  seenThisStep.delete(state);
}

/**
 * Whether the players' side sees a unit now: within the sight of any of
 * their units or buildings (Fog of war: the players share their vision). A
 * cloaked void stalker is seen only as close as its cloak lets it be.
 */
export function sideSees(state: SimState, t: number): boolean {
  let seen = seenThisStep.get(state);
  if (!seen) {
    seen = new Map();
    seenThisStep.set(state, seen);
  }
  const id = state.entities.id[t]!;
  let v = seen.get(id);
  if (v === undefined) {
    v = sideSeesNow(state, t);
    seen.set(id, v);
  }
  return v;
}

function sideSeesNow(state: SimState, t: number): boolean {
  const e = state.entities;
  const x = e.x[t]!;
  const z = e.z[t]!;
  for (let j = 0; j < e.count; j++) {
    if (j === t || !seesForSide(state, j)) continue;
    const r = sightOf(state, j);
    const dx = e.x[j]! - x;
    const dz = e.z[j]! - z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r * r && !cloaked(state, t, isqrt(d2))) return true;
  }
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length) continue;
    const r = buildingSight(state, b);
    // Its footprint in wu, as footprintWu, without building the arrays.
    const d = placedDims(b);
    const x0 = (b.x + d.ox) * WU_PER_COLUMN;
    const z0 = (b.z + d.oz) * WU_PER_COLUMN;
    const x1 = x0 + d.w * WU_PER_COLUMN;
    const z1 = z0 + d.d * WU_PER_COLUMN;
    const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r * r && !cloaked(state, t, isqrt(d2))) return true;
  }
  return false;
}

/**
 * Whether a unit told to attack has lost its target: farther than it sees
 * plus 20 m and, for the players' units, out of their side's sight as well
 * (Unit orders: "or it can no longer be seen").
 */
export function targetLost(state: SimState, i: number, t: number): boolean {
  if (gap(state, i, t) <= sightOf(state, i) + LOST_WU) return false;
  return sideOf(state, i) !== Side.Players || !sideSees(state, t);
}

/** The building a unit shoots from the top of (a tower, or a level 3+ main base), or undefined. */
export function garrisonOf(state: SimState, i: number): Building | undefined {
  const b = topOf(state, i);
  return b && rangedOf(state, i) ? b : undefined;
}

/** Whether a unit may go up on a tower or a level 3+ main base (units/top.ts): anyone on foot. */
export function canGarrison(state: SimState, i: number): boolean {
  return mayMan(state, i);
}


/** Where a unit's shots leave from: its hand, or the top of the building it garrisons. */
function shotOrigin(state: SimState, i: number): [number, number, number] {
  const e = state.entities;
  return [e.x[i]!, e.y[i]! + HAND_HEIGHT, e.z[i]!];
}

/** Whether a unit can harm a target at all with what it carries (a club cannot reach a bat at its cruising height). */
function canHarm(state: SimState, i: number, t: number): boolean {
  if (!flyingHigh(state, t)) return true;
  // Arrows, bolts, shot and spells reach a flyer at its cruising height; a polearm a low flyer, but not a high flyer circling.
  if (rangedOf(state, i) || state.entities.kind[i] === UnitKind.Mage) return true;
  return !soaring(state, t) && !meleeOf(state, i).oneHanded;
}

/** Whether a target is one this unit may fight now; `chase` also allows a wild animal it was told to attack or hunt, and a building the peoples left for a worker to break down. */
export function validTarget(state: SimState, i: number, t: number, chase = false): boolean {
  const e = state.entities;
  if (t < 0 || t === i || e.hp[t]! <= 0 || e.inside[t] !== 0) return false;
  if (hostile(state, i, t)) return true;
  return chase && sideOf(state, i) === Side.Players && (huntable(state, t) || (e.kind[i] === UnitKind.Worker && salvageable(state, t)));
}

/** A building the neutral peoples left behind: workers may break it down for its materials. */
export function salvageable(state: SimState, t: number): boolean {
  const e = state.entities;
  return e.kind[t] === UnitKind.Mob && e.owner[t] === NEUTRAL && e.group[t] !== 0 && SALVAGE[e.mob[t]!] !== undefined;
}

/** How near an enemy must come for a man up top with no ranged weapon to speak up about it (s): 12 m. */
export const UP_TOP_FOE_WU = 12 * WU_PER_METRE;

/** The nearest enemy within r of a unit, or -1; with grounded, only one that does not fly. */
function nearestFoe(state: SimState, i: number, r: number, grounded = false): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, r)) {
    if (!validTarget(state, i, j)) continue;
    if (grounded && e.kind[j] === UnitKind.Mob && flies(mobSpec(e.mob[j]!))) continue;
    const d = gap(state, i, j);
    if (d > r) continue;
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** For a man up top with no ranged weapon: the nearest flyer swooping within his reach, or -1. */
function pickSwooper(state: SimState, i: number): number {
  const e = state.entities;
  const w = meleeOf(state, i);
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, w.reach + WU_PER_METRE)) {
    if (!validTarget(state, i, j) || !canReach(state, i, j, w)) continue;
    const d = gap(state, i, j);
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/**
 * Target choice (Unit orders): hostiles attacking this unit first, then
 * others that can fight back, then harmless ones (a loose bomb); the
 * closest within each tier, then the lowest id.
 */
export function pickTarget(state: SimState, i: number, range: number, structures = false): number {
  const e = state.entities;
  let best = -1;
  let bestTier = 9;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, range)) {
    // The distance first: it is the cheapest test and rules out most of a crowd.
    const d = gap(state, i, j);
    if (d > range) continue;
    if (!validTarget(state, i, j) || !canHarm(state, i, j)) continue;
    // Lairs and village buildings are broken on an order or an attack-move, never taken up by an idle unit (s).
    if (!structures && isMob(state, j) && isStructure(e.mob[j]!)) continue;
    if (cloaked(state, j, d)) continue;
    const harmless = isMob(state, j) && mobSpec(e.mob[j]!).damage === 0;
    const attacking = e.target[j] === e.id[i] || (e.attacker[i] === e.id[j] && state.step - e.hurtAt[i]! < 100);
    const tier = attacking ? 0 : e.mob[j] === Mob.BombKeg && isMob(state, j) ? 2 : harmless ? 2 : 1;
    if (tier < bestTier || (tier === bestTier && (d < bestD || (d === bestD && e.id[j]! < e.id[best]!)))) {
      best = j;
      bestTier = tier;
      bestD = d;
    }
  }
  return best;
}

/** One step straight towards (or, with a negative speed, away from) a point, if the land allows it. */
export function stepToward(state: SimState, i: number, x: number, z: number, speed: number): boolean {
  const e = state.entities;
  const dx = x - e.x[i]!;
  const dz = z - e.z[i]!;
  const d = length2d(dx, dz);
  if (d === 0) return false;
  const s = Math.min(Math.abs(speed), d);
  const sign = speed < 0 ? -1 : 1;
  const nx = e.x[i]! + sign * floorDiv(dx * s, d);
  const nz = e.z[i]! + sign * floorDiv(dz * s, d);
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const ncx = floorDiv(nx, WU_PER_COLUMN);
  const ncz = floorDiv(nz, WU_PER_COLUMN);
  if ((ncx !== cx || ncz !== cz) && state.nav.stepCost(cx, cz, ncx, ncz, moverOf(state, i), unitLevel(state, i)) < 0) return false;
  e.heading[i] = headingTowards(sign * dx, sign * dz);
  landAt(state, i, nx, nz);
  e.order[i] = OrderKind.Move;
  return true;
}

/** Walks towards a moving target until within `reach` of it, looking again for it every half second. */
export function chase(state: SimState, i: number, t: number, reach: number): void {
  const e = state.entities;
  if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
  if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + REPATH_STEPS;
  const tx = floorDiv(e.x[t]!, WU_PER_COLUMN);
  const tz = floorDiv(e.z[t]!, WU_PER_COLUMN);
  const max = Math.max(1, floorDiv(reach, WU_PER_COLUMN));
  const r = walkTo(state, i, { x0: tx, z0: tz, x1: tx, z1: tz, min: 0, max });
  // At the goal's columns but not yet in reach (Euclid against Chebyshev), or no way found: the last stretch straight.
  if (r !== 0) {
    resetWalk(state, i);
    stepToward(state, i, e.x[t]!, e.z[t]!, moveSpeed(state, i));
  }
}

export function face(state: SimState, i: number, t: number): void {
  const e = state.entities;
  const dx = e.x[t]! - e.x[i]!;
  const dz = e.z[t]! - e.z[i]!;
  if (dx !== 0 || dz !== 0) e.heading[i] = headingTowards(dx, dz);
}

/** Begins a shot: the draw takes 40% of the attack time standing still, then it flies. */
function startShot(state: SimState, i: number, t: number, r: RangedStats): void {
  const e = state.entities;
  e.target[i] = e.id[t]!;
  const steps = hexed(state, i, r.attackSteps);
  e.atkAt[i] = state.step + Math.max(1, floorDiv(steps * 2, 5));
  e.atkNext[i] = state.step + steps;
  e.atkWith[i] = Slot.Ranged;
  e.order[i] = OrderKind.Shoot;
}

/** The key moment of a swing or shot. */
function land(state: SimState, i: number): void {
  const e = state.entities;
  const withSlot = e.atkWith[i]!;
  e.atkAt[i] = 0;
  if (withSlot !== Slot.Ranged) {
    landPlayerSwing(state, i, meleeOf(state, i));
    return;
  }
  const t = e.indexOf(e.target[i]!);
  const r = rangedOf(state, i);
  if (!r || t < 0 || e.hp[t]! <= 0) return;
  const flags = r.blunt ? ProjectileFlag.Blunt : 0;
  const [x, y, z] = shotOrigin(state, i);
  // A bow from the saddle misses twice as wide (Table 1's mounted row).
  const spread = e.mount[i] && r.shot === Shot.Arrow ? r.spreadBp * MOUNTED.bowSpreadMul : r.spreadBp;
  fireAt(state, i, x, y, z, t, r.shot, dealt(state, i, r.damage), spread, flags);
}

/**
 * Fights one target for a step: shoots it when far enough and able, else
 * closes to melee. Long weapons have no minimum range (Jade): they hit an
 * enemy right beside them as well. Returns false when the target is out of
 * reach and the unit may not move (Hold).
 */
function engage(state: SimState, i: number, t: number, canMove: boolean): boolean {
  const e = state.entities;
  const d = gap(state, i, t);
  const lock = e.lock[i]!;
  const r = lock === Lock.Melee ? null : rangedOf(state, i);
  const garrisoned = e.inside[i] !== 0;
  if (r && (d > RANGED_MIN_WU || lock === Lock.Ranged || garrisoned)) {
    if (d <= r.range) {
      face(state, i, t);
      if (state.step < e.atkNext[i]!) {
        e.order[i] = OrderKind.Idle;
        return true;
      }
      const [x, y, z] = shotOrigin(state, i);
      const lob = clearLob(state, r.shot, x, y, z, e.x[t]!, e.y[t]!, e.z[t]!, true);
      if (lob > 0) {
        startShot(state, i, t, r);
        return true;
      }
      // No clear shot: move to find one, unless on Hold or on a wall top.
      if (!canMove || garrisoned) return false;
      chase(state, i, t, Math.max(RANGED_MIN_WU, d - 2 * WU_PER_METRE));
      return true;
    }
    if (garrisoned) return false;
    if (lock === Lock.Ranged || d > RANGED_MIN_WU * 2) {
      if (!canMove) return false;
      chase(state, i, t, r.range);
      return true;
    }
  }
  const w: MeleeStats = meleeOf(state, i);
  // Up top only a swooping flyer comes within reach (combat.ts canReach); nobody climbs down to chase.
  if (canReach(state, i, t, w)) {
    face(state, i, t);
    if (state.step >= e.atkNext[i]!) startSwing(state, i, e.id[t]!, w.attackSteps, Slot.Weapon);
    return true;
  }
  if (!canMove || garrisoned) return false;
  chase(state, i, t, w.reach);
  return true;
}

/** Drops the current target and, if it was chasing on its own, the leash. */
function disengage(state: SimState, i: number): void {
  const e = state.entities;
  e.target[i] = 0;
  resetWalk(state, i);
}

/**
 * The fight layer for one of the players' units, run before its orders.
 * Returns true when fighting took the step.
 */
export function fightStep(state: SimState, i: number): boolean {
  const e = state.entities;
  // A swing or shot already begun lands at its key moment; until then the unit stands.
  if (e.atkAt[i] !== 0) {
    if (state.step < e.atkAt[i]!) {
      e.order[i] = e.atkWith[i] === Slot.Ranged ? OrderKind.Shoot : OrderKind.Attack;
      return true;
    }
    land(state, i);
  }
  // Mages fight with spells, and their wands up close (magic/cast.ts).
  if (e.kind[i] === UnitKind.Mage) return mageStep(state, i);
  if (e.inside[i] !== 0) {
    if (!onTop(state, i)) return false;
    // On a tower or a main base's top: shoot whatever comes in range, never leave; without a bow or gun,
    // strike only a flyer that swoops down within reach (Jade's patch notes 1).
    const r = rangedOf(state, i);
    const range = r ? Math.min(r.range, sightOf(state, i)) : meleeOf(state, i).reach;
    let t = e.indexOf(e.target[i]!);
    if (!validTarget(state, i, t) || gap(state, i, t) > range || (!r && !canReach(state, i, t, meleeOf(state, i)))) t = r ? pickTarget(state, i, range) : pickSwooper(state, i);
    if (t < 0) {
      e.target[i] = 0;
      // Nothing he can reach: with enemies at the base he says so now and then (peoples/speech.ts).
      if (!r && (state.step + e.id[i]!) % STEPS_PER_SECOND === 0) {
        // A warrior wants to get down only to what walks: flyers are not "down there".
        if (nearestFoe(state, i, UP_TOP_FOE_WU) >= 0) sayUpTop(state, i, nearestFoe(state, i, UP_TOP_FOE_WU, true));
      }
      return false;
    }
    e.target[i] = e.id[t]!;
    if (!engage(state, i, t, false)) e.target[i] = 0;
    return false;
  }
  const mode = modeOf(state, i);
  if (mode === Mode.None) {
    if (e.target[i] !== 0) disengage(state, i);
    e.chasing[i] = 0;
    return false;
  }
  const o = e.queue[i]![0];
  if (mode === Mode.Hunt && o?.t === 'hunt') {
    // The hunt order itself handles a dead, lost or not yet chosen quarry.
    const t = o.id ? e.indexOf(o.id) : -1;
    // At dusk the hunt ends; on the Hunt button's hunt, quarry that runs past where the hunter can get home from by nightfall is let go.
    const fled = o.auto !== 0 && t >= 0 && beyondReach(state, i, e.x[t]!, e.z[t]!);
    if (fled) o.id = 0;
    if (isDark(state.step, state.blood) || fled || !validTarget(state, i, t, true) || gap(state, i, t) > sightOf(state, i) + LOST_WU) {
      if (e.target[i] !== 0) disengage(state, i);
      return false;
    }
    e.target[i] = o.id;
    // Where the quarry is, so the hunter finds its loot even when it shot it from afar.
    o.k |= 1;
    o.kx = e.x[t]!;
    o.kz = e.z[t]!;
    engage(state, i, t, true);
    return true;
  }
  if (mode === Mode.Attack && o?.t === 'attack') {
    const t = e.indexOf(o.id);
    if (!validTarget(state, i, t, true) || targetLost(state, i, t)) {
      // Dead, gone or lost: the order is done.
      e.queue[i]!.shift();
      disengage(state, i);
      return false;
    }
    e.target[i] = o.id;
    engage(state, i, t, true);
    return true;
  }
  if (mode === Mode.Guard) {
    let t = e.indexOf(e.target[i]!);
    if (!validTarget(state, i, t) || !canHarm(state, i, t) || gap(state, i, t) > CREW_GUARD_WU) t = pickTarget(state, i, CREW_GUARD_WU);
    if (t < 0) {
      if (e.target[i] !== 0) disengage(state, i);
      return false;
    }
    e.target[i] = e.id[t]!;
    if (!engage(state, i, t, true)) e.target[i] = 0;
    return true;
  }
  const hold = mode === Mode.Hold;
  const acquire = hold ? holdRange(state, i) : mode === Mode.Seek ? sightOf(state, i) : Math.max(IDLE_ACQUIRE_WU, rangedOf(state, i)?.range ?? 0);
  let t = e.indexOf(e.target[i]!);
  if (!validTarget(state, i, t) || !canHarm(state, i, t)) t = -1;
  // The leash: a chase that has run too far from where it began gives up and walks back.
  let leashed = false;
  // A rider's leash is 60 m (Table 1's mounted row).
  const leash = e.mount[i] ? MOUNTED.leash : LEASH_WU;
  if (t >= 0 && !hold && e.chasing[i] === 1 && length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > leash && gap(state, i, t) > meleeOf(state, i).reach) {
    t = -1;
    leashed = true;
  }
  if (t >= 0 && gap(state, i, t) > acquire + LEASH_WU) t = -1;
  if (t < 0) {
    if (e.target[i] !== 0) disengage(state, i);
    // Walking back from a leashed chase, it takes no new target until it is halfway home.
    const away = e.chasing[i] !== 0 && length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > LEASH_WU >> 1;
    if (leashed) e.chasing[i] = mode === Mode.Idle ? 2 : 0;
    t = leashed || (e.chasing[i] === 2 && away) ? -1 : pickTarget(state, i, acquire, mode === Mode.Seek);
    if (t >= 0 && e.chasing[i] !== 1) {
      // Where the chase begins: the leash is measured from here, and an idle unit comes back here.
      if (e.chasing[i] === 0) {
        e.homeX[i] = e.x[i]!;
        e.homeZ[i] = e.z[i]!;
      }
      e.chasing[i] = 1;
    }
  }
  if (t < 0) {
    if (e.chasing[i] === 1) e.chasing[i] = mode === Mode.Idle ? 2 : 0;
    // An idle unit that was drawn into a fight walks back to where it stood.
    if (e.chasing[i] === 2) {
      if (length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) <= WU_PER_METRE) {
        e.chasing[i] = 0;
        resetWalk(state, i);
        return false;
      }
      const hx = floorDiv(e.homeX[i]!, WU_PER_COLUMN);
      const hz = floorDiv(e.homeZ[i]!, WU_PER_COLUMN);
      if (walkTo(state, i, { x0: hx, z0: hz, x1: hx, z1: hz, min: 0, max: 0 }, e.homeX[i]!, e.homeZ[i]!) !== 0) {
        e.chasing[i] = 0;
        resetWalk(state, i);
      }
      return true;
    }
    return mode === Mode.Hold;
  }
  e.target[i] = e.id[t]!;
  if (!engage(state, i, t, !hold)) e.target[i] = 0;
  return true;
}

/** On Hold a unit only fights what its weapon reaches from where it stands. */
function holdRange(state: SimState, i: number): number {
  const r = state.entities.lock[i] === Lock.Melee ? null : rangedOf(state, i);
  return Math.max(meleeOf(state, i).reach, r?.range ?? 0);
}

/** Idle fighters this close to a worker under attack come to its help (s): 20 m. */
export const GUARD_HELP_M = 20;
const GUARD_LINES = ['Leave our worker alone!', 'Hands off our worker!', 'I\'ve got you, hold on!', 'Over here, you brute!'] as const;

/**
 * A worker of the players' is attacked (Jade's play-test notes): the idle
 * fighters of its player within 20 m, warriors and battle mages that are
 * doing nothing else, go for the attacker, and the first of them says so.
 * A monster is taken on as an idle unit takes a target, leash and all, so
 * they walk back after; a wild animal, which is no one's enemy but its
 * prey's, is attacked on an order, with a walk back queued after it.
 */
function callGuards(state: SimState, w: number, a: number): void {
  const e = state.entities;
  const r = GUARD_HELP_M * WU_PER_METRE;
  let spoke = false;
  for (const j of state.grid.near(e.x[w]!, e.z[w]!, r)) {
    if (j === w || e.owner[j] !== e.owner[w] || e.hp[j]! <= 0 || e.inside[j] !== 0 || e.queue[j]!.length > 0) continue;
    if (e.kind[j] !== UnitKind.Warrior && !(e.kind[j] === UnitKind.Mage && e.school[j] === School.Battle)) continue;
    if (e.target[j] !== 0 || e.chasing[j] !== 0 || e.heldUntil[j]! > state.step) continue;
    if (length2d(e.x[j]! - e.x[w]!, e.z[j]! - e.z[w]!) > r || !canHarm(state, j, a)) continue;
    if (hostile(state, j, a)) {
      e.target[j] = e.id[a]!;
      e.chasing[j] = 1;
      e.homeX[j] = e.x[j]!;
      e.homeZ[j] = e.z[j]!;
      resetWalk(state, j);
    } else {
      e.queue[j] = [{ t: 'attack', id: e.id[a]! }, { t: 'move', x: e.x[j]!, z: e.z[j]! }];
      e.act[j] = Act.Start;
      resetWalk(state, j);
    }
    if (!spoke) spoke = chatter(state, j, 12, 20 * STEPS_PER_SECOND, GUARD_LINES[e.id[j]! % GUARD_LINES.length]!);
  }
}

/**
 * An enemy hurt a unit: one of the players' says so now and then (Unit
 * speech); a worker (or a people's villager) that is not fighting runs 10 m
 * from the attacker, then carries on (Table 1), and idle fighters near a
 * player's worker come to its help. Installed as hurtHooks.unit.
 */
export function onUnitHurt(state: SimState, i: number, from: number, fresh: boolean): void {
  const e = state.entities;
  const a = e.indexOf(from);
  if (a < 0 || !hostile(state, i, a)) return;
  if (sideOf(state, i) === Side.Players && e.kind[i] !== UnitKind.Animal) sayAttacked(state, i);
  if (fresh && e.kind[i] === UnitKind.Worker && sideOf(state, i) === Side.Players) callGuards(state, i, a);
  if (!fresh || e.kind[i] !== UnitKind.Worker || e.inside[i] !== 0) return;
  const o = e.queue[i]![0];
  if (o?.t === 'attack' || o?.t === 'hold' || o?.t === 'attackMove' || o?.t === 'patrol') return;
  fleeFrom(state, i, e.x[a]!, e.z[a]!);
}

