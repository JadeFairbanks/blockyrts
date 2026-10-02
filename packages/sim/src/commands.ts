// Applying player orders to the state (Controls: Unit orders, Queuing orders
// with Shift, Production queues, Rally points, Semi-automation). Orders are
// checked here against the state: a player only orders their own units and
// buildings, and units that cannot carry an order out ignore it.

import { BuildingKind, buildingSpec, CANCEL_REFUND_PER_MILLE, levelSpec } from './buildings/data.ts';
import { buildingCentre, dist2 } from './buildings/lights.ts';
import { mainBaseLevel, waterBeside } from './buildings/placement.ts';
import { cancelProduct, queueProduct } from './buildings/production.ts';
import { type Building } from './buildings/store.ts';
import { canAfford, costText, FOODS, pay, refund, type Res, RESOURCES, shortOf } from './economy/resources.ts';
import { clamp, floorDiv, isqrt, WORLD_EDGE_WU, WU_PER_COLUMN, WU_PER_METRE } from './fixed.ts';
import { PERSON } from './nav/grid.ts';
import { pointGoal } from './nav/path.ts';
import { canonicalOrders, type Order } from './orders.ts';
import { SiteKind, UnitKind, type SimState } from './state.ts';
import { hostile, huntable } from './combat/combat.ts';
import { Rations } from './economy/food.ts';
import { hitchProblem, tameProblem, unhitch } from './units/field.ts';
import { canGarrison, garrisonRoom, salvageable } from './combat/fight.ts';
import { ITEM_COUNT, RESEARCH, SLOT_COUNT } from './combat/items.ts';
import { addMob } from './combat/mob-ai.ts';
import { MOBS } from './combat/mobs.ts';
import { clockAt } from './clock.ts';
import { equipBest, handPick, SKILL_TRAINING } from './units/gear.ts';
import { markSite } from './units/dig.ts';
import { Act, columnCentre, giveOrder, leaveBuilding, resetWalk, rankTrainedAt, shelterRoom, stopUnit, takesWorkers, unitsInside } from './units/behaviour.ts';
import type { UnitOrder } from './units/unit-orders.ts';
import { debugThreat } from './threats/debug.ts';
import { peoplesOrder } from './peoples/orders.ts';
import { knowsSpell, spellProblem, spellReadyAt } from './magic/cast.ts';
import { MANA_SCALE, SPELLS } from './magic/spells.ts';
import { freeHorse, mountProblem } from './mounts/riding.ts';
import { crewWhy, haulWhy, hitchEngine, mendWhy, portWhy } from './siege/engines.ts';

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
    if (i < 0 || seen.has(i) || e.owner[i] !== player || e.kind[i] === UnitKind.Wanderer || e.kind[i] === UnitKind.Animal) continue;
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
  if (next.research && (state.players[b.owner]!.research & (1 << next.research)) === 0) return `Needs ${RESEARCH[next.research]!.name} researched first.`;
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
    refund(pool, levelSpec(b.kind, 1).cost.map(([r, n]) => [r, n * b.costMul] as const), CANCEL_REFUND_PER_MILLE);
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
    // An eliminated player gives no more orders.
    if (o.player < state.players.length && state.players[o.player]!.out) continue;
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
        if (!spec.live || spec.site || o.variant < 0 || o.variant >= Math.max(1, spec.crops?.length ?? spec.variants?.length ?? 1)) break;
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
        if (!b) break;
        // A cannon is hauled up into a Citadel's cannon port (Table 4).
        const cannons = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Engine);
        if (cannons.length > 0) {
          const why = portWhy(state, cannons[0]!, b);
          if (why) alert(state, o.player, why);
          else for (const i of cannons) giveOrder(state, i, { t: 'port', b: b.id }, o.queued === true);
        }
        // Workers shelter; ranged warriors and mages garrison towers and parapets.
        giveAll(state, o, (i) => (e.kind[i] !== UnitKind.Engine && (e.kind[i] === UnitKind.Worker ? shelterRoom(b) > 0 : garrisonRoom(b) > 0 && canGarrison(state, i)) ? { t: 'enter', b: b.id, auto: 0 } : null));
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
        if (b) giveAll(state, o, (i) => (b.kind === rankTrainedAt(e.kind[i]!) ? { t: 'train', b: b.id } : null));
        break;
      }
      case 'produce': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b) break;
        for (let k = 0; k < o.count; k++) {
          const why = queueProduct(state, b, o.product);
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
      case 'attack': {
        const t = e.indexOf(o.target);
        if (t < 0 || e.hp[t]! <= 0) break;
        // Animals are killed with an attack order first (Gathering resources); a wild one is fair game.
        // A building the peoples left is broken down by workers for its materials.
        giveAll(state, o, (i) => (hostile(state, i, t) || huntable(state, t) || (e.kind[i] === UnitKind.Worker && salvageable(state, t)) ? { t: 'attack', id: o.target } : null));
        break;
      }
      case 'attackMove': {
        const units = ownUnits(state, o.player, o.units);
        const targets = groupTargets(state, units, clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU), clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU));
        units.forEach((i, k) => giveOrder(state, i, { t: 'attackMove', x: targets[k]![0], z: targets[k]![1] }, o.queued === true));
        break;
      }
      case 'patrol': {
        const units = ownUnits(state, o.player, o.units);
        const targets = groupTargets(state, units, clamp(o.x, -WORLD_EDGE_WU, WORLD_EDGE_WU), clamp(o.z, -WORLD_EDGE_WU, WORLD_EDGE_WU));
        units.forEach((i, k) => giveOrder(state, i, { t: 'patrol', x: targets[k]![0], z: targets[k]![1], x2: e.x[i]!, z2: e.z[i]!, leg: 0 }, o.queued === true));
        break;
      }
      case 'hold':
        for (const i of ownUnits(state, o.player, o.units)) {
          stopUnit(state, i);
          giveOrder(state, i, { t: 'hold' }, false);
        }
        break;
      case 'equipBest':
        equipBest(state, o.player, ownUnits(state, o.player, o.units));
        break;
      case 'equipItem': {
        const [i] = ownUnits(state, o.player, [o.unit]);
        if (i === undefined || o.slot < 0 || o.slot >= SLOT_COUNT || o.item < 0 || o.item >= ITEM_COUNT) break;
        handPick(state, i, o.slot, o.item);
        break;
      }
      case 'autoEquip':
        state.players[o.player]!.autoEquip = o.on ? 1 : 0;
        break;
      case 'lock':
        if (o.lock < 0 || o.lock > 2) break;
        for (const i of ownUnits(state, o.player, o.units)) if (e.kind[i] === UnitKind.Warrior) e.lock[i] = o.lock;
        break;
      case 'dig':
      case 'earthwork': {
        const workers = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Worker);
        if (workers.length === 0) break;
        const kind = o.kind === 'dig' ? (o.tunnel ? SiteKind.Tunnel : SiteKind.Dig) : ([SiteKind.Bank, SiteKind.Ramp, SiteKind.Bank, SiteKind.LumberRamp, SiteKind.StoneRamp][o.variant] ?? SiteKind.Bank);
        const axis = o.kind === 'earthwork' ? o.axis & 1 : 0;
        const site = markSite(state, o.player, kind, o.x0, o.z0, o.x1, o.z1, o.level, o.level2, axis);
        if (typeof site === 'string') {
          alert(state, o.player, site);
          break;
        }
        for (const i of workers) giveOrder(state, i, { t: 'dig', site: site.id }, o.queued === true);
        break;
      }
      case 'trainSkill': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b || !SKILL_TRAINING[o.skill] || b.kind !== SKILL_TRAINING[o.skill]!.at) break;
        giveAll(state, o, (i) => (e.kind[i] === UnitKind.Warrior && (e.skills[i]! & o.skill) === 0 ? { t: 'skill', b: b.id, skill: o.skill } : null));
        break;
      }
      case 'hunt': {
        const t = o.target ? e.indexOf(o.target) : -1;
        if (o.target && (t < 0 || !huntable(state, t))) break;
        if (!o.target && !o.auto) break;
        const units = ownUnits(state, o.player, o.units);
        const hunters = units.filter((i) => e.kind[i] === UnitKind.Warrior);
        if (hunters.length === 0) {
          alert(state, o.player, 'Only warriors hunt. Select warriors, and workers to haul the meat.');
          break;
        }
        for (const i of hunters) giveOrder(state, i, { t: 'hunt', id: o.target, auto: o.auto ? 1 : 0, x: e.x[i]!, z: e.z[i]! }, o.queued === true);
        // Workers in the same selection follow and haul the carcasses, shared out between the hunters.
        units.filter((i) => e.kind[i] === UnitKind.Worker).forEach((i, k) => giveOrder(state, i, { t: 'hunt', id: e.id[hunters[k % hunters.length]!]!, auto: 0, x: 0, z: 0 }, o.queued === true));
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
        const mages = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Mage);
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
        giveAll(state, o, (i) => (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Mage ? { t: 'eat', b: o.building } : null));
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
      case 'mount': {
        // Each rider walks to its own horse: the one named, else the nearest free one (Table 14).
        const riders = ownUnits(state, o.player, o.units).filter((i) => e.kind[i] === UnitKind.Warrior && e.mount[i] === 0);
        const taken = new Set<number>();
        for (const i of riders) {
          const h = o.target && taken.size === 0 ? e.indexOf(o.target) : freeHorse(state, o.player, e.x[i]!, e.z[i]!, taken);
          const why = mountProblem(state, i, h);
          if (why) {
            alert(state, o.player, why);
            break;
          }
          taken.add(e.id[h]!);
          giveOrder(state, i, { t: 'mount', id: e.id[h]! }, o.queued === true);
        }
        break;
      }
      case 'dismount':
        giveAll(state, o, (i) => (e.mount[i] !== 0 ? { t: 'dismount' } : null));
        break;
      case 'crew': {
        const i = e.indexOf(o.target);
        const crew = ownUnits(state, o.player, o.units).filter((j) => e.kind[j] === UnitKind.Warrior);
        const why = crew.length === 0 ? 'Only warriors crew engines and cannons.' : crewWhy(state, crew[0]!, i);
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
      case 'haul': {
        const b = ownBuilding(state, o.player, o.building);
        if (!b || !b.complete || b.kind !== BuildingKind.Mineshaft) break;
        giveAll(state, o, (i) => (e.kind[i] === UnitKind.Worker ? { t: 'haul', b: b.id } : null));
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
        const k = FOODS.indexOf(o.res as Res);
        if (k < 0) break;
        const p = state.players[o.player]!;
        p.dontEat = o.on ? p.dontEat | (1 << k) : p.dontEat & ~(1 << k);
        break;
      }
      case 'debugGive':
        if (o.item > 0 && o.item < ITEM_COUNT) state.players[o.player]!.items[o.item] = state.players[o.player]!.items[o.item]! + o.count;
        break;
      case 'debugSpawn':
        if (o.mob >= 0 && o.mob < MOBS.length) addMob(state, o.mob, o.player, o.x, o.z, clockAt(state.step, state.blood).cycle);
        break;
      case 'debugThreat':
        debugThreat(state, o.player, o.what, o.x, o.z);
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
    }
  }
}
