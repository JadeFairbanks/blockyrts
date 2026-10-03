// Rolling a creature's drops (mob roster: drops are now and then, never on
// every kill; Jade's rule that killing is never a way to build wealth): one
// roll per row on the 'combat' stream, "silver or gold" half the time the
// other. A goblin's club or spear comes as the materials that made it
// (Troops and gear: weapons in plunder become their materials).

import type { SimState } from '../state.ts';
import type { Drop } from '../combat/mobs.ts';

/** Rolls a drop table into a player's pool; adds what it gave to `got` (resource, count). */
export function rollDrops(state: SimState, drops: readonly Drop[], player: number, got?: Map<number, number>): void {
  const ps = state.players[player];
  if (!ps) return;
  const rng = state.rng.combat;
  for (const d of drops) {
    if (rng.nextInt(1000) >= d.chancePm) continue;
    const n = d.min + rng.nextInt(d.max - d.min + 1);
    const res = d.alt !== undefined && rng.nextInt(2) === 1 ? d.alt : d.res;
    ps.pool[res] = ps.pool[res]! + n;
    got?.set(res, (got.get(res) ?? 0) + n);
  }
}
