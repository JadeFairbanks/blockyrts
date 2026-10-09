// One unit's own inventory in the middle of the HUD (Jade's Patch 5, GP-7):
// what a single selected unit carries, its gathered load and its loot bag
// together, a slot per good in the stockpile's order, and the weight it
// carries out of what it can. Pure logic, no DOM: selection-panel.ts draws it.
import { RESOURCES } from '@blockyrts/sim';
import { slotRank } from './inventory.ts';

/** Slots the box always shows, empty ones as wells, so it reads as an inventory with nothing in it yet. */
export const UNIT_SLOTS = 8;

const rank = (res: number): number => {
  const k = slotRank(res);
  return k < 0 ? Number.MAX_SAFE_INTEGER : k;
};

/** What a unit carries, one (good, count) per slot: its gathered load and its loot bag added together, in the stockpile's slot order. */
export function unitGoods(load: { res: number; amt: number } | null, bag: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const by = new Map<number, number>();
  if (load && load.amt > 0 && RESOURCES[load.res]) by.set(load.res, load.amt);
  for (const [res, n] of bag) if (n > 0 && RESOURCES[res]) by.set(res, (by.get(res) ?? 0) + n);
  return [...by].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0] - b[0]);
}

/** Pounds from tenths of a pound: "12.5", "25". */
export function pounds(tenths: number): string {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

/** The weight in the box, "12.5/25 lb", and its tooltip saying what the two numbers are. */
export function weightView(carried: number, most: number): { text: string; name: string; tip: string; full: boolean } {
  const c = pounds(carried);
  const m = pounds(most);
  return {
    text: `${c}/${m} lb`,
    name: `Weight: ${c} of ${m} lb`,
    tip: `The first number is what everything it carries weighs now, its gathered load and its loot together. The second is the most it can carry: 25 lb, more for a worker with a hand cart, an ox cart or a pack animal (loot always shares the first 25 lb).`,
    full: most > 0 && carried >= most,
  };
}
