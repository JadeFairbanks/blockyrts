// What buildings do each step: production queues (training workers at the
// Big House and farms, planks at the lumber mill), farm yields (Table 6) and
// supply (Table 4). Production costs are taken when an item is queued and
// refunded in full if it is cancelled (Controls: Production queues).

import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { costText, payNutrition, Res, type Cost } from '../economy/resources.ts';
import { UnitKind, WALK_SPEED_WU, standY, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { Act, assigned, columnCentre, exitColumn, giveOrder, isFarm } from '../units/behaviour.ts';
import { BuildingKind, buildingName, buildingSpec, FARM_FALLOW_STEPS, FARM_TIER_PER_MILLE, levelSpec, PLANK_STEPS, QUEUE_LIMIT, WORKER_FOOD, WORKER_TRAIN_STEPS } from './data.ts';
import { buildingCentre } from './lights.ts';
import { bandAt } from './placement.ts';
import { CRAFT_PRODUCT, Product, REFURBISH_PRODUCT, RESEARCH_PRODUCT, type Building, type RallyPoint } from './store.ts';
import { affordableRecipe, hasResearch, Item, ITEMS, itemSpec, RESEARCH, Research } from '../combat/items.ts';
import { addWarrior } from '../state.ts';

export interface ProductSpec {
  product: Product;
  name: string;
  /** Command card letter, from the name (Command card and hotkeys). */
  key: string;
  steps: number;
  /** A fixed cost; workers cost nutrition instead, drawn from every food in turn. */
  cost: Cost;
  food: number;
  tooltip: string;
  /** Crafting and refurbishing: the item; research: the step. */
  item?: number;
  research?: number;
  /** Equipment from the stock it takes (a new warrior's club; fire arrows' arrows; a refurbished item). */
  items?: ReadonlyArray<readonly [number, number]>;
}

/** Table 7: a new warrior costs 30 food and a hardwood club from the stock, and takes 45 s. */
export const WARRIOR_FOOD = 30;
export const WARRIOR_TRAIN_STEPS = 45 * STEPS_PER_SECOND;
/** Refurbishing is 10 times faster than making the item (Refurbishing). */
export const REFURBISH_SPEEDUP = 10;

export const PRODUCTS: readonly ProductSpec[] = [
  { product: Product.Worker, name: 'Worker', key: 'W', steps: WORKER_TRAIN_STEPS, cost: [], food: WORKER_FOOD, tooltip: 'A new worker with hardwood tools (Table 7). Needs free supply.' },
  { product: Product.PlanksSoftwood, name: 'Planks from softwood', key: 'P', steps: PLANK_STEPS, cost: [[Res.SoftwoodLumber, 1]], food: 0, tooltip: '1 softwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
  { product: Product.PlanksHardwood, name: 'Planks from hardwood', key: 'H', steps: PLANK_STEPS, cost: [[Res.HardwoodLumber, 1]], food: 0, tooltip: '1 hardwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
];

/** Every product's description: training, planks, research, crafting and refurbishing. */
export function productSpec(product: Product): ProductSpec {
  const fixed = PRODUCTS[product];
  if (fixed) return fixed;
  if (product === Product.Warrior) {
    return { product, name: 'Warrior', key: 'A', steps: WARRIOR_TRAIN_STEPS, cost: [], food: WARRIOR_FOOD, items: [[Item.Club, 1]], tooltip: 'A new warrior (Table 7): 30 food and a hardwood club from the equipment stock. Needs free supply.' };
  }
  if (product >= RESEARCH_PRODUCT && product < CRAFT_PRODUCT) {
    const r = RESEARCH[product - RESEARCH_PRODUCT]!;
    return { product, name: r.name, key: r.key, steps: r.steps, cost: r.cost, food: 0, research: r.id, tooltip: `Research. Opens ${r.opens}` };
  }
  if (product >= CRAFT_PRODUCT && product < REFURBISH_PRODUCT) {
    const it = itemSpec(product - CRAFT_PRODUCT);
    const made = it.makes > 1 ? ` (${it.makes})` : '';
    return { product, name: `${it.name}${made}`, key: '', steps: it.steps, cost: it.recipes[0] ?? [], food: 0, item: it.id, items: it.itemInputs ?? [], tooltip: `Made into the equipment stock.` };
  }
  const it = itemSpec(product - REFURBISH_PRODUCT);
  return { product, name: `Refurbish ${it.name.toLowerCase()}`, key: '', steps: Math.max(1, floorDiv(it.steps, REFURBISH_SPEEDUP)), cost: [], food: 0, item: it.id, items: [[it.id, it.makes > 1 ? it.makes : 1]], tooltip: 'Takes one from the stock and gives back all the resources it was made from.' };
}

/** Items the Big House crafts (K), in craft-menu order. */
export function craftable(): number[] {
  return ITEMS.filter((it) => it.craftSlot >= 0).sort((a, b) => a.craftSlot - b.craftSlot).map((it) => it.id);
}

/** What a building can produce now. */
export function productsOf(b: Building): Product[] {
  if (!b.complete) return [];
  if (b.kind === BuildingKind.MainBase) {
    const out: Product[] = [Product.Worker, Product.Warrior];
    for (const id of craftable()) out.push(CRAFT_PRODUCT + id, REFURBISH_PRODUCT + id);
    return out;
  }
  if (b.kind === BuildingKind.Barracks) return [Product.Warrior];
  if (b.kind === BuildingKind.ScholarsLodge) return [RESEARCH_PRODUCT + Research.FlintTools];
  if (buildingSpec(b.kind).trainsWorkers) return [Product.Worker];
  if (b.kind === BuildingKind.LumberMill) return [Product.PlanksSoftwood, Product.PlanksHardwood];
  return [];
}

/** Whether a research step is done or already queued somewhere. */
function researchTaken(state: SimState, player: number, r: number): boolean {
  if (hasResearch(state.players[player]!.research, r as Research)) return true;
  return state.buildings.list.some((b) => b.owner === player && b.queue.some((q) => q.product === RESEARCH_PRODUCT + r));
}

/** Supply a player has: the supply of every finished building at its current level (Table 4). */
export function supplyCap(state: SimState, player: number): number {
  let n = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.complete) n += levelSpec(b.kind, b.level).supply;
  return n;
}

/** Supply in use: one per unit, plus each worker already being trained. */
export function supplyUsed(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.kind[i] !== UnitKind.Wanderer) n++;
  for (const b of state.buildings.list) {
    const h = b.queue[0];
    if (b.owner === player && h && (h.product === Product.Worker || h.product === Product.Warrior) && h.progress > 0) n++;
  }
  return n;
}

/** Queues an item, paying for it now. Returns '' or why it could not be queued. */
export function queueProduct(state: SimState, b: Building, product: Product): string {
  if (!productsOf(b).includes(product)) return 'This building cannot make that.';
  if (b.queue.length >= QUEUE_LIMIT) return 'The queue is full.';
  const spec = productSpec(product);
  const player = state.players[b.owner]!;
  const pool = player.pool;
  let paid: Array<[number, number]>;
  if (spec.research !== undefined && researchTaken(state, b.owner, spec.research)) return 'That is already researched or being researched.';
  if (spec.item !== undefined && product < REFURBISH_PRODUCT && !hasResearch(player.research, itemSpec(spec.item).research as Research)) return `${itemSpec(spec.item).name} needs ${RESEARCH[itemSpec(spec.item).research]!.name} researched first.`;
  for (const [it, n] of spec.items ?? []) if (player.items[it]! < n) return `Needs ${n === 1 ? 'a' : n} ${itemSpec(it).name.toLowerCase()} in the equipment stock.`;
  if (spec.item !== undefined && product < REFURBISH_PRODUCT) {
    const recipe = affordableRecipe(itemSpec(spec.item), pool);
    if (!recipe) return `Not enough resources (${costText(itemSpec(spec.item).recipes[0] ?? [])}).`;
    paid = recipe.map(([r, n]) => [r, n]);
    for (const [res, n] of paid) pool[res] = pool[res]! - n;
  } else if (spec.food > 0) {
    const taken = payNutrition(pool, spec.food);
    if (!taken) return `Not enough food (${spec.food} food).`;
    paid = taken;
  } else {
    for (const [res, n] of spec.cost) if (pool[res]! < n) return `Not enough resources (${costText(spec.cost)}).`;
    paid = spec.cost.map(([r, n]) => [r, n]);
    for (const [res, n] of paid) pool[res] = pool[res]! - n;
  }
  for (const [it, n] of spec.items ?? []) player.items[it] = player.items[it]! - n;
  b.queue.push({ product, paid, progress: 0 });
  return '';
}

/** Cancels a queued item and refunds what was paid, in full. */
export function cancelProduct(state: SimState, b: Building, index: number): void {
  const item = b.queue[index];
  if (!item) return;
  const player = state.players[b.owner]!;
  for (const [res, n] of item.paid) player.pool[res] = player.pool[res]! + n;
  for (const [it, n] of productSpec(item.product).items ?? []) player.items[it] = player.items[it]! + n;
  b.queue.splice(index, 1);
}

/** The orders a rally route gives a new unit. */
function rallyOrders(points: readonly RallyPoint[]): UnitOrder[] {
  return points.map((p): UnitOrder => {
    if (p.t === 'ground') return { t: 'move', x: p.x, z: p.z };
    if (p.t === 'unit') return { t: 'follow', id: p.id };
    return { t: 'gather', cx: p.cx, cz: p.cz, i: p.i };
  });
}

function spawnWorker(state: SimState, b: Building): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const id = state.nextEntityId++;
  const i = state.entities.add(id, b.owner, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Worker);
  state.entities.heading[i] = 32768;
  const orders = rallyOrders(b.rally);
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: b.owner, kind: 'info', text: 'A new worker is ready.', x, z });
}

function spawnWarrior(state: SimState, b: Building): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const i = addWarrior(state, b.owner, x, z);
  state.entities.weapon[i] = Item.Club;
  state.entities.heading[i] = 32768;
  const orders = rallyOrders(b.rally).filter((o) => o.t !== 'gather');
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: b.owner, kind: 'info', text: 'A new warrior is ready.', x, z });
}

/** A research step, a crafted batch or a refurbished item is done. */
function finishProduct(state: SimState, b: Building, product: number): void {
  const player = state.players[b.owner]!;
  const spec = productSpec(product);
  const [x, z] = buildingCentre(b);
  if (spec.research !== undefined) {
    player.research |= 1 << spec.research;
    state.events.push({ player: b.owner, kind: 'info', text: `Research done: ${spec.name}.`, x, z });
    return;
  }
  const it = itemSpec(spec.item!);
  if (product < REFURBISH_PRODUCT) {
    player.items[it.id] = player.items[it.id]! + it.makes;
    state.events.push({ player: b.owner, kind: 'info', text: `${it.name} made${it.makes > 1 ? ` (${it.makes})` : ''}.`, x, z });
    return;
  }
  // Refurbished: everything it was made from comes back (the first recipe), the time does not.
  for (const [res, n] of it.recipes[0] ?? []) player.pool[res] = player.pool[res]! + n;
  for (const [inner, n] of it.itemInputs ?? []) player.items[inner] = player.items[inner]! + n;
  state.events.push({ player: b.owner, kind: 'info', text: `${it.name} refurbished.`, x, z });
}

/** Workers at work in a building now (farmers in the field or sheltering in their farmhouse, mill hands inside). */
export function workersAt(state: SimState, b: Building): number {
  const e = state.entities;
  let n = 0;
  for (const j of assigned(state, b.id)) if (e.act[j] === Act.Work) n++;
  return Math.min(n, levelSpec(b.kind, b.level).workers);
}

/** Crop fields yield half outside the Heartland and nothing in the Barrens or Deadlands (Table 6); per mille. */
export function bandYieldPerMille(band: Band): number {
  if (band === Band.Heartland) return 1000;
  if (band === Band.Fringe || band === Band.Deepwoods) return 500;
  return 0;
}

/** Not state: each building's band, which never changes. */
const bandCache = new WeakMap<Building, Band>();

/** Items a farm makes per farmer-day at its level and place, in thousandths. */
export function farmRatePerMille(state: SimState, b: Building): number {
  const spec = buildingSpec(b.kind);
  const crop = spec.crops?.[b.variant];
  if (!crop) return 0;
  let band = bandCache.get(b);
  if (band === undefined) {
    const [x, z] = buildingCentre(b);
    band = bandAt(state, floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN));
    bandCache.set(b, band);
  }
  const bandPm = spec.cropBands ? bandYieldPerMille(band) : 1000;
  return floorDiv(crop.perDay * FARM_TIER_PER_MILLE[b.level - 1]! * bandPm, 1000);
}

/** One step of every building's own work. */
export function updateBuildings(state: SimState): void {
  for (const b of state.buildings.list) {
    if (!b.complete) continue;
    const pool = state.players[b.owner]!.pool;
    const head = b.queue[0];
    if (head) {
      if (head.product === Product.Worker || head.product === Product.Warrior) {
        const warrior = head.product === Product.Warrior;
        if (head.progress === 0 && supplyUsed(state, b.owner) >= supplyCap(state, b.owner)) {
          if ((b.alerted & 1) === 0) {
            b.alerted |= 1;
            const [x, z] = buildingCentre(b);
            state.events.push({ player: b.owner, kind: 'alert', text: `Not enough supply to train a ${warrior ? 'warrior' : 'worker'}. Build or upgrade farms.`, x, z });
          }
        } else {
          b.alerted &= ~1;
          head.progress++;
          if (head.progress >= (warrior ? WARRIOR_TRAIN_STEPS : WORKER_TRAIN_STEPS)) {
            b.queue.shift();
            if (warrior) spawnWarrior(state, b);
            else spawnWorker(state, b);
          }
        }
      } else if (head.product >= RESEARCH_PRODUCT) {
        // Research, crafting and refurbishing need no hands (s).
        head.progress++;
        const spec = productSpec(head.product);
        if (head.progress >= spec.steps) {
          b.queue.shift();
          finishProduct(state, b, head.product);
        }
      } else {
        // Planks: the mill works only with hands inside, faster with more of them.
        const n = workersAt(state, b);
        head.progress += n;
        if (head.progress >= PLANK_STEPS) {
          b.queue.shift();
          pool[Res.Planks] = pool[Res.Planks]! + (b.level >= 2 ? 2 : 1);
        }
      }
    }
    // Farms: yield goes straight into the pool, one item at a time, after the first 2 fallow days.
    if (isFarm(b.kind) && state.step >= b.doneAt + FARM_FALLOW_STEPS) {
      const n = workersAt(state, b);
      if (n > 0) {
        b.farmAcc += farmRatePerMille(state, b) * n;
        const whole = CYCLE_STEPS * 1000;
        if (b.farmAcc >= whole) {
          const crop = buildingSpec(b.kind).crops![b.variant]!;
          const items = floorDiv(b.farmAcc, whole);
          pool[crop.res] = pool[crop.res]! + items;
          b.farmAcc -= items * whole;
        }
      }
    }
  }
}

/** A short line for the building panel: what it is doing. */
export function buildingStatus(state: SimState, b: Building): string {
  if (!b.complete) return `Under construction: ${floorDiv(b.progress * 100, levelSpec(b.kind, 1).ws * 20)}%`;
  if (b.upgrading) return `Upgrading to ${buildingName(b.kind, b.upgrading, b.variant)}: ${floorDiv(b.upProgress * 100, levelSpec(b.kind, b.upgrading).ws * 20)}%`;
  if (isFarm(b.kind)) {
    const left = b.doneAt + FARM_FALLOW_STEPS - state.step;
    if (left > 0) return `Lying fallow for ${floorDiv(left + 1199, 1200)} more minutes`;
    return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} farmers at work`;
  }
  return '';
}
