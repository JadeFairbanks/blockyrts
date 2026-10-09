// The resources (Resources; Additional resources; Table 12: Carrying weights
// and capacities; Table 6: Food and supply). Every player has one shared pool
// of all of them; workers deposit at drop-off buildings and buildings take
// what they need straight from the pool.

import { floorDiv } from '../fixed.ts';

/**
 * Resource ids. The first 20 are the doc's main list in its order, then the
 * additional list, then made goods. Patch 2 cut the crops (wheat, potatoes,
 * carrots and corn), every cooked food and the glass lantern, and then all
 * the siege munitions (cannonballs, catapult stones and ballista bolts: no
 * attack uses ammunition), and the ids after them closed up; farm fare took
 * wheat's place. Patch 5 cut gravel and the ramp steps, and the ids closed up
 * again.
 */
export const Res = {
  SoftwoodLumber: 0,
  HardwoodLumber: 1,
  Herbs: 2,
  Stone: 3,
  Flint: 4,
  Coal: 5,
  Leather: 6,
  /** Raw meat and fish come in kinds (food-kinds.ts): id 7 was the one generic meat and is now venison, id 8 the one fish and is now trout. */
  Venison: 7,
  Trout: 8,
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
  Sticks: 29,
  Clay: 30,
  Sand: 31,
  Charcoal: 32,
  Saltpetre: 33,
  Sulphur: 34,
  /** Patch 2: the Farm's one food, "a hearty medley of vegetables" (Jade). */
  FarmFare: 35,
  Flax: 36,
  Hides: 37,
  Bone: 38,
  Resin: 39,
  SpiderSilk: 40,
  DemonHorn: 41,
  Hexstone: 42,
  Venom: 43,
  LeadOre: 44,
  ManaCrystal: 45,
  // Made goods the tables name (Table 2b, Table 4).
  Planks: 46,
  Bricks: 47,
  Glass: 48,
  Rope: 49,
  /** Leather hardened at the Workshop (Troops and gear). */
  HardenedLeather: 50,
  WroughtIron: 51,
  /** Carts made at the Workshop (Table 2f), taken by workers with X. */
  HandCart: 52,
  /** Carbon steel, which replaced high-quality steel (Troops and gear). */
  CarbonSteel: 53,
  Gunpowder: 54,
  OxCart: 55,
  // Medicine (Food and medicine).
  Bandage: 56,
  Remedy: 57,
  // Trinkets (Trinkets): every metal in every tier, then the two special ones. TRINKET_BASE + metal * 4 + tier - 1.
  Moonleaf: 86,
  Sunheart: 87,
  // Patch 1: raw meat by the animal it came from, and fish by species (food-kinds.ts says which animal gives which).
  Beef: 88,
  Chicken: 89,
  HorseMeat: 90,
  HareMeat: 91,
  BoarMeat: 92,
  WolfMeat: 93,
  LynxMeat: 94,
  BadgerMeat: 95,
  BearMeat: 96,
  FrogLegs: 97,
  CrabMeat: 98,
  CrocodileMeat: 99,
  GooseMeat: 100,
  PheasantMeat: 101,
  GriffinMeat: 102,
  MinotaurMeat: 103,
  RatMeat: 104,
  Salmon: 105,
  Catfish: 106,
  /**
   * Any kind of raw meat or fish, for what a recipe or a trade asks for, and
   * any lumber (softwood or hardwood) for what a building costs: never held in
   * a pool, paid with whatever kinds are in stock (haveOf, payAny).
   */
  AnyMeat: 107,
  AnyFish: 108,
  AnyLumber: 109,
  /** Jade's Patch 5: the wild foods, 1 food each (GP-30, GP-32). */
  BlackBerries: 110,
  Raspberries: 111,
  Blueberries: 112,
  Mushrooms: 113,
  // Patch 5's Stone Circle goods (circles/data.ts; Jade's Stone Circle document and her answers 2.5 and 10).
  Bluestone: 114,
  Obsidian: 115,
  AncientSeed: 116,
  HawthorneFruit: 117,
  PanFlute: 118,
  BluestoneTrinket: 119,
  Honey: 120,
  EnchantedWine: 121,
  HawthorneCider: 122,
  MoonRose: 123,
  MoonIdol: 124,
  HeadlessIdol: 125,
} as const;
export type Res = (typeof Res)[keyof typeof Res];

/** The first trinket: metal m (TRINKET_METALS order) at tier t (1 to 4) is TRINKET_BASE + m * 4 + t - 1. */
export const TRINKET_BASE = 58;
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
  r(Res.Herbs, 'Medicinal herbs', 'Herbs', M, 5, 'Wild herbs, and some monsters.'),
  r(Res.Stone, 'Stone', 'Stone', M, 50, 'Loose stone, stone outcrops (a digging stick or stone maul) and digging rock.'),
  r(Res.Flint, 'Flint', 'Flint', M, 10, 'Flint scatter.'),
  r(Res.Coal, 'Coal', 'Coal', M, 25, 'Coal rocks (copper tools) and mineshafts.'),
  r(Res.Leather, 'Leather', 'Leather', M, 25, 'Cattle, and hides at the Workshop.', 0, false),
  r(Res.Venison, 'Venison', 'Venison', M, 25, 'Hunting deer.', 4),
  r(Res.Trout, 'Trout', 'Trout', M, 25, 'Fishing Heartland streams.', 3),
  r(Res.CopperOre, 'Copper ore', 'Copper ore', M, 50, 'Copper outcrops (a stone maul).'),
  r(Res.TinOre, 'Tin ore', 'Tin ore', M, 50, 'Tin outcrops (a stone maul).'),
  r(Res.CopperIngot, 'Copper ingot', 'Copper', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.TinIngot, 'Tin ingot', 'Tin', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.BronzeIngot, 'Bronze ingot', 'Bronze', M, 50, 'Copper and tin at a forge.', 0, false),
  r(Res.BogIron, 'Bog iron', 'Bog iron', M, 50, 'Bog iron patches (bronze tools).'),
  r(Res.IronRock, 'Iron rock', 'Iron rock', M, 50, 'Iron rock (bronze tools).'),
  r(Res.VeinIron, 'Vein iron ore', 'Vein iron', M, 50, 'Seams inside ridges (wrought iron tools) and mineshafts.'),
  r(Res.PigIron, 'Pig iron ingot', 'Pig iron', M, 50, 'Vein iron at the Forge (main base tier 3).', 0, false),
  r(Res.IronIngot, 'Iron ingot', 'Iron', M, 50, 'Pig iron at the Forge (main base tier 3).', 0, false),
  r(Res.SteelIngot, 'Steel ingot', 'Steel', M, 50, 'Iron at the Forge (main base tier 3), after Steel.', 0, false),
  r(Res.Eggs, 'Eggs', 'Eggs', A, 5, 'Hens in a Barn.', 1),
  r(Res.Feathers, 'Feathers', 'Feathers', A, 1, 'Chickens, hunted wild geese and pheasants, and Runkin traders. Bow and crossbow rangers need them.'),
  r(Res.Gold, 'Gold', 'Gold', A, 10, 'Mostly mineshafts; very rarely, on the surface or in a small node on a mountain (copper tools).'),
  r(Res.Emeralds, 'Emeralds', 'Emeralds', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Rubies, 'Rubies', 'Rubies', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Diamonds, 'Diamonds', 'Diamonds', A, 1, 'Mostly mineshafts; very rarely, on the surface.'),
  r(Res.Silver, 'Silver', 'Silver', A, 10, 'Mineshafts, often with lead ore; rarely, a small node on a mountain (copper tools).'),
  r(Res.Marble, 'Marble', 'Marble', A, 100, 'Marble rock (bronze tools).'),
  r(Res.Earth, 'Earth', 'Earth', A, 50, 'Digging soil.'),
  r(Res.Sticks, 'Sticks', 'Sticks', A, 25, 'Hazel bushes (they grow back), or 4 from a lumber of either kind at a Storehouse or the Workshop.'),
  r(Res.Clay, 'Clay', 'Clay', A, 50, 'Clay banks by rivers and wetlands.'),
  r(Res.Sand, 'Sand', 'Sand', A, 50, 'Riverbeds and beaches.'),
  r(Res.Charcoal, 'Charcoal', 'Charcoal', A, 25, 'Lumber burnt at the Forge (main base tier 2).', 0, false),
  r(Res.Saltpetre, 'Saltpetre', 'Saltpetre', A, 25, 'Cave floors in the Fringe and deeper.'),
  r(Res.Sulphur, 'Sulphur', 'Sulphur', A, 25, 'Volcanic ground and hot springs, far out.'),
  r(Res.FarmFare, 'Farm fare', 'Farm fare', A, 10, 'A hearty medley of vegetables, grown at the Farm.', 2),
  r(Res.Flax, 'Flax', 'Flax', A, 5, 'Wild flax, in its fields.'),
  r(Res.Hides, 'Hides', 'Hides', A, 25, 'Hunting wild animals.'),
  r(Res.Bone, 'Bone', 'Bone', A, 10, 'Hunting and some monsters.'),
  r(Res.Resin, 'Resin / pitch', 'Resin', A, 10, 'Softwood trees: 2 for every one felled.'),
  r(Res.SpiderSilk, 'Spider silk', 'Silk', A, 5, 'Dropped by giant spiders.'),
  r(Res.DemonHorn, 'Demon horn', 'Horn', A, 20, 'Dropped by red demons and the archfiend.'),
  r(Res.Hexstone, 'Hexstone', 'Hexstone', A, 5, 'Dropped by goblins.'),
  r(Res.Venom, 'Venom', 'Venom', A, 5, 'Dropped by vipers, scorpions, centipedes and hornets.'),
  r(Res.LeadOre, 'Lead ore', 'Lead ore', A, 50, 'Deepwoods and deeper, beside silver-grey rock (bronze tools).'),
  r(Res.ManaCrystal, 'Mana crystal', 'Mana', A, 5, 'Rare nodes in the Deadlands, and some magical creatures.'),
  r(Res.Planks, 'Planks', 'Planks', G, 50, 'Lumber at the Workshop.', 0, false),
  r(Res.Bricks, 'Bricks', 'Bricks', G, 25, 'Clay at the Forge (main base tier 2).', 0, false),
  r(Res.Glass, 'Glass', 'Glass', G, 25, 'Sand at the Forge (main base tier 2).', 0, false),
  r(Res.Rope, 'Rope', 'Rope', G, 10, 'Leather or flax at the Workshop or the main base.', 0, false),
  r(Res.HardenedLeather, 'Hardened leather', 'Hard leather', G, 25, 'Leather hardened at the Workshop.', 0, false),
  r(Res.WroughtIron, 'Wrought iron', 'Wrought iron', G, 50, 'Any iron ore at the Forge (main base tier 2).', 0, false),
  r(Res.HandCart, 'Hand cart', 'Hand carts', G, 500, 'Planks and lumber at the Workshop (main base tier 2). A worker takes one with X.', 0, false),
  r(Res.CarbonSteel, 'Carbon steel ingot', 'Carbon steel', G, 50, 'Iron and plenty of charcoal at the Forge (main base tier 3), slowly, after Carbon steel.', 0, false),
  r(Res.Gunpowder, 'Gunpowder', 'Powder', G, 10, 'Saltpetre, sulphur and charcoal at the Forge (main base tier 3), after Gunpowder. Musket rangers and brawlers need it.', 0, false),
  r(Res.OxCart, 'Ox or horse cart', 'Ox carts', G, 500, 'Planks, lumber, leather and wrought iron at the Workshop (main base tier 3). A worker takes one with X.', 0, false),
  r(Res.Bandage, 'Bandage', 'Bandages', G, 5, 'An herb and flax or leather at the Workshop. Heals 30 over 15 s.', 0, false),
  r(Res.Remedy, 'Healing remedy', 'Remedies', G, 5, 'Two herbs and a glass bottle at the Workshop. Heals 60 over 5 s.', 0, false),
  ...trinkets(),
  r(Res.Moonleaf, 'Moonleaf', 'Moonleaf', T, 2, 'Silver and emeralds at the Workshop (main base tier 3). For trading with villages.', 0, false),
  r(Res.Sunheart, 'Sunheart', 'Sunheart', T, 2, 'Gold and rubies at the Workshop (main base tier 3). For trading with villages.', 0, false),
  // Raw meat by animal and fish by species (Table 6: every meat 4, every fish 3; Table 12: 2.5 lb each).
  r(Res.Beef, 'Beef', 'Beef', F, 25, 'Slaughtering or hunting cattle and oxen.', 4),
  r(Res.Chicken, 'Chicken', 'Chicken', F, 25, 'Slaughtering or hunting chickens.', 4),
  r(Res.HorseMeat, 'Horse meat', 'Horse', F, 25, 'Horses that fall or are hunted.', 4),
  r(Res.HareMeat, 'Hare meat', 'Hare', F, 25, 'Hunting hares.', 4),
  r(Res.BoarMeat, 'Boar meat', 'Boar', F, 25, 'Hunting wild boar.', 4),
  r(Res.WolfMeat, 'Wolf meat', 'Wolf', F, 25, 'Killing wolves.', 4),
  r(Res.LynxMeat, 'Lynx meat', 'Lynx', F, 25, 'Killing lynxes.', 4),
  r(Res.BadgerMeat, 'Badger meat', 'Badger', F, 25, 'Killing badgers.', 4),
  r(Res.BearMeat, 'Bear meat', 'Bear', F, 25, 'Killing bears.', 4),
  r(Res.FrogLegs, 'Frog legs', 'Frog legs', F, 25, 'Killing giant frogs.', 4),
  r(Res.CrabMeat, 'Crab meat', 'Crab', F, 25, 'Killing giant crabs.', 4),
  r(Res.CrocodileMeat, 'Crocodile meat', 'Crocodile', F, 25, 'Killing crocodiles.', 4),
  r(Res.GooseMeat, 'Goose meat', 'Goose', F, 25, 'Hunting wild geese.', 4),
  r(Res.PheasantMeat, 'Pheasant meat', 'Pheasant', F, 25, 'Hunting pheasants.', 4),
  r(Res.GriffinMeat, 'Griffin meat', 'Griffin', F, 25, 'Killing a griffin.', 4),
  r(Res.MinotaurMeat, 'Minotaur meat', 'Minotaur', F, 25, 'Killing a minotaur.', 4),
  r(Res.RatMeat, 'Rat meat', 'Rat', F, 25, 'Now and then from a giant rat of the night.', 4),
  r(Res.Salmon, 'Salmon', 'Salmon', F, 25, 'Fishing Fringe streams.', 3),
  r(Res.Catfish, 'Giant catfish', 'Catfish', F, 25, 'Fishing Deepwoods pools.', 3),
  r(Res.AnyMeat, 'Meat', 'Meat', F, 25, 'Any kind of raw meat.', 0, false),
  r(Res.AnyFish, 'Fish', 'Fish', F, 25, 'Any kind of fish.', 0, false),
  r(Res.AnyLumber, 'Lumber', 'Lumber', M, 50, 'Softwood or hardwood lumber, whichever is in stock.', 0, false),
  // A bunch of berries or a mushroom is 1 food (GP-30, GP-32); a bunch weighs half a pound, a mushroom 0.3 lb (s).
  r(Res.BlackBerries, 'Black berries', 'Black berries', F, 5, 'Black berry bushes: a bunch is 1 food.', 1),
  r(Res.Raspberries, 'Raspberries', 'Raspberries', F, 5, 'Raspberry bushes, in the Heartland and the Fringe: a bunch is 1 food.', 1),
  r(Res.Blueberries, 'Blueberries', 'Blueberries', F, 5, 'Blueberry bushes, in the Fringe and the Deepwoods: a bunch is 1 food.', 1),
  r(Res.Mushrooms, 'Edible mushrooms', 'Mushrooms', F, 3, 'At the feet of trees, from the Heartland to the Deepwoods: 1 food each.', 1),
  // Stone Circle goods (Jade's Stone Circle document; weights (s); food values in farm fare from her answers 2.5: farm fare is 2).
  r(Res.Bluestone, 'Bluestone', 'Bluestone', A, 60, 'Bluestone rubble and the trilithons of stone circles (iron tools or better). Stands in for marble in any recipe, and sells well.'),
  r(Res.Obsidian, 'Obsidian', 'Obsidian', A, 10, 'Bluestone chests in stone circles.'),
  r(Res.AncientSeed, 'Ancient Seed', 'Ancient seeds', A, 1, 'Bluestone chests in stone circles. A small teardrop shaped black seed: right click it to plant a Sweet Hawthorne in grass or dirt.', 0, false),
  r(Res.HawthorneFruit, 'Hawthorne fruit', 'Hawthorne', F, 5, 'Sweet Hawthorne trees: a large ruby-red fruit the size of a small apple, honey-sweet with deeper spice notes. Worth two farm fare.', 4),
  r(Res.PanFlute, 'Pan Flute', 'Pan Flutes', T, 3, 'Bluestone chests in stone circles. Right click it to play a peaceful tune that draws every neutral animal within 300 m toward your base. It can be played 10 times.', 0, false),
  r(Res.BluestoneTrinket, 'Bluestone Trinket', 'Bluestone trinkets', T, 1, 'Bluestone chests in stone circles. Highly valued in trade: 50% more than bronze trinkets.', 0, false),
  r(Res.Honey, 'Honey', 'Honey', F, 10, 'Bought from the Great White Ape. Worth three farm fare.', 6),
  r(Res.EnchantedWine, 'Enchanted wine', 'Wine', F, 10, 'Bought from the Great White Ape. Worth two farm fare; used from a mage\'s bag it also refills 50 mana.', 4),
  r(Res.HawthorneCider, 'Hawthorne cider', 'Cider', F, 10, 'Dropped by satyr revelers. Worth two farm fare.', 4),
  r(Res.MoonRose, 'Moon Rose', 'Moon Roses', A, 1, 'Moon Rose bushes, which bloom only on a Bright Night. Part of the lavish gifts the Moon Goddess asks for.'),
  r(Res.MoonIdol, 'Moon Goddess Idol', 'Moon idol', T, 15, 'Taken from the altar of a Great White Ape Lunar Circle. Right click it to make the next night a Bright Night for you, once every 10 nights.', 0, false),
  r(Res.HeadlessIdol, 'Headless God Idol', 'Headless idol', T, 15, 'Taken from the altar of a Boneyard Circle.', 0, false),
];

export const RESOURCE_COUNT = RESOURCES.length;

/** Raw materials a unit may carry at once (Inventory and carrying weight: 25 lb), in tenths of a pound. */
export const RAW_CARRY_TENTHS_LB = 250;

/** The foods a unit can eat, in id order (Table 6's raw foods and farm fare; Patch 2 cut cooking). */
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
    case 'sticks':
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
    case 'silver':
      return Res.Silver;
    case 'black berries':
      return Res.BlackBerries;
    case 'raspberries':
      return Res.Raspberries;
    case 'blueberries':
      return Res.Blueberries;
    case 'mushrooms':
      return Res.Mushrooms;
    case 'gem':
      return Res.Emeralds;
    case 'mana crystal':
      return Res.ManaCrystal;
    case 'bluestone':
      return Res.Bluestone;
    case 'hawthorne fruit':
      return Res.HawthorneFruit;
    case 'moon rose':
      return Res.MoonRose;
    case 'bone':
      return Res.Bone;
    // A carcass gives its animal's meat and a fish stretch its species (units/behaviour.ts nodeResource): these stand for the kind.
    case 'meat':
      return Res.AnyMeat;
    case 'fish':
      return Res.AnyFish;
    default:
      return -1;
  }
}

/** A list of (resource, amount) pairs: costs, refunds, stock. */
export type Cost = ReadonlyArray<readonly [Res, number]>;

/**
 * Starting stock (Table 6 note and Table 9): food for the four workers and
 * three warriors for 10 days, 140 nutrition (Troops and gear: starting units
 * (s)): 25 meat (venison, patch 1), 10 fish (trout, patch 1), 10 eggs; and 40
 * softwood lumber, 20 stone, 10 flint, 20 sticks.
 */
export const STARTING_STOCK: Cost = [
  [Res.Venison, 25],
  [Res.Trout, 10],
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
