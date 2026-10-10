// Equipment handling (Patch 7, plan section 7: Menus and Controls; section 6:
// Scrapping). Gear moves between the stock, a unit's bag, its hands and the
// Workshop without a trip to a store point where none is needed: a piece in a
// unit's own bag goes on where it stands (Equip), a worn piece comes off into
// the bag or onto the ground (Take off, Drop), a good can be locked in the bag
// against the automatic hand-in (Keep in bag, units/loot.ts), a unit walks a
// piece over to another (Give) or to the Workshop to be scrapped (Scrap), and
// a unit that picks up a piece that fits it and beats what it has asks
// whether it may use it (the pickup prompt, units/pickup-ask.ts). Equip from the stock still walks
// to a store point, now for any piece that fits, on several units at once.
// Every move is an order, so each machine agrees; nothing here draws on a
// random stream.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { queueProduct } from '../buildings/production.ts';
import { RECIPES } from '../buildings/recipes.ts';
import { RECIPE_PRODUCT, type Building } from '../buildings/store.ts';
import { pay, RESOURCES, type Res } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { manaCap } from '../magic/mages.ts';
import { pointGoal } from '../nav/path.ts';
import { say } from '../peoples/speech.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Act, besideBuilding, FAILED, MOVING, resetWalk, walkTo } from './behaviour.ts';
import { sayNeedSmashing } from './dreadnought.ts';
import { equipsAt, inFront, kitHolder, nearestEquipPlace, pendingLines, refundKit } from './gear.ts';
import {
  fitProblem,
  GEAR,
  gearItem,
  gearScore,
  holderTakesTips,
  isGearItem,
  ITEM_WAY,
  itemGear,
  itemLine,
  itemScore,
  Line,
  linePiece,
  lineScore,
  lineTier,
  lineTop,
  ownGearItem,
  replacedItem,
  SMASHING_LINE,
  takeOffLine,
  TIPS_KIT,
  Troop,
  wearItem,
  type KitHolder,
} from './kits.ts';
import { addToBag, bagCount, bagRoom, bagTakes, canLoot, dropAtFeet, keepItem, lootHooks, takeFromBag } from './loot.ts';
import type { UnitOrder } from './unit-orders.ts';

type GiveOrder = Extract<UnitOrder, { t: 'give' }>;
type ScrapOrder = Extract<UnitOrder, { t: 'scrap' }>;
type PutOnOrder = Extract<UnitOrder, { t: 'putOn' }>;

const CONTINUE = false;
const DONE = true;

/** A unit hands a piece to another from this close (s): 2 m. */
export const GIVE_REACH_M = 2;

/** The kit lines a piece can be worn on: weapon (a worker's tools, a mage's wand), armour (a mage's robe) and shield. */
const WORN_LINES: readonly number[] = [Line.Weapon, Line.Armour, Line.Shield];

/** "steel halberd": a good's name, lower case. */
function goodName(res: number): string {
  return (RESOURCES[res]?.name ?? 'item').toLowerCase();
}

/** "the steel halberd". */
function theGood(res: number): string {
  return `the ${goodName(res)}`;
}

/** "a steel halberd", "an iron pike". */
function aGood(res: number): string {
  const name = goodName(res);
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/** The column a point (wu) is in. */
function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

/** Says why a unit cannot take a piece: the Dreadnought's own line with his war cry, anyone else's in its bubble. */
function sayWhy(state: SimState, i: number, why: string): void {
  if (why === SMASHING_LINE) sayNeedSmashing(state, i);
  else say(state, i, why, true);
}

// ----- what a unit wears -----

function isDreadnought(h: KitHolder): boolean {
  return h.kind === 'warrior' && h.troop === Troop.Dreadnought;
}

/** The piece a unit wears or holds on a line, as the good it comes off as, or undefined (none, or one that never changes: a brawler's pistol and cutlass). */
export function wornItem(state: SimState, i: number, line: number): Res | undefined {
  const h = kitHolder(state, i);
  return h ? wornOn(state, i, h, line) : undefined;
}

function wornOn(state: SimState, i: number, h: KitHolder, line: number): Res | undefined {
  const e = state.entities;
  if (isDreadnought(h)) return line === Line.Weapon ? gearItem(e.weapon[i]!) : line === Line.Armour ? gearItem(e.armour[i]!) : undefined;
  if (lineTop(h, line) === 0) return undefined;
  return replacedItem(h, line);
}

/** Whether a unit wears or holds a good. */
export function wears(state: SimState, i: number, res: number): boolean {
  return WORN_LINES.some((line) => wornItem(state, i, line) === res);
}

/** A line's worth on a unit now (kits.ts gearScore): the Dreadnought's slot, anyone else's line. */
function wornScore(state: SimState, i: number, h: KitHolder, line: number): number {
  const e = state.entities;
  if (isDreadnought(h)) return gearScore(line === Line.Armour ? e.armour[i]! : e.weapon[i]!, h);
  return lineScore(h, line);
}

/** What putting a piece on would take off a unit: the piece it has on that line, and a ranger's poison tips when the new weapon takes none (as kits.ts wearItem does). */
function comesOff(state: SimState, i: number, h: KitHolder, res: number): Res[] {
  const line = itemLine(res);
  const old = wornOn(state, i, h, line);
  const off: Res[] = old !== undefined ? [old] : [];
  if (line === Line.Weapon && h.t > 0 && !isDreadnought(h)) {
    const gear = itemGear(res, h);
    const after: KitHolder = { kind: h.kind, troop: h.troop, w: GEAR[gear]?.rung ?? h.w, a: h.a, s: h.s, t: h.t };
    const own = ownGearItem(gear);
    if (own !== undefined) after.wItem = own;
    if (!holderTakesTips(after)) off.push(TIPS_KIT.items[0]!);
  }
  return off;
}

/** A mage's mana bar no fuller than her wand now allows. */
function capMana(state: SimState, i: number): void {
  const e = state.entities;
  if (e.kind[i] === UnitKind.Mage) e.mana[i] = Math.min(e.mana[i]!, manaCap(state, i));
}

/** Why a unit cannot put on a piece from its bag where it stands, or ''. */
function bagEquipProblem(state: SimState, i: number, h: KitHolder, res: number): string {
  const why = fitProblem(h, res);
  if (why) return why;
  const line = itemLine(res);
  if (wornOn(state, i, h, line) === res) return 'I already have one.';
  const off = comesOff(state, i, h, res);
  if (!bagTakes(state, i, off, res)) return `My bag is too full for ${theGood(off[0]!)}.`;
  return '';
}

/** Puts a piece from a unit's bag on at once, the old piece (and any poison tips) into its bag; the caller has checked bagEquipProblem. */
function swapIn(state: SimState, i: number, h: KitHolder, res: number): void {
  takeFromBag(state, i, res, 1);
  const off = wearItem(state.entities, i, h.kind, res as Res);
  if (!off) {
    addToBag(state, i, res, 1);
    return;
  }
  for (const r of off) addToBag(state, i, r, 1);
  capMana(state, i);
  say(state, i, `Using ${theGood(res)} now.`, false, true);
}

// ----- Equip from the bag, Take off and Drop -----

/**
 * Equip from the bag (equipBag; plan section 7: "Equip swaps the piece in on
 * the spot"): each unit carrying the good puts it on where it stands, no
 * trip to a store point, and the piece it had goes into its bag. Refused,
 * with the reason in its bubble, when it does not fit (the Dreadnought
 * offered a weapon he cannot use: "I need something for smashing.") or the
 * old piece would not fit in the bag ("Bag full", plan section 7).
 */
export function orderEquipBag(state: SimState, units: readonly number[], res: number): void {
  for (const i of units) {
    if (!canLoot(state, i) || bagCount(state, i, res) <= 0) continue;
    const h = kitHolder(state, i);
    if (!h) {
      say(state, i, `I cannot use ${aGood(res)}.`, true);
      continue;
    }
    const why = bagEquipProblem(state, i, h, res);
    if (why) {
      sayWhy(state, i, why);
      continue;
    }
    swapIn(state, i, h, res);
  }
}

/**
 * Take off (into the bag) or Drop (on the ground at its feet) a worn piece,
 * by line (plan section 7, the gear slot menu): Line.Weapon (a worker's
 * tools, a mage's wand), Line.Armour (a mage's robe) or Line.Shield. A
 * ranger's poison tips come off with its bow. Take off is refused when the
 * bag has no room ("Bag full"); what comes off is kept in the bag (the
 * padlock), so a unit does not hand it in by itself.
 */
export function orderTakeOff(state: SimState, units: readonly number[], line: number, drop: boolean): void {
  const e = state.entities;
  for (const i of units) {
    if (!canLoot(state, i)) continue;
    const h = kitHolder(state, i);
    const old = h ? wornOn(state, i, h, line) : undefined;
    if (!h || old === undefined) {
      say(state, i, 'I have nothing there to take off.', true);
      continue;
    }
    const tips = line === Line.Weapon && !isDreadnought(h) && e.tips[i]! > 0 ? [TIPS_KIT.items[0]!] : [];
    if (!drop && !bagTakes(state, i, [old, ...tips])) {
      say(state, i, `My bag is too full for ${theGood(old)}.`, true);
      continue;
    }
    const off = takeOffLine(e, i, h.kind, line);
    for (const r of off) {
      if (drop) dropAtFeet(state, i, r, 1);
      else {
        // Kept, so the unit does not hand it straight in to the stock when it next goes idle.
        addToBag(state, i, r, 1);
        keepItem(state, i, r, true);
      }
    }
    capMana(state, i);
    if (off.length > 0) say(state, i, drop ? `Dropped ${theGood(old)}.` : `Took off ${theGood(old)}.`, false, true);
  }
}

// ----- Equip from the stock -----

/** The tier a ladder's kitUp puts a piece on at for a holder, and its place in that tier's items, or undefined when it is not one of the line's ladder items. */
function ladderSpot(h: KitHolder, line: number, res: number): { to: number; item: number } | undefined {
  const top = lineTop(h, line);
  for (let to = 1; to <= top; to++) {
    const item = linePiece(h, line, to)?.items.indexOf(res as Res) ?? -1;
    if (item >= 0) return { to, item };
  }
  return undefined;
}

/** Why a unit cannot take a piece from the stock, or ''. With `better`, a piece no better than what it has is refused too. */
function stockEquipProblem(state: SimState, i: number, h: KitHolder, res: number, better: boolean): string {
  const why = fitProblem(h, res);
  if (why) return why;
  const line = itemLine(res);
  if (wornOn(state, i, h, line) === res) return 'I already have one.';
  if (better && itemScore(res, h) <= wornScore(state, i, h, line)) return 'I already have better.';
  if ((pendingLines(state, i) >> line) & 1) return 'I am already on my way to upgrade that.';
  return '';
}

/**
 * Equip from the stock (Jade's Patch 5, GP-2: "click the equip and then
 * click the unit you want to equip it to, causing them to return to a drop
 * off point to receive it, and upgrade to that item via the usual process";
 * Patch 7, plan section 7: "with several units selected, Equip from the
 * stock gives one piece to each unit it fits, while the stock lasts"). Each
 * unit, the highest rank first, pays one piece now and walks to the nearest
 * drop-off or place to upgrade (main base, Storehouse, Forge, Barracks; the
 * Magi Sanctum for mages) to put it on, the old piece going to the stock. A
 * piece of a higher tier than its line has goes on as Upgrade equipment
 * puts a ready item on (kitUp, in a fifth of its time); any other piece (a
 * looted one no higher, a lower one, anything for the Dreadnought) goes on
 * as soon as it gets there (putOn). With several units, only those the
 * piece betters take one. When none takes it, the first that cannot says
 * why (the Dreadnought offered a weapon he cannot use: "I need something
 * for smashing."). Returns how many went.
 */
export function orderEquip(state: SimState, player: number, units: readonly number[], res: number): number {
  const e = state.entities;
  const p = state.players[player];
  if (!p) return 0;
  if ((p.pool[res] ?? 0) <= 0) {
    state.events.push({ player, kind: 'alert', text: `There is no ${goodName(res)} in the stock.` });
    return 0;
  }
  const several = units.length > 1;
  const order = units.filter((i) => e.owner[i] === player && e.hp[i]! > 0).sort((a, b) => e.rank[b]! - e.rank[a]! || e.id[a]! - e.id[b]!);
  let sent = 0;
  let refused: [number, string] | undefined;
  for (const i of order) {
    if (p.pool[res]! <= 0) break;
    const h = kitHolder(state, i);
    let why = h ? stockEquipProblem(state, i, h, res, several) : `I cannot use ${aGood(res)}.`;
    const place = h && !why ? nearestEquipPlace(state, i, h) : undefined;
    if (h && !why && !place) why = h.kind === 'mage' ? 'There is no main base, Storehouse, Forge, Barracks or Magi Sanctum to take it at.' : 'There is no main base, Storehouse, Forge or Barracks to take it at.';
    if (!h || why || !place) {
      refused ??= [i, why];
      continue;
    }
    pay(p.pool, [[res as Res, 1]]);
    const line = itemLine(res);
    const spot = isDreadnought(h) ? undefined : ladderSpot(h, line, res);
    if (spot && spot.to > lineTier(h, line)) inFront(state, i, { t: 'kitUp', line, to: spot.to, ways: ITEM_WAY + 8 * spot.item, paid: 1, b: place.id });
    else inFront(state, i, { t: 'putOn', res, b: place.id, paid: 1 });
    say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} for ${aGood(res)}.`, false, true);
    sent++;
  }
  if (sent === 0 && refused) sayWhy(state, refused[0], refused[1]);
  return sent;
}

/** Walks to the place to take a stock piece at and puts it on there, the old piece going to the stock. */
export function runPutOn(state: SimState, i: number, o: PutOnOrder): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  const h = kitHolder(state, i);
  if (!h || owner >= state.players.length) {
    refundKit(state, i, o);
    return DONE;
  }
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== owner || !b.complete || !equipsAt(h, b.kind)) {
    b = nearestEquipPlace(state, i, h);
    if (!b) {
      refundKit(state, i, o);
      say(state, i, `There is nowhere left to take it at. I left ${theGood(o.res)} in the stock.`, true);
      return DONE;
    }
    o.b = b.id;
    e.act[i] = Act.Start;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) {
    refundKit(state, i, o);
    say(state, i, `I cannot reach the ${buildingName(b.kind, b.level, b.variant).toLowerCase()}. I left ${theGood(o.res)} in the stock.`, true);
    return DONE;
  }
  const why = fitProblem(h, o.res);
  const off = why ? null : wearItem(e, i, h.kind, o.res as Res);
  if (!off) {
    refundKit(state, i, o);
    if (why) sayWhy(state, i, why);
    return DONE;
  }
  o.paid = 0;
  const pool = state.players[owner]!.pool;
  for (const r of off) pool[r] = pool[r]! + 1;
  capMana(state, i);
  say(state, i, `Using ${theGood(o.res)} now.`, false, true);
  return DONE;
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

/** Walks to the unit it gives to (or the building it is in) and hands the piece over; the other may ask to use it. */
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
  lootHooks.picked(state, t, [[o.res, 1]], false);
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
  return worn ? wears(state, i, res) : bagCount(state, i, res) > 0;
}

/** Takes a worn piece off a unit, gone from it; returns what came off (the piece, and a ranger's poison tips with its bow). */
function takeOffWorn(state: SimState, i: number, res: number): Res[] {
  const h = kitHolder(state, i);
  const line = WORN_LINES.find((l) => wornItem(state, i, l) === res);
  if (!h || line === undefined) return [];
  const off = takeOffLine(state.entities, i, h.kind, line);
  capMana(state, i);
  return off;
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

/** Walks to the Workshop and hands the piece in there, queued for scrapping (a worn piece comes off there, its bow's poison tips to the stock). */
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
  const pool = state.players[owner]!.pool;
  if (o.worn !== 0) {
    for (const got of takeOffWorn(state, i, o.res)) pool[got] = pool[got]! + 1;
  } else {
    takeFromBag(state, i, o.res, 1);
    pool[o.res] = pool[o.res]! + 1;
  }
  const why = queueProduct(state, b, scrapProductOf(o.res), owner, 0, 1);
  if (why) say(state, i, `${why} I left ${theGood(o.res)} in the stock.`, true);
  else say(state, i, `Left ${theGood(o.res)} at the ${buildingName(b.kind, b.level, b.variant).toLowerCase()} to be scrapped.`, false, true);
  return DONE;
}

// ----- the pickup prompt (units/pickup-ask.ts asks it) -----

/**
 * Whether a unit would want a piece just put in its bag (plan section 7: "a
 * piece that fits it and beats what it has"): it fits, it betters what the
 * unit has on that line (kits.ts itemScore), the bag has room for the old
 * piece, and no upgrade or Equip is on its way for that line.
 */
export function wantsPiece(state: SimState, i: number, res: number): boolean {
  const h = kitHolder(state, i);
  if (!h || !isGearItem(res) || bagCount(state, i, res) <= 0) return false;
  const line = itemLine(res);
  if ((pendingLines(state, i) >> line) & 1) return false;
  return !bagEquipProblem(state, i, h, res) && itemScore(res, h) > wornScore(state, i, h, line);
}
