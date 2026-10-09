// Troops and gear (Troops and gear, agreed 2026-10-03; Tables 2c, 2d, 2e,
// 3, 7 and 13). A troop is one of five types for good, with a weapon tier
// and an armour tier, and close melee a shield tier (Patch 5, GP-26); a
// worker has one tool kit tier; a mage a wand tier and a robe tier. Each
// tier's piece of kit has its stats, its cost (the old item recipes carried
// across, summed, no tuning), its time to make and what it needs. A unit pays
// a kit when it is trained and a piece again when it is upgraded.
//
// Patch 5 (Jade, GP-1 and GP-3): every piece is an item again, a good of its
// own (economy/resources.ts). Nothing makes one: they come from monster
// waves, rewards and the old piece a unit takes off when it upgrades. A
// ready item in stock goes on in place of making that piece, first, and in
// a fifth of the time; Upgrade equipment takes a better one from stock at no
// cost; and the piece taken off goes to stock, not back to its materials.
//
// The kit tables are plain rows the balance editor reads. From them this
// module builds the gear catalogue: one row per thing a unit can hold or
// wear, with its combat stats in sim units, so a unit's slots (weapon,
// ranged, shield, armour, a tool per job) hold gear ids as before. The
// peoples' own gear (Table 11, Table 19) sits at the front of the catalogue.
// Every row names the model it is drawn with (Jade: no invisible gear).

import { costText, Res, RESOURCES, type Cost } from '../economy/resources.ts';
import { kindsOf } from '../economy/food-kinds.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { hasResearch, Hit, Research, Shot, type MeleeStats, type RangedStats } from '../combat/items.ts';
import { Tool, ToolJob, TOOL_JOBS } from '../world/props.ts';
import { FORGE_STEP_BASE } from '../buildings/data.ts';
import type { EntityStore } from '../state.ts';

/**
 * The five troop types (Jade), fixed when a troop is trained; workers and
 * mages have none. Patch 2 adds the artillery crewman (Jade), trained at the
 * Artillery workshop: the only unit that crews an engine, bare-handed like a
 * tier 0 close melee, with no kit to upgrade (siege/data.ts CREWMAN).
 * Patch 5 adds the Dreadnought (Jade, GP-21), hired at the Tavern: he comes
 * with the mace and plate of his model and never changes them
 * (DREADNOUGHT_KIT; units/dreadnought.ts); and the woodsman (Jade's WD-1 to
 * WD-7), trained at the Scholar's Lodge: a forager and fisher who carries a
 * long weapon of any tier and no armour (units/woodsman.ts).
 */
export const Troop = { None: 0, Close: 1, Long: 2, Ranger: 3, Brawler: 4, Cavalry: 5, Crew: 6, Dreadnought: 7, Woodsman: 8 } as const;
export type Troop = (typeof Troop)[keyof typeof Troop];
/** The troop types a Barracks trains (the crewman is the Artillery workshop's). */
export const TROOP_TYPES: readonly Troop[] = [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler, Troop.Cavalry];
/**
 * The troop types' names where no weapon tier is known; a troop goes by its
 * weapon tier's name (TROOP_TIER_NAMES). Jade's Patch 5 (UI-11): "close
 * melee" and "long melee" are our words, never shown to the player, so the
 * two melee lines go by their best-known names here.
 */
export const TROOP_NAMES: readonly string[] = ['Warrior', 'Swordsman', 'Spearman', 'Ranger', 'Brawler', 'Cavalry', 'Artillery crewman', 'Dreadnought', 'Woodsman'];
/**
 * A troop's name by its weapon tier, [type][tier] (Patch 2, Jade): '' where a
 * type has no such tier. The brawler keeps its type name (Jade).
 */
export const TROOP_TIER_NAMES: readonly (readonly string[])[] = [
  [],
  ['Fist fighter', 'Club fighter', 'Flint axeman', 'Copper swordsman', 'Bronze swordsman', 'Iron swordsman', 'Broadswordsman', 'Steel swordsman', 'Champion'],
  ['', 'Spearman', 'Flint spearman', 'Copper spearman', 'Bronze spearman', 'Iron spearman', 'Pikeman', 'Halberdier', 'Greatswordsman'],
  ['', 'Slinger', 'Yew archer', 'Copper archer', 'Bronze archer', 'Iron archer', 'Marksman', 'Crossbowman', 'Musketeer'],
  [],
  ['', 'Lancer', 'Flint lancer', 'Copper lancer', 'Bronze lancer', 'Iron lancer', 'Pike rider', 'Halberd rider', 'Greatsword rider'],
  [],
  // The Dreadnought and the woodsman keep their names whatever they carry (s).
  [],
  [],
];

/** A troop's name: its weapon tier's ("Copper swordsman"), else its type's ("Brawler"). */
export function troopTierName(troop: number, weaponTier: number): string {
  return TROOP_TIER_NAMES[troop]?.[weaponTier] || (TROOP_NAMES[troop] ?? 'Warrior');
}

/** A troop's name in a sentence, with its article: "a club fighter", "an iron archer"; "A", "An" to start one. */
export function aTroop(troop: number, weaponTier: number, start = false): string {
  const name = troopTierName(troop, weaponTier).toLowerCase();
  const a = /^[aeiou]/.test(name) ? 'an' : 'a';
  return `${start ? a.charAt(0).toUpperCase() + a.slice(1) : a} ${name}`;
}
/** Command card letters (s): A Close melee, Q Long melee, N Ranger, B Brawler and C Cavalry at the Barracks (Patch 2: the Stables are gone) (L is Follow, G a building's upgrade). */
export const TROOP_KEYS: readonly string[] = ['', 'A', 'Q', 'N', 'B', 'C', '', ''];

/**
 * Which line of kit an upgrade raises: a troop's weapon or armour, a worker's
 * tools, a mage's wand or robe; close melee's shield (Patch 5, GP-26); a bow
 * or crossbow ranger's poison tips (Patch 5, tier 1 only).
 */
export const Line = { Weapon: 0, Armour: 1, Shield: 2, Tips: 3 } as const;
export type Line = (typeof Line)[keyof typeof Line];
/** Every line, in the order Upgrade equipment pays for them (Jade: the shield is the lowest priority). */
export const KIT_LINES: readonly Line[] = [Line.Weapon, Line.Armour, Line.Shield, Line.Tips];

/** What a material tier needs before anything of it is made (Troops and gear: Tiers, "Needs" (s)): a Forge metal step (buildings/data.ts forgeStep) and research. */
export interface TierNeed {
  tier: number;
  name: string;
  forge: number;
  research: readonly Research[];
}

export const TIER_NEEDS: readonly TierNeed[] = [
  { tier: 0, name: 'fists', forge: 0, research: [] },
  { tier: 1, name: 'wood and leather', forge: 0, research: [] },
  { tier: 2, name: 'flint, stone and hardened leather', forge: 0, research: [] },
  { tier: 3, name: 'copper', forge: 1, research: [] },
  { tier: 4, name: 'bronze', forge: 1, research: [Research.Bronze] },
  { tier: 5, name: 'wrought iron', forge: 2, research: [] },
  { tier: 6, name: 'iron', forge: 3, research: [] },
  { tier: 7, name: 'steel', forge: 4, research: [Research.Steel] },
  { tier: 8, name: 'carbon steel', forge: 4, research: [Research.CarbonSteel] },
];

/** The top troop tier (carbon steel). */
export const TOP_TIER = 8;

/** One piece of kit at one tier: a weapon, an armour, a shield, a tool kit, a wand, a robe or poison tips. */
export interface Piece {
  tier: number;
  /** Its item's name (economy/resources.ts), or the tier's ("Fists") where there is no piece. */
  name: string;
  /**
   * The catalogue model it shows as on the unit, `<id>@<metal>` for a metal
   * tier's texture (sword@iron_wrought), and the pieces worn together joined
   * by `+` (an armour tier's body, helmet and boots). Every piece is drawn
   * (Patch 5: no invisible gear).
   */
  model: string;
  /**
   * The items that go on as this piece (Patch 5, GP-1): its own first, then
   * any that stand in for it (the satyrs' obsidian hand-axe for the bronze
   * shortsword); none for a tier with nothing in it.
   */
  items: readonly Res[];
  /** Ways to pay, the first the pool covers is used ("1 leather or 1 flax"). */
  cost: readonly Cost[];
  /** Time to make, seconds. */
  timeS: number;
  /** The material tier whose forge and research it needs (TIER_NEEDS). */
  need: number;
  /** Research beyond the material tier's (the crossbow's Crossbows; the musket's Gunpowder and Muskets). */
  research?: readonly Research[];
  /** Patch 7 (plan 2.1): Heft, for weapons, wands and shields: how much there is to swing or hold, its size and weight together. Set by hand, never worked out. */
  heft?: number;
}

/** A melee weapon (Table 2d): damage, swing time in tenths of a second, reach in centimetres. */
export interface MeleeKit extends Piece {
  damage: number;
  swingDs: number;
  reachCm: number;
  hit: Hit;
  blunt: boolean;
}

/** A ranged weapon (Table 2e): damage, attack time in tenths of a second, range in metres, spread as a percentage of the range. */
export interface RangedKit extends Piece {
  damage: number;
  attackDs: number;
  rangeM: number;
  spreadPct: number;
  shot: Shot;
  blunt: boolean;
}

/** A tier of armour (Table 3): body, helmet and boots in one. */
export interface ArmourKit extends Piece {
  protectionPct: number;
  /** Patch 7 (plan 2.1): the Stature it was made for, a person's 17 (Jade: tiers 1 to 7 are too small for the Dreadnought). */
  stature: number;
}

/** A close-melee shield (Table 3; its own slot from Patch 5, GP-26): projectile block. */
export interface ShieldKit extends Piece {
  blockPct: number;
}

/** A worker's tool kit (Table 2c): the tool tier it gives each job (chop, break, build, cut), a worker's damage with it, and each job's look. */
export interface ToolKit extends Piece {
  tools: readonly number[];
  names: readonly string[];
  models: readonly string[];
  damage: number;
}

/** A mage's wand (Table 13): spell power (a percentage) and extra mana. */
export interface WandKit extends Piece {
  powerPct: number;
  mana: number;
}

/** A mage's robe (Table 13): protection and extra mana regain (percentages). */
export interface RobeKit extends Piece {
  protectionPct: number;
  regainPct: number;
}

const ST = Res.Sticks;
const FL = Res.Flint;
const STONE = Res.Stone;
/** Lumber of either kind (Patch 5, Jade: "Make all things that require lumber or sticks able to use either type of lumber"). */
const LU = Res.AnyLumber;
const HW = Res.HardwoodLumber;
const SW = Res.SoftwoodLumber;
const PL = Res.Planks;
const LE = Res.Leather;
const HL = Res.HardenedLeather;
const FX = Res.Flax;
const FE = Res.Feathers;
const ROPE = Res.Rope;
const CU = Res.CopperIngot;
const BZ = Res.BronzeIngot;
const WI = Res.WroughtIron;
const IRON = Res.IronIngot;
const STEEL = Res.SteelIngot;
const CS = Res.CarbonSteel;
const GP = Res.Gunpowder;
const MC = Res.ManaCrystal;
const LEAD = Res.LeadOre;

/** The item a row is, the items that go on as it (its own first), or the name of a tier with nothing in it ("Fists"). */
type What = Res | readonly Res[] | string;

/** A row's name and items: the name of its (first) item, or the name given. */
function named(what: What): { name: string; items: readonly Res[] } {
  if (typeof what === 'string') return { name: what, items: [] };
  const items: readonly Res[] = typeof what === 'number' ? [what] : what;
  return { name: RESOURCES[items[0]!]!.name, items };
}

/** Every way of paying `base` plus one resource from each choice ("1 sinew or flax"). */
function ways(base: Cost, ...choices: ReadonlyArray<ReadonlyArray<readonly [Res, number]>>): Cost[] {
  let out: Cost[] = [base];
  for (const c of choices) out = out.flatMap((w) => c.map((x): Cost => [...w, x]));
  return out;
}

/** A cost with no alternatives. */
const only = (c: Cost): Cost[] => [c];

// ----- Table 2d: melee -----

const close = (tier: number, what: What, model: string, damage: number, swingDs: number, reachCm: number, hit: Hit, blunt: boolean, cost: Cost[], timeS: number, heft = 0): MeleeKit => ({
  tier, ...named(what), model, damage, swingDs, reachCm, hit, blunt, cost, timeS, need: tier, ...(heft ? { heft } : {}),
});

/*
 * Times to make (Patch 5, Jade's BL-11): the higher tiers' weapons, armour
 * and shields are made faster, so the gap between low and high tier units
 * is smaller. Tier 1 keeps its time, and each tier above takes up to 15% off
 * in even steps (2.1% a tier, 15% at tier 8), rounded to the second and
 * never below the tier under it; a unit's training time drops by at most
 * 12%, its 45 s of training untouched.
 */

/*
 * Patch 7 (Jade: "implement a 30% debuff across the board for existing aoe
 * hitting weapons"): every weapon that hits an area deals 30% less a blow,
 * rounded (plan 2.4): the swords, axes and club 8, 10, 12, 16, 21, 24, 30, 36
 * became 6, 7, 8, 11, 15, 17, 21, 25; the steel halberd 38 is 27 and the
 * Zweihänder 45 is 32. Spears, pikes and ranged weapons are unchanged. The
 * last number on each row is its Heft (plan 7.5).
 */

/** Close melee: a one-handed weapon and, from Patch 5, a shield of its own (SHIELD_KITS). Tier 0 is the fist fighter's fists. */
export const CLOSE_KITS: readonly MeleeKit[] = [
  close(0, 'Fists', '', 4, 12, 100, Hit.Stab, true, [[]], 0),
  close(1, Res.WoodenCudgel, 'club', 6, 13, 120, Hit.Arc, true, only([[ST, 3]]), 10, 24),
  close(2, Res.FlintHandAxe, 'axe_war_flint', 7, 13, 120, Hit.Arc, false, only([[ST, 2], [FL, 1]]), 10, 17),
  close(3, Res.CopperShortSword, 'sword_copper_short', 8, 13, 120, Hit.Arc, false, only([[CU, 1], [LU, 1]]), 19, 19),
  // The satyrs' obsidian hand-axe goes on as a bronze shortsword (Patch 5, the Stone Circle goods).
  close(4, [Res.BronzeShortsword, Res.ObsidianHandAxe], 'sword_short@bronze', 11, 12, 120, Hit.Arc, false, only([[BZ, 2], [LU, 1], [LE, 1]]), 28, 20),
  close(5, Res.WroughtIronSword, 'sword@iron_wrought', 15, 12, 120, Hit.Arc, false, only([[WI, 2], [LU, 1], [LE, 1]]), 28, 28),
  close(6, Res.IronBroadsword, 'sword@iron_refined', 17, 12, 120, Hit.Arc, false, only([[IRON, 2], [LU, 1], [LE, 1]]), 28, 31),
  close(7, Res.SteelSideSword, 'sword_steel@steel', 21, 12, 130, Hit.Arc, false, only([[STEEL, 3], [LU, 1], [LE, 1]]), 39, 30),
  close(8, Res.BasketHiltedBroadsword, 'sword_basket_hilt', 25, 12, 130, Hit.Arc, false, only([[CS, 3], [LU, 1], [LE, 1]]), 51, 33),
];

/**
 * Long melee and cavalry: a two-handed weapon, no shield, a slower swing,
 * no minimum range, and +30% in the outer third of reach (Jade). Indexed by
 * tier; tier 0 is empty (there is no long-melee fist fighter).
 */
export const LONG_KITS: readonly MeleeKit[] = [
  close(0, 'None', '', 0, 14, 0, Hit.Stab, false, [], 0),
  close(1, Res.FireHardenedSpear, 'spear_hardwood', 9, 14, 250, Hit.Stab, false, only([[ST, 4]]), 10, 52),
  close(2, Res.FlintHeadedSpear, 'spear_flint', 12, 14, 250, Hit.Stab, false, only([[ST, 3], [FL, 1]]), 10, 54),
  close(3, Res.CopperLeafBladeSpear, 'spear', 15, 14, 250, Hit.Stab, false, only([[CU, 1], [LU, 1]]), 19, 56),
  close(4, Res.BronzeSpear, 'spear@bronze', 18, 14, 250, Hit.Stab, false, only([[BZ, 1], [LU, 1]]), 23, 56),
  close(5, Res.CrudeIronSpear, 'spear_iron_crude', 28, 16, 250, Hit.Stab, false, only([[WI, 3], [LU, 2]]), 37, 64),
  close(6, Res.IronPike, 'pike', 32, 16, 350, Hit.Stab, false, only([[IRON, 3], [LU, 2]]), 37, 112),
  close(7, Res.SteelHalberd, 'halberd@steel', 27, 16, 250, Hit.Arc, false, only([[STEEL, 3], [LU, 2]]), 39, 64),
  close(8, Res.Zweihander, 'zweihander', 32, 16, 200, Hit.Arc, false, only([[CS, 3], [LU, 2]]), 51, 62),
];

/** A hit in the outer third of a long weapon's reach is a critical (s), for +30% (Jade). */
export const CRIT = { outerPm: 333, bonusPct: 30 };

// ----- Table 2e: ranged -----

const ranged = (tier: number, what: What, model: string, damage: number, attackDs: number, rangeM: number, spreadPct: number, shot: Shot, blunt: boolean, cost: Cost[], timeS: number, research: Research[] = [], heft = 0): RangedKit => ({
  tier, ...named(what), model, damage, attackDs, rangeM, spreadPct, shot, blunt, cost, timeS, need: tier, ...(research.length ? { research } : {}), ...(heft ? { heft } : {}),
});

/** A recurve bow with arrowheads of one metal (Table 2e: 3 lumber, 1 sinew or flax, 1 ingot, 1 feather). */
const recurve = (tier: number, what: Res, damage: number, ingot: Res): RangedKit =>
  ranged(tier, what, 'bow_recurve', damage, 20, 25, 6, Shot.Arrow, false, ways([[ingot, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 34, [], 30);

/**
 * The ranger: one ladder with deliberate repeats (Jade): a sling, a yew
 * longbow, the same recurve bow at 3 to 6 with better arrowheads, the
 * crossbow at 7 and the musket at 8. Ammunition is unlimited (Jade), and
 * every gunpowder weapon takes lead ore for it (Patch 5, Jade: a musket 2).
 */
export const RANGER_KITS: readonly RangedKit[] = [
  ranged(0, 'None', '', 0, 20, 0, 0, Shot.Arrow, false, [], 0),
  ranged(1, Res.LeatherSling, 'sling', 8, 20, 20, 8, Shot.SlingStone, true, [[[LE, 1]], [[FX, 1]]], 10, [], 13),
  ranged(2, Res.YewLongbow, 'bow', 10, 20, 25, 6, Shot.Arrow, false, ways([[FL, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 34, [], 42),
  recurve(3, Res.RecurveBowCopper, 12, CU),
  recurve(4, Res.RecurveBowBronze, 13, BZ),
  recurve(5, Res.RecurveBowWroughtIron, 15, WI),
  recurve(6, Res.RecurveBowIron, 16, IRON),
  ranged(7, Res.SteelProdCrossbow, 'crossbow_steel@steel', 40, 45, 34, 3, Shot.Bolt, false, only([[STEEL, 3], [WI, 1], [PL, 2], [FX, 1], [LU, 1], [FE, 1]]), 65, [Research.Crossbows], 48),
  // Patch 7 (Jade): 2 more damage and 2 m more range than before.
  ranged(8, Res.FlintlockMusket, 'musket', 62, 80, 42, 4, Shot.MusketBall, false, only([[CS, 1], [PL, 2], [FL, 1], [GP, 1], [LEAD, 2]]), 77, [Research.Gunpowder, Research.Muskets], 66),
];

/** The brawler, tier 8 only: a flintlock pistol and a cutlass (the tier 8 close-melee row), one kit (Table 2e), with 1 lead ore (Patch 5). */
export const BRAWLER_KIT: RangedKit = ranged(8, Res.FlintlockPistol, 'pistol', 40, 60, 15, 6, Shot.MusketBall, false, only([[CS, 4], [PL, 1], [FL, 1], [LU, 1], [LE, 1], [GP, 1], [LEAD, 1]]), 102, [Research.Gunpowder, Research.Muskets], 18);

// ----- Table 3: armour and shields -----

/** A person's Stature: every set of ladder armour and every ladder robe is made for it (Patch 7, plan 2.2). */
const PERSON_STATURE = 17;

const armour = (tier: number, what: What, model: string, protectionPct: number, cost: Cost[], timeS: number): ArmourKit => ({ tier, ...named(what), model, protectionPct, cost, timeS, need: tier, stature: PERSON_STATURE });

/** Armour by tier, for every troop type (Table 3): body, helmet and boots in one. Flax may stand in for leather where the table says. */
export const ARMOUR_KITS: readonly ArmourKit[] = [
  armour(0, 'No armour', '', 0, [[]], 0),
  armour(1, Res.LeatherJerkin, 'armour_leather+boots@leather', 10, only([[LE, 3]]), 30),
  armour(2, Res.BoiledLeatherCuirass, 'armour_leather_boiled+helmet_leather_cap+boots@leather', 20, only([[HL, 3], [LE, 2]]), 49),
  armour(3, Res.CopperScaleJack, 'armour_copper_scale+helmet_bronze+boots', 25, [[[CU, 5], [HL, 2], [LE, 1]], [[CU, 5], [HL, 2], [FX, 1]]], 77),
  armour(4, Res.BronzeScaleArmour, 'armour_bronze_scale+helmet_bronze+boots', 37, [[[BZ, 5], [HL, 2], [LE, 1]], [[BZ, 5], [HL, 2], [FX, 1]]], 84),
  armour(5, Res.WroughtIronMail, 'armour_iron_mail@iron_wrought+helmet_iron_nasal@iron_wrought+boots', 48, [[[WI, 5], [LE, 3]], [[WI, 5], [FX, 3]]], 84),
  armour(6, Res.IronCoatOfPlates, 'armour_iron_plates+helmet_iron_nasal@iron_refined+boots', 53, [[[IRON, 5], [LE, 3]], [[IRON, 5], [FX, 3]]], 84),
  armour(7, Res.SteelPlateHarness, 'armour_steel_plate@steel+helmet_steel_sallet@steel', 65, [[[STEEL, 7], [LE, 4]], [[STEEL, 7], [FX, 4]]], 139),
  armour(8, Res.FlutedGothicHarness, 'armour_steel_plate@hq_steel+helmet_steel_sallet@hq_steel', 70, [[[CS, 7], [LE, 4]], [[CS, 7], [FX, 4]]], 139),
];

const shield = (tier: number, what: What, model: string, need: number, blockPct: number, cost: Cost[], timeS: number, heft = 0): ShieldKit => ({
  tier, ...named(what), model, blockPct, cost, timeS, need, ...(heft ? { heft } : {}),
});

/**
 * Close melee's shields (Table 3), their own slot from Patch 5 (Jade,
 * GP-26: "Shields are now an equipment slot for all close melee units (and
 * only close melee units)"), drawn on the unit. Each needs the material tier
 * it once came with in the armour (`need`): shield tech lags on purpose.
 */
export const SHIELD_KITS: readonly ShieldKit[] = [
  shield(0, 'No shield', '', 0, 0, [[]], 0),
  // The last number is its Heft (Patch 7, s: the plan gives none for the ladder's shields).
  shield(1, Res.WoodenShield, 'shield_wood', 1, 15, only([[PL, 3], [LE, 1]]), 20, 36),
  shield(2, Res.BoiledLeatherTarge, 'shield_targe', 3, 20, only([[PL, 3], [HL, 1]]), 25, 26),
  shield(3, Res.IronRimmedHeaterShield, 'shield_iron_kite@iron_refined', 6, 25, only([[IRON, 3], [PL, 1], [LE, 1]]), 36, 54),
  shield(4, Res.SteelHeaterShield, 'shield_steel_heater@steel', 7, 30, only([[STEEL, 3], [LE, 1]]), 39, 54),
  shield(5, Res.SteelRotella, 'shield_rotella', 8, 30, only([[CS, 3], [LE, 1]]), 39, 48),
];

/** The top shield tier. */
export const TOP_SHIELD_TIER = 5;

/**
 * Poison tips (Patch 5, Jade: "Venom: Yes", poison arrow and bolt tips): one
 * venom at the Workshop makes a set for one bow or crossbow ranger, put on
 * like a kit upgrade, from stock only. Its hits then poison like a viper's
 * bite (POISON_TIPS). Slings and guns take none.
 */
export const TIPS_KIT: Piece = { tier: 1, ...named(Res.PoisonTips), model: 'poison_tips', cost: [], timeS: 10, need: 0 };
/** Poison a tipped arrow or bolt adds over 5 s, not stacking (a viper's bite, animals/species.ts). */
export const POISON_TIPS = { poison: 20 };

/** Whether a ranger's weapon tier shoots arrows or bolts, which take poison tips (the yew longbow to the crossbow). */
export function takesTips(troop: number, weaponTier: number): boolean {
  const k = troop === Troop.Ranger ? RANGER_KITS[weaponTier] : undefined;
  return k !== undefined && (k.shot === Shot.Arrow || k.shot === Shot.Bolt) && k.tier > 0;
}

// ----- Table 2c: workers' tools -----

/** The metal's look on a tool's model: its texture variant (Patch 5, every tier drawn). */
const TOOL_METAL_LOOK: Readonly<Record<string, string>> = { Copper: 'copper', Bronze: 'bronze', 'Wrought iron': 'iron_wrought', Iron: 'iron_refined', Steel: 'steel', 'Carbon steel': 'hq_steel' };

/** One kit for all four jobs, drawn as all its pieces (Patch 5: the job's in hand, the rest at the hips and back). */
const everyJob = (model: string): string[] => [model, model, model, model];

const metalTools = (tier: number, item: Res, metal: string, tool: Tool, damage: number, ingot: Res, timeS: number): ToolKit => ({
  tier, ...named(item), model: `axe@${TOOL_METAL_LOOK[metal]}`, tools: [tool, tool, tool, tool], names: [`${metal} axe`, `${metal} pickaxe`, `${metal} hammer`, `${metal} sickle`].map((n) => n.toLowerCase()),
  models: everyJob(`axe@${TOOL_METAL_LOOK[metal]}+pick@${TOOL_METAL_LOOK[metal]}+hammer_iron+sickle@${TOOL_METAL_LOOK[metal]}`), damage, cost: only([[ingot, 2], [LU, 2]]), timeS, need: tier,
});

/**
 * One kit per tier covers every tool a worker uses (Jade): axe, pick or
 * maul, hammer, hoe, sickle, fishing gear and, from copper, the prospecting
 * hammer. Each job works at its tool tier's pace (behaviour.ts). Patch 5
 * (Jade, BL-1): a worker's blow is 2 weaker at every tier, 2 with wooden
 * tools to 9 with carbon steel. Tier 0 is the bare-handed blow anyone
 * without a tool strikes (Table 1: fists 2), not a worker's tier, and stays.
 */
export const TOOL_KITS: readonly ToolKit[] = [
  { tier: 0, ...named('No tools'), model: '', tools: [0, 0, 0, 0], names: ['', '', '', ''], models: ['', '', '', ''], damage: 2, cost: [[]], timeS: 0, need: 0 },
  {
    tier: 1, ...named(Res.WoodenTools), model: 'axe_hardwood', tools: [Tool.Hardwood, Tool.Hardwood, Tool.Hardwood, Tool.Hardwood],
    names: ['wooden axe', 'digging stick', 'wooden mallet', 'wooden hoe'], models: everyJob('axe_hardwood+digging_stick+mallet+hoe@hardwood'), damage: 2, cost: only([[ST, 3]]), timeS: 10, need: 1,
  },
  {
    tier: 2, ...named(Res.StoneAndFlintTools), model: 'axe_flint', tools: [Tool.Flint, Tool.Stone, Tool.Stone, Tool.Flint],
    names: ['flint axe and knife', 'stone maul', 'stone hammer', 'flint axe and knife'], models: ['axe_flint+knife', 'maul_stone', 'hammer_stone', 'axe_flint+knife'], damage: 3, cost: only([[ST, 6], [FL, 1], [STONE, 5]]), timeS: 30, need: 2,
  },
  metalTools(3, Res.CopperTools, 'Copper', Tool.Copper, 4, CU, 35),
  metalTools(4, Res.BronzeTools, 'Bronze', Tool.Bronze, 5, BZ, 35),
  metalTools(5, Res.WroughtIronTools, 'Wrought iron', Tool.WroughtIron, 6, WI, 40),
  metalTools(6, Res.IronTools, 'Iron', Tool.Iron, 7, IRON, 40),
  metalTools(7, Res.SteelTools, 'Steel', Tool.Steel, 8, STEEL, 45),
  metalTools(8, Res.CarbonSteelTools, 'Carbon steel', Tool.CarbonSteel, 9, CS, 55),
];

/** Prospecting takes 20 s with a tier 3 tool kit or better (the prospecting hammer), 40 s without (Table 2c). */
export const PROSPECT_TOOL_TIER = 3;

// ----- Table 13: wands and robes -----

/** The material tier each wand and robe tier needs (Table 13 "Needs": a Forge, Bronze, the Forge's iron step, Steel, Carbon steel). */
const MAGE_NEED: readonly number[] = [0, 1, 3, 4, 6, 7, 8];

const wand = (tier: number, what: What, model: string, powerPct: number, mana: number, cost: Cost, timeS: number, heft = 0): WandKit => ({
  tier, ...named(what), model, powerPct, mana, cost: only(cost), timeS, need: MAGE_NEED[tier]!, ...(heft ? { heft } : {}),
});
const robe = (tier: number, what: What, model: string, protectionPct: number, regainPct: number, cost: Cost, timeS: number): RobeKit => ({
  tier, ...named(what), model, protectionPct, regainPct, cost: only(cost), timeS, need: MAGE_NEED[tier]!,
});

/**
 * Mages' wands (Jade: their own ladder; names and numbers (s)): the wand sets
 * spell power and the mana bar. The last number is its Heft (Patch 7, s: the
 * plan gives none for the ladder's wands; length in cm / 5 + weight in kg x
 * 8, the plan's rule of thumb). Witchwood stands in for a mana crystal here
 * (KIT_STAND_INS).
 */
export const WAND_KITS: readonly WandKit[] = [
  wand(0, 'No wand', '', 100, 0, [], 0),
  wand(1, Res.HazelWand, 'wand', 100, 0, [[ST, 5]], 10, 9),
  wand(2, Res.CopperTippedWand, 'wand_acolyte', 105, 10, [[ST, 5], [CU, 1]], 20, 10),
  wand(3, Res.BronzeBoundStaff, 'wand_adept_acolyte', 110, 20, [[LU, 2], [BZ, 2]], 30, 42),
  wand(4, Res.IronShodStaff, 'wand_mage', 115, 30, [[LU, 2], [IRON, 2]], 30, 52),
  wand(5, Res.CrystalStaff, 'wand_master_mage', 120, 40, [[LU, 2], [STEEL, 2], [MC, 2]], 45, 48),
  wand(6, Res.Archstaff, 'wand_grand_magician', 125, 50, [[LU, 2], [CS, 2], [MC, 5]], 60, 56),
];

/** Mages' robes: the robe sets protection and mana regain. Each tier is drawn as the mage's robe look, mage_battle_<tier> or mage_support_<tier> (client units-view.ts); every one is made for a person's Stature (PERSON_STATURE). */
export const ROBE_KITS: readonly RobeKit[] = [
  robe(0, 'No robe', '', 0, 0, [], 0),
  robe(1, Res.HomespunRobe, 'robe_1', 0, 0, [[FX, 3]], 10),
  robe(2, Res.LeatherTrimmedRobe, 'robe_2', 5, 5, [[FX, 3], [LE, 1]], 20),
  robe(3, Res.HardenedLeatherRobe, 'robe_3', 10, 10, [[FX, 3], [HL, 2]], 30),
  robe(4, Res.WardedRobe, 'robe_4', 15, 15, [[FX, 3], [HL, 2], [MC, 1]], 30),
  robe(5, Res.RuneStitchedVestments, 'robe_5', 20, 20, [[FX, 3], [HL, 2], [CU, 2], [MC, 2]], 45),
  robe(6, Res.ArchmagesMantle, 'robe_6', 25, 25, [[FX, 3], [HL, 2], [STEEL, 2], [MC, 5]], 60),
];

/** The top wand and robe tier. */
export const TOP_MAGE_TIER = 6;

// ----- Patch 7: rarity, Heft and Stature -----

/** A piece's grade (Patch 7, plan 3): its name's colour, and how long the Workshop takes to scrap it (SCRAP_SECONDS). */
export const Rarity = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 } as const;
export type Rarity = (typeof Rarity)[keyof typeof Rarity];
export const RARITY_NAMES: readonly string[] = ['Common', 'Rare', 'Epic', 'Legendary'];
/** Each grade's name colour (plan 3: blue, orange, purple, white). */
export const RARITY_COLOURS: readonly string[] = ['#5aa2ff', '#ff9a3d', '#b86bff', '#ffffff'];

/** A ladder piece's grade (plan 3): tiers from `rare` up are rare, from `epic` up epic, the rest common. */
const ladderRarity = (tier: number, rare: number, epic: number): Rarity => (tier >= epic ? Rarity.Epic : tier >= rare ? Rarity.Rare : Rarity.Common);
/** Weapons, armour and (s) tool kits: tiers 1 to 4 common, 5 to 7 rare, 8 epic. */
const troopRarity = (tier: number): Rarity => ladderRarity(tier, 5, 8);

/**
 * What kind of piece a gear row or item is, which says who takes it (plan
 * 2.2, fitProblem): one-handed weapons and flails go to close melee; spears
 * and two-handed area weapons (Great) to long melee, cavalry and the
 * woodsman, and Great ones to the Dreadnought; ranged weapons to rangers;
 * wands and robes to mages; armour to troops; shields to close melee; tool
 * kits to workers. The brawler's pistol is his alone.
 */
export const GearKind = { None: 0, OneHanded: 1, Flail: 2, Spear: 3, Great: 4, Ranged: 5, Pistol: 6, Wand: 7, Shield: 8, Armour: 9, Robe: 10, Tools: 11 } as const;
export type GearKind = (typeof GearKind)[keyof typeof GearKind];

/** The bodies gear is sized for (plan 2.1): a person (every player unit but the Dreadnought) and the Dreadnought. */
export const Body = { Person: 0, Dreadnought: 1 } as const;
export type Body = (typeof Body)[keyof typeof Body];

/** What a body can take: Heft (weapons, wands and shields) and Stature (armour and robes), each from and to, inclusive. */
export interface FitRange {
  heftMin: number;
  heftMax: number;
  statureMin: number;
  statureMax: number;
}

/**
 * Plan 2.1's table, by Body: a person takes Heft 4 to 125 and Stature 16 to
 * 21, the Dreadnought Heft 10 to 340 and Stature 24 to 36. Outside it a
 * piece cannot go on, too big or too small alike.
 */
export const FIT_RANGES: readonly FitRange[] = [
  { heftMin: 4, heftMax: 125, statureMin: 16, statureMax: 21 },
  { heftMin: 10, heftMax: 340, statureMin: 24, statureMax: 36 },
];

/** What the Dreadnought says when he is offered a weapon he cannot use (plan 2.3, Jade's words). */
export const SMASHING_LINE = 'I need something for smashing.';

// ----- Table 7: training and upgrading -----

/**
 * Training and upgrading (Table 7): a troop is 30 food and its kit, 45 s
 * plus the kit's time and 1 supply. Workers and mages keep their own rows
 * (buildings/data.ts WORKER_FOOD, magic/mages.ts MAGE_FOOD). An upgrade pays
 * the new piece; from Patch 5 (Jade, GP-3) the old piece goes to stock as an
 * item, no longer back to its materials, and the upgrade is a little faster
 * for it. It never takes less than the new piece's time over the old one's,
 * so training low and upgrading is never quicker than training high (BL-11),
 * and with the old piece scrapped for its whole cost never cheaper either.
 */
export const TRAINING = {
  troopFood: 30,
  troopS: 45,
  /** An upgrade from materials: this share of the new piece's time to make, per mille, and never less than the new piece's time less the old one's. */
  upgradeTimePm: 450,
  /** A ready item put on in place of making its piece, in training or an upgrade: this share of the piece's time to make, per mille (Patch 5, GP-1). */
  fitTimePm: 200,
};

// ----- the gear catalogue -----

/** Where a piece of gear goes on a unit. */
export const Slot = { Tool: 0, Weapon: 1, Ranged: 2, Shield: 3, Armour: 4 } as const;
export type Slot = (typeof Slot)[keyof typeof Slot];

/**
 * The special effects of epic and legendary loot (Patch 7, plan section
 * 4.5): what each does, its numbers and its words are in units/effects.ts;
 * a gear row carries its own here (GearSpec.effect), the two trophies on
 * their building kinds.
 */
export const LootEffect = { None: 0, Fury: 1, Warlord: 2, Reaper: 3, FarSight: 4, FaeSet: 5, BogTrophy: 6, VictorsTrophy: 7 } as const;
export type LootEffect = (typeof LootEffect)[keyof typeof LootEffect];

/** One thing a unit holds or wears, with its stats in sim units. */
export interface GearSpec {
  id: number;
  name: string;
  slot: Slot;
  /** Its material tier (0 to 8), for looks and sounds. */
  tier: number;
  model: string;
  melee?: MeleeStats;
  /** A second blow swung in turn with the first, every other attack (Patch 5: the Dreadnought's mace, a smash then a sweep); atkWith is SECOND_BLOW while it swings. */
  melee2?: MeleeStats;
  ranged?: RangedStats;
  /** Shields: projectile block, bp (Table 3). */
  blockBp?: number;
  /** Armour and robes: damage taken off, bp (Table 3, Table 13). */
  armourBp?: number;
  /** Tools: the tool tier it gives (props.ts Tool), the jobs it does (a ToolJob bit each), and a worker's blow with it. */
  tool?: number;
  jobs?: number;
  toolHit?: { damage: number; attackSteps: number };
  /** Wands: spell power and extra mana, and (Patch 7, the Fae star wand) extra mana regain; robes: extra mana regain (Table 13). */
  wand?: { powerPct: number; mana: number; regainPct?: number };
  robe?: { regainPct: number };
  /** Patch 7: what kind of piece it is, which says who takes it (GearKind). */
  kind: GearKind;
  /** Patch 7: its grade (plan 3). */
  rarity: Rarity;
  /** Patch 7: the tier of its line it counts as on a unit (a looted piece's from its numbers, gearScore), for upgrades and the kit's tiers. */
  rung: number;
  /** Patch 7: its Heft (weapons, wands and shields) or Stature (armour and robes), 0 where it has none (plan 2.1). */
  heft: number;
  stature: number;
  /** Patch 7: the good it is, which it comes off as, or undefined (fists, "No armour", the peoples' own leathers). */
  item?: Res;
  /** Patch 7: the special effect of an epic or legendary looted piece (LootEffect; units/effects.ts), working while it is held or worn. */
  effect?: LootEffect;
}

/** Tenths of a second as steps. */
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);

const meleeStats = (k: MeleeKit, oneHanded: boolean, crit: boolean): MeleeStats => ({
  damage: k.damage, attackSteps: ds(k.swingDs), reach: cm(k.reachCm), hit: k.hit, blunt: k.blunt, oneHanded, crit,
});
const rangedStats = (k: RangedKit): RangedStats => ({
  damage: k.damage, attackSteps: ds(k.attackDs), range: k.rangeM * WU_PER_METRE, spreadBp: k.spreadPct * 100, shot: k.shot, blunt: k.blunt,
});

/** A wand's tap (Table 1: 3 damage every 1.5 s, s). */
const WAND_TAP: MeleeStats = { damage: 3, attackSteps: ds(15), reach: cm(120), hit: Hit.Stab, blunt: true, oneHanded: true, crit: false };

/** A gear row as written: its kind follows from its slot and stats, its rung from its tier, a common grade and no Heft or Stature unless given. */
type GearRow = Omit<GearSpec, 'id' | 'kind' | 'rarity' | 'rung' | 'heft' | 'stature' | 'item'> & {
  kind?: GearKind | undefined; rarity?: Rarity | undefined; rung?: number | undefined; heft?: number | undefined; stature?: number | undefined; item?: Res | undefined;
};

/** A row's kind from its slot and stats: a one-handed weapon that sweeps is a flail, a two-handed one that stabs a spear, one that swings in an arc a Great weapon. */
function kindOf(g: GearRow): GearKind {
  if (g.slot === Slot.Tool) return GearKind.Tools;
  if (g.slot === Slot.Shield) return GearKind.Shield;
  if (g.slot === Slot.Armour) return g.robe ? GearKind.Robe : GearKind.Armour;
  if (g.slot === Slot.Ranged) return GearKind.Ranged;
  if (g.wand) return GearKind.Wand;
  const m = g.melee;
  if (!m) return GearKind.None;
  if (m.oneHanded) return m.hit === Hit.Sweep ? GearKind.Flail : GearKind.OneHanded;
  return m.hit === Hit.Stab ? GearKind.Spear : GearKind.Great;
}

const GEAR_LIST: GearSpec[] = [{ id: 0, name: 'Nothing', slot: Slot.Tool, tier: 0, model: '', kind: GearKind.None, rarity: Rarity.Common, rung: 0, heft: 0, stature: 0 }];
function add(g: GearRow): number {
  const id = GEAR_LIST.length;
  const { item, ...rest } = g;
  GEAR_LIST.push({ ...rest, id, kind: g.kind ?? kindOf(g), rarity: g.rarity ?? Rarity.Common, rung: g.rung ?? g.tier, heft: g.heft ?? 0, stature: g.stature ?? 0, ...(item === undefined ? {} : { item }) });
  return id;
}

/**
 * The peoples' own gear (Table 11, Table 19; never made by players): kept as
 * they were, with the arrowheads they shot folded into the bow (the Halfling
 * shortbow's wrought iron, the Elf longbow's carbon steel, the Dwarf
 * crossbow's steel bolts), their armour and helmet as one, and no backup
 * weapon: their archers fight with their old backup weapon in hand. Patch 7
 * (plan 2.4): the peoples' own units keep these numbers, the 30% cut to area
 * weapons aside, so the cudgel and steel side-sword they carry are rows of
 * their own here; a piece they drop goes on a player's unit as the player's
 * version (LOOT_KITS), the good each row names.
 */
export const PeopleGear = {
  Shortbow: add({ name: 'Halfling shortbow', slot: Slot.Ranged, tier: 5, model: 'halfling_shortbow', item: Res.HalflingShortbow, ranged: { damage: 14, attackSteps: ds(20), range: cm(2000), spreadBp: 600, shot: Shot.Arrow, blunt: false } }),
  Shortsword: add({ name: 'Halfling shortsword', slot: Slot.Weapon, tier: 5, model: 'halfling_shortsword', item: Res.HalflingShortsword, melee: { damage: 16, attackSteps: ds(11), reach: cm(110), hit: Hit.Arc, blunt: false, oneHanded: true, crit: false } }),
  Buckler: add({ name: 'Halfling buckler', slot: Slot.Shield, tier: 2, model: 'halfling_buckler', item: Res.HalflingBuckler, blockBp: 1000 }),
  HalflingHelm: add({ name: 'Halfling iron cap', slot: Slot.Armour, tier: 5, model: 'helmet_iron_nasal', item: Res.HalflingIronCap, armourBp: 500 }),
  Glaive: add({ name: 'Elf glaive', slot: Slot.Weapon, tier: 8, model: 'halberd', item: Res.ElfGlaive, melee: { damage: 45, attackSteps: ds(16), reach: cm(250), hit: Hit.Arc, blunt: false, oneHanded: false, crit: true } }),
  ElfLongbow: add({ name: 'Elf longbow', slot: Slot.Ranged, tier: 8, model: 'bow', item: Res.ElfLongbow, ranged: { damage: 24, attackSteps: ds(20), range: cm(4000), spreadBp: 400, shot: Shot.Arrow, blunt: false } }),
  Leathers: add({ name: 'Leather armour', slot: Slot.Armour, tier: 2, model: 'armour_leather', armourBp: 1500 }),
  DwarfWarAxe: add({ name: 'Dwarf war axe', slot: Slot.Weapon, tier: 7, model: 'axe_war', item: Res.DwarfWarAxe, melee: { damage: 26, attackSteps: ds(13), reach: cm(120), hit: Hit.Arc, blunt: false, oneHanded: true, crit: false } }),
  DwarfWarHammer: add({ name: 'Dwarf war hammer', slot: Slot.Weapon, tier: 7, model: 'mace', item: Res.DwarfWarHammer, melee: { damage: 34, attackSteps: ds(18), reach: cm(160), hit: Hit.Arc, blunt: true, oneHanded: false, crit: false } }),
  // The Dwarves' crossbow drops as the players' steel-prod crossbow (plan 4.4).
  DwarfCrossbow: add({ name: 'Dwarf crossbow', slot: Slot.Ranged, tier: 7, model: 'crossbow', item: Res.SteelProdCrossbow, ranged: { damage: 30, attackSteps: ds(30), range: cm(2800), spreadBp: 400, shot: Shot.Bolt, blunt: false } }),
  DwarfPlate: add({ name: 'Dwarf plate and sallet', slot: Slot.Armour, tier: 7, model: 'armour_steel_plate', item: Res.DwarfPlate, armourBp: 6200 }),
  DwarfMail: add({ name: 'Dwarf mail and sallet', slot: Slot.Armour, tier: 5, model: 'armour_iron_mail', item: Res.DwarfMail, armourBp: 4700 }),
  // Patch 7: the Runkin archers' cudgel and the Elves' and Dwarves' steel side-sword, at the ladder's numbers before the 30% cut.
  Cudgel: add({ name: 'Wooden cudgel', slot: Slot.Weapon, tier: 1, model: 'club', item: Res.WoodenCudgel, melee: { damage: 8, attackSteps: ds(13), reach: cm(120), hit: Hit.Arc, blunt: true, oneHanded: true, crit: false } }),
  SteelSword: add({ name: 'Steel side-sword', slot: Slot.Weapon, tier: 7, model: 'sword_steel@steel', item: Res.SteelSideSword, melee: { damage: 30, attackSteps: ds(12), reach: cm(130), hit: Hit.Arc, blunt: false, oneHanded: true, crit: false } }),
} as const;

/** Gear ids by tier for each table, each row the good it is, with its Heft or Stature and grade (Patch 7, plan 3). */
export const CLOSE_GEAR: readonly number[] = CLOSE_KITS.map((k) => add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: meleeStats(k, true, false), heft: k.heft, rarity: troopRarity(k.tier), item: k.items[0] }));
export const LONG_GEAR: readonly number[] = LONG_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: meleeStats(k, false, true), heft: k.heft, rarity: troopRarity(k.tier), item: k.items[0] })));
export const RANGER_GEAR: readonly number[] = RANGER_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Ranged, tier: k.tier, model: k.model, ranged: rangedStats(k), heft: k.heft, rarity: troopRarity(k.tier), item: k.items[0] })));
export const PISTOL_GEAR: number = add({ name: 'Flintlock pistol', slot: Slot.Ranged, tier: 8, model: BRAWLER_KIT.model, ranged: rangedStats(BRAWLER_KIT), kind: GearKind.Pistol, heft: BRAWLER_KIT.heft, rarity: troopRarity(BRAWLER_KIT.tier), item: BRAWLER_KIT.items[0] });
export const ARMOUR_GEAR: readonly number[] = ARMOUR_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Armour, tier: k.tier, model: k.model, armourBp: k.protectionPct * 100, stature: k.stature, rarity: troopRarity(k.tier), item: k.items[0] })));
/** Shields: tier 1 and 2 common, 3 and 4 rare, 5 epic (plan 3); a row's tier is the material it needs, its rung the shield tier. */
export const SHIELD_GEAR: readonly number[] = SHIELD_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Shield, tier: k.need, rung: k.tier, model: k.model, blockBp: k.blockPct * 100, heft: k.heft, rarity: ladderRarity(k.tier, 3, 5), item: k.items[0] })));
/** Each tool kit tier's gear for each job (ToolJob order); jobs with the same tool and look share one row. */
export const TOOL_GEAR: ReadonlyArray<readonly number[]> = TOOL_KITS.map((k) => {
  if (k.tier === 0) return [0, 0, 0, 0];
  const out: number[] = [];
  for (let j = 0; j < TOOL_JOBS; j++) {
    const same = out.findIndex((_, o) => k.tools[o] === k.tools[j] && k.models[o] === k.models[j]);
    if (same >= 0) {
      out.push(out[same]!);
      continue;
    }
    let jobs = 0;
    for (let o = j; o < TOOL_JOBS; o++) if (k.tools[o] === k.tools[j] && k.models[o] === k.models[j]) jobs |= 1 << o;
    const single = jobs !== (1 << TOOL_JOBS) - 1;
    out.push(add({ name: single ? capital(k.names[j]!) : k.name, slot: Slot.Tool, tier: k.tier, model: k.models[j]!, tool: k.tools[j]!, jobs, toolHit: { damage: k.damage, attackSteps: ds(15) }, rarity: troopRarity(k.tier), item: k.items[0] }));
  }
  return out;
});
/** Wands and robes: tiers 1 to 3 common, 4 and 5 rare, 6 epic (plan 3). */
const mageRarity = (tier: number): Rarity => ladderRarity(tier, 4, 6);
export const WAND_GEAR: readonly number[] = WAND_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: WAND_TAP, wand: { powerPct: k.powerPct, mana: k.mana }, heft: k.heft, rarity: mageRarity(k.tier), item: k.items[0] })));
export const ROBE_GEAR: readonly number[] = ROBE_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Armour, tier: k.tier, model: k.model, armourBp: k.protectionPct * 100, robe: { regainPct: k.regainPct }, stature: PERSON_STATURE, rarity: mageRarity(k.tier), item: k.items[0] })));

/** A blow of the Dreadnought's: damage, how it hits, and where in its clip it strikes. */
export interface DreadnoughtBlow {
  damage: number;
  hit: Hit;
  /** Tenths of a second from the swing's start to the blow. */
  landDs: number;
}

/**
 * The Dreadnought's kit (Patch 5, Jade, GP-21): the heavy mace and the plate
 * of his model, no shield. He attacks every 3 s, a smash (single target,
 * 140) then a swing (every enemy in the arc in front of him), in turn. His
 * armour is in line with high carbon steel: the tier 8 row's protection. The
 * reach (s) suits his 2.5 m height; each blow lands where its clip strikes
 * (s): the smash as the mace comes down, the swing half way through its
 * clip, where its crescent shows. Patch 7 (plan 2.3, 2.4): the swing loses
 * 30% with every area weapon, 70 to 49; the mace is an item he can take off
 * (Heft 250, epic) and swap for any two-handed area weapon, with which his
 * blows go back and forth as with the mace (Jade): a smash at one enemy for
 * 1.5 times its damage (damagePm), then a sweep at every enemy in his arc
 * for its own damage (dreadnoughtBlow); his plate is the Fluted Gothic
 * harness, worn in his own look (plan 2.2), at a Stature of his (s).
 */
export const DREADNOUGHT_KIT = {
  mace: 'Heavy spiked mace',
  plate: 'Fluted Gothic harness',
  attackDs: 30,
  reachCm: 200,
  smash: { damage: 140, hit: Hit.Stab, landDs: 9 } as DreadnoughtBlow,
  swing: { damage: 49, hit: Hit.Sweep, landDs: 9 } as DreadnoughtBlow,
  armourTier: TOP_TIER,
  /** His smash with any weapon but his own mace, per mille of its damage (plan 2.3: 1.5 times); his sweep with it is its own damage. */
  damagePm: 1500,
  /** The mace's Heft (plan 2.3). */
  maceHeft: 250,
  /** The Stature of the harness in his look (s: the middle of his 24 to 36). */
  stature: 30,
};

const dreadBlow = (b: DreadnoughtBlow): MeleeStats => ({
  damage: b.damage, attackSteps: ds(DREADNOUGHT_KIT.attackDs), reach: cm(DREADNOUGHT_KIT.reachCm), hit: b.hit, blunt: true, oneHanded: false, crit: false, landSteps: ds(b.landDs),
});

/** The armour row his plate matches (DREADNOUGHT_KIT.armourTier, held to the ladder). */
export function dreadnoughtArmour(): ArmourKit {
  return ARMOUR_KITS[Math.max(0, Math.min(TOP_TIER, DREADNOUGHT_KIT.armourTier))]!;
}

/**
 * The Dreadnought's gear: his mace, the HeavySpikedMace item (plan 2.3), and
 * the Fluted Gothic harness in his look, the tier 8 armour's second row
 * (plan 2.2). Each names the model the Patch 7 model brief gives it; until
 * the client draws him in parts, both are drawn as part of his own model
 * (heavy_knight).
 */
export const DREADNOUGHT_GEAR = {
  mace: add({
    name: DREADNOUGHT_KIT.mace, slot: Slot.Weapon, tier: TOP_TIER, model: 'dreadnought_mace_held', melee: dreadBlow(DREADNOUGHT_KIT.smash), melee2: dreadBlow(DREADNOUGHT_KIT.swing),
    kind: GearKind.Great, rarity: Rarity.Epic, heft: DREADNOUGHT_KIT.maceHeft, item: Res.HeavySpikedMace,
  }),
  plate: add({
    name: DREADNOUGHT_KIT.plate, slot: Slot.Armour, tier: TOP_TIER, model: 'armour_dreadnought_harness', armourBp: dreadnoughtArmour().protectionPct * 100,
    rarity: troopRarity(TOP_TIER), stature: DREADNOUGHT_KIT.stature, item: Res.FlutedGothicHarness,
  }),
} as const;

/** atkWith while a weapon's second blow (GearSpec.melee2) swings: past the slots. */
export const SECOND_BLOW = 5;

/**
 * The Dreadnought's blows with any weapon but his own mace (plan 2.3; Jade:
 * "going back and forth one after another from single target with higher
 * damage to full sweep with single target damage"): the first a smash at one
 * enemy for 1.5 times the weapon's damage, rounded down, the second a sweep
 * at every enemy in his arc for the weapon's own damage, in turn, each
 * landing as his clips strike. Combat applies it (combat.ts handMelee and
 * nextBlow).
 */
export function dreadnoughtBlow(m: MeleeStats, second: boolean): MeleeStats {
  const landSteps = ds((second ? DREADNOUGHT_KIT.swing : DREADNOUGHT_KIT.smash).landDs);
  if (second) return { ...m, hit: Hit.Sweep, oneHanded: false, crit: false, landSteps };
  return { ...m, damage: floorDiv(m.damage * DREADNOUGHT_KIT.damagePm, 1000), hit: Hit.Stab, oneHanded: false, crit: false, landSteps };
}

// ----- Patch 7: the looted pieces -----

/**
 * A looted piece (Patch 7, plan 4): every weapon, shield, armour and robe a
 * monster uses, the neutral peoples' pieces, and the pieces that fit nobody.
 * Its numbers are a player unit's, set on their own against the ladder and
 * never the monster's or the peoples' own (plan 2.4; Jade: "Weapon damage
 * from what a mob does with it and what a player do with it are not the
 * same"). Melee as Table 2d (tenths of a second, cm), ranged as Table 2e,
 * wands and robes as Table 13, block and protection as Table 3; a piece
 * that fits nobody has none, only its Heft or Stature, which keep it off
 * every body (plan 4.3: scrap only).
 */
export interface LootKit {
  item: Res;
  name: string;
  rarity: Rarity;
  kind: GearKind;
  /** Its Heft (weapons, wands and shields) or Stature (armour and robes), plan 2.1. */
  size: number;
  /** The material tier its looks and sounds follow (a wooden shield's knock, a metal one's clang). */
  tier: number;
  /** The catalogue model it is drawn with on a unit ('' for a piece that fits nobody). */
  model: string;
  melee?: { damage: number; swingDs: number; reachCm: number; hit: Hit; blunt: boolean };
  ranged?: { damage: number; attackDs: number; rangeM: number; spreadPct: number; shot: Shot; blunt: boolean };
  wand?: { powerPct: number; mana: number; regainPct: number };
  robe?: { protectionPct: number; regainPct: number };
  blockPct?: number;
  protectionPct?: number;
  /** What the Workshop gives back for it (plan 6, s where the plan has no row). */
  scrap: Cost;
}

type LootStats = Partial<Pick<LootKit, 'melee' | 'ranged' | 'wand' | 'robe' | 'blockPct' | 'protectionPct'>>;

const loot = (item: Res, rarity: Rarity, kind: GearKind, size: number, tier: number, model: string, scrap: Cost, stats: LootStats = {}): LootKit => ({
  // The stats first: the balance editor then writes each number back into its own argument, never into the stats.
  ...stats, item, name: RESOURCES[item]!.name, rarity, kind, size, tier, model, scrap,
});
const swings = (damage: number, swingDs: number, reachCm: number, hit: Hit, blunt = false): LootStats => ({ melee: { damage, swingDs, reachCm, hit, blunt } });
const shoots = (damage: number, attackDs: number, rangeM: number, spreadPct: number, shot: Shot, blunt = false): LootStats => ({ ranged: { damage, attackDs, rangeM, spreadPct, shot, blunt } });
/** A wand "as a tier N wand" (plan 4.1): that tier's spell power and mana. */
const asWand = (tier: number): LootStats => ({ wand: { powerPct: WAND_KITS[tier]!.powerPct, mana: WAND_KITS[tier]!.mana, regainPct: 0 } });
/** A robe "as a tier N robe" (plan 4.3): that tier's protection and mana regain. */
const asRobe = (tier: number): LootStats => ({ robe: { protectionPct: ROBE_KITS[tier]!.protectionPct, regainPct: ROBE_KITS[tier]!.regainPct } });

/** Jade (Patch 7): "Make fey guardian gear also boost mana restore when worn by 25% (per piece)": the Fae star wand and the Fae Guardian's robe, +50% together. */
export const FAE_REGAIN_PCT = 25;

const C = Rarity.Common;
const R = Rarity.Rare;
const E = Rarity.Epic;
const L = Rarity.Legendary;

/**
 * The looted pieces (plan 4.1 to 4.4, 6), in id order: the good, its grade,
 * kind, Heft or Stature, material tier, model, scrap yield and numbers. The
 * peoples' pieces have the numbers after the 30% cut to area weapons (plan
 * 2.4), and the Dwarves' crossbow and musket drop as the players' own
 * (plan 4.4), so they are not here. The fiend's cleaver swings in 1.2 s and
 * the archfiend's greatsword in 1.9 s (s, the plan's 1.3 s and 2.0 s), so
 * each is above the best ladder piece of its kind in damage a second as the
 * plan grades them (plan 3: epic is on par with the best ladder piece or
 * better). Models: weapons and shields are the held pieces cut from their
 * monster's model (packages/assets MANIFEST, Patch 7), armour and robes the
 * Patch 7 model brief's (docs/patch7-model-brief.md).
 */
export const LOOT_KITS: readonly LootKit[] = [
  loot(Res.GoblinDagger, C, GearKind.OneHanded, 10, 5, 'dagger_goblin', [[Res.WroughtIron, 1]], swings(8, 9, 90, Hit.Stab)),
  loot(Res.GoblinChiefCleaver, C, GearKind.OneHanded, 26, 5, 'cleaver_goblin_chief', [[Res.WroughtIron, 2], [LE, 1]], swings(11, 13, 120, Hit.Arc)),
  loot(Res.HobgoblinSword, C, GearKind.OneHanded, 19, 6, 'sword_hobgoblin', [[IRON, 2], [LE, 1]], swings(13, 12, 120, Hit.Arc)),
  loot(Res.BarrowKnightLongsword, R, GearKind.OneHanded, 35, 6, 'sword_barrow_knight', [[IRON, 3], [Res.Silver, 1]], swings(18, 13, 140, Hit.Arc)),
  loot(Res.FiendCleaver, E, GearKind.OneHanded, 62, 6, 'cleaver_fiend', [[IRON, 2], [Res.DemonHorn, 1]], swings(26, 12, 130, Hit.Arc)),
  loot(Res.PlagueCenser, R, GearKind.Flail, 34, 6, 'flail_plague_censer', [[IRON, 2], [Res.Sulphur, 1]], swings(11, 15, 160, Hit.Sweep, true)),
  loot(Res.ChainAndHook, R, GearKind.Flail, 62, 6, 'flail_chain_hook', [[IRON, 3]], swings(14, 16, 250, Hit.Sweep)),
  loot(Res.GoblinFeatheredSpear, C, GearKind.Spear, 28, 4, 'spear_goblin_feathered', [[BZ, 1], [SW, 1], [FE, 1]], swings(16, 14, 230, Hit.Stab)),
  loot(Res.KoboldSpear, C, GearKind.Spear, 42, 5, 'spear_kobold', [[WI, 1], [SW, 2]], swings(19, 14, 250, Hit.Stab)),
  loot(Res.GnollSpear, C, GearKind.Spear, 41, 5, 'spear_gnoll', [[WI, 1], [SW, 2], [Res.Hides, 1]], swings(22, 15, 250, Hit.Stab)),
  loot(Res.MinotaurGreatAxe, R, GearKind.Great, 134, 7, 'axe_great_minotaur', [[STEEL, 4], [SW, 3]], swings(29, 20, 220, Hit.Arc)),
  loot(Res.ArchfiendGreatsword, E, GearKind.Great, 153, 6, 'greatsword_archfiend', [[IRON, 5], [Res.DemonHorn, 2], [Res.Rubies, 1]], swings(40, 19, 240, Hit.Arc)),
  loot(Res.BogGuardianClub, E, GearKind.Great, 351, 1, '', [[HW, 10], [STONE, 20], [Res.Emeralds, 1]]),
  loot(Res.GoblinSling, C, GearKind.Ranged, 10, 1, 'sling_goblin', [[LE, 1]], shoots(7, 20, 18, 8, Shot.SlingStone, true)),
  loot(Res.GoblinBow, C, GearKind.Ranged, 17, 2, 'bow_goblin', [[ST, 2], [FE, 1]], shoots(9, 20, 22, 6, Shot.Arrow)),
  loot(Res.SkeletonRecurveBow, C, GearKind.Ranged, 32, 4, 'bow_skeleton_recurve', [[Res.Bone, 2], [SW, 1], [ROPE, 1]], shoots(14, 20, 30, 6, Shot.Arrow)),
  loot(Res.GoblinHexStick, C, GearKind.Wand, 21, 2, 'wand_goblin_hexstick', [[Res.Witchwood, 1], [Res.Hexstone, 1]], asWand(2)),
  loot(Res.HollowPriestStaff, R, GearKind.Wand, 49, 4, 'staff_hollow_priest', [[Res.Witchwood, 2]], asWand(4)),
  loot(Res.NecromancerStaff, R, GearKind.Wand, 43, 5, 'staff_necromancer', [[Res.Witchwood, 2], [Res.Bone, 1], [MC, 1]], asWand(5)),
  loot(Res.FlamecallerStaff, R, GearKind.Wand, 76, 5, 'staff_flamecaller', [[IRON, 2], [Res.Witchwood, 1], [Res.Sulphur, 1]], asWand(5)),
  // 130% spell power (plan 4.1), mana a step past the archstaff's (s), and the Fae's +25% regain.
  loot(Res.FaeStarWand, L, GearKind.Wand, 14, 6, 'wand_fae_star', [[MC, 3], [Res.Diamonds, 1]], { wand: { powerPct: 130, mana: 60, regainPct: FAE_REGAIN_PCT } }),
  loot(Res.MorvathStaff, L, GearKind.Wand, 413, 6, '', [[IRON, 6], [Res.Witchwood, 4], [Res.Bone, 10], [MC, 8], [Res.Diamonds, 2]]),
  loot(Res.GoblinPlankShield, C, GearKind.Shield, 20, 1, 'shield_goblin_plank', [[PL, 2], [ST, 1]], { blockPct: 12 }),
  loot(Res.HobgoblinShield, C, GearKind.Shield, 44, 6, 'shield_hobgoblin', [[IRON, 2], [PL, 2]], { blockPct: 22 }),
  loot(Res.BarrowKnightKiteShield, R, GearKind.Shield, 45, 6, 'shield_barrow_knight', [[IRON, 3], [PL, 1]], { blockPct: 28 }),
  loot(Res.GnollBracer, C, GearKind.Armour, 20, 1, 'armour_gnoll_bracer', [[Res.Hides, 1]], { protectionPct: 5 }),
  loot(Res.HobgoblinArmour, C, GearKind.Armour, 19, 6, 'armour_hobgoblin', [[IRON, 4], [LE, 2]], { protectionPct: 40 }),
  loot(Res.BarrowKnightMail, R, GearKind.Armour, 20, 6, 'armour_barrow_mail', [[IRON, 5], [Res.Silver, 1]], { protectionPct: 50 }),
  loot(Res.VoidStalkerCloak, R, GearKind.Armour, 21, 2, 'armour_void_cloak', [[Res.SpiderSilk, 2], [MC, 1]], { protectionPct: 38 }),
  loot(Res.FiendShoulderPlate, R, GearKind.Armour, 25, 6, 'armour_fiend_shoulder_dread', [[IRON, 3]], { protectionPct: 62 }),
  loot(Res.MinotaurBracers, R, GearKind.Armour, 36, 7, 'armour_minotaur_dread', [[STEEL, 3], [HL, 2]], { protectionPct: 66 }),
  loot(Res.PlagueBearerRobe, C, GearKind.Robe, 18, 3, 'robe_plague_bearer', [[FX, 3], [Res.Venom, 1]], asRobe(3)),
  loot(Res.HollowPriestRobe, R, GearKind.Robe, 19, 4, 'robe_hollow_priest', [[FX, 3], [HL, 1]], asRobe(4)),
  loot(Res.NecromancerRobe, R, GearKind.Robe, 20, 5, 'robe_necromancer', [[FX, 3], [Res.Gold, 1]], asRobe(5)),
  loot(Res.FlamecallerRobe, R, GearKind.Robe, 21, 5, 'robe_flamecaller', [[FX, 3], [Res.Sulphur, 1], [MC, 1]], asRobe(5)),
  // Above the archmage's mantle (plan 4.3: 30% protection and 30% regain, s), plus the Fae's +25% regain.
  loot(Res.FaeGuardianRobe, L, GearKind.Robe, 18, 6, 'robe_fae', [[Res.SpiderSilk, 3], [MC, 3], [Res.MoonRose, 1]], { robe: { protectionPct: 30, regainPct: 30 + FAE_REGAIN_PCT } }),
  // Fit nobody (plan 4.3): their Stature is outside every body's range.
  loot(Res.GoblinLeathers, C, GearKind.Armour, 12, 1, '', [[LE, 2]]),
  loot(Res.GoblinChiefHelmet, C, GearKind.Armour, 14, 5, '', [[WI, 1]]),
  loot(Res.ArchfiendPlate, E, GearKind.Armour, 38, 6, '', [[IRON, 6], [Res.DemonHorn, 2]]),
  loot(Res.JuggernautPlating, R, GearKind.Armour, 42, 6, '', [[IRON, 4]]),
  loot(Res.HalflingIronCap, C, GearKind.Armour, 15, 6, '', [[IRON, 1]]),
  loot(Res.DwarfPlate, R, GearKind.Armour, 15, 7, '', [[STEEL, 5]]),
  loot(Res.DwarfMail, R, GearKind.Armour, 15, 6, '', [[IRON, 4]]),
  // The neutral peoples' pieces (plan 4.4), in a player unit's hands; their scrap yields are picks (s).
  loot(Res.HalflingShortsword, R, GearKind.OneHanded, 16, 5, 'halfling_shortsword', [[WI, 2], [SW, 1], [LE, 1]], swings(11, 11, 110, Hit.Arc)),
  loot(Res.HalflingShortbow, R, GearKind.Ranged, 24, 5, 'halfling_shortbow', [[SW, 3], [ROPE, 1], [WI, 1], [FE, 1]], shoots(14, 20, 20, 6, Shot.Arrow)),
  loot(Res.HalflingBuckler, C, GearKind.Shield, 18, 2, 'halfling_buckler', [[PL, 2], [HL, 1]], { blockPct: 10 }),
  loot(Res.ElfGlaive, E, GearKind.Great, 66, 8, 'halberd', [[CS, 3], [SW, 2]], swings(32, 16, 250, Hit.Arc)),
  loot(Res.ElfLongbow, E, GearKind.Ranged, 44, 8, 'bow', [[SW, 3], [CS, 1], [FE, 1], [ROPE, 1]], shoots(24, 20, 40, 4, Shot.Arrow)),
  loot(Res.DwarfWarAxe, R, GearKind.OneHanded, 30, 7, 'axe_war', [[STEEL, 3], [SW, 1], [LE, 1]], swings(18, 13, 120, Hit.Arc)),
  loot(Res.DwarfWarHammer, R, GearKind.Great, 64, 7, 'mace', [[STEEL, 3], [SW, 2]], swings(24, 18, 160, Hit.Arc, true)),
];

/** What the Workshop gives back for the Dreadnought's mace (s: carbon steel and hardwood, a little under a two-handed carbon steel piece twice over). */
const MACE_SCRAP: Cost = [[CS, 5], [HW, 2]];

/** A row's worth within its slot (plan 2.4: weapons by damage a second against one enemy, hundredths; armour by protection; wands by spell power, then mana and regain; robes by protection and regain together; shields by block; tools by tier). */
function specScore(g: Pick<GearSpec, 'slot' | 'tier' | 'melee' | 'melee2' | 'ranged' | 'wand' | 'robe' | 'armourBp' | 'blockBp' | 'tool'>): number {
  if (g.wand) return g.wand.powerPct * 1000 + g.wand.mana * 10 + (g.wand.regainPct ?? 0);
  if (g.robe) return (g.armourBp ?? 0) + g.robe.regainPct * 100;
  if (g.slot === Slot.Armour) return g.armourBp ?? 0;
  if (g.slot === Slot.Shield) return g.blockBp ?? 0;
  if (g.slot === Slot.Tool) return g.tier;
  if (g.ranged) return floorDiv(g.ranged.damage * 100 * STEPS_PER_SECOND, Math.max(1, g.ranged.attackSteps));
  const m = g.melee;
  if (!m) return 0;
  const two = g.melee2;
  if (two) return floorDiv((m.damage + two.damage) * 100 * STEPS_PER_SECOND, Math.max(1, m.attackSteps + two.attackSteps));
  return floorDiv(m.damage * 100 * STEPS_PER_SECOND, Math.max(1, m.attackSteps));
}

/** The ladder a kind of piece climbs, its gear ids by tier, or undefined. */
function ladderOf(kind: GearKind): readonly number[] | undefined {
  switch (kind) {
    case GearKind.OneHanded:
    case GearKind.Flail:
      return CLOSE_GEAR;
    case GearKind.Spear:
    case GearKind.Great:
      return LONG_GEAR;
    case GearKind.Ranged:
      return RANGER_GEAR;
    case GearKind.Wand:
      return WAND_GEAR;
    case GearKind.Shield:
      return SHIELD_GEAR;
    case GearKind.Armour:
      return ARMOUR_GEAR;
    case GearKind.Robe:
      return ROBE_GEAR;
  }
  return undefined;
}

/** The kit table a kind of piece goes on as, by tier, or undefined. */
function piecesOf(kind: GearKind): readonly Piece[] | undefined {
  switch (kind) {
    case GearKind.OneHanded:
    case GearKind.Flail:
      return CLOSE_KITS;
    case GearKind.Spear:
    case GearKind.Great:
      return LONG_KITS;
    case GearKind.Ranged:
      return RANGER_KITS;
    case GearKind.Wand:
      return WAND_KITS;
    case GearKind.Shield:
      return SHIELD_KITS;
    case GearKind.Armour:
      return ARMOUR_KITS;
    case GearKind.Robe:
      return ROBE_KITS;
  }
  return undefined;
}

/**
 * The tier of its line a piece counts as (its rung): the highest ladder tier
 * whose piece is no better by the numbers (specScore), and at least 1. So
 * Upgrade equipment and the kit's tiers rank it by its numbers, not its
 * material (plan 2.4): a goblin dagger counts as a copper short sword, the
 * fiend's cleaver as the basket-hilted broadsword.
 */
function rungOf(row: GearRow, kind: GearKind): number {
  const ladder = ladderOf(kind);
  if (!ladder) return row.tier;
  const score = specScore(row);
  let rung = 1;
  for (let t = 1; t < ladder.length; t++) if (ladder[t] && specScore(GEAR_LIST[ladder[t]!]!) <= score) rung = t;
  return rung;
}

/**
 * Gear rows of their own for the items that go on as a ladder piece (Patch
 * 5: the satyrs' obsidian hand-axe as the bronze shortsword; Patch 7: every
 * looted piece, as its rung's piece), each with its own name, look and (a
 * looted piece) numbers, so a unit keeps the item it was given: drawn and
 * named as itself, and back to stock as itself.
 */
const OWN_ROWS: Array<readonly [item: Res, gear: number]> = [];
function ownRow(item: Res, k: MeleeKit, model: string, heft: number): number {
  const id = add({ name: RESOURCES[item]!.name, slot: Slot.Weapon, tier: k.tier, model, melee: meleeStats(k, true, false), heft, item });
  OWN_ROWS.push([item, id]);
  return id;
}
/** The obsidian hand-axe in hand: the bronze shortsword's numbers, its own model, Heft 18 and common (plan 4.1). */
export const OBSIDIAN_AXE_GEAR: number = ownRow(Res.ObsidianHandAxe, CLOSE_KITS[4]!, 'obsidian_handaxe_held', 18);

/** A looted piece's gear row as written, or undefined for a piece that fits nobody. */
function lootRow(k: LootKit): GearRow | undefined {
  const sized = k.kind === GearKind.Armour || k.kind === GearKind.Robe ? { stature: k.size } : { heft: k.size };
  const base = { name: k.name, tier: k.tier, model: k.model, kind: k.kind, rarity: k.rarity, item: k.item, ...sized };
  if (k.melee) {
    const m = k.melee;
    const oneHanded = k.kind === GearKind.OneHanded || k.kind === GearKind.Flail;
    return { ...base, slot: Slot.Weapon, melee: { damage: m.damage, attackSteps: ds(m.swingDs), reach: cm(m.reachCm), hit: m.hit, blunt: m.blunt, oneHanded, crit: !oneHanded } };
  }
  if (k.ranged) {
    const r = k.ranged;
    return { ...base, slot: Slot.Ranged, ranged: { damage: r.damage, attackSteps: ds(r.attackDs), range: r.rangeM * WU_PER_METRE, spreadBp: r.spreadPct * 100, shot: r.shot, blunt: r.blunt } };
  }
  if (k.wand) return { ...base, slot: Slot.Weapon, melee: WAND_TAP, wand: { powerPct: k.wand.powerPct, mana: k.wand.mana, ...(k.wand.regainPct ? { regainPct: k.wand.regainPct } : {}) } };
  if (k.robe) return { ...base, slot: Slot.Armour, armourBp: k.robe.protectionPct * 100, robe: { regainPct: k.robe.regainPct } };
  if (k.blockPct !== undefined) return { ...base, slot: Slot.Shield, blockBp: k.blockPct * 100 };
  if (k.protectionPct !== undefined) return { ...base, slot: Slot.Armour, armourBp: k.protectionPct * 100 };
  return undefined;
}

/** Whether a Heft or Stature fits a body (FIT_RANGES). */
function sizeFits(body: Body, kind: GearKind, size: number): boolean {
  const f = FIT_RANGES[body]!;
  return kind === GearKind.Armour || kind === GearKind.Robe ? size >= f.statureMin && size <= f.statureMax : size >= f.heftMin && size <= f.heftMax;
}

/**
 * Each looted piece's gear row, in LOOT_KITS order (0 for a piece that fits
 * nobody). A piece a person can use joins its rung's ladder piece as one of
 * the items that go on as it, as the obsidian hand-axe joined the bronze
 * shortsword's: Equip, training and Upgrade equipment then put it on from
 * the stock like any ready item, as itself.
 */
export const LOOT_GEAR: readonly number[] = LOOT_KITS.map((k) => {
  const row = lootRow(k);
  if (!row) return 0;
  const rung = rungOf(row, k.kind);
  const id = add({ ...row, rung });
  OWN_ROWS.push([k.item, id]);
  const ladder = piecesOf(k.kind)?.[rung];
  if (ladder && sizeFits(Body.Person, k.kind, k.size)) (ladder.items as Res[]).push(k.item);
  return id;
});

/** The gear row of its own an item goes on as, or 0 when it takes its piece's row. */
export function ownGear(item: Res | undefined): number {
  return OWN_ROWS.find(([r]) => r === item)?.[1] ?? 0;
}

/** The item a gear row of its own is, or undefined. */
export function ownGearItem(gear: number): Res | undefined {
  return OWN_ROWS.find(([, g]) => g === gear)?.[0];
}

function capital(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Everything a unit can hold or wear, indexed by gear id. */
export const GEAR: readonly GearSpec[] = GEAR_LIST;

export function gearSpec(id: number): GearSpec {
  const g = GEAR[id];
  if (!g) throw new Error(`unknown gear ${id}`);
  return g;
}

/** A worker's or anyone's blow with a tool, or with nothing in hand (Table 1: fists 2; Table 2c worker damage). */
export function toolMelee(gear: number): MeleeStats {
  const hit = gear ? gearSpec(gear).toolHit : undefined;
  return { damage: hit?.damage ?? TOOL_KITS[0]!.damage, attackSteps: hit?.attackSteps ?? ds(15), reach: cm(120), hit: Hit.Stab, blunt: true, oneHanded: true, crit: false };
}

/** The tool tier a piece of gear gives a job (props.ts ToolJob), or Tool.None when it does not do that job. */
export function toolTierFor(gear: number, job: number): number {
  if (!gear) return Tool.None;
  const g = gearSpec(gear);
  return g.tool !== undefined && ((g.jobs ?? 0) & (1 << job)) !== 0 ? g.tool : Tool.None;
}


// ----- Patch 7: items, fit, ranking and scrapping -----

/** What the catalogue knows of a good that is a piece of gear. */
interface ItemInfo {
  kind: GearKind;
  rarity: Rarity;
  heft: number;
  /** Its Stature on a person and on the Dreadnought (the Fluted Gothic harness comes in his own look, plan 2.2). */
  stature: number;
  dreadStature: number;
  /** The gear row it goes on as on a person and on the Dreadnought (0 for none). */
  gear: number;
  dread: number;
  /** What the Workshop gives back for it. */
  scrap: Cost;
}

const ITEM_INFO = new Map<number, ItemInfo>();
function noteItem(item: Res | undefined, gear: number, scrap: Cost, dread = gear): void {
  if (item === undefined || ITEM_INFO.has(item)) return;
  const g = GEAR_LIST[gear || dread]!;
  ITEM_INFO.set(item, { kind: g.kind, rarity: g.rarity, heft: g.heft, stature: g.stature, dreadStature: GEAR_LIST[dread]!.stature, gear, dread, scrap });
}
// The Dreadnought's own mace and harness first, then every ladder piece (its whole main cost back, Patch 5), the obsidian hand-axe (the bronze shortsword's) and the looted pieces.
noteItem(Res.HeavySpikedMace, 0, MACE_SCRAP, DREADNOUGHT_GEAR.mace);
noteItem(Res.FlutedGothicHarness, ARMOUR_GEAR[TOP_TIER]!, scrapYield(ARMOUR_KITS[TOP_TIER]!), DREADNOUGHT_GEAR.plate);
const LADDERS: ReadonlyArray<readonly [readonly Piece[], readonly number[]]> = [
  [CLOSE_KITS, CLOSE_GEAR], [LONG_KITS, LONG_GEAR], [RANGER_KITS, RANGER_GEAR], [ARMOUR_KITS, ARMOUR_GEAR], [SHIELD_KITS, SHIELD_GEAR], [WAND_KITS, WAND_GEAR], [ROBE_KITS, ROBE_GEAR],
];
for (const [kits, gear] of LADDERS) {
  kits.forEach((k, t) => {
    if (gear[t]) noteItem(k.items[0], gear[t]!, scrapYield(k));
  });
}
noteItem(BRAWLER_KIT.items[0], PISTOL_GEAR, scrapYield(BRAWLER_KIT));
TOOL_KITS.forEach((k, t) => {
  if (t > 0) noteItem(k.items[0], TOOL_GEAR[t]![0]!, scrapYield(k));
});
noteItem(Res.ObsidianHandAxe, OBSIDIAN_AXE_GEAR, scrapYield(CLOSE_KITS[4]!));
LOOT_KITS.forEach((k, n) => {
  if (LOOT_GEAR[n]) noteItem(k.item, LOOT_GEAR[n]!, k.scrap);
  else {
    const worn = k.kind === GearKind.Armour || k.kind === GearKind.Robe;
    ITEM_INFO.set(k.item, { kind: k.kind, rarity: k.rarity, heft: worn ? 0 : k.size, stature: worn ? k.size : 0, dreadStature: worn ? k.size : 0, gear: 0, dread: 0, scrap: k.scrap });
  }
});

/** Every good that is a piece of gear (Patch 7: the ladder's, the looted pieces, the Dreadnought's mace, and those that fit nobody), in id order. */
export const GEAR_ITEMS: readonly Res[] = [...ITEM_INFO.keys()].sort((a, b) => a - b) as Res[];

/** Whether a good is a piece of gear. */
export function isGearItem(res: number): boolean {
  return ITEM_INFO.has(res);
}

/** A piece's kind (GearKind.None for a good that is not gear). */
export function itemKind(res: number): GearKind {
  return ITEM_INFO.get(res)?.kind ?? GearKind.None;
}

/** A piece's grade (common for a good that is not gear). */
export function itemRarity(res: number): Rarity {
  return ITEM_INFO.get(res)?.rarity ?? Rarity.Common;
}

/** A weapon's, wand's or shield's Heft (0 for armour, robes, tools and goods that are not gear). */
export function itemHeft(res: number): number {
  return ITEM_INFO.get(res)?.heft ?? 0;
}

/** An armour's or robe's Stature on a holder: the Fluted Gothic harness is 17 on a person and the Dreadnought's own on him (0 for weapons and goods that are not gear). */
export function itemStature(res: number, h?: KitHolder): number {
  const i = ITEM_INFO.get(res);
  if (!i) return 0;
  return h && isDreadHolder(h) ? i.dreadStature : i.stature;
}

/** The good a gear row is, which it comes off as (undefined for fists, "No armour" and the like). */
export function gearItem(gear: number): Res | undefined {
  return gear ? GEAR[gear]?.item : undefined;
}

/** The kit line a piece goes on (a ranger's bow, a mage's wand and a worker's tools are their Weapon line; a robe the Armour line), or -1. */
export function itemLine(res: number): Line | -1 {
  switch (itemKind(res)) {
    case GearKind.Armour:
    case GearKind.Robe:
      return Line.Armour;
    case GearKind.Shield:
      return Line.Shield;
    case GearKind.None:
      return -1;
  }
  return Line.Weapon;
}

function isDreadHolder(h: KitHolder): boolean {
  return h.kind === 'warrior' && h.troop === Troop.Dreadnought;
}

/** The body a holder's gear is sized for. */
export function bodyOf(h: KitHolder): Body {
  return isDreadHolder(h) ? Body.Dreadnought : Body.Person;
}

/** Why a piece's Heft or Stature keeps it off a holder's body, or ''. */
function sizeProblem(h: KitHolder, i: ItemInfo): string {
  if (i.kind === GearKind.Tools) return '';
  const body = bodyOf(h);
  const f = FIT_RANGES[body]!;
  const even = body === Body.Dreadnought ? ', even for a Dreadnought' : '';
  const forHim = body === Body.Dreadnought ? ' for a Dreadnought' : '';
  if (i.kind === GearKind.Armour || i.kind === GearKind.Robe) {
    const s = body === Body.Dreadnought ? i.dreadStature : i.stature;
    if (s > f.statureMax) return `Too big${even}: Stature ${s} (${f.statureMin} to ${f.statureMax} fits).`;
    if (s < f.statureMin) return `Too small${forHim}: Stature ${s} (${f.statureMin} to ${f.statureMax} fits).`;
    return '';
  }
  if (i.heft > f.heftMax) return `Too heavy${even}: Heft ${i.heft} (up to ${f.heftMax} fits).`;
  if (i.heft < f.heftMin) return `Too light${forHim}: Heft ${i.heft} (${f.heftMin} to ${f.heftMax} fits).`;
  return '';
}

/** Whether a troop type fights with long weapons: spears and two-handed area weapons (long melee, cavalry, the woodsman). */
function longLine(troop: number): boolean {
  return troop === Troop.Long || troop === Troop.Cavalry || troop === Troop.Woodsman;
}

/**
 * Why a piece cannot go on a holder, or '' when it can (plan 2.1 to 2.3):
 * the shown reason for a greyed choice and what the unit says. Who takes
 * what comes first (a robe is for mages, a shield for close melee), then
 * Heft and Stature. The Dreadnought offered any weapon but a two-handed area
 * one says SMASHING_LINE. A piece that fits nobody (plan 4.3) is kept off
 * every body by its own Heft or Stature.
 */
export function fitProblem(h: KitHolder, res: number): string {
  const i = ITEM_INFO.get(res);
  if (!i) return 'That is not something to wear or wield.';
  const k = i.kind;
  const weapon = k === GearKind.OneHanded || k === GearKind.Flail || k === GearKind.Spear || k === GearKind.Great || k === GearKind.Ranged || k === GearKind.Pistol || k === GearKind.Wand;
  const nobody = 'It fits no one: scrap it at the Workshop.';
  if (isDreadHolder(h)) {
    if (weapon && k !== GearKind.Great) return SMASHING_LINE;
    if (k === GearKind.Shield) return 'A Dreadnought carries no shield.';
    if (k === GearKind.Robe) return 'Only mages wear robes.';
    if (k === GearKind.Tools) return 'Only workers use tools.';
    return sizeProblem(h, i) || (i.dread ? '' : nobody);
  }
  if (h.kind === 'worker') return k === GearKind.Tools ? '' : 'A worker uses only tools.';
  if (k === GearKind.Tools) return 'Only workers use tools.';
  if (h.kind === 'mage') {
    if (k !== GearKind.Wand && k !== GearKind.Robe) return 'A mage uses only wands and robes.';
    return sizeProblem(h, i) || (i.gear ? '' : nobody);
  }
  if (k === GearKind.Wand) return 'Only mages use wands.';
  if (k === GearKind.Robe) return 'Only mages wear robes.';
  if (h.troop === Troop.Crew) return 'An artillery crewman carries no kit.';
  if (k === GearKind.Armour) {
    if (h.troop === Troop.Woodsman) return 'A woodsman wears no armour.';
  } else if (h.troop === Troop.Brawler) {
    return 'A brawler keeps the pistol and cutlass.';
  } else if (k === GearKind.Pistol) {
    return 'Only a brawler carries a pistol.';
  } else if (k === GearKind.Shield) {
    if (!hasShield(h.troop)) return 'Only swordsmen carry a shield.';
  } else if (k === GearKind.OneHanded || k === GearKind.Flail) {
    if (h.troop !== Troop.Close) return 'Only swordsmen use one-handed weapons and flails.';
  } else if (k === GearKind.Spear || k === GearKind.Great) {
    if (!longLine(h.troop)) return 'Only spearmen, riders and woodsmen use spears and two-handed weapons.';
  } else if (k === GearKind.Ranged && h.troop !== Troop.Ranger) {
    return 'Only rangers use bows and slings.';
  }
  return sizeProblem(h, i) || (i.gear ? '' : nobody);
}

/** Whether a piece can go on a holder (fitProblem is ''). */
export function fits(h: KitHolder, res: number): boolean {
  return fitProblem(h, res) === '';
}

/** The gear row a piece goes on as on a holder, or 0 when it cannot go on (fitProblem). */
export function itemGear(res: number, h: KitHolder): number {
  const i = ITEM_INFO.get(res);
  if (!i || fitProblem(h, res)) return 0;
  return isDreadHolder(h) ? i.dread : i.gear;
}

/** Whether the Dreadnought can hold a weapon (plan 2.3): a two-handed area weapon within his Heft. */
export function dreadnoughtTakes(res: number): boolean {
  const i = ITEM_INFO.get(res);
  return i !== undefined && i.kind === GearKind.Great && i.dread !== 0 && sizeFits(Body.Dreadnought, i.kind, i.heft);
}

/**
 * One number per gear row for "better" within a slot (plan 2.4): weapons by
 * damage a second against one enemy (hundredths; a weapon of two blows by
 * both together), in the Dreadnought's hands with his 1.5 times; armour by
 * protection; wands by spell power, then mana and regain; robes by
 * protection and regain together; shields by block; tools by tier.
 */
export function gearScore(gear: number, h?: KitHolder): number {
  if (!gear) return 0;
  const g = gearSpec(gear);
  const s = specScore(g);
  // In his hands a weapon's blows go smash (1.5 times) then sweep (its own damage), in turn: on average 1.25 times.
  return h && isDreadHolder(h) && g.melee && !g.wand && gear !== DREADNOUGHT_GEAR.mace ? floorDiv(s * (DREADNOUGHT_KIT.damagePm + 1000), 2000) : s;
}

/** A piece's score (gearScore) on a holder, whether or not it fits (0 for a piece that fits nobody); with no holder, on a person. */
export function itemScore(res: number, h?: KitHolder): number {
  const i = ITEM_INFO.get(res);
  if (!i) return 0;
  const row = h && isDreadHolder(h) ? i.dread || i.gear : i.gear || i.dread;
  return gearScore(row, h);
}

/** Pieces best first for a holder, by itemScore (the lower id first on a tie): the order menus list them in. */
export function bestFirst(h: KitHolder, items: readonly number[]): number[] {
  return [...items].sort((a, b) => itemScore(b, h) - itemScore(a, h) || a - b);
}

/** Seconds the Workshop takes to scrap a piece, by its grade (plan 6): common 10, rare 30, epic 90, legendary 180. */
export const SCRAP_SECONDS: readonly number[] = [10, 30, 90, 180];
/** Morvath's staff, the one exception (plan 6: 4 minutes). */
export const MORVATH_STAFF_SCRAP_SECONDS = 240;

/** Seconds the Workshop takes to scrap a piece. */
export function scrapSeconds(res: number): number {
  return res === Res.MorvathStaff ? MORVATH_STAFF_SCRAP_SECONDS : SCRAP_SECONDS[itemRarity(res)]!;
}

/** What the Workshop gives back for a piece: a ladder piece its whole main cost (Patch 5), a looted piece its row in LOOT_KITS (plan 6). */
export function scrapYieldOf(res: number): Cost {
  return ITEM_INFO.get(res)?.scrap ?? [];
}

/** Every piece of gear and what scrapping it gives, in id order: the Workshop's Scrap equipment recipes (buildings/recipes.ts). */
export function scrapItems(): Array<readonly [Res, Cost]> {
  return GEAR_ITEMS.map((r) => [r, scrapYieldOf(r)] as const);
}

// ----- a unit's kit -----

/** Whether a troop type carries a shield (close melee only, Jade; its own slot from Patch 5, GP-26). */
export function hasShield(troop: number): boolean {
  return troop === Troop.Close;
}

/** The lowest and highest weapon tiers a troop type has (close melee 0 to 8, long melee, rangers, cavalry and woodsmen 1 to 8, brawlers 8 only, crewmen their fists only). */
export function weaponTiers(troop: number): readonly [number, number] {
  if (troop === Troop.Close) return [0, TOP_TIER];
  if (troop === Troop.Brawler) return [TOP_TIER, TOP_TIER];
  if (troop === Troop.Crew || troop === Troop.Dreadnought) return [0, 0];
  return [1, TOP_TIER];
}

/** The weapon piece of a troop type at a tier (the brawler's whole pistol-and-cutlass kit), or undefined. */
export function weaponPiece(troop: number, tier: number): Piece | undefined {
  switch (troop) {
    case Troop.Close:
      return CLOSE_KITS[tier];
    case Troop.Long:
    case Troop.Cavalry:
    case Troop.Woodsman:
      return tier > 0 ? LONG_KITS[tier] : undefined;
    case Troop.Ranger:
      return tier > 0 ? RANGER_KITS[tier] : undefined;
    case Troop.Brawler:
      return tier === TOP_TIER ? BRAWLER_KIT : undefined;
  }
  return undefined;
}

/** The armour piece at an armour tier (none at tier 0), for every troop type. */
export function armourPieces(tier: number): Piece[] {
  const a = ARMOUR_KITS[tier];
  return a && tier > 0 ? [a] : [];
}

/** The shield piece of a troop type at a shield tier: close melee's only, none at tier 0. */
export function shieldPieces(troop: number, tier: number): Piece[] {
  const s = SHIELD_KITS[tier];
  return s && tier > 0 && hasShield(troop) ? [s] : [];
}

/**
 * Every piece of a troop's whole kit, in the order the stock pays for them:
 * the weapon, the armour, then the shield (Jade, GP-26: "Shield is the
 * lowest resource priority of weapons, armour, shield").
 */
export function troopPieces(troop: number, weapon: number, armourTier: number, shieldTier = 0): Piece[] {
  const w = weaponPiece(troop, weapon);
  return [...(w ? [w] : []), ...armourPieces(armourTier), ...shieldPieces(troop, shieldTier)];
}

/** Seconds to make a set of pieces. */
export function piecesTime(pieces: readonly Piece[]): number {
  let s = 0;
  for (const p of pieces) s += p.timeS;
  return s;
}

/** Steps to put a piece on: its time to make, or a fifth of it as a ready item (TRAINING.fitTimePm). */
export function pieceSteps(p: Piece, fromItem: boolean): number {
  const steps = p.timeS * STEPS_PER_SECOND;
  return fromItem ? floorDiv(steps * TRAINING.fitTimePm, 1000) : steps;
}

/** Steps to put on a set of pieces paid as `paid` says: a piece whose item was paid goes on in its fit time, the rest in their full time (Jade, GP-1). */
export function piecesSteps(pieces: readonly Piece[], paid: ReadonlyArray<readonly [number, number]>): number {
  let steps = 0;
  for (const p of pieces) steps += pieceSteps(p, p.items.some((r) => paid.some(([x, n]) => x === r && n > 0)));
  return steps;
}

/** Adds n of a resource to a summed cost. */
function addTo(cost: Array<[Res, number]>, r: Res, n: number): void {
  if (n <= 0) return;
  const at = cost.findIndex(([x]) => x === r);
  if (at >= 0) cost[at] = [r, cost[at]![1] + n];
  else cost.push([r, n]);
}

/** A plan's digit says the piece went on as a ready item when its way is this (Patch 5, GP-1); the item's place in the piece's list is in its eights. */
export const ITEM_WAY = 7;
/**
 * Each piece's digit in a plan's `ways`: the way (0 to 7), plus 8 times its
 * hardwood lumber, plus 64 times a bit per stand-in good used (spider silk,
 * obsidian, and from Patch 7 witchwood: the archstaff's five crystals take
 * five bits, so the digit is 4096 wide).
 */
const DIGIT = 4096;

/**
 * Goods that stand in for another in kit recipes only (Patch 7, plan 6):
 * witchwood for a mana crystal in wand and robe recipes. Elsewhere (the
 * Citadel, the Magi Sanctum, rank training) a crystal is a crystal.
 */
const KIT_STAND_INS = new Map<number, readonly Res[]>([[Res.ManaCrystal, [Res.ManaCrystal, Res.Witchwood]]]);

/** The kinds a good in a kit's cost stands for: its kit stand-ins (witchwood), else food-kinds.ts kindsOf ("lumber", rope or spider silk). */
export function kitKinds(r: number): readonly Res[] {
  return KIT_STAND_INS.get(r) ?? kindsOf(r);
}

/** How a set of pieces is paid: the summed cost, kind by kind, and the ways (a digit each, base DIGIT, first piece lowest). */
export interface KitPlan {
  cost: Cost;
  ways: number;
}

/**
 * How a set of pieces would be paid from a pool. A ready item in stock goes
 * on first (Patch 5, GP-1: "Using an item in the players inventory takes
 * priority to making one from scratch"); else each piece takes the first way
 * of paying that what is left covers, in turn. "Lumber" (either kind) is
 * taken a piece at a time from whichever kind is in larger stock, softwood
 * on a tie, and so is a good with stand-ins (rope or spider silk, flint or
 * obsidian, a mana crystal or witchwood), as food-kinds.ts payAny does. Returns the summed cost and which
 * way each piece took, or null when the pool cannot cover it. `held` is set
 * aside first (a troop's food, or what earlier units in the same click took).
 */
export function planPieces(pieces: readonly Piece[], pool: Int32Array, held: Cost = []): KitPlan | null {
  const left = new Map<number, number>();
  const have = (r: number): number => (left.has(r) ? left.get(r)! : pool[r]!);
  const haveOf = (r: number): number => {
    let n = 0;
    for (const k of kitKinds(r)) n += have(k);
    return n;
  };
  const cost: Array<[Res, number]> = [];
  const take = (r: Res, n: number): void => {
    left.set(r, have(r) - n);
    addTo(cost, r, n);
  };
  for (const [r, n] of held) left.set(r, have(r) - n);
  let code = 0;
  let mul = 1;
  for (const p of pieces) {
    // The best of its items in stock by the numbers (Patch 7, plan 2.4), the first listed on a tie.
    let item = -1;
    for (let k = 0; k < p.items.length; k++) if (have(p.items[k]!) > 0 && (item < 0 || itemScore(p.items[k]!) > itemScore(p.items[item]!))) item = k;
    if (item >= 0) {
      take(p.items[item]!, 1);
      code += (ITEM_WAY + 8 * item) * mul;
      mul *= DIGIT;
      continue;
    }
    const chosen = p.cost.findIndex((way) => way.every(([r, n]) => haveOf(r) >= n));
    if (chosen < 0) return null;
    let hard = 0;
    let subs = 0;
    let bit = 1;
    for (const [r, n] of p.cost[chosen]!) {
      const kinds = kitKinds(r);
      if (kinds.length === 1) {
        take(r, n);
        continue;
      }
      for (let k = 0; k < n; k++) {
        let best = kinds[0]!;
        for (const f of kinds) if (have(f) > have(best) || (have(f) === have(best) && f < best)) best = f;
        if (r === LU) {
          if (best === HW) hard++;
        } else {
          if (best !== kinds[0]) subs |= bit;
          bit *= 2;
        }
        take(best, 1);
      }
    }
    code += (chosen + 8 * hard + 64 * subs) * mul;
    mul *= DIGIT;
  }
  return { cost, ways: code };
}

/** Whether a plan put a set's piece on as a ready item (its digit's way is ITEM_WAY). */
export function fromItem(ways: number, piece = 0): boolean {
  let code = ways;
  for (let k = 0; k < piece; k++) code = floorDiv(code, DIGIT);
  return code % 8 === ITEM_WAY;
}

/** The ready item a plan put a set's piece on as, or undefined when it was made from materials. */
export function planItem(p: Piece, ways: number, piece = 0): Res | undefined {
  let code = ways;
  for (let k = 0; k < piece; k++) code = floorDiv(code, DIGIT);
  const digit = code % DIGIT;
  return digit % 8 === ITEM_WAY ? (p.items[floorDiv(digit, 8)] ?? p.items[0]) : undefined;
}

/** The cost of a set of pieces paid the ways a plan chose, kind by kind (to give it back); with 0, the first ways in softwood and the goods themselves. */
export function piecesCost(pieces: readonly Piece[], ways: number): Cost {
  const cost: Array<[Res, number]> = [];
  let code = ways;
  for (const p of pieces) {
    const digit = code % DIGIT;
    code = floorDiv(code, DIGIT);
    if (digit % 8 === ITEM_WAY) {
      const item = p.items[floorDiv(digit, 8)] ?? p.items[0];
      if (item !== undefined) addTo(cost, item, 1);
      continue;
    }
    const way = p.cost[digit % 8] ?? p.cost[0] ?? [];
    let hard = floorDiv(digit, 8) % 8;
    let subs = floorDiv(digit, 64);
    for (const [r, n] of way) {
      const kinds = kitKinds(r);
      if (r === LU) {
        const h = Math.min(hard, n);
        hard -= h;
        addTo(cost, HW, h);
        addTo(cost, SW, n - h);
      } else if (kinds.length === 1) {
        addTo(cost, r, n);
      } else {
        for (let k = 0; k < n; k++) {
          addTo(cost, kinds[subs % 2]!, 1);
          subs = floorDiv(subs, 2);
        }
      }
    }
  }
  return cost;
}

/** The first (main) way of paying a set of pieces, for the panel's cost line: "lumber" stays either kind. */
export function mainCost(pieces: readonly Piece[]): Cost {
  const cost: Array<[Res, number]> = [];
  for (const p of pieces) for (const [r, n] of p.cost[0] ?? []) addTo(cost, r, n);
  return cost;
}

/**
 * The materials a piece of gear gives back when it is scrapped at the
 * Workshop (Patch 5, GP-3): the piece's whole main cost, "lumber" as
 * softwood, so an item is worth what it cost to make (BL-11).
 */
export function scrapYield(p: Piece): Cost {
  const cost: Array<[Res, number]> = [];
  for (const [r, n] of p.cost[0] ?? []) addTo(cost, r === LU ? SW : r, n);
  return cost;
}

/**
 * Every item that goes on as a ladder piece, and that piece: its own, or
 * the piece of its rung (the obsidian hand-axe the bronze shortsword's;
 * Patch 7's looted pieces a person can use). The Workshop's scrap recipes
 * come from scrapItems.
 */
export function gearItemPieces(): Array<readonly [Res, Piece]> {
  const out: Array<readonly [Res, Piece]> = [];
  const tables: ReadonlyArray<readonly Piece[]> = [CLOSE_KITS, LONG_KITS, RANGER_KITS, [BRAWLER_KIT], ARMOUR_KITS, SHIELD_KITS, TOOL_KITS, WAND_KITS, ROBE_KITS];
  for (const t of tables) for (const p of t) for (const r of p.items) out.push([r, p]);
  return out.sort((x, y) => x[0] - y[0]);
}

/**
 * Why a piece cannot be had yet, or '': its tier's Forge step and research,
 * and its own research. `forge` is the metal step the player's town is at
 * (buildings/data.ts forgeStep): a Forge, then main base tiers.
 */
export function pieceProblem(p: Piece, research: number, forge: number, researchName: (r: Research) => string): string {
  const need = TIER_NEEDS[p.need]!;
  if (forge < need.forge) return forge === 0 ? 'Needs a Forge.' : `Needs a tier ${FORGE_STEP_BASE[need.forge]} main base.`;
  for (const r of [...need.research, ...(p.research ?? [])]) if (!hasResearch(research, r)) return `Needs ${researchName(r)} researched first.`;
  return '';
}

/**
 * Why a set of pieces cannot be had from a pool, or '': a piece with a ready
 * item in stock needs nothing (Patch 5: a dropped or rewarded item goes on
 * whatever the town has researched), the rest their Forge step and research.
 */
export function piecesProblem(pieces: readonly Piece[], pool: ArrayLike<number>, research: number, forge: number, researchName: (r: Research) => string): string {
  for (const p of pieces) {
    if (p.items.some((r) => (pool[r] ?? 0) > 0)) continue;
    const why = pieceProblem(p, research, forge, researchName);
    if (why) return why;
  }
  return '';
}

/**
 * A piece with a gear row of its own (a looted piece, the obsidian hand-axe)
 * stays in its slot while its line's tier is its rung and it is a kind the
 * slot takes; else the slot takes its tier's ladder row.
 */
function keepOwn(row: number, tier: number, ladder: number, ...kinds: GearKind[]): number {
  if (!row || ownGearItem(row) === undefined) return ladder;
  const g = GEAR[row]!;
  return g.rung === tier && kinds.includes(g.kind) ? row : ladder;
}

/**
 * Puts a unit's kit in its slots from its type and tiers: a troop's weapon,
 * ranged weapon, shield and armour; a worker's tool for each job; a mage's
 * wand and robe. Rangers fight close with their fists; the brawler with its
 * cutlass (the tier 8 close-melee row). A looted piece (or the obsidian
 * hand-axe) it wears stays on while its line's tier holds (Patch 7: in every
 * slot). The Dreadnought's weapon and armour are what he holds and wears
 * (Patch 7: his mace and harness when he is hired, units/dreadnought.ts),
 * never refilled here.
 */
export function applyKit(e: EntityStore, i: number, kind: 'worker' | 'warrior' | 'mage'): void {
  const w = e.wTier[i]!;
  const a = e.aTier[i]!;
  if (kind === 'worker') {
    const tools = TOOL_GEAR[w] ?? TOOL_GEAR[0]!;
    e.toolChop[i] = tools[ToolJob.Chop]!;
    e.toolBreak[i] = tools[ToolJob.Break]!;
    e.toolBuild[i] = tools[ToolJob.Build]!;
    e.toolCut[i] = tools[ToolJob.Cut]!;
    return;
  }
  if (kind === 'mage') {
    e.weapon[i] = keepOwn(e.weapon[i]!, w, WAND_GEAR[w] ?? 0, GearKind.Wand);
    e.armour[i] = keepOwn(e.armour[i]!, a, ROBE_GEAR[a] ?? 0, GearKind.Robe);
    e.ranged[i] = 0;
    e.shield[i] = 0;
    return;
  }
  const t = e.troop[i]!;
  if (t === Troop.Dreadnought) {
    e.shield[i] = 0;
    e.ranged[i] = 0;
    return;
  }
  e.armour[i] = keepOwn(e.armour[i]!, a, ARMOUR_GEAR[a] ?? 0, GearKind.Armour);
  e.shield[i] = hasShield(t) ? keepOwn(e.shield[i]!, e.sTier[i]!, SHIELD_GEAR[e.sTier[i]!] ?? 0, GearKind.Shield) : 0;
  const ranged = e.ranged[i]!;
  e.ranged[i] = 0;
  switch (t) {
    case Troop.Long:
    case Troop.Cavalry:
    case Troop.Woodsman:
      e.weapon[i] = keepOwn(e.weapon[i]!, w, LONG_GEAR[w] || CLOSE_GEAR[0]!, GearKind.Spear, GearKind.Great);
      break;
    case Troop.Ranger:
      e.weapon[i] = CLOSE_GEAR[0]!;
      e.ranged[i] = keepOwn(ranged, w, RANGER_GEAR[w] ?? 0, GearKind.Ranged);
      break;
    case Troop.Brawler:
      e.weapon[i] = CLOSE_GEAR[TOP_TIER]!;
      e.ranged[i] = PISTOL_GEAR;
      break;
    default:
      e.weapon[i] = keepOwn(e.weapon[i]!, w, CLOSE_GEAR[w] ?? CLOSE_GEAR[0]!, GearKind.OneHanded, GearKind.Flail);
  }
}

/** A short name for a troop's kit: "Bronze spear, leather jerkin", and close melee's shield: "…, wooden shield". */
export function kitName(troop: number, weapon: number, armourTier: number, shieldTier = 0): string {
  if (troop === Troop.Dreadnought) return `${DREADNOUGHT_KIT.mace}, ${DREADNOUGHT_KIT.plate.toLowerCase()}`;
  const w = weaponPiece(troop, weapon)?.name ?? 'Fists';
  const a = armourTier > 0 ? ARMOUR_KITS[armourTier]!.name.toLowerCase() : 'no armour';
  const s = hasShield(troop) && shieldTier > 0 ? `, ${SHIELD_KITS[shieldTier]!.name.toLowerCase()}` : '';
  return `${w}, ${a}${s}`;
}

// ----- upgrading -----

/** What an upgrade looks at: the unit's kind, troop type and tiers (weapon, armour, shield and poison tips), and each line's item when it has a gear row of its own. */
export interface KitHolder {
  kind: 'worker' | 'warrior' | 'mage';
  troop: number;
  w: number;
  a: number;
  s: number;
  t: number;
  /** The weapon line's item (a ranger's ranged weapon, a mage's wand), the armour's (a mage's robe) and the shield's, when it has a gear row of its own (a looted piece, the obsidian hand-axe): it goes back to stock as itself. */
  wItem?: Res;
  aItem?: Res;
  sItem?: Res;
}

/** A unit's kit as the kit rules see it, from its slots (gear.ts kitHolder leaves out the units with no kit of the player's). */
export function holderOf(e: EntityStore, i: number, kind: KitHolder['kind']): KitHolder {
  const troop = e.troop[i]!;
  const h: KitHolder = { kind, troop, w: e.wTier[i]!, a: e.aTier[i]!, s: e.sTier[i]!, t: e.tips[i]! };
  const wItem = ownGearItem(kind === 'warrior' && troop === Troop.Ranger ? e.ranged[i]! : e.weapon[i]!);
  const aItem = ownGearItem(e.armour[i]!);
  const sItem = ownGearItem(e.shield[i]!);
  if (wItem !== undefined) h.wItem = wItem;
  if (aItem !== undefined) h.aItem = aItem;
  if (sItem !== undefined) h.sItem = sItem;
  return h;
}

/** A line's item with a gear row of its own, or undefined. */
function ownItemOn(h: KitHolder, line: number): Res | undefined {
  if (line === Line.Weapon) return h.wItem;
  if (line === Line.Armour) return h.aItem;
  if (line === Line.Shield) return h.sItem;
  return undefined;
}

/** Whether a holder's ranged weapon takes poison tips: its own item's shot when it has one (a looted bow, Patch 7), else its tier's (takesTips). */
export function holderTakesTips(h: KitHolder): boolean {
  if (h.kind !== 'warrior' || h.troop !== Troop.Ranger) return false;
  const own = ownGear(h.wItem);
  if (own) {
    const shot = GEAR[own]!.ranged?.shot;
    return shot === Shot.Arrow || shot === Shot.Bolt;
  }
  return takesTips(h.troop, h.w);
}

/** A unit's kind as the kit rules see it, from its UnitKind (0 worker, 1 warrior, 5 mage). */
export function holderKind(unitKind: number): KitHolder['kind'] | undefined {
  if (unitKind === 0) return 'worker';
  if (unitKind === 1) return 'warrior';
  if (unitKind === 5) return 'mage';
  return undefined;
}

/**
 * The highest tier a line of a unit's kit goes to: 8 for troops and tools,
 * 6 for wands and robes, 5 for close melee's shields, 1 for a bow or
 * crossbow ranger's poison tips; 0 where there is no such line (a crewman
 * has none, a worker no armour).
 */
export function lineTop(h: KitHolder, line: number): number {
  if (h.kind === 'mage') return line === Line.Weapon || line === Line.Armour ? TOP_MAGE_TIER : 0;
  if (h.kind === 'worker') return line === Line.Weapon ? TOP_TIER : 0;
  if (h.troop === Troop.Crew || h.troop === Troop.Dreadnought) return 0;
  if (line === Line.Weapon) return h.troop === Troop.Brawler ? 0 : weaponTiers(h.troop)[1];
  if (line === Line.Shield) return hasShield(h.troop) ? TOP_SHIELD_TIER : 0;
  if (line === Line.Tips) return holderTakesTips(h) ? 1 : 0;
  // The woodsman wears no armour (Jade's WD-2).
  if (h.troop === Troop.Woodsman) return 0;
  return TOP_TIER;
}

/** A line's tier now. */
export function lineTier(h: KitHolder, line: number): number {
  if (line === Line.Weapon) return h.w;
  if (line === Line.Shield) return h.s;
  if (line === Line.Tips) return h.t;
  return h.a;
}

/** The piece a line has at a tier, or undefined. */
export function linePiece(h: KitHolder, line: number, tier: number): Piece | undefined {
  if (line === Line.Tips) return tier === 1 ? TIPS_KIT : undefined;
  if (h.kind === 'worker') return line === Line.Weapon ? TOOL_KITS[tier] : undefined;
  if (h.kind === 'mage') return line === Line.Weapon ? WAND_KITS[tier] : line === Line.Armour ? ROBE_KITS[tier] : undefined;
  if (line === Line.Shield) return hasShield(h.troop) ? SHIELD_KITS[tier] : undefined;
  return line === Line.Weapon ? weaponPiece(h.troop, tier) : ARMOUR_KITS[tier];
}

/** What raising a line to a tier pays for: the new piece. */
export function upgradePieces(h: KitHolder, line: number, to: number): Piece[] {
  const p = linePiece(h, line, to);
  return p ? [p] : [];
}

/** The item a line's piece goes to stock as when the unit takes it off for a better one (Patch 5, GP-3), or undefined at tier 0. */
export function replacedItem(h: KitHolder, line: number): Res | undefined {
  const from = lineTier(h, line);
  if (from === 0) return undefined;
  return ownItemOn(h, line) ?? linePiece(h, line, from)?.items[0];
}

/** The gear row a line's ladder piece is at a tier for a holder (a worker's tools by their chop row), or 0. */
function ladderRow(h: KitHolder, line: number, tier: number): number {
  if (line === Line.Tips) return 0;
  if (h.kind === 'worker') return line === Line.Weapon ? (TOOL_GEAR[tier]?.[0] ?? 0) : 0;
  if (h.kind === 'mage') return (line === Line.Weapon ? WAND_GEAR[tier] : line === Line.Armour ? ROBE_GEAR[tier] : 0) ?? 0;
  if (line === Line.Armour) return ARMOUR_GEAR[tier] ?? 0;
  if (line === Line.Shield) return hasShield(h.troop) ? (SHIELD_GEAR[tier] ?? 0) : 0;
  switch (h.troop) {
    case Troop.Close:
      return CLOSE_GEAR[tier] ?? 0;
    case Troop.Long:
    case Troop.Cavalry:
    case Troop.Woodsman:
      return LONG_GEAR[tier] ?? 0;
    case Troop.Ranger:
      return RANGER_GEAR[tier] ?? 0;
    case Troop.Brawler:
      return tier === TOP_TIER ? PISTOL_GEAR : 0;
  }
  return 0;
}

/** The score (gearScore) of what a line has on now: its own item's, else its tier's ladder piece's. */
export function lineScore(h: KitHolder, line: number): number {
  const own = ownItemOn(h, line);
  return own !== undefined ? itemScore(own, h) : gearScore(ladderRow(h, line, lineTier(h, line)), h);
}

/** Puts a gear row in the slot it goes in (weapon, ranged weapon, shield or armour; a tool kit goes on by its tier). */
export function putGearRow(e: EntityStore, i: number, gear: number): void {
  switch (GEAR[gear]?.slot) {
    case Slot.Weapon:
      e.weapon[i] = gear;
      break;
    case Slot.Ranged:
      e.ranged[i] = gear;
      break;
    case Slot.Shield:
      e.shield[i] = gear;
      break;
    case Slot.Armour:
      e.armour[i] = gear;
      break;
  }
}

/**
 * Puts on, as themselves, the items with gear rows of their own that a new
 * unit's kit was paid with (a looted piece, the obsidian hand-axe): call it
 * after the unit's kit is applied from its tiers.
 */
export function wearPaidItems(e: EntityStore, i: number, pieces: readonly Piece[], paid: ReadonlyArray<readonly [number, number]>): void {
  for (const p of pieces) {
    const own = p.items.find((r) => ownGear(r) !== 0 && paid.some(([q, n]) => q === r && n > 0));
    if (own !== undefined) putGearRow(e, i, ownGear(own));
  }
}

/**
 * Puts a piece on a unit at once, in its slot (Patch 7, the equip orders):
 * the line's tier becomes the piece's rung and the rest of the kit stays.
 * The Dreadnought's weapon or armour slot simply takes it. Returns what came
 * off (the piece it had, and a ranger's poison tips when the new weapon
 * takes none), for the caller to put in the bag or stock; null when it
 * cannot go on (fitProblem says why). The caller has checked the bag.
 */
export function wearItem(e: EntityStore, i: number, kind: KitHolder['kind'], res: Res): Res[] | null {
  const h = holderOf(e, i, kind);
  const gear = itemGear(res, h);
  if (!gear) return null;
  const line = itemLine(res);
  const off: Res[] = [];
  if (isDreadHolder(h)) {
    const slot = line === Line.Armour ? e.armour : e.weapon;
    const old = gearItem(slot[i]!);
    if (old !== undefined) off.push(old);
    slot[i] = gear;
    return off;
  }
  const old = replacedItem(h, line);
  if (old !== undefined) off.push(old);
  const rung = GEAR[gear]!.rung;
  if (line === Line.Weapon) e.wTier[i] = rung;
  else if (line === Line.Armour) e.aTier[i] = rung;
  else e.sTier[i] = rung;
  putGearRow(e, i, gear);
  applyKit(e, i, kind);
  if (e.tips[i]! > 0 && !holderTakesTips(holderOf(e, i, kind))) {
    e.tips[i] = 0;
    off.push(TIPS_KIT.items[0]!);
  }
  return off;
}

/**
 * Takes a line's piece off a unit (Patch 7, the equip orders): fists, no
 * armour, no shield, no tips; the Dreadnought's weapon or armour slot is
 * emptied. Returns what came off (with a ranger's poison tips when the bow
 * goes), or nothing where the line has no piece or cannot change (a
 * brawler's pistol and cutlass, a crewman's bare hands).
 */
export function takeOffLine(e: EntityStore, i: number, kind: KitHolder['kind'], line: number): Res[] {
  const h = holderOf(e, i, kind);
  if (isDreadHolder(h)) {
    const slot = line === Line.Armour ? e.armour : line === Line.Weapon ? e.weapon : undefined;
    const old = slot ? gearItem(slot[i]!) : undefined;
    if (!slot || old === undefined) return [];
    slot[i] = 0;
    return [old];
  }
  if (lineTop(h, line) === 0) return [];
  const old = replacedItem(h, line);
  if (old === undefined) return [];
  const off = [old];
  if (line === Line.Weapon) {
    e.wTier[i] = 0;
    e.weapon[i] = 0;
    e.ranged[i] = 0;
    if (e.tips[i]! > 0) {
      e.tips[i] = 0;
      off.push(TIPS_KIT.items[0]!);
    }
  } else if (line === Line.Armour) {
    e.aTier[i] = 0;
    e.armour[i] = 0;
  } else if (line === Line.Shield) {
    e.sTier[i] = 0;
    e.shield[i] = 0;
  } else {
    e.tips[i] = 0;
  }
  applyKit(e, i, kind);
  return off;
}

/**
 * Steps an upgrade to a tier takes. A ready item from stock goes on in a
 * fifth of its piece's time (GP-1); one made from materials takes 45% of the
 * new piece's time (GP-3), and never less than the new piece's time over the
 * old one's (BL-11), with a second at least.
 */
export function upgradeSteps(h: KitHolder, line: number, to: number, ways = 0): number {
  const p = linePiece(h, line, to);
  if (!p) return STEPS_PER_SECOND;
  if (fromItem(ways)) return Math.max(STEPS_PER_SECOND, pieceSteps(p, true));
  const steps = pieceSteps(p, false);
  const old = linePiece(h, line, lineTier(h, line));
  const over = steps - (old ? pieceSteps(old, false) : 0);
  return Math.max(STEPS_PER_SECOND, floorDiv(steps * TRAINING.upgradeTimePm, 1000), over);
}

/** The research a player has, the Forge step their town is at, and research names, for the needs. */
export interface TechView {
  research: number;
  forge: number;
  researchName: (r: Research) => string;
}

/** A line already at its best. */
const BEST_ALREADY = 'Already the best there is.';

/** Why a piece with no materials to make it from (poison tips) cannot go on: none in stock. */
function noneInStock(p: Piece): string {
  return `No ${p.name.toLowerCase()} in stock.`;
}

/**
 * Where an Upgrade button would take a line: the next tier (plain), or the
 * best tier (Max). A ready item in stock goes on at no cost and needs no
 * research, and is taken over making a piece unless a higher tier can be
 * made (Patch 5, GP-1); else the best tier researched and affordable.
 * Returns the tier and how it would be paid, or the reason it cannot.
 * `held` is what is already set aside from the pool (earlier units in the
 * same click). With `byScore` (Upgrade equipment, Patch 7 plan 2.4: pieces
 * ranked by their numbers, not their tier) a tier whose piece is no better
 * than what the line has on now is passed over.
 */
export function upgradeTarget(h: KitHolder, line: number, max: boolean, pool: Int32Array, tech: TechView, held: Cost = [], byScore = false): { to: number; plan: KitPlan } | { why: string } {
  const top = lineTop(h, line);
  const cur = lineTier(h, line);
  if (top === 0) {
    if (line === Line.Tips) return { why: 'Only a bow or crossbow takes poison tips.' };
    if (h.troop === Troop.Dreadnought) return { why: 'A Dreadnought changes his weapon and armour by hand, not by upgrades.' };
    return { why: h.troop === Troop.Brawler && line === Line.Weapon ? 'A brawler is tier 8 only.' : h.troop === Troop.Crew ? 'An artillery crewman has no kit to upgrade.' : 'Nothing to upgrade.' };
  }
  if (cur >= top) return { why: BEST_ALREADY };
  const now = byScore && line !== Line.Tips ? lineScore(h, line) : -1;
  let first = '';
  for (let to = max ? top : cur + 1; to > cur; to--) {
    const pieces = upgradePieces(h, line, to);
    const plan = planPieces(pieces, pool, held);
    if (now >= 0) {
      // What it would put on: the ready item the plan takes, else the tier's piece.
      const item = plan && pieces[0] ? planItem(pieces[0], plan.ways) : undefined;
      const score = item !== undefined ? itemScore(item, h) : gearScore(ladderRow(h, line, to), h);
      if (score <= now) {
        if (to === cur + 1 && !first) first = BEST_ALREADY;
        continue;
      }
    }
    // A ready item goes on whatever is researched.
    if (plan && fromItem(plan.ways)) return { to, plan };
    let why = '';
    for (const p of pieces) why ||= pieceProblem(p, tech.research, tech.forge, tech.researchName);
    if (!why) {
      if (plan) return { to, plan };
      why = pieces.length > 0 && pieces[0]!.cost.length === 0 ? noneInStock(pieces[0]!) : `Not enough resources (${costText(mainCost(pieces))}).`;
    }
    // The plain button's reason, or the next tier's under Max.
    if (to === cur + 1 || !first) first = why;
    if (to === cur + 1) return { why };
  }
  return { why: first || BEST_ALREADY };
}

/** A holder once its weapon line has gone to a tier, paid as a plan says: the ready item it takes, if it has a row of its own. */
function afterWeapon(h: KitHolder, to: number, plan: KitPlan): KitHolder {
  const out: KitHolder = { kind: h.kind, troop: h.troop, w: to, a: h.a, s: h.s, t: h.t };
  if (h.aItem !== undefined) out.aItem = h.aItem;
  if (h.sItem !== undefined) out.sItem = h.sItem;
  const p = linePiece(h, Line.Weapon, to);
  const item = p ? planItem(p, plan.ways) : undefined;
  if (item !== undefined && ownGear(item)) out.wItem = item;
  return out;
}

/** A unit as Upgrade equipment sees it: its id, kit and rank, and the lines it already has an upgrade on the way for (a bit per Line). */
export interface EquipmentHolder {
  id: number;
  h: KitHolder;
  rank: number;
  pending: number;
}

/** One unit's share of an Upgrade equipment press: the tier each line goes to (0: it stays) and how it is paid, by Line, or why none moves. */
export interface EquipmentPlan {
  id: number;
  to: number[];
  plans: Array<KitPlan | null>;
  why: string;
}

/** Reasons that only say a line has nowhere to go, which give way to a reason the player can do something about. */
const NOWHERE_TO_GO = new Set([BEST_ALREADY, 'Nothing to upgrade.', 'A brawler is tier 8 only.', 'Only a bow or crossbow takes poison tips.']);

/**
 * Upgrade equipment (Jade's Patch 2): one press raises every line of each
 * unit's kit to the best tier it can have: its weapon (a worker's tools, a
 * mage's wand), its armour (a mage's robe), close melee's shield and a bow
 * or crossbow ranger's poison tips, a ready item in stock first (Patch 5,
 * GP-1). Each line is done for every unit before the next, the highest rank
 * first, so a short stock buys weapons, then armour, then shields (GP-26:
 * the shield is the lowest priority). Patch 7 (plan 2.4): it ranks pieces
 * by their numbers, so a tier whose piece is no better than what a unit has
 * on is passed over (upgradeTarget's byScore). The sim pays exactly these
 * plans and the action menu shows them, so the two agree.
 */
export function equipmentPlans(units: readonly EquipmentHolder[], pool: Int32Array, tech: TechView): EquipmentPlan[] {
  const order = [...units].sort((a, b) => b.rank - a.rank || a.id - b.id);
  const held: Array<[Res, number]> = [];
  const hold = (cost: Cost): void => {
    for (const [r, n] of cost) addTo(held, r, n);
  };
  const plans: EquipmentPlan[] = order.map((u) => ({ id: u.id, to: KIT_LINES.map(() => 0), plans: KIT_LINES.map(() => null), why: '' }));
  const whys = order.map(() => KIT_LINES.map(() => ''));
  for (const line of KIT_LINES) {
    order.forEach((u, k) => {
      // Poison tips go on the bow the unit will have once its weapon upgrade is done (its own item if it is a looted one).
      const h = line === Line.Tips && plans[k]!.to[Line.Weapon]! > 0 ? afterWeapon(u.h, plans[k]!.to[Line.Weapon]!, plans[k]!.plans[Line.Weapon]!) : u.h;
      if (lineTop(h, line) === 0 && line !== Line.Weapon) return;
      if ((u.pending >> line) & 1) {
        whys[k]![line] = 'Already on the way to an upgrade.';
        return;
      }
      const t = upgradeTarget(h, line, true, pool, tech, held, true);
      if ('why' in t) {
        // Tips only matter where the player has some: a bow with none in stock is not a reason to show.
        if (line !== Line.Tips) whys[k]![line] = t.why;
        return;
      }
      hold(t.plan.cost);
      plans[k]!.to[line] = t.to;
      plans[k]!.plans[line] = t.plan;
    });
  }
  plans.forEach((p, k) => {
    if (p.to.some((to) => to > 0)) return;
    const ws = whys[k]!;
    p.why = ws.find((w) => w && !NOWHERE_TO_GO.has(w)) || ws.find((w) => w) || 'Nothing to upgrade.';
  });
  return plans;
}
