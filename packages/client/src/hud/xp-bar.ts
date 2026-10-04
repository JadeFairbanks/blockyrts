// The XP bar in the middle's title row (Jade's Patch 3): under the health bar
// of a worker, troop or mage, a solid light blue bar for how close it is to
// its next rank, the numbers in its tooltip ("Labourer: 120 of 300 XP to
// Hand."). The rank badge it replaces named the rank; the tooltip leads with it.
import { MAGE_RANK_NAMES, MAGE_XP_RANK_LIMIT, RANK_NAMES, UnitKind } from '@blockyrts/sim';

export interface XpView {
  /** How full the bar is, 0 to 100. */
  pct: number;
  tip: string;
}

/** Whether a kind of unit has ranks, and so an XP bar: workers, troops (crewmen too) and mages. */
export function hasRanks(kind: number): boolean {
  return kind === UnitKind.Worker || kind === UnitKind.Warrior || kind === UnitKind.Mage;
}

/** The rank names of a kind of unit, by rank (index 0 is unused). */
function rankNames(kind: number): readonly string[] {
  if (kind === UnitKind.Mage) return MAGE_RANK_NAMES;
  return kind === UnitKind.Warrior ? RANK_NAMES.warrior : RANK_NAMES.worker;
}

/**
 * The bar for a unit's experience (xp) against what its next rank needs
 * (next, 0 where experience leads no further), or null for a unit without
 * ranks. The bar is xp over next, as the tooltip's numbers read; full at the
 * top rank, empty where only training reaches the next one.
 */
export function xpView(kind: number, rank: number, xp: number, next: number): XpView | null {
  if (!hasRanks(kind)) return null;
  const names = rankNames(kind);
  const now = names[rank] || `Rank ${rank}`;
  const up = names[rank + 1] ?? '';
  if (!up) return { pct: 100, tip: `${now}, the top rank: ${xp} XP.` };
  if (next <= 0) return { pct: 0, tip: `${now}: ${xp} XP. ${up} comes by training, not experience.` };
  const pct = Math.max(0, Math.min(100, Math.floor((xp * 100) / next)));
  // A mage's experience takes her only to Adept Acolyte; the ranks above it also need her training at the Magi Sanctum.
  if (kind === UnitKind.Mage && rank >= MAGE_XP_RANK_LIMIT) {
    return { pct, tip: xp >= next ? `${now}: ${xp} of ${next} XP. Ready to train to ${up} at the Magi Sanctum.` : `${now}: ${xp} of ${next} XP to ${up}, then training at the Magi Sanctum.` };
  }
  return { pct, tip: `${now}: ${xp} of ${next} XP to ${up}.` };
}
