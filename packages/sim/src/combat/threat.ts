// How much threat a night monster is (Jade's Patch 3 notes): worked out
// from its numbers, never set by hand, so a new monster gets its threat the
// moment its row is written. Threat is what a monster costs from the
// night's budget (and XP for a kill is twice it). One threat point is a
// plain body with 40 health that deals 3.3 damage a second, two thirds of
// a zombie (a zombie comes out at 1.5), so a night brings as many monsters
// as it did when threat was set by hand.
//
// The algorithm, step by step (every weight below is in the balance editor
// under Mobs and nights, Threat):
//
// 1. Effective health: its health through its armour and the players' mix
//    of piercing, blunt and other blows (bones and slimes shrug off arrows,
//    bones break under clubs), plus the health of what it splits into.
// 2. Damage a second: its blow (with poison) on as many units as it lands
//    on (one, or more for a sweeping arc, a slam, a line of breath or a
//    blast; a shot's splash on one more), plus a tenth of what it does to
//    walls. A monster that blows itself up counts its one blast over 10 s.
// 3. Power: health and damage together, health counting 3 parts in 5 and
//    damage 2 (a town fights from behind walls and towers, so how much
//    killing a monster takes matters more than how hard it hits).
// 4. Then percentages on top, added together: speed (+5% for each metre a
//    second over 2.5, -20% to +40%), a ranged attack (up to +30% at 20 m),
//    and its traits (flying, climbing, breaking walls and the abilities the
//    code gives it, each a small amount as Jade set out).
//
// Integer maths only: the weighted mean of health and damage is an integer
// root worked out exactly with BigInt.

import { floorDiv, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import { ARMOUR_CAP_BP, BP } from '../rules.ts';

/** The weights of the threat algorithm. */
export const THREAT = {
  /** One threat point is a body with this much effective health... */
  unitHealth: 40,
  /** ...that deals this much damage a second, in tenths (3.3 a second): two thirds of a zombie, so nights 1 to 20 bring as many monsters as before on average, only a truer mix of them (s). */
  unitDpsTenths: 33,
  /** Health counts this many parts, damage the next, in the power (3 and 2: health 60%, damage 40%). */
  healthParts: 3,
  damageParts: 2,
  /** The players' blows that pierce (arrows, bolts, spears, stabs), percent; bones and slimes take their piercing share of these. */
  pierceSharePct: 35,
  /** The players' blows that are blunt (clubs, fists, sling stones, maces), percent; bones take their blunt share. */
  bluntSharePct: 25,
  /** The players' blows that fly (arrows, bolts, stones), percent: a shield's block cuts these. */
  shotSharePct: 40,
  /** How many units each strike lands on, tenths: a sweeping arc, a slam all round, a line of breath, a bomber's blast. */
  arcTargetsTenths: 15,
  slamTargetsTenths: 30,
  lineTargetsTenths: 20,
  blastTargetsTenths: 20,
  /** A shot's splash lands on this many units besides the one it hits, tenths. */
  splashTargetsTenths: 10,
  /** Damage to walls and buildings counts this share as damage to units, percent. */
  wallsPct: 10,
  /** A monster that blows itself up counts its one blast as damage over this many seconds. */
  onceSeconds: 10,
  /** Speed: this much per metre a second over (or under) the reference speed, percent, within the least and most. */
  speedPctPerMs: 5,
  speedRefTenths: 25,
  speedMinPct: -20,
  speedMaxPct: 40,
  /** A ranged attack adds up to this much, percent, at this range or more, in proportion below it. */
  rangedMaxPct: 30,
  rangedFullM: 20,
  /** A melee reach of this much or more strikes over a wall or gate (the polearm rule, combat.ts OVER_WALL_REACH), cm. */
  overWallReachCm: 200,
};

/**
 * A monster's traits. The first seven are worked out from its own numbers;
 * the rest are abilities the code gives it, listed on its row in
 * combat/mobs.ts (`traits`).
 */
export const Trait = {
  /** Flies and fights hand to hand (a cave bat, a gravewing): melee reaches it as it swoops. */
  MeleeFlyer: 0,
  /** Flies and shoots from where close melee cannot reach it (a scorchwing, the abyssal drake). */
  RangedFlyer: 1,
  /** Climbs walls. */
  Climber: 2,
  /** Climbs wooden walls only (the cinderling). */
  WoodClimber: 3,
  /** Breaks walls and buildings in its way, and caves earth in (Moves: Breaker). */
  Breaker: 4,
  /** Strikes over a wall or gate with its long reach. */
  OverWalls: 5,
  /** Its blows throw units back. */
  Knockback: 6,
  /** Weakens what it hits or stands near: slows or holds it (a zombie's grasp, web spit, a slime's engulf, a hornet's sting), stops its healing (miasma) or empties a mage's mana (a hex). */
  Debuffs: 7,
  /** Makes others nearby stronger or faster (a goblin chief's shout, a grave hound's howl, the archfiend's command). */
  Rallies: 8,
  /** Brings more monsters while it lives (a hollow priest raises the dead, the archfiend summons). */
  Summons: 9,
  /** Bursts when it dies (a bloated corpse). */
  Bursts: 10,
  /** Hurts everything near it beside its attack (miasma, heat, fire breath). */
  Aura: 11,
  /** Snatches a lone worker up and drops it. */
  Snatches: 12,
  /** Goes for the defences: boulders at towers, a hook that pulls men off walls, a beam at towers. */
  HitsDefences: 13,
  /** Sets wood alight. */
  Ignites: 14,
  /** Unseen until it strikes, and its first strike is triple. */
  Hidden: 15,
  /** Strikes faster when nearly dead. */
  Fury: 16,
  /** Heals itself by what it takes. */
  Heals: 17,
  /** Blinks away from what comes close. */
  Blinks: 18,
  /** A shield wall that turns arrows from the front. */
  ShieldWall: 19,
  /** A poisoned sting besides its blow. */
  Poisons: 20,
  /** A weak spot: double damage from behind (a weakness, so it takes threat away). */
  WeakBack: 21,
} as const;
export type Trait = (typeof Trait)[keyof typeof Trait];

/**
 * What each trait adds to a monster's threat, percent of its power (Jade:
 * a melee flyer nothing, a ranged flyer about 20%, climbing about 5%, other
 * abilities a similar small amount). Indexed by Trait.
 */
export const TRAIT_PCT: readonly number[] = [
  0, // melee flyer
  20, // ranged flyer
  5, // climber
  3, // wooden walls only
  5, // breaker
  5, // over walls
  5, // knockback
  5, // debuffs
  5, // rallies
  20, // summons (s: Jade's larger amount, for more bodies)
  5, // bursts
  5, // aura
  5, // snatches
  5, // hits defences
  5, // ignites
  5, // hidden
  5, // fury
  5, // heals
  5, // blinks
  5, // shield wall
  5, // poisons
  -5, // weak back
];

/** How a monster's strike lands: on one unit, in a sweeping arc, a slam all round, a line of breath, or a blast it dies in. */
export const Area = { One: 0, Arc: 1, Slam: 2, Line: 3, Blast: 4 } as const;
export type Area = (typeof Area)[keyof typeof Area];

/** What the algorithm reads of a monster (combat/mobs.ts turns a row into this). */
export interface ThreatInput {
  hp: number;
  armourBp: number;
  pierceBp: number;
  bluntBp: number;
  /** A shield's block against what flies, bp. */
  blockBp: number;
  /** Its blow, and the poison the blow adds, in tenths. */
  damageTenths: number;
  poisonTenths: number;
  attackSteps: number;
  area: Area;
  /** A shot's splash on the units round the one it hits. */
  splash: number;
  vsWalls: number;
  /** The range of its ranged attack, wu; 0 for none. */
  range: number;
  /** Melee reach, wu. */
  reach: number;
  /** Running speed, wu per step. */
  speed: number;
  /** It blows itself up: its strike comes once. */
  once: boolean;
  /** Every trait it has, worked out and listed. */
  traits: readonly Trait[];
}

/** Effective health in hundredths: health through armour and the players' mix of blows. */
export function effectiveHealth100(m: ThreatInput): number {
  const t = THREAT;
  const other = Math.max(0, 100 - t.pierceSharePct - t.bluntSharePct);
  // Share of a blow it takes, bp: the mix of piercing, blunt and other blows, then a shield on the share that flies.
  const mixBp = floorDiv(t.pierceSharePct * m.pierceBp + t.bluntSharePct * m.bluntBp + other * BP, 100);
  const takenBp = Math.max(1, floorDiv(mixBp * (BP - floorDiv(t.shotSharePct * m.blockBp, 100)), BP));
  const armour = Math.min(ARMOUR_CAP_BP, Math.max(0, m.armourBp));
  return floorDiv(floorDiv(Math.max(0, m.hp) * 100 * BP, takenBp) * BP, BP - armour);
}

/** How many units a strike lands on, tenths. */
function targetsTenths(area: Area): number {
  switch (area) {
    case Area.Arc: return THREAT.arcTargetsTenths;
    case Area.Slam: return THREAT.slamTargetsTenths;
    case Area.Line: return THREAT.lineTargetsTenths;
    case Area.Blast: return THREAT.blastTargetsTenths;
    default: return 10;
  }
}

/** Damage a second in hundredths: its blow on as many as it lands on, a shot's splash, and a share of what it does to walls. */
export function damagePerSecond100(m: ThreatInput): number {
  const t = THREAT;
  const strike = (m.damageTenths + m.poisonTenths) * targetsTenths(m.area) + m.splash * t.splashTargetsTenths * 10 + m.vsWalls * t.wallsPct;
  if (m.once) return floorDiv(strike, Math.max(1, t.onceSeconds));
  return floorDiv(strike * STEPS_PER_SECOND, Math.max(1, m.attackSteps));
}

/** The largest r with r^k <= n, exactly (BigInt; r is at most `hi`). */
function intRoot(n: bigint, k: number, hi: number): number {
  let lo = 0;
  let up = Math.max(1, hi);
  const big = BigInt(k);
  while (lo < up) {
    const mid = lo + floorDiv(up - lo + 1, 2);
    if (BigInt(mid) ** big <= n) lo = mid;
    else up = mid - 1;
  }
  return lo;
}

/** Health and damage together: their weighted mean (health 3 parts, damage 2), from hundredths. */
export function power(ehp100: number, dps100: number): number {
  const h = Math.max(0, THREAT.healthParts);
  const d = Math.max(0, THREAT.damageParts);
  if (h + d === 0) return 0;
  const n = BigInt(Math.max(0, ehp100)) ** BigInt(h) * BigInt(Math.max(0, dps100)) ** BigInt(d);
  return intRoot(n, h + d, Math.max(ehp100, dps100));
}

/** One threat point's power: the unit body's. */
export function unitPower(): number {
  return power(THREAT.unitHealth * 100, THREAT.unitDpsTenths * 10);
}

/** The speed's percent: per metre a second over or under the reference, within the least and most. */
export function speedPct(speed: number): number {
  const t = THREAT;
  const tenths = floorDiv(speed * STEPS_PER_SECOND * 10, WU_PER_METRE);
  return Math.min(t.speedMaxPct, Math.max(t.speedMinPct, floorDiv(t.speedPctPerMs * (tenths - t.speedRefTenths), 10)));
}

/** A ranged attack's percent: in proportion to its range, up to the most at the full range. */
export function rangedPct(range: number): number {
  if (range <= 0) return 0;
  const t = THREAT;
  const cm = floorDiv(range * 100, WU_PER_METRE);
  return Math.min(t.rangedMaxPct, floorDiv(t.rangedMaxPct * cm, Math.max(1, t.rangedFullM * 100)));
}

/** Every percent on top of its power: speed, range and traits, added together. */
export function threatPct(m: ThreatInput): number {
  let pct = speedPct(m.speed) + rangedPct(m.range);
  for (const tr of m.traits) pct += TRAIT_PCT[tr] ?? 0;
  return pct;
}

/**
 * A monster's threat in tenths, rounded to the nearest and at least 0.1:
 * its power (with the effective health of what it splits into, `extraEhp100`)
 * over one threat point's, with its percentages on top.
 */
export function threatTenths(m: ThreatInput, extraEhp100 = 0): number {
  const p = power(effectiveHealth100(m) + extraEhp100, damagePerSecond100(m));
  const unit = Math.max(1, unitPower());
  const scaled = p * Math.max(10, 100 + threatPct(m));
  return Math.max(1, floorDiv(scaled * 10 + unit * 50, unit * 100));
}
