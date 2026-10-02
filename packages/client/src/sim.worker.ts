// The simulation worker: owns the state and steps it at 20 steps per second,
// applying the local player's orders through a per-step queue, and posts a
// compact state after every step for the renderer to interpolate, plus the
// chunks whose land changed and the land newly explored. Between steps it
// generates the chunks around the units a ring ahead, so walking into new
// land never stalls a step (the cache is not state, so this cannot desync).
import {
  chunkDelta,
  chunkKeyX,
  chunkKeyZ,
  COLUMNS_PER_CHUNK,
  createWorld,
  InputLog,
  step,
  STEPS_PER_SECOND,
  WU_PER_COLUMN,
  type ChunkDelta,
  type Order,
  type SimState,
} from '@blockyrts/sim';
import { STATE_STRIDE, type FromWorker, type ToWorker } from './messages.ts';

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

function send(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer });
}

function postState(s: SimState): void {
  const e = s.entities;
  const data = new Int32Array(e.count * STATE_STRIDE);
  for (let i = 0; i < e.count; i++) {
    const o = i * STATE_STRIDE;
    data[o] = e.id[i]!;
    data[o + 1] = e.owner[i]!;
    data[o + 2] = e.kind[i]!;
    data[o + 3] = e.x[i]!;
    data[o + 4] = e.y[i]!;
    data[o + 5] = e.z[i]!;
    data[o + 6] = e.heading[i]!;
    data[o + 7] = e.order[i]!;
  }
  send({ type: 'state', step: s.step, hash: lastHash, hashStep: lastHashStep, count: e.count, data }, [data.buffer]);
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
  if (now - clock > STEP_MS * MAX_CATCH_UP) clock = now - STEP_MS * MAX_CATCH_UP;
  let stepped = false;
  while (now - clock >= STEP_MS) {
    clock += STEP_MS;
    const orders = pending;
    pending = [];
    log.record(state.step, orders);
    const r = step(state, orders);
    if (r.hash !== undefined) {
      lastHash = r.hash;
      lastHashStep = r.step;
    }
    postState(state);
    stepped = true;
  }
  if (stepped) postWorld(state);
  else if (STEP_MS - (performance.now() - clock) > PREFETCH_MARGIN_MS) prefetch(state);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'start') {
    state = createWorld(msg.seed, { players: msg.players });
    clock = performance.now();
    postState(state);
    postWorld(state, true);
    if (timer === undefined) timer = setInterval(tick, 4);
  } else if (msg.type === 'order') {
    pending.push(msg.order);
  }
};
