// The troop panel's choices (Troops and gear: Training troops): which weapon
// and armour tier each troop type of a building trains next, and why it
// cannot right now. A pick lasts for the session on this screen; the Lock
// (a sim order, so it is saved and seen by allies) keeps a combination for
// good. Without either, the building's default is the sim's: the best the
// pool pays for, favouring the weapon.
import {
  ARMOUR_KITS,
  costText,
  foodInPool,
  mainCost,
  pieceProblem,
  planPieces,
  productSpec,
  shieldRow,
  hasShield,
  Troop,
  TROOP_NAMES,
  troopPieces,
  troopProduct,
  troopTiersAt,
  TRAINING,
  weaponPiece,
} from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';

/** Picks made on this screen, by building and troop type. */
const picks = new Map<string, { w: number; a: number }>();

const pickKey = (b: BuildingInfo, troop: number): string => `${b.id}:${troop}`;

/** A Lock's combination (0 off, else 1 + weapon x 10 + armour). */
export function lockTiers(lock: number): { w: number; a: number } | null {
  return lock > 0 ? { w: Math.floor((lock - 1) / 10), a: (lock - 1) % 10 } : null;
}

/** The tiers a building trains a troop type at next: the Lock's, else this screen's pick, else the sim's default. */
export function troopChoice(b: BuildingInfo, troop: number): { w: number; a: number; picked: boolean } {
  const row = b.troops.find((t) => t.troop === troop);
  const locked = lockTiers(row?.lock ?? 0);
  if (locked) return { ...locked, picked: true };
  const p = picks.get(pickKey(b, troop));
  if (p && tiersOffered(b, troop, p.w, p.a)) return { ...p, picked: true };
  return { w: row?.w ?? troopTiersAt(b, troop).w[0], a: row?.a ?? 0, picked: false };
}

/** Sets one line of the pick (the other keeps what is shown now); null goes back to the default. */
export function pickTier(b: BuildingInfo, troop: number, line: 'w' | 'a', tier: number | null): void {
  if (tier === null) {
    picks.delete(pickKey(b, troop));
    return;
  }
  const now = troopChoice(b, troop);
  picks.set(pickKey(b, troop), { w: line === 'w' ? tier : now.w, a: line === 'a' ? tier : now.a });
}

function tiersOffered(b: BuildingInfo, troop: number, w: number, a: number): boolean {
  if (!b.troops.some((r) => r.troop === troop)) return false;
  const t = troopTiersAt(b, troop);
  return w >= t.w[0] && w <= t.w[1] && a >= t.a[0] && a <= t.a[1] && weaponPiece(troop, w) !== undefined;
}

/** One tier in a dropdown: its name, and why it cannot be had ('' when it can; `short` when only the pool is short). */
export interface TierOption {
  tier: number;
  name: string;
  why: string;
  short: boolean;
}

/** The weapon tiers a building offers a troop type. */
export function weaponOptions(g: GameInfo, b: BuildingInfo, troop: number): TierOption[] {
  const t = troopTiersAt(b, troop);
  const out: TierOption[] = [];
  for (let w = t.w[0]; w <= t.w[1]; w++) {
    const p = weaponPiece(troop, w);
    if (!p) continue;
    out.push(option(g, w, p.name, [p]));
  }
  return out;
}

/** The armour tiers a building offers (with close melee's shield in the name). */
export function armourOptions(g: GameInfo, b: BuildingInfo, troop: number): TierOption[] {
  const t = troopTiersAt(b, troop);
  const out: TierOption[] = [];
  for (let a = t.a[0]; a <= t.a[1]; a++) {
    const kit = ARMOUR_KITS[a]!;
    const pieces = a === 0 ? [] : hasShield(troop) ? [kit, shieldRow(a)] : [kit];
    const name = a > 0 && hasShield(troop) ? `${kit.name}, ${shieldRow(a).name.toLowerCase()}` : kit.name;
    out.push(option(g, a, name, pieces));
  }
  return out;
}

function option(g: GameInfo, tier: number, name: string, pieces: ReturnType<typeof troopPieces>): TierOption {
  const tech = g.tech();
  let why = '';
  for (const p of pieces) why ||= pieceProblem(p, tech.research, tech.forge, tech.researchName);
  if (why) return { tier, name, why, short: false };
  if (pieces.length > 0 && !planPieces(pieces, g.pool())) return { tier, name, why: `Not enough resources (${costText(mainCost(pieces))}).`, short: true };
  return { tier, name, why: '', short: false };
}

/** Why a building cannot train a troop at these tiers now, or ''. */
export function troopWhy(g: GameInfo, b: BuildingInfo, troop: number, w: number, a: number): string {
  if (!tiersOffered(b, troop, w, a)) return 'This building does not train that.';
  const pieces = troopPieces(troop, w, a);
  const tech = g.tech();
  for (const p of pieces) {
    const why = pieceProblem(p, tech.research, tech.forge, tech.researchName);
    if (why) return why;
  }
  if (troop === Troop.Cavalry && b.horses === 0) return 'Cavalry needs a tamed, grown horse in the stalls.';
  if (!planPieces(pieces, g.pool())) return `Not enough resources (${costText(mainCost(pieces))}).`;
  const info = g.info;
  if (info && foodInPool(info.pool, info.dontEat) < TRAINING.troopFood) return `Not enough food (${TRAINING.troopFood} food).`;
  if (info && info.supplyUsed >= info.supplyCap) return `Not enough supply (${info.supplyUsed} of ${info.supplyCap}). Build or upgrade farms.`;
  if (b.queue.length >= 5) return 'The queue is full (5).';
  return '';
}

/** "Bronze spear, leather jerkin: 1 bronze ingot, 1 hardwood lumber, 3 leather, 30 food, 1 supply; 75 s." */
export function troopCostText(b: BuildingInfo, troop: number, w: number, a: number): string {
  const ps = productSpec(troopProduct(troop, w, a));
  const kit = costText(ps.cost);
  const horse = troop === Troop.Cavalry ? ', a tamed horse' : '';
  return `${kit ? `${kit}, ` : ''}${ps.food} food${horse}, 1 supply; ${Math.round(ps.steps / 20)} s`;
}

export function troopName(troop: number): string {
  return TROOP_NAMES[troop] ?? 'Troop';
}
