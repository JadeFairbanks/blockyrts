// Inventory and carrying weight (Equipment; Table 12): every item has a
// weight, a unit carries at most 100 lb with at most 25 lb of raw materials,
// and loads over 50 lb slow it steadily to 40% slower at 100 lb. A worker
// with a cart hauls far more at the cart's own pace: a hand cart 150 lb at
// 2 m/s, an ox or horse cart 600 or 400 lb behind its animal; an ox or horse
// led without a cart carries a pack of 150 or 100 lb.

import { loadCapacity, RAW_CARRY_TENTHS_LB, type Res } from '../economy/resources.ts';
import { floorDiv } from '../fixed.ts';
import { NO_CARRY, UnitKind, type SimState } from '../state.ts';
import { itemSpec, Item, toolItem } from '../combat/items.ts';
import { speciesSpec } from '../animals/species.ts';
import { STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';

/** Everything a unit may carry, tenths of a pound. */
export const CARRY_LIMIT_TENTHS_LB = 1000;
/** Loads up to this weigh nothing on the move. */
export const FREE_CARRY_TENTHS_LB = 500;
/** The most a load slows a unit, bp. */
export const MAX_LOAD_SLOW_BP = 4000;

/** What a unit's equipment weighs, tenths of a pound. */
export function gearTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  let w = 0;
  const tool = e.kind[i] === UnitKind.Worker ? toolItem(e.tool[i]!) : Item.None;
  for (const item of [tool, e.weapon[i]!, e.backup[i]!, e.ranged[i]!, e.shield[i]!, e.boots[i]!, e.armour[i]!, e.helmet[i]!, e.boltCase[i]!, e.kit[i]!]) if (item) w += itemSpec(item).weightTenthsLb;
  if (e.torchUntil[i]! > state.step) w += itemSpec(Item.HandTorch).weightTenthsLb;
  // Arrows weigh a tenth of a pound each.
  if (e.ammoItem[i]) w += e.ammo[i]! * itemSpec(e.ammoItem[i]!).weightTenthsLb;
  return w;
}

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
  return e.kit[i] === Item.HandCart || (e.kit[i] === Item.OxCart && partnerOf(state, i) >= 0);
}

/** How much raw material a unit can carry, tenths of a pound: 25 lb, or a cart's or pack animal's load. */
export function rawLimitTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Worker) return RAW_CARRY_TENTHS_LB;
  if (e.kit[i] === Item.HandCart) return HAND_CART_TENTHS_LB;
  const a = partnerOf(state, i);
  if (a < 0) return RAW_CARRY_TENTHS_LB;
  const s = speciesSpec(e.mob[a]!);
  return e.kit[i] === Item.OxCart ? s.cartTenthsLb : RAW_CARRY_TENTHS_LB + s.packTenthsLb;
}

/** How many of a resource a unit can carry: one 25 lb load, or what its cart or pack holds. */
export function carryCapacity(state: SimState, i: number, res: number): number {
  const per = loadCapacity(res as Res);
  return Math.max(1, floorDiv(per * rawLimitTenthsLb(state, i), RAW_CARRY_TENTHS_LB));
}

/** A cart's pace, wu per step, or 0 for none: a hand cart 2 m/s, an ox or horse cart its animal's (Table 12). */
export function cartSpeed(state: SimState, i: number): number {
  const e = state.entities;
  if (e.kit[i] === Item.HandCart) return HAND_CART_SPEED;
  const a = partnerOf(state, i);
  if (a >= 0 && e.kit[i] === Item.OxCart) return speciesSpec(e.mob[a]!).cartSpeed;
  return 0;
}

/** What a unit's gathered load weighs, tenths of a pound (a full load is 25 lb; a cart's load is the cart's). */
export function rawTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  if (e.carryRes[i] === NO_CARRY || e.carryAmt[i] === 0) return 0;
  return floorDiv(e.carryAmt[i]! * RAW_CARRY_TENTHS_LB, loadCapacity(e.carryRes[i] as Res));
}

/** How much a unit's load slows it, bp: none to 50 lb, then steadily to 40% at 100 lb. A cart sets its own pace instead. */
export function loadSlowBp(state: SimState, i: number): number {
  const k = state.entities.kind[i];
  if (k === UnitKind.Mob || k === UnitKind.Animal) return 0;
  if (cartSpeed(state, i) > 0) return 0;
  if (partnerOf(state, i) >= 0) return Math.min(MAX_LOAD_SLOW_BP, loadSlowFor(gearTenthsLb(state, i)));
  return loadSlowFor(gearTenthsLb(state, i) + rawTenthsLb(state, i));
}

function loadSlowFor(w: number): number {
  if (w <= FREE_CARRY_TENTHS_LB) return 0;
  return Math.min(MAX_LOAD_SLOW_BP, floorDiv((w - FREE_CARRY_TENTHS_LB) * MAX_LOAD_SLOW_BP, CARRY_LIMIT_TENTHS_LB - FREE_CARRY_TENTHS_LB));
}
