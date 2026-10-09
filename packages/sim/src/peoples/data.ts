// The neutral peoples as data (Neutral villages and trade; Table 11: trade
// values, village stock and wants; Halflings; Runkin; Elves; Dwarves;
// Table 19: Elf and Dwarf price lists; Table 13's Grovesinger row; the
// mercenary camps). Every number the doc gives is used as given; the rest
// are picks marked (s). Trade values are in tenths of a value point (1 vp
// is one softwood lumber) so sticks (0.5) and earth (0.2) stay whole.
// The balance editor reads this module, so it holds data and pure helpers only.

import { Res, TRINKET_BASE, TRINKET_METALS } from '../economy/resources.ts';
import { FISHES, MEATS } from '../economy/food-kinds.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS, TRINKET_MULTIPLIER_TENTHS, SPECIAL_TRINKET_MULTIPLIER_TENTHS } from '../rules.ts';
import { CLOSE_GEAR, LONG_GEAR, PeopleGear, RANGER_GEAR, SHIELD_GEAR, shieldRow } from '../units/kits.ts';
import { TRINKET_INGOTS } from '../buildings/recipes.ts';
import { Mob } from '../combat/mobs.ts';
import { Species } from '../animals/species.ts';
import { Band } from '../world/layout.ts';
import { Engine } from '../siege/data.ts';

const SEC = STEPS_PER_SECOND;
const M = WU_PER_METRE;
const DAY = CYCLE_STEPS;

/** The four peoples so far (Neutral villages and trade: "more will be added in later iterations"). */
export const People = { Halfling: 0, Runkin: 1, Elf: 2, Dwarf: 3 } as const;
export type People = (typeof People)[keyof typeof People];
export const PEOPLE_NAMES = ['Halflings', 'Runkin', 'Elves', 'Dwarves'] as const;
/** One of a people, for "a Halfling", "an Elf". */
export const PERSON_NAMES = ['Halfling', 'Runkin', 'Elf', 'Dwarf'] as const;

/**
 * What a faction is: each village, camp, colony, city and the one kingdom
 * is its own faction (Dwarves: "each colony and each city is its own
 * faction"). An Elf caravan trades for itself but is at war or peace as its
 * kingdom is; a mercenary camp only hires.
 */
export const FactionKind = { HalflingVillage: 0, RunkinCamp: 1, ElfKingdom: 2, ElfCaravan: 3, DwarfColony: 4, DwarfCity: 5, MercCamp: 6 } as const;
export type FactionKind = (typeof FactionKind)[keyof typeof FactionKind];
export const FACTION_KIND_NAMES = ['Halfling village', 'Runkin camp', 'Elf kingdom', 'Elf caravan', 'Dwarf colony', 'Dwarf city', 'Mercenary camp'] as const;
export const KIND_PEOPLE: readonly People[] = [People.Halfling, People.Runkin, People.Elf, People.Elf, People.Dwarf, People.Dwarf, People.Runkin];

/** How a faction stands (Technical decisions 13: settled, warned, at war, migrating, gone). War itself is per player (Faction.war). */
export const Status = {
  /** At home: trading, or at war with someone. */
  Settled: 0,
  /** Walking off after a surrender or a defeat (Halflings, Runkin), or migrating (Dwarves). */
  Leaving: 1,
  /** Runkin gone to make a new camp in a cell no one has explored yet. */
  Away: 2,
  /** Dwarves rebuilding elsewhere, still at war until reparations are paid. */
  Migrated: 3,
  /** Gone for good; its buildings, if any, are abandoned. */
  Gone: 4,
} as const;
export type Status = (typeof Status)[keyof typeof Status];

// ----- the peoples' units -----

/** A person of a people (their unit type, kept in the unit's mob field; the Grovesinger is a mage). */
export const PeopleUnit = {
  HalflingMale: 0,
  HalflingFemale: 1,
  HalflingSpearman: 2,
  HalflingArcher: 3,
  RunkinMale: 4,
  RunkinFemale: 5,
  RunkinArcher: 6,
  RunkinClubber: 7,
  ElfVillager: 8,
  ElfBladewarden: 9,
  ElfRanger: 10,
  ElfGrovesinger: 11,
  DwarfVillager: 12,
  DwarfShieldbearer: 13,
  DwarfHammerguard: 14,
  DwarfCrossbowman: 15,
  // Milestone 8: mounted and gun units.
  HalflingOxRider: 16,
  ElfBearRider: 17,
  DwarfGunner: 18,
  DwarfCannonCrew: 19,
} as const;
export type PeopleUnit = (typeof PeopleUnit)[keyof typeof PeopleUnit];

export interface PeopleUnitSpec {
  id: PeopleUnit;
  name: string;
  people: People;
  /** Catalogue model (review/batch-2 MANIFEST, models/peoples). */
  model: string;
  hp: number;
  /** Walking speed, tenths of a m/s (s). */
  speed10: number;
  /** A fighter (counts towards defeat when none are left); villagers flee instead. */
  fighter: boolean;
  /** The fixed kit it carries (units/kits.ts gear ids), 0 for none: a melee weapon, a bow or gun, one armour row (body and helmet together) and a shield. Ammunition is unlimited. */
  weapon: number;
  ranged: number;
  armour: number;
  shield: number;
  /** Shoots while walking (Runkin archers, Elf longbow rangers): the doc's "can walk (but not run) while shooting". */
  walkShoot: boolean;
  /** Body height, cm, for the hit box (Halflings 1.5 m and 1 m, Elves 1.9 m, Dwarves 1.3 m). */
  heightCm: number;
  /** What it rides (mounts/data.ts Mount), 0 for none: Table 14's war ox and war bear. */
  mount: number;
}

/** mounts/data.ts Mount ids, kept as numbers so the balance editor's import of this module stays light. */
const WAR_OX = 2;
const WAR_BEAR = 4;
/** siege/data.ts Engine.DwarfCannon. */
const DWARF_CANNON = 4;

const unit = (o: Omit<PeopleUnitSpec, 'weapon' | 'ranged' | 'armour' | 'shield' | 'walkShoot' | 'mount'> & Partial<PeopleUnitSpec>): PeopleUnitSpec => ({
  weapon: 0, ranged: 0, armour: 0, shield: 0, walkShoot: false, mount: 0, ...o,
});

/** The players' kit rows the peoples carry too (Troops and gear): a wooden cudgel, a flint and a bronze spear, a longbow, a steel side-sword, a flintlock musket and a steel heater. */
const CUDGEL = CLOSE_GEAR[1]!;
const SPEAR_FLINT = LONG_GEAR[2]!;
const SPEAR_BRONZE = LONG_GEAR[4]!;
const LONGBOW = RANGER_GEAR[2]!;
const SWORD_STEEL = CLOSE_GEAR[7]!;
const MUSKET = RANGER_GEAR[8]!;
const STEEL_HEATER = SHIELD_GEAR[shieldRow(7).tier]!;

/**
 * The peoples' units (s throughout, from the doc's descriptions): Halfling
 * spearmen wear an iron cap and carry a short spear; Runkin archers walk
 * and shoot, clubbers carry flint spears and hardwood clubs; Bladewardens a
 * carbon-steel glaive, lightly armoured; Longbow
 * rangers the longest bow in the game with high-quality steel tips;
 * Shieldbearers heavily armoured with an axe and a large shield;
 * Hammerguards a two-handed war hammer; crossbowmen short range, hard-hitting.
 */
export const PEOPLE_UNITS: readonly PeopleUnitSpec[] = [
  unit({ id: PeopleUnit.HalflingMale, name: 'Halfling', people: People.Halfling, model: 'halfling_male', hp: 40, speed10: 26, fighter: false, heightCm: 150 }),
  unit({ id: PeopleUnit.HalflingFemale, name: 'Halfling', people: People.Halfling, model: 'halfling_female', hp: 30, speed10: 26, fighter: false, heightCm: 100 }),
  unit({ id: PeopleUnit.HalflingSpearman, name: 'Halfling spearman', people: People.Halfling, model: 'halfling_spearman', hp: 45, speed10: 26, fighter: true, weapon: SPEAR_BRONZE, armour: PeopleGear.HalflingHelm, shield: PeopleGear.Buckler, heightCm: 150 }),
  unit({ id: PeopleUnit.HalflingArcher, name: 'Halfling archer', people: People.Halfling, model: 'halfling_archer', hp: 40, speed10: 26, fighter: true, ranged: PeopleGear.Shortbow, weapon: PeopleGear.Shortsword, heightCm: 150 }),
  unit({ id: PeopleUnit.RunkinMale, name: 'Runkin', people: People.Runkin, model: 'runkin_male', hp: 70, speed10: 30, fighter: false, heightCm: 150 }),
  unit({ id: PeopleUnit.RunkinFemale, name: 'Runkin', people: People.Runkin, model: 'runkin_female', hp: 70, speed10: 30, fighter: false, heightCm: 150 }),
  unit({ id: PeopleUnit.RunkinArcher, name: 'Runkin archer', people: People.Runkin, model: 'runkin_archer', hp: 80, speed10: 30, fighter: true, ranged: LONGBOW, weapon: CUDGEL, armour: PeopleGear.Leathers, walkShoot: true, heightCm: 150 }),
  unit({ id: PeopleUnit.RunkinClubber, name: 'Runkin clubber', people: People.Runkin, model: 'runkin_clubber', hp: 100, speed10: 30, fighter: true, weapon: SPEAR_FLINT, armour: PeopleGear.Leathers, heightCm: 150 }),
  unit({ id: PeopleUnit.ElfVillager, name: 'Elf', people: People.Elf, model: 'elf_villager', hp: 80, speed10: 32, fighter: false, heightCm: 190 }),
  unit({ id: PeopleUnit.ElfBladewarden, name: 'Elf Bladewarden', people: People.Elf, model: 'elf_bladewarden', hp: 160, speed10: 34, fighter: true, weapon: PeopleGear.Glaive, armour: PeopleGear.Leathers, heightCm: 190 }),
  unit({ id: PeopleUnit.ElfRanger, name: 'Elf Longbow ranger', people: People.Elf, model: 'elf_longbow_ranger', hp: 120, speed10: 34, fighter: true, ranged: PeopleGear.ElfLongbow, weapon: SWORD_STEEL, armour: PeopleGear.Leathers, walkShoot: true, heightCm: 190 }),
  unit({ id: PeopleUnit.ElfGrovesinger, name: 'Elf Grovesinger', people: People.Elf, model: 'elf_grovesinger', hp: 100, speed10: 30, fighter: true, heightCm: 190 }),
  unit({ id: PeopleUnit.DwarfVillager, name: 'Dwarf', people: People.Dwarf, model: 'dwarf_villager', hp: 90, speed10: 24, fighter: false, heightCm: 130 }),
  unit({ id: PeopleUnit.DwarfShieldbearer, name: 'Dwarf Shieldbearer', people: People.Dwarf, model: 'dwarf_shieldbearer', hp: 200, speed10: 22, fighter: true, weapon: PeopleGear.DwarfWarAxe, shield: STEEL_HEATER, armour: PeopleGear.DwarfPlate, heightCm: 130 }),
  unit({ id: PeopleUnit.DwarfHammerguard, name: 'Dwarf Hammerguard', people: People.Dwarf, model: 'dwarf_hammerguard', hp: 170, speed10: 22, fighter: true, weapon: PeopleGear.DwarfWarHammer, armour: PeopleGear.DwarfMail, heightCm: 130 }),
  unit({ id: PeopleUnit.DwarfCrossbowman, name: 'Dwarf Crossbowman', people: People.Dwarf, model: 'dwarf_crossbowman', hp: 130, speed10: 22, fighter: true, ranged: PeopleGear.DwarfCrossbow, weapon: SWORD_STEEL, armour: PeopleGear.DwarfMail, heightCm: 130 }),
  // Milestone 8. The war ox's front rider carries the spearman's bronze spear, and its rear rider's shortbow is the ox's own attack
  // (mounts/data.ts); the bear rider the Bladewarden's glaive; both ride at the mount's speeds (Table 14).
  unit({ id: PeopleUnit.HalflingOxRider, name: 'Halfling ox rider', people: People.Halfling, model: 'halfling_spearman', hp: 60, speed10: 26, fighter: true, weapon: SPEAR_BRONZE, armour: PeopleGear.HalflingHelm, heightCm: 150, mount: WAR_OX }),
  unit({ id: PeopleUnit.ElfBearRider, name: 'Elf bear rider', people: People.Elf, model: 'elf_bear_rider', hp: 160, speed10: 34, fighter: true, weapon: PeopleGear.Glaive, armour: PeopleGear.Leathers, heightCm: 190, mount: WAR_BEAR }),
  // Gunner: "Cities only. Musket, slow to reload." Cannon crew: "Cities only. Defends the city walls." (s: a flintlock musket;
  // the crew carry steel swords and work the city's two cannons at the gate.)
  unit({ id: PeopleUnit.DwarfGunner, name: 'Dwarf Gunner', people: People.Dwarf, model: 'dwarf_gunner', hp: 140, speed10: 22, fighter: true, ranged: MUSKET, weapon: SWORD_STEEL, armour: PeopleGear.DwarfMail, heightCm: 130 }),
  unit({ id: PeopleUnit.DwarfCannonCrew, name: 'Dwarf cannon crew', people: People.Dwarf, model: 'dwarf_cannon_crew', hp: 130, speed10: 22, fighter: true, weapon: SWORD_STEEL, armour: PeopleGear.DwarfMail, heightCm: 130 }),
];

export function peopleUnitSpec(id: number): PeopleUnitSpec {
  const s = PEOPLE_UNITS[id];
  if (!s) throw new RangeError(`no people unit ${id}`);
  return s;
}

/** The Elf Grovesinger (Table 13, s): health 100, mana 150, refilling 1.5 a second within 20 m of a living tree, 0.75 elsewhere, 0.3 in the Barrens and Deadlands. */
export const GROVESINGER = { hp: 100, mana: 150, nearTreeRefill: 150, refill: 75, barrenRefill: 30, treeWu: 20 * M } as const;

/** The peoples' beasts are animals of their species (Table 14: the tamed bear on foot is the bear's numbers): Runkin wolves, Elf tamed bears. */
export const RUNKIN_WOLF = Species.Wolf;
export const ELF_BEAR = Species.Bear;

// ----- the peoples' buildings -----

/** What a people's building gives back when workers break it down once it is abandoned (Neutral villages and trade) (s). */
export const SALVAGE: Readonly<Partial<Record<number, ReadonlyArray<readonly [Res, number]>>>> = {
  [Mob.HalflingBurrow]: [[Res.SoftwoodLumber, 10], [Res.Stone, 10]],
  [Mob.HalflingMill]: [[Res.SoftwoodLumber, 15], [Res.Stone, 5]],
  [Mob.HalflingInn]: [[Res.SoftwoodLumber, 20], [Res.Stone, 20]],
  [Mob.HalflingBarn]: [[Res.SoftwoodLumber, 20]],
  [Mob.RunkinTent]: [[Res.Hides, 3], [Res.Sticks, 4]],
  [Mob.RunkinDryingRack]: [[Res.Sticks, 4]],
  [Mob.RunkinWolfDen]: [[Res.Hides, 2], [Res.Sticks, 4]],
  [Mob.RunkinFire]: [[Res.Stone, 5]],
  [Mob.ElfHall]: [[Res.HardwoodLumber, 20], [Res.Marble, 15]],
  [Mob.ElfTreePlatform]: [[Res.HardwoodLumber, 15]],
  [Mob.ElfBearPen]: [[Res.HardwoodLumber, 15]],
  [Mob.ElfGate]: [[Res.Marble, 20]],
  [Mob.DwarfHouse]: [[Res.Stone, 30]],
  [Mob.DwarfForge]: [[Res.Stone, 20], [Res.WroughtIron, 5]],
  [Mob.DwarfMineshaft]: [[Res.Stone, 15], [Res.HardwoodLumber, 10]],
  [Mob.DwarfHall]: [[Res.Stone, 40]],
  [Mob.DwarfCityGate]: [[Res.Stone, 60]],
};

/** A faction's plan: its buildings and people (s), and the ring they stand in. */
export interface Layout {
  structures: ReadonlyArray<readonly [number, number]>;
  people: ReadonlyArray<readonly [PeopleUnit, number]>;
  /** Animals it keeps: livestock, wolves, bears. */
  animals: ReadonlyArray<readonly [Species, number]>;
  /** Engines it fields beside its gate (siege/data.ts Engine): a Dwarf city's own cannons. */
  engines: ReadonlyArray<readonly [number, number]>;
  /** Buildings stand this far from the middle, wu; fighters keep posts at half that. */
  ringWu: number;
}

/**
 * A Halfling village's war oxen, kept in its barn and grown with the band like
 * its people (s). The doc: "only in times of war, Halflings ride oxen into
 * battle with two riders on each". When a war starts, a spearman takes each ox
 * with an archer behind him (peoples/factions.ts fieldOxen).
 */
export const HALFLING_WAR_OXEN = 2;

/**
 * The size of each kind (s). The doc: "the deeper they are, the larger and
 * grander they get". Halfling villages keep a little farm (hens, cattle and
 * an ox for sale and as plunder); the one Elf kingdom is very large.
 */
export const LAYOUTS: readonly Layout[] = [
  {
    structures: [[Mob.HalflingInn, 1], [Mob.HalflingMill, 1], [Mob.HalflingBarn, 1], [Mob.HalflingBurrow, 4]],
    people: [[PeopleUnit.HalflingMale, 4], [PeopleUnit.HalflingFemale, 4], [PeopleUnit.HalflingSpearman, 4], [PeopleUnit.HalflingArcher, 2]],
    animals: [[Species.Chicken, 4], [Species.Cattle, 2], [Species.Ox, 1]],
    engines: [],
    ringWu: 14 * M,
  },
  {
    structures: [[Mob.RunkinFire, 1], [Mob.RunkinDryingRack, 1], [Mob.RunkinWolfDen, 1], [Mob.RunkinTent, 3]],
    people: [[PeopleUnit.RunkinMale, 3], [PeopleUnit.RunkinFemale, 3], [PeopleUnit.RunkinArcher, 4], [PeopleUnit.RunkinClubber, 2]],
    animals: [[RUNKIN_WOLF, 3]],
    engines: [],
    ringWu: 10 * M,
  },
  {
    structures: [[Mob.ElfHall, 3], [Mob.ElfGate, 1], [Mob.ElfBearPen, 1], [Mob.ElfTreePlatform, 4]],
    people: [[PeopleUnit.ElfVillager, 8], [PeopleUnit.ElfBladewarden, 6], [PeopleUnit.ElfRanger, 6], [PeopleUnit.ElfGrovesinger, 2], [PeopleUnit.ElfBearRider, 3]],
    animals: [[ELF_BEAR, 3]],
    engines: [],
    ringWu: 28 * M,
  },
  {
    structures: [[Mob.ElfCaravanWagon, 1]],
    people: [[PeopleUnit.ElfVillager, 1], [PeopleUnit.ElfBladewarden, 2], [PeopleUnit.ElfRanger, 2]],
    animals: [],
    engines: [],
    ringWu: 5 * M,
  },
  {
    structures: [[Mob.DwarfForge, 1], [Mob.DwarfMineshaft, 1], [Mob.DwarfHouse, 3]],
    people: [[PeopleUnit.DwarfVillager, 4], [PeopleUnit.DwarfShieldbearer, 3], [PeopleUnit.DwarfHammerguard, 2], [PeopleUnit.DwarfCrossbowman, 3]],
    animals: [],
    engines: [],
    ringWu: 14 * M,
  },
  {
    structures: [[Mob.DwarfHall, 1], [Mob.DwarfCityGate, 1], [Mob.DwarfForge, 2], [Mob.DwarfMineshaft, 2], [Mob.DwarfHouse, 6]],
    people: [[PeopleUnit.DwarfVillager, 10], [PeopleUnit.DwarfShieldbearer, 8], [PeopleUnit.DwarfHammerguard, 6], [PeopleUnit.DwarfCrossbowman, 8], [PeopleUnit.DwarfGunner, 6], [PeopleUnit.DwarfCannonCrew, 4]],
    animals: [],
    engines: [[DWARF_CANNON, 2]],
    ringWu: 26 * M,
  },
  {
    structures: [[Mob.RunkinFire, 1], [Mob.RunkinTent, 2]],
    people: [],
    animals: [],
    engines: [],
    ringWu: 7 * M,
  },
];

/** Deeper villages are larger and richer: people and stock by band, percent (s). */
export const BAND_SIZE_PCT: readonly number[] = [100, 100, 125, 150, 175];
export const BAND_STOCK_PCT: readonly number[] = [100, 125, 150, 175, 200];

// ----- where they are -----

/**
 * How often each is found, one cell in so many, by band (s): Runkin most
 * common in the Fringe, uncommon in the Deepwoods, rare in the Heartland;
 * Dwarf colonies in the Barrens; Dwarf cities about 1 in 120 Deadlands
 * cells (doc); mercenary camps 1 in 20 Fringe and Deepwoods cells (Table
 * 11); a wandering Elf caravan in 1 in 6 Fringe and Deepwoods cells until
 * the Elves are met. 0 for never. Halfling villages are placed with the
 * world (world/start.ts, Table 9).
 */
export const ONE_IN: Readonly<Record<'runkin' | 'colony' | 'city' | 'merc' | 'caravan', readonly number[]>> = {
  runkin: [12, 6, 16, 0, 0],
  colony: [0, 0, 0, 6, 0],
  city: [0, 0, 0, 0, 120],
  merc: [0, 20, 20, 0, 0],
  caravan: [0, 6, 6, 0, 0],
};

/** The Elf kingdom's cell: this many rings into the Deepwoods (s), at a seeded place round the ring. */
export const ELF_KINGDOM_RING_INTO_DEEPWOODS = 1;

/** A faction keeps this far from the players' units and buildings when placed, wu (s, as the goblin villages). */
export const KEEP_AWAY_WU = 40 * M;
/** And this far from another faction or goblin village (s). */
export const APART_WU = 60 * M;

// ----- trade (Table 11, Table 19) -----

/** Goods are coded as numbers: a resource id, or LIVE_GOODS + a species (live animals). There are no items (Troops and gear). */
export const LIVE_GOODS = 400;
/** Siege engines and cannons for sale (siege/data.ts Engine), led out beside the buyer's unit: a Dwarf city's cannons. */
export const ENGINE_GOODS = 600;

/** What kind of good it is, for what a people pays (Table 11 "Pays for"). */
export const Cat = {
  Food: 0,
  /** Tools, weapons and munitions ("tools and weapons", "tools, bows, metal weapons"): now carts, engines and gunpowder. */
  Gear: 1,
  /** Armour, helmets, shields and boots: now hardened leather. */
  Armour: 2,
  /** Metal ingots. */
  Ingots: 3,
  Trinkets: 4,
  /** Silver and gold trinkets, the Moonleaf and the Sunheart. */
  PreciousTrinkets: 5,
  /** Softwood and hardwood lumber and planks (Elves are insulted by it). */
  Lumber: 6,
  /** Raw gold and silver. */
  Precious: 7,
  /** Emeralds, rubies, diamonds. */
  Gems: 8,
  Livestock: 9,
  Other: 10,
} as const;
export type Cat = (typeof Cat)[keyof typeof Cat];
export const CAT_COUNT = 11;
export const CAT_NAMES = ['food', 'tools and weapons', 'armour and shields', 'metal ingots', 'trinkets', 'silver and gold trinkets', 'lumber', 'raw gold and silver', 'gems', 'livestock', 'other goods'] as const;

/** A good a people will not take at all (pays 0). */
export const REFUSE = -1;

/**
 * What each people pays, percent of value by category (Table 11, Table 19;
 * "anything else 50%" (s)). Halflings refuse gems (doc); Elves are insulted
 * by lumber (handled as a refusal that closes trade). Patch 5 (Jade, BL-4):
 * "All factions now value gold and silver at least moderately", so the
 * Halflings pay 70% for raw gold and silver and for silver and gold
 * trinkets (they refused the metal and paid 35% for the trinkets) (s: 70%).
 */
export const PAY_PCT: Readonly<Record<People, readonly number[]>> = {
  //                     food gear armour ingots trinkets precious-trinkets lumber precious gems livestock other
  [People.Halfling]: [110, 70, 50, 60, 50, 70, 30, 70, REFUSE, 50, 50],
  [People.Runkin]: [100, 110, 50, 50, 80, 70, 40, 70, 50, 50, 50],
  [People.Elf]: [100, 60, 60, 60, 130, 130, REFUSE, 100, 100, 60, 60],
  [People.Dwarf]: [110, 50, 50, 80, 100, 100, 50, 110, 110, 50, 50],
};

/**
 * What a single good fetches from each people, percent of its worth, in place
 * of its category's: the goods Jade named in Patch 5. Earth: "Nobody accepts
 * dirt as a tradable item" (GP-46, BL-3). Stone: "very low value to sell"
 * (GP-46) (s: 20%; the Dwarves sell it at its full worth, see STOCK). Diamonds:
 * the Dwarves and the Elves buy them high (decisions 2.5) (s: 150%; Halflings
 * still refuse gems). Bluestone "sells well" (decisions 2.5) (s: full worth or
 * more to everyone). Moon Roses are "the best trade good the Elves buy"
 * (decisions 2.5) (s: 250%, more than they pay for anything else). Order:
 * Halflings, Runkin, Elves, Dwarves.
 */
export const GOOD_PAY_PCT: Readonly<Partial<Record<number, readonly [number, number, number, number]>>> = {
  [Res.Earth]: [REFUSE, REFUSE, REFUSE, REFUSE],
  [Res.Stone]: [20, 20, 20, 20],
  [Res.Diamonds]: [REFUSE, 50, 150, 150],
  [Res.Bluestone]: [100, 100, 120, 130],
  [Res.MoonRose]: [50, 50, 250, 50],
};

/**
 * Patch 5 (Jade, GP-46): "You can trade a fixed level of value per settlement
 * per day, with smaller villages/settlements/etc having proportionally less
 * trade availability per day. This trade amount is shared by players same way
 * as physical resources, one player can exhaust it." What each kind of
 * settlement buys in a day, tenths of a vp (s), grown with the band as its
 * people are (BAND_SIZE_PCT; a caravan is the same size everywhere). It
 * replaced Table 11's 300 vp of each kind of good a day.
 */
export const DAILY_TRADE_TENTHS: readonly number[] = [4000, 3000, 12000, 4000, 5000, 15000, 0];
/** Table 11: its stock refills about 20% a day (of what it holds when full). */
export const RESTOCK_PCT = 20;
/** The village answers an offer with 3 bundles (doc). */
export const BUNDLES = 3;
/** Each bundle comes to between 85% and 100% of what the offer is worth to them, when the stock allows (s). */
export const BUNDLE_MIN_PCT = 85;
/** Patch 5 (Jade, GP-46): "you have to be within 10m of any given village building with a unit to trade with them" (measured to the building's edge). Hiring at a mercenary camp too (s). */
export const TRADE_RANGE_WU = 10 * M;
/** Mood (doc, suggested): the same goods offered again after turning down the answer three times in a day closes trade until dawn. */
export const MOOD_DECLINES = 3;
/** An Elf insulted by lumber closes trade to that player for a day (Table 19). */
export const INSULT_STEPS = DAY;

/** A specialisation (Table 11): a Halfling village leans to crops, livestock, fishing or weaving; Runkin to fish, hides or herbs; a Dwarf colony to one metal or gem; an Elf caravan to one weapon (s). */
export interface Lean {
  name: string;
  /** Goods it sells at LEAN_SELL_PCT, and holds twice as many of. */
  sells: readonly number[];
  /** Goods it lacks and pays LEAN_PAY_PCT for. */
  lacks: readonly number[];
}
/** Table 11 (s): the lean good sells at 80% and what it lacks pays 130%. */
export const LEAN_SELL_PCT = 80;
export const LEAN_PAY_PCT = 130;

/** Farm goods (Patch 2: farm fare, in place of wheat, potatoes, carrots and corn). */
const CROPS = [Res.FarmFare];
const live = (s: Species): number => LIVE_GOODS + s;
const engine = (k: number): number => ENGINE_GOODS + k;

export const LEANS: Readonly<Record<People, readonly Lean[]>> = {
  [People.Halfling]: [
    { name: 'crops', sells: CROPS, lacks: [...MEATS, ...FISHES] },
    { name: 'livestock', sells: [Res.Beef, Res.Chicken, Res.Eggs, live(Species.Chicken), live(Species.Cattle), live(Species.Ox)], lacks: CROPS },
    { name: 'fishing', sells: [Res.Trout, Res.Salmon], lacks: [Res.Flax, Res.Leather] },
    { name: 'weaving', sells: [Res.Flax, Res.Rope], lacks: [...FISHES, ...MEATS] },
  ],
  [People.Runkin]: [
    { name: 'fish', sells: [Res.Trout, Res.Salmon], lacks: [Res.Herbs] },
    { name: 'hides', sells: [Res.Hides], lacks: [...FISHES] },
    { name: 'herbs', sells: [Res.Herbs], lacks: [...MEATS] },
  ],
  // The Elf caravans' one weapon becomes what it was made of (Troops and gear: weapons in trade become their materials) (s).
  [People.Elf]: [
    { name: 'carbon steel', sells: [Res.CarbonSteel], lacks: [] },
    { name: 'steel', sells: [Res.SteelIngot], lacks: [] },
    { name: 'hardened leather', sells: [Res.HardenedLeather], lacks: [] },
  ],
  [People.Dwarf]: [
    { name: 'bronze', sells: [Res.BronzeIngot], lacks: [] },
    { name: 'iron', sells: [Res.IronIngot], lacks: [] },
    { name: 'wrought iron', sells: [Res.WroughtIron], lacks: [] },
    { name: 'steel', sells: [Res.SteelIngot], lacks: [] },
    { name: 'emeralds', sells: [Res.Emeralds], lacks: [] },
    { name: 'rubies', sells: [Res.Rubies], lacks: [] },
    { name: 'diamonds', sells: [Res.Diamonds], lacks: [] },
  ],
};

/** A row of what a faction sells: the good, how many it holds when full, and its price as a share of value (or a fixed price in tenths). */
export interface StockRow {
  good: number;
  count: number;
  /** Sells at this percent of value (Table 19: Elf food 120%, Dwarf colony steel 1.5 x, Dwarf city 3 x make cost = 1.5 x value). */
  pct: number;
  /** A set price in tenths, where the table names one (the Elves' weapons, the Halflings' live animals and gear). */
  price?: number;
  /** Refills to full every dawn: the tables' "at most N a day" rows. */
  daily?: boolean;
}

const row = (good: number, count: number, pct = 100, extra: Partial<StockRow> = {}): StockRow => ({ good, count, pct, ...extra });

/**
 * Table 11 and Table 19: what each kind sells and how many it holds when
 * full (counts (s)), before the band's richness. The Dwarf city sells its
 * cannons and gunpowder at Table 19's prices (Patch 2 cut cannonballs: no
 * attack uses ammunition, and a bought cannon comes with its crew). Weapons, armour
 * and shields that were sold as items are now the ingots and materials that
 * made them, at the same value (Troops and gear) (s).
 */
export const STOCK: readonly (readonly StockRow[])[] = [
  // Halfling village: farm goods, live animals, the leather and feathers of their gear, and wrought iron (Table 11).
  [
    // Patch 2: farm fare in place of the 110 crops and 10 bread (s, Jade's rebalance).
    row(Res.FarmFare, 100), row(Res.Eggs, 20), row(Res.Beef, 10), row(Res.Chicken, 5),
    row(live(Species.Chicken), 4, 100, { price: 80 }), row(live(Species.Cattle), 2, 100, { price: 400 }), row(live(Species.Ox), 1, 100, { price: 600 }),
    row(Res.Leather, 6), row(Res.Feathers, 20),
    row(Res.WroughtIron, 10),
  ],
  // Runkin camp: the catch, sticks, flint and herbs (Table 11).
  [row(Res.Trout, 10), row(Res.Salmon, 10), row(Res.Venison, 15), row(Res.Hides, 10), row(Res.Sticks, 40), row(Res.Flint, 20), row(Res.Herbs, 15), row(Res.Bone, 15), row(Res.Feathers, 30)],
  // Elf kingdom: food at 120%, and the carbon steel of 3 weapons a day at 4 x its value (Table 19). Patch 2: farm fare, venison and
  // trout in place of bread, roast meat, smoked fish and wheat, about the same worth (s, Jade's rebalance).
  [
    row(Res.FarmFare, 80, 120), row(Res.Venison, 20, 120), row(Res.Trout, 20, 120), row(Res.Flax, 20, 120), row(Res.Herbs, 15, 120),
    row(Res.Bandage, 10, 120), row(Res.Remedy, 4, 120),
    row(Res.CarbonSteel, 9, 400, { daily: true }),
  ],
  // Elf caravan: one weapon's materials (its lean) and about 200 vp of food a visit (Table 19).
  [
    row(Res.FarmFare, 50, 120), row(Res.Venison, 10, 120), row(Res.Trout, 10, 120), row(Res.Flax, 6, 120), row(Res.Herbs, 6, 120), row(Res.Bandage, 3, 120), row(Res.Remedy, 1, 120),
  ],
  // Dwarf colony: a little good steel (at most 5 a day at 1.5 x), lower metals, the iron of its weapons and shields at 1.5 x, gems (Table 19).
  [
    row(Res.SteelIngot, 5, 150, { daily: true }), row(Res.BronzeIngot, 26), row(Res.WroughtIron, 35), row(Res.IronIngot, 6, 150),
    row(Res.Emeralds, 3), row(Res.Rubies, 2), row(Res.Diamonds, 1),
    // Patch 5 (Jade, GP-46): stone is "very low value to sell but not always to buy": the Dwarves sell it at its full worth (s).
    row(Res.Stone, 40),
  ],
  // Dwarf city: the steel and hardened leather of its armour and weapons at about 3 x make cost (1.5 x value), gold, gems, and 2 carbon steel ingots a day (Table 19).
  [
    row(Res.SteelIngot, 12, 150), row(Res.HardenedLeather, 6, 150),
    row(Res.Gold, 10), row(Res.Emeralds, 5), row(Res.Rubies, 4), row(Res.Diamonds, 2), row(Res.CarbonSteel, 2, 150, { daily: true }),
    // Table 19's guns: 1 cannon a day, bronze or iron, whichever is bought first (trade.ts); 3 muskets' carbon steel a day, with powder (s: counts).
    row(engine(Engine.BronzeCannon), 1, 100, { price: 4200, daily: true }), row(engine(Engine.IronCannon), 1, 100, { price: 3840, daily: true }),
    row(Res.Gunpowder, 20, 100, { price: 480 }),
    row(Res.Stone, 80),
  ],
  // Mercenary camp: hires only.
  [],
];

/** The Elf caravan's one weapon's materials, by its lean (carbon steel, steel, hardened leather), at the kingdom's 4 x. */
export const CARAVAN_GOODS: readonly StockRow[] = [
  row(Res.CarbonSteel, 3, 400), row(Res.SteelIngot, 3, 400), row(Res.HardenedLeather, 4, 400),
];

/** The worth of each resource, tenths of a vp (Table 11). Any other food is 0.75 x its nutrition. */
export const RES_VALUE_TENTHS: Readonly<Partial<Record<number, number>>> = {
  [Res.SoftwoodLumber]: 10, [Res.HardwoodLumber]: 20, [Res.Sticks]: 5, [Res.Planks]: 15, [Res.Stone]: 10, [Res.Flint]: 10, [Res.Clay]: 10, [Res.Sand]: 10,
  [Res.Earth]: 2, [Res.Bricks]: 10, [Res.Glass]: 30, [Res.Resin]: 10, [Res.Bone]: 10,
  [Res.Coal]: 20, [Res.Charcoal]: 15, [Res.CopperOre]: 20, [Res.TinOre]: 30, [Res.BogIron]: 20, [Res.IronRock]: 20, [Res.VeinIron]: 40, [Res.LeadOre]: 30,
  [Res.Saltpetre]: 40, [Res.Sulphur]: 60, [Res.Marble]: 60,
  // Every meat is worth 3 vp and every fish 2, as the one meat and fish were (patch 1 food kinds, s).
  [Res.Venison]: 30, [Res.BoarMeat]: 30, [Res.HareMeat]: 30, [Res.GooseMeat]: 30, [Res.PheasantMeat]: 30, [Res.Beef]: 30, [Res.Chicken]: 30,
  [Res.HorseMeat]: 30, [Res.WolfMeat]: 30, [Res.LynxMeat]: 30, [Res.BadgerMeat]: 30, [Res.BearMeat]: 30, [Res.FrogLegs]: 30, [Res.CrabMeat]: 30,
  [Res.CrocodileMeat]: 30, [Res.GriffinMeat]: 30, [Res.MinotaurMeat]: 30, [Res.RatMeat]: 30,
  [Res.Trout]: 20, [Res.Salmon]: 20, [Res.Catfish]: 20,
  // Farm fare as wheat and corn were (Patch 2, s, Jade's rebalance).
  [Res.Eggs]: 10, [Res.FarmFare]: 15, [Res.Flax]: 10, [Res.Herbs]: 20,
  [Res.Hides]: 30, [Res.Leather]: 40, [Res.Feathers]: 5, [Res.Bandage]: 50, [Res.Remedy]: 150,
  [Res.CopperIngot]: 50, [Res.TinIngot]: 70, [Res.BronzeIngot]: 60, [Res.WroughtIron]: 90, [Res.PigIron]: 110, [Res.IronIngot]: 240,
  [Res.SteelIngot]: 300, [Res.CarbonSteel]: 600, [Res.Gunpowder]: 16,
  [Res.Gold]: 400, [Res.Silver]: 150, [Res.Emeralds]: 500, [Res.Rubies]: 600, [Res.Diamonds]: 1000, [Res.ManaCrystal]: 300, [Res.DemonHorn]: 200,
  [Res.Hexstone]: 100, [Res.Venom]: 50, [Res.SpiderSilk]: 30,
  // Not in Table 11 (s): rope as two flax; hardened leather and carts as twice their inputs.
  [Res.HardenedLeather]: 160, [Res.HandCart]: 340, [Res.OxCart]: 1360, [Res.Rope]: 20,
  [Res.Moonleaf]: 7250, [Res.Sunheart]: 12000,
  // Patch 5's Stone Circle goods (s): bluestone stands in for marble and "sells well", at twice marble's worth; a Moon Rose 30 vp.
  [Res.Bluestone]: 120, [Res.MoonRose]: 300,
};

/** A food not in RES_VALUE_TENTHS is worth 0.75 x its nutrition (Table 11's cooked foods, which Patch 2 cut): hundredths of a vp per point of nutrition. */
export const COOKED_HUNDREDTHS_PER_NUTRITION = 75;

/** A trinket's metal, by TRINKET_METALS order: copper 5, tin 7, bronze 6, iron 9, steel 30, silver 15, gold 40 vp (Table 11). */
export const TRINKET_METAL_TENTHS: readonly number[] = [50, 70, 60, 90, 300, 150, 400];

/** Live animals' worth, tenths (Table 11: live hen 8, cow 40, ox 60; the rest (s)). */
export const LIVE_VALUE_TENTHS: Readonly<Partial<Record<number, number>>> = {
  [Species.Chicken]: 80, [Species.Cattle]: 400, [Species.Ox]: 600, [Species.Horse]: 500,
};

/** Trinkets are made for trade (Trinkets): is this resource one, and is it silver or gold or one of the special pair? */
export function trinketMetal(res: number): number {
  if (res < TRINKET_BASE || res >= TRINKET_BASE + TRINKET_METALS.length * 4) return -1;
  return floorDiv(res - TRINKET_BASE, 4);
}

export function trinketTier(res: number): number {
  return ((res - TRINKET_BASE) % 4) + 1;
}

/** A metal trinket's worth, tenths: metal x ingots x the tier's multiplier (Table 11: copper Token 12, gold Heirloom 960). */
export function trinketValueTenths(res: number): number {
  const m = trinketMetal(res);
  const t = trinketTier(res);
  const mult = TRINKET_MULTIPLIER_TENTHS[t - 1]!;
  return floorDiv(TRINKET_METAL_TENTHS[m]! * TRINKET_INGOTS[t - 1]! * mult, 10);
}

/** The special pair's multiplier, for the balance editor's note. */
export const SPECIAL_TRINKET_MULT_TENTHS = SPECIAL_TRINKET_MULTIPLIER_TENTHS;

// ----- war -----

/** Halflings and Runkin offer to surrender once more than half of them have died (doc); Dwarves migrate at half (doc). */
export const SURRENDER_DEAD_PCT = 50;
/** Plunder (Table 11): livestock, the metal of the fighters' weapons and 10 vp of loot per villager in food and metal. */
export const PLUNDER_TENTHS_PER_PERSON = 100;
/** The loot's food and metal by people (s). */
export const PLUNDER_GOODS: Readonly<Record<People, readonly [Res, Res]>> = {
  [People.Halfling]: [Res.FarmFare, Res.WroughtIron],
  [People.Runkin]: [Res.Venison, Res.Flint],
  [People.Elf]: [Res.FarmFare, Res.SteelIngot],
  [People.Dwarf]: [Res.FarmFare, Res.WroughtIron],
};
/** Table 19: reparations are 2000 vp plus 100 per Dwarf killed, paid in gold, silver, gems, trinkets or food. */
export const REPARATIONS_TENTHS = 20000;
export const REPARATIONS_PER_KILL_TENTHS = 1000;
/** Table 19: a migrated Dwarf group rebuilds for 10 days, then raids with a band of 6 every 3 days until paid. */
export const DWARF_REBUILD_STEPS = 10 * DAY;
export const DWARF_RAID_EVERY_STEPS = 3 * DAY;
/** Elves never surrender; at war they send a war band of 6 every 2 days (s) until one side is gone. */
export const ELF_RAID_EVERY_STEPS = 2 * DAY;
export const RAID_BAND = 6;
/** Raiders come in this far from the building they march on, wu (s). */
export const RAID_FROM_WU = 70 * M;
/** At war a village's fighters go for the enemy's units within this distance of its middle, and chase them this far (s). */
export const DEFEND_WU = 40 * M;
export const CHASE_WU = 60 * M;
/** Leaving people vanish once this far from home, or after this long (s). */
export const LEAVE_WU = 60 * M;
export const LEAVE_STEPS = 60 * SEC;
/** Runkin look this many cells away for a new camp before running off the map (s). */
export const RECAMP_SEARCH_CELLS = 200;

/** Tree warnings (Elves): an Elf within 30 m who sees a player's unit cut a Deepwoods tree warns it, at most once per 20 s; the third warning is war (doc: three) (s). */
export const TREE_WARN_WU = 30 * M;
export const TREE_WARN_GAP_STEPS = 20 * SEC;
export const TREE_WARNINGS = 3;

/** Elf caravans (Table 19): every 5 days once a player has met the Elves, one stops outside their main base, trades, and leaves at dusk (doc, suggested). */
export const CARAVAN_EVERY_STEPS = 5 * DAY;
/** It comes in from this far out and stops this far from the main base (s). */
export const CARAVAN_FROM_WU = 60 * M;
export const CARAVAN_STOP_WU = 14 * M;
/** A wandering caravan met before the Elves leaves at the second dusk after it was found (s). */
export const WANDER_DUSKS = 2;

/**
 * Mercenaries (Table 11): a camp hires out 2 to 6, and gains one back every 2
 * days (s). Patch 5 (Jade, BL-4): "Mercenaries hired are now permanently
 * yours. Mercenaries can be hired for gold as well, with 1 gold being worth 7
 * silver." A hire for good costs (s) 7 silver (or 1 gold) a head at a Fringe
 * camp and 14 silver (or 2 gold) at a Deepwoods camp, where the fighters are
 * Elves and Dwarves; it was 2 silver for one day. A hired mercenary takes 1
 * supply like any troop (s).
 */
export const HIRE_SILVER: Readonly<Partial<Record<Band, number>>> = { [Band.Fringe]: 7, [Band.Deepwoods]: 14 };
export const SILVER_PER_GOLD = 7;
export const MERC_MIN = 2;
export const MERC_MAX = 6;
export const MERC_REFILL_STEPS = 2 * DAY;
/** Fringe camps hire out Runkin archers and Halfling spearmen, Deepwoods camps Elf Bladewardens and Dwarf crossbowmen (Table 11, s); the captain stays at the fire. */
export const MERC_UNITS: Readonly<Partial<Record<Band, readonly [PeopleUnit, PeopleUnit, PeopleUnit]>>> = {
  [Band.Fringe]: [PeopleUnit.RunkinArcher, PeopleUnit.HalflingSpearman, PeopleUnit.RunkinMale],
  [Band.Deepwoods]: [PeopleUnit.ElfBladewarden, PeopleUnit.DwarfCrossbowman, PeopleUnit.DwarfVillager],
};

// ----- daily life (s) -----

/** Each unit thinks every 10 steps (Technical decisions 13), staggered by id. */
export const THINK_STEPS = 10;
/** Out of a fight for 10 s, the peoples heal 1 health every 2 s (s). */
export const HEAL_EVERY_STEPS = 2 * SEC;
export const HEAL_AFTER_STEPS = 10 * SEC;
/** At peace, a faction gains back one lost person every 3 days up to its size (s). */
export const REGROW_STEPS = 3 * DAY;
/** Villagers wander this far from home (s). */
export const WANDER_WU = 10 * M;

// ----- speech -----

/** Their important speech reaches a player's message panel when one of the player's units is this near (Unit speech: as if the camera were centred on it) (s). */
export const SPEECH_NEAR_WU = 30 * M;

/** What each people says (the doc's lines under each race; lines marked (s) are mine). */
export interface Lines {
  greet: string;
  trade: string;
  attacked: string;
  surrender: string;
  refuse: string;
  lumber: string;
  close: string;
  nothing: string;
  leave: string;
  /** Patch 5: earth offered ("Nobody accepts dirt"), the day's trade used up, and an offer cut down to what is left of it (s). */
  dirt: string;
  full: string;
  trimmed: string;
}

export const LINES: Readonly<Record<People, Lines>> = {
  [People.Halfling]: {
    greet: 'Oh! Visitors! Mind the cabbages.',
    trade: 'Ooh, shiny. Not much use for it, but shiny.',
    attacked: 'Ruffians! Ring the bell!',
    surrender: 'Enough! Take the beasts, take what you like, just let us go.',
    refuse: 'Gems? Shiny stones never filled a pantry.',
    lumber: 'Wood? We have trees of our own, thank you.',
    close: 'Enough haggling for one day. Come back in the morning.',
    nothing: 'We have nothing worth that, I am afraid.',
    leave: 'Come on, all of you. We are leaving.',
    dirt: 'Dirt? We have a whole field of it, thank you.',
    full: 'That is all the trading we can manage today. Come back in the morning.',
    trimmed: 'We can only manage this much more today. The rest you can keep.',
  },
  [People.Runkin]: {
    greet: 'Hunters? Good. Take only what you need.',
    trade: 'A good blade. Our wolves will eat well.',
    attacked: 'Wolves! Bows!',
    surrender: 'We yield. Take the wolves\' share and let us walk.',
    refuse: 'No use to us.',
    lumber: 'Wood is everywhere. Bring us something rarer.',
    close: 'You go round and round like a dog at its tail. Tomorrow.',
    nothing: 'The camp has nothing that big to give.',
    leave: 'Pack the hides. We find new ground.',
    dirt: 'Dirt is under every foot. Bring us something we cannot dig.',
    full: 'The camp has traded enough for one day. Tomorrow.',
    trimmed: 'Only this much more today. Keep the rest.',
  },
  [People.Elf]: {
    greet: 'You walk under old trees, stranger. Walk gently.',
    trade: 'A fine piece. The smith had patience.',
    attacked: 'Then the forest will have you.',
    surrender: '',
    refuse: 'We do not deal in that.',
    lumber: 'You bring us the bones of our forest?',
    close: 'We have said what we will say today.',
    nothing: 'Nothing we carry is worth so much.',
    leave: 'The road calls. Farewell.',
    dirt: 'The earth is not ours to buy, nor yours to sell.',
    full: 'We have traded all we will today.',
    trimmed: 'This much, and no more today.',
  },
  [People.Dwarf]: {
    greet: 'Surface folk. Mind where you step, it\'s all ours below.',
    trade: 'Fair metal, fair price. Well. Our price.',
    attacked: 'This isn\'t over. We remember every grudge.',
    surrender: '',
    refuse: 'Not that.',
    lumber: 'Wood? Fine, fine. Not worth much down here.',
    close: 'Haggle all you like tomorrow. We\'re done today.',
    nothing: 'Nothing in the vaults matches that.',
    leave: 'This isn\'t over. We remember every grudge.',
    dirt: 'We dig that out to throw it away.',
    full: 'Vaults are shut for the day. Come back tomorrow.',
    trimmed: 'We\'ll take this much today. Not a nugget more.',
  },
};

/** Elf tree warnings, in order (doc). */
export const TREE_WARNING_LINES = ['Put down the axe.', 'The forest remembers. Stop.', 'Last warning, axe-bearer.'] as const;
/** Dwarf lines on paid reparations (doc), and after a first trade (s, with the direction filled in). */
export const REPARATIONS_PAID_LINE = 'Paid in full. We\'ll forget. Mostly.';
export const MERC_LINES = { greet: 'Swords for hire. Pay once and we march with you for good.', hired: 'Paid in full. We march with you from now on. Lead on.', home: 'Sun\'s down. Come back in the light.', none: 'Nobody here for hire today.' } as const;

/**
 * Random remarks (Unit speech: speech bubbles only, never in the message
 * panel): by people for their units, and by kind for the players' own (s).
 */
export const REMARKS: Readonly<Record<string, readonly string[]>> = {
  halfling: ['Second breakfast soon.', 'The barley looks well this year.', 'Mind the hens!', 'Lovely weather for it.'],
  runkin: ['Fresh tracks by the stream.', 'The wolves are restless.', 'Good wind for hunting.', 'Smoke the fish before the rain.'],
  elf: ['The trees are old here.', 'Listen. The wood is speaking.', 'Patience grows the best timber.', 'Starlight soon.'],
  dwarf: ['Good stone under here.', 'Needs more iron.', 'Mind the shaft.', 'Back to the forge.'],
  worker: ['Back to work.', 'This load is heavier than it looks.', 'Nice day for it.', 'Need a sharper axe.'],
  warrior: ['All quiet.', 'Ready when you are.', 'Keep your eyes on the dark.', 'I could use a better blade.'],
  mage: ['The air hums today.', 'Mana is gathering.', 'Stay close, I will keep you whole.'],
};

/** Syllables for faction names (s): each faction is named from its seed. */
export const NAME_PARTS: Readonly<Record<People, readonly [readonly string[], readonly string[]]>> = {
  [People.Halfling]: [['Bramble', 'Thistle', 'Clover', 'Honey', 'Barley', 'Mossy', 'Apple', 'Butter'], ['bottom', 'dell', 'wick', 'hollow', 'burrow', 'combe', 'green', 'brook']],
  [People.Runkin]: [['Ash', 'Fern', 'Otter', 'Raven', 'Elk', 'Flint', 'Reed', 'Lynx'], ['water', 'ford', 'track', 'run', 'hide', 'stone', 'smoke', 'fall']],
  [People.Elf]: [['Sylva', 'Aelin', 'Thali', 'Lirae', 'Vena', 'Ithil', 'Mira', 'Caer'], ['reth', 'dor', 'wen', 'ost', 'lae', 'mir', 'thas', 'iel']],
  [People.Dwarf]: [['Khaz', 'Dur', 'Grim', 'Bar', 'Thor', 'Kar', 'Brun', 'Dvar'], ['dum', 'hold', 'grund', 'heim', 'deep', 'forge', 'gard', 'mar']],
};
/** The one Elf kingdom's name (doc, suggested). */
export const ELF_KINGDOM_NAME = 'Sylvareth';

/** A faction's name from its people and a hash (the kingdom is always Sylvareth). */
export function factionName(kind: number, h: number): string {
  if (kind === FactionKind.ElfKingdom || kind === FactionKind.ElfCaravan) return ELF_KINGDOM_NAME;
  const people = kind === FactionKind.MercCamp ? People.Runkin : KIND_PEOPLE[kind]!;
  const [a, b] = NAME_PARTS[people];
  const name = a[h % a.length]! + b[(h >>> 8) % b.length]!;
  return kind === FactionKind.MercCamp ? `${name} sellswords` : name;
}

/** What the leader is called, by kind (s). */
export const LEADER_NAMES = ['Village elder', 'Camp elder', 'Elf steward', 'Caravan master', 'Colony foreman', 'City thane', 'Captain'] as const;

