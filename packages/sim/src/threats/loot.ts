// Rolling a creature's drops (mob roster: drops are now and then, never on
// every kill; Jade's rule that killing is never a way to build wealth): one
// roll per row on the 'combat' stream, "silver or gold" half the time the
// other. A goblin's club or spear comes as the materials that made it
// (Troops and gear: weapons in plunder become their materials). What a kill
// drops is loot the units carry home (units/loot.ts), not the pool's at once.

import type { SimState } from '../state.ts';
import type { Drop } from '../combat/mobs.ts';

/** What a drop table gave: (resource, count) pairs in row order, and the chance of the rarest row that came up, per mille (1000 for none). */
export interface Rolled {
  items: Array<[number, number]>;
  rarestPm: number;
}

/** Rolls a drop table; adds what it gave to `got` (resource, count). */
export function rollDropList(state: SimState, drops: readonly Drop[], got?: Map<number, number>): Rolled {
  const rng = state.rng.combat;
  const out: Rolled = { items: [], rarestPm: 1000 };
  for (const d of drops) {
    if (rng.nextInt(1000) >= d.chancePm) continue;
    const n = d.min + rng.nextInt(d.max - d.min + 1);
    const res = d.alt !== undefined && rng.nextInt(2) === 1 ? d.alt : d.res;
    out.items.push([res, n]);
    out.rarestPm = Math.min(out.rarestPm, d.chancePm);
    got?.set(res, (got.get(res) ?? 0) + n);
  }
  return out;
}

/** Rolls a drop table straight into a player's pool; adds what it gave to `got` (resource, count). */
export function rollDrops(state: SimState, drops: readonly Drop[], player: number, got?: Map<number, number>): void {
  const ps = state.players[player];
  if (!ps) return;
  for (const [res, n] of rollDropList(state, drops, got).items) ps.pool[res] = ps.pool[res]! + n;
}
