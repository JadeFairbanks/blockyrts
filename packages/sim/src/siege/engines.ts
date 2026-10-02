// Siege engines and cannons on the field (Table 2f; Table 12's haul row;
// Main base: the Citadel's cannon ports; Table 19's Dwarf city cannons). An
// engine is a unit that never eats, never heals and is repaired by workers.
// It moves only while a hitched horse or ox walks beside it, or while
// enough of its crew stand by to push it, and rolls on wheels (ramps, not
// steps). It fires while its crew stand by it and it stands still: at what
// it was told to attack, else at the nearest foe in range. A shot takes its
// munition from the stock, and a cannon's a gunpowder charge besides (ten to
// one gunpowder). A cannon hauled into a Citadel's port fires from the roof,
// its crew inside with it.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { Res } from '../economy/resources.ts';
import { floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { OrderKind, PEOPLES, standY, UnitKind, type SimState } from '../state.ts';
import { Species, speciesSpec } from '../animals/species.ts';
import { PeopleUnit } from '../peoples/data.ts';
import { gap, hostile, isMob } from '../combat/combat.ts';
import { isStructure } from '../combat/mobs.ts';
import { buildingTop, clearLob, fireAt, ProjectileFlag } from '../combat/projectiles.ts';
import { Act, besideBuilding, exitColumn, columnCentre, FAILED, leaveBuilding, MOVING, resetWalk, walkTo } from '../units/behaviour.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { CANNON_PORTS, CHARGES_PER_POWDER, CITADEL_LEVEL, CREW_REACH_WU, Engine, engineSpec, HAUL_REACH_WU, type EngineSpec } from './data.ts';

const CONTINUE = false;
const DONE = true;
const M = WU_PER_METRE;
/** A worker repairs from this close (s). */
const MEND_REACH_WU = 3 * M;
/** Shots leave an engine's mouth at 1.2 m (s). */
const MUZZLE_WU = floorDiv(12 * M, 10);

/** Adds an engine of a kind for an owner at a point; returns its index. */
export function addEngine(state: SimState, owner: number, kind: number, x: number, z: number): number {
  const spec = engineSpec(kind);
  const e = state.entities;
  const i = e.add(state.nextEntityId++, owner, x, standY(state, x, z), z, 0, UnitKind.Engine);
  e.mob[i] = kind;
  e.hp[i] = spec.hp;
  e.maxHp[i] = spec.hp;
  e.rank[i] = 1;
  e.heading[i] = 32768;
  e.homeX[i] = x;
  e.homeZ[i] = z;
  state.grid.insert(e, i);
  return i;
}

/** A finished engine rolls out of the building that made it. */
export function spawnEngine(state: SimState, b: Building, kind: number): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  addEngine(state, b.owner, kind, x, z);
  state.events.push({ player: b.owner, kind: 'info', text: `A ${engineSpec(kind).name.toLowerCase()} is ready. Hitch a horse or an ox to it, or give it a crew.`, x, z });
}

export function isEngine(state: SimState, i: number): boolean {
  return state.entities.kind[i] === UnitKind.Engine;
}

/** The horse or ox hitched to an engine and close enough to haul it, or -1. */
export function haulerOf(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.partner[i]) return -1;
  const a = e.indexOf(e.partner[i]!);
  if (a < 0 || e.hp[a]! <= 0 || e.partner[a] !== e.id[i] || e.kind[a] !== UnitKind.Animal) return -1;
  return length2d(e.x[a]! - e.x[i]!, e.z[a]! - e.z[i]!) <= HAUL_REACH_WU ? a : -1;
}

/** The crew standing by an engine now: units whose order is to crew it, beside it (or in the same building as a port cannon). */
export function crewOf(state: SimState, i: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  const id = e.id[i]!;
  const near = (j: number): boolean => (e.inside[i] !== 0 ? e.inside[j] === e.inside[i] : e.inside[j] === 0 && length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) <= CREW_REACH_WU);
  if (e.owner[i] === PEOPLES) {
    // A Dwarf city's cannon is worked by its own cannon crew at their posts beside it.
    for (const j of state.grid.near(e.x[i]!, e.z[i]!, CREW_REACH_WU)) {
      if (e.owner[j] === PEOPLES && e.group[j] === e.group[i] && e.kind[j] === UnitKind.Warrior && e.mob[j] === PeopleUnit.DwarfCannonCrew && e.hp[j]! > 0 && near(j)) out.push(j);
    }
    return out;
  }
  for (const j of crewSworn(state, i)) {
    const o = e.queue[j]![0];
    if (o?.t === 'crew' && o.id === id && near(j)) out.push(j);
  }
  return out;
}

/** Every unit told to crew an engine, wherever it is. */
function crewSworn(state: SimState, i: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  const id = e.id[i]!;
  for (let j = 0; j < e.count; j++) {
    if (e.hp[j]! <= 0 || e.owner[j] !== e.owner[i]) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'crew' && o.id === id) out.push(j);
  }
  return out;
}

/** An engine's speed now, wu per step: its animal's haul, else its crew pushing, else 0 (Table 2f). */
export function engineSpeed(state: SimState, i: number): number {
  const e = state.entities;
  const spec = engineSpec(e.mob[i]!);
  const a = haulerOf(state, i);
  if (a >= 0) return e.mob[a] === Species.Ox ? spec.ox : spec.horse;
  return crewOf(state, i).length >= spec.crew ? spec.pushed : 0;
}

/** Why an engine cannot move now, or ''. */
export function stuckWhy(state: SimState, i: number): string {
  const spec = engineSpec(state.entities.mob[i]!);
  if (spec.pushed === 0) return 'It is fixed in place.';
  return `It needs a horse or an ox hitched to it, or ${spec.crew === 1 ? 'a warrior' : `${spec.crew} warriors`} crewing it to push.`;
}

/** Why an engine cannot fire now, or '' (its crew, its shot and charge). */
export function fireWhy(state: SimState, i: number): string {
  const e = state.entities;
  const spec = engineSpec(e.mob[i]!);
  const crew = crewOf(state, i).length;
  if (crew < spec.crew) return `It needs ${spec.crew === 1 ? 'a crewman' : `${spec.crew} crew`} standing by it to fire (${crew} now).`;
  if (e.owner[i] === PEOPLES) return '';
  const pool = state.players[e.owner[i]!]!.pool;
  const name = spec.munition === Res.Cannonball ? 'cannonballs' : spec.munition === Res.CatapultStone ? 'catapult stones' : 'ballista bolts';
  if (pool[spec.munition]! < 1) return `No ${name} in the stock.`;
  if (spec.powder && e.ammo[i]! < 1 && pool[Res.Gunpowder]! < 1) return 'No gunpowder in the stock.';
  return '';
}

/** Whether a target is one this engine may shoot: a foe in range, past its minimum range, outside. */
function canShoot(state: SimState, i: number, t: number, spec: EngineSpec, structures: boolean): boolean {
  const e = state.entities;
  if (t < 0 || t === i || e.hp[t]! <= 0 || e.inside[t] !== 0 || !hostile(state, i, t)) return false;
  if (!structures && isMob(state, t) && isStructure(e.mob[t]!)) return false;
  const d = gap(state, i, t);
  return d <= spec.range && d >= spec.minRange;
}

/** The nearest foe in range past the minimum, lowest id on a tie; structures only on an order. */
function pickShot(state: SimState, i: number, spec: EngineSpec): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  for (const j of state.grid.near(e.x[i]!, e.z[i]!, spec.range)) {
    if (!canShoot(state, i, j, spec, false)) continue;
    const d = gap(state, i, j);
    if (best < 0 || d < bestD || (d === bestD && e.id[j]! < e.id[best]!)) {
      best = j;
      bestD = d;
    }
  }
  return best;
}

/** Fires at a target if the crew, the reload and the munitions allow it; true when the shot went. */
function fire(state: SimState, i: number, t: number, spec: EngineSpec): boolean {
  const e = state.entities;
  e.target[i] = e.id[t]!;
  const dx = e.x[t]! - e.x[i]!;
  const dz = e.z[t]! - e.z[i]!;
  if (dx !== 0 || dz !== 0) e.heading[i] = headingTowards(dx, dz);
  if (state.step < e.atkNext[i]! || fireWhy(state, i) !== '') return false;
  const b = e.inside[i] ? state.buildings.get(e.inside[i]!) : undefined;
  const y = b ? buildingTop(b) + MUZZLE_WU : e.y[i]! + MUZZLE_WU;
  if (clearLob(state, spec.shot, e.x[i]!, y, e.z[i]!, e.x[t]!, e.y[t]!, e.z[t]!, true) === 0) return false;
  if (e.owner[i] !== PEOPLES) {
    const pool = state.players[e.owner[i]!]!.pool;
    pool[spec.munition] = pool[spec.munition]! - 1;
    if (spec.powder) {
      if (e.ammo[i]! < 1) {
        pool[Res.Gunpowder] = pool[Res.Gunpowder]! - 1;
        e.ammo[i] = CHARGES_PER_POWDER;
      }
      e.ammo[i] = e.ammo[i]! - 1;
    }
  }
  const flags = ProjectileFlag.Siege | (spec.pierce ? ProjectileFlag.Pierce : ProjectileFlag.Blunt);
  fireAt(state, i, e.x[i]!, y, e.z[i]!, t, spec.shot, spec.damage, spec.spreadBp, flags);
  e.atkNext[i] = state.step + spec.reloadSteps;
  e.order[i] = OrderKind.Shoot;
  return true;
}

const ENGINE_ORDERS: ReadonlySet<string> = new Set(['move', 'attackMove', 'port', 'attack', 'hold']);

/** One step of an engine: its orders (move, attack, hold, a port), and firing at what it may. */
export function runEngine(state: SimState, i: number): void {
  const e = state.entities;
  const spec = engineSpec(e.mob[i]!);
  e.order[i] = OrderKind.Idle;
  // An engine takes only moves, attacks, holds and ports; anything else given to a mixed group is dropped.
  while (e.queue[i]!.length > 0 && !ENGINE_ORDERS.has(e.queue[i]![0]!.t)) e.queue[i]!.shift();
  const o = e.queue[i]![0];
  if (o && (o.t === 'move' || o.t === 'attackMove' || o.t === 'port')) {
    if (e.inside[i] !== 0 && o.t !== 'port') leaveBuilding(state, i);
    if (moveEngine(state, i, o)) {
      e.queue[i]!.shift();
      resetWalk(state, i);
    }
    // Moving, it does not fire; an attack-move stops to fire at what comes in range, and a cannon in its port fires from the roof.
    const ported = o.t === 'port' && e.inside[i] === o.b;
    if (!ported && (o.t !== 'attackMove' || e.order[i] === OrderKind.Move)) return;
  }
  if (o?.t === 'attack') {
    const t = e.indexOf(o.id);
    if (t < 0 || e.hp[t]! <= 0 || !hostile(state, i, t)) {
      e.queue[i]!.shift();
      e.target[i] = 0;
      return;
    }
    if (canShoot(state, i, t, spec, true)) {
      fire(state, i, t, spec);
      return;
    }
    // Out of range: closer, if it can move (never closer than its minimum range).
    const d = gap(state, i, t);
    if (d > spec.range && e.inside[i] === 0 && engineSpeed(state, i) > 0) {
      e.speed[i] = engineSpeed(state, i);
      const r = walkTo(state, i, { ...pointGoal(floorDiv(e.x[t]!, WU_PER_COLUMN), floorDiv(e.z[t]!, WU_PER_COLUMN)), max: floorDiv(spec.range - 2 * M, WU_PER_COLUMN) });
      if (r === MOVING) e.order[i] = OrderKind.Move;
      return;
    }
    if (d < spec.minRange) {
      e.queue[i]!.shift();
      e.target[i] = 0;
    }
    return;
  }
  // Idle, holding, in a port or attack-moving: the nearest foe in range.
  let t = e.indexOf(e.target[i]!);
  if (!canShoot(state, i, t, spec, false)) t = pickShot(state, i, spec);
  if (t < 0) {
    e.target[i] = 0;
    return;
  }
  fire(state, i, t, spec);
}

/** A step of an engine's move (to a point, or to a Citadel's port); true when the order is done. */
function moveEngine(state: SimState, i: number, o: Extract<UnitOrder, { t: 'move' | 'attackMove' | 'port' }>): boolean {
  const e = state.entities;
  if (o.t === 'port') return toPort(state, i, o.b);
  const speed = engineSpeed(state, i);
  if (speed <= 0) return waitForHaul(state, i);
  e.speed[i] = speed;
  const r = walkTo(state, i, pointGoal(floorDiv(o.x, WU_PER_COLUMN), floorDiv(o.z, WU_PER_COLUMN)), o.x, o.z);
  if (r === MOVING) {
    e.strikes[i] = 0;
    e.order[i] = OrderKind.Move;
    return false;
  }
  return true;
}

/** An engine with nothing to move it waits for its animal or its crew, and says why once. */
function waitForHaul(state: SimState, i: number): false {
  const e = state.entities;
  // An engine's strikes field: 1 once it has said why it cannot move.
  if (e.strikes[i] === 0) {
    e.strikes[i] = 1;
    state.events.push({ player: e.owner[i]!, kind: 'alert', text: stuckWhy(state, i), x: e.x[i]!, z: e.z[i]! });
  }
  return false;
}

/** Cannon ports a Citadel has (Table 4: 4 on a main base of level 10), or 0. */
export function portRoom(b: Building): number {
  return b.complete && b.kind === BuildingKind.MainBase && b.level >= CITADEL_LEVEL ? CANNON_PORTS : 0;
}

/** Cannons in a building's ports now. */
export function inPorts(state: SimState, b: Building): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) if (e.kind[j] === UnitKind.Engine && e.inside[j] === b.id && e.hp[j]! > 0) n++;
  return n;
}

/** Hauled to the Citadel's door, the cannon goes up into a free port (s: its crew follow it in). */
function toPort(state: SimState, i: number, id: number): boolean {
  const e = state.entities;
  const b = state.buildings.get(id);
  if (!b || b.owner !== e.owner[i] || portRoom(b) === 0) return true;
  if (e.inside[i] === b.id) return false;
  const speed = engineSpeed(state, i);
  if (speed <= 0) return waitForHaul(state, i);
  e.speed[i] = speed;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) {
    e.order[i] = OrderKind.Move;
    return false;
  }
  if (r === FAILED) return true;
  if (inPorts(state, b) >= portRoom(b)) {
    state.events.push({ player: e.owner[i]!, kind: 'alert', text: 'Every cannon port is taken.', x: e.x[i]!, z: e.z[i]! });
    return true;
  }
  // The animal is let go at the door.
  const a = e.partner[i] ? e.indexOf(e.partner[i]!) : -1;
  if (a >= 0 && e.partner[a] === e.id[i]) e.partner[a] = 0;
  e.partner[i] = 0;
  const [cx, cz] = buildingCentre(b);
  const k = inPorts(state, b);
  // The ports stand at the roof's four corners (s).
  e.inside[i] = b.id;
  e.x[i] = cx + ((k & 1) * 2 - 1) * 2 * M;
  e.z[i] = cz + ((k & 2) - 1) * 2 * M;
  e.y[i] = buildingTop(b);
  return false;
}

/** Why a cannon cannot go into a building's port, or ''. */
export function portWhy(state: SimState, i: number, b: Building): string {
  const spec = engineSpec(state.entities.mob[i]!);
  if (!spec.powder) return 'Only cannons go in the Citadel\'s cannon ports.';
  if (portRoom(b) === 0) return 'Only a Citadel (main base level 10) has cannon ports.';
  if (inPorts(state, b) >= portRoom(b)) return 'Every cannon port is taken.';
  return '';
}

// ----- crew, hauling and repair -----

/** Why a unit cannot crew an engine, or ''. */
export function crewWhy(state: SimState, j: number, i: number): string {
  const e = state.entities;
  if (i < 0 || e.kind[i] !== UnitKind.Engine || e.owner[i] !== e.owner[j] || e.hp[i]! <= 0) return 'Only your own engines and cannons take a crew.';
  if (e.kind[j] !== UnitKind.Warrior) return 'Only warriors crew engines and cannons.';
  if (e.mount[j]) return 'A rider must get down to crew it.';
  const spec = engineSpec(e.mob[i]!);
  if (spec.crewSkill && (e.skills[j]! & spec.crewSkill) === 0) return 'Cannon crew need training at a Gunnery yard first.';
  return '';
}

/** The crew order: walk to the engine and stand by it for good (into the Citadel with a port cannon). Crew do not fight. */
export function runCrew(state: SimState, j: number, o: Extract<UnitOrder, { t: 'crew' }>): boolean {
  const e = state.entities;
  const i = e.indexOf(o.id);
  const why = crewWhy(state, j, i);
  if (why) {
    if (i >= 0 && e.hp[i]! > 0) state.events.push({ player: e.owner[j]!, kind: 'alert', text: why, x: e.x[j]!, z: e.z[j]! });
    return DONE;
  }
  if (e.act[j] === Act.Start) e.act[j] = Act.Walk;
  if (e.inside[i] !== 0) {
    if (e.inside[j] === e.inside[i]) return CONTINUE;
    const b = state.buildings.get(e.inside[i]!);
    if (!b) return DONE;
    if (walkTo(state, j, besideBuilding(b)) === MOVING) return CONTINUE;
    e.inside[j] = b.id;
    e.x[j] = e.x[i]!;
    e.z[j] = e.z[i]!;
    e.y[j] = e.y[i]!;
    return CONTINUE;
  }
  if (e.inside[j] !== 0) leaveBuilding(state, j);
  const d = length2d(e.x[i]! - e.x[j]!, e.z[i]! - e.z[j]!);
  if (d > CREW_REACH_WU - M) {
    if (e.pathOk[j] !== 2 && state.step >= e.waitUntil[j]!) resetWalk(state, j);
    if (e.pathOk[j] === 2) e.waitUntil[j] = state.step + 10;
    walkTo(state, j, { ...pointGoal(floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN)), max: 2 });
    return CONTINUE;
  }
  // Standing by: facing what the engine faces.
  e.heading[j] = e.heading[i]!;
  return CONTINUE;
}

/** Why an animal cannot haul an engine, or ''. */
export function haulWhy(state: SimState, i: number, a: number): string {
  const e = state.entities;
  if (a < 0 || e.kind[a] !== UnitKind.Animal || e.owner[a] !== e.owner[i] || e.hp[a]! <= 0) return 'Only your own tamed horses and oxen haul engines.';
  if (e.mob[a] !== Species.Horse && e.mob[a] !== Species.Ox) return `A ${speciesSpec(e.mob[a]!).name.toLowerCase()} cannot haul an engine.`;
  if (e.born[a]! > state.step) return 'It is too young to work.';
  if (engineSpec(e.mob[i]!).pushed === 0) return 'It is fixed in place.';
  return '';
}

/** Hitches an animal to an engine (it walks over and follows it), letting go of whatever it pulled; -1 lets the engine's animal go. */
export function hitchEngine(state: SimState, i: number, a: number): void {
  const e = state.entities;
  if (e.partner[i]) {
    const old = e.indexOf(e.partner[i]!);
    if (old >= 0 && e.partner[old] === e.id[i]) e.partner[old] = 0;
    e.partner[i] = 0;
  }
  if (a < 0) return;
  if (e.partner[a]) {
    const w = e.indexOf(e.partner[a]!);
    if (w >= 0 && e.partner[w] === e.id[a]) e.partner[w] = 0;
  }
  e.partner[i] = e.id[a]!;
  e.partner[a] = e.id[i]!;
  state.events.push({ player: e.owner[i]!, kind: 'info', text: `The ${speciesSpec(e.mob[a]!).name.toLowerCase()} is hitched to the ${engineSpec(e.mob[i]!).name.toLowerCase()}.`, x: e.x[i]!, z: e.z[i]! });
}

/** Why a worker cannot repair an engine, or ''. */
export function mendWhy(state: SimState, j: number, i: number): string {
  const e = state.entities;
  if (e.kind[j] !== UnitKind.Worker) return 'Only workers repair engines.';
  if (i < 0 || e.kind[i] !== UnitKind.Engine || e.owner[i] !== e.owner[j] || e.hp[i]! <= 0) return 'Only your own engines and cannons can be repaired.';
  return '';
}

/** The repair order: a full repair takes as long as making the engine, more workers faster, and costs nothing (s, as buildings). */
export function runMend(state: SimState, j: number, o: Extract<UnitOrder, { t: 'mend' }>): boolean {
  const e = state.entities;
  const i = e.indexOf(o.id);
  if (mendWhy(state, j, i) !== '' || e.hp[i]! >= e.maxHp[i]!) return DONE;
  if (e.act[j] === Act.Start) {
    e.act[j] = Act.Walk;
    e.timer[j] = 0;
  }
  const near = e.inside[i] !== 0 ? e.inside[j] === e.inside[i] : length2d(e.x[i]! - e.x[j]!, e.z[i]! - e.z[j]!) <= MEND_REACH_WU;
  if (!near) {
    if (e.inside[i] !== 0) {
      const b = state.buildings.get(e.inside[i]!);
      if (!b) return DONE;
      if (walkTo(state, j, besideBuilding(b)) === MOVING) return CONTINUE;
      e.inside[j] = b.id;
      return CONTINUE;
    }
    if (e.pathOk[j] !== 2 && state.step >= e.waitUntil[j]!) resetWalk(state, j);
    if (e.pathOk[j] === 2) e.waitUntil[j] = state.step + 10;
    const r = walkTo(state, j, { ...pointGoal(floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN)), max: 2 });
    return r === FAILED ? DONE : CONTINUE;
  }
  e.act[j] = Act.Work;
  e.order[j] = OrderKind.Chop;
  const dx = e.x[i]! - e.x[j]!;
  const dz = e.z[i]! - e.z[j]!;
  if (dx !== 0 || dz !== 0) e.heading[j] = headingTowards(dx, dz);
  // Health a step: the engine's whole health over its making time.
  const spec = engineSpec(e.mob[i]!);
  e.timer[j] = e.timer[j]! + e.maxHp[i]!;
  const whole = Math.max(1, spec.steps || 120 * STEPS_PER_SECOND);
  const add = floorDiv(e.timer[j]!, whole);
  if (add > 0) {
    e.timer[j] = e.timer[j]! - add * whole;
    e.hp[i] = Math.min(e.maxHp[i]!, e.hp[i]! + add);
  }
  return e.hp[i]! >= e.maxHp[i]! ? DONE : CONTINUE;
}

/** An engine's name for the panel. */
export function engineName(state: SimState, i: number): string {
  return engineSpec(state.entities.mob[i]!).name;
}

export { Engine };
