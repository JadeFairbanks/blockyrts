// Equipment handling (Patch 7, plan section 7: Menus and Controls; section 6:
// Scrapping). Gear moves between the stock, a unit's bag, its hands and the
// Workshop without a trip to a store point where none is needed: a piece in a
// unit's own bag goes on where it stands (Equip), a worn piece comes off into
// the bag or onto the ground (Take off, Drop), a good can be locked in the bag
// against the automatic hand-in (Keep in bag, units/loot.ts), a unit walks a
// piece over to another (Give) or to the Workshop to be scrapped (Scrap), and
// a unit that picks up a piece that fits it and beats what it has asks
// whether it may use it (the pickup prompt). Every move is an order, so each
// machine agrees; nothing here draws on a random stream.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { queueProduct } from '../buildings/production.ts';
import { RECIPES } from '../buildings/recipes.ts';
import { RECIPE_PRODUCT, type Building } from '../buildings/store.ts';
import { RESOURCES } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { say } from '../peoples/speech.ts';
import type { SimState } from '../state.ts';
import { Act, besideBuilding, FAILED, MOVING, resetWalk, walkTo } from './behaviour.ts';
import { inFront } from './gear.ts';
import { addToBag, bagCount, bagRoom, canLoot, keepItem, takeFromBag } from './loot.ts';
import type { UnitOrder } from './unit-orders.ts';

type GiveOrder = Extract<UnitOrder, { t: 'give' }>;
type ScrapOrder = Extract<UnitOrder, { t: 'scrap' }>;

const CONTINUE = false;
const DONE = true;

/** A unit hands a piece to another from this close (s): 2 m. */
export const GIVE_REACH_M = 2;

/** "the steel halberd": a good's name, lower case, with "the". */
function theGood(res: number): string {
  return `the ${(RESOURCES[res]?.name ?? 'item').toLowerCase()}`;
}

/** The column a point (wu) is in. */
function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

// ----- Equip from the bag, Take off and Drop -----

/** Equip from the bag (equipBag): each unit carrying the good puts it on where it stands, the old piece into its bag. */
export function orderEquipBag(state: SimState, units: readonly number[], res: number): void {
  void state;
  void units;
  void res;
}

/** Take off (into the bag) or Drop (on the ground) a worn piece, by line. */
export function orderTakeOff(state: SimState, units: readonly number[], line: number, drop: boolean): void {
  void state;
  void units;
  void line;
  void drop;
}

// ----- Keep in bag -----

/** Keep in bag (keepItem): each unit locks (on) or frees all of a good in its bag. */
export function orderKeep(state: SimState, units: readonly number[], res: number, on: boolean): void {
  for (const i of units) if (canLoot(state, i)) keepItem(state, i, res, on);
}

// ----- Give -----

/**
 * Give (giveItem; plan section 7: "Give… walks the piece to another unit and
 * hands it over"): the first of the units carrying the good in its bag walks
 * to `target`, another of its player's living people, and hands one into its
 * bag, in front of whatever it was doing.
 */
export function orderGive(state: SimState, player: number, units: readonly number[], res: number, target: number): void {
  const e = state.entities;
  const t = e.indexOf(target);
  if (t < 0 || e.owner[t] !== player || !canLoot(state, t)) {
    if (units[0] !== undefined) say(state, units[0], 'I can only give it to one of our own people.', true);
    return;
  }
  const giver = units.find((i) => i !== t && canLoot(state, i) && bagCount(state, i, res) > 0);
  if (giver === undefined) return;
  inFront(state, giver, { t: 'give', id: target, res });
}

/** Walks to the unit it gives to (or the building it is in) and hands the piece over. */
export function runGive(state: SimState, i: number, o: GiveOrder): boolean {
  const e = state.entities;
  const t = e.indexOf(o.id);
  if (t < 0 || t === i || e.owner[t] !== e.owner[i] || !canLoot(state, t)) {
    say(state, i, 'They are gone.', false, true);
    return DONE;
  }
  if (bagCount(state, i, o.res) <= 0) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const inside = e.inside[t] !== 0 ? state.buildings.get(e.inside[t]!) : undefined;
  const near = inside ? false : length2d(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!) <= GIVE_REACH_M * WU_PER_METRE;
  if (!near) {
    const r = inside ? walkTo(state, i, besideBuilding(inside)) : walkTo(state, i, { ...pointGoal(col(e.x[t]!), col(e.z[t]!)), max: 1 });
    if (r === MOVING) {
      // Look again for one on the move now and then, as Follow does.
      if (!inside && state.step >= e.waitUntil[i]!) {
        e.waitUntil[i] = state.step + STEPS_PER_SECOND;
        resetWalk(state, i);
      }
      return CONTINUE;
    }
    if (r === FAILED) {
      say(state, i, 'I cannot reach them.', true);
      return DONE;
    }
  }
  if (bagRoom(state, t, o.res) < 1) {
    say(state, i, 'Their bag is full.', true);
    return DONE;
  }
  takeFromBag(state, i, o.res, 1);
  addToBag(state, t, o.res, 1);
  say(state, i, `Here, take ${theGood(o.res)}.`, false, true);
  handlingHooks.received(state, t, o.res);
  return DONE;
}

// ----- Scrap -----

/** The Workshop product that scraps an item (Scrap equipment), or -1 when nothing scraps it. */
export function scrapProductOf(res: number): number {
  const k = RECIPES.findIndex((r) => r.scrap === res);
  return k < 0 ? -1 : RECIPE_PRODUCT + k;
}

/** The player's finished Workshop nearest a unit, or undefined. */
function nearestWorkshop(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || b.kind !== BuildingKind.Workshop) continue;
    const [x, z] = buildingCentre(b);
    const d = dist2(x, z, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** Whether a unit has the piece a Scrap order is for: in its bag, or worn (`worn`). */
function hasPiece(state: SimState, i: number, res: number, worn: boolean): boolean {
  return worn ? handlingHooks.wears(state, i, res) : bagCount(state, i, res) > 0;
}

/**
 * Scrap from a unit (scrapItem; plan section 7: "Scrap sends the unit to the
 * Workshop with it"): each unit with the piece, in its bag or worn, walks to
 * the Workshop (`building`, or the nearest of its player's), in front of
 * whatever it was doing, and hands it in there to be scrapped.
 */
export function orderScrapItem(state: SimState, player: number, units: readonly number[], res: number, worn: boolean, building: number): void {
  if (scrapProductOf(res) < 0) return;
  const chosen = state.buildings.get(building);
  for (const i of units) {
    if (!canLoot(state, i) || !hasPiece(state, i, res, worn)) continue;
    const b = chosen && chosen.owner === player && chosen.complete && chosen.kind === BuildingKind.Workshop ? chosen : nearestWorkshop(state, i);
    if (!b) {
      say(state, i, 'There is no Workshop to scrap it at.', true);
      continue;
    }
    inFront(state, i, { t: 'scrap', b: b.id, res, worn: worn ? 1 : 0 });
  }
}

/** Walks to the Workshop and hands the piece in there, queued for scrapping. */
export function runScrap(state: SimState, i: number, o: ScrapOrder): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner >= state.players.length || !hasPiece(state, i, o.res, o.worn !== 0)) return DONE;
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== owner || !b.complete || b.kind !== BuildingKind.Workshop) {
    b = nearestWorkshop(state, i);
    if (!b) {
      say(state, i, 'There is no Workshop left to scrap it at.', true);
      return DONE;
    }
    o.b = b.id;
    e.act[i] = Act.Start;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) {
    say(state, i, 'I cannot reach the Workshop.', true);
    return DONE;
  }
  if (o.worn !== 0) handlingHooks.takeOffWorn(state, i, o.res);
  else takeFromBag(state, i, o.res, 1);
  const pool = state.players[owner]!.pool;
  pool[o.res] = pool[o.res]! + 1;
  const why = queueProduct(state, b, scrapProductOf(o.res), owner, 0, 1);
  if (why) say(state, i, `${why} I left ${theGood(o.res)} in the stock.`, true);
  else say(state, i, `Left ${theGood(o.res)} at the ${buildingName(b.kind, b.level, b.variant).toLowerCase()} to be scrapped.`, false, true);
  return DONE;
}

/** What the worn-gear rules (filled in below, once the gear rows are known) answer for Give and Scrap. */
export const handlingHooks: {
  /** A unit was handed a piece (Give): it may ask to use it. */
  received: (state: SimState, i: number, res: number) => void;
  /** Whether a unit wears or holds a good. */
  wears: (state: SimState, i: number, res: number) => boolean;
  /** Takes a worn good off a unit, gone from it (to be scrapped). */
  takeOffWorn: (state: SimState, i: number, res: number) => void;
} = { received: () => {}, wears: () => false, takeOffWorn: () => {} };
