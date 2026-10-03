// What production buildings turn into what (Table 2b: Smelting and
// processing; Table 6 and Cooking; Workshop and Trinkets; Food and
// medicine). Every recipe takes resources from the pool when it is queued
// and puts resources back when it is done; equipment is crafted from
// combat/items.ts instead. A recipe lists its ways of being paid ("1 lumber,
// 1 charcoal or 1 coal"); the first the pool can pay is used.

import { Res, TRINKET_METALS, trinketRes, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { BuildingKind } from './data.ts';

export interface RecipeSpec {
  id: number;
  name: string;
  /** Where it is made: building kinds and the level each needs. */
  at: ReadonlyArray<readonly [number, number]>;
  /** Ways to pay for one batch. */
  inputs: readonly Cost[];
  /** What one batch gives. */
  outputs: Cost;
  /** Time for one batch with one worker (or, where no hands are needed, the building alone), steps. Cooking takes its time from the kitchen's tier instead. */
  steps: number;
  /** Research it needs (combat/items.ts Research), or 0. */
  research: number;
  /** Cooking: items in the batch, timed by the cooking building's tier. */
  cooked?: number;
  /** A bit of PlayerState.made set when one is done (combat/items.ts Made). */
  made?: number;
  /** Later milestones: why it is greyed. */
  later?: string;
}

const sec = (n: number): number => n * STEPS_PER_SECOND;
const H = Res.HardwoodLumber;
const S = Res.SoftwoodLumber;
/** Fuel at a forge: 1 lumber, 1 charcoal or 1 coal (Table 2b). */
const FUELS: readonly Res[] = [Res.Charcoal, Res.Coal, H, S];
const COAL_OR_CHARCOAL: readonly Res[] = [Res.Charcoal, Res.Coal];
/** Each way of paying `rest` plus one of `fuels`. */
const withFuel = (rest: Cost, fuels: readonly Res[], n = 1): Cost[] => fuels.map((f): Cost => [...rest, [f, n]]);
const forge = (level: number): ReadonlyArray<readonly [number, number]> => [[BuildingKind.Forge, level]];
const KILN = [[BuildingKind.Kiln, 1]] as const;
const POWDER_MILL = [[BuildingKind.PowderMill, 1]] as const;
const FOUNDRY = [[BuildingKind.Foundry, 1]] as const;
const TANNERY = [[BuildingKind.Tannery, 1]] as const;
const HERBALIST = [[BuildingKind.HerbalistHut, 1]] as const;
const workshop = (tier: number): ReadonlyArray<readonly [number, number]> => [[BuildingKind.Workshop, tier]];
const cooking = (tier: number): ReadonlyArray<readonly [number, number]> => [[BuildingKind.Cooking, tier]];

/** Research ids (combat/items.ts Research) and Made bits, kept as numbers here so this module stays a leaf. */
const BRONZE = 2;
const STEEL = 9;
const HQ_STEEL = 10;
const SIEGE_ENGINES = 8;
const GUNPOWDER = 13;
const MUSKETS = 14;
const CANNONS = 15;
const MADE_TIN = 1;
const MADE_PIG = 2;

/** The cooking time per item at each tier of the cooking building (Table 6: 10 / 8 / 6 / 5 / 4 s). */
export const COOK_STEPS_PER_ITEM: readonly number[] = [sec(10), sec(8), sec(6), sec(5), sec(4)];
/** Items cooked for one fuel (Table 6: 1 lumber or coal per 5 items): a cooking order is a batch of 5 (s). */
export const COOK_BATCH = 5;
/** Lumber or coal for cooking. */
const COOK_FUELS: readonly Res[] = [S, H, Res.Coal, Res.Charcoal];

/** A cooking batch: 5 items from 5 times the ingredients and 1 fuel. */
function cook(name: string, tier: number, ingredients: Cost, out: Res): Omit<RecipeSpec, 'id'> {
  const batch: Cost = ingredients.map(([r, n]) => [r, n * COOK_BATCH] as const);
  return { name: `${name} (${COOK_BATCH})`, at: cooking(tier), inputs: withFuel(batch, COOK_FUELS), outputs: [[out, COOK_BATCH]], steps: 0, research: 0, cooked: COOK_BATCH };
}

/** Trinket tiers (Trinkets): ingots per piece and making time (s). */
export const TRINKET_INGOTS: readonly number[] = [1, 2, 4, 6];
export const TRINKET_STEPS: readonly number[] = [sec(15), sec(30), sec(60), sec(120)];
/** The ingot (or ingots) each trinket metal is made from: iron in any of its three grades. */
const TRINKET_STOCK: ReadonlyArray<readonly Res[]> = [[Res.CopperIngot], [Res.TinIngot], [Res.BronzeIngot], [Res.BloomIron, Res.WroughtIron, Res.RefinedIron], [Res.SteelIngot], [Res.Silver], [Res.Gold]];

function trinketRecipes(): Array<Omit<RecipeSpec, 'id'>> {
  const out: Array<Omit<RecipeSpec, 'id'>> = [];
  for (let tier = 1; tier <= 4; tier++) {
    TRINKET_METALS.forEach((metal, m) => {
      out.push({
        name: `${metal} ${['Token', 'Charm', 'Brooch', 'Heirloom'][tier - 1]}`,
        at: workshop(tier),
        inputs: TRINKET_STOCK[m]!.map((r): Cost => [[r, TRINKET_INGOTS[tier - 1]!]]),
        outputs: [[trinketRes(m, tier), 1]],
        steps: TRINKET_STEPS[tier - 1]!,
        research: 0,
      });
    });
  }
  return out;
}

const LIST: ReadonlyArray<Omit<RecipeSpec, 'id'>> = [
  // Table 2b at the forge.
  { name: 'Copper ingot', at: forge(1), inputs: withFuel([[Res.CopperOre, 2]], FUELS), outputs: [[Res.CopperIngot, 1]], steps: sec(5), research: 0 },
  { name: 'Tin ingot', at: forge(1), inputs: withFuel([[Res.TinOre, 2]], FUELS), outputs: [[Res.TinIngot, 1]], steps: sec(5), research: 0, made: MADE_TIN },
  { name: 'Bronze ingots (10)', at: forge(1), inputs: [[[Res.CopperIngot, 9], [Res.TinIngot, 1]]], outputs: [[Res.BronzeIngot, 10]], steps: sec(30), research: BRONZE },
  {
    name: 'Bloom iron', at: forge(2), inputs: [Res.BogIron, Res.IronRock, Res.VeinIron].map((o): Cost => [[o, 3], [Res.Charcoal, 2]]), outputs: [[Res.BloomIron, 1]], steps: sec(10), research: 0,
  },
  {
    name: 'Wrought iron', at: forge(3), inputs: [Res.BogIron, Res.IronRock, Res.VeinIron].flatMap((o) => withFuel([[o, 3]], COAL_OR_CHARCOAL, 2)), outputs: [[Res.WroughtIron, 1]], steps: sec(10), research: 0,
  },
  { name: 'Pig iron', at: forge(3), inputs: withFuel([[Res.VeinIron, 2], [Res.Stone, 1]], COAL_OR_CHARCOAL), outputs: [[Res.PigIron, 1]], steps: sec(8), research: 0, made: MADE_PIG },
  { name: 'Refined iron', at: forge(4), inputs: withFuel([[Res.PigIron, 2]], FUELS), outputs: [[Res.RefinedIron, 1]], steps: sec(10), research: 0 },
  { name: 'Steel ingot', at: forge(4), inputs: withFuel([[Res.RefinedIron, 1]], COAL_OR_CHARCOAL, 2), outputs: [[Res.SteelIngot, 1]], steps: sec(15), research: STEEL },
  { name: 'High-quality steel', at: forge(4), inputs: [[[Res.RefinedIron, 2], [Res.Charcoal, 6]]], outputs: [[Res.HighQualitySteel, 1]], steps: sec(60), research: HQ_STEEL },
  { name: 'Lead shot (10)', at: forge(3), inputs: withFuel([[Res.LeadOre, 1]], FUELS), outputs: [[Res.LeadShot, 10]], steps: sec(8), research: MUSKETS },
  // Gunpowder and siege munitions (Table 2b). One gunpowder is 10 charges.
  { name: 'Gunpowder (10 charges)', at: POWDER_MILL, inputs: [[[Res.Saltpetre, 2], [Res.Sulphur, 1], [Res.Charcoal, 1]]], outputs: [[Res.Gunpowder, 1]], steps: sec(15), research: GUNPOWDER },
  {
    name: 'Cannonball', at: FOUNDRY, inputs: [[[Res.BloomIron, 1]], [[Res.WroughtIron, 1]], [[Res.RefinedIron, 1]], [[Res.Stone, 2]]], outputs: [[Res.Cannonball, 1]], steps: sec(5), research: CANNONS,
  },
  { name: 'Catapult stone', at: workshop(3), inputs: [[[Res.Stone, 1]]], outputs: [[Res.CatapultStone, 1]], steps: sec(10), research: SIEGE_ENGINES },
  { name: 'Ballista bolts (5)', at: workshop(4), inputs: [[[H, 2], [Res.WroughtIron, 1]]], outputs: [[Res.BallistaBolt, 5]], steps: sec(30), research: SIEGE_ENGINES },
  // The kiln.
  { name: 'Charcoal (3)', at: KILN, inputs: [[[H, 2]]], outputs: [[Res.Charcoal, 3]], steps: sec(10), research: 0 },
  { name: 'Bricks (4)', at: KILN, inputs: withFuel([[Res.Clay, 2]], COAL_OR_CHARCOAL), outputs: [[Res.Bricks, 4]], steps: sec(10), research: 0 },
  { name: 'Glass', at: KILN, inputs: withFuel([[Res.Sand, 2]], FUELS), outputs: [[Res.Glass, 1]], steps: sec(10), research: 0 },
  // The tannery (and the Big House for rope).
  { name: 'Leather', at: TANNERY, inputs: [[[Res.Hides, 1]]], outputs: [[Res.Leather, 1]], steps: sec(15), research: 0 },
  { name: 'Rope', at: [[BuildingKind.Tannery, 1], [BuildingKind.MainBase, 1]], inputs: [[[Res.Leather, 1]], [[Res.Flax, 2]]], outputs: [[Res.Rope, 1]], steps: sec(10), research: 0 },
  // The herbalist hut.
  { name: 'Bandage', at: HERBALIST, inputs: [[[Res.Herbs, 1], [Res.Flax, 1]], [[Res.Herbs, 1], [Res.Leather, 1]]], outputs: [[Res.Bandage, 1]], steps: sec(10), research: 0 },
  { name: 'Healing remedy', at: HERBALIST, inputs: [[[Res.Herbs, 2], [Res.Glass, 1]]], outputs: [[Res.Remedy, 1]], steps: sec(20), research: 0 },
  // The workshop.
  { name: 'Gravel', at: workshop(1), inputs: [[[Res.Stone, 1]]], outputs: [[Res.Gravel, 1]], steps: sec(5), research: 0 },
  { name: 'Hardwood sticks (2)', at: workshop(1), inputs: [[[H, 1]]], outputs: [[Res.Sticks, 2]], steps: sec(5), research: 0 },
  { name: 'Lumber ramp steps (2)', at: workshop(1), inputs: [[[S, 1]], [[H, 1]]], outputs: [[Res.LumberRamp, 2]], steps: sec(10), research: 0 },
  { name: 'Stone ramp steps (2)', at: workshop(1), inputs: [[[Res.Stone, 2]]], outputs: [[Res.StoneRamp, 2]], steps: sec(15), research: 0 },
  { name: 'Glass lantern', at: workshop(3), inputs: [[[Res.Glass, 1], [Res.WroughtIron, 1]]], outputs: [[Res.Lantern, 1]], steps: sec(20), research: 0 },
  ...trinketRecipes(),
  { name: 'Moonleaf', at: workshop(3), inputs: [[[Res.Silver, 3], [Res.Emeralds, 2]]], outputs: [[Res.Moonleaf, 1]], steps: sec(180), research: 0 },
  { name: 'Sunheart', at: workshop(4), inputs: [[[Res.Gold, 3], [Res.Rubies, 2]]], outputs: [[Res.Sunheart, 1]], steps: sec(240), research: 0 },
  // Cooking (Table 6).
  cook('Roast meat', 1, [[Res.Meat, 1]], Res.RoastMeat),
  cook('Roast fish', 1, [[Res.Fish, 1]], Res.RoastFish),
  cook('Smoked meat', 2, [[Res.Meat, 1]], Res.SmokedMeat),
  cook('Smoked fish', 2, [[Res.Fish, 1]], Res.SmokedFish),
  cook('Bread', 3, [[Res.Wheat, 2]], Res.Bread),
  cook('Salted meat', 3, [[Res.Meat, 1]], Res.SaltedMeat),
  cook('Salted fish', 3, [[Res.Fish, 1]], Res.SaltedFish),
  cook('Stew', 4, [[Res.Meat, 1], [Res.Potatoes, 2], [Res.Carrots, 1]], Res.Stew),
  cook('Pie', 5, [[Res.Meat, 1], [Res.Wheat, 2], [Res.Eggs, 1]], Res.Pie),
];

export const RECIPES: readonly RecipeSpec[] = LIST.map((r, id) => ({ ...r, id }));

export function recipeSpec(id: number): RecipeSpec {
  const r = RECIPES[id];
  if (!r) throw new Error(`unknown recipe ${id}`);
  return r;
}

/** The first way of paying for a recipe the pool covers, or null. */
export function payableInputs(r: RecipeSpec, pool: Int32Array): Cost | null {
  for (const c of r.inputs) if (c.every(([res, n]) => pool[res]! >= n)) return c;
  return null;
}

/** The level of a building kind a recipe needs there, or 0 if it is not made there. */
export function recipeLevelAt(r: { at: ReadonlyArray<readonly [number, number]> }, kind: number): number {
  for (const [k, l] of r.at) if (k === kind) return l;
  return 0;
}

/** Steps for one cooking batch at a cooking building of a tier. */
export function cookSteps(r: RecipeSpec, tier: number): number {
  return floorDiv(COOK_STEPS_PER_ITEM[Math.min(5, Math.max(1, tier)) - 1]! * (r.cooked ?? 1), 1);
}
