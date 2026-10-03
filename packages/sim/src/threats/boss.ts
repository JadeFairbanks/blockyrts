// Morvath, the Hollow Crown (roster 5.25): when he comes and goes. He comes
// first at dusk on night 110. If he lives through the night he withdraws at
// dawn with the health he has and comes back the next night; each time he
// is beaten he comes back ten nights later (Jade; s for the withdrawing).
// His spells are threats/late-mobs.ts.

import { clockAt } from '../clock.ts';
import { type SimState } from '../state.ts';
import { addMob, vanish } from '../combat/mob-ai.ts';
import { Mob } from '../combat/mobs.ts';
import { spawnPoint } from '../combat/spawn.ts';

/** He comes back this many nights after a defeat (roster 5.25). */
export const BOSS_RETURN_NIGHTS = 10;

/** His entity's index while he is out, or -1. */
function bossIndex(state: SimState): number {
  const t = state.threats;
  if (!t.bossId) return -1;
  const i = state.entities.indexOf(t.bossId);
  return i >= 0 && state.entities.hp[i]! > 0 ? i : -1;
}

/** At dusk: on his night he comes for the first player still in the game, from the dark edge. */
export function bossAtDusk(state: SimState, night: number): void {
  const t = state.threats;
  if (state.peaceful || night < t.bossNext || bossIndex(state) >= 0) return;
  const foe = state.players.findIndex((p) => !p.out);
  if (foe < 0) return;
  summonBoss(state, foe, ...spawnPoint(state, foe), night);
}

/** Brings Morvath to a point for a foe (his night, or a debug button), with the health he withdrew with. */
export function summonBoss(state: SimState, foe: number, x: number, z: number, night: number): number {
  const t = state.threats;
  const e = state.entities;
  const i = addMob(state, Mob.Morvath, foe, x, z, night);
  if (t.bossHp > 0) e.hp[i] = Math.min(e.maxHp[i]!, t.bossHp);
  // His spells start a little into the night (s): the ruin after 20 s, the Rift after 30 s.
  e.abilityAt[i] = state.step + 400;
  e.ability2At[i] = state.step + 600;
  t.bossId = e.id[i]!;
  t.bossHp = 0;
  for (let p = 0; p < state.players.length; p++) state.events.push({ player: p, kind: 'alert', text: 'Morvath, the Hollow Crown, has come. Every light near him dies.', x, z });
  return i;
}

/** At dawn: alive, he withdraws with the health he has and comes again the next night. */
export function bossAtDawn(state: SimState, night: number): void {
  const t = state.threats;
  const i = bossIndex(state);
  if (i < 0) return;
  const e = state.entities;
  t.bossHp = e.hp[i]!;
  t.bossNext = night + 1;
  t.bossId = 0;
  for (let p = 0; p < state.players.length; p++) state.events.push({ player: p, kind: 'alert', text: 'Morvath withdraws with the dawn. He will be back tonight.', x: e.x[i]!, z: e.z[i]! });
  vanish(state, i);
}

/** Each step: beaten, he comes back ten nights later. */
export function updateBoss(state: SimState): void {
  const t = state.threats;
  if (!t.bossId || bossIndex(state) >= 0) return;
  const e = state.entities;
  const i = e.indexOf(t.bossId);
  const night = clockAt(state.step, state.blood).cycle;
  t.bossId = 0;
  t.bossHp = 0;
  t.bossNext = night + BOSS_RETURN_NIGHTS;
  for (let p = 0; p < state.players.length; p++) {
    state.events.push({ player: p, kind: 'info', text: `Morvath has fallen. He will return on night ${t.bossNext}.`, x: i >= 0 ? e.x[i]! : 0, z: i >= 0 ? e.z[i]! : 0 });
  }
}
