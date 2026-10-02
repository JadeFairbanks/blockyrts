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
import { BP, damageTaken, KILL_SHARE_WINDOW_STEPS, killXpTenths, rankDamageBonusBp, shareXp, totalArmourBp, withBonus } from '../rules.ts';
import { MONSTERS, OrderKind, UnitKind, WARRIOR_HEALTH_BY_RANK, type HitLook, type SimState } from '../state.ts';
import { Hit, itemSpec, toolMelee, type MeleeStats } from './items.ts';
import { BLAST, BURST, CLIMBING_DAMAGE_BP, Mob, mobSpec, Moves, SWOOP_HEIGHT } from './mobs.ts';

/** The two sides: every player together, and the monsters (Winning, losing and score: player versus environment only). */
export const Side = { Players: 0, Monsters: 1, None: -1 } as const;

export function sideOf(state: SimState, i: number): number {
  const o = state.entities.owner[i]!;
  if (o < state.players.length) return Side.Players;
  if (o === MONSTERS) return Side.Monsters;
  return Side.None;
}

/** Whether two units are on opposite sides. */
export function hostile(state: SimState, a: number, b: number): boolean {
  const sa = sideOf(state, a);
  const sb = sideOf(state, b);
  return sa !== Side.None && sb !== Side.None && sa !== sb;
}

const PERSON_HALF_WIDTH = floorDiv(WU_PER_METRE * 3, 10);
const PERSON_HEIGHT = floorDiv(WU_PER_METRE * 18, 10);

/** Half the width of a unit's hit box, wu (Simple hit shapes). */
export function halfWidth(state: SimState, i: number): number {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).halfWidth : PERSON_HALF_WIDTH;
}

export function bodyHeight(state: SimState, i: number): number {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob ? mobSpec(e.mob[i]!).height : PERSON_HEIGHT;
}

export function isMob(state: SimState, i: number): boolean {
  return state.entities.kind[i] === UnitKind.Mob;
}

/** A flying mob up at its cruising height (only ranged attacks and polearms reach it there). */
export function flyingHigh(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || mobSpec(e.mob[i]!).moves !== Moves.LowFlyer) return false;
  return e.y[i]! - state.world.topAt(floorDiv(e.x[i]!, 3600), floorDiv(e.z[i]!, 3600)) * WU_PER_TERRAIN_UNIT > SWOOP_HEIGHT * 2;
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
  for (const j of [a, b]) if (e.kind[j] === UnitKind.Mob && mobSpec(e.mob[j]!).moves === Moves.LowFlyer) return false;
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

/** Armour a unit wears, bp: the pieces add up, capped at 75% (Table 3: boots 3%). Mobs have the roster's. */
export function armourOf(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mob) return mobSpec(e.mob[i]!).armourBp;
  const pieces: number[] = [];
  if (e.boots[i]) pieces.push(itemSpec(e.boots[i]!).armourBp ?? 0);
  return totalArmourBp(pieces);
}

/** A shield blocks projectiles when the unit fights one-handed (Combat: One-handed weapons and shields). */
export function shieldBlock(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.shield[i]) return 0;
  const w = e.weapon[i]!;
  if (w && !itemSpec(w).melee?.oneHanded) return 0;
  return itemSpec(e.shield[i]!).blockBp ?? 0;
}

/** The melee weapon a unit of the players fights with now: its weapon, its backup, or its tool or fists. */
export function meleeOf(state: SimState, i: number, backup: boolean): MeleeStats {
  const e = state.entities;
  const id = backup ? e.backup[i]! : e.weapon[i]!;
  if (id) {
    const m = itemSpec(id).melee;
    if (m) return m;
  }
  if (!backup && e.backup[i]) {
    const m = itemSpec(e.backup[i]!).melee;
    if (m) return m;
  }
  return toolMelee(e.tool[i]!);
}

export interface Blow {
  damage: number;
  /** The entity that dealt it (0 for none). */
  from: number;
  projectile: boolean;
  blunt: boolean;
  /** Stabs, arrows, bolts and javelins: piercing (the roster's half damage for bones and slimes). */
  pierce: boolean;
}

function hitLook(state: SimState, i: number, blocked: boolean): HitLook {
  const e = state.entities;
  if (blocked) return 'wood';
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
  let modifierBp = BP;
  if (e.kind[i] === UnitKind.Mob) {
    const spec = mobSpec(e.mob[i]!);
    if (blow.blunt) modifierBp = spec.bluntBp;
    else if (blow.pierce) modifierBp = spec.pierceBp;
    if (e.climbUntil[i]! > state.step) modifierBp = floorDiv(modifierBp * CLIMBING_DAMAGE_BP, BP);
  }
  const block = blow.projectile ? shieldBlock(state, i) : 0;
  const d = damageTaken({ damage: blow.damage, armourBp: armourOf(state, i), modifierBp, projectile: blow.projectile, shieldBlockBp: block });
  e.hp[i] = e.hp[i]! - d;
  const fresh = e.hurtAt[i] === 0 || state.step - e.hurtAt[i]! > FRESH_HURT_STEPS;
  e.hurtAt[i] = state.step;
  if (blow.from) e.attacker[i] = blow.from;
  state.hits.push({ look: hitLook(state, i, block > 0), x: e.x[i]!, y: e.y[i]! + floorDiv(bodyHeight(state, i) * 2, 3), z: e.z[i]!, id: e.id[i]! });
  // The players' units that hit a mob in the last 10 s share its experience.
  if (e.kind[i] === UnitKind.Mob && blow.from) {
    const j = e.indexOf(blow.from);
    if (j >= 0 && sideOf(state, j) === Side.Players) noteHitter(state, i, blow.from);
  }
  if (e.hp[i]! <= 0) {
    e.hp[i] = 0;
    state.dying.push(e.id[i]!);
  } else if (blow.from) hurtHooks.unit(state, i, blow.from, fresh);
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

/** Damage a player unit deals with a weapon: +5% per rank above the first. A mob's grows 0.5% a night (its power). */
export function dealt(state: SimState, i: number, base: number): number {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mob) return floorDiv(base * e.power[i]!, 1000);
  return withBonus(base, rankDamageBonusBp(e.rank[i]!));
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
  e.target[i] = target;
  e.atkAt[i] = state.step + Math.max(1, floorDiv(attackSteps * 2, 5));
  e.atkNext[i] = state.step + attackSteps;
  e.atkWith[i] = withSlot;
  e.order[i] = OrderKind.Attack;
  state.hits.push({ look: 'swing', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

/** Whether a melee weapon can reach a target unit now (one-handed weapons only reach a flyer as it swoops). */
export function canReach(state: SimState, i: number, t: number, w: MeleeStats): boolean {
  if (flyingHigh(state, t) && w.oneHanded) return false;
  const g = gap(state, i, t);
  if (g > w.reach || g < w.min) return false;
  return w.reach >= OVER_WALL_REACH || !wallBetween(state, i, t);
}

/**
 * The key moment of a player unit's swing: a stab hits its target if it is
 * still in reach; any other swing hits the target in full and every other
 * enemy in reach within the 90 degree arc for half (Table 2d).
 */
export function landPlayerSwing(state: SimState, i: number, w: MeleeStats): void {
  const e = state.entities;
  e.atkAt[i] = 0;
  const t = e.indexOf(e.target[i]!);
  const damage = dealt(state, i, w.damage);
  const blow = (d: number): Blow => ({ damage: d, from: e.id[i]!, projectile: false, blunt: w.blunt, pierce: w.hit === Hit.Stab });
  const tolerance = floorDiv(WU_PER_METRE, 2);
  const reach = { ...w, reach: w.reach + tolerance, min: Math.max(0, w.min - tolerance) };
  if (t >= 0 && e.hp[t]! > 0 && canReach(state, i, t, reach)) hurtUnit(state, t, blow(damage));
  if (w.hit !== Hit.Arc) return;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, w.reach + WU_PER_METRE)) {
    if (j === t || j === i || e.hp[j]! <= 0 || !hostile(state, i, j)) continue;
    if (!canReach(state, i, j, w) || !inArc(state, i, e.x[j]!, e.z[j]!)) continue;
    hurtUnit(state, j, blow(Math.max(1, damage >> 1)));
  }
}

// ----- experience -----

/** XP needed for each warrior rank, tenths (Table 1: Soldier 50, Veteran 150, Elite 400, Hero 1000). */
export const WARRIOR_XP_TENTHS: readonly number[] = [0, 0, 500, 1500, 4000, 10000];
/** Workers reach Foreman and Elder only by combat: 400 and 1000 XP (Table 1). */
export const WORKER_COMBAT_XP_TENTHS: readonly number[] = [0, 0, 0, 0, 4000, 10000];
export const WORKER_HEALTH_BY_RANK_COMBAT: readonly number[] = [60, 60, 70, 80, 90, 100];
export const RANK_NAMES = {
  warrior: ['', 'Recruit', 'Soldier', 'Veteran', 'Elite', 'Hero'],
  worker: ['', 'Labourer', 'Hand', 'Master worker', 'Foreman', 'Elder'],
} as const;

/** Adds experience and ranks the unit up as far as it reaches. */
export function gainXp(state: SimState, i: number, tenths: number): void {
  const e = state.entities;
  e.xp[i] = e.xp[i]! + tenths;
  for (;;) {
    const r = e.rank[i]!;
    if (r >= 5) return;
    const warrior = e.kind[i] === UnitKind.Warrior;
    const need = warrior ? WARRIOR_XP_TENTHS[r + 1]! : WORKER_COMBAT_XP_TENTHS[r + 1]!;
    // Workers below Master rank up only by training.
    if (need === 0 || e.xp[i]! < need) return;
    e.rank[i] = r + 1;
    const hp = warrior ? WARRIOR_HEALTH_BY_RANK[r + 1]! : WORKER_HEALTH_BY_RANK_COMBAT[r + 1]!;
    e.hp[i] = e.hp[i]! + hp - e.maxHp[i]!;
    e.maxHp[i] = hp;
    const names = warrior ? RANK_NAMES.warrior : RANK_NAMES.worker;
    state.events.push({ player: e.owner[i]!, kind: 'info', text: `A ${warrior ? 'warrior' : 'worker'} has risen to ${names[r + 1]}.`, x: e.x[i]!, z: e.z[i]! });
  }
}

/** The kill's experience, shared by the players' units that hit it in the last 10 s (rules: 2 x threat). */
function shareKill(state: SimState, i: number): number {
  const e = state.entities;
  const spec = mobSpec(e.mob[i]!);
  const list = e.hitters[i]!;
  const ids: number[] = [];
  for (let k = 0; k < list.length; k += 2) if (state.step - list[k + 1]! <= KILL_SHARE_WINDOW_STEPS) ids.push(list[k]!);
  // A small slime has no threat of its own: it is worth its health / 50; a loose bomb is worth nothing.
  const total = spec.threatTenths > 0 ? killXpTenths(spec.threatTenths, spec.hp) : spec.id === Mob.SmallSlime ? killXpTenths(null, spec.hp) : 0;
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
} = { mob: () => {}, unit: () => {}, building: () => {} };

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
      } else {
        deathHooks.unit(state, i);
        if (sideOf(state, i) === Side.Players) {
          const what = e.kind[i] === UnitKind.Warrior ? 'A warrior' : 'A worker';
          state.events.push({ player: e.owner[i]!, kind: 'alert', text: `${what} has been killed.`, x: e.x[i]!, z: e.z[i]! });
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

/** Units and buildings of the players' side within a radius of a point take a blast (monster blasts never hurt monsters). */
export function blast(state: SimState, x: number, y: number, z: number, units: { damage: number; radius: number }, buildings: { damage: number; radius: number } | null, from: number): void {
  const e = state.entities;
  state.hits.push({ look: buildings ? 'blast' : 'burst', x, y, z, id: from });
  for (const j of state.grid.near(x, z, units.radius)) {
    if (e.hp[j]! <= 0 || sideOf(state, j) !== Side.Players) continue;
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

