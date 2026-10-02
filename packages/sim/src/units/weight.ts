// Inventory and carrying weight (Equipment): every item has a weight, a unit
// carries at most 100 lb with at most 25 lb of raw materials, and loads over
// 50 lb slow it steadily to 40% slower at 100 lb.

import { loadCapacity, RAW_CARRY_TENTHS_LB, type Res } from '../economy/resources.ts';
import { floorDiv } from '../fixed.ts';
import { NO_CARRY, UnitKind, type SimState } from '../state.ts';
import { itemSpec, Item, toolItem } from '../combat/items.ts';

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
  for (const item of [tool, e.weapon[i]!, e.backup[i]!, e.ranged[i]!, e.shield[i]!, e.boots[i]!]) if (item) w += itemSpec(item).weightTenthsLb;
  if (e.torchUntil[i]! > state.step) w += itemSpec(Item.HandTorch).weightTenthsLb;
  // Arrows weigh a tenth of a pound each.
  if (e.ammoItem[i]) w += e.ammo[i]! * itemSpec(e.ammoItem[i]!).weightTenthsLb;
  return w;
}

/** What a unit's gathered load weighs, tenths of a pound (a full load is 25 lb). */
export function rawTenthsLb(state: SimState, i: number): number {
  const e = state.entities;
  if (e.carryRes[i] === NO_CARRY || e.carryAmt[i] === 0) return 0;
  return Math.min(RAW_CARRY_TENTHS_LB, floorDiv(e.carryAmt[i]! * RAW_CARRY_TENTHS_LB, loadCapacity(e.carryRes[i] as Res)));
}

/** How much a unit's load slows it, bp: none to 50 lb, then steadily to 40% at 100 lb. */
export function loadSlowBp(state: SimState, i: number): number {
  if (state.entities.kind[i] === UnitKind.Mob) return 0;
  const w = gearTenthsLb(state, i) + rawTenthsLb(state, i);
  if (w <= FREE_CARRY_TENTHS_LB) return 0;
  return Math.min(MAX_LOAD_SLOW_BP, floorDiv((w - FREE_CARRY_TENTHS_LB) * MAX_LOAD_SLOW_BP, CARRY_LIMIT_TENTHS_LB - FREE_CARRY_TENTHS_LB));
}
