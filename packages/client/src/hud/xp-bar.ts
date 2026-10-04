// The XP bar in the middle's title row (Jade's Patch 3): under the health bar
// of a worker, troop or mage, a solid light blue bar for how close it is to
// its next rank, the numbers in its tooltip ("Labourer: 30 of 50 XP to
// Hand."). The rank badge it replaces named the rank; the tooltip leads with it.
// The bar fills from the rank the unit holds to the next (the coordinator's
// ruling on Jade's "how close they are to ranking up"): empty the moment it
// rises, full at the next rank. The tooltip keeps Table 1's running count.
import { MAGE_RANK_NAMES, MAGE_XP_RANK_LIMIT, MAGE_XP_TENTHS, RANK_NAMES, UnitKind, WARRIOR_XP_TENTHS, WORKER_XP_TENTHS, XP_TENTHS } from '@blockyrts/sim';

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

/** The experience, whole points, at which a unit of a kind reaches a rank (Table 1, counted from nothing); 0 for the first rank or a unit without ranks. */
export function rankFloor(kind: number, rank: number): number {
  const ladder = kind === UnitKind.Worker ? WORKER_XP_TENTHS : kind === UnitKind.Warrior ? WARRIOR_XP_TENTHS : kind === UnitKind.Mage ? MAGE_XP_TENTHS : null;
  return Math.floor((ladder?.[rank] ?? 0) / XP_TENTHS);
}

/**
 * The bar for a unit's experience (xp) against what its next rank needs
 * (next, 0 where experience leads no further), or null for a unit without
 * ranks. The bar is how far the unit has come from its own rank's threshold
 * toward the next one's; full at the top rank, empty where the sim names no
 * next need. The tooltip gives the running count, as Table 1 does.
 */
export function xpView(kind: number, rank: number, xp: number, next: number): XpView | null {
  if (!hasRanks(kind)) return null;
  const names = rankNames(kind);
  const now = names[rank] || `Rank ${rank}`;
  const up = names[rank + 1] ?? '';
  if (!up) return { pct: 100, tip: `${now}, the top rank: ${xp} XP.` };
  if (next <= 0) return { pct: 0, tip: `${now}: ${xp} XP.` };
  const from = rankFloor(kind, rank);
  const span = next - from;
  const pct = span > 0 ? Math.max(0, Math.min(100, Math.floor(((xp - from) * 100) / span))) : xp >= next ? 100 : 0;
  // A mage's experience takes her only to Adept Acolyte; the ranks above it also need her training at the Magi Sanctum.
  if (kind === UnitKind.Mage && rank >= MAGE_XP_RANK_LIMIT) {
    return { pct, tip: xp >= next ? `${now}: ${xp} of ${next} XP. Ready to train to ${up} at the Magi Sanctum.` : `${now}: ${xp} of ${next} XP to ${up}, then training at the Magi Sanctum.` };
  }
  return { pct, tip: `${now}: ${xp} of ${next} XP to ${up}.` };
}
