// Buildings as data (Buildings; Main base; Table 4: Buildings; Table 18:
// Lights; Table 6's farm yields; Table 7's training rows), as Patch 2 left
// them (Jade, 2026-10-04): fourteen entries in one build menu, and only the
// Big House has levels. Every other building is built once and never
// upgraded; what one of its old tiers or levels unlocked now comes at the
// main base level that tier needed (recipes.ts, siege/data.ts, the research
// in combat/items.ts and the kit tiers in units/kits.ts).

import { Res, type Cost } from '../economy/resources.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';

/** Building kinds. Patch 2 cut 17 of them and the ids closed up; the ones it kept or added are in build menu order, then the defences' other materials. */
export const BuildingKind = {
  MainBase: 0,
  /** Patch 2: one Farm, in place of the crop field, vegetable farm and herb bed. */
  Farm: 1,
  /** Patch 2: the Barn, in place of the livestock farm, the pen and barn and the Stables. */
  Barn: 2,
  Storehouse: 3,
  FishingDock: 4,
  /** Patch 2: the Workshop also does what the Lumber mill, Tannery and Herbalist hut did. */
  Workshop: 5,
  /** Patch 2: the Forge also does what the Kiln and Powder mill did. */
  Forge: 6,
  /** Patch 2: every siege engine and cannon, in place of the Workshop's engines, the Foundry and the Gunnery yard. */
  ArtilleryWorkshop: 7,
  Barracks: 8,
  MagiSanctum: 9,
  ScholarsLodge: 10,
  Mineshaft: 11,
  Wall: 12,
  Gate: 13,
  Tower: 14,
  Earthworks: 15,
  Ramp: 16,
  TorchPost: 17,
  /** Patch 2 (Jade, round 4): the bonfire, in place of the brazier. */
  Bonfire: 18,
  WallHardwood: 19,
  WallStone: 20,
  GateHardwood: 21,
  GateStone: 22,
  TowerHardwood: 23,
  TowerStone: 24,
} as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

/** One level of a building: the Big House has ten (costs above the first are the upgrade's cost), every other building one. */
export interface LevelSpec {
  name: string;
  cost: Cost;
  /** Table 4 "Build (ws)": worker-seconds of building work. */
  ws: number;
  health: number;
  supply: number;
  /** Main base level needed to place or upgrade to this level; 0 for none. */
  needsBase: number;
  /** A research or other need not met in this milestone, shown as the greyed reason; '' for none. */
  needs: string;
  /** Workers it shelters at night. */
  shelters: number;
  /** Workers that can be assigned to it (farmers, miners and dock hands); crafting buildings take none (Patch 2). */
  workers: number;
  /** Table 4 "Gives or unlocks", for the tooltip. */
  gives: string;
  /** A research step it needs (combat/items.ts Research), or 0. */
  research: number;
}

/** A light (Table 18). Patch 2 (Jade): lights burn no fuel; once built, one burns until something puts it out. */
export interface LightSpec {
  /** Light radius and claimed radius in metres (Table 18). */
  lightM: number;
  claimM: number;
  /** Counts against the dusk limit (Table 8; wall torches counted half before Patch 2): 2 = whole, 1 = half, 0 = not at all. */
  outlyingHalves: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  name: string;
  /** Short purpose for tooltips. */
  purpose: string;
  /**
   * Its place in the one build menu (Patch 2: basic and advanced merged), 1 to
   * 14; 0 for none. Kinds that share a slot open a submenu named `group`.
   */
  slot: number;
  /** The submenu a kind sits in: Defences (walls, gates, towers, earthworks) or Lights. */
  group?: 'Defences' | 'Lights';
  /** Footprint in 45 cm columns at level 1; which columns are solid, and how it grows, is in footprints.ts. */
  w: number;
  d: number;
  levels: readonly LevelSpec[];
  /** Which resources it accepts as a drop-off. */
  dropoff: 'all' | 'wood' | 'none';
  /** Trains workers (Table 7: Big House or any farm). */
  trainsWorkers: boolean;
  /** Lights only. */
  light?: LightSpec;
  /** The Farm: what it grows and how much a farmer makes in a day, in full in every band (Patch 2). */
  crop?: { res: Res; perDay: number };
  /** Crafting buildings (Patch 2): they work with no workers and hold none, at CRAFT_PACE. */
  crafts?: boolean;
  /** Placeable now; when false, `comesWith` says why it is greyed. */
  live: boolean;
  comesWith: string;
  /** Height of the solid part in centimetres: what projectiles hit and climbers climb (s). */
  heightCm: number;
  /** Variant names for the build menu (gates: which way they face). */
  variants?: readonly string[];
  /** Variant 1 turns the footprint a quarter turn (gates running north to south). */
  turns?: boolean;
  /** Defences: walls, gates and towers (monsters break or climb them rather than seek them out). */
  defence?: 'wall' | 'gate' | 'tower';
  /** Wooden (softwood or hardwood): chips of wood when hit, rats gnaw wooden gates. */
  wooden?: boolean;
  /** Men it takes on its top (Table 4: tower 4 slots; parapets 8 from main base level 3), anyone on foot (units/top.ts). */
  slots?: number;
  /** Extra sight for the units inside, metres (towers +10 m). */
  sightBonusM?: number;
  /** Earthworks are dug or heaped land, not a building: they have their own order. */
  site?: boolean;
}

const lvl = (name: string, cost: Cost, ws: number, health: number, o: Partial<LevelSpec> = {}): LevelSpec => ({
  name, cost, ws, health, supply: 0, needsBase: 0, needs: '', shelters: 0, workers: 0, gives: '', research: 0, ...o,
});

const S = Res.SoftwoodLumber;
const H = Res.HardwoodLumber;
const ST = Res.Stone;

const MAIN_BASE_GIVES = [
  'drop-off for everything, trains workers and tier 1 troops; shelters 8',
  'Barracks',
  'parapets with room for 8 up top; cavalry; the Forge\'s wrought iron, charcoal, bricks and glass; the Workshop\'s charms and hand carts',
  'Magi Sanctum, Mineshaft',
  'the Forge\'s pig iron and iron; the Workshop\'s brooches, moonleafs and ox carts; the Artillery workshop and catapults; the first marble level',
  'trains mages',
  'the Forge\'s steel, carbon steel and gunpowder; the Workshop\'s heirlooms and sunhearts; ballistas',
  'cannons',
  'marble facing and banners',
  '4 cannon ports on the roof',
];

const mainBase = (name: string, cost: Cost, ws: number, health: number, supply: number, n: number, needs = ''): LevelSpec =>
  lvl(name, cost, ws, health, { supply, shelters: 8, needs, gives: MAIN_BASE_GIVES[n - 1]! });

/** Research steps buildings need (the same numbers as combat/items.ts Research). */
const DEEP_MINING_1 = 3;
const BRONZE = 2;

/** A wall column (Table 4): 1 x 1, 3 m tall (stone 3.6 m). */
/** 360 as '3.6', 300 as '3'. */
function metresText(cm: number): string {
  const whole = floorDiv(cm, 100);
  const rest = cm - whole * 100;
  return rest === 0 ? `${whole}` : `${whole}.${rest % 10 === 0 ? floorDiv(rest, 10) : rest}`;
}

/** Walls, gates, towers and earthworks share the Defences slot (Patch 2). */
const DEFENCES = { slot: 13, group: 'Defences' } as const;

function wall(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, heightCm: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: `A wall column ${metresText(heightCm)} m tall, placed a stretch at a time from point to point. Climbers go over it; breakers smash it.`,
    ...DEFENCES, w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm, defence: 'wall', wooden,
    levels: [lvl(name, cost, ws, health)],
  };
}

/** A gate 3 columns wide that the players' units walk through and monsters do not (Table 4). */
function gate(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: 'A gate 3 columns wide: your units walk through it, monsters must break it. Shut and lit by a torch, rats and spiders will not climb it.',
    ...DEFENCES, w: 3, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm: 300, defence: 'gate', wooden, turns: true,
    variants: [`${name} (east to west)`, `${name} (north to south)`],
    levels: [lvl(name, cost, ws, health, { gives: 'stops rats and spiders climbing when lit by a torch' })],
  };
}

/** A tower (Table 4): 4 places on its top and +10 m sight. */
function tower(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: 'Men sent up (E and click it, or right click it) stand on its top: archers shoot and mages cast from there, the rest strike only at flyers that swoop down. 4 places, +10 m sight; U lets them down.',
    ...DEFENCES, w: 3, d: 3, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm: 500, defence: 'tower', wooden, slots: 4, sightBonusM: 10,
    levels: [lvl(name, cost, ws, health, { gives: '4 places up top, +10 m sight' })],
  };
}

type SpecInput = Omit<BuildingSpec, 'heightCm'> & { heightCm?: number };

/** Every building stands 4 m tall unless its row says otherwise (s). */
const withHeights = (specs: SpecInput[]): BuildingSpec[] => specs.map((sp) => ({ heightCm: 400, ...sp }));

/** Indexed by kind: the rows are in BuildingKind order. */
export const BUILDINGS: readonly BuildingSpec[] = withHeights([
  {
    kind: BuildingKind.MainBase, name: 'Big House', purpose: 'The main base: drop-off for every resource, trains workers and tier 1 troops, shelters workers at night; from level 3 men go up on its parapets (E and click it). The only building with levels: it upgrades to level 10, and each level unlocks what the other buildings make.',
    slot: 1, w: 14, d: 14, dropoff: 'all', trainsWorkers: true, live: true, comesWith: '', heightCm: 600,
    levels: [
      // Supply 10, not Table 4's 8 (s): Jade's extra starting supply for the three starting warriors (Troops and gear: starting units).
      mainBase('Big House', [[S, 300], [ST, 150]], 1200, 1200, 10, 1),
      mainBase('Longhall', [[S, 100], [ST, 40]], 400, 1600, 12, 2),
      mainBase('Hall', [[S, 110], [ST, 45], [Res.Sticks, 15]], 420, 2000, 16, 3),
      { ...mainBase('Stockade Hall', [[S, 120], [ST, 60], [H, 25], [Res.BronzeIngot, 5]], 450, 2500, 20, 4), research: BRONZE },
      mainBase('Marble Hall', [[H, 75], [ST, 100], [Res.Bricks, 20], [Res.Marble, 20], [Res.BronzeIngot, 10]], 600, 3000, 25, 5),
      mainBase('Keep', [[H, 100], [ST, 150], [Res.Bricks, 40], [Res.Marble, 30], [Res.WroughtIron, 15]], 800, 3600, 30, 6),
      mainBase('Fortified Keep', [[H, 125], [ST, 200], [Res.Bricks, 60], [Res.Marble, 40], [Res.WroughtIron, 25]], 1000, 4200, 35, 7),
      mainBase('Castle', [[H, 150], [ST, 250], [Res.Bricks, 100], [Res.Marble, 50], [Res.IronIngot, 30]], 1200, 5000, 40, 8),
      mainBase('Great Castle', [[H, 150], [ST, 250], [Res.Bricks, 100], [Res.Marble, 75], [Res.SteelIngot, 30]], 1500, 6000, 45, 9),
      mainBase('Citadel', [[H, 200], [ST, 300], [Res.Bricks, 150], [Res.Marble, 125], [Res.SteelIngot, 50], [Res.Gold, 5]], 2000, 7500, 50, 10),
    ],
  },
  {
    // The tier 1 crop field's numbers from before Patch 2 (s, Jade's rebalance); a farmer grows 8 farm fare a day, the potato farm's 16 food.
    kind: BuildingKind.Farm, name: 'Farm', purpose: 'Grows farm fare, a hearty medley of vegetables, with 2 assigned farmers, in full in every band. Gives supply, trains workers, shelters its farmers.',
    slot: 2, w: 12, d: 12, dropoff: 'none', trainsWorkers: true, live: true, comesWith: '',
    crop: { res: Res.FarmFare, perDay: 8 },
    levels: [lvl('Farm', [[S, 30], [Res.Sticks, 10]], 150, 400, { supply: 4, shelters: 4, workers: 2, gives: '2 farmers grow farm fare; trains workers; the farmhouse shelters 4' })],
  },
  {
    // The livestock farm's cost from before Patch 2 (s, Jade's rebalance); no supply and no workers (s).
    kind: BuildingKind.Barn, name: 'Barn', purpose: 'A red barn for tamed cattle, chickens, horses and oxen: 10 stalls, one big animal or up to 6 chickens to a stall. Workers tame animals with farm fare once a Barn stands. The animals cannot graze, so each eats farm fare from the stock every morning (a hungry one loses health); they walk round the Barn by day, shelter in it at night, breed, and hens lay eggs. Slaughter (K) takes a grown animal for its meat: a cow gives twenty times a chicken. Cavalry at the Barracks take their horses from the nearest Barn.',
    slot: 3, w: 12, d: 12, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 450,
    levels: [lvl('Barn', [[S, 40], [Res.Sticks, 10]], 200, 400, { gives: '10 stalls, taming, breeding, eggs, slaughter' })],
  },
  {
    // Cheap to build (Jade): 30 softwood and 100 worker-seconds (s, Jade's rebalance).
    kind: BuildingKind.Storehouse, name: 'Storehouse', purpose: 'A cheap drop-off for every resource, for far-off gathering spots and mineshafts.',
    slot: 4, w: 8, d: 8, dropoff: 'all', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Storehouse', [[S, 30]], 100, 600, { gives: 'drop-off for everything' })],
  },
  {
    kind: BuildingKind.FishingDock, name: 'Fishing dock', purpose: 'Workers fish faster and in deeper water, and shelter inside.',
    slot: 5, w: 6, d: 4, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Fishing dock', [[S, 30], [Res.Rope, 5]], 150, 400, { shelters: 3, workers: 3, gives: '3 workers fish at net speed in any depth and shelter inside' })],
  },
  {
    // The Work Hut's cost from before Patch 2 (s, Jade's rebalance).
    kind: BuildingKind.Workshop, name: 'Workshop', purpose: 'Makes everything made by hand, with no workers: planks, leather, hardened leather and rope, bandages and remedies, gravel, sticks and ramp steps, carts and trinkets. Better goods come with the main base\'s levels.',
    slot: 6, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Workshop', [[S, 40], [ST, 20]], 200, 600, { gives: 'planks, leather, rope, medicine, gravel, sticks, ramp steps, carts, trinkets' })],
  },
  {
    // The Casting Hearth's cost from before Patch 2 (s, Jade's rebalance).
    kind: BuildingKind.Forge, name: 'Forge', purpose: 'Makes everything made with fire, with no workers: ingots, charcoal, bricks, glass and gunpowder. Each metal comes with a main base level. Troops and workers upgrade their gear beside it.',
    slot: 7, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Forge', [[S, 60], [ST, 40]], 300, 600, { gives: 'copper, tin and bronze; wrought iron, charcoal, bricks and glass at main base 3; pig iron and iron at 5; steel, carbon steel and gunpowder at 7' })],
  },
  {
    // The Great Workshop's upgrade cost from before Patch 2, from main base 5, where its first engine opens (s, Jade's rebalance).
    kind: BuildingKind.ArtilleryWorkshop, name: 'Artillery workshop', purpose: 'Builds every siege engine, with no workers: catapults from main base 5, ballistas from 7, bronze and iron cannons from 8 after Cannons. Each rolls out with its full crew of artillery crewmen (catapult 2, ballista 1, cannon 2), and it trains crewmen to replace any who fall. No engine needs ammunition.',
    slot: 8, w: 12, d: 12, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Artillery workshop', [[H, 50], [ST, 40], [Res.Bricks, 20], [Res.WroughtIron, 10]], 400, 1200, { needsBase: 5, gives: 'catapults, ballistas, cannons' })],
  },
  {
    kind: BuildingKind.Barracks, name: 'Barracks', purpose: 'Trains troops of every type and tier (close melee, long melee, ranger, brawler, and cavalry from main base 3 on a horse from the nearest Barn), trains them to Soldier and Veteran, and upgrades their gear.',
    slot: 9, w: 10, d: 10, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Barracks', [[S, 80], [ST, 40], [Res.Sticks, 20]], 400, 1000, { needsBase: 2, gives: 'troops of every type and tier, rank training' })],
  },
  {
    kind: BuildingKind.MagiSanctum, name: 'Magi Sanctum', purpose: 'Trains support and battle mages and their ranks, upgrades their wands and robes, and researches Hexcraft.',
    slot: 10, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Magi Sanctum', [[H, 40], [ST, 60], [Res.Bricks, 20], [Res.ManaCrystal, 1]], 450, 1200, { needsBase: 4, gives: 'novices, mage ranks, wand and robe upgrades' })],
  },
  {
    kind: BuildingKind.ScholarsLodge, name: "Scholar's Lodge", purpose: 'Research, one step at a time: pay the fee and it loads like training. Eats 2 food a day and uses 1 supply. Each further one costs more; at most 10.',
    slot: 11, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl("Scholar's Lodge", [[S, 60], [ST, 20]], 240, 500, { gives: 'one research at a time; each further research building costs this much again on top' })],
  },
  {
    kind: BuildingKind.Mineshaft, name: 'Mineshaft', purpose: 'Built on flat stone. 4 assigned miners go down, fill a 25 lb bag with stone, ore, coal, gold or gems, and carry it to the nearest main base or Storehouse (assign them with a right click). Deep Mining II and III let every shaft dig deeper. Prospect first (T) to see how rich the spot is.',
    slot: 12, w: 6, d: 6, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Mineshaft', [[H, 60], [ST, 80], [Res.BronzeIngot, 10]], 600, 800, { needsBase: 4, workers: 4, research: DEEP_MINING_1, gives: '4 miners: stone, ores, coal, gold and gems by depth' })],
  },
  wall(BuildingKind.Wall, 'Softwood wall', [[S, 1]], 5, 300, 300, true),
  gate(BuildingKind.Gate, 'Softwood gate', [[S, 6]], 30, 600, true),
  tower(BuildingKind.Tower, 'Softwood tower', [[S, 20]], 100, 800, true),
  {
    kind: BuildingKind.Earthworks, name: 'Earthworks', purpose: 'Earth banks, ramps and fill, heaped by workers from Earth in the pool: 1 Earth and 5 worker-seconds per column per 11 cm step. Lumber and stone ramps use ramp steps made at the Workshop (5 and 8 worker-seconds a step). Drag to mark it.',
    ...DEFENCES, w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', site: true, heightCm: 0,
    variants: ['Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp'],
    levels: [lvl('Earthworks', [[Res.Earth, 1]], 5, 1, { gives: 'built on the spot' })],
  },
  {
    kind: BuildingKind.Ramp, name: 'Lumber or stone ramp', purpose: 'Ramps made at the Workshop and placed by workers: choose Lumber ramp or Stone ramp under Earthworks.',
    slot: 0, w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: false, comesWith: 'Placed from Earthworks: choose Lumber ramp or Stone ramp there.', heightCm: 50, site: true,
    levels: [lvl('Lumber ramp', [[Res.LumberRamp, 1]], 5, 300, { gives: 'a ramp step of lumber' })],
  },
  {
    kind: BuildingKind.TorchPost, name: 'Torch post', purpose: 'A light (10 m) that claims the land 5 m around it while lit. Needs no fuel.',
    slot: 14, group: 'Lights', w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 250,
    light: { lightM: 10, claimM: 5, outlyingHalves: 2 },
    levels: [lvl('Torch post', [[S, 2], [Res.Resin, 1]], 10, 40, { gives: 'light 10 m, claims 5 m' })],
  },
  {
    // Patch 2 (Jade): 15 softwood, light 20 m, claims 10 m. The size, build work, health and the whole count against the dusk limit are suggestions for Jade's rebalance.
    kind: BuildingKind.Bonfire, name: 'Bonfire', purpose: 'A big fire that lights 20 m and claims the land 10 m around it while lit. Needs no fuel.',
    slot: 14, group: 'Lights', w: 3, d: 3, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 150,
    light: { lightM: 20, claimM: 10, outlyingHalves: 2 },
    levels: [lvl('Bonfire', [[S, 15]], 30, 150, { gives: 'light 20 m, claims 10 m' })],
  },
  wall(BuildingKind.WallHardwood, 'Hardwood wall', [[H, 1]], 8, 600, 300, true),
  wall(BuildingKind.WallStone, 'Stone wall', [[ST, 2]], 20, 1500, 360, false),
  gate(BuildingKind.GateHardwood, 'Hardwood gate', [[H, 6]], 45, 1200, true),
  gate(BuildingKind.GateStone, 'Stone gate', [[ST, 10], [H, 2]], 90, 3000, false),
  tower(BuildingKind.TowerHardwood, 'Hardwood tower', [[H, 20]], 150, 1600, true),
  tower(BuildingKind.TowerStone, 'Stone tower', [[ST, 40], [H, 10]], 300, 4000, false),
]);

export function buildingSpec(kind: number): BuildingSpec {
  const s = BUILDINGS[kind];
  if (!s) throw new Error(`unknown building kind ${kind}`);
  return s;
}

export function levelSpec(kind: number, level: number): LevelSpec {
  const l = buildingSpec(kind).levels[level - 1];
  if (!l) throw new Error(`building kind ${kind} has no level ${level}`);
  return l;
}

/** The name a building shows: its level's name ("Longhall" for a level 2 main base). `variant` is kept for the gates' callers. */
export function buildingName(kind: number, level: number, _variant = 0): string {
  return levelSpec(kind, level).name;
}

/** Steps of work for a level: its worker-seconds at 20 steps a second. */
export function workSteps(kind: number, level: number): number {
  return levelSpec(kind, level).ws * STEPS_PER_SECOND;
}

/**
 * A farm's harvest (Jade, patch notes 1, 2026-10-03): its progress bar fills
 * by one step of work for each farmer at work, so two farmers fill it twice as
 * fast as one, and a full bar brings in what one farmer grows in that much
 * work (Table 6's yield per farmer-day, by tier and band), whatever the number
 * of farmers. A new field grows from the first step a farmer works it: the old
 * 2 fallow days are gone. One farmer-day by default, so a harvest is Table 6's
 * yield per farmer-day; a shorter bar brings in less each time, at the same
 * yield per day.
 */
export const FARM_HARVEST_STEPS = CYCLE_STEPS;

/** Table 7: a new worker costs 20 food (nutrition) and 15 s (halved pacing) at the Big House or a Farm. */
export const WORKER_FOOD = 20;
export const WORKER_TRAIN_STEPS = 15 * STEPS_PER_SECOND;
/** Units a building can have queued (Table 7 (s): a Barracks or Sanctum can queue 5; the same for every building here). */
export const QUEUE_LIMIT = 5;

/**
 * How fast a crafting building works with no workers (Patch 2: the Workshop,
 * Forge and Artillery workshop hold none): its goods load this many steps of
 * one worker's work each step, the pace two workers had inside before Patch
 * 2, the full crew of a Work Hut, Casting Hearth, Kiln, Tannery, Herbalist
 * hut or Lumber mill (s, Jade's rebalance). Siege engines are not goods: they
 * take their own time (siege/data.ts).
 */
export const CRAFT_PACE = 2;
/**
 * The Barn (Patch 2, Jade): 10 stalls, a big animal (cattle, a horse or an ox)
 * to a stall, or up to 6 chickens sharing one.
 */
export const BARN_STALLS = 10;
export const CHICKENS_PER_STALL = 6;
/** Cavalry trains at the Barracks from this main base level (Patch 2, Jade), as at the Stables before. */
export const CAVALRY_BASE = 3;

/**
 * The Forge's metal steps (Patch 2: the Forge has no levels), by the main
 * base level each needs: 1 (copper, tin and bronze) with the Forge built, 2
 * (wrought iron) at main base 3, 3 (pig iron and iron) at 5, 4 (steel and
 * carbon steel) at 7, the levels the Bloomery, Ironworks and Steelworks
 * needed before Patch 2. Kit tiers, research and foraging that needed a
 * forge level need its step now (units/kits.ts TIER_NEEDS).
 */
export const FORGE_STEP_BASE: readonly number[] = [0, 0, 3, 5, 7];

/** The metal step a town is at: 0 with no finished Forge, else the highest step its main base level reaches. */
export function forgeStep(hasForge: boolean, base: number): number {
  if (!hasForge) return 0;
  let n = 1;
  while (n + 1 < FORGE_STEP_BASE.length && base >= FORGE_STEP_BASE[n + 1]!) n++;
  return n;
}

/** Lights farther than this from any main base count as outlying at dusk (Table 8). */
export const OUTLYING_M = 40;
/** A worker relights a light that was put out in 2 s (Table 18). */
export const RELIGHT_STEPS = 2 * STEPS_PER_SECOND;
/** Claimed land around a player building, measured from its outer edge (Table 8, Jade). */
export const BUILDING_CLAIM_M = 10;
/** A building under construction has 10% of its health plus the share built (Table 4). */
export const UNFINISHED_HEALTH_PER_MILLE = 100;
/** Cancelling an unfinished building refunds 75% (Building placement). */
export const CANCEL_REFUND_PER_MILLE = 750;
/** Workers inside a shelter that is destroyed take 10% of their maximum health (Workers: sheltering). */
export const SHELTER_LOSS_PER_MILLE = 100;
/**
 * How far each building sees (s), in metres out from its footprint's edge,
 * by building kind: what a building sees is in sight of every player, as a
 * unit's sight is (Fog of war). 10 m, as far as a building claims land; the
 * main base 20 m, so the town keeps its watch at night while its workers
 * shelter; a tower 20 m, the +10 m sight it gives its garrison (Table 4); a
 * bonfire 20 m, as far as it lights. A fog night halves it, as all sight.
 */
export const BUILDING_SIGHT_M: Readonly<Partial<Record<number, number>>> = {
  [BuildingKind.MainBase]: 20, [BuildingKind.Farm]: 10, [BuildingKind.Barn]: 10, [BuildingKind.Storehouse]: 10,
  [BuildingKind.FishingDock]: 10, [BuildingKind.Workshop]: 10, [BuildingKind.Forge]: 10, [BuildingKind.ArtilleryWorkshop]: 10,
  [BuildingKind.Barracks]: 10, [BuildingKind.MagiSanctum]: 10, [BuildingKind.ScholarsLodge]: 10, [BuildingKind.Mineshaft]: 10,
  [BuildingKind.Wall]: 10, [BuildingKind.Gate]: 10, [BuildingKind.Tower]: 20, [BuildingKind.TorchPost]: 10, [BuildingKind.Bonfire]: 20,
  [BuildingKind.WallHardwood]: 10, [BuildingKind.WallStone]: 10, [BuildingKind.GateHardwood]: 10, [BuildingKind.GateStone]: 10,
  [BuildingKind.TowerHardwood]: 20, [BuildingKind.TowerStone]: 20,
};
