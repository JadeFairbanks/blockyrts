// Wood smouldering after a fire bolt (Table 17: Spark toss sets dry wood
// smouldering 2 a second for 5 s): the burns list, and the damage it does.

import { buildingCentre } from '../buildings/lights.ts';
import { buildingSpec } from '../buildings/data.ts';
import type { Building } from '../buildings/store.ts';
import { STEPS_PER_SECOND, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { burnThisStep, DAMAGE_ROLL } from '../rules.ts';
import type { SimState } from '../state.ts';
import { hurtBuilding } from '../combat/combat.ts';

/** Spark toss: 8 damage (magic, rolled by up to 3%, Patch 7), and dry wood it hits smoulders 2 a second for 5 s (Table 17). */
export const SPARK = { damage: 8, smoulderPerSecond: 2, smoulderSteps: 5 * STEPS_PER_SECOND, rollBp: DAMAGE_ROLL.magicBp };

/** A fire bolt hit a building: wood smoulders for a while (a second hit makes it last longer, not burn harder). */
export function smoulder(state: SimState, b: Building, perSecond: number, steps: number): void {
  if (buildingSpec(b.kind).wooden === false || b.hp <= 0) return;
  const until = state.step + steps;
  for (const burn of state.threats.burns) {
    if (burn.building !== b.id) continue;
    burn.until = Math.max(burn.until, until);
    burn.perSecond = Math.max(burn.perSecond, perSecond);
    return;
  }
  state.threats.burns.push({ building: b.id, until, perSecond });
}

/** Each step smouldering wood loses its share of the second's damage; a burn ends when its time is up or the building is gone. */
export function updateBurns(state: SimState): void {
  const burns = state.threats.burns;
  if (burns.length === 0) return;
  const k = state.step % STEPS_PER_SECOND;
  state.threats.burns = burns.filter((burn) => {
    const b = state.buildings.get(burn.building);
    if (!b || b.hp <= 0 || state.step >= burn.until) return false;
    const d = burnThisStep(burn.perSecond, k);
    if (d > 0) {
      const [x, z] = buildingCentre(b);
      hurtBuilding(state, b, d, x, b.y * WU_PER_TERRAIN_UNIT + WU_PER_METRE, z, 0);
    }
    return true;
  });
}
