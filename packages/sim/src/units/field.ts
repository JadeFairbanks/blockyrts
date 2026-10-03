// Work out in the field that milestone 4 adds (Semi-automation: hunting;
// Animals; Food and medicine; Table 12 carrying; Mineshafts and prospecting):
// hunting with N, taming, eating at a building, hitching a working animal to
// a cart, prospecting with T and hauling from a mineshaft. Each runs like the
// other orders in behaviour.ts: a small state machine on the unit's `act`.

import { BuildingKind, buildingName } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { PROSPECT_HAMMER_STEPS, PROSPECT_STEPS, prospectText, ratingAt, shaftStock, takeStock } from '../buildings/mining.ts';
import type { Building } from '../buildings/store.ts';
import { isDark } from '../clock.ts';
import { Res } from '../economy/resources.ts';
import { PROSPECT_TOOL_TIER } from './kits.ts';
import { eatAt, servesFood } from '../economy/food.ts';
import { RESOURCES } from '../economy/resources.ts';
import { floorDiv, length2d, STEPS_PER_SECOND, WU_PER_COLUMN, WU_PER_METRE } from '../fixed.ts';
import { pointGoal } from '../nav/path.ts';
import { NO_CARRY, OrderKind, UnitKind, WILD, type SimState } from '../state.ts';
import { CHUNK_SHIFT } from '../world/chunk.ts';
import { PropKind } from '../world/props.ts';
import { isGame, speciesSpec } from '../animals/species.ts';
import { newHome } from '../animals/animals.ts';
import { Act, besideBuilding, FAILED, MOVING, nearestStandable, resetWalk, toDropoff, walkTo } from './behaviour.ts';
import type { UnitOrder } from './unit-orders.ts';
import { carryCapacity } from './weight.ts';

const CONTINUE = false;
const DONE = true;
const M = WU_PER_METRE;

/** A hunt reaches 40 m from where it began (Table 1: 40 m Hunt). */
export const HUNT_LEASH_WU = 40 * M;
/** Carcasses a hunter or its haulers pick up lie within 15 m (s). */
const CARCASS_REACH_WU = 15 * M;
/** A hauler keeps within 4 m of its hunter (s). */
const HAULER_FOLLOW_WU = 4 * M;
/** A worker tames standing within 3 m of the animal (s). */
const TAME_REACH_WU = 3 * M;

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

/** The game animal to hunt next within the leash of (x, z): hares, deer, boar and crabs, never bears or the territorial ones (Semi-automation). */
export function nearestGame(state: SimState, i: number, x: number, z: number): number {
  const e = state.entities;
  let best = -1;
  let bestD = 0;
  let bestHurt = 0;
  for (const j of state.grid.near(x, z, HUNT_LEASH_WU)) {
    if (!isQuarry(state, j) || !isGame(e.mob[j]!)) continue;
    if (length2d(e.x[j]! - x, e.z[j]! - z) > HUNT_LEASH_WU) continue;
    // A wounded animal first, so a hunt finishes what it started (s); then the nearest.
    const hurt = e.hp[j]! < e.maxHp[j]! ? 1 : 0;
    const d = dist2(e.x[j]!, e.z[j]!, e.x[i]!, e.z[i]!);
    if (best < 0 || hurt > bestHurt || (hurt === bestHurt && (d < bestD || (d === bestD && e.id[j]! < e.id[best]!)))) {
      best = j;
      bestD = d;
      bestHurt = hurt;
    }
  }
  return best;
}

/** The nearest carcass with meat left within reach of a point, or null. */
function carcassNear(state: SimState, x: number, z: number): { cx: number; cz: number; i: number } | null {
  const gx = col(x);
  const gz = col(z);
  const r = floorDiv(CARCASS_REACH_WU, WU_PER_COLUMN);
  let best: { cx: number; cz: number; i: number } | null = null;
  let bestD = 0;
  for (let cz = (gz - r) >> CHUNK_SHIFT; cz <= (gz + r) >> CHUNK_SHIFT; cz++) {
    for (let cx = (gx - r) >> CHUNK_SHIFT; cx <= (gx + r) >> CHUNK_SHIFT; cx++) {
      for (const p of state.world.props(cx, cz, state.step)) {
        if (p.kind !== PropKind.Carcass || p.amount <= 0) continue;
        const dx = (cx << CHUNK_SHIFT) + p.lx - gx;
        const dz = (cz << CHUNK_SHIFT) + p.lz - gz;
        const d = dx * dx + dz * dz;
        if (d > r * r || (best && d >= bestD)) continue;
        best = { cx, cz, i: p.index };
        bestD = d;
      }
    }
  }
  return best;
}

/** Puts a gather order on a carcass in front of the current order (the hunt carries on once it is done). */
function butcher(state: SimState, i: number, at: { cx: number; cz: number; i: number }): boolean {
  const e = state.entities;
  e.queue[i]!.unshift({ t: 'gather', cx: at.cx, cz: at.cz, i: at.i });
  e.act[i] = Act.Start;
  e.timer[i] = 0;
  resetWalk(state, i);
  return CONTINUE;
}

/** The player's main base nearest a unit, or undefined. */
function nearestBase(state: SimState, i: number): Building | undefined {
  const e = state.entities;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (b.owner !== e.owner[i] || b.kind !== BuildingKind.MainBase || !b.complete) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, e.x[i]!, e.z[i]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** At dusk a hunt ends and the hunters walk home with what they carry (Semi-automation: hunting). */
function huntOver(state: SimState, i: number): boolean {
  const e = state.entities;
  const home = nearestBase(state, i);
  const next: UnitOrder[] = [];
  if (e.carryAmt[i]! > 0) next.push({ t: 'return' });
  if (home) {
    const [x, z] = buildingCentre(home);
    const [sx, sz] = nearestStandable(state, x, z + (6 * WU_PER_COLUMN));
    next.push({ t: 'move', x: sx, z: sz });
  }
  e.queue[i]!.splice(0, 1, ...next);
  e.act[i] = Act.Start;
  resetWalk(state, i);
  return next.length === 0 ? DONE : CONTINUE;
}

/** Whether a unit is out on a hunt (its current order or one queued behind a carcass). */
function hunting(state: SimState, j: number): boolean {
  return state.entities.queue[j]!.some((o) => o.t === 'hunt');
}

export function runHunt(state: SimState, i: number, o: Extract<UnitOrder, { t: 'hunt' }>): boolean {
  const e = state.entities;
  if (isDark(state.step, state.blood)) return huntOver(state, i);
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  if (e.kind[i] === UnitKind.Worker) {
    // A hauler: follows its hunter and butchers what falls.
    const h = e.indexOf(o.id);
    if (h < 0 || e.hp[h]! <= 0 || !hunting(state, h)) return DONE;
    if (e.carryAmt[i]! > 0 && e.carryAmt[i]! >= carryCapacity(state, i, e.carryRes[i]!)) {
      e.queue[i]!.unshift({ t: 'return' });
      e.act[i] = Act.Start;
      resetWalk(state, i);
      return CONTINUE;
    }
    const meat = carcassNear(state, e.x[h]!, e.z[h]!) ?? carcassNear(state, e.x[i]!, e.z[i]!);
    if (meat) return butcher(state, i, meat);
    if (length2d(e.x[h]! - e.x[i]!, e.z[h]! - e.z[i]!) <= HAULER_FOLLOW_WU) {
      resetWalk(state, i);
      return CONTINUE;
    }
    if (e.pathOk[i] !== 2 && state.step >= e.waitUntil[i]!) resetWalk(state, i);
    if (e.pathOk[i] === 2) e.waitUntil[i] = state.step + STEPS_PER_SECOND;
    if (walkTo(state, i, { ...pointGoal(col(e.x[h]!), col(e.z[h]!)), max: 4 }) !== MOVING) resetWalk(state, i);
    return CONTINUE;
  }
  // A hunter. The fight layer chases a quarry still alive; here the quarry is dead, lost or not chosen yet.
  const t = e.indexOf(o.id);
  if (o.id !== 0 && isQuarry(state, t)) {
    // Out of sight for the fight layer: walk towards it.
    if (walkTo(state, i, { ...pointGoal(col(e.x[t]!), col(e.z[t]!)), max: 2 }) !== MOVING) resetWalk(state, i);
    return CONTINUE;
  }
  // Just killed: it lies dying until the step's deaths settle and leave its carcass.
  if (o.id !== 0 && t >= 0 && e.kind[t] === UnitKind.Animal && e.hp[t]! <= 0) return CONTINUE;
  if (o.id !== 0) {
    o.id = 0;
    // What it killed: carry what it can home, unless workers came along to haul it.
    const meat = carcassNear(state, e.x[i]!, e.z[i]!);
    if (meat && !haulersWith(state, i)) return butcher(state, i, meat);
  }
  if (e.carryAmt[i]! > 0) {
    e.queue[i]!.unshift({ t: 'return' });
    e.act[i] = Act.Start;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (!o.auto) return DONE;
  const next = nearestGame(state, i, o.x, o.z);
  if (next < 0) {
    // Nothing left in reach: stand by where the hunt began and look again now and then.
    if (state.step < e.waitUntil[i]!) return CONTINUE;
    e.waitUntil[i] = state.step + 5 * STEPS_PER_SECOND;
    if (walkTo(state, i, { ...pointGoal(col(o.x), col(o.z)), max: 3 }) !== MOVING) resetWalk(state, i);
    return CONTINUE;
  }
  o.id = e.id[next]!;
  resetWalk(state, i);
  return CONTINUE;
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

/** Whether a species can be tamed by players, and where (Animals: bears never). */
export function tameable(species: number): boolean {
  return speciesSpec(species).tameAt.length > 0;
}

/** Why a worker cannot tame an animal now, or ''. */
export function tameProblem(state: SimState, player: number, t: number): string {
  const e = state.entities;
  if (!isQuarry(state, t)) return 'Only wild animals can be tamed.';
  const s = speciesSpec(e.mob[t]!);
  if (!tameable(s.id)) return `A ${s.name.toLowerCase()} can never be tamed.`;
  if (!newHome(state, player, s.id)) return `Needs a ${s.tameAt.map((k) => buildingName(k, 1, 0).toLowerCase()).join(' or a ')} with room first.`;
  const pool = state.players[player]!.pool;
  let have = 0;
  for (const r of s.tameFoods) have += pool[r]!;
  if (have < s.tameFood) return `Needs ${s.tameFood} ${s.tameFoods.map((r) => RESOURCES[r]!.name.toLowerCase()).join(', ')} to tame it.`;
  return '';
}

export function runTame(state: SimState, i: number, o: Extract<UnitOrder, { t: 'tame' }>): boolean {
  const e = state.entities;
  const t = e.indexOf(o.id);
  const player = e.owner[i]!;
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
  // Standing by with the food: the animal grows calm and stays put (s).
  e.act[i] = Act.Work;
  e.order[i] = OrderKind.Idle;
  e.wanderAt[t] = state.step + STEPS_PER_SECOND;
  e.timer[i] = e.timer[i]! + 1;
  if (e.timer[i]! < s.tameSteps) return CONTINUE;
  // The food is given at the end (s).
  const pool = state.players[player]!.pool;
  let owed = s.tameFood;
  for (const r of s.tameFoods) {
    const take = Math.min(owed, pool[r]!);
    pool[r] = pool[r]! - take;
    owed -= take;
  }
  const home = newHome(state, player, s.id, e.x[t]!, e.z[t]!)!;
  e.owner[t] = player;
  e.home[t] = home.id;
  e.target[t] = 0;
  e.queue[t] = [];
  const [hx, hz] = buildingCentre(home);
  e.homeX[t] = hx;
  e.homeZ[t] = hz;
  state.events.push({ player, kind: 'info', text: `A wild ${s.name.toLowerCase()} has been tamed and goes to the ${buildingName(home.kind, home.level, home.variant).toLowerCase()}.`, x: e.x[t]!, z: e.z[t]! });
  return DONE;
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
  let b = o.b ? state.buildings.get(o.b) : undefined;
  if (!b || b.owner !== e.owner[i] || !b.complete || !servesFood(b.kind)) b = nearestTable(state, i);
  if (!b) {
    alert(state, e.owner[i]!, 'There is nowhere to eat. Units eat at a main base, a storehouse or a kitchen.', e.x[i]!, e.z[i]!);
    return DONE;
  }
  o.b = b.id;
  if (e.act[i] === Act.Start) e.act[i] = Act.Walk;
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) return DONE;
  const why = eatAt(state, i);
  if (why) alert(state, e.owner[i]!, why, e.x[i]!, e.z[i]!);
  return DONE;
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

export function runHaul(state: SimState, i: number, o: Extract<UnitOrder, { t: 'haul' }>): boolean {
  const e = state.entities;
  const b = state.buildings.get(o.b);
  if (!b || b.owner !== e.owner[i] || !b.complete || b.kind !== BuildingKind.Mineshaft) return DONE;
  if (e.act[i] === Act.Start) e.act[i] = e.carryAmt[i]! > 0 ? Act.ToDrop : Act.Walk;
  if (e.act[i] === Act.ToDrop) {
    const r = toDropoff(state, i, null);
    if (r === MOVING) return CONTINUE;
    if (r === FAILED) return DONE;
    e.act[i] = Act.Walk;
    resetWalk(state, i);
    return CONTINUE;
  }
  if (e.act[i] === Act.Wait) {
    if (state.step < e.waitUntil[i]!) return CONTINUE;
    e.act[i] = Act.Walk;
  }
  const r = walkTo(state, i, besideBuilding(b));
  if (r === MOVING) return CONTINUE;
  if (r === FAILED) {
    alert(state, e.owner[i]!, 'A worker cannot reach the mineshaft.', e.x[i]!, e.z[i]!);
    return DONE;
  }
  // Load up with the first thing waiting, as much as the worker, cart or pack holds.
  if (shaftStock(b) === 0) {
    e.act[i] = Act.Wait;
    e.waitUntil[i] = state.step + 3 * STEPS_PER_SECOND;
    return CONTINUE;
  }
  const got = takeStock(b, 1 << 30, (res) => carryCapacity(state, i, res));
  if (got && got[1] > 0) {
    e.carryRes[i] = got[0];
    e.carryAmt[i] = got[1];
  } else e.carryRes[i] = NO_CARRY;
  e.act[i] = Act.ToDrop;
  resetWalk(state, i);
  return CONTINUE;
}
