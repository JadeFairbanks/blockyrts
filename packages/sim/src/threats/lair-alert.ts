// Lair alerts (Patch 3, Jade): when a lair appears, every player gets an
// alert and a ping on their minimap at its spot. The alert is one urgent
// line naming the lair's kind and where it lies from that player's main base
// (and whose land it stands by, in co-op). The client draws every lair on the
// minimap from the moment it stands, explored land or not. The alert only
// tells: it changes nothing in the sim.

import { BuildingKind } from '../buildings/data.ts';
import { buildingCentre } from '../buildings/lights.ts';
import { mobSpec } from '../combat/mobs.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import { directions } from '../peoples/factions.ts';
import type { SimState } from '../state.ts';

/** How long the minimap's ping at a new lair lasts (s: 6 s, longer than an urgent message's 4 s, as it comes with the dusk horn). */
export const LAIR_PING_STEPS = 6 * STEPS_PER_SECOND;

/** One alert for every player that a lair of a kind has appeared at a spot (wu), placed for player `foe`. */
export function alertLair(state: SimState, mob: number, foe: number, x: number, z: number): void {
  for (let p = 0; p < state.players.length; p++) {
    state.events.push({ player: p, kind: 'alert', text: lairAlertText(state, p, mob, foe, x, z), x, z, lair: mob });
  }
}

/**
 * The line a player reads: "A lair has appeared: a spider nest to the
 * north-east, about 160 m from your main base." Another player's lair says
 * whose land it stands by ("by Player 2's land"; the client puts in their
 * name). With no main base standing, only the kind.
 */
export function lairAlertText(state: SimState, player: number, mob: number, foe: number, x: number, z: number): string {
  const name = mobSpec(mob).name.toLowerCase();
  const kind = `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  const whose = foe !== player && foe >= 0 && foe < state.players.length ? ` by Player ${foe + 1}'s land` : '';
  const base = state.buildings.list.find((b) => b.owner === player && b.complete && b.kind === BuildingKind.MainBase && b.hp > 0);
  if (!base) return `A lair has appeared${whose}: ${kind}.`;
  const [bx, bz] = buildingCentre(base);
  return `A lair has appeared${whose}: ${kind} to the ${directions(bx, bz, x, z)} from your main base.`;
}
