// Upgrading units (Troops and gear: Upgrading units, Jade 2026-10-03) and
// specialist training (Table 7: cannon crew at the Gunnery yard). There are
// no items: Upgrade Weapon and Upgrade Armour raise a line of a unit's kit
// one tier, their Max twins to the best tier researched and affordable. The
// new kit is paid from stock when the button is pressed, the most capable
// units first (highest rank, then the lowest id), whole steps only; each
// unit then walks to the nearest Forge, Barracks or main base (cavalry also
// the Stables, mages also the Magi Sanctum), stands beside it while the bar
// fills, and comes back better armed. A dropped upgrade gives its payment
// back. Workers also fetch and return carts at a main base.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { bestLevel } from '../buildings/production.ts';
import { costText, pay, refund, Res } from '../economy/resources.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import { payNutrition } from '../economy/resources.ts';
import { OrderKind, UnitKind, type SimState } from '../state.ts';
import { hasResearch, RESEARCH, Research, Skill } from '../combat/items.ts';
import { Act, besideBuilding, resetWalk, walkTo } from './behaviour.ts';
import type { UnitOrder } from './unit-orders.ts';
import { Role } from '../threats/types.ts';
import { say } from '../peoples/speech.ts';
import { partnerOf } from './weight.ts';
import {
  applyKit,
  holderKind,
  Line,
  linePiece,
  mainCost,
  piecesCost,
  replacedPieces,
  Troop,
  TRAINING,
  upgradePieces,
  upgradeSteps,
  upgradeTarget,
  type KitHolder,
  type TechView,
} from './kits.ts';

type KitUpOrder = Extract<UnitOrder, { t: 'kitUp' }>;
type CartOrder = Extract<UnitOrder, { t: 'cart' }>;

/**
 * Specialist training by skill bit (Table 7): cannon crew (after Cannons) at
 * the Gunnery yard. Archery, the crossbow, the musket and riding went with
 * the troop types (Troops and gear).
 */
export const SKILL_TRAINING: Readonly<Record<number, { name: string; food: number; steps: number; research: number; at: number }>> = {
  [Skill.Cannon]: { name: 'cannon crew', food: 40, steps: 90 * STEPS_PER_SECOND, research: Research.Cannons, at: BuildingKind.GunneryYard },
};

/** A unit's kit as the upgrade rules see it, or undefined for units that have none (mobs, animals, the peoples' units, mercenaries). */
export function kitHolder(state: SimState, i: number): KitHolder | undefined {
  const e = state.entities;
  if (e.role[i] === Role.Mercenary || e.role[i] === Role.People) return undefined;
  const kind = holderKind(e.kind[i]!);
  if (!kind) return undefined;
  return { kind, troop: e.troop[i]!, w: e.wTier[i]!, a: e.aTier[i]! };
}

/** What a player has for the kit's needs: research, best forge level and research names. */
export function techOf(state: SimState, player: number): TechView {
  return {
    research: state.players[player]!.research,
    forge: bestLevel(state, player, BuildingKind.Forge),
    researchName: (r) => RESEARCH[r]?.name ?? 'research',
  };
}

/** Whether a building is a place a unit can upgrade beside: a Forge, Barracks or main base; the Stables for cavalry; the Magi Sanctum for mages. */
export function upgradesAt(h: KitHolder, kind: number): boolean {
  if (kind === BuildingKind.Forge || kind === BuildingKind.Barracks || kind === BuildingKind.MainBase) return true;
  if (kind === BuildingKind.Stables) return h.kind === 'warrior' && h.troop === Troop.Cavalry;
  if (kind === BuildingKind.MagiSanctum) return h.kind === 'mage';
  return false;
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

/** The upgrade a unit has queued on a line, or undefined. */
export function pendingKitUp(state: SimState, i: number, line: number): KitUpOrder | undefined {
  return state.entities.queue[i]!.find((q): q is KitUpOrder => q.t === 'kitUp' && q.line === line);
}

/** Puts an order in front of whatever the unit was doing. */
function inFront(state: SimState, i: number, o: UnitOrder): void {
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
  if (!p || (line !== Line.Weapon && line !== Line.Armour)) return 0;
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
        why = h.kind === 'mage' ? 'There is no Forge, Barracks, main base or Magi Sanctum to upgrade at.' : 'There is no Forge, Barracks or main base to upgrade at.';
        whoWhy = i;
      }
      continue;
    }
    pay(p.pool, t.plan.cost);
    inFront(state, i, { t: 'kitUp', line, to: t.to, ways: t.plan.ways, paid: 1, b: place.id });
    // Information, not an alert: a bubble only (Jade's play-test notes).
    say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} for a ${pieceName(h, line, t.to)}.`, false, true);
    sent++;
  }
  if (sent === 0 && why) {
    if (whoWhy >= 0) say(state, whoWhy, why, true);
    else state.events.push({ player, kind: 'alert', text: why });
  }
  return sent;
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
  return h ? [e.timer[i]!, upgradeSteps(h, o.line, o.to)] : [0, 0];
}

/** Walks to the place to upgrade, waits beside it while the bar fills, and takes the new kit. */
export function runKitUp(state: SimState, i: number, o: KitUpOrder): boolean {
  const e = state.entities;
  const h = kitHolder(state, i);
  if (!h) return true;
  let b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !b.complete || !upgradesAt(h, b.kind)) {
    b = nearestUpgradePlace(state, i, h);
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
  }
  e.order[i] = OrderKind.Idle;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < upgradeSteps(h, o.line, o.to)) return false;
  finishKitUp(state, i, h, o);
  return true;
}

/** Puts the new tier on: the old piece is scrapped and its cost goes back to the stock (in full, Jade), the slots take the new kit. */
function finishKitUp(state: SimState, i: number, h: KitHolder, o: KitUpOrder): void {
  const e = state.entities;
  const owner = e.owner[i]!;
  const cur = o.line === Line.Weapon ? h.w : h.a;
  if (o.to <= cur) {
    // Already there (a second upgrade got in first): the payment goes back.
    refundKit(state, i, o);
    return;
  }
  if (TRAINING.upgradeRefundPm > 0 && owner < state.players.length) refund(state.players[owner]!.pool, mainCost(replacedPieces(h, o.line, o.to)), TRAINING.upgradeRefundPm);
  o.paid = 0;
  if (o.line === Line.Weapon) e.wTier[i] = o.to;
  else e.aTier[i] = o.to;
  applyKit(e, i, h.kind);
  say(state, i, h.kind === 'worker' ? `New tools: ${pieceName(h, o.line, o.to)}.` : `Upgraded to ${pieceName(h, o.line, o.to)}.`, false, true);
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
  if (sent === 0 && !back) state.events.push({ player, kind: 'alert', text: 'No cart in stock. Hand carts are made at a Workshop, ox and horse carts at a Great Workshop.' });
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
      say(state, i, 'That cart is gone!');
    }
  }
  return true;
}

// ----- specialist training -----

/** Specialist training (Table 7): the unit goes in, pays the food, and comes out trained. */
export function runSkill(state: SimState, i: number, o: Extract<UnitOrder, { t: 'skill' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  const t = SKILL_TRAINING[o.skill];
  if (!t || !b || b.owner !== e.owner[i] || !b.complete || b.kind !== t.at || e.kind[i] !== UnitKind.Warrior) return true;
  if ((e.skills[i]! & o.skill) !== 0) return true;
  if (e.inside[i] !== b.id) {
    if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
    const r = walkTo(state, i, besideBuilding(b));
    if (r === 0) return false;
    if (r === 2) return true;
    // One warrior trains at a time; the next waits beside the building (s).
    for (let j = 0; j < e.count; j++) {
      if (j !== i && e.inside[j] === b.id && e.queue[j]![0]?.t === 'skill') {
        e.order[i] = OrderKind.Idle;
        return false;
      }
    }
    const p = state.players[b.owner]!;
    if (!hasResearch(p.research, t.research as Research)) {
      state.events.push({ player: b.owner, kind: 'alert', text: `Training in ${t.name} needs ${RESEARCH[t.research]!.name} researched first.`, x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    if (!payNutrition(p.pool, t.food, p.dontEat)) {
      state.events.push({ player: b.owner, kind: 'alert', text: `Not enough food to train in ${t.name} (${t.food} food).`, x: e.x[i]!, z: e.z[i]! });
      return true;
    }
    e.inside[i] = b.id;
    const [x, z] = buildingCentre(b);
    e.x[i] = x;
    e.z[i] = z;
    e.act[i] = Act.Inside;
    e.timer[i] = 0;
  }
  e.order[i] = OrderKind.Idle;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < t.steps) return false;
  e.skills[i] = e.skills[i]! | o.skill;
  state.events.push({ player: b.owner, kind: 'info', text: `A warrior has learned ${t.name} at the ${buildingName(b.kind, b.level, b.variant).toLowerCase()}.`, x: e.x[i]!, z: e.z[i]! });
  return true;
}
