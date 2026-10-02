// The resources (Resources; Additional resources; Table 12: Carrying weights
// and capacities; Table 6: Food and supply). Every player has one shared pool
// of all of them; workers deposit at drop-off buildings and buildings take
// what they need straight from the pool.

import { floorDiv } from '../fixed.ts';

/** Resource ids. The first 20 are the doc's main list in its order, then the additional list, then made goods. */
export const Res = {
  SoftwoodLumber: 0,
  HardwoodLumber: 1,
  Herbs: 2,
  Stone: 3,
  Flint: 4,
  Coal: 5,
  Leather: 6,
  Meat: 7,
  Fish: 8,
  CopperOre: 9,
  TinOre: 10,
  CopperIngot: 11,
  TinIngot: 12,
  BronzeIngot: 13,
  BogIron: 14,
  IronRock: 15,
  VeinIron: 16,
  PigIron: 17,
  IronIngot: 18,
  SteelIngot: 19,
  Eggs: 20,
  Feathers: 21,
  Gold: 22,
  Emeralds: 23,
  Rubies: 24,
  Diamonds: 25,
  Silver: 26,
  Marble: 27,
  Earth: 28,
  Gravel: 29,
  Sticks: 30,
  Clay: 31,
  Sand: 32,
  Charcoal: 33,
  Saltpetre: 34,
  Sulphur: 35,
  Wheat: 36,
  Potatoes: 37,
  Carrots: 38,
  Corn: 39,
  Flax: 40,
  Hides: 41,
  Bone: 42,
  Resin: 43,
  SpiderSilk: 44,
  DemonHorn: 45,
  Hexstone: 46,
  Venom: 47,
  LeadOre: 48,
  ManaCrystal: 49,
  // Made goods the tables name (Table 2b, Table 4).
  Planks: 50,
  Bricks: 51,
  Glass: 52,
  Rope: 53,
  BloomIron: 54,
  WroughtIron: 55,
  RefinedIron: 56,
  HighQualitySteel: 57,
  Gunpowder: 58,
  LeadShot: 59,
  // Cooked foods (Table 6, Cooking) and medicine (Food and medicine).
  RoastMeat: 60,
  RoastFish: 61,
  SmokedMeat: 62,
  SmokedFish: 63,
  Bread: 64,
  SaltedMeat: 65,
  SaltedFish: 66,
  Stew: 67,
  Pie: 68,
  Bandage: 69,
  Remedy: 70,
  // Workshop goods: ramp steps of lumber or stone, placed with Earthworks, and glass lanterns.
  LumberRamp: 71,
  StoneRamp: 72,
  Lantern: 73,
  // Trinkets (Trinkets): every metal in every tier, then the two special ones. TRINKET_BASE + metal * 4 + tier - 1.
  Moonleaf: 102,
  Sunheart: 103,
} as const;
export type Res = (typeof Res)[keyof typeof Res];

/** The first trinket: metal m (TRINKET_METALS order) at tier t (1 to 4) is TRINKET_BASE + m * 4 + t - 1. */
export const TRINKET_BASE = 74;
export const TRINKET_METALS = ['Copper', 'Tin', 'Bronze', 'Iron', 'Steel', 'Silver', 'Gold'] as const;
export const TRINKET_TIERS = ['Token', 'Charm', 'Brooch', 'Heirloom'] as const;

export function trinketRes(metal: number, tier: number): Res {
  return (TRINKET_BASE + metal * 4 + tier - 1) as Res;
}

export const ResGroup = { Main: 0, Additional: 1, Goods: 2, Food: 3, Trinkets: 4 } as const;
export type ResGroup = (typeof ResGroup)[keyof typeof ResGroup];

export interface ResourceInfo {
  id: Res;
  /** As the doc writes it. */
  name: string;
  /** Short name for the resource bar. */
  short: string;
  group: ResGroup;
  /** Table 12 weight per unit, in tenths of a pound. */
  weightTenthsLb: number;
  /** Table 6 nutrition per unit, or 0 for things that are not food. */
  nutrition: number;
  /** Where it comes from, for the expanded resource list's tooltip. */
  source: string;
  /** Raw material for the 25 lb gathering limit (Inventory and carrying weight). */
  raw: boolean;
}

const r = (id: Res, name: string, short: string, group: ResGroup, weightTenthsLb: number, source: string, nutrition = 0, raw = true): ResourceInfo => ({
  id, name, short, group, weightTenthsLb, nutrition, source, raw,
});
const M = ResGroup.Main;
const A = ResGroup.Additional;
const G = ResGroup.Goods;
const F = ResGroup.Food;
const T = ResGroup.Trinkets;

/** The 28 metal trinkets, in id order (Table 12 weights: (s) a tenth of a pound each). */
function trinkets(): ResourceInfo[] {
  const out: ResourceInfo[] = [];
  TRINKET_METALS.forEach((metal, m) => {
    TRINKET_TIERS.forEach((tier, t) => {
      const name = `${metal} ${tier}`;
      out.push(r(trinketRes(m, t + 1), name, name, T, 1, `Made at a workshop from ${metal.toLowerCase()} (tier ${t + 1}). For trading with villages.`, 0, false));
    });
  });
  return out;
}

/** Every resource, indexed by id. Weights from Table 12; nutrition from Table 6. */
export const RESOURCES: readonly ResourceInfo[] = [
  r(Res.SoftwoodLumber, 'Softwood lumber', 'Softwood', M, 50, 'Softwood trees: pine, spruce, small softwood.'),
  r(Res.HardwoodLumber, 'Hardwood lumber', 'Hardwood', M, 50, 'Hardwood trees: birch and hornbeam (a flint axe), oak and beech (a copper axe).'),
  r(Res.Herbs, 'Medicinal herbs', 'Herbs', M, 5, 'Wild herbs and herb beds.'),
  r(Res.Stone, 'Stone', 'Stone', M, 50, 'Loose stone, stone outcrops (a digging stick or stone maul) and digging rock.'),
  r(Res.Flint, 'Flint', 'Flint', M, 10, 'Flint scatter.'),
  r(Res.Coal, 'Coal', 'Coal', M, 25, 'Surface coal seams (copper tools) and mineshafts.'),
  r(Res.Leather, 'Leather', 'Leather', M, 25, 'Cattle, and hides at a tannery.', 0, false),
  r(Res.Meat, 'Meat', 'Meat', M, 25, 'Hunting and livestock.', 4),
  r(Res.Fish, 'Fish', 'Fish', M, 25, 'Fishing.', 3),
  r(Res.CopperOre, 'Copper ore', 'Copper ore', M, 50, 'Copper outcrops (a stone maul).'),
  r(Res.TinOre, 'Tin ore', 'Tin ore', M, 50, 'Tin outcrops (a stone maul).'),
  r(Res.CopperIngot, 'Copper ingot', 'Copper', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.TinIngot, 'Tin ingot', 'Tin', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.BronzeIngot, 'Bronze ingot', 'Bronze', M, 50, 'Copper and tin at a forge.', 0, false),
  r(Res.BogIron, 'Bog iron', 'Bog iron', M, 50, 'Bog iron patches (bronze tools).'),
  r(Res.IronRock, 'Iron rock', 'Iron rock', M, 50, 'Iron rock (bronze tools).'),
  r(Res.VeinIron, 'Vein iron ore', 'Vein iron', M, 50, 'Seams inside ridges (bloom iron tools) and mineshafts.'),
  r(Res.PigIron, 'Pig iron ingot', 'Pig iron', M, 50, 'Vein iron at an Ironworks.', 0, false),
  r(Res.IronIngot, 'Iron ingot', 'Iron', M, 50, 'Iron ore at a forge.', 0, false),
  r(Res.SteelIngot, 'Steel ingot', 'Steel', M, 50, 'Refined iron at a Steelworks.', 0, false),
  r(Res.Eggs, 'Eggs', 'Eggs', A, 5, 'Chickens.', 1),
  r(Res.Feathers, 'Feathers', 'Feathers', A, 1, 'Chickens.'),
  r(Res.Gold, 'Gold', 'Gold', A, 10, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Emeralds, 'Emeralds', 'Emeralds', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Rubies, 'Rubies', 'Rubies', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Diamonds, 'Diamonds', 'Diamonds', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Silver, 'Silver', 'Silver', A, 10, 'Mineshafts, often with lead ore.'),
  r(Res.Marble, 'Marble', 'Marble', A, 100, 'Marble rock (bronze tools).'),
  r(Res.Earth, 'Earth', 'Earth', A, 50, 'Digging soil.'),
  r(Res.Gravel, 'Gravel', 'Gravel', A, 50, 'Digging gravel, or crushing stone at a workshop.'),
  r(Res.Sticks, 'Hardwood sticks', 'Sticks', A, 25, 'Hazel bushes (they grow back), or hardwood lumber at a workshop.'),
  r(Res.Clay, 'Clay', 'Clay', A, 50, 'Clay banks by rivers and wetlands.'),
  r(Res.Sand, 'Sand', 'Sand', A, 50, 'Riverbeds and beaches.'),
  r(Res.Charcoal, 'Charcoal', 'Charcoal', A, 25, 'Hardwood burnt at a kiln.', 0, false),
  r(Res.Saltpetre, 'Saltpetre', 'Saltpetre', A, 25, 'Cave floors in the Fringe and deeper.'),
  r(Res.Sulphur, 'Sulphur', 'Sulphur', A, 25, 'Volcanic ground and hot springs, far out.'),
  r(Res.Wheat, 'Wheat', 'Wheat', A, 10, 'Crop fields.', 2),
  r(Res.Potatoes, 'Potatoes', 'Potatoes', A, 10, 'Vegetable farms.', 2),
  r(Res.Carrots, 'Carrots', 'Carrots', A, 5, 'Vegetable farms.', 1),
  r(Res.Corn, 'Corn', 'Corn', A, 10, 'Crop fields.', 2),
  r(Res.Flax, 'Flax', 'Flax', A, 5, 'Crop fields and wild flax.'),
  r(Res.Hides, 'Hides', 'Hides', A, 25, 'Hunting wild animals.'),
  r(Res.Bone, 'Bone', 'Bone', A, 10, 'Hunting and some monsters.'),
  r(Res.Resin, 'Resin / pitch', 'Resin', A, 10, 'Softwood trees: 2 for every one felled.'),
  r(Res.SpiderSilk, 'Spider silk', 'Silk', A, 5, 'Dropped by giant spiders.'),
  r(Res.DemonHorn, 'Demon horn', 'Horn', A, 20, 'Dropped by red demons and the archfiend.'),
  r(Res.Hexstone, 'Hexstone', 'Hexstone', A, 5, 'Dropped by goblins.'),
  r(Res.Venom, 'Venom', 'Venom', A, 5, 'Dropped by vipers, scorpions, centipedes and hornets.'),
  r(Res.LeadOre, 'Lead ore', 'Lead ore', A, 50, 'Deepwoods and deeper, beside silver-grey rock (bronze tools).'),
  r(Res.ManaCrystal, 'Mana crystal', 'Mana', A, 5, 'Rare nodes in the Deadlands, and some magical creatures.'),
  r(Res.Planks, 'Planks', 'Planks', G, 50, 'Lumber at a lumber mill.', 0, false),
  r(Res.Bricks, 'Bricks', 'Bricks', G, 25, 'Clay at a kiln.', 0, false),
  r(Res.Glass, 'Glass', 'Glass', G, 25, 'Sand at a kiln.', 0, false),
  r(Res.Rope, 'Rope', 'Rope', G, 10, 'Leather or flax at a tannery or the Big House.', 0, false),
  r(Res.BloomIron, 'Bloom iron', 'Bloom iron', G, 50, 'Any iron ore at a Bloomery.', 0, false),
  r(Res.WroughtIron, 'Wrought iron', 'Wrought iron', G, 50, 'Any iron ore at an Ironworks.', 0, false),
  r(Res.RefinedIron, 'Refined iron', 'Refined iron', G, 50, 'Pig iron at a Steelworks.', 0, false),
  r(Res.HighQualitySteel, 'High-quality steel', 'HQ steel', G, 50, 'Refined iron and charcoal at a Steelworks, slowly.', 0, false),
  r(Res.Gunpowder, 'Gunpowder', 'Powder', G, 10, 'Saltpetre, sulphur and charcoal at a powder mill.', 0, false),
  r(Res.LeadShot, 'Lead shot', 'Shot', G, 10, 'Lead ore at a forge.', 0, false),
  r(Res.RoastMeat, 'Roast meat', 'Roast meat', F, 25, 'Meat roasted at a campfire or better.', 6, false),
  r(Res.RoastFish, 'Roast fish', 'Roast fish', F, 25, 'Fish roasted at a campfire or better.', 5, false),
  r(Res.SmokedMeat, 'Smoked meat', 'Smoked meat', F, 25, 'Meat smoked at a Cook Hut or better.', 7, false),
  r(Res.SmokedFish, 'Smoked fish', 'Smoked fish', F, 25, 'Fish smoked at a Cook Hut or better.', 6, false),
  r(Res.Bread, 'Bread', 'Bread', F, 10, 'Wheat baked at a Kitchen or better.', 5, false),
  r(Res.SaltedMeat, 'Salted meat', 'Salted meat', F, 25, 'Meat salted at a Kitchen or better.', 8, false),
  r(Res.SaltedFish, 'Salted fish', 'Salted fish', F, 25, 'Fish salted at a Kitchen or better.', 7, false),
  r(Res.Stew, 'Stew', 'Stew', F, 25, 'Meat, potatoes and a carrot at a Great Kitchen or better.', 12, false),
  r(Res.Pie, 'Pie', 'Pie', F, 25, 'Meat, wheat and an egg at a Grand Kitchen.', 16, false),
  r(Res.Bandage, 'Bandage', 'Bandages', G, 5, 'An herb and flax or leather at a herbalist hut. Heals 30 over 15 s.', 0, false),
  r(Res.Remedy, 'Healing remedy', 'Remedies', G, 5, 'Two herbs and a glass bottle at a herbalist hut. Heals 60 over 5 s.', 0, false),
  r(Res.LumberRamp, 'Lumber ramp step', 'Lumber ramp', G, 25, 'Lumber at a workshop: two ramp steps from 1 lumber. Placed with Earthworks.', 0, false),
  r(Res.StoneRamp, 'Stone ramp step', 'Stone ramp', G, 50, 'Stone at a workshop: two ramp steps from 2 stone. Placed with Earthworks.', 0, false),
  r(Res.Lantern, 'Glass lantern', 'Lanterns', G, 30, 'Glass and wrought iron at a Great Workshop; hung as a light.', 0, false),
  ...trinkets(),
  r(Res.Moonleaf, 'Moonleaf', 'Moonleaf', T, 2, 'Silver and emeralds at a Great Workshop or Manufactory. For trading with villages.', 0, false),
  r(Res.Sunheart, 'Sunheart', 'Sunheart', T, 2, 'Gold and rubies at a Manufactory. For trading with villages.', 0, false),
];

export const RESOURCE_COUNT = RESOURCES.length;

/** Raw materials a unit may carry at once (Inventory and carrying weight: 25 lb), in tenths of a pound. */
export const RAW_CARRY_TENTHS_LB = 250;

/** The foods a unit can eat, in id order (Table 6's raw foods; cooked foods come with cooking). */
export const FOODS: readonly Res[] = RESOURCES.filter((x) => x.nutrition > 0).map((x) => x.id);

/** How many of a resource fit in one 25 lb load (Table 12's "Load per trip"). */
export function loadCapacity(res: Res): number {
  const w = RESOURCES[res]!.weightTenthsLb;
  return Math.max(1, floorDiv(RAW_CARRY_TENTHS_LB, w));
}

/** The resource a Table 5 node gives, from its name in props.ts; -1 for none. */
export function resourceByName(name: string): number {
  switch (name) {
    case 'softwood lumber':
      return Res.SoftwoodLumber;
    case 'hardwood lumber':
      return Res.HardwoodLumber;
    case 'hardwood sticks':
      return Res.Sticks;
    case 'medicinal herbs':
      return Res.Herbs;
    case 'flax':
      return Res.Flax;
    case 'stone':
      return Res.Stone;
    case 'flint':
      return Res.Flint;
    case 'copper ore':
      return Res.CopperOre;
    case 'tin ore':
      return Res.TinOre;
    case 'coal':
      return Res.Coal;
    case 'bog iron':
      return Res.BogIron;
    case 'iron rock':
      return Res.IronRock;
    case 'clay':
      return Res.Clay;
    case 'sand':
      return Res.Sand;
    case 'marble':
      return Res.Marble;
    case 'saltpetre':
      return Res.Saltpetre;
    case 'lead ore':
      return Res.LeadOre;
    case 'sulphur':
      return Res.Sulphur;
    case 'gold':
      return Res.Gold;
    case 'gem':
      return Res.Emeralds;
    case 'mana crystal':
      return Res.ManaCrystal;
    case 'meat':
      return Res.Meat;
    case 'fish':
      return Res.Fish;
    default:
      return -1;
  }
}

/** A list of (resource, amount) pairs: costs, refunds, stock. */
export type Cost = ReadonlyArray<readonly [Res, number]>;

/** Starting stock (Table 6 note and Table 9): 15 meat, 10 fish, 10 eggs, 40 softwood lumber, 20 stone, 10 flint, 20 sticks. */
export const STARTING_STOCK: Cost = [
  [Res.Meat, 15],
  [Res.Fish, 10],
  [Res.Eggs, 10],
  [Res.SoftwoodLumber, 40],
  [Res.Stone, 20],
  [Res.Flint, 10],
  [Res.Sticks, 20],
];

/** Whether the pool holds a cost. */
export function canAfford(pool: Int32Array, cost: Cost): boolean {
  for (const [res, n] of cost) if (pool[res]! < n) return false;
  return true;
}

/** The first resource the pool is short of for a cost, or -1. */
export function shortOf(pool: Int32Array, cost: Cost): number {
  for (const [res, n] of cost) if (pool[res]! < n) return res;
  return -1;
}

export function pay(pool: Int32Array, cost: Cost): void {
  for (const [res, n] of cost) pool[res] = pool[res]! - n;
}

/** Refunds a share of a cost in per mille, each line rounded down (1000 = in full). */
export function refund(pool: Int32Array, cost: Cost, perMille: number): void {
  for (const [res, n] of cost) pool[res] = pool[res]! + floorDiv(n * perMille, 1000);
}

/** "2 softwood lumber, 1 resin" for messages and tooltips. */
export function costText(cost: Cost): string {
  return cost.map(([res, n]) => `${n} ${RESOURCES[res]!.name.toLowerCase()}`).join(', ');
}

/** Total nutrition in a pool's foods, leaving out those kept back (Don't eat: a bit per entry of FOODS). */
export function foodInPool(pool: Int32Array, keep = 0): number {
  let n = 0;
  FOODS.forEach((f, k) => {
    if ((keep & (1 << k)) === 0) n += pool[f]! * RESOURCES[f]!.nutrition;
  });
  return n;
}

/**
 * Takes foods worth at least `need` nutrition from the pool, one item of each
 * food in stock in turn (Food: units eat from all of them equally), skipping
 * foods kept back with Don't eat. Returns what was taken, so a cancelled order
 * can be refunded exactly, or null if the pool holds too little food (and
 * takes nothing).
 */
export function payNutrition(pool: Int32Array, need: number, keep = 0): Array<[Res, number]> | null {
  if (need <= 0) return [];
  if (foodInPool(pool, keep) < need) return null;
  const taken = new Map<Res, number>();
  let got = 0;
  while (got < need) {
    for (let k = 0; k < FOODS.length; k++) {
      const f = FOODS[k]!;
      if (got >= need) break;
      if (pool[f]! <= 0 || (keep & (1 << k)) !== 0) continue;
      pool[f] = pool[f]! - 1;
      taken.set(f, (taken.get(f) ?? 0) + 1);
      got += RESOURCES[f]!.nutrition;
    }
  }
  return [...taken].sort((a, b) => a[0] - b[0]);
}
