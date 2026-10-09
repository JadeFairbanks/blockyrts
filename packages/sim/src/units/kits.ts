// Troops and gear (Troops and gear, agreed 2026-10-03; Tables 2c, 2d, 2e,
// 3, 7 and 13). There are no items: a troop is one of five types for good,
// with a weapon tier and an armour tier; a worker has one tool kit tier; a
// mage a wand tier and a robe tier. Each tier's piece of kit has its stats,
// its cost (the old item recipes carried across, summed, no tuning), its
// time to make and what it needs. A unit pays a kit when it is trained and
// a piece again when it is upgraded.
//
// The kit tables are plain rows the balance editor reads. From them this
// module builds the gear catalogue: one row per thing a unit can hold or
// wear, with its combat stats in sim units, so a unit's slots (weapon,
// ranged, shield, armour, a tool per job) hold gear ids as before. The
// peoples' own gear (Table 11, Table 19) sits at the front of the catalogue.

import { costText, Res, type Cost } from '../economy/resources.ts';
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

/** Which line of kit an upgrade raises: a troop's weapon or armour, a worker's tools, a mage's wand or robe. */
export const Line = { Weapon: 0, Armour: 1 } as const;
export type Line = (typeof Line)[keyof typeof Line];

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

/** One piece of kit at one tier: a weapon, an armour, a shield, a tool kit, a wand or a robe. */
export interface Piece {
  tier: number;
  name: string;
  /**
   * The catalogue model it shows as on the unit, `<id>@<metal>` for a metal
   * tier's texture (sword@iron_wrought), and the pieces worn together joined
   * by `+` (an armour tier's body, helmet and boots). Every piece is drawn
   * (Patch 5: no invisible gear).
   */
  model: string;
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

/** A close-melee shield (Table 3), carried from this armour tier up to the next shield's. */
export interface ShieldKit extends Piece {
  fromArmour: number;
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
/** Lead ore (Jade, Patch 5 decisions 2.5): in every gunpowder weapon, more in the bigger ones; the musket 2, the brawler's pistol 1. */
const PB = Res.LeadOre;
const MC = Res.ManaCrystal;

/** Every way of paying `base` plus one resource from each choice ("1 sinew or flax"). */
function ways(base: Cost, ...choices: ReadonlyArray<ReadonlyArray<readonly [Res, number]>>): Cost[] {
  let out: Cost[] = [base];
  for (const c of choices) out = out.flatMap((w) => c.map((x): Cost => [...w, x]));
  return out;
}

/** A cost with no alternatives. */
const only = (c: Cost): Cost[] => [c];

// ----- Table 2d: melee -----

const close = (tier: number, name: string, model: string, damage: number, swingDs: number, reachCm: number, hit: Hit, blunt: boolean, cost: Cost[], timeS: number): MeleeKit => ({
  tier, name, model, damage, swingDs, reachCm, hit, blunt, cost, timeS, need: tier,
});

/** Close melee: a one-handed weapon; the shield comes with the armour (Table 3). Tier 0 is the fist fighter's fists. */
export const CLOSE_KITS: readonly MeleeKit[] = [
  close(0, 'Fists', '', 4, 12, 100, Hit.Stab, true, [[]], 0),
  close(1, 'Wooden cudgel', 'club', 8, 13, 120, Hit.Arc, true, only([[ST, 3]]), 10),
  close(2, 'Flint hand-axe', 'axe_war_flint', 10, 13, 120, Hit.Arc, false, only([[ST, 2], [FL, 1]]), 10),
  close(3, 'Copper short sword', 'axe_war@copper', 12, 13, 120, Hit.Arc, false, only([[CU, 1], [LU, 1]]), 20),
  close(4, 'Bronze shortsword', 'sword_short@bronze', 16, 12, 120, Hit.Arc, false, only([[BZ, 2], [LU, 1], [LE, 1]]), 30),
  close(5, 'Wrought iron sword', 'sword@iron_wrought', 21, 12, 120, Hit.Arc, false, only([[WI, 2], [LU, 1], [LE, 1]]), 30),
  close(6, 'Iron broadsword', 'sword@iron_refined', 24, 12, 120, Hit.Arc, false, only([[IRON, 2], [LU, 1], [LE, 1]]), 30),
  close(7, 'Steel side-sword', 'sword_steel@steel', 30, 12, 130, Hit.Arc, false, only([[STEEL, 3], [LU, 1], [LE, 1]]), 45),
  close(8, 'Basket-hilted broadsword', 'sword_steel@hq_steel', 36, 12, 130, Hit.Arc, false, only([[CS, 3], [LU, 1], [LE, 1]]), 60),
];

/**
 * Long melee and cavalry: a two-handed weapon, no shield, a slower swing,
 * no minimum range, and +30% in the outer third of reach (Jade). Indexed by
 * tier; tier 0 is empty (there is no long-melee fist fighter).
 */
export const LONG_KITS: readonly MeleeKit[] = [
  close(0, 'None', '', 0, 14, 0, Hit.Stab, false, [], 0),
  close(1, 'Fire-hardened spear', 'spear_hardwood', 9, 14, 250, Hit.Stab, false, only([[ST, 4]]), 10),
  close(2, 'Flint-headed spear', 'spear_flint', 12, 14, 250, Hit.Stab, false, only([[ST, 3], [FL, 1]]), 10),
  close(3, 'Copper leaf-blade spear', 'spear', 15, 14, 250, Hit.Stab, false, only([[CU, 1], [LU, 1]]), 20),
  close(4, 'Bronze spear', 'spear@bronze', 18, 14, 250, Hit.Stab, false, only([[BZ, 1], [LU, 1]]), 25),
  close(5, 'Crude iron spear', 'spear', 28, 16, 250, Hit.Stab, false, only([[WI, 3], [LU, 2]]), 40),
  close(6, 'Iron pike', 'pike', 32, 16, 350, Hit.Stab, false, only([[IRON, 3], [LU, 2]]), 40),
  close(7, 'Steel halberd', 'halberd@steel', 38, 16, 250, Hit.Arc, false, only([[STEEL, 3], [LU, 2]]), 45),
  close(8, 'Zweihänder', 'halberd@hq_steel', 45, 16, 200, Hit.Arc, false, only([[CS, 3], [LU, 2]]), 60),
];

/** A hit in the outer third of a long weapon's reach is a critical (s), for +30% (Jade). */
export const CRIT = { outerPm: 333, bonusPct: 30 };

// ----- Table 2e: ranged -----

const ranged = (tier: number, name: string, model: string, damage: number, attackDs: number, rangeM: number, spreadPct: number, shot: Shot, blunt: boolean, cost: Cost[], timeS: number, research: Research[] = []): RangedKit => ({
  tier, name, model, damage, attackDs, rangeM, spreadPct, shot, blunt, cost, timeS, need: tier, ...(research.length ? { research } : {}),
});

/** A recurve bow with arrowheads of one metal (Table 2e: 3 lumber, 1 sinew or flax, 1 ingot, 1 feather). */
const recurve = (tier: number, metal: string, damage: number, ingot: Res): RangedKit =>
  ranged(tier, `Recurve bow, ${metal} arrowheads`, 'bow', damage, 20, 25, 6, Shot.Arrow, false, ways([[ingot, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 35);

/**
 * The ranger: one ladder with deliberate repeats (Jade): a sling, a yew
 * longbow, the same recurve bow at 3 to 6 with better arrowheads, the
 * crossbow at 7 and the musket at 8. Ammunition is unlimited (Jade).
 */
export const RANGER_KITS: readonly RangedKit[] = [
  ranged(0, 'None', '', 0, 20, 0, 0, Shot.Arrow, false, [], 0),
  ranged(1, 'Leather sling', 'sling', 8, 20, 20, 8, Shot.SlingStone, true, [[[LE, 1]], [[FX, 1]]], 10),
  ranged(2, 'Yew longbow', 'bow', 10, 20, 25, 6, Shot.Arrow, false, ways([[FL, 1], [FE, 1], [LU, 3]], [[ROPE, 1], [FX, 1]]), 35),
  recurve(3, 'copper', 12, CU),
  recurve(4, 'bronze', 13, BZ),
  recurve(5, 'wrought-iron', 15, WI),
  recurve(6, 'iron', 16, IRON),
  ranged(7, 'Steel-prod crossbow', 'crossbow_steel@steel', 40, 45, 34, 3, Shot.Bolt, false, only([[STEEL, 3], [WI, 1], [PL, 2], [FX, 1], [LU, 1], [FE, 1]]), 75, [Research.Crossbows]),
  ranged(8, 'Flintlock musket', 'musket', 60, 80, 40, 4, Shot.MusketBall, false, only([[CS, 1], [PL, 2], [FL, 1], [GP, 1], [PB, 2]]), 90, [Research.Gunpowder, Research.Muskets]),
];

/** The brawler, tier 8 only: a flintlock pistol and a cutlass (the tier 8 close-melee row), one kit (Table 2e). */
export const BRAWLER_KIT: RangedKit = ranged(8, 'Flintlock pistol and cutlass', 'pistol', 40, 60, 15, 6, Shot.MusketBall, false, only([[CS, 4], [PL, 1], [FL, 1], [LU, 1], [LE, 1], [GP, 1], [PB, 1]]), 120, [
  Research.Gunpowder,
  Research.Muskets,
]);

// ----- Table 3: armour and shields -----

const armour = (tier: number, name: string, model: string, protectionPct: number, cost: Cost[], timeS: number): ArmourKit => ({ tier, name, model, protectionPct, cost, timeS, need: tier });

/** Armour by tier, for every troop type (Table 3): body, helmet and boots in one. Flax may stand in for leather where the table says. */
export const ARMOUR_KITS: readonly ArmourKit[] = [
  armour(0, 'No armour', '', 0, [[]], 0),
  armour(1, 'Leather jerkin', 'armour_leather+boots@leather', 10, only([[LE, 3]]), 30),
  armour(2, 'Boiled-leather cuirass', 'armour_leather+helmet_leather_cap+boots@leather', 20, only([[HL, 3], [LE, 2]]), 50),
  armour(3, 'Copper scale jack', 'armour_bronze_scale+helmet_bronze+boots', 25, [[[CU, 5], [HL, 2], [LE, 1]], [[CU, 5], [HL, 2], [FX, 1]]], 80),
  armour(4, 'Bronze scale armour', 'armour_bronze_scale+helmet_bronze+boots', 37, [[[BZ, 5], [HL, 2], [LE, 1]], [[BZ, 5], [HL, 2], [FX, 1]]], 90),
  armour(5, 'Wrought-iron mail', 'armour_iron_mail@iron_wrought+helmet_iron_nasal@iron_wrought+boots', 48, [[[WI, 5], [LE, 3]], [[WI, 5], [FX, 3]]], 90),
  armour(6, 'Iron coat of plates', 'armour_iron_mail@iron_refined+helmet_iron_nasal@iron_refined+boots', 53, [[[IRON, 5], [LE, 3]], [[IRON, 5], [FX, 3]]], 90),
  armour(7, 'Steel plate harness', 'armour_steel_plate@steel+helmet_steel_sallet@steel', 65, [[[STEEL, 7], [LE, 4]], [[STEEL, 7], [FX, 4]]], 160),
  armour(8, 'Fluted Gothic harness', 'armour_steel_plate@hq_steel+helmet_steel_sallet@hq_steel', 70, [[[CS, 7], [LE, 4]], [[CS, 7], [FX, 4]]], 160),
];

const shield = (tier: number, name: string, model: string, fromArmour: number, blockPct: number, cost: Cost[], timeS: number): ShieldKit => ({
  tier, name, model, fromArmour, blockPct, cost, timeS, need: fromArmour,
});

/** Close melee's shields, paid with the armour tier; shield tech lags on purpose (Jade). No armour, no shield. */
export const SHIELD_KITS: readonly ShieldKit[] = [
  shield(0, 'No shield', '', 0, 0, [[]], 0),
  shield(1, 'Wooden shield', 'shield_wood', 1, 15, only([[PL, 3], [LE, 1]]), 20),
  shield(2, 'Boiled-leather targe', 'shield_wicker', 3, 20, only([[PL, 3], [HL, 1]]), 25),
  shield(3, 'Iron-rimmed heater shield', 'shield_iron_kite@iron_refined', 6, 25, only([[IRON, 3], [PL, 1], [LE, 1]]), 40),
  shield(4, 'Steel heater shield', 'shield_steel_heater@steel', 7, 30, only([[STEEL, 3], [LE, 1]]), 45),
  shield(5, 'Steel rotella', 'shield_steel_heater@hq_steel', 8, 30, only([[CS, 3], [LE, 1]]), 45),
];

/** The shield row that goes with an armour tier. */
export function shieldRow(armourTier: number): ShieldKit {
  let best = SHIELD_KITS[0]!;
  for (const s of SHIELD_KITS) if (s.fromArmour > 0 && s.fromArmour <= armourTier) best = s;
  return best;
}

// ----- Table 2c: workers' tools -----

/** The metal's look on a tool's model: its texture variant (Patch 5, every tier drawn). */
const TOOL_METAL_LOOK: Readonly<Record<string, string>> = { Copper: 'copper', Bronze: 'bronze', 'Wrought iron': 'iron_wrought', Iron: 'iron_refined', Steel: 'steel', 'Carbon steel': 'hq_steel' };

/** One kit for all four jobs, drawn as all its pieces (Patch 5: the job's in hand, the rest at the hips and back). */
const everyJob = (model: string): string[] => [model, model, model, model];

const metalTools = (tier: number, metal: string, tool: Tool, damage: number, ingot: Res, timeS: number): ToolKit => ({
  tier, name: `${metal} tools`, model: `axe@${TOOL_METAL_LOOK[metal]}`, tools: [tool, tool, tool, tool], names: [`${metal} axe`, `${metal} pickaxe`, `${metal} hammer`, `${metal} sickle`].map((n) => n.toLowerCase()),
  models: everyJob(`axe@${TOOL_METAL_LOOK[metal]}+pick@${TOOL_METAL_LOOK[metal]}+hammer+sickle@${TOOL_METAL_LOOK[metal]}`), damage, cost: only([[ingot, 2], [LU, 2]]), timeS, need: tier,
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
  { tier: 0, name: 'No tools', model: '', tools: [0, 0, 0, 0], names: ['', '', '', ''], models: ['', '', '', ''], damage: 2, cost: [[]], timeS: 0, need: 0 },
  {
    tier: 1, name: 'Wooden tools', model: 'axe_hardwood', tools: [Tool.Hardwood, Tool.Hardwood, Tool.Hardwood, Tool.Hardwood],
    names: ['wooden axe', 'digging stick', 'wooden mallet', 'wooden hoe'], models: everyJob('axe_hardwood+digging_stick+mallet+hoe@hardwood'), damage: 2, cost: only([[ST, 3]]), timeS: 10, need: 1,
  },
  {
    tier: 2, name: 'Stone and flint tools', model: 'axe_flint', tools: [Tool.Flint, Tool.Stone, Tool.Stone, Tool.Flint],
    names: ['flint axe and knife', 'stone maul', 'stone hammer', 'flint axe and knife'], models: ['axe_flint+knife', 'maul_stone', 'hammer_stone', 'axe_flint+knife'], damage: 3, cost: only([[ST, 6], [FL, 1], [STONE, 5]]), timeS: 30, need: 2,
  },
  metalTools(3, 'Copper', Tool.Copper, 4, CU, 35),
  metalTools(4, 'Bronze', Tool.Bronze, 5, BZ, 35),
  metalTools(5, 'Wrought iron', Tool.WroughtIron, 6, WI, 40),
  metalTools(6, 'Iron', Tool.Iron, 7, IRON, 40),
  metalTools(7, 'Steel', Tool.Steel, 8, STEEL, 45),
  metalTools(8, 'Carbon steel', Tool.CarbonSteel, 9, CS, 55),
];

/** Prospecting takes 20 s with a tier 3 tool kit or better (the prospecting hammer), 40 s without (Table 2c). */
export const PROSPECT_TOOL_TIER = 3;

// ----- Table 13: wands and robes -----

/** The material tier each wand and robe tier needs (Table 13 "Needs": a Forge, Bronze, the Forge's iron step, Steel, Carbon steel). */
const MAGE_NEED: readonly number[] = [0, 1, 3, 4, 6, 7, 8];

const wand = (tier: number, name: string, model: string, powerPct: number, mana: number, cost: Cost, timeS: number): WandKit => ({
  tier, name, model, powerPct, mana, cost: only(cost), timeS, need: MAGE_NEED[tier]!,
});
const robe = (tier: number, name: string, model: string, protectionPct: number, regainPct: number, cost: Cost, timeS: number): RobeKit => ({
  tier, name, model, protectionPct, regainPct, cost: only(cost), timeS, need: MAGE_NEED[tier]!,
});

/** Mages' wands (Jade: their own ladder; names and numbers (s)): the wand sets spell power and the mana bar. */
export const WAND_KITS: readonly WandKit[] = [
  wand(0, 'No wand', '', 100, 0, [], 0),
  wand(1, 'Hazel wand', 'wand', 100, 0, [[ST, 5]], 10),
  wand(2, 'Copper-tipped wand', 'wand_acolyte', 105, 10, [[ST, 5], [CU, 1]], 20),
  wand(3, 'Bronze-bound staff', 'wand_adept_acolyte', 110, 20, [[LU, 2], [BZ, 2]], 30),
  wand(4, 'Iron-shod staff', 'wand_mage', 115, 30, [[LU, 2], [IRON, 2]], 30),
  wand(5, 'Crystal staff', 'wand_master_mage', 120, 40, [[LU, 2], [STEEL, 2], [MC, 2]], 45),
  wand(6, 'Archstaff', 'wand_grand_magician', 125, 50, [[LU, 2], [CS, 2], [MC, 5]], 60),
];

/** Mages' robes: the robe sets protection and mana regain. Each tier is drawn as the mage's robe look, mage_battle_<tier> or mage_support_<tier> (client units-view.ts). */
export const ROBE_KITS: readonly RobeKit[] = [
  robe(0, 'No robe', '', 0, 0, [], 0),
  robe(1, 'Homespun robe', '', 0, 0, [[FX, 3]], 10),
  robe(2, 'Leather-trimmed robe', '', 5, 5, [[FX, 3], [LE, 1]], 20),
  robe(3, 'Hardened-leather robe', '', 10, 10, [[FX, 3], [HL, 2]], 30),
  robe(4, 'Warded robe', '', 15, 15, [[FX, 3], [HL, 2], [MC, 1]], 30),
  robe(5, 'Rune-stitched vestments', '', 20, 20, [[FX, 3], [HL, 2], [CU, 2], [MC, 2]], 45),
  robe(6, "Archmage's mantle", '', 25, 25, [[FX, 3], [HL, 2], [STEEL, 2], [MC, 5]], 60),
];

/** The top wand and robe tier. */
export const TOP_MAGE_TIER = 6;

// ----- Table 7: training and upgrading -----

/**
 * Training and upgrading (Table 7): a troop is 30 food and its kit, 45 s
 * plus the kit's time and 1 supply. Workers and mages keep their own rows
 * (buildings/data.ts WORKER_FOOD, magic/mages.ts MAGE_FOOD). An upgrade pays
 * the new tier's kit and takes half the new piece's time to make; the old
 * piece is scrapped with a full refund (Jade, 22:52 UTC 2026-10-02), so a
 * step costs the difference.
 */
export const TRAINING = {
  troopFood: 30,
  troopS: 45,
  /** An upgrade's time as a share of the new piece's time to make, per mille. */
  upgradeTimePm: 500,
  /** How much of the old piece's main cost an upgrade gives back when the new one goes on, per mille: all of it (Jade). */
  upgradeRefundPm: 1000,
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
export const SHIELD_GEAR: readonly number[] = SHIELD_KITS.map((k) => (k.tier === 0 ? 0 : add({ name: k.name, slot: Slot.Shield, tier: k.fromArmour, model: k.model, blockBp: k.blockPct * 100 })));
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

/** Whether a troop type carries a shield with its armour (close melee only, Jade). */
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

/** The armour pieces of a troop type at an armour tier: the armour, and close melee's shield with it. */
export function armourPieces(troop: number, tier: number): Piece[] {
  const a = ARMOUR_KITS[tier];
  if (!a || tier === 0) return [];
  return hasShield(troop) ? [a, shieldRow(tier)] : [a];
}

/** The pieces an armour upgrade pays for: the new armour, and the shield only when it changes with it. */
export function armourUpgradePieces(troop: number, from: number, to: number): Piece[] {
  const out: Piece[] = [ARMOUR_KITS[to]!];
  if (hasShield(troop) && shieldRow(to).tier !== shieldRow(from).tier) out.push(shieldRow(to));
  return out;
}

/** Every piece of a troop's whole kit. */
export function troopPieces(troop: number, weapon: number, armourTier: number): Piece[] {
  const w = weaponPiece(troop, weapon);
  return [...(w ? [w] : []), ...armourPieces(troop, armourTier)];
}

/** Seconds to make a set of pieces. */
export function piecesTime(pieces: readonly Piece[]): number {
  let s = 0;
  for (const p of pieces) s += p.timeS;
  return s;
}

/** Adds n of a resource to a summed cost. */
function addTo(cost: Array<[Res, number]>, r: Res, n: number): void {
  if (n <= 0) return;
  const at = cost.findIndex(([x]) => x === r);
  if (at >= 0) cost[at] = [r, cost[at]![1] + n];
  else cost.push([r, n]);
}

/**
 * How a set of pieces would be paid from a pool: each piece takes the first
 * way of paying that what is left covers, in turn. "Lumber" (Patch 5: either
 * kind) is taken a piece at a time from whichever kind is in larger stock,
 * softwood on a tie, as food-kinds.ts payAny does. Returns the summed cost,
 * kind by kind, and which way each piece took with how much of its lumber
 * was hardwood (a digit each, base 64: the way plus 8 times the hardwood,
 * first piece lowest), or null when the pool cannot cover it. `held` is set
 * aside first (a troop's food, or what earlier units in the same click took).
 */
export function planPieces(pieces: readonly Piece[], pool: Int32Array, held: Cost = []): { cost: Cost; ways: number } | null {
  const left = new Map<number, number>();
  const have = (r: number): number => (left.has(r) ? left.get(r)! : pool[r]!);
  const haveOf = (r: number): number => (r === LU ? have(SW) + have(HW) : have(r));
  for (const [r, n] of held) left.set(r, have(r) - n);
  const cost: Array<[Res, number]> = [];
  let code = 0;
  let mul = 1;
  for (const p of pieces) {
    let chosen = -1;
    for (let k = 0; k < p.cost.length; k++) {
      if (p.cost[k]!.every(([r, n]) => haveOf(r) >= n)) {
        chosen = k;
        break;
      }
    }
    if (chosen < 0) return null;
    let hard = 0;
    for (const [r, n] of p.cost[chosen]!) {
      if (r !== LU) {
        left.set(r, have(r) - n);
        addTo(cost, r, n);
        continue;
      }
      for (let k = 0; k < n; k++) {
        const kind = have(HW) > have(SW) ? HW : SW;
        if (kind === HW) hard++;
        left.set(kind, have(kind) - 1);
        addTo(cost, kind, 1);
      }
    }
    code += (chosen + 8 * hard) * mul;
    mul *= 64;
  }
  return { cost, ways: code };
}

/** The cost of a set of pieces paid the ways a plan chose, kind by kind (to give it back); with 0, the first ways in softwood. */
export function piecesCost(pieces: readonly Piece[], ways: number): Cost {
  const cost: Array<[Res, number]> = [];
  let code = ways;
  for (const p of pieces) {
    const digit = code % 64;
    code = floorDiv(code, 64);
    const way = p.cost[digit % 8] ?? p.cost[0] ?? [];
    let hard = floorDiv(digit, 8);
    for (const [r, n] of way) {
      if (r !== LU) {
        addTo(cost, r, n);
        continue;
      }
      const h = Math.min(hard, n);
      hard -= h;
      addTo(cost, HW, h);
      addTo(cost, SW, n - h);
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
  e.shield[i] = hasShield(t) && a > 0 ? SHIELD_GEAR[shieldRow(a).tier]! : 0;
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

/** A short name for a troop's kit: "Bronze spear, leather jerkin". */
export function kitName(troop: number, weapon: number, armourTier: number): string {
  if (troop === Troop.Dreadnought) return `${DREADNOUGHT_KIT.mace}, ${DREADNOUGHT_KIT.plate.toLowerCase()}`;
  const w = weaponPiece(troop, weapon)?.name ?? 'Fists';
  const a = armourTier > 0 ? ARMOUR_KITS[armourTier]!.name.toLowerCase() : 'no armour';
  return `${w}, ${a}`;
}

// ----- upgrading -----

/** What an upgrade looks at: the unit's kind, troop type and tiers. */
export interface KitHolder {
  kind: 'worker' | 'warrior' | 'mage';
  troop: number;
  w: number;
  a: number;
}

/** A unit's kind as the kit rules see it, from its UnitKind (0 worker, 1 warrior, 5 mage). */
export function holderKind(unitKind: number): KitHolder['kind'] | undefined {
  if (unitKind === 0) return 'worker';
  if (unitKind === 1) return 'warrior';
  if (unitKind === 5) return 'mage';
  return undefined;
}

/** The highest tier a line of a unit's kit goes to: 8 for troops and tools, 6 for wands and robes; 0 where there is no such line (a crewman has none). */
export function lineTop(h: KitHolder, line: number): number {
  if (h.kind === 'mage') return TOP_MAGE_TIER;
  if (h.kind === 'worker') return line === Line.Weapon ? TOP_TIER : 0;
  if (h.troop === Troop.Crew || h.troop === Troop.Dreadnought) return 0;
  if (line === Line.Weapon) return h.troop === Troop.Brawler ? 0 : weaponTiers(h.troop)[1];
  return TOP_TIER;
}

/** A line's tier now. */
export function lineTier(h: KitHolder, line: number): number {
  return line === Line.Weapon ? h.w : h.a;
}

/** The piece a line has at a tier (the armour's shield aside). */
export function linePiece(h: KitHolder, line: number, tier: number): Piece | undefined {
  if (h.kind === 'worker') return line === Line.Weapon ? TOOL_KITS[tier] : undefined;
  if (h.kind === 'mage') return line === Line.Weapon ? WAND_KITS[tier] : ROBE_KITS[tier];
  return line === Line.Weapon ? weaponPiece(h.troop, tier) : ARMOUR_KITS[tier];
}

/** What raising a line to a tier pays for: the new piece, and close melee's new shield when it changes with the armour. */
export function upgradePieces(h: KitHolder, line: number, to: number): Piece[] {
  if (h.kind === 'warrior' && line === Line.Armour) return armourUpgradePieces(h.troop, h.a, to);
  const p = linePiece(h, line, to);
  return p ? [p] : [];
}

/** What comes back when a line leaves a tier for another: the old piece, and the old shield when it is replaced. */
export function replacedPieces(h: KitHolder, line: number, to: number): Piece[] {
  const from = lineTier(h, line);
  if (from === 0) return [];
  if (h.kind === 'warrior' && line === Line.Armour) {
    const out: Piece[] = [ARMOUR_KITS[from]!];
    if (hasShield(h.troop) && shieldRow(to).tier !== shieldRow(from).tier && shieldRow(from).tier > 0) out.push(shieldRow(from));
    return out;
  }
  const p = linePiece(h, line, from);
  return p ? [p] : [];
}

/** Steps an upgrade to a tier takes: half the new piece's time to make (Table 7). */
export function upgradeSteps(h: KitHolder, line: number, to: number): number {
  return Math.max(STEPS_PER_SECOND, floorDiv(piecesTime(upgradePieces(h, line, to)) * STEPS_PER_SECOND * TRAINING.upgradeTimePm, 1000));
}

/** The research a player has, the Forge step their town is at, and research names, for the needs. */
export interface TechView {
  research: number;
  forge: number;
  researchName: (r: Research) => string;
}

/** Why a troop type with no line to raise has nothing to upgrade. */
const FIXED_KIT_WHY: Readonly<Partial<Record<number, string>>> = {
  [Troop.Brawler]: 'A brawler is tier 8 only.',
  [Troop.Crew]: 'An artillery crewman has no kit to upgrade.',
  [Troop.Dreadnought]: 'A Dreadnought keeps the mace and plate he came with.',
};

/**
 * Where an Upgrade button would take a line: the next tier (plain), or the
 * best tier researched and affordable (Max). Returns the tier and how it
 * would be paid, or the reason it cannot. `held` is what is already set
 * aside from the pool (earlier units in the same click).
 */
export function upgradeTarget(h: KitHolder, line: number, max: boolean, pool: Int32Array, tech: TechView, held: Cost = []): { to: number; plan: { cost: Cost; ways: number } } | { why: string } {
  const top = lineTop(h, line);
  const cur = lineTier(h, line);
  if (top === 0) return { why: FIXED_KIT_WHY[h.troop] ?? 'Nothing to upgrade.' };
  if (cur >= top) return { why: 'Already the best there is.' };
  let first = '';
  for (let to = max ? top : cur + 1; to > cur; to--) {
    const pieces = upgradePieces(h, line, to);
    let why = '';
    for (const p of pieces) why ||= pieceProblem(p, tech.research, tech.forge, tech.researchName);
    if (!why) {
      const plan = planPieces(pieces, pool, held);
      if (plan) return { to, plan };
      why = `Not enough resources (${costText(mainCost(pieces))}).`;
    }
    // The plain button's reason, or the next tier's under Max.
    if (to === cur + 1 || !first) first = why;
    if (to === cur + 1) return { why };
  }
  return { why: first };
}

/** A unit as Upgrade equipment sees it: its id, kit and rank, and the lines it already has an upgrade on the way for. */
export interface EquipmentHolder {
  id: number;
  h: KitHolder;
  rank: number;
  pendingW: boolean;
  pendingA: boolean;
}

/** One unit's share of an Upgrade equipment press: the tier each line goes to (0: it stays) and how it is paid, or why neither moves. */
export interface EquipmentPlan {
  id: number;
  w: number;
  a: number;
  wPlan: { cost: Cost; ways: number } | null;
  aPlan: { cost: Cost; ways: number } | null;
  why: string;
}

/** Reasons that only say a line has nowhere to go, which give way to a reason the player can do something about. */
const NOWHERE_TO_GO = new Set(['Already the best there is.', 'Nothing to upgrade.', 'A brawler is tier 8 only.']);

/**
 * Upgrade equipment (Jade's Patch 2): one press does what the Max twins of
 * Upgrade weapon and Upgrade armour did together. Each unit's weapon (a
 * worker's tools, a mage's wand) goes to the best tier researched that the
 * stock pays for, then its armour (a mage's robe); workers have no armour.
 * Weapons come first for every unit, the highest rank first, so a short
 * stock buys weapons before armour; then armour from what is left. The sim
 * pays exactly these plans and the action menu shows them, so the two agree.
 */
export function equipmentPlans(units: readonly EquipmentHolder[], pool: Int32Array, tech: TechView): EquipmentPlan[] {
  const order = [...units].sort((a, b) => b.rank - a.rank || a.id - b.id);
  const held: Array<[Res, number]> = [];
  const hold = (cost: Cost): void => {
    for (const [r, n] of cost) {
      const at = held.findIndex(([x]) => x === r);
      if (at >= 0) held[at] = [r, held[at]![1] + n];
      else held.push([r, n]);
    }
  };
  const plans: EquipmentPlan[] = order.map((u) => ({ id: u.id, w: 0, a: 0, wPlan: null, aPlan: null, why: '' }));
  const whys = order.map(() => ['', '']);
  for (const line of [Line.Weapon, Line.Armour]) {
    order.forEach((u, k) => {
      if (line === Line.Armour && u.h.kind === 'worker') return;
      if (line === Line.Weapon ? u.pendingW : u.pendingA) {
        whys[k]![line] = 'Already on the way to an upgrade.';
        return;
      }
      const t = upgradeTarget(u.h, line, true, pool, tech, held);
      if ('why' in t) {
        whys[k]![line] = t.why;
        return;
      }
      hold(t.plan.cost);
      const p = plans[k]!;
      if (line === Line.Weapon) {
        p.w = t.to;
        p.wPlan = t.plan;
      } else {
        p.a = t.to;
        p.aPlan = t.plan;
      }
    });
  }
  plans.forEach((p, k) => {
    if (p.w || p.a) return;
    const [w, a] = whys[k]!;
    p.why = (w && !NOWHERE_TO_GO.has(w) ? w : '') || (a && !NOWHERE_TO_GO.has(a) ? a : '') || w || a || 'Nothing to upgrade.';
  });
  return plans;
}
