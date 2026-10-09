// The training cards' choices (Patch 2, Troops and gear: Training troops):
// which kit each card of a Barracks or Magi Sanctum trains next, and
// why it cannot right now. A card is a troop type (1 to 5) or one of the
// Sanctum's schools (6 support, 7 battle: the sim's mageLock). Unlocked, a
// card follows the stock: the sim's best the pool pays for, weapon (or wand)
// first. A tier picked on an unlocked card holds while that building stays
// selected (keepPicks); the padlock (a sim order, so it is saved and allies
// see it) keeps a kit for good, and a pick on a locked card moves the lock.
// The Big House has no cards: its A, Q and N train the sim's default.
import {
  ARMOUR_KITS,
  BuildingKind,
  CAVALRY_BASE,
  costText,
  hasShield,
  MAGE_FOOD,
  MAGE_KIT_TIERS,
  mageLock,
  mageOffered,
  magePieces,
  mageProduct,
  mageTitle,
  mainCost,
  pieceProblem,
  planPieces,
  productSpec,
  RESOURCES,
  ROBE_KITS,
  School,
  shieldRow,
  STEPS_PER_SECOND,
  Troop,
  TROOP_NAMES,
  troopPieces,
  troopProduct,
  troopTierName,
  troopTiersAt,
  TRAINING,
  WAND_KITS,
  weaponPiece,
  type Piece,
} from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import { durationText } from './farm-panel.ts';
import { piecesStats } from './kit-text.ts';

/** A card's kit line: the weapon (a mage's wand) or the armour (her robe). */
export type KitLine = 'w' | 'a';

/** One card of a building: its id, the sim's default tiers (the padlock's when shut) and the padlock (0 off, else 1 + weapon x 10 + armour). */
export interface CardRow {
  card: number;
  w: number;
  a: number;
  lock: number;
}

/** Whether a card is one of the Sanctum's schools rather than a troop type. */
export const isMageCard = (card: number): boolean => card > Troop.Cavalry;

/** The school of a Sanctum card. */
export const cardSchool = (card: number): number => card - Troop.Cavalry;

/** The action menu's action that trains a card's unit (its key is the card's letter). */
export function cardAction(card: number): string {
  if (isMageCard(card)) return cardSchool(card) === School.Battle ? 'trainBattleMage' : 'trainSupportMage';
  return ['', 'trainClose', 'trainLong', 'trainRanger', 'trainBrawler', 'trainCavalry'][card] ?? '';
}

/**
 * "Copper swordsman", "Support mage": the card's name, as on the Barracks' buttons. With a weapon tier, the
 * troop goes by that tier's name; "close melee" and "long melee" are never shown (Patch 5, UI-11).
 */
export function cardName(card: number, w?: number): string {
  if (isMageCard(card)) return cardSchool(card) === School.Battle ? 'Battle mage' : 'Support mage';
  if (w !== undefined) return troopTierName(card, w);
  return TROOP_NAMES[card] ?? 'Troop';
}

export function troopName(troop: number, w?: number): string {
  return cardName(troop, w);
}

/** A building's cards, troops first: none at a main base (the Big House trains its lowest tier with nothing to pick). */
export function cardsOf(b: BuildingInfo): CardRow[] {
  if (b.kind === BuildingKind.MainBase || !b.complete) return [];
  return [...b.troops.map((t) => ({ card: t.troop, w: t.w, a: t.a, lock: t.lock })), ...(b.mages ?? []).map((m) => ({ card: mageLock(m.school), w: m.w, a: m.a, lock: m.lock }))];
}

function row(b: BuildingInfo, card: number): CardRow | undefined {
  if (isMageCard(card)) {
    const m = b.mages?.find((x) => mageLock(x.school) === card);
    return m ? { card, w: m.w, a: m.a, lock: m.lock } : undefined;
  }
  const t = b.troops.find((x) => x.troop === card);
  return t ? { card, w: t.w, a: t.a, lock: t.lock } : undefined;
}

/** Picks made on the cards, by building and card; dropped when the building leaves the selection. */
const picks = new Map<string, { w: number; a: number }>();

const pickKey = (b: BuildingInfo, card: number): string => `${b.id}:${card}`;

/** A padlock's kit (0 off, else 1 + weapon x 10 + armour). */
export function lockTiers(lock: number): { w: number; a: number } | null {
  return lock > 0 ? { w: Math.floor((lock - 1) / 10), a: (lock - 1) % 10 } : null;
}

const lockOf = (w: number, a: number): number => 1 + w * 10 + a;

/** What a card trains next: the padlock's kit, else the pick made while the building is selected, else the stock's best. */
export function cardChoice(b: BuildingInfo, card: number): { w: number; a: number; picked: boolean; locked: boolean } {
  const r = row(b, card);
  const locked = lockTiers(r?.lock ?? 0);
  if (locked) return { ...locked, picked: false, locked: true };
  const p = picks.get(pickKey(b, card));
  if (p && cardOffered(b, card, p.w, p.a)) return { ...p, picked: true, locked: false };
  if (r) return { w: r.w, a: r.a, picked: false, locked: false };
  if (isMageCard(card)) return { w: MAGE_KIT_TIERS[0], a: MAGE_KIT_TIERS[0], picked: false, locked: false };
  return { w: troopTiersAt(b, card).w[0], a: 0, picked: false, locked: false };
}

/** A troop type's choice, for the action menu's buttons (a main base's is always the sim's default). */
export function troopChoice(b: BuildingInfo, troop: number): { w: number; a: number; picked: boolean; locked: boolean } {
  return cardChoice(b, troop);
}

/** Whether a building trains a card's unit with these tiers at all. */
export function cardOffered(b: BuildingInfo, card: number, w: number, a: number): boolean {
  if (isMageCard(card)) return (b.mages ?? []).some((m) => mageLock(m.school) === card) && mageOffered(b, cardSchool(card), w, a);
  if (!b.troops.some((r) => r.troop === card)) return false;
  const t = troopTiersAt(b, card);
  return w >= t.w[0] && w <= t.w[1] && a >= t.a[0] && a <= t.a[1] && weaponPiece(card, w) !== undefined;
}

/**
 * Picks one line's tier on a card of every selected building, keeping the
 * other line as the first one shows it. An unlocked card holds the pick while
 * its building stays selected; a locked one keeps its padlock, now on the new
 * kit: those come back as padlock orders to send.
 */
export function pickTier(all: readonly BuildingInfo[], card: number, line: KitLine, tier: number): Array<{ building: number; lock: number }> {
  const first = all[0];
  if (!first) return [];
  const now = cardChoice(first, card);
  const w = line === 'w' ? tier : now.w;
  const a = line === 'a' ? tier : now.a;
  const out: Array<{ building: number; lock: number }> = [];
  for (const b of all) {
    if (!cardOffered(b, card, w, a)) continue;
    if ((row(b, card)?.lock ?? 0) > 0) out.push({ building: b.id, lock: lockOf(w, a) });
    else picks.set(pickKey(b, card), { w, a });
  }
  return out;
}

/**
 * The padlock pressed on a card with these buildings selected: locked on the
 * first, every selected one that is locked opens (back to the stock); else
 * every selected one locks on the kit the first shows. Padlock orders to send.
 */
export function padlock(all: readonly BuildingInfo[], card: number): Array<{ building: number; lock: number }> {
  const first = all[0];
  if (!first) return [];
  const c = cardChoice(first, card);
  if (c.locked) return all.filter((b) => (row(b, card)?.lock ?? 0) > 0).map((b) => ({ building: b.id, lock: 0 }));
  return all.filter((b) => cardOffered(b, card, c.w, c.a)).map((b) => ({ building: b.id, lock: lockOf(c.w, c.a) }));
}

/** How many of these buildings have a card locked. */
export function lockedCount(all: readonly BuildingInfo[], card: number): number {
  return all.filter((b) => (row(b, card)?.lock ?? 0) > 0).length;
}

/** Forgets the picks of every building no longer selected (Jade: a pick holds only while its building stays selected). */
export function keepPicks(selected: ReadonlySet<number>): void {
  for (const k of [...picks.keys()]) if (!selected.has(Number(k.split(':')[0]))) picks.delete(k);
}

/** A card's whole kit. */
export function cardPieces(card: number, w: number, a: number): Piece[] {
  return isMageCard(card) ? magePieces(w, a) : troopPieces(card, w, a);
}

/** The product a card queues. */
export function cardProduct(card: number, w: number, a: number): number {
  return isMageCard(card) ? mageProduct(cardSchool(card), w, a) : troopProduct(card, w, a);
}

/** One tier on a strip: its name, its pieces, and why it cannot be had ('' when it can; `short` when only the stock is short). */
export interface TierOption {
  tier: number;
  name: string;
  why: string;
  short: boolean;
  pieces: Piece[];
}

/** The tiers a building offers on a card's line. */
export function cardOptions(g: GameInfo, b: BuildingInfo, card: number, line: KitLine): TierOption[] {
  if (isMageCard(card)) {
    const [lo, hi] = MAGE_KIT_TIERS;
    const out: TierOption[] = [];
    for (let t = lo; t <= hi; t++) {
      const p = line === 'w' ? WAND_KITS[t]! : ROBE_KITS[t]!;
      out.push(option(g, t, p.name, [p]));
    }
    return out;
  }
  return line === 'w' ? weaponOptions(g, b, card) : armourOptions(g, b, card);
}

/** A kit name inside a sentence: "fluted Gothic harness" (the proper names keep their capitals). */
const lowerFirst = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);

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
    const name = a > 0 && hasShield(troop) ? `${kit.name}, ${lowerFirst(shieldRow(a).name)}` : kit.name;
    out.push(option(g, a, name, pieces));
  }
  return out;
}

function option(g: GameInfo, tier: number, name: string, pieces: Piece[]): TierOption {
  const tech = g.tech();
  let why = '';
  for (const p of pieces) why ||= pieceProblem(p, tech.research, tech.forge, tech.researchName);
  if (why) return { tier, name, why, short: false, pieces };
  if (pieces.length > 0 && !planPieces(pieces, g.pool())) return { tier, name, why: shortText(g, pieces, true), short: true, pieces };
  return { tier, name, why: '', short: false, pieces };
}

/** A count of a good: "2 bronze ingots", "1 copper ingot", "4 leather" (ingots are counted; the rest are amounts). */
export function goodText(res: number, n: number): string {
  const name = RESOURCES[res]!.name.toLowerCase();
  return `${n} ${n !== 1 && name.endsWith(' ingot') ? `${name}s` : name}`;
}

/** "2 bronze ingots, 1 hardwood lumber, 4 leather". */
export function goodsText(cost: ReadonlyArray<readonly [number, number]>): string {
  return cost.map(([res, n]) => goodText(res, n)).join(', ');
}

/** "Short: 1 of 2 wrought iron." (the first good the stock lacks for the pieces), with "in stock" on a strip's tile. */
export function shortText(g: GameInfo, pieces: readonly Piece[], inStock = false): string {
  const cost = mainCost(pieces);
  const pool = g.pool();
  for (const [res, n] of cost) {
    const have = pool[res] ?? 0;
    if (have < n) return `Short: ${have} of ${goodText(res, n)}${inStock ? ' in stock' : ''}.`;
  }
  return `Not enough resources (${goodsText(cost)}).`;
}

/** Why a building cannot train a card's unit at these tiers now, or '', in the order before Patch 2. */
export function cardWhy(g: GameInfo, b: BuildingInfo, card: number, w: number, a: number): string {
  if (!cardOffered(b, card, w, a)) return 'This building does not train that.';
  if (card === Troop.Cavalry && g.mainBaseLevel() < CAVALRY_BASE) return `Needs a tier ${CAVALRY_BASE} main base.`;
  const pieces = cardPieces(card, w, a);
  const tech = g.tech();
  for (const p of pieces) {
    const why = pieceProblem(p, tech.research, tech.forge, tech.researchName);
    if (why) return why;
  }
  if (card === Troop.Cavalry && b.horses === 0) return 'No grown tamed horse ready in a Barn.';
  if (!planPieces(pieces, g.pool())) return shortText(g, pieces);
  const food = isMageCard(card) ? MAGE_FOOD : TRAINING.troopFood;
  const info = g.info;
  if (info && g.food() < food) return `Not enough food (${food}).`;
  if (info && info.supplyUsed >= info.supplyCap) return `Not enough supply (${info.supplyUsed} of ${info.supplyCap}).`;
  if (b.queue.length >= 5) return 'The queue is full (5).';
  return '';
}

/** Why a building cannot train a troop at these tiers now, or '' (the action menu's buttons). */
export function troopWhy(g: GameInfo, b: BuildingInfo, troop: number, w: number, a: number): string {
  return cardWhy(g, b, troop, w, a);
}

/** "30 food, 2 bronze ingots, 1 hardwood lumber, 4 leather. 2 minutes 25 seconds, 1 supply." */
export function cardCostText(card: number, w: number, a: number): string {
  const ps = productSpec(cardProduct(card, w, a));
  const kit = goodsText(ps.cost);
  const horse = card === Troop.Cavalry ? ', a tamed horse' : '';
  return `${ps.food} food${kit ? `, ${kit}` : ''}${horse}. ${durationText(ps.steps / STEPS_PER_SECOND)}, 1 supply.`;
}

/** The action menu's cost line for a troop: "1 bronze ingot, 1 hardwood lumber, 3 leather, 30 food, 1 supply; 75 s". */
export function troopCostText(_b: BuildingInfo, troop: number, w: number, a: number): string {
  const ps = productSpec(troopProduct(troop, w, a));
  const kit = costText(ps.cost);
  const horse = troop === Troop.Cavalry ? ', a tamed horse' : '';
  return `${kit ? `${kit}, ` : ''}${ps.food} food${horse}, 1 supply; ${Math.round(ps.steps / STEPS_PER_SECOND)} s`;
}

/** "a Bronze swordsman", "an Iron archer": the troop a card's weapon tier makes, by its name (Patch 2, troop names). */
export function aTroopName(troop: number, w: number): string {
  const name = troopTierName(troop, w);
  return `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** "Trains a Bronze swordsman: bronze shortsword, wooden shield, boiled-leather cuirass." or "Trains a Support mage (Novice Acolyte) with a hazel wand and a homespun robe." */
export function cardTrainsText(card: number, w: number, a: number): string {
  const named = cardPieces(card, w, a).map((p) => lowerFirst(p.name));
  if (isMageCard(card)) return `Trains a ${mageTitle(cardSchool(card), 1)} with a ${named.join(' and a ')}.`;
  return `Trains ${aTroopName(card, w)}: ${named.join(', ')}${a === 0 ? ', no armour' : ''}.`;
}

/** The card picture's tooltip lines: what it trains, its stats, its cost and time, and how the kit is chosen. */
export function cardTooltip(card: number, c: { w: number; a: number; picked: boolean; locked: boolean }, building: string): string {
  const pieces = cardPieces(card, c.w, c.a);
  const state = c.locked ? 'Locked: always this kit here; allies see it.' : c.picked ? `Picked: until this ${building} is deselected.` : `Follows the stock: the best ${isMageCard(card) ? 'wand and robe' : 'kit'} it pays for, ${isMageCard(card) ? 'wand' : 'weapon'} first.`;
  return [cardTrainsText(card, c.w, c.a), piecesStats(pieces, undefined, isMageCard(card)), `Costs ${cardCostText(card, c.w, c.a)}`, state].filter((x) => x).join('\n');
}
