// Equipment (Items; Equipment; Table 2c worker tools, 2d melee weapons, 2e
// ranged weapons and munitions, Table 3 armour and shields): the rows the
// Big House makes in milestone 3. Each item is one entry of a player's
// equipment stock; a unit wears or holds at most one item per slot.

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { Tool } from '../world/props.ts';

export const Item = {
  None: 0,
  ToolsHardwood: 1,
  ToolsFlint: 2,
  Club: 3,
  SpearHardwood: 4,
  AxeFlint: 5,
  SpearFlint: 6,
  Sling: 7,
  JavelinsFlint: 8,
  Bow: 9,
  ArrowsFlint: 10,
  ArrowsFire: 11,
  Boots: 12,
  ShieldWicker: 13,
  ShieldWood: 14,
  HandTorch: 15,
} as const;
export type Item = (typeof Item)[keyof typeof Item];

/** Where an item goes on a unit. */
export const Slot = {
  Tool: 0,
  /** The melee weapon in hand. */
  Weapon: 1,
  /** A one-handed weapon kept for when an enemy gets inside a polearm's minimum range. */
  Backup: 2,
  Ranged: 3,
  Shield: 4,
  Boots: 5,
  /** Arrows in the quiver (javelins and sling stones are the ranged weapon's own). */
  Ammo: 6,
  Torch: 7,
} as const;
export type Slot = (typeof Slot)[keyof typeof Slot];
export const SLOT_COUNT = 8;
export const SLOT_NAMES = ['Tools', 'Weapon', 'Backup weapon', 'Ranged weapon', 'Shield', 'Boots', 'Arrows', 'Torch'] as const;

/** How a melee weapon hits (Combat, Melee): a stab hits one target, an arc everything in front. */
export const Hit = { Stab: 0, Arc: 1 } as const;
export type Hit = (typeof Hit)[keyof typeof Hit];

/** The flying things (How ranged attacks hit): each has its speed and drop. */
export const Shot = {
  Arrow: 0,
  SlingStone: 1,
  Javelin: 2,
  /** Skeleton archers' old arrows. */
  BoneArrow: 3,
  /** A goblin slinger's stone. */
  GoblinStone: 4,
  /** A giant spider's web spit. */
  Web: 5,
  FireArrow: 6,
} as const;
export type Shot = (typeof Shot)[keyof typeof Shot];

export interface MeleeStats {
  damage: number;
  /** Time between attacks, steps. */
  attackSteps: number;
  /** Reach and minimum range, wu (Table 1, 2d). */
  reach: number;
  min: number;
  hit: Hit;
  blunt: boolean;
  /** One-handed weapons pair with a shield and hit a flying attacker only while it swoops. */
  oneHanded: boolean;
}

export interface RangedStats {
  damage: number;
  attackSteps: number;
  range: number;
  /** Largest miss as a share of the distance, bp (Table 2e "spread"). */
  spreadBp: number;
  shot: Shot;
  blunt: boolean;
  /** Needs the Archery training (Experience and training: specialist skills). */
  needsArchery: boolean;
  /** Shots a full load holds: a quiver of 24 arrows, a bundle of 5 javelins, 50 sling stones per stone. */
  load: number;
  /** What a load is made of: arrows from the stock, the javelins themselves, or stone from the pool. */
  munition: 'arrows' | 'self' | 'stone';
}

export interface ItemSpec {
  id: Item;
  name: string;
  slot: Slot;
  /** Material tier for Equip Best (hardwood 1, flint 2, then copper, bronze...). */
  tier: number;
  /** Table 12 weight in tenths of a pound. */
  weightTenthsLb: number;
  /** Ways to make it; the first the pool can pay is used ("1 leather or 1 flax"). */
  recipes: readonly Cost[];
  /** Items that go into it from the equipment stock (fire arrows take arrows). */
  itemInputs?: ReadonlyArray<readonly [Item, number]>;
  /** How many one batch makes: 10 arrows, a bundle of 5 javelins is one item. */
  makes: number;
  /** Make time at the Big House, steps. */
  steps: number;
  /** Research it needs, or 0. */
  research: number;
  /** The catalogue model it shows as on the unit (Seeing equipment). */
  model: string;
  /** Tools: the tier of tool it is (props.ts Tool). */
  tool?: Tool;
  melee?: MeleeStats;
  ranged?: RangedStats;
  /** Shields: projectile block, bp (Table 3). */
  blockBp?: number;
  /** Armour reduction, bp (Table 3: boots 3%). */
  armourBp?: number;
  /** A carried hand torch burns this long once taken (Table 18: one day). */
  burnSteps?: number;
  /** Fire arrows: extra damage and a burn on wood (Table 2e). */
  fire?: { extra: number; perSecond: number; seconds: number };
  /** Grid slot in the K craft menu, 0-based. */
  craftSlot: number;
}

/** Research steps (Table 2a) that milestone 3 has: bit numbers in a player's research mask. */
export const Research = {
  None: 0,
  FlintTools: 1,
} as const;
export type Research = (typeof Research)[keyof typeof Research];

export interface ResearchSpec {
  id: Research;
  name: string;
  key: string;
  cost: Cost;
  steps: number;
  opens: string;
}

export const RESEARCH: readonly ResearchSpec[] = [
  { id: Research.None, name: '', key: '', cost: [], steps: 0, opens: '' },
  {
    id: Research.FlintTools,
    name: 'Flint tools',
    key: 'F',
    cost: [[Res.Flint, 10], [Res.SoftwoodLumber, 20]],
    steps: 60 * STEPS_PER_SECOND,
    opens: 'The flint tier: flint tools, the flint axe and spear, bows and flint arrows, slings and flint javelins.',
  },
];

export function hasResearch(mask: number, r: Research): boolean {
  return r === Research.None || (mask & (1 << r)) !== 0;
}

/** Tenths of a second as steps. */
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
/** Tenths of a pound, as stored. */
const lb10 = (tenths: number): number => tenths;

const ST = Res.Sticks;
const FL = Res.Flint;

export const ITEMS: readonly ItemSpec[] = [
  { id: Item.None, name: 'Nothing', slot: Slot.Tool, tier: 0, weightTenthsLb: 0, recipes: [], makes: 0, steps: 0, research: 0, model: '', craftSlot: -1 },
  {
    id: Item.ToolsHardwood, name: 'Hardwood tools', slot: Slot.Tool, tier: 1, weightTenthsLb: lb10(30), recipes: [[[ST, 3]]], makes: 1, steps: ds(100), research: 0,
    model: 'axe_hardwood', tool: Tool.Hardwood, craftSlot: 0,
  },
  {
    id: Item.ToolsFlint, name: 'Flint tools', slot: Slot.Tool, tier: 2, weightTenthsLb: lb10(30), recipes: [[[ST, 2], [FL, 1]]], makes: 1, steps: ds(100), research: Research.FlintTools,
    model: 'axe_flint', tool: Tool.Flint, craftSlot: 1,
  },
  {
    id: Item.Club, name: 'Hardwood club', slot: Slot.Weapon, tier: 1, weightTenthsLb: lb10(20), recipes: [[[ST, 3]]], makes: 1, steps: ds(100), research: 0, model: 'club', craftSlot: 5,
    melee: { damage: 8, attackSteps: ds(13), reach: cm(120), min: 0, hit: Hit.Arc, blunt: true, oneHanded: true },
  },
  {
    id: Item.SpearHardwood, name: 'Hardwood spear', slot: Slot.Weapon, tier: 1, weightTenthsLb: lb10(30), recipes: [[[ST, 4]]], makes: 1, steps: ds(100), research: 0, model: 'spear_hardwood', craftSlot: 6,
    melee: { damage: 9, attackSteps: ds(14), reach: cm(250), min: cm(100), hit: Hit.Stab, blunt: false, oneHanded: false },
  },
  {
    id: Item.AxeFlint, name: 'Flint axe', slot: Slot.Weapon, tier: 2, weightTenthsLb: lb10(30), recipes: [[[ST, 2], [FL, 1]]], makes: 1, steps: ds(100), research: Research.FlintTools, model: 'axe_war_flint', craftSlot: 7,
    melee: { damage: 10, attackSteps: ds(13), reach: cm(120), min: 0, hit: Hit.Arc, blunt: false, oneHanded: true },
  },
  {
    id: Item.SpearFlint, name: 'Flint-tipped spear', slot: Slot.Weapon, tier: 2, weightTenthsLb: lb10(35), recipes: [[[ST, 3], [FL, 1]]], makes: 1, steps: ds(100), research: Research.FlintTools, model: 'spear_flint', craftSlot: 8,
    melee: { damage: 12, attackSteps: ds(14), reach: cm(250), min: cm(100), hit: Hit.Stab, blunt: false, oneHanded: false },
  },
  {
    id: Item.Sling, name: 'Sling', slot: Slot.Ranged, tier: 1, weightTenthsLb: lb10(5), recipes: [[[Res.Leather, 1]], [[Res.Flax, 1]]], makes: 1, steps: ds(100), research: Research.FlintTools, model: 'sling', craftSlot: 10,
    ranged: { damage: 8, attackSteps: ds(20), range: cm(2000), spreadBp: 800, shot: Shot.SlingStone, blunt: true, needsArchery: false, load: 50, munition: 'stone' },
  },
  {
    id: Item.JavelinsFlint, name: 'Flint javelins (bundle of 5)', slot: Slot.Ranged, tier: 2, weightTenthsLb: lb10(100), recipes: [[[ST, 5], [FL, 1]]], makes: 1, steps: ds(150), research: Research.FlintTools, model: 'javelin_flint', craftSlot: 11,
    ranged: { damage: 14, attackSteps: ds(25), range: cm(1500), spreadBp: 500, shot: Shot.Javelin, blunt: false, needsArchery: false, load: 5, munition: 'self' },
  },
  {
    id: Item.Bow, name: 'Bow and quiver', slot: Slot.Ranged, tier: 2, weightTenthsLb: lb10(30),
    recipes: [[[Res.SoftwoodLumber, 2], [Res.Flax, 1]], [[Res.HardwoodLumber, 2], [Res.Flax, 1]], [[Res.SoftwoodLumber, 2], [Res.SpiderSilk, 1]], [[Res.HardwoodLumber, 2], [Res.SpiderSilk, 1]], [[Res.SoftwoodLumber, 2], [Res.Rope, 1]]],
    makes: 1, steps: ds(200), research: Research.FlintTools, model: 'bow', craftSlot: 12,
    ranged: { damage: 10, attackSteps: ds(20), range: cm(2500), spreadBp: 600, shot: Shot.Arrow, blunt: false, needsArchery: true, load: 24, munition: 'arrows' },
  },
  {
    id: Item.ArrowsFlint, name: 'Flint arrows', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[Res.SoftwoodLumber, 1], [Res.Feathers, 1], [FL, 1]]], makes: 10, steps: ds(150), research: Research.FlintTools, model: 'arrow', craftSlot: 13,
  },
  {
    id: Item.ArrowsFire, name: 'Fire arrows', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[Res.Resin, 1]]], itemInputs: [[Item.ArrowsFlint, 10]], makes: 10, steps: ds(100), research: Research.FlintTools, model: 'arrow_bundle', craftSlot: 14,
    fire: { extra: 5, perSecond: 4, seconds: 5 },
  },
  {
    id: Item.Boots, name: 'Boots', slot: Slot.Boots, tier: 1, weightTenthsLb: lb10(15), recipes: [[[Res.Leather, 1]], [[Res.Flax, 1]]], makes: 1, steps: ds(100), research: 0, model: 'boots', armourBp: 300, craftSlot: 2,
  },
  {
    id: Item.ShieldWicker, name: 'Wicker shield', slot: Slot.Shield, tier: 1, weightTenthsLb: lb10(50), recipes: [[[ST, 6], [Res.Hides, 1]], [[ST, 6], [Res.Leather, 1]]], makes: 1, steps: ds(150), research: 0, model: 'shield_wicker', blockBp: 1000, craftSlot: 3,
  },
  {
    id: Item.ShieldWood, name: 'Wood shield', slot: Slot.Shield, tier: 2, weightTenthsLb: lb10(80), recipes: [[[Res.Planks, 3], [Res.Leather, 1]]], makes: 1, steps: ds(200), research: 0, model: 'shield_wood', blockBp: 1500, craftSlot: 4,
  },
  {
    id: Item.HandTorch, name: 'Hand torch', slot: Slot.Torch, tier: 1, weightTenthsLb: lb10(10), recipes: [[[Res.SoftwoodLumber, 1], [Res.Resin, 1]]], makes: 1, steps: ds(50), research: 0, model: 'torch_hand', burnSteps: CYCLE_STEPS, craftSlot: 9,
  },
];

export const ITEM_COUNT = ITEMS.length;

export function itemSpec(id: number): ItemSpec {
  const sp = ITEMS[id];
  if (!sp) throw new Error(`unknown item ${id}`);
  return sp;
}

/** The first recipe the pool can pay, or null. */
export function affordableRecipe(spec: ItemSpec, pool: Int32Array): Cost | null {
  for (const r of spec.recipes) if (r.every(([res, n]) => pool[res]! >= n)) return r;
  return null;
}

/** The item a worker's tool tier is made from (Table 2c), or None. */
export function toolItem(tool: number): Item {
  if (tool === Tool.Hardwood) return Item.ToolsHardwood;
  if (tool === Tool.Flint) return Item.ToolsFlint;
  return Item.None;
}

/** The punch of a unit with nothing in hand, and a worker's tool as a weapon (Table 1: hardwood 4, flint 5). */
export function toolMelee(tool: number): MeleeStats {
  const damage = tool >= Tool.Flint ? 5 : tool >= Tool.Hardwood ? 4 : 2;
  return { damage, attackSteps: ds(15), reach: cm(120), min: 0, hit: Hit.Stab, blunt: false, oneHanded: true };
}

/** Horizontal speed (wu per step) and whether it arcs, for each flying thing (s). */
export const SHOTS: ReadonlyArray<{ speed: number; arcs: boolean; name: string; model: string; vsWalls: number }> = [
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'arrow', model: 'arrow_flight', vsWalls: 0 },
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: true, name: 'sling stone', model: 'sling_stone', vsWalls: 0 },
  { speed: floorDiv(cm(1500), STEPS_PER_SECOND), arcs: true, name: 'javelin', model: 'javelin_flint', vsWalls: 1 },
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'arrow', model: 'arrow_flight', vsWalls: 0 },
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: true, name: 'sling stone', model: 'sling_stone', vsWalls: 0 },
  { speed: floorDiv(cm(1400), STEPS_PER_SECOND), arcs: true, name: 'web', model: 'web_glob', vsWalls: 0 },
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'fire arrow', model: 'arrow_fire', vsWalls: 0 },
];
