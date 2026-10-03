// What the night's mobs do each step (Threats: night mobs; Monsters and
// terrain; the mob roster's abilities for nights 0 to 20; Day and night:
// sunburn and fleeing at dawn). A mob goes for the players' units that come
// within its sight and otherwise follows its kind's field to the town,
// attacking what stands in its way: walkers chew through, climbers go over
// (slowly, and not over a shut gate lit by a torch), flyers come straight
// in, and bombers blow up against walls, barriers or a crowd of troops.

import { buildingSpec } from '../buildings/data.ts';
import { buildingCentre, dist2, isLit, snuffLight } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { BIG_WALKER, CLIMBER, WALKER, type Mover } from '../nav/grid.ts';
import { pointGoal, TILE_COLUMNS } from '../nav/path.ts';
import { hash32 } from '../rng.ts';
import { burnThisStep } from '../rules.ts';
import { HOP_SLOW_BP, hoppingUp, landAt, MONSTERS, OrderKind, SIGHT_WU, standY, UnitKind, type SimState } from '../state.ts';
import { Mat } from '../world/materials.ts';
import { blast, BOMB_BUILDINGS, BOMB_UNITS, dealt, OVER_WALL_REACH, wallBetween, forward, gap, gapToBuilding, halfWidth, hurtBuilding, hurtUnit, Side, sideOf, bodyHeight } from './combat.ts';
import { costAt, fieldFor, MobClass, nextStep, UNREACHED } from './fields.ts';
import { Shot, spellShot } from './items.ts';
import { BLAST, bomber, CLUSTER, ENGULF_STEPS, flies, FLY_HEIGHT, GRASP, HIGH_FLY_HEIGHT, HOWL, Mob, mobSpec, Moves, SHOUT, Strike, Sun, SUNBURN_PER_MILLE_PER_SECOND, SWOOP, SWOOP_HEIGHT, WEB, type MobSpec } from './mobs.ts';
import { chargeKnock, startCharge, takeCharge } from '../mounts/riding.ts';
import { fireAt, hasClearLob, POISON, ProjectileFlag } from './projectiles.ts';
import { MANA_SCALE } from '../magic/spells.ts';
import { Ability, canUse, castSparkAt, castSparkAtBuilding, snuffEffect, spend, stumbleEffect } from '../threats/abilities.ts';
import { LAIR_LEASH_WU } from '../threats/data.ts';
import { fogged } from '../threats/fog.ts';
import { Role } from '../threats/types.ts';

/** How far a mob notices the players' units: its sight, 12 m (half on a fog night). */
const AGGRO_WU = SIGHT_WU[UnitKind.Mob];
/** It gives a unit up once it is this much farther away. */
const GIVE_UP_WU = AGGRO_WU + 8 * WU_PER_METRE;
/** Bats and hounds look farther for their prey (s): hounds run past the front line to reach workers. */
const HUNT_WU = 30 * WU_PER_METRE;
/** Goblins go for lit torches within this distance first (s). */
const TORCH_HUNT_WU = 40 * WU_PER_METRE;
/** Fine path searches the mobs may make each step, shared (s). */
export const MOB_SEARCHES_PER_STEP = 6;
/** A fine path is looked for again after this long. */
const REPATH_STEPS = 40;
/** A mob running from the sun is gone after this long, or once this far from the town (s). */
const FLEE_STEPS = 15 * STEPS_PER_SECOND;
const FLEE_GONE_WU = 80 * WU_PER_METRE;
/** A bomber goes off when this close to a unit of the crowd it went for. */
const BOMB_REACH_WU = floorDiv(WU_PER_METRE * 3, 2);
/** Hit tolerance at the key moment, as for the players' units. */
const TOLERANCE = WU_PER_METRE >> 1;
/** What a mob's attack under way is aimed at (atkWith): spells (a hex on a unit, a Snuff on a light) are cast like a shot. */
const With = { Unit: 0, Building: 1, Shot: 3, Web: 5, Snuff: 6, HexSpell: 7, SnuffSpell: 8, SparkSpell: 9 } as const;

/** The spells a goblin mage casts at a unit or a building (threats/foes.ts): Stumble hex, Snuff, and Spark toss at a building. */
export const SpellWith = { Hex: With.HexSpell, Snuff: With.SnuffSpell, Spark: With.SparkSpell } as const;

/** Whether an attack under way is a spell: the clip is the cast, and a Counterspell can stop it (Table 13). */
function spellAttack(spec: MobSpec, what: number): boolean {
  return what === With.HexSpell || what === With.SnuffSpell || what === With.SparkSpell || (what === With.Shot && spellShot(spec.shot));
}

/** A shot or spell under way shows the shooting clip. */
function shooting(what: number): boolean {
  return what === With.Shot || what === With.Web || what === With.HexSpell || what === With.SnuffSpell || what === With.SparkSpell;
}
/** An aimed mob (the depth weighting's extras, the dusk goblins) joins the night attack once this close to its point. */
const AIM_REACHED_WU = 8 * WU_PER_METRE;

/** What the daytime foes do (threats/foes.ts installs it): lair residents, tribesmen and village goblins. */
export const mobHooks: { foe: (state: SimState, i: number, spec: MobSpec) => void } = { foe: () => {} };

/**
 * The late night mobs' abilities (threats/late-mobs.ts installs them): what
 * a mob does before it fights (true when that took the step), its ranged
 * strike that does not fly, what its melee hit does beside its damage, its
 * blow on a building, and a damage multiplier for the blow about to land.
 */
export const lateHooks: {
  act: (state: SimState, i: number, spec: MobSpec, t: number) => boolean;
  strike: (state: SimState, i: number, spec: MobSpec, t: number) => void;
  hit: (state: SimState, i: number, spec: MobSpec, t: number, d: number) => void;
  building: (state: SimState, i: number, spec: MobSpec, b: Building) => void;
  hitMul: (state: SimState, i: number, spec: MobSpec) => number;
} = { act: () => false, strike: () => {}, hit: () => {}, building: () => {}, hitMul: () => 1 };

/** Not state: fine path searches made this step (reset by the step function). */
export const mobBudget = { searches: 0 };

export function classOf(spec: MobSpec): MobClass | -1 {
  if (spec.moves === Moves.Climber) return MobClass.Climber;
  if (spec.moves === Moves.Breaker) return MobClass.Breaker;
  if (spec.moves === Moves.Walker) return MobClass.Walker;
  return -1;
}

/** Big walking monsters (2.5 m and up) jump higher rises (Moving over the land: "scale with size") (s). */
const BIG_HEIGHT = floorDiv(250 * WU_PER_METRE, 100);

export function mobMover(spec: MobSpec): Mover {
  return spec.moves === Moves.Climber ? CLIMBER : spec.height >= BIG_HEIGHT ? BIG_WALKER : WALKER;
}

/** The middle of a player's town: their main base, else their first building, else null. */
export function townCentre(state: SimState, player: number): [number, number] | null {
  let first: Building | null = null;
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    if (b.kind === 0) return buildingCentre(b);
    first ??= b;
  }
  return first ? buildingCentre(first) : null;
}

/** How high a flyer travels over the ground: a high flyer far above a bat's height. */
function cruise(spec: MobSpec): number {
  return spec.moves === Moves.HighFlyer ? HIGH_FLY_HEIGHT : FLY_HEIGHT;
}

function groundAt(state: SimState, x: number, z: number): number {
  return state.world.topAt(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN)) * WU_PER_TERRAIN_UNIT;
}

/** A mob's speed this step: hastened by a hound's howl or a goblin chief's shout. */
function mobSpeed(state: SimState, i: number, spec: MobSpec): number {
  const e = state.entities;
  let bp = 10000;
  if (e.fastUntil[i]! > state.step) bp += e.fastBp[i]!;
  if (hoppingUp(state, i)) bp -= HOP_SLOW_BP;
  if (spec.id === Mob.GoblinCutter || spec.id === Mob.GoblinSlinger) {
    for (const j of state.grid.nearChiefs(e.x[i]!, e.z[i]!, SHOUT.radius)) {
      if (e.kind[j] === UnitKind.Mob && e.mob[j] === Mob.GoblinChief && e.hp[j]! > 0 && length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) <= SHOUT.radius) {
        bp += SHOUT.bonusBp;
        break;
      }
    }
  }
  return floorDiv(e.speed[i]! * bp, 10000);
}

/** Whether a unit is one a mob may go for: the players' or the neutral peoples' (never their buildings), alive and outside. */
export function playerUnit(state: SimState, j: number): boolean {
  const e = state.entities;
  if (e.hp[j]! <= 0 || e.inside[j] !== 0) return false;
  const side = sideOf(state, j);
  return side === Side.Players || (side === Side.Peoples && e.role[j] !== Role.Structure);
}

/** The players' unit a mob goes for: the one that hurt it, else the closest in sight (hounds: workers and archers first). */
function pickUnit(state: SimState, i: number, spec: MobSpec): number {
  const e = state.entities;
  const a = e.indexOf(e.attacker[i]!);
  if (a >= 0 && playerUnit(state, a) && state.step - e.hurtAt[i]! < 5 * STEPS_PER_SECOND && gap(state, i, a) <= GIVE_UP_WU) return a;
  const hunts = spec.id === Mob.GraveHound || spec.id === Mob.CaveBat;
  const aggro = fogged(state) ? AGGRO_WU >> 1 : AGGRO_WU;
  const range = hunts ? (fogged(state) ? HUNT_WU >> 1 : HUNT_WU) : aggro;
  let best = -1;
  let bestTier = 9;
  let bestD = 0;
  // Only units the monsters do not own can be prey: the same answer as near(), without the horde.
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, range)) {
    if (!playerUnit(state, j)) continue;
    const d = gap(state, i, j);
    if (d > range) continue;
    // Hounds want the soft targets: workers and archers before warriors in melee.
    const soft = e.kind[j] === UnitKind.Worker || e.ranged[j] !== 0;
    const tier = spec.id === Mob.GraveHound ? (soft ? 0 : d <= aggro ? 1 : 9) : d <= aggro || hunts ? 0 : 9;
    if (tier === 9) continue;
    if (tier < bestTier || (tier === bestTier && (d < bestD || (d === bestD && e.id[j]! < e.id[best]!)))) {
      best = j;
      bestTier = tier;
      bestD = d;
    }
  }
  return best;
}

/** Goblins want lit torches: the closest of the foe's lit lights within reach of their hunt, or undefined. */
function pickTorch(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  const r2 = TORCH_HUNT_WU * TORCH_HUNT_WU;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length || !isLit(b, state.step)) continue;
    const [x, z] = buildingCentre(b);
    const d = dist2(x, z, e.x[i]!, e.z[i]!);
    if (d > r2 || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Whether a shut gate is lit by one of its owner's torches (rats and spiders will not climb it). */
function litGate(state: SimState, b: Building): boolean {
  if (buildingSpec(b.kind).defence !== 'gate') return false;
  const [gx, gz] = buildingCentre(b);
  for (const l of state.buildings.list) {
    const light = buildingSpec(l.kind).light;
    if (!light || l.owner !== b.owner || !isLit(l, state.step)) continue;
    const [lx, lz] = buildingCentre(l);
    const r = light.lightM * WU_PER_METRE;
    if (dist2(lx, lz, gx, gz) <= r * r) return true;
  }
  return false;
}

const MOVED = 0;
const BLOCKED_BUILDING = 1;
const BLOCKED_LAND = 2;

/**
 * One step straight towards a point on the ground. Returns MOVED, or what
 * stood in the way: a building (its id in `blocker`) or the land.
 */
function stepMob(state: SimState, i: number, spec: MobSpec, px: number, pz: number, speed: number, blocker: { id: number }): number {
  const e = state.entities;
  const dx = px - e.x[i]!;
  const dz = pz - e.z[i]!;
  const d = length2d(dx, dz);
  if (d === 0) return MOVED;
  const s = Math.min(speed, d);
  const nx = e.x[i]! + floorDiv(dx * s, d);
  const nz = e.z[i]! + floorDiv(dz * s, d);
  e.heading[i] = headingTowards(dx, dz);
  if (flies(spec)) {
    // A flyer's height follows it in fly(): it glides down and climbs rather than jumping.
    e.x[i] = nx;
    e.z[i] = nz;
    e.order[i] = OrderKind.Move;
    return MOVED;
  }
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const ncx = floorDiv(nx, WU_PER_COLUMN);
  const ncz = floorDiv(nz, WU_PER_COLUMN);
  if (ncx !== cx || ncz !== cz) {
    const mover = mobMover(spec);
    const lv = floorDiv(e.y[i]!, WU_PER_TERRAIN_UNIT);
    if (state.nav.stepCost(cx, cz, ncx, ncz, mover, lv) < 0) {
      // A building in the way (on the column ahead, or either side of a diagonal)?
      for (const [x, z] of [[ncx, ncz], [ncx, cz], [cx, ncz]] as const) {
        const b = state.buildings.solidAt(x, z);
        if (b !== 0) {
          blocker.id = b;
          return BLOCKED_BUILDING;
        }
      }
      // Slide along whichever axis is open.
      if (ncx !== cx && state.nav.stepCost(cx, cz, ncx, cz, mover, lv) >= 0) return slide(state, i, nx, e.z[i]!);
      if (ncz !== cz && state.nav.stepCost(cx, cz, cx, ncz, mover, lv) >= 0) return slide(state, i, e.x[i]!, nz);
      return BLOCKED_LAND;
    }
  }
  landAt(state, i, nx, nz);
  e.order[i] = OrderKind.Move;
  return MOVED;
}

function slide(state: SimState, i: number, x: number, z: number): number {
  const e = state.entities;
  landAt(state, i, x, z);
  e.order[i] = OrderKind.Move;
  return MOVED;
}

/**
 * Walks towards a point, round the land in the way by a short fine path
 * when going straight is blocked. Returns what blocked it, if anything.
 */
function goToward(state: SimState, i: number, spec: MobSpec, px: number, pz: number, blocker: { id: number }): number {
  const e = state.entities;
  const speed = mobSpeed(state, i, spec);
  const pts = e.path[i]!;
  // Following a detour round the land.
  if (pts.length > 0 && e.pathAt[i]! * 2 < pts.length && state.step < e.waitUntil[i]!) {
    const k = e.pathAt[i]! * 2;
    const r = stepMob(state, i, spec, pts[k]!, pts[k + 1]!, speed, blocker);
    if (r === MOVED) {
      if (e.x[i] === pts[k] && e.z[i] === pts[k + 1]) e.pathAt[i] = e.pathAt[i]! + 1;
      return MOVED;
    }
    e.path[i] = [];
    return r;
  }
  const r = stepMob(state, i, spec, px, pz, speed, blocker);
  if (r !== BLOCKED_LAND) return r;
  if (mobBudget.searches >= MOB_SEARCHES_PER_STEP) return MOVED;
  mobBudget.searches++;
  const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
  const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
  const found = state.paths.find(mobMover(spec), cx, cz, { ...pointGoal(floorDiv(px, WU_PER_COLUMN), floorDiv(pz, WU_PER_COLUMN)), max: 1 }, state.nav.layerAt(cx, cz, floorDiv(e.y[i]!, WU_PER_TERRAIN_UNIT)));
  if (found.points.length === 0) return BLOCKED_LAND;
  const out: number[] = [];
  for (let k = 0; k < found.points.length; k++) out.push(found.points[k]! * WU_PER_COLUMN + (WU_PER_COLUMN >> 1));
  e.path[i] = out;
  e.pathAt[i] = 0;
  e.waitUntil[i] = state.step + REPATH_STEPS;
  return MOVED;
}

/** Starts a mob's attack on a unit, a building or with a shot; it lands at 40% of its attack time. */
function begin(state: SimState, i: number, spec: MobSpec, target: number, withWhat: number, steps = spec.attackSteps): void {
  const e = state.entities;
  // A fiend in its fury attacks 40% faster (roster 5.13).
  if (spec.id === Mob.Fiend && e.hp[i]! * 10 < e.maxHp[i]! * 3) steps = Math.max(1, floorDiv(steps * 10, 14));
  e.target[i] = target;
  e.atkAt[i] = state.step + Math.max(1, floorDiv(steps * 2, 5));
  e.atkNext[i] = state.step + steps;
  e.atkWith[i] = withWhat;
  e.order[i] = shooting(withWhat) ? OrderKind.Shoot : OrderKind.Attack;
  // A bat swoops down to strike (fly() takes it down); a high flyer is low for 2 s while it does (roster: the gravewing's snatch).
  if (spec.moves === Moves.HighFlyer && withWhat === With.Unit) e.lowUntil[i] = state.step + 2 * STEPS_PER_SECOND;
  // A wolf rider's run makes this a charge (Table 14).
  if (withWhat === With.Unit) startCharge(state, i);
}

/** A mob begins casting a spell at a unit or a light (the target's entity or building id): it stands and casts for 40% of its attack time. */
export function beginSpell(state: SimState, i: number, target: number, what: number): void {
  begin(state, i, mobSpec(state.entities.mob[i]!), target, what);
}

/** Whether a mob is casting a spell now, one a Counterspell can stop. */
export function castingSpell(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0 || e.atkAt[i] === 0 || e.atkAt[i]! <= state.step) return false;
  return spellAttack(mobSpec(e.mob[i]!), e.atkWith[i]!);
}

/** A Counterspell stops a mob's spell: nothing lands, and its mana and cooldown are still spent (Table 13). */
export function cancelSpell(state: SimState, i: number): void {
  const e = state.entities;
  const spec = mobSpec(e.mob[i]!);
  // Spark toss pays when it lands; stopped, it pays now.
  if ((e.atkWith[i] === With.Shot && spec.shot === Shot.Spark) || e.atkWith[i] === With.SparkSpell) spend(state, i, Ability.SparkToss);
  e.atkAt[i] = 0;
  e.order[i] = OrderKind.Idle;
}

/** The key moment of a mob's attack. */
function land(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const what = e.atkWith[i]!;
  e.atkAt[i] = 0;
  const id = e.target[i]!;
  // A goblin mage's spells land when the cast is done (their mana went when it began).
  if (what === With.SnuffSpell) {
    const b = state.buildings.get(id);
    if (b) snuffEffect(state, i, b);
    return;
  }
  if (what === With.HexSpell) {
    const t = e.indexOf(id);
    if (t >= 0 && e.hp[t]! > 0) stumbleEffect(state, i, t);
    return;
  }
  if (what === With.SparkSpell) {
    const b = state.buildings.get(id);
    if (b && b.hp > 0) castSparkAtBuilding(state, i, b);
    return;
  }
  if (what === With.Snuff) {
    // A raiding goblin puts a light out (Table 17: raids put out lights on the way).
    const b = state.buildings.get(id);
    if (b && gapToBuilding(state, i, b) <= spec.reach + TOLERANCE && snuffLight(state, b)) {
      const [x, z] = buildingCentre(b);
      state.events.push({ player: b.owner, kind: 'alert', text: `Goblins put out a ${buildingSpec(b.kind).name.toLowerCase()}. A worker can relight it.`, x, z });
    }
    return;
  }
  if (what === With.Building) {
    const b = state.buildings.get(id);
    if (!b || gapToBuilding(state, i, b) > spec.reach + TOLERANCE) return;
    let dmg = floorDiv(spec.vsWalls * e.power[i]!, 1000);
    // Rats gnaw wooden gates for double (roster).
    if (spec.id === Mob.GiantRat && buildingSpec(b.kind).defence === 'gate' && buildingSpec(b.kind).wooden !== false) dmg *= 2;
    hurtBuilding(state, b, dmg, e.x[i]!, e.y[i]! + floorDiv(spec.height, 2), e.z[i]!);
    lateHooks.building(state, i, spec, b);
    return;
  }
  const t = e.indexOf(id);
  if (t < 0 || !playerUnit(state, t)) return;
  const fromY = e.y[i]! + floorDiv(spec.height * 2, 3);
  if (what === With.Shot) {
    // A goblin mage's ranged attack is its Spark toss, paid in mana.
    if (spec.shot === Shot.Spark) {
      castSparkAt(state, i, t);
      return;
    }
    // A curse, a draining beam or a line of breath lands at once (roster 5.10, 5.20, 5.21).
    if (spec.strike !== Strike.Shot) {
      lateHooks.strike(state, i, spec, t);
      return;
    }
    const flags = spec.shot === Shot.GoblinStone ? ProjectileFlag.Blunt : spellShot(spec.shot) ? ProjectileFlag.Spell : 0;
    fireAt(state, i, e.x[i]!, fromY, e.z[i]!, t, spec.shot, dealt(state, i, spec.damage), spec.spreadBp, flags);
    return;
  }
  if (what === With.Web) {
    fireAt(state, i, e.x[i]!, fromY, e.z[i]!, t, Shot.Web, 0, spec.spreadBp, ProjectileFlag.Web);
    e.abilityAt[i] = state.step + WEB.cooldown;
    return;
  }
  if (!inReach(state, i, t, { ...spec, reach: spec.reach + TOLERANCE })) return;
  // A charge doubles the blow and throws the smaller back (Table 14); a hidden void stalker's first strike is triple.
  const charge = takeCharge(state, i);
  const blow = { damage: dealt(state, i, spec.damage) * (charge ? 2 : 1) * lateHooks.hitMul(state, i, spec), from: e.id[i]!, projectile: false, blunt: false, pierce: false };
  if (spec.slamRadius > 0) {
    // The Rift colossus's ground slam: everything within 6 m.
    state.hits.push({ look: 'blast', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
    for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, spec.slamRadius + WU_PER_METRE)) {
      if (!playerUnit(state, j) || gap(state, i, j) > spec.slamRadius) continue;
      lateHooks.hit(state, i, spec, j, hurtUnit(state, j, blow));
    }
    return;
  }
  if (spec.arc) {
    // A bloated corpse's swing hits everything in front of it.
    const [fx, fz] = forward(e.heading[i]!);
    for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, spec.reach + WU_PER_METRE)) {
      if (!playerUnit(state, j) || gap(state, i, j) > spec.reach + TOLERANCE || wallBetween(state, i, j)) continue;
      const dx = e.x[j]! - e.x[i]!;
      const dz = e.z[j]! - e.z[i]!;
      if (j !== t && dx * fx + dz * fz < length2d(dx, dz) * 46341) continue;
      const d = hurtUnit(state, j, blow);
      if (charge) chargeKnock(state, i, j);
      lateHooks.hit(state, i, spec, j, d);
    }
  } else {
    const d = hurtUnit(state, t, blow);
    if (charge) chargeKnock(state, i, t);
    lateHooks.hit(state, i, spec, t, d);
    // A giant centipede's bite poisons (roster 6.1): more damage over 5 s.
    if (d > 0 && spec.poison > 0 && e.hp[t]! > 0) {
      e.dotLeft[t] = (e.dotUntil[t]! > state.step ? e.dotLeft[t]! : 0) + spec.poison;
      e.dotUntil[t] = state.step + POISON.steps;
      e.dotFrom[t] = e.id[i]!;
    }
  }
  if (spec.id === Mob.Zombie) {
    // Grasp: slowed by 20% for 2 s.
    e.slowUntil[t] = state.step + GRASP.steps;
    e.slowBp[t] = GRASP.slowBp;
  }
  if (spec.id === Mob.Slime && e.kind[t] === UnitKind.Worker) {
    // Engulf: a worker is held still for 2 s.
    e.heldUntil[t] = state.step + ENGULF_STEPS;
    e.heldUntil[i] = state.step + ENGULF_STEPS;
  }
}

/** A bomber or a loose bomb goes off: walls and buildings within 2.5 m, units within 3 m; against bare land it caves the edge in. */
export function explode(state: SimState, i: number, breach: boolean): void {
  const e = state.entities;
  blast(state, e.x[i]!, e.y[i]! + WU_PER_METRE, e.z[i]!, BOMB_UNITS, BOMB_BUILDINGS, e.id[i]!);
  if (breach) caveIn(state, e.x[i]!, e.z[i]!, BLAST.buildingRadius);
  // Went off by itself: no loose bomb is left behind.
  e.fuseAt[i] = 1;
  e.hitters[i] = [];
  if (e.hp[i]! > 0) {
    e.hp[i] = 0;
    state.dying.push(e.id[i]!);
  }
}

/**
 * Smashing terrain into a crossing (Monsters and terrain): the columns
 * within the radius settle to their average height, the high ones knocked
 * down into the low ones, so no earth is made or lost.
 */
export function caveIn(state: SimState, x: number, z: number, radius: number): void {
  const w = state.world;
  const cols: Array<[number, number, number]> = [];
  const r = floorDiv(radius, WU_PER_COLUMN);
  const cx = floorDiv(x, WU_PER_COLUMN);
  const cz = floorDiv(z, WU_PER_COLUMN);
  let sum = 0;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      if (state.buildings.footprintAt(cx + dx, cz + dz) !== 0) continue;
      const top = w.topAt(cx + dx, cz + dz);
      cols.push([cx + dx, cz + dz, top]);
      sum += top;
    }
  }
  if (cols.length === 0) return;
  const level = floorDiv(sum, cols.length);
  for (const [qx, qz, top] of cols) {
    if (top > level) w.editBox(qx, qz, qx, qz, level, top, Mat.Air);
    else if (top < level) w.editBox(qx, qz, qx, qz, top, level, Mat.Soil);
  }
  state.hits.push({ look: 'stone', x, y: level * WU_PER_TERRAIN_UNIT, z, id: 0 });
}

/** Whether a mob can reach a unit with its melee attack now. */
function inReach(state: SimState, i: number, t: number, spec: MobSpec): boolean {
  return gap(state, i, t) <= spec.reach && (spec.reach >= OVER_WALL_REACH || !wallBetween(state, i, t));
}

/** A crowd of 5 or more of the players' units within 8 m: its middle, or null. */
function crowdNear(state: SimState, i: number): [number, number] | null {
  const e = state.entities;
  let n = 0;
  let sx = 0;
  let sz = 0;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, CLUSTER.radius)) {
    if (!playerUnit(state, j) || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > CLUSTER.radius) continue;
    n++;
    sx += e.x[j]!;
    sz += e.z[j]!;
  }
  return n >= CLUSTER.units ? [floorDiv(sx, n), floorDiv(sz, n)] : null;
}

/** What a mob does when something blocks its way: climb it, blow it up, or break it. */
function blocked(state: SimState, i: number, spec: MobSpec, r: number, blocker: { id: number }): void {
  const e = state.entities;
  if (bomber(spec)) {
    explode(state, i, r === BLOCKED_LAND);
    return;
  }
  if (r === BLOCKED_LAND && spec.moves === Moves.Breaker) {
    // Every other breaker smashes the land in its way into a crossing, one blow at a time.
    if (state.step >= e.atkNext[i]!) {
      const [fx, fz] = forward(e.heading[i]!);
      caveIn(state, e.x[i]! + floorDiv(fx * WU_PER_COLUMN, 65536), e.z[i]! + floorDiv(fz * WU_PER_COLUMN, 65536), BLAST.buildingRadius);
      e.atkNext[i] = state.step + spec.attackSteps;
      e.order[i] = OrderKind.Attack;
    }
    return;
  }
  if (r !== BLOCKED_BUILDING) return;
  const b = state.buildings.get(blocker.id);
  if (!b) return;
  // A cinderling climbs wooden walls only (roster 5.11).
  const climbable = !spec.woodClimber || buildingSpec(b.kind).wooden !== false;
  if (spec.moves === Moves.Climber && climbable && b.owner < state.players.length && !litGate(state, b) && startClimb(state, i, spec, b)) return;
  if (spec.vsWalls > 0 && state.step >= e.atkNext[i]!) begin(state, i, spec, b.id, With.Building);
}

/** Climbs over a building: slow, and the mob comes down on its far side. */
function startClimb(state: SimState, i: number, spec: MobSpec, b: Building): boolean {
  const e = state.entities;
  const [fx, fz] = forward(e.heading[i]!);
  let x = e.x[i]!;
  let z = e.z[i]!;
  // March on in the direction it faces until past the building.
  for (let k = 0; k < 24; k++) {
    x += floorDiv(fx * (WU_PER_COLUMN >> 1), 65536);
    z += floorDiv(fz * (WU_PER_COLUMN >> 1), 65536);
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    if (state.buildings.solidAt(cx, cz) !== 0) continue;
    if (!state.nav.standable(cx, cz, WALKER)) return false;
    const height = floorDiv(buildingSpec(b.kind).heightCm * WU_PER_METRE, 100);
    e.climbUntil[i] = state.step + Math.max(1, floorDiv(height, Math.max(1, spec.climbSpeed)));
    e.climbX[i] = x;
    e.climbZ[i] = z;
    e.y[i] = b.y * WU_PER_TERRAIN_UNIT + (height >> 1);
    e.order[i] = OrderKind.Climb;
    return true;
  }
  return false;
}

/** Sends a mob for its foe's town along its kind's field. */
function marchOnTown(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const blocker = { id: 0 };
  // Sent for a point first: it walks there, then joins the attack on the town.
  if (e.role[i] === Role.Aimed) {
    if (length2d(e.homeX[i]! - e.x[i]!, e.homeZ[i]! - e.z[i]!) > AIM_REACHED_WU) {
      walkMob(state, i, spec, e.homeX[i]!, e.homeZ[i]!);
      return;
    }
    e.role[i] = Role.Night;
  }
  const cls = classOf(spec);
  const town = townCentre(state, e.foe[i]!);
  if (!town) {
    e.order[i] = OrderKind.Idle;
    return;
  }
  let px = town[0];
  let pz = town[1];
  if (cls !== -1) {
    const f = fieldFor(state, e.foe[i]!, cls);
    const tx = floorDiv(e.x[i]!, WU_PER_COLUMN * TILE_COLUMNS);
    const tz = floorDiv(e.z[i]!, WU_PER_COLUMN * TILE_COLUMNS);
    if (f) {
      const here = costAt(f, tx, tz);
      if (here === 0) {
        // At a building it came for: break it.
        const b = goalNear(state, i);
        if (b) {
          if (gapToBuilding(state, i, b) <= spec.reach) {
            if (bomber(spec)) explode(state, i, false);
            else if (state.step >= e.atkNext[i]!) begin(state, i, spec, b.id, With.Building);
            return;
          }
          [px, pz] = buildingCentre(b);
        }
      } else if (here !== UNREACHED) {
        const next = nextStep(state, f, tx, tz);
        if (next) [px, pz] = next;
      }
    }
  }
  const r = goToward(state, i, spec, px, pz, blocker);
  if (r !== MOVED) blocked(state, i, spec, r, blocker);
}

/** The closest of its foe's buildings to a mob, within a few metres. */
function goalNear(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.foe[i]) continue;
    const d = gapToBuilding(state, i, b);
    if (d > 6 * WU_PER_METRE || (best && d >= bestD)) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Runs from the dawn (or with loot): away from the town, gone after a while or once far enough. */
function flee(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  e.timer[i] = e.timer[i]! + 1;
  const town = townCentre(state, e.foe[i]!) ?? [0, 0];
  const dx = e.x[i]! - town[0];
  const dz = e.z[i]! - town[1];
  if (e.timer[i]! > FLEE_STEPS || length2d(dx, dz) > FLEE_GONE_WU) {
    vanish(state, i);
    return;
  }
  const d = Math.max(1, length2d(dx, dz));
  const blocker = { id: 0 };
  goToward(state, i, spec, e.x[i]! + floorDiv(dx * 20 * WU_PER_METRE, d), e.z[i]! + floorDiv(dz * 20 * WU_PER_METRE, d), blocker);
  e.order[i] = OrderKind.Flee;
}

/** Leaves the game quietly (ran off): no death, no experience, no drops. */
export function vanish(state: SimState, i: number): void {
  const e = state.entities;
  if (e.hp[i]! < 0) return;
  e.hp[i] = -1;
  state.dying.push(e.id[i]!);
}

/** One step of one mob; a flyer then settles its height and swoop. */
export function runMob(state: SimState, i: number): void {
  const e = state.entities;
  if (e.hp[i]! <= 0) return;
  actMob(state, i, mobSpec(e.mob[i]!));
  // Its kind may have changed (Morvath takes to the air).
  const spec = mobSpec(e.mob[i]!);
  if (flies(spec) && e.hp[i]! > 0) fly(state, i, spec);
}

function actMob(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  e.order[i] = OrderKind.Idle;
  // Lairs, huts, fire pits and totems stand and are broken.
  if (spec.role === Role.Structure) return;
  if (spec.id === Mob.BombKeg) {
    if (state.step >= e.fuseAt[i]!) explode(state, i, false);
    return;
  }
  // The foe was eliminated: go for whoever is left.
  if (state.players[e.foe[i]!]?.out) {
    const next = state.players.findIndex((p) => !p.out);
    if (next < 0) return;
    e.foe[i] = next;
  }
  if (e.fleeing[i]) {
    flee(state, i, spec);
    return;
  }
  if (e.climbUntil[i] !== 0) {
    if (state.step < e.climbUntil[i]!) {
      e.order[i] = OrderKind.Climb;
      return;
    }
    e.x[i] = e.climbX[i]!;
    e.z[i] = e.climbZ[i]!;
    e.y[i] = standY(state, e.x[i]!, e.z[i]!);
    e.climbUntil[i] = 0;
  }
  if (e.atkAt[i] !== 0) {
    if (state.step < e.atkAt[i]!) {
      e.order[i] = shooting(e.atkWith[i]!) ? OrderKind.Shoot : OrderKind.Attack;
      return;
    }
    land(state, i, spec);
  }
  if (e.heldUntil[i]! > state.step) return;
  if (state.step < e.atkNext[i]!) {
    // Recovering from its last attack: it stands, facing its target.
    e.order[i] = OrderKind.Idle;
    return;
  }
  if (e.role[i]! >= Role.Resident) {
    mobHooks.foe(state, i, spec);
    return;
  }
  const blocker = { id: 0 };
  if (bomber(spec)) {
    const crowd = crowdNear(state, i);
    if (crowd) {
      for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, BOMB_REACH_WU)) {
        if (playerUnit(state, j) && gap(state, i, j) <= BOMB_REACH_WU) {
          explode(state, i, false);
          return;
        }
      }
      const r = goToward(state, i, spec, crowd[0], crowd[1], blocker);
      if (r !== MOVED) blocked(state, i, spec, r, blocker);
      return;
    }
    marchOnTown(state, i, spec);
    return;
  }
  // Goblins put out torches first.
  if (spec.id === Mob.GoblinCutter || spec.id === Mob.GoblinChief) {
    const torch = pickTorch(state, i);
    if (torch && pickUnit(state, i, spec) < 0) {
      if (gapToBuilding(state, i, torch) <= spec.reach) begin(state, i, spec, torch.id, With.Building);
      else {
        const [x, z] = buildingCentre(torch);
        const r = goToward(state, i, spec, x, z, blocker);
        if (r !== MOVED) blocked(state, i, spec, r, blocker);
      }
      return;
    }
  }
  let t = e.indexOf(e.target[i]!);
  if (t < 0 || !playerUnit(state, t) || gap(state, i, t) > GIVE_UP_WU) t = pickUnit(state, i, spec);
  if (spec.firstNight >= LATE_FIRST_NIGHT && lateHooks.act(state, i, spec, t)) return;
  if (t < 0) {
    e.target[i] = 0;
    marchOnTown(state, i, spec);
    return;
  }
  engageUnit(state, i, spec, t);
}

// ----- flying -----

/**
 * A flyer's height and swoop each step (Jade's patch notes 1: bats dropped
 * onto their prey in one step). Its height eases towards where it wants to
 * be, diving at SWOOP.diveSpeed and climbing at SWOOP.climbSpeed: down to
 * its swoop height while it strikes a unit, or once it is near enough to
 * glide in at its speed; at its pull-off height between strikes; else up at
 * its cruising height. While a strike is under way it closes in on its prey;
 * between strikes it pulls off to a point round the prey picked afresh for
 * each swoop, so no two swoops take the same path. A low flyer in its swoop
 * stays within reach of every weapon (lowUntil), as when it hovered low.
 */
function fly(state: SimState, i: number, spec: MobSpec): void {
  const e = state.entities;
  const now = state.step;
  const t = e.indexOf(e.target[i]!);
  const prey = !e.fleeing[i] && t >= 0 && e.hp[t]! > 0 && e.kind[t] !== UnitKind.Mob ? t : -1;
  const striking = prey >= 0 && e.atkAt[i] !== 0 && e.atkWith[i] === With.Unit;
  const pulling = prey >= 0 && !striking && now < e.atkNext[i]! && e.atkWith[i] === With.Unit;
  const ground = groundAt(state, e.x[i]!, e.z[i]!);
  const above = e.y[i]! - ground;
  const high = spec.moves === Moves.HighFlyer;
  let want = cruise(spec);
  if (prey >= 0) {
    const reach = spec.reach + halfWidth(state, prey);
    const h = hash32(state.seed, e.id[i]!, e.atkNext[i]!);
    if (striking) {
      want = SWOOP_HEIGHT;
      // In to strike, from whichever side it came.
      flyNear(state, i, spec, prey, floorDiv(reach * SWOOP.closePct, 100), -1);
    } else if (pulling) {
      want = high ? (e.lowUntil[i]! > now ? SWOOP_HEIGHT : cruise(spec)) : floorDiv((SWOOP.pullLowCm + ((h >>> 16) & 0xff) % (SWOOP.pullHighCm - SWOOP.pullLowCm + 1)) * WU_PER_METRE, 100);
      // Away and round to this swoop's point: any side of its prey, at its own distance.
      flyNear(state, i, spec, prey, floorDiv(reach * (SWOOP.pullMinPct + (h >>> 24) % (SWOOP.pullMaxPct - SWOOP.pullMinPct + 1)), 100), h & 0xffff);
    } else if (gap(state, i, prey) - spec.reach <= floorDiv(Math.max(0, above - SWOOP_HEIGHT) * e.speed[i]!, SWOOP.diveSpeed) + WU_PER_METRE) {
      // Near enough to glide down onto it at its speed.
      want = SWOOP_HEIGHT;
    }
    if (!high && (striking || pulling || gap(state, i, prey) <= spec.reach + WU_PER_METRE)) e.lowUntil[i] = now + 2;
  }
  // Ease towards that height, never below its swoop height over the land.
  const y = ground + want;
  let ny = e.y[i]! > y ? Math.max(y, e.y[i]! - SWOOP.diveSpeed) : Math.min(y, e.y[i]! + SWOOP.climbSpeed);
  ny = Math.max(ny, ground + Math.min(want, SWOOP_HEIGHT));
  e.y[i] = ny;
}

/**
 * Flies a flyer towards a point `r` from its prey, at its speed: in a
 * heading given (0 to 65535), or on the line it holds now (-1).
 */
function flyNear(state: SimState, i: number, spec: MobSpec, prey: number, r: number, heading: number): void {
  const e = state.entities;
  const px = e.x[prey]!;
  const pz = e.z[prey]!;
  let ux: number;
  let uz: number;
  if (heading >= 0) {
    [ux, uz] = forward(heading);
  } else {
    const d = length2d(e.x[i]! - px, e.z[i]! - pz);
    if (d === 0) return;
    ux = floorDiv((e.x[i]! - px) * 65536, d);
    uz = floorDiv((e.z[i]! - pz) * 65536, d);
  }
  const tx = px + floorDiv(ux * r, 65536);
  const tz = pz + floorDiv(uz * r, 65536);
  const dx = tx - e.x[i]!;
  const dz = tz - e.z[i]!;
  const d = length2d(dx, dz);
  if (d === 0) return;
  const s = Math.min(mobSpeed(state, i, spec), d);
  e.x[i] = e.x[i]! + floorDiv(dx * s, d);
  e.z[i] = e.z[i]! + floorDiv(dz * s, d);
  // It faces where it flies while it pulls off, and its prey as it comes in.
  e.heading[i] = heading >= 0 ? headingTowards(dx, dz) : headingTowards(px - e.x[i]!, pz - e.z[i]!);
}

/** The mobs with abilities of their own in threats/late-mobs.ts come from night 25. */
const LATE_FIRST_NIGHT = 25;

/** Walks a mob towards a point, dealing with what blocks it; true once within a metre. */
export function walkMob(state: SimState, i: number, spec: MobSpec, x: number, z: number): boolean {
  const e = state.entities;
  if (length2d(x - e.x[i]!, z - e.z[i]!) <= WU_PER_METRE) return true;
  const blocker = { id: 0 };
  const r = goToward(state, i, spec, x, z, blocker);
  if (r !== MOVED) blocked(state, i, spec, r, blocker);
  return false;
}

/** Goes for a building: breaks it once in reach (or, with `snuff`, puts out the light), else walks to it. */
export function attackBuilding(state: SimState, i: number, spec: MobSpec, b: Building, snuff = false): void {
  if (gapToBuilding(state, i, b) <= Math.max(spec.reach, WU_PER_METRE)) {
    const [x, z] = buildingCentre(b);
    face2(state, i, x, z);
    begin(state, i, spec, b.id, snuff ? With.Snuff : With.Building);
    return;
  }
  const [x, z] = buildingCentre(b);
  walkMob(state, i, spec, x, z);
}

/** Fights one of the players' units: shoots from range, strikes in reach, else closes in. */
export function engageUnit(state: SimState, i: number, spec: MobSpec, t: number): void {
  const e = state.entities;
  const blocker = { id: 0 };
  e.target[i] = e.id[t]!;
  if (spec.id === Mob.GraveHound && state.step >= e.abilityAt[i]!) howl(state, i);
  const d = gap(state, i, t);
  // Ranged mobs shoot from range; spiders spit web when it is ready.
  if (spec.id === Mob.GiantSpider && d <= spec.range && d > spec.reach && state.step >= e.abilityAt[i]!) {
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Web, STEPS_PER_SECOND);
    return;
  }
  // A goblin mage out of mana for its Spark toss closes in to strike instead.
  const ranged = spec.range > 0 && (spec.shot !== Shot.Spark || canUse(state, i, Ability.SparkToss));
  if (ranged && spec.id !== Mob.GiantSpider && d <= spec.range && d > spec.reach + WU_PER_METRE) {
    // A wall in the way of every arc: shoot at someone else in range it can hit, if there is one.
    const better = spec.strike === Strike.Shot ? shotAt(state, i, spec, t) : t;
    if (better !== t) {
      t = better;
      e.target[i] = e.id[t]!;
    }
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Shot);
    return;
  }
  if (inReach(state, i, t, spec)) {
    face(state, i, t);
    begin(state, i, spec, e.id[t]!, With.Unit);
    return;
  }
  const r = goToward(state, i, spec, e.x[t]!, e.z[t]!, blocker);
  if (r !== MOVED) blocked(state, i, spec, r, blocker);
}

/** How many other targets an archer tries for a clear shot in one step. */
const CLEAR_SHOT_TRIES = 4;

/** The target, or the nearest other unit in range with a clear arc when the target has none (the clear shot search). */
function shotAt(state: SimState, i: number, spec: MobSpec, t: number): number {
  const e = state.entities;
  const fromY = e.y[i]! + floorDiv(spec.height * 2, 3);
  const clear = (j: number): boolean => hasClearLob(state, spec.shot, e.x[i]!, fromY, e.z[i]!, e.x[j]!, e.y[j]! + floorDiv(bodyHeight(state, j), 2), e.z[j]!);
  if (clear(t)) return t;
  const near: Array<[number, number]> = [];
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, spec.range)) {
    if (j === t || !playerUnit(state, j)) continue;
    const d = gap(state, i, j);
    if (d <= spec.range) near.push([d, j]);
  }
  near.sort((a, b) => a[0] - b[0] || e.id[a[1]]! - e.id[b[1]]!);
  for (const [, j] of near.slice(0, CLEAR_SHOT_TRIES)) if (clear(j)) return j;
  return t;
}

function face(state: SimState, i: number, t: number): void {
  const e = state.entities;
  face2(state, i, e.x[t]!, e.z[t]!);
}

function face2(state: SimState, i: number, x: number, z: number): void {
  const e = state.entities;
  const dx = x - e.x[i]!;
  const dz = z - e.z[i]!;
  if (dx !== 0 || dz !== 0) e.heading[i] = headingTowards(dx, dz);
}

function howl(state: SimState, i: number): void {
  const e = state.entities;
  e.abilityAt[i] = state.step + HOWL.cooldown;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, HOWL.radius)) {
    if (e.kind[j] !== UnitKind.Mob || e.hp[j]! <= 0 || !mobSpec(e.mob[j]!).undead) continue;
    if (length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > HOWL.radius) continue;
    e.fastUntil[j] = state.step + HOWL.steps;
    e.fastBp[j] = HOWL.bonusBp;
  }
  state.hits.push({ look: 'swing', x: e.x[i]!, y: e.y[i]!, z: e.z[i]!, id: e.id[i]! });
}

// ----- spawning a mob -----

/** A mob born of another (a slime's halves, a raised zombie) keeps to its errand: a wanderer's young wander with it (threats/wanderers.ts) rather than march on a town. */
export function inheritRole(state: SimState, parent: number, child: number): void {
  const e = state.entities;
  if (e.role[parent] !== Role.Wild) return;
  e.role[child] = Role.Wild;
  e.group[child] = e.group[parent]!;
  e.homeX[child] = e.homeX[parent]!;
  e.homeZ[child] = e.homeZ[parent]!;
  e.targetX[child] = e.x[child]!;
  e.targetZ[child] = e.z[child]!;
  e.target[child] = e.target[parent]!;
}

/** Adds a mob of a kind for a foe at a point, at its strength for the night; returns its index. */
export function addMob(state: SimState, mob: number, foe: number, x: number, z: number, night: number): number {
  const spec = mobSpec(mob);
  const e = state.entities;
  const id = state.nextEntityId++;
  const ground = standY(state, x, z);
  const y = flies(spec) ? groundAt(state, x, z) + cruise(spec) : ground;
  const i = e.add(id, MONSTERS, x, y, z, spec.speed, UnitKind.Mob);
  e.mob[i] = mob;
  e.foe[i] = foe;
  const power = 1000 + 5 * Math.max(0, night - spec.firstNight);
  e.power[i] = power;
  e.hp[i] = Math.max(1, floorDiv(spec.hp * power, 1000));
  e.maxHp[i] = e.hp[i]!;
  e.rank[i] = 0;
  e.role[i] = spec.role;
  e.mana[i] = spec.mana * MANA_SCALE;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  state.grid.insert(e, i);
  return i;
}

// ----- the sun -----

/**
 * At dawn and by day (Day and night): most mobs lose 10% of their maximum
 * health a second in the sunlight; goblins and bats run for the dark.
 */
export function updateSun(state: SimState): void {
  const c = clockAt(state.step, state.blood);
  if (c.period !== Period.Dawn && c.period !== Period.Day) return;
  const e = state.entities;
  const k = state.step % STEPS_PER_SECOND;
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0) continue;
    const spec = mobSpec(e.mob[i]!);
    if (spec.sun === Sun.Proof || inShade(state, i)) continue;
    if (spec.sun === Sun.Flees) {
      if (!e.fleeing[i]) {
        e.fleeing[i] = 1;
        e.timer[i] = 0;
        e.atkAt[i] = 0;
        e.target[i] = 0;
        e.path[i] = [];
      }
      continue;
    }
    // A barrow knight smoulders at half the burn (roster 5.7: 5% a second).
    const perMille = spec.sun === Sun.Smoulders ? SUNBURN_PER_MILLE_PER_SECOND >> 1 : SUNBURN_PER_MILLE_PER_SECOND;
    const burn = burnThisStep(floorDiv(e.maxHp[i]! * perMille, 1000), k);
    if (burn <= 0) continue;
    e.hp[i] = e.hp[i]! - burn;
    if (k === 0) state.hits.push({ look: 'burst', x: e.x[i]!, y: e.y[i]! + (bodyHeight(state, i) >> 1), z: e.z[i]!, id: e.id[i]! });
    if (e.hp[i]! <= 0) {
      // Burnt by the sun: nobody earns it, and it drops nothing.
      e.hp[i] = 0;
      e.hitters[i] = [];
      state.dying.push(e.id[i]!);
    }
  }
}

/** A lair's resident stands in its shade by day: within 30 m of its lair while the lair stands (s). */
function inShade(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.role[i] !== Role.Resident) return false;
  const l = e.indexOf(e.group[i]!);
  return l >= 0 && e.hp[l]! > 0 && length2d(e.x[l]! - e.x[i]!, e.z[l]! - e.z[i]!) <= LAIR_LEASH_WU;
}
