// Loot (Jade's play-test notes, 2026-10-03). What a kill drops, a hunted
// animal's meat and hides with the rest, goes to the units, not straight
// into the pool: the unit that made the kill takes what fits in its bag, or
// another of its player's units right beside the kill; the rest falls on the
// ground as loot. Any living unit picks loot up when right-clicked on it, and
// by itself when it is near, safe and has nothing else to do; the unit that
// made a kill from afar goes back for its own. Units hand their bags in at a
// drop-off that takes everything (a main base, a storehouse) when they are
// idle in the dawn or day, and gatherers with every load they drop off.
// Patch 5 (Jade, GP-6 and GP-7): any unit within 5 m of a drop-off hands in
// by itself; the unit inventory unloads one good or drops it on the ground,
// where nobody picks it up by themselves. Patch 7 (plan section 7): Keep in
// bag locks a good in the bag, in a pocket of its own (EntityStore.kept) that
// nothing hands in by itself; Unload, Drop, Give, Equip and Scrap still take
// it, and the lock goes when the last of it leaves.
// Engines and animals carry nothing: they do not eat.

import { buildingSpec } from '../buildings/data.ts';
import { dist2 } from '../buildings/lights.ts';
import { solidRect } from '../buildings/store.ts';
import { clockAt, Period } from '../clock.ts';
import { hostile } from '../combat/combat.ts';
import type { Drop, MobSpec } from '../combat/mobs.ts';
import { mobSpec } from '../combat/mobs.ts';
import { Res, RESOURCES } from '../economy/resources.ts';
import { ceilDiv, floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal, rectDistance } from '../nav/path.ts';
import { RES_VALUE_TENTHS } from '../peoples/data.ts';
import { say } from '../peoples/speech.ts';
import { hash32 } from '../rng.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { NO_CARRY, standY, UnitKind, type Loot, type SimState } from '../state.ts';
import type { Rolled } from '../threats/loot.ts';
import { speciesSpec } from '../animals/species.ts';
import { accepts, Act, besideBuilding, FAILED, MOVING, nearestDropoff, resetWalk, unload, walkTo } from './behaviour.ts';
import type { UnitOrder } from './unit-orders.ts';
import { rawLimitTenthsLb, rawTenthsLb } from './weight.ts';
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
/** A loot order's `hand` that hands in only one good (Patch 5, GP-7: the unit inventory's Unload): HAND_ONE plus the good; 1 hands in the whole bag. */
export const HAND_ONE = 2;
/** The `owner` of loot a player's unit put down on purpose (GP-7: Drop): nobody picks it up by themselves, only when sent to it. */
export const DROPPED = -2;
/** A unit this close to one of its player's drop-offs hands in what it carries by itself (Patch 5, GP-6) (s): 5 m from the building's walls. */
export const AUTO_DROP_M = 5;
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

/** What a unit's bag holds, tenths of a pound, the goods kept in it too. */
export function bagTenthsLb(state: SimState, i: number): number {
  let w = 0;
  for (const g of [state.entities.bag[i]!, state.entities.kept[i]!]) for (let k = 0; k < g.length; k += 2) w += weightOf(g[k]!) * g[k + 1]!;
  return w;
}

/**
 * What a unit carries and the most it can, tenths of a pound, for the unit
 * inventory's weight (Patch 5, GP-7): its gathered load and its bag together,
 * out of 25 lb, or a cart's or pack's load (loot always shares the first
 * 25 lb with what it gathers).
 */
export function carryView(state: SimState, i: number): [number, number] {
  return [rawTenthsLb(state, i) + bagTenthsLb(state, i), Math.max(LOOT_BAG_TENTHS_LB, rawLimitTenthsLb(state, i))];
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

/** Whether a unit's bag holds nothing to hand in (what is kept in it stays: Patch 7, Keep in bag). */
export function bagEmpty(state: SimState, i: number): boolean {
  return state.entities.bag[i]!.length === 0;
}

/** Whether a unit's bag holds nothing at all, kept goods included. */
export function bagBare(state: SimState, i: number): boolean {
  return state.entities.bag[i]!.length === 0 && state.entities.kept[i]!.length === 0;
}

/** The bag's contents as (resource, count) pairs, the kept goods after the rest. */
export function bagItems(state: SimState, i: number): Items {
  const out: Items = [];
  for (const g of [state.entities.bag[i]!, state.entities.kept[i]!]) for (let k = 0; k < g.length; k += 2) out.push([g[k]!, g[k + 1]!]);
  return out;
}

/** Whether a good is locked in a unit's bag (Patch 7, Keep in bag). */
export function isKept(state: SimState, i: number, res: number): boolean {
  const g = state.entities.kept[i]!;
  for (let k = 0; k < g.length; k += 2) if (g[k] === res) return true;
  return false;
}

/** The goods locked in a unit's bag (Patch 7, Keep in bag). */
export function keptGoods(state: SimState, i: number): number[] {
  const g = state.entities.kept[i]!;
  const out: number[] = [];
  for (let k = 0; k < g.length; k += 2) out.push(g[k]!);
  return out;
}

/**
 * Keep in bag (Patch 7, plan section 7): `on` locks all of a good a unit
 * carries in its bag, so nothing hands it in by itself (idle at dawn and by
 * day, near a drop-off, a gatherer's drop-off); off, it goes back with the
 * rest. Returns whether the unit carries any of it in its bag.
 */
export function keepItem(state: SimState, i: number, res: number, on: boolean): boolean {
  const e = state.entities;
  const [from, to] = on ? [e.bag[i]!, e.kept[i]!] : [e.kept[i]!, e.bag[i]!];
  for (let k = 0; k < from.length; k += 2) {
    if (from[k] !== res) continue;
    const n = from[k + 1]!;
    from.splice(k, 2);
    to.push(res, n);
    return true;
  }
  return bagCount(state, i, res) > 0;
}

/** How many of a good a unit has in its bag, kept or not (not its gathered load). */
export function bagCount(state: SimState, i: number, res: number): number {
  let n = 0;
  for (const g of [state.entities.bag[i]!, state.entities.kept[i]!]) for (let k = 0; k < g.length; k += 2) if (g[k] === res) n += g[k + 1]!;
  return n;
}

/** Takes up to n of a good from a unit's bag, kept or not; returns how many it took. A kept good's lock goes with the last of it. */
export function takeFromBag(state: SimState, i: number, res: number, n: number): number {
  let took = 0;
  for (const g of [state.entities.bag[i]!, state.entities.kept[i]!]) {
    for (let k = 0; k < g.length && took < n; k += 2) {
      if (g[k] !== res) continue;
      const t = Math.min(n - took, g[k + 1]!);
      g[k + 1] = g[k + 1]! - t;
      took += t;
      if (g[k + 1]! <= 0) {
        g.splice(k, 2);
        k -= 2;
      }
    }
  }
  return took;
}

/** Puts n of a resource in a unit's bag (the caller checks it fits): with the rest of it where it is kept, else loose. */
export function addToBag(state: SimState, i: number, res: number, n: number): void {
  const e = state.entities;
  const g = isKept(state, i, res) ? e.kept[i]! : e.bag[i]!;
  for (let k = 0; k < g.length; k += 2) {
    if (g[k] === res) {
      g[k + 1] = g[k + 1]! + n;
      return;
    }
  }
  g.push(res, n);
}

/** Hands a unit's bag in: what it holds goes into its owner's pool, all but what it keeps (Patch 7). */
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

/** How many of a good a unit carries, in its gathered load and its bag (kept or not). */
export function carriedOf(state: SimState, i: number, res: number): number {
  const e = state.entities;
  return (e.carryRes[i] === res ? e.carryAmt[i]! : 0) + bagCount(state, i, res);
}

/** Takes all of a good out of a unit's load and bag (kept or not); returns how many. */
function takeOut(state: SimState, i: number, res: number): number {
  const e = state.entities;
  let n = 0;
  if (e.carryRes[i] === res && e.carryAmt[i]! > 0) {
    n += e.carryAmt[i]!;
    e.carryAmt[i] = 0;
    e.carryRes[i] = NO_CARRY;
  }
  return n + takeFromBag(state, i, res, bagCount(state, i, res));
}

/** Hands in one good a unit carries, load and bag, into its owner's pool (GP-7: Unload). */
export function handInOne(state: SimState, i: number, res: number): void {
  const n = takeOut(state, i, res);
  const ps = state.players[state.entities.owner[i]!];
  if (ps && n > 0) ps.pool[res] = ps.pool[res]! + n;
}

/**
 * Puts all of a good a unit carries down on the ground at its feet (Patch
 * 5, GP-7: the unit inventory's Drop). Nobody picks it up by themselves; a
 * right click on it sends units for it as for any loot.
 */
export function dropItem(state: SimState, i: number, res: number): number {
  const e = state.entities;
  const n = takeOut(state, i, res);
  if (n <= 0) return 0;
  const x = e.x[i]!;
  const z = e.z[i]!;
  state.loot.push({ id: state.nextEntityId++, res, amt: n, x, y: standY(state, x, z), z, at: state.step, by: 0, owner: DROPPED, brag: 0, src: 0 });
  return n;
}

/**
 * Units near one of their player's drop-offs hand in what they carry by
 * themselves (Jade's Patch 5, GP-6: "make all units near enough to a
 * storepoint to drop off automatically"): within 5 m of its walls, once a
 * second, a gathered load where the drop-off takes it and the loot bag at
 * one that takes everything, with no walk and no stop to what they do.
 */
export function autoDropoff(state: SimState): void {
  const e = state.entities;
  const reach = ceilDiv(AUTO_DROP_M * M, WU_PER_COLUMN);
  for (let i = 0; i < e.count; i++) {
    if ((state.step + e.id[i]!) % THINK_STEPS !== 0 || e.inside[i] !== 0 || !canLoot(state, i)) continue;
    const load = e.carryAmt[i]! > 0 && e.carryRes[i] !== NO_CARRY;
    if (!load && bagEmpty(state, i)) continue;
    const cx = col(e.x[i]!);
    const cz = col(e.z[i]!);
    for (const b of state.buildings.list) {
      if (b.owner !== e.owner[i] || !b.complete) continue;
      const spec = buildingSpec(b.kind);
      const all = spec.dropoff === 'all';
      if (!(load ? accepts(spec, e.carryRes[i]!) : all)) continue;
      const [x0, z0, x1, z1] = solidRect(b);
      if (rectDistance({ x0, z0, x1, z1, min: 0, max: 0 }, cx, cz) > reach) continue;
      if (load) {
        const res = e.carryRes[i]!;
        unload(state, i, b);
        // A gatherer keeps in mind what it was gathering, to find more of it if its node is gone, as on reaching the drop-off.
        if (e.queue[i]![0]?.t === 'gather') e.carryRes[i] = res;
      } else handIn(state, i);
      break;
    }
  }
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

/** Whether loot is a unit's own side's to pick up by itself: its player's, or anyone's (never what a unit dropped on purpose). */
function ownLoot(state: SimState, i: number, l: Loot): boolean {
  return l.owner === -1 || l.owner === state.entities.owner[i];
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
    // One good only (the unit inventory's Unload), at the nearest drop-off that takes it; else the whole bag.
    const one = o.hand >= HAND_ONE ? o.hand - HAND_ONE : -1;
    const has = one >= 0 ? carriedOf(state, i, one) > 0 : !bagEmpty(state, i);
    const b = has ? nearestDropoff(state, i, one) : null;
    if (!b) {
      if (has && !o.back) say(state, i, 'There is nowhere to hand this in. Build a storehouse.', true);
      // Nothing left to hand in (it went in by itself near a drop-off on the way, Patch 5's GP-6): on to the walk back.
      o.hand = 0;
      resetWalk(state, i);
      return CONTINUE;
    }
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      // A drop-off it cannot reach is not tried again for a while.
      if (o.back) e.waitUntil[i] = state.step + 30 * STEPS_PER_SECOND;
      else say(state, i, 'I cannot reach a drop-off.', true);
    } else if (one >= 0) handInOne(state, i, one);
    else handIn(state, i);
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
