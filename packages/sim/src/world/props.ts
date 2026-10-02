// Resource nodes and other generated props (Table 5: Resource nodes per band;
// Generated rocks and trees). The numbers are typed copies of Table 5's rows;
// test/world-props.test.ts checks every one against the table's text, so the
// blueprint stays the source.

import { floorDiv, STEPS_PER_SECOND } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
const MINUTE = 60 * STEPS_PER_SECOND;

/** Tool tiers in the order of Table 10's rows, which Table 5's "Tool needed" column names. */
export const Tool = { None: 0, Hardwood: 1, Stone: 2, Flint: 3, Copper: 4, Bronze: 5, BloomIron: 6, WroughtIron: 7, RefinedIron: 8, Steel: 9, HighQualitySteel: 10 } as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

/**
 * What a worker's tool is for (Table 2c, Equip Best "tools by job"): the axe
 * chops, the digging stick, maul or pickaxe quarries, digs and mines, the
 * mallet or hammer builds and repairs, the knife or sickle cuts plants and
 * butchers. A worker holds one tool per job; a tier's set covers all four.
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
  CoalSeam: 17,
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
  /** Table 5 "Time per load" in steps, with hardwood tools. */
  loadSteps: number;
  /** Table 5 "Gatherers". */
  gatherers: number;
  /** Table 5 "Tool needed". */
  tool: Tool;
  /** Table 5 "Regrowth" in steps (trees: seed to full size; bushes and plants: from the stump), 0 for none. */
  regrowSteps: number;
  /** Seeds dropped when felled (trees). */
  seeds: number;
  /** The Table 5 row this comes from (its first cell), for the test that checks it. */
  row: string;
  /** Extra text the test expects in that row, if the record differs from the row's first numbers. */
  check: readonly string[];
}

const tree = (kind: PropKind, name: string, y: number, load: number, gatherers: number, tool: Tool, regrow: number, row: string, resource: string): PropInfo => ({
  kind, name, shape: PropShape.Tree, resource, yield: y, perLoad: 5, loadSteps: load * STEPS_PER_SECOND, gatherers, tool, regrowSteps: regrow, seeds: 2, row, check: [],
});
const node = (kind: PropKind, name: string, shape: PropShape, resource: string, y: number, perLoad: number, load: number, gatherers: number, tool: Tool, row: string, check: readonly string[] = [], regrow = 0): PropInfo => ({
  kind, name, shape, resource, yield: y, perLoad, loadSteps: load * STEPS_PER_SECOND, gatherers, tool, regrowSteps: regrow, seeds: 0, row, check,
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
  node(PropKind.Hazel, 'Hazel bush', PropShape.Bush, 'hardwood sticks', 10, 10, 10, 1, Tool.Hardwood, 'Hazel bush', ['2 days'], 2 * CYCLE_STEPS),
  tree(PropKind.Birch, 'Birch', 15, 20, 1, Tool.Flint, 180 * MINUTE, SMALL_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Hornbeam, 'Hornbeam', 15, 20, 1, Tool.Flint, 180 * MINUTE, SMALL_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Oak, 'Great oak', 40, 20, 2, Tool.Copper, 360 * MINUTE, LARGE_HW_ROW, 'hardwood lumber'),
  tree(PropKind.Beech, 'Great beech', 40, 20, 2, Tool.Copper, 360 * MINUTE, LARGE_HW_ROW, 'hardwood lumber'),
  // Dead and twisted, no lumber (Jade): cover and lair sites only.
  { ...tree(PropKind.DeadTree, 'Dead tree', 0, 0, 0, Tool.None, 0, 'Dead trees, thornwood', ''), seeds: 0, check: ['no lumber'] },
  { ...tree(PropKind.Thornwood, 'Thornwood', 0, 0, 0, Tool.None, 0, 'Dead trees, thornwood', ''), seeds: 0, check: ['no lumber'] },
  node(PropKind.Herbs, 'Herbs', PropShape.Plant, 'medicinal herbs', 10, 10, 10, 1, Tool.Hardwood, 'Herbs / wild flax', ['10 / 10', '5 days'], 5 * CYCLE_STEPS),
  node(PropKind.WildFlax, 'Wild flax', PropShape.Plant, 'flax', 10, 10, 10, 1, Tool.Hardwood, 'Herbs / wild flax', ['10 / 10', '5 days'], 5 * CYCLE_STEPS),
  node(PropKind.LooseStone, 'Loose stone', PropShape.Rocks, 'stone', 40, 5, 10, 2, Tool.Hardwood, 'Loose stone / flint scatter', ['40 stone', '5 / 10']),
  node(PropKind.FlintScatter, 'Flint scatter', PropShape.Rocks, 'flint', 20, 10, 10, 2, Tool.Hardwood, 'Loose stone / flint scatter', ['20 flint', '5 / 10']),
  node(PropKind.StoneOutcrop, 'Stone outcrop', PropShape.Rocks, 'stone', 200, 5, 15, 2, Tool.Hardwood, 'Stone outcrop'),
  node(PropKind.CopperOutcrop, 'Copper outcrop', PropShape.Rocks, 'copper ore', 60, 5, 20, 2, Tool.Stone, 'Copper outcrop / tin outcrop', ['60 / 30']),
  node(PropKind.TinOutcrop, 'Tin outcrop', PropShape.Rocks, 'tin ore', 30, 5, 20, 2, Tool.Stone, 'Copper outcrop / tin outcrop', ['60 / 30']),
  node(PropKind.CoalSeam, 'Coal seam', PropShape.Rocks, 'coal', 60, 5, 15, 2, Tool.Copper, 'Coal, surface seam'),
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

/** Growth stages from age (Generated rocks and trees: "seed, sapling, full size"). */
export const Stage = { Seed: 0, Sapling: 1, Full: 2 } as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

/** A tree's growth stage and its size as a fraction of full size (per mille), from its age in steps. */
export function growth(kind: number, age: number): { stage: Stage; size: number } {
  const info = propInfo(kind);
  if (info.shape !== PropShape.Tree || info.regrowSteps === 0) return { stage: Stage.Full, size: 1000 };
  const t = info.regrowSteps;
  if (age >= t) return { stage: Stage.Full, size: 1000 };
  // Seed for the first tenth, then a sapling that grows from a fifth of full size.
  if (age * 10 < t) return { stage: Stage.Seed, size: 60 };
  return { stage: Stage.Sapling, size: 200 + floorDiv(age * 800, t) };
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

/** The tool job a node is worked with: trees and bushes are chopped, plants and carcasses cut, rocks, patches and crystals broken. */
export function propJob(kind: number): ToolJob {
  const shape = propInfo(kind).shape;
  if (shape === PropShape.Tree || shape === PropShape.Bush) return ToolJob.Chop;
  if (shape === PropShape.Plant || shape === PropShape.Carcass || shape === PropShape.Fish) return ToolJob.Cut;
  return ToolJob.Break;
}

/** The soft ores a stone maul mines at x1.0 rather than its x1.15 (Table 2c). */
export function isSoftOre(kind: number): boolean {
  return kind === PropKind.CopperOutcrop || kind === PropKind.TinOutcrop;
}
