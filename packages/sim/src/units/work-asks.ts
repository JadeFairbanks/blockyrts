// Work that waits (Jade's Patch 4): three questions that ask by themselves,
// in the question bubbles of units/questions.ts (the same 10 s wait, Yes
// and No, and the same cap of open questions a player may have).
// - "Add an actionable for a farm that has sat empty for more than a minute
//   to assign a nearby worker." The farm asks: "No one is farming here.
//   Send a worker?"
// - "Add an actionable for a building underconstruction that has been
//   unattended/not-worked-on for more than a minute while still needing a
//   builder to finish it. Does not activate at night or dusk." The site
//   asks: "No one is building this forge. Send a builder?"
// - "Add an actionable for a worker who has been idle for more than a
//   minute for them to farm, or gather or help construct a building." The
//   worker asks: "I've nothing to do. Shall I farm?"
//
// None of the three asks at dusk or at night, and the minute is counted by
// dawn and day only: workers come home at dusk (Everyone Home, Gather) and
// out at daybreak, so the earliest any of them asks is a minute after dawn
// begins. After No, or no answer, a question rests until its cause clears
// (the farm gets a farmer, someone works on the site, the worker is given
// something to do) or until the next day. While one is up it is withdrawn
// the moment its cause clears, and the farm's and the site's when no worker
// is free near them any more.
//
// A worker free to send is one of the player's own, outside, not fighting
// and either idle (no orders) or gathering by hand; an idle one first, then
// the nearest. One that carries a load hands it in on the way. Yes carries
// only who asked, and works out afresh from the state who goes where, so
// every machine does the same; like the other questions, none of this is
// state, and nothing here draws on a random stream.

import { BuildingKind, buildingName, levelSpec } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import type { Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_METRE } from '../fixed.ts';
import type { AnswerOrder } from '../orders.ts';
import { sayBuilding } from '../peoples/speech.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Role } from '../threats/types.ts';
import { builderLimit, giveOrder } from './behaviour.ts';
import { fromBuilding, startForage } from './forage.ts';
import { bagEmpty } from './loot.ts';
import { answerKinds, askOwn, canAsk, isAsking, SPEAK_FOR_M } from './questions.ts';
import type { UnitOrder } from './unit-orders.ts';

/** The questions (units/questions.ts Ask is 1 to 9, units/greyed.ts GreyAsk 10 to 15). */
export const WorkAsk = {
  /** A farm stood empty a minute: send a worker? */
  Farm: 16,
  /** An unfinished building no one has worked on for a minute: send a builder? */
  Site: 17,
  /** A worker idle a minute: farm, help build or gather? */
  Idle: 18,
} as const;

/** A farm with no farmer asks for one once it has stood empty this long by dawn and day (Jade's Patch 4: "more than a minute"). */
export const FARM_EMPTY_ASK_STEPS = 60 * STEPS_PER_SECOND;
/** A building going up, or an upgrade under way, asks for a builder once no worker has been on it this long by dawn and day (Jade's Patch 4: "more than a minute"; never at dusk or night). */
export const SITE_UNWORKED_ASK_STEPS = 60 * STEPS_PER_SECOND;
/** A worker asks for something to do once it has stood idle this long by dawn and day (Jade's Patch 4: "more than a minute"). */
export const WORKER_IDLE_ASK_STEPS = 60 * STEPS_PER_SECOND;
/**
 * "Nearby" (s): how near a farm or site, measured from its edge, a worker
 * must be for the farm or site to send for it; and how near an idle worker a
 * farm with room or a site must be for it to farm or help build there rather
 * than gather. 30 m, as far as Repair All looks.
 */
export const WORK_ASK_NEAR_M = 30;

/** Head orders of a worker gathering by hand, which a farm or site may send for (as a greyed-out button's question does). */
const GATHERING = new Set(['gather', 'forage', 'return', 'dropoff']);

/** How long a farm, site or worker has waited (from the step `since`, by dawn and day), and whether it has asked since. */
interface Wait {
  since: number;
  asked: boolean;
}

/** Not state: the farms, sites and workers waiting, by building or entity id. */
interface WorkBook {
  farms: Map<number, Wait>;
  sites: Map<number, Wait>;
  idle: Map<number, Wait>;
  /** The worker each farm or site asking now would send (entity id, by building id): it does not ask about being idle meanwhile. */
  sending: Map<number, number>;
}

const books = new WeakMap<SimState, WorkBook>();

function bookOf(state: SimState): WorkBook {
  let b = books.get(state);
  if (!b) {
    b = { farms: new Map(), sites: new Map(), idle: new Map(), sending: new Map() };
    books.set(state, b);
  }
  return b;
}

/** The wait for an id, begun now if it was not waiting; whether it has waited longer than `steps`. */
function waited(state: SimState, map: Map<number, Wait>, id: number, steps: number): Wait | undefined {
  let w = map.get(id);
  if (!w) {
    w = { since: state.step, asked: false };
    map.set(id, w);
  }
  return state.step - w.since > steps ? w : undefined;
}

/** Whether a farm or site asking now would send this worker (entity id). */
function sentFor(state: SimState, book: WorkBook, id: number): boolean {
  for (const [b, w] of book.sending) {
    if (!isAsking(state, b, true)) book.sending.delete(b);
    else if (w === id) return true;
  }
  return false;
}

// ----- words -----

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "a minute", "2 minutes", "90 seconds": a wait in steps, in words. */
function spanText(steps: number): string {
  const s = floorDiv(steps, STEPS_PER_SECOND);
  if (s === 60) return 'a minute';
  if (s % 60 === 0) return `${floorDiv(s, 60)} minutes`;
  return `${s} seconds`;
}

function metres(wu: number): number {
  return floorDiv(wu, WU_PER_METRE);
}

/** A site's name for its bubble: "forge", or the level an upgrade builds. */
function siteName(b: Building): string {
  return b.complete ? buildingName(b.kind, b.upgrading, b.variant) : buildingName(b.kind, b.level, b.variant).toLowerCase();
}

// ----- who and what -----

/** One of a player's own workers, alive and outside, not hired, not fighting and not sitting at a timed action. */
function ownWorker(state: SimState, i: number, player: number): boolean {
  const e = state.entities;
  if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.hp[i]! <= 0 || e.inside[i] !== 0) return false;
  if (e.role[i] === Role.Mercenary || e.role[i] === Role.People) return false;
  return e.target[i] === 0 && e.chasing[i] === 0 && e.tinker[i] === 0;
}

/** Idle: one of the player's workers with no orders at all (one told to Hold has orders). */
function idleNow(state: SimState, i: number, player: number): boolean {
  return ownWorker(state, i, player) && state.entities.queue[i]!.length === 0;
}

const Free = { No: 0, Idle: 1, Gathering: 2 } as const;

/** Whether a farm or site may send for a worker: idle, or gathering by hand. */
function freeAs(state: SimState, i: number, player: number): number {
  if (!ownWorker(state, i, player)) return Free.No;
  const q = state.entities.queue[i]!;
  if (q.length === 0) return Free.Idle;
  return GATHERING.has(q[0]!.t) ? Free.Gathering : Free.No;
}

/** The worker a farm or site sends for: idle before gathering, then the nearest to its edge within WORK_ASK_NEAR_M, then the lower id. */
function nearestFree(state: SimState, player: number, b: Building): { i: number; free: number; d: number } | undefined {
  const e = state.entities;
  const near = WORK_ASK_NEAR_M * WU_PER_METRE;
  let best: { i: number; free: number; d: number } | undefined;
  for (let i = 0; i < e.count; i++) {
    const free = freeAs(state, i, player);
    if (free === Free.No) continue;
    const d = fromBuilding(b, e.x[i]!, e.z[i]!);
    if (d > near) continue;
    if (best && (free > best.free || (free === best.free && (d > best.d || (d === best.d && e.id[i]! > e.id[best.i]!))))) continue;
    best = { i, free, d };
  }
  return best;
}

/** A building going up, or an upgrade under way: work a builder must do. */
function isSite(b: Building): boolean {
  return b.hp > 0 && (!b.complete || b.upgrading > 0);
}

/** One of the player's farms, finished and standing. */
function isFarmOf(b: Building, player: number): boolean {
  return b.owner === player && b.kind === BuildingKind.Farm && b.complete && b.hp > 0;
}

/** How many of the player's units have a job at each building, and a work order on each, anywhere in their orders (a farmer gone to eat still farms there; a builder sheltering for the night still builds). */
function claims(state: SimState, player: number): { jobs: Map<number, number>; works: Map<number, number> } {
  const e = state.entities;
  const jobs = new Map<number, number>();
  const works = new Map<number, number>();
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.hp[i]! <= 0) continue;
    for (const o of e.queue[i]!) {
      if (o.t === 'job') jobs.set(o.b, (jobs.get(o.b) ?? 0) + 1);
      else if (o.t === 'work') works.set(o.b, (works.get(o.b) ?? 0) + 1);
    }
  }
  return { jobs, works };
}

/** Sends a worker off to farm or build: what it carries is handed in first (Return Cargo), then the work, as its button would send it. */
function sendTo(state: SimState, i: number, orders: readonly UnitOrder[]): void {
  const load = carrying(state, i);
  if (load) giveOrder(state, i, { t: 'return' }, false);
  orders.forEach((o, k) => giveOrder(state, i, o, load || k > 0));
}

/** Whether a worker carries a load or loot, which it hands in before it farms or builds. */
function carrying(state: SimState, i: number): boolean {
  return state.entities.carryAmt[i]! > 0 || !bagEmpty(state, i);
}

/** What a farm's or site's Yes tooltip says of the worker it would send: "The nearest idle worker (12 m away) comes to farm here." */
function sendText(state: SimState, w: { i: number; free: number; d: number }, to: string): string {
  const m = metres(w.d);
  const who = w.free === Free.Idle ? `The nearest idle worker (${m} m away) comes` : `No worker nearby is idle: the nearest one gathering (${m} m away) stops and comes`;
  return `${who} ${to}${carrying(state, w.i) ? ', handing in its load on the way' : ''}. Takes nothing from the stock.`;
}

// ----- 1: an empty farm -----

/** The worker an empty farm would send for now, or undefined when it has a farmer or none is free nearby. */
function farmWant(state: SimState, b: Building | undefined, player: number): { i: number; free: number; d: number } | undefined {
  if (!b || !isFarmOf(b, player)) return undefined;
  if ((claims(state, player).jobs.get(b.id) ?? 0) > 0) return undefined;
  return nearestFree(state, player, b);
}

function askFarm(state: SimState, book: WorkBook, b: Building, w: Wait, worker: { i: number; free: number; d: number }): void {
  const player = b.owner;
  w.asked = true;
  const id = b.id;
  const yes = sendText(state, worker, 'to farm here');
  book.sending.set(id, state.entities.id[worker.i]!);
  askOwn(state, {
    player,
    who: id,
    building: true,
    q: WorkAsk.Farm,
    units: [],
    text: 'No one is farming here. Send a worker?',
    yes,
    no: `The farm stays empty. Asked again the next day if it still stands empty, or once it has stood empty ${spanText(FARM_EMPTY_ASK_STEPS)} after it next empties.`,
    // Checked once a second: withdrawn once a farmer comes, or no worker is free nearby.
    holds: () => state.step % STEPS_PER_SECOND !== 0 || farmWant(state, state.buildings.get(id), player) !== undefined,
    unask: () => {
      const v = book.farms.get(id);
      if (v) v.asked = false;
    },
    recount: () => {
      if (state.step % STEPS_PER_SECOND !== 0) return yes;
      const now = farmWant(state, state.buildings.get(id), player);
      if (!now) return null;
      book.sending.set(id, state.entities.id[now.i]!);
      return sendText(state, now, 'to farm here');
    },
  });
}

// ----- 2: a site no one works on -----

/** The player's other sites near a site that no worker has a work order on, nearest first (a site speaks for them too). */
function sitesBy(state: SimState, b: Building, works: Map<number, number>): Building[] {
  const [x, z] = buildingCentre(b);
  const r = SPEAK_FOR_M * WU_PER_METRE;
  return state.buildings.list
    .filter((s) => s.id !== b.id && s.owner === b.owner && isSite(s) && (works.get(s.id) ?? 0) === 0)
    .map((s) => ({ s, d: dist2(...buildingCentre(s), x, z) }))
    .filter((v) => v.d <= r * r)
    .sort((a, c) => a.d - c.d || a.s.id - c.s.id)
    .map((v) => v.s);
}

/** The worker a site no one works on would send for now, or undefined when someone is on it or none is free nearby. */
function siteWant(state: SimState, b: Building | undefined, player: number): { i: number; free: number; d: number } | undefined {
  if (!b || b.owner !== player || !isSite(b)) return undefined;
  if ((claims(state, player).works.get(b.id) ?? 0) > 0) return undefined;
  return nearestFree(state, player, b);
}

function askSite(state: SimState, book: WorkBook, b: Building, w: Wait, worker: { i: number; free: number; d: number }, works: Map<number, number>): void {
  const player = b.owner;
  const others = sitesBy(state, b, works).filter((s) => !isAsking(state, s.id, true));
  const group = [b, ...others];
  for (const s of group) {
    const v = s === b ? w : waited(state, book.sites, s.id, SITE_UNWORKED_ASK_STEPS) ?? book.sites.get(s.id)!;
    v.asked = true;
  }
  const ids = group.map((s) => s.id);
  const n = group.length;
  const text = n > 1 ? `No one is building these ${countWord(n).toLowerCase()} buildings. Send a builder?` : b.complete ? `No one is working on the upgrade to ${siteName(b)}. Send a builder?` : `No one is building this ${siteName(b)}. Send a builder?`;
  const to = n > 1 ? 'and builds them one after another, the nearest first' : b.complete ? 'to work on the upgrade' : 'to build it';
  const yes = sendText(state, worker, to);
  const id = b.id;
  book.sending.set(id, state.entities.id[worker.i]!);
  askOwn(state, {
    player,
    who: id,
    building: true,
    q: WorkAsk.Site,
    units: [],
    text,
    yes,
    no: `${n > 1 ? 'They stay' : 'It stays'} as ${n > 1 ? 'they are' : 'it is'}. Asked again the next day if no one is building ${n > 1 ? 'them' : 'it'}, or once no one has worked on ${n > 1 ? 'them' : 'it'} for ${spanText(SITE_UNWORKED_ASK_STEPS)} after someone next does.`,
    // Checked once a second: withdrawn once someone works on it, or no worker is free nearby.
    holds: () => state.step % STEPS_PER_SECOND !== 0 || siteWant(state, state.buildings.get(id), player) !== undefined,
    unask: () => {
      for (const s of ids) {
        const v = book.sites.get(s);
        if (v) v.asked = false;
      }
    },
    recount: () => {
      if (state.step % STEPS_PER_SECOND !== 0) return yes;
      const now = siteWant(state, state.buildings.get(id), player);
      if (!now) return null;
      book.sending.set(id, state.entities.id[now.i]!);
      return sendText(state, now, to);
    },
  });
}

// ----- 3: an idle worker -----

/** What an idle worker would do: farm at a farm with room, help build a site, or gather. */
type Job = { k: 'farm'; b: Building; d: number } | { k: 'build'; b: Building; d: number } | { k: 'gather' };

/**
 * What Yes gives each of these idle workers, in turn (Jade's "farm, or
 * gather or help construct a building"): a place at the nearest farm within
 * WORK_ASK_NEAR_M with room for another farmer; else a place among the
 * builders of the nearest building going up or upgrade under way within it;
 * else Gather, as the Gather button sends it, which always finds something.
 * Places taken by any worker's orders, or by one ahead in the list, count.
 */
function planJobs(state: SimState, player: number, units: readonly number[]): Job[] {
  const e = state.entities;
  const { jobs, works } = claims(state, player);
  const near = WORK_ASK_NEAR_M * WU_PER_METRE;
  const farms = state.buildings.list.filter((b) => isFarmOf(b, player));
  const sites = state.buildings.list.filter((b) => b.owner === player && isSite(b));
  const nearest = (list: Building[], room: (b: Building) => boolean, x: number, z: number): { b: Building; d: number } | undefined => {
    let best: { b: Building; d: number } | undefined;
    for (const b of list) {
      if (!room(b)) continue;
      const d = fromBuilding(b, x, z);
      if (d > near || (best && (d > best.d || (d === best.d && b.id > best.b.id)))) continue;
      best = { b, d };
    }
    return best;
  };
  return units.map((i): Job => {
    const x = e.x[i]!;
    const z = e.z[i]!;
    const farm = nearest(farms, (b) => (jobs.get(b.id) ?? 0) < levelSpec(b.kind, b.level).workers, x, z);
    if (farm) {
      jobs.set(farm.b.id, (jobs.get(farm.b.id) ?? 0) + 1);
      return { k: 'farm', b: farm.b, d: farm.d };
    }
    const site = nearest(sites, (b) => (works.get(b.id) ?? 0) < builderLimit(b.kind), x, z);
    if (site) {
      works.set(site.b.id, (works.get(site.b.id) ?? 0) + 1);
      return { k: 'build', b: site.b, d: site.d };
    }
    return { k: 'gather' };
  });
}

/** "farm", "help build the forge", "help with the upgrade to Longhall", "gather". */
function jobVerb(j: Job): string {
  if (j.k === 'farm') return 'farm';
  if (j.k === 'gather') return 'gather';
  return j.b.complete ? `help with the upgrade to ${siteName(j.b)}` : `help build the ${siteName(j.b)}`;
}

function sameJob(a: Job, c: Job): boolean {
  return a.k === c.k && (a.k === 'gather' || (c.k !== 'gather' && a.b.id === c.b.id));
}

/** The bubble: "I've nothing to do. Shall I farm?", or for several "Three of us have nothing to do. Shall we gather?" ("get to work" when they would do different things). */
function idleText(plan: readonly Job[]): string {
  const one = plan[0]!;
  if (plan.length === 1) return `I've nothing to do. Shall I ${jobVerb(one)}?`;
  const all = plan.every((j) => sameJob(j, one));
  return `${countWord(plan.length)} of us have nothing to do. Shall we ${all ? jobVerb(one) : 'get to work'}?`;
}

/** Yes's tooltip: what each of these units would do. */
function idleYes(state: SimState, units: readonly number[], plan: readonly Job[]): string {
  const tail = ' Takes nothing from the stock.';
  if (plan.length === 1) {
    const j = plan[0]!;
    if (j.k === 'gather') return `It gathers what the side needs most, as the Gather button sends it.${tail}`;
    const where = j.k === 'farm' ? `It farms at the farm ${metres(j.d)} m away` : j.b.complete ? `It helps with the upgrade to ${siteName(j.b)} ${metres(j.d)} m away` : `It helps build the ${siteName(j.b)} ${metres(j.d)} m away`;
    return `${where}${carrying(state, units[0]!) ? ', handing in its load on the way' : ''}.${tail}`;
  }
  // Grouped by what they do, in the order farm, build, gather.
  const parts: string[] = [];
  const seen: Job[] = [];
  for (const k of ['farm', 'build', 'gather'] as const) {
    for (const j of plan) {
      if (j.k !== k || seen.some((s) => sameJob(s, j))) continue;
      seen.push(j);
      const n = plan.filter((x) => sameJob(x, j)).length;
      const s = n === 1;
      if (j.k === 'farm') parts.push(`${n} ${s ? 'farms' : 'farm'} at the farm ${metres(j.d)} m away`);
      else if (j.k === 'build') parts.push(`${n} ${s ? 'helps' : 'help'} ${j.b.complete ? `with the upgrade to ${siteName(j.b)}` : `build the ${siteName(j.b)}`}`);
      else parts.push(`${n} ${s ? 'gathers' : 'gather'} what the side needs most, as the Gather button sends ${s ? 'it' : 'them'}`);
    }
  }
  if (parts.length === 1 && plan[0]!.k === 'gather') return `All ${plan.length} gather what the side needs most, as the Gather button sends them.${tail}`;
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  const loads = plan.some((j, k) => j.k !== 'gather' && carrying(state, units[k]!));
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}.${loads ? ' Those farming or building hand in their loads on the way.' : ''}${tail}`;
}

/** The units still idle among these entity ids, by index. */
function stillIdle(state: SimState, player: number, ids: readonly number[]): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (const id of ids) {
    const i = e.indexOf(id);
    if (i >= 0 && idleNow(state, i, player) && !out.includes(i)) out.push(i);
  }
  return out;
}

function askIdle(state: SimState, book: WorkBook, i: number, w: Wait): void {
  const e = state.entities;
  const player = e.owner[i]!;
  // The idle workers near it that have waited as long and not asked: it speaks for them too.
  const group = [i];
  const waits = [w];
  const r = SPEAK_FOR_M * WU_PER_METRE;
  for (const j of state.grid.nearOthers(e.x[i]!, e.z[i]!, r)) {
    if (j === i || length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!) > r || !idleNow(state, j, player) || isAsking(state, e.id[j]!, false) || sentFor(state, book, e.id[j]!)) continue;
    const v = book.idle.get(e.id[j]!);
    if (!v || v.asked || state.step - v.since <= WORKER_IDLE_ASK_STEPS) continue;
    group.push(j);
    waits.push(v);
  }
  for (const v of waits) v.asked = true;
  const ids = group.map((j) => e.id[j]!);
  const plan = planJobs(state, player, group);
  const text = idleText(plan);
  const n = group.length;
  let yes = idleYes(state, group, plan);
  askOwn(state, {
    player,
    who: ids[0]!,
    building: false,
    q: WorkAsk.Idle,
    units: ids,
    text,
    yes,
    no: `${n === 1 ? 'It stays' : 'They stay'} idle. Asked again the next day if still idle, or once ${n === 1 ? 'it has' : 'they have'} stood idle ${spanText(WORKER_IDLE_ASK_STEPS)} after ${n === 1 ? 'its' : 'their'} next work.`,
    // Withdrawn once any of them is given an order or busy (as the heal question is), and, checked once a second, once
    // what they would do no longer matches the bubble (the farm filled up): asked afresh then.
    holds: () => {
      const busy = ids.some((id) => {
        const j = e.indexOf(id);
        return j >= 0 && e.hp[j]! > 0 && !idleNow(state, j, player);
      });
      if (busy) return false;
      return state.step % STEPS_PER_SECOND !== 0 || idleText(planJobs(state, player, stillIdle(state, player, ids))) === text;
    },
    unask: () => {
      for (const id of ids) {
        const v = book.idle.get(id);
        if (v) v.asked = false;
      }
    },
    recount: () => {
      if (state.step % STEPS_PER_SECOND !== 0) return yes;
      const units = stillIdle(state, player, ids);
      if (units.length === 0) return null;
      yes = idleYes(state, units, planJobs(state, player, units));
      return yes;
    },
  });
}

// ----- every step -----

/**
 * Every step, after the other questions: once a second each player's farms
 * and sites may ask, and each worker, at its own moment, may ask. At dusk
 * and at night nothing asks and every wait starts again.
 */
export function updateWorkAsks(state: SimState): void {
  const book = bookOf(state);
  if (isDark(state.step, state.blood)) {
    book.farms.clear();
    book.sites.clear();
    book.idle.clear();
    book.sending.clear();
    return;
  }
  const e = state.entities;
  if (state.step % STEPS_PER_SECOND === 0) {
    const farms = new Set<number>();
    const sites = new Set<number>();
    for (let p = 0; p < state.players.length; p++) {
      if (state.players[p]!.out) continue;
      const { jobs, works } = claims(state, p);
      for (const b of state.buildings.list) {
        if (b.owner !== p) continue;
        if (isFarmOf(b, p) && (jobs.get(b.id) ?? 0) === 0) {
          farms.add(b.id);
          const w = waited(state, book.farms, b.id, FARM_EMPTY_ASK_STEPS);
          if (!w || w.asked || !canAsk(state, p) || isAsking(state, b.id, true)) continue;
          // The worker it would send already asking (its own idle question offers to farm here): it waits its turn.
          const worker = nearestFree(state, p, b);
          if (worker && !isAsking(state, e.id[worker.i]!, false)) askFarm(state, book, b, w, worker);
        } else if (isSite(b) && (works.get(b.id) ?? 0) === 0) {
          sites.add(b.id);
          const w = waited(state, book.sites, b.id, SITE_UNWORKED_ASK_STEPS);
          if (!w || w.asked || !canAsk(state, p) || isAsking(state, b.id, true)) continue;
          const worker = nearestFree(state, p, b);
          if (worker && !isAsking(state, e.id[worker.i]!, false)) askSite(state, book, b, w, worker, works);
        }
      }
    }
    // A farm with a farmer, a site someone works on, or one gone: its wait ends.
    for (const id of [...book.farms.keys()]) if (!farms.has(id)) book.farms.delete(id);
    for (const id of [...book.sites.keys()]) if (!sites.has(id)) book.sites.delete(id);
  }
  for (let i = 0; i < e.count; i++) {
    if ((state.step + e.id[i]!) % STEPS_PER_SECOND !== 0 || e.kind[i] !== UnitKind.Worker) continue;
    const player = e.owner[i]!;
    const id = e.id[i]!;
    if (player >= state.players.length || state.players[player]!.out || !idleNow(state, i, player)) {
      book.idle.delete(id);
      continue;
    }
    const w = waited(state, book.idle, id, WORKER_IDLE_ASK_STEPS);
    // A worker a farm or site is asking to send waits for that answer first.
    if (!w || w.asked || !canAsk(state, player) || isAsking(state, id, false) || sentFor(state, book, id)) continue;
    askIdle(state, book, i, w);
  }
  // Forget the fallen now and then.
  if (book.idle.size > 1024) for (const id of [...book.idle.keys()]) if (e.indexOf(id) < 0) book.idle.delete(id);
}

// ----- the answer -----

/** Yes (AnswerOrder): who goes where is worked out afresh from the state, so every machine sends the same workers. */
function answerWork(state: SimState, o: AnswerOrder): void {
  if (o.yes !== 1) return;
  const player = o.player;
  switch (o.q) {
    case WorkAsk.Farm: {
      const b = state.buildings.get(o.who);
      if (!b || !isFarmOf(b, player) || (claims(state, player).jobs.get(b.id) ?? 0) > 0) return;
      const w = nearestFree(state, player, b);
      if (!w) {
        sayBuilding(state, b, 'No worker is free nearby to farm here.', true);
        return;
      }
      // Assign, as a right click on the farm does.
      sendTo(state, w.i, [{ t: 'job', b: b.id }]);
      return;
    }
    case WorkAsk.Site: {
      const b = state.buildings.get(o.who);
      if (!b || b.owner !== player || !isSite(b)) return;
      const { works } = claims(state, player);
      if ((works.get(b.id) ?? 0) > 0) return;
      const w = nearestFree(state, player, b);
      if (!w) {
        sayBuilding(state, b, 'No worker is free nearby to build here.', true);
        return;
      }
      // Build, as a right click on a site does: this one, then the others near it no one is on, the nearest first.
      sendTo(state, w.i, [b, ...sitesBy(state, b, works)].map((s) => ({ t: 'work', b: s.id })));
      return;
    }
    case WorkAsk.Idle: {
      const units = stillIdle(state, player, o.units);
      const plan = planJobs(state, player, units);
      units.forEach((i, k) => {
        const j = plan[k]!;
        if (j.k === 'farm') sendTo(state, i, [{ t: 'job', b: j.b.id }]);
        else if (j.k === 'build') sendTo(state, i, [{ t: 'work', b: j.b.id }]);
        else giveOrder(state, i, startForage(state, i), false);
      });
      return;
    }
  }
}

answerKinds(Object.values(WorkAsk), answerWork);
