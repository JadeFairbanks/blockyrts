// The animals of milestone 4 (Animals; Wild herds; Game and other wild
// animals; Bears; Table 14 horse and ox; mob roster 6.1 for the wild
// creatures). Every number is the doc's or the roster's where it gives
// one, converted to steps and world units; the rest are marked (s).

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { Band } from '../world/layout.ts';
import { BuildingKind } from '../buildings/data.ts';
import { CYCLE_STEPS } from '../rules.ts';

export const Species = {
  Cattle: 0,
  Chicken: 1,
  Horse: 2,
  Ox: 3,
  Hare: 4,
  Deer: 5,
  Boar: 6,
  Wolf: 7,
  Lynx: 8,
  GiantFrog: 9,
  Crocodile: 10,
  GiantCrab: 11,
  Badger: 12,
  Bear: 13,
} as const;
export type Species = (typeof Species)[keyof typeof Species];

/** How an animal behaves when nobody owns it. */
export const Nature = {
  /** Grazes in its herd and runs when hurt (cattle, chickens, horses, oxen, hares, deer). */
  Shy: 0,
  /** Grazes, and fights whoever hurts it (wild boar, giant crabs). */
  FightsBack: 1,
  /** Roams in a pack and attacks the players' units it sees (wolves). */
  Pack: 2,
  /** Stalks a worker on its own, and runs from a group (lynx). */
  Stalker: 3,
  /** Guards its spot and gives up once players leave (giant frogs, crocodiles). */
  Territorial: 4,
  /** Knocks over outlying torches and runs from units (badgers). */
  TorchBreaker: 5,
  /** Attacks only when hurt or when something comes within 2 m, or 15 m of a mother with a cub (bears). */
  Bear: 6,
} as const;
export type Nature = (typeof Nature)[keyof typeof Nature];

export interface SpeciesSpec {
  id: Species;
  name: string;
  /** Catalogue model (review/batch-2 MANIFEST; Jade's existing models for the roster creatures). */
  model: string;
  /** The young's texture variant in the catalogue, or '' for the adult model at half size. */
  youngVariant: string;
  nature: Nature;
  hp: number;
  armourBp: number;
  damage: number;
  attackSteps: number;
  reach: number;
  /** Walking (grazing) and running speed, wu per step; swimming speed for crocodiles. */
  walk: number;
  run: number;
  swim: number;
  halfWidth: number;
  height: number;
  /** What its carcass gives: meat as the node, the rest when it is emptied (Table 5 carcass row). */
  meat: number;
  extra: Cost;
  /** Where it lives, and how many of it a cell holds at the start (pairs for herds, a pack, single creatures). */
  bands: readonly Band[];
  perCell: number;
  /** A pack's or herd's group size (wolves 3 to 5). */
  groupMin: number;
  groupMax: number;
  /** Taming (Table 14): the food it takes and how long a worker stands by it; where it can live; 0 food for never. */
  tameFood: number;
  tameFoods: readonly Res[];
  tameSteps: number;
  tameAt: readonly number[];
  /** Food per cycle while working (pulling a cart or carrying a pack), 0 for none (Table 6). */
  upkeep: number;
  /** Grazing need in m2 of grass within 30 m of its farm (Table 6), and nutrition a day from crops when short. */
  grassM2: number;
  cropNutrition: number;
  /** Hauling: a cart's load and speed behind it, and a pack's load without one, tenths of a pound (Table 12). */
  cartTenthsLb: number;
  cartSpeed: number;
  packTenthsLb: number;
}

const m = (metres10: number): number => floorDiv(metres10 * WU_PER_METRE, 10);
const mps = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
const sec = (n: number): number => n * STEPS_PER_SECOND;

const H = Band.Heartland;
const F = Band.Fringe;
const D = Band.Deepwoods;
const PLANT_FOODS: readonly Res[] = [Res.Wheat, Res.Carrots, Res.Corn];
const ANY_FOOD: readonly Res[] = [Res.Wheat, Res.Carrots, Res.Corn, Res.Potatoes];

type Base = Omit<SpeciesSpec, 'id'>;
const defaults: Pick<SpeciesSpec, 'youngVariant' | 'armourBp' | 'swim' | 'extra' | 'groupMin' | 'groupMax' | 'tameFood' | 'tameFoods' | 'tameSteps' | 'tameAt' | 'upkeep' | 'grassM2' | 'cropNutrition' | 'cartTenthsLb' | 'cartSpeed' | 'packTenthsLb'> = {
  youngVariant: '', armourBp: 0, swim: 0, extra: [], groupMin: 2, groupMax: 2, tameFood: 0, tameFoods: [], tameSteps: 0, tameAt: [], upkeep: 0, grassM2: 0, cropNutrition: 0, cartTenthsLb: 0, cartSpeed: 0, packTenthsLb: 0,
};
const sp = (o: Partial<Base> & Pick<Base, 'name' | 'model' | 'nature' | 'hp' | 'damage' | 'attackSteps' | 'reach' | 'walk' | 'run' | 'halfWidth' | 'height' | 'meat' | 'bands' | 'perCell'>): Base => ({ ...defaults, ...o });

const LIST: readonly Base[] = [
  // Livestock and working animals. Cattle and chickens are tamed onto a livestock farm, horses at the Stables, oxen at either (s).
  sp({
    name: 'Cattle', model: 'cow', youngVariant: 'calf', nature: Nature.Shy, hp: 120, damage: 6, attackSteps: ds(15), reach: m(15), walk: mps(10), run: mps(40), halfWidth: m(5), height: m(15),
    meat: 6, extra: [[Res.Leather, 2]], bands: [H], perCell: 3, tameFood: 10, tameFoods: ANY_FOOD, tameSteps: sec(60), tameAt: [BuildingKind.LivestockFarm], grassM2: 20, cropNutrition: 2,
  }),
  sp({
    name: 'Chicken', model: 'chicken_hen', youngVariant: 'chick', nature: Nature.Shy, hp: 10, damage: 1, attackSteps: ds(10), reach: m(5), walk: mps(8), run: mps(30), halfWidth: m(2), height: m(4),
    meat: 1, extra: [[Res.Feathers, 2]], bands: [H, F], perCell: 4, tameFood: 2, tameFoods: [Res.Wheat, Res.Corn], tameSteps: sec(20), tameAt: [BuildingKind.LivestockFarm], grassM2: 2, cropNutrition: 1,
  }),
  sp({
    name: 'Horse', model: 'horse', youngVariant: 'foal', nature: Nature.Shy, hp: 160, damage: 8, attackSteps: ds(15), reach: m(15), walk: mps(20), run: mps(80), halfWidth: m(5), height: m(16),
    meat: 4, extra: [[Res.Hides, 2]], bands: [F], perCell: 2, tameFood: 5, tameFoods: PLANT_FOODS, tameSteps: sec(45), tameAt: [BuildingKind.Stables], upkeep: 2, grassM2: 20, cropNutrition: 2,
    cartTenthsLb: 4000, cartSpeed: mps(25), packTenthsLb: 1000,
  }),
  sp({
    name: 'Ox', model: 'ox', youngVariant: 'young', nature: Nature.Shy, hp: 250, armourBp: 1000, damage: 10, attackSteps: ds(18), reach: m(15), walk: mps(15), run: mps(40), halfWidth: m(6), height: m(15),
    meat: 6, extra: [[Res.Hides, 2]], bands: [F], perCell: 2, tameFood: 10, tameFoods: ANY_FOOD, tameSteps: sec(60), tameAt: [BuildingKind.Stables, BuildingKind.LivestockFarm], upkeep: 3, grassM2: 20, cropNutrition: 2,
    cartTenthsLb: 6000, cartSpeed: mps(15), packTenthsLb: 1500,
  }),
  // Game (Table 6): hares and deer run; wild boar fight back (roster 6.1).
  sp({ name: 'Hare', model: 'hare', youngVariant: 'young', nature: Nature.Shy, hp: 20, damage: 0, attackSteps: ds(10), reach: m(5), walk: mps(15), run: mps(60), halfWidth: m(2), height: m(4), meat: 1, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 4 }),
  sp({ name: 'Deer', model: 'deer', youngVariant: 'young', nature: Nature.Shy, hp: 40, damage: 0, attackSteps: ds(10), reach: m(10), walk: mps(15), run: mps(70), halfWidth: m(4), height: m(14), meat: 4, extra: [[Res.Hides, 2]], bands: [H, F, D], perCell: 3, groupMin: 2, groupMax: 4 }),
  sp({ name: 'Wild boar', model: 'wild_boar', nature: Nature.FightsBack, hp: 90, armourBp: 1000, damage: 12, attackSteps: ds(12), reach: m(12), walk: mps(15), run: mps(45), halfWidth: m(4), height: m(9), meat: 3, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 2, groupMin: 1, groupMax: 3 }),
  // Other wild creatures (roster 6.1).
  sp({ name: 'Wolf', model: 'wolf', youngVariant: 'young', nature: Nature.Pack, hp: 70, damage: 10, attackSteps: ds(10), reach: m(12), walk: mps(20), run: mps(55), halfWidth: m(4), height: m(8), meat: 1, extra: [[Res.Hides, 1]], bands: [F, D], perCell: 1, groupMin: 3, groupMax: 5 }),
  sp({ name: 'Lynx', model: 'lynx', nature: Nature.Stalker, hp: 60, damage: 10, attackSteps: ds(9), reach: m(12), walk: mps(20), run: mps(55), halfWidth: m(3), height: m(6), meat: 1, extra: [[Res.Hides, 1]], bands: [F, D], perCell: 1, groupMin: 1, groupMax: 1 }),
  sp({ name: 'Giant frog', model: 'giant_frog', nature: Nature.Territorial, hp: 70, damage: 8, attackSteps: ds(12), reach: m(40), walk: mps(10), run: mps(20), halfWidth: m(5), height: m(6), meat: 2, bands: [H, F, D], perCell: 1, groupMin: 1, groupMax: 2 }),
  sp({ name: 'Crocodile', model: 'crocodile', nature: Nature.Territorial, hp: 220, armourBp: 3000, damage: 22, attackSteps: ds(18), reach: m(15), walk: mps(10), run: mps(25), swim: mps(50), halfWidth: m(6), height: m(5), meat: 3, extra: [[Res.Hides, 2]], bands: [F, D], perCell: 1, groupMin: 1, groupMax: 1 }),
  sp({ name: 'Giant crab', model: 'giant_crab', nature: Nature.FightsBack, hp: 80, armourBp: 4000, damage: 10, attackSteps: ds(13), reach: m(12), walk: mps(10), run: mps(20), halfWidth: m(5), height: m(5), meat: 2, bands: [H, F, D], perCell: 1, groupMin: 1, groupMax: 2 }),
  sp({ name: 'Badger', model: 'badger', nature: Nature.TorchBreaker, hp: 30, damage: 5, attackSteps: ds(10), reach: m(10), walk: mps(12), run: mps(25), halfWidth: m(3), height: m(4), meat: 1, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 1, groupMin: 1, groupMax: 1 }),
  // Bears (doc; Table 14's tamed bear for the numbers): never tamed, one pair and cubs per Deepwoods cell, 60 at most.
  sp({ name: 'Bear', model: 'bear', youngVariant: 'cub', nature: Nature.Bear, hp: 400, armourBp: 1500, damage: 25, attackSteps: ds(15), reach: m(20), walk: mps(15), run: mps(60), halfWidth: m(7), height: m(15), meat: 8, extra: [[Res.Hides, 2]], bands: [D], perCell: 1 }),
];

export const SPECIES: readonly SpeciesSpec[] = LIST.map((s, id) => ({ ...s, id: id as Species }));

export function speciesSpec(id: number): SpeciesSpec {
  const s = SPECIES[id];
  if (!s) throw new Error(`unknown species ${id}`);
  return s;
}

/** Herd animals that live in pairs and breed (Wild herds; Bears). */
export function breeds(id: number): boolean {
  return id === Species.Cattle || id === Species.Chicken || id === Species.Horse || id === Species.Ox || id === Species.Bear;
}

/** Game a hunt goes after on its own (Hunting): not bears or territorial creatures. */
export function isGame(id: number): boolean {
  return id === Species.Hare || id === Species.Deer || id === Species.Boar || id === Species.GiantCrab;
}

/** Pairs breed every 10 days and the young grow up in 2 (doc). */
export const BREED_STEPS = 10 * CYCLE_STEPS;
export const YOUNG_STEPS = 2 * CYCLE_STEPS;
/** Bears: at most 60 in the whole world (doc). */
export const BEAR_CAP = 60;
