// The simulation worker: owns the state and steps it at 20 steps per second,
// applying the local player's orders through a per-step queue, and posts a
// compact state after every step for the renderer to interpolate, plus the
// chunks whose land changed and the land newly explored. Between steps it
// generates the chunks around the units a ring ahead, so walking into new
// land never stalls a step (the cache is not state, so this cannot desync).
import {
  assigned,
  BUILDINGS,
  buildingName,
  buildingStatus,
  buildRequirement,
  chunkDelta,
  claimShapes,
  clockAt,
  chunkKeyX,
  chunkKeyZ,
  COLUMNS_PER_CHUNK,
  createWorld,
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
  workersAt,
  workSteps,
  STEPS_PER_SECOND,
  WU_PER_COLUMN,
  type ChunkDelta,
  type HitEvent,
  type Order,
  type SimEvent,
  type SimState,
  type UnitOrder,
} from '@blockyrts/sim';
import { S, SHOT_STRIDE, STATE_STRIDE, UnitFlag, type BuildingInfo, type FromWorker, type ToWorker } from './messages.ts';

const STEP_MS = 1000 / STEPS_PER_SECOND;
/** Never run more than this many steps in one tick; a long stall slows the game instead of freezing the tab. */
const MAX_CATCH_UP = 5;
/** Generating a chunk takes a few milliseconds; only start one with this much time left before the next step. */
const PREFETCH_MARGIN_MS = 25;
/** The local player. */
const PLAYER = 0;
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
/** A hurt unit plays its injured clip this long, steps. */
const HURT_SHOW_STEPS = 8;

function send(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
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
    data[o + S.tool] = e.tool[i]!;
    data[o + S.carryRes] = e.carryRes[i]!;
    data[o + S.carryAmt] = e.carryAmt[i]!;
    data[o + S.inside] = e.inside[i]!;
    data[o + S.act] = e.act[i]!;
    data[o + S.mob] = e.mob[i]!;
    data[o + S.weapon] = e.weapon[i]!;
    data[o + S.backup] = e.backup[i]!;
    data[o + S.ranged] = e.ranged[i]!;
    data[o + S.shield] = e.shield[i]!;
    data[o + S.boots] = e.boots[i]!;
    data[o + S.torch] = e.torchUntil[i]! > s.step ? 1 : 0;
    data[o + S.swing] = e.atkAt[i] !== 0 ? e.atkWith[i]! + 1 : 0;
    let flags = 0;
    if (e.climbUntil[i]! > s.step) flags |= UnitFlag.Climbing;
    if (e.fleeing[i]) flags |= UnitFlag.Fleeing;
    if (e.slowUntil[i]! > s.step) flags |= UnitFlag.Slowed;
    if (e.heldUntil[i]! > s.step) flags |= UnitFlag.Held;
    if (e.hurtAt[i]! > 0 && s.step - e.hurtAt[i]! < HURT_SHOW_STEPS) flags |= UnitFlag.Hurt;
    data[o + S.flags] = flags;
    data[o + S.lock] = e.lock[i]!;
    data[o + S.skills] = e.skills[i]!;
    data[o + S.ammo] = e.ammo[i]!;
    data[o + S.target] = e.target[i]!;
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

/** Buildings, the pool, order lists and events: what the HUD shows besides the units. */
function postInfo(s: SimState): void {
  const buildings: BuildingInfo[] = s.buildings.list.map((b) => {
    const light = BUILDINGS[b.kind]!.light;
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
      queue: b.queue.map((q, k) => ({ product: q.product, done: k === 0 ? q.progress : 0 })),
      rally: b.rally.map((r) => ({ ...r })),
      lit: isLit(b, s.step),
      fuelLeft: light && b.complete ? Math.max(0, b.fuelUntil - s.step) : 0,
      assigned: assigned(s, b.id).length,
      working: b.complete ? workersAt(s, b) : 0,
      inside: unitsInside(s, b.id).map((i) => s.entities.id[i]!),
      status: buildingStatus(s, b),
      name: buildingName(b.kind, b.level, b.variant),
      upgradeWhy: b.owner === PLAYER ? upgradeProblem(s, b) : '',
    };
  });
  const e = s.entities;
  const queues: Array<[number, UnitOrder[]]> = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === PLAYER) queues.push([e.id[i]!, e.queue[i]!.map((o) => ({ ...o }))]);
  const c = clockAt(s.step);
  const night = c.period === Period.Dawn ? c.cycle + 1 : c.cycle;
  const me = s.players[PLAYER]!;
  const pool = me.pool.slice();
  const items = me.items.slice();
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
      items,
      research: me.research,
      autoEquip: me.autoEquip !== 0,
      sites: s.sites.filter((x) => x.owner === PLAYER).map((x) => ({ ...x })),
      over: s.over,
      nights: nightsSurvived(s.over || s.step),
      out: me.out !== 0,
    },
    [pool.buffer, items.buffer],
  );
  events = [];
}

/** Changed chunks and newly explored land since the last post. */
function postWorld(s: SimState, all = false): void {
  const w = s.world;
  const keys = all ? new Set([...w.edited.keys(), ...w.propChanges.keys(), ...w.addedProps.keys()]) : w.dirty;
  if (keys.size > 0) {
    const deltas: ChunkDelta[] = [];
    for (const key of keys) deltas.push(chunkDelta(w, chunkKeyX(key), chunkKeyZ(key)));
    w.dirty.clear();
    send({ type: 'deltas', step: s.step, deltas });
  }
  const fogKeys = all ? new Set(w.explored[PLAYER]!.keys()) : w.fogDirty[PLAYER]!;
  if (fogKeys.size > 0) {
    const chunks: Array<[number, number, Uint8Array]> = [];
    for (const key of fogKeys) chunks.push([chunkKeyX(key), chunkKeyZ(key), w.explored[PLAYER]!.get(key)!.slice()]);
    for (const set of w.fogDirty) set.clear();
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

function tick(): void {
  if (!state) return;
  const now = performance.now();
  const stepMs = STEP_MS / speed;
  if (now - clock > stepMs * MAX_CATCH_UP * speed) clock = now - stepMs * MAX_CATCH_UP * speed;
  let stepped = false;
  while (now - clock >= stepMs) {
    clock += stepMs;
    const orders = pending;
    pending = [];
    log.record(state.step, orders);
    const r = step(state, orders);
    if (r.hash !== undefined) {
      lastHash = r.hash;
      lastHashStep = r.step;
    }
    for (const ev of state.events) if (ev.player === PLAYER || ev.player < 0) events.push(ev);
    for (const h of state.hits) hits.push(h);
    postState(state);
    stepped = true;
  }
  if (stepped) {
    postWorld(state);
    postInfo(state);
  } else if (stepMs - (performance.now() - clock) > PREFETCH_MARGIN_MS) prefetch(state);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'start') {
    state = createWorld(msg.seed, { players: msg.players });
    clock = performance.now();
    postState(state);
    postWorld(state, true);
    postInfo(state);
    if (timer === undefined) timer = setInterval(tick, 4);
  } else if (msg.type === 'order') {
    pending.push(msg.order);
  } else if (msg.type === 'speed') {
    speed = Math.max(1, Math.min(16, Math.floor(msg.factor)));
  } else if (msg.type === 'place' && state) {
    const s = state;
    const spots = msg.spots.map(([x, z]) => {
      const tiles = placementTiles(s, PLAYER, msg.kind, x, z, msg.variant);
      return { x, z, tiles, blocked: tiles.find((t) => t !== 0) ?? 0 };
    });
    send({ type: 'placed', id: msg.id, kind: msg.kind, spots }, spots.map((p) => p.tiles.buffer));
  }
};
