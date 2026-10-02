// Trading with the peoples (Neutral villages and trade; Table 11; Table 19).
// A player opens a faction's trade menu while one of their units is within
// about 15 m of it and they are not at war; they put goods in the offer box
// and the faction answers with three bundles from its stock, each worth
// between 85% and 100% of what the offer is worth to it (s), or says it has
// nothing worth that much. Values stay hidden: the menu shows the worth bar
// and the bundles. A faction buys at most 300 vp of one kind of good a day;
// a player who turns its answer down three times and offers the same again
// is sent away until dawn; Halflings will not take gold, silver or gems, and
// an Elf offered lumber is insulted and trades with no one from that player
// for a day. Taking a bundle swaps the goods at once.

import { floorDiv, length2d, WU_PER_COLUMN } from '../fixed.ts';
import { ITEM_COUNT } from '../combat/items.ts';
import { RESOURCE_COUNT } from '../economy/resources.ts';
import { addAnimal } from '../animals/animals.ts';
import { addEngine } from '../siege/engines.ts';
import { UnitKind, type SimState } from '../state.ts';
import { BUNDLE_MIN_PCT, BUNDLES, Cat, DAILY_BUY_TENTHS, FactionKind, ENGINE_GOODS, INSULT_STEPS, ITEM_GOODS, LINES, LIVE_GOODS, MOOD_DECLINES, People, REFUSE, Status, TRADE_RANGE_WU } from './data.ts';
import { directions, factionMembers, nearestCity } from './factions.ts';
import { sayForeign } from './speech.ts';
import { catOf, inStock, isEngineGood, isItem, isLive, payPct, priceTenths, valueTenths } from './stock.ts';
import { factionById, warFaction, type Faction, type Offer } from './types.ts';

/** Closed until the next dawn (cleared when the day begins). */
export const UNTIL_DAWN = 0x7fffffff;
/** The most different goods in one offer (the offer box's slots) (s). */
export const OFFER_SLOTS = 8;

/** The faction member a player's unit is nearest, and how near: the trade range is measured to any of its people or buildings. */
function nearestMember(state: SimState, f: Faction, player: number): { unit: number; member: number; d: number } {
  const e = state.entities;
  const list = factionMembers(state, f.id);
  let best = { unit: -1, member: -1, d: 0 };
  for (const m of list) {
    for (const j of state.grid.near(e.x[m]!, e.z[m]!, TRADE_RANGE_WU)) {
      if (e.owner[j] !== player || e.hp[j]! <= 0 || e.kind[j] === UnitKind.Animal) continue;
      const d = length2d(e.x[j]! - e.x[m]!, e.z[j]! - e.z[m]!);
      if (d > TRADE_RANGE_WU) continue;
      if (best.unit < 0 || d < best.d) best = { unit: j, member: m, d };
    }
  }
  return best;
}

/** The faction's speaker for the trade menu: its leader, else whoever of it is nearest the player. */
export function speakerOf(state: SimState, f: Faction, player: number): number {
  const e = state.entities;
  const leader = f.leader ? e.indexOf(f.leader) : -1;
  if (leader >= 0 && e.hp[leader]! > 0) return leader;
  const near = nearestMember(state, f, player);
  if (near.member >= 0) return near.member;
  return factionMembers(state, f.id)[0] ?? -1;
}

/** Whether a player has a unit within trade range of a faction's people or buildings. */
export function inReach(state: SimState, f: Faction, player: number): boolean {
  return nearestMember(state, f, player).unit >= 0;
}

/** Why a player cannot trade with a faction now, or '' (for the greyed Trade button and its tooltip). */
export function tradeProblem(state: SimState, f: Faction, player: number): string {
  if (f.kind === FactionKind.MercCamp) return 'Mercenaries only hire out their swords.';
  if (f.status !== Status.Settled || !f.built) return 'They are not trading now.';
  if (warFaction(state.peoples, f).war & (1 << player)) return 'You are at war with them.';
  const closed = f.closedUntil[player] ?? 0;
  if (closed > state.step) return closed === UNTIL_DAWN ? 'They will not trade with you again until dawn.' : 'They will not trade with you today.';
  if (nearestMember(state, f, player).unit < 0) return 'Bring one of your units within 15 m of them.';
  return '';
}

/** How many of a good a player has. */
export function playerHas(state: SimState, player: number, good: number): number {
  const p = state.players[player]!;
  if (isLive(good) || isEngineGood(good)) return 0;
  if (isItem(good)) {
    const it = good - ITEM_GOODS;
    return it > 0 && it < ITEM_COUNT ? p.items[it]! : 0;
  }
  return good >= 0 && good < RESOURCE_COUNT ? p.pool[good]! : 0;
}

/** A key for a list of goods, to tell an offer made again. */
function offerKey(goods: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const v of goods) h = Math.imul(h ^ (v & 0xffff), 0x01000193) >>> 0;
  return h & 0x7fffffff;
}

/** The offer a player has open with a faction, if any. */
export function offerOf(state: SimState, faction: number, player: number): Offer | undefined {
  return state.peoples.offers.find((o) => o.faction === faction && o.player === player);
}

function dropOffer(state: SimState, faction: number, player: number): void {
  state.peoples.offers = state.peoples.offers.filter((o) => o.faction !== faction || o.player !== player);
}

/**
 * What an offer is worth to a faction, tenths, and the first good it will
 * not take (or -1): each good at its pay percent, each category no more
 * than what is left of the day's 300 vp.
 */
export function offerWorth(f: Faction, goods: readonly number[]): { worth: number; refused: number } {
  const byCat = new Array<number>(f.bought.length).fill(0);
  let refused = -1;
  for (let k = 0; k < goods.length; k += 2) {
    const good = goods[k]!;
    const pct = payPct(f, good);
    if (pct === REFUSE) {
      if (refused < 0) refused = good;
      continue;
    }
    const c = catOf(good);
    byCat[c] = byCat[c]! + floorDiv(valueTenths(good) * goods[k + 1]! * pct, 100);
  }
  let worth = 0;
  for (let c = 0; c < byCat.length; c++) worth += Math.min(byCat[c]!, Math.max(0, DAILY_BUY_TENTHS - f.bought[c]!));
  return { worth, refused };
}

/** The faction's stock as (good, count, price) rows it can sell from, dearest first then by good. */
function sellable(f: Faction): Array<{ good: number; count: number; price: number }> {
  const out: Array<{ good: number; count: number; price: number }> = [];
  for (let k = 0; k < f.stock.length; k += 2) if (f.stock[k + 1]! > 0) out.push({ good: f.stock[k]!, count: f.stock[k + 1]!, price: priceTenths(f, f.stock[k]!) });
  return out.sort((a, b) => b.price - a.price || a.good - b.good);
}

function total(rows: ReadonlyArray<{ price: number }>, bundle: readonly number[]): number {
  let t = 0;
  for (let k = 0; k < bundle.length; k += 2) {
    const r = (rows as Array<{ good: number; price: number }>).find((x) => x.good === bundle[k]);
    t += (r?.price ?? 0) * bundle[k + 1]!;
  }
  return t;
}

/** Whether a bundle being made already holds a cannon: a Dwarf city sells one a day, bronze or iron (doc, Table 19). */
function hasEngine(used: ReadonlyMap<number, number>): boolean {
  for (const [good, n] of used) if (n > 0 && isEngineGood(good)) return true;
  return false;
}

/** Adds as many of each row (in the order given) as still fit under the worth. */
function fill(rows: ReadonlyArray<{ good: number; count: number; price: number }>, w: number, used: Map<number, number>, out: number[]): number {
  let left = w;
  for (const r of rows) {
    const have = isEngineGood(r.good) ? (hasEngine(used) ? 0 : 1) : r.count - (used.get(r.good) ?? 0);
    const n = Math.min(have, floorDiv(left, r.price));
    if (n <= 0) continue;
    used.set(r.good, (used.get(r.good) ?? 0) + n);
    const at = out.indexOf(r.good);
    if (at >= 0 && at % 2 === 0) out[at + 1] = out[at + 1]! + n;
    else out.push(r.good, n);
    left -= n * r.price;
  }
  return w - left;
}

/**
 * The three bundles a faction answers an offer with (s): all of one kind
 * (the good that comes nearest the worth); its dearest piece it can give
 * with the rest filled from the cheaper goods; and a mix, one of each good
 * in turn. None is worth more than the offer; bundles under 85% of it are
 * dropped when another comes nearer, and the same bundle is not given twice.
 */
export function makeBundles(f: Faction, w: number): number[][] {
  const rows = sellable(f);
  const out: number[][] = [];
  if (w <= 0 || rows.length === 0) return out;
  // One kind.
  let best: number[] = [];
  let bestT = 0;
  for (const r of rows) {
    const n = Math.min(isEngineGood(r.good) ? 1 : r.count, floorDiv(w, r.price));
    if (n > 0 && n * r.price > bestT) {
      best = [r.good, n];
      bestT = n * r.price;
    }
  }
  if (best.length) out.push(best);
  // The dearest piece, then the rest from the cheapest up.
  const piece = rows.find((r) => r.price <= w);
  if (piece) {
    const b: number[] = [piece.good, 1];
    const used = new Map([[piece.good, 1]]);
    fill([...rows].reverse(), w - piece.price, used, b);
    out.push(b);
  }
  // A mix: one of each good in turn, dearest first, while it fits.
  const mix: number[] = [];
  const used = new Map<number, number>();
  let left = w;
  for (let more = true; more; ) {
    more = false;
    for (const r of rows) {
      if ((used.get(r.good) ?? 0) >= r.count || r.price > left || (isEngineGood(r.good) && hasEngine(used))) continue;
      used.set(r.good, (used.get(r.good) ?? 0) + 1);
      const at = mix.indexOf(r.good);
      if (at >= 0 && at % 2 === 0) mix[at + 1] = mix[at + 1]! + 1;
      else mix.push(r.good, 1);
      left -= r.price;
      more = true;
    }
  }
  if (mix.length) out.push(mix);
  // Distinct, and as near the worth as the stock allows.
  const seen = new Set<string>();
  const unique = out.filter((b) => {
    const k = b.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const top = Math.max(...unique.map((b) => total(rows, b)));
  const floor = floorDiv(w * BUNDLE_MIN_PCT, 100);
  return unique.filter((b) => total(rows, b) >= Math.min(floor, top)).slice(0, BUNDLES);
}

/** Who answers in the trade menu, and with what. */
function answer(state: SimState, f: Faction, player: number, text: string): void {
  const s = speakerOf(state, f, player);
  if (s >= 0) sayForeign(state, s, text, true, player, f.id);
}

/** A player puts goods in the offer box (pairs of good and count); the faction answers with its bundles or a reason. */
export function makeOffer(state: SimState, player: number, faction: number, goods: readonly number[]): void {
  const f = factionById(state.peoples, faction);
  if (!f) return;
  dropOffer(state, faction, player);
  const problem = tradeProblem(state, f, player);
  if (problem) {
    state.events.push({ player, kind: 'alert', text: problem, faction: f.id });
    return;
  }
  // Only goods the player has, each once, in order, at most the box's slots.
  const clean: number[] = [];
  for (let k = 0; k + 1 < goods.length && clean.length < OFFER_SLOTS * 2; k += 2) {
    const good = goods[k]!;
    const n = Math.min(goods[k + 1]!, playerHas(state, player, good));
    if (n <= 0 || clean.some((g, j) => j % 2 === 0 && g === good)) continue;
    clean.push(good, n);
  }
  if (clean.length === 0) return;
  f.met |= 1 << player;
  const lines = LINES[f.people as People];
  // Mood: the same goods again after three answers turned down today.
  const key = offerKey(clean);
  if (f.lastOffer[player] === key && f.declines[player]! >= MOOD_DECLINES) {
    f.closedUntil[player] = UNTIL_DAWN;
    answer(state, f, player, lines.close);
    return;
  }
  const { worth, refused } = offerWorth(f, clean);
  if (refused >= 0 && f.people === People.Elf && catOf(refused) === Cat.Lumber) {
    // An insult: no trade with this player for a day.
    f.closedUntil[player] = state.step + INSULT_STEPS;
    answer(state, f, player, lines.lumber);
    return;
  }
  if (refused >= 0 && worth === 0) {
    answer(state, f, player, lines.refuse);
    return;
  }
  const bundles = makeBundles(f, worth);
  if (bundles.length === 0) {
    answer(state, f, player, lines.nothing);
    return;
  }
  state.peoples.offers.push({ faction, player, goods: clean, worth, bundles });
  if (refused >= 0) answer(state, f, player, lines.refuse);
}

/** The player turns the answer down: it counts towards the faction's mood if the same goods come again. */
export function withdrawOffer(state: SimState, player: number, faction: number): void {
  const f = factionById(state.peoples, faction);
  const o = offerOf(state, faction, player);
  if (!f || !o) return;
  const key = offerKey(o.goods);
  f.declines[player] = f.lastOffer[player] === key ? f.declines[player]! + 1 : 1;
  f.lastOffer[player] = key;
  dropOffer(state, faction, player);
}

/** Puts a good in a player's stock: a resource, an item, or a live animal led out beside their unit. */
function give(state: SimState, player: number, good: number, n: number, x: number, z: number): void {
  const p = state.players[player]!;
  if (isLive(good)) {
    for (let k = 0; k < n; k++) addAnimal(state, good - LIVE_GOODS, player, x + (k + 1) * WU_PER_COLUMN * 3, z, 0, k & 1);
    return;
  }
  if (isEngineGood(good)) {
    for (let k = 0; k < n; k++) addEngine(state, player, good - ENGINE_GOODS, x + (k + 1) * WU_PER_COLUMN * 5, z);
    return;
  }
  if (isItem(good)) p.items[good - ITEM_GOODS] = p.items[good - ITEM_GOODS]! + n;
  else p.pool[good] = p.pool[good]! + n;
}

function take(state: SimState, player: number, good: number, n: number): void {
  const p = state.players[player]!;
  if (isItem(good)) p.items[good - ITEM_GOODS] = p.items[good - ITEM_GOODS]! - n;
  else if (!isLive(good) && !isEngineGood(good)) p.pool[good] = p.pool[good]! - n;
}

/** The player takes one of the three bundles: the goods change hands at once. */
export function takeBundle(state: SimState, player: number, faction: number, bundle: number): void {
  const f = factionById(state.peoples, faction);
  const o = offerOf(state, faction, player);
  if (!f || !o) return;
  const b = o.bundles[bundle];
  dropOffer(state, faction, player);
  if (!b || tradeProblem(state, f, player)) return;
  // The offer must still be there, and the bundle in stock.
  for (let k = 0; k < o.goods.length; k += 2) if (playerHas(state, player, o.goods[k]!) < o.goods[k + 1]!) return;
  for (let k = 0; k < b.length; k += 2) if (inStock(f, b[k]!) < b[k + 1]!) return;
  for (let k = 0; k < o.goods.length; k += 2) {
    const good = o.goods[k]!;
    if (payPct(f, good) === REFUSE) continue;
    take(state, player, good, o.goods[k + 1]!);
    const c = catOf(good);
    f.bought[c] = Math.min(DAILY_BUY_TENTHS, f.bought[c]! + floorDiv(valueTenths(good) * o.goods[k + 1]! * payPct(f, good), 100));
  }
  const near = nearestMember(state, f, player);
  const e = state.entities;
  const x = near.unit >= 0 ? e.x[near.unit]! : f.x;
  const z = near.unit >= 0 ? e.z[near.unit]! : f.z;
  for (let k = 0; k < b.length; k += 2) {
    for (let s = 0; s < f.stock.length; s += 2) if (f.stock[s] === b[k]) f.stock[s + 1] = f.stock[s + 1]! - b[k + 1]!;
    give(state, player, b[k]!, b[k + 1]!, x, z);
  }
  // One cannon a day, bronze or iron: once one is sold the other waits for the dawn restock.
  if (b.some((g, k) => k % 2 === 0 && isEngineGood(g))) for (let s = 0; s < f.stock.length; s += 2) if (isEngineGood(f.stock[s]!)) f.stock[s + 1] = 0;
  const first = (f.traded & (1 << player)) === 0;
  f.traded |= 1 << player;
  f.met |= 1 << player;
  f.declines[player] = 0;
  f.lastOffer[player] = 0;
  const lines = LINES[f.people as People];
  const s = speakerOf(state, f, player);
  if (s < 0) return;
  // A Dwarf colony's first trade with a player: it points the way to the nearest city of its kin (Dwarves) (s).
  if (first && f.kind === FactionKind.DwarfColony) {
    const city = nearestCity(state, f.x, f.z);
    if (city >= 0) {
      const site = state.world.layout.site(city);
      sayForeign(state, s, `Our kin hold a city in the deep dead lands: ${directions(f.x, f.z, site.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), site.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1))} from here.`, true, player, f.id);
      return;
    }
  }
  sayForeign(state, s, lines.trade, true, player, f.id);
}

