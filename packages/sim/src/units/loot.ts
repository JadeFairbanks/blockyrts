// Loot (Jade's play-test notes, 2026-10-03). What a kill drops, a hunted
// animal's meat and hides with the rest, goes to the units, not straight
// into the pool: the unit that made the kill takes what fits in its bag, or
// another of its player's units right beside the kill; the rest falls on the
// ground as loot. Any living unit picks loot up when right-clicked on it, and
// by itself when it is near, safe and has nothing else to do; the unit that
// made a kill from afar goes back for its own. Units hand their bags in at a
// drop-off that takes everything (a main base, a storehouse) when they are
// idle in the dawn or day, and gatherers with every load they drop off.
// Engines and animals carry nothing: they do not eat.

import { dist2 } from '../buildings/lights.ts';
import { clockAt, Period } from '../clock.ts';
import { hostile } from '../combat/combat.ts';
import type { Drop, MobSpec } from '../combat/mobs.ts';
import { mobSpec } from '../combat/mobs.ts';
import { Res, RESOURCES } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { RES_VALUE_TENTHS } from '../peoples/data.ts';
import { say } from '../peoples/speech.ts';
import { hash32 } from '../rng.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { standY, UnitKind, type Loot, type SimState } from '../state.ts';
import type { Rolled } from '../threats/loot.ts';
import { speciesSpec } from '../animals/species.ts';
import { Act, besideBuilding, FAILED, MOVING, nearestDropoff, resetWalk, walkTo } from './behaviour.ts';
import type { UnitOrder } from './unit-orders.ts';
import { rawTenthsLb } from './weight.ts';
import { foodIn, ledgerAdd } from './woodsman.ts';

/** A unit's loot bag holds 25 lb, the Table 12 carrying limit, a worker's gathered load counting against it (s). */
export const LOOT_BAG_TENTHS_LB = 250;
/** What a kill drops goes straight into the bag of the unit that made it, or of another of its player's units, this close to it (s): 4 m. */
export const LOOT_HAND_M = 4;
/** A unit picking loot up takes everything lying this close to it at once (s): 2 m. */
export const LOOT_REACH_M = 2;
/** An idle unit picks up loot this close by itself (s): 15 m. */
export const LOOT_NOTICE_M = 15;
/** The unit that made a kill goes back for its loot from this far (a ranger's shot from afar) (s): 40 m. */
export const LOOT_CLAIM_M = 40;
/** At dusk and at night a unit picks up by itself only loot this close (s): 5 m. */
export const LOOT_DARK_M = 5;
/** Safe to fetch: no enemy within this distance of the unit or of the loot (s): 15 m. */
export const LOOT_SAFE_M = 15;
/** Loot left on the ground rots away after 3 days and nights (s). */
export const LOOT_KEEP_STEPS = 3 * CYCLE_STEPS;
/** A unit says what it picked up one time in four when the find is ordinary (s). */
export const LOOT_TALK_PCT = 25;
/** ...and a player's units say so at most once in 10 s (s). */
export const LOOT_TALK_GAP_STEPS = 10 * STEPS_PER_SECOND;
/** A find worth at least twice what that monster usually drops is always remarked on, with an exclamation (s). */
export const LOOT_BRAG_PCT = 200;
/** So is any drop as rare as 5% a kill, or rarer (s). */
export const LOOT_RARE_PM = 50;
/** Monsters with this much health or more, and those that come only a few a night, count as rare and powerful: whatever they drop is remarked on (s). */
export const LOOT_BOSS_HP = 500;
/** Idle units look about for loot once a second. */
const THINK_STEPS = STEPS_PER_SECOND;

const M = WU_PER_METRE;
const CONTINUE = false;
const DONE = true;

/** (resource, count) pairs. */
export type Items = Array<[number, number]>;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

/** Whether a unit carries loot: the players' living people (workers, warriors, mages and hired mercenaries), never an engine or an animal. */
export function canLoot(state: SimState, i: number): boolean {
  const e = state.entities;
  if (e.owner[i]! >= state.players.length || e.hp[i]! <= 0) return false;
  const k = e.kind[i];
  return k === UnitKind.Worker || k === UnitKind.Warrior || k === UnitKind.Mage;
}

function weightOf(res: number): number {
  return Math.max(1, RESOURCES[res]?.weightTenthsLb ?? 1);
}

/** What a unit's bag holds, tenths of a pound. */
export function bagTenthsLb(state: SimState, i: number): number {
  const g = state.entities.bag[i]!;
  let w = 0;
  for (let k = 0; k < g.length; k += 2) w += weightOf(g[k]!) * g[k + 1]!;
  return w;
}

/** What a unit's bag still takes, tenths of a pound: 25 lb less what it holds, a gathered load counting too. */
export function bagFreeTenthsLb(state: SimState, i: number): number {
  if (!canLoot(state, i)) return 0;
  return Math.max(0, LOOT_BAG_TENTHS_LB - bagTenthsLb(state, i) - Math.min(LOOT_BAG_TENTHS_LB, rawTenthsLb(state, i)));
}

/** How many of a resource still fit in a unit's bag. */
export function bagRoom(state: SimState, i: number, res: number): number {
  return floorDiv(bagFreeTenthsLb(state, i), weightOf(res));
}

export function bagEmpty(state: SimState, i: number): boolean {
  return state.entities.bag[i]!.length === 0;
}

/** The bag's contents as (resource, count) pairs. */
export function bagItems(state: SimState, i: number): Items {
  const g = state.entities.bag[i]!;
  const out: Items = [];
  for (let k = 0; k < g.length; k += 2) out.push([g[k]!, g[k + 1]!]);
  return out;
}

/** Puts n of a resource in a unit's bag (the caller checks it fits). */
export function addToBag(state: SimState, i: number, res: number, n: number): void {
  const g = state.entities.bag[i]!;
  for (let k = 0; k < g.length; k += 2) {
    if (g[k] === res) {
      g[k + 1] = g[k + 1]! + n;
      return;
    }
  }
  g.push(res, n);
}

/** Hands a unit's bag in: what it holds goes into its owner's pool. */
export function handIn(state: SimState, i: number): void {
  const e = state.entities;
  const g = e.bag[i]!;
  if (g.length === 0) return;
  const ps = state.players[e.owner[i]!];
  if (ps) for (let k = 0; k < g.length; k += 2) ps.pool[g[k]!] = ps.pool[g[k]!]! + g[k + 1]!;
  // A woodsman's food line counts the food he brings in (Jade's WD-7).
  if (ps) ledgerAdd(state, i, foodIn(g), 0);
  e.bag[i] = [];
}

// ----- words -----

function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

function singular(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('oes')) return name.slice(0, -2);
  if (name.endsWith('ss') || !name.endsWith('s')) return name;
  return name.slice(0, -1);
}

/** Things counted one by one whose names are written in the singular. */
const PIECES: ReadonlySet<number> = new Set([Res.Bone, Res.DemonHorn, Res.Hexstone, Res.ManaCrystal]);

/** "4 meat", "a hide", "2 rubies", "1 gold", "3 bones". */
export function countText(res: number, n: number): string {
  const info = RESOURCES[res]!;
  const name = (info.name.includes('/') ? info.short : info.name).toLowerCase();
  if (PIECES.has(res)) return n === 1 ? `${article(name)} ${name}` : `${n} ${name}s`;
  if (n !== 1) return `${n} ${name}`;
  const one = singular(name);
  return one === name ? `1 ${name}` : `${article(one)} ${one}`;
}

/** "4 meat, 2 hides and a feather". */
export function itemsText(items: Items): string {
  const parts = items.map(([r, n]) => countText(r, n));
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "the hellhound", or a named boss as he is ("Morvath"). */
function mobName(mob: number): string {
  const name = mobSpec(mob).name;
  const comma = name.indexOf(',');
  return comma > 0 ? name.slice(0, comma) : `the ${name.toLowerCase()}`;
}

/** "a deer", "a wild boar". */
export function preyName(species: number): string {
  const name = speciesSpec(species).name.toLowerCase();
  return `${article(name)} ${name}`;
}

// ----- worth -----

function worth(res: number): number {
  return RES_VALUE_TENTHS[res] ?? 10;
}

/** Whether a mob counts as rare and powerful: one with LOOT_BOSS_HP health or more, or one that comes only a few a night (s). */
export function notableMob(spec: MobSpec): boolean {
  return spec.hp >= LOOT_BOSS_HP || spec.perNight > 0;
}

/**
 * Whether what a drop table gave is worth remarking on: anything from a rare
 * and powerful monster, any row as rare as 5% a kill, or a find worth twice
 * what one of that creature's drops is usually worth (its rows weighed by
 * their chances; Table 11's worth).
 */
export function lootBrag(drops: readonly Drop[], rolled: Rolled, boss: boolean): number {
  if (rolled.items.length === 0) return 0;
  if (boss || rolled.rarestPm <= LOOT_RARE_PM) return 1;
  let chances = 0;
  let usual = 0;
  for (const d of drops) {
    const v = d.alt !== undefined ? floorDiv(worth(d.res) + worth(d.alt), 2) : worth(d.res);
    usual += d.chancePm * (d.min + d.max) * v;
    chances += d.chancePm;
  }
  if (chances === 0) return 0;
  let got = 0;
  for (const [r, n] of rolled.items) got += worth(r) * n;
  // got / (usual / (2 x chances)) >= LOOT_BRAG_PCT / 100
  return got * 200 * chances >= usual * LOOT_BRAG_PCT ? 1 : 0;
}

// ----- what units say -----

/** Not state: when each player's units last talked about an ordinary find. */
const talkedAt = new WeakMap<SimState, number[]>();

/** Whether a unit is out hunting (or hauling for a hunter): it talks about the hunt instead. */
function hunting(state: SimState, i: number): boolean {
  return state.entities.queue[i]!.some((o) => o.t === 'hunt');
}

/**
 * A unit picked loot up: a find worth remarking on always gets an
 * exclamation; an ordinary one now and then. Both are bubbles only (Jade:
 * informational lines stay out of the chat, and a find is not an alert). A
 * hunter says what prey it got instead (`prey`: its species + 1).
 */
function found(state: SimState, i: number, got: Items, brag: number, src: number, prey: number): void {
  const e = state.entities;
  const text = itemsText(got);
  if (prey) {
    say(state, i, `Got ${preyName(prey - 1)}: ${text}.`, false, true);
    return;
  }
  if (brag) {
    say(state, i, src ? `${capital(text)} from ${mobName(src - 1)}!` : `Look at this: ${text}!`, false, true);
    return;
  }
  if (hunting(state, i)) return;
  const h = hash32(state.seed, state.step, e.id[i]!);
  if (h % 100 >= LOOT_TALK_PCT) return;
  let t = talkedAt.get(state);
  if (!t) {
    t = [];
    talkedAt.set(state, t);
  }
  const p = e.owner[i]!;
  if (t[p] !== undefined && state.step - t[p]! < LOOT_TALK_GAP_STEPS && state.step >= t[p]!) return;
  t[p] = state.step;
  const lines = [`Picked up ${text}.`, `${capital(text)} for the stores.`, `Found ${text}.`];
  say(state, i, lines[(h >>> 8) % lines.length]!, false, true);
}

// ----- dropping -----

/** Who a kill's loot is for. */
export interface DropFrom {
  /** The unit that made the kill (an index), or -1. */
  killer: number;
  /** The player it falls for (whose units pick it up by themselves), or -1 for anyone. */
  owner: number;
  /** 1 when it is worth remarking on (lootBrag). */
  brag: number;
  /** What dropped it: a mob + 1, or 0. */
  src: number;
  /** A hunted animal: its species + 1, so a hunter says what it got. */
  prey?: number;
}

/** Loot pieces fall a little apart (wu offsets), so each can be seen and clicked. */
const SPREAD: ReadonlyArray<readonly [number, number]> = [[0, 0], [3200, 0], [-3200, 1600], [1600, -3200], [-1600, -3200], [3200, 3200], [-3200, -1600], [0, 3200]];

/** Workers hauling for a hunter (they pick up what it kills). */
function haulersOf(state: SimState, h: number): boolean {
  const e = state.entities;
  for (let j = 0; j < e.count; j++) {
    if (e.kind[j] !== UnitKind.Worker || e.owner[j] !== e.owner[h]) continue;
    if (e.queue[j]!.some((o) => o.t === 'hunt' && o.id === e.id[h])) return true;
  }
  return false;
}

/**
 * A kill drops loot at (x, z) wu: the unit that made it takes what fits if it
 * is within 4 m (unless workers haul for it), then the owner's other units
 * within 4 m, nearest first; the rest falls on the ground there.
 */
export function dropLoot(state: SimState, x: number, z: number, items: Items, from: DropFrom): void {
  const e = state.entities;
  const left: Items = [];
  for (const [res, n] of items) {
    if (n <= 0) continue;
    const same = left.find((it) => it[0] === res);
    if (same) same[1] += n;
    else left.push([res, n]);
  }
  const reach = LOOT_HAND_M * M;
  const close = (j: number): boolean => e.inside[j] === 0 && length2d(e.x[j]! - x, e.z[j]! - z) <= reach;
  const takers: number[] = [];
  const k = from.killer;
  if (k >= 0 && canLoot(state, k) && close(k) && !(from.prey && haulersOf(state, k))) takers.push(k);
  if (from.owner >= 0 && left.length > 0) {
    const others: Array<[number, number]> = [];
    for (let j = 0; j < e.count; j++) {
      if (j === k || e.owner[j] !== from.owner || !canLoot(state, j) || !close(j)) continue;
      others.push([dist2(e.x[j]!, e.z[j]!, x, z), j]);
    }
    others.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, j] of others) takers.push(j);
  }
  let killerGot = false;
  for (const j of takers) {
    const got: Items = [];
    for (const it of left) {
      const n = Math.min(it[1], bagRoom(state, j, it[0]));
      if (n <= 0) continue;
      addToBag(state, j, it[0], n);
      it[1] -= n;
      got.push([it[0], n]);
    }
    if (got.length === 0) continue;
    if (j === k) killerGot = true;
    found(state, j, got, from.brag, from.src, j === k && hunting(state, j) ? (from.prey ?? 0) : 0);
    if (left.every((it) => it[1] === 0)) break;
  }
  // A hunter whose kill fell out of its reach (or its bag is full) still says what it got.
  if (from.prey && k >= 0 && !killerGot && canLoot(state, k) && hunting(state, k)) say(state, k, `Got ${preyName(from.prey - 1)}.`, false, true);
  let n = 0;
  for (const [res, amt] of left) {
    if (amt <= 0) continue;
    const [ox, oz] = SPREAD[n++ % SPREAD.length]!;
    state.loot.push({
      id: state.nextEntityId++, res, amt, x: x + ox, y: standY(state, x + ox, z + oz), z: z + oz, at: state.step,
      by: k >= 0 ? e.id[k]! : 0, owner: from.owner, brag: from.brag, src: from.src,
    });
  }
}

/** The index of a piece of loot by its id, or -1. */
export function lootIndex(state: SimState, id: number): number {
  return state.loot.findIndex((l) => l.id === id);
}

/** Each step: loot left lying too long rots away. */
export function updateLoot(state: SimState): void {
  const list = state.loot;
  let n = 0;
  while (n < list.length && state.step - list[n]!.at >= LOOT_KEEP_STEPS) n++;
  if (n > 0) list.splice(0, n);
}

/** Whether loot is a unit's own side's to pick up by itself: its player's, or anyone's. */
function ownLoot(state: SimState, i: number, l: Loot): boolean {
  return l.owner < 0 || l.owner === state.entities.owner[i];
}

/**
 * A unit picks up loot: `first` (an index into state.loot, any side's, as a
 * right-click may send it to), and everything of its own side's lying within
 * 2 m of it, as much as fits. Says what it found; returns whether it took any.
 */
function pickUp(state: SimState, i: number, first: number): boolean {
  const e = state.entities;
  const got: Items = [];
  let brag = 0;
  let src = 0;
  const reach = LOOT_REACH_M * M;
  const take = (l: Loot): void => {
    const n = Math.min(l.amt, bagRoom(state, i, l.res));
    if (n <= 0) return;
    addToBag(state, i, l.res, n);
    l.amt -= n;
    const same = got.find((it) => it[0] === l.res);
    if (same) same[1] += n;
    else got.push([l.res, n]);
    if (l.brag && !brag) {
      brag = 1;
      src = l.src;
    }
  };
  if (first >= 0) take(state.loot[first]!);
  for (const l of state.loot) {
    if (l.amt <= 0 || !ownLoot(state, i, l) || length2d(l.x - e.x[i]!, l.z - e.z[i]!) > reach) continue;
    take(l);
  }
  state.loot = state.loot.filter((l) => l.amt > 0);
  if (got.length === 0) return false;
  found(state, i, got, brag, src, 0);
  return true;
}

// ----- the order -----

/** Whether an enemy of a unit stands within 15 m of a point. */
export function enemyNear(state: SimState, i: number, x: number, z: number): boolean {
  const e = state.entities;
  const r = LOOT_SAFE_M * M;
  for (const j of state.grid.near(x, z, r)) {
    if (e.hp[j]! <= 0 || !hostile(state, i, j)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) <= r) return true;
  }
  return false;
}

/** Whether a unit walks back where it stood after an order it gave itself. */
export function selfLooting(o: UnitOrder | undefined): boolean {
  return o?.t === 'loot' && o.back !== 0;
}

export function runLoot(state: SimState, i: number, o: Extract<UnitOrder, { t: 'loot' }>): boolean {
  const e = state.entities;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (o.id !== 0) {
    const k = lootIndex(state, o.id);
    const l = k >= 0 ? state.loot[k] : undefined;
    if (!l || bagRoom(state, i, l.res) === 0) {
      o.id = 0;
      resetWalk(state, i);
      return CONTINUE;
    }
    if (length2d(l.x - e.x[i]!, l.z - e.z[i]!) > LOOT_REACH_M * M) {
      const r = walkTo(state, i, { ...pointGoal(col(l.x), col(l.z)), max: 1 });
      if (r === MOVING) return CONTINUE;
      if (r === FAILED) {
        if (!o.back) say(state, i, 'I cannot reach that.', true);
        o.id = 0;
        resetWalk(state, i);
        return CONTINUE;
      }
    }
    pickUp(state, i, k);
    o.id = 0;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (o.hand !== 0) {
    const b = bagEmpty(state, i) ? null : nearestDropoff(state, i, -1);
    if (!b) {
      if (!bagEmpty(state, i) && !o.back) say(state, i, 'There is nowhere to hand this in. Build a storehouse.', true);
      o.hand = 0;
      return CONTINUE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      // A drop-off it cannot reach is not tried again for a while.
      if (o.back) e.waitUntil[i] = state.step + 30 * STEPS_PER_SECOND;
      else say(state, i, 'I cannot reach a drop-off.', true);
    } else handIn(state, i);
    o.hand = 0;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (o.back !== 0) {
    const r = walkTo(state, i, pointGoal(col(o.x), col(o.z)), o.x, o.z);
    if (r === MOVING) return CONTINUE;
  }
  return DONE;
}

/** Whether loot may be handed in now: in the dawn or the day. */
function handingTime(state: SimState): boolean {
  const p = clockAt(state.step).period;
  return p === Period.Day || p === Period.Dawn;
}

/**
 * An idle unit looks about for loot once a second (Jade: low priority, only
 * when it would otherwise be idle, the fighting done and safe): it fetches
 * its own side's loot within 15 m, or its own kill's within 40 m (5 m at dusk
 * and night), and in the dawn or day hands its bag in; then it walks back to
 * where it stood. Several units do not run for the same piece.
 */
export function lootIdle(state: SimState, i: number): void {
  const e = state.entities;
  if ((state.step + e.id[i]!) % THINK_STEPS !== 0 || !canLoot(state, i) || e.inside[i] !== 0 || state.step < e.waitUntil[i]!) return;
  if (e.target[i] !== 0 || e.chasing[i] !== 0 || e.heldUntil[i]! > state.step) return;
  if (enemyNear(state, i, e.x[i]!, e.z[i]!)) return;
  // Loot is handed in at dawn and in the day; at dusk and night only what lies close is picked up.
  const day = handingTime(state);
  const dark = !day;
  const x = e.x[i]!;
  const z = e.z[i]!;
  let best: Loot | undefined;
  let bestD = 0;
  let claimed: Set<number> | undefined;
  for (const l of state.loot) {
    if (!ownLoot(state, i, l) || bagRoom(state, i, l.res) === 0) continue;
    const reach = (dark ? LOOT_DARK_M : l.by === e.id[i] ? LOOT_CLAIM_M : LOOT_NOTICE_M) * M;
    const d = length2d(l.x - x, l.z - z);
    if (d > reach || (best && (d > bestD || (d === bestD && l.id > best.id)))) continue;
    if (!claimed) {
      claimed = new Set();
      for (let j = 0; j < e.count; j++) {
        const q = e.queue[j]![0];
        if (j !== i && q?.t === 'loot' && q.id !== 0) claimed.add(q.id);
      }
    }
    if (claimed.has(l.id) || enemyNear(state, i, l.x, l.z)) continue;
    best = l;
    bestD = d;
  }
  if (!best && (!day || bagEmpty(state, i) || !nearestDropoff(state, i, -1))) return;
  e.queue[i] = [{ t: 'loot', id: best?.id ?? 0, hand: day && (!bagEmpty(state, i) || best) ? 1 : 0, back: 1, x, z }];
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
}

/** The players' units within reach of a point that can still take loot, for the right-click: nearest first, until the piece's weight is covered. */
export function pickersFor(state: SimState, units: readonly number[], l: Loot): number[] {
  const e = state.entities;
  const sorted = units.filter((i) => canLoot(state, i) && bagRoom(state, i, l.res) > 0).map((i) => [dist2(e.x[i]!, e.z[i]!, l.x, l.z), i] as const);
  sorted.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: number[] = [];
  let room = 0;
  for (const [, i] of sorted) {
    if (room >= l.amt) break;
    out.push(i);
    room += bagRoom(state, i, l.res);
  }
  return out;
}
