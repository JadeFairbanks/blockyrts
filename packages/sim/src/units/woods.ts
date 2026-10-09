// The woodsman at work (Patch 5, Jade's WD-1, WD-5, FR-1 and GP-31):
// "Forage and fish buttons behave similar to the warriors hunt (can be
// targeted onto a food/fish or set to auto), but fishing is for fishing and
// forage is for wild edibles". Both can be on at once, "allowing the
// woodsman to capitalize on whatever he may come across in his search".
//
// He goes to the nearest fish stretch with fish to spare, or wild food
// ready to pick, within his reach (as far as he can walk home from in dusk's
// 40 s, as hunters do), and fishes or picks it into his bag. He takes the
// bag home "till their inventory is full ... or so full that they wouldn't be
// able to fit their next" catch, and goes back out. With nothing in sight he
// looks farther out round the edge of the explored land. At dusk he hands in
// what he has and waits by the main base until day.
//
// Fishing (FR-1): a stretch's fish breed in pairs (world/props.ts fishAt), so
// he leaves one once half its most is left; one the player picked he fishes
// down to its last pair. Each fish comes up on the line, a 'catch' the screen
// draws, and goes in his bag. Only woodsmen fish.

import { dist2 } from '../buildings/lights.ts';
import { rosesOpen } from '../circles/bright.ts';
import { clockAt, isDark, Period } from '../clock.ts';
import { fishOf } from '../economy/food-kinds.ts';
import { atan2Angle, floorDiv, headingTowards, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE, WU_PER_TERRAIN_UNIT } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { chatter } from '../peoples/speech.ts';
import { OrderKind, standY, type SimState } from '../state.ts';
import { CHUNK_SHIFT, chunkKey, NO_WATER, WATER_PER_UNIT } from '../world/chunk.ts';
import { isFish, PropKind, propInfo, PropShape } from '../world/props.ts';
import { FOG_TILE_COLUMNS, type PropView, type World } from '../world/world.ts';
import { Act, besideBuilding, columnCentre, FAILED, giveOrder, MOVING, nearestDropoff, nodeResource, nodeView, resetWalk, walkTo } from './behaviour.ts';
import { exploreTarget, fromHome, HOME_SLACK_M, homeBaseNear, homeOf, wanderTarget, type Home } from './forage.ts';
import { addToBag, bagEmpty, bagRoom } from './loot.ts';
import { WOODS_HOME, WOODS_PICKED, WOODS_SEARCH, WOODS_TURNED, type UnitOrder } from './unit-orders.ts';
import { isWoodsman } from './woodsman.ts';

type WoodsOrder = Extract<UnitOrder, { t: 'woods' }>;

const CONTINUE = false;
const DONE = true;
const M = WU_PER_METRE;

/**
 * The woodsman's pace (s): a fish every 12 s once his line is in, a pick of
 * wild food every 3 s; with no main base he goes no farther than 40 m from
 * where he set out (as hunters do).
 */
export const WOODS = { fishS: 12, pickS: 3, leashM: 40 };

/**
 * Whether a prop is wild food a woodsman forages (QoL 2: "berries,
 * mushrooms, bog pears, hawthorne fruit, and Moon Roses on Bright Nights"):
 * any prop whose row is marked forage (world/props.ts PropInfo.forage), so
 * each new wild food is one flag on its own row.
 */
export function isForage(kind: number): boolean {
  return propInfo(kind).forage;
}

/** What he is doing at his spot, for the screen (state.ts OrderKind): fishing, or picking (Jade's WD-6) low at a plant (forage_low: mushrooms) or high at a bush or tree (forage_high). */
function workLook(kind: number): number {
  if (isFish(kind)) return OrderKind.Fish;
  return propInfo(kind).shape === PropShape.Plant ? OrderKind.ForageLow : OrderKind.ForageHigh;
}

/** Kinds of quiet line, for chatter's spacing (field.ts uses up to 12). */
const Talk = { Look: 13, Bag: 14, Dusk: 15 } as const;

function col(wu: number): number {
  return floorDiv(wu, WU_PER_COLUMN);
}

/** A new woods order with fishing and foraging on or off, starting where the woodsman stands. */
export function woodsOrder(state: SimState, i: number, fish: number, forage: number): WoodsOrder {
  const e = state.entities;
  return { t: 'woods', fish, forage, cx: 0, cz: 0, i: -1, k: 0, x: e.x[i]!, z: e.z[i]!, ex: 0, ez: 0 };
}

/** The fish a stretch must keep: half its most on his own, its last pair when the player picked it. */
function fishToKeep(view: PropView, picked: boolean): number {
  return picked ? 2 : floorDiv(view.most + 1, 2);
}

/**
 * Whether he is out for the Moon Roses: they open only where a night is
 * bright, from nightfall to daybreak, and "can be picked during a bright
 * night by a unit (worker/woodsman)" (SCA-8; decisions 2.8: one night in
 * three round a Lunar circle with its idol on the altar, and every Lunar
 * circle on a Bright Night), so on any night they open a woodsman who
 * forages goes out for the open ones in his reach, and for nothing else.
 */
function roseHours(state: SimState, o: WoodsOrder): boolean {
  const c = clockAt(state.step);
  return o.forage !== 0 && (c.period === Period.Night || c.period === Period.Dawn) && rosesOpen(state, c.cycle);
}

/** Whether a spot is worth his while now: fish to spare on a stretch he fishes, wild food on a plant he forages; only an open Moon Rose in rose hours. */
function worthIt(o: WoodsOrder, view: PropView | undefined, picked: boolean, roses: boolean): view is PropView {
  if (!view || view.amount <= 0) return false;
  if (roses) return view.kind === PropKind.MoonRoseBush;
  if (isFish(view.kind)) return o.fish !== 0 && view.amount > fishToKeep(view, picked);
  return o.forage !== 0 && isForage(view.kind) && nodeResource(view.kind, view.variant) >= 0;
}

/** How many of a spot's goods one pick takes: a fish, or the plant's load. */
function perPick(view: PropView): number {
  return isFish(view.kind) ? 1 : Math.max(1, Math.min(view.amount, propInfo(view.kind).perLoad));
}

/** What a spot gives: a stretch its fish, a plant its food. */
function spotRes(view: PropView): number {
  return isFish(view.kind) ? fishOf(view.kind) : nodeResource(view.kind, view.variant);
}

/** Woodsmen of a player at work on a spot, other than i. */
function othersOn(state: SimState, i: number, cx: number, cz: number, index: number): number {
  const e = state.entities;
  let n = 0;
  for (let j = 0; j < e.count; j++) {
    if (j === i || e.owner[j] !== e.owner[i] || !isWoodsman(e, j)) continue;
    const o = e.queue[j]![0];
    if (o?.t === 'woods' && o.i === index && o.cx === cx && o.cz === cz) n++;
  }
  return n;
}

/** Whether a point is within his reach: from home, else 40 m of where he set out. */
function inReach(state: SimState, h: Home | undefined, o: WoodsOrder, x: number, z: number): boolean {
  return h ? fromHome(state, h.b, x, z) <= h.reach : length2d(x - o.x, z - o.z) <= WOODS.leashM * M;
}

/**
 * The nearest spot worth his while within reach, on explored land, that no
 * other woodsman of his is working (a fish stretch or a plant takes as many
 * as its gatherers), or null.
 */
function nearestSpot(state: SimState, i: number, h: Home | undefined, o: WoodsOrder): { cx: number; cz: number; i: number } | null {
  const e = state.entities;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const world = state.world;
  const roses = roseHours(state, o);
  const reach = (h ? h.reach + length2d(x - h.x, z - h.z) : WOODS.leashM * M + length2d(x - o.x, z - o.z)) + M;
  const rc = floorDiv(reach, WU_PER_COLUMN) + 1;
  const gx = col(x);
  const gz = col(z);
  let best: { cx: number; cz: number; i: number } | null = null;
  let bestD = 0;
  for (let cz = (gz - rc) >> CHUNK_SHIFT; cz <= (gz + rc) >> CHUNK_SHIFT; cz++) {
    for (let cx = (gx - rc) >> CHUNK_SHIFT; cx <= (gx + rc) >> CHUNK_SHIFT; cx++) {
      if (!world.explored.has(chunkKey(cx, cz))) continue;
      for (const p of world.props(cx, cz, state.step)) {
        if (!worthIt(o, p, false, roses)) continue;
        const px = (cx << CHUNK_SHIFT) + p.lx;
        const pz = (cz << CHUNK_SHIFT) + p.lz;
        const d = dist2(columnCentre(px), columnCentre(pz), x, z);
        if (best && d >= bestD) continue;
        if (!world.isExplored(floorDiv(px, FOG_TILE_COLUMNS), floorDiv(pz, FOG_TILE_COLUMNS))) continue;
        if (!inReach(state, h, o, columnCentre(px), columnCentre(pz))) continue;
        if (othersOn(state, i, cx, cz, p.index) >= propInfo(p.kind).gatherers) continue;
        best = { cx, cz, i: p.index };
        bestD = d;
      }
    }
  }
  return best;
}

/** Whether a column holds open water (buildings/placement.ts hasWaterAt, from the world alone: the screen's mesh worker uses it too). */
function openWater(world: World, x: number, z: number): boolean {
  const w = world.waterAt(x, z);
  return w !== NO_WATER && w > world.topAt(x, z) * WATER_PER_UNIT;
}

/**
 * The open water a stretch's fish swim in beside its bank column: up to
 * `most` columns within 3, nearest first, each (x, z, its water surface in
 * 32nds of a terrain unit). The screen draws the live fish there (FR-2).
 */
export function fishWaters(world: World, x: number, z: number, most: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let r = 1; r <= 3 && out.length < most; r++) {
    for (let dz = -r; dz <= r && out.length < most; dz++) {
      for (let dx = -r; dx <= r && out.length < most; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (openWater(world, x + dx, z + dz)) out.push([x + dx, z + dz, world.waterAt(x + dx, z + dz)]);
      }
    }
  }
  return out;
}

/** The water a fish comes up out of beside a stretch's bank column: the nearest column of open water within 3, or the bank itself. */
export function fishWater(world: World, x: number, z: number): [number, number] {
  const w = fishWaters(world, x, z, 1)[0];
  return w ? [w[0], w[1]] : [x, z];
}

/** Puts handing his bag in at the nearest drop-off in front of the order (it carries on once that is done). */
function handIn(state: SimState, i: number): boolean {
  const e = state.entities;
  e.queue[i]!.unshift({ t: 'loot', id: 0, hand: 1, back: 0, x: 0, z: 0 });
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  return CONTINUE;
}

/** At dusk he hands in what he has and waits by the nearest main base for the day (as hunters do). */
function woodsHome(state: SimState, i: number, o: WoodsOrder): boolean {
  const e = state.entities;
  if ((o.k & WOODS_HOME) === 0) {
    o.k = WOODS_HOME;
    o.i = -1;
    resetWalk(state, i);
    chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'Getting dark. Heading home.');
  }
  if (!bagEmpty(state, i) && nearestDropoff(state, i, -1) && state.step >= e.waitUntil[i]!) {
    e.waitUntil[i] = state.step + 10 * STEPS_PER_SECOND;
    return handIn(state, i);
  }
  const b = homeBaseNear(state, e.owner[i]!, e.x[i]!, e.z[i]!);
  if (!b) return CONTINUE;
  const g = besideBuilding(b);
  if (walkTo(state, i, { ...g, max: Math.max(g.max, HOME_COLUMNS) }) !== MOVING) resetWalk(state, i);
  return CONTINUE;
}

/** How many columns out from a main base's walls he stops for the night: within HOME_SLACK_M even off a corner. */
const HOME_COLUMNS = floorDiv(HOME_SLACK_M * M * 1000, 1415 * WU_PER_COLUMN);

/** The woods order, a step at a time (behaviour.ts runs it like the other orders). */
export function runWoods(state: SimState, i: number, o: WoodsOrder): boolean {
  const e = state.entities;
  if (!o.fish && !o.forage) return DONE;
  if (e.act[i] === Act.Start) {
    e.act[i] = Act.Walk;
    e.timer[i] = 0;
  }
  const roses = roseHours(state, o);
  if (isDark(state.step) && !roses) return woodsHome(state, i, o);
  if (o.k & WOODS_HOME) {
    if (roses) {
      // Out from home for the open Moon Roses, looked for once a second.
      const s = (state.step + e.id[i]!) % STEPS_PER_SECOND === 0 ? nearestSpot(state, i, homeOf(state, i), o) : null;
      if (!s) return woodsHome(state, i, o);
      o.k = 0;
      o.cx = s.cx;
      o.cz = s.cz;
      o.i = s.i;
      e.act[i] = Act.Walk;
      resetWalk(state, i);
      chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'The Moon Roses are open. Out to pick them.');
      return CONTINUE;
    }
    // Out again at daybreak; the dawn is still the monsters'.
    if (clockAt(state.step).period !== Period.Day) return CONTINUE;
    o.k = 0;
    chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'Back to the woods.');
  }
  const h = homeOf(state, i);
  const picked = (o.k & WOODS_PICKED) !== 0;
  let view = o.i >= 0 ? nodeView(state, o.cx, o.cz, o.i) : undefined;
  if (o.i >= 0 && !worthIt(o, view, picked, roses)) {
    o.i = -1;
    o.k &= ~WOODS_PICKED;
    view = undefined;
    e.act[i] = Act.Walk;
    resetWalk(state, i);
  }
  if (!view) {
    if (state.step >= e.waitUntil[i]!) {
      e.waitUntil[i] = state.step + STEPS_PER_SECOND;
      const s = nearestSpot(state, i, h, o);
      if (s) {
        o.cx = s.cx;
        o.cz = s.cz;
        o.i = s.i;
        o.k &= ~WOODS_SEARCH;
        e.act[i] = Act.Walk;
        resetWalk(state, i);
        return CONTINUE;
      }
      if (roses) {
        // No open Moon Rose left in reach: home till day.
        o.k = WOODS_HOME;
        o.i = -1;
        resetWalk(state, i);
        chatter(state, i, Talk.Dusk, 60 * STEPS_PER_SECOND, 'No more Moon Roses open. Heading home.');
        return woodsHome(state, i, o);
      }
    }
    return roses ? CONTINUE : lookAbout(state, i, h, o);
  }
  // His bag cannot take the next catch: home with it, then back out.
  const res = spotRes(view);
  if (bagRoom(state, i, res) < perPick(view)) {
    if (!nearestDropoff(state, i, -1)) {
      chatter(state, i, Talk.Bag, 30 * STEPS_PER_SECOND, 'My bag is full, and there is nowhere to take it.');
      return CONTINUE;
    }
    chatter(state, i, Talk.Bag, 30 * STEPS_PER_SECOND, isFish(view.kind) ? 'Taking the fish home.' : 'Taking the food home.');
    return handIn(state, i);
  }
  const nx = (o.cx << CHUNK_SHIFT) + view.lx;
  const nz = (o.cz << CHUNK_SHIFT) + view.lz;
  if (e.act[i] !== Act.Work) {
    const r = walkTo(state, i, { ...pointGoal(nx, nz), max: 2 });
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) {
      // No way there: another spot, a second from now.
      o.i = -1;
      o.k &= ~WOODS_PICKED;
      e.waitUntil[i] = state.step + STEPS_PER_SECOND;
      return CONTINUE;
    }
    e.act[i] = Act.Work;
    e.timer[i] = 0;
  }
  // At work: facing the water (or the plant), the rod out or his hands at it.
  const fishing = isFish(view.kind);
  const [tx, tz] = fishing ? fishWater(state.world, nx, nz) : [nx, nz];
  const wx = columnCentre(tx);
  const wz = columnCentre(tz);
  if (wx !== e.x[i] || wz !== e.z[i]) e.heading[i] = headingTowards(wx - e.x[i]!, wz - e.z[i]!);
  e.order[i] = workLook(view.kind);
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < (fishing ? WOODS.fishS : WOODS.pickS) * STEPS_PER_SECOND) return CONTINUE;
  e.timer[i] = 0;
  const taken = state.world.harvest(o.cx, o.cz, o.i, perPick(view), state.step);
  if (taken > 0) {
    addToBag(state, i, res, taken);
    // The fish comes up on the line out of the water to him (FR-1), drawn by the screen.
    if (fishing) {
      const surface = state.world.waterAt(tx, tz);
      const wy = surface !== NO_WATER ? floorDiv(surface * WU_PER_TERRAIN_UNIT, WATER_PER_UNIT) : standY(state, wx, wz);
      state.hits.push({ look: 'catch', x: wx, y: wy, z: wz, id: e.id[i]!, mob: view.kind });
    }
  }
  return CONTINUE;
}

/** Nothing in sight: out to look round the edge of the explored land within reach, then anywhere within it (as hunters do). */
function lookAbout(state: SimState, i: number, h: Home | undefined, o: WoodsOrder): boolean {
  const e = state.entities;
  if (!h) return CONTINUE;
  if ((o.k & WOODS_SEARCH) === 0) {
    const from = (atan2Angle(e.z[i]! - h.z, e.x[i]! - h.x) + ((o.k & WOODS_TURNED) !== 0 ? 4096 : 0)) & 0xffff;
    const p = exploreTarget(state, h, from) ?? wanderTarget(state, h, i);
    o.ex = p.x;
    o.ez = p.z;
    o.k |= WOODS_SEARCH;
    resetWalk(state, i);
    chatter(state, i, Talk.Look, 60 * STEPS_PER_SECOND, o.fish && o.forage ? 'Nothing to forage or fish here. Looking farther out.' : o.fish ? 'No fish to spare here. Looking farther out.' : 'Nothing to forage here. Looking farther out.');
  }
  const r = walkTo(state, i, { ...pointGoal(col(o.ex), col(o.ez)), max: 3 });
  if (r !== MOVING) {
    o.k = (o.k & ~(WOODS_SEARCH | WOODS_TURNED)) | (r === FAILED ? WOODS_TURNED : 0);
    resetWalk(state, i);
  }
  return CONTINUE;
}

/**
 * The Fish or Forage button for one woodsman (orders.ts WoodsOrder): turns
 * fishing (what 1) or foraging (2) on or off in his woods order, or gives
 * him one; a picked spot is worked first (CT-1's left click), then he goes
 * on as usual. With both off he stops.
 */
export function setWoods(state: SimState, i: number, what: number, on: number, spot: { cx: number; cz: number; i: number } | null, queued: boolean): void {
  const e = state.entities;
  const now = e.queue[i]![0];
  let o: WoodsOrder;
  if (!queued && now?.t === 'woods') o = now;
  else {
    o = woodsOrder(state, i, 0, 0);
    if (what === 1) o.fish = on;
    else o.forage = on;
    if (!o.fish && !o.forage) return;
    if (spot) pick(o, spot);
    giveOrder(state, i, o, queued);
    return;
  }
  if (what === 1) o.fish = on;
  else o.forage = on;
  if (!o.fish && !o.forage) {
    e.queue[i]!.shift();
    e.act[i] = Act.Start;
    resetWalk(state, i);
    return;
  }
  if (spot) {
    pick(o, spot);
    e.act[i] = Act.Walk;
    resetWalk(state, i);
  }
}

/** Points a woods order at the spot the player picked. */
function pick(o: WoodsOrder, spot: { cx: number; cz: number; i: number }): void {
  o.cx = spot.cx;
  o.cz = spot.cz;
  o.i = spot.i;
  o.k = (o.k & ~WOODS_SEARCH) | WOODS_PICKED;
}
