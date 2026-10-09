// Fertilizing farms (Patch 5, Jade: "Fertilize costs 2 bonemeal and boosts
// farm output by 30% for 2 minutes", with her decisions 2.5: left click
// boosts now or queues one more boost, right click toggles Auto fertilize,
// which keeps the farm boosted while the bonemeal lasts, and several selected
// farms all fertilize). A boost is paid when it is asked for; the ones queued
// behind the boost running now start one after another. A farm within 30 m of
// a Sweet Hawthorne grows 35% more besides (Jade's stone circles; the thread
// that plants the trees fills fairyHooks).
//
// A boost speeds the harvest bar: each farmer at work adds FARM_PACE units a
// step to it, 30% more while boosted and 35% more by a Sweet Hawthorne, and a
// full bar still brings in one farmer-day's yield, whole items only.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { Res } from '../economy/resources.ts';
import type { SimState } from '../state.ts';
import { buildingCentre } from './lights.ts';
import { BuildingKind } from './data.ts';
import type { Building } from './store.ts';

/** What a boost costs (Jade): 2 bonemeal. */
export const FERTILIZE_BONEMEAL = 2;
/** How long a boost lasts (Jade): 2 minutes. */
export const BOOST_STEPS = 120 * STEPS_PER_SECOND;
/** How much more a boosted farm grows (Jade): 30%. */
export const BOOST_PCT = 30;
/** How much more a farm within HAWTHORNE_M of a Sweet Hawthorne grows (Jade, SC-9): 35%. */
export const HAWTHORNE_PCT = 35;
/** How near a Sweet Hawthorne a farm (or a breeding animal) must be (Jade, SC-9): 30 m. */
export const HAWTHORNE_M = 30;
/** Boosts a farm may have waiting behind the one running (s): as many as a production queue holds. */
export const BOOST_QUEUE_LIMIT = 10;
/** A farmer's work a step on the harvest bar, in units small enough that 30% and 35% of it are whole: 20. */
export const FARM_PACE = 20;

/** The alert bit (Building.alerted) for "Auto fertilize has run out of bonemeal", said once until it has some again. */
const DRY = 8;

/**
 * The Sweet Hawthorne (Jade's stone circles, SC-8 and SC-9): whether one
 * stands within HAWTHORNE_M of a point (wu). The thread that plants the trees
 * sets it; until then there are none.
 */
export const fairyHooks: { hawthorneNear: (state: SimState, x: number, z: number) => boolean } = { hawthorneNear: () => false };

/** Whether a building can be fertilized: a finished Farm. */
export function fertilizable(b: Building): boolean {
  return b.complete && b.kind === BuildingKind.Farm;
}

/** Whether a farm stands within HAWTHORNE_M of a Sweet Hawthorne. */
export function byHawthorne(state: SimState, b: Building): boolean {
  const [x, z] = buildingCentre(b);
  return fairyHooks.hawthorneNear(state, x, z);
}

/** A farm's pace now, in percent of its plain yield: 100, plus 30 while boosted, plus 35 by a Sweet Hawthorne. */
export function farmPacePct(state: SimState, b: Building): number {
  return 100 + (b.boostLeft > 0 ? BOOST_PCT : 0) + (byHawthorne(state, b) ? HAWTHORNE_PCT : 0);
}

/** What one farmer at work adds to a farm's harvest bar a step now, in FARM_PACE units. */
export function farmPace(state: SimState, b: Building): number {
  return floorDiv(FARM_PACE * farmPacePct(state, b), 100);
}

/** Why a player cannot fertilize a farm now, or ''. */
export function fertilizeProblem(state: SimState, b: Building, player: number): string {
  if (!fertilizable(b)) return 'Only a finished farm can be fertilized.';
  if (b.boostLeft > 0 && b.boosts >= BOOST_QUEUE_LIMIT) return `This farm already has ${BOOST_QUEUE_LIMIT} boosts waiting.`;
  if (state.players[player]!.pool[Res.Bonemeal]! < FERTILIZE_BONEMEAL) return `Needs ${FERTILIZE_BONEMEAL} bonemeal. The Workshop makes bonemeal from bone.`;
  return '';
}

/** Fertilizes a farm for a player, who pays now: the boost starts at once, or waits behind the one running. Returns '' or why not. */
export function fertilize(state: SimState, b: Building, player: number): string {
  const why = fertilizeProblem(state, b, player);
  if (why) return why;
  const pool = state.players[player]!.pool;
  pool[Res.Bonemeal] = pool[Res.Bonemeal]! - FERTILIZE_BONEMEAL;
  if (b.boostLeft > 0) b.boosts++;
  else b.boostLeft = BOOST_STEPS;
  b.alerted &= ~DRY;
  return '';
}

/** Turns a farm's Auto fertilize on or off. */
export function setAutoFertilize(b: Building, on: boolean): void {
  b.boostAuto = on ? 1 : 0;
  if (!on) b.alerted &= ~DRY;
}

/**
 * One step of a farm's boosts: the boost running wears off, the next waiting
 * one starts, and with Auto fertilize a new one is paid for while the farm
 * has a farmer at work and the stock has the bonemeal (said once when it runs
 * out).
 */
export function updateFarmBoost(state: SimState, b: Building, farming: boolean): void {
  if (b.boostLeft > 0) {
    b.boostLeft--;
    if (b.boostLeft > 0) return;
  }
  if (b.boosts > 0) {
    b.boosts--;
    b.boostLeft = BOOST_STEPS;
    return;
  }
  if (b.boostAuto === 0 || !farming) return;
  const pool = state.players[b.owner]!.pool;
  if (pool[Res.Bonemeal]! >= FERTILIZE_BONEMEAL) {
    pool[Res.Bonemeal] = pool[Res.Bonemeal]! - FERTILIZE_BONEMEAL;
    b.boostLeft = BOOST_STEPS;
    b.alerted &= ~DRY;
    return;
  }
  if ((b.alerted & DRY) !== 0) return;
  b.alerted |= DRY;
  const [x, z] = buildingCentre(b);
  state.events.push({ player: b.owner, kind: 'alert', text: 'Auto fertilize is out of bonemeal. Make more at the Workshop from bone.', x, z });
}

/** What the farm panel's "Boost remaining" bar shows (UI-17): steps left of the boost running, of its whole, the boosts waiting, Auto fertilize, and the Sweet Hawthorne's share. */
export interface FarmBoost {
  left: number;
  whole: number;
  queued: number;
  auto: boolean;
  hawthorne: boolean;
}

export function farmBoost(state: SimState, b: Building): FarmBoost | null {
  if (!fertilizable(b)) return null;
  return { left: b.boostLeft, whole: BOOST_STEPS, queued: b.boosts, auto: b.boostAuto !== 0, hawthorne: byHawthorne(state, b) };
}
