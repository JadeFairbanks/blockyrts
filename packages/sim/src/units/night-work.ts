// Working through the night (Jade's Patch 4). Workers gathering by
// themselves (the Gather button) stop at dusk and go home for the night.
// Those gathering within 25 m of a building and within 50 m of a troop ask
// instead, "Should I keep working through the night?" (one speaking for the
// others near it that may too, as every question does). Yes, or no answer at
// all (Jade: not answering counts as Yes for this one), and they work on
// through the night; No, and they go to work an empty Farm, or shelter in the
// main base when there is none.
//
// Workers who went into a shelter for the night (sent home at dusk, by
// Everyone Home in the dark, by that No, or by their player) come out in the
// day whatever the monsters do, or at dawn once no monster within 25 m of
// their shelter is alive, and carry on with what they were doing, or gather
// by themselves when they had nothing to do (Jade).
//
// The question, like every question, is not state; what it decides is, in
// each worker's Gather order (FORAGE_NIGHT) and shelter order (ENTER_NIGHT),
// so a loaded game and every machine agree.

import { BuildingKind, levelSpec } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { solidRect, type Building } from '../buildings/store.ts';
import { clockAt, isDark, Period } from '../clock.ts';
import { combatTroop } from '../combat/mob-ai.ts';
import { length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import type { AnswerOrder } from '../orders.ts';
import { say } from '../peoples/speech.ts';
import { MONSTERS, UnitKind, type SimState } from '../state.ts';
import { Role } from '../threats/types.ts';
import { Act, assigned, giveOrder, isFarm, leaveBuilding, resetWalk, takesWorkers } from './behaviour.ts';
import { fromBuilding, nightHooks, startForage } from './forage.ts';
import { bagEmpty } from './loot.ts';
import { answerKinds, askNow, isAsking } from './questions.ts';
import { ENTER_NIGHT, FORAGE_HOME, FORAGE_NIGHT, type UnitOrder } from './unit-orders.ts';

/** At dusk, a worker gathering by itself this near one of the players' buildings (measured from its walls; lights and earthworks are not buildings here) may ask to work on through the night (Jade): 25 m. */
export const NIGHT_WORK_BUILDING_M = 25;
/** ...and this near a troop: any combat unit of the players', a warrior of any type, a mage or an engine (Jade): 50 m. */
export const NIGHT_WORK_TROOP_M = 50;
/** Working on through the night, a worker gathers only nodes this near one of the players' buildings, and comes in once none is left (s): 25 m, as near as it had to be to ask. */
export const NIGHT_WORK_REACH_M = 25;
/** One worker asks for every other that may work on within this of it, one bubble for the workers round a base (s): 30 m, wider than other questions' 10 m because dusk finds them spread round it. */
export const NIGHT_WORK_SPEAK_FOR_M = 30;
/** Workers sheltering for the night come out at dawn once no monster this near their shelter (from its walls) is alive (Jade): 25 m. In the day they come out whatever the monsters do. */
export const DAWN_CLEAR_M = 25;
/** How often workers sheltering for the night look out at dawn and in the day (s): every second. */
export const DAWN_LOOK_STEPS = STEPS_PER_SECOND;

/** The question's kind in AnswerOrder (units/questions.ts Ask is 1 to 6, the greyed-out click's 10 to 15, and Patch 4's farm, building and idle questions 17 to 19, units/work-asks.ts). */
export const NIGHT_WORK_ASK = 16;

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

type ForageOrder = Extract<UnitOrder, { t: 'forage' }>;

// ----- where it may work on -----

/** What counts as a building here: a finished one standing, not a light (torch post, bonfire) or an earthwork (s). */
function counts(b: Building): boolean {
  if (!b.complete || b.hp <= 0) return false;
  return b.kind !== BuildingKind.TorchPost && b.kind !== BuildingKind.Bonfire && b.kind !== BuildingKind.Earthworks && b.kind !== BuildingKind.Ramp;
}

/** Whether a point (wu) lies within `m` metres of a building of any player's (co-op: the players' side), from its walls. */
export function nearBuilding(state: SimState, x: number, z: number, m: number): boolean {
  const r = m * WU_PER_METRE;
  for (const b of state.buildings.list) {
    if (b.owner >= state.players.length || !counts(b)) continue;
    if (fromBuilding(b, x, z) <= r) return true;
  }
  return false;
}

/** A troop, as Jade means it: any combat unit (combat/mob-ai.ts combatTroop, the same as Patch 4's monsters turning on the troops: every warrior type, an artillery crewman too, a mage or an engine) of any player's, a hired mercenary too, alive. */
function isTroop(state: SimState, j: number): boolean {
  const e = state.entities;
  return e.hp[j]! > 0 && e.owner[j]! < state.players.length && combatTroop(state, j);
}

/** Whether a troop stands within NIGHT_WORK_TROOP_M of a point (wu), on the ground or up on a building's top. */
export function nearTroop(state: SimState, x: number, z: number): boolean {
  const e = state.entities;
  const r = NIGHT_WORK_TROOP_M * WU_PER_METRE;
  for (const j of state.grid.near(x, z, r)) if (isTroop(state, j) && length2d(e.x[j]! - x, e.z[j]! - z) <= r) return true;
  for (const j of state.grid.nearTops(x, z, r)) if (isTroop(state, j) && length2d(e.x[j]! - x, e.z[j]! - z) <= r) return true;
  return false;
}

/** Whether a worker stands where it may ask to work on through the night: within 25 m of a building and 50 m of a troop (Jade). */
export function mayWorkOn(state: SimState, i: number): boolean {
  const e = state.entities;
  return nearBuilding(state, e.x[i]!, e.z[i]!, NIGHT_WORK_BUILDING_M) && nearTroop(state, e.x[i]!, e.z[i]!);
}

/** Working on through the night: only nodes within NIGHT_WORK_REACH_M of a building. */
export function nightReach(state: SimState): (x: number, z: number) => boolean {
  return (x, z) => nearBuilding(state, x, z, NIGHT_WORK_REACH_M);
}

/** The Gather order a worker is gathering by itself under: its first order, or the one behind the node it is at. */
export function forageOf(state: SimState, i: number): ForageOrder | undefined {
  const q = state.entities.queue[i]!;
  const h = q[0];
  if (h?.t === 'forage') return h;
  if (h?.t === 'gather' && q[1]?.t === 'forage') return q[1];
  return undefined;
}

/** Whether a worker is still working on through the night: its Gather order says so, and it is not on its way into a shelter (Everyone Home). */
function workingOn(state: SimState, id: number, player: number): boolean {
  const e = state.entities;
  const i = e.indexOf(id);
  if (i < 0 || e.hp[i]! <= 0 || e.owner[i] !== player || e.queue[i]![0]?.t === 'enter') return false;
  return e.queue[i]!.some((o) => o.t === 'forage' && o.k === FORAGE_NIGHT);
}

// ----- the question -----

/** The player's finished Farms with nobody farming them, nearest a point first, with the places each has. */
function emptyFarms(state: SimState, player: number, x: number, z: number): Array<{ b: Building; places: number }> {
  return state.buildings.list
    .filter((b) => b.owner === player && isFarm(b.kind) && takesWorkers(b) && b.hp > 0 && assigned(state, b.id).length === 0)
    .map((b) => ({ b, places: levelSpec(b.kind, b.level).workers, d: dist2(...buildingCentre(b), x, z) }))
    .sort((a, c) => a.d - c.d || a.b.id - c.b.id)
    .map(({ b, places }) => ({ b, places }));
}

/** What No does, in full, for its tooltip: how many go to work the empty farms, and the rest home to the main base. */
function noText(state: SimState, player: number, n: number, x: number, z: number): string {
  const farms = emptyFarms(state, player, x, z);
  const toFarm = Math.min(n, farms.reduce((s, f) => s + f.places, 0));
  const farm = toFarm === 1 || farms.length === 1 ? 'the nearest empty farm' : 'the nearest empty farms';
  const there = 'shelter in the farmhouse tonight and farm from daybreak';
  const base = `the main base for the night, coming out at dawn once no monster within ${DAWN_CLEAR_M} m is alive`;
  if (n === 1) return toFarm === 1 ? `It drops off its load and goes to work ${farm}: it shelters in the farmhouse tonight and farms from daybreak.` : `It drops off its load and shelters in ${base}.`;
  if (toFarm === n) return `They drop off their loads and go to work ${farm}: they ${there}.`;
  if (toFarm === 0) return `They drop off their loads and shelter in ${base}.`;
  const some = NUMBER_WORDS[toFarm] ?? String(toFarm);
  return `${toFarm === 1 ? 'One goes' : `${some.charAt(0).toUpperCase()}${some.slice(1)} go`} to work ${farm} (to ${there}); the rest drop off their loads and shelter in ${base}.`;
}

/**
 * Dusk (or the dark) finds a worker gathering by itself that has not decided
 * tonight (its Gather order `o`): if it stands where it may (mayWorkOn), it
 * works on, with the others gathering by themselves near it that may too,
 * and asks for them all. Returns whether it works on: true also while it is
 * already asking something else (it waits to ask until that question ends,
 * working on meanwhile, as no answer would have it), false to go home.
 */
export function workOnTonight(state: SimState, i: number, o: ForageOrder): boolean {
  const e = state.entities;
  const player = e.owner[i]!;
  if (player >= state.players.length || e.role[i] === Role.Mercenary || state.players[player]!.out) return false;
  if (!mayWorkOn(state, i)) return false;
  // Already asking or spoken for in another question: it asks once that one has gone.
  if (isAsking(state, e.id[i]!, false)) return true;
  // The others near it gathering by themselves that have not decided tonight and may work on too: it speaks for them.
  const group = [i];
  const r = NIGHT_WORK_SPEAK_FOR_M * WU_PER_METRE;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.owner[j] !== player || e.kind[j] !== UnitKind.Worker || e.hp[j]! <= 0 || e.role[j] === Role.Mercenary) continue;
    if (length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r) continue;
    const f = forageOf(state, j);
    if (!f || f.k === FORAGE_HOME || f.k === FORAGE_NIGHT || isAsking(state, e.id[j]!, false) || !mayWorkOn(state, j)) continue;
    f.k = FORAGE_NIGHT;
    group.push(j);
  }
  o.k = FORAGE_NIGHT;
  const n = group.length;
  const text = n === 1 ? 'Should I keep working through the night?' : `Should the ${NUMBER_WORDS[n] ?? String(n)} of us keep working through the night?`;
  const yes = `${n === 1 ? 'It keeps' : 'They keep'} gathering through the night, taking only what lies within ${NIGHT_WORK_REACH_M} m of a building, and ${n === 1 ? 'comes' : 'come'} in once nothing is left there. Not answering counts as Yes. Takes nothing from the stock.`;
  const ids = group.map((j) => e.id[j]!);
  askNow(state, player, e.id[i]!, false, { q: NIGHT_WORK_ASK, units: ids, res: -1, yes, no: noText(state, player, n, e.x[i]!, e.z[i]!) }, text, () => isDark(state.step) && ids.some((id) => workingOn(state, id, player)));
  return true;
}

/**
 * The answer (AnswerOrder; the question has closed). Yes: they work on, as
 * they already do. No: each that still works on goes to work an empty Farm,
 * the nearest with a place left, dropping off its load first (it shelters in
 * the farmhouse tonight and farms from daybreak); with none, it goes home to
 * the main base for the night, as at any dusk.
 */
export function answerNightWork(state: SimState, o: AnswerOrder): void {
  if (o.yes === 1) return;
  const e = state.entities;
  const player = o.player;
  const workers: number[] = [];
  for (const id of o.units) {
    const i = e.indexOf(id);
    if (i >= 0 && !workers.includes(i) && workingOn(state, id, player)) workers.push(i);
  }
  if (workers.length === 0) return;
  const first = workers[0]!;
  const farms = emptyFarms(state, player, e.x[first]!, e.z[first]!);
  // The first of them says where it goes (one line for the group, as one asked for the group).
  for (const i of workers) {
    let best: { b: Building; places: number } | undefined;
    let bestD = 0;
    for (const f of farms) {
      if (f.places <= 0) continue;
      const d = dist2(...buildingCentre(f.b), e.x[i]!, e.z[i]!);
      if (!best || d < bestD || (d === bestD && f.b.id < best.b.id)) {
        best = f;
        bestD = d;
      }
    }
    if (best) {
      best.places--;
      // Its load goes to the stock first, then it is that farm's farmer (the farm's Assign).
      const loaded = e.carryAmt[i]! > 0 || !bagEmpty(state, i);
      giveOrder(state, i, loaded ? { t: 'return' } : { t: 'job', b: best.b.id }, false);
      if (loaded) giveOrder(state, i, { t: 'job', b: best.b.id }, true);
      if (i === first) say(state, i, 'Off to work the farm.', false, true);
      continue;
    }
    // Home for the night, as at any dusk: its load to the stock, then into the nearest main base.
    for (const f of e.queue[i]!) if (f.t === 'forage' && f.k === FORAGE_NIGHT) f.k = FORAGE_HOME;
    if (i === first) say(state, i, 'Heading in for the night.', false, true);
  }
}

// ----- out again at dawn -----

/** Whether no monster within DAWN_CLEAR_M of a shelter (from its walls) is alive. */
export function clearOfMonsters(state: SimState, b: Building): boolean {
  const e = state.entities;
  const r = DAWN_CLEAR_M * WU_PER_METRE;
  const [cx, cz] = buildingCentre(b);
  const [x0, z0, x1, z1] = solidRect(b);
  // Every cell that could hold a monster within r of the walls: r past the building's widest side from its centre.
  const reach = r + (Math.max(x1 - x0, z1 - z0) + 1) * WU_PER_COLUMN;
  for (const j of state.grid.near(cx, cz, reach)) {
    if (e.owner[j] !== MONSTERS || e.hp[j]! <= 0) continue;
    if (fromBuilding(b, e.x[j]!, e.z[j]!) <= r) return false;
  }
  return true;
}

/**
 * A worker comes out of its shelter: the shelter order ends, it steps out of
 * the door and carries on with what it was doing; one that went in for the
 * night with nothing else to do gathers by itself (Jade).
 */
export function comeOut(state: SimState, i: number): void {
  const e = state.entities;
  const h = e.queue[i]!.shift();
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  if (e.inside[i] !== 0) leaveBuilding(state, i);
  if (h?.t === 'enter' && h.auto === ENTER_NIGHT && e.queue[i]!.length === 0 && e.kind[i] === UnitKind.Worker) giveOrder(state, i, startForage(state, i), false);
}

/**
 * Every DAWN_LOOK_STEPS, and as dawn and day begin: workers that went into a
 * shelter for the night come out, in the day whatever the monsters do, at
 * dawn once no monster within DAWN_CLEAR_M of their shelter is alive (those
 * still on their way in turn back the same way).
 */
export function releaseSheltered(state: SimState): void {
  const c = clockAt(state.step);
  const p = c.period;
  if (p !== Period.Dawn && p !== Period.Day) return;
  if (c.into !== 0 && state.step % DAWN_LOOK_STEPS !== 0) return;
  const e = state.entities;
  const clear = new Map<number, boolean>();
  for (let i = 0; i < e.count; i++) {
    const h = e.queue[i]![0];
    if (h?.t !== 'enter' || h.auto !== ENTER_NIGHT || e.hp[i]! <= 0) continue;
    if (p === Period.Dawn) {
      const b = state.buildings.get(h.b);
      if (b) {
        let ok = clear.get(b.id);
        if (ok === undefined) clear.set(b.id, (ok = clearOfMonsters(state, b)));
        if (!ok) continue;
      }
    }
    comeOut(state, i);
  }
}

nightHooks.workOn = workOnTonight;
nightHooks.reach = nightReach;
nightHooks.clear = clearOfMonsters;
answerKinds.set(NIGHT_WORK_ASK, answerNightWork);
