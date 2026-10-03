// The fog night (Day and night; Table 8): now and then a night comes in
// thick fog, set at dusk and lifting with the day. While it lasts everyone
// sees half as far, lights reach half as far, and night spawns stand off
// 40 m from claimed land instead of 50 (s).

import type { SimState } from '../state.ts';

/** Whether fog lies over the world now. */
export function fogged(state: SimState): boolean {
  return state.threats.fog !== 0;
}

/** A distance as seen through the fog: halved while it lies. */
export function throughFog(state: SimState, d: number): number {
  return fogged(state) ? d >> 1 : d;
}
