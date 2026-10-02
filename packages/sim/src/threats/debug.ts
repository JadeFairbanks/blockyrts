// The debug tools' threats (M5's tester checks): a lair of any kind, a
// goblin village, a tribe's band or a territorial creature at a point, a
// blood night for the coming night, and fog now.

import { clockOf, Period } from '../clock.ts';
import { WILD, type SimState } from '../state.ts';
import { addAnimal } from '../animals/animals.ts';
import { Species } from '../animals/species.ts';
import { Mob } from '../combat/mobs.ts';
import { cellAt } from './cells.ts';
import { LAIRS } from './data.ts';
import { addLair, nightNow } from './lairs.ts';
import { startBlood, startFog } from './nights.ts';
import { spawnBand } from './tribes.ts';
import { buildVillage } from './villages.ts';

/** What a debugThreat order makes: lairs 0 to 7 in Table 15's order, then the rest. */
export const DebugThreat = {
  Lair: 0,
  Village: 10,
  Gnolls: 11,
  Kobolds: 12,
  Hobgoblins: 13,
  BloodNight: 20,
  Fog: 21,
  /** Territorial creatures from 30: beetle, hornet nest, viper, scorpion, griffin, minotaur. */
  Creature: 30,
} as const;

const CREATURES = [Species.GiantBeetle, Species.GiantHornet, Species.Viper, Species.GiantScorpion, Species.Griffin, Species.Minotaur] as const;
const TRIBE_MOBS = [Mob.Gnoll, Mob.Kobold, Mob.Hobgoblin] as const;

/** The coming night: tonight from day to dusk, else tomorrow's. */
function comingNight(state: SimState): number {
  const c = clockOf(state);
  return c.period === Period.Day || c.period === Period.Dusk ? c.cycle : c.cycle + 1;
}

export function debugThreat(state: SimState, player: number, what: number, x: number, z: number): void {
  if (what >= DebugThreat.Lair && what < DebugThreat.Lair + LAIRS.length) {
    addLair(state, LAIRS[what - DebugThreat.Lair]!, player, x, z, nightNow(state));
    return;
  }
  if (what === DebugThreat.Village) {
    const cell = cellAt(state, x, z);
    buildVillage(state, cell, x, z, state.world.layout.cell(cell).band, 5, true);
    state.threats.checked.add(cell);
    return;
  }
  if (what >= DebugThreat.Gnolls && what <= DebugThreat.Hobgoblins) {
    spawnBand(state, clockOf(state).cycle, { tribe: TRIBE_MOBS[what - DebugThreat.Gnolls]!, x, z });
    return;
  }
  if (what === DebugThreat.BloodNight) {
    startBlood(state, comingNight(state), -1);
    return;
  }
  if (what === DebugThreat.Fog) {
    startFog(state, comingNight(state));
    return;
  }
  const k = what - DebugThreat.Creature;
  if (k >= 0 && k < CREATURES.length) {
    const species = CREATURES[k]!;
    const n = species === Species.GiantHornet ? 4 : 1;
    for (let q = 0; q < n; q++) addAnimal(state, species, WILD, x + q * 6000, z, 0, q & 1);
  }
}
