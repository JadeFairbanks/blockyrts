// The animals of milestone 4 (Animals; Wild herds; Game and other wild
// animals; Bears; Table 14 horse and ox; mob roster 6.1 for the wild
// creatures). Every number is the doc's or the roster's where it gives
// one, converted to steps and world units; the rest are marked (s).

import { Res, type Cost } from '../economy/resources.ts';
import type { Drop } from '../combat/mobs.ts';
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
  // Territorial creatures (mob roster 6 and 6.1; milestone 5).
  GiantBeetle: 14,
  GiantHornet: 15,
  Viper: 16,
  GiantScorpion: 17,
  Griffin: 18,
  Minotaur: 19,
  // Wild birds for feathers (Troops and gear: feathers from hunted wild birds (Jade); geese and pheasants (s)).
  WildGoose: 20,
  Pheasant: 21,
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
  /** Territorial in a swarm: a disturbed nest all comes out and chases far (giant hornets). */
  Nest: 7,
  /** Territorial, and once disturbed hunts the players until one side is dead (griffins, minotaurs). */
  Hunter: 8,
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
  /** Taming (Table 14): how many of its bait it takes (Patch 2: farm fare, Jade) and how long a worker stands by it; where it can live; 0 for never. */
  tameFood: number;
  tameFoods: readonly Res[];
  tameSteps: number;
  tameAt: readonly number[];
  /** Food per cycle while working (pulling a cart or carrying a pack), 0 for none (Table 6). */
  upkeep: number;
  /** Nutrition it eats a day from the farm fare in stock while it lives in a Barn (Patch 2, Jade: Barn animals cannot graze, they eat farm fare). */
  barnFeed: number;
  /** Hauling: a cart's load and speed behind it, and a pack's load without one, tenths of a pound (Table 12). */
  cartTenthsLb: number;
  cartSpeed: number;
  packTenthsLb: number;
  /** Territorial creatures: how near they let the players come and how far they chase, wu (0 for the defaults), and how far they roam from their spot. */
  guard: number;
  chase: number;
  roam: number;
  /** Poison its hit adds over 5 s (vipers, scorpions), 0 for none. */
  venom: number;
  /** What it drops besides its carcass, rolled for the player whose unit killed it (roster 6.1). */
  loot: readonly Drop[];
}

const m = (metres10: number): number => floorDiv(metres10 * WU_PER_METRE, 10);
const mps = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
const sec = (n: number): number => n * STEPS_PER_SECOND;

const H = Band.Heartland;
const F = Band.Fringe;
const D = Band.Deepwoods;
const B = Band.Barrens;
const X = Band.Deadlands;
/** What tamed animals and bait are fed (Patch 2, Jade: "what do animals eat now if they don't graze? farm fare is the answer"). */
const FARM_FOOD: readonly Res[] = [Res.FarmFare];

type Base = Omit<SpeciesSpec, 'id'>;
const defaults: Pick<SpeciesSpec, 'youngVariant' | 'armourBp' | 'swim' | 'extra' | 'groupMin' | 'groupMax' | 'tameFood' | 'tameFoods' | 'tameSteps' | 'tameAt' | 'upkeep' | 'barnFeed' | 'cartTenthsLb' | 'cartSpeed' | 'packTenthsLb' | 'guard' | 'chase' | 'roam' | 'venom' | 'loot'> = {
  youngVariant: '', armourBp: 0, swim: 0, extra: [], groupMin: 2, groupMax: 2, tameFood: 0, tameFoods: [], tameSteps: 0, tameAt: [], upkeep: 0, barnFeed: 0, cartTenthsLb: 0, cartSpeed: 0, packTenthsLb: 0,
  guard: 0, chase: 0, roam: 0, venom: 0, loot: [],
};
const sp = (o: Partial<Base> & Pick<Base, 'name' | 'model' | 'nature' | 'hp' | 'damage' | 'attackSteps' | 'reach' | 'walk' | 'run' | 'halfWidth' | 'height' | 'meat' | 'bands' | 'perCell'>): Base => ({ ...defaults, ...o });

const LIST: readonly Base[] = [
  // Livestock and working animals, all kept in a Barn once tamed (Patch 2, Jade: in place of the livestock farm, the pen and barn and the Stables).
  // A cow gives twenty times a chicken's food (Jade): 20 beef against 1 chicken meat, 4 food each (s, Jade's rebalance). In a Barn
  // they eat farm fare every day, as much as they ate of crops when short of grass before Patch 2 (s, Jade's rebalance).
  sp({
    name: 'Cattle', model: 'cow', youngVariant: 'calf', nature: Nature.Shy, hp: 120, damage: 6, attackSteps: ds(15), reach: m(15), walk: mps(10), run: mps(40), halfWidth: m(5), height: m(15),
    meat: 20, extra: [[Res.Leather, 2]], bands: [H], perCell: 3, tameFood: 10, tameFoods: FARM_FOOD, tameSteps: sec(60), tameAt: [BuildingKind.Barn], barnFeed: 2,
  }),
  sp({
    name: 'Chicken', model: 'chicken_hen', youngVariant: 'chick', nature: Nature.Shy, hp: 10, damage: 1, attackSteps: ds(10), reach: m(5), walk: mps(8), run: mps(30), halfWidth: m(2), height: m(4),
    meat: 1, extra: [[Res.Feathers, 2]], bands: [H, F], perCell: 4, tameFood: 2, tameFoods: FARM_FOOD, tameSteps: sec(20), tameAt: [BuildingKind.Barn], barnFeed: 1,
  }),
  sp({
    name: 'Horse', model: 'horse', youngVariant: 'foal', nature: Nature.Shy, hp: 160, damage: 8, attackSteps: ds(15), reach: m(15), walk: mps(20), run: mps(80), halfWidth: m(5), height: m(16),
    meat: 4, extra: [[Res.Hides, 2]], bands: [F], perCell: 2, tameFood: 5, tameFoods: FARM_FOOD, tameSteps: sec(45), tameAt: [BuildingKind.Barn], upkeep: 2, barnFeed: 2,
    cartTenthsLb: 4000, cartSpeed: mps(25), packTenthsLb: 1000,
  }),
  sp({
    name: 'Ox', model: 'ox', youngVariant: 'young', nature: Nature.Shy, hp: 250, armourBp: 1000, damage: 10, attackSteps: ds(18), reach: m(15), walk: mps(15), run: mps(40), halfWidth: m(6), height: m(15),
    meat: 6, extra: [[Res.Hides, 2]], bands: [F], perCell: 2, tameFood: 10, tameFoods: FARM_FOOD, tameSteps: sec(60), tameAt: [BuildingKind.Barn], upkeep: 3, barnFeed: 2,
    cartTenthsLb: 6000, cartSpeed: mps(15), packTenthsLb: 1500,
  }),
  // Game (Table 6): hares and deer run; wild boar fight back (roster 6.1).
  sp({ name: 'Hare', model: 'hare', youngVariant: 'young', nature: Nature.Shy, hp: 20, damage: 0, attackSteps: ds(10), reach: m(5), walk: mps(15), run: mps(60), halfWidth: m(2), height: m(4), meat: 1, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 4 }),
  sp({ name: 'Deer', model: 'deer', youngVariant: 'young', nature: Nature.Shy, hp: 40, damage: 0, attackSteps: ds(10), reach: m(10), walk: mps(15), run: mps(70), halfWidth: m(4), height: m(14), meat: 4, extra: [[Res.Hides, 2]], bands: [H, F, D], perCell: 3, groupMin: 2, groupMax: 4 }),
  sp({ name: 'Wild boar', model: 'wild_boar', nature: Nature.FightsBack, hp: 40, armourBp: 1000, damage: 8, attackSteps: ds(12), reach: m(12), walk: mps(15), run: mps(45), halfWidth: m(4), height: m(9), meat: 3, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 2, groupMin: 1, groupMax: 3 }),
  // Other wild creatures (roster 6.1).
  sp({ name: 'Wolf', model: 'wolf', youngVariant: 'young', nature: Nature.Pack, hp: 70, damage: 10, attackSteps: ds(10), reach: m(12), walk: mps(20), run: mps(55), halfWidth: m(4), height: m(8), meat: 1, extra: [[Res.Hides, 1]], bands: [F, D], perCell: 1, groupMin: 3, groupMax: 5 }),
  sp({ name: 'Lynx', model: 'lynx', nature: Nature.Stalker, hp: 36, damage: 8, attackSteps: ds(9), reach: m(12), walk: mps(20), run: mps(55), halfWidth: m(3), height: m(6), meat: 1, extra: [[Res.Hides, 1]], bands: [F, D], perCell: 1, groupMin: 1, groupMax: 1 }),
  sp({ name: 'Giant frog', model: 'giant_frog', nature: Nature.Territorial, hp: 50, damage: 6, attackSteps: ds(12), reach: m(40), walk: mps(10), run: mps(20), halfWidth: m(5), height: m(6), meat: 2, bands: [H, F, D], perCell: 1, groupMin: 1, groupMax: 2 }),
  sp({ name: 'Crocodile', model: 'crocodile', nature: Nature.Territorial, hp: 180, armourBp: 3000, damage: 15, attackSteps: ds(18), reach: m(15), walk: mps(10), run: mps(25), swim: mps(50), halfWidth: m(6), height: m(5), meat: 3, extra: [[Res.Hides, 2]], bands: [F, D], perCell: 1, groupMin: 1, groupMax: 1 }),
  sp({ name: 'Giant crab', model: 'giant_crab', nature: Nature.FightsBack, hp: 50, armourBp: 4000, damage: 6, attackSteps: ds(13), reach: m(12), walk: mps(10), run: mps(20), halfWidth: m(5), height: m(5), meat: 2, bands: [H, F, D], perCell: 1, groupMin: 1, groupMax: 2 }),
  sp({ name: 'Badger', model: 'badger', nature: Nature.TorchBreaker, hp: 20, damage: 5, attackSteps: ds(10), reach: m(10), walk: mps(12), run: mps(25), halfWidth: m(3), height: m(4), meat: 1, extra: [[Res.Hides, 1]], bands: [H, F], perCell: 1, groupMin: 1, groupMax: 1 }),
  // Bears (doc; Table 14's tamed bear for the numbers): never tamed, one pair and cubs per Deepwoods cell, 60 at most.
  sp({ name: 'Bear', model: 'bear', youngVariant: 'cub', nature: Nature.Bear, hp: 200, armourBp: 1500, damage: 16, attackSteps: ds(15), reach: m(20), walk: mps(15), run: mps(60), halfWidth: m(7), height: m(15), meat: 8, extra: [[Res.Hides, 2]], bands: [D], perCell: 1 }),
  // Territorial creatures (roster 6 and 6.1). Where they guard and how far they chase are mine (s): beetles 8 m and give up at 20 m,
  // a hornet nest 8 m and chases 60 m, vipers wait hidden until a unit is 3 m off, scorpions roam 25 m round their spot, and
  // griffins and minotaurs, once disturbed within 20 m and 15 m, hunt to the death.
  sp({
    name: 'Giant beetle', model: 'giant_beetle', nature: Nature.Territorial, hp: 60, armourBp: 4000, damage: 4, attackSteps: ds(15), reach: m(15), walk: mps(10), run: mps(30), halfWidth: m(6), height: m(6),
    meat: 0, bands: [F], perCell: 1, groupMin: 1, groupMax: 2, guard: m(80), chase: m(200), loot: [{ res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  }),
  sp({
    name: 'Giant hornet', model: 'giant_hornet', nature: Nature.Nest, hp: 10, damage: 4, attackSteps: ds(15), reach: m(10), walk: mps(20), run: mps(60), halfWidth: m(3), height: m(3),
    meat: 0, bands: [D], perCell: 1, groupMin: 3, groupMax: 5, guard: m(80), chase: m(600), loot: [{ res: Res.Venom, min: 1, max: 1, chancePm: 200 }],
  }),
  sp({
    name: 'Viper', model: 'viper', nature: Nature.Territorial, hp: 40, damage: 5, attackSteps: ds(12), reach: m(15), walk: mps(8), run: mps(15), halfWidth: m(2), height: m(2),
    meat: 0, extra: [[Res.Hides, 1]], bands: [B], perCell: 2, groupMin: 1, groupMax: 1, guard: m(30), chase: m(100), venom: 20, loot: [{ res: Res.Venom, min: 1, max: 1, chancePm: 300 }],
  }),
  sp({
    name: 'Giant scorpion', model: 'giant_scorpion', nature: Nature.Territorial, hp: 40, armourBp: 3500, damage: 6, attackSteps: ds(12), reach: m(15), walk: mps(12), run: mps(30), halfWidth: m(6), height: m(5),
    meat: 0, bands: [B], perCell: 1, groupMin: 1, groupMax: 2, guard: m(80), chase: m(250), roam: m(250), venom: 25,
    loot: [{ res: Res.Venom, min: 1, max: 1, chancePm: 400 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  }),
  sp({
    name: 'Griffin', model: 'griffin', nature: Nature.Hunter, hp: 300, armourBp: 2000, damage: 20, attackSteps: ds(15), reach: m(20), walk: mps(15), run: mps(40), halfWidth: m(10), height: m(18),
    meat: 4, extra: [[Res.Feathers, 6]], bands: [B, X], perCell: 1, groupMin: 1, groupMax: 1, guard: m(200), loot: [{ res: Res.Gold, min: 1, max: 1, chancePm: 50 }],
  }),
  sp({
    name: 'Minotaur', model: 'minotaur', nature: Nature.Hunter, hp: 250, armourBp: 3000, damage: 30, attackSteps: ds(20), reach: m(25), walk: mps(15), run: mps(35), halfWidth: m(8), height: m(26),
    meat: 5, extra: [[Res.Hides, 3]], bands: [X], perCell: 1, groupMin: 1, groupMax: 1, guard: m(150), loot: [{ res: Res.Gold, min: 2, max: 2, chancePm: 100 }],
  }),
  // Wild birds (s): geese in flocks by Heartland water, pheasants in the Fringe woods; hunted with N like deer, for meat and feathers.
  sp({ name: 'Wild goose', model: 'wild_goose', nature: Nature.Shy, hp: 15, damage: 0, attackSteps: ds(10), reach: m(5), walk: mps(10), run: mps(50), halfWidth: m(2), height: m(6), meat: 1, extra: [[Res.Feathers, 3]], bands: [H], perCell: 1, groupMin: 3, groupMax: 5 }),
  sp({ name: 'Pheasant', model: 'pheasant', nature: Nature.Shy, hp: 10, damage: 0, attackSteps: ds(10), reach: m(5), walk: mps(10), run: mps(50), halfWidth: m(2), height: m(4), meat: 1, extra: [[Res.Feathers, 2]], bands: [F], perCell: 2, groupMin: 1, groupMax: 2 }),
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
  return id === Species.Hare || id === Species.Deer || id === Species.Boar || id === Species.GiantCrab || id === Species.WildGoose || id === Species.Pheasant;
}

/** Pairs breed every 10 days and the young grow up in 2 (doc). */
export const BREED_STEPS = 10 * CYCLE_STEPS;
export const YOUNG_STEPS = 2 * CYCLE_STEPS;
/** Bears: at most 60 in the whole world (doc). */
export const BEAR_CAP = 60;
