// Questions (Patch 2, round 3: actionable bubbles). Now and then one of a
// player's units or buildings asks its owner a short question in its bubble,
// with Yes and No buttons. A question waits 10 s of game time (Jade's Patch
// 3; standing still while the game is paused, since the sim does), or until
// its owner answers, or until it no longer holds (a hurt unit's, once it is
// busy or hit again); a unit or building has one open at a time, a player
// at most 3, and more wait their turn. Other players see the bubble without
// the buttons; the text goes to no chat. The units a leaver left behind ask
// nothing.
//
// Yes is an order (AnswerOrder) carrying what the question was about, and
// runs the same code the matching button's order runs, so every machine
// agrees. If Yes can no longer work, the speaker says why. No, or no answer,
// does nothing, and each question rests before it is asked again.
//
// What is open, and what was asked when, is not state: a loaded game starts
// with no open questions (Jade's rule), the way units' speech is never saved.
// Nothing here draws on a random stream, so it never moves the state.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { maxHealth, type Building } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { nearestFoe, UP_TOP_FOE_WU } from '../combat/fight.ts';
import { EAT_NUTRITION, eatableFood } from '../economy/food.ts';
import { costText, RESOURCES, type Cost, type Res } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import type { AnswerOrder } from '../orders.ts';
import { askHooks, asking, foesName, say, sayBuilding } from '../peoples/speech.ts';
import { UnitKind, type AskInfo, type SimEvent, type SimState } from '../state.ts';
import { Role } from '../threats/types.ts';
import { giveOrder, stopUnit } from './behaviour.ts';
import { chooseNode, fromBuilding, GATHER_SWITCH_M, homeOf } from './forage.ts';
import { inFront, kitHolder, orderUpgradeEquipment, pendingKitUp, techOf } from './gear.ts';
import { equipmentPlans, Line, upgradeTarget, type EquipmentHolder, type KitHolder, type TechView } from './kits.ts';
import { topOf } from './top.ts';

/** The questions (Patch 2, round 3's table, in its order). */
export const Ask = {
  /** A troop or mage could use better kit, or a worker better tools (Jade's Patch 3): Upgrade? */
  Kit: 1,
  /** A hurt unit asks to eat to heal. */
  Heal: 2,
  /** A man up top with no bow or gun asks to get down and fight. */
  Down: 3,
  /** The main base at dawn: damaged buildings, repair them? */
  Repair: 4,
  /** A gatherer ran out nearby: look farther off? */
  Farther: 5,
  /** An engine lost a crewman: train another? */
  Crew: 6,
} as const;
export type Ask = (typeof Ask)[keyof typeof Ask];

/** How long a question waits for its owner's answer (Jade's Patch 3; 30 s in Patch 2): 10 s of game time. */
export const QUESTION_WAIT_STEPS = 10 * STEPS_PER_SECOND;
/** Open questions one player may have at once (s); the next waits its turn. */
export const OPEN_QUESTIONS_PER_PLAYER = 3;
/** A unit at or below this share of its health asks to eat to heal (Jade: 70%), and asks again only once it is back above it. */
export const HURT_ASK_PM = 700;
/**
 * A hurt unit asks to eat only while idle and once nothing has hurt it for
 * this long (Jade's Patch 3: never while it is being attacked or doing
 * something) (s): 5 s. Hurt again while it asks, it stops asking.
 */
export const HURT_ASK_QUIET_STEPS = 5 * STEPS_PER_SECOND;
/** How near another unit must stand for the one asking to speak for it too ("Four of us could use better kit.") (s): 10 m. */
export const SPEAK_FOR_M = 10;

/**
 * Engine crews, for the "A crewman fell" question: the building nearest an
 * engine that can train a crewman for it, and training one there ('' or
 * why not), with what that takes for Yes's tooltip. Set by the module that
 * brings the Artillery workshop's crewman in (Patch 2, round 1); until then
 * nothing trains one and the question is never asked.
 */
export const crewHooks: {
  trainer: (state: SimState, engine: number) => Building | undefined;
  train: (state: SimState, engine: number, at: Building) => string;
  cost: (state: SimState, at: Building) => Cost;
} = { trainer: () => undefined, train: () => 'Nothing can train a crewman yet.', cost: () => [] };

interface Question {
  info: AskInfo;
  /** The bubble's words. */
  text: string;
  player: number;
  /** Who asks: an entity id, or a building id when `building`. */
  who: number;
  building: boolean;
  /**
   * Whether the question still holds, checked every step while it is up; when
   * it no longer does it is withdrawn (its bubble goes on every machine) and
   * `unask` runs, so it can be asked afresh later. Questions without it hold
   * until answered or out of time.
   */
  holds?: () => boolean;
  unask?: () => void;
  /**
   * Yes's tooltip worked out afresh from the stock as it is now, or null when
   * the stock no longer pays for anything it offers (it is then withdrawn as
   * above). Checked every step the stock has changed and once a second; new
   * words go to its owner's buttons (Patch 3: the start's two upgrade
   * questions count what is left once the other is answered).
   */
  recount?: () => string | null;
}

/** A question waiting for a free place among its player's open ones: made afresh when its turn comes, or null if it no longer holds. */
interface Waiting {
  player: number;
  until: number;
  make: () => Question | null;
}

interface Book {
  open: Question[];
  waiting: Waiting[];
  /** Questions asked so far this step (ids are the step and this count, the same on every machine). */
  stepAt: number;
  stepCount: number;
  /** Ask.Kit: the best weapon and armour tiers each unit has been offered (weapon x 16 + armour), by entity id. */
  kit: Map<number, number>;
  /** Ask.Heal: units that asked about this wound (by entity id), until they are back above HURT_ASK_PM. */
  hurt: Set<number>;
  /** Ask.Repair: the cycle each player's main base last asked in, plus 1. */
  dawn: number[];
  /** The players whose main base gave its word of advice on tools (once a game, Jade's Patch 3). */
  advised: Set<number>;
}

/** Not state: the open questions and what each was last asked about. */
const books = new WeakMap<SimState, Book>();

function bookOf(state: SimState): Book {
  let b = books.get(state);
  if (!b) {
    b = { open: [], waiting: [], stepAt: -1, stepCount: 0, kit: new Map(), hurt: new Set(), dawn: [], advised: new Set() };
    books.set(state, b);
  }
  return b;
}

/** The questions open now (for tests and tools). */
export function openQuestions(state: SimState): readonly AskInfo[] {
  return bookOf(state).open.map((q) => q.info);
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** "Four", or "23": a count as the first word of a line. */
function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** Whether a player's units and buildings may ask: still in the game (a leaver's ask nothing). */
function asks(state: SimState, player: number): boolean {
  const p = state.players[player];
  return p !== undefined && !p.out;
}

function openFor(book: Book, player: number): number {
  let n = 0;
  for (const q of book.open) if (q.player === player) n++;
  return n;
}

function hasRoom(state: SimState, player: number): boolean {
  return openFor(bookOf(state), player) < OPEN_QUESTIONS_PER_PLAYER;
}

/** Whether a unit (entity id) is asking or spoken for in an open question. */
function inQuestion(book: Book, id: number): boolean {
  return book.open.some((q) => !q.building && q.info.units.includes(id));
}

function buildingAsking(book: Book, id: number): boolean {
  return book.open.some((q) => q.building && q.who === id);
}

/** A question about to be asked by a unit (the speaker first in units). */
function unitQuestion(state: SimState, q: Ask, i: number, units: readonly number[], text: string, yes: string, no: string, res = -1): Question {
  const e = state.entities;
  return { player: e.owner[i]!, who: e.id[i]!, building: false, text, info: { id: 0, q, units: units.map((j) => e.id[j]!), res, until: 0, yes, no } };
}

/** Puts a question up: its bubble for everyone, its buttons for its owner. */
function put(state: SimState, q: Question): void {
  const book = bookOf(state);
  if (book.stepAt !== state.step) {
    book.stepAt = state.step;
    book.stepCount = 0;
  }
  q.info.id = state.step * 16 + book.stepCount++;
  q.info.until = state.step + QUESTION_WAIT_STEPS;
  book.open.push(q);
  const ev: SimEvent = { player: q.player, kind: 'question', text: q.text, ask: { ...q.info, units: [...q.info.units] } };
  if (q.building) {
    const b = state.buildings.get(q.who)!;
    [ev.x, ev.z] = buildingCentre(b);
    ev.building = b.id;
    ev.name = buildingName(b.kind, b.level, b.variant);
  } else {
    const e = state.entities;
    const i = e.indexOf(q.who);
    ev.speaker = q.who;
    ev.x = e.x[i]!;
    ev.z = e.z[i]!;
    asking(state).add(q.who);
  }
  state.events.push(ev);
}

/** Yes's tooltip has new words (recount): the bubble stays, the buttons' tooltip changes. */
function retell(state: SimState, q: Question): void {
  const ev: SimEvent = { player: q.player, kind: 'question', text: q.text, ask: { ...q.info, units: [...q.info.units], retold: true } };
  if (q.building) ev.building = q.who;
  else ev.speaker = q.who;
  state.events.push(ev);
}

/** Ends a question: its bubble goes on every machine. */
function close(state: SimState, q: Question): void {
  const book = bookOf(state);
  const k = book.open.indexOf(q);
  if (k < 0) return;
  book.open.splice(k, 1);
  if (!q.building) asking(state).delete(q.who);
  const ev: SimEvent = { player: q.player, kind: 'question', text: '', ask: { ...q.info, units: [...q.info.units], closed: true } };
  if (q.building) ev.building = q.who;
  else ev.speaker = q.who;
  state.events.push(ev);
}

/** Asks now if the player has room, else waits its turn (made afresh then, if it still holds). */
function want(state: SimState, player: number, make: () => Question | null): void {
  if (hasRoom(state, player)) {
    const q = make();
    if (q) put(state, q);
    return;
  }
  bookOf(state).waiting.push({ player, until: state.step + QUESTION_WAIT_STEPS, make });
}

// ----- who may ask -----

/** One of a player's own units that can be asked about: alive, not a mercenary or one of the peoples', its player still in. */
function ownUnit(state: SimState, i: number): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner >= state.players.length || e.hp[i]! <= 0 || !asks(state, owner)) return false;
  return e.role[i] !== Role.Mercenary && e.role[i] !== Role.People;
}

/** Not fighting: no foe in hand and none being chased. */
function calm(state: SimState, i: number): boolean {
  return state.entities.target[i] === 0 && state.entities.chasing[i] === 0;
}

/** Idle (no orders) or holding its ground, outside. */
function idleOrHolding(state: SimState, i: number): boolean {
  const e = state.entities;
  const q = e.queue[i]!;
  return e.inside[i] === 0 && (q.length === 0 || (q.length === 1 && q[0]!.t === 'hold'));
}

// ----- 1: better kit -----

/** The best weapon and armour tiers the stock pays for now, by line (the tier it has when none better), with the plans. */
function kitOffer(h: KitHolder, pool: Int32Array, tech: TechView): { w: number; a: number; cost: Cost[] } {
  const w = upgradeTarget(h, Line.Weapon, true, pool, tech);
  const a = upgradeTarget(h, Line.Armour, true, pool, tech);
  const cost: Cost[] = [];
  if ('to' in w) cost.push(w.plan.cost);
  if ('to' in a) cost.push(a.plan.cost);
  return { w: 'to' in w ? w.to : h.w, a: 'to' in a ? a.to : h.a, cost };
}

/** Whether a unit could use better kit (a worker, better tools) than it has and than it was last offered, for its offer packed (weapon x 16 + armour); -1 if not. */
function wantsKit(state: SimState, book: Book, i: number, pool: Int32Array, tech: TechView): number {
  const e = state.entities;
  if (e.kind[i] !== UnitKind.Warrior && e.kind[i] !== UnitKind.Mage && e.kind[i] !== UnitKind.Worker) return -1;
  if (!ownUnit(state, i) || !idleOrHolding(state, i) || !calm(state, i) || inQuestion(book, e.id[i]!)) return -1;
  const h = kitHolder(state, i);
  if (!h || pendingKitUp(state, i, Line.Weapon) || pendingKitUp(state, i, Line.Armour)) return -1;
  const offer = kitOffer(h, pool, tech);
  const was = book.kit.get(e.id[i]!) ?? 0;
  const w = Math.max(h.w, was >> 4);
  const a = Math.max(h.a, was & 15);
  return offer.w > w || offer.a > a ? offer.w * 16 + offer.a : -1;
}

/**
 * What a group's upgrades would take from the stock, worked out as Yes would
 * spend it (the same plans Upgrade equipment pays): every weapon first, then
 * the armour; and how many of the group the stock pays for (each unit pays as
 * it is sent, the highest rank first, until the stock runs short: never more
 * than it holds, Jade's Patch 3). A piece already on its way is not counted.
 */
function kitCost(state: SimState, units: readonly number[], pool: Int32Array, tech: TechView): { cost: Cost; paid: number } {
  const e = state.entities;
  const list: EquipmentHolder[] = [];
  for (const i of units) {
    const h = kitHolder(state, i);
    if (h) list.push({ id: e.id[i]!, h, rank: e.rank[i]!, pendingW: pendingKitUp(state, i, Line.Weapon) !== undefined, pendingA: pendingKitUp(state, i, Line.Armour) !== undefined });
  }
  const plans = equipmentPlans(list, pool, tech);
  const total = new Map<Res, number>();
  for (const line of [Line.Weapon, Line.Armour]) {
    for (const p of plans) {
      const plan = line === Line.Weapon ? p.wPlan : p.aPlan;
      if (plan) for (const [r, n] of plan.cost) total.set(r, (total.get(r) ?? 0) + n);
    }
  }
  return { cost: [...total], paid: plans.filter((p) => p.wPlan || p.aPlan).length };
}

/** Yes's tooltip for a better-kit question about these units (the stock pays for `paid` of them). */
function kitYes(state: SimState, units: readonly number[], cost: Cost, paid: number): string {
  const e = state.entities;
  const n = units.length;
  const workers = units.length > 0 && e.kind[units[0]!] === UnitKind.Worker;
  const where = units.some((j) => e.kind[j] === UnitKind.Mage) ? 'Forge, Barracks, main base or Magi Sanctum' : 'Forge, Barracks or main base';
  const best = workers ? 'the best tools' : 'the best weapon and armour';
  const first = workers ? '' : ', the weapon first';
  const from = cost.length ? ` From the stock: ${costText(cost)}.` : '';
  if (n === 1) return `It goes to the nearest ${where} and takes ${best} the stock pays for${first}.${from}`;
  // The stock may not stretch to all of them: those it pays for go, the highest rank first, and the rest keep theirs.
  if (paid > 0 && paid < n) return `The stock pays for ${paid} of the ${n}, the highest rank first: they go to the nearest ${where} and take ${best} it pays for${first}; the rest keep their ${workers ? 'tools' : 'kit'}.${from}`;
  return `All ${n} go to the nearest ${where} and take ${best} the stock pays for${first}.${from}`;
}

/**
 * What Upgrade equipment would give the start's workers is the stock the
 * first buildings need: the main base says so once a game, as the start's
 * two upgrade questions come (Jade's Patch 3). Her line ends "And remember",
 * unfinished; the bubble stops at "choose wisely." until she finishes it.
 */
const TOOLS_ADVICE = 'If you upgrade all their tools you may not be able to make any structures right away, choose wisely.';

function askKit(state: SimState, book: Book, i: number, pool: Int32Array, tech: TechView, offer: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  // Workers ask about their tools, troops and mages about their kit: two questions (Jade's Patch 3).
  const workers = e.kind[i] === UnitKind.Worker;
  // The idle units of its kind near it that could use better kit too: it speaks for them.
  const group = [i];
  const offers = [offer];
  const r = SPEAK_FOR_M * WU_PER_METRE;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.owner[j] !== player || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r) continue;
    if ((e.kind[j] === UnitKind.Worker) !== workers) continue;
    const o = wantsKit(state, book, j, pool, tech);
    if (o < 0) continue;
    group.push(j);
    offers.push(o);
  }
  // Each is asked again only once the stock pays for better than this.
  const before = group.map((j) => book.kit.get(e.id[j]!));
  group.forEach((j, k) => {
    const was = before[k] ?? 0;
    book.kit.set(e.id[j]!, Math.max(offers[k]! >> 4, was >> 4) * 16 + Math.max(offers[k]! & 15, was & 15));
  });
  const n = group.length;
  const { cost, paid } = kitCost(state, group, pool, tech);
  const kit = workers ? 'tools' : 'kit';
  const text = n === 1 ? `I could use better ${kit}. Upgrade?` : `${countWord(n)} of us could use better ${kit}. Upgrade?`;
  const no = `${n === 1 ? 'It keeps its' : 'They keep their'} ${kit}. Asked again only once the stock pays for something better still.`;
  const q = unitQuestion(state, Ask.Kit, i, group, text, kitYes(state, group, cost, paid), no);
  // What Yes would take is counted again whenever the stock changes (the other start question answered, a building paid for): never more than is left (Jade's Patch 3).
  const counted = Int32Array.from(pool);
  q.recount = () => {
    const now = state.players[player]!.pool;
    if (state.step % STEPS_PER_SECOND !== 0 && now.every((v, r) => v === counted[r])) return q.info.yes;
    counted.set(now);
    const units = own(state, player, q.info.units).filter((j) => kitHolder(state, j) !== undefined);
    const c = kitCost(state, units, now, techOf(state, player));
    return c.paid === 0 ? null : kitYes(state, units, c.cost, c.paid);
  };
  // Withdrawn (the stock pays for none of them now), not answered No: they may ask again once it does.
  q.unask = () =>
    q.info.units.forEach((id, k) => {
      const was = before[k];
      if (was === undefined) book.kit.delete(id);
      else book.kit.set(id, was);
    });
  put(state, q);
  // The start's tools question comes with the main base's word of advice, once a game, on the first day.
  if (workers && !book.advised.has(player) && clockAt(state.step, state.blood).cycle === 0) {
    const base = mainBaseOf(state, player);
    if (base) {
      book.advised.add(player);
      sayBuilding(state, base, TOOLS_ADVICE, false, 'long');
    }
  }
}

// ----- 2: hurt -----

function hurtNow(state: SimState, i: number): boolean {
  const e = state.entities;
  return e.hp[i]! * 1000 <= e.maxHp[i]! * HURT_ASK_PM;
}

/** Idle (no orders, or holding its ground), not fighting, and hurt by nothing lately: a hurt unit may ask to eat (Jade's Patch 3). */
function restful(state: SimState, i: number): boolean {
  const e = state.entities;
  const hurtAt = e.hurtAt[i]!;
  return idleOrHolding(state, i) && calm(state, i) && e.tinker[i] === 0 && (hurtAt === 0 || state.step - hurtAt >= HURT_ASK_QUIET_STEPS);
}

/** Whether a unit is hurt enough to ask to eat, idle and left alone, and has not asked about this wound. */
function wantsFood(state: SimState, book: Book, i: number): boolean {
  const e = state.entities;
  const k = e.kind[i];
  if (k !== UnitKind.Worker && k !== UnitKind.Warrior && k !== UnitKind.Mage) return false;
  if (!ownUnit(state, i) || !restful(state, i) || !hurtNow(state, i)) return false;
  // Already eating or healing from a meal at a table, or asked about this wound.
  if (book.hurt.has(e.id[i]!) || e.mendUntil[i]! > state.step || e.queue[i]!.some((o) => o.t === 'eat')) return false;
  return !inQuestion(book, e.id[i]!);
}

function askHeal(state: SimState, book: Book, i: number): void {
  const e = state.entities;
  const player = e.owner[i]!;
  const group = [i];
  const r = SPEAK_FOR_M * WU_PER_METRE;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r)) {
    if (j === i || e.owner[j] !== player || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r) continue;
    if (wantsFood(state, book, j)) group.push(j);
  }
  for (const j of group) book.hurt.add(e.id[j]!);
  const n = group.length;
  const pct = floorDiv(HURT_ASK_PM, 10);
  const text = n === 1 ? "I'm hurt. Can I eat to heal?" : `${countWord(n)} of us are hurt. Can we eat to heal?`;
  const yes = `${n === 1 ? 'It goes' : `All ${n} go`} to the nearest main base or storehouse to eat, then carry on. From the stock: ${EAT_NUTRITION} food each${n > 1 ? ` (${EAT_NUTRITION * n} food)` : ''}, healing half ${n === 1 ? 'its' : 'their'} health over 10 seconds, and a remedy or bandage each if one is in stock and needed.`;
  const no = `${n === 1 ? 'It carries' : 'They carry'} on and heal slowly by ${n === 1 ? 'itself' : 'themselves'} while fed. Asked again only after ${n === 1 ? 'its' : 'their'} health has been back above ${pct}%.`;
  const q = unitQuestion(state, Ask.Heal, i, group, text, yes, no);
  // Asked only while every one of them is idle and left alone: once one is given an order, fights or is hurt, the
  // question goes, and they may ask again when idle (Jade's Patch 3).
  const ids = group.map((j) => e.id[j]!);
  q.holds = () =>
    ids.every((id) => {
      const j = e.indexOf(id);
      return j < 0 || e.hp[j]! <= 0 || restful(state, j);
    });
  q.unask = () => {
    for (const id of ids) book.hurt.delete(id);
  };
  put(state, q);
}

// ----- 3: down from the top -----

/** A man up top asks to get down to the foe below (askHooks.down); false when his player has no room for another question. */
function askDown(state: SimState, i: number, foe: number): boolean {
  const e = state.entities;
  const player = e.owner[i]!;
  if (!ownUnit(state, i)) return true;
  const book = bookOf(state);
  if (inQuestion(book, e.id[i]!)) return true;
  if (!hasRoom(state, player)) return false;
  const text = `Let me down to fight ${foesName(state, foe)}?`;
  put(state, unitQuestion(state, Ask.Down, i, [i], text, 'He comes down and attacks the nearest enemy on the ground. Takes nothing from the stock.', 'He stays up top.'));
  return true;
}

// ----- 4: repairs at dawn -----

/** Whether a worker of the player is working on a building now. */
function beingWorked(state: SimState, player: number): Set<number> {
  const e = state.entities;
  const out = new Set<number>();
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    const o = e.queue[i]![0];
    if (o?.t === 'work') out.add(o.b);
  }
  return out;
}

/** The player's finished buildings that are damaged and that no worker is repairing. */
function unrepaired(state: SimState, player: number): Building[] {
  const worked = beingWorked(state, player);
  return state.buildings.list.filter((b) => b.owner === player && b.complete && b.upgrading === 0 && b.hp > 0 && b.hp < maxHealth(b) && !worked.has(b.id));
}

/** The player's workers with nothing to do: no orders, not inside (as the idle-worker button counts them). */
function idleWorkers(state: SimState, player: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
    if (e.role[i] === Role.Mercenary || e.queue[i]!.length > 0) continue;
    out.push(i);
  }
  return out;
}

/** The main base that speaks for the player: the oldest finished one. */
function mainBaseOf(state: SimState, player: number): Building | undefined {
  return state.buildings.list.find((b) => b.owner === player && b.complete && b.kind === BuildingKind.MainBase && b.hp > 0);
}

function askRepair(state: SimState, book: Book, player: number, cycle: number): void {
  if ((book.dawn[player] ?? 0) === cycle + 1 || !hasRoom(state, player)) return;
  const base = mainBaseOf(state, player);
  if (!base || buildingAsking(book, base.id)) return;
  const n = unrepaired(state, player).length;
  if (n === 0 || idleWorkers(state, player).length === 0) return;
  book.dawn[player] = cycle + 1;
  const text = n === 1 ? 'One building is damaged. Repair it?' : `${countWord(n)} buildings are damaged. Repair them?`;
  const yes = `Idle workers repair ${n === 1 ? 'it' : 'them'}, the nearest first, one worker to a building. Repairs take nothing from the stock.`;
  const no = `Leave ${n === 1 ? 'it' : 'them'} as ${n === 1 ? 'it is' : 'they are'}. Asked again at the next dawn.`;
  put(state, { player, who: base.id, building: true, text, info: { id: 0, q: Ask.Repair, units: [], res: -1, until: 0, yes, no } });
}

// ----- 5: run out nearby -----

function resShort(res: number): string {
  return (RESOURCES[res]?.short ?? 'it').toLowerCase();
}

/** A gatherer working by hand ran out of `res` nearby and has nothing else to do (askHooks.ranOut). */
function askFarther(state: SimState, i: number, res: number): void {
  const e = state.entities;
  if (!ownUnit(state, i) || e.kind[i] !== UnitKind.Worker) return;
  const id = e.id[i]!;
  const player = e.owner[i]!;
  want(state, player, () => {
    const j = e.indexOf(id);
    if (j < 0 || !ownUnit(state, j) || inQuestion(bookOf(state), id)) return null;
    // Only one left with nothing else to do: the gather order it ran out on is all it has (or, its turn come later, nothing).
    const orders = e.queue[j]!;
    if (orders.length > 1 || (orders.length === 1 && orders[0]!.t !== 'gather')) return null;
    const name = resShort(res);
    return unitQuestion(
      state,
      Ask.Farther,
      j,
      [j],
      `No more ${name} nearby. Look farther off?`,
      `It looks for ${name} farther off, as far as it can walk back from before nightfall, and gathers it there. Takes nothing from the stock.`,
      'It stops and waits for orders.',
      res,
    );
  });
}

// ----- 6: a crewman fell -----

/** A player's unit fell (askHooks.fell): if it crewed an engine and a crewman can be trained for it, the engine asks for another. */
function crewFell(state: SimState, i: number): void {
  const e = state.entities;
  const o = e.queue[i]![0];
  if (o?.t !== 'crew') return;
  const g = e.indexOf(o.id);
  if (g < 0 || !ownUnit(state, g) || e.kind[g] !== UnitKind.Engine) return;
  const id = o.id;
  want(state, e.owner[g]!, () => {
    const k = e.indexOf(id);
    if (k < 0 || !ownUnit(state, k) || inQuestion(bookOf(state), id)) return null;
    const at = crewHooks.trainer(state, k);
    if (!at) return null;
    const cost = crewHooks.cost(state, at);
    const name = buildingName(at.kind, at.level, at.variant);
    return unitQuestion(
      state,
      Ask.Crew,
      k,
      [k],
      'A crewman fell. Train another?',
      `A crewman is queued at the nearest ${name} and joins this engine when trained.${cost.length ? ` From the stock: ${costText(cost)}.` : ''}`,
      'The engine stays a crewman short.',
    );
  });
}

askHooks.down = askDown;
askHooks.ranOut = askFarther;
askHooks.fell = crewFell;

// ----- every step -----

/**
 * Every step (after the units have moved and eaten, before the fallen are
 * settled): questions that ran out of time or lost their speaker end, the
 * waiting ones get their turn, and once a second each unit, and at dawn each
 * player's main base, may ask.
 */
export function updateQuestions(state: SimState): void {
  const book = bookOf(state);
  const e = state.entities;
  for (const q of [...book.open]) {
    let gone: boolean;
    if (q.building) {
      const b = state.buildings.get(q.who);
      gone = !b || b.owner !== q.player || b.hp <= 0;
    } else {
      const i = e.indexOf(q.who);
      gone = i < 0 || e.hp[i]! <= 0 || e.owner[i] !== q.player;
    }
    if (gone || state.step >= q.info.until || !asks(state, q.player)) close(state, q);
    else if (q.holds && !q.holds()) {
      close(state, q);
      q.unask?.();
    } else if (q.recount) {
      const yes = q.recount();
      if (yes === null) {
        close(state, q);
        q.unask?.();
      } else if (yes !== q.info.yes) {
        q.info.yes = yes;
        retell(state, q);
      }
    }
  }
  if (book.waiting.length > 0) {
    const still: Waiting[] = [];
    for (const w of book.waiting) {
      if (w.until <= state.step || !asks(state, w.player)) continue;
      if (!hasRoom(state, w.player)) {
        still.push(w);
        continue;
      }
      const q = w.make();
      if (q) put(state, q);
    }
    book.waiting = still;
  }
  // At dawn, once a second, each player's main base may ask about repairs.
  if (state.step % STEPS_PER_SECOND === 0) {
    const c = clockAt(state.step, state.blood);
    if (c.period === Period.Dawn) for (let p = 0; p < state.players.length; p++) if (asks(state, p)) askRepair(state, book, p, c.cycle);
  }
  // Each unit once a second, at its own moment: better kit (a worker, better tools), or a wound.
  const tech: Array<TechView | undefined> = [];
  for (let i = 0; i < e.count; i++) {
    if ((state.step + e.id[i]!) % STEPS_PER_SECOND !== 0) continue;
    const player = e.owner[i]!;
    if (player >= state.players.length || e.hp[i]! <= 0) continue;
    const id = e.id[i]!;
    if (book.hurt.has(id) && !hurtNow(state, i)) book.hurt.delete(id);
    if (!asks(state, player) || !hasRoom(state, player)) continue;
    if (wantsFood(state, book, i) && eatableFood(state.players[player]!) >= EAT_NUTRITION) {
      askHeal(state, book, i);
      continue;
    }
    if (e.kind[i] !== UnitKind.Warrior && e.kind[i] !== UnitKind.Mage && e.kind[i] !== UnitKind.Worker) continue;
    const pool = state.players[player]!.pool;
    const t = (tech[player] ??= techOf(state, player));
    const offer = wantsKit(state, book, i, pool, t);
    if (offer >= 0) askKit(state, book, i, pool, t, offer);
  }
  // Forget the fallen now and then.
  if (book.kit.size > 1024) for (const id of [...book.kit.keys()]) if (e.indexOf(id) < 0) book.kit.delete(id);
  if (book.hurt.size > 1024) for (const id of [...book.hurt]) if (e.indexOf(id) < 0) book.hurt.delete(id);
}

// ----- the answer -----

/** The units of the player among the ids, by index: their own, alive. */
function own(state: SimState, player: number, ids: readonly number[]): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (const id of ids) {
    const i = e.indexOf(id);
    if (i >= 0 && e.owner[i] === player && e.hp[i]! > 0 && !out.includes(i)) out.push(i);
  }
  return out;
}

/**
 * Yes or No (AnswerOrder): the question closes on every machine; Yes then
 * does what the question offered, with the same code the matching button's
 * order runs. When it can no longer be done, the one that asked says why.
 */
export function answerQuestion(state: SimState, o: AnswerOrder): void {
  const book = bookOf(state);
  const q = book.open.find((x) => x.info.id === o.ask && x.player === o.player);
  if (q) close(state, q);
  if (o.yes !== 1) return;
  const e = state.entities;
  const player = o.player;
  const speaker = o.q === Ask.Repair ? -1 : e.indexOf(o.who);
  const speakerOk = speaker >= 0 && e.owner[speaker] === player && e.hp[speaker]! > 0;
  switch (o.q) {
    case Ask.Kit: {
      // Upgrade equipment, as the action menu's button sends it (Patch 2): each unit's best weapon first, then the best armour, the stock pays for.
      const units = own(state, player, o.units).filter((i) => kitHolder(state, i) !== undefined);
      orderUpgradeEquipment(state, player, units);
      return;
    }
    case Ask.Heal: {
      const units = own(state, player, o.units).filter((i) => {
        const k = e.kind[i];
        return (k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage) && e.inside[i] === 0 && !e.queue[i]!.some((x) => x.t === 'eat');
      });
      if (units.length === 0) return;
      if (eatableFood(state.players[player]!) < EAT_NUTRITION) {
        say(state, speakerOk ? speaker : units[0]!, `Not enough food to eat (${EAT_NUTRITION} food).`, true);
        return;
      }
      // Eat at the nearest table, in front of what each was doing, so it carries on after (as an upgrade does).
      for (const i of units) inFront(state, i, { t: 'eat', b: 0 });
      return;
    }
    case Ask.Down: {
      if (!speakerOk || !topOf(state, speaker)) return;
      const foe = nearestFoe(state, speaker, UP_TOP_FOE_WU, true);
      if (foe < 0) {
        say(state, speaker, 'Nothing left down there to fight.', false, true);
        return;
      }
      // Let out (as the building's let-out button does), then attack.
      stopUnit(state, speaker);
      giveOrder(state, speaker, { t: 'attack', id: e.id[foe]! }, false);
      return;
    }
    case Ask.Repair: {
      const base = state.buildings.get(o.who);
      if (!base || base.owner !== player) return;
      const [bx, bz] = buildingCentre(base);
      const damaged = unrepaired(state, player)
        .map((b) => ({ b, d: dist2(...buildingCentre(b), bx, bz) }))
        .sort((a, c) => a.d - c.d || a.b.id - c.b.id);
      if (damaged.length === 0) {
        sayBuilding(state, base, 'Nothing is left to repair.');
        return;
      }
      const idle = idleWorkers(state, player);
      if (idle.length === 0) {
        sayBuilding(state, base, 'No idle workers to repair them.', true);
        return;
      }
      // Each building, nearest the main base first, gets the nearest idle worker left (Repair's right click: work on it).
      for (const { b } of damaged) {
        if (idle.length === 0) break;
        const [x, z] = buildingCentre(b);
        let best = 0;
        for (let k = 1; k < idle.length; k++) {
          const a = idle[k]!;
          const c = idle[best]!;
          const da = dist2(e.x[a]!, e.z[a]!, x, z);
          const dc = dist2(e.x[c]!, e.z[c]!, x, z);
          if (da < dc || (da === dc && e.id[a]! < e.id[c]!)) best = k;
        }
        const w = idle.splice(best, 1)[0]!;
        giveOrder(state, w, { t: 'work', b: b.id }, false);
      }
      return;
    }
    case Ask.Farther: {
      if (!speakerOk || e.kind[speaker] !== UnitKind.Worker || o.res < 0 || o.res >= RESOURCES.length) return;
      // As gathering by itself looks: as far as it can walk back from by nightfall, on land someone has seen.
      const x = e.x[speaker]!;
      const z = e.z[speaker]!;
      const h = homeOf(state, speaker);
      const max = h ? h.reach + fromBuilding(h.b, x, z) : GATHER_SWITCH_M * WU_PER_METRE;
      const fits = h ? (px: number, pz: number): boolean => fromBuilding(h.b, px, pz) <= h.reach : undefined;
      const pick = chooseNode(state, speaker, x, z, max, new Map([[o.res, 1000]]), fits);
      const name = resShort(o.res);
      if (!pick) {
        say(state, speaker, `I can't find any ${name} within reach.`, true);
        return;
      }
      giveOrder(state, speaker, { t: 'gather', cx: pick.cx, cz: pick.cz, i: pick.i }, false);
      say(state, speaker, `I'll fetch ${name} from farther off.`, false, true);
      return;
    }
    case Ask.Crew: {
      if (!speakerOk || e.kind[speaker] !== UnitKind.Engine) return;
      const at = crewHooks.trainer(state, speaker);
      const why = at ? crewHooks.train(state, speaker, at) : 'Nothing can train a crewman for it now.';
      if (why) say(state, speaker, why, true);
      return;
    }
  }
}
