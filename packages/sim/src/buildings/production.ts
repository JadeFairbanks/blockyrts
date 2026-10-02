// What buildings do each step: production queues (training workers and
// warriors, planks at the lumber mill, research at a Scholar's Lodge,
// smelting, crafting and cooking: Table 2a, 2b, 6), farm yields (Table 6)
// and supply (Table 4). Production costs are taken when an item is queued and
// refunded in full if it is cancelled (Controls: Production queues).

import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { costText, foodInPool, payNutrition, Res, type Cost } from '../economy/resources.ts';
import { UnitKind, WALK_SPEED_WU, standY, type SimState } from '../state.ts';
import { Band } from '../world/layout.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { Act, assigned, columnCentre, exitColumn, giveOrder, isFarm } from '../units/behaviour.ts';
import { BuildingKind, buildingName, buildingSpec, FARM_FALLOW_STEPS, FARM_TIER_PER_MILLE, levelSpec, PLANK_STEPS, QUEUE_LIMIT, WORKER_FOOD, WORKER_TRAIN_STEPS } from './data.ts';
import { buildingCentre } from './lights.ts';
import { bandAt } from './placement.ts';
import { CRAFT_PRODUCT, Product, RECIPE_PRODUCT, REFURBISH_PRODUCT, RESEARCH_PRODUCT, type Building, type RallyPoint } from './store.ts';
import { affordableRecipe, hasResearch, Item, ITEMS, itemSpec, Made, missingResearch, RESEARCH, Research, type ItemSpec, type ResearchSpec } from '../combat/items.ts';
import { cookSteps, payableInputs, RECIPES, recipeLevelAt, recipeSpec } from './recipes.ts';
import { addWarrior } from '../state.ts';

export interface ProductSpec {
  product: Product;
  name: string;
  /** Command card letter, from the name (Command card and hotkeys). */
  key: string;
  /** Time with one worker, or with the building alone where no hands are needed; cooking and research vary by building (productSteps). */
  steps: number;
  /** A fixed cost; workers cost nutrition instead, drawn from every food in turn. */
  cost: Cost;
  food: number;
  tooltip: string;
  /** Crafting and refurbishing: the item; research: the step; processing and cooking: the recipe. */
  item?: number;
  research?: number;
  recipe?: number;
  /** Equipment from the stock it takes (a new warrior's club; fire arrows' arrows; a refurbished item). */
  items?: ReadonlyArray<readonly [number, number]>;
}

/** Table 7: a new warrior costs 30 food and a hardwood club from the stock, and takes 45 s. */
export const WARRIOR_FOOD = 30;
export const WARRIOR_TRAIN_STEPS = 45 * STEPS_PER_SECOND;
/** Refurbishing is 10 times faster than making the item (Refurbishing). */
export const REFURBISH_SPEEDUP = 10;
/** Research speed by the facility's level, in quarters: Lodge 1, Scriptorium 1.25, Grand Academy 1.5 (Table 4). */
const RESEARCH_QUARTERS: readonly number[] = [4, 5, 6];

export const PRODUCTS: readonly ProductSpec[] = [
  { product: Product.Worker, name: 'Worker', key: 'W', steps: WORKER_TRAIN_STEPS, cost: [], food: WORKER_FOOD, tooltip: 'A new worker with hardwood tools (Table 7). Needs free supply.' },
  { product: Product.PlanksSoftwood, name: 'Planks from softwood', key: 'P', steps: PLANK_STEPS, cost: [[Res.SoftwoodLumber, 1]], food: 0, tooltip: '1 softwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
  { product: Product.PlanksHardwood, name: 'Planks from hardwood', key: 'H', steps: PLANK_STEPS, cost: [[Res.HardwoodLumber, 1]], food: 0, tooltip: '1 hardwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
];

/** Every product's description: training, planks, research, crafting, refurbishing and recipes. */
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
  if (product >= REFURBISH_PRODUCT && product < RECIPE_PRODUCT) {
    const it = itemSpec(product - REFURBISH_PRODUCT);
    return { product, name: `Refurbish ${it.name.toLowerCase()}`, key: '', steps: Math.max(1, floorDiv(it.steps, REFURBISH_SPEEDUP)), cost: [], food: 0, item: it.id, items: [[it.id, it.makes > 1 ? it.makes : 1]], tooltip: 'Takes one from the stock and gives back all the resources it was made from.' };
  }
  const r = recipeSpec(product - RECIPE_PRODUCT);
  return { product, name: r.name, key: '', steps: r.steps, cost: r.inputs[0] ?? [], food: 0, recipe: r.id, tooltip: `Makes ${costText(r.outputs)}.` };
}

/** Whether a building kind makes an item. */
function madeAtKind(it: ItemSpec, kind: number): number {
  for (const [k, l] of it.madeAt) if (k === kind) return l;
  return 0;
}

/** Items a building kind crafts (K), in craft-menu order. */
export function craftable(kind: number = BuildingKind.MainBase): number[] {
  return ITEMS.filter((it) => it.craftSlot >= 0 && madeAtKind(it, kind) > 0).sort((a, b) => a.craftSlot - b.craftSlot).map((it) => it.id);
}

/** Recipes a building kind works, in table order. */
export function recipesAt(kind: number): number[] {
  return RECIPES.filter((r) => recipeLevelAt(r, kind) > 0).map((r) => r.id);
}

/** Buildings whose crafting and processing need assigned workers inside (s): the rest work alone. */
export function needsHands(kind: number): boolean {
  return kind === BuildingKind.Forge || kind === BuildingKind.Kiln || kind === BuildingKind.Tannery || kind === BuildingKind.HerbalistHut || kind === BuildingKind.Workshop || kind === BuildingKind.LumberMill;
}

/** Everything a building can be asked to make, whatever it lacks now (the reasons come from productProblem). */
export function productsOf(b: Building): Product[] {
  if (!b.complete) return [];
  const out: Product[] = [];
  if (b.kind === BuildingKind.MainBase) out.push(Product.Worker, Product.Warrior);
  else if (b.kind === BuildingKind.Barracks) out.push(Product.Warrior);
  else if (b.kind === BuildingKind.ScholarsLodge) {
    for (const r of RESEARCH) if (r.id !== Research.None) out.push(RESEARCH_PRODUCT + r.id);
  } else if (buildingSpec(b.kind).trainsWorkers) out.push(Product.Worker);
  if (b.kind === BuildingKind.LumberMill) out.push(Product.PlanksSoftwood, Product.PlanksHardwood);
  for (const id of recipesAt(b.kind)) out.push(RECIPE_PRODUCT + id);
  for (const id of craftable(b.kind)) out.push(CRAFT_PRODUCT + id);
  for (const id of craftable(b.kind)) out.push(REFURBISH_PRODUCT + id);
  return out;
}

/** Whether a research step is done or already queued somewhere. */
function researchQueued(state: SimState, player: number, r: number): boolean {
  return state.buildings.list.some((b) => b.owner === player && b.queue.some((q) => q.product === RESEARCH_PRODUCT + r));
}

/** The best finished building of a kind a player has (its level), or 0. */
export function bestLevel(state: SimState, player: number, kind: number): number {
  let best = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.complete && b.kind === kind && b.level > best) best = b.level;
  return best;
}

/** Why a research step cannot start yet, or ''. */
export function researchProblem(state: SimState, player: number, r: ResearchSpec): string {
  const p = state.players[player]!;
  if (r.later) return r.later;
  if (hasResearch(p.research, r.id)) return 'Already researched.';
  if (researchQueued(state, player, r.id)) return 'Being researched.';
  if (r.forge && bestLevel(state, player, BuildingKind.Forge) < r.forge) return `Needs a ${buildingName(BuildingKind.Forge, r.forge, 0)}.`;
  if (r.after && !hasResearch(p.research, r.after)) return `Needs ${RESEARCH[r.after]!.name} researched first.`;
  if (r.made && (p.made & r.made) === 0) return r.made === Made.TinIngot ? 'Smelt a tin ingot first.' : 'Smelt pig iron first.';
  return '';
}

/** The level a building needs to make a craft or recipe, as a reason, or ''. */
function levelProblem(b: Building, level: number): string {
  if (level === 0) return 'This building cannot make that.';
  if (b.level < level) return `Needs a ${buildingName(b.kind, level, b.variant)}.`;
  return '';
}

/**
 * Why a product cannot be queued at a building now, or '' if it can:
 * the building's level, research, a workshop in town, the stock, the pool.
 */
export function productProblem(state: SimState, b: Building, product: Product): string {
  if (!productsOf(b).includes(product)) return 'This building cannot make that.';
  const player = state.players[b.owner]!;
  const pool = player.pool;
  const spec = productSpec(product);
  if (spec.research !== undefined) {
    const why = researchProblem(state, b.owner, RESEARCH[spec.research]!);
    if (why) return why;
  } else if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    if (r.later) return r.later;
    const why = levelProblem(b, recipeLevelAt(r, b.kind));
    if (why) return why;
    if (!hasResearch(player.research, r.research as Research)) return `Needs ${RESEARCH[r.research]!.name} researched first.`;
    if (!payableInputs(r, pool)) return `Not enough resources (${costText(r.inputs[0] ?? [])}).`;
    return '';
  } else if (spec.item !== undefined && product < REFURBISH_PRODUCT) {
    const it = itemSpec(spec.item);
    const why = levelProblem(b, madeAtKind(it, b.kind));
    if (why) return why;
    const missing = missingResearch(player.research, it);
    if (missing !== Research.None) return `Needs ${RESEARCH[missing]!.name} researched first.`;
    if (it.needsWorkshop && bestLevel(state, b.owner, BuildingKind.Workshop) < it.needsWorkshop) return `Needs a ${buildingName(BuildingKind.Workshop, it.needsWorkshop, 0)} in the town.`;
  }
  for (const [it, n] of spec.items ?? []) if (player.items[it]! < n) return `Needs ${n === 1 ? 'a' : n} ${itemSpec(it).name.toLowerCase()} in the equipment stock.`;
  if (spec.item !== undefined && product < REFURBISH_PRODUCT) {
    if (!affordableRecipe(itemSpec(spec.item), pool)) return `Not enough resources (${costText(itemSpec(spec.item).recipes[0] ?? [])}).`;
  } else if (spec.food > 0) {
    if (foodInPool(pool, player.dontEat) < spec.food) return `Not enough food (${spec.food} food).`;
  } else {
    for (const [res, n] of spec.cost) if (pool[res]! < n) return `Not enough resources (${costText(spec.cost)}).`;
  }
  return '';
}

/** Steps an item takes at this building (research by facility level is in its rate, not here). */
export function productSteps(state: SimState, b: Building, product: Product): number {
  const spec = productSpec(product);
  if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    return r.cooked ? cookSteps(r, b.level) : r.steps;
  }
  // A Workshop of tier 2 or more cuts bow staves for the Big House: bows take half the time (s).
  if (product === CRAFT_PRODUCT + Item.Bow && bestLevel(state, b.owner, BuildingKind.Workshop) >= 2) return floorDiv(spec.steps, 2);
  if (product === Product.Worker || product === Product.Warrior) return spec.steps;
  return spec.steps;
}

/** Supply a player has: the supply of every finished building at its current level (Table 4). */
export function supplyCap(state: SimState, player: number): number {
  let n = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.complete) n += levelSpec(b.kind, b.level).supply;
  return n;
}

/** Research facilities a player has, finished or not. */
export function researchFacilities(state: SimState, player: number): number {
  let n = 0;
  for (const b of state.buildings.list) if (b.owner === player && b.kind === BuildingKind.ScholarsLodge) n++;
  return n;
}

/** Supply in use: one per worker and warrior, one per research facility, plus each unit being trained (animals use none). */
export function supplyUsed(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior)) n++;
  for (const b of state.buildings.list) {
    if (b.owner !== player) continue;
    if (b.kind === BuildingKind.ScholarsLodge && b.complete) n++;
    const h = b.queue[0];
    if (h && (h.product === Product.Worker || h.product === Product.Warrior) && h.progress > 0) n++;
  }
  return n;
}

/** Queues an item, paying for it now. Returns '' or why it could not be queued. */
export function queueProduct(state: SimState, b: Building, product: Product): string {
  if (!productsOf(b).includes(product)) return 'This building cannot make that.';
  if (b.queue.length >= QUEUE_LIMIT) return 'The queue is full.';
  const why = productProblem(state, b, product);
  if (why) return why;
  const spec = productSpec(product);
  const player = state.players[b.owner]!;
  const pool = player.pool;
  let paid: Array<[number, number]>;
  if (spec.recipe !== undefined) {
    paid = payableInputs(recipeSpec(spec.recipe), pool)!.map(([r, n]) => [r, n]);
    for (const [res, n] of paid) pool[res] = pool[res]! - n;
  } else if (spec.item !== undefined && product < REFURBISH_PRODUCT) {
    paid = affordableRecipe(itemSpec(spec.item), pool)!.map(([r, n]) => [r, n]);
    for (const [res, n] of paid) pool[res] = pool[res]! - n;
  } else if (spec.food > 0) {
    const taken = payNutrition(pool, spec.food, player.dontEat);
    if (!taken) return `Not enough food (${spec.food} food).`;
    paid = taken;
  } else {
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

/** A research step, a crafted batch, a refurbished item or a recipe is done. */
function finishProduct(state: SimState, b: Building, product: number): void {
  const player = state.players[b.owner]!;
  const spec = productSpec(product);
  const [x, z] = buildingCentre(b);
  if (spec.research !== undefined) {
    player.research |= 1 << spec.research;
    state.events.push({ player: b.owner, kind: 'info', text: `Research done: ${spec.name}.`, x, z });
    return;
  }
  if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    for (const [res, n] of r.outputs) player.pool[res] = player.pool[res]! + n;
    if (r.made) player.made |= r.made;
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
        // Research loads at its facility's pace, and stops while the troops go unfed (Research; Food).
        // Smithing, processing and crafting at a forge, kiln, tannery, herbalist or workshop need hands inside (s);
        // the Manufactory works twice as fast. The Big House and cooking need none.
        let rate = 1;
        let whole = productSteps(state, b, head.product);
        if (head.product < CRAFT_PRODUCT) {
          rate = state.players[b.owner]!.starveTroops > 0 ? 0 : RESEARCH_QUARTERS[b.level - 1]!;
          whole *= 4;
        } else if (needsHands(b.kind)) {
          rate = workersAt(state, b) * (b.kind === BuildingKind.Workshop && b.level >= 4 ? 2 : 1);
        }
        head.progress += rate;
        if (head.progress >= whole) {
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
