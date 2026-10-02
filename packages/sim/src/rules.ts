// The rules every number table uses (docs/blueprint.md, Rising difficulty >
// Reading the number tables). Percentages are basis points (1% = 100 bp) so
// every value is an integer; experience is in tenths so a threat of 12.4
// stays exact.

import { floorDiv, STEPS_PER_SECOND } from './fixed.ts';

/** 100% in basis points. */
export const BP = 10000;
/** Armour pieces add up, capped at 75%. */
export const ARMOUR_CAP_BP = 7500;

/** Total armour from the pieces worn, capped at 75%. */
export function totalArmourBp(piecesBp: readonly number[]): number {
  let sum = 0;
  for (const p of piecesBp) sum += p;
  return Math.min(ARMOUR_CAP_BP, Math.max(0, sum));
}

export interface HitInput {
  /** Raw damage of the attack, an integer. */
  damage: number;
  /** Armour of the target in bp, already totalled; capped at 75% here too. */
  armourBp: number;
  /** The roster's piercing or blunt modifier for this mob and damage type; 10000 = none. */
  modifierBp?: number;
  /** True for arrows, bolts, stones, shot and other projectiles. */
  projectile?: boolean;
  /** Block of the target's shield in bp; it only cuts projectiles. */
  shieldBlockBp?: number;
}

/**
 * Damage taken = damage x (1 - armour), rounded down, never below 1. The
 * roster's modifier applies after armour, and a shield cuts a projectile by
 * its block after that. Each step rounds down; an attack of 0 deals 0.
 */
export function damageTaken(hit: HitInput): number {
  if (hit.damage <= 0) return 0;
  const armour = Math.min(ARMOUR_CAP_BP, Math.max(0, hit.armourBp));
  let d = floorDiv(hit.damage * (BP - armour), BP);
  d = floorDiv(d * (hit.modifierBp ?? BP), BP);
  if (hit.projectile && hit.shieldBlockBp) d = floorDiv(d * (BP - hit.shieldBlockBp), BP);
  return Math.max(1, d);
}

/**
 * Fire burns wood at a listed amount per second; this is the share that
 * lands on the given step of the second (0..19), spread so the 20 shares of
 * a second always add up to exactly the per-second amount.
 */
export function burnThisStep(perSecond: number, stepInSecond: number): number {
  const k = stepInSecond % STEPS_PER_SECOND;
  return floorDiv(perSecond * (k + 1), STEPS_PER_SECOND) - floorDiv(perSecond * k, STEPS_PER_SECOND);
}

/** Experience is held in tenths of a point. */
export const XP_TENTHS = 10;
/** Clearing a lair gives 20 XP to every warrior within 20 m. */
export const LAIR_CLEAR_XP_TENTHS = 20 * XP_TENTHS;
export const LAIR_CLEAR_RADIUS_M = 20;
/** Hitters in the last 10 s share a kill. */
export const KILL_SHARE_WINDOW_STEPS = 10 * STEPS_PER_SECOND;
/** A support mage earns 1 XP per 25 health healed in combat. */
export const HEAL_PER_XP = 25;

/**
 * XP for a kill, in tenths: 2 x the mob's roster threat (threat in tenths),
 * or for a creature with no threat value its HP / 50, at least 1.
 */
export function killXpTenths(threatTenths: number | null, hp: number): number {
  if (threatTenths !== null && threatTenths > 0) return 2 * threatTenths;
  return Math.max(1, floorDiv(hp, 50)) * XP_TENTHS;
}

/**
 * Shares XP equally among the units that hit the target in the last 10 s.
 * `hitterIds` are sorted ascending first; a remainder of tenths goes one each
 * to the lowest ids, so the shares are deterministic and sum to the total.
 */
export function shareXp(totalTenths: number, hitterIds: readonly number[]): Array<[number, number]> {
  const ids = [...new Set(hitterIds)].sort((a, b) => a - b);
  if (ids.length === 0) return [];
  const each = floorDiv(totalTenths, ids.length);
  const extra = totalTenths - each * ids.length;
  return ids.map((id, i) => [id, each + (i < extra ? 1 : 0)]);
}

/** XP in tenths a support mage earns for healing this much health in combat. */
export function healXpTenths(healed: number): number {
  return floorDiv(healed * XP_TENTHS, HEAL_PER_XP);
}

/** Warriors and workers: +5% damage per rank above the first. */
export function rankDamageBonusBp(rank: number): number {
  return 500 * Math.max(0, rank - 1);
}

/** Mages: +10% spell power per rank above the first. */
export function rankSpellPowerBonusBp(rank: number): number {
  return 1000 * Math.max(0, rank - 1);
}

/** Ranged spread: -10% per rank above the first. */
export function rankSpreadReductionBp(rank: number): number {
  return 1000 * Math.max(0, rank - 1);
}

/** Applies a bonus in bp to an integer amount, rounding down. */
export function withBonus(amount: number, bonusBp: number): number {
  return floorDiv(amount * (BP + bonusBp), BP);
}

/** Every unit and every research facility eats 2 nutrition per full day-night cycle. */
export const NUTRITION_PER_CYCLE = 2;
/** The cycle: 3 min day, 40 s dusk, 3 min night, 40 s dawn. */
export const DAY_STEPS = 180 * STEPS_PER_SECOND;
export const DUSK_STEPS = 40 * STEPS_PER_SECOND;
export const NIGHT_STEPS = 180 * STEPS_PER_SECOND;
export const DAWN_STEPS = 40 * STEPS_PER_SECOND;
export const CYCLE_STEPS = DAY_STEPS + DUSK_STEPS + NIGHT_STEPS + DAWN_STEPS;

/**
 * Draws `need` nutrition evenly from the foods in stock (amounts in
 * nutrition). Foods are visited in the given order, which callers keep
 * fixed (by food id); a food that runs out passes its share on to the rest.
 * Returns the amount drawn from each food, in the same order, and how much
 * of the need could not be met.
 */
export function drawEvenly(stock: readonly number[], need: number): { draws: number[]; shortfall: number } {
  const left = stock.map((s) => Math.max(0, s));
  const draws = stock.map(() => 0);
  let remaining = Math.max(0, need);
  for (;;) {
    const open: number[] = [];
    for (let i = 0; i < left.length; i++) if (left[i]! > 0) open.push(i);
    if (remaining === 0 || open.length === 0) break;
    const each = floorDiv(remaining, open.length);
    let extra = remaining - each * open.length;
    let took = 0;
    for (const i of open) {
      const want = each + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      const t = Math.min(want, left[i]!);
      left[i] = left[i]! - t;
      draws[i] = draws[i]! + t;
      took += t;
    }
    remaining -= took;
    if (took === 0) break;
  }
  return { draws, shortfall: remaining };
}

/** Trade value points: 1 vp is the hidden value of 1 softwood lumber. */
export const VP_SOFTWOOD_LUMBER = 1;

/** A made item is worth 2 x its recipe inputs (Table 11). */
export function madeItemVp(inputsVp: number): number {
  return 2 * inputsVp;
}

/** Trinket worth as tenths of its metal's worth: 2.5 / 3 / 3.5 / 4 x by tier 1 to 4, 5 x for the special pair (Table 11). */
export const TRINKET_MULTIPLIER_TENTHS: readonly number[] = [25, 30, 35, 40];
export const SPECIAL_TRINKET_MULTIPLIER_TENTHS = 50;

export function trinketVp(metalVp: number, tier: number | 'special'): number {
  const m = tier === 'special' ? SPECIAL_TRINKET_MULTIPLIER_TENTHS : TRINKET_MULTIPLIER_TENTHS[tier - 1];
  if (m === undefined) throw new RangeError(`no trinket tier ${tier}`);
  return floorDiv(metalVp * m, 10);
}
