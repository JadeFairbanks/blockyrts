// Applying player orders to the state (Controls: Unit orders, Queuing orders
// with Shift, Production queues, Rally points, Semi-automation). Orders are
// checked here against the state: a player only orders their own units and
// buildings, and units that cannot carry an order out ignore it.

import { BuildingKind, buildingSpec, CANCEL_REFUND_PER_MILLE, levelSpec } from './buildings/data.ts';
import { buildingCentre, dist2 } from './buildings/lights.ts';
import { mainBaseLevel, waterBeside } from './buildings/placement.ts';
import { cancelProduct, queueProduct } from './buildings/production.ts';
import { type Building } from './buildings/store.ts';
import { canAfford, costText, pay, refund, RESOURCES, shortOf } from './economy/resources.ts';
import { clamp, floorDiv, isqrt, WORLD_EDGE_WU, WU_PER_COLUMN, WU_PER_METRE } from './fixed.ts';
import { PERSON } from './nav/grid.ts';
import { pointGoal } from './nav/path.ts';
import { canonicalOrders, type Order } from './orders.ts';
import { UnitKind, type SimState } from './state.ts';
import { Act, columnCentre, giveOrder, leaveBuilding, resetWalk, shelterRoom, stopUnit, takesWorkers, unitsInside } from './units/behaviour.ts';
import type { UnitOrder } from './units/unit-orders.ts';

/** Groups this large share one flow field (technical decision 6). */
export const FLOW_FIELD_GROUP = 8;
/** Spacing of a group spread round its target (s): 1.2 m. */
const SPREAD_WU = 12 * floorDiv(WU_PER_METRE, 10);

function ownBuilding(state: SimState, player: number, id: number): Building | undefined {
  const b = state.buildings.get(id);
  return b && b.owner === player ? b : undefined;
}

function alert(state: SimState, player: number, text: string): void {
  state.events.push({ player, kind: 'alert', text });
}

/** The player's units among the ids, by index, that are workers (every unit the player has in M2 is one). */
function ownUnits(state: SimState, player: number, ids: readonly number[]): number[] {
  const e = state.entities;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const i = e.indexOf(id);
    if (i < 0 || seen.has(i) || e.owner[i] !== player || e.kind[i] === UnitKind.Wanderer) continue;
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
  const units = ownUnits(state, o.player, o.units);
  if (units.length === 0) return;
  const tx = clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU);
  const tz = clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU);
  const targets = groupTargets(state, units, tx, tz);
  units.forEach((i, k) => giveOrder(state, i, { t: 'move', x: targets[k]![0], z: targets[k]![1] }, o.queued === true));
  if (o.queued || units.length < FLOW_FIELD_GROUP) return;
  // A big group shares one flow field: each member's path is found inside the field's corridor now.
  const e = state.entities;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const i of units) {
    const cx = floorDiv(e.x[i]!, WU_PER_COLUMN);
    const cz = floorDiv(e.z[i]!, WU_PER_COLUMN);
    x0 = Math.min(x0, cx);
    z0 = Math.min(z0, cz);
    x1 = Math.max(x1, cx);
    z1 = Math.max(z1, cz);
  }
  const goal = pointGoal(floorDiv(tx, WU_PER_COLUMN), floorDiv(tz, WU_PER_COLUMN));
  const field = state.paths.flowField(goal, { x0, z0, x1, z1 });
  units.forEach((i, k) => {
    const [gx, gz] = targets[k]!;
    const r = state.paths.findWithField(field, PERSON, floorDiv(e.x[i]!, WU_PER_COLUMN), floorDiv(e.z[i]!, WU_PER_COLUMN), pointGoal(floorDiv(gx, WU_PER_COLUMN), floorDiv(gz, WU_PER_COLUMN)));
    const pts = r.points.map(columnCentre);
    if (r.reached) {
      if (pts.length > 0) {
        pts[pts.length - 2] = gx;
        pts[pts.length - 1] = gz;
      } else pts.push(gx, gz);
    }
    if (pts.length === 0) return;
    e.path[i] = pts;
    e.pathAt[i] = 0;
    e.pathOk[i] = r.reached ? 1 : 0;
    e.targetX[i] = pts[pts.length - 2]!;
    e.targetZ[i] = pts[pts.length - 1]!;
  });
}

function giveAll(state: SimState, o: { player: number; units: number[]; queued?: boolean }, make: (i: number) => UnitOrder | null): void {
  for (const i of ownUnits(state, o.player, o.units)) {
    const u = make(i);
    if (u) giveOrder(state, i, u, o.queued === true);
  }
}

/** Upgrades a building to its next level: paid now, then built by workers. Returns '' or why not. */
export function upgradeProblem(state: SimState, b: Building): string {
  const spec = buildingSpec(b.kind);
  if (!b.complete) return 'It is not finished yet.';
  if (b.upgrading) return 'It is already being upgraded.';
  const next = spec.levels[b.level];
  if (!next) return 'It is at its highest level.';
  if (next.needs) return next.needs;
  if (next.needsBase > Math.max(mainBaseLevel(state, b.owner), b.kind === BuildingKind.MainBase ? b.level : 0)) return `Needs a level ${next.needsBase} main base.`;
  if (b.kind === BuildingKind.LumberMill && b.level === 1 && !waterBeside(state, b)) return 'The waterwheel needs a stream beside the mill.';
  const pool = state.players[b.owner]!.pool;
  if (!canAfford(pool, next.cost)) return `Not enough ${RESOURCES[shortOf(pool, next.cost)]!.name.toLowerCase()} (${costText(next.cost)}).`;
  return '';
}

function applyUpgrade(state: SimState, b: Building): void {
  const why = upgradeProblem(state, b);
  if (why) {
    alert(state, b.owner, why);
    return;
  }
  const next = levelSpec(b.kind, b.level + 1);
  pay(state.players[b.owner]!.pool, next.cost);
  b.upgrading = b.level + 1;
  b.upProgress = 0;
  const [x, z] = buildingCentre(b);
  state.events.push({ player: b.owner, kind: 'info', text: `Upgrade to ${next.name} paid for. Right-click it with workers to build it.`, x, z });
}

function applyCancelBuild(state: SimState, b: Building): void {
  const pool = state.players[b.owner]!.pool;
  if (!b.complete) {
    refund(pool, levelSpec(b.kind, 1).cost, CANCEL_REFUND_PER_MILLE);
    for (const j of unitsInside(state, b.id)) leaveBuilding(state, j);
    state.buildings.remove(b.id, (key) => state.world.touchNav(key));
    return;
  }
  if (b.upgrading) {
    refund(pool, levelSpec(b.kind, b.upgrading).cost, CANCEL_REFUND_PER_MILLE);
    b.upgrading = 0;
    b.upProgress = 0;
  }
}

/** Everyone Home: units without a standing job go to the nearest shelter with room; farmers go to their own farm. */
export function everyoneHome(state: SimState, player: number): void {
  const e = state.entities;
  const shelters = state.buildings.list.filter((b) => b.owner === player && shelterRoom(b) > 0);
  const taken = new Map<number, number>();
  for (const b of shelters) taken.set(b.id, unitsInside(state, b.id).length);
  for (let i = 0; i < e.count; i++) {
    if (e.owner[i] !== player || e.kind[i] === UnitKind.Wanderer || e.inside[i] !== 0) continue;
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
    // Sheltering goes in front of what the unit was doing; at daybreak it comes out and carries on.
    e.queue[i]!.unshift({ t: 'enter', b: best.id, auto: 1 });
    e.act[i] = Act.Start;
    e.timer[i] = 0;
    resetWalk(state, i);
  }
}

/** Applies one step's orders, in the canonical order. */
export function applyOrders(state: SimState, orders: readonly Order[]): void {
  const e = state.entities;
  for (const o of canonicalOrders(orders)) {
    if (o.player >= state.players.length && o.kind !== 'terrain' && o.kind !== 'debugHarvest') continue;
    switch (o.kind) {
      case 'move':
        applyMove(state, o);
        break;
      case 'stop':
        for (const i of ownUnits(state, o.player, o.units)) stopUnit(state, i);
        break;
      case 'follow':
        giveAll(state, o, (i) => (e.id[i] === o.target ? null : { t: 'follow', id: o.target }));
        break;
      case 'gather':
        giveAll(state, o, () => ({ t: 'gather', cx: o.cx, cz: o.cz, i: o.index }));
        break;
      case 'build': {
        const spec = buildingSpec(o.building);
        if (!spec.live || o.variant < 0 || o.variant >= Math.max(1, spec.crops?.length ?? 1)) break;
        giveAll(state, o, () => ({ t: 'build', kind: o.building, variant: o.variant, x: o.x, z: o.z }));
        break;
      }
      case 'work':
        if (ownBuilding(state, o.player, o.building)) giveAll(state, o, () => ({ t: 'work', b: o.building }));
        break;
      case 'repairAll':
        giveAll(state, o, () => ({ t: 'repairAll' }));
        break;
      case 'returnCargo':
        giveAll(state, o, (i) => (e.carryAmt[i]! > 0 ? { t: 'return' } : null));
        break;
      case 'dropoff':
        if (ownBuilding(state, o.player, o.building)) giveAll(state, o, (i) => (e.carryAmt[i]! > 0 ? { t: 'dropoff', b: o.building } : null));
        break;
      case 'enter': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && shelterRoom(b) > 0) giveAll(state, o, () => ({ t: 'enter', b: b.id, auto: 0 }));
        break;
      }
      case 'unload': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b) break;
        for (const j of unitsInside(state, b.id)) {
          if (o.unit !== 0 && e.id[j] !== o.unit) continue;
          stopUnit(state, j);
        }
        break;
      }
      case 'assign': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && takesWorkers(b)) giveAll(state, o, () => ({ t: 'job', b: b.id }));
        break;
      }
      case 'refuel': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && buildingSpec(b.kind).light) giveAll(state, o, () => ({ t: 'refuel', b: b.id }));
        break;
      }
      case 'trainRank': {
        const b = ownBuilding(state, o.player, o.building);
        if (b && b.kind === BuildingKind.MainBase) giveAll(state, o, () => ({ t: 'train', b: b.id }));
        break;
      }
      case 'produce': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b) break;
        for (let k = 0; k < o.count; k++) {
          const why = queueProduct(state, b, o.product as 0 | 1 | 2);
          if (why) {
            alert(state, o.player, why);
            break;
          }
        }
        break;
      }
      case 'cancelProduce': {
        const b = ownBuilding(state, o.player, o.building);
        if (b) cancelProduct(state, b, o.index);
        break;
      }
      case 'upgrade': {
        const b = ownBuilding(state, o.player, o.building);
        if (b) applyUpgrade(state, b);
        break;
      }
      case 'cancelBuild': {
        const b = ownBuilding(state, o.player, o.building);
        if (b) applyCancelBuild(state, b);
        break;
      }
      case 'rally': {
        const b = ownBuilding(state, o.player, o.building);
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
        if (o.player < state.world.players) state.world.reveal(o.player, o.x, o.z, o.radius);
        break;
      case 'debugHarvest':
        state.world.harvest(o.cx, o.cz, o.index, o.amount, state.step);
        break;
    }
  }
}
