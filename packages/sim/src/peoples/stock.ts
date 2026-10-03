// What goods are worth to the peoples and what each faction holds (Table 11:
// trade values, village stock and wants; Table 19). Values are hidden from
// the players: the trade menu shows only a worth bar and the three bundles.
// Worth is in tenths of a value point.

import { floorDiv } from '../fixed.ts';
import { RESOURCES, Res } from '../economy/resources.ts';
import { speciesSpec } from '../animals/species.ts';
import { engineSpec } from '../siege/data.ts';
import {
  BAND_STOCK_PCT, CARAVAN_GOODS, Cat, COOKED_HUNDREDTHS_PER_NUTRITION, FactionKind, ENGINE_GOODS, LEAN_PAY_PCT, LEAN_SELL_PCT, LEANS, LIVE_GOODS,
  LIVE_VALUE_TENTHS, PAY_PCT, REFUSE, RES_VALUE_TENTHS, RESTOCK_PCT, STOCK, trinketMetal, trinketValueTenths, type StockRow,
} from './data.ts';
import type { Faction } from './types.ts';

const INGOTS: readonly number[] = [Res.CopperIngot, Res.TinIngot, Res.BronzeIngot, Res.PigIron, Res.IronIngot, Res.SteelIngot, Res.WroughtIron, Res.CarbonSteel];
const LUMBER: readonly number[] = [Res.SoftwoodLumber, Res.HardwoodLumber, Res.Planks];
const GEMS: readonly number[] = [Res.Emeralds, Res.Rubies, Res.Diamonds];
/** Trinket metals 5 and 6 are silver and gold. */
const SILVER_METAL = 5;

/** Whether a good is a live animal, an engine, or a resource. */
export function isLive(good: number): boolean {
  return good >= LIVE_GOODS && good < ENGINE_GOODS;
}
export function isEngineGood(good: number): boolean {
  return good >= ENGINE_GOODS;
}

/** What a good is called in the trade menu. */
export function goodName(good: number): string {
  if (isLive(good)) return `Live ${speciesName(good - LIVE_GOODS)}`;
  if (isEngineGood(good)) return engineSpec(good - ENGINE_GOODS).name;
  return RESOURCES[good]?.name ?? `Good ${good}`;
}

export function speciesName(species: number): string {
  return speciesSpec(species).name.toLowerCase();
}

/** A good's category for what a people pays (Table 11 "Pays for"). */
export function catOf(good: number): Cat {
  if (isLive(good)) return Cat.Livestock;
  if (isEngineGood(good)) return Cat.Gear;
  if (good === Res.HandCart || good === Res.OxCart || good === Res.Gunpowder) return Cat.Gear;
  if (good === Res.HardenedLeather) return Cat.Armour;
  if (INGOTS.includes(good)) return Cat.Ingots;
  if (LUMBER.includes(good)) return Cat.Lumber;
  if (good === Res.Gold || good === Res.Silver) return Cat.Precious;
  if (GEMS.includes(good)) return Cat.Gems;
  if (good === Res.Moonleaf || good === Res.Sunheart) return Cat.PreciousTrinkets;
  const metal = trinketMetal(good);
  if (metal >= 0) return metal >= SILVER_METAL ? Cat.PreciousTrinkets : Cat.Trinkets;
  if ((RESOURCES[good]?.nutrition ?? 0) > 0) return Cat.Food;
  return Cat.Other;
}

/** A resource's worth, tenths: Table 11's value, a trinket's metal and tier, cooked food 0.75 x its nutrition. */
export function resValueTenths(res: number): number {
  const v = RES_VALUE_TENTHS[res];
  if (v !== undefined) return v;
  if (trinketMetal(res) >= 0) return trinketValueTenths(res);
  const n = RESOURCES[res]?.nutrition ?? 0;
  if (n > 0) return Math.max(1, floorDiv(n * COOKED_HUNDREDTHS_PER_NUTRITION + 5, 10));
  return 10;
}

/** A good's worth, tenths. */
export function valueTenths(good: number): number {
  if (isLive(good)) return LIVE_VALUE_TENTHS[good - LIVE_GOODS] ?? 300;
  // An engine's worth as half the Dwarf city's price (3 x make cost is 1.5 x worth).
  if (isEngineGood(good)) return floorDiv((STOCK[FactionKind.DwarfCity]!.find((r) => r.good === good)?.price ?? 0) * 2, 3);
  return resValueTenths(good);
}

/** What a faction pays for a good, percent of its worth, or REFUSE: its people's table, more for what its lean lacks. */
export function payPct(f: Faction, good: number): number {
  const pct = PAY_PCT[f.people as 0 | 1 | 2 | 3][catOf(good)]!;
  if (pct === REFUSE) return REFUSE;
  const lean = f.lean >= 0 ? LEANS[f.people as 0 | 1 | 2 | 3][f.lean] : undefined;
  return lean?.lacks.includes(good) ? LEAN_PAY_PCT : pct;
}

/** What a faction asks for one of a good it sells, tenths. */
export function priceTenths(f: Faction, good: number): number {
  const row = rowFor(f, good);
  const base = row?.price ?? floorDiv(valueTenths(good) * (row?.pct ?? 100), 100);
  const lean = f.lean >= 0 ? LEANS[f.people as 0 | 1 | 2 | 3][f.lean] : undefined;
  return Math.max(1, lean?.sells.includes(good) ? floorDiv(base * LEAN_SELL_PCT, 100) : base);
}

/** The rows a faction's stock comes from: its kind's, a caravan's one weapon's materials, and its lean's goods. */
export function stockRows(f: Faction): StockRow[] {
  const rows = [...(STOCK[f.kind] ?? [])];
  if (f.kind === FactionKind.ElfCaravan && f.lean >= 0) rows.push(CARAVAN_GOODS[f.lean]!);
  const lean = f.lean >= 0 && f.kind !== FactionKind.ElfCaravan ? LEANS[f.people as 0 | 1 | 2 | 3][f.lean] : undefined;
  for (const good of lean?.sells ?? []) if (!rows.some((r) => r.good === good)) rows.push({ good, count: 10, pct: 100 });
  return rows;
}

function rowFor(f: Faction, good: number): StockRow | undefined {
  return stockRows(f).find((r) => r.good === good);
}

/** Fills a faction's stock to full: the rows' counts, more in deeper bands, twice its lean's goods (Table 11, s). */
export function fillStock(f: Faction): void {
  const lean = f.lean >= 0 && f.kind !== FactionKind.ElfCaravan ? LEANS[f.people as 0 | 1 | 2 | 3][f.lean] : undefined;
  f.stock = [];
  f.stockMax = [];
  for (const r of stockRows(f)) {
    let n = r.daily ? r.count : floorDiv(r.count * (BAND_STOCK_PCT[f.band] ?? 100) + 99, 100);
    if (lean?.sells.includes(r.good)) n *= 2;
    f.stock.push(r.good, n);
    f.stockMax.push(r.good, n);
  }
}

/** Each dawn: the day's buying starts afresh and the stock refills 20% of full (the daily rows to full). */
export function restock(f: Faction): void {
  f.bought.fill(0);
  const rows = stockRows(f);
  for (let k = 0; k < f.stock.length; k += 2) {
    const max = f.stockMax[k + 1]!;
    const daily = rows.find((r) => r.good === f.stock[k])?.daily;
    f.stock[k + 1] = daily ? max : Math.min(max, f.stock[k + 1]! + floorDiv(max * RESTOCK_PCT + 99, 100));
  }
}

/** How many of a good a faction holds now. */
export function inStock(f: Faction, good: number): number {
  for (let k = 0; k < f.stock.length; k += 2) if (f.stock[k] === good) return f.stock[k + 1]!;
  return 0;
}

