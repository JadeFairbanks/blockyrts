// Hot spring guardians (Jade's Patch 5, WL-11): "Use a single existing mob
// that makes sense to guard hotsprings, once it is killed the hot spring
// remains unguarded for the rest of the game. Use speech bubbles for the mob
// even if just inhuman noises". An ash golem (s): stone, ash and sulphur, it
// does not burn in the sun. It comes the first time the players' units come
// near the spring's chunk (animals/animals.ts stockChunk), keeps to the
// spring as a lair's guardian keeps to its lair (it wakes to what comes
// within 12 m and chases it no farther than 30 m), and never comes back once
// killed: a chunk is stocked once.

import { length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { UnitKind, type SimState } from '../state.ts';
import { addMob } from '../combat/mob-ai.ts';
import { Mob } from '../combat/mobs.ts';
import { sayForeign } from '../peoples/speech.ts';
import { nearestPlayerUnit } from './foes.ts';
import { nightNow } from './lairs.ts';
import { Role } from './types.ts';

/** The mob that guards a hot spring (s). */
export const SPRING_GUARDIAN = Mob.AshGolem;

/** What it says (s): as it wakes to an intruder, now and then as it fights, and as a warning to units that come near. */
export const SPRING_GUARDIAN_LINES = {
  wake: ['HSSSSSSS!', 'Grrrooohhh... MINE!', 'Hrrrmmm... HOT... MINE...'],
  fight: ['HSSSS!', 'Rrrraaagh!', 'Crrrack... crrrack...', 'Burrrn... BURRRN...', 'GRRRAAAH!'],
  warn: ['Grrrmmm...', 'Hsss... hsss...', 'Rrrrumble...'],
} as const;
/** Seconds between its lines while it fights, and between its warnings (s). */
export const SPRING_FIGHT_LINE_S = 8;
export const SPRING_WARN_LINE_S = 15;
/** It grumbles at the players' units within this, metres, before it wakes at 12 m (s). */
export const SPRING_WARN_M = 25;

const M = WU_PER_METRE;

/** The step each guardian last spoke at, by its id, and whether it was fighting then (presentation only, not saved). */
const spoke = new WeakMap<SimState, Map<number, { at: number; awake: boolean }>>();

/** A spring guardian: a resident with no lair (a lair's residents belong to their lair, group). */
function isGuardian(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.kind[i] === UnitKind.Mob && e.mob[i] === SPRING_GUARDIAN && e.role[i] === Role.Resident && e.group[i] === 0 && e.hp[i]! > 0;
}

/** A chunk the players come near for the first time: its hot spring, if it has one, gets its guardian. */
export function guardSpring(state: SimState, cx: number, cz: number): void {
  if (state.peaceful) return;
  const spring = state.world.gen.chunkSpring(cx, cz);
  if (!spring) return;
  // On the pool's rim, across from its sulphur.
  const x = (spring.x - 7) * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
  const z = spring.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);
  // Its foe is the player whose start is nearest (s); it fights anyone's units that come near.
  const pockets = state.world.gen.start.pockets;
  let foe = 0;
  let best = Infinity;
  for (const p of pockets) {
    const d = length2d(p.x - spring.x, p.z - spring.z);
    if (d < best && p.player < state.players.length) {
      best = d;
      foe = p.player;
    }
  }
  const e = state.entities;
  const i = addMob(state, SPRING_GUARDIAN, foe, x, z, nightNow(state));
  e.role[i] = Role.Resident;
  e.group[i] = 0;
  e.homeX[i] = x;
  e.homeZ[i] = z;
}

/** Once a second: the guardians' bubbles. */
export function updateSprings(state: SimState): void {
  if (state.step % STEPS_PER_SECOND !== 7) return;
  const e = state.entities;
  let seen = spoke.get(state);
  for (let i = 0; i < e.count; i++) {
    if (!isGuardian(state, i)) continue;
    if (!seen) {
      seen = new Map();
      spoke.set(state, seen);
    }
    const id = e.id[i]!;
    const last = seen.get(id);
    const fighting = e.target[i] !== 0 && e.indexOf(e.target[i]!) >= 0;
    const pick = (lines: readonly string[]): string => lines[(id + state.step) % lines.length]!;
    if (fighting) {
      if (!last?.awake) sayForeign(state, i, pick(SPRING_GUARDIAN_LINES.wake), false);
      else if (state.step - last.at >= SPRING_FIGHT_LINE_S * STEPS_PER_SECOND) sayForeign(state, i, pick(SPRING_GUARDIAN_LINES.fight), false);
      else continue;
      seen.set(id, { at: state.step, awake: true });
      continue;
    }
    // Calm again: it wakes with a wake line next time.
    if (last?.awake) seen.set(id, { at: last.at, awake: false });
    if (last && state.step - last.at < SPRING_WARN_LINE_S * STEPS_PER_SECOND) continue;
    if (nearestPlayerUnit(state, e.x[i]!, e.z[i]!, SPRING_WARN_M * M) < 0) continue;
    sayForeign(state, i, pick(SPRING_GUARDIAN_LINES.warn), false);
    seen.set(id, { at: state.step, awake: false });
  }
}
