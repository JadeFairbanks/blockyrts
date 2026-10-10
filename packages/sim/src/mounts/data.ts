// Mounts and charges as data (Combat: Charges; Table 14: Mounts and
// charges; Table 1's mounted row; Table 7's riding row). A mounted unit is
// one entity: the rider, with its mount's kind and health beside its own
// (state.ts mount, mountHp). Every number is Table 14's; picks are (s).

import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { Shot } from '../combat/items.ts';
import { DAMAGE_ROLL } from '../rules.ts';

/** What a unit rides (the entity's mount field): nothing, a player's horse, or one of the foes' or peoples' mounts. */
export const Mount = { None: 0, Horse: 1, WarOx: 2, Wolf: 3, Bear: 4 } as const;
export type Mount = (typeof Mount)[keyof typeof Mount];

/** The mount's own attack beside its rider's (Table 14): the war bear's swipe, the war ox's rear archer, the goblin wolf's bite. */
export interface MountAttack {
  damage: number;
  attackSteps: number;
  /** Melee reach, or a shot's range, wu. */
  reach: number;
  /** A swipe hits everything in a 90 degree arc in front; otherwise one target. */
  arc: boolean;
  /** A shot (the war ox's rear rider), or -1 for a melee attack. */
  shot: number;
  spreadBp: number;
  /** Patch 7 (Jade): how far its damage may land above or below its number, bp (rules.ts DAMAGE_ROLL). */
  rollBp: number;
}

export interface MountSpec {
  id: Mount;
  name: string;
  /** Catalogue model of the mount, drawn under the rider (review/batch-2 MANIFEST). */
  model: string;
  hp: number;
  armourBp: number;
  /** Shoulder height and full height (to the top of the head), cm: the knockback rule measures against them. */
  shoulderCm: number;
  heightCm: number;
  /** Walk, trot and gallop, wu per step. */
  walk: number;
  trot: number;
  gallop: number;
  /** Straight running at gallop before a hit counts as a charge, wu. */
  chargeRun: number;
  /** The mount's own attack, if any. */
  attack?: MountAttack;
  /** The animal species a player's mount comes from and goes back to (animals/species.ts), or -1. */
  species: number;
}

const cm = (c: number): number => floorDiv(c * WU_PER_METRE, 100);
/** Tenths of a m/s as wu per step. */
const v10 = (tenths: number): number => floorDiv(tenths * WU_PER_METRE, 10 * STEPS_PER_SECOND);
const ds = (tenths: number): number => floorDiv(tenths * STEPS_PER_SECOND, 10);
/** animals/species.ts Species.Horse, kept as a number so this module stays a leaf. */
const HORSE = 2;

/**
 * Table 14. Full heights (s): a horse 2.4 m to the top of its head, an ox
 * 2.0 m, a goblin wolf 1.2 m, a war bear 2.2 m on all fours; with the knock
 * back rule this throws zombies (1.7 m) back 1 m from a horse and rats 2 m.
 */
export const MOUNTS: readonly MountSpec[] = [
  { id: Mount.None, name: '', model: '', hp: 0, armourBp: 0, shoulderCm: 0, heightCm: 0, walk: 0, trot: 0, gallop: 0, chargeRun: 0, species: -1 },
  { id: Mount.Horse, name: 'Horse', model: 'horse', hp: 160, armourBp: 0, shoulderCm: 160, heightCm: 240, walk: v10(20), trot: v10(50), gallop: v10(80), chargeRun: cm(600), species: HORSE },
  {
    id: Mount.WarOx, name: 'Halfling war ox', model: 'halfling_war_ox', hp: 250, armourBp: 1000, shoulderCm: 150, heightCm: 200, walk: v10(15), trot: v10(35), gallop: v10(50), chargeRun: cm(800), species: -1,
    // The rear rider's shortbow, fired while the ox moves: 1.5 s slower and missing by at most 3%, as every bow (Patch 7, Jade).
    attack: { damage: 12, attackSteps: ds(35), reach: cm(2000), arc: false, shot: Shot.Arrow, spreadBp: 300, rollBp: DAMAGE_ROLL.physicalBp },
  },
  {
    id: Mount.Wolf, name: 'Goblin wolf', model: 'goblin_wolf', hp: 70, armourBp: 0, shoulderCm: 90, heightCm: 120, walk: v10(20), trot: v10(40), gallop: v10(55), chargeRun: cm(500), species: -1,
    // Roster 6.3: wolf bite 10 (s: once a second).
    attack: { damage: 10, attackSteps: ds(10), reach: cm(150), arc: false, shot: -1, spreadBp: 0, rollBp: DAMAGE_ROLL.physicalBp },
  },
  {
    id: Mount.Bear, name: 'Elf war bear', model: 'elf_war_bear', hp: 400, armourBp: 1500, shoulderCm: 150, heightCm: 220, walk: v10(15), trot: v10(40), gallop: v10(60), chargeRun: cm(600), species: -1,
    attack: { damage: 25, attackSteps: ds(15), reach: cm(200), arc: true, shot: -1, spreadBp: 0, rollBp: DAMAGE_ROLL.physicalBp },
  },
];

export function mountSpec(id: number): MountSpec {
  return MOUNTS[id] ?? MOUNTS[0]!;
}

/** Table 1's mounted row (s): 0.5 m more reach from the saddle, 30 m sight, a 60 m leash; a bow shoots with double spread. */
export const MOUNTED = { reachBonus: cm(50), sight: 30 * WU_PER_METRE, leash: 60 * WU_PER_METRE, bowSpreadMul: 2 };

/** Knockback (Table 14): 2 m for a target no taller than 60% of the mount's shoulder, 1 m for one shorter than the mount. */
export const KNOCKBACK = { far: 2 * WU_PER_METRE, near: WU_PER_METRE, farShareBp: 6000 };

/** A run stays straight while the heading turns less than this between steps (s: about 11 degrees), and fast while at 80% of gallop or more. */
export const RUN_TURN = 2048;
export const RUN_SPEED_BP = 8000;
/** Reining in within this distance of its foe does not lose the run: the blow about to fall is still a charge (s). */
export const CHARGE_CLOSE_WU = 4 * WU_PER_METRE;

/** A ridden horse still eats as a working horse does (Table 6: 2 a cycle), with the workers' group. */
export const HORSE_UPKEEP = 2;
