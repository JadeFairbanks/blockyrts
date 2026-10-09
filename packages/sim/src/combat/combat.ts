// Combat (Combat; the rules every number table uses; Experience and
// training): how hits land and what they do. Melee hits land at the key
// moment of the swing; stabs hit one target, every other swing hits what is
// in a 90 degree arc in front. Projectiles really fly (projectiles.ts). A
// unit or building brought to 0 is settled at the end of the step, in the
// order it fell, so indices stay put while units are being run.

import { buildingName, buildingSpec } from '../buildings/data.ts';
import { computeEnclosed } from '../buildings/lights.ts';
import { solidRect, type Building } from '../buildings/store.ts';
import { cos16, floorDiv, length2d, sin16, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { BP, damageTaken, HEX_SLOW_BP, KILL_SHARE_WINDOW_STEPS, killXpTenths, rankDamageBonusBp, shareXp, totalArmourBp, withBonus, XP_TENTHS } from '../rules.ts';
import { MONSTERS, OrderKind, PEOPLES, UnitKind, WARRIOR_HEALTH_BY_RANK, WILD, type HitLook, type SimState } from '../state.ts';
import { atWar } from '../peoples/types.ts';
import { Role } from '../threats/types.ts';
import { speciesSpec } from '../animals/species.ts';
import { Hit, type MeleeStats } from './items.ts';
import { aTroop, CRIT, gearSpec } from '../units/kits.ts';
import { workerMelee } from '../units/tools.ts';
import { isWoodsman, WOODSMAN } from '../units/woodsman.ts';
import { BLAST, BURST, CLIMBING_DAMAGE_BP, flies, Mob, mobSpec, Moves, SWOOP_HEIGHT } from './mobs.ts';
import { engineSpec } from '../siege/data.ts';
import { MOUNTED, mountSpec } from '../mounts/data.ts';
import { chargeKnock, loseMount, mountArmourBp, mountTakes, startCharge, takeCharge } from '../mounts/riding.ts';
import { facingBp } from '../threats/late-mobs.ts';
import { MAGE_RANK_NAMES, MAGE_XP_TENTHS, mageGainXp } from '../magic/mages.ts';
import { WORKER_RANK_NAMES, WORKER_XP_TENTHS, workerGainXp } from '../units/ranks.ts';
import { onTop } from '../units/top.ts';
import { MAGE_TOP_RANK, Spell, spellSpec } from '../magic/spells.ts';

/**
 * The sides: every player together, and the monsters (Winning, losing and
 * score: player versus environment only); wild animals stand apart; and the
 * neutral peoples (milestone 7), each faction at war only with the players
 * it is at war with, and always with the monsters.
 */
export const Side = { Players: 0, Monsters: 1, Wild: 2, Peoples: 3, None: -1 } as const;

export function sideOf(state: SimState, i: number): number {
  const o = state.entities.owner[i]!;
  if (o < state.players.length) return Side.Players;
  if (o === MONSTERS) return Side.Monsters;
  if (o === WILD) return Side.Wild;
  if (o === PEOPLES) return Side.Peoples;
  return Side.None;
}

/**
 * Whether two units are on opposite sides. A wild animal is an enemy only
 * of the unit it is attacking, so warriors defend against a wolf but leave
 * grazing deer alone unless told (Hunting); monsters ignore it. A people's
 * unit is an enemy of the monsters, and of a player only while its faction
 * is at war with that player; peoples never fight each other.
 */
export function hostile(state: SimState, a: number, b: number): boolean {
  const sa = sideOf(state, a);
  const sb = sideOf(state, b);
  const e = state.entities;
  if (sa === Side.Wild || sb === Side.Wild) {
    const [w, o] = sa === Side.Wild ? [a, b] : [b, a];
    const so = sideOf(state, o);
    return (so === Side.Players || so === Side.Peoples) && e.target[w] === e.id[o];
  }
  if (sa === Side.Peoples || sb === Side.Peoples) {
    if (sa === sb) return false;
    const [p, o] = sa === Side.Peoples ? [a, b] : [b, a];
    const so = sa === Side.Peoples ? sb : sa;
    if (so === Side.Monsters) return true;
    if (so === Side.Players) return atWar(state.peoples, e.group[p]!, e.owner[o]!);
    return false;
  }
  return sa !== Side.None && sb !== Side.None && sa !== sb;
}

/** Whether a shot from a side (and a people's faction, and a player) may hit a unit: never its own side, a people's only at war. */
export function shotMayHit(state: SimState, side: number, faction: number, owner: number, j: number): boolean {
  const sj = sideOf(state, j);
  if (sj === Side.None) return false;
  const e = state.entities;
  if (side === Side.Peoples) {
    if (sj === Side.Peoples) return false;
    if (sj === Side.Players) return atWar(state.peoples, faction, e.owner[j]!);
    return true;
  }
  if (sj === Side.Peoples) {
    if (side === Side.Players) return atWar(state.peoples, e.group[j]!, owner);
    return side === Side.Monsters;
  }
  return sj !== side;
}

/** Whether a unit is a wild animal the players may hunt (Hunting: an attack order on any wild animal). */
export function huntable(state: SimState, t: number): boolean {
  return state.entities.kind[t] === UnitKind.Animal && state.entities.owner[t] === WILD && state.entities.hp[t]! > 0;
}

const PERSON_HALF_WIDTH = floorDiv(WU_PER_METRE * 3, 10);
const PERSON_HEIGHT = floorDiv(WU_PER_METRE * 18, 10);

/** A mounted unit's hit box: 0.6 m half width (s), and its rider's head a metre above the mount's shoulder (s). */
const MOUNTED_HALF_WIDTH = floorDiv(WU_PER_METRE * 6, 10);

/** Half the width of a unit's hit box, wu (Simple hit shapes). */
export function halfWidth(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Animal) return animalSize(state, i, speciesSpec(e.mob[i]!).halfWidth);
  if (e.kind[i] === UnitKind.Engine) return engineSpec(e.mob[i]!).halfWidth;
  if (e.mount[i]) return MOUNTED_HALF_WIDTH;
  return e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).halfWidth : PERSON_HALF_WIDTH;
}

export function bodyHeight(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Animal) return animalSize(state, i, speciesSpec(e.mob[i]!).height);
  if (e.kind[i] === UnitKind.Engine) return engineSpec(e.mob[i]!).height;
  if (e.mount[i]) return Math.max(e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).height : PERSON_HEIGHT, floorDiv((mountSpec(e.mount[i]!).shoulderCm + 100) * WU_PER_METRE, 100));
  return e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).height : PERSON_HEIGHT;
}

/** A young animal is about half the adult's size (Young animals); `born` holds the step it grows up. */
function animalSize(state: SimState, i: number, adult: number): number {
  return state.entities.born[i]! > state.step ? adult >> 1 : adult;
}

export function isMob(state: SimState, i: number): boolean {
  return state.entities.kind[i] === UnitKind.Mob;
}

/** A flying mob up at its cruising height (only ranged attacks and polearms reach it there; a high flyer, only ranged attacks and magic). */
export function flyingHigh(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || !flies(mobSpec(e.mob[i]!))) return false;
  // In its swoop it is within reach whatever height its path has reached (mob-ai.ts fly()).
  if (e.lowUntil[i]! > state.step) return false;
  return e.y[i]! - swoopFloor(state, i) > SWOOP_HEIGHT * 2;
}

/** What a flyer swoops down to: the ground under it, or the top a man it goes for stands on (Jade's patch notes 1). */
export function swoopFloor(state: SimState, i: number): number {
  const e = state.entities;
  const t = e.indexOf(e.target[i]!);
  if (t >= 0 && onTop(state, t)) return e.y[t]!;
  return state.world.topAt(floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN)) * WU_PER_TERRAIN_UNIT;
}

/** How far above or below a man on a building's top a flyer must come for him to strike it (s): it has swooped at him. */
export const TOP_STRIKE_WU = 2 * WU_PER_METRE;

/** A high flyer circling (not swooping): nothing in hand reaches it, not even a polearm (roster: high flyer). */
export function soaring(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob && mobSpec(e.mob[i]!).moves === Moves.HighFlyer && e.lowUntil[i]! <= state.step;
}

/** A melee weapon reaching this far (polearms) stabs over a wall or gate; shorter ones cannot hit across one (s). */
export const OVER_WALL_REACH = 2 * WU_PER_METRE;

/**
 * Whether a wall or gate column stands on the ground between two units
 * (flyers go over). Melee shorter than a polearm cannot hit across one, so
 * monsters at a fence chew the fence while spears stab over it (s).
 */
export function wallBetween(state: SimState, a: number, b: number): boolean {
  const e = state.entities;
  if (e.inside[a] !== 0 || e.inside[b] !== 0) return false;
  for (const j of [a, b]) if (e.kind[j] === UnitKind.Mob && flies(mobSpec(e.mob[j]!))) return false;
  const x0 = e.x[a]!;
  const z0 = e.z[a]!;
  const dx = e.x[b]! - x0;
  const dz = e.z[b]! - z0;
  const n = Math.max(1, floorDiv(length2d(dx, dz) * 4, WU_PER_COLUMN));
  const own0 = state.buildings.solidAt(floorDiv(x0, WU_PER_COLUMN), floorDiv(z0, WU_PER_COLUMN));
  const own1 = state.buildings.solidAt(floorDiv(e.x[b]!, WU_PER_COLUMN), floorDiv(e.z[b]!, WU_PER_COLUMN));
  for (let q = 1; q < n; q++) {
    const id = state.buildings.solidAt(floorDiv(x0 + floorDiv(dx * q, n), WU_PER_COLUMN), floorDiv(z0 + floorDiv(dz * q, n), WU_PER_COLUMN));
    if (id === 0 || id === own0 || id === own1) continue;
    const bd = state.buildings.get(id);
    if (!bd || bd.hp <= 0) continue;
    const d = buildingSpec(bd.kind).defence;
    if (d === 'wall' || d === 'gate') return true;
  }
  return false;
}

/** Distance between two units' edges on the ground, wu (0 when touching). */
export function gap(state: SimState, a: number, b: number): number {
  const e = state.entities;
  const d = length2d(e.x[b]! - e.x[a]!, e.z[b]! - e.z[a]!);
  return Math.max(0, d - halfWidth(state, b));
}

/** Distance from a unit to the nearest edge of a building's solid part, wu. */
export function gapToBuilding(state: SimState, i: number, b: Building): number {
  const e = state.entities;
  const [x0, z0, x1, z1] = solidRect(b);
  const c = 3600;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const dx = x < x0 * c ? x0 * c - x : x > (x1 + 1) * c ? x - (x1 + 1) * c : 0;
  const dz = z < z0 * c ? z0 * c - z : z > (z1 + 1) * c ? z - (z1 + 1) * c : 0;
  return length2d(dx, dz);
}

/** Armour a unit wears, bp: its armour tier's protection (body, helmet and boots together), capped at 75% (Table 3). Mobs have the roster's. */
export function armourOf(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mob) return mobSpec(e.mob[i]!).armourBp;
  if (e.kind[i] === UnitKind.Animal) return speciesSpec(e.mob[i]!).armourBp;
  const pieces: number[] = [];
  if (e.armour[i]) pieces.push(gearSpec(e.armour[i]!).armourBp ?? 0);
  // A support mage's Fortify: +15% on top, still capped at 75% (Table 13); a Grovesinger's Barkskin +25%.
  if (e.fortUntil[i]! > state.step) pieces.push(spellSpec(Spell.Fortify).bp);
  if (e.barkUntil[i]! > state.step) pieces.push(spellSpec(Spell.Barkskin).bp);
  return totalArmourBp(pieces);
}

/** A shield blocks projectiles when the unit fights one-handed (Combat: One-handed weapons and shields). */
export function shieldBlock(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.shield[i]) return 0;
  const w = e.weapon[i]!;
  if (w && !gearSpec(w).melee?.oneHanded) return 0;
  return gearSpec(e.shield[i]!).blockBp ?? 0;
}

/** The melee weapon a unit of the players fights with now: its weapon, or its tool or fists. */
export function meleeOf(state: SimState, i: number): MeleeStats {
  const w = handMelee(state, i);
  // From the saddle a weapon reaches 0.5 m farther (Table 1's mounted row).
  return state.entities.mount[i] ? { ...w, reach: w.reach + MOUNTED.reachBonus } : w;
}

function handMelee(state: SimState, i: number): MeleeStats {
  const e = state.entities;
  const id = e.weapon[i]!;
  if (id) {
    const m = gearSpec(id).melee;
    // A woodsman deals 2 less than a warrior with the same weapon (Jade's WD-3).
    if (m && isWoodsman(e, i)) return { ...m, damage: Math.max(1, m.damage - WOODSMAN.damageLess) };
    if (m) return m;
  }
  return workerMelee(e, i);
}

export interface Blow {
  damage: number;
  /** The entity that dealt it (0 for none). */
  from: number;
  projectile: boolean;
  blunt: boolean;
  /** Stabs, arrows, bolts and javelins: piercing (the roster's half damage for bones and slimes). */
  pierce: boolean;
  /** An enemy spell: Warding halves it (Table 13). */
  spell?: boolean;
  /** Already worked out through armour (a Beam's share for the step): taken as it is, and shown only now and then. */
  exact?: boolean;
}

function hitLook(state: SimState, i: number, blocked: boolean): HitLook {
  const e = state.entities;
  if (blocked || e.kind[i] === UnitKind.Engine) return 'wood';
  if (e.kind[i] !== UnitKind.Mob) return 'blood';
  const mob = e.mob[i]!;
  if (mob === Mob.Slime || mob === Mob.SmallSlime) return 'slime';
  if (mob === Mob.SkeletonArcher || mob === Mob.SkeletonBomber) return 'bone';
  if (mob === Mob.BombKeg) return 'wood';
  return 'blood';
}

/**
 * A blow lands on a unit: armour, the roster's piercing and blunt
 * modifiers, a shield against projectiles, and +50% on a climber on a wall.
 * Returns the damage done.
 */
export function hurtUnit(state: SimState, i: number, blow: Blow): number {
  const e = state.entities;
  if (e.hp[i]! <= 0 || blow.damage <= 0) return 0;
  if (mountTakes(state, i, blow.damage)) return hurtMount(state, i, blow);
  let modifierBp = BP;
  if (e.kind[i] === UnitKind.Mob) {
    const spec = mobSpec(e.mob[i]!);
    if (blow.blunt) modifierBp = spec.bluntBp;
    else if (blow.pierce) modifierBp = spec.pierceBp;
    if (e.climbUntil[i]! > state.step) modifierBp = floorDiv(modifierBp * CLIMBING_DAMAGE_BP, BP);
    // A juggernaut's weak back, a barrow knight's shield wall (roster 5.19, 5.7).
    const a = blow.from ? e.indexOf(blow.from) : -1;
    if (a >= 0) modifierBp = floorDiv(modifierBp * facingBp(state, i, e.x[a]!, e.z[a]!, blow.projectile), BP);
  }
  // A hobgoblin's shield blocks half of what is shot at it (Table 16).
  const block = blow.projectile ? (e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).blockBp : shieldBlock(state, i)) : 0;
  let d = blow.exact ? blow.damage : damageTaken({ damage: blow.damage, armourBp: armourOf(state, i), modifierBp, projectile: blow.projectile, shieldBlockBp: block });
  // Warding: half damage from enemy spells (Table 13).
  if (blow.spell && e.wardUntil[i]! > state.step) d = Math.max(1, floorDiv(d * (BP - spellSpec(Spell.Warding).bp), BP));
  e.hp[i] = e.hp[i]! - d;
  // Combat interrupts eating and the healing it brings (Food: Eating).
  if (blow.from && e.mendUntil[i]! > state.step) {
    e.mendUntil[i] = 0;
    e.mendLeft[i] = 0;
  }
  const fresh = e.hurtAt[i] === 0 || state.step - e.hurtAt[i]! > FRESH_HURT_STEPS;
  e.hurtAt[i] = state.step;
  if (blow.from) e.attacker[i] = blow.from;
  if (!blow.exact || state.step % 10 === 0) state.hits.push({ look: hitLook(state, i, block > 0), x: e.x[i]!, y: e.y[i]! + floorDiv(bodyHeight(state, i) * 2, 3), z: e.z[i]!, id: e.id[i]! });
  // The players' units that hit a mob or a people's unit in the last 10 s share its experience.
  if ((e.kind[i] === UnitKind.Mob || e.owner[i] === PEOPLES) && blow.from) {
    const j = e.indexOf(blow.from);
    if (j >= 0 && sideOf(state, j) === Side.Players) noteHitter(state, i, blow.from);
  }
  if (e.hp[i]! <= 0) {
    e.hp[i] = 0;
    state.dying.push(e.id[i]!);
  } else if (blow.from) hurtHooks.unit(state, i, blow.from, fresh);
  return d;
}

/** A blow its mount takes for a mounted unit (it has the more health, or as much): through the mount's armour; at 0 the rider is on foot. */
function hurtMount(state: SimState, i: number, blow: Blow): number {
  const e = state.entities;
  const d = blow.exact ? blow.damage : damageTaken({ damage: blow.damage, armourBp: mountArmourBp(state, i), modifierBp: BP, projectile: blow.projectile, shieldBlockBp: 0 });
  e.mountHp[i] = e.mountHp[i]! - d;
  e.hurtAt[i] = state.step;
  if (blow.from) e.attacker[i] = blow.from;
  if (!blow.exact || state.step % 10 === 0) state.hits.push({ look: 'blood', x: e.x[i]!, y: e.y[i]! + floorDiv(bodyHeight(state, i), 3), z: e.z[i]!, id: e.id[i]! });
  if ((e.kind[i] === UnitKind.Mob || e.owner[i] === PEOPLES) && blow.from) {
    const j = e.indexOf(blow.from);
    if (j >= 0 && sideOf(state, j) === Side.Players) noteHitter(state, i, blow.from);
  }
  if (e.mountHp[i]! <= 0) loseMount(state, i);
  else if (blow.from) hurtHooks.unit(state, i, blow.from, false);
  return d;
}

/** A hurt is fresh when the unit was not hurt in the 2 s before it (workers flee once, not at every blow). */
const FRESH_HURT_STEPS = 40;

/** What else happens when a unit is hurt (set by fight.ts: workers run). */
export const hurtHooks: { unit: (state: SimState, i: number, from: number, fresh: boolean) => void } = { unit: () => {} };

function noteHitter(state: SimState, i: number, id: number): void {
  const list = state.entities.hitters[i]!;
  const keep: number[] = [];
  for (let k = 0; k < list.length; k += 2) {
    if (list[k] === id || state.step - list[k + 1]! > KILL_SHARE_WINDOW_STEPS) continue;
    keep.push(list[k]!, list[k + 1]!);
  }
  keep.push(id, state.step);
  state.entities.hitters[i] = keep;
}

/** A blow lands on a building; at 0 it falls at the end of the step. */
export function hurtBuilding(state: SimState, b: Building, damage: number, x: number, y: number, z: number): void {
  if (damage <= 0 || b.hp <= 0) return;
  b.hp -= damage;
  state.hits.push({ look: buildingSpec(b.kind).wooden === false ? 'stone' : 'wood', x, y, z, id: b.id });
  if (b.hp <= 0) {
    b.hp = 0;
    state.falling.push(b.id);
  }
}

/** Damage a player unit deals with a weapon: +5% per rank above the first, +20% under Rally. A mob's grows 0.5% a night (its power). */
export function dealt(state: SimState, i: number, base: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mob) {
    const d = floorDiv(base * e.power[i]!, 1000);
    // An archfiend's command: 20% more (roster 5.22).
    return e.rallyUntil[i]! > state.step ? withBonus(d, 2000) : d;
  }
  const rally = e.rallyUntil[i]! > state.step ? spellSpec(Spell.Rally).bp : 0;
  return withBonus(base, rankDamageBonusBp(e.kind[i] === UnitKind.Mage ? 1 : e.rank[i]!) + rally);
}

/** The forward vector of a heading, scaled by 65536. */
export function forward(heading: number): [number, number] {
  return [-sin16(heading), -cos16(heading)];
}

/** Within the 90 degree arc in front of a unit (45 degrees either side of its heading). */
export function inArc(state: SimState, i: number, x: number, z: number): boolean {
  const e = state.entities;
  const dx = x - e.x[i]!;
  const dz = z - e.z[i]!;
  const len = length2d(dx, dz);
  if (len === 0) return true;
  const [fx, fz] = forward(e.heading[i]!);
  return dx * fx + dz * fz >= len * 46341;
}

/** A swing begins: it lands at 40% of the attack time, the next may start when the attack time is up (s). */
export function startSwing(state: SimState, i: number, target: number, attackSteps: number, withSlot: number): void {
  const e = state.entities;
  attackSteps = hexed(state, i, attackSteps);
  e.target[i] = target;
  e.atkAt[i] = state.step + Math.max(1, floorDiv(attackSteps * 2, 5));
  e.atkNext[i] = state.step + attackSteps;
  e.atkWith[i] = withSlot;
  e.order[i] = OrderKind.Attack;
  // After a long enough run at a gallop this swing is a charge (Table 14).
  startCharge(state, i);
  state.hits.push({ look: 'swing', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

/** A unit under a goblin mage's Stumble hex attacks 20% slower (its attack time grows by a quarter); under Quicken 25% faster. */
export function hexed(state: SimState, i: number, attackSteps: number): number {
  const e = state.entities;
  let steps = e.hexUntil[i]! > state.step ? floorDiv(attackSteps * BP, BP - HEX_SLOW_BP) : attackSteps;
  if (e.quickUntil[i]! > state.step) steps = floorDiv(steps * BP, BP + spellSpec(Spell.Quicken).bp);
  return Math.max(1, steps);
}

/** Whether a melee weapon can reach a target unit now (one-handed weapons only reach a flyer as it swoops). */
export function canReach(state: SimState, i: number, t: number, w: MeleeStats): boolean {
  const e = state.entities;
  // Up top, a man reaches only a flyer that has come down to him; nothing on the ground.
  if (e.inside[i] !== 0 && (e.kind[t] !== UnitKind.Mob || !flies(mobSpec(e.mob[t]!)) || Math.abs(e.y[t]! - e.y[i]!) > TOP_STRIKE_WU)) return false;
  if (flyingHigh(state, t) && (w.oneHanded || soaring(state, t))) return false;
  const g = gap(state, i, t);
  if (g > w.reach) return false;
  return w.reach >= OVER_WALL_REACH || !wallBetween(state, i, t);
}

/**
 * A long weapon's critical hit (Long melee: the edge of reach): a blow on a
 * unit in the outer third of the weapon's reach deals 30% more (Jade). Long
 * melee and cavalry have no minimum range: closer in they hit as usual.
 */
export function critDamage(state: SimState, i: number, t: number, w: MeleeStats, damage: number): number {
  if (!w.crit) return damage;
  const edge = w.reach - floorDiv(w.reach * CRIT.outerPm, 1000);
  return gap(state, i, t) >= edge ? floorDiv(damage * (100 + CRIT.bonusPct), 100) : damage;
}

/**
 * The key moment of a player unit's swing: a stab hits its target if it is
 * still in reach; any other swing hits the target in full and every other
 * enemy in reach within the 90 degree arc for half (Table 2d). A long
 * weapon's blow at the edge of its reach is a critical (critDamage).
 */
export function landPlayerSwing(state: SimState, i: number, w: MeleeStats): void {
  const e = state.entities;
  e.atkAt[i] = 0;
  const t = e.indexOf(e.target[i]!);
  // A charge: double damage on everything the swing hits, and the smaller knocked back (Table 14).
  const charge = takeCharge(state, i);
  const damage = dealt(state, i, w.damage) * (charge ? 2 : 1);
  const blow = (d: number): Blow => ({ damage: d, from: e.id[i]!, projectile: false, blunt: w.blunt, pierce: w.hit === Hit.Stab });
  const tolerance = floorDiv(WU_PER_METRE, 2);
  const reach = { ...w, reach: w.reach + tolerance };
  if (t >= 0 && e.hp[t]! > 0 && canReach(state, i, t, reach)) {
    hurtUnit(state, t, blow(critDamage(state, i, t, w, damage)));
    if (charge) chargeKnock(state, i, t);
  }
  if (w.hit !== Hit.Arc) return;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, w.reach + WU_PER_METRE)) {
    if (j === t || j === i || e.hp[j]! <= 0 || !hostile(state, i, j)) continue;
    if (!canReach(state, i, j, w) || !inArc(state, i, e.x[j]!, e.z[j]!)) continue;
    hurtUnit(state, j, blow(Math.max(1, critDamage(state, i, j, w, damage) >> 1)));
    if (charge) chargeKnock(state, i, j);
  }
}

// ----- experience -----

/** XP needed for each warrior rank, tenths (Table 1: Soldier 50, Veteran 150, Elite 400, Hero 1000). */
export const WARRIOR_XP_TENTHS: readonly number[] = [0, 0, 500, 1500, 4000, 10000];
export const RANK_NAMES = {
  warrior: ['', 'Recruit', 'Soldier', 'Veteran', 'Elite', 'Hero'],
  worker: WORKER_RANK_NAMES,
  mage: MAGE_RANK_NAMES,
} as const;

/** Adds experience and ranks the unit up as far as it reaches (a worker's and a mage's by their own ladders). */
export function gainXp(state: SimState, i: number, tenths: number): void {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mage) {
    mageGainXp(state, i, tenths);
    return;
  }
  if (e.kind[i] === UnitKind.Worker) {
    workerGainXp(state, i, tenths);
    return;
  }
  e.xp[i] = e.xp[i]! + tenths;
  for (;;) {
    const r = e.rank[i]!;
    if (r >= 5) return;
    const need = WARRIOR_XP_TENTHS[r + 1]!;
    if (need === 0 || e.xp[i]! < need) return;
    e.rank[i] = r + 1;
    const hp = WARRIOR_HEALTH_BY_RANK[r + 1]!;
    e.hp[i] = e.hp[i]! + hp - e.maxHp[i]!;
    e.maxHp[i] = hp;
    state.events.push({ player: e.owner[i]!, kind: 'info', text: `${aTroop(e.troop[i]!, e.wTier[i]!, true)} has risen to ${RANK_NAMES.warrior[r + 1]}.`, x: e.x[i]!, z: e.z[i]! });
  }
}

/**
 * The experience a unit has and needs for its next rank, whole points, for
 * the page's XP bar (Patch 3): both count from nothing, as Table 1 writes
 * them (a Hand has 50 or more and needs 150 for Master worker); the need is
 * 0 at the top rank, and both are 0 for what never ranks. A mage past Adept
 * Acolyte banks hers until she trains, so hers can pass the need.
 */
export function rankXp(state: SimState, i: number): readonly [number, number] {
  const e = state.entities;
  const kind = e.kind[i]!;
  const ladder = kind === UnitKind.Worker ? WORKER_XP_TENTHS : kind === UnitKind.Warrior ? WARRIOR_XP_TENTHS : kind === UnitKind.Mage ? MAGE_XP_TENTHS : null;
  if (!ladder || e.owner[i]! >= state.players.length) return [0, 0];
  const r = e.rank[i]!;
  const top = kind === UnitKind.Mage ? MAGE_TOP_RANK : 5;
  return [floorDiv(e.xp[i]!, XP_TENTHS), r >= top ? 0 : floorDiv(ladder[r + 1] ?? 0, XP_TENTHS)];
}

/** The kill's experience, shared by the players' units that hit it in the last 10 s (rules: 2 x threat). */
function shareKill(state: SimState, i: number): number {
  const spec = mobSpec(state.entities.mob[i]!);
  // A small slime has no threat of its own: it is worth its health / 50; a loose bomb is worth nothing.
  // Daytime foes have no threat: theirs is the roster's (health / 50); lairs and huts give none for the kill (a lair's clearing does).
  const total = spec.threatTenths > 0 ? killXpTenths(spec.threatTenths, spec.hp) : spec.id === Mob.SmallSlime ? killXpTenths(null, spec.hp) : spec.xpTenths;
  return shareKillXp(state, i, total);
}

/** Shares a kill's experience among the players' units that hit it in the last 10 s; returns the player whose unit hit it last, or -1. */
export function shareKillXp(state: SimState, i: number, total: number): number {
  const e = state.entities;
  const list = e.hitters[i]!;
  const ids: number[] = [];
  for (let k = 0; k < list.length; k += 2) if (state.step - list[k + 1]! <= KILL_SHARE_WINDOW_STEPS) ids.push(list[k]!);
  let owner = -1;
  for (const [id, share] of shareXp(total, ids)) {
    const j = e.indexOf(id);
    if (j < 0 || e.hp[j]! <= 0) continue;
    gainXp(state, j, share);
  }
  // The last hitter's player takes the drops.
  if (ids.length > 0) {
    const j = e.indexOf(ids[ids.length - 1]!);
    if (j >= 0) owner = e.owner[j]!;
  }
  return owner;
}

// ----- deaths -----

/** Hooks the rest of the simulation adds for what happens when things fall (set by the modules that own them). */
export const deathHooks: {
  /** A mob died: drops (to the player whose unit hit it last, or -1 for none), splitting, bursting, a loose bomb. */
  mob: (state: SimState, i: number, takerPlayer: number) => void;
  /** A player unit died: what it had reserved goes back to the stock. */
  unit: (state: SimState, i: number) => void;
  /** A building fell. */
  building: (state: SimState, b: Building) => void;
  /** An animal died: its carcass (animals/animals.ts). */
  animal: (state: SimState, i: number) => void;
} = { mob: () => {}, unit: () => {}, building: () => {}, animal: () => {} };

/**
 * Settles everything that fell this step, in the order it fell: experience
 * and drops for mobs, then the units and buildings are removed. A fall can
 * cause more (a burst, a bomb, a shelter coming down), so this runs until
 * nothing more falls.
 */
export function settleDeaths(state: SimState): void {
  const e = state.entities;
  for (let round = 0; round < 16 && (state.dying.length > 0 || state.falling.length > 0); round++) {
    const units = state.dying;
    const buildings = state.falling;
    state.dying = [];
    state.falling = [];
    for (const id of units) {
      const i = e.indexOf(id);
      if (i < 0) continue;
      // Ran off (a mob fleeing the dawn): gone quietly.
      if (e.hp[i]! < 0) {
        e.remove(id);
        continue;
      }
      state.hits.push({ look: 'death', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id, kind: e.kind[i]!, mob: e.mob[i]!, heading: e.heading[i]! });
      if (e.kind[i] === UnitKind.Mob) {
        deathHooks.mob(state, i, shareKill(state, i));
      } else if (e.kind[i] === UnitKind.Animal) {
        deathHooks.animal(state, i);
      } else {
        deathHooks.unit(state, i);
        if (sideOf(state, i) === Side.Players) {
          const what = e.role[i] === Role.Mercenary ? 'A mercenary' : e.kind[i] === UnitKind.Warrior ? 'A warrior' : e.kind[i] === UnitKind.Mage ? 'A mage' : 'A worker';
          const text = e.kind[i] === UnitKind.Engine ? `A ${engineSpec(e.mob[i]!).name.toLowerCase()} has been destroyed.` : `${what} has been killed.`;
          state.events.push({ player: e.owner[i]!, kind: 'alert', text, x: e.x[i]!, z: e.z[i]! });
        }
      }
      e.remove(id);
    }
    let changed = false;
    for (const id of buildings) {
      const b = state.buildings.get(id);
      if (!b) continue;
      deathHooks.building(state, b);
      changed = true;
    }
    if (changed) computeEnclosed(state);
  }
}

/** Units of the players and the peoples, and buildings, within a radius of a point take a blast (monster blasts never hurt monsters). */
export function blast(state: SimState, x: number, y: number, z: number, units: { damage: number; radius: number }, buildings: { damage: number; radius: number } | null, from: number): void {
  const e = state.entities;
  state.hits.push({ look: buildings ? 'blast' : 'burst', x, y, z, id: from });
  for (const j of state.grid.nearOthers(x, z, units.radius)) {
    const side = sideOf(state, j);
    if (e.hp[j]! <= 0 || (side !== Side.Players && side !== Side.Peoples)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > units.radius + halfWidth(state, j)) continue;
    hurtUnit(state, j, { damage: units.damage, from, projectile: false, blunt: true, pierce: false });
  }
  if (!buildings) return;
  const r = buildings.radius;
  for (const b of state.buildings.list) {
    if (b.hp <= 0) continue;
    const [x0, z0, x1, z1] = solidRect(b);
    const c = 3600;
    const dx = x < x0 * c ? x0 * c - x : x > (x1 + 1) * c ? x - (x1 + 1) * c : 0;
    const dz = z < z0 * c ? z0 * c - z : z > (z1 + 1) * c ? z - (z1 + 1) * c : 0;
    const d = length2d(dx, dz);
    if (d > r) continue;
    // Full damage where it goes off, half at the edge of the blast (s).
    hurtBuilding(state, b, buildings.damage - floorDiv(buildings.damage * d, r * 2), x, y, z);
  }
}

export const BURST_BLAST = { damage: BURST.damage, radius: BURST.radius };
export const BOMB_UNITS = { damage: BLAST.unit, radius: BLAST.unitRadius };
export const BOMB_BUILDINGS = { damage: BLAST.building, radius: BLAST.buildingRadius };

/** The alert text when a building falls; walls only say so once per few seconds. */
export function fallText(b: Building): string {
  const spec = buildingSpec(b.kind);
  if (spec.defence === 'wall') return 'A wall has been broken.';
  return `${buildingName(b.kind, b.level, b.variant)} was destroyed.`;
}

