// Riding and charges (Combat: Charges; Table 14; Table 7's riding row; the
// Table 1 mounted row). A mounted unit is one entity: the rider, with its
// mount's kind and health beside its own. A blow lands on whichever of the
// two has more health (the mount on a tie), through the mount's own armour;
// a mount brought to 0 leaves its rider on foot. A run at the mount's gallop
// in a straight line, long enough, makes the next hit a charge: double
// damage, and anything smaller than the mount is knocked back 1 or 2 m. The
// goblins' wolves, the Halflings' war oxen and the Elves' bears also attack
// by themselves beside their riders. A player's cavalry is trained at the
// Stables on one of its tamed horses and rides it for good (Troops and gear).

import { floorDiv, length2d, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { landAt, UnitKind, type SimState } from '../state.ts';
import { WALKER } from '../nav/grid.ts';
import { PropKind } from '../world/props.ts';
import { Species, speciesSpec } from '../animals/species.ts';
import { bodyHeight, dealt, forward, gap, hostile, hurtUnit, inArc, sideOf, Side } from '../combat/combat.ts';
import { flies, isStructure, Mob, mobSpec, Moves } from '../combat/mobs.ts';
import { fireAt } from '../combat/projectiles.ts';
import { playerUnit } from '../combat/mob-ai.ts';
import { resetWalk } from '../units/behaviour.ts';
import { CHARGE_CLOSE_WU, KNOCKBACK, Mount, mountSpec, RUN_SPEED_BP, RUN_TURN } from './data.ts';

const BP = 10000;

/** Hooks other modules fill in (peoples/: the war ox's rear rider gets down when the ox falls). */
export const mountHooks: { rearRider: (state: SimState, i: number) => void } = { rearRider: () => {} };

export function isMounted(state: SimState, i: number): boolean {
  return state.entities.mount[i] !== Mount.None;
}

/** The mount's gallop for the charge rule, wu per step: a goblin wolf rider runs at its own (mob) speed. */
function gallopOf(state: SimState, i: number): number {
  return mountSpec(state.entities.mount[i]!).gallop;
}

/**
 * The charge rule's straight run, for every mounted unit after it moved:
 * the run grows while the unit keeps to at least 80% of its mount's gallop
 * without turning, and is lost on a slow step or a turn.
 */
export function trackRuns(state: SimState): void {
  const e = state.entities;
  for (let i = 0; i < e.count; i++) {
    if (e.mount[i] === Mount.None || e.hp[i]! <= 0) continue;
    const d = length2d(e.x[i]! - e.runX[i]!, e.z[i]! - e.runZ[i]!);
    const turn = Math.abs((((e.heading[i]! - e.runHeading[i]!) & 0xffff) << 16) >> 16);
    if (d * BP >= gallopOf(state, i) * RUN_SPEED_BP && turn < RUN_TURN && d <= 4 * gallopOf(state, i)) e.runWu[i] = e.runWu[i]! + d;
    // Reining in at the end of the run, within reach of its foe, keeps the run for the blow about to fall.
    else if (turn >= RUN_TURN || !closing(state, i)) e.runWu[i] = 0;
    e.runX[i] = e.x[i]!;
    e.runZ[i] = e.z[i]!;
    e.runHeading[i] = e.heading[i]!;
    mountStrike(state, i);
  }
}

/** Within a few metres of its foe (s: 4 m), as at the end of a charge. */
function closing(state: SimState, i: number): boolean {
  const e = state.entities;
  const t = e.indexOf(e.target[i]!);
  return t >= 0 && e.hp[t]! > 0 && gap(state, i, t) <= CHARGE_CLOSE_WU;
}

/** A swing begins: after a long enough run it is a charge, and the run must be made again for the next one (Table 14). */
export function startCharge(state: SimState, i: number): void {
  const e = state.entities;
  if (e.mount[i] === Mount.None) return;
  if (e.runWu[i]! >= mountSpec(e.mount[i]!).chargeRun) {
    e.charge[i] = 1;
    e.runWu[i] = 0;
  }
}

/** Whether the swing landing now is a charge (it is spent as it lands). */
export function takeCharge(state: SimState, i: number): boolean {
  const e = state.entities;
  if (!e.charge[i]) return false;
  e.charge[i] = 0;
  return true;
}

/** The charge's knockback on a unit it hit (Table 14): 2 m for one no taller than 60% of the mount's shoulder, 1 m for one shorter than the mount. */
export function chargeKnock(state: SimState, i: number, t: number): void {
  const m = mountSpec(state.entities.mount[i]!);
  const h = bodyHeight(state, t);
  const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
  const far = h * BP <= cm(m.shoulderCm) * KNOCKBACK.farShareBp;
  const near = h < cm(m.heightCm);
  if (far) knockBack(state, i, t, KNOCKBACK.far);
  else if (near) knockBack(state, i, t, KNOCKBACK.near);
}

/** Whether a unit can be thrown back at all: not a building-like structure, an engine, a flyer, a climber on a wall, or one that cannot be moved (the infernal juggernaut, Morvath). */
function knockable(state: SimState, t: number): boolean {
  const e = state.entities;
  if (e.hp[t]! <= 0 || e.inside[t] !== 0 || e.kind[t] === UnitKind.Engine) return false;
  if (e.kind[t] === UnitKind.Mob) {
    const s = mobSpec(e.mob[t]!);
    if (isStructure(s.id) || s.moves === Moves.Still || flies(s) || e.climbUntil[t] !== 0) return false;
    if (s.id === Mob.InfernalJuggernaut || s.id === Mob.Morvath || s.id === Mob.ElfCaravanWagon) return false;
  }
  return true;
}

/** Throws a unit back from another by up to a distance: over open land, never up a rise higher than a hop, never into a building. */
export function knockBack(state: SimState, from: number, t: number, distance: number): void {
  const e = state.entities;
  if (!knockable(state, t)) return;
  let dx = e.x[t]! - e.x[from]!;
  let dz = e.z[t]! - e.z[from]!;
  let d = length2d(dx, dz);
  if (d === 0) {
    [dx, dz] = forward(e.heading[from]!);
    d = length2d(dx, dz);
  }
  // In quarter-metre hops, stopping where the land or a building stops it.
  const hops = Math.max(1, floorDiv(distance * 4, WU_PER_METRE));
  for (let k = 0; k < hops; k++) {
    const nx = e.x[t]! + floorDiv(dx * floorDiv(distance, hops), d);
    const nz = e.z[t]! + floorDiv(dz * floorDiv(distance, hops), d);
    const cx = floorDiv(nx, WU_PER_COLUMN);
    const cz = floorDiv(nz, WU_PER_COLUMN);
    if (state.buildings.solidAt(cx, cz) !== 0 || !state.nav.standable(cx, cz, WALKER)) break;
    if (state.nav.level(cx, cz) * WU_PER_TERRAIN_UNIT > e.y[t]! + 4 * WU_PER_TERRAIN_UNIT) break;
    landAt(state, t, nx, nz);
  }
  // Thrown off its feet: what it was doing is broken off.
  e.atkAt[t] = 0;
  e.path[t] = [];
  if (e.kind[t] !== UnitKind.Mob) resetWalk(state, t);
  state.hits.push({ look: 'stone', x: e.x[t]!, y: e.y[t]!, z: e.z[t]!, id: e.id[t]! });
}

/**
 * A blow on a mounted unit that the mount takes (it has the more health, or
 * as much): the damage after the mount's armour, or -1 when the rider takes
 * it. A mount at 0 leaves its rider on foot.
 */
export function mountTakes(state: SimState, i: number, damage: number): boolean {
  const e = state.entities;
  return e.mount[i] !== Mount.None && e.mountHp[i]! > 0 && e.mountHp[i]! >= e.hp[i]! && damage > 0;
}

export function mountArmourBp(state: SimState, i: number): number {
  return mountSpec(state.entities.mount[i]!).armourBp;
}

/** The mount fell: its rider fights on foot (a goblin wolf rider becomes a goblin; a war ox's archer gets down beside its spearman). */
export function loseMount(state: SimState, i: number): void {
  const e = state.entities;
  const m = e.mount[i]!;
  const spec = mountSpec(m);
  e.mount[i] = Mount.None;
  e.mountHp[i] = 0;
  e.runWu[i] = 0;
  e.charge[i] = 0;
  state.hits.push({ look: 'blood', x: e.x[i]!, y: e.y[i]! + floorDiv(spec.shoulderCm * WU_PER_METRE, 200), z: e.z[i]!, id: e.id[i]! });
  if (m === Mount.Horse) {
    // A horse leaves its carcass.
    const s = speciesSpec(Species.Horse);
    state.world.addProp(floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN), PropKind.Carcass, s.id, s.meat, state.step);
    if (e.owner[i]! < state.players.length) state.events.push({ player: e.owner[i]!, kind: 'alert', text: 'A warrior\'s horse has been killed. It fights on foot.', x: e.x[i]!, z: e.z[i]! });
  }
  if (e.kind[i] === UnitKind.Mob && e.mob[i] === Mob.GoblinWolfRider) {
    e.mob[i] = Mob.VillageGoblin;
    e.speed[i] = mobSpec(Mob.VillageGoblin).speed;
  }
  if (m === Mount.WarOx) mountHooks.rearRider(state, i);
}

/** Whether a unit is one this mounted unit's mount goes for. */
function mountFoe(state: SimState, i: number, j: number): boolean {
  const e = state.entities;
  if (j === i || e.hp[j]! <= 0 || e.inside[j] !== 0) return false;
  if (e.kind[i] === UnitKind.Mob) return playerUnit(state, j);
  if (e.kind[j] === UnitKind.Mob && isStructure(e.mob[j]!)) return false;
  return hostile(state, i, j);
}

/** The mount's own attack, on its own clock: a war bear's swipe (an arc), a goblin wolf's bite, a war ox's rear archer (who shoots on the move). */
function mountStrike(state: SimState, i: number): void {
  const e = state.entities;
  const a = mountSpec(e.mount[i]!).attack;
  if (!a || state.step < e.mountAtkNext[i]! || e.inside[i] !== 0) return;
  // The rider's own target first, else the nearest foe in reach.
  let t = e.indexOf(e.target[i]!);
  if (t >= 0 && (!mountFoe(state, i, t) || gap(state, i, t) > a.reach)) t = -1;
  if (t < 0) {
    let bestD = 0;
    for (const j of state.grid.near(e.x[i]!, e.z[i]!, a.reach + 2 * WU_PER_METRE)) {
      if (!mountFoe(state, i, j)) continue;
      const d = gap(state, i, j);
      if (d > a.reach) continue;
      if (t < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[t]!)) {
        t = j;
        bestD = d;
      }
    }
  }
  if (t < 0) return;
  e.mountAtkNext[i] = state.step + a.attackSteps;
  const damage = e.kind[i] === UnitKind.Mob ? dealt(state, i, a.damage) : a.damage;
  if (a.shot >= 0) {
    fireAt(state, i, e.x[i]!, e.y[i]! + 2 * WU_PER_METRE, e.z[i]!, t, a.shot, damage, a.spreadBp, 0);
    return;
  }
  const blow = { damage, from: e.id[i]!, projectile: false, blunt: false, pierce: false };
  hurtUnit(state, t, blow);
  if (!a.arc) return;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, a.reach + WU_PER_METRE)) {
    if (j === t || !mountFoe(state, i, j) || gap(state, i, j) > a.reach || !inArc(state, i, e.x[j]!, e.z[j]!)) continue;
    hurtUnit(state, j, blow);
  }
}

// ----- the players' cavalry -----

/**
 * Up on a mount for good: new cavalry rides out of the Stables on the tamed
 * horse it was given, which is used up (Troops and gear). Its health, its
 * Stables and its sex are kept with the rider.
 */
export function seatOnHorse(state: SimState, i: number, mount: number, hp: number, home: number, sex: number): void {
  const e = state.entities;
  e.mount[i] = mount;
  e.mountHp[i] = hp;
  e.mountHome[i] = home;
  e.mountSex[i] = sex;
  e.runWu[i] = 0;
  e.runX[i] = e.x[i]!;
  e.runZ[i] = e.z[i]!;
}

/** A mounted unit's speed (Table 14): at a gallop when closing on a foe, at a trot otherwise. */
export function mountedSpeed(state: SimState, i: number): number {
  const e = state.entities;
  const m = mountSpec(e.mount[i]!);
  return e.target[i] !== 0 ? m.gallop : m.trot;
}

/** Whether a unit is the players' and mounted (for the panel and the sides' rules). */
export function playersRider(state: SimState, i: number): boolean {
  return isMounted(state, i) && sideOf(state, i) === Side.Players;
}

/** Puts a people's fighter on its mount at full health (the Halflings' war oxen, the Elves' bears). */
export function seat(state: SimState, i: number, mount: number): void {
  const e = state.entities;
  e.mount[i] = mount;
  e.mountHp[i] = mountSpec(mount).hp;
  e.runX[i] = e.x[i]!;
  e.runZ[i] = e.z[i]!;
}
