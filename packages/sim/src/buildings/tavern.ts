// The Tavern (Patch 5, Jade, GP-19 and GP-20). Its Open for business button
// turns it on and off; while it is open it burns one food every 3 seconds
// and turns it into silver: 18 food burned make one silver ingot, which
// builds up in its till as a fraction, shown to 3 decimals. Withdraw funds
// takes the whole silver ingots into the player's stock and leaves the
// fraction behind. Each Tavern counts the food it has burned, and so the
// silver it has made. The sim keeps the till in eighteenths of a silver
// ingot (one per food burned), so nothing is lost to rounding. It also hires
// the Dreadnought (units/dreadnought.ts; production.ts).
//
// Its state is in the building record's `acc` (store.ts): whether it is
// open, the steps since its last food, the till in eighteenths, the food it
// has burned in all, and who opened it (the owner, or a player using an
// inherited Tavern), who feeds it.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { payFood } from '../economy/food.ts';
import { Res } from '../economy/resources.ts';
import type { SimState } from '../state.ts';
import { BuildingKind } from './data.ts';
import { buildingCentre } from './lights.ts';
import type { Building } from './store.ts';

/** The Tavern's row (Jade, GP-20). */
export const TAVERN = {
  /** Steps between the foods it burns while open (Jade: one every 3 seconds). */
  burnSteps: 3 * STEPS_PER_SECOND,
  /** Food burned for one silver ingot (Jade: 18). */
  foodPerSilver: 18,
  /** Decimal places its till shows (Jade: 3). */
  places: 3,
};

/** Where each part of a Tavern's state is in its `acc`. */
const OPEN = 0;
const TIMER = 1;
const HELD = 2;
const BURNED = 3;
const BY = 4;
/** The alert bit for "out of food" (store.ts Building.alerted; bit 1 is the queue's supply). */
const NO_FOOD_ALERT = 2;

function at(b: Building, k: number): number {
  return b.acc[k] ?? 0;
}

function put(b: Building, k: number, v: number): void {
  while (b.acc.length <= k) b.acc.push(0);
  b.acc[k] = v;
}

export function isTavern(b: Pick<Building, 'kind'>): boolean {
  return b.kind === BuildingKind.Tavern;
}

/** Whether a Tavern is open for business. */
export function tavernOpen(b: Building): boolean {
  return isTavern(b) && at(b, OPEN) !== 0;
}

/** Opens a finished Tavern for business for a player (who feeds it), or closes it. False when nothing changed. */
export function setTavernOpen(b: Building, open: boolean, player: number): boolean {
  if (!isTavern(b) || !b.complete || tavernOpen(b) === open) return false;
  put(b, OPEN, open ? 1 : 0);
  if (open) put(b, BY, player);
  // The food under way is kept: closing and opening again does not start the 3 s afresh.
  b.alerted &= ~NO_FOOD_ALERT;
  return true;
}

/** The whole silver ingots in a Tavern's till. */
export function tavernWhole(b: Building): number {
  return floorDiv(at(b, HELD), TAVERN.foodPerSilver);
}

/** Withdraw funds (Jade): the till's whole silver ingots go to a player's stock, the fraction stays. Returns how many. */
export function withdrawFunds(state: SimState, b: Building, player: number): number {
  const whole = tavernWhole(b);
  if (whole <= 0) return 0;
  put(b, HELD, at(b, HELD) - whole * TAVERN.foodPerSilver);
  const pool = state.players[player]!.pool;
  pool[Res.Silver] = pool[Res.Silver]! + whole;
  return whole;
}

/** One step of every open Tavern: a food every 3 s from whoever opened it, into the till; with none to spare it waits, and says so once. */
export function updateTaverns(state: SimState): void {
  for (const b of state.buildings.list) {
    if (!b.complete || !tavernOpen(b)) continue;
    const timer = Math.min(at(b, TIMER) + 1, TAVERN.burnSteps);
    put(b, TIMER, timer);
    if (timer < TAVERN.burnSteps) continue;
    const by = state.players[at(b, BY)] ? at(b, BY) : b.owner;
    if (!payFood(state.players[by]!, 1)) {
      if ((b.alerted & NO_FOOD_ALERT) === 0) {
        b.alerted |= NO_FOOD_ALERT;
        const [x, z] = buildingCentre(b);
        state.events.push({ player: by, kind: 'alert', text: 'The Tavern has no food to serve. It makes no silver until there is food to spare.', x, z });
      }
      continue;
    }
    b.alerted &= ~NO_FOOD_ALERT;
    put(b, TIMER, 0);
    put(b, HELD, at(b, HELD) + 1);
    put(b, BURNED, at(b, BURNED) + 1);
  }
}

/** What a Tavern's panel shows (Jade, GP-20). */
export interface TavernInfo {
  open: boolean;
  /** The till: whole silver ingots, and the thousandths of the next one (to 3 decimals, rounded down). */
  whole: number;
  thousandths: number;
  /** The bar to the next silver ingot: steps done of the whole, and whether it moves now. */
  done: number;
  span: number;
  /** In all: silver made, to the thousandth (whole and thousandths), and food burned. */
  madeWhole: number;
  madeThousandths: number;
  food: number;
}

/** A number of eighteenths as whole silver and thousandths of the next, rounded down. */
function silver(eighteenths: number): [number, number] {
  const whole = floorDiv(eighteenths, TAVERN.foodPerSilver);
  const rest = eighteenths - whole * TAVERN.foodPerSilver;
  return [whole, floorDiv(rest * 1000, TAVERN.foodPerSilver)];
}

/** A finished Tavern's panel, or null for any other building. */
export function tavernInfo(b: Building): TavernInfo | null {
  if (!isTavern(b) || !b.complete) return null;
  const held = at(b, HELD);
  const [whole, thousandths] = silver(held);
  const [madeWhole, madeThousandths] = silver(at(b, BURNED));
  const span = TAVERN.foodPerSilver * TAVERN.burnSteps;
  const done = (held % TAVERN.foodPerSilver) * TAVERN.burnSteps + at(b, TIMER);
  return { open: tavernOpen(b), whole, thousandths, done, span, madeWhole, madeThousandths, food: at(b, BURNED) };
}
