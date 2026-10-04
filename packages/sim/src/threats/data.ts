// The numbers of milestone 5's threats as data: the eight lairs (Table 15),
// the night share and the lair cadence (Table 8), the hostile tribes (Table
// 16) and goblin villages (Table 17). Picks are marked (s).

import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { Band } from '../world/layout.ts';
import { Comes, Demon, Mob, MOBS } from '../combat/mobs.ts';

const M = WU_PER_METRE;
const SEC = STEPS_PER_SECOND;

/** Where a lair sits (Table 15 "Band"): anywhere, at the foot of a barrier edge (caves), or in caves and dead forest. */
export const LairSite = { Any: 0, Barrier: 1, CaveOrDeadForest: 2 } as const;
export type LairSite = (typeof LairSite)[keyof typeof LairSite];

export interface LairSpec {
  mob: Mob;
  firstNight: number;
  /** The shallowest band it is placed in. */
  minBand: Band;
  site: LairSite;
  /** Its sleepers on a night (Table 15; types from night 25 up are milestone 8's roster). */
  sleepers: (night: number) => Mob[];
  /** Its guardians, awake from the start. */
  guardians: readonly Mob[];
  /** The night mobs that come out of it at night: its sleepers' kinds and the roster's lair for each mob. */
  spawns: readonly Mob[];
  /** Rift scars and Void rifts glow and are seen from 120 m at night. */
  glows: boolean;
}

const repeat = (m: Mob, n: number): Mob[] => Array.from({ length: n }, () => m);

/** The night mobs of a kind of demon unlocked by a night, newest first (Table 15: "red demons of the current roster"). */
function demonsBy(kind: number, night: number): Mob[] {
  return MOBS.filter((m) => m.demon === kind && m.role === 0 && m.comes !== Comes.Never && m.firstNight <= night).map((m) => m.id).reverse();
}

/** A lair's sleepers drawn from a list in turn: the newest kind first, then round again (s). */
function round(list: readonly Mob[], n: number): Mob[] {
  return list.length === 0 ? [] : Array.from({ length: n }, (_, k) => list[k % list.length]!);
}

const RED_DEMONS = MOBS.filter((m) => m.demon === Demon.Red && m.role === 0 && m.comes !== Comes.Never).map((m) => m.id);
const PURPLE_DEMONS = MOBS.filter((m) => m.demon === Demon.Purple && m.role === 0 && m.comes !== Comes.Never).map((m) => m.id);

export const LAIRS: readonly LairSpec[] = [
  {
    // 4: zombies, skeleton archers from night 5, grave hounds from 20, a hollow priest from 40 (s: one archer, then one hound, then the priest in a zombie's place).
    mob: Mob.LairBarrow, firstNight: 0, minBand: Band.Heartland, site: LairSite.Any,
    sleepers: (n) => [n >= 40 ? Mob.HollowPriest : Mob.Zombie, Mob.Zombie, n >= 20 ? Mob.GraveHound : Mob.Zombie, n >= 5 ? Mob.SkeletonArcher : Mob.Zombie],
    guardians: [Mob.GiantCentipede],
    spawns: [Mob.Zombie, Mob.Slime, Mob.SkeletonArcher, Mob.BloatedCorpse, Mob.SkeletonBomber, Mob.GraveHound, Mob.HollowPriest],
    glows: false,
  },
  {
    // 6: cave bats and giant rats.
    mob: Mob.LairCaveMouth, firstNight: 0, minBand: Band.Heartland, site: LairSite.Barrier,
    sleepers: () => [Mob.CaveBat, Mob.GiantRat, Mob.CaveBat, Mob.GiantRat, Mob.CaveBat, Mob.GiantRat],
    guardians: [Mob.GiantCentipede],
    spawns: [Mob.CaveBat, Mob.GiantRat],
    glows: false,
  },
  {
    // 3 giant spiders, which are also its guard.
    mob: Mob.LairNest, firstNight: 0, minBand: Band.Heartland, site: LairSite.CaveOrDeadForest,
    sleepers: () => [],
    guardians: repeat(Mob.GiantSpider, 3),
    spawns: [Mob.GiantSpider, Mob.Gravewing],
    glows: false,
  },
  {
    // 3 bloated corpses, a plague bearer from night 30.
    mob: Mob.LairMassGrave, firstNight: 10, minBand: Band.Fringe, site: LairSite.Any,
    sleepers: (n) => [...repeat(Mob.BloatedCorpse, 3), ...(n >= 30 ? [Mob.PlagueBearer] : [])],
    guardians: [Mob.Myconid],
    spawns: [Mob.BloatedCorpse, Mob.PlagueBearer],
    glows: false,
  },
  {
    mob: Mob.LairGoblinCamp, firstNight: 15, minBand: Band.Fringe, site: LairSite.Any,
    sleepers: () => [...repeat(Mob.GoblinCutter, 6), ...repeat(Mob.GoblinSlinger, 2)],
    guardians: [Mob.GoblinChief],
    spawns: [Mob.GoblinCutter, Mob.GoblinSlinger, Mob.GoblinChief],
    glows: false,
  },
  {
    // 5: 1 barrow knight, 2 grave hounds, 2 skeleton archers; a bone colossus from night 35.
    mob: Mob.LairGreatBarrow, firstNight: 25, minBand: Band.Fringe, site: LairSite.Any,
    sleepers: (n) => [Mob.BarrowKnight, Mob.GraveHound, Mob.GraveHound, Mob.SkeletonArcher, Mob.SkeletonArcher, ...(n >= 35 ? [Mob.BoneColossus] : [])],
    guardians: [Mob.GiantCentipede, Mob.GiantCentipede],
    spawns: [Mob.SkeletonArcher, Mob.GraveHound, Mob.BarrowKnight, Mob.BoneColossus],
    glows: false,
  },
  {
    // 6 red demons of the current roster (s: the newest kinds in turn); hollow priests come out of them too (roster 5.10).
    mob: Mob.LairRiftScar, firstNight: 45, minBand: Band.Deepwoods, site: LairSite.Any,
    sleepers: (n) => round(demonsBy(Demon.Red, n), 6),
    guardians: [Mob.AshGolem],
    spawns: [...RED_DEMONS, Mob.HollowPriest],
    glows: true,
  },
  {
    // 4 purple demons of the current roster (s: the newest kinds in turn, never more than the night allows of the archfiend and colossus).
    mob: Mob.LairVoidRift, firstNight: 80, minBand: Band.Barrens, site: LairSite.Any,
    sleepers: (n) => round(demonsBy(Demon.Purple, n).filter((m) => m !== Mob.Archfiend && m !== Mob.RiftColossus), 4),
    guardians: [Mob.ManaWraith, Mob.ManaWraith],
    spawns: PURPLE_DEMONS,
    glows: true,
  },
];

export function lairSpec(mob: number): LairSpec | undefined {
  return LAIRS.find((l) => l.mob === mob);
}

/** Table 8 lair cadence, per player: 1 new lair every 3 nights to night 14, every 2 to night 44, 1 a night from 45 (s: the first on night 3, at its dusk). */
export function lairDue(night: number): boolean {
  if (night >= 45) return true;
  if (night >= 15) return (night - 15) % 2 === 0;
  return night > 0 && night % 3 === 0;
}

/** Live lairs per player: 2 + night / 15. */
export function lairCap(night: number): number {
  return 2 + floorDiv(night, 15);
}

/** Lairs stand at least 40 m from claimed land, 30 m from the players' units and 40 m from each other (s). */
export const LAIR_CLAIM_GAP_WU = 40 * M;
export const LAIR_UNIT_GAP_WU = 30 * M;
export const LAIR_GAP_WU = 40 * M;
/** A cleared site holds no lair for 10 days, within 30 m of it (s). */
export const CLEARED_WAIT_STEPS = 10 * CYCLE_STEPS;
export const CLEARED_RADIUS_WU = 30 * M;
/**
 * Each night a live lair sends monsters worth this share of its own threat,
 * percent: its company's threat added up (its sleepers, or its guards when
 * it has none), so a mass grave sends more than a cave mouth (Jade's Patch 3
 * notes; s: 50%, half its sleepers' worth, which keeps all the lairs together
 * near the old fifth of the night through night 60). Doubled on a blood night.
 */
export const LAIR_BUDGET_PCT = 50;
/** A lair's share of the night comes out of its mouth 20 s after night falls (Table 15). */
export const LAIR_SHARE_DELAY_STEPS = 20 * SEC;
/** Residents keep to their lair: they wake to what comes within 12 m, chase to 30 m, and stand in its shade by day (s). */
export const LAIR_AGGRO_WU = 12 * M;
export const LAIR_LEASH_WU = 30 * M;
/** Rift scars and Void rifts are seen from 120 m at night (Table 15). */
export const RIFT_SEEN_WU = 120 * M;
/** The hoard's one valuable by band: Heartland silver, Fringe gold, Deepwoods emerald, Barrens ruby, Deadlands diamond (Table 15). */
export const HOARD_ROLLS = 10;

// ----- Table 8: the budget factors, depth and the blood and fog nights -----

/** Depth weight per unit or building outside the Heartland, per mille of the base budget: Fringe 5, Deepwoods 10, Barrens 20, Deadlands 40. */
export const DEPTH_PM: readonly number[] = [0, 5, 10, 20, 40];
/** Deeper bands draw mob types from later nights: Deepwoods 10 nights ahead, Barrens 25, Deadlands 50. */
export const DEPTH_AHEAD: readonly number[] = [0, 0, 10, 25, 50];
/** A blood night falls when the players' claimed cells reach 60% of a band's cells, never before night 13. */
export const BLOOD_SHARE_PM = 600;
export const BLOOD_FLOOR_NIGHT = 13;
/** The fog night: 10% a night from night 5 (s). */
export const FOG_CHANCE_PCT = 10;
export const FOG_FROM_NIGHT = 5;

// ----- Table 16: hostile tribes -----

export const TRIBES: ReadonlyArray<{ mob: Mob; min: number; max: number }> = [
  { mob: Mob.Gnoll, min: 3, max: 5 },
  { mob: Mob.Kobold, min: 4, max: 6 },
  { mob: Mob.Hobgoblin, min: 3, max: 4 },
];
/** Tribe odds by band, gnoll / kobold / hobgoblin: Fringe 40 / 40 / 20, Deepwoods 20 / 30 / 50. */
export const TRIBE_ODDS: Readonly<Record<number, readonly number[]>> = { [Band.Fringe]: [40, 40, 20], [Band.Deepwoods]: [20, 30, 50] };
/** At most 20 tribesmen per player in the world (s: per player). */
export const TRIBE_CAP_PER_PLAYER = 20;
/** A band every 2 days, the first on day 3 (s). */
export function bandDue(cycle: number): boolean {
  return cycle >= 2 && (cycle - 2) % 2 === 0;
}
/** Bands spawn 60 m from the players' units and buildings, outside claimed land, and within 700 m of a town so they matter (s). */
export const TRIBE_KEEP_AWAY_WU = 60 * M;
export const TRIBE_SPAWN_RANGE_WU = 700 * M;
/** Sight 30 m; a chase is given up 20 s after losing sight (Table 16). */
export const TRIBE_SIGHT_WU = 30 * M;
export const TRIBE_GIVE_UP_STEPS = 20 * SEC;
/** A camp is a 6 m circle with a fire (light 6 m, no claim). */
export const CAMP_RADIUS_WU = 6 * M;

// ----- Table 17: goblin villages -----

/** Fringe 1 village per 12 cells, Deepwoods 1 per 4, never in the start basin. */
export const VILLAGE_ONE_IN: Readonly<Record<number, number>> = { [Band.Fringe]: 12, [Band.Deepwoods]: 4 };
/** Huts stand in a ring 8 m out; the stake ring runs 12 m out (s). */
export const HUT_RING_WU = 8 * M;
/** Table 17: a wolf pen in a village of this many huts or more, and 1 wolf rider for every 2 huts (Milestone 8). */
export const WOLF_PEN_HUTS = 4;
export const HUTS_PER_WOLF_RIDER = 2;
export const STAKE_RING_WU = 12 * M;
/** Goblins attack anything within 25 m of the stake ring and chase 40 m past it, then go home (Table 17). */
export const VILLAGE_AGGRO_WU = STAKE_RING_WU + 25 * M;
export const VILLAGE_CHASE_WU = STAKE_RING_WU + 40 * M;
/** At war: 60% of the fighters (at least 4) march 30 s after dawn. */
export const RAID_SHARE_PCT = 60;
export const RAID_MIN = 4;
export const RAID_AFTER_DAWN_STEPS = 30 * SEC;
/** War after more than 4 kills, or a kill and a broken building. */
export const WAR_KILLS = 5;
/** At peace a village rebuilds 1 hut every 5 days. */
export const REBUILD_STEPS = 5 * CYCLE_STEPS;
/** Workers breaking down a hut get 5 sticks and 2 hides. */
export const HUT_SALVAGE: ReadonlyArray<readonly [number, number]> = [[30, 5], [41, 2]];
