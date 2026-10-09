// Applying player orders to the state (Controls: Unit orders, Queuing orders
// with Shift, Production queues, Rally points, Semi-automation). Orders are
// checked here against the state: a player only orders their own units and
// buildings, and units that cannot carry an order out ignore it.

import { BuildingKind, buildingName, buildingSpec, CANCEL_REFUND_PER_MILLE, levelSpec } from './buildings/data.ts';
import { buildingCentre, dist2 } from './buildings/lights.ts';
import { chainPiece, plannedSpots, stretchRoom, stretchSpots } from './buildings/chains.ts';
import { Blocked, BLOCKED_TEXT, buildCost, buildRequirement, growthBlocked, mainBaseLevel, placementBlocked } from './buildings/placement.ts';
import { cancelProduct, queueProduct, queueStack, setKitLock, stacks, usableBy } from './buildings/production.ts';
import { fertilizable, fertilize, setAutoFertilize } from './buildings/farm-boost.ts';
import { garrisonRoom, type Building } from './buildings/store.ts';
import { isTavern, setTavernOpen, withdrawFunds } from './buildings/tavern.ts';
import { isDreadnought } from './units/dreadnought.ts';
import { costText, FOODS, refund, Res, RESOURCES, type Cost } from './economy/resources.ts';
import { canAffordAny, haveOf, isAnyRes, payAny, shortOfAny } from './economy/food-kinds.ts';
import { clamp, floorDiv, isqrt, WORLD_EDGE_WU, WU_PER_COLUMN, WU_PER_METRE } from './fixed.ts';
import { canonicalOrders, DebugTool, PickOwn, type Order } from './orders.ts';
import { isGod, NO_CARRY, placeBuilding, refitBuilding, sightOf, SiteKind, UnitKind, type SimState } from './state.ts';
import { huntable } from './combat/combat.ts';
import { eatNeed, Rations } from './economy/food.ts';
import { hitchProblem, HUNT_PICKED, tameProblem, unhitch } from './units/field.ts';
import { canGarrison, pickTarget, rangedOf, validTarget } from './combat/fight.ts';
import { RESEARCH } from './combat/items.ts';
import { addMob, combatTroop } from './combat/mob-ai.ts';
import { MOBS } from './combat/mobs.ts';
import { clockAt, isDark } from './clock.ts';
import { inFront, orderCart, orderEquip, orderUpgrade, orderUpgradeEquipment } from './units/gear.ts';
import { markSite, markTunnelStretch } from './units/dig.ts';
import { bagEmpty, canLoot, carriedOf, dropItem, HAND_ONE, lootIndex, pickersFor } from './units/loot.ts';
import { startForage } from './units/forage.ts';
import { isWoodsman } from './units/woodsman.ts';
import { isForage, setWoods } from './units/woods.ts';
import { isFish } from './world/props.ts';
import { callRepairs } from './units/repairs.ts';
import { hasRunButton } from './units/moves.ts';
import { Act, columnCentre, findNode, giveOrder, NODE_SEARCH_COLUMNS, leaveBuilding, nodeView, resetWalk, rankTrainedAt, shelteredIn, shelterRoom, stopUnit, takesWorkers, unitsInside, workOn } from './units/behaviour.ts';
import { menOnTop, platformCrew, topRoom } from './units/top.ts';
import { goesInside, insideAuto, mayShelter, swapShelter } from './units/shelter.ts';
import { ENTER_NIGHT, ENTER_TOP, type UnitOrder } from './units/unit-orders.ts';
import { debugThreat } from './threats/debug.ts';
import { clearFoes, godPlace, healAll, killUnits, maxRanks, setGod, showElves } from './debug/god.ts';
import { eliminate } from './combat/deaths.ts';
import { peoplesOrder } from './peoples/orders.ts';
import { knowsSpell, spellProblem, spellReadyAt } from './magic/cast.ts';
import { MANA_SCALE, SPELLS } from './magic/spells.ts';
import { crewWhy, haulWhy, hitchEngine, isCrewman, mendWhy, withoutTheirCrew } from './siege/engines.ts';
import { answerQuestion } from './units/questions.ts';
import { askGreyed, greyHooks } from './units/greyed.ts';
import { barnHandsIn, keepBarnHands } from './units/barn-hand.ts';

/** Spacing of a group spread round its target (s): 1.2 m. */
const SPREAD_WU = 12 * floorDiv(WU_PER_METRE, 10);

function ownBuilding(state: SimState, player: number, id: number): Building | undefined {
  const b = state.buildings.get(id);
  return b && b.owner === player ? b : undefined;
}

/** A building the player may use: their own, or one inherited while they are still in. */
function usableBuilding(state: SimState, player: number, id: number): Building | undefined {
  const b = state.buildings.get(id);
  return b && usableBy(state, b, player) ? b : undefined;
}

function alert(state: SimState, player: number, text: string): void {
  state.events.push({ player, kind: 'alert', text });
}

/**
 * Whether a player may order a unit. Their own units always; with `allies`
 * (the orders shared control allows: move, attack, patrol, hold, gather,
 * shelter and garrison, and the stop, follow, hunt and spell orders that go
 * with them) also the units of a player who ticked Share control for them,
 * and the units inherited from a player who was eliminated or left (Allies
 * panel; When a player is eliminated or leaves).
 */
export function commandable(state: SimState, player: number, i: number, allies: boolean): boolean {
  const e = state.entities;
  const owner = e.owner[i]!;
  if (owner === player) return true;
  if (!allies || owner >= state.players.length) return false;
  // Share control covers combat units only (Jade's Patch 5, UI-14): troops, mages and engines, not workers or woodsmen;
  // an inherited unit is anyone's still.
  return e.shared[i] !== 0 || ((state.players[owner]!.share & (1 << player)) !== 0 && combatTroop(state, i) && !isWoodsman(e, i));
}

/** The player's units among the ids, by index (with `allies`, also the units shared with them). */
function ownUnits(state: SimState, player: number, ids: readonly number[], allies = false): number[] {
  const e = state.entities;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const i = e.indexOf(id);
    if (i < 0 || seen.has(i) || !commandable(state, player, i, allies) || e.kind[i] === UnitKind.Wanderer || e.kind[i] === UnitKind.Animal) continue;
    // A fixed engine's garrison crewmen are stuck up on its platform for good (Patch 5, Jade's CT-3): they take no orders.
    if (platformCrew(state, i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Group movement: each unit's own target round the point. A group standing
 * close together keeps its shape (each keeps its offset from the group's
 * middle); a scattered one gathers into a square block round the point.
 */
function groupTargets(state: SimState, units: readonly number[], x: number, z: number): Array<[number, number]> {
  const e = state.entities;
  const n = units.length;
  if (n === 0) return [];
  if (n === 1) return [[x, z]];
  let sx = 0;
  let sz = 0;
  for (const i of units) {
    sx += e.x[i]!;
    sz += e.z[i]!;
  }
  const mx = floorDiv(sx, n);
  const mz = floorDiv(sz, n);
  let spread = 0;
  for (const i of units) spread = Math.max(spread, Math.abs(e.x[i]! - mx), Math.abs(e.z[i]! - mz));
  const side = isqrt(n - 1) + 1;
  if (spread <= side * SPREAD_WU * 2) return units.map((i) => [x + e.x[i]! - mx, z + e.z[i]! - mz]);
  const half = (side - 1) * SPREAD_WU;
  return units.map((_, k) => [x + (k % side) * SPREAD_WU * 2 - half, z + floorDiv(k, side) * SPREAD_WU * 2 - half]);
}

function applyMove(state: SimState, o: Extract<Order, { kind: 'move' }>): void {
  const units = withoutTheirCrew(state, ownUnits(state, o.player, o.units, true));
  if (units.length === 0) return;
  const tx = clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU);
  const tz = clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU);
  const targets = groupTargets(state, units, tx, tz);
  units.forEach((i, k) => giveOrder(state, i, { t: 'move', x: targets[k]![0], z: targets[k]![1] }, o.queued === true));
  // Each finds its own way as it sets off, a few searches a step shared by every unit (units/behaviour.ts walkTo): a
  // group of 20 sent 300 m planned every way in the step the order came, a stall of most of a second (Patch 5, GP-22).
}

/** Gives each of the order's units what `make` says; with `crewed`, crewmen whose engine is in the order keep crewing it (siege/engines.ts withoutTheirCrew). */
function giveAll(state: SimState, o: { player: number; units: number[]; queued?: boolean }, make: (i: number) => UnitOrder | null, allies = false, crewed = false): void {
  const units = ownUnits(state, o.player, o.units, allies);
  for (const i of crewed ? withoutTheirCrew(state, units) : units) {
    const u = make(i);
    if (u) giveOrder(state, i, u, o.queued === true);
  }
}

/** Turns fishing or foraging on (or off) for the woodsmen among a command's units; with none of them, says who does it. */
function woodsAt(state: SimState, o: { player: number; units: number[]; queued?: boolean }, what: number, spot: { cx: number; cz: number; i: number } | null, on = 1): void {
  const e = state.entities;
  const men = ownUnits(state, o.player, o.units).filter((i) => isWoodsman(e, i));
  if (men.length === 0) {
    alert(state, o.player, what === 1 ? 'Only woodsmen fish. Train them at the Scholar\'s Lodge.' : 'Only woodsmen forage. Train them at the Scholar\'s Lodge.');
    return;
  }
  for (const i of men) setWoods(state, i, what, on, spot, o.queued === true);
}

/** Upgrades a building to its next level: paid now by `by` (the owner, or a player using an inherited building), then built by workers. Returns '' or why not. */
export function upgradeProblem(state: SimState, b: Building, by = b.owner): string {
  const spec = buildingSpec(b.kind);
  if (!b.complete) return 'It is not finished yet.';
  if (b.upgrading) return 'It is already being upgraded.';
  const next = spec.levels[b.level];
  if (!next) return 'It is at its highest level.';
  if (next.needs) return next.needs;
  // Godmode needs no main base tier or research first (Jade's Patch 5).
  const god = isGod(state, by);
  if (!god && next.needsBase > Math.max(mainBaseLevel(state, b.owner), b.kind === BuildingKind.MainBase ? b.level : 0)) return `Needs a tier ${next.needsBase} main base.`;
  if (!god && next.research && ((state.players[by]!.research | b.tech) & (1 << next.research)) === 0) return `Needs ${RESEARCH[next.research]!.name} researched first.`;
  const room = growthBlocked(state, b, b.level + 1);
  if (room !== Blocked.None) return `It needs more room round it to grow: ${BLOCKED_TEXT[room].charAt(0).toLowerCase()}${BLOCKED_TEXT[room].slice(1)}`;
  const pool = state.players[by]!.pool;
  if (!canAffordAny(pool, next.cost)) return `Not enough ${RESOURCES[shortOfAny(pool, next.cost)]!.name.toLowerCase()} (${costText(next.cost)}).`;
  return '';
}

function applyUpgrade(state: SimState, b: Building, by: number): void {
  const why = upgradeProblem(state, b, by);
  if (why) {
    alert(state, by, why);
    return;
  }
  const next = levelSpec(b.kind, b.level + 1);
  // Kind by kind, so a cancel gives back the lumber it was paid in (Patch 5: a tier's lumber is either kind).
  b.paid = payAny(state.players[by]!.pool, next.cost);
  b.upgrading = b.level + 1;
  b.upProgress = 0;
  refitBuilding(state, b);
  // Godmode: one step of work, done here, finishes it.
  if (isGod(state, b.owner)) {
    workOn(state, b);
    return;
  }
  const [x, z] = buildingCentre(b);
  state.events.push({ player: by, kind: 'info', text: `Upgrade to ${next.name} paid for. Right-click it with workers to build it.`, x, z });
}

/**
 * Godmode's Build (Jade's Patch 5: "you can build anything instantly"): the
 * building stands finished on the spot at once, with no worker walking
 * there; a blocked spot is refused as it is for workers. Returns whether it
 * was built.
 */
function buildNow(state: SimState, player: number, kind: number, variant: number, x: number, z: number): boolean {
  const name = buildingName(kind, 1, variant);
  const why = buildRequirement(state, player, kind);
  if (why) {
    alert(state, player, `${name}: ${why}`);
    return false;
  }
  const blocked = placementBlocked(state, player, kind, x, z, variant);
  if (blocked !== Blocked.None) {
    alert(state, player, `The spot for the ${name.toLowerCase()} is blocked. ${BLOCKED_TEXT[blocked]}`);
    return false;
  }
  // Placed as workers start it, then one step of work, which finishes it in godmode.
  workOn(state, placeBuilding(state, player, kind, variant, x, z, false));
  return true;
}

// A Yes to "Upgrade to ...?" from a greyed-out button's question (Patch 3) runs the Upgrade button's own code.
greyHooks.upgradeProblem = upgradeProblem;
greyHooks.upgrade = applyUpgrade;

function applyCancelBuild(state: SimState, b: Building): void {
  const pool = state.players[b.owner]!.pool;
  if (!b.complete) {
    // What was paid to start it, kind by kind (an "any lumber" cost comes back as the lumber it was paid in).
    refund(pool, b.paid.length ? (b.paid as Cost) : levelSpec(b.kind, 1).cost.map(([r, n]) => [r, n * b.costMul] as const), CANCEL_REFUND_PER_MILLE);
    for (const j of unitsInside(state, b.id)) leaveBuilding(state, j);
    state.buildings.remove(b.id, (key) => state.world.touchNav(key));
    return;
  }
  if (b.upgrading) {
    refund(pool, b.paid.length ? (b.paid as Cost) : levelSpec(b.kind, b.upgrading).cost, CANCEL_REFUND_PER_MILLE);
    b.upgrading = 0;
    b.upProgress = 0;
    refitBuilding(state, b);
  }
}

/** Everyone Home: units without a standing job go to the nearest shelter with room; farmers go to their own farm. In the dark they go in for the night (ENTER_NIGHT: out at dawn once no monster is near, Jade's Patch 4), by day until daybreak. */
export function everyoneHome(state: SimState, player: number): void {
  const e = state.entities;
  const auto = isDark(state.step) ? ENTER_NIGHT : 1;
  const shelters = state.buildings.list.filter((b) => b.owner === player && shelterRoom(b) > 0);
  const taken = new Map<number, number>();
  for (const b of shelters) taken.set(b.id, shelteredIn(state, b.id).length);
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.kind[i] !== UnitKind.Worker || e.inside[i] !== 0) continue;
    const head = e.queue[i]![0];
    // Standing jobs (farmers) shelter in their own building by themselves.
    if (head?.t === 'job' || head?.t === 'enter' || head?.t === 'train') continue;
    let best: Building | null = null;
    let bestD = 0;
    for (const b of shelters) {
      if (taken.get(b.id)! >= shelterRoom(b)) continue;
      const [bx, bz] = buildingCentre(b);
      const d = dist2(bx, bz, e.x[i]!, e.z[i]!);
      if (!best || d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) continue;
    taken.set(best.id, taken.get(best.id)! + 1);
    // Sheltering goes in front of what the unit was doing; at dawn or daybreak it comes out and carries on.
    e.queue[i]!.unshift({ t: 'enter', b: best.id, auto });
    e.act[i] = Act.Start;
    e.timer[i] = 0;
    resetWalk(state, i);
  }
}

/**
 * What Enter on one of its own buildings asks a unit to do: go up on its top
 * (anyone on foot; towers and main bases of tier 2 and up), or shelter
 * inside (workers; in a main base troops and mages too, Patch 5's GP-10,
 * units/shelter.ts goesInside saying which first), else nothing.
 */
export function enterOrder(state: SimState, i: number, b: Building): UnitOrder | null {
  if (!(garrisonRoom(b) > 0 && canGarrison(state, i)) && !mayShelter(state, i, b)) return null;
  return { t: 'enter', b: b.id, auto: goesInside(state, i, b) ? insideAuto(state, i) : ENTER_TOP };
}

/**
 * Who goes up a building's top first (Jade's Patch 5, CT-3): ranged troops,
 * the best armed and then the highest rank first; then mages; then the rest
 * on foot; workers last. Lower first.
 */
function topOrder(state: SimState, i: number): number {
  const e = state.entities;
  const k = e.kind[i];
  const group = k === UnitKind.Warrior && rangedOf(state, i) ? 0 : k === UnitKind.Mage ? 1 : k === UnitKind.Worker ? 3 : 2;
  return group * 0x10000 - e.wTier[i]! * 0x100 - e.rank[i]!;
}

/** Units of the player's headed for a building with an enter order (anywhere in their lists), not in it yet: [up its top, sheltering]. */
function headedIn(state: SimState, b: Building): [number, number] {
  const e = state.entities;
  let up = 0;
  let shelter = 0;
  for (let j = 0; j < e.count; j++) {
    if (e.inside[j] === b.id || e.hp[j]! <= 0) continue;
    const o = e.queue[j]!.find((q) => q.t === 'enter' && q.b === b.id);
    if (o?.t !== 'enter') continue;
    if (o.auto === ENTER_TOP) up++;
    else shelter++;
  }
  return [up, shelter];
}

/**
 * Into a building (Jade's Patch 5, CT-2 and CT-3): only as many go as it has
 * room for, the rest keep what they were doing (and stay selected). Up its
 * top go the best ranged troops first, then mages, then the rest, workers
 * last; workers that find no room up there shelter inside while there is
 * room. Engines never go in (Patch 5: the cannon ports are gone).
 */
function applyEnter(state: SimState, o: Extract<Order, { kind: 'enter' }>, b: Building): void {
  const e = state.entities;
  const units = ownUnits(state, o.player, o.units, true).filter((i) => e.kind[i] !== UnitKind.Engine && e.owner[i] === b.owner && e.inside[i] !== b.id);
  if (units.length === 0) return;
  const [upHeaded, shelterHeaded] = headedIn(state, b);
  // A Citadel's top holds its engine platform's 4 too while no fixed engine stands there (units/top.ts).
  let up = garrisonRoom(b) > 0 ? topRoom(state, b) - menOnTop(state, b.id).length - upHeaded : 0;
  let shelter = shelterRoom(b) - shelteredIn(state, b.id).length - shelterHeaded;
  units.sort((a, c) => topOrder(state, a) - topOrder(state, c) || a - c);
  let sent = 0;
  let tried = 0;
  for (const i of units) {
    const order = enterOrder(state, i, b);
    if (!order || order.t !== 'enter') continue;
    tried++;
    // Where it goes first, else the other place with room (Patch 5, GP-10).
    if (order.auto === ENTER_TOP) {
      if (up > 0) up--;
      else if (shelter > 0 && mayShelter(state, i, b)) {
        shelter--;
        order.auto = insideAuto(state, i);
      } else continue;
    } else if (shelter > 0) shelter--;
    else if (up > 0 && garrisonRoom(b) > 0 && canGarrison(state, i)) {
      up--;
      order.auto = ENTER_TOP;
    } else continue;
    giveOrder(state, i, order, o.queued === true);
    sent++;
  }
  if (tried > 0 && sent === 0) alert(state, o.player, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} is full.`);
}

/**
 * Workers to a farm, a mineshaft or a dock (Jade's Patch 5, CT-2): only as
 * many as it has places for, the nearest first; the rest keep what they were
 * doing. Shift-clicking several farms shares the workers out: one already
 * given a job by an earlier click is left to it.
 */
function applyAssign(state: SimState, o: Extract<Order, { kind: 'assign' }>, b: Building): void {
  const e = state.entities;
  let taken = 0;
  for (let j = 0; j < e.count; j++) if (e.hp[j]! > 0 && e.queue[j]!.some((q) => q.t === 'job' && q.b === b.id)) taken++;
  let room = levelSpec(b.kind, b.level).workers - taken;
  const [bx, bz] = buildingCentre(b);
  const workers = ownUnits(state, o.player, o.units)
    .filter((i) => e.kind[i] === UnitKind.Worker && !e.queue[i]!.some((q) => q.t === 'job' && (q.b === b.id || o.queued === true)))
    .sort((a, c) => dist2(e.x[a]!, e.z[a]!, bx, bz) - dist2(e.x[c]!, e.z[c]!, bx, bz) || a - c);
  if (workers.length === 0) return;
  if (room <= 0) {
    alert(state, o.player, `The ${buildingName(b.kind, b.level, b.variant).toLowerCase()} has all the workers it can take.`);
    return;
  }
  for (const i of workers) {
    if (room-- <= 0) break;
    giveOrder(state, i, { t: 'job', b: b.id }, o.queued === true);
  }
}

/** A worker sent to shelter by its player: in the dark it goes in for the night and comes out at dawn once no monster is near (Jade's Patch 4: any worker that retreated there at night); by day it stays until let out. */
function shelterAuto(state: SimState): number {
  return isDark(state.step) ? ENTER_NIGHT : 0;
}

/**
 * A targeted command pressed twice (Controls: "Double-tap for auto-target"):
 * each unit picks its own target instead of waiting for a click. Units with
 * nothing to pick are left as they were; the player hears why once.
 */
function pickOwn(state: SimState, player: number, units: number[], command: number, queued: boolean): void {
  const e = state.entities;
  let none = 0;
  const taken = new Map<number, number>();
  for (const i of units) {
    let u: UnitOrder | null = null;
    switch (command) {
      case PickOwn.Attack: {
        if (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Engine) break;
        const t = pickTarget(state, i, sightOf(state, i));
        if (t >= 0) u = { t: 'attack', id: e.id[t]! };
        break;
      }
      case PickOwn.Gather: {
        if (e.kind[i] !== UnitKind.Worker) break;
        const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
        const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
        // More of what it carries first, else the nearest node of anything.
        const n = (e.carryRes[i] !== NO_CARRY ? findNode(state, i, e.carryRes[i]!, cx, cz, NODE_SEARCH_COLUMNS) : null) ?? findNode(state, i, -1, cx, cz, NODE_SEARCH_COLUMNS);
        if (n) u = { t: 'gather', cx: n.cx, cz: n.cz, i: n.i };
        break;
      }
      case PickOwn.Enter: {
        if (e.kind[i] === UnitKind.Engine) break;
        // Workers shelter in the nearest building with room; everyone else goes up the nearest top with room.
        const worker = e.kind[i] === UnitKind.Worker;
        if (!worker && !canGarrison(state, i)) break;
        let best: Building | null = null;
        let bestD = 0;
        for (const b of state.buildings.list) {
          if (b.owner !== e.owner[i]) continue;
          const room = worker ? shelterRoom(b) : topRoom(state, b);
          if (room === 0) continue;
          if (!taken.has(b.id)) taken.set(b.id, worker ? shelteredIn(state, b.id).length : menOnTop(state, b.id).length);
          if (taken.get(b.id)! >= room) continue;
          const [bx, bz] = buildingCentre(b);
          const d = dist2(bx, bz, e.x[i]!, e.z[i]!);
          if (!best || d < bestD) {
            best = b;
            bestD = d;
          }
        }
        if (best) {
          taken.set(best.id, taken.get(best.id)! + 1);
          u = { t: 'enter', b: best.id, auto: worker ? shelterAuto(state) : ENTER_TOP };
        }
        break;
      }
      case PickOwn.Prospect:
        if (e.kind[i] === UnitKind.Worker) u = { t: 'prospect', x: floorDiv(e.x[i]!, WU_PER_COLUMN), z: floorDiv(e.z[i]!, WU_PER_COLUMN) };
        break;
    }
    if (u) giveOrder(state, i, u, queued);
    else none++;
  }
  if (none === 0 || units.length === 0) return;
  const why = ['No enemy in sight.', 'Nothing they can gather nearby.', 'No building with room for them.', 'Only workers prospect.'][command]!;
  alert(state, player, none === units.length ? why : `${why} (${none} of ${units.length})`);
}

/**
 * One stretch of a wall chain (Building placement: wall chains): every
 * column of the stretch that can take a wall goes into each worker's order
 * list from the anchor outward, as if each were placed with Shift. Columns
 * that cannot take one are skipped; the stretch stops where the stock, less
 * what the player's planned buildings will take, runs out. The cost is still
 * taken as each wall is started.
 */
function applyWallStretch(state: SimState, o: Extract<Order, { kind: 'wallStretch' }>): void {
  const e = state.entities;
  const spec = buildingSpec(o.building);
  // Walls a column at a time; the earth rampart a 2 x 2 chunk at a time (Patch 5).
  const size = chainPiece(spec);
  if (size === 0) return;
  const workers = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Worker);
  if (workers.length === 0) return;
  const why = buildRequirement(state, o.player, o.building);
  if (why) {
    alert(state, o.player, `${spec.name}: ${why}`);
    return;
  }
  // Without Shift the workers' own lists are about to be replaced, so only the other units' plans count.
  const queues: UnitOrder[][] = [];
  for (let j = 0; j < e.count; j++) if (e.owner[j] === o.player && (o.queued === true || !workers.includes(j))) queues.push(e.queue[j]!);
  const planned = plannedSpots(queues, (kind, x, z) => state.buildings.list.some((b) => b.owner === o.player && b.kind === kind && b.x === x && b.z === z));
  const owed = new Map<number, number>();
  for (const kind of planned.values()) for (const [r, n] of buildCost(state, o.player, kind)) owed.set(r, (owed.get(r) ?? 0) + n);
  const cost = buildCost(state, o.player, o.building);
  const pool = state.players[o.player]!.pool;
  const { room, short } = stretchRoom((r) => haveOf(pool, r), owed, cost);
  const cells = stretchSpots(o.x, o.z, o.dir, o.length, size).slice(o.skip);
  const open: Array<[number, number]> = [];
  let blocked = 0;
  // A column planned already, or with a wall standing or started on it (a chain closing on its anchor, or joining a wall built before), is passed over without a word.
  const walled = (x: number, z: number): boolean => {
    const b = state.buildings.get(state.buildings.footprintAt(x, z));
    return b !== undefined && buildingSpec(b.kind).defence === 'wall';
  };
  for (const [x, z] of cells) {
    if (planned.has(`${x},${z}`) || walled(x, z)) continue;
    if (placementBlocked(state, o.player, o.building, x, z) !== Blocked.None) blocked++;
    else open.push([x, z]);
  }
  // Godmode: every wall of the stretch stands at once.
  if (isGod(state, o.player)) {
    for (const [x, z] of open) buildNow(state, o.player, o.building, 0, x, z);
    return;
  }
  const take = open.slice(0, room);
  for (const i of workers) take.forEach(([x, z], k) => giveOrder(state, i, { t: 'build', kind: o.building, variant: 0, x, z }, o.queued === true || k > 0));
  const at = { x: columnCentre(o.x), z: columnCentre(o.z) };
  const name = spec.name.toLowerCase();
  if (take.length < open.length) {
    const what = RESOURCES[short]!.name.toLowerCase();
    const text = take.length === 0 ? `Not enough ${what} for another ${name} (${costText(cost)} each, counting what is already planned).` : `Enough ${what} for ${take.length} of the ${open.length} walls in that stretch: they are planned from its start.`;
    state.events.push({ player: o.player, kind: 'alert', text, ...at });
  }
  if (blocked > 0) state.events.push({ player: o.player, kind: 'info', text: `${blocked === 1 ? 'One column' : `${blocked} columns`} of that stretch cannot take a wall (water, a building, a tree or rock, or unexplored land) and ${blocked === 1 ? 'was' : 'were'} skipped.`, ...at });
}

/** One stretch of a tunnel chain (Digging: tunnel chains): marked as a site and dug by the workers after what they were told before it, if queued. */
function applyTunnelStretch(state: SimState, o: Extract<Order, { kind: 'tunnelStretch' }>): void {
  const e = state.entities;
  const workers = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Worker);
  if (workers.length === 0) return;
  const site = markTunnelStretch(state, o.player, o.x, o.z, o.dir, o.length, o.level, o.level2);
  if (typeof site === 'string') {
    alert(state, o.player, site);
    return;
  }
  for (const i of workers) giveOrder(state, i, { t: 'dig', site: site.id, band: 0, miss: 0 }, o.queued === true);
}

/**
 * A right-click on loot (Jade's play-test notes: any living unit picks loot
 * up): the selected units nearest it with room in their bags walk over, as
 * many as it takes to carry it all; the rest stay where they are.
 */
function orderPickUp(state: SimState, o: Extract<Order, { kind: 'pickUp' }>): void {
  const k = lootIndex(state, o.target);
  if (k < 0) return;
  const units = ownUnits(state, o.player, o.units, true).filter((i) => canLoot(state, i));
  if (units.length === 0) {
    alert(state, o.player, 'Only living units pick up loot: an engine needs its crew to.');
    return;
  }
  const pickers = pickersFor(state, units, state.loot[k]!);
  if (pickers.length === 0) {
    alert(state, o.player, 'No room for it: their bags are full. Hand the loot in first (Return Cargo).');
    return;
  }
  for (const i of pickers) giveOrder(state, i, { t: 'loot', id: o.target, hand: 0, back: 0, x: 0, z: 0 }, o.queued === true);
}

/** Applies one step's orders, in the canonical order. */
export function applyOrders(state: SimState, orders: readonly Order[]): void {
  const e = state.entities;
  /** What a produce order was refused for this step, by player: said once. */
  const refused = new Set<string>();
  for (const o of canonicalOrders(orders)) {
    if (o.player >= state.players.length && o.kind !== 'terrain' && o.kind !== 'debugHarvest') continue;
    // An eliminated player gives no more orders.
    if (o.player < state.players.length && state.players[o.player]!.out) continue;
    // Patch 5 (Jade): a barn hand asks before an order takes him off his job (units/barn-hand.ts).
    const hands = barnHandsIn(state, o);
    switch (o.kind) {
      case 'move':
        applyMove(state, o);
        break;
      case 'stop':
        for (const i of withoutTheirCrew(state, ownUnits(state, o.player, o.units, true))) stopUnit(state, i);
        break;
      case 'follow':
        giveAll(state, o, (i) => (e.id[i] === o.target ? null : { t: 'follow', id: o.target }), true, true);
        break;
      case 'gather': {
        // Fish only woodsmen catch (Patch 5, Jade's FR-1): a fish stretch sends them fishing there, and workers nowhere.
        const v = nodeView(state, o.cx, o.cz, o.index);
        if (v && isFish(v.kind)) {
          woodsAt(state, o, 1, { cx: o.cx, cz: o.cz, i: o.index });
          break;
        }
        giveAll(state, o, () => ({ t: 'gather', cx: o.cx, cz: o.cz, i: o.index }), true);
        break;
      }
      case 'woods': {
        // The woodsman's Fish and Forage buttons (Patch 5): a picked spot must be what the button works.
        let spot: { cx: number; cz: number; i: number } | null = null;
        if (o.index >= 0) {
          const v = nodeView(state, o.cx, o.cz, o.index);
          if (!v || (o.what === 1 ? !isFish(v.kind) : !isForage(v.kind))) {
            alert(state, o.player, o.what === 1 ? 'Woodsmen fish at a stretch of water with fish in it.' : 'Woodsmen forage wild food: berries, mushrooms and the like.');
            break;
          }
          spot = { cx: o.cx, cz: o.cz, i: o.index };
        }
        woodsAt(state, o, o.what, spot, o.on);
        break;
      }
      case 'build': {
        const spec = buildingSpec(o.building);
        if (!spec.live || o.variant < 0 || o.variant >= Math.max(1, spec.variants?.length ?? 1)) break;
        if (isGod(state, o.player)) buildNow(state, o.player, o.building, o.variant, o.x, o.z);
        else giveAll(state, o, () => ({ t: 'build', kind: o.building, variant: o.variant, x: o.x, z: o.z }));
        break;
      }
      case 'work':
        if (ownBuilding(state, o.player, o.building)) giveAll(state, o, () => ({ t: 'work', b: o.building }));
        break;
      case 'repairAll':
        giveAll(state, o, () => ({ t: 'repairAll' }));
        break;
      case 'autoRepair':
        for (const i of ownUnits(state, o.player, o.units)) if (e.kind[i] === UnitKind.Worker) e.autoRepair[i] = o.on;
        break;
      case 'repairNearby':
        callRepairs(state, o.player);
        break;
      case 'returnCargo': {
        // A digger with a load goes back to its dig after, as a gatherer goes back to its node (Patch 4).
        const digs = new Map<number, UnitOrder>();
        if (o.queued !== true) {
          for (const i of ownUnits(state, o.player, o.units, true)) {
            const now = e.queue[i]![0];
            if (now?.t === 'dig' && e.carryAmt[i]! > 0) digs.set(i, now);
          }
        }
        // A gatherer takes its load (and its loot with it); any other unit hands in its loot.
        giveAll(state, o, (i) => (e.carryAmt[i]! > 0 ? { t: 'return' } : bagEmpty(state, i) ? null : { t: 'loot', id: 0, hand: 1, back: 0, x: 0, z: 0 }), true);
        for (const [i, dig] of digs) e.queue[i]!.push(dig);
        break;
      }
      case 'pickUp':
        orderPickUp(state, o);
        break;
      case 'unloadItem':
        // The unit inventory (Patch 5, GP-7): one good to the nearest drop-off that takes it, in front of what the unit was doing; -1 all it carries.
        for (const i of ownUnits(state, o.player, o.units)) {
          if (o.res >= 0 ? carriedOf(state, i, o.res) === 0 : e.carryAmt[i]! === 0 && bagEmpty(state, i)) continue;
          inFront(state, i, o.res >= 0 ? { t: 'loot', id: 0, hand: HAND_ONE + o.res, back: 0, x: 0, z: 0 } : e.carryAmt[i]! > 0 ? { t: 'return' } : { t: 'loot', id: 0, hand: 1, back: 0, x: 0, z: 0 });
        }
        break;
      case 'dropItem':
        for (const i of ownUnits(state, o.player, o.units)) dropItem(state, i, o.res);
        break;
      case 'equip':
        orderEquip(state, o.player, ownUnits(state, o.player, o.units), o.res);
        break;
      case 'shelter':
        swapShelter(state, o.player, o.building, o.unit);
        break;
      case 'forage': {
        const workers = ownUnits(state, o.player, o.units, true).filter((i) => e.kind[i] === UnitKind.Worker);
        if (workers.length === 0) alert(state, o.player, 'Only workers gather. Select workers.');
        // The player's word: set gathering in the dark, it works on all that night (Jade's GP-24).
        for (const i of workers) giveOrder(state, i, startForage(state, i, true), o.queued === true);
        break;
      }
      case 'dropoff': {
        // A shared unit drops off and shelters only at its own owner's buildings (and its load goes to its owner's pool).
        const b = state.buildings.get(o.building);
        // A loot bag alone goes in where everything is taken (Patch 5, GP-5: workers turn in all they carry).
        const all = b !== undefined && buildingSpec(b.kind).dropoff === 'all';
        if (b) giveAll(state, o, (i) => ((e.carryAmt[i]! > 0 || (all && !bagEmpty(state, i))) && e.owner[i] === b.owner ? { t: 'dropoff', b: o.building } : null), true);
        break;
      }
      case 'enter': {
        const b = state.buildings.get(o.building);
        if (!b) break;
        // Anyone on foot goes up a tower or a main base's top; workers shelter where there is no top (units/top.ts).
        // No engine goes in: the cannon ports are gone (Patch 5, CT-3).
        applyEnter(state, o, b);
        break;
      }
      case 'unload': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b) break;
        for (const j of unitsInside(state, b.id)) {
          if (o.unit !== 0 && e.id[j] !== o.unit) continue;
          // The fixed engine and its crew stay on the Citadel's platform (Patch 5).
          if (e.kind[j] === UnitKind.Engine || platformCrew(state, j)) continue;
          stopUnit(state, j);
        }
        break;
      }
      case 'assign': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && takesWorkers(b)) applyAssign(state, o, b);
        break;
      }
      case 'relight': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && buildingSpec(b.kind).light) giveAll(state, o, () => ({ t: 'relight', b: b.id }));
        break;
      }
      case 'trainRank': {
        const b = ownBuilding(state, o.player, o.building);
        // The Dreadnought has no ranks to train (Patch 5).
        if (b) giveAll(state, o, (i) => (b.kind === rankTrainedAt(e.kind[i]!) && !isDreadnought(e, i) ? { t: 'train', b: b.id } : null));
        break;
      }
      case 'retrain':
        // Only artillery crewmen retrain (Patch 3); the main base is picked when each sets off.
        giveAll(state, o, (i) => (isCrewman(state, i) ? { t: 'retrain', b: 0 } : null));
        break;
      case 'produce': {
        const b = usableBuilding(state, o.player, o.building);
        if (!b) break;
        // A stack (Scrap equipment, Patch 5) takes its whole count in one queue slot.
        if (stacks(o.product)) {
          const why = queueProduct(state, b, o.product, o.player, 0, o.count);
          if (why) alert(state, o.player, why);
          break;
        }
        for (let k = 0; k < Math.min(o.count, 5); k++) {
          const why = queueProduct(state, b, o.product, o.player);
          if (why) {
            // Several selected buildings each train one (Jade's Patch 5, GP-15): those the stock runs out for say why once.
            if (!refused.has(`${o.player}:${why}`)) alert(state, o.player, why);
            refused.add(`${o.player}:${why}`);
            break;
          }
        }
        break;
      }
      case 'stack': {
        const b = usableBuilding(state, o.player, o.building);
        if (!b) break;
        const why = queueStack(state, b, o.product, o.count, o.player);
        if (why) alert(state, o.player, why);
        break;
      }
      case 'fertilize': {
        const farms: Building[] = [];
        for (const id of o.buildings) {
          const b = usableBuilding(state, o.player, id);
          if (b && fertilizable(b) && !farms.includes(b)) farms.push(b);
        }
        if (o.auto === 1) {
          const on = farms.some((b) => b.boostAuto === 0);
          for (const b of farms) setAutoFertilize(b, on);
          break;
        }
        for (const b of farms) {
          const why = fertilize(state, b, o.player);
          if (why) {
            alert(state, o.player, why);
            break;
          }
        }
        break;
      }
      case 'tavernOpen': {
        const b = usableBuilding(state, o.player, o.building);
        if (b) setTavernOpen(b, o.open === 1, o.player);
        break;
      }
      case 'tavernWithdraw': {
        const b = usableBuilding(state, o.player, o.building);
        if (b && isTavern(b) && withdrawFunds(state, b, o.player) === 0) alert(state, o.player, 'There is no whole silver ingot in the till yet.');
        break;
      }
      case 'cancelProduce': {
        // At an inherited building a player cancels only what they queued.
        const b = usableBuilding(state, o.player, o.building);
        if (b && (b.owner === o.player || b.queue[o.index]?.by === o.player)) cancelProduct(state, b, o.index);
        break;
      }
      case 'upgrade': {
        const b = usableBuilding(state, o.player, o.building);
        if (b) applyUpgrade(state, b, o.player);
        break;
      }
      case 'cancelBuild': {
        const b = ownBuilding(state, o.player, o.building);
        if (b) applyCancelBuild(state, b);
        break;
      }
      case 'rally': {
        const b = usableBuilding(state, o.player, o.building);
        if (!b) break;
        const p = o.point === 'ground' ? { t: 'ground' as const, x: o.x, z: o.z } : o.point === 'unit' ? { t: 'unit' as const, id: o.id } : { t: 'node' as const, cx: o.x, cz: o.z, i: o.id };
        if (o.add && b.rally.length < 16) b.rally.push(p);
        else b.rally = [p];
        break;
      }
      case 'everyoneHome':
        everyoneHome(state, o.player);
        break;
      case 'terrain':
        state.world.editBox(o.x0, o.z0, o.x1, o.z1, o.bottom, o.top, o.material);
        break;
      case 'debugReveal':
        if (o.player < state.world.players) state.world.reveal(o.x, o.z, o.radius);
        break;
      case 'debugHarvest':
        state.world.harvest(o.cx, o.cz, o.index, o.amount, state.step);
        break;
      case 'attack': {
        const t = e.indexOf(o.target);
        if (t < 0 || e.hp[t]! <= 0) break;
        // Attack used on a unit always attacks (Jade's Patch 2): a foe, a wild animal, or one of the players'
        // own or allied units. A building the peoples left is broken down by workers for its materials; the
        // peoples at peace are attacked only once the player has declared war (the page asks first).
        giveAll(state, o, (i) => (i !== t && validTarget(state, i, t, true) ? { t: 'attack', id: o.target } : null), true, true);
        break;
      }
      case 'attackMove': {
        const units = withoutTheirCrew(state, ownUnits(state, o.player, o.units, true));
        const targets = groupTargets(state, units, clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU), clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU));
        units.forEach((i, k) => giveOrder(state, i, { t: 'attackMove', x: targets[k]![0], z: targets[k]![1] }, o.queued === true));
        break;
      }
      case 'patrol': {
        const units = withoutTheirCrew(state, ownUnits(state, o.player, o.units, true));
        const targets = groupTargets(state, units, clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU), clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU));
        units.forEach((i, k) => giveOrder(state, i, { t: 'patrol', x: targets[k]![0], z: targets[k]![1], x2: e.x[i]!, z2: e.z[i]!, leg: 0 }, o.queued === true));
        break;
      }
      case 'hold':
        for (const i of withoutTheirCrew(state, ownUnits(state, o.player, o.units, true))) {
          // Shift + H: hold once the earlier orders are done.
          if (o.queued === true && e.queue[i]!.length > 0) {
            giveOrder(state, i, { t: 'hold' }, true);
            continue;
          }
          stopUnit(state, i);
          giveOrder(state, i, { t: 'hold' }, false);
        }
        break;
      case 'pickOwn':
        pickOwn(state, o.player, ownUnits(state, o.player, o.units, true), o.command, o.queued === true);
        break;
      case 'upgradeKit':
        orderUpgrade(state, o.player, ownUnits(state, o.player, o.units), o.line, o.max === 1);
        break;
      case 'upgradeEquipment':
        orderUpgradeEquipment(state, o.player, ownUnits(state, o.player, o.units));
        break;
      case 'cart':
        orderCart(state, o.player, ownUnits(state, o.player, o.units), o.back === 1);
        break;
      case 'troopLock': {
        const b = usableBuilding(state, o.player, o.building);
        if (b) setKitLock(b, o.troop, o.lock);
        break;
      }
      case 'pace':
        for (const i of ownUnits(state, o.player, o.units, true)) if (hasRunButton(state, i)) e.running[i] = o.run === 1 ? 1 : 0;
        break;
      case 'lock':
        if (o.lock < 0 || o.lock > 2) break;
        for (const i of ownUnits(state, o.player, o.units)) if (e.kind[i] === UnitKind.Warrior) e.lock[i] = o.lock;
        break;
      case 'dig': {
        const workers = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Worker);
        if (workers.length === 0) break;
        const site = markSite(state, o.player, o.tunnel === 1 ? SiteKind.Tunnel : o.tunnel === 2 ? SiteKind.Up : SiteKind.Dig, o.x0, o.z0, o.x1, o.z1, o.level, o.level2, 0);
        if (typeof site === 'string') {
          alert(state, o.player, site);
          break;
        }
        for (const i of workers) giveOrder(state, i, { t: 'dig', site: site.id, band: 0, miss: 0 }, o.queued === true);
        break;
      }
      case 'wallStretch':
        applyWallStretch(state, o);
        break;
      case 'tunnelStretch':
        applyTunnelStretch(state, o);
        break;
      case 'hunt': {
        const t = o.target ? e.indexOf(o.target) : -1;
        if (o.target && (t < 0 || !huntable(state, t))) break;
        if (!o.target && !o.auto) break;
        const units = ownUnits(state, o.player, o.units, true);
        // Artillery crewmen stay by their engines (Patch 2); woodsmen forage and fish instead (Patch 5).
        const hunters = units.filter((i) => e.kind[i] === UnitKind.Warrior && !isCrewman(state, i) && !isWoodsman(e, i));
        if (hunters.length === 0) {
          alert(state, o.player, 'Only warriors hunt. Select warriors, and workers to haul the meat.');
          break;
        }
        // A picked animal with auto (Jade's Patch 5, CT-1: Hunt's left click) is chased first, then the hunt goes on.
        for (const i of hunters) giveOrder(state, i, { t: 'hunt', id: o.target, auto: o.auto ? 1 : 0, x: e.x[i]!, z: e.z[i]!, k: o.target && o.auto ? HUNT_PICKED : 0, kx: 0, kz: 0 }, o.queued === true);
        // Workers in the same selection follow and haul the carcasses, shared out between the hunters.
        units.filter((i) => e.kind[i] === UnitKind.Worker).forEach((i, k) => giveOrder(state, i, { t: 'hunt', id: e.id[hunters[k % hunters.length]!]!, auto: 0, x: 0, z: 0, k: 0, kx: 0, kz: 0 }, o.queued === true));
        break;
      }
      case 'tame': {
        const t = e.indexOf(o.target);
        const worker = ownUnits(state, o.player, o.units).find((i) => e.kind[i] === UnitKind.Worker);
        if (worker === undefined) break;
        const why = tameProblem(state, o.player, t);
        if (why) {
          alert(state, o.player, why);
          break;
        }
        giveOrder(state, worker, { t: 'tame', id: o.target }, o.queued === true);
        break;
      }
      case 'cast': {
        const s = SPELLS[o.spell];
        if (!s) break;
        const mages = ownUnits(state, o.player, o.units, true).filter((i) => e.kind[i] === UnitKind.Mage);
        if (mages.length === 0) break;
        const knowers = mages.filter((i) => knowsSpell(state, i, s.id));
        if (knowers.length === 0) {
          alert(state, o.player, spellProblem(state, mages.find((i) => e.school[i] === s.school) ?? mages[0]!, s.id));
          break;
        }
        // Double-tapped: every mage that knows it picks her own target.
        if (o.auto) {
          for (const i of knowers) giveOrder(state, i, { t: 'cast', spell: s.id, id: 0, x: 0, z: 0, auto: 1, until: 0 }, o.queued === true);
          break;
        }
        const t = o.target ? e.indexOf(o.target) : -1;
        if (o.target && (t < 0 || e.hp[t]! <= 0)) break;
        const tx = t >= 0 ? e.x[t]! : o.x;
        const tz = t >= 0 ? e.z[t]! : o.z;
        // One mage casts it (s): one with the mana and the spell ready, else the one ready soonest; the nearest breaks a tie.
        let best = -1;
        let bestKey = 0;
        let bestD = 0;
        for (const i of knowers) {
          const enough = e.mana[i]! >= s.mana * MANA_SCALE;
          const ready = Math.max(0, spellReadyAt(state, i, s.id) - state.step);
          const key = (enough ? 0 : 1 << 24) + ready;
          const d = dist2(e.x[i]!, e.z[i]!, tx, tz);
          if (best < 0 || key < bestKey || (key === bestKey && d < bestD)) {
            best = i;
            bestKey = key;
            bestD = d;
          }
        }
        if (e.mana[best]! < s.mana * MANA_SCALE) {
          alert(state, o.player, `Not enough mana for ${s.name} (${s.mana}).`);
          break;
        }
        giveOrder(state, best, { t: 'cast', spell: s.id, id: t >= 0 ? o.target : 0, x: clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU), z: clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU), auto: 0, until: 0 }, o.queued === true);
        break;
      }
      case 'eat':
        // Only the hurt eat (Jade's Patch 5, GP-27).
        giveAll(state, o, (i) => ((e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Mage) && eatNeed(e.hp[i]!, e.maxHp[i]!) > 0 ? { t: 'eat', b: o.building } : null));
        break;
      case 'hitch': {
        // An engine takes a horse or an ox to haul it (Table 2f); target 0 lets it go.
        const engines = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Engine);
        if (engines.length > 0) {
          const a = o.target ? e.indexOf(o.target) : -1;
          const why = o.target ? haulWhy(state, engines[0]!, a) : '';
          if (why) alert(state, o.player, why);
          else hitchEngine(state, engines[0]!, a);
          break;
        }
        const workers = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Worker);
        if (o.target === 0) {
          for (const i of workers) unhitch(state, i);
          break;
        }
        const w = workers[0];
        if (w === undefined) break;
        const why = hitchProblem(state, w, e.indexOf(o.target));
        if (why) {
          alert(state, o.player, why);
          break;
        }
        giveOrder(state, w, { t: 'hitch', id: o.target }, o.queued === true);
        break;
      }
      case 'prospect':
        giveAll(state, o, (i) => (e.kind[i] === UnitKind.Worker ? { t: 'prospect', x: o.x, z: o.z } : null));
        break;
      case 'crew': {
        const i = e.indexOf(o.target);
        // Only artillery crewmen crew engines (Jade, Patch 2); anyone else in the selection is left as it was.
        const crew = ownUnits(state, o.player, o.units).filter((j) => isCrewman(state, j));
        const why = crew.length === 0 ? 'Only artillery crewmen crew engines and cannons. Train them at an Artillery workshop.' : crewWhy(state, crew[0]!, i);
        if (why) {
          alert(state, o.player, why);
          break;
        }
        for (const j of crew) if (!crewWhy(state, j, i)) giveOrder(state, j, { t: 'crew', id: o.target }, o.queued === true);
        break;
      }
      case 'mend': {
        const i = e.indexOf(o.target);
        const workers = ownUnits(state, o.player, o.units).filter((j) => e.kind[j] === UnitKind.Worker);
        const why = workers.length === 0 ? 'Only workers repair engines.' : mendWhy(state, workers[0]!, i);
        if (why) {
          alert(state, o.player, why);
          break;
        }
        for (const j of workers) giveOrder(state, j, { t: 'mend', id: o.target }, o.queued === true);
        break;
      }
      case 'rations': {
        const p = state.players[o.player]!;
        p.rations = o.rations;
        const text = ['Rations: everyone eats.', 'Rations: only the troops eat. The workers will starve.', 'Rations: only the workers eat. The troops will starve and research stops.'][o.rations]!;
        if (o.rations !== Rations.Everyone) alert(state, o.player, text);
        else state.events.push({ player: o.player, kind: 'info', text });
        break;
      }
      case 'dontEat': {
        if (!FOODS.includes(o.res as Res)) break;
        state.players[o.player]!.kept[o.res] = o.on ? 1 : 0;
        break;
      }
      case 'debugGive':
        // "Meat" and "fish" stand for every kind in a recipe and are never held themselves.
        if (o.res < RESOURCES.length && !isAnyRes(o.res)) state.players[o.player]!.pool[o.res] = state.players[o.player]!.pool[o.res]! + o.count;
        break;
      case 'debugSpawn':
        if (o.mob >= 0 && o.mob < MOBS.length) addMob(state, o.mob, o.player, o.x, o.z, clockAt(state.step).cycle);
        break;
      case 'debugThreat':
        debugThreat(state, o.player, o.what, o.x, o.z);
        break;
      case 'debugGod':
        setGod(state, o.player, o.on === 1);
        break;
      case 'debugPlace':
        godPlace(state, o.player, o.what, o.x, o.z);
        break;
      case 'debugTool':
        if (o.tool === DebugTool.MaxRank) maxRanks(state, o.player);
        else if (o.tool === DebugTool.HealAll) healAll(state, o.player);
        else if (o.tool === DebugTool.ClearFoes) clearFoes(state, o.player, o.x, o.z);
        else if (o.tool === DebugTool.ElfKingdom) showElves(state, o.player);
        break;
      case 'debugKill':
        killUnits(state, o.units);
        break;
      case 'tradeOffer':
      case 'tradeTake':
      case 'tradeWithdraw':
      case 'declareWar':
      case 'surrender':
      case 'reparations':
      case 'hire':
      case 'debugPeoples':
        peoplesOrder(state, o);
        break;
      case 'shareControl': {
        // Allies panel: "Share control" lets that player command this player's units.
        if (o.with === o.player || o.with < 0 || o.with >= state.players.length) break;
        const ps = state.players[o.player]!;
        ps.share = o.on ? ps.share | (1 << o.with) : ps.share & ~(1 << o.with);
        break;
      }
      case 'sendResources':
        sendResources(state, o.player, o.to, o.res, o.amount);
        break;
      case 'answer':
        answerQuestion(state, o);
        break;
      case 'greyed':
        askGreyed(state, o);
        break;
      case 'leave':
        // Gone for good, the host carrying on without them: shared out as if eliminated.
        eliminate(state, o.player, `Player ${o.player + 1} has left the game.`);
        break;
    }
    if (hands.length > 0) keepBarnHands(state, hands);
  }
}

/**
 * Send resources (Allies panel): an amount of one resource from the pool to
 * another player still in the game. It arrives at once, with no cooldown, no
 * limit and nothing lost; more than the pool holds sends what there is.
 */
function sendResources(state: SimState, from: number, to: number, res: number, amount: number): void {
  const target = state.players[to];
  if (to === from || !target || target.out || res < 0 || res >= RESOURCES.length || amount <= 0) return;
  const pool = state.players[from]!.pool;
  const n = Math.min(amount, pool[res]!);
  if (n <= 0) return;
  pool[res] = pool[res]! - n;
  target.pool[res] = target.pool[res]! + n;
  const name = RESOURCES[res]!.name.toLowerCase();
  state.events.push({ player: from, kind: 'info', text: `Sent ${n} ${name} to Player ${to + 1}.` });
  state.events.push({ player: to, kind: 'info', text: `Player ${from + 1} sent you ${n} ${name}.` });
}
