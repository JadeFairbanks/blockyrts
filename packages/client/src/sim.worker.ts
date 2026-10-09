// The simulation worker: owns the state and steps it at 20 steps per second,
// applying the local player's orders through a per-step queue, and posts a
// compact state after every step for the renderer to interpolate, plus the
// chunks whose land changed and the land newly explored. Between steps it
// generates the chunks around the units a ring ahead, so walking into new
// land never stalls a step (the cache is not state, so this cannot desync).
//
// Alone, the worker steps on its own clock with the orders given since the
// last step. In an online match (milestone 9) it runs the lockstep: the
// page relays every player's frames in and this player's frames out, and a
// step runs only once every playing slot's frame for it has arrived.
import { LockstepScheduler, type WireFrame } from '@blockyrts/protocol';
import {
  deserializeState,
  periodStarting,
  serializeState,
  usableBy,
  validateOrder,
} from '@blockyrts/sim';
import {
  DREADNOUGHT,
  dreadnoughtCap,
  dreadnoughtProblem,
  dreadnoughtsAlive,
  eatableFood,
  mainBaseLevel,
  tavernInfo,
  animalsAt,
  assigned,
  bagItems,
  canLoot,
  carryView,
  FOG_TILE_COLUMNS,
  BuildingKind,
  forgeStepOf,
  productProblem,
  stalledHorses,
  mageDefault,
  mageLock,
  mageSchoolsAt,
  tinkerProgress,
  rankXp,
  troopDefault,
  troopTypesAt,
  upgradeProgress,
  productsOf,
  starvingSince,
  mealQuarters,
  FOODS,
  BUILDINGS,
  buildingName,
  buildingStatus,
  buildRequirement,
  farmBandLine,
  farmBoost,
  farmHarvest,
  queueHead,
  stackLeft,
  chunkDelta,
  claimShapes,
  clockAt,
  chunkKeyX,
  chunkKeyZ,
  COLUMNS_PER_CHUNK,
  createWorld,
  fogged,
  InputLog,
  isLit,
  levelSpec,
  nightsSurvived,
  projectileAt,
  maxHealth,
  outlyingLights,
  placementTiles,
  Period,
  step,
  supplyCap,
  supplyUsed,
  unitsInside,
  upgradeProblem,
  UnitKind,
  visionSources,
  workersAt,
  workSteps,
  runsNow,
  STEPS_PER_SECOND,
  WU_PER_COLUMN,
  type Building,
  type ChunkDelta,
  type HitEvent,
  type Order,
  type SimEvent,
  type SimState,
  type UnitOrder,
  toolInHand,
  MANA_SCALE,
  mageMaxMana,
  mageTrainingProblem,
  mageTrainingProgress,
  autocastOn,
  schoolSpells,
  spellProblem,
  spellReadyAt,
} from '@blockyrts/sim';
import { barnOf, cloaked, crewOf, haulerOf, isCrystalGuardian, isWoodsman, menOnTop, Mount, mountSpec, onTop, platformCrew, platformEngine, topRoom, woodsmanLedger } from '@blockyrts/sim';
import { OrderKind, PROSPECT_HAMMER_STEPS, PROSPECT_STEPS, PROSPECT_TOOL_TIER, PropShape, propInfo } from '@blockyrts/sim';
import { peoplesInfo } from './peoples-info.ts';
import { S, SHOT_STRIDE, SpellOn, STATE_STRIDE, Task, UnitFlag, type BuildingInfo, type FarmInfo, type FromWorker, type TavernPanel, type ToWorker } from './messages.ts';
import { threatMarks } from './minimap/marks.ts';

const STEP_MS = 1000 / STEPS_PER_SECOND;
/** Never run more than this many steps in one tick; a long stall slows the game instead of freezing the tab. */
const MAX_CATCH_UP = 5;
/** Generating a chunk takes a few milliseconds; only start one with this much time left before the next step. */
const PREFETCH_MARGIN_MS = 25;
/** The local player's index in the sim (0 alone; in an online match, their seat). */
let PLAYER = 0;
const CHUNK_WU = COLUMNS_PER_CHUNK * WU_PER_COLUMN;

let state: SimState | null = null;
let lastHash = 0;
let lastHashStep = 0;
/** Orders waiting for the next step. Lockstep adds a delay of D steps in M9; locally the next step is enough. */
let pending: Order[] = [];
const log = new InputLog();
let timer: ReturnType<typeof setInterval> | undefined;
let clock = 0;
/** Debug speed: steps per step time. */
let speed = 1;
/** The local player's events since the last info post. */
let events: SimEvent[] = [];
/** Hits since the last state post. */
let hits: HitEvent[] = [];
/** Paused: alone from the menu, online by the relay (a player missing, a manual pause, a reload). */
let paused = false;
/**
 * The online match: the lockstep scheduler, which sim player sits in each
 * relay slot (seats[p] is player p's slot), and the snapshot epoch the
 * page tags this worker's hashes with.
 */
let net: { sched: LockstepScheduler<Order>; seats: number[]; epoch: number } | null = null;
/** The slots the last stall waited on, as posted. */
let waitingOn = '';
/** A hurt unit plays its injured clip this long, steps. */
const HURT_SHOW_STEPS = 8;

function send(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
}

/** A gathered node's work by its shape (props.ts PropShape): trees and bushes chopped, plants picked, fish caught, carcasses butchered, the rest mined. */
const GATHER_TASKS: Record<number, number> = { [PropShape.Tree]: Task.Chop, [PropShape.Bush]: Task.Chop, [PropShape.Plant]: Task.Gather, [PropShape.Fish]: Task.Fish, [PropShape.Carcass]: Task.Butcher };

/** What a worker is at now (Task), from the order at the head of its list and how it is working it; 0 while it walks or waits. */
function taskOf(s: SimState, i: number): number {
  const e = s.entities;
  const order = e.order[i]!;
  const head = e.queue[i]![0];
  // Standing by a wild animal with its food; at a gun, pushing it or working it.
  if (head?.t === 'tame' && order === OrderKind.Idle) return Task.Tame;
  if (head?.t === 'crew') return Task.Crew;
  if (order !== OrderKind.Chop && order !== OrderKind.Mine && order !== OrderKind.Farm && order !== OrderKind.Dig) return Task.None;
  switch (head?.t) {
    case 'gather': {
      const view = s.world.prop(head.cx, head.cz, head.i, s.step);
      return view ? (GATHER_TASKS[propInfo(view.kind).shape] ?? Task.Mine) : Task.None;
    }
    case 'work':
    case 'repairAll':
    case 'mend':
      return Task.Build;
    // Saplings and sprouts pulled off a building's spot.
    case 'build':
      return Task.Clear;
    case 'relight':
      return Task.Relight;
    case 'prospect':
      return Task.Prospect;
    case 'job':
      return order === OrderKind.Farm ? Task.Field : Task.None;
    case 'dig':
      return Task.Dig;
  }
  return order === OrderKind.Dig ? Task.Dig : Task.None;
}

function postState(s: SimState): void {
  const e = s.entities;
  const data = new Int32Array(e.count * STATE_STRIDE);
  for (let i = 0; i < e.count; i++) {
    const o = i * STATE_STRIDE;
    data[o + S.id] = e.id[i]!;
    data[o + S.owner] = e.owner[i]!;
    data[o + S.kind] = e.kind[i]!;
    data[o + S.x] = e.x[i]!;
    data[o + S.y] = e.y[i]!;
    data[o + S.z] = e.z[i]!;
    data[o + S.heading] = e.heading[i]!;
    data[o + S.order] = e.order[i]!;
    data[o + S.hp] = e.hp[i]!;
    data[o + S.maxHp] = e.maxHp[i]!;
    data[o + S.rank] = e.rank[i]!;
    data[o + S.toolChop] = e.toolChop[i]!;
    data[o + S.carryRes] = e.carryRes[i]!;
    data[o + S.carryAmt] = e.carryAmt[i]!;
    data[o + S.inside] = e.inside[i]!;
    data[o + S.act] = e.act[i]!;
    data[o + S.mob] = e.mob[i]!;
    data[o + S.weapon] = e.weapon[i]!;
    data[o + S.troop] = e.troop[i]!;
    data[o + S.ranged] = e.ranged[i]!;
    data[o + S.shield] = e.shield[i]!;
    data[o + S.wTier] = e.wTier[i]!;
    data[o + S.aTier] = e.aTier[i]!;
    data[o + S.sTier] = e.sTier[i]!;
    data[o + S.tips] = e.tips[i]!;
    data[o + S.swing] = e.atkAt[i] !== 0 ? e.atkWith[i]! + 1 : 0;
    let flags = 0;
    if (e.climbUntil[i]! > s.step || e.onFace[i] !== 0) flags |= UnitFlag.Climbing;
    if (e.running[i] === 1) flags |= runsNow(s, i) ? UnitFlag.RunMode | UnitFlag.Running : UnitFlag.RunMode;
    if (e.fleeing[i]) flags |= UnitFlag.Fleeing;
    if (e.slowUntil[i]! > s.step) flags |= UnitFlag.Slowed;
    if (e.heldUntil[i]! > s.step) flags |= UnitFlag.Held;
    if (e.hurtAt[i]! > 0 && s.step - e.hurtAt[i]! < HURT_SHOW_STEPS) flags |= UnitFlag.Hurt;
    if (e.born[i]! > s.step) flags |= UnitFlag.Young;
    if (e.sex[i] === 1) flags |= UnitFlag.Male;
    if (starvingSince(s, i)) flags |= UnitFlag.Starving;
    if (e.mount[i] !== Mount.None && e.runWu[i]! >= mountSpec(e.mount[i]!).chargeRun) flags |= UnitFlag.Charging;
    if (e.kind[i] === UnitKind.Mob && cloaked(s, i, Number.MAX_SAFE_INTEGER)) flags |= UnitFlag.Cloaked;
    if (e.lowUntil[i]! > s.step) flags |= UnitFlag.Swooping;
    if (e.shared[i] !== 0) flags |= UnitFlag.Shared;
    if (onTop(s, i)) flags |= UnitFlag.OnTop;
    if (e.autoRepair[i] !== 0) flags |= UnitFlag.AutoRepair;
    if (isCrystalGuardian(s, i)) flags |= UnitFlag.Guardian;
    // A Barn's hand (Patch 5): he wears the farmer's hat while he is one (Jade's GP-37).
    if (e.kind[i] === UnitKind.Worker && barnOf(s, i)) flags |= UnitFlag.BarnHand;
    data[o + S.flags] = flags;
    data[o + S.lock] = e.lock[i]!;
    data[o + S.target] = e.target[i]!;
    data[o + S.armour] = e.armour[i]!;
    const head = e.queue[i]![0];
    if (head?.t === 'kitUp') {
      const [done, total] = upgradeProgress(s, i);
      data[o + S.upDone] = total > 0 ? Math.min(1000, Math.floor((done * 1000) / total)) : 0;
      data[o + S.upLine] = head.line + 1;
      data[o + S.upTo] = head.to;
    }
    data[o + S.kit] = e.kit[i]!;
    data[o + S.partner] = e.partner[i]!;
    data[o + S.hop] = Math.max(0, e.hopUntil[i]! - s.step);
    data[o + S.hopRise] = e.hopRise[i]!;
    data[o + S.toolBreak] = e.toolBreak[i]!;
    data[o + S.toolBuild] = e.toolBuild[i]!;
    data[o + S.toolCut] = e.toolCut[i]!;
    data[o + S.toolHand] = e.kind[i] === UnitKind.Worker ? toolInHand(e, i) : 0;
    if (e.kind[i] === UnitKind.Mage) {
      data[o + S.school] = e.school[i]!;
      data[o + S.mana] = Math.floor(e.mana[i]! / MANA_SCALE);
      data[o + S.maxMana] = Math.floor(mageMaxMana(e.rank[i]!, e.wTier[i]!) / MANA_SCALE);
      data[o + S.cast] = e.castSpell[i]!;
      data[o + S.beam] = e.beamUntil[i]! > s.step ? e.beamTarget[i]! : 0;
      // A wand tap shows as a swing; a cast or a beam as the cast.
    }
    let on = 0;
    if (e.quickUntil[i]! > s.step) on |= SpellOn.Quicken;
    if (e.fortUntil[i]! > s.step) on |= SpellOn.Fortify;
    if (e.rallyUntil[i]! > s.step) on |= SpellOn.Rally;
    if (e.wardUntil[i]! > s.step) on |= SpellOn.Warding;
    if (e.healUntil[i]! > s.step) on |= SpellOn.Healing;
    if (e.hexUntil[i]! > s.step) on |= SpellOn.Hexed;
    data[o + S.spells] = on;
    data[o + S.group] = e.group[i]!;
    if (e.mount[i] !== Mount.None) {
      data[o + S.mount] = e.mount[i]!;
      data[o + S.mountHp] = e.mountHp[i]!;
      data[o + S.mountMax] = mountSpec(e.mount[i]!).hp;
    }
    if (e.kind[i] === UnitKind.Engine) data[o + S.crew] = crewOf(s, i).length + (haulerOf(s, i) >= 0 ? 1000 : 0);
    data[o + S.meal] = mealQuarters(s, i);
    data[o + S.hungry] = starvingSince(s, i);
    const [tinkerDone, tinkerOf] = tinkerProgress(s, i);
    data[o + S.tinkerDone] = tinkerDone;
    data[o + S.tinkerOf] = tinkerOf;
    if (e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Warrior) {
      const task = taskOf(s, i);
      data[o + S.task] = task;
      // Prospecting shows its bar like a timed action (Patch 5): the steps done of the steps it takes with the worker's tools.
      if (task === Task.Prospect) {
        data[o + S.tinkerDone] = e.timer[i]!;
        data[o + S.tinkerOf] = e.wTier[i]! >= PROSPECT_TOOL_TIER ? PROSPECT_HAMMER_STEPS : PROSPECT_STEPS;
      }
    }
    const [xp, xpNext] = rankXp(s, i);
    data[o + S.xp] = xp;
    data[o + S.xpNext] = xpNext;
  }
  const shots = new Int32Array(s.projectiles.length * SHOT_STRIDE);
  s.projectiles.forEach((p, k) => {
    const o = k * SHOT_STRIDE;
    const [x, y, z] = projectileAt(p, p.age);
    const [nx, ny, nz] = projectileAt(p, p.age + 1);
    shots[o] = x;
    shots[o + 1] = y;
    shots[o + 2] = z;
    shots[o + 3] = nx;
    shots[o + 4] = ny;
    shots[o + 5] = nz;
    shots[o + 6] = p.shot;
    shots[o + 7] = p.flags;
  });
  const out = hits;
  hits = [];
  send({ type: 'state', step: s.step, hash: lastHash, hashStep: lastHashStep, count: e.count, data, shots, hits: out }, [data.buffer, shots.buffer]);
}

/** A farm's next harvest for the panel's progress bar, or null. */
function farmInfo(s: SimState, b: Building): FarmInfo | null {
  const h = farmHarvest(s, b);
  if (!h) return null;
  return {
    res: h.res,
    items: h.items,
    food: h.food,
    grows: h.grows,
    done: Math.floor((h.done * 1000) / h.whole),
    stepsLeft: h.perStep > 0 ? Math.ceil((h.whole - h.done) / h.perStep) : 0,
    band: farmBandLine(s, b),
  };
}

/** A finished Tavern's panel (Patch 5), or null. */
function tavernPanel(s: SimState, b: Building): TavernPanel | null {
  const t = tavernInfo(b);
  if (!t) return null;
  const me = s.players[PLAYER];
  const hireWhy = !usableBy(s, b, PLAYER) || !me ? 'Not your Tavern.' : dreadnoughtProblem(s, PLAYER) || (eatableFood(me) < DREADNOUGHT.food ? `Not enough food (${DREADNOUGHT.food} food).` : '');
  return {
    open: t.open,
    whole: t.whole,
    thousandths: t.thousandths,
    done: Math.min(1000, Math.floor((t.done * 1000) / t.span)),
    stepsLeft: t.open ? t.span - t.done : 0,
    madeWhole: t.madeWhole,
    madeThousandths: t.madeThousandths,
    food: t.food,
    hireWhy,
    dreadnoughts: dreadnoughtsAlive(s, PLAYER),
    cap: dreadnoughtCap(mainBaseLevel(s, PLAYER)),
  };
}

/** A building's queue for the panel: the head item's bar and the steps it has left at the sim's own pace (0 while on hold), the rest waiting. */
function queueInfo(s: SimState, b: Building): BuildingInfo['queue'] {
  const h = queueHead(s, b);
  return b.queue.map((q, k) => {
    // A stack: a bonemeal stack counts what is left after the one under way, a scrap stack all that are left.
    const n = q.count > 0 ? q.count + 1 : stackLeft(q);
    const count = n > 1 ? { count: n } : {};
    if (k > 0 || !h) return { product: q.product, done: 0, stepsLeft: 0, ...count };
    return { product: q.product, done: Math.min(1000, Math.floor((h.done * 1000) / Math.max(1, h.whole))), stepsLeft: h.stepsLeft, ...count };
  });
}

/** Buildings, the pool, order lists and events: what the HUD shows besides the units. */
function postInfo(s: SimState): void {
  const buildings: BuildingInfo[] = s.buildings.list.map((b) => {
    const total = workSteps(b.kind, 1);
    return {
      id: b.id,
      owner: b.owner,
      kind: b.kind,
      variant: b.variant,
      level: b.level,
      x: b.x,
      z: b.z,
      y: b.y,
      hp: b.hp,
      maxHp: b.complete ? maxHealth(b) : levelSpec(b.kind, 1).health,
      complete: b.complete,
      built: Math.min(1000, Math.floor((b.progress * 1000) / total)),
      upgrading: b.upgrading,
      upgraded: b.upgrading ? Math.min(1000, Math.floor((b.upProgress * 1000) / workSteps(b.kind, b.upgrading))) : 0,
      queue: queueInfo(s, b),
      rally: b.rally.map((r) => ({ ...r })),
      lit: isLit(b),
      assigned: assigned(s, b.id).length,
      working: b.complete ? workersAt(s, b) : 0,
      // A Citadel's fixed engine and its crew are on the platform for good (Patch 5): not in the panel's portraits, nobody to let out.
      inside: unitsInside(s, b.id).filter((i) => s.entities.kind[i] !== UnitKind.Engine && !platformCrew(s, i)).map((i) => s.entities.id[i]!),
      up: menOnTop(s, b.id).map((i) => s.entities.id[i]!),
      room: topRoom(s, b),
      fixedEngine: platformEngine(s, b.id) >= 0 ? s.entities.id[platformEngine(s, b.id)]! : 0,
      status: buildingStatus(s, b),
      name: buildingName(b.kind, b.level, b.variant),
      upgradeWhy: usableBy(s, b, PLAYER) ? upgradeProblem(s, b, PLAYER) : '',
      products: usableBy(s, b, PLAYER) && b.complete ? productsOf(b).map((p): [number, string] => [p, productProblem(s, b, p, PLAYER)]) : [],
      shared: b.shared !== 0,
      stock: b.stock.map(([r, n]): [number, number] => [r, n]),
      rating: b.rating,
      herd: b.kind === BuildingKind.Barn ? animalsAt(s, b.id).length : 0,
      troops:
        usableBy(s, b, PLAYER) && b.complete
          ? troopTypesAt(b).map((troop) => {
              const { w, a, s: sh } = troopDefault(s, b, troop, PLAYER);
              return { troop, w, a, s: sh, lock: b.locks[troop] ?? 0 };
            })
          : [],
      mages:
        usableBy(s, b, PLAYER) && b.complete
          ? mageSchoolsAt(b).map((school) => {
              const { w, a } = mageDefault(s, b, school, PLAYER);
              return { school, w, a, lock: b.locks[mageLock(school)] ?? 0 };
            })
          : [],
      horses: b.kind === BuildingKind.Barracks && b.complete ? stalledHorses(s, b, PLAYER).length : 0,
      farm: farmInfo(s, b),
      boost: farmBoost(s, b),
      tavern: tavernPanel(s, b),
    };
  });
  const e = s.entities;
  const queues: Array<[number, UnitOrder[]]> = [];
  const spells: Array<[number, Array<[number, string, number, number]>]> = [];
  const mageTraining: Array<[number, number, number]> = [];
  const mageRanks: Array<[number, string]> = [];
  const bags: Array<[number, Array<[number, number]>]> = [];
  const woodsmen: Array<[number, number, number, number, number]> = [];
  const carry: Array<[number, number, number]> = [];
  const effects: Array<[number, Array<[number, number]>]> = [];
  const untils = [[SpellOn.Quicken, e.quickUntil], [SpellOn.Fortify, e.fortUntil], [SpellOn.Rally, e.rallyUntil], [SpellOn.Warding, e.wardUntil], [SpellOn.Healing, e.healUntil], [SpellOn.Hexed, e.hexUntil]] as const;
  for (let i = 0; i < e.count; i++) {
    // The spells on any unit, with the steps they have left (Patch 5, GP-34: a bar on each picture).
    let on: Array<[number, number]> | null = null;
    for (const [bit, until] of untils) if (until[i]! > s.step) (on ??= []).push([bit, until[i]! - s.step]);
    if (on) effects.push([e.id[i]!, on]);
    if (e.owner[i] !== PLAYER) continue;
    if (isWoodsman(e, i)) {
      const l = woodsmanLedger(s, i);
      woodsmen.push([e.id[i]!, l.brought, l.ate, l.steps, l.keep]);
    }
    queues.push([e.id[i]!, e.queue[i]!.map((o) => ({ ...o }))]);
    if (e.bag[i]!.length > 0) bags.push([e.id[i]!, bagItems(s, i)]);
    if (canLoot(s, i)) carry.push([e.id[i]!, ...carryView(s, i)]);
    if (e.kind[i] === UnitKind.Mage) mageRanks.push([e.id[i]!, mageTrainingProblem(s, i)]);
    if (e.kind[i] === UnitKind.Mage) {
      spells.push([e.id[i]!, schoolSpells(e.school[i]!).map((sp): [number, string, number, number] => [sp, spellProblem(s, i, sp), Math.max(0, spellReadyAt(s, i, sp) - s.step), autocastOn(s, i, sp) ? 1 : 0])]);
      const training = mageTrainingProgress(s, i);
      if (training) mageTraining.push([e.id[i]!, training.done, training.total]);
    }
  }
  const c = clockAt(s.step);
  const night = c.period === Period.Dawn ? c.cycle + 1 : c.cycle;
  const me = s.players[PLAYER]!;
  const pool = me.pool.slice();
  const open = me.open.slice();
  send(
    {
      type: 'info',
      step: s.step,
      pool,
      supplyUsed: supplyUsed(s, PLAYER),
      supplyCap: supplyCap(s, PLAYER),
      buildings,
      queues,
      events,
      claims: claimShapes(s, PLAYER),
      outlying: outlyingLights(s, PLAYER, night),
      buildWhy: BUILDINGS.map((spec) => buildRequirement(s, PLAYER, spec.kind)),
      research: me.research,
      forge: forgeStepOf(s, PLAYER),
      sites: s.sites.filter((x) => x.owner === PLAYER).map((x) => ({ ...x })),
      over: s.over,
      nights: nightsSurvived(s.over || s.step),
      out: me.out !== 0,
      rations: me.rations,
      kept: FOODS.filter((f) => me.kept[f]),
      open,
      starveWorkers: me.starveWorkers > 0,
      starveTroops: me.starveTroops > 0,
      fog: fogged(s),
      god: me.god === 1,
      ruins: s.threats.ruins.map((r): [number, number, number] => [r.mob, r.x, r.z]),
      marks: threatMarks(s, PLAYER),
      spells,
      mageTraining,
      mageRanks,
      peoples: peoplesInfo(s, PLAYER),
      players: s.players.map((ps) => ({ share: ps.share, out: ps.out !== 0 })),
      loot: s.loot
        .filter((l) => s.world.isExplored(Math.floor(l.x / FOG_TILE_WU), Math.floor(l.z / FOG_TILE_WU)))
        .map((l) => ({ id: l.id, res: l.res, amt: l.amt, x: l.x, y: l.y, z: l.z, own: l.owner < 0 || l.owner === PLAYER })),
      bags,
      woodsmen,
      carry,
      effects,
    },
    [pool.buffer, open.buffer],
  );
  events = [];
}

/** A fog tile's width, wu. */
const FOG_TILE_WU = FOG_TILE_COLUMNS * WU_PER_COLUMN;

/** What the players' side sees now, for the fog of war: every player's units and buildings (sim/state.ts visionSources). */
function postVision(s: SimState): void {
  const sources = visionSources(s);
  send({ type: 'vision', step: s.step, sources }, [sources.buffer]);
}

/** Changed chunks and newly explored land (the whole side's) since the last post. */
function postWorld(s: SimState, all = false): void {
  const w = s.world;
  const keys = all ? new Set([...w.edited.keys(), ...w.propChanges.keys(), ...w.addedProps.keys()]) : w.dirty;
  if (keys.size > 0) {
    const deltas: ChunkDelta[] = [];
    for (const key of keys) deltas.push(chunkDelta(w, chunkKeyX(key), chunkKeyZ(key)));
    w.dirty.clear();
    send({ type: 'deltas', step: s.step, deltas });
  }
  const fogKeys = all ? new Set(w.explored.keys()) : w.fogDirty;
  if (fogKeys.size > 0) {
    const chunks: Array<[number, number, Uint8Array]> = [];
    for (const key of fogKeys) chunks.push([chunkKeyX(key), chunkKeyZ(key), w.explored.get(key)!.slice()]);
    w.fogDirty.clear();
    send({ type: 'fog', chunks });
  }
}

/** Generates one chunk the units are about to need, if any is missing. */
function prefetch(s: SimState): void {
  const e = s.entities;
  for (let i = 0; i < e.count; i++) {
    const ux = Math.floor(e.x[i]! / CHUNK_WU);
    const uz = Math.floor(e.z[i]! / CHUNK_WU);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!s.world.isCached(ux + dx, uz + dz)) {
          s.world.generated(ux + dx, uz + dz);
          return;
        }
      }
    }
  }
}

/** Runs one step with these orders and posts what the page needs. */
function runStep(s: SimState, orders: Order[]): void {
  log.record(s.step, orders);
  const r = step(s, orders);
  if (r.hash !== undefined) {
    lastHash = r.hash;
    lastHashStep = r.step;
    if (net) send({ type: 'hash', epoch: net.epoch, step: r.step, hash: r.hash });
  }
  for (const ev of s.events) if (heard(s, ev)) events.push(ev);
  for (const h of s.hits) hits.push(h);
  postState(s);
  // Autosave at every dawn (Saving and disconnects): the same bytes on every machine.
  if (periodStarting(s.step - 1) === Period.Dawn) {
    const data = serializeState(s);
    send({ type: 'dawn', step: s.step, night: nightOf(s), data }, [data.buffer]);
  }
}

/**
 * Who sees what (Chat between players): a player sees their own events and
 * everyone's, and the speech of units inherited from a player who left;
 * never another active player's units' speech, even under shared control.
 * Every player sees every question's bubble (Patch 2), its buttons only its owner.
 */
function heard(s: SimState, ev: SimEvent): boolean {
  if (ev.player === PLAYER || ev.player < 0 || ev.kind === 'question') return true;
  if (ev.kind !== 'speech' || ev.speaker === undefined || s.players[PLAYER]?.out) return false;
  const i = s.entities.indexOf(ev.speaker);
  return i >= 0 && s.entities.shared[i] !== 0;
}

/** The night count for a save's header and the Load screen: the nights survived so far. */
function nightOf(s: SimState): number {
  return nightsSurvived(s.step);
}

/** One online step's orders: each slot's, stamped with its seat (the relay says who sent a frame), then the leavers. */
function netOrders(sched: LockstepScheduler<Order>, seats: readonly number[], at: number): Order[] {
  const input = sched.take(at);
  const orders: Order[] = [];
  for (const { slot, orders: list } of input.bySlot) {
    const player = seats.indexOf(slot);
    if (player < 0) continue;
    for (const o of list) {
      const stamped = { ...o, player } as Order;
      try {
        validateOrder(stamped);
      } catch {
        continue; // every machine drops the same bad order
      }
      orders.push(stamped);
    }
  }
  for (const slot of input.left) {
    const player = seats.indexOf(slot);
    if (player >= 0) orders.push({ kind: 'leave', player });
  }
  return orders;
}

function tick(): void {
  if (!state) return;
  const now = performance.now();
  if (paused) {
    clock = now;
    return;
  }
  const stepMs = STEP_MS / speed;
  if (now - clock > stepMs * MAX_CATCH_UP * speed) clock = now - stepMs * MAX_CATCH_UP * speed;
  let stepped = false;
  while (now - clock >= stepMs) {
    if (net) {
      const out = net.sched.outgoing(state.step);
      if (out.length > 0) send({ type: 'frames', frames: out });
      const missing = net.sched.waitingOn(state.step);
      if (missing.length > 0) {
        // Lockstep: wait for every player's frame; the page shows who after a second.
        clock = now;
        const key = missing.join(',');
        if (key !== waitingOn) {
          waitingOn = key;
          send({ type: 'waiting', slots: missing, step: state.step });
        }
        break;
      }
      if (waitingOn) {
        waitingOn = '';
        send({ type: 'waiting', slots: [], step: state.step });
      }
      clock += stepMs;
      runStep(state, netOrders(net.sched, net.seats, state.step));
    } else {
      clock += stepMs;
      const orders = pending;
      pending = [];
      runStep(state, orders);
    }
    stepped = true;
  }
  if (stepped) {
    postWorld(state);
    postVision(state);
    postInfo(state);
  } else if (stepMs - (performance.now() - clock) > PREFETCH_MARGIN_MS) prefetch(state);
}

/** Starts (or restarts) from a state: everything the page draws is sent again. */
function begin(s: SimState): void {
  state = s;
  clock = performance.now();
  lastHash = 0;
  lastHashStep = 0;
  pending = [];
  events = [];
  hits = [];
  waitingOn = '';
  postState(s);
  postWorld(s, true);
  postVision(s);
  postInfo(s);
  if (timer === undefined) timer = setInterval(tick, 4);
}

function netFrom(msg: { slot: number; seats: number[]; epoch: number; step: number; activeSlots: number; inputDelay: number; nextFrameStep: number; frames: WireFrame[] }): void {
  const sched = new LockstepScheduler<Order>({ slot: msg.slot, startStep: msg.step, activeSlots: msg.activeSlots, inputDelay: msg.inputDelay, nextFrameStep: msg.nextFrameStep });
  for (const f of msg.frames) sched.receive(f);
  net = { sched, seats: msg.seats, epoch: msg.epoch };
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'start': {
      PLAYER = msg.player;
      const s = msg.snapshot ? deserializeState(msg.snapshot) : createWorld(msg.seed, { players: msg.players });
      net = null;
      if (msg.net) netFrom({ ...msg.net, step: s.step, nextFrameStep: msg.net.nextFrameStep ?? s.step, frames: msg.net.frames ?? [] });
      paused = false;
      begin(s);
      break;
    }
    case 'load': {
      // A snapshot replaces the state (a rejoin or a reload after a desync).
      const s = deserializeState(msg.snapshot);
      netFrom({ ...msg, step: s.step });
      paused = false;
      begin(s);
      break;
    }
    case 'resume':
      // A rejoin that keeps this state: the frames missed since.
      if (net && state) {
        net.epoch = msg.epoch;
        net.sched.reset({ step: state.step, frames: msg.frames, nextFrameStep: msg.nextFrameStep, activeSlots: msg.activeSlots, inputDelay: msg.inputDelay });
      }
      break;
    case 'frames':
      if (net) for (const f of msg.frames) net.sched.receive(f);
      break;
    case 'inputDelay':
      if (net) net.sched.inputDelay = msg.steps;
      break;
    case 'pause':
      paused = msg.paused;
      break;
    case 'order':
      if (net) net.sched.queue(msg.order);
      else pending.push(msg.order);
      break;
    case 'speed':
      speed = net ? 1 : Math.max(1, Math.min(16, Math.floor(msg.factor)));
      break;
    case 'snapshot':
      // For a save or a peer's rejoin: the state as it is between steps.
      if (state) {
        const data = serializeState(state);
        send({ type: 'snapshot', id: msg.id, step: state.step, night: nightOf(state), data }, [data.buffer]);
      }
      break;
    case 'place': {
      if (!state) break;
      const s = state;
      const spots = msg.spots.map(([x, z]) => {
        const tiles = placementTiles(s, PLAYER, msg.kind, x, z, msg.variant);
        return { x, z, tiles, blocked: tiles.find((t) => t !== 0) ?? 0 };
      });
      send({ type: 'placed', id: msg.id, kind: msg.kind, spots }, spots.map((p) => p.tiles.buffer));
      break;
    }
  }
};
