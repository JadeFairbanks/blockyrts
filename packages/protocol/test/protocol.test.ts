import { describe, expect, it } from 'vitest';
import {
  decodeChunkDeltas,
  decodeClient,
  decodeOrders,
  decodeServer,
  encodeChunkDeltas,
  encodeClient,
  encodeOrders,
  encodeServer,
  FrameFlag,
  LockstepScheduler,
  maskSlots,
  NO_ORDERS,
  Reader,
  readSaveFile,
  readSaveHeader,
  SaveSection,
  slotMask,
  WireError,
  writeSaveFile,
  Writer,
  type ClientMessage,
  type ServerMessage,
  type WireFrame,
} from '../src/index.ts';

describe('wire', () => {
  it('round-trips varints across the safe integer range', () => {
    const values = [0, 1, 127, 128, 300, 2 ** 31, 2 ** 32 + 5, 2 ** 52 - 1];
    const w = new Writer(4).varuint(Number.MAX_SAFE_INTEGER);
    for (const v of values) w.varuint(v).varint(v).varint(-v);
    const r = new Reader(w.finish());
    expect(r.varuint()).toBe(Number.MAX_SAFE_INTEGER);
    for (const v of values) {
      expect(r.varuint()).toBe(v);
      expect(r.varint()).toBe(v);
      expect(r.varint()).toBe(-v + 0);
    }
    r.end();
  });

  it('refuses truncated input and junk on the end', () => {
    const b = new Writer().u32(7).finish();
    expect(() => new Reader(b.subarray(0, 3)).u32()).toThrow(WireError);
    const r = new Reader(new Uint8Array([1, 2]));
    r.u8();
    expect(() => r.end()).toThrow(WireError);
  });
});

describe('orders', () => {
  it('round-trips any plain integer object', () => {
    const orders = [
      { kind: 'move', player: 2, units: [1, 2, 300000], x: -240000, z: 96000 },
      { kind: 'build', player: 0, queued: true, spec: { id: 'torch_post', rot: 3 }, note: null },
    ];
    expect(decodeOrders(encodeOrders(orders))).toEqual(orders);
  });

  it('keeps empty frames to one byte', () => {
    expect(NO_ORDERS.length).toBe(1);
    expect(decodeOrders(NO_ORDERS)).toEqual([]);
  });

  it('refuses fractions, so floats never reach the sim', () => {
    expect(() => encodeOrders([{ kind: 'move', x: 0.5 }])).toThrow(WireError);
    expect(() => encodeOrders([{ kind: 'move', x: Number.NaN }])).toThrow(WireError);
  });

  it('refuses a hostile __proto__ key', () => {
    const w = new Writer().varuint(1).u8(6).varuint(1).str('__proto__').u8(0);
    expect(() => decodeOrders(w.finish())).toThrow(WireError);
  });
});

describe('messages', () => {
  const frame: WireFrame = { slot: 3, step: 1234, flags: FrameFlag.Leave, orders: encodeOrders([{ kind: 'move', units: [1] }]) };

  const client: ClientMessage[] = [
    { type: 'hello', version: 1, token: 'abc' },
    { type: 'createRoom', seed: 42, saveId: '' },
    { type: 'createRoom', seed: null, saveId: 'some-save' },
    { type: 'joinRoom', code: 'ABC234', rejoinToken: 'tok', haveStep: -1 },
    { type: 'joinRoom', code: 'ABC234', rejoinToken: '', haveStep: 4000 },
    { type: 'setColour', colour: 5 },
    { type: 'setReady', ready: true },
    { type: 'startGame' },
    { type: 'frame', step: 99, orders: NO_ORDERS },
    { type: 'hash', epoch: 2, step: 40, hash: 0xdeadbeef },
    { type: 'snapshot', requestId: 7, step: 500, data: new Uint8Array([1, 2, 3]) },
    { type: 'hostChoice', slot: 1, choice: 1 },
    { type: 'pause', paused: false },
    { type: 'pong', serverTime: 123456 },
    { type: 'leave' },
    { type: 'authenticate', token: 't' },
    { type: 'chat', text: 'Wall breaker at the east gate!' },
    { type: 'mapPing', x: -8000, z: 16000 },
  ];

  const server: ServerMessage[] = [
    { type: 'welcome', version: 1, name: 'Guest 4821', accountId: '', guest: true },
    { type: 'error', code: 'room_full', message: 'That game is full.' },
    {
      type: 'roomState',
      code: 'ABC234',
      matchId: 'm1',
      phase: 1,
      seed: 99,
      fromSave: true,
      hostSlot: 0,
      yourSlot: 1,
      rejoinToken: 'r',
      players: [
        { slot: 0, name: 'Jade', colour: 0, ready: true, presence: 0, guest: false, accountId: 'a1' },
        { slot: 1, name: 'Guest 1234', colour: 3, ready: false, presence: 1, guest: true, accountId: '' },
      ],
    },
    { type: 'gameStart', startStep: 0, inputDelay: 4, epoch: 0, activeSlots: 3, snapshot: new Uint8Array() },
    { type: 'frame', frame },
    { type: 'pauseState', paused: true, reason: 2, held: true, bySlot: 1, waitingFor: 2 },
    { type: 'pauseToggled', slot: 3, paused: false },
    { type: 'hostChoiceNeeded', slot: 1 },
    { type: 'inputDelay', steps: 6 },
    { type: 'snapshotRequest', requestId: 9 },
    { type: 'loadSnapshot', epoch: 1, step: 400, data: new Uint8Array([9]), frames: [frame], nextFrameStep: 404, activeSlots: 3, inputDelay: 4 },
    { type: 'resume', epoch: 1, frames: [frame, frame], nextFrameStep: 410, activeSlots: 3, inputDelay: 5 },
    { type: 'desync', step: 60, minority: 2 },
    { type: 'ping', serverTime: 1 },
    { type: 'roomClosed', reason: 0 },
    { type: 'chat', slot: 1, name: 'Jade', text: 'hi' },
    { type: 'mapPing', slot: 0, x: 1, z: -1 },
  ];

  it('round-trips every client message', () => {
    for (const m of client) expect(decodeClient(encodeClient(m))).toEqual(m);
  });

  it('round-trips every server message', () => {
    for (const m of server) expect(decodeServer(encodeServer(m))).toEqual(m);
  });

  it('refuses a message sent the wrong way round', () => {
    expect(() => decodeClient(encodeServer({ type: 'ping', serverTime: 1 }))).toThrow(WireError);
    expect(() => decodeServer(encodeClient({ type: 'leave' }))).toThrow(WireError);
  });

  it('converts slot sets to masks and back', () => {
    expect(slotMask([0, 2, 7])).toBe(0b10000101);
    expect(maskSlots(0b10000101)).toEqual([0, 2, 7]);
  });
});

describe('lockstep scheduler', () => {
  const echo = (s: LockstepScheduler, slot: number, frames: Array<{ step: number; orders: Uint8Array }>): void => {
    for (const f of frames) s.receive({ slot, step: f.step, flags: 0, orders: f.orders });
  };

  it('sends one frame per step, input delay ahead, orders in the last', () => {
    const s = new LockstepScheduler({ slot: 0, startStep: 0, activeSlots: 1, inputDelay: 4 });
    s.queue({ kind: 'move', units: [1] });
    const first = s.outgoing(0);
    expect(first.map((f) => f.step)).toEqual([0, 1, 2, 3, 4]);
    expect(decodeOrders(first[4]!.orders)).toEqual([{ kind: 'move', units: [1] }]);
    expect(first.slice(0, 4).every((f) => f.orders.length === 1)).toBe(true);
    expect(s.outgoing(0)).toEqual([]);
    expect(s.outgoing(1).map((f) => f.step)).toEqual([5]);
  });

  it('fills the gap when the delay grows and never resends when it shrinks', () => {
    const s = new LockstepScheduler({ slot: 0, startStep: 0, activeSlots: 1, inputDelay: 4 });
    s.outgoing(0);
    s.inputDelay = 7;
    expect(s.outgoing(1).map((f) => f.step)).toEqual([5, 6, 7, 8]);
    s.inputDelay = 2;
    expect(s.outgoing(2)).toEqual([]);
    expect(s.outgoing(7).map((f) => f.step)).toEqual([9]);
  });

  it('runs a step only with every playing slot, and handles a leaving slot', () => {
    const a = new LockstepScheduler({ slot: 0, startStep: 10, activeSlots: 0b11, inputDelay: 1 });
    echo(a, 0, a.outgoing(10));
    expect(a.canRun(10)).toBe(false);
    expect(a.waitingOn(10)).toEqual([1]);
    a.receive({ slot: 1, step: 10, flags: 0, orders: encodeOrders([{ kind: 'x' }]) });
    expect(a.canRun(10)).toBe(true);
    const input = a.take(10);
    expect(input.bySlot).toEqual([
      { slot: 0, orders: [] },
      { slot: 1, orders: [{ kind: 'x' }] },
    ]);
    // Slot 1 leaves at step 11: its leave frame satisfies 11, nothing is needed after.
    a.receive({ slot: 1, step: 11, flags: FrameFlag.Leave, orders: NO_ORDERS });
    expect(a.canRun(11)).toBe(true);
    expect(a.take(11).left).toEqual([1]);
    echo(a, 0, a.outgoing(12));
    expect(a.canRun(12)).toBe(true);
    expect(a.activeSlots).toEqual([0]);
  });

  it('starts over from a snapshot with the relay log', () => {
    const s = new LockstepScheduler({ slot: 1, startStep: 0, activeSlots: 0b11 });
    s.outgoing(0);
    s.reset({
      step: 100,
      frames: [
        { slot: 0, step: 100, flags: 0, orders: NO_ORDERS },
        { slot: 1, step: 100, flags: 0, orders: NO_ORDERS },
      ],
      nextFrameStep: 103,
      activeSlots: 0b11,
      inputDelay: 4,
    });
    expect(s.canRun(100)).toBe(true);
    expect(s.outgoing(100).map((f) => f.step)).toEqual([103, 104]);
  });
});

describe('save file', () => {
  const header = {
    formatVersion: 1,
    gameVersion: '0.9.0',
    matchId: 'match-1',
    seed: 77,
    step: 8800,
    night: 1,
    label: 'Before the wall',
    players: [
      { slot: 0, name: 'Jade', colour: 0, accountId: 'acc-1' },
      { slot: 1, name: 'Guest 4821', colour: 2, accountId: '' },
    ],
  };

  it('round-trips header and sections, and reads the header without unpacking', async () => {
    const sim = new Uint8Array(5000).map((_, i) => i % 7);
    const chunks = encodeChunkDeltas([{ cx: -3, cz: 4, data: new Uint8Array([1, 2, 3]) }]);
    const bytes = await writeSaveFile(header, [
      { tag: SaveSection.SimState, version: 1, data: sim },
      { tag: SaveSection.ChunkDeltas, version: 1, data: chunks },
    ]);
    expect(bytes.length).toBeLessThan(sim.length);
    expect(readSaveHeader(bytes)).toEqual(header);
    const file = await readSaveFile(bytes);
    expect(file.header).toEqual(header);
    expect(file.sections.get('SIMS')!.data).toEqual(sim);
    expect(decodeChunkDeltas(file.sections.get('CHNK')!.data)).toEqual([{ cx: -3, cz: 4, data: new Uint8Array([1, 2, 3]) }]);
  });

  it('refuses something that is not a save', async () => {
    expect(() => readSaveHeader(new Uint8Array(20))).toThrow(WireError);
    const bytes = await writeSaveFile(header, []);
    bytes[bytes.length - 3]! ^= 0xff;
    await expect(readSaveFile(bytes)).rejects.toThrow();
  });
});
