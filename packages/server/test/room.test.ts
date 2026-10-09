// The room with fake sockets and a fake clock: the rules the two-player
// network test does not reach.
import { describe, expect, it } from 'vitest';
import {
  CloseReason,
  decodeOrders,
  decodeServer,
  encodeOrders,
  FrameFlag,
  HostChoice,
  NO_ORDERS,
  PauseReason,
  Presence,
  RoomPhase,
  type ClientMessage,
  type ServerMessage,
} from '@blockyrts/protocol';
import type { AccountService } from '../src/accounts.ts';
import { Relay } from '../src/relay/relay.ts';
import { FRAME_HOLD_MS, Room, type Conn } from '../src/relay/room.ts';

class FakeConn implements Conn {
  static next = 1;
  readonly id = FakeConn.next++;
  readonly got: ServerMessage[] = [];
  closed: number | null = null;
  debugger = false;
  constructor(
    public identity: Conn['identity'],
    readonly address = '10.0.0.1',
  ) {}
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
  it('relays a step\'s frames to everyone together once all are in, and flags a gap', () => {
    const { conns, send, start, advance } = setup(3);
    start();
    const sent = (i: number): number[][][] => conns[i]!.all('frames').map((m) => m.frames.map((f) => [f.slot, f.step]));
    send(0, { type: 'frame', step: 0, orders: NO_ORDERS });
    send(0, { type: 'frame', step: 0, orders: NO_ORDERS }); // duplicate: dropped
    send(1, { type: 'frame', step: 2, orders: NO_ORDERS }); // gap
    expect(conns[1]!.last('error')?.code).toBe('frame_gap');
    send(1, { type: 'frame', step: 0, orders: NO_ORDERS });
    send(0, { type: 'frame', step: 1, orders: NO_ORDERS });
    expect(sent(1)).toEqual([]); // step 0 waits for slot 2's frame
    send(2, { type: 'frame', step: 0, orders: NO_ORDERS });
    for (const i of [0, 1, 2]) expect(sent(i)).toEqual([[[0, 0], [1, 0], [2, 0]]]);
    // A stalled step's frames go out after a short wait, so every page can see whose is missing.
    send(1, { type: 'frame', step: 1, orders: NO_ORDERS });
    advance(FRAME_HOLD_MS - 50);
    expect(sent(2)).toHaveLength(1);
    advance(50);
    expect(sent(2)).toEqual([[[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1]]]);
    send(2, { type: 'frame', step: 1, orders: NO_ORDERS });
    expect(sent(2).at(-1)).toEqual([[2, 1]]);
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
    for (const i of [0, 1]) send(i, { type: 'frame', step: 5, orders: NO_ORDERS });
    const step5 = conns[1]!.last('frames')!.frames;
    expect(step5.map((f) => f.slot)).toEqual([2, 0, 1]);
    expect(step5[0]).toMatchObject({ slot: 2, step: 5, flags: FrameFlag.Leave });
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

describe('Patch 5: kicks, private games and the debugger', () => {
  const joinMsg = { type: 'joinRoom', code: 'ABCDEF', rejoinToken: '', haveStep: -1 } as const;

  it('lets the host remove a player in the lobby, who cannot come back', () => {
    const { room, conns, send } = setup(3);
    send(1, { type: 'kick', slot: 2 });
    expect(conns[1]!.last('error')?.code).toBe('not_host');
    send(0, { type: 'kick', slot: 2 });
    expect(conns[2]!.last('roomClosed')).toEqual({ type: 'roomClosed', reason: CloseReason.Kicked });
    expect(conns[2]!.closed).toBe(1000);
    expect(conns[0]!.last('roomState')!.players.map((p) => p.slot)).toEqual([0, 1]);
    // The same guest again, with a new session from the same address: refused.
    const back = new FakeConn({ tokenHash: 'new', account: null, name: 'p2 again' });
    expect(room.join(back, joinMsg, 0)).toBe(false);
    expect(back.last('error')?.code).toBe('kicked');
    expect(room.bans({ accountId: '', tokenHash: 'x', address: '10.0.0.1' })).toBe(true);
    // A signed-in player from that address is someone else.
    expect(room.join(person('friend', 'acc9'), joinMsg, 0)).toBe(true);
  });

  it('keeps a kicked account out from anywhere, and allows no kicks once the match runs', () => {
    const { room, conns, send, start } = setup(2);
    const acc = person('named', 'acc5');
    room.join(acc, joinMsg, 0);
    send(0, { type: 'kick', slot: 2 });
    const again = new FakeConn({ tokenHash: 'other', account: { id: 'acc5', email: 'n@x.y', username: 'named' }, name: 'named' }, '192.168.1.1');
    expect(room.join(again, joinMsg, 0)).toBe(false);
    start();
    send(0, { type: 'kick', slot: 1 });
    expect(conns[0]!.last('error')?.code).toBe('not_lobby');
  });

  it('says whether a game is private', () => {
    const room = new Room({ code: 'PRIV', matchId: 'm', seed: 1, save: null, now: 0, isPrivate: true, hooks: { setMatchOwner: () => undefined, closed: () => undefined, log: () => undefined } });
    const c = person('host');
    room.create(c, 0);
    expect(c.last('roomState')!.private).toBe(true);
  });

  it('drops debugger orders from players the server does not allow, and keeps the rest', () => {
    const { conns, send, start } = setup(2);
    conns[0]!.debugger = true;
    start();
    const orders = encodeOrders([{ kind: 'debugGod', player: 0, on: true }, { kind: 'hold', player: 0, units: [] }]);
    send(0, { type: 'frame', step: 0, orders });
    send(1, { type: 'frame', step: 0, orders });
    const frames = conns[1]!.all('frames').flatMap((m) => m.frames.map((f) => decodeOrders(f.orders).map((o) => o['kind'])));
    expect(frames).toEqual([['debugGod', 'hold'], ['hold']]);
  });

  it('lists open games public first, newest first, and hides private codes and games that kicked you', () => {
    const relay = new Relay({ accounts: {} as AccountService, saves: {} as never, db: {} as never, tokenOf: () => '', addressOf: () => '', allowedOrigins: [], log: () => undefined });
    const hooks = { setMatchOwner: () => undefined, closed: () => undefined, log: () => undefined };
    const open = (code: string, now: number, isPrivate: boolean): Room => {
      const r = new Room({ code, matchId: code, seed: 1, save: null, now, isPrivate, hooks });
      r.create(person(`host ${code}`), now);
      relay.rooms.set(code, r);
      return r;
    };
    open('PUBOLD', 1, false);
    open('PRIVAT', 3, true);
    const kicker = open('PUBNEW', 2, false);
    const full = open('FULLUP', 4, false);
    for (let i = 1; i < 8; i++) full.join(person(`f${i}`), { type: 'joinRoom', code: 'FULLUP', rejoinToken: '', haveStep: -1 }, 4);
    const victim = new FakeConn({ tokenHash: 'vt', account: null, name: 'v' }, '1.2.3.4');
    kicker.join(victim, { type: 'joinRoom', code: 'PUBNEW', rejoinToken: '', haveStep: -1 }, 2);
    kicker.handle(kicker.players[0]!.conn!, { type: 'kick', slot: 1 }, 2);
    const seen = (accountId: string, tokenHash: string, address: string): string[] => relay.openRooms({ accountId, tokenHash, address }).map((r) => r.code || `private:${r.hostName}`);
    expect(seen('', 'anyone', '9.9.9.9')).toEqual(['PUBNEW', 'PUBOLD', 'private:host PRIVAT']);
    expect(seen('', 'vt', '5.5.5.5')).toEqual(['PUBOLD', 'private:host PRIVAT']);
    void relay.close();
  });
});
