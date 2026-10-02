// A headless player: a relay socket, the lockstep scheduler and the real sim,
// with no browser and no drawing. The two-player test drives two of these
// through the lobby, the match, a disconnect, a desync and a save. It is also
// a working reference for how the browser client's worker host should use
// @blockyrts/protocol.

import {
  decodeServer,
  encodeClient,
  LockstepScheduler,
  PROTOCOL_VERSION,
  readSaveFile,
  RELAY_PATH,
  SaveSection,
  writeSaveFile,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
  type StepInput,
} from '@blockyrts/protocol';
import { createWorld, deserializeState, hashState, HASH_INTERVAL_STEPS, serializeState, step as simStep, type Order, type SimState } from '@blockyrts/sim';

/** Steps in one day-and-night cycle (3 min + 40 s + 3 min + 40 s at 20 steps a second). */
const CYCLE_STEPS = 8800;

/**
 * The world the network test plays in: the M0 test world with six player
 * units, of which entities 4 to 6 are handed to player 1 so both players'
 * orders move something. Every machine builds it the same way.
 */
export function makeTestWorld(seed: number): SimState {
  const state = createWorld(seed, { playerUnits: 6, wanderers: 8 });
  for (let i = 0; i < state.entities.count; i++) {
    const id = state.entities.id[i]!;
    if (id >= 4 && id <= 6) state.entities.owner[i] = 1;
  }
  return state;
}

/** Builds a save file of a state: the SIMS section is the sim's canonical snapshot. */
export async function saveFileOf(state: SimState, matchId: string, room: RoomStateMessage | null, accountIds: Map<number, string>, label = ''): Promise<Uint8Array> {
  return writeSaveFile(
    {
      formatVersion: 1,
      gameVersion: '0.9.0-m9',
      matchId,
      seed: state.seed,
      step: state.step,
      night: Math.floor(state.step / CYCLE_STEPS),
      label,
      players: (room?.players ?? []).map((p) => ({ slot: p.slot, name: p.name, colour: p.colour, accountId: accountIds.get(p.slot) ?? '' })),
    },
    [{ tag: SaveSection.SimState, version: 1, data: serializeState(state) }],
  );
}

export async function stateOfSave(bytes: Uint8Array): Promise<SimState> {
  const file = await readSaveFile(bytes);
  const sims = file.sections.get(SaveSection.SimState);
  if (!sims) throw new Error('save has no sim state');
  return deserializeState(sims.data);
}

export interface TestPlayerOptions {
  /** ws:// or wss:// base of the server, such as ws://127.0.0.1:8080. */
  url: string;
  /** A session token (account or guest), or '' to be an anonymous guest. */
  token: string;
  label: string;
  log?: (line: string) => void;
  /** Run at the real 20 steps a second, within a real server's message rate cap; otherwise as fast as frames allow. */
  realTime?: boolean;
}

export class TestPlayer {
  readonly label: string;
  private readonly opts: TestPlayerOptions;
  private ws: WebSocket | null = null;
  private inbox: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  /** Async handling (loading a save) holds the step loop. */
  private busy: Promise<void> = Promise.resolve();
  private busyCount = 0;

  name = '';
  room: RoomStateMessage | null = null;
  state: SimState | null = null;
  scheduler: LockstepScheduler<Order> | null = null;
  epoch = 0;
  paused = false;
  closed = false;
  /** Orders actually applied at each step, with the player stamped: the input record the reference replay uses. */
  readonly applied = new Map<number, Order[]>();
  /** Every [step, hash] this player computed. */
  readonly hashes = new Map<number, number>();
  readonly desyncs: Array<{ step: number; minority: number }> = [];
  readonly hostChoicePrompts: number[] = [];
  readonly errors: Array<{ code: string; message: string }> = [];
  loadedSnapshots = 0;
  resumes = 0;

  constructor(opts: TestPlayerOptions) {
    this.opts = opts;
    this.label = opts.label;
  }

  private log(line: string): void {
    this.opts.log?.(`[${this.label}] ${line}`);
  }

  get slot(): number {
    return this.room?.yourSlot ?? -1;
  }

  async connect(): Promise<void> {
    const ws = new WebSocket(this.opts.url.replace(/\/+$/, '') + RELAY_PATH);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.closed = false;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`${this.label}: could not connect to ${this.opts.url}`));
    });
    ws.onmessage = (ev: MessageEvent) => {
      const m = decodeServer(new Uint8Array(ev.data as ArrayBuffer));
      this.busy = this.busy.then(() => this.onMessage(m)).catch((e: unknown) => this.log(`handler failed: ${String(e)}`));
    };
    ws.onclose = () => {
      // A replaced socket closing late must not stop the new one.
      if (this.ws !== ws && this.ws !== null) return;
      this.closed = true;
      this.wake();
    };
    this.send({ type: 'hello', version: PROTOCOL_VERSION, token: this.opts.token });
    const welcome = await this.waitFor((m) => m.type === 'welcome');
    if (welcome.type === 'welcome') this.name = welcome.name;
  }

  /** Drops the connection without saying goodbye, like a lost network. */
  drop(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeClient(m));
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  private nextEvent(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      this.waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  /** Waits for a message matching `pred` that arrived since the last call took it. */
  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 10_000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) {
        const m = this.inbox[i]!;
        this.inbox.splice(0, i + 1);
        return m;
      }
      if (Date.now() > deadline) throw new Error(`${this.label}: timed out waiting; last messages: ${this.inbox.map((m) => m.type).slice(-8).join(', ')}`);
      await this.nextEvent(50);
    }
  }

  private async onMessage(m: ServerMessage): Promise<void> {
    switch (m.type) {
      case 'roomState':
        this.room = m;
        break;
      case 'error':
        this.errors.push({ code: m.code, message: m.message });
        this.log(`error ${m.code}: ${m.message}`);
        break;
      case 'gameStart':
        this.busyCount++;
        try {
          this.state = m.snapshot.length > 0 ? await stateOfSave(m.snapshot) : makeTestWorld(this.room!.seed);
          if (this.state.step !== m.startStep) throw new Error(`save is at step ${this.state.step}, match starts at ${m.startStep}`);
          this.forget(m.startStep);
          this.epoch = m.epoch;
          this.paused = false;
          this.scheduler = new LockstepScheduler<Order>({ slot: this.slot, startStep: m.startStep, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
        } finally {
          this.busyCount--;
        }
        break;
      case 'frame':
        this.scheduler?.receive(m.frame);
        break;
      case 'pauseState':
        this.paused = m.paused;
        break;
      case 'inputDelay':
        if (this.scheduler) this.scheduler.inputDelay = m.steps;
        break;
      case 'hostChoiceNeeded':
        this.hostChoicePrompts.push(m.slot);
        break;
      case 'desync':
        this.desyncs.push({ step: m.step, minority: m.minority });
        break;
      case 'snapshotRequest': {
        // Capture the state now; compress afterwards.
        const st = this.state!;
        const copy = deserializeState(serializeState(st));
        const data = await saveFileOf(copy, this.room!.matchId, this.room, new Map(), 'snapshot');
        this.send({ type: 'snapshot', requestId: m.requestId, step: copy.step, data });
        break;
      }
      case 'loadSnapshot':
        this.busyCount++;
        try {
          this.state = await stateOfSave(m.data);
          this.forget(m.step);
          this.epoch = m.epoch;
          this.loadedSnapshots++;
          this.scheduler ??= new LockstepScheduler<Order>({ slot: this.slot, startStep: m.step, activeSlots: m.activeSlots });
          this.scheduler.reset(m);
          this.log(`loaded a snapshot at step ${m.step}`);
        } finally {
          this.busyCount--;
        }
        break;
      case 'resume':
        this.epoch = m.epoch;
        this.resumes++;
        this.scheduler!.reset({ step: this.state!.step, frames: m.frames, nextFrameStep: m.nextFrameStep, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
        break;
      case 'ping':
        this.send({ type: 'pong', serverTime: m.serverTime });
        break;
      case 'roomClosed':
        this.log(`room closed (${m.reason})`);
        break;
      default:
        break;
    }
    this.inbox.push(m);
    if (this.inbox.length > 2000) this.inbox.splice(0, 1000);
    this.wake();
  }

  /** Forget applied inputs and hashes from `step` on: the state was replaced by one at `step`. */
  private forget(step: number): void {
    for (const s of [...this.applied.keys()]) if (s >= step) this.applied.delete(s);
    for (const s of [...this.hashes.keys()]) if (s > step) this.hashes.delete(s);
  }

  /** Queues an order; it is applied inputDelay steps later on every machine. */
  order(o: Order): void {
    this.scheduler!.queue({ ...o, player: this.slot });
  }

  private apply(input: StepInput<Order>): void {
    const st = this.state!;
    const orders: Order[] = [];
    // The relay is trusted to say which slot sent a frame: stamp it over whatever the order claims.
    for (const { slot, orders: list } of input.bySlot) for (const o of list) orders.push({ ...o, player: slot });
    this.applied.set(st.step, orders);
    const r = simStep(st, orders);
    if (r.hash !== undefined) {
      this.hashes.set(r.step, r.hash);
      this.send({ type: 'hash', epoch: this.epoch, step: r.step, hash: r.hash });
    }
  }

  /**
   * Runs steps until the state reaches `target` or nothing can move for
   * `stallMs` (waiting on another player, or paused). `script` is called just
   * before each step runs, to queue orders. Returns the step reached.
   */
  async runUntil(target: number, opts: { stallMs?: number; script?: (step: number, p: TestPlayer) => void } = {}): Promise<number> {
    const stallMs = opts.stallMs ?? 10_000;
    let idleSince = Date.now();
    const t0 = Date.now();
    const s0 = this.state?.step ?? 0;
    const allowed = (): number => (this.opts.realTime ? s0 + Math.floor((Date.now() - t0) / 50) + 1 : Number.MAX_SAFE_INTEGER);
    while (!this.closed) {
      await this.busy;
      const st = this.state;
      const sch = this.scheduler;
      if (!st || !sch) {
        await this.nextEvent(50);
        continue;
      }
      if (st.step >= target) return st.step;
      if (this.busyCount === 0 && !this.paused) {
        let ran = 0;
        while (st.step < target && st.step < allowed()) {
          // Orders are queued just before a step runs, and go out in that step's frame batch.
          opts.script?.(st.step, this);
          for (const f of sch.outgoing(st.step)) this.send({ type: 'frame', step: f.step, orders: f.orders });
          if (!sch.canRun(st.step)) break;
          this.apply(sch.take(st.step));
          ran++;
          if (st.step % HASH_INTERVAL_STEPS === 0) break; // yield so hashes and frames go out promptly
        }
        if (ran > 0) {
          idleSince = Date.now();
          await new Promise((r) => setImmediate(r));
          continue;
        }
      }
      if (Date.now() - idleSince > stallMs) return st.step;
      await this.nextEvent(20);
    }
    return this.state?.step ?? -1;
  }

  /** The state hash now. */
  hash(): number {
    return hashState(this.state!);
  }
}
