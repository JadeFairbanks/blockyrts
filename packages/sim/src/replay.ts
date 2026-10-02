// Order scripts, the input ring buffer and offline replay: the pieces the
// headless runner and the desync tool are built from.

import { STEPS_PER_SECOND } from './fixed.ts';
import { validateOrder, type InputFrame, type Order } from './orders.ts';
import { deserializeState, diffStates, hashState, serializeState } from './serialize.ts';
import type { SimState } from './state.ts';
import { step } from './step.ts';

/** Groups frames by step. Two frames for the same step are merged in the given order. */
export function framesByStep(frames: readonly InputFrame[]): Map<number, Order[]> {
  const byStep = new Map<number, Order[]>();
  for (const f of frames) {
    if (!Number.isInteger(f.step) || f.step < 0) throw new Error(`bad frame step ${f.step}`);
    for (const o of f.orders) validateOrder(o);
    const list = byStep.get(f.step) ?? [];
    list.push(...f.orders);
    byStep.set(f.step, list);
  }
  return byStep;
}

export interface RunResult {
  /** [step, hash] every HASH_INTERVAL_STEPS steps. */
  hashes: Array<[number, number]>;
  finalStep: number;
  finalHash: number;
}

/**
 * Runs `steps` steps from the state's current step, applying each frame's
 * orders at the start of the step it names. Frames for steps already passed
 * are ignored.
 */
export function run(state: SimState, steps: number, frames: readonly InputFrame[] = []): RunResult {
  const byStep = framesByStep(frames);
  const hashes: Array<[number, number]> = [];
  for (let n = 0; n < steps; n++) {
    const r = step(state, byStep.get(state.step) ?? []);
    if (r.hash !== undefined) hashes.push([r.step, r.hash]);
  }
  return { hashes, finalStep: state.step, finalHash: hashState(state) };
}

/**
 * The last two minutes of input frames, kept by every client so that a
 * desync can be replayed offline from the last agreeing snapshot.
 */
export class InputLog {
  private readonly frames: (InputFrame | undefined)[];

  constructor(readonly capacity = 120 * STEPS_PER_SECOND) {
    this.frames = new Array<InputFrame | undefined>(capacity);
  }

  record(stepNo: number, orders: readonly Order[]): void {
    this.frames[stepNo % this.capacity] = { step: stepNo, orders: orders.map((o) => ({ ...o, units: [...o.units] })) };
  }

  /** Frames with orders for steps from..to inclusive that are still in the buffer, oldest first. */
  range(from: number, to: number): InputFrame[] {
    const out: InputFrame[] = [];
    for (let s = Math.max(from, to - this.capacity + 1); s <= to; s++) {
      const f = this.frames[s % this.capacity];
      if (f && f.step === s && f.orders.length > 0) out.push(f);
    }
    return out;
  }
}

/** What a client uploads after a desync: its last agreeing snapshot, the frames since, and its own hashes. */
export interface Recording {
  snapshot: Uint8Array;
  frames: InputFrame[];
  /** [step, hash] pairs this client computed while playing. */
  hashes: Array<[number, number]>;
}

export function makeRecording(state: SimState): Recording {
  return { snapshot: serializeState(state), frames: [], hashes: [] };
}

/** Replays a snapshot and frames up to `untilStep`, returning the state there. */
export function replayTo(snapshot: Uint8Array, frames: readonly InputFrame[], untilStep: number): SimState {
  const state = deserializeState(snapshot);
  if (untilStep < state.step) throw new Error(`cannot replay backwards from ${state.step} to ${untilStep}`);
  run(state, untilStep - state.step, frames);
  return state;
}

export interface DesyncReport {
  /** First step at which the two recordings' own hashes disagree. */
  firstBadStep: number;
  /** The first step and field where the two local replays differ, or null if they agree up to firstBadStep. */
  diff: string | null;
  /** Which recordings this machine fails to reproduce (their own hashes differ from a local replay). */
  notReproduced: Array<'a' | 'b'>;
}

/**
 * Compares two clients' recordings. Finds the first hash checkpoint where
 * they disagree, replays both locally step by step up to it, and names the
 * first diverging step and field. Returns null when every shared checkpoint
 * agrees.
 */
export function compareRecordings(a: Recording, b: Recording): DesyncReport | null {
  const hb = new Map(b.hashes);
  let firstBadStep = -1;
  for (const [s, h] of a.hashes) {
    const other = hb.get(s);
    if (other !== undefined && other !== h) {
      firstBadStep = s;
      break;
    }
  }
  if (firstBadStep < 0) return null;

  const notReproduced: Array<'a' | 'b'> = [];
  const check = (rec: Recording, label: 'a' | 'b'): void => {
    const st = replayTo(rec.snapshot, rec.frames, firstBadStep);
    const own = rec.hashes.find(([s]) => s === firstBadStep)?.[1];
    if (own !== undefined && own !== hashState(st)) notReproduced.push(label);
  };
  check(a, 'a');
  check(b, 'b');

  // Walk both replays forward together from the later snapshot and report the first differing field.
  const sa = deserializeState(a.snapshot);
  const sb = deserializeState(b.snapshot);
  const start = Math.max(sa.step, sb.step);
  const ra = replayTo(a.snapshot, a.frames, start);
  const rb = replayTo(b.snapshot, b.frames, start);
  const fa = framesByStep(a.frames);
  const fb = framesByStep(b.frames);
  let diff = diffStates(ra, rb);
  let at = start;
  while (diff === null && at < firstBadStep) {
    step(ra, fa.get(at) ?? []);
    step(rb, fb.get(at) ?? []);
    at++;
    diff = diffStates(ra, rb);
  }
  return { firstBadStep, diff: diff === null ? null : `step ${at}: ${diff}`, notReproduced };
}
