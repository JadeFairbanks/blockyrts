// Buildings as data (Buildings; Main base; Table 4: Buildings; Table 18:
// Lights; Table 6's farm yields; Table 7's training rows). Every row of Table
// 4 is here; the ones whose systems come in later milestones are marked not
// live and say what they wait for, so the build menus can show them greyed.

import { Res, type Cost } from '../economy/resources.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';

export const BuildingKind = {
  MainBase: 0,
  CropField: 1,
  VegetableFarm: 2,
  HerbBed: 3,
  LivestockFarm: 4,
  PenBarn: 5,
  LumberMill: 6,
  Storehouse: 7,
  FishingDock: 8,
  Tannery: 9,
  Cooking: 10,
  HerbalistHut: 11,
  Wall: 12,
  Gate: 13,
  Tower: 14,
  Earthworks: 15,
  Ramp: 16,
  Workshop: 17,
  TorchPost: 18,
  WallTorch: 19,
  Brazier: 20,
  Lantern: 21,
  ScholarsLodge: 22,
  MagiSanctum: 23,
  Barracks: 24,
  Stables: 25,
  GunneryYard: 26,
  Mineshaft: 27,
  Kiln: 28,
  Forge: 29,
  PowderMill: 30,
  Foundry: 31,
} as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

/** One level (or tier) of a building. Costs of levels above the first are the upgrade's cost. */
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
  /** Workers that can be assigned to it (farmers or crafters). */
  workers: number;
  /** Table 4 "Gives or unlocks", for the tooltip. */
  gives: string;
}

export interface LightSpec {
  /** Light radius and claimed radius in metres (Table 18). */
  lightM: number;
  claimM: number;
  /** Fuel burnt and how long one unit lasts, in steps. */
  fuel: Res;
  fuelSteps: number;
  /** Counts against the dusk limit (Table 8: wall torches count half): 2 = whole, 1 = half, 0 = not at all. */
  outlyingHalves: number;
}

export interface BuildingSpec {
  kind: BuildingKind;
  name: string;
  /** Short purpose for tooltips. */
  purpose: string;
  menu: 'basic' | 'advanced';
  /** Table 4 "Menu slot", 1-based. */
  slot: number;
  /** Footprint in 45 cm columns. */
  w: number;
  d: number;
  /** The solid part units cannot walk through, relative to the footprint; the rest is walkable but cannot be built on. */
  solid: readonly [number, number, number, number];
  levels: readonly LevelSpec[];
  /** Which resources it accepts as a drop-off. */
  dropoff: 'all' | 'wood' | 'none';
  /** Trains workers (Table 7: Big House or any farm). */
  trainsWorkers: boolean;
  /** Lights only. */
  light?: LightSpec;
  /** Farms: what a variant grows and how much a farmer makes a day at tier 1. */
  crops?: ReadonlyArray<{ res: Res; perDay: number; name: string }>;
  /** Crop fields yield half outside the Heartland and nothing in the Barrens or Deadlands (Table 6). */
  cropBands?: boolean;
  /** Placeable now; when false, `comesWith` says why it is greyed. */
  live: boolean;
  comesWith: string;
}

const lvl = (name: string, cost: Cost, ws: number, health: number, o: Partial<LevelSpec> = {}): LevelSpec => ({
  name, cost, ws, health, supply: 0, needsBase: 0, needs: '', shelters: 0, workers: 0, gives: '', ...o,
});

const S = Res.SoftwoodLumber;
const H = Res.HardwoodLumber;
const ST = Res.Stone;
const DAY = CYCLE_STEPS;

/** Farm upgrade costs and times: crop fields and vegetable farms share them (Table 4: "as crop field"). */
const fieldLevels = (first: string, cost1: Cost, supplies: readonly number[], farmers: readonly number[], ws1: number, gives: string): LevelSpec[] => [
  lvl(`${first} 1`, cost1, ws1, 400, { supply: supplies[0]!, shelters: 4, workers: farmers[0]!, gives: `${gives}; trains workers; the farmhouse shelters 4` }),
  lvl(`${first} 2`, [[S, 20], [ST, 15]], 150, 600, { supply: supplies[1]!, needsBase: 4, shelters: 4, workers: farmers[1]!, gives: 'rail fence and shed; yield x1.5' }),
  lvl(`${first} 3`, [[H, 20], [ST, 30]], 300, 800, { supply: supplies[2]!, needsBase: 5, shelters: 4, workers: farmers[2]!, gives: 'stone wall and well; yield x2' }),
];

const MAIN_BASE_GIVES = [
  'drop-off for everything, trains workers and warriors, hardwood and flint gear; shelters 8',
  'Barracks',
  'parapets with 8 slots; Forge 2, Stables, Kiln, Workshop 2',
  'Magi Sanctum, Mineshaft 1, Scriptorium, Kitchen, farm tier 2',
  'Forge 3, Great Workshop, farm tier 3; the first marble level',
  'trains mages; Mineshaft 2, Great Kitchen',
  'Forge 4, Grand Academy, Manufactory, Powder mill',
  'Foundry, Gunnery yard, Mineshaft 3, Grand Kitchen',
  'marble facing and banners',
  '4 cannon ports on the roof',
];

const mainBase = (name: string, cost: Cost, ws: number, health: number, supply: number, n: number, needs = ''): LevelSpec =>
  lvl(name, cost, ws, health, { supply, shelters: 8, needs, gives: MAIN_BASE_GIVES[n - 1]! });

const M3 = 'Comes with defences and digging (milestone 3).';
const M4 = 'Comes with the economy to steel (milestone 4).';
const M6 = 'Comes with mages (milestone 6).';
const M8 = 'Comes with gunpowder (milestone 8).';

const box = (w: number, d: number): readonly [number, number, number, number] => [0, 0, w, d];

export const BUILDINGS: readonly BuildingSpec[] = [
  {
    kind: BuildingKind.MainBase, name: 'Big House', purpose: 'The main base: drop-off for every resource, trains workers, shelters workers at night. Upgrades to level 10.',
    menu: 'basic', slot: 1, w: 14, d: 14, solid: [2, 2, 10, 10], dropoff: 'all', trainsWorkers: true, live: true, comesWith: '',
    levels: [
      mainBase('Big House', [[S, 300], [ST, 150]], 1200, 1200, 8, 1),
      mainBase('Longhall', [[S, 100], [ST, 40]], 400, 1600, 12, 2),
      mainBase('Hall', [[S, 110], [ST, 45], [Res.Sticks, 15]], 420, 2000, 16, 3),
      mainBase('Stockade Hall', [[S, 120], [ST, 60], [H, 25], [Res.BronzeIngot, 5]], 450, 2500, 20, 4, 'Needs the Bronze research.'),
      mainBase('Marble Hall', [[H, 75], [ST, 100], [Res.Bricks, 20], [Res.Marble, 20], [Res.BronzeIngot, 10]], 600, 3000, 25, 5),
      mainBase('Keep', [[H, 100], [ST, 150], [Res.Bricks, 40], [Res.Marble, 30], [Res.WroughtIron, 15]], 800, 3600, 30, 6),
      mainBase('Fortified Keep', [[H, 125], [ST, 200], [Res.Bricks, 60], [Res.Marble, 40], [Res.WroughtIron, 25]], 1000, 4200, 35, 7),
      mainBase('Castle', [[H, 150], [ST, 250], [Res.Bricks, 100], [Res.Marble, 50], [Res.RefinedIron, 30]], 1200, 5000, 40, 8),
      mainBase('Great Castle', [[H, 150], [ST, 250], [Res.Bricks, 100], [Res.Marble, 75], [Res.SteelIngot, 30]], 1500, 6000, 45, 9),
      mainBase('Citadel', [[H, 200], [ST, 300], [Res.Bricks, 150], [Res.Marble, 125], [Res.SteelIngot, 50], [Res.Gold, 5]], 2000, 7500, 50, 10),
    ],
  },
  {
    kind: BuildingKind.CropField, name: 'Crop field', purpose: 'Grows wheat, corn or flax (chosen when built) with assigned farmers. Gives supply, trains workers, shelters its farmers.',
    menu: 'basic', slot: 2, w: 12, d: 12, solid: [0, 0, 4, 4], dropoff: 'none', trainsWorkers: true, live: true, comesWith: '', cropBands: true,
    crops: [{ res: Res.Wheat, perDay: 6, name: 'Wheat field' }, { res: Res.Corn, perDay: 6, name: 'Corn field' }, { res: Res.Flax, perDay: 6, name: 'Flax field' }],
    levels: fieldLevels('Crop field', [[S, 30], [Res.Sticks, 10]], [4, 6, 8], [2, 3, 4], 150, '2 farmers'),
  },
  {
    kind: BuildingKind.VegetableFarm, name: 'Vegetable farm', purpose: 'Grows potatoes or carrots (chosen when built), in full on thin grass too. Gives supply, trains workers.',
    menu: 'basic', slot: 2, w: 12, d: 12, solid: [0, 0, 4, 4], dropoff: 'none', trainsWorkers: true, live: true, comesWith: '',
    crops: [{ res: Res.Potatoes, perDay: 8, name: 'Potato farm' }, { res: Res.Carrots, perDay: 8, name: 'Carrot farm' }],
    levels: fieldLevels('Vegetable farm', [[S, 30], [Res.Sticks, 10]], [3, 5, 7], [2, 3, 4], 150, '2 farmers; full yield on thin grass'),
  },
  {
    kind: BuildingKind.HerbBed, name: 'Herb bed', purpose: 'Grows medicinal herbs with one farmer.',
    menu: 'basic', slot: 2, w: 8, d: 8, solid: [0, 0, 3, 3], dropoff: 'none', trainsWorkers: true, live: true, comesWith: '',
    crops: [{ res: Res.Herbs, perDay: 4, name: 'Herb bed' }],
    levels: [
      lvl('Herb bed 1', [[S, 20], [Res.Herbs, 10]], 100, 300, { supply: 1, shelters: 4, workers: 1, gives: '1 farmer; herbs 4 a day' }),
      lvl('Herb bed 2', [[S, 15], [ST, 10]], 100, 500, { supply: 2, needsBase: 4, shelters: 4, workers: 1, gives: 'herbs 6 a day' }),
      lvl('Herb bed 3', [[H, 15], [ST, 20]], 200, 700, { supply: 3, needsBase: 5, shelters: 4, workers: 1, gives: 'herbs 8 a day' }),
    ],
  },
  {
    kind: BuildingKind.LivestockFarm, name: 'Livestock farm', purpose: 'A pen with a coop and trough for tamed animals (animals come with milestone 4). Gives supply, trains workers.',
    menu: 'basic', slot: 2, w: 12, d: 12, solid: [0, 0, 4, 4], dropoff: 'none', trainsWorkers: true, live: true, comesWith: '',
    levels: [
      lvl('Livestock farm 1', [[S, 40], [Res.Sticks, 10]], 200, 400, { supply: 4, shelters: 4, workers: 1, gives: '6 animals, 1 worker, breeding, slaughter' }),
      lvl('Livestock farm 2', [[S, 20], [ST, 15]], 150, 600, { supply: 6, needsBase: 4, shelters: 4, workers: 1, gives: '10 animals' }),
      lvl('Livestock farm 3', [[H, 20], [ST, 30]], 300, 800, { supply: 8, needsBase: 5, shelters: 4, workers: 1, gives: '16 animals' }),
    ],
  },
  {
    kind: BuildingKind.PenBarn, name: 'Pen and barn', purpose: 'Keeps livestock safe at night (animals come with milestone 4).',
    menu: 'basic', slot: 3, w: 8, d: 8, solid: [0, 0, 4, 8], dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Pen and barn', [[S, 30]], 120, 500, { gives: 'shelters 8 animals at night, no breeding' })],
  },
  {
    kind: BuildingKind.LumberMill, name: 'Lumber mill', purpose: 'A drop-off for wood; turns lumber into planks with assigned workers.',
    menu: 'basic', slot: 4, w: 8, d: 8, solid: box(8, 8), dropoff: 'wood', trainsWorkers: false, live: true, comesWith: '',
    levels: [
      lvl('Lumber mill', [[S, 40], [ST, 10]], 200, 600, { workers: 2, gives: 'wood drop-off, planks, 2 workers' }),
      lvl('Lumber mill with waterwheel', [[H, 40], [ST, 20]], 300, 600, { workers: 2, needs: '', gives: 'built on a stream; 2 planks from each lumber' }),
    ],
  },
  {
    kind: BuildingKind.Storehouse, name: 'Storehouse', purpose: 'A drop-off for every resource, for far-off gathering spots.',
    menu: 'basic', slot: 5, w: 8, d: 8, solid: box(8, 8), dropoff: 'all', trainsWorkers: false, live: true, comesWith: '',
    levels: [lvl('Storehouse', [[S, 40], [ST, 20]], 150, 600, { gives: 'drop-off for everything' })],
  },
  {
    kind: BuildingKind.FishingDock, name: 'Fishing dock', purpose: 'Workers fish faster and in deeper water, and shelter inside.',
    menu: 'basic', slot: 6, w: 6, d: 4, solid: box(6, 4), dropoff: 'none', trainsWorkers: false, live: false, comesWith: 'Comes with fishing (milestone 4).',
    levels: [lvl('Fishing dock', [[S, 30], [Res.Rope, 5]], 150, 400, { shelters: 3, workers: 3, gives: '3 workers fish at net speed in any depth and shelter inside' })],
  },
  {
    kind: BuildingKind.Tannery, name: 'Tannery', purpose: 'Turns hides into leather.',
    menu: 'basic', slot: 7, w: 8, d: 8, solid: box(8, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [lvl('Tannery', [[S, 40], [ST, 20]], 200, 500, { workers: 2, gives: 'leather, boots, leather armour and cap, carrying gear' })],
  },
  {
    kind: BuildingKind.Cooking, name: 'Campfire', purpose: 'Cooking tier 1, and a light (8 m). Cooking comes with food and supply (milestone 4).',
    menu: 'basic', slot: 8, w: 2, d: 2, solid: box(2, 2), dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    light: { lightM: 8, claimM: 0, fuel: S, fuelSteps: DAY, outlyingHalves: 0 },
    levels: [
      lvl('Campfire', [[S, 5]], 10, 60, { gives: 'roast meat and fish; also a light' }),
      lvl('Cook Hut', [[S, 40], [ST, 20]], 200, 500, { needs: 'Cooking comes with milestone 4.', gives: 'smoked foods' }),
      lvl('Kitchen', [[H, 30], [ST, 30], [Res.Bricks, 10]], 200, 800, { needsBase: 4, needs: 'Cooking comes with milestone 4.', gives: 'bread, salted foods' }),
      lvl('Great Kitchen', [[H, 50], [ST, 50], [Res.Bricks, 30], [Res.WroughtIron, 5]], 400, 1200, { needsBase: 6, needs: 'Cooking comes with milestone 4.', gives: 'stew' }),
      lvl('Grand Kitchen', [[H, 75], [ST, 100], [Res.Bricks, 50], [Res.SteelIngot, 10]], 750, 1800, { needsBase: 8, needs: 'Cooking comes with milestone 4.', gives: 'pie; cooks twice as fast' }),
    ],
  },
  {
    kind: BuildingKind.HerbalistHut, name: 'Herbalist hut', purpose: 'Turns herbs into bandages and remedies.',
    menu: 'basic', slot: 9, w: 6, d: 6, solid: box(6, 6), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [lvl('Herbalist hut', [[S, 30], [Res.Herbs, 10]], 150, 400, { workers: 2, gives: 'bandages, remedies, poison arrows' })],
  },
  {
    kind: BuildingKind.Wall, name: 'Wall', purpose: 'A wall column, 3 m tall, in softwood, hardwood or stone.',
    menu: 'basic', slot: 10, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M3,
    levels: [lvl('Softwood wall', [[S, 1]], 5, 300)],
  },
  {
    kind: BuildingKind.Gate, name: 'Gate', purpose: 'A gate 3 columns wide.',
    menu: 'basic', slot: 10, w: 3, d: 1, solid: box(3, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M3,
    levels: [lvl('Softwood gate', [[S, 6]], 30, 600)],
  },
  {
    kind: BuildingKind.Tower, name: 'Tower', purpose: '4 ranged slots and +10 m sight.',
    menu: 'basic', slot: 10, w: 3, d: 3, solid: box(3, 3), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M3,
    levels: [lvl('Softwood tower', [[S, 20]], 100, 800)],
  },
  {
    kind: BuildingKind.Earthworks, name: 'Earthworks', purpose: 'Earth ramps, banks and fill.',
    menu: 'basic', slot: 11, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M3,
    levels: [lvl('Earthworks', [[Res.Earth, 1]], 5, 1)],
  },
  {
    kind: BuildingKind.Ramp, name: 'Lumber or stone ramp', purpose: 'Ramps made at a workshop and placed by workers.',
    menu: 'basic', slot: 11, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M3,
    levels: [lvl('Lumber ramp', [[S, 1]], 5, 300, { needs: 'Needs a Work Hut.' })],
  },
  {
    kind: BuildingKind.Workshop, name: 'Work Hut', purpose: 'Gravel, sticks, ramps and trinkets.',
    menu: 'basic', slot: 12, w: 8, d: 8, solid: box(8, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [
      lvl('Work Hut', [[S, 40], [ST, 20]], 200, 600, { workers: 2, gives: 'gravel, sticks, ramps, Tokens' }),
      lvl('Workshop', [[H, 30], [ST, 20], [Res.BronzeIngot, 5]], 200, 900, { needsBase: 3, workers: 2, gives: 'Charms, hand carts, bow staves' }),
      lvl('Great Workshop', [[H, 50], [ST, 40], [Res.Bricks, 20], [Res.WroughtIron, 10]], 400, 1200, { needsBase: 5, workers: 2, gives: 'Brooches, Moonleafs, carts, catapults, lanterns' }),
      lvl('Manufactory', [[H, 75], [ST, 75], [Res.Bricks, 50], [Res.SteelIngot, 15]], 750, 1800, { needsBase: 7, workers: 2, gives: 'Heirlooms, Sunhearts, ballistas; double speed' }),
    ],
  },
  {
    kind: BuildingKind.TorchPost, name: 'Torch post', purpose: 'A light that claims the land 5 m around it while lit. Burns 1 softwood lumber every 3 days.',
    menu: 'basic', slot: 13, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    light: { lightM: 10, claimM: 5, fuel: S, fuelSteps: 3 * DAY, outlyingHalves: 2 },
    levels: [lvl('Torch post', [[S, 2], [Res.Resin, 1]], 10, 40, { gives: 'light 10 m, claims 5 m' })],
  },
  {
    kind: BuildingKind.WallTorch, name: 'Wall torch', purpose: 'A light in an iron bracket on a wall; claims 5 m.',
    menu: 'basic', slot: 13, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: 'Needs a wall to hang on (walls come with milestone 3).',
    light: { lightM: 6, claimM: 5, fuel: S, fuelSteps: 3 * DAY, outlyingHalves: 1 },
    levels: [lvl('Wall torch', [[S, 1], [Res.Resin, 1]], 5, 30, { gives: 'light 6 m, claims 5 m' })],
  },
  {
    kind: BuildingKind.Brazier, name: 'Brazier', purpose: 'A bright light (14 m) that burns 1 coal a day. Claims no land.',
    menu: 'basic', slot: 13, w: 2, d: 2, solid: box(2, 2), dropoff: 'none', trainsWorkers: false, live: true, comesWith: '',
    light: { lightM: 14, claimM: 0, fuel: Res.Coal, fuelSteps: DAY, outlyingHalves: 2 },
    levels: [lvl('Brazier', [[ST, 10], [Res.BronzeIngot, 2]], 60, 150, { gives: 'light 14 m' })],
  },
  {
    kind: BuildingKind.Lantern, name: 'Lantern', purpose: 'A glass-and-iron lantern, made at a Great Workshop and hung by a worker.',
    menu: 'basic', slot: 13, w: 1, d: 1, solid: box(1, 1), dropoff: 'none', trainsWorkers: false, live: false, comesWith: 'Made at a Great Workshop (milestone 4).',
    light: { lightM: 6, claimM: 0, fuel: Res.Resin, fuelSteps: 5 * DAY, outlyingHalves: 1 },
    levels: [lvl('Lantern', [[Res.Glass, 1], [Res.WroughtIron, 1]], 5, 20, { gives: 'light 6 m' })],
  },
  {
    kind: BuildingKind.ScholarsLodge, name: "Scholar's Lodge", purpose: 'Research.',
    menu: 'advanced', slot: 1, w: 8, d: 8, solid: box(8, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [
      lvl("Scholar's Lodge", [[S, 60], [ST, 20]], 240, 500, { gives: 'one research at a time' }),
      lvl('Scriptorium', [[H, 50], [ST, 50], [Res.Bricks, 20]], 450, 900, { needsBase: 4, gives: 'research 25% faster' }),
      lvl('Grand Academy', [[H, 75], [ST, 100], [Res.Bricks, 50], [Res.Marble, 30], [Res.SteelIngot, 10]], 900, 1500, { needsBase: 7, gives: 'research 50% faster' }),
    ],
  },
  {
    kind: BuildingKind.MagiSanctum, name: 'Magi Sanctum', purpose: 'Trains mages.',
    menu: 'advanced', slot: 2, w: 8, d: 8, solid: box(8, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M6,
    levels: [lvl('Magi Sanctum', [[H, 40], [ST, 60], [Res.Bricks, 20], [Res.ManaCrystal, 1]], 450, 1200, { needsBase: 4, gives: 'novices, ranks to Adept, rank wands' })],
  },
  {
    kind: BuildingKind.Barracks, name: 'Barracks', purpose: 'Trains warriors.',
    menu: 'advanced', slot: 3, w: 10, d: 10, solid: box(10, 10), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [lvl('Barracks', [[S, 80], [ST, 40], [Res.Sticks, 20]], 400, 1000, { needsBase: 2, gives: 'warriors, archery, crossbow, rank training' })],
  },
  {
    kind: BuildingKind.Stables, name: 'Stables', purpose: 'Tames and breeds horses and oxen; riding.',
    menu: 'advanced', slot: 4, w: 10, d: 8, solid: box(10, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M8,
    levels: [lvl('Stables', [[S, 30], [ST, 10], [Res.Sticks, 5]], 150, 800, { needsBase: 3, gives: 'taming, 6 stalls, breeding, riding' })],
  },
  {
    kind: BuildingKind.GunneryYard, name: 'Gunnery yard', purpose: 'Musket and cannon crew training.',
    menu: 'advanced', slot: 5, w: 12, d: 12, solid: box(12, 12), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M8,
    levels: [lvl('Gunnery yard', [[H, 50], [ST, 75], [Res.Bricks, 30], [Res.SteelIngot, 10]], 600, 1500, { needsBase: 8, gives: 'musket and cannon crew training' })],
  },
  {
    kind: BuildingKind.Mineshaft, name: 'Mineshaft', purpose: 'Mines ore, coal, stone, gold and gems from underground.',
    menu: 'advanced', slot: 6, w: 6, d: 6, solid: box(6, 6), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [
      lvl('Mineshaft 1', [[H, 60], [ST, 80], [Res.BronzeIngot, 10]], 600, 800, { needsBase: 4, workers: 4, gives: '4 miners' }),
      lvl('Mineshaft 2', [[H, 40], [ST, 50], [Res.WroughtIron, 15]], 450, 1200, { needsBase: 6, workers: 4 }),
      lvl('Mineshaft 3', [[H, 50], [ST, 75], [Res.SteelIngot, 20]], 600, 1600, { needsBase: 8, workers: 4 }),
    ],
  },
  {
    kind: BuildingKind.Kiln, name: 'Kiln', purpose: 'Charcoal, bricks and glass.',
    menu: 'advanced', slot: 7, w: 6, d: 6, solid: box(6, 6), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [lvl('Kiln', [[S, 30], [ST, 40], [Res.Clay, 20]], 300, 600, { needsBase: 3, workers: 2, gives: 'charcoal, bricks, glass' })],
  },
  {
    kind: BuildingKind.Forge, name: 'Casting Hearth', purpose: 'Smelts ore and makes tools, weapons and armour.',
    menu: 'advanced', slot: 8, w: 8, d: 8, solid: box(8, 8), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M4,
    levels: [
      lvl('Casting Hearth', [[S, 60], [ST, 40]], 300, 600, { workers: 2, gives: 'copper, tin, bronze' }),
      lvl('Bloomery', [[S, 30], [ST, 40], [Res.Clay, 10], [Res.BronzeIngot, 5]], 300, 900, { needsBase: 3, workers: 3, gives: 'bloom iron' }),
      lvl('Ironworks', [[H, 50], [ST, 60], [Res.Bricks, 20], [Res.BronzeIngot, 10]], 450, 1200, { needsBase: 5, workers: 3, gives: 'wrought and pig iron, crossbows, mail' }),
      lvl('Steelworks', [[H, 75], [ST, 100], [Res.Bricks, 60], [Res.WroughtIron, 20]], 900, 1800, { needsBase: 7, workers: 4, gives: 'refined iron, steel, HQ steel' }),
    ],
  },
  {
    kind: BuildingKind.PowderMill, name: 'Powder mill', purpose: 'Gunpowder.',
    menu: 'advanced', slot: 9, w: 6, d: 6, solid: box(6, 6), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M8,
    levels: [lvl('Powder mill', [[H, 20], [ST, 40], [Res.Bricks, 20], [Res.WroughtIron, 5]], 300, 600, { needsBase: 7, gives: 'gunpowder' })],
  },
  {
    kind: BuildingKind.Foundry, name: 'Foundry', purpose: 'Cannons and cannonballs.',
    menu: 'advanced', slot: 10, w: 10, d: 10, solid: box(10, 10), dropoff: 'none', trainsWorkers: false, live: false, comesWith: M8,
    levels: [lvl('Foundry', [[H, 50], [ST, 75], [Res.Bricks, 50], [Res.BronzeIngot, 10], [Res.WroughtIron, 10]], 600, 1500, { needsBase: 8, gives: 'cannons, cannonballs' })],
  },
];

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

/** The name a building shows: its level's name, or its crop for farms ("Wheat field 2"). */
export function buildingName(kind: number, level: number, variant: number): string {
  const s = buildingSpec(kind);
  const crop = s.crops?.[variant];
  if (crop && s.kind !== BuildingKind.HerbBed) return s.levels.length > 1 ? `${crop.name} ${level}` : crop.name;
  return levelSpec(kind, level).name;
}

/** Steps of work for a level: its worker-seconds at 20 steps a second. */
export function workSteps(kind: number, level: number): number {
  return levelSpec(kind, level).ws * STEPS_PER_SECOND;
}

/** Farm yield multiplier by tier, in per mille (Table 6: x1.5 at tier 2, x2 at tier 3). */
export const FARM_TIER_PER_MILLE = [1000, 1500, 2000] as const;
/** A new field gives nothing for its first 2 days (Table 6). */
export const FARM_FALLOW_STEPS = 2 * CYCLE_STEPS;

/** Table 7: a new worker costs 20 food (nutrition) and 15 s (halved pacing) at the Big House or any farm. */
export const WORKER_FOOD = 20;
export const WORKER_TRAIN_STEPS = 15 * STEPS_PER_SECOND;
/** Units a building can have queued (Table 7 (s): a Barracks or Sanctum can queue 5; the same for every building here). */
export const QUEUE_LIMIT = 5;

/** Production at a lumber mill (Table 2b): 1 lumber gives 1 plank (2 with the waterwheel) in 5 s. */
export const PLANK_STEPS = 5 * STEPS_PER_SECOND;

/** Lights within this distance of a complete main base are refuelled from the pool by themselves (Table 18). */
export const AUTO_REFUEL_M = 40;
/** Lights farther than this from any main base count as outlying at dusk (Table 8). */
export const OUTLYING_M = 40;
/** A worker refuels or relights a light in 2 s (Table 18). */
export const REFUEL_STEPS = 2 * STEPS_PER_SECOND;
/** Claimed land around a player building, measured from its outer edge (Table 8, Jade). */
export const BUILDING_CLAIM_M = 10;
/** A building under construction has 10% of its health plus the share built (Table 4). */
export const UNFINISHED_HEALTH_PER_MILLE = 100;
/** Cancelling an unfinished building refunds 75% (Building placement). */
export const CANCEL_REFUND_PER_MILLE = 750;
/** Workers inside a shelter that is destroyed take 10% of their maximum health (Workers: sheltering). */
export const SHELTER_LOSS_PER_MILLE = 100;
/** Sight of buildings (s): 10 m, so the land round a building stays seen. */
export const BUILDING_SIGHT_M = 10;
