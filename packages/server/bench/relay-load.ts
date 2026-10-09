// Relay load check: how much one server process spends on full rooms.
//
//   pnpm --filter @blockyrts/server bench:relay [--rooms 1,4,8,16,32,48] [--players 8] [--seconds 30] [--warmup 8] [--desync] [--profile <dir>]
//
// Starts the built server (dist/main.js, as the Droplet runs it, everything in
// memory) in its own process with a small probe that reports, every second,
// its CPU time, event-loop delay, memory, and the writes it hands to its
// sockets. Then it opens the rooms from separate client processes: every
// player follows the lockstep loop the browser's sim worker runs (20 steps a
// second, frames sent inputDelay ahead, a step run only when every slot's
// frame is in, a hash every 20 steps, a pong for every ping) and gives a
// move order of a dozen units every two seconds. No sim runs: the relay never
// looks inside a frame, so empty steps cost it the same as real ones.
//
// --desync makes one player in the first room report a wrong hash once in the
// middle of the run, so the room reloads everyone from the host's snapshot (a
// 256 kB save, several times a real one).

import { fork, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import {
  decodeServer,
  encodeClient,
  HASH_INTERVAL_STEPS,
  LockstepScheduler,
  PROTOCOL_VERSION,
  RELAY_PATH,
  SAVE_FORMAT_VERSION,
  STEPS_PER_SECOND,
  writeSaveFile,
  type ClientMessage,
  type ServerMessage,
} from '@blockyrts/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const STEP_MS = 1000 / STEPS_PER_SECOND;

// ------------------------------------------------------------------ probe

/** Runs inside the server process (imported before main.js). Prints one JSON line a second on stderr. */
const PROBE = `
import { monitorEventLoopDelay } from 'node:perf_hooks';
import net from 'node:net';
const h = monitorEventLoopDelay({ resolution: 2 });
h.enable();
let writes = 0, chunks = 0, bytes = 0;
const P = net.Socket.prototype;
const w = P._write, wv = P._writev;
P._write = function (c, e, cb) { writes++; chunks++; bytes += c.length; return w.call(this, c, e, cb); };
P._writev = function (cs, cb) { writes++; chunks += cs.length; for (const x of cs) bytes += x.chunk.length; return wv.call(this, cs, cb); };
let cpu = process.cpuUsage();
let t = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  const c = process.cpuUsage(cpu);
  const ms = Number(now - t) / 1e6;
  const m = process.memoryUsage();
  process.stderr.write('PROBE ' + JSON.stringify({ ms, cpu: (c.user + c.system) / 1000, p50: h.percentile(50) / 1e6, p99: h.percentile(99) / 1e6, max: h.max / 1e6, rss: m.rss, heap: m.heapUsed, ab: m.arrayBuffers, ext: m.external, writes, chunks, bytes }) + '\\n');
  writes = chunks = bytes = 0;
  cpu = process.cpuUsage();
  t = now;
  h.reset();
}, 1000).unref();
`;

interface Probe {
  ms: number;
  cpu: number;
  p50: number;
  p99: number;
  max: number;
  rss: number;
  heap: number;
  ab: number;
  ext: number;
  writes: number;
  chunks: number;
  bytes: number;
}

// ------------------------------------------------------------------ clients

interface ClientStats {
  received: number;
  bytesIn: number;
  sent: number;
  steps: number;
  stallTicks: number;
  /** Worst gap, in ms, between a step falling due and it running. */
  worstLate: number;
  /** From this player's own frame going out to its echo coming back, ms (sum and count). */
  echoSum: number;
  echoCount: number;
  /** From this player's own frame for a step going out to the last frame of that step arriving, ms. */
  completeSum: number;
  completeCount: number;
  completeMax: number;
  errors: string[];
  loadedSnapshots: number;
}

function newStats(): ClientStats {
  return { received: 0, bytesIn: 0, sent: 0, steps: 0, stallTicks: 0, worstLate: 0, echoSum: 0, echoCount: 0, completeSum: 0, completeCount: 0, completeMax: 0, errors: [], loadedSnapshots: 0 };
}

class LoadPlayer {
  private ws!: WebSocket;
  private inbox: ServerMessage[] = [];
  private wakers: Array<() => void> = [];
  slot = -1;
  code = '';
  sched: LockstepScheduler | null = null;
  step = 0;
  clock = 0;
  epoch = 0;
  paused = false;
  syncing = false;
  /** When this player's own frame for a step went out. */
  private sentAt = new Map<number, number>();
  badHashAt = -1;
  readonly stats = newStats();
  playerCount = 0;

  constructor(
    private readonly url: string,
    private readonly address: string,
    private readonly saveBytes: number,
  ) {}

  async connect(): Promise<void> {
    this.ws = new WebSocket(this.url + RELAY_PATH, { headers: { 'x-forwarded-for': this.address }, perMessageDeflate: false });
    this.ws.binaryType = 'nodebuffer';
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
    this.ws.on('message', (data: Buffer) => {
      this.stats.received++;
      this.stats.bytesIn += data.length;
      this.onMessage(decodeServer(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
    });
    this.send({ type: 'hello', version: PROTOCOL_VERSION, token: '' });
    await this.waitFor((m) => m.type === 'welcome');
  }

  send(m: ClientMessage): void {
    this.stats.sent++;
    this.ws.send(encodeClient(m));
  }

  private onMessage(m: ServerMessage): void {
    switch (m.type) {
      case 'frames': {
        const now = performance.now();
        for (const f of m.frames) {
          this.sched?.receive(f);
          const sent = this.sentAt.get(f.step);
          if (sent === undefined) continue;
          if (f.slot === this.slot) {
            this.stats.echoSum += now - sent;
            this.stats.echoCount++;
          }
          if (this.sched!.canRun(f.step)) {
            this.sentAt.delete(f.step);
            this.stats.completeSum += now - sent;
            this.stats.completeCount++;
            this.stats.completeMax = Math.max(this.stats.completeMax, now - sent);
          }
        }
        return;
      }
      case 'ping':
        this.send({ type: 'pong', serverTime: m.serverTime });
        return;
      case 'roomState':
        this.slot = m.yourSlot;
        this.code = m.code;
        this.playerCount = m.players.length;
        break;
      case 'error':
        this.stats.errors.push(m.code);
        break;
      case 'gameStart':
        this.sched = new LockstepScheduler({ slot: this.slot, startStep: m.startStep, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
        this.step = m.startStep;
        this.clock = performance.now();
        this.epoch = m.epoch;
        break;
      case 'inputDelay':
        if (this.sched) this.sched.inputDelay = m.steps;
        return;
      case 'pauseState':
        this.paused = m.paused;
        break;
      case 'snapshotRequest':
        void this.answerSnapshot(m.requestId);
        return;
      case 'loadSnapshot':
        this.stats.loadedSnapshots++;
        this.step = m.step;
        this.epoch = m.epoch;
        this.syncing = false;
        this.sentAt.clear();
        this.sched!.reset(m);
        this.clock = performance.now();
        break;
      case 'resume':
        this.epoch = m.epoch;
        this.sched!.reset({ step: this.step, frames: m.frames, nextFrameStep: m.nextFrameStep, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
        break;
      case 'desync':
        this.syncing = true;
        break;
      default:
        break;
    }
    this.inbox.push(m);
    const w = this.wakers;
    this.wakers = [];
    for (const f of w) f();
  }

  private async answerSnapshot(requestId: number): Promise<void> {
    // A save of saveBytes of noise (gzip cannot shrink it), at the step this player is at.
    const noise = new Uint8Array(this.saveBytes);
    let x = 0x9e3779b9;
    for (let i = 0; i < noise.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      noise[i] = x & 0xff;
    }
    const data = await writeSaveFile(
      { formatVersion: SAVE_FORMAT_VERSION, gameVersion: 'bench', matchId: 'bench', seed: 1, step: this.step, night: 0, label: 'snapshot', players: [] },
      [{ tag: 'SIMS', version: 1, data: noise }],
    );
    this.send({ type: 'snapshot', requestId, step: this.step, data });
  }

  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 20_000): Promise<ServerMessage> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) {
        const m = this.inbox[i]!;
        this.inbox.splice(0, i + 1);
        return m;
      }
      if (performance.now() > deadline) throw new Error(`timed out; last: ${this.inbox.map((x) => x.type).join(',')}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 50);
        this.wakers.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** The browser worker's tick (sim.worker.ts), with the sim left out. */
  tick(now: number): void {
    const s = this.sched;
    if (!s || this.paused || this.syncing) {
      this.clock = now;
      return;
    }
    while (now - this.clock >= STEP_MS) {
      const out = s.outgoing(this.step);
      for (const f of out) {
        this.sentAt.set(f.step, now);
        this.send({ type: 'frame', step: f.step, orders: f.orders });
      }
      if (!s.canRun(this.step)) {
        this.stats.stallTicks++;
        this.stats.worstLate = Math.max(this.stats.worstLate, now - this.clock - STEP_MS);
        return; // the clock stays: the step is late, and runs as soon as its frames are in
      }
      s.take(this.step);
      this.clock += STEP_MS;
      this.step++;
      this.stats.steps++;
      if (this.step % HASH_INTERVAL_STEPS === 0) {
        const bad = this.badHashAt >= 0 && this.step >= this.badHashAt;
        if (bad) this.badHashAt = -1;
        this.send({ type: 'hash', epoch: this.epoch, step: this.step, hash: bad ? 1 : Math.imul(this.step, 2654435761) >>> 0 });
      }
      // A move order of 12 units every 2 s, the players' orders spread over the 2 s.
      if ((this.step + this.slot * 5) % 40 === 0) {
        const units = Array.from({ length: 12 }, (_, k) => 1000 + this.slot * 100 + k);
        s.queue({ kind: 'move', units, x: 120_000 + this.step, z: -80_000 - this.step, queue: false });
      }
    }
  }

  close(): void {
    this.ws.close();
  }
}

async function runClients(url: string, rooms: number[], players: number, saveBytes: number, desyncAfterMs: number): Promise<void> {
  const all: LoadPlayer[] = [];
  for (const r of rooms) {
    const address = `10.${(r >> 8) & 255}.${r & 255}.1`;
    const host = new LoadPlayer(url, address, saveBytes);
    await host.connect();
    host.send({ type: 'createRoom', seed: 1000 + r, saveId: '', private: true });
    await host.waitFor((m) => m.type === 'roomState');
    const room = [host];
    for (let k = 1; k < players; k++) {
      const p = new LoadPlayer(url, address, saveBytes);
      await p.connect();
      p.send({ type: 'joinRoom', code: host.code, rejoinToken: '', haveStep: -1 });
      await p.waitFor((m) => m.type === 'roomState');
      p.send({ type: 'setReady', ready: true });
      room.push(p);
    }
    await host.waitFor((m) => m.type === 'roomState' && m.players.length === players && m.players.every((x) => x.ready || x.slot === m.hostSlot));
    host.send({ type: 'startGame' });
    for (const p of room) await p.waitFor((m) => m.type === 'gameStart');
    if (desyncAfterMs > 0 && all.length === 0) {
      const liar = room[1] ?? host;
      setTimeout(() => {
        liar.badHashAt = liar.step + HASH_INTERVAL_STEPS;
      }, desyncAfterMs).unref();
    }
    all.push(...room);
  }
  process.send!({ type: 'ready' });
  setInterval(() => {
    const now = performance.now();
    for (const p of all) p.tick(now);
  }, 4);
  setInterval(() => {
    const s = newStats();
    for (const p of all) {
      const q = p.stats;
      s.received += q.received;
      s.bytesIn += q.bytesIn;
      s.sent += q.sent;
      s.steps += q.steps;
      s.stallTicks += q.stallTicks;
      s.worstLate = Math.max(s.worstLate, q.worstLate);
      s.echoSum += q.echoSum;
      s.echoCount += q.echoCount;
      s.completeSum += q.completeSum;
      s.completeCount += q.completeCount;
      s.completeMax = Math.max(s.completeMax, q.completeMax);
      s.loadedSnapshots += q.loadedSnapshots;
      s.errors.push(...q.errors);
      p.stats.received = p.stats.bytesIn = p.stats.sent = p.stats.steps = p.stats.stallTicks = p.stats.worstLate = 0;
      p.stats.echoSum = p.stats.echoCount = p.stats.completeSum = p.stats.completeCount = p.stats.completeMax = p.stats.loadedSnapshots = 0;
      p.stats.errors = [];
    }
    process.send!({ type: 'stats', stats: s, players: all.length });
  }, 1000);
  process.on('message', (m: { type: string }) => {
    if (m.type === 'stop') {
      for (const p of all) p.close();
      setTimeout(() => process.exit(0), 200);
    }
  });
}

// ------------------------------------------------------------------ driver

async function startServer(profileDir: string): Promise<{ proc: ChildProcess; url: string; probes: Probe[] }> {
  const main = join(here, '..', 'dist', 'main.js');
  if (!existsSync(main)) throw new Error('dist/main.js is missing: run `pnpm --filter @blockyrts/server build` first');
  const probe = 'data:text/javascript;base64,' + Buffer.from(PROBE).toString('base64');
  const proc = spawn(process.execPath, [...(profileDir ? ['--cpu-prof', `--cpu-prof-dir=${profileDir}`] : []), '--import', probe, main], {
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', PORT: '0', TRUSTED_PROXY: 'x-forwarded-for', BUILD_SHA: 'bench' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const probes: Probe[] = [];
  let buf = '';
  proc.stderr!.on('data', (d: Buffer) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.startsWith('PROBE ')) probes.push(JSON.parse(line.slice(6)) as Probe);
      else if (line.trim()) process.stderr.write(`server: ${line}\n`);
    }
  });
  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    proc.stdout!.on('data', (d: Buffer) => {
      out += d.toString();
      const m = /listening on port (\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    proc.once('exit', (code) => reject(new Error(`server exited (${code})`)));
  });
  return { proc, url: `ws://127.0.0.1:${port}`, probes };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

async function measure(rooms: number, players: number, seconds: number, warmup: number, desync: boolean, profileDir: string): Promise<string> {
  const server = await startServer(profileDir);
  // Client processes, so the players' work never counts against the server's CPU.
  const procs = Math.max(1, Math.min(3, Math.ceil(rooms / 6)));
  const kids: ChildProcess[] = [];
  const stats: Array<{ t: number; s: ClientStats; players: number }> = [];
  let t0 = 0;
  const ready: Array<Promise<void>> = [];
  for (let k = 0; k < procs; k++) {
    const mine = Array.from({ length: rooms }, (_, r) => r).filter((r) => r % procs === k);
    if (mine.length === 0) continue;
    const kid = fork(fileURLToPath(import.meta.url), ['--client', server.url, '--client-rooms', mine.join(','), '--players', String(players), ...(desync && k === 0 ? ['--desync-after', String((warmup + seconds / 2) * 1000)] : [])]);
    kids.push(kid);
    ready.push(
      new Promise((resolve) => {
        kid.on('message', (m: { type: string; stats?: ClientStats; players?: number }) => {
          if (m.type === 'ready') resolve();
          else if (m.type === 'stats' && t0 > 0) stats.push({ t: performance.now() - t0, s: m.stats!, players: m.players! });
        });
      }),
    );
  }
  await Promise.all(ready);
  t0 = performance.now();
  const probeFrom = server.probes.length;
  await new Promise((r) => setTimeout(r, (warmup + seconds) * 1000));
  for (const kid of kids) kid.send({ type: 'stop' });
  const probes = server.probes.slice(probeFrom + warmup);
  server.proc.kill('SIGTERM');
  await new Promise((resolve) => server.proc.once('exit', resolve));
  const window = stats.filter((x) => x.t > warmup * 1000);
  const sum = (f: (s: ClientStats) => number): number => window.reduce((a, x) => a + f(x.s), 0);
  const n = rooms * players;
  const secs = window.length / Math.max(1, kids.length);
  const errors = [...new Set(window.flatMap((x) => x.s.errors))];
  const cpu = mean(probes.map((p) => p.cpu / p.ms));
  const row = [
    rooms,
    n,
    `${(100 * cpu).toFixed(1)}%`,
    `${((100 * cpu) / rooms).toFixed(2)}%`,
    `${mean(probes.map((p) => p.p99)).toFixed(1)} / ${Math.max(...probes.map((p) => p.max)).toFixed(1)}`,
    `${(Math.max(...probes.map((p) => p.rss)) / 2 ** 20).toFixed(0)} MB`,
    Math.round(sum((s) => s.sent) / secs),
    Math.round(sum((s) => s.received) / secs),
    Math.round(mean(probes.map((p) => (p.writes * 1000) / p.ms))),
    `${((mean(probes.map((p) => (p.bytes * 1000) / p.ms)) * 8) / 1e6).toFixed(2)}`,
    `${(sum((s) => s.bytesIn) / secs / n / 1024).toFixed(1)} kB`,
    (sum((s) => s.steps) / secs / n).toFixed(1),
    sum((s) => s.echoCount) ? (sum((s) => s.echoSum) / sum((s) => s.echoCount)).toFixed(1) : '-',
    sum((s) => s.completeCount) ? `${(sum((s) => s.completeSum) / sum((s) => s.completeCount)).toFixed(1)} / ${Math.max(0, ...window.map((x) => x.s.completeMax)).toFixed(0)}` : '-',
    Math.max(0, ...window.map((x) => x.s.worstLate)).toFixed(0),
    sum((s) => s.loadedSnapshots),
    errors.join(' ') || '-',
  ];
  return `| ${row.join(' | ')} |`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      rooms: { type: 'string', default: '1,4,8,16,32,48' },
      players: { type: 'string', default: '8' },
      seconds: { type: 'string', default: '30' },
      warmup: { type: 'string', default: '8' },
      desync: { type: 'boolean', default: false },
      /** Writes a CPU profile of the server (node --cpu-prof) into this directory. */
      profile: { type: 'string', default: '' },
      'save-bytes': { type: 'string', default: String(256 * 1024) },
      client: { type: 'string' },
      'client-rooms': { type: 'string' },
      'desync-after': { type: 'string', default: '0' },
    },
  });
  if (values.client) {
    await runClients(values.client, values['client-rooms']!.split(',').map(Number), Number(values.players), Number(values['save-bytes']), Number(values['desync-after']));
    return;
  }
  console.log(
    '| Rooms | Players | Server CPU | CPU a room | Loop delay p99 / worst ms | Peak RSS | Messages in/s | Messages out/s | Socket writes/s | Out Mbit/s | In per player/s | Steps per player/s | Own echo ms | Step complete ms avg / worst | Worst late step ms | Snapshots loaded | Errors |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const rooms of values.rooms.split(',').map(Number)) {
    console.log(await measure(rooms, Number(values.players), Number(values.seconds), Number(values.warmup), values.desync, values.profile));
  }
}

await main();
