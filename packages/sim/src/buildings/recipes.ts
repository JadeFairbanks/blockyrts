// What the crafting buildings turn into what (Table 2b: Smelting and
// processing; Workshop and Trinkets; Food and medicine), as Patch 2 left
// them (Jade, 2026-10-04): the Workshop does what the Lumber mill, Tannery
// and Herbalist hut did, the Forge what the Kiln and Powder mill did, and
// the Artillery workshop what the Foundry did; none of them has tiers, and
// what a tier opened comes at the main base level that tier needed. Cooking
// is gone. Every recipe takes resources from the pool when it is queued and
// puts resources back when it is done. A recipe lists its ways of being paid
// ("1 lumber, 1 charcoal or 1 coal"); the first the pool can pay is used.

import { Res, TRINKET_METALS, trinketRes, type Cost } from '../economy/resources.ts';
import { haveOf } from '../economy/food-kinds.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import { BuildingKind, FORGE_STEP_BASE } from './data.ts';

export interface RecipeSpec {
  id: number;
  name: string;
  /** The building kinds where it is made. */
  at: readonly number[];
  /** The main base level it needs (Patch 2: what a building's tier opened before), or 0. */
  base: number;
  /** Ways to pay for one batch. */
  inputs: readonly Cost[];
  /** What one batch gives. */
  outputs: Cost;
  /** Time for one batch with one worker's work, steps; a crafting building works at CRAFT_PACE (buildings/data.ts). */
  steps: number;
  /** Research it needs (combat/items.ts Research), or 0. */
  research: number;
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
const FORGE = [BuildingKind.Forge] as const;
const WORKSHOP = [BuildingKind.Workshop] as const;
const ARTILLERY = [BuildingKind.ArtilleryWorkshop] as const;

/** Research ids (combat/items.ts Research) and Made bits, kept as numbers here so this module stays a leaf. */
const BRONZE = 2;
const STEEL = 9;
const CARBON_STEEL = 10;
const SIEGE_ENGINES = 8;
const GUNPOWDER = 13;
const CANNONS = 15;
const MADE_TIN = 1;
const MADE_PIG = 2;

/** Trinket tiers (Trinkets): ingots per piece and making time (s). */
export const TRINKET_INGOTS: readonly number[] = [1, 2, 4, 6];
export const TRINKET_STEPS: readonly number[] = [sec(15), sec(30), sec(60), sec(120)];
/**
 * The main base level each trinket tier needs (Patch 2): Tokens from the
 * start, Charms at 3, Brooches at 5, Heirlooms at 7, the levels the Workshop,
 * Great Workshop and Manufactory needed before Patch 2.
 */
export const TRINKET_TIER_BASE: readonly number[] = [0, 3, 5, 7];
/** The ingot (or ingots) each trinket metal is made from: iron in either of its grades. */
const TRINKET_STOCK: ReadonlyArray<readonly Res[]> = [[Res.CopperIngot], [Res.TinIngot], [Res.BronzeIngot], [Res.WroughtIron, Res.IronIngot], [Res.SteelIngot], [Res.Silver], [Res.Gold]];

function trinketRecipes(): Array<Omit<RecipeSpec, 'id'>> {
  const out: Array<Omit<RecipeSpec, 'id'>> = [];
  for (let tier = 1; tier <= 4; tier++) {
    TRINKET_METALS.forEach((metal, m) => {
      out.push({
        name: `${metal} ${['Token', 'Charm', 'Brooch', 'Heirloom'][tier - 1]}`,
        at: WORKSHOP,
        base: TRINKET_TIER_BASE[tier - 1]!,
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
  // Table 2b at the Forge, which only smelts, a metal at each of its steps (FORGE_STEP_BASE): copper, tin and bronze from the start (the
  // Casting Hearth before Patch 2), wrought iron at main base 3 (the Bloomery), pig iron and iron at 5 (the Ironworks), steel and carbon
  // steel at 7 (the Steelworks).
  { name: 'Copper ingot', at: FORGE, base: 0, inputs: withFuel([[Res.CopperOre, 2]], FUELS), outputs: [[Res.CopperIngot, 1]], steps: sec(5), research: 0 },
  { name: 'Tin ingot', at: FORGE, base: 0, inputs: withFuel([[Res.TinOre, 2]], FUELS), outputs: [[Res.TinIngot, 1]], steps: sec(5), research: 0, made: MADE_TIN },
  { name: 'Bronze ingots (10)', at: FORGE, base: 0, inputs: [[[Res.CopperIngot, 9], [Res.TinIngot, 1]]], outputs: [[Res.BronzeIngot, 10]], steps: sec(30), research: BRONZE },
  {
    name: 'Wrought iron', at: FORGE, base: FORGE_STEP_BASE[2]!, inputs: [Res.BogIron, Res.IronRock, Res.VeinIron].flatMap((o) => withFuel([[o, 3]], COAL_OR_CHARCOAL, 2)), outputs: [[Res.WroughtIron, 1]], steps: sec(10), research: 0,
  },
  { name: 'Pig iron', at: FORGE, base: FORGE_STEP_BASE[3]!, inputs: withFuel([[Res.VeinIron, 2], [Res.Stone, 1]], COAL_OR_CHARCOAL), outputs: [[Res.PigIron, 1]], steps: sec(8), research: 0, made: MADE_PIG },
  { name: 'Iron ingot', at: FORGE, base: FORGE_STEP_BASE[3]!, inputs: withFuel([[Res.PigIron, 2]], FUELS), outputs: [[Res.IronIngot, 1]], steps: sec(10), research: 0 },
  { name: 'Steel ingot', at: FORGE, base: FORGE_STEP_BASE[4]!, inputs: withFuel([[Res.IronIngot, 1]], COAL_OR_CHARCOAL, 2), outputs: [[Res.SteelIngot, 1]], steps: sec(15), research: STEEL },
  { name: 'Carbon steel ingot', at: FORGE, base: FORGE_STEP_BASE[4]!, inputs: [[[Res.IronIngot, 2], [Res.Charcoal, 6]]], outputs: [[Res.CarbonSteel, 1]], steps: sec(60), research: CARBON_STEEL },
  // What the Kiln made, at main base 3 where the Kiln could be built, and the Powder mill's gunpowder at 7. One gunpowder is 10 charges.
  { name: 'Charcoal (3)', at: FORGE, base: 3, inputs: [[[H, 2]]], outputs: [[Res.Charcoal, 3]], steps: sec(10), research: 0 },
  { name: 'Bricks (4)', at: FORGE, base: 3, inputs: withFuel([[Res.Clay, 2]], COAL_OR_CHARCOAL), outputs: [[Res.Bricks, 4]], steps: sec(10), research: 0 },
  { name: 'Glass', at: FORGE, base: 3, inputs: withFuel([[Res.Sand, 2]], FUELS), outputs: [[Res.Glass, 1]], steps: sec(10), research: 0 },
  { name: 'Gunpowder (10 charges)', at: FORGE, base: 7, inputs: [[[Res.Saltpetre, 2], [Res.Sulphur, 1], [Res.Charcoal, 1]]], outputs: [[Res.Gunpowder, 1]], steps: sec(15), research: GUNPOWDER },
  // Siege shot at the Artillery workshop, at the main base level of the engine it is for (the artillery thread cuts it with the crewman).
  { name: 'Catapult stone', at: ARTILLERY, base: 5, inputs: [[[Res.Stone, 1]]], outputs: [[Res.CatapultStone, 1]], steps: sec(10), research: SIEGE_ENGINES },
  { name: 'Ballista bolts (5)', at: ARTILLERY, base: 7, inputs: [[[H, 2], [Res.WroughtIron, 1]]], outputs: [[Res.BallistaBolt, 5]], steps: sec(30), research: SIEGE_ENGINES },
  {
    name: 'Cannonball', at: ARTILLERY, base: 8, inputs: [[[Res.WroughtIron, 1]], [[Res.IronIngot, 1]], [[Res.Stone, 2]]], outputs: [[Res.Cannonball, 1]], steps: sec(5), research: CANNONS,
  },
  // The Workshop: what the Lumber mill made (1 lumber to 1 plank; the waterwheel's 2 went with the mill), then the Tannery's leather
  // work, with rope at the Big House too, then the Herbalist hut's medicine.
  { name: 'Planks from softwood', at: WORKSHOP, base: 0, inputs: [[[S, 1]]], outputs: [[Res.Planks, 1]], steps: sec(5), research: 0 },
  { name: 'Planks from hardwood', at: WORKSHOP, base: 0, inputs: [[[H, 1]]], outputs: [[Res.Planks, 1]], steps: sec(5), research: 0 },
  { name: 'Leather', at: WORKSHOP, base: 0, inputs: [[[Res.Hides, 1]]], outputs: [[Res.Leather, 1]], steps: sec(15), research: 0 },
  { name: 'Hardened leather', at: WORKSHOP, base: 0, inputs: [[[Res.Leather, 2]]], outputs: [[Res.HardenedLeather, 1]], steps: sec(20), research: 0 },
  { name: 'Rope', at: [BuildingKind.Workshop, BuildingKind.MainBase], base: 0, inputs: [[[Res.Leather, 1]], [[Res.Flax, 2]]], outputs: [[Res.Rope, 1]], steps: sec(10), research: 0 },
  { name: 'Bandage', at: WORKSHOP, base: 0, inputs: [[[Res.Herbs, 1], [Res.Flax, 1]], [[Res.Herbs, 1], [Res.Leather, 1]]], outputs: [[Res.Bandage, 1]], steps: sec(10), research: 0 },
  { name: 'Healing remedy', at: WORKSHOP, base: 0, inputs: [[[Res.Herbs, 2], [Res.Glass, 1]]], outputs: [[Res.Remedy, 1]], steps: sec(20), research: 0 },
  // The Workshop's own: gravel, sticks and ramp steps from the start, hand carts at main base 3, ox carts at 5.
  { name: 'Gravel', at: WORKSHOP, base: 0, inputs: [[[Res.Stone, 1]]], outputs: [[Res.Gravel, 1]], steps: sec(5), research: 0 },
  { name: 'Hardwood sticks (2)', at: WORKSHOP, base: 0, inputs: [[[H, 1]]], outputs: [[Res.Sticks, 2]], steps: sec(5), research: 0 },
  { name: 'Lumber ramp steps (2)', at: WORKSHOP, base: 0, inputs: [[[S, 1]], [[H, 1]]], outputs: [[Res.LumberRamp, 2]], steps: sec(10), research: 0 },
  { name: 'Stone ramp steps (2)', at: WORKSHOP, base: 0, inputs: [[[Res.Stone, 2]]], outputs: [[Res.StoneRamp, 2]], steps: sec(15), research: 0 },
  // Carts (Table 2f): made as goods, and taken by a worker with X (Troops and gear: carts stay).
  { name: 'Hand cart', at: WORKSHOP, base: 3, inputs: [[[Res.Planks, 6], [H, 4]]], outputs: [[Res.HandCart, 1]], steps: sec(60), research: 0 },
  { name: 'Ox or horse cart', at: WORKSHOP, base: 5, inputs: [[[Res.Planks, 12], [H, 8], [Res.Leather, 4], [Res.WroughtIron, 2]]], outputs: [[Res.OxCart, 1]], steps: sec(120), research: 0 },
  ...trinketRecipes(),
  { name: 'Moonleaf', at: WORKSHOP, base: 5, inputs: [[[Res.Silver, 3], [Res.Emeralds, 2]]], outputs: [[Res.Moonleaf, 1]], steps: sec(180), research: 0 },
  { name: 'Sunheart', at: WORKSHOP, base: 7, inputs: [[[Res.Gold, 3], [Res.Rubies, 2]]], outputs: [[Res.Sunheart, 1]], steps: sec(240), research: 0 },
];

export const RECIPES: readonly RecipeSpec[] = LIST.map((r, id) => ({ ...r, id }));

export function recipeSpec(id: number): RecipeSpec {
  const r = RECIPES[id];
  if (!r) throw new Error(`unknown recipe ${id}`);
  return r;
}

/** The first way of paying for a recipe the pool covers, or null ("meat" and "fish" counting every kind). */
export function payableInputs(r: RecipeSpec, pool: ArrayLike<number>): Cost | null {
  for (const c of r.inputs) if (c.every(([res, n]) => haveOf(pool, res) >= n)) return c;
  return null;
}

/** Whether a recipe is made at a building kind. */
export function madeAt(r: { at: readonly number[] }, kind: number): boolean {
  return r.at.includes(kind);
}
