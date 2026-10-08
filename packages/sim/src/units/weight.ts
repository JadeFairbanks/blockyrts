// Carrying (Table 12; Troops and gear: weight). Gear has no weight and
// nothing a unit wears slows it (Jade, 2026-10-03). A worker's carrying
// limit stays only to decide when it walks back with its load: 25 lb of raw
// materials, or more with a cart at the cart's own pace: a hand cart 150 lb
// at 2 m/s, an ox or horse cart 600 or 400 lb behind its animal; an ox or
// horse led without a cart carries a pack of 150 or 100 lb.

import { loadCapacity, RAW_CARRY_TENTHS_LB, Res } from '../economy/resources.ts';
import { floorDiv } from '../fixed.ts';
import { NO_CARRY, UnitKind, type SimState } from '../state.ts';
import { speciesSpec } from '../animals/species.ts';
import { STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';

/** A hand cart's load (Table 12): 150 lb of raw materials. */
export const HAND_CART_TENTHS_LB = 1500;
/** A hand cart is pushed at 2 m/s (Table 12). */
export const HAND_CART_SPEED = floorDiv(2 * WU_PER_METRE, STEPS_PER_SECOND);

/** The working animal pulling a worker's cart or carrying its pack, or -1. */
export function partnerOf(state: SimState, i: number): number {
  const e = state.entities;
  if (!e.partner[i]) return -1;
  const j = e.indexOf(e.partner[i]!);
  return j >= 0 && e.hp[j]! > 0 && e.partner[j] === e.id[i] && e.kind[j] === UnitKind.Animal ? j : -1;
}

/** Whether a unit moves on wheels: a worker with a hand cart, or with an ox or horse cart and its animal. */
export function onWheels(state: SimState, i: number): boolean {
  const e = state.entities;
  // A siege engine rolls on wheels too (Table 2f: gentle slopes, not steps).
  if (e.kind[i] === UnitKind.Engine) return true;
  return e.kit[i] === Res.HandCart || (e.kit[i] === Res.OxCart && partnerOf(state, i) >= 0);
}

/** How much raw material a unit can carry, tenths of a pound: 25 lb, or a cart's or pack animal's load. */
export function rawLimitTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker) return RAW_CARRY_TENTHS_LB;
  if (e.kit[i] === Res.HandCart) return HAND_CART_TENTHS_LB;
  const a = partnerOf(state, i);
  if (a < 0) return RAW_CARRY_TENTHS_LB;
  const s = speciesSpec(e.mob[a]!);
  return e.kit[i] === Res.OxCart ? s.cartTenthsLb : RAW_CARRY_TENTHS_LB + s.packTenthsLb;
}

/** How many of a resource a unit can carry: one 25 lb load, or what its cart or pack holds. */
export function carryCapacity(state: SimState, i: number, res: number): number {
  const per = loadCapacity(res as Res);
  return Math.max(1, floorDiv(per * rawLimitTenthsLb(state, i), RAW_CARRY_TENTHS_LB));
}

/** A cart's pace, wu per step, or 0 for none: a hand cart 2 m/s, an ox or horse cart its animal's (Table 12). */
export function cartSpeed(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kit[i] === Res.HandCart) return HAND_CART_SPEED;
  const a = partnerOf(state, i);
  if (a >= 0 && e.kit[i] === Res.OxCart) return speciesSpec(e.mob[a]!).cartSpeed;
  return 0;
}

/** What a unit's gathered load weighs, tenths of a pound (a full load is 25 lb; a cart's load is the cart's). */
export function rawTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  if (e.carryRes[i] === NO_CARRY || e.carryAmt[i] === 0) return 0;
  return floorDiv(e.carryAmt[i]! * RAW_CARRY_TENTHS_LB, loadCapacity(e.carryRes[i] as Res));
}
