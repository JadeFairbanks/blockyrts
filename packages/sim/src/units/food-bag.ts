// Food in a unit's bag (Patch 7, Jade 2026-10-10: "with the dropdown in the
// units individual inventory, allow them to eat food they are carrying to
// heal. They still do tinkering animation/progress bar etc but dont need to
// go to store point if they have the food in their inventory. And then ...
// you should be able to drag food from your inventory to a unit, or to that
// units inventory (both work), and then they walk to a store point to
// collect it."). Mini patch 7.3 (Jade: "allow functionality for moving all
// items to and from players and units inventories, not just food and
// weapons ... For simply exchanging items there should be no
// tinkering/progress bar"): Fetch takes any good, with no bar, and the unit
// says what it got. Eat from the bag is an eat order naming the food
// (unit-orders.ts), sat out where the unit stands as a meal at a building
// is; Fetch food walks to the nearest main base or storehouse and takes a
// full heal's worth of the food from the stock into its bag, kept there so
// it is not handed straight back in. Every move is an order, so each
// machine agrees; nothing here draws on a random stream.

import { buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { EAT_FULL_FOOD, EAT_STEPS, eatCarried, eatNeed, mealFoodText, servesFood } from '../economy/food.ts';
import { RESOURCES } from '../economy/resources.ts';
import { ceilDiv } from '../fixed.ts';
import { say } from '../peoples/speech.ts';
import { NO_CARRY, type SimState } from '../state.ts';
import { Act, besideBuilding, FAILED, MOVING, walkTo } from './behaviour.ts';
import { inFront } from './gear.ts';
import { isGearItem } from './kits.ts';
import { addToBag, bagRoom, canLoot, carriedOf, countText, keepItem, takeFromBag } from './loot.ts';
import { tinker, tinkering } from './tinker.ts';
import type { UnitOrder } from './unit-orders.ts';

type EatOrder = Extract<UnitOrder, { t: 'eat' }>;
type FetchOrder = Extract<UnitOrder, { t: 'fetch' }>;

const CONTINUE = false;
const DONE = true;

/** The nearest building of the player's where a unit can eat or fetch food: a main base or a storehouse. */
export function nearestTable(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || !servesFood(b.kind)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Whether a good is food. */
function isFood(res: number): boolean {
  return (RESOURCES[res]?.nutrition ?? 0) > 0;
}

// ----- Eat from the bag -----

/** Takes n of a food a unit carries: from its bag first, then its gathered load (a woodsman's berries). */
function takeCarried(state: SimState, i: number, res: number, n: number): void {
  const e = state.entities;
  const left = n - takeFromBag(state, i, res, n);
  if (left <= 0 || e.carryRes[i] !== res) return;
  e.carryAmt[i] = Math.max(0, e.carryAmt[i]! - left);
  if (e.carryAmt[i] === 0) e.carryRes[i] = NO_CARRY;
}

/**
 * Eat from the bag (eatBag): each unit carrying the food, in its bag or as
 * its gathered load, sits down and eats it where it stands, in front of whatever it was doing, and carries on
 * after. One not hurt, or already at a meal, says so.
 */
export function orderEatBag(state: SimState, units: readonly number[], res: number): void {
  const e = state.entities;
  for (const i of units) {
    if (!canLoot(state, i) || !isFood(res) || carriedOf(state, i, res) <= 0) continue;
    if (e.queue[i]![0]?.t === 'eat' && tinkering(state, i)) {
      say(state, i, 'I am eating already.');
      continue;
    }
    if (eatNeed(e.hp[i]!, e.maxHp[i]!) === 0) {
      say(state, i, 'I am not hurt.');
      continue;
    }
    inFront(state, i, { t: 'eat', b: 0, res });
  }
}

/** Eats from its bag where it stands, then sits for the meal with the bar over its head while it heals, as at a building. */
export function runEatBag(state: SimState, i: number, o: EatOrder): boolean {
  const e = state.entities;
  if (e.act[i] !== Act.Work) {
    const [n, why] = eatCarried(state, i, o.res, carriedOf(state, i, o.res));
    if (n === 0) {
      say(state, i, why);
      return DONE;
    }
    takeCarried(state, i, o.res, n);
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  return tinker(state, i, EAT_STEPS) ? DONE : CONTINUE;
}

// ----- Fetch (food, and since mini patch 7.3 any good) -----

/** How many of a food a unit fetches from the stock (s): enough to heal fully once (4 food), at least one: 1 meat, 2 fish, 4 bunches of berries. */
export function fetchCount(res: number): number {
  const each = RESOURCES[res]?.nutrition ?? 0;
  return each > 0 ? Math.max(1, ceilDiv(EAT_FULL_FOOD, each)) : 0;
}

/**
 * How many of a good one drag fetches (mini patch 7.3, Jade: "allow
 * functionality for moving all items to and from players and units
 * inventories, not just food and weapons"), with `room` of it fitting in the
 * unit's bag and `stock` in the stock: a food a full heal's worth (Patch 7),
 * a piece of gear one, any other good as many as fit; never more than the
 * stock has. The HUD's drag word shows it.
 */
export function fetchAmount(res: number, room: number, stock: number): number {
  const want = isFood(res) ? fetchCount(res) : isGearItem(res) ? 1 : room;
  return Math.max(0, Math.min(want, room, stock));
}

/** "the main base", "the storehouse". */
function theBuilding(b: Building): string {
  return `the ${buildingName(b.kind, b.level, b.variant).toLowerCase()}`;
}

/** "some blueberries" for a food (Patch 7's words), "iron ore" for anything else. */
function goodText(res: number): string {
  return isFood(res) ? mealFoodText(res) : (RESOURCES[res]?.name ?? 'it').toLowerCase();
}

/**
 * Fetch (fetchFood): each unit walks to the nearest main base or storehouse,
 * in front of whatever it was doing, to take the good from the stock into its
 * bag (fetchAmount). Refused when the stock has none, its bag has no room for
 * one, or there is nowhere to fetch it from. A plain exchange: no bar.
 */
export function orderFetchFood(state: SimState, player: number, units: readonly number[], res: number): void {
  const p = state.players[player];
  if (!p || !RESOURCES[res]) return;
  const what = goodText(res);
  if ((p.pool[res] ?? 0) <= 0) {
    state.events.push({ player, kind: 'alert', text: `There is no ${(RESOURCES[res]?.name ?? 'food').toLowerCase()} in the stock.` });
    return;
  }
  for (const i of units) {
    if (!canLoot(state, i)) continue;
    const room = bagRoom(state, i, res);
    if (room < 1) {
      say(state, i, `My bag is too full for ${what}.`, true);
      continue;
    }
    const b = nearestTable(state, i);
    if (!b) {
      say(state, i, 'There is no main base or storehouse to fetch it from.', true);
      continue;
    }
    // What fits now; the stock is looked at again when it gets there.
    const n = isFood(res) ? fetchCount(res) : fetchAmount(res, room, room);
    inFront(state, i, { t: 'fetch', res, n, b: b.id });
    say(state, i, `Off to ${theBuilding(b)} for ${what}.`, false, true);
  }
}

/** Walks to the main base or storehouse and takes the good from the stock there, as much as is left and fits, kept in its bag; says what it got. */
export function runFetch(state: SimState, i: number, o: FetchOrder): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner >= state.players.length || !canLoot(state, i)) return DONE;
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== owner || !b.complete || !servesFood(b.kind)) {
    b = nearestTable(state, i);
    if (!b) {
      say(state, i, 'There is no main base or storehouse left to fetch it from.', true);
      return DONE;
    }
    o.b = b.id;
    e.act[i] = Act.Start;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  const what = goodText(o.res);
  if (r === FAILED) {
    say(state, i, `I cannot reach ${theBuilding(b)}.`, true);
    return DONE;
  }
  const pool = state.players[owner]!.pool;
  const n = Math.min(o.n, pool[o.res] ?? 0, bagRoom(state, i, o.res));
  if (n <= 0) {
    say(state, i, (pool[o.res] ?? 0) <= 0 ? `There is no ${(RESOURCES[o.res]?.name ?? 'food').toLowerCase()} left in the stock.` : `My bag is too full for ${what}.`, true);
    return DONE;
  }
  pool[o.res] = pool[o.res]! - n;
  addToBag(state, i, o.res, n);
  // Kept, so it does not hand it straight back in at the store point (Patch 7, Keep in bag).
  keepItem(state, i, o.res, true);
  // Mini patch 7.3 (Jade: units say in a bubble what was given or received).
  say(state, i, `Got ${countText(o.res, n)}.`, false, true);
  return DONE;
}
