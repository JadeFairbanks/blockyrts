// The client half of lockstep, independent of any socket or of the sim: it
// decides which frames to send, collects every player's frames, and says when
// a step may run. The browser client's worker host and the headless test
// client both drive the sim through it.
//
// A client may run step N only when it holds every playing slot's frame for N.
// Each client sends exactly one frame per step, for step N + inputDelay while
// it is about to run N; the input delay hides the round trip. The first
// inputDelay steps of a match get empty frames. When the delay changes, the
// client fills any gap with empty frames and never sends a step twice, so the
// change needs no agreement between machines.

import { DEFAULT_INPUT_DELAY, MAX_INPUT_DELAY, MAX_PLAYERS } from './constants.ts';
import { FrameFlag, maskSlots, type WireFrame } from './messages.ts';
import { decodeOrders, encodeOrders, NO_ORDERS } from './orders.ts';

export interface OutgoingFrame {
  step: number;
  orders: Uint8Array;
}

export interface StepInput<T> {
  step: number;
  /** Each playing slot's orders for the step, in slot order. */
  bySlot: Array<{ slot: number; orders: T[] }>;
  /** Slots that leave the match at this step (eliminated or departed); their assets are shared out. */
  left: number[];
}

export interface SchedulerOptions {
  slot: number;
  startStep: number;
  activeSlots: number;
  inputDelay?: number;
  /** First step this client still has to send; defaults to startStep. */
  nextFrameStep?: number;
}

export class LockstepScheduler<T extends object = object> {
  readonly slot: number;
  private delay: number;
  private active: number[];
  /** Step at which a slot leaves; it needs no frames after that. */
  private readonly leaveAt = new Map<number, number>();
  private readonly frames = new Map<number, Array<WireFrame | undefined>>();
  private nextSend: number;
  private pending: T[] = [];
  private lowest: number;

  constructor(opts: SchedulerOptions) {
    this.slot = opts.slot;
    this.delay = clampDelay(opts.inputDelay ?? DEFAULT_INPUT_DELAY);
    this.active = maskSlots(opts.activeSlots);
    this.nextSend = opts.nextFrameStep ?? opts.startStep;
    this.lowest = opts.startStep;
  }

  get inputDelay(): number {
    return this.delay;
  }

  set inputDelay(steps: number) {
    this.delay = clampDelay(steps);
  }

  /** The first step this client has not yet sent a frame for. */
  get nextFrameStep(): number {
    return this.nextSend;
  }

  get activeSlots(): readonly number[] {
    return this.active;
  }

  /** Queues a local order; it goes out in the next frame sent. */
  queue(order: T): void {
    this.pending.push(order);
  }

  /**
   * The frames to send now that the client is about to run `currentStep`:
   * every unsent step up to currentStep + inputDelay, the queued orders in the
   * last of them.
   */
  outgoing(currentStep: number): OutgoingFrame[] {
    const target = currentStep + this.delay;
    const out: OutgoingFrame[] = [];
    while (this.nextSend <= target) {
      const last = this.nextSend === target;
      const orders = last && this.pending.length > 0 ? encodeOrders(this.pending) : NO_ORDERS;
      if (last) this.pending = [];
      out.push({ step: this.nextSend, orders });
      this.nextSend++;
    }
    return out;
  }

  /** Stores a frame from the relay (this client's own frames come back too). */
  receive(f: WireFrame): void {
    if (f.slot >= MAX_PLAYERS || f.step < this.lowest) return;
    let row = this.frames.get(f.step);
    if (!row) {
      row = new Array<WireFrame | undefined>(MAX_PLAYERS);
      this.frames.set(f.step, row);
    }
    row[f.slot] = f;
    if (f.flags & FrameFlag.Leave) this.leaveAt.set(f.slot, f.step);
  }

  private needs(slot: number, step: number): boolean {
    const at = this.leaveAt.get(slot);
    return at === undefined || step <= at;
  }

  /** Slots whose frame for `step` has not arrived. Empty means the step may run. */
  waitingOn(step: number): number[] {
    const row = this.frames.get(step);
    return this.active.filter((s) => this.needs(s, step) && !row?.[s]);
  }

  canRun(step: number): boolean {
    return this.waitingOn(step).length === 0;
  }

  /** Removes and decodes the inputs for `step`. Call only when canRun(step). */
  take(step: number): StepInput<T> {
    const row = this.frames.get(step);
    const bySlot: StepInput<T>['bySlot'] = [];
    const left: number[] = [];
    for (const s of this.active) {
      if (!this.needs(s, step)) continue;
      const f = row?.[s];
      if (!f) throw new Error(`step ${step} is missing slot ${s}'s frame`);
      bySlot.push({ slot: s, orders: decodeOrders<T>(f.orders) });
      if (f.flags & FrameFlag.Leave) left.push(s);
    }
    this.frames.delete(step);
    this.lowest = step + 1;
    if (left.length > 0) this.active = this.active.filter((s) => !left.includes(s));
    return { step, bySlot, left };
  }

  /**
   * Starts over from a loaded snapshot or a rejoin: forget held frames, take
   * the relay's log, and continue sending from `nextFrameStep`.
   */
  reset(opts: { step: number; frames: readonly WireFrame[]; nextFrameStep: number; activeSlots: number; inputDelay: number }): void {
    this.frames.clear();
    this.leaveAt.clear();
    this.active = maskSlots(opts.activeSlots);
    this.lowest = opts.step;
    this.nextSend = opts.nextFrameStep;
    this.delay = clampDelay(opts.inputDelay);
    for (const f of opts.frames) this.receive(f);
  }
}

function clampDelay(d: number): number {
  return Math.max(1, Math.min(MAX_INPUT_DELAY, Math.floor(d)));
}
