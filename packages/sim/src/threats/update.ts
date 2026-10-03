// Milestone 5's threats in the step: what each period's start brings (dusk
// decides the night, daybreak brings the tribes and lifts the fog), the
// dawn raids, the bands' roaming, smouldering wood, mana, and which lairs
// and villages each player has seen.

import { clockOf, Period } from '../clock.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import { FOG_INTERVAL_STEPS, UnitKind, type SimState } from '../state.ts';
import { sideOf, Side } from '../combat/combat.ts';
import { sightOf } from '../combat/fight.ts';
import { isLair } from '../combat/mobs.ts';
import { refillMana } from './abilities.ts';
import { updateBurns } from './burns.ts';
import { RAID_AFTER_DAWN_STEPS } from './data.ts';
import { bandOf } from './foes.ts';
import { updateSeen, wakeLair } from './lairs.ts';
import { atDusk } from './nights.ts';
import { campBands, spawnBand, updateBands } from './tribes.ts';
import { rebuildVillages, recallRaids, sendRaids } from './villages.ts';
import { Role } from './types.ts';
import { bossAtDawn, bossAtDusk, updateBoss } from './boss.ts';
import { updateLateMobs } from './late-mobs.ts';

/** What a period's start brings. */
export function threatsAtPeriod(state: SimState, period: Period, cycle: number): void {
  if (period === Period.Dusk) {
    atDusk(state, cycle);
    bossAtDusk(state, cycle);
    campBands(state, true);
    recallRaids(state);
  } else if (period === Period.Dawn) {
    bossAtDawn(state, cycle);
  } else if (period === Period.Day) {
    state.threats.fog = 0;
    campBands(state, false);
    rebuildVillages(state);
    if (!state.peaceful) spawnBand(state, cycle);
  }
}

/** Each step. */
export function updateThreats(state: SimState): void {
  updateBurns(state);
  refillMana(state);
  updateLateMobs(state);
  updateBoss(state);
  if (state.step % STEPS_PER_SECOND === 0) updateBands(state);
  if (state.step % FOG_INTERVAL_STEPS === 0) updateSeen(state, (j) => sightOf(state, j));
  const c = clockOf(state);
  if (c.period === Period.Dawn && c.into === RAID_AFTER_DAWN_STEPS) sendRaids(state, c.cycle);
}

/** A foe was hurt by one of the players' units: a lair wakes its sleepers, a tribe's band takes it as its quarry. */
export function onFoeHurt(state: SimState, i: number, from: number): void {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Mob) return;
  const a = e.indexOf(from);
  if (a < 0 || sideOf(state, a) !== Side.Players) return;
  if (isLair(e.mob[i]!)) {
    wakeLair(state, i, from);
    return;
  }
  if (e.role[i] === Role.Tribe) {
    const band = bandOf(state, e.group[i]!);
    if (band && !band.target) {
      band.target = from;
      band.sawAt = state.step;
    }
  }
}
