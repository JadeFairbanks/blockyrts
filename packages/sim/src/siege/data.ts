// Siege engines as data (Table 2f: catapult, ballista, bronze and iron
// cannons; Table 2b's munitions; Main base: the Citadel's cannon ports).
// An engine is a unit of kind Engine (state.ts) with its engine kind in the
// mob field. It moves only when a horse or ox is hitched to it or its crew
// push it, rolls on wheels (ramps, not steps), fires when its crew stands
// by it, never heals by itself and is repaired by workers. Numbers are
// Table 2f's; picks are (s).

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { BuildingKind } from '../buildings/data.ts';

export const Engine = { Catapult: 0, Ballista: 1, BronzeCannon: 2, IronCannon: 3, DwarfCannon: 4 } as const;
export type Engine = (typeof Engine)[keyof typeof Engine];

/** Research ids (combat/items.ts Research), kept as numbers so this module stays a leaf. */
const SIEGE_ENGINES = 8;
const CANNONS = 15;
/** combat/items.ts Skill.Cannon. */
const CANNON_SKILL = 16;

export interface EngineSpec {
  id: Engine;
  name: string;
  /** Catalogue model (review/batch-2 MANIFEST, models/mechanical). */
  model: string;
  hp: number;
  /** Hit on a unit, and the splash round it (catapult and cannon), wu. */
  damage: number;
  splash: number;
  splashRadius: number;
  /** A ballista bolt goes on through this many more targets in a line. */
  pierce: number;
  /** Against walls, gates, buildings and the foes' structures (lairs, huts). */
  vsWalls: number;
  range: number;
  minRange: number;
  reloadSteps: number;
  /** Crew it needs standing by to fire, and the skill they need (Skill bit, 0 for none). */
  crew: number;
  crewSkill: number;
  /** Hauled by a horse or an ox, or pushed by its crew, wu per step. */
  horse: number;
  ox: number;
  pushed: number;
  /** What a shot uses from the pool: one of this, and for cannons a gunpowder charge (10 to one gunpowder). */
  munition: Res;
  powder: boolean;
  /** The shot it fires (combat/items.ts Shot). */
  shot: number;
  /** Largest miss as a share of the distance, bp (s). */
  spreadBp: number;
  /** Where it is made: building kind and level, and a Forge level the town needs too. */
  at: readonly [number, number];
  forge: number;
  research: number;
  cost: Cost;
  steps: number;
  /** Wooden engines burn (fire arrows, cinderlings, fireballs) (s). */
  wooden: boolean;
  /** Hit box: half width and height, wu. */
  halfWidth: number;
  height: number;
}

const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);
const sec = (n: number): number => n * STEPS_PER_SECOND;
const H = Res.HardwoodLumber;

/** combat/items.ts Shot ids for the engines' shots (kept as numbers so this module stays a leaf). */
export const ENGINE_SHOT = { Cannonball: 13, CatapultStone: 14, BallistaBolt: 15 } as const;

export const ENGINES: readonly EngineSpec[] = [
  {
    id: Engine.Catapult, name: 'Catapult', model: 'catapult', hp: 300, damage: 80, splash: 80, splashRadius: cm(300), pierce: 0, vsWalls: 200,
    range: cm(5000), minRange: cm(1500), reloadSteps: sec(15), crew: 2, crewSkill: 0, horse: v10(20), ox: v10(15), pushed: v10(8),
    munition: Res.CatapultStone, powder: false, shot: ENGINE_SHOT.CatapultStone, spreadBp: 600,
    at: [BuildingKind.Workshop, 3], forge: 0, research: SIEGE_ENGINES, cost: [[H, 40], [Res.Planks, 20], [Res.Rope, 10], [Res.BronzeIngot, 10]], steps: sec(240), wooden: true,
    halfWidth: cm(150), height: cm(300),
  },
  {
    id: Engine.Ballista, name: 'Ballista', model: 'ballista', hp: 250, damage: 90, splash: 0, splashRadius: 0, pierce: 1, vsWalls: 20,
    range: cm(4500), minRange: cm(500), reloadSteps: sec(8), crew: 1, crewSkill: 0, horse: v10(25), ox: v10(15), pushed: v10(10),
    munition: Res.BallistaBolt, powder: false, shot: ENGINE_SHOT.BallistaBolt, spreadBp: 200,
    at: [BuildingKind.Workshop, 4], forge: 3, research: SIEGE_ENGINES, cost: [[H, 40], [Res.WroughtIron, 20], [Res.Rope, 10]], steps: sec(240), wooden: true,
    halfWidth: cm(120), height: cm(180),
  },
  {
    id: Engine.BronzeCannon, name: 'Bronze cannon', model: 'cannon_bronze', hp: 400, damage: 150, splash: 50, splashRadius: cm(200), pierce: 0, vsWalls: 400,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, crewSkill: CANNON_SKILL, horse: v10(25), ox: v10(15), pushed: v10(10),
    munition: Res.Cannonball, powder: true, shot: ENGINE_SHOT.Cannonball, spreadBp: 300,
    at: [BuildingKind.Foundry, 1], forge: 0, research: CANNONS, cost: [[Res.BronzeIngot, 20], [H, 10]], steps: sec(180), wooden: false,
    halfWidth: cm(110), height: cm(150),
  },
  {
    id: Engine.IronCannon, name: 'Iron cannon', model: 'cannon_iron', hp: 500, damage: 150, splash: 50, splashRadius: cm(200), pierce: 0, vsWalls: 400,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, crewSkill: CANNON_SKILL, horse: v10(25), ox: v10(15), pushed: v10(10),
    munition: Res.Cannonball, powder: true, shot: ENGINE_SHOT.Cannonball, spreadBp: 300,
    at: [BuildingKind.Foundry, 1], forge: 3, research: CANNONS, cost: [[Res.WroughtIron, 12], [H, 10]], steps: sec(150), wooden: false,
    halfWidth: cm(110), height: cm(150),
  },
  {
    // A Dwarf city's own cannon (Table 19: "its own Dwarf cannons are not for sale"): the iron cannon's numbers, never made by players.
    id: Engine.DwarfCannon, name: 'Dwarf cannon', model: 'cannon_dwarf', hp: 500, damage: 150, splash: 50, splashRadius: cm(200), pierce: 0, vsWalls: 400,
    range: cm(6000), minRange: cm(1000), reloadSteps: sec(12), crew: 2, crewSkill: 0, horse: 0, ox: 0, pushed: 0,
    munition: Res.Cannonball, powder: true, shot: ENGINE_SHOT.Cannonball, spreadBp: 300,
    at: [-1, 0], forge: 0, research: 0, cost: [], steps: 0, wooden: false,
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
/** A hitched animal hauls while within this distance (s). */
export const HAUL_REACH_WU = 5 * WU_PER_METRE;
/** Engines see 20 m by themselves (s); their crew's eyes do the rest. */
export const ENGINE_SIGHT_WU = 20 * WU_PER_METRE;
/** Gunpowder charges in one unit of gunpowder (Table 2b). */
export const CHARGES_PER_POWDER = 10;
/** A Citadel (main base level 10) has 4 cannon ports on its roof (Table 4). */
export const CITADEL_LEVEL = 10;
export const CANNON_PORTS = 4;
