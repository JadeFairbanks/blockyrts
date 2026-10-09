// Mineshafts and prospecting (Mineshafts and prospecting; Table 5 prospect
// and mineshaft rows). Patch 5 took the fishing dock out: only woodsmen
// fish (units/woods.ts). Minerals lie hidden by the seed: every patch of ground has a
// rating that Prospect (T) reveals and that sets a mineshaft's output there.
// Miners inside a shaft bring up stone, ore, coal, gold and gems. Patch 2
// (Jade): the shaft is a collection point like a node. A miner stays down
// until a 25 lb bagful has come up, carries it out to the nearest main base
// or Storehouse and comes back; no one hauls from a shaft any more.

import { CYCLE_STEPS } from '../rules.ts';
import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN } from '../fixed.ts';
import { hash32 } from '../rng.ts';
import { Res, RESOURCES } from '../economy/resources.ts';
import type { SimState } from '../state.ts';
import { hasResearch, Research } from '../combat/items.ts';
import { Band } from '../world/layout.ts';
import { BuildingKind } from './data.ts';
import { buildingCentre } from './lights.ts';
import type { Building } from './store.ts';
import { workersAt } from './production.ts';

/** A prospect rating (Table 5): Poor, Fair, Good, Rich. */
export const Rating = { Poor: 0, Fair: 1, Good: 2, Rich: 3 } as const;
export const RATING_NAMES = ['Poor', 'Fair', 'Good', 'Rich'] as const;
/** Output per mille by rating (Table 5): x0.5, x1, x1.5, x2.5. */
export const RATING_PER_MILLE = [500, 1000, 1500, 2500] as const;
/** Prospecting takes 20 s with a prospecting hammer (a copper tool kit or better, Table 2c) and 40 s without (Table 5). */
export const PROSPECT_STEPS = 40 * STEPS_PER_SECOND;
export const PROSPECT_HAMMER_STEPS = 20 * STEPS_PER_SECOND;
/** A rating holds for a patch of 16 by 16 columns, 7.2 m on a side (s). */
const PATCH_SHIFT = 4;
/** What a shaft keeps dug out and not yet carried off before its miners stop (s). */
export const SHAFT_STOCK_LIMIT = 200;
/** A worked-out shaft: Table 5's loads, counted as 10 items each (s), by depth; the third depth never runs out. */
export const WORKED_OUT: readonly number[] = [6000, 24000, 0];

/**
 * How deep a shaft digs (Patch 2: from the research alone, in place of its
 * 3 tiers): 1, 2 once its owner has Deep Mining II, 3 with Deep Mining III.
 * It counts for every shaft the owner has, built before or after.
 */
export function shaftDepth(state: SimState, b: Building): number {
  const mask = (state.players[b.owner]?.research ?? 0) | b.tech;
  return hasResearch(mask, Research.DeepMining3) ? 3 : hasResearch(mask, Research.DeepMining2) ? 2 : 1;
}

/** The hidden rating of the ground at a column (s: Poor 30%, Fair 40%, Good 20%, Rich 10%). */
export function ratingAt(state: SimState, x: number, z: number): number {
  const roll = hash32(state.seed ^ 0x6d696e65, x >> PATCH_SHIFT, z >> PATCH_SHIFT) % 100;
  if (roll < 30) return Rating.Poor;
  if (roll < 70) return Rating.Fair;
  if (roll < 90) return Rating.Good;
  return Rating.Rich;
}

/** The text a prospect shows over the ground. */
export function prospectText(rating: number): string {
  const name = RATING_NAMES[rating] ?? 'Fair';
  const what = ['a mineshaft here would bring up half as much', 'a mineshaft here would do as expected', 'a mineshaft here would bring up half as much again', 'a mineshaft here would bring up two and a half times as much'][rating] ?? '';
  return `Prospect: ${name}. ${what[0]!.toUpperCase()}${what.slice(1)}.`;
}

/** One line of a shaft's output: thousandths of an item per miner-day at Fair. */
type Output = readonly [res: number, perDayThousandths: number, precious: boolean];

/** A shaft's ores, set by the seed at its spot (Table 5: "in a mix set by the seed"). */
function oreMix(state: SimState, b: Building, ores: readonly number[], total: number): Output[] {
  const h = hash32(state.seed ^ 0x6f726573, b.x, b.z);
  const weights = ores.map((_, k) => 1 + ((h >>> (k * 4)) & 3));
  const sum = weights.reduce((a, w) => a + w, 0);
  return ores.map((r, k) => [r, floorDiv(total * 1000 * weights[k]!, sum), false] as const);
}

/** What a shaft brings up per miner-day at Fair, by its depth (Table 5's tiers). */
export function shaftOutput(state: SimState, b: Building): Output[] {
  const h = hash32(state.seed ^ 0x67656d73, b.x, b.z);
  const gem = [Res.Emeralds, Res.Rubies, Res.Diamonds][h % 3]!;
  const depth = shaftDepth(state, b);
  if (depth === 1) return [[Res.Stone, 10000, false], ...oreMix(state, b, [Res.CopperOre, Res.TinOre, Res.IronRock, Res.Coal], 8)];
  if (depth === 2) {
    const precious = (h >>> 8) & 1 ? Res.Gold : Res.Silver;
    return [[Res.Stone, 10000, false], [Res.VeinIron, 6000, false], ...oreMix(state, b, [Res.CopperOre, Res.TinOre, Res.IronRock], 6), [Res.Coal, 4000, false], [precious, 500, true], [gem, 200, true]];
  }
  return [[Res.Stone, 10000, false], [Res.VeinIron, 16000, false], [Res.Coal, 8000, false], [Res.LeadOre, 1000, false], [Res.Gold, 1000, true], [gem, 500, true]];
}

/** Gold, silver and gems come x1.5 in the Barrens and x2 in the Deadlands (Table 5). */
function preciousPerMille(state: SimState, b: Building): number {
  const [x, z] = buildingCentre(b);
  const layout = state.world.layout;
  const band = layout.cell(layout.nearest(floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN))).band;
  return band === Band.Deadlands ? 2000 : band === Band.Barrens ? 1500 : 1000;
}

/** Items waiting at a shaft. */
export function shaftStock(b: Building): number {
  let n = 0;
  for (const [, k] of b.stock) n += k;
  return n;
}

/** Whether a shaft has given all its depth holds. */
export function workedOut(state: SimState, b: Building): boolean {
  const limit = WORKED_OUT[shaftDepth(state, b) - 1] ?? 0;
  return limit > 0 && b.mined >= limit;
}

function addStock(b: Building, res: number, n: number): void {
  const row = b.stock.find(([r]) => r === res);
  if (row) row[1] += n;
  else b.stock.push([res, n]);
}

/** What waits at a shaft, tenths of a pound. */
export function stockTenthsLb(b: Building): number {
  let w = 0;
  for (const [res, n] of b.stock) w += Math.max(1, RESOURCES[res]?.weightTenthsLb ?? 1) * n;
  return w;
}

/**
 * Takes a bagful from what waits at a shaft: as much of each item, in the
 * order they came up, as still fits in `roomTenthsLb` (s). Returns what was
 * taken as (resource, count) pairs.
 */
export function fillBag(b: Building, roomTenthsLb: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let room = roomTenthsLb;
  for (const row of b.stock) {
    const w = Math.max(1, RESOURCES[row[0]]?.weightTenthsLb ?? 1);
    const n = Math.min(row[1], floorDiv(Math.max(0, room), w));
    if (n <= 0) continue;
    row[1] -= n;
    room -= n * w;
    out.push([row[0], n]);
  }
  b.stock = b.stock.filter(([, n]) => n > 0);
  return out;
}

/** Miners at work bring up their shaft's output, each step. */
function mine(state: SimState, b: Building): void {
  const miners = workersAt(state, b);
  if (miners === 0 || workedOut(state, b) || shaftStock(b) >= SHAFT_STOCK_LIMIT) return;
  if (b.rating === 0 && b.mined === 0 && b.acc.length === 0) b.rating = ratingAt(state, b.x, b.z) + 1;
  const out = shaftOutput(state, b);
  const rating = RATING_PER_MILLE[Math.max(0, b.rating - 1)]!;
  const precious = preciousPerMille(state, b);
  while (b.acc.length < out.length) b.acc.push(0);
  const whole = CYCLE_STEPS * 1000;
  for (let k = 0; k < out.length; k++) {
    const [res, perDay, rare] = out[k]!;
    b.acc[k] = b.acc[k]! + floorDiv(miners * perDay * rating * (rare ? precious : 1000), 1000000);
    if (b.acc[k]! < whole) continue;
    const n = floorDiv(b.acc[k]!, whole);
    b.acc[k] = b.acc[k]! - n * whole;
    addStock(b, res, n);
    b.mined += n;
  }
  if (workedOut(state, b)) {
    const [x, z] = buildingCentre(b);
    const next = shaftDepth(state, b) === 1 ? 'Deep Mining II' : 'Deep Mining III';
    state.events.push({ player: b.owner, kind: 'alert', text: `A mineshaft is worked out. Research ${next} to dig deeper.`, x, z });
  }
}

/** Each step: shafts are mined (Patch 5: the fishing dock is gone, and only woodsmen fish, units/woods.ts). */
export function updateMines(state: SimState): void {
  for (const b of state.buildings.list) {
    if (b.complete && b.kind === BuildingKind.Mineshaft) mine(state, b);
  }
}
