// Siege engines as data (Table 2f: catapult, ballista, bronze and iron
// cannons; Patch 5: their fixed versions on the Citadel's engine platform)
// and the artillery crewman who works them (Patch 2). An engine is a unit of kind Engine (state.ts)
// with its engine kind in the mob field. It moves only when a horse or ox is
// hitched to it or its crew push it, rolls on wheels (gentle slopes, not steps),
// fires when its crew stands by it, never heals by itself and is repaired by
// workers. Patch 2 (Jade): only artillery crewmen crew engines, every engine
// rolls out with its full crew, and no attack of any kind uses ammunition,
// so engines fire without stones, bolts, cannonballs or gunpowder. Numbers
// are Table 2f's; picks are (s).

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { BuildingKind } from '../buildings/data.ts';

/**
 * The artillery crewman (Patch 2, Jade), trained at the Artillery workshop:
 * its food and seconds to train (s, Jade's rebalance). It takes 1 supply,
 * like any troop, and fights with its fists.
 */
export const CREWMAN = { food: 30, seconds: 30 };

/**
 * Retraining an artillery crewman as a worker (Patch 3, Jade): he sits
 * tinkering beside the main base this long, at no cost, and gets up a
 * Labourer with a starting tool kit (s: as long as training him took).
 */
export const CREWMAN_RETRAIN_STEPS = 30 * STEPS_PER_SECOND;

/**
 * Engine kinds. Patch 5 (Jade, CT-3): each player engine has a fixed version
 * on braces, built on the Citadel's engine platform and never moved from it,
 * with a name of its own.
 */
export const Engine = { Catapult: 0, Ballista: 1, BronzeCannon: 2, IronCannon: 3, DwarfCannon: 4, Mangonel: 5, Springald: 6, BronzeCulverin: 7, IronBombard: 8 } as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

/** Research ids (combat/items.ts Research), kept as numbers so this module stays a leaf. */
const SIEGE_ENGINES = 8;
const CANNONS = 15;
/** The Citadel: main base tier 4 (level 10 before Patch 5), where the engine platform stands (Patch 5, CT-3). */
export const CITADEL_LEVEL = 4;

export interface EngineSpec {
  id: Engine;
  name: string;
  /** Catalogue model (review/batch-2 MANIFEST, models/mechanical). */
  model: string;
  hp: number;
  /** Hit on a unit; the splash and the damage against walls are its shot's (combat/items.ts SHOTS). */
  damage: number;
  /** A ballista bolt goes on through one more target in a line (Table 2f: pierces 2). */
  pierce: boolean;
  range: number;
  minRange: number;
  reloadSteps: number;
  /** Artillery crewmen it rolls out with, and needs standing by to fire. */
  crew: number;
  /** Hauled by a horse or an ox, or pushed by its crew, wu per step. */
  horse: number;
  ox: number;
  pushed: number;
  /** The shot it fires (combat/items.ts Shot); it takes nothing from the stock (Patch 2). */
  shot: number;
  /** A gunpowder cannon: a muzzle flash, sparks and lingering smoke when it fires (Patch 5, MB-7), and lead ore in its cost (decisions 2.5). */
  cannon: boolean;
  /** A fixed engine on the Citadel's platform (Patch 5, CT-3): the mobile engine it is the fixed version of; -1 for an engine that moves. */
  mobile: number;
  /** Largest miss as a share of the distance, bp (s). */
  spreadBp: number;
  /** Where it is made (the Artillery workshop, Patch 2; the Citadel for a fixed engine, Patch 5; -1 for none) and the main base tier it needs (Patch 5). Its crew's food is paid with it (CREWMAN). */
  at: number;
  base: number;
  research: number;
  cost: Cost;
  steps: number;
  /** Hit box: half width and height, wu. */
  halfWidth: number;
  height: number;
}

const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
/** Engines go 15% slower than these rows' tenths of a m/s say (Patch 5 GP-16: "decrease the baseline speed of artillery by 15%"), as foot units walk (state.ts FOOT_WALK_BP). */
export const ARTILLERY_PACE_BP = 8500;
/** Tenths of a m/s, less the 15%, as wu per step. */
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE * ARTILLERY_PACE_BP, 10 * STEPS_PER_SECOND * 10000);
const sec = (n: number): number => n * STEPS_PER_SECOND;
/** Either lumber (Patch 5). */
const L = Res.AnyLumber;

/** combat/items.ts Shot ids for the engines' shots (kept as numbers so this module stays a leaf). */
export const ENGINE_SHOT = { Cannonball: 13, CatapultStone: 14, BallistaBolt: 15, BronzeCannonball: 20 } as const;
/** Lead ore in every gunpowder unit (Jade, decisions 2.5: "larger/stronger ones needing more"): the bronze cannon 4, the iron cannon 6 (s), a fixed one as its mobile one. */
const PB = Res.LeadOre;

const MOBILE_ROWS: EngineSpec[] = [
  {
    id: Engine.Catapult, name: 'Catapult', model: 'catapult', hp: 300, damage: 80, pierce: false,
    range: cm(5000), minRange: cm(1500), reloadSteps: sec(15), crew: 2, horse: v10(20), ox: v10(15), pushed: v10(8),
    shot: ENGINE_SHOT.CatapultStone, cannon: false, mobile: -1, spreadBp: 600,
    // Patch 2: from main base 5, where the Great Workshop stood before (tier 3 from Patch 5); 120 s with no crew, what 240 s took two workers (s, Jade's rebalance).
    at: BuildingKind.ArtilleryWorkshop, base: 3, research: SIEGE_ENGINES, cost: [[L, 40], [Res.Planks, 20], [Res.Rope, 10], [Res.BronzeIngot, 10]], steps: sec(120),
    halfWidth: cm(150), height: cm(300),
  },
  {
    id: Engine.Ballista, name: 'Ballista', model: 'ballista', hp: 250, damage: 90, pierce: true,
    range: cm(4500), minRange: cm(500), reloadSteps: sec(8), crew: 1, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.BallistaBolt, cannon: false, mobile: -1, spreadBp: 200,
    // Patch 2: from main base 7, the Manufactory's level (tier 3 from Patch 5); 120 s as the catapult (s, Jade's rebalance).
    at: BuildingKind.ArtilleryWorkshop, base: 3, research: SIEGE_ENGINES, cost: [[L, 40], [Res.WroughtIron, 20], [Res.Rope, 10]], steps: sec(120),
    halfWidth: cm(120), height: cm(180),
  },
  {
    // Patch 5 (Jade, MB-8): bronze cannot take the pressure iron can, so its barrel is thicker with a smaller mouth, and its shot,
    // blast, splash and damage are smaller than the iron cannon's, still more than any engine without gunpowder; and it takes a
    // lot of bronze ingots (40, s; 20 before).
    id: Engine.BronzeCannon, name: 'Bronze cannon', model: 'cannon_bronze', hp: 400, damage: 120, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.BronzeCannonball, cannon: true, mobile: -1, spreadBp: 300,
    // Patch 2: from main base 8, the Foundry's level (tier 4 from Patch 5), at the same pace the Foundry had.
    at: BuildingKind.ArtilleryWorkshop, base: 4, research: CANNONS, cost: [[Res.BronzeIngot, 40], [L, 10], [PB, 4]], steps: sec(180),
    halfWidth: cm(110), height: cm(150),
  },
  {
    id: Engine.IronCannon, name: 'Iron cannon', model: 'cannon_iron', hp: 500, damage: 150, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.Cannonball, cannon: true, mobile: -1, spreadBp: 300,
    at: BuildingKind.ArtilleryWorkshop, base: 4, research: CANNONS, cost: [[Res.WroughtIron, 12], [L, 10], [PB, 6]], steps: sec(150),
    halfWidth: cm(110), height: cm(150),
  },
  {
    // A Dwarf city's own cannon (Table 19: "its own Dwarf cannons are not for sale"): the iron cannon's numbers, never made by players.
    id: Engine.DwarfCannon, name: 'Dwarf cannon', model: 'cannon_dwarf', hp: 500, damage: 150, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: 0, ox: 0, pushed: 0,
    shot: ENGINE_SHOT.Cannonball, cannon: true, mobile: -1, spreadBp: 300,
    at: -1, base: 0, research: 0, cost: [], steps: 0,
    halfWidth: cm(110), height: cm(150),
  },
];

/** Indexed by Engine: the mobile engines, then their fixed versions (Patch 5). */
export const ENGINES: readonly EngineSpec[] = [
  ...MOBILE_ROWS,
  fixed(Engine.Mangonel, 'Mangonel', Engine.Catapult),
  fixed(Engine.Springald, 'Springald', Engine.Ballista),
  fixed(Engine.BronzeCulverin, 'Bronze culverin', Engine.BronzeCannon),
  fixed(Engine.IronBombard, 'Iron bombard', Engine.IronCannon),
];

/**
 * A fixed engine (Patch 5, Jade's CT-3): the mobile engine's numbers, cost
 * and making time (lead ore and crew food included), "based on the mobile
 * ones" but on braces instead of wheels, so it never moves; made at the
 * Citadel from its Build defense menu, for the platform where its pointed
 * tower stood. Its model is the mobile one's id with `_fixed`.
 */
function fixed(id: Engine, name: string, of: Engine): EngineSpec {
  const m = MOBILE_ROWS[of]!;
  return { ...m, id, name, model: `${m.model}_fixed`, mobile: of, horse: 0, ox: 0, pushed: 0, at: BuildingKind.MainBase, base: CITADEL_LEVEL };
}

/** The engines the players make at the Artillery workshop, in command-card order. */
export const PLAYER_ENGINES: readonly Engine[] = [Engine.Catapult, Engine.Ballista, Engine.BronzeCannon, Engine.IronCannon];
/**
 * The fixed engines, in command-card order, which is also their upgrade
 * ladder (s): from the one-crew Springald up to the Iron bombard, so an
 * upgrade from it brings the free second crewman CT-3 names.
 */
export const FIXED_ENGINES: readonly Engine[] = [Engine.Springald, Engine.Mangonel, Engine.BronzeCulverin, Engine.IronBombard];

/**
 * Upgrading the fixed engine on a Citadel's platform (Jade, CT-3) is the
 * product ENGINE_PRODUCT (buildings/store.ts) + ENGINE_UPGRADE + from x 10
 * + to, so it never meets an engine's own product.
 */
export const ENGINE_UPGRADE = 100;

/** An upgrade's number past ENGINE_PRODUCT, from one fixed engine to another. */
export function engineUpgrade(from: Engine, to: Engine): number {
  return ENGINE_UPGRADE + from * 10 + to;
}

/** The engines an upgrade's number past ENGINE_PRODUCT goes from and to, or undefined for an engine's own number. */
export function upgradeOf(n: number): { from: Engine; to: Engine } | undefined {
  if (n < ENGINE_UPGRADE) return undefined;
  const k = n - ENGINE_UPGRADE;
  return { from: floorDiv(k, 10) as Engine, to: (k % 10) as Engine };
}

/** Whether an upgrade climbs the fixed engines' ladder (FIXED_ENGINES): only to an engine above the one on the platform. */
export function upgradeClimbs(from: Engine, to: Engine): boolean {
  const a = FIXED_ENGINES.indexOf(from);
  const b = FIXED_ENGINES.indexOf(to);
  return a >= 0 && b > a;
}

export function engineSpec(id: number): EngineSpec {
  const s = ENGINES[id];
  if (!s) throw new Error(`unknown engine ${id}`);
  return s;
}

/** Crew stand within this distance of their engine to work it or push it (s). */
export const CREW_REACH_WU = 4 * WU_PER_METRE;
/** Crew fight foes that come within this distance of them, then go back to their engine (s). */
export const CREW_GUARD_WU = 6 * WU_PER_METRE;
/** A hitched animal hauls while within this distance (s). */
export const HAUL_REACH_WU = 5 * WU_PER_METRE;
/** Engines see 20 m by themselves (s); their crew's eyes do the rest. */
export const ENGINE_SIGHT_WU = 20 * WU_PER_METRE;
/** Regular units that stand on the Citadel's engine platform while no engine is on it (Jade, CT-3). */
export const PLATFORM_MEN = 4;
/**
 * An upgrade of a fixed engine (Jade, CT-3: "this button costs the
 * resources and time difference to upgrade") takes the difference in time,
 * but at least this share of the new engine's time (s, bp): the iron
 * bombard is quicker to make than the bronze culverin it replaces.
 */
export const UPGRADE_MIN_TIME_BP = 2500;
