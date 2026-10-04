// Unit names (Patch 2, troop names): the one place a player's unit gets the
// name it shows under, in the selection panel, the tooltips, the bubbles and
// the message panel. A troop goes by its weapon tier ("Copper swordsman"),
// so its name changes the moment its weapon is upgraded; a worker by its
// rank; a mage by its school and rank.

import { RANK_NAMES } from '../combat/combat.ts';
import { mageTitle } from '../magic/mages.ts';
import { UnitKind, type SimState } from '../state.ts';
import { troopTierName } from './kits.ts';

/** What a unit's name is made from (the entity fields of the same names). */
export interface Nameable {
  kind: number;
  troop: number;
  wTier: number;
  rank: number;
  school: number;
}

/** A worker's, troop's or mage's name with its rank: "Worker (Foreman)", "Copper swordsman (Recruit)", "Battle mage (Acolyte)". */
export function unitTitle(u: Nameable): string {
  if (u.kind === UnitKind.Mage) return mageTitle(u.school, u.rank);
  if (u.kind === UnitKind.Warrior) return `${troopTierName(u.troop, u.wTier)} (${RANK_NAMES.warrior[u.rank] || `rank ${u.rank}`})`;
  return `Worker (${RANK_NAMES.worker[u.rank] || `rank ${u.rank}`})`;
}

/** unitTitle for entity i. */
export function unitTitleOf(state: SimState, i: number): string {
  const e = state.entities;
  return unitTitle({ kind: e.kind[i]!, troop: e.troop[i]!, wTier: e.wTier[i]!, rank: e.rank[i]!, school: e.school[i]! });
}
