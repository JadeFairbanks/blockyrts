// Work out in the field that milestone 4 adds (Semi-automation: hunting, as
// Jade's play-test notes redid it; Animals; Food and medicine; Table 12
// carrying; Mineshafts and prospecting): hunting with N, taming, eating at a building, hitching a working animal to
// a cart and prospecting with T (Patch 2 cut hauling from a mineshaft: miners
// carry their own bags out, behaviour.ts runMiner). Each runs like the
// other orders in behaviour.ts: a small state machine on the unit's `act`.

import { buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { sideSees } from '../combat/fight.ts';
import { chatter } from '../peoples/speech.ts';
import { PROSPECT_HAMMER_STEPS, PROSPECT_STEPS, prospectText, ratingAt } from '../buildings/mining.ts';
import type { Building } from '../buildings/store.ts';
import { clockAt, isDark, Period } from '../clock.ts';
import { Res } from '../economy/resources.ts';
import { PROSPECT_TOOL_TIER } from './kits.ts';
import { EAT_STEPS, eatAt, eatNeed, itemQuarters, QUARTERS, servesFood, takeFood } from '../economy/food.ts';
import { RESOURCES } from '../economy/resources.ts';
import { atan2Angle, floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { OrderKind, UnitKind, WILD, type SimState } from '../state.ts';
import { isGame, Nature, speciesSpec } from '../animals/species.ts';
import { newHome } from '../animals/animals.ts';
import { Act, ARRIVED, besideBuilding, columnCentre, FAILED, MOVING, nearestDropoff, nodeResource, resetWalk, walkTo } from './behaviour.ts';
import { exploreTarget, fromHome, HOME_SLACK_M, homeOf, homeBaseNear, wanderTarget, type Home } from './forage.ts';
import { addToBag, bagEmpty, bagRoom, bagTenthsLb, LOOT_BAG_TENTHS_LB, LOOT_CLAIM_M, preyName } from './loot.ts';
import { CHUNK_SHIFT, chunkKey } from '../world/chunk.ts';
import { propInfo } from '../world/props.ts';
import { FOG_TILE_COLUMNS, type PropView } from '../world/world.ts';
import { meatOf } from '../economy/food-kinds.ts';
import type { UnitOrder } from './unit-orders.ts';
import { tinker } from './tinker.ts';

const CONTINUE = false;
const DONE = true;
const M = WU_PER_METRE;

/** Without a main base to come home to, a hunt reaches 40 m from the hunter (Table 1: 40 m Hunt). */
export const HUNT_LEASH_WU = 40 * M;
/** A hauler keeps within 4 m of its hunter (s). */
const HAULER_FOLLOW_WU = 4 * M;
/**
 * A hunter (or its hauler) takes its bag home once it is this full, then goes
 * back out; also once it cannot take the meat of the next game it spots
 * (Jade's GP-31: "wait till their inventory is full to return, or so full
 * that they wouldn't be able to fit their next prey"; it was 50 before).
 */
export const HUNT_HOME_PCT = 100;
/** A hunter picks a berry bush with berries on it within this of it, before going after game (Jade's GP-31; s). */
const BERRY_PICK_M = 20;
/** The berries a hunter picks (GP-31, GP-32): the bushes' own goods, not other wild food. */
const BERRIES: readonly number[] = [Res.BlackBerries, Res.Raspberries, Res.Blueberries];
/** A worker tames standing within 3 m of the animal (s). */
const TAME_REACH_WU = 3 * M;

/** The hunt order's k: where its quarry was last seen (kx, kz) is known; it is walking out to look at (x, z); it is home for the night; its last search walk failed. */
const Seen = 1;
const Search = 2;
const AtHome = 4;
const Turned = 8;
/** Its quarry is the one the player picked (Jade's Patch 5, CT-1: Hunt's left click): chased whatever the leash or the hour, then the hunt goes on as usual. */
export const HUNT_PICKED = 16;
/** It is picking the berry bush on the column at (kx, kz), with no quarry (Jade's Patch 5, GP-31); (x, z) stay where it set out or is looking. */
const Picking = 32;
/** Kinds of quiet line, for chatter's spacing (forage.ts uses 1, 2, 4 and 5, woods.ts 13 to 15, fight.ts 12; under 16). */
const Talk = { Berries: 3, Spotted: 6, Look: 7, Away: 8, Carry: 9, Dusk: 10, Back: 11, Bait: 0 } as const;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

function alert(state: SimState, player: number, text: string, x?: number, z?: number): void {
  state.events.push(x === undefined || z === undefined ? { player, kind: 'alert', text } : { player, kind: 'alert', text, x, z });
}

/** Whether a unit is an animal anyone may hunt now (wild and alive). */
function isQuarry(state: SimState, t: number): boolean {
  const e = state.entities;
  return t >= 0 && e.kind[t] === UnitKind.Animal && e.owner[t] === WILD && e.hp[t]! > 0;
}

/** Whether a point is within a hunter's reach: from home (forage.ts homeOf, fromHome), or 40 m of where it set out (from) with no main base. */
function inReach(state: SimState, h: Home | undefined, from: { x: number; z: number }, x: number, z: number): boolean {
  return h ? fromHome(state, h.b, x, z) <= h.reach : length2d(x - from.x, z - from.z) <= HUNT_LEASH_WU;
}

/** The quarry another hunter of the same player is after, by id. */
function huntedByOthers(state: SimState, i: number): Set<number> {
  const e = state.entities;
  const out = new Set<number>();
  for (let j = 0; j < e.count; j++) {
    if (j === i || e.owner[j] !== e.owner[i] || e.kind[j] !== UnitKind.Warrior) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'hunt' && o.id !== 0) out.add(o.id);
  }
  return out;
}

/**
 * The game to hunt next (Semi-automation: hunting): hares, deer and wild
 * birds the players' side can see, within the hunter's reach. Never bears or
 * the territorial beasts, and not the game that fights back, wild boar and
 * giant crabs: those only when right-clicked (s), so a lone hunter does not
 * walk into a fight it may lose. A wounded one first, so a hunt finishes
 * what it started; then the nearest, leaving what other hunters are after
 * unless nothing else is in sight.
 */
export function nearestGame(state: SimState, i: number, h: Home | undefined, from: { x: number; z: number }): number {
  const e = state.entities;
  const x = h ? h.x : from.x;
  const z = h ? h.z : from.z;
  const r = h ? h.reach + 12 * M : HUNT_LEASH_WU;
  const taken = huntedByOthers(state, i);
  let best = -1;
  let bestKey = 0;
  let bestD = 0;
  for (const j of state.grid.near(x, z, r)) {
    if (!isQuarry(state, j) || !isGame(e.mob[j]!) || speciesSpec(e.mob[j]!).nature === Nature.FightsBack) continue;
    if (!inReach(state, h, from, e.x[j]!, e.z[j]!) || !sideSees(state, j)) continue;
    // Lower is better: untaken before taken, wounded before whole, then the distance, then the id.
    const key = (taken.has(e.id[j]!) ? 2 : 0) + (e.hp[j]! < e.maxHp[j]! ? 0 : 1);
    const d = length2d(e.x[j]! - e.x[i]!, e.z[j]! - e.z[i]!);
    if (best >= 0 && (key > bestKey || (key === bestKey && (d > bestD || (d === bestD && e.id[j]! > e.id[best]!))))) continue;
    best = j;
    bestKey = key;
    bestD = d;
  }
  return best;
}

/** Loot from a hunter's own kills lying within 40 m of a point that a unit has room for: the nearest. */
function huntLoot(state: SimState, i: number, hunter: number, x: number, z: number): number {
  let best = -1;
  let bestD = 0;
  for (const l of state.loot) {
    if (l.by !== hunter || bagRoom(state, i, l.res) === 0) continue;
    const d = length2d(l.x - x, l.z - z);
    if (d > LOOT_CLAIM_M * M || (best >= 0 && d >= bestD)) continue;
    best = l.id;
    bestD = d;
  }
  return best;
}

/** Puts a loot order in front of the hunt (it carries on once that is done). */
function fetch(state: SimState, i: number, id: number, hand: number): boolean {
  const e = state.entities;
  e.queue[i]!.unshift({ t: 'loot', id, hand, back: 0, x: 0, z: 0 });
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  return CONTINUE;
}

/** Whether a unit's bag is full enough to take home (HUNT_HOME_PCT: full since Patch 5), or has no room for another piece of meat. */
function bagFull(state: SimState, i: number): boolean {
  return bagTenthsLb(state, i) * 100 >= LOOT_BAG_TENTHS_LB * HUNT_HOME_PCT || bagRoom(state, i, meatOf(0)) === 0;
}

/** Whether a unit is out on a hunt (its current order or one queued behind a loot run). */
function hunting(state: SimState, j: number): boolean {
  return state.entities.queue[j]!.some((o) => o.t === 'hunt');
}

/** Whether workers are hauling for this hunter. */
function haulersWith(state: SimState, i: number): boolean {
  const e = state.entities;
  for (let j = 0; j < e.count; j++) {
    if (e.kind[j] !== UnitKind.Worker || e.owner[j] !== e.owner[i]) continue;
    if (e.queue[j]!.some((o) => o.t === 'hunt' && o.id === e.id[i])) return true;
  }
  return false;
}

/** Replaces the hunt order with handing the bag in (when there is anything to hand in), ending the hunt. */
function endHunt(state: SimState, i: number, o: UnitOrder): boolean {
  const e = state.entities;
  const q = e.queue[i]!;
  const k = q.indexOf(o);
  if (bagEmpty(state, i) || !nearestDropoff(state, i, -1)) return DONE;
  q.splice(k < 0 ? 0 : k, 1, { t: 'loot', id: 0, hand: 1, back: 0, x: 0, z: 0 });
  e.act[i] = Act.Start;
  resetWalk(state, i);
  return CONTINUE;
}

/**
 * A worker hauling for a hunter: it follows the hunter, picks up what the
 * hunter kills, and takes it home when its bag is full, coming back out
 * after. At dusk it hands in what it has and the hauling ends.
 */
function runHauler(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  const h = e.indexOf(o.id);
  if (isDark(state.step) || h < 0 || e.hp[h]! <= 0 || !hunting(state, h)) return endHunt(state, i, o);
  if (bagFull(state, i) && nearestDropoff(state, i, -1)) return fetch(state, i, 0, 1);
  const l = huntLoot(state, i, e.id[h]!, e.x[i]!, e.z[i]!);
  if (l >= 0) return fetch(state, i, l, 0);
  if (length2d(e.x[h]! - e.x[i]!, e.z[h]! - e.z[i]!) <= HAULER_FOLLOW_WU) {
    resetWalk(state, i);
    return CONTINUE;
  }
  if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
  if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + STEPS_PER_SECOND;
  if (walkTo(state, i, { ...pointGoal(col(e.x[h]!), col(e.z[h]!)), max: 4 }) !== MOVING) resetWalk(state, i);
  return CONTINUE;
}

/** At dusk a hunter hands in what it has and waits by the nearest main base for the day (Jade: hunters return at dusk). */
function huntHome(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  if (!o.auto) return endHunt(state, i, o);
  if ((o.k & AtHome) === 0) {
    o.k = AtHome;
    o.id = 0;
    resetWalk(state, i);
    chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'Getting dark. Heading home.');
  }
  if (!bagEmpty(state, i) && nearestDropoff(state, i, -1) && state.step >= e.waitUntil[i]!) {
    e.waitUntil[i] = state.step + 10 * STEPS_PER_SECOND;
    return fetch(state, i, 0, 1);
  }
  const b = homeBaseNear(state, e.owner[i]!, e.x[i]!, e.z[i]!);
  if (!b) return CONTINUE;
  const g = besideBuilding(b);
  if (walkTo(state, i, { ...g, max: Math.max(g.max, HOME_COLUMNS) }) !== MOVING) resetWalk(state, i);
  return CONTINUE;
}

/** How many columns out from a main base's walls a hunter home for the night stops: within HOME_SLACK_M even off a corner (the goal is square, the slack round). */
const HOME_COLUMNS = floorDiv(HOME_SLACK_M * M * 1000, 1415 * WU_PER_COLUMN);

/**
 * N Hunt (Jade's play-test notes): a hunter goes out after game within its
 * reach, picks up what it kills, takes the meat home when its bag is full
 * or cannot take the next kill's meat (Jade's GP-31), and goes back out,
 * again and again, picking berry bushes close by on the way (GP-31); with
 * nothing in sight it looks
 * farther out, round the edge of the explored land. At dusk it comes home,
 * and at daybreak it goes out again. A right-clicked animal is hunted alone,
 * and the hunt ends with it. Workers in the selection haul.
 */
export function runHunt(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (e.kind[i] === UnitKind.Worker) return runHauler(state, i, o);
  if (o.auto && (o.k & HUNT_PICKED) === 0 && isDark(state.step)) return huntHome(state, i, o);
  if (o.k & AtHome) {
    // Out again at daybreak; the dawn is still the monsters'.
    if (clockAt(state.step).period !== Period.Day) return CONTINUE;
    o.k = 0;
    chatter(state, i, Talk.Back, 60 * STEPS_PER_SECOND, 'Back to the hunt.');
  }
  const h = homeOf(state, i);
  // The fight layer chases a quarry it can see; here the quarry is out of its sight, dead, lost or not chosen yet.
  const t = o.id ? e.indexOf(o.id) : -1;
  if (o.id !== 0 && isQuarry(state, t)) {
    if (o.auto && (o.k & HUNT_PICKED) === 0 && !inReach(state, h, o, e.x[t]!, e.z[t]!)) {
      // It ran past where the hunter can get home from by nightfall: let it go.
      o.id = 0;
      o.k &= ~Seen;
      chatter(state, i, Talk.Away, 20 * STEPS_PER_SECOND, 'It got away.');
    } else {
      if (walkTo(state, i, { ...pointGoal(col(e.x[t]!), col(e.z[t]!)), max: 2 }) !== MOVING) resetWalk(state, i);
      return CONTINUE;
    }
  }
  // Just killed: it lies dying until the step's deaths settle and drop its loot.
  if (o.id !== 0 && t >= 0 && e.kind[t] === UnitKind.Animal && e.hp[t]! <= 0) return CONTINUE;
  if (o.id !== 0) {
    o.id = 0;
    // What fell out of its reach (a ranger shoots from afar), unless workers came along to haul it.
    const l = haulersWith(state, i) ? -1 : huntLoot(state, i, e.id[i]!, (o.k & Seen) !== 0 ? o.kx : e.x[i]!, (o.k & Seen) !== 0 ? o.kz : e.z[i]!);
    o.k &= ~(Seen | HUNT_PICKED);
    if (l >= 0) return fetch(state, i, l, 0);
  }
  if (!o.auto) return DONE;
  if (bagFull(state, i) && nearestDropoff(state, i, -1) && state.step >= e.waitUntil[i]!) {
    e.waitUntil[i] = state.step + 5 * STEPS_PER_SECOND;
    chatter(state, i, Talk.Carry, 30 * STEPS_PER_SECOND, 'Taking the meat home.');
    return fetch(state, i, 0, 1);
  }
  // Something of its own kills still lying about that it could not carry before.
  const left = haulersWith(state, i) ? -1 : huntLoot(state, i, e.id[i]!, e.x[i]!, e.z[i]!);
  if (left >= 0) return fetch(state, i, left, 0);
  if (o.k & Picking) return pickBerries(state, i, o);
  if (state.step >= e.waitUntil[i]!) {
    e.waitUntil[i] = state.step + STEPS_PER_SECOND;
    // Berries close by first (GP-31: hunters "also pick berries from bushes without removing the bush").
    const bush = berriesNear(state, i, h, o);
    if (bush) {
      o.kx = columnCentre(bush[0]);
      o.kz = columnCentre(bush[1]);
      o.k |= Picking;
      e.act[i] = Act.Walk;
      e.timer[i] = 0;
      resetWalk(state, i);
      chatter(state, i, Talk.Berries, 60 * STEPS_PER_SECOND, 'Berries! Picking them.');
      return CONTINUE;
    }
    const q = nearestGame(state, i, h, o);
    // Its bag cannot take this one's meat: home with what it has first (GP-31).
    if (q >= 0 && !haulersWith(state, i) && !bagEmpty(state, i) && bagRoom(state, i, meatOf(e.mob[q]!)) < speciesSpec(e.mob[q]!).meat && nearestDropoff(state, i, -1)) {
      e.waitUntil[i] = state.step + 5 * STEPS_PER_SECOND;
      chatter(state, i, Talk.Carry, 30 * STEPS_PER_SECOND, 'Taking the meat home.');
      return fetch(state, i, 0, 1);
    }
    if (q >= 0) {
      o.id = e.id[q]!;
      o.k &= ~Search;
      resetWalk(state, i);
      chatter(state, i, Talk.Spotted, 20 * STEPS_PER_SECOND, `Spotted ${preyName(e.mob[q]!)}.`);
      return CONTINUE;
    }
  }
  if (!h) return CONTINUE;
  // Nothing in sight: out to look round the edge of the explored land within reach, then anywhere within it.
  if ((o.k & Search) === 0) {
    const from = (atan2Angle(e.z[i]! - h.z, e.x[i]! - h.x) + ((o.k & Turned) !== 0 ? 4096 : 0)) & 0xffff;
    const p = exploreTarget(state, h, from) ?? wanderTarget(state, h, i);
    o.x = p.x;
    o.z = p.z;
    o.k |= Search;
    resetWalk(state, i);
    chatter(state, i, Talk.Look, 60 * STEPS_PER_SECOND, 'No game in sight. Looking farther out.');
  }
  const r = walkTo(state, i, { ...pointGoal(col(o.x), col(o.z)), max: 3 });
  if (r !== MOVING) {
    o.k = (o.k & ~(Search | Turned)) | (r === FAILED ? Turned : 0);
    resetWalk(state, i);
  }
  return CONTINUE;
}

/** The ready berry bush on a column (a forage bush holding berries), with its chunk, or null. */
function berryBushAt(state: SimState, gx: number, gz: number): { cx: number; cz: number; v: PropView } | null {
  const cx = gx >> CHUNK_SHIFT;
  const cz = gz >> CHUNK_SHIFT;
  const lx = gx - (cx << CHUNK_SHIFT);
  const lz = gz - (cz << CHUNK_SHIFT);
  for (const v of state.world.props(cx, cz, state.step)) {
    if (v.lx === lx && v.lz === lz && v.amount > 0 && BERRIES.includes(nodeResource(v.kind, v.variant))) return { cx, cz, v };
  }
  return null;
}

/** The nearest berry bush with berries within BERRY_PICK_M of a hunter, on explored land within its reach, with room in its bag for them: its column, or null. */
function berriesNear(state: SimState, i: number, h: Home | undefined, o: Extract<UnitOrder, { t: 'hunt' }>): [number, number] | null {
  const e = state.entities;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const rc = floorDiv(BERRY_PICK_M * M, WU_PER_COLUMN) + 1;
  const gx = col(x);
  const gz = col(z);
  let best: [number, number] | null = null;
  let bestD = (BERRY_PICK_M * M) ** 2;
  for (let cz = (gz - rc) >> CHUNK_SHIFT; cz <= (gz + rc) >> CHUNK_SHIFT; cz++) {
    for (let cx = (gx - rc) >> CHUNK_SHIFT; cx <= (gx + rc) >> CHUNK_SHIFT; cx++) {
      if (!state.world.explored.has(chunkKey(cx, cz))) continue;
      for (const v of state.world.props(cx, cz, state.step)) {
        const res = v.amount > 0 ? nodeResource(v.kind, v.variant) : -1;
        if (!BERRIES.includes(res) || bagRoom(state, i, res) === 0) continue;
        const px = (cx << CHUNK_SHIFT) + v.lx;
        const pz = (cz << CHUNK_SHIFT) + v.lz;
        const d = dist2(columnCentre(px), columnCentre(pz), x, z);
        if (d > bestD || !state.world.isExplored(floorDiv(px, FOG_TILE_COLUMNS), floorDiv(pz, FOG_TILE_COLUMNS))) continue;
        if (!inReach(state, h, o, columnCentre(px), columnCentre(pz))) continue;
        best = [px, pz];
        bestD = d;
      }
    }
  }
  return best;
}

/** To the berry bush it chose, then one load of its berries into the bag, the bush left standing to grow them back (Jade's GP-31: "one batch of berries per bush"). */
function pickBerries(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  const gx = col(o.kx);
  const gz = col(o.kz);
  const bush = berryBushAt(state, gx, gz);
  const res = bush ? nodeResource(bush.v.kind, bush.v.variant) : -1;
  if (!bush || bagRoom(state, i, res) === 0) return stopPicking(state, i, o);
  if (e.act[i] !== Act.Work) {
    const r = walkTo(state, i, { ...pointGoal(gx, gz), max: 2 });
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return stopPicking(state, i, o);
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  if (o.kx !== e.x[i] || o.kz !== e.z[i]) e.heading[i] = headingTowards(o.kx - e.x[i]!, o.kz - e.z[i]!);
  e.timer[i] = e.timer[i]! + 1;
  const info = propInfo(bush.v.kind);
  if (e.timer[i]! < info.loadSteps) return CONTINUE;
  const taken = state.world.harvest(bush.cx, bush.cz, bush.v.index, Math.min(info.perLoad, bagRoom(state, i, res)), state.step);
  if (taken > 0) addToBag(state, i, res, taken);
  return stopPicking(state, i, o);
}

function stopPicking(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  o.k &= ~Picking;
  e.act[i] = Act.Walk;
  e.timer[i] = 0;
  resetWalk(state, i);
  return CONTINUE;
}

/** Whether a species can be tamed by players, and where (Animals: bears never). */
export function tameable(species: number): boolean {
  return speciesSpec(species).tameAt.length > 0;
}

/** How fast a worker feeds an animal he tames (Jade, GP-36): 2 food a second. */
export const TAME_FOOD_PER_SECOND = 2;

/** Steps a taming takes: the animal's food at TAME_FOOD_PER_SECOND (a chicken 1.5 s, cattle 10 s). */
export function tameSteps(species: number): number {
  return Math.max(1, floorDiv(speciesSpec(species).tameFood * STEPS_PER_SECOND, TAME_FOOD_PER_SECOND));
}

/** The quarters of food a taming has fed by step k of `steps` (rounded down, so it is all paid on the last). */
function fedBy(food: number, k: number, steps: number): number {
  return floorDiv(food * QUARTERS * k, steps);
}

/** The quarters of an animal's foods a player has, kept back from meals or not (bait is for animals, as Barn feed is). */
function baitQuarters(state: SimState, player: number, foods: readonly Res[]): number {
  const p = state.players[player]!;
  let n = 0;
  for (const f of foods) n += p.pool[f]! * itemQuarters(f) + p.open[f]!;
  return n;
}

/** Why a worker cannot tame an animal now, or ''. */
export function tameProblem(state: SimState, player: number, t: number): string {
  const e = state.entities;
  if (!isQuarry(state, t)) return 'Only wild animals can be tamed.';
  const s = speciesSpec(e.mob[t]!);
  if (!tameable(s.id)) return `A ${s.name.toLowerCase()} can never be tamed.`;
  if (!newHome(state, player, s.id)) return `Needs a ${s.tameAt.map((k) => buildingName(k, 1, 0).toLowerCase()).join(' or a ')} with room first.`;
  // What is left to feed it (a taming already begun has fed some).
  const fed = e.tinker[t] === tameSteps(s.id) ? fedBy(s.tameFood, e.timer[t]!, e.tinker[t]!) : 0;
  if (baitQuarters(state, player, s.tameFoods) < s.tameFood * QUARTERS - fed) return `Needs ${s.tameFood} food of plant food (${s.tameFoods.map((r) => RESOURCES[r]!.name.toLowerCase()).join(', ')}) to tame it.`;
  return '';
}

/**
 * Taming (Jade's GP-35 and GP-36): the worker walks up to the wild animal
 * and feeds it from the stock, not from his own bag, at 2 food a second, a
 * bar over its head filling as he does, while it stands still for him. Once
 * its whole cost is fed it is the player's and follows him (animals.ts
 * followToBarn); he walks it to the nearest Barn of his with room, and the
 * order ends once it is in. A taming left half done is lost with what it ate.
 */
export function runTame(state: SimState, i: number, o: Extract<UnitOrder, { t: 'tame' }>): boolean {
  const e = state.entities;
  const t = e.indexOf(o.id);
  const player = e.owner[i]!;
  // Tamed: lead it home.
  if (t >= 0 && e.owner[t] === player && e.kind[t] === UnitKind.Animal) return leadHome(state, i, t);
  const why = tameProblem(state, player, t);
  if (why) {
    alert(state, player, why, e.x[i]!, e.z[i]!);
    return DONE;
  }
  const s = speciesSpec(e.mob[t]!);
  if (e.act[i] === Act.Start) {
    e.act[i] = Act.Walk;
    e.timer[i] = 0;
  }
  if (length2d(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!) > TAME_REACH_WU) {
    if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
    if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + STEPS_PER_SECOND;
    if (walkTo(state, i, { ...pointGoal(col(e.x[t]!), col(e.z[t]!)), max: 2 }) === FAILED) {
      alert(state, player, 'A worker cannot reach that animal.', e.x[i]!, e.z[i]!);
      return DONE;
    }
    return CONTINUE;
  }
  // Standing by it with the food: it stands still and eats, its bar (its tinker column) filling.
  e.act[i] = Act.Work;
  e.order[i] = OrderKind.Idle;
  e.heading[i] = headingTowards(e.x[t]! - e.x[i]!, e.z[t]! - e.z[i]!);
  e.waitUntil[t] = state.step + 2;
  const steps = tameSteps(s.id);
  if (e.tinker[t] !== steps) {
    e.tinker[t] = steps;
    e.timer[t] = 0;
  }
  const k = e.timer[t]!;
  const due = fedBy(s.tameFood, k + 1, steps) - fedBy(s.tameFood, k, steps);
  if (due > 0 && takeFood(state.players[player]!, due, { only: s.tameFoods, kept: true }) === null) {
    chatter(state, i, Talk.Bait, 20 * STEPS_PER_SECOND, `Out of plant food to tame the ${s.name.toLowerCase()}.`);
    return CONTINUE;
  }
  e.timer[t] = k + 1;
  if (e.timer[t]! < steps) return CONTINUE;
  // Tamed: it is the player's, and follows the worker to a Barn.
  e.tinker[t] = 0;
  e.timer[t] = 0;
  e.owner[t] = player;
  e.home[t] = 0;
  e.partner[t] = e.id[i]!;
  e.target[t] = 0;
  e.queue[t] = [];
  e.act[i] = Act.Walk;
  resetWalk(state, i);
  state.events.push({ player, kind: 'info', text: `A wild ${s.name.toLowerCase()} has been tamed. It follows the worker to a Barn.`, x: e.x[t]!, z: e.z[t]! });
  return CONTINUE;
}

/** After taming: the worker walks to the nearest Barn of his with room for it, until it has gone in (or no longer follows him). */
function leadHome(state: SimState, i: number, t: number): boolean {
  const e = state.entities;
  if (e.home[t] !== 0 || e.partner[t] !== e.id[i] || e.hp[t]! <= 0) return DONE;
  const b = newHome(state, e.owner[i]!, e.mob[t]!, e.x[i]!, e.z[i]!);
  if (!b) return DONE;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === FAILED) return DONE;
  if (r === ARRIVED) e.order[i] = OrderKind.Idle;
  return CONTINUE;
}

/** The nearest building of the player's where a unit can eat. */
function nearestTable(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || !b.complete || !servesFood(b.kind)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

export function runEat(state: SimState, i: number, o: Extract<UnitOrder, { t: 'eat' }>): boolean {
  const e = state.entities;
  // A unit at full health does not eat (Jade's Patch 5, GP-27), one healed on its way there included.
  if (e.act[i] !== Act.Work && eatNeed(e.hp[i]!, e.maxHp[i]!) === 0) return DONE;
  let b = o.b ? state.buildings.get(o.b) : undefined;
  if (!b || b.owner !== e.owner[i] || !b.complete || !servesFood(b.kind)) b = nearestTable(state, i);
  if (!b) {
    alert(state, e.owner[i]!, 'There is nowhere to eat. Units eat at a main base or a storehouse.', e.x[i]!, e.z[i]!);
    return DONE;
  }
  o.b = b.id;
  if (e.act[i] !== Act.Work) {
    if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
    const r = walkTo(state, i, besideBuilding(b));
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    const why = eatAt(state, i);
    if (why) {
      alert(state, e.owner[i]!, why, e.x[i]!, e.z[i]!);
      return DONE;
    }
    // Then it sits by the building for the meal, tinkering with the bar over its head, while it heals (Jade's Patch 2).
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  return tinker(state, i, EAT_STEPS) ? DONE : CONTINUE;
}

/** Lets go of a worker's working animal (it goes back to its home). */
export function unhitch(state: SimState, i: number): void {
  const e = state.entities;
  if (!e.partner[i]) return;
  const a = e.indexOf(e.partner[i]!);
  if (a >= 0 && e.partner[a] === e.id[i]) e.partner[a] = 0;
  e.partner[i] = 0;
}

/** Why a worker cannot take an animal, or ''. */
export function hitchProblem(state: SimState, i: number, a: number): string {
  const e = state.entities;
  if (a < 0 || e.kind[a] !== UnitKind.Animal || e.owner[a] !== e.owner[i] || e.hp[a]! <= 0) return 'Only your own tamed horses and oxen work with a worker.';
  const s = speciesSpec(e.mob[a]!);
  if (s.cartTenthsLb === 0 && s.packTenthsLb === 0) return `A ${s.name.toLowerCase()} cannot pull a cart or carry a pack.`;
  if (e.born[a]! > state.step) return 'It is too young to work.';
  return '';
}

export function runHitch(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hitch' }>): boolean {
  const e = state.entities;
  const a = e.indexOf(o.id);
  const why = hitchProblem(state, i, a);
  if (why) {
    alert(state, e.owner[i]!, why, e.x[i]!, e.z[i]!);
    return DONE;
  }
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (length2d(e.x[a]! - e.x[i]!, e.z[a]! - e.z[i]!) > TAME_REACH_WU) {
    if (e.inside[a] !== 0) {
      // In its stall: the worker fetches it from the door.
      const b = state.buildings.get(e.inside[a]!);
      if (b && walkTo(state, i, besideBuilding(b)) === MOVING) return CONTINUE;
    } else {
      if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
      if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + STEPS_PER_SECOND;
      const r = walkTo(state, i, { ...pointGoal(col(e.x[a]!), col(e.z[a]!)), max: 2 });
      if (r === FAILED) return DONE;
      if (r === MOVING) return CONTINUE;
    }
  }
  unhitch(state, i);
  if (e.partner[a]) {
    const w = e.indexOf(e.partner[a]!);
    if (w >= 0) e.partner[w] = 0;
  }
  e.partner[i] = e.id[a]!;
  e.partner[a] = e.id[i]!;
  const s = speciesSpec(e.mob[a]!);
  const how = e.kit[i] === Res.OxCart ? 'pulls the cart' : 'carries a pack';
  state.events.push({ player: e.owner[i]!, kind: 'info', text: `The ${s.name.toLowerCase()} ${how} for the worker.`, x: e.x[i]!, z: e.z[i]! });
  return DONE;
}

export function runProspect(state: SimState, i: number, o: Extract<UnitOrder, { t: 'prospect' }>): boolean {
  const e = state.entities;
  if (e.act[i] === Act.Start) {
    e.act[i] = Act.Walk;
    e.timer[i] = 0;
  }
  if (e.act[i] === Act.Walk) {
    const r = walkTo(state, i, { ...pointGoal(o.x, o.z), max: 2 });
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      alert(state, e.owner[i]!, 'A worker cannot reach that spot to prospect.', e.x[i]!, e.z[i]!);
      return DONE;
    }
    e.act[i] = Act.Work;
  }
  e.order[i] = OrderKind.Mine;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < (e.wTier[i]! >= PROSPECT_TOOL_TIER ? PROSPECT_HAMMER_STEPS : PROSPECT_STEPS)) return CONTINUE;
  const rating = ratingAt(state, o.x, o.z);
  state.events.push({ player: e.owner[i]!, kind: 'prospect', text: prospectText(rating), x: o.x * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), z: o.z * WU_PER_COLUMN + (WU_PER_COLUMN >> 1), rating });
  return DONE;
}
