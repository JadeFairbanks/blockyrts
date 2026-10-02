// Equipment (Items; Equipment; Table 2c worker tools, 2d melee weapons, 2e
// ranged weapons and munitions, Table 3 armour and shields): the rows the
// Big House makes in milestone 3. Each item is one entry of a player's
// equipment stock; a unit wears or holds at most one item per slot.

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { Tool } from '../world/props.ts';
import { BuildingKind } from '../buildings/data.ts';

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
  // Milestone 4: the forge, tannery, herbalist and workshop rows.
  ToolsCopper: 16,
  ToolsBronze: 17,
  ToolsBloom: 18,
  ToolsWrought: 19,
  ToolsRefined: 20,
  ToolsSteel: 21,
  ToolsHQSteel: 22,
  FishingRod: 23,
  FishingNet: 24,
  ProspectingHammer: 25,
  HandCart: 26,
  OxCart: 27,
  AxeCopper: 28,
  DaggerCopper: 29,
  SwordBronze: 30,
  SpearBronze: 31,
  JavelinsBronze: 32,
  SwordBloom: 33,
  SwordWrought: 34,
  SwordRefined: 35,
  MaceBloom: 36,
  MaceWrought: 37,
  MaceRefined: 38,
  HalberdBloom: 39,
  HalberdWrought: 40,
  HalberdRefined: 41,
  SwordSteel: 42,
  PikeSteel: 43,
  HalberdSteel: 44,
  SwordHQ: 45,
  PikeHQ: 46,
  HalberdHQ: 47,
  Crossbow: 48,
  CrossbowSteel: 49,
  ArrowsBronze: 50,
  ArrowsBloom: 51,
  ArrowsWrought: 52,
  ArrowsRefined: 53,
  ArrowsSteel: 54,
  ArrowsHQ: 55,
  ArrowsPoison: 56,
  BoltsFlint: 57,
  BoltsBronze: 58,
  BoltsBloom: 59,
  BoltsWrought: 60,
  BoltsRefined: 61,
  BoltsSteel: 62,
  BoltsHQ: 63,
  BoltsPoison: 64,
  BoltCase: 65,
  ArmourLeather: 66,
  ArmourBronzeScale: 67,
  MailBloom: 68,
  MailWrought: 69,
  MailRefined: 70,
  PlateSteel: 71,
  PlateHQ: 72,
  CapLeather: 73,
  HelmetBronze: 74,
  HelmetNasal: 75,
  SalletSteel: 76,
  ShieldBronze: 77,
  ShieldIronKite: 78,
  ShieldSteelHeater: 79,
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
  /** Body armour (Table 3). */
  Armour: 8,
  Helmet: 9,
  /** A bolt case: a crossbow's bolts are carried in one (Table 2e). */
  Case: 10,
  /** A worker's kit: a fishing rod or net, a prospecting hammer, or a cart. */
  Kit: 11,
} as const;
export type Slot = (typeof Slot)[keyof typeof Slot];
export const SLOT_COUNT = 12;
export const SLOT_NAMES = ['Tools', 'Weapon', 'Backup weapon', 'Ranged weapon', 'Shield', 'Boots', 'Arrows', 'Torch', 'Armour', 'Helmet', 'Bolt case', 'Kit'] as const;

/** Specialist skills (Experience and training: bit per skill in a unit's skills). */
export const Skill = { Archery: 1, Crossbow: 2 } as const;

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
  /** A crossbow bolt. */
  Bolt: 7,
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
  /** The specialist skill it needs (Skill bit), or 0 (Experience and training: specialist skills). */
  skill: number;
  /** Shots a full load holds: a quiver of 24 arrows, a case of 20 bolts, a bundle of 5 javelins, 50 sling stones per stone. */
  load: number;
  /** What a load is made of: arrows or bolts from the stock, the javelins themselves, or stone from the pool. */
  munition: 'arrows' | 'bolts' | 'self' | 'stone';
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
  /** Research it needs, or 0; and a second one (a steel halberd needs Halberds and Steel). */
  research: number;
  research2?: number;
  /** Where it is made: the Big House, or a building kind and the level it needs. Boots are made at either of two. */
  madeAt: ReadonlyArray<readonly [number, number]>;
  /** A workshop of at least this tier must stand somewhere in the town (crossbows: a Great Workshop). */
  needsWorkshop?: number;
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
  /** Arrows and bolts: the tip's damage bonus (Table 2e), and a poison coat's damage over 5 s. */
  tip?: number;
  poison?: number;
  /** Munitions: which weapons shoot it. */
  ammoFor?: 'arrows' | 'bolts';
  /** Body armour keeps a unit from swimming (Water: Wading and swimming). */
  heavy?: boolean;
  /** A carried hand torch burns this long once taken (Table 18: one day). */
  burnSteps?: number;
  /** Fire arrows: extra damage and a burn on wood (Table 2e). */
  fire?: { extra: number; perSecond: number; seconds: number };
  /** Order in the building's craft menu (K), 0-based; -1 for items no building makes. */
  craftSlot: number;
}

/** Research steps (Table 2a): bit numbers in a player's research mask. */
export const Research = {
  None: 0,
  FlintTools: 1,
  Bronze: 2,
  DeepMining1: 3,
  Halberds: 4,
  Crossbows: 5,
  Hexcraft: 6,
  DeepMining2: 7,
  SiegeEngines: 8,
  Steel: 9,
  HQSteel: 10,
  SteelCrossbow: 11,
  DeepMining3: 12,
  Gunpowder: 13,
  Muskets: 14,
  Cannons: 15,
} as const;
export type Research = (typeof Research)[keyof typeof Research];

/** Things a player has made at least once, for research that needs one first (a bit each in PlayerState.made). */
export const Made = { TinIngot: 1, PigIron: 2 } as const;

export interface ResearchSpec {
  id: Research;
  name: string;
  key: string;
  cost: Cost;
  steps: number;
  opens: string;
  /** What must come first: a finished forge of a level, another research, a thing made once. */
  forge?: number;
  after?: Research;
  made?: number;
  /** Researched elsewhere (Hexcraft at the Magi Sanctum) or in a later milestone: the reason it is greyed. */
  later?: string;
}

const M6R = 'Researched at the Magi Sanctum (milestone 6).';
const M8R = 'Comes with siege engines and gunpowder (milestone 8).';
const sec = (n: number): number => n * STEPS_PER_SECOND;

export const RESEARCH: readonly ResearchSpec[] = [
  { id: Research.None, name: '', key: '', cost: [], steps: 0, opens: '' },
  {
    id: Research.FlintTools, name: 'Flint tools', key: 'F', cost: [[Res.Flint, 10], [Res.SoftwoodLumber, 20]], steps: sec(60),
    opens: 'The flint tier: flint tools, the flint axe and spear, bows and flint arrows, slings and flint javelins.',
  },
  {
    id: Research.Bronze, name: 'Bronze', key: 'B', cost: [[Res.CopperIngot, 10], [Res.TinIngot, 2]], steps: sec(75), forge: 1, made: Made.TinIngot,
    opens: 'The bronze tier: bronze ingots, tools, weapons and armour, and mining bog iron and iron rock.',
  },
  {
    id: Research.DeepMining1, name: 'Deep Mining I', key: 'D', cost: [[Res.BronzeIngot, 20], [Res.Stone, 50]], steps: sec(90), after: Research.Bronze,
    opens: 'Mineshaft tier 1.',
  },
  {
    id: Research.Halberds, name: 'Halberds', key: 'H', cost: [[Res.BloomIron, 10]], steps: sec(60), forge: 2,
    opens: 'The iron halberd (the steel halberd once Steel is done).',
  },
  {
    id: Research.Crossbows, name: 'Crossbows', key: 'C', cost: [[Res.WroughtIron, 10], [Res.HardwoodLumber, 20]], steps: sec(90), forge: 3,
    opens: 'The crossbow, bolts and the bolt case, and crossbow training at the Barracks.',
  },
  {
    id: Research.Hexcraft, name: 'Hexcraft', key: 'X', cost: [[Res.Hexstone, 6], [Res.Herbs, 20]], steps: sec(90), later: M6R,
    opens: 'The Warding and Counterspell spells.',
  },
  {
    id: Research.DeepMining2, name: 'Deep Mining II', key: 'E', cost: [[Res.WroughtIron, 30], [Res.Stone, 100], [Res.Silver, 3]], steps: sec(120), forge: 3,
    opens: 'Mineshaft tier 2.',
  },
  {
    id: Research.SiegeEngines, name: 'Siege engines', key: 'G', cost: [[Res.HardwoodLumber, 40], [Res.Rope, 10], [Res.BronzeIngot, 10]], steps: sec(120), later: M8R,
    opens: 'The catapult; the ballista with a Manufactory and Forge level 3.',
  },
  {
    id: Research.Steel, name: 'Steel', key: 'S', cost: [[Res.PigIron, 10], [Res.Charcoal, 20]], steps: sec(150), forge: 4, made: Made.PigIron,
    opens: 'The steel tier: steel ingots, tools, weapons and armour.',
  },
  {
    id: Research.HQSteel, name: 'High-quality steel', key: 'Q', cost: [[Res.SteelIngot, 5], [Res.Charcoal, 50]], steps: sec(210), after: Research.Steel,
    opens: 'High-quality steel, and its tools, weapons and armour.',
  },
  {
    id: Research.SteelCrossbow, name: 'Steel crossbow', key: 'R', cost: [[Res.SteelIngot, 10]], steps: sec(90), after: Research.Steel,
    opens: 'The steel crossbow.',
  },
  {
    id: Research.DeepMining3, name: 'Deep Mining III', key: 'M', cost: [[Res.SteelIngot, 30], [Res.Stone, 200], [Res.Gold, 3], [Res.Silver, 3]], steps: sec(180), after: Research.Steel,
    opens: 'Mineshaft tier 3.',
  },
  {
    id: Research.Gunpowder, name: 'Gunpowder', key: 'P', cost: [[Res.Saltpetre, 10], [Res.Sulphur, 5], [Res.Charcoal, 10]], steps: sec(150), later: M8R,
    opens: 'Gunpowder.',
  },
  {
    id: Research.Muskets, name: 'Muskets', key: 'U', cost: [[Res.SteelIngot, 10], [Res.Gunpowder, 10]], steps: sec(180), later: M8R,
    opens: 'The flintlock musket, lead shot, the powder horn and the shot pouch.',
  },
  {
    id: Research.Cannons, name: 'Cannons', key: 'N', cost: [[Res.BronzeIngot, 20], [Res.Gunpowder, 10], [Res.HardwoodLumber, 20]], steps: sec(210), later: M8R,
    opens: 'The bronze cannon and cannonballs; the iron cannon once Forge level 3 exists.',
  },
];

export function hasResearch(mask: number, r: Research): boolean {
  return r === Research.None || (mask & (1 << r)) !== 0;
}

/** Whether a player's research covers everything an item needs. */
export function itemResearched(mask: number, spec: ItemSpec): boolean {
  return hasResearch(mask, spec.research as Research) && hasResearch(mask, (spec.research2 ?? 0) as Research);
}

/** The first research an item still needs, or None. */
export function missingResearch(mask: number, spec: ItemSpec): Research {
  if (!hasResearch(mask, spec.research as Research)) return spec.research as Research;
  if (!hasResearch(mask, (spec.research2 ?? 0) as Research)) return (spec.research2 ?? 0) as Research;
  return Research.None;
}

/** Tenths of a second as steps. */
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);

const ST = Res.Sticks;
const FL = Res.Flint;
const HW = Res.HardwoodLumber;
const SW = Res.SoftwoodLumber;
const LE = Res.Leather;
const FX = Res.Flax;
const FE = Res.Feathers;
const CU = Res.CopperIngot;
const BZ = Res.BronzeIngot;
const BLOOM = Res.BloomIron;
const WROUGHT = Res.WroughtIron;
const REFINED = Res.RefinedIron;
const STEEL = Res.SteelIngot;
const HQ = Res.HighQualitySteel;

/** Where things are made (Items: "Made at"). */
const BASE = [[BuildingKind.MainBase, 1]] as const;
const forge = (level: number): ReadonlyArray<readonly [number, number]> => [[BuildingKind.Forge, level]];
const TANNERY = [[BuildingKind.Tannery, 1]] as const;
const HERBALIST = [[BuildingKind.HerbalistHut, 1]] as const;
const workshop = (tier: number): ReadonlyArray<readonly [number, number]> => [[BuildingKind.Workshop, tier]];

/** The same recipe with leather, or flax instead (Table 3: "Flax instead of leather"). */
const leatherOrFlax = (rest: Cost, n = 1): Cost[] => [[...rest, [LE, n]], [...rest, [FX, n]]];

type Base = Pick<ItemSpec, 'id' | 'name' | 'slot' | 'tier' | 'weightTenthsLb' | 'recipes' | 'makes' | 'steps' | 'research' | 'model' | 'madeAt' | 'craftSlot'>;
const it = (o: Base & Partial<ItemSpec>): ItemSpec => o;

/** One melee weapon row of Table 2d. */
function melee(id: Item, name: string, tier: number, lb10s: number, recipes: Cost[], at: ReadonlyArray<readonly [number, number]>, secs10: number, research: number, model: string, slot: number, m: MeleeStats, research2?: number): ItemSpec {
  return it({ id, name, slot: Slot.Weapon, tier, weightTenthsLb: lb10s, recipes, makes: 1, steps: ds(secs10), research, model, madeAt: at, craftSlot: slot, melee: m, ...(research2 ? { research2 } : {}) });
}
const sword = (damage: number, reachCm = 120): MeleeStats => ({ damage, attackSteps: ds(12), reach: cm(reachCm), min: 0, hit: Hit.Arc, blunt: false, oneHanded: true });
const mace = (damage: number): MeleeStats => ({ damage, attackSteps: ds(14), reach: cm(120), min: 0, hit: Hit.Arc, blunt: true, oneHanded: true });
const halberd = (damage: number): MeleeStats => ({ damage, attackSteps: ds(16), reach: cm(250), min: cm(80), hit: Hit.Arc, blunt: false, oneHanded: false });
const pike = (damage: number): MeleeStats => ({ damage, attackSteps: ds(16), reach: cm(350), min: cm(150), hit: Hit.Stab, blunt: false, oneHanded: false });

/** A worker tool set of Table 2c. */
function tools(id: Item, name: string, tier: number, tool: Tool, lb10s: number, ingot: Res, at: ReadonlyArray<readonly [number, number]>, secs10: number, research: number, model: string, slot: number): ItemSpec {
  return it({ id, name, slot: Slot.Tool, tier, weightTenthsLb: lb10s, recipes: [[[ingot, 1], [HW, 1]]], makes: 1, steps: ds(secs10), research, model, tool, madeAt: at, craftSlot: slot });
}

/** Arrows or bolts tipped with a metal (Table 2e): 1 ingot tips 20. */
function tipped(id: Item, name: string, tier: number, tip: number, ingot: Res, bolts: boolean, at: ReadonlyArray<readonly [number, number]>, research: number, model: string, slot: number, research2?: number): ItemSpec {
  const shaft = bolts ? HW : SW;
  return it({
    id, name, slot: Slot.Ammo, tier, weightTenthsLb: ingot === BZ ? 2 : 1, recipes: [[[shaft, 2], [FE, 2], [ingot, 1]]], makes: 20, steps: ds(150), research, model, madeAt: at, craftSlot: slot,
    tip, ammoFor: bolts ? 'bolts' : 'arrows', ...(research2 ? { research2 } : {}),
  });
}

/** A piece of armour or a helmet (Table 3). */
function armour(id: Item, name: string, slot: number, tier: number, bp: number, lb10s: number, recipes: Cost[], at: ReadonlyArray<readonly [number, number]>, secs10: number, research: number, model: string, menu: number): ItemSpec {
  return it({ id, name, slot: slot as Slot, tier, weightTenthsLb: lb10s, recipes, makes: 1, steps: ds(secs10), research, model, madeAt: at, craftSlot: menu, armourBp: bp, heavy: slot === Slot.Armour });
}

const R = Research;

export const ITEMS: readonly ItemSpec[] = [
  it({ id: Item.None, name: 'Nothing', slot: Slot.Tool, tier: 0, weightTenthsLb: 0, recipes: [], makes: 0, steps: 0, research: 0, model: '', madeAt: [], craftSlot: -1 }),
  tools(Item.ToolsHardwood, 'Hardwood tools', 1, Tool.Hardwood, 30, ST, BASE, 100, 0, 'axe_hardwood', 0),
  tools(Item.ToolsFlint, 'Flint tools', 2, Tool.Flint, 30, FL, BASE, 100, R.FlintTools, 'axe_flint', 1),
  melee(Item.Club, 'Hardwood club', 1, 20, [[[ST, 3]]], BASE, 100, 0, 'club', 5, { damage: 8, attackSteps: ds(13), reach: cm(120), min: 0, hit: Hit.Arc, blunt: true, oneHanded: true }),
  melee(Item.SpearHardwood, 'Hardwood spear', 1, 30, [[[ST, 4]]], BASE, 100, 0, 'spear_hardwood', 6, { damage: 9, attackSteps: ds(14), reach: cm(250), min: cm(100), hit: Hit.Stab, blunt: false, oneHanded: false }),
  melee(Item.AxeFlint, 'Flint axe', 2, 30, [[[ST, 2], [FL, 1]]], BASE, 100, R.FlintTools, 'axe_war_flint', 7, { damage: 10, attackSteps: ds(13), reach: cm(120), min: 0, hit: Hit.Arc, blunt: false, oneHanded: true }),
  melee(Item.SpearFlint, 'Flint-tipped spear', 2, 35, [[[ST, 3], [FL, 1]]], BASE, 100, R.FlintTools, 'spear_flint', 8, { damage: 12, attackSteps: ds(14), reach: cm(250), min: cm(100), hit: Hit.Stab, blunt: false, oneHanded: false }),
  it({
    id: Item.Sling, name: 'Sling', slot: Slot.Ranged, tier: 1, weightTenthsLb: 5, recipes: [[[LE, 1]], [[FX, 1]]], makes: 1, steps: ds(100), research: R.FlintTools, model: 'sling', madeAt: BASE, craftSlot: 10,
    ranged: { damage: 8, attackSteps: ds(20), range: cm(2000), spreadBp: 800, shot: Shot.SlingStone, blunt: true, skill: 0, load: 50, munition: 'stone' },
  }),
  it({
    id: Item.JavelinsFlint, name: 'Flint javelins (bundle of 5)', slot: Slot.Ranged, tier: 2, weightTenthsLb: 100, recipes: [[[ST, 5], [FL, 1]]], makes: 1, steps: ds(150), research: R.FlintTools, model: 'javelin_flint', madeAt: BASE, craftSlot: 11,
    ranged: { damage: 14, attackSteps: ds(25), range: cm(1500), spreadBp: 500, shot: Shot.Javelin, blunt: false, skill: 0, load: 5, munition: 'self' },
  }),
  it({
    id: Item.Bow, name: 'Bow and quiver', slot: Slot.Ranged, tier: 2, weightTenthsLb: 30,
    recipes: [[[SW, 2], [FX, 1]], [[HW, 2], [FX, 1]], [[SW, 2], [Res.SpiderSilk, 1]], [[HW, 2], [Res.SpiderSilk, 1]], [[SW, 2], [Res.Rope, 1]]],
    makes: 1, steps: ds(200), research: R.FlintTools, model: 'bow', madeAt: BASE, craftSlot: 12,
    ranged: { damage: 10, attackSteps: ds(20), range: cm(2500), spreadBp: 600, shot: Shot.Arrow, blunt: false, skill: Skill.Archery, load: 24, munition: 'arrows' },
  }),
  it({ id: Item.ArrowsFlint, name: 'Flint arrows', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[SW, 1], [FE, 1], [FL, 1]]], makes: 10, steps: ds(150), research: R.FlintTools, model: 'arrow', madeAt: BASE, craftSlot: 13, tip: 0, ammoFor: 'arrows' }),
  it({
    id: Item.ArrowsFire, name: 'Fire arrows', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[Res.Resin, 1]]], itemInputs: [[Item.ArrowsFlint, 10]], makes: 10, steps: ds(100), research: R.FlintTools, model: 'arrow_bundle', madeAt: BASE, craftSlot: 14,
    tip: 0, ammoFor: 'arrows', fire: { extra: 5, perSecond: 4, seconds: 5 },
  }),
  it({ id: Item.Boots, name: 'Boots', slot: Slot.Boots, tier: 1, weightTenthsLb: 15, recipes: [[[LE, 1]], [[FX, 1]]], makes: 1, steps: ds(100), research: 0, model: 'boots', madeAt: [...BASE, ...TANNERY], craftSlot: 2, armourBp: 300 }),
  it({ id: Item.ShieldWicker, name: 'Wicker shield', slot: Slot.Shield, tier: 1, weightTenthsLb: 50, recipes: [[[ST, 6], [Res.Hides, 1]], [[ST, 6], [LE, 1]]], makes: 1, steps: ds(150), research: 0, model: 'shield_wicker', madeAt: BASE, craftSlot: 3, blockBp: 1000 }),
  it({ id: Item.ShieldWood, name: 'Wood shield', slot: Slot.Shield, tier: 2, weightTenthsLb: 80, recipes: [[[Res.Planks, 3], [LE, 1]]], makes: 1, steps: ds(200), research: 0, model: 'shield_wood', madeAt: BASE, craftSlot: 4, blockBp: 1500 }),
  it({ id: Item.HandTorch, name: 'Hand torch', slot: Slot.Torch, tier: 1, weightTenthsLb: 10, recipes: [[[SW, 1], [Res.Resin, 1]]], makes: 1, steps: ds(50), research: 0, model: 'torch_hand', madeAt: BASE, craftSlot: 9, burnSteps: CYCLE_STEPS }),
  // Table 2c: the forge's tool sets.
  tools(Item.ToolsCopper, 'Copper tools', 3, Tool.Copper, 40, CU, forge(1), 200, 0, 'axe', 0),
  tools(Item.ToolsBronze, 'Bronze tools', 4, Tool.Bronze, 45, BZ, forge(1), 200, R.Bronze, 'axe', 1),
  tools(Item.ToolsBloom, 'Bloom iron tools', 5, Tool.BloomIron, 40, BLOOM, forge(2), 250, 0, 'axe', 2),
  tools(Item.ToolsWrought, 'Wrought iron tools', 6, Tool.WroughtIron, 40, WROUGHT, forge(3), 250, 0, 'axe', 3),
  tools(Item.ToolsRefined, 'Refined iron tools', 7, Tool.RefinedIron, 40, REFINED, forge(4), 250, 0, 'axe', 4),
  tools(Item.ToolsSteel, 'Steel tools', 8, Tool.Steel, 40, STEEL, forge(4), 300, R.Steel, 'axe', 5),
  tools(Item.ToolsHQSteel, 'High-quality steel tools', 9, Tool.HighQualitySteel, 40, HQ, forge(4), 400, R.HQSteel, 'axe', 6),
  it({ id: Item.FishingRod, name: 'Fishing rod', slot: Slot.Kit, tier: 1, weightTenthsLb: 10, recipes: [[[SW, 2], [FX, 1]], [[SW, 2], [LE, 1]]], makes: 1, steps: ds(100), research: 0, model: 'fishing_rod', madeAt: BASE, craftSlot: 15 }),
  it({ id: Item.FishingNet, name: 'Fishing net', slot: Slot.Kit, tier: 2, weightTenthsLb: 30, recipes: [[[SW, 2], [FX, 1]], [[SW, 2], [LE, 1]]], makes: 1, steps: ds(100), research: 0, model: 'fishing_net', madeAt: BASE, craftSlot: 16 }),
  it({
    id: Item.ProspectingHammer, name: 'Prospecting hammer', slot: Slot.Kit, tier: 1, weightTenthsLb: 20,
    recipes: [CU, Res.TinIngot, BZ, BLOOM, WROUGHT, REFINED, STEEL, HQ].map((m): Cost => [[m, 1], [HW, 1]]), makes: 1, steps: ds(150), research: 0, model: 'prospecting_hammer', madeAt: forge(1), craftSlot: 7,
  }),
  it({ id: Item.HandCart, name: 'Hand cart', slot: Slot.Kit, tier: 3, weightTenthsLb: 0, recipes: [[[Res.Planks, 6], [HW, 4]]], makes: 1, steps: ds(600), research: 0, model: 'cart_hand', madeAt: workshop(2), craftSlot: 0 }),
  it({ id: Item.OxCart, name: 'Ox or horse cart', slot: Slot.Kit, tier: 4, weightTenthsLb: 0, recipes: [[[Res.Planks, 12], [HW, 8], [LE, 4], [WROUGHT, 2]]], makes: 1, steps: ds(1200), research: 0, model: 'cart_ox', madeAt: workshop(3), craftSlot: 1 }),
  // Table 2d: the forge's weapons.
  melee(Item.AxeCopper, 'Copper axe', 3, 35, [[[CU, 1], [HW, 1]]], forge(1), 200, 0, 'axe_war', 8, { damage: 12, attackSteps: ds(13), reach: cm(120), min: 0, hit: Hit.Arc, blunt: false, oneHanded: true }),
  melee(Item.DaggerCopper, 'Copper dagger', 3, 10, [[[CU, 1]]], forge(1), 150, 0, 'dagger', 9, { damage: 9, attackSteps: ds(8), reach: cm(100), min: 0, hit: Hit.Stab, blunt: false, oneHanded: true }),
  melee(Item.SwordBronze, 'Bronze short sword', 4, 30, [[[BZ, 2], [HW, 1], [LE, 1]]], forge(1), 300, R.Bronze, 'sword_short', 10, sword(16)),
  melee(Item.SpearBronze, 'Bronze spear', 4, 40, [[[BZ, 1], [HW, 1]]], forge(1), 250, R.Bronze, 'spear', 11, { damage: 18, attackSteps: ds(14), reach: cm(250), min: cm(100), hit: Hit.Stab, blunt: false, oneHanded: false }),
  it({
    id: Item.JavelinsBronze, name: 'Bronze javelins (bundle of 5)', slot: Slot.Ranged, tier: 4, weightTenthsLb: 100, recipes: [[[ST, 5], [BZ, 1]]], makes: 1, steps: ds(150), research: R.Bronze, model: 'javelin', madeAt: forge(1), craftSlot: 12,
    ranged: { damage: 20, attackSteps: ds(25), range: cm(1500), spreadBp: 500, shot: Shot.Javelin, blunt: false, skill: 0, load: 5, munition: 'self' },
  }),
  melee(Item.SwordBloom, 'Bloom iron sword', 5, 30, [[[BLOOM, 2], [HW, 1], [LE, 1]]], forge(2), 300, 0, 'sword', 13, sword(18)),
  melee(Item.SwordWrought, 'Wrought iron sword', 6, 30, [[[WROUGHT, 2], [HW, 1], [LE, 1]]], forge(3), 300, 0, 'sword', 14, sword(21)),
  melee(Item.SwordRefined, 'Refined iron sword', 7, 30, [[[REFINED, 2], [HW, 1], [LE, 1]]], forge(4), 300, 0, 'sword', 15, sword(24)),
  melee(Item.MaceBloom, 'Bloom iron mace', 5, 35, [[[BLOOM, 2], [HW, 1]]], forge(2), 300, 0, 'mace', 16, mace(17)),
  melee(Item.MaceWrought, 'Wrought iron mace', 6, 35, [[[WROUGHT, 2], [HW, 1]]], forge(3), 300, 0, 'mace', 17, mace(20)),
  melee(Item.MaceRefined, 'Refined iron mace', 7, 35, [[[REFINED, 2], [HW, 1]]], forge(4), 300, 0, 'mace', 18, mace(23)),
  melee(Item.HalberdBloom, 'Bloom iron halberd', 5, 70, [[[BLOOM, 3], [HW, 2]]], forge(2), 400, R.Halberds, 'halberd', 19, halberd(24)),
  melee(Item.HalberdWrought, 'Wrought iron halberd', 6, 70, [[[WROUGHT, 3], [HW, 2]]], forge(3), 400, R.Halberds, 'halberd', 20, halberd(28)),
  melee(Item.HalberdRefined, 'Refined iron halberd', 7, 70, [[[REFINED, 3], [HW, 2]]], forge(4), 400, R.Halberds, 'halberd', 21, halberd(32)),
  melee(Item.SwordSteel, 'Steel sword', 7, 30, [[[STEEL, 3], [HW, 1], [LE, 1]]], forge(4), 450, R.Steel, 'sword_steel', 22, sword(30, 130)),
  melee(Item.PikeSteel, 'Steel pike', 7, 70, [[[STEEL, 2], [HW, 3]]], forge(4), 400, R.Steel, 'pike', 23, pike(34)),
  melee(Item.HalberdSteel, 'Steel halberd', 7, 70, [[[STEEL, 3], [HW, 2]]], forge(4), 450, R.Steel, 'halberd', 24, halberd(38), R.Halberds),
  melee(Item.SwordHQ, 'High-quality steel sword', 8, 30, [[[HQ, 3], [HW, 1], [LE, 1]]], forge(4), 600, R.HQSteel, 'sword_steel', 25, sword(36, 130)),
  melee(Item.PikeHQ, 'High-quality steel pike', 8, 70, [[[HQ, 2], [HW, 3]]], forge(4), 600, R.HQSteel, 'pike', 26, pike(40)),
  melee(Item.HalberdHQ, 'High-quality steel halberd', 8, 70, [[[HQ, 3], [HW, 2]]], forge(4), 600, R.HQSteel, 'halberd', 27, halberd(45), R.Halberds),
  // Table 2e: crossbows and their bolts; metal-tipped arrows.
  it({
    id: Item.Crossbow, name: 'Crossbow', slot: Slot.Ranged, tier: 6, weightTenthsLb: 80, recipes: leatherOrFlax([[WROUGHT, 2], [Res.Planks, 2]]).reverse(), makes: 1, steps: ds(450), research: R.Crossbows, model: 'crossbow', madeAt: forge(3), needsWorkshop: 3, craftSlot: 28,
    ranged: { damage: 22, attackSteps: ds(30), range: cm(2800), spreadBp: 400, shot: Shot.Bolt, blunt: false, skill: Skill.Crossbow, load: 20, munition: 'bolts' },
  }),
  it({
    id: Item.CrossbowSteel, name: 'Steel crossbow', slot: Slot.Ranged, tier: 7, weightTenthsLb: 150, recipes: [[[STEEL, 2], [WROUGHT, 1], [Res.Planks, 2], [FX, 1]]], makes: 1, steps: ds(600), research: R.SteelCrossbow, model: 'crossbow_steel', madeAt: forge(4), needsWorkshop: 3, craftSlot: 29,
    ranged: { damage: 32, attackSteps: ds(45), range: cm(3400), spreadBp: 300, shot: Shot.Bolt, blunt: false, skill: Skill.Crossbow, load: 20, munition: 'bolts' },
  }),
  tipped(Item.ArrowsBronze, 'Bronze-tipped arrows', 4, 3, BZ, false, forge(1), R.Bronze, 'arrow', 30),
  tipped(Item.ArrowsBloom, 'Bloom iron arrows', 5, 4, BLOOM, false, forge(2), R.FlintTools, 'arrow', 31),
  tipped(Item.ArrowsWrought, 'Wrought iron arrows', 6, 5, WROUGHT, false, forge(3), R.FlintTools, 'arrow', 32),
  tipped(Item.ArrowsRefined, 'Refined iron arrows', 7, 6, REFINED, false, forge(4), R.FlintTools, 'arrow', 33),
  tipped(Item.ArrowsSteel, 'Steel-tipped arrows', 8, 8, STEEL, false, forge(4), R.Steel, 'arrow', 34),
  tipped(Item.ArrowsHQ, 'High-quality steel arrows', 9, 10, HQ, false, forge(4), R.HQSteel, 'arrow', 35),
  it({ id: Item.ArrowsPoison, name: 'Poison arrows', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[Res.Venom, 1]]], itemInputs: [[Item.ArrowsFlint, 10]], makes: 10, steps: ds(100), research: R.FlintTools, model: 'arrow_poison', madeAt: HERBALIST, craftSlot: 0, tip: 0, poison: 15, ammoFor: 'arrows' }),
  it({ id: Item.BoltsFlint, name: 'Flint-tipped bolts', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[HW, 1], [FE, 1], [FL, 1]]], makes: 10, steps: ds(150), research: R.Crossbows, model: 'bolt', madeAt: forge(3), craftSlot: 36, tip: 0, ammoFor: 'bolts' }),
  tipped(Item.BoltsBronze, 'Bronze-tipped bolts', 4, 3, BZ, true, forge(3), R.Crossbows, 'bolt', 37),
  tipped(Item.BoltsBloom, 'Bloom iron bolts', 5, 4, BLOOM, true, forge(3), R.Crossbows, 'bolt', 38),
  tipped(Item.BoltsWrought, 'Wrought iron bolts', 6, 5, WROUGHT, true, forge(3), R.Crossbows, 'bolt', 39),
  tipped(Item.BoltsRefined, 'Refined iron bolts', 7, 6, REFINED, true, forge(4), R.Crossbows, 'bolt', 40),
  tipped(Item.BoltsSteel, 'Steel-tipped bolts', 8, 8, STEEL, true, forge(4), R.Crossbows, 'bolt', 41, R.Steel),
  tipped(Item.BoltsHQ, 'High-quality steel bolts', 9, 10, HQ, true, forge(4), R.Crossbows, 'bolt', 42, R.HQSteel),
  it({ id: Item.BoltsPoison, name: 'Poison bolts', slot: Slot.Ammo, tier: 2, weightTenthsLb: 1, recipes: [[[Res.Venom, 1]]], itemInputs: [[Item.BoltsFlint, 10]], makes: 10, steps: ds(100), research: R.Crossbows, model: 'bolt_poison', madeAt: HERBALIST, craftSlot: 1, tip: 0, poison: 15, ammoFor: 'bolts' }),
  it({ id: Item.BoltCase, name: 'Bolt case', slot: Slot.Case, tier: 1, weightTenthsLb: 10, recipes: [[[LE, 1]]], makes: 1, steps: ds(100), research: R.Crossbows, model: 'bolt_case', madeAt: TANNERY, craftSlot: 4 }),
  // Table 3: armour, helmets and shields.
  armour(Item.ArmourLeather, 'Leather armour', Slot.Armour, 2, 1500, 100, [[[LE, 3]]], TANNERY, 300, 0, 'armour_leather', 2),
  armour(Item.ArmourBronzeScale, 'Bronze scale', Slot.Armour, 4, 3000, 300, leatherOrFlax([[BZ, 4]]), forge(1), 600, R.Bronze, 'armour_bronze_scale', 43),
  armour(Item.MailBloom, 'Bloom iron mail', Slot.Armour, 5, 3500, 250, leatherOrFlax([[BLOOM, 4]]), forge(2), 600, 0, 'armour_iron_mail', 44),
  armour(Item.MailWrought, 'Wrought iron mail', Slot.Armour, 6, 4000, 250, leatherOrFlax([[WROUGHT, 4]]), forge(3), 600, 0, 'armour_iron_mail', 45),
  armour(Item.MailRefined, 'Refined iron mail', Slot.Armour, 7, 4500, 250, leatherOrFlax([[REFINED, 4]]), forge(4), 600, 0, 'armour_iron_mail', 46),
  armour(Item.PlateSteel, 'Steel plate', Slot.Armour, 7, 5500, 450, leatherOrFlax([[STEEL, 6]], 2), forge(4), 1200, R.Steel, 'armour_steel_plate', 47),
  armour(Item.PlateHQ, 'High-quality steel plate', Slot.Armour, 8, 6000, 450, leatherOrFlax([[HQ, 6]], 2), forge(4), 1200, R.HQSteel, 'armour_steel_plate', 48),
  armour(Item.CapLeather, 'Leather cap', Slot.Helmet, 2, 200, 10, [[[LE, 1]]], TANNERY, 100, 0, 'helmet_leather_cap', 3),
  armour(Item.HelmetBronze, 'Bronze helmet', Slot.Helmet, 4, 400, 35, leatherOrFlax([[BZ, 1]]), forge(1), 200, R.Bronze, 'helmet_bronze', 49),
  armour(Item.HelmetNasal, 'Iron nasal helm', Slot.Helmet, 5, 500, 30, [BLOOM, WROUGHT, REFINED].flatMap((m) => leatherOrFlax([[m, 1]])), forge(2), 200, 0, 'helmet_iron_nasal', 50),
  armour(Item.SalletSteel, 'Steel sallet', Slot.Helmet, 7, 700, 30, leatherOrFlax([[STEEL, 1]]), forge(4), 300, R.Steel, 'helmet_steel_sallet', 51),
  it({ id: Item.ShieldBronze, name: 'Bronze shield', slot: Slot.Shield, tier: 4, weightTenthsLb: 120, recipes: [[[BZ, 2], [HW, 1], [LE, 1]]], makes: 1, steps: ds(300), research: R.Bronze, model: 'shield_bronze', madeAt: forge(1), craftSlot: 52, blockBp: 2000 }),
  it({ id: Item.ShieldIronKite, name: 'Iron kite shield', slot: Slot.Shield, tier: 6, weightTenthsLb: 120, recipes: [[[WROUGHT, 3], [Res.Planks, 1], [LE, 1]]], makes: 1, steps: ds(400), research: 0, model: 'shield_iron_kite', madeAt: forge(3), craftSlot: 53, blockBp: 2500 }),
  it({ id: Item.ShieldSteelHeater, name: 'Steel heater shield', slot: Slot.Shield, tier: 7, weightTenthsLb: 100, recipes: [[[STEEL, 3], [LE, 1]]], makes: 1, steps: ds(450), research: R.Steel, model: 'shield_steel_heater', madeAt: forge(4), craftSlot: 54, blockBp: 3000 }),
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
  return TOOL_ITEMS[tool] ?? Item.None;
}

/** The tool set item of each tool tier (props.ts Tool order). */
const TOOL_ITEMS: readonly Item[] = [Item.None, Item.ToolsHardwood, Item.ToolsFlint, Item.ToolsCopper, Item.ToolsBronze, Item.ToolsBloom, Item.ToolsWrought, Item.ToolsRefined, Item.ToolsSteel, Item.ToolsHQSteel];
/** A worker's tool as a weapon, by tool tier (Table 2c "Worker damage"). */
const TOOL_DAMAGE: readonly number[] = [2, 4, 5, 6, 7, 8, 8, 9, 10, 11];

/** The punch of a unit with nothing in hand, and a worker's tool as a weapon (Table 1: hardwood 4, flint 5). */
export function toolMelee(tool: number): MeleeStats {
  const damage = TOOL_DAMAGE[tool] ?? 2;
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
  { speed: floorDiv(cm(2800), STEPS_PER_SECOND), arcs: true, name: 'bolt', model: 'bolt', vsWalls: 0 },
];
