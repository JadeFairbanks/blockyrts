// Combat's shared vocabulary (Combat; Table 2a research; How ranged attacks
// hit): how a weapon hits, what flies, the research steps, and the stats a
// weapon has. Since the troop rework (Troops and gear, agreed 2026-10-03)
// there are no items: a unit's weapon, armour, shield and tools are tiers on
// the unit, and their numbers are the kit tables in units/kits.ts.

import { Res, type Cost } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { BuildingKind } from '../buildings/data.ts';

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
  /** A goblin mage's Spark toss: a small fire bolt. */
  Spark: 8,
  /** A mana wraith's bolt. */
  ManaBolt: 9,
  /** A battle mage's Arcane bolt: a violet-white orb (Table 13). */
  ArcaneBolt: 10,
  /** A battle mage's Fireball, lobbed (Table 13). */
  Fireball: 11,
  /** An Elf Grovesinger's thorn (Thorn volley): flies like an arrow. */
  Thorn: 12,
  // Milestone 8: the siege engines' shots (siege/data.ts ENGINE_SHOT), the musket ball, and the late roster's.
  Cannonball: 13,
  CatapultStone: 14,
  BallistaBolt: 15,
  MusketBall: 16,
  /** A bone colossus's lump of bone, thrown at a tower or parapet. */
  BoneBoulder: 17,
  /** A scorchwing's ball of burning pitch, dropped from above. */
  FirePitch: 18,
  /** A flamecaller's fireball. */
  Hellfire: 19,
  /** Jade's Patch 5: the necromancer's crimson bolt. */
  NecroBolt: 20,
} as const;
export type Shot = (typeof Shot)[keyof typeof Shot];

export interface MeleeStats {
  damage: number;
  /** Time between attacks, steps. */
  attackSteps: number;
  /** Reach, wu (Table 1, 2d). There is no minimum range: long melee can always attack (Jade, 2026-10-03). */
  reach: number;
  hit: Hit;
  blunt: boolean;
  /** One-handed weapons pair with a shield and hit a flying attacker only while it swoops. */
  oneHanded: boolean;
  /** Long melee and cavalry: a hit in the outer third of reach is a critical for +30% (Long melee: the edge of reach). */
  crit: boolean;
}

export interface RangedStats {
  damage: number;
  attackSteps: number;
  range: number;
  /** Largest miss as a share of the distance, bp (Table 2e "spread"). */
  spreadBp: number;
  shot: Shot;
  blunt: boolean;
}

/** Research steps (Table 2a): bit numbers in a player's research mask. */
export const Research = {
  None: 0,
  FlintTools: 1,
  Bronze: 2,
  DeepMining1: 3,
  /** Retired by the troop rework (Jade, 2026-10-03). */
  Halberds: 4,
  Crossbows: 5,
  Hexcraft: 6,
  DeepMining2: 7,
  SiegeEngines: 8,
  Steel: 9,
  /** Carbon steel, which replaced high-quality steel (Troops and gear). */
  CarbonSteel: 10,
  /** Retired by the troop rework (Jade, 2026-10-03). */
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
  /** What must come first: a main base tier (Patch 2: in place of a forge level or a building; Patch 5: tiers, not levels), another research, a thing made once. */
  base?: number;
  after?: Research;
  made?: number;
  /** Researched in a later milestone: the reason it is greyed. */
  later?: string;
  /** Researched at this building kind instead of a Scholar's Lodge (Hexcraft at the Magi Sanctum). */
  at?: number;
  /** No longer a research step (its bit is kept so saved research masks still line up). */
  retired?: boolean;
}

const sec = (n: number): number => n * STEPS_PER_SECOND;

export const RESEARCH: readonly ResearchSpec[] = [
  { id: Research.None, name: '', key: '', cost: [], steps: 0, opens: '' },
  {
    // Retired: stone and flint gear needs no research (Table 2a, Table 2c).
    id: Research.FlintTools, name: 'Flint tools', key: '', cost: [], steps: 0, retired: true,
    opens: 'Nothing: flint gear is made at the Big House without research.',
  },
  {
    id: Research.Bronze, name: 'Bronze', key: 'B', cost: [[Res.CopperIngot, 10], [Res.TinIngot, 2]], steps: sec(75), made: 0,
    // Jade's mini balance: no tin ingot needs smelting first; bronze ingots are still made at the Forge from copper and tin ingots.
    opens: 'Tier 4 (bronze): bronze ingots, bronze weapons, armour and tools, and mining bog iron and iron rock.',
  },
  {
    id: Research.DeepMining1, name: 'Deep Mining I', key: 'D', cost: [[Res.BronzeIngot, 20], [Res.Stone, 50]], steps: sec(90), after: Research.Bronze, base: 3,
    opens: 'The Mineshaft: stone and copper, tin, iron rock or coal.',
  },
  {
    // Retired: the halberd is the long-melee tier 7 weapon, opened at the Forge's steel step and by Steel (Troops and gear).
    id: Research.Halberds, name: 'Halberds', key: '', cost: [], steps: 0, retired: true,
    opens: 'Nothing: the steel halberd is long melee tier 7.',
  },
  {
    // One crossbow research (Jade), after Steel (s): the tier 7 steel-prod crossbow for rangers.
    id: Research.Crossbows, name: 'Crossbows', key: 'C', cost: [[Res.WroughtIron, 10], [Res.AnyLumber, 20]], steps: sec(90), after: Research.Steel,
    opens: 'The tier 7 steel-prod crossbow for rangers.',
  },
  {
    id: Research.Hexcraft, name: 'Hexcraft', key: 'X', cost: [[Res.Hexstone, 6], [Res.Herbs, 20]], steps: sec(90), at: BuildingKind.MagiSanctum,
    opens: 'The Warding and Counterspell spells.',
  },
  {
    id: Research.DeepMining2, name: 'Deep Mining II', key: 'E', cost: [[Res.WroughtIron, 30], [Res.Stone, 100], [Res.Silver, 3]], steps: sec(120), base: 3,
    opens: 'Every mineshaft digs deeper: vein iron, coal, silver or gold, gems.',
  },
  {
    id: Research.SiegeEngines, name: 'Siege engines', key: 'G', cost: [[Res.AnyLumber, 40], [Res.Rope, 10], [Res.BronzeIngot, 10]], steps: sec(120), base: 3,
    opens: 'The catapult and the ballista at the Artillery workshop.',
  },
  {
    id: Research.Steel, name: 'Steel', key: 'S', cost: [[Res.PigIron, 10], [Res.Charcoal, 20]], steps: sec(150), base: 3, made: Made.PigIron,
    opens: 'Tier 7 (steel): steel ingots, and steel weapons, armour and tools.',
  },
  {
    id: Research.CarbonSteel, name: 'Carbon steel', key: 'Q', cost: [[Res.SteelIngot, 5], [Res.Charcoal, 50]], steps: sec(210), after: Research.Steel,
    opens: 'Carbon steel ingots at the Forge, and tier 8: carbon steel weapons, armour and tools.',
  },
  {
    // Retired: one Crossbows research stays (Jade).
    id: Research.SteelCrossbow, name: 'Steel crossbow', key: '', cost: [], steps: 0, retired: true,
    opens: 'Nothing: the crossbow is ranger tier 7.',
  },
  {
    id: Research.DeepMining3, name: 'Deep Mining III', key: 'M', cost: [[Res.SteelIngot, 30], [Res.Stone, 200], [Res.Gold, 3], [Res.Silver, 3]], steps: sec(180), after: Research.Steel, base: 3,
    opens: 'Every mineshaft digs deepest: more vein iron and coal, lead, gold, gems; never worked out.',
  },
  {
    id: Research.Gunpowder, name: 'Gunpowder', key: 'P', cost: [[Res.Saltpetre, 10], [Res.Sulphur, 5], [Res.Charcoal, 10]], steps: sec(150), base: 3,
    opens: 'Gunpowder at the Forge.',
  },
  {
    id: Research.Muskets, name: 'Muskets', key: 'U', cost: [[Res.SteelIngot, 10], [Res.Gunpowder, 10]], steps: sec(180), after: Research.Gunpowder, base: 4,
    opens: 'The tier 8 flintlock musket ranger, and the brawler (with Carbon steel).',
  },
  {
    id: Research.Cannons, name: 'Cannons', key: 'N', cost: [[Res.BronzeIngot, 20], [Res.Gunpowder, 10], [Res.AnyLumber, 20]], steps: sec(210), after: Research.Gunpowder, base: 4,
    opens: 'The bronze and iron cannons at the Artillery workshop.',
  },
];

export function hasResearch(mask: number, r: Research): boolean {
  return r === Research.None || (mask & (1 << r)) !== 0;
}

/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);

/**
 * What a shot is: its speed and whether it arcs, its model, its damage to
 * walls and buildings; milestone 8 adds a splash round where it lands
 * (damage and radius, wu), setting wood alight, and a multiplier against
 * wooden buildings (bp, 0 for none).
 */
export interface ShotSpec {
  speed: number;
  arcs: boolean;
  name: string;
  model: string;
  vsWalls: number;
  splash?: number;
  splashRadius?: number;
  ignite?: boolean;
  vsWoodBp?: number;
  /** How its splash looks where it lands (state.ts HitLook), when not the usual blast. */
  burst?: 'crimson';
}

export const SHOTS: readonly ShotSpec[] = [
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'arrow', model: 'arrow_flight', vsWalls: 0 },
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: true, name: 'sling stone', model: 'sling_stone', vsWalls: 0 },
  { speed: floorDiv(cm(1500), STEPS_PER_SECOND), arcs: true, name: 'javelin', model: 'javelin_flint', vsWalls: 1 },
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'arrow', model: 'arrow_flight', vsWalls: 0 },
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: true, name: 'sling stone', model: 'sling_stone', vsWalls: 0 },
  { speed: floorDiv(cm(1400), STEPS_PER_SECOND), arcs: true, name: 'web', model: 'web_glob', vsWalls: 0 },
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'fire arrow', model: 'arrow_fire', vsWalls: 0 },
  { speed: floorDiv(cm(2800), STEPS_PER_SECOND), arcs: true, name: 'bolt', model: 'bolt', vsWalls: 0 },
  { speed: floorDiv(cm(1600), STEPS_PER_SECOND), arcs: false, name: 'spark', model: 'spell_spark_toss', vsWalls: 0 },
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: false, name: 'mana bolt', model: 'spell_bolt', vsWalls: 0 },
  // Milestone 6: the battle mages' projectiles (s): the orb flies straight at 20 m/s, the fireball is lobbed at 16 m/s.
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: false, name: 'arcane bolt', model: 'spell_bolt', vsWalls: 2 },
  { speed: floorDiv(cm(1600), STEPS_PER_SECOND), arcs: true, name: 'fireball', model: 'spell_fireball', vsWalls: 30 },
  // Milestone 7: a Grovesinger's thorn flies as an arrow does (s).
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'thorn', model: 'spell_thorn_volley', vsWalls: 0 },
  // Milestone 8 (s): a cannonball flies at 40 m/s in a low arc, a catapult stone is lobbed at 20 m/s, a ballista bolt flies flat at 40 m/s
  // (their damage against walls is the engine's, siege/data.ts); a musket ball flies straight at 80 m/s; the bone colossus's boulder
  // (60 to the barrier, roster), the scorchwing's pitch and the flamecaller's fireball (x3 against wood is in the mob's rules).
  // Splashes (Table 2f, roster): a cannonball 50 within 2 m, a catapult stone 80 within 3 m, the boulder 24 within 2 m, burning pitch
  // 19 within 2 m and alight; the flamecaller's 30 with a 2 m splash of 14 and triple against wood. The mobs' three were 25, 20 and 15
  // before Patch 5's 5% cut on the night mobs (Jade's BL-5), rounded to the nearest whole.
  { speed: floorDiv(cm(4000), STEPS_PER_SECOND), arcs: true, name: 'cannonball', model: 'cannonball_iron', vsWalls: 400, splash: 50, splashRadius: cm(200) },
  { speed: floorDiv(cm(2000), STEPS_PER_SECOND), arcs: true, name: 'catapult stone', model: 'catapult_stone', vsWalls: 200, splash: 80, splashRadius: cm(300) },
  { speed: floorDiv(cm(4000), STEPS_PER_SECOND), arcs: false, name: 'ballista bolt', model: 'ballista_bolt', vsWalls: 20 },
  { speed: floorDiv(cm(8000), STEPS_PER_SECOND), arcs: false, name: 'musket ball', model: 'musket_ball', vsWalls: 2 },
  { speed: floorDiv(cm(1500), STEPS_PER_SECOND), arcs: true, name: 'bone boulder', model: 'bone_boulder', vsWalls: 60, splash: 24, splashRadius: cm(200) },
  { speed: floorDiv(cm(1200), STEPS_PER_SECOND), arcs: true, name: 'burning pitch', model: 'spell_fireball', vsWalls: 20, splash: 19, splashRadius: cm(200), ignite: true },
  { speed: floorDiv(cm(1600), STEPS_PER_SECOND), arcs: true, name: 'hellfire', model: 'spell_fireball', vsWalls: 30, splash: 14, splashRadius: cm(200), vsWoodBp: 30000 },
  // Jade's Patch 5 (MB-5): the necromancer's bolt, 35 within 0.5 m of where it lands besides the 35 to whoever it strikes; it flies straight at 18 m/s (s).
  { speed: floorDiv(cm(1800), STEPS_PER_SECOND), arcs: false, name: 'crimson bolt', model: 'necromancer_bolt', vsWalls: 5, splash: 35, splashRadius: cm(50), burst: 'crimson' },
];

/** Shots that are spells (Warding halves them; Counterspell stops them while they are cast). */
export function spellShot(shot: number): boolean {
  return shot === Shot.Spark || shot === Shot.ManaBolt || shot === Shot.ArcaneBolt || shot === Shot.Fireball || shot === Shot.Thorn || shot === Shot.NecroBolt;
}
