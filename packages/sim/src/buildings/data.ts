// Buildings as data (Buildings; Main base; Table 4: Buildings; Table 18:
// Lights; Table 6's farm yields; Table 7's training rows), as Patch 2 left
// them (Jade, 2026-10-04): fourteen entries in one build menu, and only the
// Big House has levels. Every other building is built once and never
// upgraded; what one of its old tiers or levels unlocked now comes at the
// main base level that tier needed (recipes.ts, siege/data.ts, the research
// in combat/items.ts and the kit tiers in units/kits.ts). Patch 5 (Jade)
// condensed the main base's ten levels into four tiers, and every main base
// requirement moved to the tier its old level fell into: levels 2 and 3 to
// tier 2, 4 to 7 to tier 3, 8 to 10 to tier 4 (Deep Mining III to tier 3),
// so only the Cannons and Muskets research and the Citadel's own engines
// wait on tier 4. Lumber in a cost is either kind (Patch 5), but for the
// hardwood walls, gates and towers.

import { Res, type Cost } from '../economy/resources.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';

/** Building kinds. Patch 2 cut 17 of them and Patch 5 the earthworks and ramps, and the ids closed up each time; the ones kept or added are in build menu order, then the defences' other materials, then Patch 5's earth rampart and Tavern. */
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
  TorchPost: 15,
  /** Patch 2 (Jade, round 4): the bonfire, in place of the brazier. */
  Bonfire: 16,
  WallHardwood: 17,
  WallStone: 18,
  GateHardwood: 19,
  GateStone: 20,
  TowerHardwood: 21,
  TowerStone: 22,
  /** Patch 5 (Jade, GP-43): the earth rampart, the only thing built of earth. */
  EarthRampart: 23,
  /** Patch 5 (Jade, GP-19 to GP-21): burns food into silver while open for business, and hires the Dreadnought. */
  Tavern: 24,
} as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

/** One level of a building: the main base has four, its tiers (costs above the first are the upgrade's cost), every other building one. */
export interface LevelSpec {
  name: string;
  cost: Cost;
  /** Table 4 "Build (ws)": worker-seconds of building work. */
  ws: number;
  health: number;
  supply: number;
  /** Another way to pay `cost`, taken when the stock cannot cover it (Patch 5: the Tavern's 7 silver in place of its gold). */
  alt?: Cost;
  /** Main base tier needed to place or upgrade to this level; 0 for none. */
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
   * 15 (Patch 5: the Tavern after the Mineshaft); 0 for none. Kinds that share a slot open a submenu named `group`.
   */
  slot: number;
  /** The submenu a kind sits in: Defences (walls, gates and towers) or Lights. */
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
  /** Men it takes on its top (Table 4: tower 4 slots; parapets 8 from main base tier 2), anyone on foot (units/top.ts). */
  slots?: number;
  /** Extra sight for the units inside, metres (towers +10 m). */
  sightBonusM?: number;
}

const lvl = (name: string, cost: Cost, ws: number, health: number, o: Partial<LevelSpec> = {}): LevelSpec => ({
  name, cost, ws, health, supply: 0, needsBase: 0, needs: '', shelters: 0, workers: 0, gives: '', research: 0, ...o,
});

/** Any lumber, softwood or hardwood, whichever is in stock (Jade's mini balance; every lumber cost from Patch 5). */
const L = Res.AnyLumber;
/** Hardwood itself: only the hardwood walls, gates and towers ask for it (Patch 5). */
const H = Res.HardwoodLumber;
const ST = Res.Stone;

const MAIN_BASE_GIVES = [
  'drop-off for everything, trains workers and tier 1 troops; shelters 8',
  'the Barracks; parapets with room for 8 up top; cavalry; the Forge\'s wrought iron, charcoal, bricks and glass; the Workshop\'s charms and hand carts',
  'the Magi Sanctum, Mineshaft and Artillery workshop; trains mages; the Forge\'s pig iron, iron, steel, carbon steel and gunpowder; the Workshop\'s brooches, heirlooms, moonleafs, sunhearts and ox carts; catapults and ballistas; marble',
  'the Cannons and Muskets research and cannons; the engine platform on top, where Build defense puts a fixed engine with its garrison crew, or up to 4 more units while it stands empty',
];

const mainBase = (name: string, cost: Cost, ws: number, health: number, supply: number, n: number, needs = ''): LevelSpec =>
  lvl(name, cost, ws, health, { supply, shelters: 8, needs, gives: MAIN_BASE_GIVES[n - 1]! });

/** Research steps buildings need (the same numbers as combat/items.ts Research). */
const DEEP_MINING_1 = 3;

/** A wall column (Table 4): 1 x 1, 3 m tall (stone 3.6 m). */
/** 360 as '3.6', 300 as '3'. */
function metresText(cm: number): string {
  const whole = floorDiv(cm, 100);
  const rest = cm - whole * 100;
  return rest === 0 ? `${whole}` : `${whole}.${rest % 10 === 0 ? floorDiv(rest, 10) : rest}`;
}

/** Walls, gates and towers share the Defences slot (Patch 2). */
const DEFENCES = { slot: 14, group: 'Defences' } as const;

function wall(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, heightCm: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: `A wall column ${metresText(heightCm)} m tall, placed a stretch at a time from point to point. Climbers go over it; breakers smash it.`,
    ...DEFENCES, w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm, defence: 'wall', wooden,
    levels: [lvl(name, cost, ws, health)],
  };
}

/** A gate 6 columns wide (Patch 5, Jade's GP-42: twice the 3 it was) that the players' units walk through and monsters do not (Table 4). */
function gate(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: 'A gate 6 columns wide: your units walk through it, monsters must break it. Shut and lit by a torch, rats and spiders will not climb it.',
    ...DEFENCES, w: 6, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm: 300, defence: 'gate', wooden, turns: true,
    variants: [`${name} (east to west)`, `${name} (north to south)`],
    levels: [lvl(name, cost, ws, health, { gives: 'stops rats and spiders climbing when lit by a torch' })],
  };
}

/** A tower (Table 4): 4 places on its top and +10 m sight; 4 columns square since Patch 5, as its model is. */
function tower(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number, wooden: boolean): SpecInput {
  return {
    kind, name, purpose: 'Men sent up (E and click it, or right click it) stand on its top: archers shoot and mages cast from there, the rest strike only at flyers that swoop down. 4 places, +10 m sight; U lets them down.',
    ...DEFENCES, w: 4, d: 4, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm: 500, defence: 'tower', wooden, slots: 4, sightBonusM: 10,
    levels: [lvl(name, cost, ws, health, { gives: '4 places up top, +10 m sight' })],
  };
}

/**
 * The earth rampart (Patch 5, Jade's GP-43): a chunk of earth 2 m high and
 * about 1 m across (2 columns square), placed a stretch at a time like a wall
 * and a wall in every other way. Each has the health of one wooden wall
 * column, so for its length it is much weaker; each takes one worker's full
 * load of earth (25 lb: 5 earth). It is a building, so no dig takes it away.
 */
function rampart(kind: BuildingKind, name: string, cost: Cost, ws: number, health: number): SpecInput {
  return {
    kind, name, purpose: 'A chunk of packed earth 2 m tall and 1 m across, placed a stretch at a time from point to point. As strong as one wooden wall column, so weaker for its length, and a wall in every other way: your units cannot climb it, climbing monsters go over it as they go over any wall, and breakers smash it. Each takes a worker\'s full load of earth.',
    ...DEFENCES, w: 2, d: 2, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    heightCm: 200, defence: 'wall', wooden: false,
    levels: [lvl(name, cost, ws, health)],
  };
}

type SpecInput = Omit<BuildingSpec, 'heightCm'> & { heightCm?: number };

/** Every building stands 4 m tall unless its row says otherwise (s). */
const withHeights = (specs: SpecInput[]): BuildingSpec[] => specs.map((sp) => ({ heightCm: 400, ...sp }));

/** Indexed by kind: the rows are in BuildingKind order. */
export const BUILDINGS: readonly BuildingSpec[] = withHeights([
  {
    kind: BuildingKind.MainBase, name: 'Big House', purpose: 'The main base: drop-off for every resource, trains workers and tier 1 troops, shelters workers at night; from tier 2 men go up on its parapets (E and click it). The only building with tiers: it upgrades to tier 4, the Citadel, and each tier unlocks what the other buildings make.',
    slot: 1, w: 14, d: 14, dropoff: 'all', trainsWorkers: true, live: true, comesWith: '', heightCm: 600,
    levels: [
      // Supply 10, not Table 4's 8 (s): Jade's extra starting supply for the three starting warriors (Troops and gear: starting units).
      mainBase('Big House', [[L, 100], [ST, 50]], 1200, 1200, 10, 1),
      // Patch 5 (Jade): the tiers are the old levels 3, 6 and 10, each at that level's own upgrade cost, work and health. Only the
      // Citadel asks for more than wood and stone: the Hall's sticks became lumber (15 sticks, 7.5 lumber, rounded up), the Keep's
      // bricks and marble stone and its wrought iron lumber, at equal trade value (peoples/data.ts), and the Citadel adds a
      // mana crystal (her words).
      mainBase('Hall', [[L, 118], [ST, 45]], 420, 2000, 16, 2),
      mainBase('Keep', [[L, 235], [ST, 370]], 800, 3600, 30, 3),
      mainBase('Citadel', [[L, 200], [ST, 300], [Res.Bricks, 150], [Res.Marble, 125], [Res.SteelIngot, 50], [Res.Gold, 5], [Res.ManaCrystal, 1]], 2000, 7500, 50, 4),
    ],
  },
  {
    // The tier 1 crop field's numbers from before Patch 2 (s, Jade's rebalance); a farmer grows 8 farm fare a day, the potato farm's 16 food.
    kind: BuildingKind.Farm, name: 'Farm', purpose: 'Grows farm fare, a hearty medley of vegetables, with 2 assigned farmers, in full in every band. Gives supply, trains workers, shelters its farmers.',
    slot: 2, w: 12, d: 12, dropoff: 'none', trainsWorkers: true, live: true, comesWith: '',
    crop: { res: Res.FarmFare, perDay: 8 },
    levels: [lvl('Farm', [[L, 20], [Res.Sticks, 5]], 150, 400, { supply: 10, shelters: 4, workers: 2, gives: '2 farmers grow farm fare; trains workers; the farmhouse shelters 4' })],
  },
  {
    // The livestock farm's cost from before Patch 2 (s, Jade's rebalance); no supply and no workers (s).
    kind: BuildingKind.Barn, name: 'Barn', purpose: 'A red barn for tamed cattle, chickens, horses and oxen: 10 stalls, one big animal or up to 6 chickens to a stall. Workers tame animals with farm fare once a Barn stands. The animals cannot graze, so each eats farm fare from the stock every morning (a hungry one loses health); they walk round the Barn by day, shelter in it at night, breed, and hens lay eggs. Slaughter (K) takes a grown animal for its meat: a cow gives twenty times a chicken. Cavalry at the Barracks take their horses from the nearest Barn.',
    slot: 3, w: 12, d: 12, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 450,
    levels: [lvl('Barn', [[L, 30], [Res.Sticks, 10]], 200, 400, { gives: '10 stalls, taming, breeding, eggs, slaughter' })],
  },
  {
    // Cheap to build (Jade): 30 softwood and 100 worker-seconds (s, Jade's rebalance).
    kind: BuildingKind.Storehouse, name: 'Storehouse', purpose: 'A cheap drop-off for every resource, for far-off gathering spots and mineshafts.',
    slot: 4, w: 8, d: 8, dropoff: 'all', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Storehouse', [[L, 15]], 100, 600, { gives: 'drop-off for everything' })],
  },
  {
    kind: BuildingKind.FishingDock, name: 'Fishing dock', purpose: 'Workers fish faster and in deeper water, and shelter inside.',
    slot: 5, w: 6, d: 4, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Fishing dock', [[L, 10], [Res.Rope, 5]], 150, 400, { shelters: 3, workers: 3, gives: '3 workers fish at net speed in any depth and shelter inside' })],
  },
  {
    // The Work Hut's cost from before Patch 2 (s, Jade's rebalance).
    kind: BuildingKind.Workshop, name: 'Workshop', purpose: 'Makes everything made by hand, with no workers: planks, leather, hardened leather and rope, bandages and remedies, sticks, carts and trinkets. Better goods come with the main base\'s tiers.',
    slot: 6, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Workshop', [[L, 40], [ST, 20]], 200, 600, { gives: 'planks, leather, rope, medicine, sticks, carts, trinkets' })],
  },
  {
    // The Casting Hearth's cost from before Patch 2 (s, Jade's rebalance).
    kind: BuildingKind.Forge, name: 'Forge', purpose: 'Makes everything made with fire, with no workers: ingots, charcoal, bricks, glass and gunpowder. Each metal comes with a main base tier. Troops and workers upgrade their gear beside it.',
    slot: 7, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Forge', [[L, 60], [ST, 40]], 300, 600, { gives: 'copper, tin and bronze; wrought iron, charcoal, bricks and glass at main base tier 2; pig iron, iron, steel, carbon steel and gunpowder at tier 3' })],
  },
  {
    // The Great Workshop's upgrade cost from before Patch 2, from main base tier 3, where its first engine opens (s, Jade's rebalance).
    kind: BuildingKind.ArtilleryWorkshop, name: 'Artillery workshop', purpose: 'Builds every siege engine, with no workers: catapults and ballistas from main base tier 3, bronze and iron cannons at tier 4 after Cannons. Each rolls out with its full crew of artillery crewmen (catapult 2, ballista 1, cannon 2), and it trains crewmen to replace any who fall. No engine needs ammunition. Cannons need lead ore. While it stands, the Citadel can build each engine\'s fixed version on its engine platform.',
    slot: 8, w: 12, d: 12, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', crafts: true,
    levels: [lvl('Artillery workshop', [[L, 50], [ST, 40], [Res.Bricks, 20], [Res.WroughtIron, 10]], 400, 1200, { needsBase: 3, gives: 'catapults, ballistas, cannons' })],
  },
  {
    kind: BuildingKind.Barracks, name: 'Barracks', purpose: 'Trains troops of every type and tier (fighters and swordsmen, spearmen and halberdiers, rangers, brawlers, and cavalry from main base tier 2 on a horse from the nearest Barn), trains them to Soldier and Veteran, and upgrades their gear.',
    slot: 9, w: 10, d: 10, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Barracks', [[L, 80], [ST, 40], [Res.Sticks, 20]], 400, 1000, { needsBase: 2, gives: 'troops of every type and tier, rank training' })],
  },
  {
    kind: BuildingKind.MagiSanctum, name: 'Magi Sanctum', purpose: 'Trains support and battle mages and their ranks, upgrades their wands and robes, and researches Hexcraft.',
    slot: 10, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Magi Sanctum', [[L, 40], [ST, 60], [Res.Bricks, 20], [Res.ManaCrystal, 1]], 450, 1200, { needsBase: 3, gives: 'novices, mage ranks, wand and robe upgrades' })],
  },
  {
    kind: BuildingKind.ScholarsLodge, name: "Scholar's Lodge", purpose: 'Research, one step at a time: pay the fee and it loads like training. Eats 2 food a day and uses 1 supply. Each further one costs more; at most 10.',
    slot: 11, w: 8, d: 8, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl("Scholar's Lodge", [[L, 40], [ST, 20]], 240, 500, { gives: 'one research at a time; each further research building costs this much again on top' })],
  },
  {
    kind: BuildingKind.Mineshaft, name: 'Mineshaft', purpose: 'Built on flat stone. 4 assigned miners go down, fill a 25 lb bag with stone, ore, coal, gold or gems, and carry it to the nearest main base or Storehouse (assign them with a right click). Deep Mining II and III let every shaft dig deeper. Prospect first (T) to see how rich the spot is.',
    slot: 12, w: 6, d: 6, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Mineshaft', [[L, 60], [ST, 80], [Res.BronzeIngot, 10]], 600, 800, { needsBase: 3, workers: 4, research: DEEP_MINING_1, gives: '4 miners: stone, ores, coal, gold and gems by depth' })],
  },
  // Patch 5 (Jade): wooden walls, gates and towers of either lumber, and hardwood ones that fall between them and stone.
  wall(BuildingKind.Wall, 'Wooden wall', [[L, 1]], 5, 300, 300, true),
  gate(BuildingKind.Gate, 'Wooden gate', [[L, 4]], 30, 600, true),
  tower(BuildingKind.Tower, 'Wooden tower', [[L, 15]], 100, 800, true),
  {
    kind: BuildingKind.TorchPost, name: 'Torch post', purpose: 'A light (10 m) that claims the land 5 m around it while lit. Needs no fuel.',
    slot: 15, group: 'Lights', w: 1, d: 1, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 250,
    light: { lightM: 10, claimM: 5, outlyingHalves: 2 },
    levels: [lvl('Torch post', [[L, 2], [Res.Resin, 1]], 10, 40, { gives: 'light 10 m, claims 5 m' })],
  },
  {
    // Patch 2 (Jade): 15 softwood, light 20 m, claims 10 m. The size, build work, health and the whole count against the dusk limit are suggestions for Jade's rebalance.
    kind: BuildingKind.Bonfire, name: 'Bonfire', purpose: 'A big fire that lights 20 m and claims the land 10 m around it while lit. Needs no fuel.',
    slot: 15, group: 'Lights', w: 3, d: 3, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 150,
    light: { lightM: 20, claimM: 10, outlyingHalves: 2 },
    levels: [lvl('Bonfire', [[L, 15]], 30, 150, { gives: 'light 20 m, claims 10 m' })],
  },
  wall(BuildingKind.WallHardwood, 'Hardwood wall', [[H, 1]], 8, 600, 300, true),
  wall(BuildingKind.WallStone, 'Stone wall', [[ST, 1]], 20, 1500, 360, false),
  gate(BuildingKind.GateHardwood, 'Hardwood gate', [[H, 4]], 45, 1200, true),
  gate(BuildingKind.GateStone, 'Stone gate', [[ST, 10], [L, 2]], 90, 3000, false),
  tower(BuildingKind.TowerHardwood, 'Hardwood tower', [[H, 15]], 150, 1600, true),
  tower(BuildingKind.TowerStone, 'Stone tower', [[ST, 30], [L, 10]], 300, 4000, false),
  // Patch 5 (Jade, GP-43): 5 earth (one worker's 25 lb load) and the wooden wall's 300 health; its build work is a pick (s).
  rampart(BuildingKind.EarthRampart, 'Earth rampart', [[Res.Earth, 5]], 8, 300),
  {
    // Patch 5 (Jade, GP-19): stone and lumber as its looks and the other tier 3 buildings go (s: a stone ground floor under a
    // timber frame), 5 leather, and a gold ingot or 7 silver. Its work, health and size are suggestions for Jade's rebalance.
    kind: BuildingKind.Tavern, name: 'Tavern', purpose: 'A lively tavern. Open for business, it burns 1 food every 3 s and makes silver from it: 18 food burned make a silver ingot, which builds up in its till to 3 decimals. Withdraw funds takes the whole silver ingots into your stock. Hires the Dreadnought.',
    slot: 13, w: 10, d: 10, dropoff: 'none', trainsWorkers: false, live: true, comesWith: '', heightCm: 600,
    levels: [lvl('Tavern', [[L, 80], [ST, 60], [Res.Leather, 5], [Res.Gold, 1]], 400, 1200, { alt: [[L, 80], [ST, 60], [Res.Leather, 5], [Res.Silver, 7]], needsBase: 3, gives: 'silver from food while open for business; hires Dreadnoughts' })],
  },
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

/** The name a building shows: its level's name ("Hall" for a tier 2 main base). `variant` is kept for the gates' callers. */
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
export const QUEUE_LIMIT = 10;

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
/** Cavalry trains at the Barracks from this main base tier (Patch 2, Jade, at level 3; tier 2 from Patch 5), as at the Stables before. */
export const CAVALRY_BASE = 2;
/** The old main base level each tier stands on (Patch 5): its model, picture and footprint are that level's. */
export const MAIN_BASE_TIER_LEVELS: readonly number[] = [1, 3, 6, 10];
/** Men go up on a main base's parapets from this tier (Table 4: level 3 before Patch 5), 8 of them. */
export const PARAPET_TIER = 2;
export const PARAPET_SLOTS = 8;

/**
 * The Forge's metal steps (Patch 2: the Forge has no levels), by the main
 * base tier each needs: 1 (copper, tin and bronze) with the Forge built, 2
 * (wrought iron) at tier 2, 3 (pig iron and iron) and 4 (steel and carbon
 * steel) at tier 3. Before Patch 5 they were main base levels 3, 5 and 7,
 * the levels the Bloomery, Ironworks and Steelworks needed before Patch 2.
 * Kit tiers, research and foraging that needed a forge level need its step
 * now (units/kits.ts TIER_NEEDS).
 */
export const FORGE_STEP_BASE: readonly number[] = [0, 0, 2, 3, 3];

/** The metal step a town is at: 0 with no finished Forge, else the highest step its main base tier reaches. */
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
/** Cancelling an unfinished building refunds 80% (Building placement; Jade's mini balance, 75% before). */
export const CANCEL_REFUND_PER_MILLE = 800;
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
  [BuildingKind.TowerHardwood]: 20, [BuildingKind.TowerStone]: 20, [BuildingKind.EarthRampart]: 10, [BuildingKind.Tavern]: 10,
};
