// Food kinds (patch 1, Jade: the inventory says which kinds of food there
// are, each kind of meat apart). Raw meat is named after the animal it came
// from and fish after its species; every meat is worth 4 nutrition and every
// fish 3 (Table 6), so the kinds differ only in name and picture. Their ids
// and names are rows of resources.ts; this module says which animal, mob or
// fish stretch gives which kind, and pays for "meat" or "fish" in a recipe or
// a trade with whatever kinds are in stock.
//
// Species and prop kinds are kept as numbers here (animals/species.ts
// Species, world/props.ts PropKind) so this module stays a leaf.

import { Res, type Cost } from './resources.ts';

/** Every kind of raw meat, in the inventory's order: game, then livestock, then the rest. */
export const MEATS: readonly Res[] = [
  Res.Venison,
  Res.BoarMeat,
  Res.HareMeat,
  Res.GooseMeat,
  Res.PheasantMeat,
  Res.Beef,
  Res.Chicken,
  Res.HorseMeat,
  Res.WolfMeat,
  Res.LynxMeat,
  Res.BadgerMeat,
  Res.BearMeat,
  Res.FrogLegs,
  Res.CrabMeat,
  Res.CrocodileMeat,
  Res.GriffinMeat,
  Res.MinotaurMeat,
  Res.RatMeat,
];

/** Every kind of fish: trout from Heartland streams, salmon from Fringe streams, giant catfish from Deepwoods pools (Table 5). */
export const FISHES: readonly Res[] = [Res.Trout, Res.Salmon, Res.Catfish];

/**
 * The meat each animal species gives (animals/species.ts Species, in its
 * order), or -1 for the ones with none: an ox is beef like cattle; the
 * beetle, hornet, viper and scorpion give no meat (mob roster 6.1).
 */
export const MEAT_BY_SPECIES: readonly number[] = [
  Res.Beef, // Cattle
  Res.Chicken, // Chicken
  Res.HorseMeat, // Horse
  Res.Beef, // Ox
  Res.HareMeat, // Hare
  Res.Venison, // Deer
  Res.BoarMeat, // Wild boar
  Res.WolfMeat, // Wolf
  Res.LynxMeat, // Lynx
  Res.FrogLegs, // Giant frog
  Res.CrocodileMeat, // Crocodile
  Res.CrabMeat, // Giant crab
  Res.BadgerMeat, // Badger
  Res.BearMeat, // Bear
  -1, // Giant beetle
  -1, // Giant hornet
  -1, // Viper
  -1, // Giant scorpion
  Res.GriffinMeat, // Griffin
  Res.MinotaurMeat, // Minotaur
  Res.GooseMeat, // Wild goose
  Res.PheasantMeat, // Pheasant
];

/** The meat a species gives; venison for one this table does not know (s). */
export function meatOf(species: number): Res {
  const m = MEAT_BY_SPECIES[species] ?? -1;
  return m >= 0 ? (m as Res) : Res.Venison;
}

/** The fish a fish stretch gives (world/props.ts PropKind: 31 trout, 32 salmon, 33 giant catfish). */
export function fishOf(propKind: number): Res {
  if (propKind === 32) return Res.Salmon;
  if (propKind === 33) return Res.Catfish;
  return Res.Trout;
}

const MEAT_SET = new Set<number>(MEATS);
const FISH_SET = new Set<number>(FISHES);

export function isMeatRes(res: number): boolean {
  return MEAT_SET.has(res);
}

export function isFishRes(res: number): boolean {
  return FISH_SET.has(res);
}

/** The kinds a "meat" or "fish" in a cost stands for, or just the resource itself. */
export function kindsOf(res: number): readonly Res[] {
  if (res === Res.AnyMeat) return MEATS;
  if (res === Res.AnyFish) return FISHES;
  return [res as Res];
}

/** How many of a resource a pool holds; for "meat" or "fish", of every kind together. */
export function haveOf(pool: ArrayLike<number>, res: number): number {
  if (res !== Res.AnyMeat && res !== Res.AnyFish) return pool[res] ?? 0;
  let n = 0;
  for (const k of kindsOf(res)) n += pool[k] ?? 0;
  return n;
}

/** Whether a pool holds a cost that may ask for any meat or fish. */
export function canAffordAny(pool: ArrayLike<number>, cost: Cost): boolean {
  return shortOfAny(pool, cost) < 0;
}

/** The first resource of such a cost the pool is short of, or -1. */
export function shortOfAny(pool: ArrayLike<number>, cost: Cost): number {
  for (const [res, n] of cost) if (haveOf(pool, res) < n) return res;
  return -1;
}

/**
 * Pays such a cost (it must be affordable) and returns what was taken, kind
 * by kind, for an exact refund. "Meat" or "fish" is taken a piece at a time
 * from whichever kind the pool holds most of (the lowest id on a tie), so a
 * kitchen uses the kinds evenly and never keeps one back.
 */
export function payAny(pool: Int32Array, cost: Cost): Array<[Res, number]> {
  const taken = new Map<Res, number>();
  const add = (res: Res, n: number): void => void taken.set(res, (taken.get(res) ?? 0) + n);
  for (const [res, n] of cost) {
    if (res !== Res.AnyMeat && res !== Res.AnyFish) {
      pool[res] = pool[res]! - n;
      add(res, n);
      continue;
    }
    const kinds = kindsOf(res);
    for (let k = 0; k < n; k++) {
      let best = -1;
      for (const f of kinds) if (pool[f]! > 0 && (best < 0 || pool[f]! > pool[best]! || (pool[f] === pool[best] && f < best))) best = f;
      if (best < 0) break;
      pool[best] = pool[best]! - 1;
      add(best as Res, 1);
    }
  }
  return [...taken].sort((a, b) => a[0] - b[0]);
}
