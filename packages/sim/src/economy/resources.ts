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
  // Patch 5: the Stone Circle goods traded first (Stone Circle doc; decisions 2.5).
  Bluestone: 110,
  MoonRose: 111,
  /**
   * Patch 5 (Jade, GP-1): weapons and armour are items again, one good for
   * each piece of kit at each tier (units/kits.ts names which piece each one
   * is). Nothing makes them: they come from monster waves, rewards and the
   * old piece a unit takes off when it upgrades, and fit in place of making
   * that piece. Close melee, long melee and cavalry, rangers, the brawler,
   * armour, close melee's shields, workers' tool kits, wands and robes.
   */
  WoodenCudgel: 112,
  FlintHandAxe: 113,
  CopperShortSword: 114,
  BronzeShortsword: 115,
  WroughtIronSword: 116,
  IronBroadsword: 117,
  SteelSideSword: 118,
  BasketHiltedBroadsword: 119,
  FireHardenedSpear: 120,
  FlintHeadedSpear: 121,
  CopperLeafBladeSpear: 122,
  BronzeSpear: 123,
  CrudeIronSpear: 124,
  IronPike: 125,
  SteelHalberd: 126,
  Zweihander: 127,
  LeatherSling: 128,
  YewLongbow: 129,
  RecurveBowCopper: 130,
  RecurveBowBronze: 131,
  RecurveBowWroughtIron: 132,
  RecurveBowIron: 133,
  SteelProdCrossbow: 134,
  FlintlockMusket: 135,
  FlintlockPistol: 136,
  LeatherJerkin: 137,
  BoiledLeatherCuirass: 138,
  CopperScaleJack: 139,
  BronzeScaleArmour: 140,
  WroughtIronMail: 141,
  IronCoatOfPlates: 142,
  SteelPlateHarness: 143,
  FlutedGothicHarness: 144,
  WoodenShield: 145,
  BoiledLeatherTarge: 146,
  IronRimmedHeaterShield: 147,
  SteelHeaterShield: 148,
  SteelRotella: 149,
  WoodenTools: 150,
  StoneAndFlintTools: 151,
  CopperTools: 152,
  BronzeTools: 153,
  WroughtIronTools: 154,
  IronTools: 155,
  SteelTools: 156,
  CarbonSteelTools: 157,
  HazelWand: 158,
  CopperTippedWand: 159,
  BronzeBoundStaff: 160,
  IronShodStaff: 161,
  CrystalStaff: 162,
  Archstaff: 163,
  HomespunRobe: 164,
  LeatherTrimmedRobe: 165,
  HardenedLeatherRobe: 166,
  WardedRobe: 167,
  RuneStitchedVestments: 168,
  ArchmagesMantle: 169,
  /** The satyrs' drop (Patch 5, Stone Circle): a weapon item standing in for a bronze shortsword. */
  ObsidianHandAxe: 170,
  /** Patch 5's Stone Circle goods: obsidian counts as flint, 1 for 1, wherever flint is needed (STAND_INS). */
  Obsidian: 171,
  /** Patch 5 (Jade: venom makes poison arrow and bolt tips): made at the Workshop, put on a bow or crossbow ranger like a kit upgrade. */
  PoisonTips: 172,
  /** Jade's Patch 5: the wild foods, 1 food each (GP-30, GP-32). */
  BlackBerries: 173,
  Raspberries: 174,
  Blueberries: 175,
  Mushrooms: 176,
  /** Patch 5 (Jade): ground from bone at the Workshop, 1 to 1; 2 fertilize a farm. */
  Bonemeal: 177,
  // Patch 5's other Stone Circle goods (circles/data.ts; Jade's Stone Circle document and her answers 2.5 and 10).
  AncientSeed: 178,
  HawthorneFruit: 179,
  PanFlute: 180,
  BluestoneTrinket: 181,
  Honey: 182,
  EnchantedWine: 183,
  HawthorneCider: 184,
  MoonIdol: 185,
  HeadlessIdol: 186,
  /** Jade's GP-29: the bog pear, 14 food, wanted by the Halfling Elder (QV-16). */
  BogPear: 187,
  /**
   * Patch 7 (Jade: "Every single weapon used by a mob will now be made into
   * an item"): the monsters' weapons, shields, armour and robes, the pieces
   * that fit nobody and are only scrapped, the neutral peoples' own pieces,
   * the Dreadnought's mace, and witchwood, a material from casters' staffs.
   * Each piece is a good like the ladder's (units/kits.ts names its gear row).
   */
  GoblinDagger: 188,
  GoblinChiefCleaver: 189,
  HobgoblinSword: 190,
  BarrowKnightLongsword: 191,
  FiendCleaver: 192,
  PlagueCenser: 193,
  ChainAndHook: 194,
  GoblinFeatheredSpear: 195,
  KoboldSpear: 196,
  GnollSpear: 197,
  MinotaurGreatAxe: 198,
  ArchfiendGreatsword: 199,
  BogGuardianClub: 200,
  GoblinSling: 201,
  GoblinBow: 202,
  SkeletonRecurveBow: 203,
  GoblinHexStick: 204,
  HollowPriestStaff: 205,
  NecromancerStaff: 206,
  FlamecallerStaff: 207,
  FaeStarWand: 208,
  MorvathStaff: 209,
  GoblinPlankShield: 210,
  HobgoblinShield: 211,
  BarrowKnightKiteShield: 212,
  GnollBracer: 213,
  HobgoblinArmour: 214,
  BarrowKnightMail: 215,
  VoidStalkerCloak: 216,
  FiendShoulderPlate: 217,
  MinotaurBracers: 218,
  PlagueBearerRobe: 219,
  HollowPriestRobe: 220,
  NecromancerRobe: 221,
  FlamecallerRobe: 222,
  FaeGuardianRobe: 223,
  GoblinLeathers: 224,
  GoblinChiefHelmet: 225,
  ArchfiendPlate: 226,
  JuggernautPlating: 227,
  HalflingIronCap: 228,
  DwarfPlate: 229,
  DwarfMail: 230,
  HalflingShortsword: 231,
  HalflingShortbow: 232,
  HalflingBuckler: 233,
  ElfGlaive: 234,
  ElfLongbow: 235,
  DwarfWarAxe: 236,
  DwarfWarHammer: 237,
  HeavySpikedMace: 238,
  Witchwood: 239,
} as const;
export type Res = (typeof Res)[keyof typeof Res];

/** The first trinket: metal m (TRINKET_METALS order) at tier t (1 to 4) is TRINKET_BASE + m * 4 + t - 1. */
export const TRINKET_BASE = 58;
export const TRINKET_METALS = ['Copper', 'Tin', 'Bronze', 'Iron', 'Steel', 'Silver', 'Gold'] as const;
export const TRINKET_TIERS = ['Token', 'Charm', 'Brooch', 'Heirloom'] as const;

export function trinketRes(metal: number, tier: number): Res {
  return (TRINKET_BASE + metal * 4 + tier - 1) as Res;
}

export const ResGroup = { Main: 0, Additional: 1, Goods: 2, Food: 3, Trinkets: 4, Gear: 5 } as const;
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

const Gr = ResGroup.Gear;
/** Where every gear item comes from (Patch 5, GP-1 and GP-3). */
const GEAR_SOURCE = 'A ready piece of kit, from monster waves and rewards, or the old piece a unit takes off when it upgrades. Nothing makes it: a unit trained or upgraded to it puts it on in place of having one made, and the Workshop scraps it for its materials.';

/**
 * The gear items in id order (Patch 5): name and carrying weight, tenths of a
 * pound (s: gear worn weighs nothing, Jade 2026-10-03; carried in a bag it
 * does): a one-handed weapon 3 lb, a two-handed one 5 lb, a sling half a
 * pound, a bow 2 lb, a crossbow 6 lb, a musket 9 lb, the pistol and cutlass
 * 5 lb, armour 6 lb in leather to 20 lb in plate, a shield or a tool kit 5
 * lb, a wand 2 lb and a robe 3 lb.
 */
function gearItems(): ResourceInfo[] {
  const rows: Array<[Res, string, number]> = [
    [Res.WoodenCudgel, 'Wooden cudgel', 30],
    [Res.FlintHandAxe, 'Flint hand-axe', 30],
    [Res.CopperShortSword, 'Copper short sword', 30],
    [Res.BronzeShortsword, 'Bronze shortsword', 30],
    [Res.WroughtIronSword, 'Wrought iron sword', 30],
    [Res.IronBroadsword, 'Iron broadsword', 30],
    [Res.SteelSideSword, 'Steel side-sword', 30],
    [Res.BasketHiltedBroadsword, 'Basket-hilted broadsword', 30],
    [Res.FireHardenedSpear, 'Fire-hardened spear', 50],
    [Res.FlintHeadedSpear, 'Flint-headed spear', 50],
    [Res.CopperLeafBladeSpear, 'Copper leaf-blade spear', 50],
    [Res.BronzeSpear, 'Bronze spear', 50],
    [Res.CrudeIronSpear, 'Crude iron spear', 50],
    [Res.IronPike, 'Iron pike', 50],
    [Res.SteelHalberd, 'Steel halberd', 50],
    [Res.Zweihander, 'Zweihänder', 50],
    [Res.LeatherSling, 'Leather sling', 5],
    [Res.YewLongbow, 'Yew longbow', 20],
    [Res.RecurveBowCopper, 'Recurve bow, copper arrowheads', 20],
    [Res.RecurveBowBronze, 'Recurve bow, bronze arrowheads', 20],
    [Res.RecurveBowWroughtIron, 'Recurve bow, wrought-iron arrowheads', 20],
    [Res.RecurveBowIron, 'Recurve bow, iron arrowheads', 20],
    [Res.SteelProdCrossbow, 'Steel-prod crossbow', 60],
    [Res.FlintlockMusket, 'Flintlock musket', 90],
    [Res.FlintlockPistol, 'Flintlock pistol and cutlass', 50],
    [Res.LeatherJerkin, 'Leather jerkin', 60],
    [Res.BoiledLeatherCuirass, 'Boiled-leather cuirass', 60],
    [Res.CopperScaleJack, 'Copper scale jack', 100],
    [Res.BronzeScaleArmour, 'Bronze scale armour', 100],
    [Res.WroughtIronMail, 'Wrought-iron mail', 150],
    [Res.IronCoatOfPlates, 'Iron coat of plates', 150],
    [Res.SteelPlateHarness, 'Steel plate harness', 200],
    [Res.FlutedGothicHarness, 'Fluted Gothic harness', 200],
    [Res.WoodenShield, 'Wooden shield', 50],
    [Res.BoiledLeatherTarge, 'Boiled-leather targe', 50],
    [Res.IronRimmedHeaterShield, 'Iron-rimmed heater shield', 50],
    [Res.SteelHeaterShield, 'Steel heater shield', 50],
    [Res.SteelRotella, 'Steel rotella', 50],
    [Res.WoodenTools, 'Wooden tools', 50],
    [Res.StoneAndFlintTools, 'Stone and flint tools', 50],
    [Res.CopperTools, 'Copper tools', 50],
    [Res.BronzeTools, 'Bronze tools', 50],
    [Res.WroughtIronTools, 'Wrought iron tools', 50],
    [Res.IronTools, 'Iron tools', 50],
    [Res.SteelTools, 'Steel tools', 50],
    [Res.CarbonSteelTools, 'Carbon steel tools', 50],
    [Res.HazelWand, 'Hazel wand', 20],
    [Res.CopperTippedWand, 'Copper-tipped wand', 20],
    [Res.BronzeBoundStaff, 'Bronze-bound staff', 20],
    [Res.IronShodStaff, 'Iron-shod staff', 20],
    [Res.CrystalStaff, 'Crystal staff', 20],
    [Res.Archstaff, 'Archstaff', 20],
    [Res.HomespunRobe, 'Homespun robe', 30],
    [Res.LeatherTrimmedRobe, 'Leather-trimmed robe', 30],
    [Res.HardenedLeatherRobe, 'Hardened-leather robe', 30],
    [Res.WardedRobe, 'Warded robe', 30],
    [Res.RuneStitchedVestments, 'Rune-stitched vestments', 30],
    [Res.ArchmagesMantle, "Archmage's mantle", 30],
  ];
  return rows.map(([id, name, weight]) => r(id, name, name, Gr, weight, GEAR_SOURCE, 0, false));
}

/** Where a looted piece comes from (Patch 7). */
const LOOT_SOURCE = 'Dropped by the creature or people it belonged to. A unit it fits can wear or wield it; the Workshop scraps it for its materials.';
/** Where a piece that fits nobody comes from (Patch 7, plan 4.3: scrap only). */
const SCRAP_SOURCE = 'Dropped by the creature or people it belonged to. It fits none of your units: the Workshop scraps it for its materials.';

/**
 * Patch 7's looted pieces in id order: name and carrying weight, tenths of a
 * pound, as the ladder's (s): a dagger 1 lb, a sword 3 lb, a two-handed
 * weapon 5 lb and more, a shield 3 to 6 lb, armour 4 to 18 lb, a robe 3 lb.
 * The heaviest are held to 25 lb so one always fits a unit's bag (s): the
 * great weapons 15 lb, the Dreadnought's mace 20 lb, the Bog guardian's club,
 * Morvath's staff and the biggest plate 25 lb.
 */
function lootItems(): ResourceInfo[] {
  const rows: Array<[Res, string, number, string]> = [
    [Res.GoblinDagger, 'Goblin dagger', 10, LOOT_SOURCE],
    [Res.GoblinChiefCleaver, "Goblin chief's cleaver", 40, LOOT_SOURCE],
    [Res.HobgoblinSword, 'Hobgoblin sword', 30, LOOT_SOURCE],
    [Res.BarrowKnightLongsword, "Barrow knight's longsword", 35, LOOT_SOURCE],
    [Res.FiendCleaver, "Fiend's cleaver", 60, LOOT_SOURCE],
    [Res.PlagueCenser, 'Plague censer', 40, LOOT_SOURCE],
    [Res.ChainAndHook, 'Chain and hook', 60, LOOT_SOURCE],
    [Res.GoblinFeatheredSpear, 'Goblin feathered spear', 40, LOOT_SOURCE],
    [Res.KoboldSpear, 'Kobold spear', 50, LOOT_SOURCE],
    [Res.GnollSpear, 'Gnoll spear', 50, LOOT_SOURCE],
    [Res.MinotaurGreatAxe, "Minotaur's great axe", 150, LOOT_SOURCE],
    [Res.ArchfiendGreatsword, "Archfiend's greatsword", 150, LOOT_SOURCE],
    [Res.BogGuardianClub, "Bog guardian's club", 250, SCRAP_SOURCE],
    [Res.GoblinSling, 'Goblin sling', 5, LOOT_SOURCE],
    [Res.GoblinBow, 'Goblin bow', 15, LOOT_SOURCE],
    [Res.SkeletonRecurveBow, "Skeleton's recurve bow", 20, LOOT_SOURCE],
    [Res.GoblinHexStick, 'Goblin hex stick', 10, LOOT_SOURCE],
    [Res.HollowPriestStaff, "Hollow priest's staff", 30, LOOT_SOURCE],
    [Res.NecromancerStaff, "Necromancer's staff", 30, LOOT_SOURCE],
    [Res.FlamecallerStaff, "Flamecaller's staff", 50, LOOT_SOURCE],
    [Res.FaeStarWand, 'Fae star wand', 5, LOOT_SOURCE],
    [Res.MorvathStaff, "Morvath's staff", 250, "The Hollow Crown's own staff, a trophy: no one can wield it. The Workshop scraps it for its materials, slowly."],
    [Res.GoblinPlankShield, 'Goblin plank shield', 30, LOOT_SOURCE],
    [Res.HobgoblinShield, 'Hobgoblin shield', 60, LOOT_SOURCE],
    [Res.BarrowKnightKiteShield, "Barrow knight's kite shield", 60, LOOT_SOURCE],
    [Res.GnollBracer, 'Gnoll bracer', 10, LOOT_SOURCE],
    [Res.HobgoblinArmour, 'Hobgoblin armour', 150, LOOT_SOURCE],
    [Res.BarrowKnightMail, "Barrow knight's mail and helm", 180, LOOT_SOURCE],
    [Res.VoidStalkerCloak, "Void stalker's cloak and hood", 40, LOOT_SOURCE],
    [Res.FiendShoulderPlate, "Fiend's shoulder plate", 120, LOOT_SOURCE],
    [Res.MinotaurBracers, "Minotaur's bracers and pauldron", 120, LOOT_SOURCE],
    [Res.PlagueBearerRobe, "Plague bearer's robe", 30, LOOT_SOURCE],
    [Res.HollowPriestRobe, "Hollow priest's robe", 30, LOOT_SOURCE],
    [Res.NecromancerRobe, "Necromancer's robe", 30, LOOT_SOURCE],
    [Res.FlamecallerRobe, "Flamecaller's robe", 30, LOOT_SOURCE],
    [Res.FaeGuardianRobe, "Fae Guardian's robe", 20, LOOT_SOURCE],
    [Res.GoblinLeathers, 'Goblin leathers', 40, SCRAP_SOURCE],
    [Res.GoblinChiefHelmet, "Goblin chief's helmet", 30, SCRAP_SOURCE],
    [Res.ArchfiendPlate, "Archfiend's plate", 250, SCRAP_SOURCE],
    [Res.JuggernautPlating, "Juggernaut's plating", 250, SCRAP_SOURCE],
    [Res.HalflingIronCap, 'Halfling iron cap', 20, SCRAP_SOURCE],
    [Res.DwarfPlate, 'Dwarf plate and sallet', 200, SCRAP_SOURCE],
    [Res.DwarfMail, 'Dwarf mail and sallet', 150, SCRAP_SOURCE],
    [Res.HalflingShortsword, 'Halfling shortsword', 30, LOOT_SOURCE],
    [Res.HalflingShortbow, 'Halfling shortbow', 20, LOOT_SOURCE],
    [Res.HalflingBuckler, 'Halfling buckler', 30, LOOT_SOURCE],
    [Res.ElfGlaive, 'Elf glaive', 60, LOOT_SOURCE],
    [Res.ElfLongbow, 'Elf longbow', 20, LOOT_SOURCE],
    [Res.DwarfWarAxe, 'Dwarf war axe', 40, LOOT_SOURCE],
    [Res.DwarfWarHammer, 'Dwarf war hammer', 80, LOOT_SOURCE],
    [Res.HeavySpikedMace, 'Heavy spiked mace', 200, "The Dreadnought's own mace. Only a Dreadnought can swing it; the Workshop scraps it for its materials."],
  ];
  return rows.map(([id, name, weight, source]) => r(id, name, name, Gr, weight, source, 0, false));
}

/**
 * Every resource, indexed by id. Weights from Table 12; nutrition from Table 6.
 * Patch 5 (Jade, BL-12: "make ore fairly heavy and make the cart hold a
 * lot"): copper, tin and lead ore, bog iron, iron rock and vein iron weigh 8 lb
 * each (s; they were 5), so a worker on foot brings 3 a trip and a cart is
 * worth taking (units/weight.ts).
 */
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
  r(Res.CopperOre, 'Copper ore', 'Copper ore', M, 80, 'Copper outcrops (a stone maul).'),
  r(Res.TinOre, 'Tin ore', 'Tin ore', M, 80, 'Tin outcrops (a stone maul).'),
  r(Res.CopperIngot, 'Copper ingot', 'Copper', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.TinIngot, 'Tin ingot', 'Tin', M, 50, 'Smelted at a forge.', 0, false),
  r(Res.BronzeIngot, 'Bronze ingot', 'Bronze', M, 50, 'Copper and tin at a forge.', 0, false),
  r(Res.BogIron, 'Bog iron', 'Bog iron', M, 80, 'Bog iron patches (bronze tools).'),
  r(Res.IronRock, 'Iron rock', 'Iron rock', M, 80, 'Iron rock (bronze tools).'),
  r(Res.VeinIron, 'Vein iron ore', 'Vein iron', M, 80, 'Seams inside ridges (wrought iron tools) and mineshafts.'),
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
  // Patch 5 (BL-2: "make dirt weigh half as much"): 2.5 lb, 10 to a worker's 25 lb.
  r(Res.Earth, 'Earth', 'Earth', A, 25, 'Digging soil.'),
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
  r(Res.LeadOre, 'Lead ore', 'Lead ore', A, 80, 'Deepwoods and deeper, beside silver-grey rock (bronze tools). Every gunpowder weapon and cannon takes some.'),
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
  // Patch 5's Stone Circle goods traded first (s: weights as marble and herbs).
  r(Res.Bluestone, 'Bluestone', 'Bluestone', A, 100, 'Bluestone rubble and the trilithons of stone circles (iron tools or better). Stands in for marble in any recipe, and sells well.'),
  r(Res.MoonRose, 'Moon Rose', 'Moon Rose', A, 5, 'Moon Rose bushes at a Lunar stone circle, open only on a bright night. The Moon Goddess asks for them among her gifts, and the Elves pay more for them than for anything else.'),
  ...gearItems(),
  r(Res.ObsidianHandAxe, 'Obsidian hand-axe', 'Obsidian axe', Gr, 30, `The satyrs' weapon. ${GEAR_SOURCE} It fits as a bronze shortsword: a close melee troop takes it in place of one.`, 0, false),
  r(Res.Obsidian, 'Obsidian', 'Obsidian', A, 10, 'Stone circle chests. Counts as flint wherever flint is needed.'),
  r(Res.PoisonTips, 'Poison tips', 'Poison tips', G, 5, 'One venom at the Workshop. Upgrade equipment puts them on a bow or crossbow ranger, whose hits then poison.', 0, false),
  // A bunch of berries or a mushroom is 1 food (GP-30, GP-32); a bunch weighs half a pound, a mushroom 0.3 lb (s).
  r(Res.BlackBerries, 'Black berries', 'Black berries', F, 5, 'Black berry bushes: a bunch is 1 food.', 1),
  r(Res.Raspberries, 'Raspberries', 'Raspberries', F, 5, 'Raspberry bushes, in the Heartland and the Fringe: a bunch is 1 food.', 1),
  r(Res.Blueberries, 'Blueberries', 'Blueberries', F, 5, 'Blueberry bushes, in the Fringe and the Deepwoods: a bunch is 1 food.', 1),
  r(Res.Mushrooms, 'Edible mushrooms', 'Mushrooms', F, 3, 'At the feet of trees, from the Heartland to the Deepwoods: 1 food each.', 1),
  r(Res.Bonemeal, 'Bonemeal', 'Bonemeal', A, 10, 'Ground from bone at the Workshop. Fertilize a farm with 2 for 30% more farm fare for 2 minutes.'),
  // The other Stone Circle goods (Jade's Stone Circle document; weights (s); food values in farm fare from her answers 2.5: farm fare is 2).
  r(Res.AncientSeed, 'Ancient Seed', 'Ancient seeds', A, 1, 'Bluestone chests in stone circles. A small teardrop shaped black seed: right click it to plant a Sweet Hawthorne in grass or dirt.', 0, false),
  r(Res.HawthorneFruit, 'Hawthorne fruit', 'Hawthorne', F, 5, 'Sweet Hawthorne trees: a large ruby-red fruit the size of a small apple, honey-sweet with deeper spice notes. Worth two farm fare.', 4),
  r(Res.PanFlute, 'Pan Flute', 'Pan Flutes', T, 3, 'Bluestone chests in stone circles. Right click it to play a peaceful tune that draws every neutral animal within 300 m toward your base. It can be played 10 times.', 0, false),
  r(Res.BluestoneTrinket, 'Bluestone Trinket', 'Bluestone trinkets', T, 1, 'Bluestone chests in stone circles. Highly valued in trade: 50% more than bronze trinkets.', 0, false),
  r(Res.Honey, 'Honey', 'Honey', F, 10, 'Bought from the Great White Ape. Worth three farm fare.', 6),
  r(Res.EnchantedWine, 'Enchanted wine', 'Wine', F, 10, 'Bought from the Great White Ape. Worth two farm fare; used from a mage\'s bag it also refills 50 mana.', 4),
  r(Res.HawthorneCider, 'Hawthorne cider', 'Cider', F, 10, 'Dropped by satyr revelers. Worth two farm fare.', 4),
  r(Res.MoonIdol, 'Moon Goddess Idol', 'Moon idol', T, 15, 'Taken from the altar of a Great White Ape Lunar Circle. Right click it to make the next night a Bright Night for you, once every 10 nights.', 0, false),
  r(Res.HeadlessIdol, 'Headless God Idol', 'Headless idol', T, 15, 'Taken from the altar of a Boneyard Circle.', 0, false),
  // GP-29: "edible ... It is a dark purple color ... a single pumpkin sized pear ... giving 14 food value" (s: 5 lb).
  r(Res.BogPear, 'Bog pear', 'Bog pears', F, 50, 'Low dark purple bushes at the bogs a Bog guardian keeps: a pumpkin-sized pear worth 14 food. A Halfling Elder wants one.', 14),
  ...lootItems(),
  // Patch 7: witchwood, from casters' staffs at the Workshop (s: a pound).
  r(Res.Witchwood, 'Witchwood', 'Witchwood', A, 10, "Scrapped from casters' staffs at the Workshop. Stands in for a mana crystal in wand and robe recipes.", 0, false),
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
    case 'bog pear':
      return Res.BogPear;
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
 * softwood lumber, 20 stone, 10 flint, 20 sticks. Patch 7 (Jade): 4 more
 * food, as venison, beside the starting spearman.
 */
export const STARTING_STOCK: Cost = [
  [Res.Venison, 29],
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
