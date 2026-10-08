// Siege engines as data (Table 2f: catapult, ballista, bronze and iron
// cannons; Main base: the Citadel's cannon ports) and the artillery crewman
// who works them (Patch 2). An engine is a unit of kind Engine (state.ts)
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

export const Engine = { Catapult: 0, Ballista: 1, BronzeCannon: 2, IronCannon: 3, DwarfCannon: 4 } as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

/** Research ids (combat/items.ts Research), kept as numbers so this module stays a leaf. */
const SIEGE_ENGINES = 8;
const CANNONS = 15;

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
  /** A cannon, which alone goes up into a Citadel's cannon port. */
  cannon: boolean;
  /** Largest miss as a share of the distance, bp (s). */
  spreadBp: number;
  /** Where it is made (the Artillery workshop, Patch 2; -1 for none) and the main base tier it needs (Patch 5). Its crew's food is paid with it (CREWMAN). */
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
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);
const sec = (n: number): number => n * STEPS_PER_SECOND;
/** Either lumber (Patch 5). */
const L = Res.AnyLumber;

/** combat/items.ts Shot ids for the engines' shots (kept as numbers so this module stays a leaf). */
export const ENGINE_SHOT = { Cannonball: 13, CatapultStone: 14, BallistaBolt: 15 } as const;

export const ENGINES: readonly EngineSpec[] = [
  {
    id: Engine.Catapult, name: 'Catapult', model: 'catapult', hp: 300, damage: 80, pierce: false,
    range: cm(5000), minRange: cm(1500), reloadSteps: sec(15), crew: 2, horse: v10(20), ox: v10(15), pushed: v10(8),
    shot: ENGINE_SHOT.CatapultStone, cannon: false, spreadBp: 600,
    // Patch 2: from main base 5, where the Great Workshop stood before (tier 3 from Patch 5); 120 s with no crew, what 240 s took two workers (s, Jade's rebalance).
    at: BuildingKind.ArtilleryWorkshop, base: 3, research: SIEGE_ENGINES, cost: [[L, 40], [Res.Planks, 20], [Res.Rope, 10], [Res.BronzeIngot, 10]], steps: sec(120),
    halfWidth: cm(150), height: cm(300),
  },
  {
    id: Engine.Ballista, name: 'Ballista', model: 'ballista', hp: 250, damage: 90, pierce: true,
    range: cm(4500), minRange: cm(500), reloadSteps: sec(8), crew: 1, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.BallistaBolt, cannon: false, spreadBp: 200,
    // Patch 2: from main base 7, the Manufactory's level (tier 3 from Patch 5); 120 s as the catapult (s, Jade's rebalance).
    at: BuildingKind.ArtilleryWorkshop, base: 3, research: SIEGE_ENGINES, cost: [[L, 40], [Res.WroughtIron, 20], [Res.Rope, 10]], steps: sec(120),
    halfWidth: cm(120), height: cm(180),
  },
  {
    id: Engine.BronzeCannon, name: 'Bronze cannon', model: 'cannon_bronze', hp: 400, damage: 150, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.Cannonball, cannon: true, spreadBp: 300,
    // Patch 2: from main base 8, the Foundry's level (tier 4 from Patch 5), at the same pace the Foundry had.
    at: BuildingKind.ArtilleryWorkshop, base: 4, research: CANNONS, cost: [[Res.BronzeIngot, 20], [L, 10]], steps: sec(180),
    halfWidth: cm(110), height: cm(150),
  },
  {
    id: Engine.IronCannon, name: 'Iron cannon', model: 'cannon_iron', hp: 500, damage: 150, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: v10(25), ox: v10(15), pushed: v10(10),
    shot: ENGINE_SHOT.Cannonball, cannon: true, spreadBp: 300,
    at: BuildingKind.ArtilleryWorkshop, base: 4, research: CANNONS, cost: [[Res.WroughtIron, 12], [L, 10]], steps: sec(150),
    halfWidth: cm(110), height: cm(150),
  },
  {
    // A Dwarf city's own cannon (Table 19: "its own Dwarf cannons are not for sale"): the iron cannon's numbers, never made by players.
    id: Engine.DwarfCannon, name: 'Dwarf cannon', model: 'cannon_dwarf', hp: 500, damage: 150, pierce: false,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, horse: 0, ox: 0, pushed: 0,
    shot: ENGINE_SHOT.Cannonball, cannon: true, spreadBp: 300,
    at: -1, base: 0, research: 0, cost: [], steps: 0,
    halfWidth: cm(110), height: cm(150),
  },
];

/** The engines the players make, in command-card order. */
export const PLAYER_ENGINES: readonly Engine[] = [Engine.Catapult, Engine.Ballista, Engine.BronzeCannon, Engine.IronCannon];

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
/** A Citadel (main base tier 4; level 10 before Patch 5) has 4 cannon ports on its roof (Table 4). */
export const CITADEL_LEVEL = 4;
export const CANNON_PORTS = 4;
