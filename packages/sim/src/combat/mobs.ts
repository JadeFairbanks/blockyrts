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
import { Shot, SHOTS } from './items.ts';
import { Area, THREAT, threatTenths, Trait, type ThreatInput, effectiveHealth100 } from './threat.ts';

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
  // Milestone 7: the neutral peoples' buildings (Halflings, Runkin, Elves, Dwarves); a mercenary camp is Runkin tents round a fire.
  HalflingBurrow: 35,
  HalflingMill: 36,
  HalflingInn: 37,
  HalflingBarn: 38,
  RunkinTent: 39,
  RunkinDryingRack: 40,
  RunkinWolfDen: 41,
  RunkinFire: 42,
  ElfHall: 43,
  ElfTreePlatform: 44,
  ElfBearPen: 45,
  ElfGate: 46,
  /** An Elf caravan's wagon: it travels with its caravan and folds open into a market stall (it moves, so it is not a structure). */
  ElfCaravanWagon: 47,
  DwarfHouse: 48,
  DwarfForge: 49,
  DwarfMineshaft: 50,
  DwarfHall: 51,
  DwarfCityGate: 52,
  // Milestone 8: the goblin village's wolf riders and their pen (roster 6.3; Table 17).
  GoblinWolfRider: 53,
  GoblinWolfPen: 54,
  // Night mobs 25 to 110 (roster 5.7 to 5.25).
  BarrowKnight: 55,
  PlagueBearer: 56,
  Gravewing: 57,
  BoneColossus: 58,
  HollowPriest: 59,
  Cinderling: 60,
  Hellhound: 61,
  Fiend: 62,
  Scorchwing: 63,
  DemonBrute: 64,
  Flamecaller: 65,
  ChainFiend: 66,
  VoidStalker: 67,
  InfernalJuggernaut: 68,
  VoidWitch: 69,
  AbyssalDrake: 70,
  Archfiend: 71,
  RiftColossus: 72,
  Morvath: 73,
  // The Rift-touched beasts (roster 5.24): the creatures' models with the _rift look.
  RiftScorpion: 74,
  RiftCentipede: 75,
  RiftHornet: 76,
  RiftBeetle: 77,
  RiftGriffin: 78,
  RiftMinotaur: 79,
  /** Morvath's second form: at half health he takes flight (roster 5.25). */
  MorvathAloft: 80,
} as const;
export type Mob = (typeof Mob)[keyof typeof Mob];

/** How a mob gets about (roster "Moves"). A high flyer is hit only by ranged attacks and magic while it circles. */
export const Moves = { Walker: 0, Climber: 1, LowFlyer: 2, Breaker: 3, Still: 4, HighFlyer: 5 } as const;
export type Moves = (typeof Moves)[keyof typeof Moves];

/** What dawn does to it (roster "Sun"): sun-proof creatures, and everything that is out by day, stay; a barrow knight smoulders at half the burn. */
export const Sun = { Burns: 0, Flees: 1, Proof: 2, Smoulders: 3 } as const;
export type Sun = (typeof Sun)[keyof typeof Sun];

/** How a ranged mob attacks: a shot that flies, or straight onto its target (a curse, a draining beam, a line of breath). */
export const Strike = { Shot: 0, Curse: 1, Drain: 2, Breath: 3 } as const;
export type Strike = (typeof Strike)[keyof typeof Strike];

/** The demons (roster 2: red from night 45, purple from night 80): the archfiend's command lifts them. */
export const Demon = { None: 0, Red: 1, Purple: 2 } as const;

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
  /** Threat in tenths, worked out from its numbers and traits (combat/threat.ts), never set by hand: its cost from the night's budget, and XP = 2 x threat. Night monsters only; 0 for the rest. */
  threatTenths: number;
  /** Abilities the code gives it that add to its threat (combat/threat.ts Trait); flying, climbing, breaking walls, long reach and knockback are read from its numbers. */
  traits: readonly Trait[];
  /** What it splits into when it dies, and how many (a slime's two halves). */
  splitsInto: ReadonlyArray<readonly [Mob, number]>;
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
  /** Casters: the most mana it holds (goblin mage 60); 0 for none. */
  mana: number;
  /** Milestone 8. How its ranged attack lands (Strike), and what kind of demon it is (Demon). */
  strike: Strike;
  demon: number;
  /** At most this many a night (archfiend 1, Rift colossus 2), 0 for no cap. */
  perNight: number;
  /** A climber of wooden walls only (the cinderling). */
  woodClimber: boolean;
  /** Its melee hit knocks back units smaller than it this far (Rift beetle, Rift minotaur), wu. */
  knockWu: number;
  /** Its melee hit lands on every unit within this distance (the Rift colossus's slam), wu; 0 for one target or the arc. */
  slamRadius: number;
  /** A texture look on the model: '' or 'rift' (the Rift-touched beasts). */
  tint: string;
}

/** A mob as written in the table below: everything but its threat, which is worked out (combat/threat.ts). */
export type MobRow = Omit<MobSpec, 'threatTenths'>;

/** Tenths of a second as steps. */
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** Centimetres as wu. */
const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
/** Speed in tenths of a m/s as wu per step. */
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);

const BP = 10000;
const base = {
  traits: [], splitsInto: [], armourBp: 0, pierceBp: BP, bluntBp: BP, range: 0, shot: Shot.Arrow, spreadBp: 0, climbSpeed: 0, arc: false, undead: false, role: 0, xpTenths: 0, blockBp: 0, poison: 0, mana: 0,
  strike: Strike.Shot, demon: Demon.None, perNight: 0, woodClimber: false, knockWu: 0, slamRadius: 0, tint: '',
} as const;

/** The role values of threats/types.ts Role, kept here so this data file imports nothing of the threats. */
const RESIDENT = 2;
const TRIBE = 3;
const VILLAGE = 4;
const STRUCTURE = 5;
/** threats/types.ts Role.People: one of a neutral people's units. */
const PEOPLE = 6;

/** Something that stands and is broken: no attack, no move, never burnt by the sun, and no experience for it. */
const stand = (id: Mob, name: string, model: string, firstNight: number, hp: number, widthCm: number, heightCm: number): MobRow => ({
  ...base, id, name, model, firstNight, hp, damage: 0, attackSteps: ds(10), reach: 0, speed: 0, vsWalls: 0,
  moves: Moves.Still, sun: Sun.Proof, comes: Comes.Never, halfWidth: cm(widthCm >> 1), height: cm(heightCm), drops: [], role: STRUCTURE,
});

const GOBLIN_LOOT: readonly Drop[] = [
  { res: Res.Leather, min: 1, max: 1, chancePm: 200 },
  { res: Res.Hexstone, min: 1, max: 1, chancePm: 50 },
  { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 20 },
];

/** The boss (roster 5.25), and his second form aloft: a high flyer at 4 m/s (s). */
const MORVATH: MobRow = {
  // The boss (roster 5.25): never bought from the budget; threats/boss.ts brings him. XP by the header rule, health / 50 (s).
  ...base, id: Mob.Morvath, name: 'Morvath, the Hollow Crown', model: 'morvath', firstNight: 110, hp: 25000, armourBp: 5000, damage: 80, attackSteps: ds(20), reach: cm(400), speed: v10(25), vsWalls: 400,
  moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 5000, halfWidth: cm(80), height: cm(450), demon: Demon.Purple,
  drops: [{ res: Res.ManaCrystal, min: 20, max: 20, chancePm: 1000 }, { res: Res.Gold, min: 10, max: 10, chancePm: 1000 }, { res: Res.Diamonds, min: 3, max: 3, chancePm: 1000 }],
};

/** Every mob as written; MOBS adds each one's threat. */
const MOB_ROWS: readonly MobRow[] = [
  {
    ...base, id: Mob.Zombie, traits: [Trait.Debuffs], name: 'Zombie', model: 'zombie', firstNight: 0, hp: 60, damage: 8, attackSteps: ds(16), reach: cm(120), speed: v10(14), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Wave, halfWidth: cm(30), height: cm(170), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 150 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 20 }, { res: Res.Gold, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.CaveBat, name: 'Cave bat', model: 'cave_bat', firstNight: 0, hp: 25, damage: 6, attackSteps: ds(10), reach: cm(100), speed: v10(60), vsWalls: 0,
    moves: Moves.LowFlyer, sun: Sun.Flees, comes: Comes.Wave, halfWidth: cm(40), height: cm(40),
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 50 }],
  },
  {
    ...base, id: Mob.GiantRat, name: 'Giant rat', model: 'giant_rat', firstNight: 0, hp: 26, damage: 5, attackSteps: ds(8), reach: cm(100), speed: v10(45), climbSpeed: v10(5), vsWalls: 3,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Pack, halfWidth: cm(30), height: cm(50),
    drops: [{ res: Res.Hides, min: 1, max: 1, chancePm: 80 }, { res: Res.RatMeat, min: 1, max: 1, chancePm: 50 }],
  },
  {
    ...base, id: Mob.GiantSpider, traits: [Trait.Debuffs], name: 'Giant spider', model: 'giant_spider', firstNight: 0, hp: 40, armourBp: 1000, damage: 16, attackSteps: ds(13), reach: cm(150),
    range: cm(800), shot: Shot.Web, spreadBp: 500, speed: v10(35), climbSpeed: v10(8), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(60), height: cm(60),
    drops: [{ res: Res.SpiderSilk, min: 1, max: 2, chancePm: 200 }, { res: Res.Emeralds, min: 1, max: 1, chancePm: 10 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.Slime, traits: [Trait.Debuffs], splitsInto: [[Mob.SmallSlime, 2]], name: 'Slime', model: 'slime', firstNight: 0, hp: 90, pierceBp: 5000, damage: 10, attackSteps: ds(18), reach: cm(120), speed: v10(12), vsWalls: 6,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(40), height: cm(42), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 100 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 25 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 25 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.SmallSlime, name: 'Small slime', model: 'slime', firstNight: 0, hp: 30, pierceBp: 5000, damage: 5, attackSteps: ds(18), reach: cm(100), speed: v10(12), vsWalls: 3,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Never, halfWidth: cm(20), height: cm(21), undead: true,
    drops: [],
  },
  {
    ...base, id: Mob.SkeletonArcher, name: 'Skeleton archer', model: 'skeleton_archer', firstNight: 5, hp: 45, pierceBp: 5000, bluntBp: 15000, damage: 9, attackSteps: ds(22), reach: cm(120),
    range: cm(1800), shot: Shot.BoneArrow, spreadBp: 700, speed: v10(22), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Wave, halfWidth: cm(30), height: cm(175), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 1, chancePm: 150 }],
  },
  {
    ...base, id: Mob.BloatedCorpse, traits: [Trait.Bursts], name: 'Bloated corpse', model: 'bloated_corpse', firstNight: 10, hp: 260, armourBp: 1000, damage: 28, attackSteps: ds(24), reach: cm(150), speed: v10(11), vsWalls: 15,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(55), height: cm(190), arc: true, undead: true,
    drops: [{ res: Res.Bone, min: 2, max: 2, chancePm: 200 }, { res: Res.CopperOre, min: 1, max: 1, chancePm: 20 }, { res: Res.Silver, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.SkeletonBomber, name: 'Skeleton bomber', model: 'skeleton_bomber', firstNight: 10, hp: 35, pierceBp: 5000, bluntBp: 15000, damage: 60, attackSteps: ds(10), reach: cm(120), speed: v10(32), vsWalls: 300,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(35), height: cm(175), undead: true,
    drops: [{ res: Res.Saltpetre, min: 1, max: 1, chancePm: 100 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 50 }, { res: Res.Bone, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.BombKeg, name: 'Loose bomb', model: 'bomb_keg', firstNight: 10, hp: 1, damage: 60, attackSteps: ds(20), reach: 0, speed: 0, vsWalls: 300,
    moves: Moves.Still, sun: Sun.Burns, comes: Comes.Never, halfWidth: cm(30), height: cm(65),
    drops: [],
  },
  {
    ...base, id: Mob.GoblinCutter, name: 'Goblin cutter', model: 'goblin', firstNight: 15, hp: 40, armourBp: 1000, damage: 7, attackSteps: ds(9), reach: cm(100), speed: v10(34), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Wave, halfWidth: cm(30), height: cm(120),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinSlinger, name: 'Goblin slinger', model: 'goblin_slinger', firstNight: 15, hp: 30, damage: 6, attackSteps: ds(18), reach: cm(100), range: cm(1400), shot: Shot.GoblinStone, spreadBp: 800, speed: v10(34), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Wave, halfWidth: cm(30), height: cm(120),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinChief, traits: [Trait.Rallies], name: 'Goblin chief', model: 'goblin_chief', firstNight: 15, hp: 150, armourBp: 1500, damage: 18, attackSteps: ds(14), reach: cm(150), speed: v10(32), vsWalls: 8,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Alone, halfWidth: cm(35), height: cm(140),
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 50 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 50 }, { res: Res.Hides, min: 1, max: 1, chancePm: 50 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GraveHound, traits: [Trait.Rallies], name: 'Grave hound', model: 'grave_hound', firstNight: 20, hp: 70, damage: 11, attackSteps: ds(9), reach: cm(120), speed: v10(55), vsWalls: 2,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Pack, halfWidth: cm(30), height: cm(80), undead: true,
    drops: [{ res: Res.Bone, min: 1, max: 2, chancePm: 200 }],
  },
  // Lair guardians (roster 6.1). The centipede's attack time is the Rift centipede's 1.2 s (s); the wraith's bolt every 2 s (s).
  {
    ...base, id: Mob.GiantCentipede, name: 'Giant centipede', model: 'giant_centipede', firstNight: 0, hp: 150, armourBp: 2500, damage: 14, poison: 10, attackSteps: ds(12), reach: cm(150), speed: v10(35), climbSpeed: v10(8), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Flees, comes: Comes.Never, xpTenths: 30, halfWidth: cm(50), height: cm(50), role: RESIDENT,
    drops: [{ res: Res.Venom, min: 1, max: 1, chancePm: 300 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Myconid, name: 'Myconid', model: 'myconid', firstNight: 0, hp: 100, damage: 10, attackSteps: ds(15), reach: cm(150), speed: v10(15), vsWalls: 3,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Never, xpTenths: 20, halfWidth: cm(40), height: cm(120), role: RESIDENT,
    drops: [{ res: Res.ManaCrystal, min: 1, max: 1, chancePm: 200 }, { res: Res.Herbs, min: 1, max: 1, chancePm: 1000 }],
  },
  {
    ...base, id: Mob.AshGolem, name: 'Ash golem', model: 'ash_golem', firstNight: 45, hp: 1200, armourBp: 5000, damage: 50, attackSteps: ds(22), reach: cm(250), speed: v10(20), vsWalls: 60,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 240, halfWidth: cm(110), height: cm(350), arc: true, role: RESIDENT,
    drops: [{ res: Res.Coal, min: 4, max: 4, chancePm: 1000 }, { res: Res.Sulphur, min: 2, max: 2, chancePm: 1000 }, { res: Res.IronRock, min: 2, max: 2, chancePm: 1000 }],
  },
  {
    ...base, id: Mob.ManaWraith, name: 'Mana wraith', model: 'mana_wraith', firstNight: 80, hp: 300, pierceBp: 5000, damage: 25, attackSteps: ds(20), reach: cm(150),
    range: cm(1800), shot: Shot.ManaBolt, spreadBp: 300, speed: v10(30), vsWalls: 0,
    moves: Moves.LowFlyer, sun: Sun.Flees, comes: Comes.Never, xpTenths: 60, halfWidth: cm(45), height: cm(180), role: RESIDENT,
    drops: [{ res: Res.ManaCrystal, min: 2, max: 3, chancePm: 1000 }],
  },
  // Hostile tribes (roster 6.1, Table 16). They roam by day, so none of them burns or flees in the sun (s: the roster's kobold "flees").
  {
    ...base, id: Mob.Gnoll, name: 'Gnoll', model: 'gnoll', firstNight: 0, hp: 80, armourBp: 1500, damage: 10, attackSteps: ds(13), reach: cm(200), speed: v10(35), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 30, halfWidth: cm(35), height: cm(190), role: TRIBE,
    drops: [{ res: Res.Hides, min: 1, max: 1, chancePm: 1000 }, { res: Res.WroughtIron, min: 1, max: 1, chancePm: 100 }, { res: Res.Gold, min: 1, max: 1, chancePm: 30 }],
  },
  {
    ...base, id: Mob.Kobold, name: 'Kobold', model: 'kobold', firstNight: 0, hp: 28, armourBp: 500, damage: 6, attackSteps: ds(10), reach: cm(200), speed: v10(35), climbSpeed: v10(8), vsWalls: 2,
    moves: Moves.Climber, sun: Sun.Proof, comes: Comes.Never, xpTenths: 10, halfWidth: cm(25), height: cm(110), role: TRIBE,
    drops: [{ res: Res.CopperOre, min: 1, max: 1, chancePm: 200 }, { res: Res.TinOre, min: 1, max: 1, chancePm: 200 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Hobgoblin, name: 'Hobgoblin', model: 'hobgoblin', firstNight: 0, hp: 60, armourBp: 4000, damage: 10, attackSteps: ds(14), reach: cm(150), speed: v10(28), vsWalls: 8,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 40, blockBp: 5000, halfWidth: cm(35), height: cm(180), role: TRIBE,
    drops: [{ res: Res.WroughtIron, min: 1, max: 1, chancePm: 200 }, { res: Res.Silver, min: 1, max: 1, chancePm: 30 }],
  },
  // Goblin villages (roster 6.3): 1.2 m tall, out by day, home at night. XP by the header rule: HP / 50, at least 1.
  {
    ...base, id: Mob.VillageGoblin, name: 'Goblin', model: 'goblin', firstNight: 0, hp: 30, armourBp: 1000, damage: 7, attackSteps: ds(9), reach: cm(100), speed: v10(34), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE,
    drops: [{ res: Res.Sticks, min: 3, max: 3, chancePm: 100 }, ...GOBLIN_LOOT],
  },
  {
    ...base, id: Mob.GoblinArcher, name: 'Goblin archer', model: 'goblin_archer', firstNight: 0, hp: 20, damage: 7, attackSteps: ds(20), reach: cm(100), range: cm(1600), shot: Shot.Arrow, spreadBp: 800, speed: v10(34), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE,
    drops: [{ res: Res.Feathers, min: 2, max: 4, chancePm: 300 }, { res: Res.Leather, min: 1, max: 1, chancePm: 150 }, { res: Res.Hexstone, min: 1, max: 1, chancePm: 50 }, { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.GoblinMage, name: 'Goblin mage', model: 'goblin_mage', firstNight: 0, hp: 25, damage: 8, attackSteps: ds(30), reach: cm(100), range: cm(1400), shot: Shot.Spark, spreadBp: 400, speed: v10(30), vsWalls: 1,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 10, halfWidth: cm(30), height: cm(120), role: VILLAGE, mana: 60,
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
  // Milestone 7: the peoples' buildings (s): health and a footprint to fit their models.
  stand(Mob.HalflingBurrow, 'Halfling burrow', 'halfling_burrow', 0, 400, 600, 300),
  stand(Mob.HalflingMill, 'Halfling windmill', 'halfling_mill', 0, 300, 400, 700),
  stand(Mob.HalflingInn, 'Halfling inn', 'halfling_inn', 0, 600, 900, 600),
  stand(Mob.HalflingBarn, 'Halfling barn', 'halfling_barn', 0, 400, 700, 500),
  stand(Mob.RunkinTent, 'Hide tent', 'runkin_tent', 0, 120, 400, 300),
  stand(Mob.RunkinDryingRack, 'Drying rack', 'runkin_drying_rack', 0, 60, 300, 200),
  stand(Mob.RunkinWolfDen, 'Wolf den', 'runkin_wolf_den', 0, 100, 400, 200),
  stand(Mob.RunkinFire, 'Fire ring', 'runkin_fire', 0, 80, 300, 100),
  stand(Mob.ElfHall, 'Elf hall', 'elf_hall', 0, 1200, 1200, 1200),
  stand(Mob.ElfTreePlatform, 'Tree platform', 'elf_tree_platform', 0, 500, 800, 900),
  stand(Mob.ElfBearPen, 'Bear pen', 'elf_bear_pen', 0, 500, 900, 300),
  stand(Mob.ElfGate, 'Leaf gate', 'elf_gate', 0, 1500, 900, 800),
  {
    ...stand(Mob.ElfCaravanWagon, 'Elf caravan wagon', 'elf_caravan_wagon', 0, 200, 300, 300),
    speed: v10(25), moves: Moves.Walker, role: PEOPLE,
  },
  stand(Mob.DwarfHouse, 'Dwarf house', 'dwarf_house', 0, 800, 700, 500),
  stand(Mob.DwarfForge, 'Dwarf forge', 'dwarf_forge', 0, 900, 700, 600),
  stand(Mob.DwarfMineshaft, 'Dwarf mineshaft', 'dwarf_mineshaft', 0, 700, 600, 500),
  stand(Mob.DwarfHall, 'Pillared hall', 'dwarf_hall', 0, 2000, 1200, 800),
  stand(Mob.DwarfCityGate, 'City gate', 'dwarf_city_gate', 0, 3000, 1200, 1000),
  // Milestone 8. A goblin wolf rider (roster 6.3, Table 14): the rider's 45 health (50 before Patch 3) with its wolf's 70 beside it (the entity's mount),
  // the rider's spear 9 a second at 2 m and the wolf's bite; at a gallop of 5.5 m/s. Without its wolf it is a goblin on foot.
  {
    ...base, id: Mob.GoblinWolfRider, name: 'Goblin wolf rider', model: 'goblin_wolf_rider', firstNight: 0, hp: 45, armourBp: 1000, damage: 9, attackSteps: ds(10), reach: cm(200), speed: v10(55), vsWalls: 4,
    moves: Moves.Walker, sun: Sun.Proof, comes: Comes.Never, xpTenths: 20, halfWidth: cm(45), height: cm(190), role: VILLAGE,
    drops: [{ res: Res.BronzeIngot, min: 1, max: 1, chancePm: 150 }, { res: Res.Leather, min: 1, max: 2, chancePm: 300 }, { res: Res.Hides, min: 1, max: 1, chancePm: 1000 }, { res: Res.Silver, alt: Res.Gold, min: 1, max: 1, chancePm: 30 }],
  },
  // The wolf pen of a village of 4 huts or more (Table 17, s: 300 health).
  stand(Mob.GoblinWolfPen, 'Goblin wolf pen', 'goblin_wolf_pen', 0, 300, 500, 200),
  // Night mobs 25 to 110 (roster 5.0 stats; abilities in threats/late-mobs.ts). Attack times the roster leaves open are (s).
  {
    ...base, id: Mob.BarrowKnight, traits: [Trait.ShieldWall], name: 'Barrow knight', model: 'barrow_knight', firstNight: 25, hp: 320, armourBp: 3500, pierceBp: 5000, bluntBp: 15000, damage: 24, attackSteps: ds(16), reach: cm(150), speed: v10(24), vsWalls: 10,
    moves: Moves.Walker, sun: Sun.Smoulders, comes: Comes.Trickle, halfWidth: cm(35), height: cm(185), undead: true,
    drops: [{ res: Res.WroughtIron, min: 1, max: 1, chancePm: 100 }, { res: Res.Bone, min: 2, max: 2, chancePm: 150 }, { res: Res.Silver, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.PlagueBearer, traits: [Trait.Aura, Trait.Debuffs], name: 'Plague bearer', model: 'plague_bearer', firstNight: 30, hp: 180, armourBp: 1000, damage: 10, attackSteps: ds(16), reach: cm(200), speed: v10(16), vsWalls: 5,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(35), height: cm(180), arc: true, undead: true,
    drops: [{ res: Res.Herbs, min: 1, max: 2, chancePm: 150 }, { res: Res.Bone, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.Gravewing, traits: [Trait.Snatches], name: 'Gravewing', model: 'gravewing', firstNight: 30, hp: 70, damage: 12, attackSteps: ds(12), reach: cm(150), speed: v10(70), vsWalls: 0,
    moves: Moves.HighFlyer, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(60), height: cm(80), undead: true,
    drops: [{ res: Res.Feathers, min: 2, max: 4, chancePm: 250 }, { res: Res.Bone, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.BoneColossus, traits: [Trait.HitsDefences], name: 'Bone colossus', model: 'bone_colossus', firstNight: 35, hp: 900, armourBp: 3000, pierceBp: 5000, bluntBp: 15000, damage: 45, attackSteps: ds(28), reach: cm(250),
    range: cm(2000), shot: Shot.BoneBoulder, spreadBp: 500, speed: v10(13), vsWalls: 120,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(100), height: cm(340), arc: true, undead: true,
    drops: [{ res: Res.Bone, min: 2, max: 4, chancePm: 500 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.HollowPriest, traits: [Trait.Summons], name: 'Hollow priest', model: 'hollow_priest', firstNight: 40, hp: 140, damage: 14, attackSteps: ds(25), reach: cm(120), range: cm(1600), strike: Strike.Curse, speed: v10(20), vsWalls: 0,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(35), height: cm(190), undead: true,
    drops: [{ res: Res.ManaCrystal, min: 1, max: 1, chancePm: 80 }, { res: Res.Silver, min: 1, max: 1, chancePm: 20 }, { res: Res.Emeralds, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.Cinderling, traits: [Trait.Ignites], name: 'Cinderling', model: 'cinderling', firstNight: 45, hp: 40, damage: 6, attackSteps: ds(8), reach: cm(100), speed: v10(45), climbSpeed: v10(8), vsWalls: 4,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Wave, halfWidth: cm(30), height: cm(90), demon: Demon.Red, woodClimber: true,
    drops: [{ res: Res.Sulphur, min: 1, max: 1, chancePm: 150 }, { res: Res.Coal, min: 1, max: 1, chancePm: 100 }, { res: Res.DemonHorn, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Hellhound, traits: [Trait.Aura, Trait.Ignites], name: 'Hellhound', model: 'hellhound', firstNight: 50, hp: 160, armourBp: 1000, damage: 18, attackSteps: ds(10), reach: cm(120), speed: v10(60), vsWalls: 6,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Pack, halfWidth: cm(40), height: cm(120), demon: Demon.Red,
    drops: [{ res: Res.Sulphur, min: 1, max: 1, chancePm: 180 }, { res: Res.Coal, min: 1, max: 1, chancePm: 100 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.Fiend, traits: [Trait.Fury], name: 'Fiend', model: 'fiend', firstNight: 55, hp: 380, armourBp: 3000, damage: 30, attackSteps: ds(15), reach: cm(180), speed: v10(28), vsWalls: 15,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Wave, halfWidth: cm(45), height: cm(220), arc: true, demon: Demon.Red,
    drops: [{ res: Res.Sulphur, min: 1, max: 1, chancePm: 150 }, { res: Res.DemonHorn, min: 1, max: 1, chancePm: 100 }, { res: Res.WroughtIron, min: 1, max: 1, chancePm: 80 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 10 }],
  },
  {
    // Fire drop from above (s: every 2 s, from up to 8 m), the claw when it swoops.
    ...base, id: Mob.Scorchwing, traits: [Trait.Ignites], name: 'Scorchwing', model: 'scorchwing', firstNight: 60, hp: 150, armourBp: 1000, damage: 14, attackSteps: ds(20), reach: cm(150),
    range: cm(800), shot: Shot.FirePitch, spreadBp: 400, speed: v10(65), vsWalls: 20,
    moves: Moves.LowFlyer, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(80), height: cm(160), demon: Demon.Red,
    drops: [{ res: Res.Sulphur, min: 1, max: 1, chancePm: 150 }, { res: Res.Coal, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.DemonBrute, name: 'Demon brute', model: 'demon_brute', firstNight: 65, hp: 1400, armourBp: 3500, damage: 50, attackSteps: ds(25), reach: cm(250), speed: v10(18), vsWalls: 180,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(110), height: cm(300), arc: true, demon: Demon.Red, knockWu: cm(200),
    drops: [{ res: Res.Sulphur, min: 2, max: 3, chancePm: 250 }, { res: Res.DemonHorn, min: 1, max: 2, chancePm: 200 }, { res: Res.WroughtIron, min: 1, max: 1, chancePm: 100 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Flamecaller, traits: [Trait.Ignites], name: 'Flamecaller', model: 'flamecaller', firstNight: 70, hp: 220, armourBp: 1000, damage: 30, attackSteps: ds(30), reach: cm(120),
    range: cm(2200), shot: Shot.Hellfire, spreadBp: 300, speed: v10(22), vsWalls: 30,
    moves: Moves.Walker, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(35), height: cm(210), demon: Demon.Red,
    drops: [{ res: Res.Sulphur, min: 1, max: 2, chancePm: 200 }, { res: Res.DemonHorn, min: 1, max: 1, chancePm: 80 }, { res: Res.ManaCrystal, min: 1, max: 1, chancePm: 50 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.ChainFiend, traits: [Trait.HitsDefences], name: 'Chain fiend', model: 'chain_fiend', firstNight: 75, hp: 450, armourBp: 2500, damage: 26, attackSteps: ds(14), reach: cm(180), speed: v10(30), climbSpeed: v10(10), vsWalls: 10,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(40), height: cm(240), demon: Demon.Red,
    drops: [{ res: Res.WroughtIron, min: 1, max: 1, chancePm: 120 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 120 }],
  },
  {
    ...base, id: Mob.VoidStalker, traits: [Trait.Hidden], name: 'Void stalker', model: 'void_stalker', firstNight: 80, hp: 500, armourBp: 2000, damage: 30, attackSteps: ds(10), reach: cm(150), speed: v10(45), vsWalls: 5,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Trickle, halfWidth: cm(35), height: cm(200), demon: Demon.Purple,
    drops: [{ res: Res.ManaCrystal, min: 1, max: 2, chancePm: 200 }, { res: Res.Emeralds, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.InfernalJuggernaut, traits: [Trait.Aura, Trait.WeakBack], name: 'Infernal juggernaut', model: 'infernal_juggernaut', firstNight: 85, hp: 3000, armourBp: 5000, damage: 60, attackSteps: ds(30), reach: cm(300), speed: v10(12), vsWalls: 300,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(150), height: cm(400), arc: true, demon: Demon.Red,
    drops: [{ res: Res.IronIngot, min: 1, max: 1, chancePm: 150 }, { res: Res.Sulphur, min: 1, max: 2, chancePm: 400 }, { res: Res.Coal, min: 1, max: 2, chancePm: 400 }, { res: Res.Rubies, min: 1, max: 1, chancePm: 20 }],
  },
  {
    // Drain: 20 a second, so one strike a second (s).
    ...base, id: Mob.VoidWitch, traits: [Trait.Heals, Trait.Debuffs, Trait.Blinks], name: 'Void witch', model: 'void_witch', firstNight: 90, hp: 600, armourBp: 1000, damage: 20, attackSteps: ds(10), reach: cm(150), range: cm(2000), strike: Strike.Drain, speed: v10(25), vsWalls: 0,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Alone, halfWidth: cm(40), height: cm(220), demon: Demon.Purple, mana: 0,
    drops: [{ res: Res.ManaCrystal, min: 2, max: 3, chancePm: 300 }, { res: Res.Diamonds, min: 1, max: 1, chancePm: 10 }],
  },
  {
    // Void breath: 40 a second along a 12 m line, so one strike a second (s).
    ...base, id: Mob.AbyssalDrake, name: 'Abyssal drake', model: 'abyssal_drake', firstNight: 95, hp: 1800, armourBp: 3000, damage: 40, attackSteps: ds(10), reach: cm(200), range: cm(1200), strike: Strike.Breath, speed: v10(90), vsWalls: 40,
    moves: Moves.HighFlyer, sun: Sun.Flees, comes: Comes.Alone, halfWidth: cm(200), height: cm(250), demon: Demon.Purple,
    drops: [{ res: Res.ManaCrystal, min: 1, max: 2, chancePm: 350 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }, { res: Res.Diamonds, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.Archfiend, traits: [Trait.Rallies, Trait.Summons], name: 'Archfiend', model: 'archfiend', firstNight: 100, hp: 4000, armourBp: 4500, damage: 70, attackSteps: ds(20), reach: cm(250), speed: v10(30), vsWalls: 60,
    moves: Moves.Walker, sun: Sun.Flees, comes: Comes.Alone, halfWidth: cm(60), height: cm(320), arc: true, demon: Demon.Purple, perNight: 1,
    drops: [{ res: Res.ManaCrystal, min: 2, max: 2, chancePm: 400 }, { res: Res.DemonHorn, min: 1, max: 1, chancePm: 300 }, { res: Res.Gold, min: 1, max: 1, chancePm: 50 }, { res: Res.Rubies, alt: Res.Diamonds, min: 1, max: 1, chancePm: 50 }],
  },
  {
    // The slam every 3 s (s) on everything within 6 m.
    ...base, id: Mob.RiftColossus, traits: [Trait.HitsDefences], name: 'Rift colossus', model: 'rift_colossus', firstNight: 105, hp: 8000, armourBp: 5000, damage: 60, attackSteps: ds(30), reach: cm(300), speed: v10(12), vsWalls: 600,
    moves: Moves.Breaker, sun: Sun.Flees, comes: Comes.Alone, halfWidth: cm(200), height: cm(600), demon: Demon.Purple, perNight: 2, slamRadius: cm(600), knockWu: cm(200),
    drops: [{ res: Res.ManaCrystal, min: 2, max: 2, chancePm: 500 }, { res: Res.Gold, min: 1, max: 1, chancePm: 50 }, { res: Res.Diamonds, min: 1, max: 1, chancePm: 50 }],
  },
  MORVATH,
  // The Rift-touched beasts (roster 5.24): 1.5 times the creature's health and 1.25 times its damage; they burn at dawn.
  {
    // Pinch 12, and on every other hit the sting: 10 and 30 poison over 5 s.
    ...base, id: Mob.RiftScorpion, traits: [Trait.Poisons], name: 'Rift scorpion', model: 'giant_scorpion', tint: 'rift', firstNight: 50, hp: 165, armourBp: 3500, damage: 12, attackSteps: ds(12), reach: cm(150), speed: v10(30), climbSpeed: v10(8), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Pack, halfWidth: cm(60), height: cm(50),
    drops: [{ res: Res.Venom, min: 1, max: 1, chancePm: 200 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 80 }, { res: Res.Emeralds, alt: Res.Rubies, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.RiftCentipede, name: 'Rift centipede', model: 'giant_centipede', tint: 'rift', firstNight: 55, hp: 225, armourBp: 2500, damage: 17, poison: 12, attackSteps: ds(12), reach: cm(150), speed: v10(35), climbSpeed: v10(10), vsWalls: 5,
    moves: Moves.Climber, sun: Sun.Burns, comes: Comes.Trickle, halfWidth: cm(50), height: cm(50),
    drops: [{ res: Res.Venom, min: 1, max: 1, chancePm: 150 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 80 }],
  },
  {
    ...base, id: Mob.RiftHornet, traits: [Trait.Debuffs], name: 'Rift hornet', model: 'giant_hornet', tint: 'rift', firstNight: 60, hp: 60, damage: 15, attackSteps: ds(15), reach: cm(100), speed: v10(65), vsWalls: 0,
    moves: Moves.LowFlyer, sun: Sun.Burns, comes: Comes.Wave, halfWidth: cm(30), height: cm(30),
    drops: [{ res: Res.Venom, min: 1, max: 1, chancePm: 100 }],
  },
  {
    ...base, id: Mob.RiftBeetle, name: 'Rift beetle', model: 'giant_beetle', tint: 'rift', firstNight: 65, hp: 180, armourBp: 4000, damage: 17, attackSteps: ds(15), reach: cm(150), speed: v10(32), vsWalls: 40,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Pack, halfWidth: cm(60), height: cm(60), knockWu: cm(100),
    drops: [{ res: Res.Sulphur, min: 1, max: 1, chancePm: 100 }, { res: Res.Gold, min: 1, max: 1, chancePm: 10 }],
  },
  {
    ...base, id: Mob.RiftGriffin, traits: [Trait.Snatches], name: 'Rift griffin', model: 'griffin', tint: 'rift', firstNight: 70, hp: 900, armourBp: 2000, damage: 44, attackSteps: ds(15), reach: cm(200), speed: v10(100), vsWalls: 10,
    moves: Moves.LowFlyer, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(100), height: cm(180),
    drops: [{ res: Res.Feathers, min: 2, max: 2, chancePm: 500 }, { res: Res.ManaCrystal, min: 1, max: 1, chancePm: 100 }, { res: Res.Gold, min: 1, max: 1, chancePm: 20 }],
  },
  {
    ...base, id: Mob.RiftMinotaur, name: 'Rift minotaur', model: 'minotaur', tint: 'rift', firstNight: 75, hp: 1350, armourBp: 3000, damage: 56, attackSteps: ds(20), reach: cm(250), speed: v10(35), vsWalls: 90,
    moves: Moves.Breaker, sun: Sun.Burns, comes: Comes.Alone, halfWidth: cm(80), height: cm(260), arc: true, knockWu: cm(200),
    drops: [{ res: Res.Hides, min: 1, max: 1, chancePm: 500 }, { res: Res.Sulphur, min: 1, max: 1, chancePm: 250 }, { res: Res.Gold, min: 1, max: 1, chancePm: 50 }],
  },
  { ...MORVATH, id: Mob.MorvathAloft, moves: Moves.HighFlyer, speed: v10(40) },
];

/**
 * What the threat algorithm reads of a row (combat/threat.ts): its numbers,
 * how its strike lands, and its traits, those read from its numbers (flying,
 * climbing, breaking walls, long reach, knockback) with those it lists.
 */
export function threatInput(r: MobRow): ThreatInput {
  const flyer = r.moves === Moves.LowFlyer || r.moves === Moves.HighFlyer;
  // Web spit only slows (its Debuffs trait): it is not a ranged attack.
  const ranged = r.range > 0 && !(r.strike === Strike.Shot && r.shot === Shot.Web);
  const once = bomber(r);
  const area = once ? Area.Blast : r.slamRadius > 0 ? Area.Slam : r.arc ? Area.Arc : ranged && r.strike === Strike.Breath ? Area.Line : Area.One;
  const traits: Trait[] = [];
  if (flyer) traits.push(ranged ? Trait.RangedFlyer : Trait.MeleeFlyer);
  if (r.moves === Moves.Climber) traits.push(r.woodClimber ? Trait.WoodClimber : Trait.Climber);
  if (r.moves === Moves.Breaker) traits.push(Trait.Breaker);
  if (!ranged && r.reach >= floorDiv(THREAT.overWallReachCm * WU_PER_METRE, 100)) traits.push(Trait.OverWalls);
  if (r.knockWu > 0) traits.push(Trait.Knockback);
  traits.push(...r.traits);
  const splash = ranged && r.strike === Strike.Shot ? (SHOTS[r.shot]?.splash ?? 0) : 0;
  return {
    hp: r.hp, armourBp: r.armourBp, pierceBp: r.pierceBp, bluntBp: r.bluntBp, blockBp: r.blockBp, damage: r.damage, poison: r.poison,
    attackSteps: r.attackSteps, area, splash, vsWalls: r.vsWalls, range: ranged ? r.range : 0, reach: r.reach, speed: r.speed, once, traits,
  };
}

/** A night monster's threat in tenths (combat/threat.ts), with the effective health of what it splits into; 0 for every other mob. */
export function rowThreatTenths(r: MobRow, rows: readonly MobRow[] = MOBS): number {
  if (r.role !== 0 || r.comes === Comes.Never) return 0;
  let extra = 0;
  for (const [m, n] of r.splitsInto) {
    const young = rows[m];
    if (young) extra += n * effectiveHealth100(threatInput(young));
  }
  return threatTenths(threatInput(r), extra);
}

/** Every mob, with the threat of each night monster worked out from its row. */
// The rows come in as the map's third argument so the table is named once, which balance:apply needs to find each row's numbers.
export const MOBS: readonly MobSpec[] = MOB_ROWS.map((r, _, rows) => ({ ...r, threatTenths: rowThreatTenths(r, rows) }));

/** Whether a mob is a lair (Table 15). */
export function isLair(mob: number): boolean {
  return mob >= Mob.LairBarrow && mob <= Mob.LairVoidRift;
}

/** Whether a mob is a thing that stands and is broken (a lair or a village building). */
export function isStructure(mob: number): boolean {
  return MOBS[mob]?.role === STRUCTURE;
}

/** Whether a mob flies (low or high): it goes over walls and the land. */
export function flies(spec: MobSpec): boolean {
  return spec.moves === Moves.LowFlyer || spec.moves === Moves.HighFlyer;
}

/** Breakers that blow themselves up against what blocks them (skeleton bombers); every other breaker smashes it. */
export function bomber(spec: MobRow): boolean {
  return spec.id === Mob.SkeletonBomber;
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
/** A high flyer circles at 12 m (s), out of reach of everything but bows, guns and magic. */
export const HIGH_FLY_HEIGHT = cm(1200);
/**
 * The swoop (Jade's patch notes 1): a flyer dives at up to 8 m/s and climbs
 * at up to 5 m/s, so it glides down onto its prey and pulls away rather than
 * dropping in one step. After each blow it pulls off and up to a point round
 * where its prey stood, 55% to 95% of its striking distance out and 1.4 m
 * to 2.2 m up, picked afresh for each swoop, and dives from there for the
 * next. It strikes from where it is, as before, so it hits as often, and a
 * club still reaches it all through the swoop, as it did when it hovered
 * low (s).
 */
export const SWOOP = { diveSpeed: v10(80), climbSpeed: v10(50), pullMinPct: 55, pullMaxPct: 95, pullLowCm: 140, pullHighCm: 220 };

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
