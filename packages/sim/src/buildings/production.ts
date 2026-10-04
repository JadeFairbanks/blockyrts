// What buildings do each step: production queues (training workers,
// troops and mages: Table 7; planks at the lumber mill, research at a
// Scholar's Lodge, smelting and cooking: Table 2a, 2b, 6), farm yields
// (Table 6) and supply (Table 4). Production costs are taken when an item is
// queued and refunded in full if it is cancelled (Controls: Production
// queues). A new unit pays its food and its kit (Troops and gear).

import { floorDiv, STEPS_PER_SECOND, WU_PER_COLUMN } from '../fixed.ts';
import { CYCLE_STEPS } from '../rules.ts';
import { costText, Res, RESOURCES, type Cost } from '../economy/resources.ts';
import { eatableFood, giveFood, payFood } from '../economy/food.ts';
import { meatOf, payAny } from '../economy/food-kinds.ts';
import { addWarrior, UnitKind, WALK_SPEED_WU, standY, type SimState } from '../state.ts';
import { Band, BAND_NAMES } from '../world/layout.ts';
import type { UnitOrder } from '../units/unit-orders.ts';
import { Act, assigned, columnCentre, exitColumn, giveOrder, isFarm } from '../units/behaviour.ts';
import { BuildingKind, buildingName, buildingSpec, FARM_HARVEST_STEPS, FARM_TIER_PER_MILLE, levelSpec, PLANK_STEPS, QUEUE_LIMIT, WORKER_FOOD, WORKER_TRAIN_STEPS } from './data.ts';
import { buildingCentre } from './lights.ts';
import { bandAt } from './placement.ts';
import { ENGINE_PRODUCT, Product, RECIPE_PRODUCT, RESEARCH_PRODUCT, SLAUGHTER_PRODUCT, TROOP_PRODUCT, troopOf, troopProduct, type Building, type QueueItem, type RallyPoint } from './store.ts';
import { engineSpec, PLAYER_ENGINES } from '../siege/data.ts';
import { spawnEngine } from '../siege/engines.ts';
import { Species, speciesSpec } from '../animals/species.ts';
import { addAnimal, animalsAt, layingHens } from '../animals/animals.ts';
import { dockStretch, RATING_NAMES, workedOut } from './mining.ts';
import { hasResearch, Made, RESEARCH, Research, type ResearchSpec } from '../combat/items.ts';
import { cookSteps, payableInputs, RECIPES, recipeLevelAt, recipeSpec } from './recipes.ts';
import { addMage, MAGE_FOOD, MAGE_MAIN_BASE_LEVEL, MAGE_TRAIN_STEPS } from '../magic/mages.ts';
import { School } from '../magic/spells.ts';
import { Role } from '../threats/types.ts';
import {
  kitName,
  mainCost,
  pieceProblem,
  piecesTime,
  planPieces,
  ROBE_KITS,
  TOOL_KITS,
  TOP_TIER,
  TRAINING,
  Troop,
  TROOP_KEYS,
  TROOP_NAMES,
  troopPieces,
  WAND_KITS,
  weaponPiece,
  weaponTiers,
  type Piece,
} from '../units/kits.ts';
import { Mount } from '../mounts/data.ts';
import { seatOnHorse } from '../mounts/riding.ts';

export interface ProductSpec {
  product: Product;
  name: string;
  /** Command card letter, from the name (Command card and hotkeys). */
  key: string;
  /** Time with one worker, or with the building alone where no hands are needed; cooking and research vary by building (productSteps). */
  steps: number;
  /** A fixed cost; for a new unit, the main way of paying its kit (the kit's pieces may be paid other ways: pieces). */
  cost: Cost;
  /** Food, as nutrition drawn from every food in turn: new units. */
  food: number;
  tooltip: string;
  /** Research: the step; processing and cooking: the recipe. */
  research?: number;
  recipe?: number;
  /** Slaughter: the species. */
  slaughter?: number;
  /** A siege engine or cannon (siege/data.ts Engine). */
  engine?: number;
  /** A new troop: its type and tiers. */
  troop?: { troop: number; w: number; a: number };
  /** A new unit's kit (units/kits.ts), paid when queued, whichever way the stock allows. */
  pieces?: readonly Piece[];
}

/** Slaughter takes 10 s at the farm (Table 6). */
export const SLAUGHTER_STEPS = 10 * STEPS_PER_SECOND;
/** Animals a livestock farm slaughters (Table 6): cattle, chickens and oxen. */
export const SLAUGHTERED: readonly number[] = [Species.Cattle, Species.Chicken, Species.Ox];
/** Research speed by the facility's level, in quarters: Lodge 1, Scriptorium 1.25, Grand Academy 1.5 (Table 4). */
const RESEARCH_QUARTERS: readonly number[] = [4, 5, 6];

/** A new worker's kit (Table 7): a tier 1 tool kit. */
const WORKER_KIT: readonly Piece[] = [TOOL_KITS[1]!];
/** A new mage's kit (Table 7): a hazel wand and a homespun robe. */
const MAGE_KIT: readonly Piece[] = [WAND_KITS[1]!, ROBE_KITS[1]!];
const kitSteps = (pieces: readonly Piece[]): number => piecesTime(pieces) * STEPS_PER_SECOND;

export const PRODUCTS: readonly ProductSpec[] = [
  { product: Product.Worker, name: 'Worker', key: 'W', steps: WORKER_TRAIN_STEPS + kitSteps(WORKER_KIT), cost: mainCost(WORKER_KIT), pieces: WORKER_KIT, food: WORKER_FOOD, tooltip: 'A new worker with a hardwood tool kit (Table 7). Needs free supply.' },
  { product: Product.PlanksSoftwood, name: 'Planks from softwood', key: 'P', steps: PLANK_STEPS, cost: [[Res.SoftwoodLumber, 1]], food: 0, tooltip: '1 softwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
  { product: Product.PlanksHardwood, name: 'Planks from hardwood', key: 'H', steps: PLANK_STEPS, cost: [[Res.HardwoodLumber, 1]], food: 0, tooltip: '1 hardwood lumber makes 1 plank (2 with the waterwheel). Needs workers in the mill.' },
];

/** Every product's description: training, planks, research, recipes, slaughter and engines. */
export function productSpec(product: Product): ProductSpec {
  const fixed = PRODUCTS[product];
  if (fixed) return fixed;
  if (product === Product.SupportMage || product === Product.BattleMage) {
    const support = product === Product.SupportMage;
    return {
      product, name: support ? 'Support mage' : 'Battle mage', key: support ? 'S' : 'M', steps: MAGE_TRAIN_STEPS + kitSteps(MAGE_KIT), cost: mainCost(MAGE_KIT), pieces: MAGE_KIT, food: MAGE_FOOD,
      tooltip: `A new Novice Acolyte who ${support ? 'heals and strengthens your units' : 'attacks with spells'}, with a hazel wand and a homespun robe (Table 7). Needs free supply.`,
    };
  }
  const t = troopOf(product);
  if (t) {
    const pieces = troopPieces(t.troop, t.w, t.a);
    const horse = t.troop === Troop.Cavalry ? ' and a tamed horse from the stalls' : '';
    return {
      product, name: TROOP_NAMES[t.troop] ?? 'Troop', key: TROOP_KEYS[t.troop] ?? '', steps: (TRAINING.troopS + piecesTime(pieces)) * STEPS_PER_SECOND, cost: mainCost(pieces), pieces, food: TRAINING.troopFood, troop: t,
      tooltip: `A new ${(TROOP_NAMES[t.troop] ?? 'troop').toLowerCase()} troop: ${kitName(t.troop, t.w, t.a).toLowerCase()} (Table 7). Pays ${TRAINING.troopFood} food, the kit${horse}. Needs free supply.`,
    };
  }
  if (product >= RESEARCH_PRODUCT && product < RECIPE_PRODUCT) {
    const r = RESEARCH[product - RESEARCH_PRODUCT]!;
    return { product, name: r.name, key: r.key, steps: r.steps, cost: r.cost, food: 0, research: r.id, tooltip: `Research. Opens ${r.opens}` };
  }
  if (product >= ENGINE_PRODUCT) {
    const s = engineSpec(product - ENGINE_PRODUCT);
    return { product, name: s.name, key: '', steps: s.steps, cost: s.cost, food: 0, engine: s.id, tooltip: `A ${s.name.toLowerCase()} rolls out when it is done (Table 2f). Hitch a horse or an ox to it, or give it a crew.` };
  }
  if (product >= SLAUGHTER_PRODUCT) {
    const s = speciesSpec(product - SLAUGHTER_PRODUCT);
    const name = s.name.toLowerCase();
    return { product, name: `Slaughter ${name === 'cattle' ? 'a cow' : `a ${name}`}`, key: '', steps: SLAUGHTER_STEPS, cost: [], food: 0, slaughter: s.id, tooltip: `Gives ${costText([[meatOf(s.id), s.meat], ...s.extra])}.` };
  }
  const r = recipeSpec(product - RECIPE_PRODUCT);
  return { product, name: r.name, key: '', steps: r.steps, cost: r.inputs[0] ?? [], food: 0, recipe: r.id, tooltip: `Makes ${costText(r.outputs)}.` };
}

// ----- troops (Troops and gear: Barracks and Stables panel) -----

/** Troop types a building trains: the Barracks close melee, long melee, rangers and brawlers; the Stables cavalry; a main base tier 1 close melee, long melee and rangers. */
export function troopTypesAt(b: Pick<Building, 'kind' | 'complete'>): Troop[] {
  if (!b.complete) return [];
  if (b.kind === BuildingKind.Barracks) return [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler];
  if (b.kind === BuildingKind.Stables) return [Troop.Cavalry];
  if (b.kind === BuildingKind.MainBase) return [Troop.Close, Troop.Long, Troop.Ranger];
  return [];
}

/** The tiers a building offers a troop type: a main base tier 1 at most (Jade), the rest the whole ladder. */
export function troopTiersAt(b: Pick<Building, 'kind'>, troop: number): { w: readonly [number, number]; a: readonly [number, number] } {
  const [lo, hi] = weaponTiers(troop);
  if (b.kind === BuildingKind.MainBase) return { w: [lo, Math.min(hi, 1)], a: [0, 1] };
  return { w: [lo, hi], a: [0, TOP_TIER] };
}

/** Whether a building trains a troop of a type and tiers at all. */
export function troopOffered(b: Building, troop: number, w: number, a: number): boolean {
  if (!troopTypesAt(b).includes(troop as Troop)) return false;
  const t = troopTiersAt(b, troop);
  return w >= t.w[0] && w <= t.w[1] && a >= t.a[0] && a <= t.a[1] && weaponPiece(troop, w) !== undefined;
}

/** A Stables' tamed, grown horses that are not out working: the first is the next cavalry's. */
export function stalledHorses(state: SimState, b: Building): number[] {
  const e = state.entities;
  return animalsAt(state, b.id).filter((j) => e.mob[j] === Species.Horse && e.born[j]! <= state.step && !e.partner[j]);
}

/** Why a troop's kit cannot be had (research and forge), or ''. */
function kitProblem(state: SimState, user: number, research: number, pieces: readonly Piece[]): string {
  const forge = bestLevel(state, user, BuildingKind.Forge);
  for (const p of pieces) {
    const why = pieceProblem(p, research, forge, (r) => RESEARCH[r]?.name ?? 'research');
    if (why) return why;
  }
  return '';
}

/**
 * The panel's default for a troop type at a building (Barracks and Stables
 * panel): its Lock if ticked; else the highest weapon tier the player can
 * make and afford, then the highest armour tier the rest of the stock
 * pays for, so a short metal goes to the weapon first. With nothing
 * affordable, the lowest tiers.
 */
export function troopDefault(state: SimState, b: Building, troop: number, user = b.owner): { w: number; a: number } {
  const lock = b.locks[troop] ?? 0;
  if (lock > 0) return { w: floorDiv(lock - 1, 10), a: (lock - 1) % 10 };
  const t = troopTiersAt(b, troop);
  const p = state.players[user]!;
  const research = p.research | b.tech;
  let w = t.w[0];
  for (let k = t.w[1]; k >= t.w[0]; k--) {
    const pieces = troopPieces(troop, k, 0);
    if (!weaponPiece(troop, k) || kitProblem(state, user, research, pieces) || !planPieces(pieces, p.pool)) continue;
    w = k;
    break;
  }
  let a = 0;
  for (let k = t.a[1]; k > t.a[0]; k--) {
    const pieces = troopPieces(troop, w, k);
    if (kitProblem(state, user, research, pieces) || !planPieces(pieces, p.pool)) continue;
    a = k;
    break;
  }
  return { w, a };
}

/** The product a troop button queues now: the building's default for the type. */
export function defaultTroopProduct(state: SimState, b: Building, troop: number, user = b.owner): Product {
  const d = troopDefault(state, b, troop, user);
  return troopProduct(troop, d.w, d.a);
}

/** Whether a building offers a product at all (troops by type and tiers, the rest by productsOf). */
export function offers(b: Building, product: Product): boolean {
  const t = troopOf(product);
  return t ? troopOffered(b, t.troop, t.w, t.a) : productsOf(b).includes(product);
}

/** Recipes a building kind works, in table order. */
export function recipesAt(kind: number): number[] {
  return RECIPES.filter((r) => recipeLevelAt(r, kind) > 0).map((r) => r.id);
}

/** Buildings whose crafting and processing need assigned workers inside (s): the rest work alone. */
export function needsHands(kind: number): boolean {
  return kind === BuildingKind.Forge || kind === BuildingKind.Kiln || kind === BuildingKind.Tannery || kind === BuildingKind.HerbalistHut || kind === BuildingKind.Workshop || kind === BuildingKind.LumberMill;
}

/** Everything a building can be asked to make but troops (troopTypesAt), whatever it lacks now (the reasons come from productProblem). */
export function productsOf(b: Building): Product[] {
  if (!b.complete) return [];
  const out: Product[] = [];
  if (b.kind === BuildingKind.MainBase) {
    out.push(Product.Worker);
    // Main bases of level 6 or higher train mages too (Magic).
    if (b.level >= MAGE_MAIN_BASE_LEVEL) out.push(Product.SupportMage, Product.BattleMage);
  } else if (b.kind === BuildingKind.MagiSanctum) {
    out.push(Product.SupportMage, Product.BattleMage);
    for (const r of RESEARCH) if (r.at === b.kind && !r.retired) out.push(RESEARCH_PRODUCT + r.id);
  } else if (b.kind === BuildingKind.ScholarsLodge) {
    for (const r of RESEARCH) if (r.id !== Research.None && !r.retired && r.at === undefined) out.push(RESEARCH_PRODUCT + r.id);
  } else if (buildingSpec(b.kind).trainsWorkers) out.push(Product.Worker);
  if (b.kind === BuildingKind.LumberMill) out.push(Product.PlanksSoftwood, Product.PlanksHardwood);
  if (b.kind === BuildingKind.LivestockFarm) for (const s of SLAUGHTERED) out.push(SLAUGHTER_PRODUCT + s);
  for (const id of recipesAt(b.kind)) out.push(RECIPE_PRODUCT + id);
  // Siege engines at a Workshop, cannons at the Foundry (Table 2f).
  for (const id of PLAYER_ENGINES) if (engineSpec(id).at[0] === b.kind) out.push(ENGINE_PRODUCT + id);
  return out;
}

/** Whether a research step is done or already queued somewhere. */
function researchQueued(state: SimState, player: number, r: number): boolean {
  return state.buildings.list.some((b) => b.queue.some((q) => q.by === player && q.product === RESEARCH_PRODUCT + r));
}

/**
 * Whether a player may use a building: their own, or one inherited from a
 * player who was eliminated or left while they are still in (When a player
 * is eliminated or leaves: any remaining player can use those buildings).
 */
export function usableBy(state: SimState, b: Building, player: number): boolean {
  if (b.owner === player) return true;
  const p = state.players[player];
  return b.shared !== 0 && p !== undefined && p.out === 0;
}

/** The best finished building of a kind a player has (its level), or 0; inherited buildings count for everyone still in. */
export function bestLevel(state: SimState, player: number, kind: number): number {
  let best = 0;
  for (const b of state.buildings.list) if (b.complete && b.kind === kind && b.level > best && usableBy(state, b, player)) best = b.level;
  return best;
}

/**
 * Why a research step cannot start yet, or ''. `tech` is research an
 * inherited building brings with it, which counts for what must come first.
 */
export function researchProblem(state: SimState, player: number, r: ResearchSpec, tech = 0): string {
  const p = state.players[player]!;
  if (r.retired) return 'No longer needs research.';
  if (r.later) return r.later;
  if (hasResearch(p.research, r.id)) return 'Already researched.';
  if (researchQueued(state, player, r.id)) return 'Being researched.';
  if (r.forge && bestLevel(state, player, BuildingKind.Forge) < r.forge) return `Needs a ${buildingName(BuildingKind.Forge, r.forge, 0)}.`;
  if (r.after && !hasResearch(p.research | tech, r.after)) return `Needs ${RESEARCH[r.after]!.name} researched first.`;
  if (r.building && bestLevel(state, player, r.building[0]) < r.building[1]) return `Needs a finished ${buildingName(r.building[0], r.building[1], 0)}.`;
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
 * `user` is the player queueing it, who pays: the owner, or anyone still in
 * at an inherited building, where the research it brings counts too.
 */
export function productProblem(state: SimState, b: Building, product: Product, user = b.owner): string {
  if (!offers(b, product)) return 'This building cannot make that.';
  const player = state.players[user]!;
  const pool = player.pool;
  const research = player.research | b.tech;
  const spec = productSpec(product);
  if (spec.slaughter !== undefined) {
    const queued = b.queue.filter((q) => q.product === product).length;
    if (slaughterable(state, b, spec.slaughter).length <= queued) return `No grown ${speciesSpec(spec.slaughter).name.toLowerCase()} left at this farm to slaughter.`;
    return '';
  }
  if (spec.research !== undefined) {
    const why = researchProblem(state, user, RESEARCH[spec.research]!, b.tech);
    if (why) return why;
  } else if (spec.engine !== undefined) {
    const s = engineSpec(spec.engine);
    const why = levelProblem(b, s.at[1]);
    if (why) return why;
    if (!hasResearch(research, s.research as Research)) return `Needs ${RESEARCH[s.research]!.name} researched first.`;
    if (s.forge && bestLevel(state, user, BuildingKind.Forge) < s.forge) return `Needs a ${buildingName(BuildingKind.Forge, s.forge, 0)} in the town.`;
  } else if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    if (r.later) return r.later;
    const why = levelProblem(b, recipeLevelAt(r, b.kind));
    if (why) return why;
    if (!hasResearch(research, r.research as Research)) return `Needs ${RESEARCH[r.research]!.name} researched first.`;
    if (!payableInputs(r, pool)) return `Not enough resources (${costText(r.inputs[0] ?? [])}).`;
    return '';
  }
  if (spec.pieces) {
    const why = kitProblem(state, user, research, spec.pieces);
    if (why) return why;
    if (spec.troop?.troop === Troop.Cavalry && stalledHorses(state, b).length === 0) return 'Cavalry needs a tamed horse in the stalls.';
    if (!planPieces(spec.pieces, pool)) return `Not enough resources (${costText(spec.cost)}).`;
  }
  if (spec.food > 0) {
    if (eatableFood(player) < spec.food) return `Not enough food (${spec.food} food).`;
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

/** Products that are new units: workers, troops and mages. */
export function trainsUnit(product: number): boolean {
  return product === Product.Worker || product === Product.SupportMage || product === Product.BattleMage || product >= TROOP_PRODUCT;
}

/** Supply in use: one per worker, warrior and mage, one per research facility, plus each unit being trained for the player (animals use none). */
export function supplyUsed(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  // Mercenaries use none: they are the camp's.
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.role[i] !== Role.Mercenary && (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Mage)) n++;
  for (const b of state.buildings.list) {
    if (b.owner === player && b.kind === BuildingKind.ScholarsLodge && b.complete) n++;
    const h = b.queue[0];
    if (h && h.by === player && trainsUnit(h.product) && h.progress > 0) n++;
  }
  return n;
}

/** Queues an item for `by` (the owner unless set), who pays for it now. Returns '' or why it could not be queued. */
export function queueProduct(state: SimState, b: Building, product: Product, by = b.owner): string {
  if (!offers(b, product)) return 'This building cannot make that.';
  if (b.queue.length >= QUEUE_LIMIT) return 'The queue is full.';
  const why = productProblem(state, b, product, by);
  if (why) return why;
  const spec = productSpec(product);
  const player = state.players[by]!;
  const pool = player.pool;
  const paid: Array<[number, number]> = [];
  const take = (cost: ReadonlyArray<readonly [number, number]>): void => {
    for (const [res, n] of cost) {
      pool[res] = pool[res]! - n;
      const at = paid.findIndex(([r]) => r === res);
      if (at >= 0) paid[at] = [res, paid[at]![1] + n];
      else paid.push([res, n]);
    }
  };
  if (spec.recipe !== undefined) {
    // "Meat" or "fish" in a recipe is paid with the kinds in stock, and those come back if it is cancelled.
    for (const [res, n] of payAny(pool, payableInputs(recipeSpec(spec.recipe), pool)!)) paid.push([res, n]);
  } else if (spec.food > 0) {
    // The kit first (it was checked), then the food, exact to the quarter (written as minus its quarters).
    const kit = spec.pieces ? planPieces(spec.pieces, pool) : null;
    if (spec.pieces && !kit) return `Not enough resources (${costText(spec.cost)}).`;
    if (kit) take(kit.cost);
    const food = payFood(player, spec.food);
    if (!food) {
      for (const [res, n] of paid) pool[res] = pool[res]! + n;
      return `Not enough food (${spec.food} food).`;
    }
    for (const [res, q] of food) paid.push([res, -q]);
  } else {
    take(spec.cost);
  }
  // New cavalry: the horse leaves its stall now, and comes back if the troop is cancelled.
  let horse = 0;
  if (spec.troop?.troop === Troop.Cavalry) {
    const e = state.entities;
    const h = stalledHorses(state, b)[0]!;
    horse = 1 + e.sex[h]!;
    e.hp[h] = -1;
    state.dying.push(e.id[h]!);
  }
  b.queue.push({ product, paid, progress: 0, by, horse });
  return '';
}

/** Cancels a queued item and refunds what was paid, in full (and a new cavalry's horse goes back to its stall). */
export function cancelProduct(state: SimState, b: Building, index: number): void {
  const item = b.queue[index];
  if (!item) return;
  const player = state.players[item.by]!;
  for (const [res, n] of item.paid) {
    if (n < 0) giveFood(player, [[res, -n]]);
    else player.pool[res] = player.pool[res]! + n;
  }
  if (item.horse) {
    const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
    const h = addAnimal(state, Species.Horse, item.by, columnCentre(cx), columnCentre(cz), 0, item.horse - 1);
    state.entities.home[h] = b.id;
  }
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

function spawnWorker(state: SimState, b: Building, owner: number): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const id = state.nextEntityId++;
  const i = state.entities.add(id, owner, x, standY(state, x, z), z, WALK_SPEED_WU, UnitKind.Worker);
  state.entities.heading[i] = 32768;
  const orders = rallyOrders(b.rally);
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: owner, kind: 'info', text: 'A new worker is ready.', x, z });
}

function spawnTroop(state: SimState, b: Building, product: number, owner: number, horse: number): void {
  const t = troopOf(product)!;
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const i = addWarrior(state, owner, x, z, t.troop as Troop, t.w, t.a);
  state.entities.heading[i] = 32768;
  // Cavalry rides out on the horse it was given (Jade: the horse is used up).
  if (t.troop === Troop.Cavalry) seatOnHorse(state, i, Mount.Horse, speciesSpec(Species.Horse).hp, b.id, Math.max(0, horse - 1));
  const orders = rallyOrders(b.rally).filter((o) => o.t !== 'gather');
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: owner, kind: 'info', text: `A new ${(TROOP_NAMES[t.troop] ?? 'troop').toLowerCase()} troop is ready.`, x, z });
}

function spawnMage(state: SimState, b: Building, school: number, owner: number): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const i = addMage(state, owner, x, z, school);
  state.entities.heading[i] = 32768;
  const orders = rallyOrders(b.rally).filter((o) => o.t !== 'gather');
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: owner, kind: 'info', text: `A new ${school === School.Battle ? 'battle' : 'support'} mage is ready.`, x, z });
}

/** Grown animals of a species at a farm that are not out working, males last (s: the herd keeps its breeding pairs longest). */
export function slaughterable(state: SimState, b: Building, species: number): number[] {
  const e = state.entities;
  const out: number[] = [];
  for (let j = 0; j < e.count; j++) {
    if (e.kind[j] !== UnitKind.Animal || e.home[j] !== b.id || e.mob[j] !== species || e.hp[j]! <= 0 || e.born[j] !== 0 || e.partner[j]) continue;
    out.push(j);
  }
  // Spare animals go first: whichever sex outnumbers the other, the youngest of it.
  const males = out.filter((j) => e.sex[j] === 1).length;
  const spare = males * 2 > out.length ? 1 : 0;
  return out.sort((p, q) => (e.sex[q] === spare ? 1 : 0) - (e.sex[p] === spare ? 1 : 0) || e.id[q]! - e.id[p]!);
}

/** A research step, a recipe, a slaughter or an engine is done, for the player who queued it. */
function finishProduct(state: SimState, b: Building, product: number, by: number): void {
  const player = state.players[by]!;
  const spec = productSpec(product);
  const [x, z] = buildingCentre(b);
  if (spec.engine !== undefined) {
    spawnEngine(state, b, spec.engine, by);
    return;
  }
  if (spec.slaughter !== undefined) {
    const j = slaughterable(state, b, spec.slaughter)[0];
    if (j === undefined) return;
    const s = speciesSpec(spec.slaughter);
    const meat = meatOf(s.id);
    player.pool[meat] = player.pool[meat]! + s.meat;
    for (const [res, n] of s.extra) player.pool[res] = player.pool[res]! + n;
    state.entities.remove(state.entities.id[j]!);
    return;
  }
  if (spec.research !== undefined) {
    player.research |= 1 << spec.research;
    state.events.push({ player: by, kind: 'info', text: `Research done: ${spec.name}.`, x, z });
    return;
  }
  if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    for (const [res, n] of r.outputs) player.pool[res] = player.pool[res]! + n;
    if (r.made) player.made |= r.made;
    return;
  }
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

/** The band a building stands in (where its middle is). */
function bandOf(state: SimState, b: Building): Band {
  let band = bandCache.get(b);
  if (band === undefined) {
    const [x, z] = buildingCentre(b);
    band = bandAt(state, floorDiv(x, WU_PER_COLUMN), floorDiv(z, WU_PER_COLUMN));
    bandCache.set(b, band);
  }
  return band;
}

/** Items a farm makes per farmer-day at its level and place, in thousandths. */
export function farmRatePerMille(state: SimState, b: Building): number {
  const spec = buildingSpec(b.kind);
  const crop = spec.crops?.[b.variant];
  if (!crop) return 0;
  const bandPm = spec.cropBands ? bandYieldPerMille(bandOf(state, b)) : 1000;
  return floorDiv(crop.perDay * FARM_TIER_PER_MILLE[b.level - 1]! * bandPm, 1000);
}

/** What one full harvest bar brings in, in thousandths of an item: one farmer's yield for FARM_HARVEST_STEPS of work. */
export function harvestPerMille(state: SimState, b: Building): number {
  return floorDiv(farmRatePerMille(state, b) * FARM_HARVEST_STEPS, CYCLE_STEPS);
}

/**
 * A farm's work for one step (Jade, patch notes 1): each farmer at work adds a
 * step to the harvest bar, and a full bar puts the harvest straight into the
 * pool, whole items only, the thousandths carried to the next one.
 */
function growFarm(state: SimState, b: Building, pool: Int32Array): void {
  const crop = buildingSpec(b.kind).crops?.[b.variant];
  if (!crop) return;
  const whole = harvestSteps();
  // A save from before harvest bars kept thousandths times steps here: start its bar afresh.
  if (b.farmAcc >= 2 * whole) b.farmAcc = 0;
  const per = harvestPerMille(state, b);
  if (per <= 0) return;
  b.farmAcc += workersAt(state, b);
  while (b.farmAcc >= whole) {
    b.farmAcc -= whole;
    const total = (b.acc[0] ?? 0) + per;
    const items = floorDiv(total, 1000);
    b.acc[0] = total - items * 1000;
    pool[crop.res] = pool[crop.res]! + items;
  }
}

/** The harvest bar's length in farmer-steps, never below one. */
function harvestSteps(): number {
  return Math.max(1, FARM_HARVEST_STEPS);
}

/** What the panel's harvest bar shows (Jade, patch notes 1): what the next harvest brings in and how far along it is. */
export interface FarmHarvest {
  /** What comes in: the resource, how many and their food value (0 for flax and herbs). */
  res: Res;
  items: number;
  food: number;
  /** False where the band gives nothing (a crop field in the Barrens or Deadlands): the bar never fills. */
  grows: boolean;
  /** The bar: work done of the whole, and how much more each step adds now (0: it stands still). */
  done: number;
  whole: number;
  perStep: number;
}

/**
 * The next harvest of a finished farm, or null: crop fields, vegetable farms
 * and herb beds fill their bar with their farmers' work; a livestock farm's
 * hens lay at each day's turn (animals.ts), so its bar runs with the clock.
 */
export function farmHarvest(state: SimState, b: Building): FarmHarvest | null {
  if (!b.complete || !isFarm(b.kind)) return null;
  const crop = buildingSpec(b.kind).crops?.[b.variant];
  if (crop) {
    const per = harvestPerMille(state, b);
    const items = floorDiv((b.acc[0] ?? 0) + per, 1000);
    const whole = harvestSteps();
    const done = Math.min(b.farmAcc, whole);
    return { res: crop.res, items, food: items * RESOURCES[crop.res]!.nutrition, grows: per > 0, done, whole, perStep: per > 0 ? workersAt(state, b) : 0 };
  }
  if (b.kind !== BuildingKind.LivestockFarm) return null;
  const hens = layingHens(state, b);
  if (hens === 0) return null;
  // The hens lay in the step that starts on the day's turn, so the bar is full just before it.
  const done = (state.step + CYCLE_STEPS - 1) % CYCLE_STEPS;
  return { res: Res.Eggs, items: hens, food: hens * RESOURCES[Res.Eggs]!.nutrition, grows: true, done, whole: CYCLE_STEPS, perStep: 1 };
}

/** The panel's line on what the band does to a farm's yield (Table 6), or '' for farms without crops. */
export function farmBandLine(state: SimState, b: Building): string {
  const spec = buildingSpec(b.kind);
  if (!spec.crops) return '';
  const band = bandOf(state, b);
  const where = BAND_NAMES[band];
  const kinds = spec.kind === BuildingKind.HerbBed ? 'Herb beds' : spec.kind === BuildingKind.VegetableFarm ? 'Vegetable farms' : 'Crop fields';
  if (!spec.cropBands) return `Full yield in the ${where}: ${kinds.toLowerCase()} grow in full in every band.`;
  const pm = bandYieldPerMille(band);
  const rule = 'crop fields make half in the Fringe and Deepwoods and nothing in the Barrens or Deadlands';
  if (pm >= 1000) return `Full yield in the ${where}: ${rule}.`;
  if (pm <= 0) return `Nothing grows in the ${where}: ${rule}.`;
  return `${pm === 500 ? 'Half' : `${floorDiv(pm, 10)}%`} yield in the ${where}: ${rule}.`;
}

/** How the head of a building's queue moves now: its whole length, in the units its progress counts, and how much each step adds (0: on hold). */
export interface QueuePace {
  whole: number;
  perStep: number;
}

/**
 * The pace of a building's head item: what the next step adds to it and when
 * it is done. updateBuildings moves the item by exactly this, and the queue's
 * countdown on the panel reads the same numbers, so the seconds it shows are
 * the sim's own rather than a guess from the bar (Patch 2 bug fixes).
 */
export function queuePace(state: SimState, b: Building, head: QueueItem): QueuePace {
  if (trainsUnit(head.product)) {
    // A new unit waits at its first step until there is free supply for it.
    const held = head.progress === 0 && supplyUsed(state, head.by) >= supplyCap(state, head.by);
    return { whole: productSpec(head.product).steps, perStep: held ? 0 : 1 };
  }
  if (head.product >= RESEARCH_PRODUCT) {
    // Research loads at its facility's pace, and stops while the research facilities go unfed (Research; Food).
    // Smithing, processing and crafting at a forge, kiln, tannery, herbalist or workshop need hands inside (s);
    // the Manufactory works twice as fast. The Big House and cooking need none.
    const whole = productSteps(state, b, head.product);
    if (head.product < RECIPE_PRODUCT) return { whole: whole * 4, perStep: state.players[b.owner]!.starveLodge > 0 ? 0 : RESEARCH_QUARTERS[b.level - 1]! };
    if (needsHands(b.kind)) return { whole, perStep: workersAt(state, b) * (b.kind === BuildingKind.Workshop && b.level >= 4 ? 2 : 1) };
    return { whole, perStep: 1 };
  }
  // Planks: the mill works only with hands inside, faster with more of them.
  return { whole: PLANK_STEPS, perStep: workersAt(state, b) };
}

/** What the queue's bar and countdown show for a building's head item, or null with nothing queued: work done of the whole, and the steps left at its pace now (0: on hold). */
export function queueHead(state: SimState, b: Building): { done: number; whole: number; stepsLeft: number } | null {
  const head = b.queue[0];
  if (!head) return null;
  const { whole, perStep } = queuePace(state, b, head);
  const left = Math.max(0, whole - head.progress);
  return { done: Math.min(head.progress, whole), whole, stepsLeft: perStep > 0 ? floorDiv(left + perStep - 1, perStep) : 0 };
}

/** One step of every building's own work. */
export function updateBuildings(state: SimState): void {
  for (const b of state.buildings.list) {
    if (!b.complete) continue;
    const pool = state.players[b.owner]!.pool;
    const head = b.queue[0];
    if (head) {
      const pace = queuePace(state, b, head);
      if (trainsUnit(head.product)) {
        if (pace.perStep === 0) {
          if ((b.alerted & 1) === 0) {
            b.alerted |= 1;
            const what = productSpec(head.product).name.toLowerCase();
            const [x, z] = buildingCentre(b);
            state.events.push({ player: head.by, kind: 'alert', text: `Not enough supply to train a ${what}. Build or upgrade farms.`, x, z });
          }
        } else {
          b.alerted &= ~1;
          head.progress += pace.perStep;
          if (head.progress >= pace.whole) {
            b.queue.shift();
            if (head.product >= TROOP_PRODUCT) spawnTroop(state, b, head.product, head.by, head.horse);
            else if (head.product === Product.SupportMage) spawnMage(state, b, School.Support, head.by);
            else if (head.product === Product.BattleMage) spawnMage(state, b, School.Battle, head.by);
            else spawnWorker(state, b, head.by);
          }
        }
      } else {
        head.progress += pace.perStep;
        if (head.progress >= pace.whole) {
          b.queue.shift();
          if (head.product >= RESEARCH_PRODUCT) finishProduct(state, b, head.product, head.by);
          else pool[Res.Planks] = pool[Res.Planks]! + (b.level >= 2 ? 2 : 1);
        }
      }
    }
    // Farms: the harvest bar fills from the first step a farmer works the field (no fallow days).
    if (isFarm(b.kind)) growFarm(state, b, pool);
  }
}

/** A short line for the building panel: what it is doing. */
export function buildingStatus(state: SimState, b: Building): string {
  if (!b.complete) return `Under construction: ${floorDiv(b.progress * 100, levelSpec(b.kind, 1).ws * 20)}%`;
  if (b.upgrading) return `Upgrading to ${buildingName(b.kind, b.upgrading, b.variant)}: ${floorDiv(b.upProgress * 100, levelSpec(b.kind, b.upgrading).ws * 20)}%`;
  if (isFarm(b.kind)) {
    const herd = b.kind === BuildingKind.LivestockFarm ? `; ${animalsAt(state, b.id).length} animals` : '';
    return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} farmers at work${herd}`;
  }
  if (b.kind === BuildingKind.Stables) return `${animalsAt(state, b.id).length} of 6 stalls taken`;
  if (b.kind === BuildingKind.Mineshaft) {
    const miners = `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} miners at work`;
    const rating = b.rating > 0 ? `; the spot is ${RATING_NAMES[b.rating - 1]}` : '';
    const waiting = b.stock.length > 0 ? `; waiting to be hauled: ${costText(b.stock.map(([r, n]) => [r as Res, n] as const))}` : '';
    return `${workedOut(b) ? 'Worked out' : miners}${rating}${waiting}`;
  }
  if (b.kind === BuildingKind.FishingDock) return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} fishing${dockStretch(state, b) ? '' : '; no stretch within 30 m has fish to spare'}`;
  if (needsHands(b.kind)) return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} workers inside`;
  return '';
}
