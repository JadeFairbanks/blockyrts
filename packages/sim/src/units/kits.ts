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
 * (DREADNOUGHT_KIT; units/dreadnought.ts).
 */
export const Troop = { None: 0, Close: 1, Long: 2, Ranger: 3, Brawler: 4, Cavalry: 5, Crew: 6, Dreadnought: 7 } as const;
export type Troop = (typeof Troop)[keyof typeof Troop];
/** The troop types a Barracks trains (the crewman is the Artillery workshop's). */
export const TROOP_TYPES: readonly Troop[] = [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler, Troop.Cavalry];
/**
 * The troop types' names where no weapon tier is known; a troop goes by its
 * weapon tier's name (TROOP_TIER_NAMES). Jade's Patch 5 (UI-11): "close
 * melee" and "long melee" are our words, never shown to the player, so the
 * two melee lines go by their best-known names here.
 */
export const TROOP_NAMES: readonly string[] = ['Warrior', 'Swordsman', 'Spearman', 'Ranger', 'Brawler', 'Cavalry', 'Artillery crewman', 'Dreadnought'];
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

const close = (tier: number, what: What, model: string, damage: number, swingDs: number, reachCm: number, hit: Hit, blunt: boolean, cost: Cost[], timeS: number): MeleeKit => ({
  tier, ...named(what), model, damage, swingDs, reachCm, hit, blunt, cost, timeS, need: tier,
});

/*
 * Times to make (Patch 5, Jade's BL-11): the higher tiers' weapons, armour
 * and shields are made faster, so the gap between low and high tier units
 * is smaller. Tier 1 keeps its time, and each tier above takes up to 15% off
 * in even steps (2.1% a tier, 15% at tier 8), rounded to the second and
 * never below the tier under it; a unit's training time drops by at most
 * 12%, its 45 s of training untouched.
 */

/** Close melee: a one-handed weapon and, from Patch 5, a shield of its own (SHIELD_KITS). Tier 0 is the fist fighter's fists. */
export const CLOSE_KITS: readonly MeleeKit[] = [
  close(0, 'Fists', '', 4, 12, 100, Hit.Stab, true, [[]], 0),
  close(1, Res.WoodenCudgel, 'club', 8, 13, 120, Hit.Arc, true, only([[ST, 3]]), 10),
  close(2, Res.FlintHandAxe, 'axe_war_flint', 10, 13, 120, Hit.Arc, false, only([[ST, 2], [FL, 1]]), 10),
  close(3, Res.CopperShortSword, 'sword_copper_short', 12, 13, 120, Hit.Arc, false, only([[CU, 1], [LU, 1]]), 19),
  // The satyrs' obsidian hand-axe goes on as a bronze shortsword (Patch 5, the Stone Circle goods).
  close(4, [Res.BronzeShortsword, Res.ObsidianHandAxe], 'sword_short@bronze', 16, 12, 120, Hit.Arc, false, only([[BZ, 2], [LU, 1], [LE, 1]]), 28),
  close(5, Res.WroughtIronSword, 'sword@iron_wrought', 21, 12, 120, Hit.Arc, false, only([[WI, 2], [LU, 1], [LE, 1]]), 28),
  close(6, Res.IronBroadsword, 'sword@iron_refined', 24, 12, 120, Hit.Arc, false, only([[IRON, 2], [LU, 1], [LE, 1]]), 28),
  close(7, Res.SteelSideSword, 'sword_steel@steel', 30, 12, 130, Hit.Arc, false, only([[STEEL, 3], [LU, 1], [LE, 1]]), 39),
  close(8, Res.BasketHiltedBroadsword, 'sword_basket_hilt', 36, 12, 130, Hit.Arc, false, only([[CS, 3], [LU, 1], [LE, 1]]), 51),
];

/**
 * Long melee and cavalry: a two-handed weapon, no shield, a slower swing,
 * no minimum range, and +30% in the outer third of reach (Jade). Indexed by
 * tier; tier 0 is empty (there is no long-melee fist fighter).
 */
export const LONG_KITS: readonly MeleeKit[] = [
  close(0, 'None', '', 0, 14, 0, Hit.Stab, false, [], 0),
  close(1, Res.FireHardenedSpear, 'spear_hardwood', 9, 14, 250, Hit.Stab, false, only([[ST, 4]]), 10),
  close(2, Res.FlintHeadedSpear, 'spear_flint', 12, 14, 250, Hit.Stab, false, only([[ST, 3], [FL, 1]]), 10),
  close(3, Res.CopperLeafBladeSpear, 'spear', 15, 14, 250, Hit.Stab, false, only([[CU, 1], [LU, 1]]), 19),
  close(4, Res.BronzeSpear, 'spear@bronze', 18, 14, 250, Hit.Stab, false, only([[BZ, 1], [LU, 1]]), 23),
  close(5, Res.CrudeIronSpear, 'spear_iron_crude', 28, 16, 250, Hit.Stab, false, only([[WI, 3], [LU, 2]]), 37),
  close(6, Res.IronPike, 'pike', 32, 16, 350, Hit.Stab, false, only([[IRON, 3], [LU, 2]]), 37),
  close(7, Res.SteelHalberd, 'halberd@steel', 38, 16, 250, Hit.Arc, false, only([[STEEL, 3], [LU, 2]]), 39),
  close(8, Res.Zweihander, 'zweihander', 45, 16, 200, Hit.Arc, false, only([[CS, 3], [LU, 2]]), 51),
];

/** A hit in the outer third of a long weapon's reach is a critical (s), for +30% (Jade). */
export const CRIT = { outerPm: 333, bonusPct: 30 };

// ----- Table 2e: ranged -----

const ranged = (tier: number, what: What, model: string, damage: number, attackDs: number, rangeM: number, spreadPct: number, shot: Shot, blunt: boolean, cost: Cost[], timeS: number, research: Research[] = []): RangedKit => ({
  tier, ...named(what), model, damage, attackDs, rangeM, spreadPct, shot, blunt, cost, timeS, need: tier, ...(research.length ? { research } : {}),
});

/** A recurve bow with arrowheads of one metal (Table 2e: 3 lumber, 1 sinew or flax, 1 ingot, 1 feather). */
const recurve = (tier: number, what: Res, damage: number, ingot: Res): RangedKit =>
  ranged(tier, what, 'bow_recurve', damage, 20, 25, 6, Shot.Arrow, false, ways([[ingot, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 34);

/**
 * The ranger: one ladder with deliberate repeats (Jade): a sling, a yew
 * longbow, the same recurve bow at 3 to 6 with better arrowheads, the
 * crossbow at 7 and the musket at 8. Ammunition is unlimited (Jade), and
 * every gunpowder weapon takes lead ore for it (Patch 5, Jade: a musket 2).
 */
export const RANGER_KITS: readonly RangedKit[] = [
  ranged(0, 'None', '', 0, 20, 0, 0, Shot.Arrow, false, [], 0),
  ranged(1, Res.LeatherSling, 'sling', 8, 20, 20, 8, Shot.SlingStone, true, [[[LE, 1]], [[FX, 1]]], 10),
  ranged(2, Res.YewLongbow, 'bow', 10, 20, 25, 6, Shot.Arrow, false, ways([[FL, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 34),
  recurve(3, Res.RecurveBowCopper, 12, CU),
  recurve(4, Res.RecurveBowBronze, 13, BZ),
  recurve(5, Res.RecurveBowWroughtIron, 15, WI),
  recurve(6, Res.RecurveBowIron, 16, IRON),
  ranged(7, Res.SteelProdCrossbow, 'crossbow_steel@steel', 40, 45, 34, 3, Shot.Bolt, false, only([[STEEL, 3], [WI, 1], [PL, 2], [FX, 1], [LU, 1], [FE, 1]]), 65, [Research.Crossbows]),
  ranged(8, Res.FlintlockMusket, 'musket', 60, 80, 40, 4, Shot.MusketBall, false, only([[CS, 1], [PL, 2], [FL, 1], [GP, 1], [LEAD, 2]]), 77, [Research.Gunpowder, Research.Muskets]),
];

/** The brawler, tier 8 only: a flintlock pistol and a cutlass (the tier 8 close-melee row), one kit (Table 2e), with 1 lead ore (Patch 5). */
export const BRAWLER_KIT: RangedKit = ranged(8, Res.FlintlockPistol, 'pistol', 40, 60, 15, 6, Shot.MusketBall, false, only([[CS, 4], [PL, 1], [FL, 1], [LU, 1], [LE, 1], [GP, 1], [LEAD, 1]]), 102, [
  Research.Gunpowder,
  Research.Muskets,
]);

// ----- Table 3: armour and shields -----

const armour = (tier: number, what: What, model: string, protectionPct: number, cost: Cost[], timeS: number): ArmourKit => ({ tier, ...named(what), model, protectionPct, cost, timeS, need: tier });

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

const shield = (tier: number, what: What, model: string, need: number, blockPct: number, cost: Cost[], timeS: number): ShieldKit => ({
  tier, ...named(what), model, blockPct, cost, timeS, need,
});

/**
 * Close melee's shields (Table 3), their own slot from Patch 5 (Jade,
 * GP-26: "Shields are now an equipment slot for all close melee units (and
 * only close melee units)"), drawn on the unit. Each needs the material tier
 * it once came with in the armour (`need`): shield tech lags on purpose.
 */
export const SHIELD_KITS: readonly ShieldKit[] = [
  shield(0, 'No shield', '', 0, 0, [[]], 0),
  shield(1, Res.WoodenShield, 'shield_wood', 1, 15, only([[PL, 3], [LE, 1]]), 20),
  shield(2, Res.BoiledLeatherTarge, 'shield_targe', 3, 20, only([[PL, 3], [HL, 1]]), 24),
  shield(3, Res.IronRimmedHeaterShield, 'shield_iron_kite@iron_refined', 6, 25, only([[IRON, 3], [PL, 1], [LE, 1]]), 36),
  shield(4, Res.SteelHeaterShield, 'shield_steel_heater@steel', 7, 30, only([[STEEL, 3], [LE, 1]]), 39),
  shield(5, Res.SteelRotella, 'shield_rotella', 8, 30, only([[CS, 3], [LE, 1]]), 39),
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

const wand = (tier: number, what: What, model: string, powerPct: number, mana: number, cost: Cost, timeS: number): WandKit => ({
  tier, ...named(what), model, powerPct, mana, cost: only(cost), timeS, need: MAGE_NEED[tier]!,
});
const robe = (tier: number, what: What, model: string, protectionPct: number, regainPct: number, cost: Cost, timeS: number): RobeKit => ({
  tier, ...named(what), model, protectionPct, regainPct, cost: only(cost), timeS, need: MAGE_NEED[tier]!,
});

/** Mages' wands (Jade: their own ladder; names and numbers (s)): the wand sets spell power and the mana bar. */
export const WAND_KITS: readonly WandKit[] = [
  wand(0, 'No wand', '', 100, 0, [], 0),
  wand(1, Res.HazelWand, 'wand', 100, 0, [[ST, 5]], 10),
  wand(2, Res.CopperTippedWand, 'wand_acolyte', 105, 10, [[ST, 5], [CU, 1]], 20),
  wand(3, Res.BronzeBoundStaff, 'wand_adept_acolyte', 110, 20, [[LU, 2], [BZ, 2]], 30),
  wand(4, Res.IronShodStaff, 'wand_mage', 115, 30, [[LU, 2], [IRON, 2]], 30),
  wand(5, Res.CrystalStaff, 'wand_master_mage', 120, 40, [[LU, 2], [STEEL, 2], [MC, 2]], 45),
  wand(6, Res.Archstaff, 'wand_grand_magician', 125, 50, [[LU, 2], [CS, 2], [MC, 5]], 60),
];

/** Mages' robes: the robe sets protection and mana regain. Each tier is drawn as the mage's robe look, mage_battle_<tier> or mage_support_<tier> (client units-view.ts). */
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
  /** Wands: spell power and extra mana; robes: extra mana regain (Table 13). */
  wand?: { powerPct: number; mana: number };
  robe?: { regainPct: number };
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

const GEAR_LIST: GearSpec[] = [{ id: 0, name: 'Nothing', slot: Slot.Tool, tier: 0, model: '' }];
function add(g: Omit<GearSpec, 'id'>): number {
  const id = GEAR_LIST.length;
  GEAR_LIST.push({ ...g, id });
  return id;
}

/**
 * The peoples' own gear (Table 11, Table 19; never made by players): kept as
 * they were, with the arrowheads they shot folded into the bow (the Halfling
 * shortbow's wrought iron, the Elf longbow's carbon steel, the Dwarf
 * crossbow's steel bolts), their armour and helmet as one, and no backup
 * weapon: their archers fight with their old backup weapon in hand.
 */
export const PeopleGear = {
  Shortbow: add({ name: 'Halfling shortbow', slot: Slot.Ranged, tier: 5, model: 'halfling_shortbow', ranged: { damage: 14, attackSteps: ds(20), range: cm(2000), spreadBp: 600, shot: Shot.Arrow, blunt: false } }),
  Shortsword: add({ name: 'Halfling shortsword', slot: Slot.Weapon, tier: 5, model: 'halfling_shortsword', melee: { damage: 16, attackSteps: ds(11), reach: cm(110), hit: Hit.Arc, blunt: false, oneHanded: true, crit: false } }),
  Buckler: add({ name: 'Halfling buckler', slot: Slot.Shield, tier: 2, model: 'halfling_buckler', blockBp: 1000 }),
  HalflingHelm: add({ name: 'Halfling iron cap', slot: Slot.Armour, tier: 5, model: 'helmet_iron_nasal', armourBp: 500 }),
  Glaive: add({ name: 'Elf glaive', slot: Slot.Weapon, tier: 8, model: 'halberd', melee: { damage: 45, attackSteps: ds(16), reach: cm(250), hit: Hit.Arc, blunt: false, oneHanded: false, crit: true } }),
  ElfLongbow: add({ name: 'Elf longbow', slot: Slot.Ranged, tier: 8, model: 'bow', ranged: { damage: 24, attackSteps: ds(20), range: cm(4000), spreadBp: 400, shot: Shot.Arrow, blunt: false } }),
  Leathers: add({ name: 'Leather armour', slot: Slot.Armour, tier: 2, model: 'armour_leather', armourBp: 1500 }),
  DwarfWarAxe: add({ name: 'Dwarf war axe', slot: Slot.Weapon, tier: 7, model: 'axe_war', melee: { damage: 26, attackSteps: ds(13), reach: cm(120), hit: Hit.Arc, blunt: false, oneHanded: true, crit: false } }),
  DwarfWarHammer: add({ name: 'Dwarf war hammer', slot: Slot.Weapon, tier: 7, model: 'mace', melee: { damage: 34, attackSteps: ds(18), reach: cm(160), hit: Hit.Arc, blunt: true, oneHanded: false, crit: false } }),
  DwarfCrossbow: add({ name: 'Dwarf crossbow', slot: Slot.Ranged, tier: 7, model: 'crossbow', ranged: { damage: 30, attackSteps: ds(30), range: cm(2800), spreadBp: 400, shot: Shot.Bolt, blunt: false } }),
  DwarfPlate: add({ name: 'Dwarf plate and sallet', slot: Slot.Armour, tier: 7, model: 'armour_steel_plate', armourBp: 6200 }),
  DwarfMail: add({ name: 'Dwarf mail and sallet', slot: Slot.Armour, tier: 5, model: 'armour_iron_mail', armourBp: 4700 }),
} as const;

/** Gear ids by tier for each table. */
export const CLOSE_GEAR: readonly number[] = CLOSE_KITS.map((k) => add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: meleeStats(k, true, false) }));
export const LONG_GEAR: readonly number[] = LONG_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: meleeStats(k, false, true) })));
export const RANGER_GEAR: readonly number[] = RANGER_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Ranged, tier: k.tier, model: k.model, ranged: rangedStats(k) })));
export const PISTOL_GEAR: number = add({ name: 'Flintlock pistol', slot: Slot.Ranged, tier: 8, model: BRAWLER_KIT.model, ranged: rangedStats(BRAWLER_KIT) });
export const ARMOUR_GEAR: readonly number[] = ARMOUR_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Armour, tier: k.tier, model: k.model, armourBp: k.protectionPct * 100 })));
export const SHIELD_GEAR: readonly number[] = SHIELD_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Shield, tier: k.need, model: k.model, blockBp: k.blockPct * 100 })));
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
    out.push(add({ name: single ? capital(k.names[j]!) : k.name, slot: Slot.Tool, tier: k.tier, model: k.models[j]!, tool: k.tools[j]!, jobs, toolHit: { damage: k.damage, attackSteps: ds(15) } }));
  }
  return out;
});
export const WAND_GEAR: readonly number[] = WAND_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Weapon, tier: k.tier, model: k.model, melee: WAND_TAP, wand: { powerPct: k.powerPct, mana: k.mana } })));
export const ROBE_GEAR: readonly number[] = ROBE_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Armour, tier: k.tier, model: k.model, armourBp: k.protectionPct * 100, robe: { regainPct: k.regainPct } })));

/** A blow of the Dreadnought's: damage, how it hits, and where in its clip it strikes. */
export interface DreadnoughtBlow {
  damage: number;
  hit: Hit;
  /** Tenths of a second from the swing's start to the blow. */
  landDs: number;
}

/**
 * The Dreadnought's kit (Patch 5, Jade, GP-21): the heavy mace and the plate
 * of his model, never upgraded or switched (no shield). He attacks every 3
 * s, a smash (single target, 140) then a swing (every enemy in the arc in
 * front of him, 70), in turn. His armour is in line with high carbon steel:
 * the tier 8 row's protection. The reach (s) suits his 2.5 m height; each
 * blow lands where its clip strikes (s): the smash as the mace comes down,
 * the swing half way through its clip, where its crescent shows.
 */
export const DREADNOUGHT_KIT = {
  mace: 'Heavy spiked mace',
  plate: 'Dreadnought plate',
  attackDs: 30,
  reachCm: 200,
  smash: { damage: 140, hit: Hit.Stab, landDs: 9 } as DreadnoughtBlow,
  swing: { damage: 70, hit: Hit.Sweep, landDs: 9 } as DreadnoughtBlow,
  armourTier: TOP_TIER,
};

const dreadBlow = (b: DreadnoughtBlow): MeleeStats => ({
  damage: b.damage, attackSteps: ds(DREADNOUGHT_KIT.attackDs), reach: cm(DREADNOUGHT_KIT.reachCm), hit: b.hit, blunt: true, oneHanded: false, crit: false, landSteps: ds(b.landDs),
});

/** The armour row his plate matches (DREADNOUGHT_KIT.armourTier, held to the ladder). */
export function dreadnoughtArmour(): ArmourKit {
  return ARMOUR_KITS[Math.max(0, Math.min(TOP_TIER, DREADNOUGHT_KIT.armourTier))]!;
}

/** The Dreadnought's gear: drawn as part of his own model (heavy_knight), so neither has a model of its own. */
export const DREADNOUGHT_GEAR = {
  mace: add({ name: DREADNOUGHT_KIT.mace, slot: Slot.Weapon, tier: TOP_TIER, model: '', melee: dreadBlow(DREADNOUGHT_KIT.smash), melee2: dreadBlow(DREADNOUGHT_KIT.swing) }),
  plate: add({ name: DREADNOUGHT_KIT.plate, slot: Slot.Armour, tier: TOP_TIER, model: '', armourBp: dreadnoughtArmour().protectionPct * 100 }),
} as const;

/** atkWith while a weapon's second blow (GearSpec.melee2) swings: past the slots. */
export const SECOND_BLOW = 5;

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

// ----- a unit's kit -----

/** Whether a troop type carries a shield (close melee only, Jade; its own slot from Patch 5, GP-26). */
export function hasShield(troop: number): boolean {
  return troop === Troop.Close;
}

/** The lowest and highest weapon tiers a troop type has (close melee 0 to 8, long melee, rangers and cavalry 1 to 8, brawlers 8 only, crewmen their fists only). */
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
/** Each piece's digit in a plan's `ways`: the way (0 to 7), plus 8 times its hardwood lumber, plus 64 times a bit per stand-in good used (spider silk, obsidian). */
const DIGIT = 1024;

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
 * obsidian), as food-kinds.ts payAny does. Returns the summed cost and which
 * way each piece took, or null when the pool cannot cover it. `held` is set
 * aside first (a troop's food, or what earlier units in the same click took).
 */
export function planPieces(pieces: readonly Piece[], pool: Int32Array, held: Cost = []): KitPlan | null {
  const left = new Map<number, number>();
  const have = (r: number): number => (left.has(r) ? left.get(r)! : pool[r]!);
  const haveOf = (r: number): number => {
    let n = 0;
    for (const k of kindsOf(r)) n += have(k);
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
    const item = p.items.findIndex((r) => have(r) > 0);
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
      const kinds = kindsOf(r);
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
      const kinds = kindsOf(r);
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

/** Every gear item and the piece it goes on as (its own piece; the obsidian hand-axe the bronze shortsword's), for the Workshop's Scrap equipment. */
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
 * Puts a unit's kit in its slots from its type and tiers: a troop's weapon,
 * ranged weapon, shield and armour; a worker's tool for each job; a mage's
 * wand and robe. Rangers fight close with their fists; the brawler with its
 * cutlass (the tier 8 close-melee row).
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
    e.weapon[i] = WAND_GEAR[w] ?? 0;
    e.armour[i] = ROBE_GEAR[a] ?? 0;
    e.ranged[i] = 0;
    e.shield[i] = 0;
    return;
  }
  const t = e.troop[i]!;
  if (t === Troop.Dreadnought) {
    e.weapon[i] = DREADNOUGHT_GEAR.mace;
    e.armour[i] = DREADNOUGHT_GEAR.plate;
    e.shield[i] = 0;
    e.ranged[i] = 0;
    return;
  }
  e.armour[i] = ARMOUR_GEAR[a] ?? 0;
  e.shield[i] = hasShield(t) ? (SHIELD_GEAR[e.sTier[i]!] ?? 0) : 0;
  e.ranged[i] = 0;
  switch (t) {
    case Troop.Long:
    case Troop.Cavalry:
      e.weapon[i] = LONG_GEAR[w] || CLOSE_GEAR[0]!;
      break;
    case Troop.Ranger:
      e.weapon[i] = CLOSE_GEAR[0]!;
      e.ranged[i] = RANGER_GEAR[w] ?? 0;
      break;
    case Troop.Brawler:
      e.weapon[i] = CLOSE_GEAR[TOP_TIER]!;
      e.ranged[i] = PISTOL_GEAR;
      break;
    default:
      e.weapon[i] = CLOSE_GEAR[w] ?? CLOSE_GEAR[0]!;
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

/** What an upgrade looks at: the unit's kind, troop type and tiers (weapon, armour, shield and poison tips). */
export interface KitHolder {
  kind: 'worker' | 'warrior' | 'mage';
  troop: number;
  w: number;
  a: number;
  s: number;
  t: number;
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
  if (line === Line.Tips) return takesTips(h.troop, h.w) ? 1 : 0;
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
  return from > 0 ? linePiece(h, line, from)?.items[0] : undefined;
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
 * same click).
 */
export function upgradeTarget(h: KitHolder, line: number, max: boolean, pool: Int32Array, tech: TechView, held: Cost = []): { to: number; plan: KitPlan } | { why: string } {
  const top = lineTop(h, line);
  const cur = lineTier(h, line);
  if (top === 0) {
    if (line === Line.Tips) return { why: 'Only a bow or crossbow takes poison tips.' };
    if (h.troop === Troop.Dreadnought) return { why: 'A Dreadnought keeps the mace and plate he came with.' };
    return { why: h.troop === Troop.Brawler && line === Line.Weapon ? 'A brawler is tier 8 only.' : h.troop === Troop.Crew ? 'An artillery crewman has no kit to upgrade.' : 'Nothing to upgrade.' };
  }
  if (cur >= top) return { why: 'Already the best there is.' };
  let first = '';
  for (let to = max ? top : cur + 1; to > cur; to--) {
    const pieces = upgradePieces(h, line, to);
    const plan = planPieces(pieces, pool, held);
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
  return { why: first };
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
const NOWHERE_TO_GO = new Set(['Already the best there is.', 'Nothing to upgrade.', 'A brawler is tier 8 only.', 'Only a bow or crossbow takes poison tips.']);

/**
 * Upgrade equipment (Jade's Patch 2): one press raises every line of each
 * unit's kit to the best tier it can have: its weapon (a worker's tools, a
 * mage's wand), its armour (a mage's robe), close melee's shield and a bow
 * or crossbow ranger's poison tips, a ready item in stock first (Patch 5,
 * GP-1). Each line is done for every unit before the next, the highest rank
 * first, so a short stock buys weapons, then armour, then shields (GP-26:
 * the shield is the lowest priority). The sim pays exactly these plans and
 * the action menu shows them, so the two agree.
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
      // Poison tips go on the bow the unit will have once its weapon upgrade is done.
      const h = line === Line.Tips && plans[k]!.to[Line.Weapon]! > 0 ? { ...u.h, w: plans[k]!.to[Line.Weapon]! } : u.h;
      if (lineTop(h, line) === 0 && line !== Line.Weapon) return;
      if ((u.pending >> line) & 1) {
        whys[k]![line] = 'Already on the way to an upgrade.';
        return;
      }
      const t = upgradeTarget(h, line, true, pool, tech, held);
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
