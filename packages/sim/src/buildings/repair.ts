// Repairs cost (Jade's Patch 5, UI-13, decisions 3.8): a building's own
// resources in proportion to the health restored, so a repair from nothing to
// full costs what the building cost in all. Each line of the cost is rounded
// on the health still missing, so many small repairs add up to exactly the
// same as one big one.
import { levelSpec } from './data.ts';
import type { Building } from './store.ts';
import type { Cost, Res } from '../economy/resources.ts';
import { ceilDiv } from '../fixed.ts';

/** What a building cost in all: its first level's cost (times what it was placed at) and each upgrade's. */
export function buildingWorth(b: Pick<Building, 'kind' | 'level' | 'costMul'>): Cost {
  const sum = new Map<Res, number>();
  for (let l = 1; l <= b.level; l++) {
    for (const [r, n] of levelSpec(b.kind, l).cost) sum.set(r, (sum.get(r) ?? 0) + n * (l === 1 ? Math.max(1, b.costMul) : 1));
  }
  return [...sum].sort((a, c) => a[0] - c[0]);
}

/** What raising a building's health from `hp` to `to` (of `max`) costs: each line of its worth for the share restored. */
export function repairCost(worth: Cost, max: number, hp: number, to: number): Cost {
  if (max <= 0 || to <= hp) return [];
  const out: Array<readonly [Res, number]> = [];
  for (const [r, a] of worth) {
    const n = ceilDiv((max - hp) * a, max) - ceilDiv((max - Math.min(max, to)) * a, max);
    if (n > 0) out.push([r, n]);
  }
  return out;
}
