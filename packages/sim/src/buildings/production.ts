// What buildings do each step: production queues (training workers,
// troops and mages: Table 7; research at a Scholar's Lodge; crafting at the
// Workshop, Forge and Artillery workshop, which need no workers since Patch
// 2: Table 2a, 2b), the Farm's yield (Table 6) and supply (Table 4). Production costs are taken when an item is
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
import { BARN_STALLS, BuildingKind, buildingName, buildingSpec, CAVALRY_BASE, CRAFT_PACE, FARM_HARVEST_STEPS, forgeStep, levelSpec, QUEUE_LIMIT, WORKER_FOOD, WORKER_TRAIN_STEPS } from './data.ts';
import { buildingCentre, dist2 } from './lights.ts';
import { bandAt } from './placement.ts';
import { ENGINE_PRODUCT, Product, RECIPE_PRODUCT, RESEARCH_PRODUCT, SLAUGHTER_PRODUCT, TROOP_PRODUCT, troopOf, troopProduct, type Building, type QueueItem, type RallyPoint } from './store.ts';
import { CREWMAN, engineSpec, PLAYER_ENGINES } from '../siege/data.ts';
import { addCrewman, crewSworn, engineName, spawnEngine } from '../siege/engines.ts';
import { Species, speciesSpec } from '../animals/species.ts';
import { addAnimal, animalsAt, layingHens, stallsTaken } from '../animals/animals.ts';
import { dockStretch, RATING_NAMES, workedOut } from './mining.ts';
import { hasResearch, Made, RESEARCH, Research, type ResearchSpec } from '../combat/items.ts';
import { madeAt, payableInputs, RECIPES, recipeSpec } from './recipes.ts';
import { addMage, MAGE_FOOD, MAGE_MAIN_BASE_LEVEL, MAGE_TRAIN_STEPS } from '../magic/mages.ts';
import { School } from '../magic/spells.ts';
import { Role } from '../threats/types.ts';
import { crewHooks } from '../units/questions.ts';
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
  troopTierName,
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
  /** Time with one worker's work; a crafting building works at CRAFT_PACE (craftRate), research at its facility's pace. */
  steps: number;
  /** A fixed cost; for a new unit, the main way of paying its kit (the kit's pieces may be paid other ways: pieces). */
  cost: Cost;
  /** Food, as nutrition drawn from every food in turn: new units. */
  food: number;
  tooltip: string;
  /** Research: the step; crafting: the recipe. */
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

/** Slaughter takes 10 s at the Barn (Table 6). */
export const SLAUGHTER_STEPS = 10 * STEPS_PER_SECOND;
/** Animals a Barn slaughters (Table 6): cattle, chickens and oxen. */
export const SLAUGHTERED: readonly number[] = [Species.Cattle, Species.Chicken, Species.Ox];
/** Research speed at a Scholar's Lodge, in quarters: the Lodge's own pace (Table 4; Patch 2 cut the Scriptorium and Grand Academy). */
const RESEARCH_QUARTERS = 4;

/** A new worker's kit (Table 7): a tier 1 tool kit. */
const WORKER_KIT: readonly Piece[] = [TOOL_KITS[1]!];
/** A new mage's kit (Table 7): a hazel wand and a homespun robe. */
const MAGE_KIT: readonly Piece[] = [WAND_KITS[1]!, ROBE_KITS[1]!];
const kitSteps = (pieces: readonly Piece[]): number => piecesTime(pieces) * STEPS_PER_SECOND;

export const PRODUCTS: readonly ProductSpec[] = [
  { product: Product.Worker, name: 'Worker', key: 'W', steps: WORKER_TRAIN_STEPS + kitSteps(WORKER_KIT), cost: mainCost(WORKER_KIT), pieces: WORKER_KIT, food: WORKER_FOOD, tooltip: 'A new worker with a hardwood tool kit (Table 7). Needs free supply.' },
];

/** Every product's description: training, research, recipes, slaughter and engines. */
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
  if (product === Product.Crewman) {
    return {
      product, name: TROOP_NAMES[Troop.Crew]!, key: 'C', steps: CREWMAN.seconds * STEPS_PER_SECOND, cost: [], food: CREWMAN.food,
      tooltip: `A new artillery crewman (Patch 2): the only unit that crews catapults, ballistas and cannons; it fights with its fists. Pays ${CREWMAN.food} food. Needs free supply. It goes to crew the nearest of your engines that is a crewman short.`,
    };
  }
  const t = troopOf(product);
  if (t) {
    const pieces = troopPieces(t.troop, t.w, t.a);
    const horse = t.troop === Troop.Cavalry ? ' and a tamed horse from the nearest Barn' : '';
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
    const crew = s.crew === 1 ? 'its artillery crewman' : `its ${s.crew} artillery crewmen`;
    return {
      product, name: s.name, key: '', steps: s.steps, cost: s.cost, food: s.crew * CREWMAN.food, engine: s.id,
      tooltip: `A ${s.name.toLowerCase()} rolls out with ${crew} when it is done (Table 2f; Patch 2), and fires without ammunition. Pays the crew's food too (${s.crew * CREWMAN.food}), and needs free supply for them.`,
    };
  }
  if (product >= SLAUGHTER_PRODUCT) {
    const s = speciesSpec(product - SLAUGHTER_PRODUCT);
    const name = s.name.toLowerCase();
    return { product, name: `Slaughter ${name === 'cattle' ? 'a cow' : `a ${name}`}`, key: '', steps: SLAUGHTER_STEPS, cost: [], food: 0, slaughter: s.id, tooltip: `Gives ${costText([[meatOf(s.id), s.meat], ...s.extra])}.` };
  }
  const r = recipeSpec(product - RECIPE_PRODUCT);
  return { product, name: r.name, key: '', steps: r.steps, cost: r.inputs[0] ?? [], food: 0, recipe: r.id, tooltip: `Makes ${costText(r.outputs)}.` };
}

// ----- troops (Troops and gear: Barracks panel) -----

/** Troop types a building trains: the Barracks close melee, long melee, rangers, brawlers and cavalry (Patch 2: the Stables are gone); a main base tier 1 close melee, long melee and rangers. */
export function troopTypesAt(b: Pick<Building, 'kind' | 'complete'>): Troop[] {
  if (!b.complete) return [];
  if (b.kind === BuildingKind.Barracks) return [Troop.Close, Troop.Long, Troop.Ranger, Troop.Brawler, Troop.Cavalry];
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

/** A Barn's tamed, grown horses that are not out working. */
function horsesIn(state: SimState, barn: Building): number[] {
  const e = state.entities;
  return animalsAt(state, barn.id).filter((j) => e.mob[j] === Species.Horse && e.born[j]! <= state.step && !e.partner[j]);
}

/**
 * The finished Barns a player may use, nearest a building first (Patch 2:
 * cavalry trained at the Barracks takes its horse from the nearest Barn).
 */
function barnsNear(state: SimState, b: Building, player: number): Building[] {
  const [x, z] = buildingCentre(b);
  const near = (o: Building): number => {
    const [ox, oz] = buildingCentre(o);
    return dist2(ox, oz, x, z);
  };
  return state.buildings.list.filter((o) => o.complete && o.kind === BuildingKind.Barn && usableBy(state, o, player)).sort((p, q) => near(p) - near(q) || p.id - q.id);
}

/** The horses in the nearest Barn that has one: the first is the next cavalry's. */
export function stalledHorses(state: SimState, b: Building, player = b.owner): number[] {
  for (const barn of barnsNear(state, b, player)) {
    const horses = horsesIn(state, barn);
    if (horses.length > 0) return horses;
  }
  return [];
}

/** The Forge step a player's town is at (buildings/data.ts forgeStep): a finished Forge, then main base levels. */
export function forgeStepOf(state: SimState, player: number): number {
  return forgeStep(bestLevel(state, player, BuildingKind.Forge) > 0, bestLevel(state, player, BuildingKind.MainBase));
}

/** Why a troop's kit cannot be had (research and the Forge step), or ''. */
function kitProblem(state: SimState, user: number, research: number, pieces: readonly Piece[]): string {
  const forge = forgeStepOf(state, user);
  for (const p of pieces) {
    const why = pieceProblem(p, research, forge, (r) => RESEARCH[r]?.name ?? 'research');
    if (why) return why;
  }
  return '';
}

/**
 * The panel's default for a troop type at a building (Barracks panel): its Lock if ticked; else the highest weapon tier the player can
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
  return RECIPES.filter((r) => madeAt(r, kind)).map((r) => r.id);
}

/** Steps of work a building puts into a recipe each step: CRAFT_PACE at a crafting building, which holds no workers (Patch 2), else 1. */
export function craftRate(kind: number): number {
  return buildingSpec(kind).crafts ? CRAFT_PACE : 1;
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
  if (b.kind === BuildingKind.Barn) for (const s of SLAUGHTERED) out.push(SLAUGHTER_PRODUCT + s);
  // Artillery crewmen, then siege engines and cannons, at the Artillery workshop (Table 2f; Patch 2).
  if (b.kind === BuildingKind.ArtilleryWorkshop) out.push(Product.Crewman);
  for (const id of recipesAt(b.kind)) out.push(RECIPE_PRODUCT + id);
  for (const id of PLAYER_ENGINES) if (engineSpec(id).at === b.kind) out.push(ENGINE_PRODUCT + id);
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
  const why = baseProblem(state, player, r.base ?? 0);
  if (why) return why;
  if (r.after && !hasResearch(p.research | tech, r.after)) return `Needs ${RESEARCH[r.after]!.name} researched first.`;
  if (r.made && (p.made & r.made) === 0) return r.made === Made.TinIngot ? 'Smelt a tin ingot first.' : 'Smelt pig iron first.';
  return '';
}

/** The main base level a recipe, engine, research or troop needs (Patch 2), as a reason, or ''. */
export function baseProblem(state: SimState, player: number, base: number): string {
  return base > 0 && bestLevel(state, player, BuildingKind.MainBase) < base ? `Needs a level ${base} main base.` : '';
}

/**
 * Why a product cannot be queued at a building now, or '' if it can:
 * the main base level, research, a horse in a Barn, the stock, the pool.
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
    if (slaughterable(state, b, spec.slaughter).length <= queued) return `No grown ${speciesSpec(spec.slaughter).name.toLowerCase()} left in this Barn to slaughter.`;
    return '';
  }
  if (spec.research !== undefined) {
    const why = researchProblem(state, user, RESEARCH[spec.research]!, b.tech);
    if (why) return why;
  } else if (spec.engine !== undefined) {
    const s = engineSpec(spec.engine);
    const why = baseProblem(state, user, s.base);
    if (why) return why;
    if (!hasResearch(research, s.research as Research)) return `Needs ${RESEARCH[s.research]!.name} researched first.`;
    // The engine's materials here; its crew's food below.
    for (const [res, n] of spec.cost) if (pool[res]! < n) return `Not enough resources (${costText(spec.cost)}).`;
  } else if (spec.recipe !== undefined) {
    const r = recipeSpec(spec.recipe);
    if (r.later) return r.later;
    const why = baseProblem(state, user, r.base);
    if (why) return why;
    if (!hasResearch(research, r.research as Research)) return `Needs ${RESEARCH[r.research]!.name} researched first.`;
    if (!payableInputs(r, pool)) return `Not enough resources (${costText(r.inputs[0] ?? [])}).`;
    return '';
  }
  if (spec.pieces) {
    const cavalry = spec.troop?.troop === Troop.Cavalry;
    const why = (cavalry ? baseProblem(state, user, CAVALRY_BASE) : '') || kitProblem(state, user, research, spec.pieces);
    if (why) return why;
    if (cavalry && stalledHorses(state, b, user).length === 0) return 'Cavalry needs a tamed horse in a Barn.';
    if (!planPieces(spec.pieces, pool)) return `Not enough resources (${costText(spec.cost)}).`;
  }
  if (spec.food > 0) {
    if (eatableFood(player) < spec.food) return `Not enough food (${spec.food} food).`;
  } else {
    for (const [res, n] of spec.cost) if (pool[res]! < n) return `Not enough resources (${costText(spec.cost)}).`;
  }
  return '';
}

/** Steps of work an item takes (a crafting building's pace and research's are in their rates, not here). */
export function productSteps(_state: SimState, _b: Building, product: Product): number {
  return productSpec(product).steps;
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

/** Products that are new units: workers, troops, mages and artillery crewmen. */
export function trainsUnit(product: number): boolean {
  return product === Product.Worker || product === Product.SupportMage || product === Product.BattleMage || product === Product.Crewman || product >= TROOP_PRODUCT;
}

/** Supply a product's new units take: 1 for a unit trained, an engine's crew (Patch 2), else 0. */
export function supplyNeed(product: number): number {
  if (trainsUnit(product)) return 1;
  if (product >= ENGINE_PRODUCT && product < TROOP_PRODUCT) return engineSpec(product - ENGINE_PRODUCT).crew;
  return 0;
}

/** Supply in use: one per worker, warrior and mage, one per research facility, plus the units being made for the player (animals and engines use none; an engine's crew do). */
export function supplyUsed(state: SimState, player: number): number {
  const e = state.entities;
  let n = 0;
  // Mercenaries use none: they are the camp's.
  for (let i = 0; i < e.count; i++) if (e.owner[i] === player && e.role[i] !== Role.Mercenary && (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Mage)) n++;
  for (const b of state.buildings.list) {
    if (b.owner === player && b.kind === BuildingKind.ScholarsLodge && b.complete) n++;
    const h = b.queue[0];
    if (h && h.by === player && h.progress > 0) n += supplyNeed(h.product);
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
    // The kit (or an engine's materials) first (it was checked), then the food, exact to the quarter (written as minus its quarters).
    const kit = spec.pieces ? planPieces(spec.pieces, pool) : null;
    if (spec.pieces && !kit) return `Not enough resources (${costText(spec.cost)}).`;
    if (kit) take(kit.cost);
    if (spec.engine !== undefined) take(spec.cost);
    const food = payFood(player, spec.food);
    if (!food) {
      for (const [res, n] of paid) pool[res] = pool[res]! + n;
      return `Not enough food (${spec.food} food).`;
    }
    for (const [res, q] of food) paid.push([res, -q]);
  } else {
    take(spec.cost);
  }
  // New cavalry: the horse leaves its Barn now, and comes back if the troop is cancelled.
  let horse = 0;
  if (spec.troop?.troop === Troop.Cavalry) {
    const e = state.entities;
    const h = stalledHorses(state, b, by)[0]!;
    horse = 1 + e.sex[h]!;
    e.hp[h] = -1;
    state.dying.push(e.id[h]!);
  }
  b.queue.push({ product, paid, progress: 0, by, horse });
  return '';
}

/** Cancels a queued item and refunds what was paid, in full (and a new cavalry's horse goes back to the nearest Barn). */
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
    state.entities.home[h] = barnsNear(state, b, item.by)[0]?.id ?? 0;
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
  if (t.troop === Troop.Cavalry) seatOnHorse(state, i, Mount.Horse, speciesSpec(Species.Horse).hp, barnsNear(state, b, owner)[0]?.id ?? 0, Math.max(0, horse - 1));
  const orders = rallyOrders(b.rally).filter((o) => o.t !== 'gather');
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: owner, kind: 'info', text: `A new ${troopTierName(t.troop, t.w).toLowerCase()} is ready.`, x, z });
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

/** Engines of a player's a crewman short (fewer told to crew it than it needs), nearest a point first (lowest id on a tie). */
export function enginesShortOfCrew(state: SimState, player: number, x: number, z: number): number[] {
  const e = state.entities;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Engine || e.owner[i] !== player || e.hp[i]! <= 0) continue;
    if (crewSworn(state, i).length < engineSpec(e.mob[i]!).crew) out.push([i, dist2(e.x[i]!, e.z[i]!, x, z)]);
  }
  return out.sort((p, q) => p[1] - q[1] || e.id[p[0]]! - e.id[q[0]]!).map(([i]) => i);
}

/** The finished Artillery workshop nearest an engine that its owner may use, or undefined. */
export function nearestCrewTrainer(state: SimState, engine: number): Building | undefined {
  const e = state.entities;
  const player = e.owner[engine]!;
  let best: Building | undefined;
  let bestD = 0;
  for (const b of state.buildings.list) {
    if (!b.complete || b.kind !== BuildingKind.ArtilleryWorkshop || !usableBy(state, b, player)) continue;
    const [bx, bz] = buildingCentre(b);
    const d = dist2(bx, bz, e.x[engine]!, e.z[engine]!);
    if (!best || d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/**
 * Fills the hooks of the "A crewman fell. Train another?" question (units/
 * questions.ts crewHooks, Patch 2): an engine that lost a crewman asks when
 * an Artillery workshop stands, and Yes queues a crewman at the nearest one,
 * who joins the nearest engine a crewman short when trained.
 */
export function installCrewHooks(): void {
  crewHooks.trainer = nearestCrewTrainer;
  crewHooks.train = (state, engine, at) => queueProduct(state, at, Product.Crewman, state.entities.owner[engine]!);
  // What Yes takes is food, which the hook's resource list cannot hold; the queue's tooltip names it.
  crewHooks.cost = () => [];
}

/** A new artillery crewman joins the nearest engine a crewman short (Patch 2: training one replaces one who fell); with none short, he follows the rally route. */
function spawnCrewman(state: SimState, b: Building, owner: number): void {
  const [cx, cz] = exitColumn(state, b, state.nextEntityId % 4);
  const x = columnCentre(cx);
  const z = columnCentre(cz);
  const [g] = enginesShortOfCrew(state, owner, x, z);
  const i = addCrewman(state, owner, x, z, g ?? -1);
  if (g !== undefined) {
    state.events.push({ player: owner, kind: 'info', text: `A new artillery crewman is ready and goes to crew the ${engineName(state, g).toLowerCase()}.`, x, z });
    return;
  }
  const orders = rallyOrders(b.rally).filter((o) => o.t !== 'gather');
  for (let k = 0; k < orders.length; k++) giveOrder(state, i, orders[k]!, k > 0);
  state.events.push({ player: owner, kind: 'info', text: 'A new artillery crewman is ready.', x, z });
}

/** Grown animals of a species in a Barn that are not out working, males last (s: the herd keeps its breeding pairs longest). */
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

/** Workers at work in a building now (farmers in the field or sheltering in their farmhouse, miners, dock hands). */
export function workersAt(state: SimState, b: Building): number {
  const e = state.entities;
  let n = 0;
  for (const j of assigned(state, b.id)) if (e.act[j] === Act.Work) n++;
  return Math.min(n, levelSpec(b.kind, b.level).workers);
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

/** Items a farm makes per farmer-day, in thousandths: the Farm's crop in full in every band (Patch 2). */
export function farmRatePerMille(_state: SimState, b: Building): number {
  const crop = buildingSpec(b.kind).crop;
  return crop ? crop.perDay * 1000 : 0;
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
  const crop = buildingSpec(b.kind).crop;
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
  /** What comes in: the resource, how many and their food value. */
  res: Res;
  items: number;
  food: number;
  /** False where nothing comes in: the bar never fills. */
  grows: boolean;
  /** The bar: work done of the whole, and how much more each step adds now (0: it stands still). */
  done: number;
  whole: number;
  perStep: number;
}

/**
 * The next harvest of a finished Farm or Barn, or null: the Farm fills its
 * bar with its farmers' work; a Barn's hens lay at each day's turn
 * (animals.ts), so its bar runs with the clock.
 */
export function farmHarvest(state: SimState, b: Building): FarmHarvest | null {
  if (!b.complete) return null;
  const crop = buildingSpec(b.kind).crop;
  if (crop) {
    const per = harvestPerMille(state, b);
    const items = floorDiv((b.acc[0] ?? 0) + per, 1000);
    const whole = harvestSteps();
    const done = Math.min(b.farmAcc, whole);
    return { res: crop.res, items, food: items * RESOURCES[crop.res]!.nutrition, grows: per > 0, done, whole, perStep: per > 0 ? workersAt(state, b) : 0 };
  }
  if (b.kind !== BuildingKind.Barn) return null;
  const hens = layingHens(state, b);
  if (hens === 0) return null;
  // The hens lay in the step that starts on the day's turn, so the bar is full just before it.
  const done = (state.step + CYCLE_STEPS - 1) % CYCLE_STEPS;
  return { res: Res.Eggs, items: hens, food: hens * RESOURCES[Res.Eggs]!.nutrition, grows: true, done, whole: CYCLE_STEPS, perStep: 1 };
}

/** The panel's line on the band a Farm stands in (Patch 2: it grows in full in every band), or '' for other buildings. */
export function farmBandLine(state: SimState, b: Building): string {
  if (!buildingSpec(b.kind).crop) return '';
  return `Full yield in the ${BAND_NAMES[bandOf(state, b)]}: the Farm grows in full in every band.`;
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
  // A new unit, or an engine with its crew (Patch 2), waits at its first step until there is free supply for them.
  const held = head.progress === 0 && supplyNeed(head.product) > 0 && supplyUsed(state, head.by) + supplyNeed(head.product) > supplyCap(state, head.by);
  if (trainsUnit(head.product)) return { whole: productSpec(head.product).steps, perStep: held ? 0 : 1 };
  if (held) return { whole: productSteps(state, b, head.product), perStep: 0 };
  // Research loads at its facility's pace, and stops while the research facilities go unfed (Research; Food).
  // Crafting buildings work with no hands at CRAFT_PACE (Patch 2); engines, slaughter and the Big House's rope at 1.
  const whole = productSteps(state, b, head.product);
  if (head.product < RECIPE_PRODUCT) return { whole: whole * 4, perStep: state.players[b.owner]!.starveLodge > 0 ? 0 : RESEARCH_QUARTERS };
  if (head.product < SLAUGHTER_PRODUCT) return { whole, perStep: craftRate(b.kind) };
  return { whole, perStep: 1 };
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
      if (supplyNeed(head.product) > 0 && pace.perStep === 0) {
        if ((b.alerted & 1) === 0) {
          b.alerted |= 1;
          const what = productSpec(head.product).name.toLowerCase();
          const [x, z] = buildingCentre(b);
          const text = trainsUnit(head.product) ? `Not enough supply to train ${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}.` : `Not enough supply for the ${what}'s crew.`;
          state.events.push({ player: head.by, kind: 'alert', text: `${text} Build farms or upgrade the main base.`, x, z });
        }
      } else if (trainsUnit(head.product)) {
        b.alerted &= ~1;
        head.progress += pace.perStep;
        if (head.progress >= pace.whole) {
          b.queue.shift();
          if (head.product >= TROOP_PRODUCT) spawnTroop(state, b, head.product, head.by, head.horse);
          else if (head.product === Product.SupportMage) spawnMage(state, b, School.Support, head.by);
          else if (head.product === Product.BattleMage) spawnMage(state, b, School.Battle, head.by);
          else if (head.product === Product.Crewman) spawnCrewman(state, b, head.by);
          else spawnWorker(state, b, head.by);
        }
      } else {
        b.alerted &= ~1;
        head.progress += pace.perStep;
        if (head.progress >= pace.whole) {
          b.queue.shift();
          finishProduct(state, b, head.product, head.by);
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
  if (isFarm(b.kind)) return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} farmers at work`;
  if (b.kind === BuildingKind.Barn) return `${animalsAt(state, b.id).length} animals; ${stallsTaken(state, b)} of ${BARN_STALLS} stalls taken`;
  if (b.kind === BuildingKind.Mineshaft) {
    const most = levelSpec(b.kind, b.level).workers;
    const miners = `${Math.min(most, assigned(state, b.id).length)} of ${most} miners, ${workersAt(state, b)} down the shaft`;
    const rating = b.rating > 0 ? `; the spot is ${RATING_NAMES[b.rating - 1]}` : '';
    const waiting = b.stock.length > 0 ? `; dug out for the next bag: ${costText(b.stock.map(([r, n]) => [r as Res, n] as const))}` : '';
    return `${workedOut(state, b) ? 'Worked out' : miners}${rating}${waiting}`;
  }
  if (b.kind === BuildingKind.FishingDock) return `${workersAt(state, b)} of ${levelSpec(b.kind, b.level).workers} fishing${dockStretch(state, b) ? '' : '; no stretch within 30 m has fish to spare'}`;
  return '';
}
