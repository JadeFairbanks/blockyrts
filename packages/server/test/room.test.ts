// The room with fake sockets and a fake clock: the rules the two-player
// network test does not reach.
import { describe, expect, it } from 'vitest';
import {
  CloseReason,
  decodeServer,
  FrameFlag,
  HostChoice,
  NO_ORDERS,
  PauseReason,
  Presence,
  RoomPhase,
  type ClientMessage,
  type ServerMessage,
} from '@blockyrts/protocol';
import { Room, type Conn } from '../src/relay/room.ts';

class FakeConn implements Conn {
  static next = 1;
  readonly id = FakeConn.next++;
  readonly got: ServerMessage[] = [];
  closed: number | null = null;
  constructor(public identity: Conn['identity']) {}
  send(bytes: Uint8Array): void {
    this.got.push(decodeServer(bytes));
  }
  close(code: number): void {
    this.closed = code;
  }
  last<K extends ServerMessage['type']>(type: K): Extract<ServerMessage, { type: K }> | undefined {
    return this.got.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: K }> | undefined;
  }
  all<K extends ServerMessage['type']>(type: K): Array<Extract<ServerMessage, { type: K }>> {
    return this.got.filter((m) => m.type === type) as Array<Extract<ServerMessage, { type: K }>>;
  }
}

const person = (name: string, account = ''): FakeConn =>
  new FakeConn({ tokenHash: '', account: account ? { id: account, email: `${name}@x.y`, username: name } : null, name });

function setup(players: number, opts: { closed?: Room[] } = {}) {
  let now = 1_000_000;
  const room = new Room({
    code: 'ABCDEF',
    matchId: 'm',
    seed: 5,
    save: null,
    now,
    timings: { messagesPerSecond: 1000, messageBurst: 1000 },
    hooks: { setMatchOwner: () => undefined, closed: (r) => opts.closed?.push(r), log: () => undefined },
  });
  const conns: FakeConn[] = [];
  for (let i = 0; i < players; i++) {
    const c = person(`p${i}`, i === 0 ? 'acc0' : '');
    if (i === 0) room.create(c, now);
    else room.join(c, { type: 'joinRoom', code: 'ABCDEF', rejoinToken: '', haveStep: -1 }, now);
    conns.push(c);
  }
  const send = (i: number, m: ClientMessage): void => room.handle(conns[i]!, m, now);
  const advance = (ms: number): void => {
    now += ms;
    room.tick(now);
  };
  const start = (): void => {
    for (let i = 1; i < players; i++) send(i, { type: 'setReady', ready: true });
    send(0, { type: 'startGame' });
  };
  return { room, conns, send, advance, start, now: () => now };
}

describe('lobby', () => {
  it('gives each player a slot and a free colour, and starts only when everyone is ready', () => {
    const { room, conns, send } = setup(3);
    expect(conns[2]!.last('roomState')!.players.map((p) => [p.slot, p.colour])).toEqual([[0, 0], [1, 1], [2, 2]]);
    send(1, { type: 'setColour', colour: 2 });
    expect(conns[1]!.last('error')?.code).toBe('colour_taken');
    send(1, { type: 'startGame' });
    expect(conns[1]!.last('error')?.code).toBe('not_host');
    send(1, { type: 'setReady', ready: true });
    send(0, { type: 'startGame' });
    expect(conns[0]!.last('error')?.code).toBe('not_ready');
    send(2, { type: 'setReady', ready: true });
    send(0, { type: 'startGame' });
    expect(room.phase).toBe(RoomPhase.Running);
    expect(conns[2]!.last('gameStart')).toMatchObject({ startStep: 0, activeSlots: 0b111, inputDelay: 4 });
  });

  it('refuses a ninth player and newcomers once the match runs', () => {
    const { room, start } = setup(8);
    const ninth = person('late');
    expect(room.join(ninth, { type: 'joinRoom', code: 'ABCDEF', rejoinToken: '', haveStep: -1 }, 0)).toBe(false);
    expect(ninth.last('error')?.code).toBe('room_full');
    start();
    const tenth = person('later');
    room.join(tenth, { type: 'joinRoom', code: 'ABCDEF', rejoinToken: '', haveStep: -1 }, 0);
    expect(tenth.last('error')?.code).toBe('game_in_progress');
  });

  it('passes the host role on when the host leaves, and closes when the last player goes', () => {
    const closed: Room[] = [];
    const { room, conns, send } = setup(2, { closed });
    send(0, { type: 'leave' });
    expect(room.hostSlot).toBe(1);
    expect(conns[1]!.last('roomState')!.players.map((p) => p.slot)).toEqual([1]);
    send(1, { type: 'leave' });
    expect(closed).toEqual([room]);
  });
});

describe('match', () => {
  it('relays each frame to everyone, in order, and flags a gap', () => {
    const { conns, send, start } = setup(2);
    start();
    send(0, { type: 'frame', step: 0, orders: NO_ORDERS });
    send(0, { type: 'frame', step: 0, orders: NO_ORDERS }); // duplicate: dropped
    send(1, { type: 'frame', step: 2, orders: NO_ORDERS }); // gap
    expect(conns[1]!.last('error')?.code).toBe('frame_gap');
    expect(conns[1]!.all('frame').map((f) => [f.frame.slot, f.frame.step])).toEqual([[0, 0]]);
  });

  it('pauses for a dropped player, asks the host after the wait, and carries on without them at their next step', () => {
    const { room, conns, send, start, advance } = setup(3);
    start();
    for (let s = 0; s < 5; s++) for (const i of [0, 1, 2]) send(i, { type: 'frame', step: s, orders: NO_ORDERS });
    room.disconnect(conns[2]!, 1_000_000);
    expect(conns[0]!.last('pauseState')).toMatchObject({ paused: true, reason: PauseReason.Disconnect, waitingFor: 0b100 });
    const live = (seconds: number): void => {
      for (let t = 0; t < seconds; t++) {
        send(0, { type: 'pong', serverTime: 0 });
        send(1, { type: 'pong', serverTime: 0 });
        advance(1_000);
      }
    };
    live(29);
    expect(conns[0]!.all('hostChoiceNeeded')).toEqual([]);
    live(2);
    expect(conns[0]!.last('hostChoiceNeeded')).toEqual({ type: 'hostChoiceNeeded', slot: 2 });
    expect(conns[1]!.all('hostChoiceNeeded')).toEqual([]);
    send(1, { type: 'hostChoice', slot: 2, choice: HostChoice.CarryOn }); // not the host: ignored
    expect(room.players[2]!.presence).toBe(Presence.Disconnected);
    send(0, { type: 'hostChoice', slot: 2, choice: HostChoice.CarryOn });
    const leave = conns[1]!.last('frame')!.frame;
    expect(leave).toMatchObject({ slot: 2, step: 5, flags: FrameFlag.Leave });
    expect(room.players[2]!.presence).toBe(Presence.Gone);
    expect(conns[0]!.last('pauseState')).toMatchObject({ paused: false });
    // The gone player cannot come back to this match.
    const back = person('p2');
    room.join(back, { type: 'joinRoom', code: 'ABCDEF', rejoinToken: room.players[2]!.rejoinToken, haveStep: 5 }, 0);
    expect(back.last('error')?.code).toBe('game_in_progress');
  });

  it('lets any player pause and any player resume, telling everyone who (patch notes 1)', () => {
    const { conns, send, start } = setup(3);
    start();
    send(1, { type: 'pause', paused: true });
    for (const c of conns) {
      expect(c.last('pauseState')).toMatchObject({ paused: true, reason: PauseReason.Player, held: true, bySlot: 1 });
      expect(c.last('pauseToggled')).toEqual({ type: 'pauseToggled', slot: 1, paused: true });
    }
    // A second Pause while paused (two players at once) changes nothing and tells nobody.
    send(2, { type: 'pause', paused: true });
    expect(conns[0]!.all('pauseToggled')).toHaveLength(1);
    expect(conns[0]!.last('pauseState')).toMatchObject({ bySlot: 1 });
    // Not the pauser, not the host: resuming still works.
    send(2, { type: 'pause', paused: false });
    for (const c of conns) {
      expect(c.last('pauseState')).toMatchObject({ paused: false, reason: PauseReason.None, held: false });
      expect(c.last('pauseToggled')).toEqual({ type: 'pauseToggled', slot: 2, paused: false });
    }
    send(0, { type: 'pause', paused: false });
    expect(conns[1]!.all('pauseToggled')).toHaveLength(2);
  });

  it('keeps a player\'s pause while they are away, and anyone may lift it', () => {
    const { room, conns, send, start } = setup(2);
    start();
    send(1, { type: 'pause', paused: true });
    const token = room.players[1]!.rejoinToken;
    room.disconnect(conns[1]!, 1_000_000);
    expect(conns[0]!.last('pauseState')).toMatchObject({ paused: true, reason: PauseReason.Disconnect, held: true, bySlot: 1 });
    const back = person('p1');
    room.join(back, { type: 'joinRoom', code: 'ABCDEF', rejoinToken: token, haveStep: 0 }, 1_000_100);
    expect(back.last('pauseState')).toMatchObject({ paused: true, reason: PauseReason.Player, held: true, bySlot: 1 });
    send(0, { type: 'pause', paused: false });
    expect(back.last('pauseToggled')).toEqual({ type: 'pauseToggled', slot: 0, paused: false });
    expect(conns[0]!.last('pauseState')).toMatchObject({ paused: false, held: false });
  });

  it('drops a silent player after the heartbeat timeout', () => {
    const { room, conns, start, advance } = setup(2);
    start();
    advance(3_500);
    expect(conns[1]!.closed).toBe(4001);
    expect(room.players[1]!.presence).toBe(Presence.Disconnected);
  });

  it('settles a late hash against the agreed one', () => {
    const { conns, send, start } = setup(3);
    start();
    send(0, { type: 'hash', epoch: 0, step: 20, hash: 7 });
    send(1, { type: 'hash', epoch: 0, step: 20, hash: 7 });
    send(2, { type: 'hash', epoch: 0, step: 20, hash: 7 });
    expect(conns[0]!.all('desync')).toEqual([]);
    send(0, { type: 'hash', epoch: 0, step: 40, hash: 1 });
    send(1, { type: 'hash', epoch: 0, step: 40, hash: 1 });
    send(2, { type: 'hash', epoch: 0, step: 40, hash: 2 });
    expect(conns[1]!.last('desync')).toEqual({ type: 'desync', step: 40, minority: 0b100 });
    expect(conns[0]!.last('snapshotRequest')).toBeDefined();
    expect(conns[1]!.last('pauseState')).toMatchObject({ paused: true, reason: PauseReason.Desync });
  });

  it('raises the input delay to the round trip plus two steps', () => {
    const { room, conns, send, start, advance, now } = setup(2);
    start();
    advance(1000);
    const ping = conns[1]!.last('ping')!;
    advance(250);
    send(1, { type: 'pong', serverTime: ping.serverTime });
    send(0, { type: 'pong', serverTime: (now() - 10) >>> 0 });
    advance(1000);
    expect(room.inputDelay).toBe(Math.ceil(250 / 50) + 2);
    expect(conns[0]!.last('inputDelay')).toEqual({ type: 'inputDelay', steps: 7 });
  });

  it('closes a socket that floods', () => {
    const room = new Room({ code: 'Q', matchId: 'm', seed: 1, save: null, now: 0, hooks: { setMatchOwner: () => undefined, closed: () => undefined, log: () => undefined } });
    const c = person('flood');
    room.create(c, 0);
    for (let i = 0; i < 200; i++) room.handle(c, { type: 'setReady', ready: i % 2 === 0 }, 0);
    expect(c.closed).toBe(4008);
  });

  it('save and quit closes the room for everyone', () => {
    const { conns, send, start } = setup(2);
    start();
    send(0, { type: 'hostChoice', slot: 0, choice: HostChoice.SaveAndQuit });
    expect(conns[1]!.last('roomClosed')).toEqual({ type: 'roomClosed', reason: CloseReason.SavedAndQuit });
  });
});
