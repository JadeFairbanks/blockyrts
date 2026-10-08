// Greyed-out buttons that answer a click (Jade's Patch 3): "if the player
// clicks a greyed out building, create an actionable text bubble from the
// best placed unit or building to resolve the reason why it is greyed out.
// The same for if a player clicks a greyed out option on the action section
// of a building ... If both were the cause for example, both actionables
// would appear simultaneously."
//
// A click on a greyed building in the build menu, or on a building's greyed
// training, making, research or Upgrade, sends a GreyedOrder. The sim works
// out every cause (a main base tier, research, each resource it is short
// of, food, supply) and, for each, the unit or building that can sort it out
// asks its owner, all at once, in the question bubbles of units/questions.ts
// (they share its wait and its Yes and No):
// - a resource on the land: the nearest worker with the tools for it, out of
//   those gathering or idle first ("We need 40 more stone for the Forge.
//   Shall I go and gather some?"); fish for food the same way; when no
//   worker's tools can work it, the nearest that could with the cheapest
//   tools the stock pays for offers to make them first;
// - a resource made from others: a building that makes it ("Shall I smelt
//   10?"), at the Forge, Workshop or main base;
// - research: the Scholar's Lodge (or Magi Sanctum) that researches it;
// - a main base tier, or supply: the main base, to upgrade;
// - food: idle warriors, to go hunting.
// When that one cannot do it now either (the Forge short of ore, the
// upgrade short of stone), the causes of that come next, as far as
// GREY_DEPTH steps down; a resource wanted at two steps is asked for once,
// with both amounts. Nothing that can sort a cause out (no Forge, no
// research building, nothing a worker can reach) asks nothing for it.
//
// Yes runs the order the matching button runs. Like the other questions,
// none of this is state, and nothing here draws on a random stream.

import { BuildingKind, buildingName, buildingSpec, FORGE_STEP_BASE, levelSpec, QUEUE_LIMIT } from '../buildings/data.ts';
import { buildingCentre, dist2 } from '../buildings/lights.ts';
import { buildCost, mainBaseLevel } from '../buildings/placement.ts';
import { forgeStepOf, offers, productProblem, productSpec, queueProduct, supplyCap, supplyNeed, supplyUsed, usableBy } from '../buildings/production.ts';
import { payableInputs, RECIPES } from '../buildings/recipes.ts';
import { RECIPE_PRODUCT, RESEARCH_PRODUCT, type Building, type Product } from '../buildings/store.ts';
import { hasResearch, RESEARCH, type Research } from '../combat/items.ts';
import { eatableFood } from '../economy/food.ts';
import { haveOf, payAny } from '../economy/food-kinds.ts';
import { costText, FOODS, pay, RESOURCES, type Cost } from '../economy/resources.ts';
import { ceilDiv, floorDiv, length2d, WU_PER_METRE } from '../fixed.ts';
import type { AnswerOrder, GreyedOrder } from '../orders.ts';
import { say, sayBuilding } from '../peoples/speech.ts';
import { engineSpec } from '../siege/data.ts';
import { isCrewman } from '../siege/engines.ts';
import { UnitKind, type SimState } from '../state.ts';
import { Role } from '../threats/types.ts';
import { propJob, PROPS } from '../world/props.ts';
import { giveOrder, nodeResource } from './behaviour.ts';
import { chooseNode, fromBuilding, GATHER_SWITCH_M, homeOf, type NodePick } from './forage.ts';
import { inFront, kitHolder, nearestUpgradePlace, pendingKitUp, techOf } from './gear.ts';
import { Line, pieceProblem, planPieces, TIER_NEEDS, TOOL_GEAR, TOOL_KITS, upgradePieces, type Piece } from './kits.ts';
import { TOOL_FIELDS } from './tools.ts';
import { answerHooks, askNow, closeAsks, isAsking, openQuestions, SPEAK_FOR_M } from './questions.ts';

/** What a greyed-out click was on (GreyedOrder.what). */
export const Greyed = {
  /** A building in the build menu: GreyedOrder.id is its kind. */
  Building: 0,
  /** A building's training, making or research: id is the product. */
  Product: 1,
  /** A building's Upgrade. */
  Upgrade: 2,
} as const;

/** The questions a greyed-out click raises (units/questions.ts Ask goes on from 7 for its own). */
export const GreyAsk = {
  /** A worker: go and gather a resource (res), or fish for food (res -1). */
  Gather: 10,
  /** Idle warriors: go hunting for food. */
  Hunt: 11,
  /** A building that makes a resource (res): make n batches of it. */
  Make: 12,
  /** A research building: research it (res is the research). */
  Research: 13,
  /** The main base: upgrade to its next tier. */
  Upgrade: 14,
  /** A worker whose tools cannot work a resource (res): better tools, as Upgrade equipment makes them, then gather it. */
  Tools: 15,
} as const;
const GREY_ASKS: readonly number[] = Object.values(GreyAsk);

/** At most this many questions answer one click (s): enough for a building short of a level, a research and two resources. */
export const GREY_ASKS_MAX = 4;
/** How far down the causes go when the one who could sort a cause out cannot do it now either (s): the Forge short of ore, the main base's upgrade short of stone. */
export const GREY_DEPTH = 2;
/** Workers tried, nearest first, for one that can reach the resource (a cap on the searching, not a rule). */
const WORKERS_TRIED = 12;

/** Head orders a worker is never pulled from to gather: a farmer's or miner's job, training, eating, upgrading, going in, fetching a cart. */
const STANDING = new Set(['job', 'train', 'eat', 'kitUp', 'enter', 'cart']);
/** Head orders of a worker that is gathering already: asked before workers on other work. */
const GATHERING = new Set(['gather', 'forage', 'return', 'dropoff']);

/** Resources a worker can gather from the land (not a carcass: that is the hunters'). */
const NODE_RES: ReadonlySet<number> = new Set(PROPS.filter((p) => p.name !== 'Carcass').map((p) => nodeResource(p.kind)).filter((r) => r >= 0));
/** Food on the land: fish. */
const FOOD_WANT: ReadonlyMap<number, number> = new Map(FOODS.filter((r) => NODE_RES.has(r)).map((r) => [r, 1000]));

/** One cause of a greyed-out button, and what it is wanted for ("for the Forge"). */
type Need =
  | { k: 'res'; res: number; n: number; for: string; made?: boolean }
  | { k: 'food'; n: number; for: string }
  | { k: 'base'; level: number; for: string }
  | { k: 'research'; r: number; for: string }
  | { k: 'supply'; for: string };

/** A question about to be asked. */
interface Asking {
  who: number;
  building: boolean;
  q: number;
  units: number[];
  res: number;
  n?: number;
  text: string;
  yes: string;
  no: string;
}

/** The last click each player's questions answer, and their ids: the same click while they are up does nothing (not state). */
const lastClick = new WeakMap<SimState, Map<number, { sig: string; ids: number[] }>>();

/** Things the commands module does that this one runs on Yes (set there; commands.ts imports this module). */
export const greyHooks: {
  upgradeProblem: (state: SimState, b: Building, by: number) => string;
  upgrade: (state: SimState, b: Building, by: number) => void;
} = { upgradeProblem: () => 'Upgrades are not wired.', upgrade: () => {} };

// ----- words -----

/** "40 stone", "10 copper ingots"; with `more`, "40 more stone". */
function amount(res: number, n: number, more = false): string {
  const name = RESOURCES[res]!.name.toLowerCase();
  return `${n}${more ? ' more' : ''} ${n !== 1 && name.endsWith('ingot') ? `${name}s` : name}`;
}

/** "for the Forge", or nothing. */
function forText(what: string): string {
  return what ? ` for ${what}` : '';
}

function stripCount(name: string): string {
  return name.replace(/\s*\(\d+\)$/, '');
}

/** What a product is called after "for": the thing it is, a research step, or "training". */
function productLabel(product: Product): string {
  const s = productSpec(product);
  if (s.research !== undefined) return `${s.name} research`;
  if (s.recipe !== undefined) return `the ${stripCount(s.name).toLowerCase()}`;
  if (s.engine !== undefined) return `the ${s.name.toLowerCase()}`;
  return 'training';
}

// ----- the causes -----

/** Each resource of a cost the pool is short of. */
function costNeeds(pool: Int32Array, cost: Cost, label: string): Need[] {
  const out: Need[] = [];
  for (const [res, n] of cost) {
    const have = haveOf(pool, res);
    if (have < n) out.push({ k: 'res', res, n: n - have, for: label });
  }
  return out;
}

/** The way of paying that leaves the fewest resources short (the first of those), and its shortfall. */
function waysNeeds(pool: Int32Array, ways: readonly Cost[], label: string): Need[] {
  let best: Need[] | null = null;
  for (const way of ways) {
    const needs = costNeeds(pool, way, label);
    if (!best || needs.length < best.length) best = needs;
    if (needs.length === 0) break;
  }
  return best ?? [];
}

/** A kit's causes: each piece's metal step (a main base tier) and research, then what its first way of paying is short of after the pieces before it. */
function piecesNeeds(state: SimState, player: number, research: number, pieces: readonly Piece[], label: string): Need[] {
  const out: Need[] = [];
  const forge = forgeStepOf(state, player);
  for (const p of pieces) {
    const need = TIER_NEEDS[p.need]!;
    // No Forge at all: nobody can put one up from a bubble.
    if (forge > 0 && forge < need.forge) out.push({ k: 'base', level: FORGE_STEP_BASE[need.forge]!, for: label });
    for (const r of [...need.research, ...(p.research ?? [])]) if (!hasResearch(research, r)) out.push({ k: 'research', r, for: label });
  }
  if (out.length > 0 || pieces.some((p) => pieceProblem(p, research, forge, () => '') !== '')) return out;
  const left = Int32Array.from(state.players[player]!.pool);
  const short = new Map<number, number>();
  for (const p of pieces) {
    const way = p.cost.find((c) => c.every(([r, n]) => haveOf(left, r) >= n)) ?? p.cost[0] ?? [];
    for (const [r, n] of way) {
      // "Lumber" is either kind (Patch 5): what is left of both counts, and is used up kind by kind.
      const have = Math.max(0, haveOf(left, r));
      if (have < n) short.set(r, (short.get(r) ?? 0) + n - have);
      payAny(left, [[r, Math.min(n, have)]]);
    }
  }
  for (const [res, n] of short) out.push({ k: 'res', res, n, for: label });
  return out;
}

/** Why a research step cannot start: the main base tier, the step before it, a thing smelted once, and its fee. */
function researchNeeds(state: SimState, player: number, r: number, tech: number): Need[] {
  const spec = RESEARCH[r];
  const p = state.players[player]!;
  if (!spec || spec.retired || spec.later || hasResearch(p.research, r as Research) || researchQueued(state, player, r)) return [];
  const label = `${spec.name} research`;
  const out: Need[] = [];
  if ((spec.base ?? 0) > mainBaseLevel(state, player)) out.push({ k: 'base', level: spec.base!, for: label });
  if (spec.after && !hasResearch(p.research | tech, spec.after)) out.push({ k: 'research', r: spec.after, for: label });
  if (spec.made && (p.made & spec.made) === 0) {
    const made = RECIPES.find((x) => x.made === spec.made);
    if (made) out.push({ k: 'res', res: made.outputs[0]![0], n: 1, for: label, made: true });
  }
  out.push(...costNeeds(p.pool, spec.cost, label));
  return out;
}

function researchQueued(state: SimState, player: number, r: number): boolean {
  return state.buildings.list.some((b) => b.queue.some((q) => q.by === player && q.product === RESEARCH_PRODUCT + r));
}

/** Every cause a product cannot be queued at a building, as productProblem finds the first of them, and supply as the button checks it. */
function productNeeds(state: SimState, b: Building, product: Product, player: number): Need[] {
  const spec = productSpec(product);
  const p = state.players[player]!;
  const research = p.research | b.tech;
  const label = productLabel(product);
  const base = mainBaseLevel(state, player);
  const out: Need[] = [];
  if (spec.slaughter !== undefined) return [];
  if (spec.research !== undefined) return researchNeeds(state, player, spec.research, b.tech);
  if (spec.recipe !== undefined) {
    const r = RECIPES[spec.recipe]!;
    if (r.later) return [];
    if (r.base > base) out.push({ k: 'base', level: r.base, for: label });
    if (r.research && !hasResearch(research, r.research as Research)) out.push({ k: 'research', r: r.research, for: label });
    out.push(...waysNeeds(p.pool, r.inputs, label));
    return out;
  }
  if (spec.engine !== undefined) {
    const s = engineSpec(spec.engine);
    if (s.base > base) out.push({ k: 'base', level: s.base, for: label });
    if (!hasResearch(research, s.research as Research)) out.push({ k: 'research', r: s.research, for: label });
    out.push(...costNeeds(p.pool, spec.cost, label));
  } else if (spec.pieces) out.push(...piecesNeeds(state, player, research, spec.pieces, label));
  if (spec.food > 0) {
    const food = eatableFood(p);
    if (food < spec.food) out.push({ k: 'food', n: spec.food - food, for: label });
  } else if (spec.engine === undefined && !spec.pieces) out.push(...costNeeds(p.pool, spec.cost, label));
  const need = supplyNeed(product);
  if (need > 0 && supplyUsed(state, player) + need > supplyCap(state, player)) out.push({ k: 'supply', for: label });
  return out;
}

/** Why a building cannot go up a level: research and its cost (only main bases have levels since Patch 2). */
function upgradeNeeds(state: SimState, b: Building, player: number): Need[] {
  const next = buildingSpec(b.kind).levels[b.level];
  if (!b.complete || b.upgrading || !next) return [];
  const label = `the ${next.name}`;
  const out: Need[] = [];
  if (next.needsBase > Math.max(mainBaseLevel(state, b.owner), b.kind === BuildingKind.MainBase ? b.level : 0)) out.push({ k: 'base', level: next.needsBase, for: label });
  if (next.research && !hasResearch(state.players[player]!.research | b.tech, next.research as Research)) out.push({ k: 'research', r: next.research, for: label });
  out.push(...costNeeds(state.players[player]!.pool, next.cost, label));
  return out;
}

/** Why a building cannot be placed: its main base tier, its research, and its cost. */
function buildingNeeds(state: SimState, player: number, kind: number): Need[] {
  const spec = buildingSpec(kind);
  if (!spec.live) return [];
  const l = levelSpec(kind, 1);
  const label = `the ${spec.name}`;
  const out: Need[] = [];
  if (l.needsBase > mainBaseLevel(state, player)) out.push({ k: 'base', level: l.needsBase, for: label });
  if (l.research && !hasResearch(state.players[player]!.research, l.research as Research)) out.push({ k: 'research', r: l.research, for: label });
  out.push(...costNeeds(state.players[player]!.pool, buildCost(state, player, kind), label));
  return out;
}

// ----- who sorts each out -----

/** Whether a unit of the player can be asked: theirs, alive, outside, not a mercenary, not asking already or asked this click. */
function askable(state: SimState, player: number, i: number, used: Set<string>): boolean {
  const e = state.entities;
  if (e.owner[i] !== player || e.hp[i]! <= 0 || e.inside[i] !== 0) return false;
  if (e.role[i] === Role.Mercenary || e.role[i] === Role.People) return false;
  const id = e.id[i]!;
  return !used.has(`u${id}`) && !isAsking(state, id, false);
}

/** How far a worker may look for a node, as a gatherer that ran out looks (Ask.Farther): what it can walk back from by nightfall. */
function findNode(state: SimState, i: number, want: ReadonlyMap<number, number>): NodePick | null {
  const e = state.entities;
  const x = e.x[i]!;
  const z = e.z[i]!;
  const h = homeOf(state, i);
  const max = h ? h.reach + fromBuilding(h.b, x, z) : GATHER_SWITCH_M * WU_PER_METRE;
  const fits = h ? (px: number, pz: number): boolean => fromBuilding(h.b, px, pz) <= h.reach : undefined;
  return chooseNode(state, i, x, z, max, new Map(want), fits);
}

/** The worker to gather: those gathering or idle first, then the rest, nearest the place first, the first whose tools work a node of it in reach. */
function gatherer(state: SimState, player: number, want: ReadonlyMap<number, number>, ax: number, az: number, used: Set<string>): number {
  for (const i of workersInOrder(state, player, ax, az, used)) if (findNode(state, i, want)) return i;
  return -1;
}

/** The workers that could be sent out, best placed first: idle or gathering before those on other work, then the nearest; at most WORKERS_TRIED. */
function workersInOrder(state: SimState, player: number, ax: number, az: number, used: Set<string>): number[] {
  const e = state.entities;
  const list: Array<{ i: number; busy: number; d: number }> = [];
  for (let i = 0; i < e.count; i++) {
    if (e.kind[i] !== UnitKind.Worker || !askable(state, player, i, used)) continue;
    const head = e.queue[i]![0];
    if (head && STANDING.has(head.t)) continue;
    list.push({ i, busy: !head || GATHERING.has(head.t) ? 0 : 1, d: dist2(e.x[i]!, e.z[i]!, ax, az) });
  }
  list.sort((a, b) => a.busy - b.busy || a.d - b.d || e.id[a.i]! - e.id[b.i]!);
  return list.slice(0, WORKERS_TRIED).map((c) => c.i);
}

/** Idle warriors to hunt: the nearest the place that is idle or holding and calm, with the idle ones round it it speaks for. */
function hunters(state: SimState, player: number, ax: number, az: number, used: Set<string>): number[] {
  const e = state.entities;
  const free = (i: number): boolean => {
    if (e.kind[i] !== UnitKind.Warrior || isCrewman(state, i) || !askable(state, player, i, used)) return false;
    const q = e.queue[i]!;
    return e.target[i] === 0 && e.chasing[i] === 0 && (q.length === 0 || (q.length === 1 && q[0]!.t === 'hold'));
  };
  let best = -1;
  for (let i = 0; i < e.count; i++) {
    if (!free(i)) continue;
    if (best < 0) best = i;
    else {
      const d = dist2(e.x[i]!, e.z[i]!, ax, az) - dist2(e.x[best]!, e.z[best]!, ax, az);
      if (d < 0 || (d === 0 && e.id[i]! < e.id[best]!)) best = i;
    }
  }
  if (best < 0) return [];
  const out = [best];
  const r = SPEAK_FOR_M * WU_PER_METRE;
  for (const j of state.grid.nearOthers(e.x[best]!, e.z[best]!, r)) {
    if (j !== best && free(j) && length2d(e.x[j]! - e.x[best]!, e.z[j]! - e.z[best]!) <= r && !out.includes(j)) out.push(j);
  }
  return out;
}

/** The player's buildings that can be asked, finished, of these kinds, the shortest queue first, then the nearest the place. */
function buildingsOf(state: SimState, player: number, ok: (b: Building) => boolean, ax: number, az: number, used: Set<string>): Building[] {
  const near = (b: Building): number => {
    const [x, z] = buildingCentre(b);
    return dist2(x, z, ax, az);
  };
  return state.buildings.list
    .filter((b) => b.complete && b.hp > 0 && usableBy(state, b, player) && !used.has(`b${b.id}`) && !isAsking(state, b.id, true) && ok(b))
    .sort((a, b) => a.queue.length - b.queue.length || near(a) - near(b) || a.id - b.id);
}

/** The main base that upgrades: the player's highest, the oldest of those. */
function mainBase(state: SimState, player: number): Building | undefined {
  let best: Building | undefined;
  for (const b of state.buildings.list) if (b.owner === player && b.kind === BuildingKind.MainBase && b.complete && b.hp > 0 && (!best || b.level > best.level)) best = b;
  return best;
}

/** The main base asks to go up a tier ('base' and 'supply'); or, when it cannot, null and what stops it. */
function upgradeAsk(state: SimState, player: number, why: string, used: Set<string>): { ask: Asking | null; deeper: Need[] } {
  const b = mainBase(state, player);
  if (!b || b.upgrading || used.has(`b${b.id}`) || isAsking(state, b.id, true)) return { ask: null, deeper: [] };
  const next = levelSpec(b.kind, b.level + 1);
  if (b.level >= buildingSpec(b.kind).levels.length) return { ask: null, deeper: [] };
  if (greyHooks.upgradeProblem(state, b, player)) return { ask: null, deeper: upgradeNeeds(state, b, player) };
  return {
    ask: {
      who: b.id,
      building: true,
      q: GreyAsk.Upgrade,
      units: [],
      res: -1,
      text: `${why} Upgrade to ${next.name}?`,
      yes: `The main base goes up to ${next.name} (tier ${b.level + 1}). From the stock now: ${costText(next.cost)}. Then workers build it: right-click it with workers.${next.supply ? ` Supply ${next.supply}.` : ''}`,
      no: 'It stays as it is.',
    },
    deeper: [],
  };
}

/** Who sorts a cause out, and the question; or, when nobody can now, the causes of that. */
function resolve(state: SimState, player: number, need: Need, ax: number, az: number, used: Set<string>): { ask: Asking | null; deeper: Need[] } {
  const e = state.entities;
  const none = { ask: null, deeper: [] };
  switch (need.k) {
    case 'base':
      if (mainBaseLevel(state, player) >= need.level) return none;
      return upgradeAsk(state, player, `We need a tier ${need.level} main base${forText(need.for)}.`, used);
    case 'supply': {
      // Only an upgrade the stock pays for now, and only one that gives supply: a Farm cannot be put up from a bubble.
      const b = mainBase(state, player);
      const next = b ? buildingSpec(b.kind).levels[b.level] : undefined;
      if (!b || !next || next.supply <= levelSpec(b.kind, b.level).supply) return none;
      const r = upgradeAsk(state, player, `We need more supply${forText(need.for)}.`, used);
      return { ask: r.ask, deeper: [] };
    }
    case 'research': {
      if (hasResearch(state.players[player]!.research, need.r as Research) || researchQueued(state, player, need.r)) return none;
      const product = RESEARCH_PRODUCT + need.r;
      const at = buildingsOf(state, player, (b) => offers(b, product), ax, az, used);
      const b = at.find((x) => x.queue.length < QUEUE_LIMIT && productProblem(state, x, product, player) === '');
      const spec = RESEARCH[need.r]!;
      if (!b) return at.length > 0 ? { ask: null, deeper: researchNeeds(state, player, need.r, at[0]!.tech) } : none;
      return {
        ask: {
          who: b.id,
          building: true,
          q: GreyAsk.Research,
          units: [],
          res: need.r,
          text: `We need ${spec.name} research${forText(need.for)}. Shall I start it?`,
          yes: `${spec.name} is queued here. From the stock now: ${spec.cost.length ? costText(spec.cost) : 'nothing'}. It opens ${spec.opens.charAt(0).toLowerCase()}${spec.opens.slice(1)}`,
          no: 'Nothing is researched.',
        },
        deeper: [],
      };
    }
    case 'food': {
      const group = hunters(state, player, ax, az, used);
      if (group.length > 0) {
        const n = group.length;
        return {
          ask: {
            who: e.id[group[0]!]!,
            building: false,
            q: GreyAsk.Hunt,
            units: group.map((i) => e.id[i]!),
            res: -1,
            text: `We need ${need.n} more food${forText(need.for)}. Shall ${n === 1 ? 'I' : 'we'} go hunting?`,
            yes: `${n === 1 ? 'It goes' : `All ${n} go`} out after game, as Hunt does: home with the meat when their bags are half full, and back by nightfall. Takes nothing from the stock.`,
            no: `${n === 1 ? 'It stays' : 'They stay'} where ${n === 1 ? 'it is' : 'they are'}.`,
          },
          deeper: [],
        };
      }
      const w = gatherer(state, player, FOOD_WANT, ax, az, used);
      if (w < 0) return none;
      return {
        ask: {
          who: e.id[w]!,
          building: false,
          q: GreyAsk.Gather,
          units: [e.id[w]!],
          res: -1,
          text: `We need ${need.n} more food${forText(need.for)}. Shall I go fishing?`,
          yes: 'It fishes the nearest water with fish in it that it can walk back from before nightfall. Takes nothing from the stock.',
          no: 'It carries on with what it was doing.',
        },
        deeper: [],
      };
    }
    case 'res': {
      const name = RESOURCES[need.res]!.name.toLowerCase();
      if (!need.made && NODE_RES.has(need.res)) {
        const w = gatherer(state, player, new Map([[need.res, 1000]]), ax, az, used);
        if (w >= 0) {
          return {
            ask: {
              who: e.id[w]!,
              building: false,
              q: GreyAsk.Gather,
              units: [e.id[w]!],
              res: need.res,
              text: `We need ${amount(need.res, need.n, true)}${forText(need.for)}. Shall I go and gather some?`,
              yes: `It gathers ${name} from the nearest place it can walk back from before nightfall, and keeps at it. Takes nothing from the stock.`,
              no: 'It carries on with what it was doing.',
            },
            deeper: [],
          };
        }
      }
      // Made from other things: a building that makes it, the one with the shortest queue.
      const recipes = RECIPES.filter((r) => r.outputs.some(([o]) => o === need.res));
      let first: { b: Building; product: Product } | null = null;
      for (const r of recipes) {
        const product = RECIPE_PRODUCT + r.id;
        for (const b of buildingsOf(state, player, (x) => r.at.includes(x.kind) && offers(x, product), ax, az, used)) {
          first ??= { b, product };
          if (b.queue.length >= QUEUE_LIMIT || productProblem(state, b, product, player) !== '') continue;
          const per = r.outputs.find(([o]) => o === need.res)![1];
          const batches = Math.max(1, Math.min(QUEUE_LIMIT - b.queue.length, ceilDiv(need.n, per)));
          const smelt = b.kind === BuildingKind.Forge && /ingot|iron|steel/.test(name);
          return {
            ask: {
              who: b.id,
              building: true,
              q: GreyAsk.Make,
              units: [],
              res: need.res,
              n: batches,
              text: `We need ${amount(need.res, need.n, true)}${forText(need.for)}. Shall I ${smelt ? 'smelt' : 'make'} ${batches * per}?`,
              yes: `${batches === 1 ? 'A batch' : `${batches} batches`} of ${stripCount(r.name).toLowerCase()} ${batches === 1 ? 'is' : 'are'} queued here, ${amount(need.res, batches * per)} in all. From the stock now, for each batch: ${costText(payableInputs(r, state.players[player]!.pool) ?? r.inputs[0]!)}.`,
              no: 'Nothing is queued.',
            },
            deeper: [],
          };
        }
      }
      // On the land, but no worker's tools can work it (copper ore before a stone maul): better tools first.
      if (!need.made && NODE_RES.has(need.res)) {
        const t = toolsAsk(state, player, need, ax, az, used);
        if (t.ask || t.deeper.length > 0) return t;
      }
      return first ? { ask: null, deeper: productNeeds(state, first.b, first.product, player) } : none;
    }
  }
}

/** What each job's tools do to a node, for the bubble. */
const WORKS: readonly string[] = ['fell', 'break', 'build with', 'cut'];

/**
 * A worker that could reach a resource with better tools the stock pays for
 * now offers to make them and go for it: the cheapest that would do, not
 * Upgrade equipment's best. When the cheapest that would do is not paid for,
 * what the stock is short of for them.
 */
function toolsAsk(state: SimState, player: number, need: Need & { k: 'res' }, ax: number, az: number, used: Set<string>): { ask: Asking | null; deeper: Need[] } {
  const e = state.entities;
  const prop = PROPS.find((p) => p.name !== 'Carcass' && nodeResource(p.kind) === need.res);
  if (!prop) return { ask: null, deeper: [] };
  const job = propJob(prop.kind);
  let short: Need[] = [];
  for (const i of workersInOrder(state, player, ax, az, used)) {
    const t = toolsFor(state, player, i, need.res, job);
    if (!t) continue;
    if (!('to' in t)) {
      if (short.length === 0) short = t.short;
      continue;
    }
    const kit = TOOL_KITS[t.to]!.name.toLowerCase();
    return {
      ask: {
        who: e.id[i]!,
        building: false,
        q: GreyAsk.Tools,
        units: [e.id[i]!],
        res: need.res,
        text: `We need ${amount(need.res, need.n, true)}${forText(need.for)}, and my tools can't ${WORKS[job] ?? 'work'} it. Shall I make ${kit} and go and gather some?`,
        yes: `It makes ${kit} at the nearest Forge, Barracks or main base, then gathers ${RESOURCES[need.res]!.name.toLowerCase()} from the nearest place it can walk back from before nightfall. From the stock now: ${costText(t.plan.cost)}.`,
        no: 'It carries on with what it was doing.',
      },
      deeper: [],
    };
  }
  return { ask: null, deeper: short };
}

type ToolsPick = { to: number; plan: { cost: Cost; ways: number }; pick: NodePick } | { short: Need[] };

/**
 * The cheapest tool kit a worker could make now (researched, paid from the
 * stock) that reaches a node of a resource, with how it is paid and the node;
 * else what the stock is short of for the cheapest that would reach one;
 * null when none would, or the worker has an upgrade on the way or nowhere
 * to make one.
 */
function toolsFor(state: SimState, player: number, i: number, res: number, job: number): ToolsPick | null {
  const h = kitHolder(state, i);
  if (!h || h.kind !== 'worker' || pendingKitUp(state, i, Line.Weapon) || !nearestUpgradePlace(state, i, h)) return null;
  const tech = techOf(state, player);
  const pool = state.players[player]!.pool;
  const want = new Map([[res, 1000]]);
  let tool = TOOL_KITS[h.w]?.tools[job] ?? 0;
  for (let to = h.w + 1; to < TOOL_KITS.length; to++) {
    const kit = TOOL_KITS[to]!;
    // Only a kit whose tool for the job is better can reach more.
    if (kit.tools[job]! <= tool) continue;
    tool = kit.tools[job]!;
    const pieces = upgradePieces(h, Line.Weapon, to);
    if (pieces.some((p) => pieceProblem(p, tech.research, tech.forge, tech.researchName) !== '')) return null;
    const pick = withTools(state, i, to, () => findNode(state, i, want));
    if (!pick) continue;
    const plan = planPieces(pieces, pool);
    return plan ? { to, plan, pick } : { short: waysNeeds(pool, kit.cost, `the ${kit.name.toLowerCase()}`) };
  }
  return null;
}

/** Runs a look with a worker holding a tool kit tier's tools, and puts its own back: only the look sees them. */
function withTools<T>(state: SimState, i: number, tier: number, look: () => T): T {
  const e = state.entities;
  const had = TOOL_FIELDS.map((f) => e[f][i]!);
  TOOL_FIELDS.forEach((f, j) => (e[f][i] = TOOL_GEAR[tier]![j]!));
  try {
    return look();
  } finally {
    TOOL_FIELDS.forEach((f, j) => (e[f][i] = had[j]!));
  }
}

/**
 * The questions for a click's causes: breadth first, the click's own causes
 * before what stops their answers, each cause once, each speaker once. A
 * resource wanted again further down (the Barracks's lumber, then the
 * Hall's that its main base tier waits on) is added to the question
 * already asking for it: both costs less what the stock has, for both.
 */
function askingFor(state: SimState, player: number, needs: Need[], ax: number, az: number): Asking[] {
  const out: Asking[] = [];
  const used = new Set<string>();
  const seen = new Set<string>();
  const asked = new Map<string, { need: Need & { k: 'res' }; at: number; fors: string[] }>();
  const pool = state.players[player]!.pool;
  const speaking = (a: Asking): string[] => [`${a.building ? 'b' : 'u'}${a.who}`, ...(a.building ? [] : a.units.map((id) => `u${id}`))];
  let level: Need[] = needs;
  for (let depth = 0; depth <= GREY_DEPTH && level.length > 0 && out.length < GREY_ASKS_MAX; depth++) {
    const next: Need[] = [];
    for (const need of level) {
      if (out.length >= GREY_ASKS_MAX) break;
      const key = need.k === 'res' ? `res${need.res}` : need.k === 'research' ? `r${need.r}` : need.k === 'supply' ? 'base' : need.k;
      if (seen.has(key)) {
        const was = asked.get(key);
        if (!was || need.k !== 'res') continue;
        // The same speaker is still the best placed: free it and ask again with the sum.
        if (!was.fors.includes(need.for)) was.fors.push(need.for);
        const more: Need & { k: 'res' } = { ...was.need, n: was.need.n + need.n + haveOf(pool, need.res), for: listed(was.fors) };
        for (const k of speaking(out[was.at]!)) used.delete(k);
        const r = resolve(state, player, more, ax, az, used);
        if (r.ask) {
          out[was.at] = r.ask;
          was.need = more;
        }
        for (const k of speaking(out[was.at]!)) used.add(k);
        continue;
      }
      seen.add(key);
      const r = resolve(state, player, need, ax, az, used);
      if (r.ask) {
        if (need.k === 'res') asked.set(key, { need, at: out.length, fors: [need.for] });
        out.push(r.ask);
        for (const k of speaking(r.ask)) used.add(k);
      } else next.push(...r.deeper);
    }
    level = next;
  }
  return out;
}

/** "the Barracks", "the Barracks and the Longhall", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)!}`;
}

/** Where the click's questions are asked from: the building clicked on, else the selected units, else the main base. */
function anchor(state: SimState, o: GreyedOrder): [number, number] | null {
  const b = o.building ? state.buildings.get(o.building) : undefined;
  if (b) return buildingCentre(b);
  const e = state.entities;
  let n = 0;
  let x = 0;
  let z = 0;
  for (const id of o.units) {
    const i = e.indexOf(id);
    if (i < 0 || e.owner[i] !== o.player) continue;
    x += e.x[i]!;
    z += e.z[i]!;
    n++;
  }
  if (n > 0) return [floorDiv(x, n), floorDiv(z, n)];
  const m = mainBase(state, o.player);
  return m ? buildingCentre(m) : null;
}

/**
 * A greyed-out button clicked (GreyedOrder): the click's earlier questions
 * still up end, and the ones best placed to sort out each cause ask. The
 * same click again while its questions are up does nothing.
 */
export function askGreyed(state: SimState, o: GreyedOrder): void {
  const player = o.player;
  const p = state.players[player];
  if (!p || p.out) return;
  const sig = `${o.what}:${o.id}:${o.building}`;
  const clicks = lastClick.get(state) ?? new Map<number, { sig: string; ids: number[] }>();
  lastClick.set(state, clicks);
  const was = clicks.get(player);
  if (was && was.sig === sig && openQuestions(state).some((q) => was.ids.includes(q.id))) return;
  closeAsks(state, player, GREY_ASKS);
  let needs: Need[] = [];
  if (o.what === Greyed.Building) needs = buildingNeeds(state, player, o.id);
  else {
    const b = state.buildings.get(o.building);
    if (!b || !b.complete || !usableBy(state, b, player)) return;
    if (o.what === Greyed.Product) {
      if (!offers(b, o.id)) return;
      needs = productNeeds(state, b, o.id, player);
    } else needs = upgradeNeeds(state, b, player);
  }
  const at = anchor(state, o);
  if (!at || needs.length === 0) {
    clicks.delete(player);
    return;
  }
  const ids = askingFor(state, player, needs, at[0], at[1]).map((a) =>
    askNow(state, player, a.who, a.building, { q: a.q, units: a.units, res: a.res, yes: a.yes, no: a.no, ...(a.n !== undefined ? { n: a.n } : {}) }, a.text),
  );
  clicks.set(player, { sig, ids });
}

// ----- the answer -----

/** Yes to one of these questions: what the matching button does. When it can no longer be done, the one that asked says why. */
function answerGreyed(state: SimState, o: AnswerOrder): void {
  if (o.yes !== 1 || !GREY_ASKS.includes(o.q)) return;
  const e = state.entities;
  const player = o.player;
  switch (o.q) {
    case GreyAsk.Gather: {
      const i = e.indexOf(o.who);
      if (i < 0 || e.owner[i] !== player || e.hp[i]! <= 0 || e.kind[i] !== UnitKind.Worker) return;
      if (o.res >= RESOURCES.length) return;
      const pick = findNode(state, i, o.res >= 0 ? new Map([[o.res, 1000]]) : FOOD_WANT);
      const name = o.res >= 0 ? (RESOURCES[o.res]?.short ?? 'it').toLowerCase() : 'fish';
      if (!pick) {
        say(state, i, `I can't find any ${name} within reach.`, true);
        return;
      }
      giveOrder(state, i, { t: 'gather', cx: pick.cx, cz: pick.cz, i: pick.i }, false);
      say(state, i, `I'll fetch ${name}.`, false, true);
      return;
    }
    case GreyAsk.Hunt: {
      // The Hunt button's order: out after game, over and over, home at dusk.
      for (const id of o.units) {
        const i = e.indexOf(id);
        if (i < 0 || e.owner[i] !== player || e.hp[i]! <= 0 || e.kind[i] !== UnitKind.Warrior || isCrewman(state, i)) continue;
        giveOrder(state, i, { t: 'hunt', id: 0, auto: 1, x: e.x[i]!, z: e.z[i]!, k: 0, kx: 0, kz: 0 }, false);
      }
      return;
    }
    case GreyAsk.Make: {
      const b = state.buildings.get(o.who);
      if (!b || !b.complete || !usableBy(state, b, player) || o.res < 0) return;
      const products = RECIPES.filter((r) => r.outputs.some(([x]) => x === o.res)).map((r) => RECIPE_PRODUCT + r.id).filter((x) => offers(b, x));
      const product = products.find((x) => productProblem(state, b, x, player) === '') ?? products[0];
      if (product === undefined) return;
      // The making button's order, once for each batch.
      for (let k = 0; k < Math.max(1, o.n ?? 1); k++) {
        const why = queueProduct(state, b, product, player);
        if (why) {
          if (k === 0) sayBuilding(state, b, why, true);
          return;
        }
      }
      return;
    }
    case GreyAsk.Research: {
      const b = state.buildings.get(o.who);
      if (!b || !b.complete || !usableBy(state, b, player) || o.res <= 0 || o.res >= RESEARCH.length) return;
      const why = queueProduct(state, b, RESEARCH_PRODUCT + o.res, player);
      if (why) sayBuilding(state, b, why, true);
      return;
    }
    case GreyAsk.Tools: {
      const i = e.indexOf(o.who);
      if (i < 0 || e.owner[i] !== player || e.hp[i]! <= 0 || e.kind[i] !== UnitKind.Worker || o.res < 0 || o.res >= RESOURCES.length) return;
      const prop = PROPS.find((p) => p.name !== 'Carcass' && nodeResource(p.kind) === o.res);
      const t = prop ? toolsFor(state, player, i, o.res, propJob(prop.kind)) : null;
      const h = kitHolder(state, i);
      const place = h ? nearestUpgradePlace(state, i, h) : undefined;
      if (!t || !('to' in t) || !place) {
        say(state, i, "I can't make tools for that now.", true);
        return;
      }
      // The gather first, so the tools go in front of it: made, then out for the resource (Upgrade equipment's kitUp order).
      giveOrder(state, i, { t: 'gather', cx: t.pick.cx, cz: t.pick.cz, i: t.pick.i }, false);
      pay(state.players[player]!.pool, t.plan.cost);
      inFront(state, i, { t: 'kitUp', line: Line.Weapon, to: t.to, ways: t.plan.ways, paid: 1, b: place.id });
      say(state, i, `Off to the ${buildingName(place.kind, place.level, place.variant).toLowerCase()} to make ${TOOL_KITS[t.to]!.name.toLowerCase()}.`, false, true);
      return;
    }
    case GreyAsk.Upgrade: {
      const b = state.buildings.get(o.who);
      if (!b || !usableBy(state, b, player)) return;
      const why = greyHooks.upgradeProblem(state, b, player);
      if (why) {
        sayBuilding(state, b, why, true);
        return;
      }
      greyHooks.upgrade(state, b, player);
      return;
    }
  }
}

answerHooks.other = answerGreyed;

