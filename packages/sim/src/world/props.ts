// Resource nodes and other generated props (Table 5: Resource nodes per band;
// Generated rocks and trees). The numbers began as typed copies of the old
// blueprint's Table 5; since Patch 5 retired it, these rows are the source.
// Jade's Patch 5 props and changes have no row (''): their numbers are hers,
// or picks where she gave none.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { HAWTHORNE_FRUIT, HAWTHORNE_GROW_NIGHTS, HAWTHORNE_REGROW_DAYS, RUBBLE_BLUESTONE } from '../circles/data.ts';
const MINUTE = 60 * STEPS_PER_SECOND;

/**
 * Tool tiers in the order of Table 10's rows, which Table 5's "Tool needed"
 * column names. A worker's tool kit (units/kits.ts, Table 2c) gives each job
 * one of these: tier 2's kit is flint for chopping and cutting and stone for
 * breaking and building, and kit tiers 3 to 8 are Copper to CarbonSteel.
 */
export const Tool = { None: 0, Hardwood: 1, Stone: 2, Flint: 3, Copper: 4, Bronze: 5, WroughtIron: 6, Iron: 7, Steel: 8, CarbonSteel: 9 } as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

/**
 * What a worker's tool is for (Table 2c): the axe chops, the digging stick,
 * maul or pickaxe quarries, digs and mines, the mallet or hammer builds and
 * repairs, the knife or sickle cuts plants and butchers. A worker's one tool
 * kit has a tool for every job.
 */
export const ToolJob = { Chop: 0, Break: 1, Build: 2, Cut: 3 } as const;
export type ToolJob = (typeof ToolJob)[keyof typeof ToolJob];
export const TOOL_JOBS = 4;
/** A tool covering every job (the hardwood set and the forge's sets). */
export const ALL_JOBS = (1 << TOOL_JOBS) - 1;

export const PropKind = {
  Pine: 0,
  Spruce: 1,
  SmallSoftwood: 2,
  Hazel: 3,
  Birch: 4,
  Hornbeam: 5,
  Oak: 6,
  Beech: 7,
  DeadTree: 8,
  Thornwood: 9,
  Herbs: 10,
  WildFlax: 11,
  LooseStone: 12,
  FlintScatter: 13,
  StoneOutcrop: 14,
  CopperOutcrop: 15,
  TinOutcrop: 16,
  /** A coal rock (Jade's Patch 5, WL-7; a coal seam before): mostly stone, some coal. */
  CoalRock: 17,
  BogIron: 18,
  IronRock: 19,
  ClayBank: 20,
  Sand: 21,
  MarbleRock: 22,
  Saltpetre: 23,
  LeadOre: 24,
  Sulphur: 25,
  HotSpringSulphur: 26,
  SurfaceGold: 27,
  SurfaceGem: 28,
  ManaCrystal: 29,
  /** Milestone 4: what is left of a hunted animal (Table 5 carcass row); its variant is the species. */
  Carcass: 30,
  /** Fish stretches (Fish; Table 5): a few metres of bank where trout, salmon or giant catfish can be caught. */
  FishTrout: 31,
  FishSalmon: 32,
  FishCatfish: 33,
  /** Jade's Patch 5: edible mushrooms (GP-30) and three berry bushes (GP-32), the woodsman's forage. */
  Mushroom: 34,
  BlackBerryBush: 35,
  RaspberryBush: 36,
  BlueberryBush: 37,
  /** Tall flax, twice the height and twice the flax (WL-10). */
  FlaxTall: 38,
  /** A 3 m boulder (WL-5). */
  Boulder: 39,
  /** Small silver and gold nodes on the mountains (WL-4). */
  SilverNode: 40,
  GoldNode: 41,
  /**
   * Patch 5's stone circles (circles/place.ts places them; their variant
   * holds each piece's heading, look, circle type and circle): the stones,
   * the chests and the altar, the Sweet Hawthorne and its sapling, the Moon
   * Rose bushes, the bones, and the plants and trees that dress the ruins.
   */
  Trilithon: 42,
  BluestoneRubble: 43,
  BluestoneChest: 44,
  CircleAltar: 45,
  SweetHawthorne: 46,
  HawthorneSapling: 47,
  MoonRoseBush: 48,
  BonePile: 49,
  RuinBush: 50,
  RuinFern: 51,
  RuinMoss: 52,
  RuinFlower: 53,
  BoneyardDeadTree: 54,
  BoneyardThorn: 55,
  CirclePine: 56,
  /**
   * Jade's GP-29: a low, dark purple bog pear bush, only at the bogs a Bog
   * guardian keeps (the Mobs thread places two at each), holding one
   * pumpkin-sized pear at a time.
   */
  BogPearBush: 57,
} as const;
export type PropKind = (typeof PropKind)[keyof typeof PropKind];

/** How a prop is drawn and selected. */
export const PropShape = { Tree: 0, Bush: 1, Plant: 2, Rocks: 3, Patch: 4, Crystal: 5, Carcass: 6, Fish: 7 } as const;
export type PropShape = (typeof PropShape)[keyof typeof PropShape];

export interface PropInfo {
  kind: PropKind;
  name: string;
  shape: PropShape;
  /** The resource it gives, as the doc names it, or '' for none. */
  resource: string;
  /** Table 5 "Yield per node" (the low end where the table gives a range). */
  yield: number;
  /** Table 5 "Per load". */
  perLoad: number;
  /** Table 5 "Time per load" in steps, with wooden tools. */
  loadSteps: number;
  /** Table 5 "Gatherers". */
  gatherers: number;
  /** Table 5 "Tool needed". */
  tool: Tool;
  /** Table 5 "Regrowth" in steps (trees: seed to full size; bushes and plants: from the stump), 0 for none. */
  regrowSteps: number;
  /** Seeds dropped when felled (trees). */
  seeds: number;
  /** The most it holds, where its yield (the least) varies from node to node (world generation); its yield where it does not. */
  yieldMax: number;
  /** A wild edible the Forage button gathers (Jade's Patch 5: WD-1, GP-30 to GP-32). */
  forage: boolean;
  /** What stands where it was, once it is used up: a coal rock's stone (WL-7), a silver or gold node's (WL-4); null for nothing. */
  leaves: { kind: PropKind; min: number; max: number } | null;
  /** The Table 5 row this comes from (its first cell), for the test that checks it. */
  row: string;
  /** Extra text the test expects in that row, if the record differs from the row's first numbers. */
  check: readonly string[];
}

const tree = (kind: PropKind, name: string, y: number, load: number, gatherers: number, tool: Tool, regrow: number, row: string, resource: string): PropInfo => ({
  kind, name, shape: PropShape.Tree, resource, yield: y, perLoad: 5, loadSteps: load * STEPS_PER_SECOND, gatherers, tool, regrowSteps: regrow, seeds: 2, row, check: [],
  yieldMax: y, forage: false, leaves: null,
});
const node = (kind: PropKind, name: string, shape: PropShape, resource: string, y: number, perLoad: number, load: number, gatherers: number, tool: Tool, row: string, check: readonly string[] = [], regrow = 0): PropInfo => ({
  kind, name, shape, resource, yield: y, perLoad, loadSteps: load * STEPS_PER_SECOND, gatherers, tool, regrowSteps: regrow, seeds: 0, row, check,
  yieldMax: y, forage: false, leaves: null,
});
/** Jade's Patch 5 props: no Table 5 row (row ''), so the records test leaves them out; their numbers are hers or picks (s). */
const P5 = '';
/** A berry bush (GP-31, GP-32): 1 or 2 bunches of berries, picked whole without harm to the bush, back in about 2 minutes (s: 2). */
const berries = (kind: PropKind, name: string, resource: string): PropInfo => ({
  ...node(kind, name, PropShape.Bush, resource, 1, 2, 4, 1, Tool.None, P5, [], 2 * MINUTE), yieldMax: 2, forage: true,
});

const SOFTWOOD_ROW = 'Softwood tree (pine, spruce, small softwood)';
const FISH_ROW = 'Fish stretch: trout / salmon / giant catfish';
const FISH_CHECK = ['1 per 4 m2', 'rod 15 s a fish', 'rod or net', 'a pair every 3 / 6 / 9 days'] as const;
const SMALL_HW_ROW = 'Small hardwood (birch, hornbeam)';
const LARGE_HW_ROW = 'Large hardwood (oak, beech)';

export const PROPS: readonly PropInfo[] = [
  tree(PropKind.Pine, 'Pine', 20, 15, 1, Tool.Hardwood, 60 * MINUTE, SOFTWOOD_ROW, 'softwood lumber'),
  tree(PropKind.Spruce, 'Spruce', 20, 15, 1, Tool.Hardwood, 60 * MINUTE, SOFTWOOD_ROW, 'softwood lumber'),
  tree(PropKind.SmallSoftwood, 'Small softwood', 20, 15, 1, Tool.Hardwood, 60 * MINUTE, SOFTWOOD_ROW, 'softwood lumber'),
  node(PropKind.Hazel, 'Hazel bush', PropShape.Bush, 'sticks', 10, 10, 10, 1, Tool.Hardwood, 'Hazel bush', ['2 days'], 2 * CYCLE_STEPS),
  tree(PropKind.Birch, 'Birch', 15, 20, 1, Tool.Flint, 180 * MINUTE, SMALL_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Hornbeam, 'Hornbeam', 15, 20, 1, Tool.Flint, 180 * MINUTE, SMALL_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Oak, 'Great oak', 40, 20, 2, Tool.Copper, 360 * MINUTE, LARGE_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Beech, 'Great beech', 40, 20, 2, Tool.Copper, 360 * MINUTE, LARGE_HW_ROW, 'hardwood lumber'),
  // Jade's Patch 5 (WL-11): "Dead wood does yield lumber, and thorn bushes yield sticks, but they do not reproduce":
  // no seeds and no regrowth (s: 10 softwood lumber a dead tree, 10 sticks a thorn bush).
  { ...tree(PropKind.DeadTree, 'Dead tree', 10, 15, 1, Tool.Hardwood, 0, P5, 'softwood lumber'), seeds: 0 },
  { ...tree(PropKind.Thornwood, 'Thorn bush', 10, 10, 1, Tool.Hardwood, 0, P5, 'sticks'), perLoad: 10, seeds: 0 },
  node(PropKind.Herbs, 'Herbs', PropShape.Plant, 'medicinal herbs', 10, 10, 10, 1, Tool.Hardwood, 'Herbs / wild flax', ['10 / 10', '5 days'], 5 * CYCLE_STEPS),
  // Grows back quickly since Patch 5 (WL-10: "Regrows quickly"; s: 3 minutes, Table 5 had 5 days), only in its fields.
  node(PropKind.WildFlax, 'Wild flax', PropShape.Plant, 'flax', 10, 10, 10, 1, Tool.Hardwood, P5, [], 3 * MINUTE),
  node(PropKind.LooseStone, 'Loose stone', PropShape.Rocks, 'stone', 40, 5, 10, 2, Tool.Hardwood, 'Loose stone / flint scatter', ['40 stone', '5 / 10']),
  node(PropKind.FlintScatter, 'Flint scatter', PropShape.Rocks, 'flint', 20, 10, 10, 2, Tool.Hardwood, 'Loose stone / flint scatter', ['20 flint', '5 / 10']),
  node(PropKind.StoneOutcrop, 'Stone outcrop', PropShape.Rocks, 'stone', 200, 5, 15, 2, Tool.Hardwood, 'Stone outcrop'),
  node(PropKind.CopperOutcrop, 'Copper outcrop', PropShape.Rocks, 'copper ore', 60, 5, 20, 2, Tool.Stone, 'Copper outcrop / tin outcrop', ['60 / 30']),
  node(PropKind.TinOutcrop, 'Tin outcrop', PropShape.Rocks, 'tin ore', 30, 5, 20, 2, Tool.Stone, 'Copper outcrop / tin outcrop', ['60 / 30']),
  // Jade's Patch 5 (WL-7): "mostly rock by weight with some coal", copper picks, at least three times the fuel of wood
  // for the time (s: 20 to 30 coal, 10 a load in 10 s, then a stone outcrop of 40 to 60 where it stood).
  { ...node(PropKind.CoalRock, 'Coal rock', PropShape.Rocks, 'coal', 20, 10, 10, 2, Tool.Copper, P5), yieldMax: 30, leaves: { kind: PropKind.StoneOutcrop, min: 40, max: 60 } },
  node(PropKind.BogIron, 'Bog iron', PropShape.Patch, 'bog iron', 40, 5, 20, 2, Tool.Bronze, 'Bog iron patch'),
  node(PropKind.IronRock, 'Iron rock', PropShape.Rocks, 'iron rock', 80, 5, 25, 2, Tool.Bronze, 'Iron rock'),
  node(PropKind.ClayBank, 'Clay bank', PropShape.Patch, 'clay', 100, 5, 15, 2, Tool.Hardwood, 'Clay bank'),
  node(PropKind.Sand, 'Sand', PropShape.Patch, 'sand', 100, 5, 10, 2, Tool.Hardwood, 'Sand'),
  node(PropKind.MarbleRock, 'Marble rock', PropShape.Rocks, 'marble', 80, 2, 30, 2, Tool.Bronze, 'Marble rock'),
  node(PropKind.Saltpetre, 'Saltpetre', PropShape.Patch, 'saltpetre', 30, 5, 20, 2, Tool.Copper, 'Saltpetre'),
  node(PropKind.LeadOre, 'Lead ore', PropShape.Rocks, 'lead ore', 40, 5, 20, 2, Tool.Bronze, 'Lead ore'),
  node(PropKind.Sulphur, 'Sulphur', PropShape.Patch, 'sulphur', 60, 5, 20, 2, Tool.Bronze, 'Sulphur'),
  node(PropKind.HotSpringSulphur, 'Hot spring sulphur', PropShape.Patch, 'sulphur', 20, 5, 20, 2, Tool.Bronze, 'Sulphur at a hot spring'),
  node(PropKind.SurfaceGold, 'Surface gold', PropShape.Rocks, 'gold', 1, 1, 20, 1, Tool.Bronze, 'Surface gold / surface gem', ['1 to 3', '20 s / 30 s']),
  node(PropKind.SurfaceGem, 'Surface gem', PropShape.Crystal, 'gem', 1, 1, 30, 1, Tool.Bronze, 'Surface gold / surface gem', ['1 to 3 / 1', '20 s / 30 s']),
  node(PropKind.ManaCrystal, 'Mana crystal', PropShape.Crystal, 'mana crystal', 5, 1, 30, 1, Tool.Bronze, 'Mana crystal node'),
  // Its yield is the animal's (animals/species.ts); the variant names the species.
  node(PropKind.Carcass, 'Carcass', PropShape.Carcass, 'meat', 0, 10, 10, 2, Tool.None, 'Carcass', ['boar 3 meat', 'none']),
  // A stretch's yield is what its water holds; load time is per fish with a rod (a net or a dock is 10 s); the regrowth is its breeding.
  node(PropKind.FishTrout, 'Trout stretch', PropShape.Fish, 'fish', 0, 1, 15, 1, Tool.None, FISH_ROW, FISH_CHECK, 3 * CYCLE_STEPS),
  node(PropKind.FishSalmon, 'Salmon stretch', PropShape.Fish, 'fish', 0, 1, 15, 1, Tool.None, FISH_ROW, FISH_CHECK, 6 * CYCLE_STEPS),
  node(PropKind.FishCatfish, 'Giant catfish stretch', PropShape.Fish, 'fish', 0, 1, 15, 1, Tool.None, FISH_ROW, FISH_CHECK, 9 * CYCLE_STEPS),
  // GP-30: 1 food a mushroom. Picked, it is gone, and a new one grows within 3 m (GP-30's regrowth, with foraging).
  { ...node(PropKind.Mushroom, 'Edible mushrooms', PropShape.Plant, 'mushrooms', 1, 1, 3, 1, Tool.None, P5), forage: true },
  berries(PropKind.BlackBerryBush, 'Black berry bush', 'black berries'),
  berries(PropKind.RaspberryBush, 'Raspberry bush', 'raspberries'),
  berries(PropKind.BlueberryBush, 'Blueberry bush', 'blueberries'),
  node(PropKind.FlaxTall, 'Tall flax', PropShape.Plant, 'flax', 20, 10, 10, 1, Tool.Hardwood, P5, [], 3 * MINUTE),
  node(PropKind.Boulder, 'Boulder', PropShape.Rocks, 'stone', 400, 5, 15, 3, Tool.Hardwood, P5),
  // WL-4: "never more than 2 gold ingots worth of ore from a single gold node, and never more than 4 silver ingots
  // worth from single silver ore node ... the nodes also give more stone than the ore", copper picks or better.
  { ...node(PropKind.SilverNode, 'Silver ore node', PropShape.Rocks, 'silver', 1, 2, 20, 1, Tool.Copper, P5), yieldMax: 4, leaves: { kind: PropKind.LooseStone, min: 10, max: 20 } },
  { ...node(PropKind.GoldNode, 'Gold ore node', PropShape.Rocks, 'gold', 1, 1, 20, 1, Tool.Copper, P5), yieldMax: 2, leaves: { kind: PropKind.LooseStone, min: 6, max: 12 } },
  // Patch 5's stone circles (circles/data.ts). Bluestone "can be mined with iron tools or tools superior to iron" (SC-5);
  // a trilithon holds its state's bluestone (TRILITHONS), a rubble pile its size's (s: 5 a load, 30 s a trilithon's).
  node(PropKind.Trilithon, 'Trilithon', PropShape.Rocks, 'bluestone', 12, 5, 30, 2, Tool.Iron, P5),
  { ...node(PropKind.BluestoneRubble, 'Bluestone rubble', PropShape.Rocks, 'bluestone', RUBBLE_BLUESTONE.small, 5, 20, 1, Tool.Iron, P5), yieldMax: RUBBLE_BLUESTONE.large },
  // Opened and used by a unit (circles/act.ts), never gathered.
  node(PropKind.BluestoneChest, 'Bluestone chest', PropShape.Rocks, '', 0, 0, 0, 0, Tool.None, P5),
  node(PropKind.CircleAltar, 'Altar', PropShape.Rocks, '', 0, 0, 0, 0, Tool.None, P5),
  // SC-9: "gives 10 hawthorne fruit. It takes 3 days for a hawthorne harvest to regrow"; picked by a worker or a woodsman.
  { ...berries(PropKind.SweetHawthorne, 'Sweet Hawthorne', 'hawthorne fruit'), yield: HAWTHORNE_FRUIT, yieldMax: HAWTHORNE_FRUIT, perLoad: HAWTHORNE_FRUIT, regrowSteps: HAWTHORNE_REGROW_DAYS * CYCLE_STEPS },
  // SC-8: an Ancient Seed's sapling "grows into a Sweet Hawthorne tree over four to six nights" (s: 5), holding nothing until then.
  { ...tree(PropKind.HawthorneSapling, 'Sweet Hawthorne', 0, 20, 1, Tool.Hardwood, HAWTHORNE_GROW_NIGHTS * CYCLE_STEPS, P5, ''), seeds: 0 },
  // SCA-8: its roses open only on a Bright Night (circles/update.ts gives it ROSES_PER_BUSH then, and none at daybreak).
  { ...berries(PropKind.MoonRoseBush, 'Moon Rose bush', 'moon rose'), yield: 0, yieldMax: 0, perLoad: 3, regrowSteps: CYCLE_STEPS },
  // Jade's model notes: "Gatherable as bones if desired."
  { ...node(PropKind.BonePile, 'Bone pile', PropShape.Patch, 'bone', 5, 5, 10, 1, Tool.None, P5), yieldMax: 10 },
  node(PropKind.RuinBush, 'Bush', PropShape.Plant, '', 0, 0, 0, 0, Tool.None, P5),
  node(PropKind.RuinFern, 'Fern', PropShape.Plant, '', 0, 0, 0, 0, Tool.None, P5),
  node(PropKind.RuinMoss, 'Moss', PropShape.Plant, '', 0, 0, 0, 0, Tool.None, P5),
  node(PropKind.RuinFlower, 'Flowers', PropShape.Plant, '', 0, 0, 0, 0, Tool.None, P5),
  // A Boneyard Circle's dead trees and thorn bushes (SCB-1) and a ruin's softwood (SC-2): the same as any other.
  { ...tree(PropKind.BoneyardDeadTree, 'Dead tree', 10, 15, 1, Tool.Hardwood, 0, P5, 'softwood lumber'), seeds: 0 },
  { ...tree(PropKind.BoneyardThorn, 'Thorn bush', 10, 10, 1, Tool.Hardwood, 0, P5, 'sticks'), perLoad: 10, seeds: 0 },
  tree(PropKind.CirclePine, 'Pine', 20, 15, 1, Tool.Hardwood, 60 * MINUTE, P5, 'softwood lumber'),
  // GP-29: "each growing a single pumpkin sized pear max, each pear taking 3 minutes to regrow".
  { ...berries(PropKind.BogPearBush, 'Bog pear bush', 'bog pear'), yield: 1, yieldMax: 1, perLoad: 1, regrowSteps: 3 * MINUTE },
];

/** Whether a prop is a fish stretch. */
export function isFish(kind: number): boolean {
  return kind === PropKind.FishTrout || kind === PropKind.FishSalmon || kind === PropKind.FishCatfish;
}

export function propInfo(kind: number): PropInfo {
  const p = PROPS[kind];
  if (!p) throw new Error(`unknown prop kind ${kind}`);
  return p;
}

export function isTree(kind: number): boolean {
  return PROPS[kind]?.shape === PropShape.Tree;
}

/**
 * Growth stages (Generated rocks and trees: seed, sapling, full size; Jade's
 * patch notes 1: plants grow in steps, like crops, and a sapling holds nothing
 * until it looks like a small tree or bush). Props that do not grow are always
 * Grown.
 */
export const Stage = { Seed: 0, Sapling: 1, Young: 2, HalfGrown: 3, Grown: 4 } as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

/** One step of a plant's growth. A plant shows a stage from its `fromPm` until the next stage's. */
export interface GrowthStage {
  stage: Stage;
  /** The stage's name. */
  name: string;
  /** What a plant at this stage is called in the game; {Name} and {name} stand for the plant's own name ("Pine sapling", "Young great oak"). */
  called: string;
  /** Reached at this share of the plant's growing time (Table 5 "Regrowth"), per mille. */
  fromPm: number;
  /** Drawn at this share of full size, per mille. */
  sizePm: number;
  /** Holds this share of the plant's full yield, per mille: 0 while there is nothing to gather yet. */
  yieldPm: number;
  /** Small and easy to remove: a building may be placed over it (Building placement). */
  buildOver: boolean;
  /** Time a builder spends pulling it up before construction starts; 0 for trampled at once. */
  clearSteps: number;
}

const STAGE_NAMES = ['Seed', 'Sapling', 'Young', 'Half-grown', 'Grown'] as const;
const stage = (s: Stage, called: string, fromPm: number, sizePm: number, yieldPm: number, buildOver = false, clearSeconds = 0): GrowthStage => ({
  stage: s, name: STAGE_NAMES[s], called, fromPm, sizePm, yieldPm, buildOver, clearSteps: clearSeconds * STEPS_PER_SECOND,
});

/**
 * Trees, from the seed (Table 5 "Regrowth": 60 min seed to full for softwood).
 * A young tree holds the share of its lumber that matches the share of its
 * growing time, so felling early gives the same lumber a minute (s).
 */
export const TREE_GROWTH: readonly GrowthStage[] = [
  stage(Stage.Seed, '{Name} seed', 0, 60, 0, true, 0),
  stage(Stage.Sapling, '{Name} sapling', 100, 120, 0, true, 2),
  stage(Stage.Young, 'Young {name}', 350, 400, 350),
  stage(Stage.HalfGrown, 'Half-grown {name}', 650, 700, 650),
  stage(Stage.Grown, '{Name}', 1000, 1000, 1000),
];

/** Hazel bushes, from the stump once picked bare (Table 5: 2 days); a new hazel sapling holds no sticks (s). */
export const HAZEL_GROWTH: readonly GrowthStage[] = [
  stage(Stage.Sapling, 'Hazel sapling', 0, 250, 0, true, 2),
  stage(Stage.Young, 'Young hazel bush', 300, 500, 300),
  stage(Stage.HalfGrown, 'Half-grown hazel bush', 650, 750, 650),
  stage(Stage.Grown, 'Hazel bush', 1000, 1000, 1000),
];

/** A berry bush picked bare: the bush stays and its berries grow back (GP-31), no buildings over it (s). */
export const BERRY_GROWTH: readonly GrowthStage[] = [
  stage(Stage.Young, '{Name}, picked', 0, 1000, 0),
  stage(Stage.Grown, '{Name}', 1000, 1000, 1000),
];

/** Herbs and wild flax, from the roots once picked bare (Table 5: 5 days; flax 3 minutes since Patch 5) (s). */
export const PLANT_GROWTH: readonly GrowthStage[] = [
  stage(Stage.Sapling, 'Sprouting {name}', 0, 300, 0, true, 1),
  stage(Stage.HalfGrown, 'Half-grown {name}', 500, 650, 500),
  stage(Stage.Grown, '{Name}', 1000, 1000, 1000),
];

/** A plant's growth stages, or null for a prop that does not grow (rocks, patches, dead trees, fish). */
export function growthStages(kind: number): readonly GrowthStage[] | null {
  const info = propInfo(kind);
  if (info.regrowSteps === 0) return null;
  if (info.shape === PropShape.Tree) return TREE_GROWTH;
  if (kind === PropKind.Hazel) return HAZEL_GROWTH;
  if (info.forage && info.shape === PropShape.Bush) return BERRY_GROWTH;
  if (info.shape === PropShape.Plant) return PLANT_GROWTH;
  return null;
}

/** The row of a plant's stage table for a stage, or null (a prop that does not grow, or a stage its kind skips). */
export function stageInfo(kind: number, s: number): GrowthStage | null {
  return growthStages(kind)?.find((g) => g.stage === s) ?? null;
}

/** The stage's name for a prop: "Hazel sapling", "Young pine", "Great beech". */
export function stageName(kind: number, s: number): string {
  const name = propInfo(kind).name;
  const row = stageInfo(kind, s);
  if (!row) return name;
  return row.called.replace('{Name}', name).replace('{name}', name.toLowerCase());
}

/** Whether a building may be placed over a prop at a stage: seeds, saplings and sprouting plants (Building placement). */
export function canBuildOver(kind: number, s: number): boolean {
  return stageInfo(kind, s)?.buildOver ?? false;
}

/**
 * A plant's stage after growing for `grown` steps of its growing time: the
 * stage, its drawn size and the share of its yield it holds (per mille), and
 * how many more steps until its next stage (-1 once grown).
 */
export function growth(kind: number, grown: number): { stage: Stage; size: number; yieldPm: number; next: number } {
  const stages = growthStages(kind);
  if (!stages) return { stage: Stage.Grown, size: 1000, yieldPm: 1000, next: -1 };
  const t = propInfo(kind).regrowSteps;
  let k = 0;
  // A stage is reached once grown / t >= fromPm / 1000, in whole steps (grown < t keeps the products small).
  if (grown >= t) k = stages.length - 1;
  else while (k + 1 < stages.length && grown * 1000 >= stages[k + 1]!.fromPm * t) k++;
  const row = stages[k]!;
  const next = k + 1 < stages.length ? Math.max(1, ceilDiv(stages[k + 1]!.fromPm * t, 1000) - grown) : -1;
  return { stage: row.stage, size: row.sizePm, yieldPm: row.yieldPm, next };
}

function ceilDiv(a: number, b: number): number {
  return -floorDiv(-a, b);
}

/**
 * Fish in a stretch at a step (Fish): every pair breeds once each breeding
 * period until the water holds its most, counted from the last catch. A
 * stretch fished out never breeds again; a lone fish has no pair.
 */
export function fishAt(breedSteps: number, most: number, amount: number, since: number, step: number): number {
  if (amount <= 0 || since < 0 || breedSteps <= 0) return Math.max(0, amount);
  let n = amount;
  const periods = Math.min(64, floorDiv(step - since, breedSteps));
  for (let k = 0; k < periods && n < most; k++) n = Math.min(most, n + (n >> 1));
  return n;
}

/** The tool job a node is worked with: trees and bushes are chopped, plants, forage and carcasses cut, rocks, patches and crystals broken. */
export function propJob(kind: number): ToolJob {
  const info = propInfo(kind);
  const shape = info.shape;
  // Berries and mushrooms are picked, not chopped.
  if (info.forage) return ToolJob.Cut;
  if (shape === PropShape.Tree || shape === PropShape.Bush) return ToolJob.Chop;
  if (shape === PropShape.Plant || shape === PropShape.Carcass || shape === PropShape.Fish) return ToolJob.Cut;
  return ToolJob.Break;
}

/** The soft ores a stone maul mines at x1.0 rather than its x1.15 (Table 2c). */
export function isSoftOre(kind: number): boolean {
  return kind === PropKind.CopperOutcrop || kind === PropKind.TinOutcrop;
}
