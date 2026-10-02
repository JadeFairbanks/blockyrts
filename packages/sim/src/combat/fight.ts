// How the players' units fight (Controls: Unit orders, the leash and target
// choice; Combat: melee, polearms and the backup weapon, flying enemies,
// ranged attacks and the clear shot; Warriors: the ranged and melee lock).
// Fighting runs before a unit's orders each step: a unit that is idle, on
// Stop, attack-moving or patrolling picks its own targets, one on Hold never
// moves, one told to attack chases its target, and every other order (move,
// gather, build) ignores enemies. Workers do not pick fights: when a monster
// hurts one that is not fighting, it runs 10 m (Table 1).

import { buildingSpec, BuildingKind } from '../buildings/data.ts';
import { isDark } from '../clock.ts';
import type { Building } from '../buildings/store.ts';
import { floorDiv, headingTowards, length2d, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { landAt, OrderKind, SIGHT_WU, UnitKind, type SimState } from '../state.ts';
import { fleeFrom, moverOf, moveSpeed, resetWalk, unitLevel, walkTo } from '../units/behaviour.ts';
import { canReach, dealt, flyingHigh, gap, hexed, hostile, huntable, isMob, landPlayerSwing, meleeOf, Side, sideOf, startSwing, wallBetween } from './combat.ts';
import { Item, itemSpec, Slot, type MeleeStats, type RangedStats } from './items.ts';
import { isStructure, Mob, mobSpec } from './mobs.ts';
import { buildingTop, clearLob, fireAt, HAND_HEIGHT, ProjectileFlag } from './projectiles.ts';
import { throughFog } from '../threats/fog.ts';

/** How far a unit chases a target it picked itself before giving up (the leash, s): 20 m. */
export const LEASH_WU = 20 * WU_PER_METRE;
/** An idle unit or one on Stop fights back against hostiles this close (s): 12 m. */
export const IDLE_ACQUIRE_WU = 12 * WU_PER_METRE;
/** Closer than this a unit with both fights in melee (s): 4 m. */
export const RANGED_MIN_WU = 4 * WU_PER_METRE;
/** A polearm unit with an enemy inside its minimum range falls back towards friends this close (s): 6 m. */
const FRIENDS_WU = 6 * WU_PER_METRE;
/** ... else steps away from the enemies within this distance (s): 5 m. */
const CROWD_WU = 5 * WU_PER_METRE;
/** A target told to attack is given up once it is this much farther than the unit can see. */
const LOST_WU = 20 * WU_PER_METRE;
/** A double-tapped hunt lets quarry go once it is 60 m from where the hunt began: the 40 m leash plus 20 m of chase (s). */
const HUNT_CHASE_WU = 60 * WU_PER_METRE;
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
}

function modeOf(state: SimState, i: number): Mode {
  const e = state.entities;
  const o = e.queue[i]![0];
  if (!o) return e.kind[i] === UnitKind.Worker ? Mode.None : Mode.Idle;
  switch (o.t) {
    case 'attack':
      return Mode.Attack;
    case 'hunt':
      return e.kind[i] === UnitKind.Warrior ? Mode.Hunt : Mode.None;
    case 'attackMove':
    case 'patrol':
      return Mode.Seek;
    case 'hold':
      return Mode.Hold;
    default:
      return Mode.None;
  }
}

/** The ranged weapon a unit can use now, or null: it has one, shots for it, and the training it needs. */
export function rangedOf(state: SimState, i: number): RangedStats | null {
  const e = state.entities;
  const id = e.ranged[i]!;
  if (!id) return null;
  const r = itemSpec(id).ranged;
  if (!r || e.ammo[i]! <= 0) return null;
  if (r.skill && (e.skills[i]! & r.skill) === 0) return null;
  return r;
}

/** The building a unit garrisons and shoots from (a tower, or a level 3+ main base's parapets), or undefined. */
export function garrisonOf(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  if (e.inside[i] === 0) return undefined;
  const b = state.buildings.get(e.inside[i]!);
  if (!b || garrisonRoom(b) === 0) return undefined;
  return rangedOf(state, i) ? b : undefined;
}

/** Ranged units a building takes on its top (Table 4: towers 4, a main base's parapets 8 from level 3). */
export function garrisonRoom(b: Building): number {
  if (!b.complete) return 0;
  const spec = buildingSpec(b.kind);
  if (spec.slots) return spec.slots;
  if (b.kind === BuildingKind.MainBase && b.level >= 3) return 8;
  return 0;
}

/** How far a unit sees, wu: its kind's sight, plus a tower's 10 m when on one. */
export function sightOf(state: SimState, i: number): number {
  const e = state.entities;
  let base = SIGHT_WU[e.kind[i]!] ?? SIGHT_WU[0];
  // Table 1: warriors see 2 m farther at Elite and 4 m at Hero.
  if (e.kind[i] === UnitKind.Warrior && e.rank[i]! > 3) base += (e.rank[i]! - 3) * 2 * WU_PER_METRE;
  const b = e.inside[i] ? state.buildings.get(e.inside[i]!) : undefined;
  const bonus = b ? (buildingSpec(b.kind).sightBonusM ?? 0) * WU_PER_METRE : 0;
  // A fog night halves it.
  return throughFog(state, base + bonus);
}

/** Where a unit's shots leave from: its hand, or the top of the building it garrisons. */
function shotOrigin(state: SimState, i: number): [number, number, number] {
  const e = state.entities;
  const b = garrisonOf(state, i);
  if (b) return [e.x[i]!, buildingTop(b) + HAND_HEIGHT, e.z[i]!];
  return [e.x[i]!, e.y[i]! + HAND_HEIGHT, e.z[i]!];
}

/** Whether a unit can harm a target at all with what it carries (a club cannot reach a bat at its cruising height). */
function canHarm(state: SimState, i: number, t: number): boolean {
  if (!flyingHigh(state, t)) return true;
  if (rangedOf(state, i)) return true;
  return !meleeOf(state, i, false).oneHanded;
}

/** Whether a target is one this unit may fight now; `chase` also allows a wild animal it was told to attack or hunt. */
function validTarget(state: SimState, i: number, t: number, chase = false): boolean {
  const e = state.entities;
  return t >= 0 && t !== i && e.hp[t]! > 0 && e.inside[t] === 0 && (hostile(state, i, t) || (chase && sideOf(state, i) === Side.Players && huntable(state, t)));
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
    if (!validTarget(state, i, j) || !canHarm(state, i, j)) continue;
    // Lairs and village buildings are broken on an order or an attack-move, never taken up by an idle unit (s).
    if (!structures && isMob(state, j) && isStructure(e.mob[j]!)) continue;
    const d = gap(state, i, j);
    if (d > range) continue;
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
function chase(state: SimState, i: number, t: number, reach: number): void {
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

function face(state: SimState, i: number, t: number): void {
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
    landPlayerSwing(state, i, meleeOf(state, i, withSlot === Slot.Backup));
    return;
  }
  const t = e.indexOf(e.target[i]!);
  const id = e.ranged[i]!;
  const r = id ? itemSpec(id).ranged : undefined;
  if (!r || e.ammo[i]! <= 0 || t < 0 || e.hp[t]! <= 0) return;
  let damage = r.damage;
  let flags = r.blunt ? ProjectileFlag.Blunt : 0;
  if (r.munition === 'arrows' && e.ammoItem[i] === Item.ArrowsFire) {
    damage += itemSpec(Item.ArrowsFire).fire!.extra;
    flags |= ProjectileFlag.Fire;
  }
  // Metal tips hit harder; venom poisons what it hits (Table 2e).
  if ((r.munition === 'arrows' || r.munition === 'bolts') && e.ammoItem[i]) {
    const ammo = itemSpec(e.ammoItem[i]!);
    damage += ammo.tip ?? 0;
    if (ammo.poison) flags |= ProjectileFlag.Poison;
  }
  const [x, y, z] = shotOrigin(state, i);
  const shot = flags & ProjectileFlag.Fire ? 6 : r.shot;
  fireAt(state, i, x, y, z, t, shot, dealt(state, i, damage), r.spreadBp, flags);
  e.ammo[i] = e.ammo[i]! - 1;
  // A bundle of javelins thrown is spent; the empty hand fetches another at a main base.
  if (e.ammo[i] === 0 && r.munition === 'self') e.ranged[i] = Item.None;
}

/**
 * Fights one target for a step: shoots it when far enough and able, else
 * closes to melee; a polearm with the target inside its minimum range
 * switches to the backup weapon, or falls back. Returns false when the
 * target is out of reach and the unit may not move (Hold).
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
  if (garrisoned) return false;
  let w: MeleeStats = meleeOf(state, i, false);
  let slot: number = Slot.Weapon;
  if (w.min > 0 && d < w.min && canMove && wallBetween(state, i, t)) {
    // Too close to stab over the fence: step back from it rather than reach for the club (s).
    stepToward(state, i, e.x[t]!, e.z[t]!, -moveSpeed(state, i));
    return true;
  }
  if (w.min > 0 && d < w.min) {
    const backup = e.backup[i] ? itemSpec(e.backup[i]!).melee : undefined;
    if (backup) {
      w = backup;
      slot = Slot.Backup;
    } else return fallBack(state, i, w, canMove);
  }
  if (canReach(state, i, t, w)) {
    face(state, i, t);
    if (state.step >= e.atkNext[i]!) startSwing(state, i, e.id[t]!, w.attackSteps, slot);
    return true;
  }
  if (!canMove) return false;
  chase(state, i, t, w.reach);
  return true;
}

/**
 * A polearm with an enemy inside its minimum range and no backup weapon
 * (Polearms): hit another enemy still in reach; else step back towards
 * friends close by; else away from the enemies round it. On Hold only the
 * first.
 */
function fallBack(state: SimState, i: number, w: MeleeStats, canMove: boolean): boolean {
  const e = state.entities;
  let other = -1;
  let enemies = 0;
  let sx = 0;
  let sz = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, w.reach + WU_PER_METRE)) {
    if (!validTarget(state, i, j)) continue;
    if (canReach(state, i, j, w) && (other < 0 || e.id[j]! < e.id[other]!)) other = j;
    if (gap(state, i, j) <= CROWD_WU) {
      enemies++;
      sx += e.x[j]!;
      sz += e.z[j]!;
    }
  }
  if (other >= 0) {
    face(state, i, other);
    if (state.step >= e.atkNext[i]!) startSwing(state, i, e.id[other]!, w.attackSteps, Slot.Weapon);
    return true;
  }
  if (!canMove) return true;
  let friend = -1;
  let fd = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, FRIENDS_WU)) {
    if (j === i || sideOf(state, j) !== Side.Players || e.hp[j]! <= 0) continue;
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (d > FRIENDS_WU || d < WU_PER_METRE) continue;
    if (friend < 0 || d < fd || (d === fd && e.id[j]! < e.id[friend]!)) {
      friend = j;
      fd = d;
    }
  }
  const speed = moveSpeed(state, i);
  if (friend >= 0) stepToward(state, i, e.x[friend]!, e.z[friend]!, speed);
  else if (enemies > 0) stepToward(state, i, floorDiv(sx, enemies), floorDiv(sz, enemies), -speed);
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
  if (e.inside[i] !== 0) {
    if (!garrisonOf(state, i)) return false;
    // On a tower or parapet: shoot whatever comes in range, never leave.
    const r = rangedOf(state, i)!;
    let t = e.indexOf(e.target[i]!);
    if (!validTarget(state, i, t) || gap(state, i, t) > r.range) t = pickTarget(state, i, Math.min(r.range, sightOf(state, i)));
    if (t < 0) {
      e.target[i] = 0;
      return false;
    }
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
    // At dusk the hunt ends; on a double-tapped hunt, quarry that runs past the chase limit is let go.
    const fled = o.auto !== 0 && t >= 0 && length2d(e.x[t]! - o.x, e.z[t]! - o.z) > HUNT_CHASE_WU;
    if (fled) o.id = 0;
    if (isDark(state.step, state.blood) || fled || !validTarget(state, i, t, true) || gap(state, i, t) > sightOf(state, i) + LOST_WU) {
      if (e.target[i] !== 0) disengage(state, i);
      return false;
    }
    e.target[i] = o.id;
    engage(state, i, t, true);
    return true;
  }
  if (mode === Mode.Attack && o?.t === 'attack') {
    const t = e.indexOf(o.id);
    if (!validTarget(state, i, t, true) || gap(state, i, t) > sightOf(state, i) + LOST_WU) {
      // Dead, gone or lost: the order is done.
      e.queue[i]!.shift();
      disengage(state, i);
      return false;
    }
    e.target[i] = o.id;
    engage(state, i, t, true);
    return true;
  }
  const hold = mode === Mode.Hold;
  const acquire = hold ? holdRange(state, i) : mode === Mode.Seek ? sightOf(state, i) : Math.max(IDLE_ACQUIRE_WU, rangedOf(state, i)?.range ?? 0);
  let t = e.indexOf(e.target[i]!);
  if (!validTarget(state, i, t) || !canHarm(state, i, t)) t = -1;
  // The leash: a chase that has run too far from where it began gives up and walks back.
  let leashed = false;
  if (t >= 0 && !hold && e.chasing[i] === 1 && length2d(e.x[i]! - e.homeX[i]!, e.z[i]! - e.homeZ[i]!) > LEASH_WU && gap(state, i, t) > meleeOf(state, i, false).reach) {
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
  return Math.max(meleeOf(state, i, false).reach, r?.range ?? 0);
}

/** A monster hurt a worker that is not fighting: it runs 10 m from the attacker, then carries on (Table 1). Installed as hurtHooks.unit. */
export function onUnitHurt(state: SimState, i: number, from: number, fresh: boolean): void {
  const e = state.entities;
  if (!fresh || e.kind[i] !== UnitKind.Worker || e.inside[i] !== 0) return;
  const a = e.indexOf(from);
  if (a < 0 || sideOf(state, a) !== Side.Monsters) return;
  const o = e.queue[i]![0];
  if (o?.t === 'attack' || o?.t === 'hold' || o?.t === 'attackMove' || o?.t === 'patrol') return;
  fleeFrom(state, i, e.x[a]!, e.z[a]!);
}

