// Sheltering in a main base (Jade's Patch 5, GP-10: "all combat units who
// are not engines or cavalry can now shelter in the main base"). Anyone on
// foot sent into a main base goes either up on its ramparts (tier 2 and up)
// or deeper inside, sharing the shelter's room with the workers. A right
// click on it sends workers and melee deeper inside and rangers and mages up
// top (decisions 3.8); the Big House has no ramparts, so there everyone goes
// inside. The main base's panel moves each one between the two. Troops and
// mages inside stay until let out; workers keep their night shelter (in at
// dark, out at dawn). Workers going in hear the main base say "I feel safe
// in here" (GP-5), once for a run of them going in one after another.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { garrisonRoom, type Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { canGarrison, rangedOf } from '../combat/fight.ts';
import { STEPS_PER_SECOND, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { sayBuilding } from '../peoples/speech.ts';
import { UnitKind, type SimState } from '../state.ts';
import { shelteredIn, shelterRoom } from './behaviour.ts';
import { freePost, mayMan, menOnTop, onTop, topRoom } from './top.ts';
import { ENTER_IN, ENTER_NIGHT, ENTER_TOP } from './unit-orders.ts';

function alert(state: SimState, player: number, text: string): void {
  state.events.push({ player, kind: 'alert', text });
}

/** A main base says "I feel safe in here" again only once no worker has gone in for this long (s): 10 s. */
export const SAFE_QUIET_STEPS = 10 * STEPS_PER_SECOND;
export const SAFE_TEXT = 'I feel safe in here.';

/** Whether a unit may shelter inside a building: a worker wherever there is shelter; a troop or mage on foot in a main base (not engines, not cavalry). */
export function mayShelter(state: SimState, i: number, b: Building): boolean {
  if (shelterRoom(b) <= 0) return false;
  if (state.entities.kind[i] === UnitKind.Worker) return true;
  return b.kind === BuildingKind.MainBase && mayMan(state, i);
}

/**
 * Whether a unit sent into a building goes inside rather than up top: in a
 * main base workers and melee go deeper inside, rangers and mages up on the
 * ramparts (Jade's GP-10 with decisions 3.8); where there is no top (the Big
 * House) everyone who may shelter goes inside; elsewhere anyone who can goes
 * up top, as before.
 */
export function goesInside(state: SimState, i: number, b: Building): boolean {
  if (!mayShelter(state, i, b)) return false;
  if (garrisonRoom(b) <= 0 || !canGarrison(state, i)) return true;
  if (b.kind !== BuildingKind.MainBase) return false;
  const k = state.entities.kind[i];
  return k === UnitKind.Worker || (k === UnitKind.Warrior && !rangedOf(state, i));
}

/** An enter order's `auto` for a unit going inside: a worker is in for the night in the dark (by day until let out); anyone else until let out. */
export function insideAuto(state: SimState, i: number): number {
  if (state.entities.kind[i] !== UnitKind.Worker) return ENTER_IN;
  return isDark(state.step) ? ENTER_NIGHT : 0;
}

/** Not state: when a worker last went into each main base, by building id (what buildings say is not state either). */
const safeAt = new WeakMap<SimState, Map<number, number>>();

/** A worker went inside a main base: it says "I feel safe in here" unless one went in within the last 10 s (Jade's GP-5: one bubble for a run of them). */
export function feelSafe(state: SimState, b: Building): void {
  if (b.kind !== BuildingKind.MainBase) return;
  let m = safeAt.get(state);
  if (!m) {
    m = new Map();
    safeAt.set(state, m);
  }
  const last = m.get(b.id);
  m.set(b.id, state.step);
  if (last !== undefined && state.step >= last && state.step - last < SAFE_QUIET_STEPS) return;
  sayBuilding(state, b, SAFE_TEXT);
}

/**
 * The main base panel's switch (GP-10): a unit up on the ramparts goes
 * deeper inside, one inside goes up on the ramparts, where there is room.
 */
export function swapShelter(state: SimState, player: number, building: number, unit: number): void {
  const b = state.buildings.get(building);
  const e = state.entities;
  const i = e.indexOf(unit);
  if (!b || b.owner !== player || i < 0 || e.inside[i] !== b.id) return;
  const o = e.queue[i]![0];
  if (o?.t !== 'enter' || o.b !== b.id) return;
  if (onTop(state, i)) {
    if (!mayShelter(state, i, b)) return;
    if (shelteredIn(state, b.id).length >= shelterRoom(b)) {
      alert(state, player, 'There is no more room deeper inside.');
      return;
    }
    o.auto = insideAuto(state, i);
    const [x, z] = buildingCentre(b);
    e.x[i] = x;
    e.z[i] = z;
    e.y[i] = b.y * WU_PER_TERRAIN_UNIT;
    return;
  }
  const room = topRoom(state, b);
  if (room <= 0 || !canGarrison(state, i)) return;
  if (menOnTop(state, b.id).length >= room) {
    alert(state, player, 'The ramparts are full.');
    return;
  }
  o.auto = ENTER_TOP;
  [e.x[i], e.y[i], e.z[i]] = freePost(state, b, i);
}
