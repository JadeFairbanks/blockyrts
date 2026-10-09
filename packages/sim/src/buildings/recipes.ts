// What the crafting buildings turn into what (Table 2b: Smelting and
// processing; Workshop and Trinkets; Food and medicine), as Patch 2 left
// them (Jade, 2026-10-04): the Workshop does what the Lumber mill, Tannery
// and Herbalist hut did, the Forge what the Kiln and Powder mill did, and
// the Artillery workshop what the Foundry did; none of them has tiers, and
// what a tier opened comes at the main base tier that level fell into. Cooking
// is gone, and so is all siege shot: the Artillery workshop makes only its
// engines and artillery crewmen (buildings/production.ts). Every recipe takes resources from the pool when it is queued and
// puts resources back when it is done. A recipe lists its ways of being paid
// ("1 lumber, 1 charcoal or 1 coal"); the first the pool can pay is used.
// "Lumber" is either kind, softwood or hardwood (Patch 5, Jade: "Make all
// things that require lumber or sticks able to use either type of lumber").

import { Res, RESOURCES, TRINKET_METALS, trinketRes, type Cost } from '../economy/resources.ts';
import { haveOf } from '../economy/food-kinds.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import { gearItemPieces, scrapYield } from '../units/kits.ts';
import { BuildingKind, FORGE_STEP_BASE } from './data.ts';

export interface RecipeSpec {
  id: number;
  name: string;
  /** The building kinds where it is made. */
  at: readonly number[];
  /** The main base tier it needs (Patch 2: what a building's tier opened before; Patch 5: tiers, not levels), or 0. */
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
  /**
   * Made in stacks (Patch 5, Jade's decisions 2.5: bonemeal x1, x10 or all
   * the bones): a stack takes one queue slot, paid in full when queued, and
   * its count goes down as each one is done.
   */
  stack?: boolean;
  /**
   * Scrap equipment (Patch 5, GP-3): the gear item it scraps. Queued as a
   * stack (any number in one queue slot), the bar runs once per item and
   * each one's materials come in as it finishes.
   */
  scrap?: Res;
}

const sec = (n: number): number => n * STEPS_PER_SECOND;
const H = Res.HardwoodLumber;
const S = Res.SoftwoodLumber;
/** Any lumber, softwood or hardwood, whichever is in stock (Patch 5). */
const L = Res.AnyLumber;
/** Fuel at a forge: 1 lumber, 1 charcoal or 1 coal (Table 2b). */
const FUELS: readonly Res[] = [Res.Charcoal, Res.Coal, H, S];
const COAL_OR_CHARCOAL: readonly Res[] = [Res.Charcoal, Res.Coal];
/** Each way of paying `rest` plus one of `fuels`. */
const withFuel = (rest: Cost, fuels: readonly Res[], n = 1): Cost[] => fuels.map((f): Cost => [...rest, [f, n]]);
/**
 * Fuel for smelting copper and tin (Jade's mini balance): 1 charcoal or 1
 * coal, but 2 hardwood or 4 softwood lumber, in FUELS order.
 */
const ORE_FUEL: Cost = [[Res.Charcoal, 1], [Res.Coal, 1], [H, 2], [S, 4]];
/** Each way of paying `rest` plus one of `fuels`, each fuel with its own amount. */
const withFuelAmounts = (rest: Cost, fuels: Cost): Cost[] => fuels.map((f): Cost => [...rest, f]);
const FORGE = [BuildingKind.Forge] as const;
const WORKSHOP = [BuildingKind.Workshop] as const;
/** Sticks are cut at the Workshop and, from Patch 5, at a Storehouse (Jade). */
const STICK_MAKERS = [BuildingKind.Workshop, BuildingKind.Storehouse] as const;

/** Research ids (combat/items.ts Research) and Made bits, kept as numbers here so this module stays a leaf. */
const BRONZE = 2;
const STEEL = 9;
const CARBON_STEEL = 10;
const GUNPOWDER = 13;
const MADE_TIN = 1;
const MADE_PIG = 2;

/** Trinket tiers (Trinkets): ingots per piece and making time (s). */
export const TRINKET_INGOTS: readonly number[] = [1, 2, 4, 6];
export const TRINKET_STEPS: readonly number[] = [sec(15), sec(30), sec(60), sec(120)];
/**
 * The main base tier each trinket tier needs: Tokens from the start, Charms
 * at tier 2, Brooches and Heirlooms at tier 3 (Patch 2 had them at levels 3,
 * 5 and 7, the levels the Workshop, Great Workshop and Manufactory needed).
 */
export const TRINKET_TIER_BASE: readonly number[] = [0, 2, 3, 3];
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

/**
 * Scrap equipment at the Workshop (Patch 5, GP-3): a weapon, armour, shield,
 * tool kit, wand or robe from stock back to the materials it is made from
 * (units/kits.ts scrapYield), "a blanket 10s per item" (Jade): 20 s of work
 * at the Workshop's CRAFT_PACE.
 */
function scrapRecipes(): Array<Omit<RecipeSpec, 'id'>> {
  return gearItemPieces().map(([item, p]) => ({
    name: `Scrap ${RESOURCES[item]!.name.toLowerCase()}`, at: WORKSHOP, base: 0, inputs: [[[item, 1]]], outputs: scrapYield(p), steps: sec(20), research: 0, scrap: item,
  }));
}

const LIST: ReadonlyArray<Omit<RecipeSpec, 'id'>> = [
  // Table 2b at the Forge, which only smelts, a metal at each of its steps (FORGE_STEP_BASE): copper, tin and bronze from the start (the
  // Casting Hearth before Patch 2), wrought iron at main base tier 2 (the Bloomery), then pig iron, iron, steel and carbon steel at
  // tier 3 (the Ironworks and the Steelworks).
  { name: 'Copper ingot', at: FORGE, base: 0, inputs: withFuelAmounts([[Res.CopperOre, 2]], ORE_FUEL), outputs: [[Res.CopperIngot, 1]], steps: sec(5), research: 0 },
  { name: 'Tin ingot', at: FORGE, base: 0, inputs: withFuelAmounts([[Res.TinOre, 2]], ORE_FUEL), outputs: [[Res.TinIngot, 1]], steps: sec(5), research: 0, made: MADE_TIN },
  { name: 'Bronze ingots (10)', at: FORGE, base: 0, inputs: [[[Res.CopperIngot, 9], [Res.TinIngot, 1]]], outputs: [[Res.BronzeIngot, 10]], steps: sec(30), research: BRONZE },
  {
    name: 'Wrought iron', at: FORGE, base: FORGE_STEP_BASE[2]!, inputs: [Res.BogIron, Res.IronRock, Res.VeinIron].flatMap((o) => withFuel([[o, 3]], COAL_OR_CHARCOAL, 2)), outputs: [[Res.WroughtIron, 1]], steps: sec(10), research: 0,
  },
  { name: 'Pig iron', at: FORGE, base: FORGE_STEP_BASE[3]!, inputs: withFuel([[Res.VeinIron, 2], [Res.Stone, 1]], COAL_OR_CHARCOAL), outputs: [[Res.PigIron, 1]], steps: sec(8), research: 0, made: MADE_PIG },
  { name: 'Iron ingot', at: FORGE, base: FORGE_STEP_BASE[3]!, inputs: withFuel([[Res.PigIron, 2]], FUELS), outputs: [[Res.IronIngot, 1]], steps: sec(10), research: 0 },
  { name: 'Steel ingot', at: FORGE, base: FORGE_STEP_BASE[4]!, inputs: withFuel([[Res.IronIngot, 1]], COAL_OR_CHARCOAL, 2), outputs: [[Res.SteelIngot, 1]], steps: sec(15), research: STEEL },
  { name: 'Carbon steel ingot', at: FORGE, base: FORGE_STEP_BASE[4]!, inputs: [[[Res.IronIngot, 2], [Res.Charcoal, 6]]], outputs: [[Res.CarbonSteel, 1]], steps: sec(60), research: CARBON_STEEL },
  // What the Kiln made, at main base tier 2 where the Kiln could be built, and the Powder mill's gunpowder at tier 3 (Patch 2: only for the musket and its research; no shot burns a charge).
  { name: 'Charcoal (3)', at: FORGE, base: 2, inputs: [[[L, 2]]], outputs: [[Res.Charcoal, 3]], steps: sec(10), research: 0 },
  { name: 'Bricks (4)', at: FORGE, base: 2, inputs: withFuel([[Res.Clay, 2]], COAL_OR_CHARCOAL), outputs: [[Res.Bricks, 4]], steps: sec(10), research: 0 },
  { name: 'Glass', at: FORGE, base: 2, inputs: withFuel([[Res.Sand, 2]], FUELS), outputs: [[Res.Glass, 1]], steps: sec(10), research: 0 },
  { name: 'Gunpowder', at: FORGE, base: 3, inputs: [[[Res.Saltpetre, 2], [Res.Sulphur, 1], [Res.Charcoal, 1]]], outputs: [[Res.Gunpowder, 1]], steps: sec(15), research: GUNPOWDER },
  // The Workshop: what the Lumber mill made (1 lumber to 1 plank; the waterwheel's 2 went with the mill), then the Tannery's leather
  // work, with rope at the main base too, then the Herbalist hut's medicine.
  { name: 'Planks', at: WORKSHOP, base: 0, inputs: [[[L, 1]]], outputs: [[Res.Planks, 1]], steps: sec(5), research: 0 },
  { name: 'Leather', at: WORKSHOP, base: 0, inputs: [[[Res.Hides, 1]]], outputs: [[Res.Leather, 1]], steps: sec(15), research: 0 },
  { name: 'Hardened leather', at: WORKSHOP, base: 0, inputs: [[[Res.Leather, 2]]], outputs: [[Res.HardenedLeather, 1]], steps: sec(20), research: 0 },
  { name: 'Rope', at: [BuildingKind.Workshop, BuildingKind.MainBase], base: 0, inputs: [[[Res.Leather, 1]], [[Res.Flax, 2]]], outputs: [[Res.Rope, 1]], steps: sec(10), research: 0 },
  { name: 'Bandage', at: WORKSHOP, base: 0, inputs: [[[Res.Herbs, 1], [Res.Flax, 1]], [[Res.Herbs, 1], [Res.Leather, 1]]], outputs: [[Res.Bandage, 1]], steps: sec(10), research: 0 },
  { name: 'Healing remedy', at: WORKSHOP, base: 0, inputs: [[[Res.Herbs, 2], [Res.Glass, 1]]], outputs: [[Res.Remedy, 1]], steps: sec(20), research: 0 },
  // Sticks (Patch 5, Jade: "one lumber makes 4 sticks, taking 20 seconds"; one kind of stick): 20 s at a Storehouse, which works at 1,
  // and half that at the Workshop's CRAFT_PACE. Then the Workshop's carts: hand carts at main base tier 2, ox carts at tier 3.
  { name: 'Sticks (4)', at: STICK_MAKERS, base: 0, inputs: [[[L, 1]]], outputs: [[Res.Sticks, 4]], steps: sec(20), research: 0 },
  // Carts (Table 2f): made as goods, and taken by a worker with X (Troops and gear: carts stay).
  { name: 'Hand cart', at: WORKSHOP, base: 2, inputs: [[[Res.Planks, 6], [L, 4]]], outputs: [[Res.HandCart, 1]], steps: sec(60), research: 0 },
  { name: 'Ox or horse cart', at: WORKSHOP, base: 3, inputs: [[[Res.Planks, 12], [L, 8], [Res.Leather, 4], [Res.WroughtIron, 2]]], outputs: [[Res.OxCart, 1]], steps: sec(120), research: 0 },
  ...trinketRecipes(),
  { name: 'Moonleaf', at: WORKSHOP, base: 3, inputs: [[[Res.Silver, 3], [Res.Emeralds, 2]]], outputs: [[Res.Moonleaf, 1]], steps: sec(180), research: 0 },
  { name: 'Sunheart', at: WORKSHOP, base: 3, inputs: [[[Res.Gold, 3], [Res.Rubies, 2]]], outputs: [[Res.Sunheart, 1]], steps: sec(240), research: 0 },
  // Patch 5 (Jade: "Workshop now makes bonemeal from bones, 1:1"): 4 s a bone (s), 2 s at the Workshop's pace, in stacks.
  { name: 'Bonemeal', at: WORKSHOP, base: 0, inputs: [[[Res.Bone, 1]]], outputs: [[Res.Bonemeal, 1]], steps: sec(4), research: 0, stack: true },
  // Poison tips (Patch 5, Jade: "Venom: Yes"): one venom tips one bow or crossbow ranger's arrows or bolts, put on with Upgrade equipment.
  { name: 'Poison tips', at: WORKSHOP, base: 0, inputs: [[[Res.Venom, 1]]], outputs: [[Res.PoisonTips, 1]], steps: sec(20), research: 0 },
  ...scrapRecipes(),
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
