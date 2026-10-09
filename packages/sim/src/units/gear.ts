// Upgrading units (Troops and gear: Upgrading units, Jade 2026-10-03). Patch
// 2 cut the last specialist training, cannon crew: artillery crewmen are
// trained at the Artillery workshop (siege/data.ts CREWMAN). Upgrade
// equipment raises every line of a unit's kit (units/kits.ts Line) to the
// best tier it can have; Upgrade Weapon and Upgrade Armour raise one line,
// a tier or (Max) to the best. The new kit is paid from stock when the
// button is pressed, the most capable units first (highest rank, then the
// lowest id), whole steps only; each unit then walks to the nearest Forge,
// Barracks or main base (mages also the Magi Sanctum), stands beside it
// while the bar fills, and comes back better armed. A dropped upgrade gives
// its payment back. Patch 5 (Jade, GP-1 and GP-3): a ready item in stock is
// put on first, at no cost and in a fifth of the time, and the piece taken
// off goes to stock as an item. Workers also fetch and return carts at a
// main base.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { forgeStepOf } from '../buildings/production.ts';
import { costText, pay, refund, Res, RESOURCES } from '../economy/resources.ts';
import { isGod, UnitKind, type SimState } from '../state.ts';
import { RESEARCH } from '../combat/items.ts';
import { Act, besideBuilding, resetWalk, walkTo } from './behaviour.ts';
import type { UnitOrder } from './unit-orders.ts';
import { Role } from '../threats/types.ts';
import { say, sayTinkering } from '../peoples/speech.ts';
import { partnerOf } from './weight.ts';
import { tinker } from './tinker.ts';
import {
  applyKit,
  equipmentPlans,
  ITEM_WAY,
  holderKind,
  Line,
  KIT_LINES,
  linePiece,
  lineTier,
  lineTop,
  mainCost,
  ownGear,
  ownGearItem,
  piecesCost,
  planItem,
  replacedItem,
  takesTips,
  TIPS_KIT,
  Troop,
  upgradePieces,
  upgradeSteps,
  upgradeTarget,
  type EquipmentHolder,
  type KitHolder,
  type TechView,
} from './kits.ts';

type KitUpOrder = Extract<UnitOrder, { t: 'kitUp' }>;
type CartOrder = Extract<UnitOrder, { t: 'cart' }>;

/** A unit's kit as the upgrade rules see it, or undefined for units that have none (mobs, animals, the peoples' units, mercenaries). */
export function kitHolder(state: SimState, i: number): KitHolder | undefined {
  const e = state.entities;
  if (e.role[i] === Role.Mercenary || e.role[i] === Role.People) return undefined;
  const kind = holderKind(e.kind[i]!);
  if (!kind) return undefined;
  const h: KitHolder = { kind, troop: e.troop[i]!, w: e.wTier[i]!, a: e.aTier[i]!, s: e.sTier[i]!, t: e.tips[i]! };
  // A weapon with a gear row of its own (the obsidian hand-axe) goes back to stock as itself.
  const wItem = ownGearItem(e.weapon[i]!);
  if (wItem !== undefined) h.wItem = wItem;
  return h;
}

/** What a player has for the kit's needs: research, the Forge step their town is at and research names. */
export function techOf(state: SimState, player: number): TechView {
  return {
    // Godmode has every research (Jade's Patch 5).
    research: isGod(state, player) ? -1 : state.players[player]!.research,
    forge: forgeStepOf(state, player),
    researchName: (r) => RESEARCH[r]?.name ?? 'research',
  };
}

/** Whether a building is a place a unit can upgrade beside: a Forge, Barracks or main base; the Magi Sanctum for mages; only a main base for a woodsman (Jade's WD-3). */
export function upgradesAt(h: KitHolder, kind: number): boolean {
  if (h.kind === 'warrior' && h.troop === Troop.Woodsman) return kind === BuildingKind.MainBase;
  if (kind === BuildingKind.Forge || kind === BuildingKind.Barracks || kind === BuildingKind.MainBase) return true;
  if (kind === BuildingKind.MagiSanctum) return h.kind === 'mage';
  return false;
}

/** What a unit with nowhere to upgrade hears. */
function noPlaceText(h: KitHolder): string {
  if (h.kind === 'mage') return 'There is no Forge, Barracks, main base or Magi Sanctum to upgrade at.';
  if (h.kind === 'warrior' && h.troop === Troop.Woodsman) return 'A woodsman upgrades his weapon only at a main base.';
  return 'There is no Forge, Barracks or main base to upgrade at.';
}

/** The finished building of the unit's owner nearest it that passes a test, or undefined. */
function nearestOwn(state: SimState, i: number, ok: (b: Building) => boolean): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || !ok(b)) continue;
    const [x, z] = buildingCentre(b);
    const d = dist2(x, z, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** A player's main base nearest a unit, or undefined. */
export function nearestMainBase(state: SimState, i: number): Building | undefined {
  return nearestOwn(state, i, (b) => b.kind === BuildingKind.MainBase);
}

/** The nearest place a unit can upgrade beside, or undefined. */
export function nearestUpgradePlace(state: SimState, i: number, h: KitHolder): Building | undefined {
  return nearestOwn(state, i, (b) => upgradesAt(h, b.kind));
}

/**
 * Whether a unit sent to put on an item from the stock (Equip) can take it
 * beside a building: a place to upgrade, or the Storehouse, a drop-off for
 * everything (Jade's GP-2: "return to a drop off point to receive it").
 */
export function equipsAt(h: KitHolder, kind: number): boolean {
  return kind === BuildingKind.Storehouse || upgradesAt(h, kind);
}

/** The nearest place a unit can take an item from the stock at, or undefined. */
export function nearestEquipPlace(state: SimState, i: number, h: KitHolder): Building | undefined {
  return nearestOwn(state, i, (b) => equipsAt(h, b.kind));
}

/** Whether an upgrade puts a ready item from the stock on, so it can be taken at any drop-off. */
function putsItemOn(h: KitHolder, o: KitUpOrder): boolean {
  const p = linePiece(h, o.line, o.to);
  return p !== undefined && planItem(p, o.ways) !== undefined;
}

/** The upgrade a unit has queued on a line, or undefined. */
export function pendingKitUp(state: SimState, i: number, line: number): KitUpOrder | undefined {
  return state.entities.queue[i]!.find((q): q is KitUpOrder => q.t === 'kitUp' && q.line === line);
}

/** Puts an order in front of whatever the unit was doing, so it carries on after. */
export function inFront(state: SimState, i: number, o: UnitOrder): void {
  const e = state.entities;
  e.queue[i]!.unshift(o);
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  e.target[i] = 0;
  resetWalk(state, i);
}

/** Lower-case name of a line's piece at a tier ("bronze sword", "wrought-iron tool kit"). */
function pieceName(h: KitHolder, line: number, tier: number): string {
  const p = linePiece(h, line, tier);
  return p ? p.name.toLowerCase() : 'kit';
}

/** The gear row of its own an upgrade puts on (the obsidian hand-axe, paid with it), or 0. */
function ownPutOn(h: KitHolder, o: KitUpOrder): number {
  const p = o.line === Line.Weapon ? linePiece(h, o.line, o.to) : undefined;
  return p ? ownGear(planItem(p, o.ways)) : 0;
}

/** The lower-case name of what an upgrade puts on: the item's own name when it has a row of its own. */
function newPieceName(h: KitHolder, o: KitUpOrder): string {
  const own = ownPutOn(h, o);
  return own ? RESOURCES[ownGearItem(own)!]!.name.toLowerCase() : pieceName(h, o.line, o.to);
}

/** The same with its article: "a bronze sword", "an iron coat of plates", "poison tips". */
function aPiece(h: KitHolder, line: number, tier: number): string {
  const name = pieceName(h, line, tier);
  if (line === Line.Tips) return name;
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * Upgrade Weapon or Upgrade Armour (and their Max twins) on some units. The
 * highest rank goes first; each unit that can take a whole step pays for it
 * now and walks to the nearest place to upgrade; units short of stock, or
 * already on their way to upgrade that line, are passed by. Returns how
 * many units were sent; when none were, the player hears why.
 */
export function orderUpgrade(state: SimState, player: number, units: readonly number[], line: number, max: boolean): number {
  const e = state.entities;
  const p = state.players[player];
  if (!p || !KIT_LINES.includes(line as Line)) return 0;
  const tech = techOf(state, player);
  const order = units.filter((i) => e.owner[i] === player && e.hp[i]! > 0).sort((a, b) => e.rank[b]! - e.rank[a]! || e.id[a]! - e.id[b]!);
  let sent = 0;
  let why = '';
  let whoWhy = -1;
  for (const i of order) {
    const h = kitHolder(state, i);
    if (!h || pendingKitUp(state, i, line)) continue;
    const t = upgradeTarget(h, line, max, p.pool, tech);
    if ('why' in t) {
      if (!why) {
        why = t.why;
        whoWhy = i;
      }
      continue;
    }
    const place = nearestUpgradePlace(state, i, h);
    if (!place) {
      if (!why) {
        why = noPlaceText(h);
        whoWhy = i;
      }
      continue;
    }
    pay(p.pool, t.plan.cost);
    inFront(state, i, { t: 'kitUp', line, to: t.to, ways: t.plan.ways, paid: 1, b: place.id });
    // Information, not an alert: a bubble only (Jade's play-test notes).
    say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} for ${aPiece(h, line, t.to)}.`, false, true);
    sent++;
  }
  if (sent === 0 && why) {
    if (whoWhy >= 0) say(state, whoWhy, why, true);
    else state.events.push({ player, kind: 'alert', text: why });
  }
  return sent;
}

/**
 * Upgrade equipment (Jade's Patch 2: one button for every combat unit but
 * siege, and for workers' tools): each unit's weapon, then its armour, then
 * close melee's shield and a bow's poison tips (Patch 5), to the best tier
 * the stock gives, a ready item first, weapons first for every unit and the
 * highest ranks first (kits.ts equipmentPlans). Each unit with something to
 * take pays for it now and walks to the nearest place to upgrade, where it
 * sits tinkering through each piece's time, the weapon first. Returns how
 * many units were sent; when none were, the player hears why. The action
 * menu's button and the better-kit question both give this order.
 */
export function orderUpgradeEquipment(state: SimState, player: number, units: readonly number[]): number {
  const e = state.entities;
  const p = state.players[player];
  if (!p) return 0;
  const tech = techOf(state, player);
  const list: EquipmentHolder[] = [];
  const places = new Map<number, Building>();
  let why = '';
  let whoWhy = -1;
  for (const i of units) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    const h = kitHolder(state, i);
    if (!h) continue;
    // A unit with nowhere to go holds back no stock from the others.
    const place = nearestUpgradePlace(state, i, h);
    if (!place) {
      if (!why) {
        why = noPlaceText(h);
        whoWhy = i;
      }
      continue;
    }
    places.set(e.id[i]!, place);
    list.push({ id: e.id[i]!, h, rank: e.rank[i]!, pending: pendingLines(state, i) });
  }
  let sent = 0;
  for (const plan of equipmentPlans(list, p.pool, tech)) {
    const i = e.indexOf(plan.id);
    const h = kitHolder(state, i)!;
    if (!plan.plans.some((x) => x)) {
      // A reason the player can act on beats one about having no place.
      if (!why || whoWhy < 0 || why.startsWith('There is no')) {
        why = plan.why;
        whoWhy = i;
      }
      continue;
    }
    const place = places.get(plan.id)!;
    const pieces: string[] = [];
    // In front of whatever it was doing, the last line first, so the weapon goes on first, then the armour, the shield and the tips.
    for (let k = KIT_LINES.length - 1; k >= 0; k--) {
      const line = KIT_LINES[k]!;
      const lp = plan.plans[line];
      if (!lp) continue;
      const to = plan.to[line]!;
      pay(p.pool, lp.cost);
      inFront(state, i, { t: 'kitUp', line, to, ways: lp.ways, paid: 1, b: place.id });
      pieces.unshift(aPiece(h, line, to));
    }
    say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} for ${listText(pieces)}.`, false, true);
    sent++;
  }
  if (sent === 0 && why) {
    if (whoWhy >= 0) say(state, whoWhy, why, true);
    else state.events.push({ player, kind: 'alert', text: why });
  }
  return sent;
}

/** "a steel halberd", "an iron pike", "poison tips": a good's name with its article. */
function aGood(res: number): string {
  const name = (RESOURCES[res]?.name ?? 'that').toLowerCase();
  if (res === Res.PoisonTips) return name;
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * What a stock item goes on as for a unit (Patch 5, GP-2: Equip): the line,
 * the tier and the item's place in its piece's list, or why it cannot: a
 * piece the unit's kind has no slot for (a spear for a swordsman, a robe for
 * a ranger), or no better than what it has.
 */
export function equipTarget(h: KitHolder, res: number): { line: Line; to: number; item: number } | { why: string } {
  for (const line of KIT_LINES) {
    const top = lineTop(h, line);
    for (let to = 1; to <= top; to++) {
      const item = linePiece(h, line, to)?.items.indexOf(res as Res) ?? -1;
      if (item < 0) continue;
      if (to <= lineTier(h, line)) return { why: `I already have ${to === lineTier(h, line) ? 'one' : 'better'}.` };
      return { line, to, item };
    }
  }
  return { why: `I cannot use ${aGood(res)}.` };
}

/**
 * Equip (Jade's Patch 5, GP-2: "click the equip and then click the unit you
 * want to equip it to, causing them to return to a drop off point to receive
 * it, and upgrade to that item via the usual process"): the first of the
 * units that can take the stock's item pays it now and walks to the nearest
 * drop-off or place to upgrade (main base, Storehouse, Forge, Barracks; the
 * Magi Sanctum for mages), where it puts it on in a fifth of its time, as Upgrade
 * equipment does with a ready item. Returns how many went (0 or 1); a unit
 * that cannot says why.
 */
export function orderEquip(state: SimState, player: number, units: readonly number[], res: number): number {
  const e = state.entities;
  const p = state.players[player];
  if (!p) return 0;
  if ((p.pool[res] ?? 0) <= 0) {
    state.events.push({ player, kind: 'alert', text: `There is no ${(RESOURCES[res]?.name ?? 'such item').toLowerCase()} in the stock.` });
    return 0;
  }
  for (const i of units) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    const h = kitHolder(state, i);
    if (!h) continue;
    const t = equipTarget(h, res);
    if ('why' in t) {
      say(state, i, t.why, true);
      continue;
    }
    if (pendingKitUp(state, i, t.line)) {
      say(state, i, 'I am already on my way to upgrade that.', true);
      continue;
    }
    const place = nearestEquipPlace(state, i, h);
    if (!place) {
      say(state, i, h.kind === 'mage' ? 'There is no main base, Storehouse, Forge, Barracks or Magi Sanctum to take it at.' : 'There is no main base, Storehouse, Forge or Barracks to take it at.', true);
      continue;
    }
    pay(p.pool, [[res as Res, 1]]);
    inFront(state, i, { t: 'kitUp', line: t.line, to: t.to, ways: ITEM_WAY + 8 * t.item, paid: 1, b: place.id });
    say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} for ${aGood(res)}.`, false, true);
    return 1;
  }
  return 0;
}

/** The lines a unit already has an upgrade on the way for, a bit per Line. */
export function pendingLines(state: SimState, i: number): number {
  let bits = 0;
  for (const q of state.entities.queue[i]!) if (q.t === 'kitUp') bits |= 1 << q.line;
  return bits;
}

/** "a, b and c". */
function listText(parts: readonly string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Gives back what an upgrade it had not finished paid (a new order, Stop, or death). */
export function refundKit(state: SimState, i: number, o: UnitOrder): void {
  if (o.t !== 'kitUp' || !o.paid) return;
  o.paid = 0;
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner >= state.players.length) return;
  const h = kitHolder(state, i);
  if (!h) return;
  refund(state.players[owner]!.pool, piecesCost(upgradePieces(h, o.line, o.to), o.ways), 1000);
}

/** Steps an upgrade under way has run, and how many it takes, for the fill bar; [0, 0] when the unit is not upgrading. */
export function upgradeProgress(state: SimState, i: number): [number, number] {
  const e = state.entities;
  const o = e.queue[i]![0];
  if (!o || o.t !== 'kitUp' || e.act[i] !== Act.Work) return [0, 0];
  const h = kitHolder(state, i);
  return h ? [e.timer[i]!, upgradeSteps(h, o.line, o.to, o.ways)] : [0, 0];
}

/** Walks to the place to upgrade, sits beside it tinkering while the bar fills, and takes the new kit. */
export function runKitUp(state: SimState, i: number, o: KitUpOrder): boolean {
  const e = state.entities;
  const h = kitHolder(state, i);
  if (!h) return true;
  let b = state.buildings.get(o.b);
  const item = putsItemOn(h, o);
  if (!b || b.owner !== e.owner[i] || !b.complete || !(item ? equipsAt(h, b.kind) : upgradesAt(h, b.kind))) {
    b = item ? nearestEquipPlace(state, i, h) : nearestUpgradePlace(state, i, h);
    if (!b) {
      refundKit(state, i, o);
      say(state, i, 'There is nowhere left to upgrade. I kept the materials in stock.', true);
      return true;
    }
    o.b = b.id;
    e.act[i] = Act.Start;
  }
  if (e.act[i] === Act.Start || e.act[i] === Act.Walk) {
    e.act[i] = Act.Walk;
    const r = walkTo(state, i, besideBuilding(b));
    if (r === 0) return false;
    if (r === 2) {
      refundKit(state, i, o);
      say(state, i, `I cannot reach the ${buildingName(b.kind, b.level, b.variant).toLowerCase()} to upgrade.`, true);
      return true;
    }
    e.act[i] = Act.Work;
    e.timer[i] = 0;
    // What it is doing, in the present tense, its bubble up while the bar runs (Jade's Patch 3).
    sayTinkering(state, i, `Upgrading to ${newPieceName(h, o)}.`);
  }
  // Beside it, the unit sits and tinkers while the bar over its head fills (Jade's Patch 2).
  // Godmode: the new piece goes on at once.
  if (!tinker(state, i, isGod(state, e.owner[i]!) ? 1 : upgradeSteps(h, o.line, o.to, o.ways))) return false;
  finishKitUp(state, i, h, o);
  return true;
}

/** Puts an item in its owner's stock. */
function toStock(state: SimState, owner: number, item: Res | undefined): void {
  if (item === undefined || owner >= state.players.length) return;
  const pool = state.players[owner]!.pool;
  pool[item] = pool[item]! + 1;
}

/**
 * Puts the new tier on, the slots taking the new kit: the old piece goes to
 * stock as an item (Patch 5, GP-3: no longer back to its materials). A bow
 * swapped for a sling or a gun hands its poison tips back to stock too.
 */
function finishKitUp(state: SimState, i: number, h: KitHolder, o: KitUpOrder): void {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (o.to <= lineTier(h, o.line) || o.to > lineTop(h, o.line)) {
    // Already there (a second upgrade got in first), or no longer fits (tips for a bow that is gone): the payment goes back.
    refundKit(state, i, o);
    return;
  }
  toStock(state, owner, replacedItem(h, o.line));
  o.paid = 0;
  if (o.line === Line.Weapon) e.wTier[i] = o.to;
  else if (o.line === Line.Shield) e.sTier[i] = o.to;
  else if (o.line === Line.Tips) e.tips[i] = o.to;
  else e.aTier[i] = o.to;
  if (e.tips[i]! > 0 && !takesTips(h.troop, e.wTier[i]!)) {
    e.tips[i] = 0;
    toStock(state, owner, TIPS_KIT.items[0]);
  }
  applyKit(e, i, h.kind);
  const own = ownPutOn(h, o);
  if (own) e.weapon[i] = own;
  // Done, after its last piece: the next piece's bar would cover the line at once (Jade's Patch 3: no past tense while a bar runs).
  if (e.queue[i]![1]?.t === 'kitUp') return;
  say(state, i, h.kind === 'worker' ? `New tools: ${newPieceName(h, o)}.` : `Upgraded to ${newPieceName(h, o)}.`, false, true);
}

/** The text an upgrade would cost, for tooltips: the new kit's main cost. */
export function upgradeCostText(h: KitHolder, line: number, to: number): string {
  return costText(mainCost(upgradePieces(h, line, to)));
}

// ----- carts -----

/**
 * Fetch Cart on workers: each walks to the nearest main base and takes a
 * cart from stock: an ox or horse cart for a worker leading a hitched
 * animal, else a hand cart. With `back`, each hands its cart in instead.
 */
export function orderCart(state: SimState, player: number, units: readonly number[], back: boolean): number {
  const e = state.entities;
  const p = state.players[player];
  if (!p) return 0;
  let sent = 0;
  const left = [p.pool[Res.HandCart]!, p.pool[Res.OxCart]!];
  for (const i of units) {
    if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.queue[i]!.some((q) => q.t === 'cart')) continue;
    const base = nearestMainBase(state, i);
    if (!base) {
      state.events.push({ player, kind: 'alert', text: 'There is no main base to keep carts at.' });
      return sent;
    }
    let res = 0;
    if (back) {
      if (!e.kit[i]) continue;
    } else {
      const ox = partnerOf(state, i) >= 0;
      if (ox && left[1]! > 0 && e.kit[i] !== Res.OxCart) res = Res.OxCart;
      else if (left[0]! > 0 && !e.kit[i]) res = Res.HandCart;
      else continue;
      left[res === Res.OxCart ? 1 : 0]!--;
    }
    inFront(state, i, { t: 'cart', b: base.id, res });
    sent++;
  }
  if (sent === 0 && !back) state.events.push({ player, kind: 'alert', text: 'No cart in stock. Carts are made at the Workshop: hand carts from main base tier 2, ox and horse carts from tier 3.' });
  return sent;
}

/** Walks to the main base and takes a cart from stock, or hands one in. */
export function runCart(state: SimState, i: number, o: CartOrder): boolean {
  const e = state.entities;
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !b.complete || b.kind !== BuildingKind.MainBase) {
    b = nearestMainBase(state, i);
    if (!b) return true;
    o.b = b.id;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === 0) return false;
  if (r === 2) {
    say(state, i, 'I cannot reach the main base for a cart.', true);
    return true;
  }
  const owner = e.owner[i]!;
  if (owner >= state.players.length) return true;
  const pool = state.players[owner]!.pool;
  if (e.kit[i]) pool[e.kit[i]!] = pool[e.kit[i]!]! + 1;
  e.kit[i] = 0;
  if (o.res) {
    if (pool[o.res]! > 0) {
      pool[o.res] = pool[o.res]! - 1;
      e.kit[i] = o.res;
    } else {
      // An order that failed: it needs the player (Patch 2, What reaches chat).
      say(state, i, 'That cart is gone!', true);
    }
  }
  return true;
}
