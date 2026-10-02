// The simulation worker: owns the state and steps it at 20 steps per second,
// applying the local player's orders through a per-step queue, and posts a
// compact state after every step for the renderer to interpolate.
import { createWorld, InputLog, step, STEPS_PER_SECOND, type Order, type SimState } from '@blockyrts/sim';
import { STATE_STRIDE, type FromWorker, type ToWorker } from './messages.ts';

const STEP_MS = 1000 / STEPS_PER_SECOND;
/** Never run more than this many steps in one tick; a long stall slows the game instead of freezing the tab. */
const MAX_CATCH_UP = 5;

let state: SimState | null = null;
let lastHash = 0;
let lastHashStep = 0;
/** Orders waiting for the next step. Lockstep adds a delay of D steps in M9; locally the next step is enough. */
let pending: Order[] = [];
const log = new InputLog();
let timer: ReturnType<typeof setInterval> | undefined;
let clock = 0;

function post(s: SimState): void {
  const e = s.entities;
  const data = new Int32Array(e.count * STATE_STRIDE);
  const ownIds: number[] = [];
  for (let i = 0; i < e.count; i++) {
    const o = i * STATE_STRIDE;
    data[o] = e.x[i]!;
    data[o + 1] = e.z[i]!;
    data[o + 2] = e.heading[i]!;
    data[o + 3] = e.owner[i]!;
    if (e.owner[i] === 0) ownIds.push(e.id[i]!);
  }
  const msg: FromWorker = { type: 'state', step: s.step, hash: lastHash, hashStep: lastHashStep, count: e.count, data, ownIds };
  self.postMessage(msg, { transfer: [data.buffer] });
}

function tick(): void {
  if (!state) return;
  const now = performance.now();
  if (now - clock > STEP_MS * MAX_CATCH_UP) clock = now - STEP_MS * MAX_CATCH_UP;
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
    post(state);
  }
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'start') {
    state = createWorld(msg.seed);
    clock = performance.now();
    post(state);
    if (timer === undefined) timer = setInterval(tick, 4);
  } else if (msg.type === 'order') {
    pending.push(msg.order);
  }
};
