// The headless two-player test (M9, server side). Two simulated players on
// one server: an account holder hosts and a guest joins by code; they pick
// colours, ready up and play a few hundred steps of relayed orders with the
// M0 sim; one machine's state is corrupted and the relay reloads everyone
// from the host; the guest drops and rejoins from the relay's log, then
// comes back as a fresh page from a host snapshot; the host pauses and the
// guest resumes, both told who; the host saves (and the guest is told to make
// an account first), both quit, the host reloads the save and the guest
// rejoins by code. At the end a plain single-machine
// replay of the inputs must land on the same hash as both players.
//
//   pnpm --filter @blockyrts/tools net:test              (starts its own server in memory)
//   SERVER_URL=http://localhost:8080 pnpm --filter @blockyrts/tools net:test   (a running server; real time, about 2 minutes)
//
// With DATABASE_URL, SAVE_STORE and the S3_* variables set, the built-in
// server uses PostgreSQL and object storage instead of memory.

import { pathToFileURL } from 'node:url';
import {
  ApiRoutes,
  HostChoice,
  PauseReason,
  Presence,
  type SaveSummary,
  type ServerMessage,
  type SessionResponse,
} from '@blockyrts/protocol';
import { hashHex, hashState, step as simStep, WU_PER_METRE, type Order } from '@blockyrts/sim';
import { loadConfig, startApp, type App } from '@blockyrts/server';
import { makeTestWorld, saveFileOf, TestPlayer } from './test-player.ts';

export interface ScenarioResult {
  finalStep: number;
  finalHash: string;
  replayHash: string;
  checks: string[];
}

export interface ScenarioOptions {
  /** http:// or https:// base of the server. */
  httpUrl: string;
  log?: (line: string) => void;
  seed?: number;
  /** The server has its normal timeouts and rate cap (not the built-in test server): play at 20 steps a second and wait the real 30 s for the host's choice. */
  realTime?: boolean;
}

class Check {
  readonly passed: string[] = [];
  constructor(private readonly log: (line: string) => void) {}
  ok(cond: unknown, what: string): void {
    if (!cond) throw new Error(`check failed: ${what}`);
    this.passed.push(what);
    this.log(`ok  ${what}`);
  }
}

async function api<T>(base: string, path: string, init: { method?: string; token?: string; json?: unknown; bytes?: Uint8Array } = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body: string | Uint8Array | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.bytes) {
    headers['Content-Type'] = 'application/octet-stream';
    body = init.bytes;
  }
  const res = await fetch(base + path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, ...(body !== undefined ? { body: body as unknown as string } : {}) });
  const type = res.headers.get('content-type') ?? '';
  const out = type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer());
  return { status: res.status, body: out as T };
}

/** Orders both players give: each moves its own three units to a new spot every so often. */
function script(lastStep: { v: number }) {
  return (stepNo: number, p: TestPlayer): void => {
    if (stepNo === lastStep.v) return;
    lastStep.v = stepNo;
    const every = p.slot === 0 ? 50 : 70;
    if (stepNo % every !== 7) return;
    const n = Math.floor(stepNo / every);
    const units = p.slot === 0 ? [1, 2, 3] : [4, 5, 6];
    const x = (((n * 37 + p.slot * 11) % 41) - 20) * WU_PER_METRE;
    const z = (((n * 53 + p.slot * 7) % 41) - 20) * WU_PER_METRE;
    p.order({ kind: 'move', player: p.slot, units, x, z });
  };
}

/** Runs both players to `target` and lets in-flight reloads land, until both rest there. */
async function both(a: TestPlayer, b: TestPlayer, target: number): Promise<void> {
  const sa = { v: -1 };
  const sb = { v: -1 };
  for (let round = 0; round < 10; round++) {
    await Promise.all([a.runUntil(target, { script: script(sa) }), b.runUntil(target, { script: script(sb) })]);
    await new Promise((r) => setTimeout(r, 300));
    if (a.state?.step === target && b.state?.step === target) return;
  }
  throw new Error(`players did not both reach step ${target}: ${a.state?.step} and ${b.state?.step}; waiting on ${a.scheduler?.waitingOn(a.state?.step ?? 0)} and ${b.scheduler?.waitingOn(b.state?.step ?? 0)}; paused ${a.paused} ${b.paused}; busy ${a.closed} ${b.closed}`);
}

const isMsg =
  <K extends ServerMessage['type']>(type: K, pred: (m: Extract<ServerMessage, { type: K }>) => boolean = () => true) =>
  (m: ServerMessage): boolean =>
    m.type === type && pred(m as Extract<ServerMessage, { type: K }>);

export async function runTwoPlayerScenario(opts: ScenarioOptions): Promise<ScenarioResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const http = opts.httpUrl.replace(/\/+$/, '');
  const wsUrl = http.replace(/^http/, 'ws');
  const check = new Check(log);
  const seed = opts.seed ?? 1234;
  const realTime = opts.realTime ?? false;

  // ---- accounts: the host makes an account, the guest plays as a guest
  const unique = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const reg = await api<SessionResponse>(http, ApiRoutes.accounts, {
    json: { email: `host-${unique}@example.com`, username: `host_${unique}`.slice(0, 20), password: 'correct horse battery' },
  });
  check.ok(reg.status === 201 && reg.body.account !== null, 'the host makes an account');
  const hostToken = reg.body.token;
  const g = await api<SessionResponse>(http, ApiRoutes.guests, { method: 'POST' });
  check.ok(g.status === 201 && /^Guest \d{4}$/.test(g.body.name), `the guest is named like "${g.body.name}"`);
  const guestToken = g.body.token;

  // ---- lobby: host by code, join, colours, ready, start
  const host = new TestPlayer({ url: wsUrl, token: hostToken, label: 'host', log, realTime });
  let guest = new TestPlayer({ url: wsUrl, token: guestToken, label: 'guest', log, realTime });
  await host.connect();
  await guest.connect();
  host.send({ type: 'createRoom', seed, saveId: '' });
  await host.waitFor(isMsg('roomState'));
  const code = host.room!.code;
  check.ok(/^[A-Z2-9]{6}$/.test(code), `the host gets the join code ${code}`);
  const info = await api<{ openSlots: number; hostName: string }>(http, ApiRoutes.room(code));
  check.ok(info.status === 200 && info.body.hostName === host.name, 'the invite link resolves to the room');
  guest.send({ type: 'joinRoom', code, rejoinToken: '', haveStep: -1 });
  await guest.waitFor(isMsg('roomState'));
  guest.send({ type: 'setColour', colour: 0 });
  await guest.waitFor(isMsg('error', (m) => m.code === 'colour_taken'));
  check.ok(true, "the guest cannot take the host's colour");
  guest.send({ type: 'setColour', colour: 3 });
  guest.send({ type: 'setReady', ready: true });
  await host.waitFor(isMsg('roomState', (m) => m.players.some((p) => p.slot === 1 && p.ready && p.colour === 3)));
  check.ok(host.room!.players.length === 2, 'the host sees the guest, ready, in yellow');
  host.send({ type: 'startGame' });
  await Promise.all([host.waitFor(isMsg('gameStart')), guest.waitFor(isMsg('gameStart'))]);
  const matchId = host.room!.matchId;

  // ---- a few hundred steps of relayed orders
  await both(host, guest, 300);
  check.ok(host.hash() === guest.hash(), `both machines agree at step 300 (hash ${hashHex(host.hash())})`);
  check.ok(host.applied.size === 300 && [...host.applied.values()].flat().length > 6, 'orders from both players were applied');

  // ---- a desync: the relay notices and everyone reloads the host's state
  // One machine's random stream slips (as a stray float or Math.random would make it).
  guest.state!.rng.ai.s0 = (guest.state!.rng.ai.s0 ^ 1) >>> 0;
  await both(host, guest, 400);
  check.ok(guest.desyncs.length > 0 && guest.desyncs[0]!.minority === 0b10, `the relay names the guest as out of step at step ${guest.desyncs[0]?.step}`);
  check.ok(guest.loadedSnapshots > 0 && host.hash() === guest.hash(), 'after reloading from the host both agree again');

  // ---- the guest drops: the match pauses, the host is asked, the guest rejoins from the log
  guest.drop();
  await host.waitFor(isMsg('pauseState', (m) => m.paused && m.reason === PauseReason.Disconnect && m.waitingFor === 0b10));
  check.ok(true, 'the match pauses while the guest is gone');
  const stalled = await host.runUntil(600, { stallMs: opts.realTime ? 1500 : 500 });
  check.ok(stalled < 420, `the host cannot run on alone (stopped at step ${stalled})`);
  await host.waitFor(isMsg('hostChoiceNeeded', (m) => m.slot === 1), 45_000);
  check.ok(true, 'the host is asked to wait, carry on or save and quit');
  host.send({ type: 'hostChoice', slot: 1, choice: HostChoice.Wait });
  await guest.connect();
  guest.send({ type: 'joinRoom', code, rejoinToken: guest.room!.rejoinToken, haveStep: guest.state!.step });
  await guest.waitFor(isMsg('resume'));
  check.ok(guest.resumes === 1, 'the guest rejoins with its own state and the missed frames');
  await both(host, guest, 600);
  check.ok(host.hash() === guest.hash(), 'both agree at step 600');

  // ---- the guest comes back as a fresh page with no state: the host's snapshot
  const rejoinToken = guest.room!.rejoinToken;
  guest.drop();
  await host.waitFor(isMsg('pauseState', (m) => m.paused && m.waitingFor === 0b10));
  guest = new TestPlayer({ url: wsUrl, token: guestToken, label: 'guest (new page)', log, realTime });
  await guest.connect();
  guest.send({ type: 'joinRoom', code, rejoinToken, haveStep: -1 });
  await guest.waitFor(isMsg('loadSnapshot'));
  check.ok(guest.state !== null && guest.slot === 1, `a fresh page rejoins from the host's snapshot at step ${guest.state?.step}`);
  await both(host, guest, 800);
  check.ok(host.hash() === guest.hash(), 'both agree at step 800');

  // ---- pause and resume (patch notes 1): the host pauses, the guest resumes, both are told who
  host.send({ type: 'pause', paused: true });
  await Promise.all([host, guest].map((p) => p.waitFor(isMsg('pauseToggled', (m) => m.paused && m.slot === 0))));
  const pausedAt = await guest.runUntil(1000, { stallMs: opts.realTime ? 1500 : 500 });
  check.ok(host.paused && guest.paused && pausedAt === 800, `the host's pause stops both, and both are told who paused (the guest stays at step ${pausedAt})`);
  guest.send({ type: 'pause', paused: false });
  await Promise.all([host, guest].map((p) => p.waitFor(isMsg('pauseToggled', (m) => !m.paused && m.slot === 1))));
  await both(host, guest, 900);
  check.ok(host.hash() === guest.hash(), 'the guest resumes the host\'s pause, the host is told who, and both agree at step 900');

  // ---- saving: the guest is asked to make an account; the host saves; the dawn autosave hook keeps three
  host.send({ type: 'pause', paused: true });
  await host.waitFor(isMsg('pauseState', (m) => m.paused && m.reason === PauseReason.Player));
  const accounts = new Map([[0, reg.body.account!.id]]);
  const saveBytes = await saveFileOf(host.state!, matchId, host.room, accounts, 'Before the first night');
  const refused = await api<{ error: string }>(http, ApiRoutes.matchSaves(matchId), { token: guestToken, bytes: saveBytes });
  check.ok(refused.status === 403 && refused.body.error === 'guest_must_register', 'a guest who clicks Save is asked to make an account');
  const saved = await api<SaveSummary>(http, ApiRoutes.matchSaves(matchId), { token: hostToken, bytes: saveBytes });
  check.ok(saved.status === 201 && saved.body.step === host.state!.step, `the host saves at step ${saved.body.step} (${saveBytes.length} bytes)`);
  for (let i = 0; i < 4; i++) {
    const auto = await api<SaveSummary>(http, ApiRoutes.matchAutosave(matchId), { token: hostToken, bytes: saveBytes });
    if (auto.status !== 201) throw new Error(`autosave failed: ${auto.status} ${JSON.stringify(auto.body)}`);
  }
  const list = await api<{ saves: SaveSummary[] }>(http, ApiRoutes.saves, { token: hostToken });
  check.ok(
    list.body.saves.filter((s) => s.kind === 'autosave').length === 3 && list.body.saves.filter((s) => s.kind === 'manual').length === 1,
    'four dawn autosaves keep the newest three, beside the manual save',
  );
  const savedStep = saved.body.step;

  // ---- both quit
  host.send({ type: 'hostChoice', slot: 0, choice: HostChoice.SaveAndQuit });
  await Promise.all([host.waitFor(isMsg('roomClosed')), guest.waitFor(isMsg('roomClosed'))]);
  check.ok(true, 'save and quit closes the game for everyone');

  // ---- the host loads the save; the guest rejoins by code; the match goes on
  await host.connect();
  host.send({ type: 'createRoom', seed: null, saveId: saved.body.id });
  await host.waitFor(isMsg('roomState', (m) => m.fromSave));
  const code2 = host.room!.code;
  check.ok(host.room!.players.some((p) => p.slot === 1 && p.presence === Presence.Reserved), 'the loaded game keeps a place for the guest');
  host.send({ type: 'startGame' });
  await host.waitFor(isMsg('error', (m) => m.code === 'not_everyone_back'));
  check.ok(true, 'the game cannot start until everyone who was in it is back');
  guest = new TestPlayer({ url: wsUrl, token: guestToken, label: 'guest (next evening)', log, realTime });
  await guest.connect();
  guest.send({ type: 'joinRoom', code: code2, rejoinToken: '', haveStep: -1 });
  await guest.waitFor(isMsg('roomState'));
  check.ok(guest.slot === 1, 'the guest takes their old place');
  guest.send({ type: 'setReady', ready: true });
  await host.waitFor(isMsg('roomState', (m) => m.players.every((p) => p.ready || p.slot === m.hostSlot)));
  host.send({ type: 'startGame' });
  await Promise.all([host.waitFor(isMsg('gameStart')), guest.waitFor(isMsg('gameStart'))]);
  check.ok(host.state!.step === savedStep && guest.state!.step === savedStep, `both resume from the save at step ${savedStep}`);
  const end = savedStep + 200;
  await both(host, guest, end);
  check.ok(host.hash() === guest.hash(), `both agree at step ${end}`);

  // ---- a single machine replaying the same inputs lands on the same state
  const ref = makeTestWorld(seed);
  while (ref.step < end) simStep(ref, host.applied.get(ref.step) ?? ([] as Order[]));
  const replay = hashState(ref);
  check.ok(replay === host.hash(), `a one-machine replay of the inputs matches (${hashHex(replay)})`);

  host.send({ type: 'leave' });
  guest.send({ type: 'leave' });
  return { finalStep: end, finalHash: hashHex(host.hash()), replayHash: hashHex(replay), checks: check.passed };
}

/**
 * Room timeouts short enough for a test (drop after 1.5 s, ask the host after
 * 0.8 s), and no message rate cap: the test players run as fast as frames
 * allow, far above the 20 steps a second of real play.
 */
export const TEST_TIMINGS = { heartbeatMs: 200, dropAfterMs: 1500, hostChoiceAfterMs: 800, messagesPerSecond: 1e9, messageBurst: 1e9 };

/** Starts a server in this process on a free port: in memory unless DATABASE_URL and SAVE_STORE say otherwise. */
export async function startTestServer(env: Record<string, string | undefined> = process.env): Promise<App> {
  return startApp(loadConfig({ ...env, PORT: '0' }), { log: () => undefined, timings: TEST_TIMINGS, mailer: null, limits: { accountsPerHour: 1000, guestsPerHour: 1000 } });
}

async function main(): Promise<void> {
  const external = process.env.SERVER_URL;
  const app = external ? null : await startTestServer();
  const url = external ?? `http://127.0.0.1:${app!.port}`;
  console.log(`two-player test against ${url}${app ? ' (built-in server)' : ''}`);
  try {
    const r = await runTwoPlayerScenario({ httpUrl: url, realTime: Boolean(external), log: (l) => (l.startsWith('ok') ? console.log(l) : undefined) });
    console.log(`passed ${r.checks.length} checks; final step ${r.finalStep} hash ${r.finalHash}`);
  } finally {
    await app?.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
