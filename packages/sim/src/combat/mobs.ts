// Night mobs for nights 0 to 20 (mob roster 5.0 stats and 5.2 to 5.6
// abilities and drops; the roster is the single source), and milestone 5's
// daytime foes: the lair guardians (giant centipede, myconid, ash golem, mana
// wraith), the hostile tribes (gnoll, kobold, hobgoblin) and the village
// goblins (roster 6.1 and 6.3), plus the things that stand and are broken:
// the eight lairs (Table 15) and a goblin village's huts, fire pit and totem
// (Table 17). Every number is the roster's or the tables', converted to steps
// and world units; picks are marked (s).

import { Res } from '../economy/resources.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { Item, Shot } from './items.ts';

export const Mob = {
  Zombie: 0,
  CaveBat: 1,
  GiantRat: 2,
  GiantSpider: 3,
  Slime: 4,
  /** What a slime splits into when it dies: half size, a third of the health. */
  SmallSlime: 5,
  SkeletonArcher: 6,
  BloatedCorpse: 7,
  SkeletonBomber: 8,
  /** A bomber's keg, rolled loose when the bomber is killed; it goes off 2 s later. */
  BombKeg: 9,
  GoblinCutter: 10,
  GoblinSlinger: 11,
  GoblinChief: 12,
  GraveHound: 13,
  // Lair guardians (roster 6.1; Lairs: Deadlands creatures).
  GiantCentipede: 14,
  Myconid: 15,
  AshGolem: 16,
  ManaWraith: 17,
  // Hostile tribes (roster 6.1 and 6.2).
  Gnoll: 18,
  Kobold: 19,
  Hobgoblin: 20,
  // Goblin villages (roster 6.3); wolf riders come with mounts in milestone 8.
  VillageGoblin: 21,
  GoblinArcher: 22,
  GoblinMage: 23,
  // Lairs (Table 15).
  LairBarrow: 24,
  LairCaveMouth: 25,
  LairNest: 26,
  LairMassGrave: 27,
  LairGoblinCamp: 28,
  LairGreatBarrow: 29,
  LairRiftScar: 30,
  LairVoidRift: 31,
  // A goblin village's buildings (Table 17).
  GoblinHut: 32,
  GoblinFirePit: 33,
  GoblinTotem: 34,
} as const;
export type Mob = (typeof Mob)[keyof typeof Mob];

/** How a mob gets about (roster "Moves"). */
export const Moves = { Walker: 0, Climber: 1, LowFlyer: 2, Breaker: 3, Still: 4 } as const;
export type Moves = (typeof Moves)[keyof typeof Moves];

/** What dawn does to it (roster "Sun"): sun-proof creatures, and everything that is out by day, stay. */
export const Sun = { Burns: 0, Flees: 1, Proof: 2 } as const;
export type Sun = (typeof Sun)[keyof typeof Sun];

/** How it arrives (roster "Comes as"). */
export const Comes = { Wave: 0, Pack: 1, Trickle: 2, Alone: 3, Never: 4 } as const;
export type Comes = (typeof Comes)[keyof typeof Comes];

export interface Drop {
  res: Res;
  min: number;
  max: number;
  /** Chance per kill, per mille. */
  chancePm: number;
  /** "Silver or gold": half the time this resource instead. */
  alt?: Res;
  /** An item for the equipment stock instead of a resource (a goblin's club, its arrows). */
  item?: Item;
}

export interface MobSpec {
  id: Mob;
  name: string;
  /** Catalogue model id (review/batch-2 MANIFEST, or Jade's existing models). */
  model: string;
  firstNight: number;
  hp: number;
  armourBp: number;
  /** Arrows, bolts and stabs (piercing) do this share, bp; blunt hits do bluntBp. */
  pierceBp: number;
  bluntBp: number;
  damage: number;
  attackSteps: number;
  /** Melee reach, wu. */
  reach: number;
  /** Ranged attack: range, shot and spread; 0 range for none. */
  range: number;
  shot: Shot;
  spreadBp: number;
  /** Running speed, wu per step; climbers climb at climbSpeed. */
  speed: number;
  climbSpeed: number;
  /** Damage per hit against walls, gates and buildings; rats gnaw wooden gates for double. */
  vsWalls: number;
  moves: Moves;
  sun: Sun;
  comes: Comes;
  /** Threat in tenths: its cost from the night's budget, and XP = 2 x threat. */
  threatTenths: number;
  /** Hit box: half its width and its height, wu. */
  halfWidth: number;
  height: number;
  /** Bloated corpses and bombers hit everything in front, not one target. */
  arc: boolean;
  /** The undead (bones, slimes) for the poison rule and the hound's howl. */
  undead: boolean;
  drops: readonly Drop[];
  /** What it does besides the night attack (threats/types.ts Role): night mobs 0. */
  role: number;
  /** XP for a kill in tenths when it has no threat: the header rule's HP / 50, at least 1 (Table 16: gnoll 3, kobold 1, hobgoblin 4); 0 for 2 x threat. */
  xpTenths: number;
  /** A shield that blocks this share of projectile damage, bp (hobgoblins 50%). */
  blockBp: number;
  /** Poison its hit adds over 5 s (giant centipede), 0 for none. */
  poison: number;
}

/** Tenths of a second as steps. */
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
/** Speed in tenths of a m/s as wu per step. */
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);

const BP = 10000;
const base = {
  armourBp: 0, pierceBp: BP, bluntBp: BP, range: 0, shot: Shot.Arrow, spreadBp: 0, climbSpeed: 0, arc: false, undead: false, role: 0, xpTenths: 0, blockBp: 0, poison: 0,
} as const;

/** The role values of threats/types.ts Role, kept here so this data file imports nothing of the threats. */
const RESIDENT = 2;
const TRIBE = 3;
const VILLAGE = 4;
const STRUCTURE = 5;

/** Something that stands and is broken: no attack, no move, never burnt by the sun, and no experience for it. */
const stand = (id: Mob, name: string, model: string, firstNight: number, hp: number, widthCm: number, heightCm: number): MobSpec => ({
  ...base, id, name, model, firstNight, hp, damage: 0, attackSteps: ds(10), reach: 0, speed: 0, vsWalls: 0,
  moves: Moves.Still, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, halfWidth: cm(widthCm >> 1), height: cm(heightCm), drops: [], role: STRUCTURE,
});

const GOBLIN_LOOT: readonly Drop[] = [
  { res: Res.Leather, min: 1, max: 1, chancePm: 200 },
  { res: Res.Hexstone, min: 1, max: 1, chancePm: 50 },
  { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 20 },
];

export const MOBS: readonly MobSpec[] = [
  {
    ...base, id: Mob.Zombie, name: 'Zombie', model: 'zombie', firstNight: 0, hp: 60, damage: 8, attackSteps: ds(16), reach: cm(120), speed: v10(14), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Wave, threatTenths: 10, halfWidth: cm(30), height: cm(170), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 150 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 20 }, { res: Res.Gold, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.CaveBat, name: 'Cave bat', model: 'cave_bat', firstNight: 0, hp: 25, damage: 6, attackSteps: ds(10), reach: cm(100), speed: v10(60), vsWalls: 0,
    moves: Moves.LowFlyer, sun: Sun.Flees, comes: Comes.Wave, threatTenths: 10, halfWidth: cm(40), height: cm(40),
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 50 }],
  },
  {
    ...base, id: Mob.GiantRat, name: 'Giant rat', model: 'giant_rat', firstNight: 0, hp: 26, damage: 5, attackSteps: ds(8), reach: cm(100), speed: v10(45), climbSpeed: v10(5), vsWalls: 3,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Pack, threatTenths: 7, halfWidth: cm(30), height: cm(50),
    drops: [{ res: Res.Hides, min: 1, max: 1, chancePm: 80 }, { res: Res.Meat, min: 1, max: 1, chancePm: 50 }],
  },
  {
    ...base, id: Mob.GiantSpider, name: 'Giant spider', model: 'giant_spider', firstNight: 0, hp: 105, armourBp: 1000, damage: 16, attackSteps: ds(13), reach: cm(150),
    range: cm(800), shot: Shot.Web, spreadBp: 500, speed: v10(35), climbSpeed: v10(8), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Trickle, threatTenths: 30, halfWidth: cm(60), height: cm(60),
    drops: [{ res: Res.SpiderSilk, min: 1, max: 2, chancePm: 200 }, { res: Res.Emeralds, min: 1, max: 1, chancePm: 10 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.Slime, name: 'Slime', model: 'slime', firstNight: 0, hp: 90, pierceBp: 5000, damage: 10, attackSteps: ds(18), reach: cm(120), speed: v10(12), vsWalls: 6,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Trickle, threatTenths: 20, halfWidth: cm(40), height: cm(42), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 100 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 25 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 25 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.SmallSlime, name: 'Small slime', model: 'slime', firstNight: 0, hp: 30, pierceBp: 5000, damage: 5, attackSteps: ds(18), reach: cm(100), speed: v10(12), vsWalls: 3,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Never, threatTenths: 0, halfWidth: cm(20), height: cm(21), undead: true,
    drops: [],
  },
  {
    ...base, id: Mob.SkeletonArcher, name: 'Skeleton archer', model: 'skeleton_archer', firstNight: 5, hp: 45, pierceBp: 5000, bluntBp: 15000, damage: 9, attackSteps: ds(22), reach: cm(120),
    range: cm(1800), shot: Shot.BoneArrow, spreadBp: 700, speed: v10(22), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Wave, threatTenths: 20, halfWidth: cm(30), height: cm(175), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 150 }],
  },
  {
    ...base, id: Mob.BloatedCorpse, name: 'Bloated corpse', model: 'bloated_corpse', firstNight: 10, hp: 260, armourBp: 1000, damage: 28, attackSteps: ds(24), reach: cm(150), speed: v10(11), vsWalls: 15,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Trickle, threatTenths: 60, halfWidth: cm(55), height: cm(190), arc: true, undead: true,
    drops: [{ res: Res.Bone, min: 2, max: 2, chancePm: 200 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 20 }, { res: Res.Silver, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.SkeletonBomber, name: 'Skeleton bomber', model: 'skeleton_bomber', firstNight: 10, hp: 35, pierceBp: 5000, bluntBp: 15000, damage: 60, attackSteps: ds(10), reach: cm(120), speed: v10(32), vsWalls: 300,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Trickle, threatTenths: 40, halfWidth: cm(35), height: cm(175), undead: true,
    drops: [{ res: Res.Saltpetre, min: 1, max: 1, chancePm: 100 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 50 }, { res: Res.Bone, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.BombKeg, name: 'Loose bomb', model: 'bomb_keg', firstNight: 10, hp: 1, damage: 60, attackSteps: ds(20), reach: 0, speed: 0, vsWalls: 300,
    moves: Moves.Still, sun: Sun.Burns, comes: Comes.Never, threatTenths: 0, halfWidth: cm(30), height: cm(65),
    drops: [],
  },
  {
    ...base, id: Mob.GoblinCutter, name: 'Goblin cutter', model: 'goblin', firstNight: 15, hp: 40, armourBp: 1000, damage: 7, attackSteps: ds(9), reach: cm(100), speed: v10(34), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Wave, threatTenths: 15, halfWidth: cm(30), height: cm(120),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinSlinger, name: 'Goblin slinger', model: 'goblin_slinger', firstNight: 15, hp: 30, damage: 6, attackSteps: ds(18), reach: cm(100), range: cm(1400), shot: Shot.GoblinStone, spreadBp: 800, speed: v10(34), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Wave, threatTenths: 15, halfWidth: cm(30), height: cm(120),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinChief, name: 'Goblin chief', model: 'goblin_chief', firstNight: 15, hp: 150, armourBp: 1500, damage: 18, attackSteps: ds(14), reach: cm(150), speed: v10(32), vsWalls: 8,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Alone, threatTenths: 50, halfWidth: cm(35), height: cm(140),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GraveHound, name: 'Grave hound', model: 'grave_hound', firstNight: 20, hp: 70, damage: 11, attackSteps: ds(9), reach: cm(120), speed: v10(55), vsWalls: 2,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Pack, threatTenths: 25, halfWidth: cm(30), height: cm(80), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 2, chancePm: 200 }],
  },
  // Lair guardians (roster 6.1). The centipede's attack time is the Rift centipede's 1.2 s (s); the wraith's bolt every 2 s (s).
  {
    ...base, id: Mob.GiantCentipede, name: 'Giant centipede', model: 'giant_centipede', firstNight: 0, hp: 150, armourBp: 2500, damage: 14, poison: 10, attackSteps: ds(12), reach: cm(150), speed: v10(35), climbSpeed: v10(8), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Flees, comes: Comes.Never, threatTenths: 0, xpTenths: 30, halfWidth: cm(50), height: cm(50), role: RESIDENT,
    drops: [{ res: Res.Venom, min: 1, max: 1, chancePm: 300 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Myconid, name: 'Myconid', model: 'myconid', firstNight: 0, hp: 100, damage: 10, attackSteps: ds(15), reach: cm(150), speed: v10(15), vsWalls: 3,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Never, threatTenths: 0, xpTenths: 20, halfWidth: cm(40), height: cm(120), role: RESIDENT,
    drops: [{ res: Res.ManaCrystal, min: 1, max: 1, chancePm: 200 }, { res: Res.Herbs, min: 1, max: 1, chancePm: 1000 }],
  },
  {
    ...base, id: Mob.AshGolem, name: 'Ash golem', model: 'ash_golem', firstNight: 45, hp: 1200, armourBp: 5000, damage: 50, attackSteps: ds(22), reach: cm(250), speed: v10(20), vsWalls: 60,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 240, halfWidth: cm(110), height: cm(350), arc: true, role: RESIDENT,
    drops: [{ res: Res.Coal, min: 4, max: 4, chancePm: 1000 }, { res: Res.Sulphur, min: 2, max: 2, chancePm: 1000 }, { res: Res.IronRock, min: 2, max: 2, chancePm: 1000 }],
  },
  {
    ...base, id: Mob.ManaWraith, name: 'Mana wraith', model: 'mana_wraith', firstNight: 80, hp: 300, pierceBp: 5000, damage: 25, attackSteps: ds(20), reach: cm(150),
    range: cm(1800), shot: Shot.ManaBolt, spreadBp: 300, speed: v10(30), vsWalls: 0,
    moves: Moves.LowFlyer, sun: Sun.Flees, comes: Comes.Never, threatTenths: 0, xpTenths: 60, halfWidth: cm(45), height: cm(180), role: RESIDENT,
    drops: [{ res: Res.ManaCrystal, min: 2, max: 3, chancePm: 1000 }],
  },
  // Hostile tribes (roster 6.1, Table 16). They roam by day, so none of them burns or flees in the sun (s: the roster's kobold "flees").
  {
    ...base, id: Mob.Gnoll, name: 'Gnoll', model: 'gnoll', firstNight: 0, hp: 140, armourBp: 1500, damage: 18, attackSteps: ds(13), reach: cm(200), speed: v10(35), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 30, halfWidth: cm(35), height: cm(190), role: TRIBE,
    drops: [{ res: Res.Hides, min: 1, max: 1, chancePm: 1000 }, { res: Res.BloomIron, min: 1, max: 1, chancePm: 100 }, { res: Res.Gold, min: 1, max: 1, chancePm: 30 }],
  },
  {
    ...base, id: Mob.Kobold, name: 'Kobold', model: 'kobold', firstNight: 0, hp: 35, armourBp: 500, damage: 8, attackSteps: ds(10), reach: cm(200), speed: v10(35), climbSpeed: v10(8), vsWalls: 2,
    moves: Moves.Climber, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 10, halfWidth: cm(25), height: cm(110), role: TRIBE,
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 200 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 200 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Hobgoblin, name: 'Hobgoblin', model: 'hobgoblin', firstNight: 0, hp: 220, armourBp: 4000, damage: 22, attackSteps: ds(14), reach: cm(150), speed: v10(28), vsWalls: 8,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 40, blockBp: 5000, halfWidth: cm(35), height: cm(180), role: TRIBE,
    drops: [{ res: Res.WroughtIron, min: 1, max: 1, chancePm: 200 }, { res: Res.Silver, min: 1, max: 1, chancePm: 30 }],
  },
  // Goblin villages (roster 6.3): 1.2 m tall, out by day, home at night. XP by the header rule: HP / 50, at least 1.
  {
    ...base, id: Mob.VillageGoblin, name: 'Goblin', model: 'goblin', firstNight: 0, hp: 40, armourBp: 1000, damage: 7, attackSteps: ds(9), reach: cm(100), speed: v10(34), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE,
    drops: [{ res: Res.Leather, item: Item.Club, min: 1, max: 1, chancePm: 100 }, ...GOBLIN_LOOT],
  },
  {
    ...base, id: Mob.GoblinArcher, name: 'Goblin archer', model: 'goblin_archer', firstNight: 0, hp: 30, damage: 7, attackSteps: ds(20), reach: cm(100), range: cm(1600), shot: Shot.Arrow, spreadBp: 800, speed: v10(34), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE,
    drops: [{ res: Res.Leather, min: 2, max: 4, chancePm: 300, item: Item.ArrowsFlint }, { res: Res.Leather, min: 1, max: 1, chancePm: 150 }, { res: Res.Hexstone, min: 1, max: 1, chancePm: 50 }, { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinMage, name: 'Goblin mage', model: 'goblin_mage', firstNight: 0, hp: 35, damage: 8, attackSteps: ds(30), reach: cm(100), range: cm(1400), shot: Shot.Spark, spreadBp: 400, speed: v10(30), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, threatTenths: 0, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE,
    drops: [{ res: Res.Hexstone, min: 1, max: 2, chancePm: 400 }, { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 40 }],
  },
  // Lairs (Table 15): health, and a footprint to fit their models (s). The goblin camp is 4 huts of 200, kept as one lair of 800 (s).
  stand(Mob.LairBarrow, 'Barrow', 'lair_barrow', 0, 400, 500, 220),
  stand(Mob.LairCaveMouth, 'Cave mouth', 'lair_cave', 0, 500, 500, 300),
  stand(Mob.LairNest, 'Spider nest', 'lair_nest', 0, 300, 400, 180),
  stand(Mob.LairMassGrave, 'Mass grave', 'lair_mass_grave', 10, 600, 500, 120),
  stand(Mob.LairGoblinCamp, 'Goblin camp', 'lair_goblin_camp', 15, 800, 700, 260),
  stand(Mob.LairGreatBarrow, 'Great barrow', 'lair_great_barrow', 25, 1200, 800, 320),
  stand(Mob.LairRiftScar, 'Rift scar', 'lair_rift_scar', 45, 2000, 500, 300),
  stand(Mob.LairVoidRift, 'Void rift', 'lair_void_rift', 80, 4000, 600, 400),
  // A goblin village's buildings (Table 17): hut 200, fire pit 100, totem 150.
  stand(Mob.GoblinHut, 'Goblin hut', 'goblin_hut_1', 0, 200, 320, 260),
  stand(Mob.GoblinFirePit, 'Goblin fire pit', 'goblin_fire_pit', 0, 100, 200, 60),
  stand(Mob.GoblinTotem, 'Goblin totem', 'goblin_totem', 0, 150, 80, 300),
];

/** Whether a mob is a lair (Table 15). */
export function isLair(mob: number): boolean {
  return mob >= Mob.LairBarrow && mob <= Mob.LairVoidRift;
}

/** Whether a mob is a thing that stands and is broken (a lair or a village building). */
export function isStructure(mob: number): boolean {
  return MOBS[mob]?.role === STRUCTURE;
}

export function mobSpec(id: number): MobSpec {
  const sp = MOBS[id];
  if (!sp) throw new Error(`unknown mob ${id}`);
  return sp;
}

/** Every mob gains 0.5% health and damage for each night after its first (roster 2), per mille. */
export function powerPm(mob: Mob, night: number): number {
  return 1000 + 5 * Math.max(0, night - mobSpec(mob).firstNight);
}

/** Cruising height of a low flyer above the ground (roster: about 4 m), and how low it swoops. */
export const FLY_HEIGHT = cm(400);
export const SWOOP_HEIGHT = cm(60);

/** Zombie grasp: a hit slows its target by 20% for 2 s. Web spit: 50% for 3 s, every 10 s. */
export const GRASP = { slowBp: 2000, steps: ds(20) };
export const WEB = { slowBp: 5000, steps: ds(30), cooldown: ds(100) };
/** Slime engulf: holds a worker still for 2 s. */
export const ENGULF_STEPS = ds(20);
/** Bloated corpse burst: 40 to the players' units within 3 m. */
export const BURST = { damage: 40, radius: cm(300) };
/** Bomber blast: 300 to walls and buildings where it goes off, half that at 2.5 m (s: the roster had 220, which cannot break a 300 HP softwood column), 60 to units within 3 m; a loose bomb goes off 2 s after it falls. */
export const BLAST = { building: 300, buildingRadius: cm(250), unit: 60, unitRadius: cm(300), fuse: ds(20) };
/** A bomber goes for 5 or more of the players' units within 8 m of it on its way. */
export const CLUSTER = { units: 5, radius: cm(800) };
/** Goblins within 10 m of a chief run 20% faster. */
export const SHOUT = { radius: cm(1000), bonusBp: 2000 };
/** Grave hounds howl: undead within 10 m run 15% faster for 6 s. */
export const HOWL = { radius: cm(1000), bonusBp: 1500, steps: ds(60), cooldown: ds(200) };
/** Climbers take 50% extra damage while on a wall face. */
export const CLIMBING_DAMAGE_BP = 15000;
/** Sunlight burns 10% of a mob's maximum health a second. */
export const SUNBURN_PER_MILLE_PER_SECOND = 100;
