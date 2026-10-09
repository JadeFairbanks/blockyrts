// One game room: the lobby, then the lockstep relay for the match (technical
// decisions 2 and 3; Multiplayer and saving; Outside the match). The room runs
// no game logic. It forwards each player's frame for each step to everyone,
// keeps two minutes of frames for rejoin, compares the state hashes players
// report every 20 steps and, on a mismatch, has everyone reload the host's
// state. A missing player stalls the match by itself (nobody can run a step
// without their frame); the room tells everyone why, and after 30 s asks the
// host to wait, carry on without them, or save and quit.
//
// Time comes in through tick(now) and every handler takes `now`, so tests can
// drive the room with a fake clock.

import { randomBytes } from 'node:crypto';
import {
  CloseReason,
  DEFAULT_INPUT_DELAY,
  DROP_AFTER_MS,
  encodeServer,
  FRAME_LOG_STEPS,
  FrameFlag,
  HASH_INTERVAL_STEPS,
  HEARTBEAT_INTERVAL_MS,
  HOST_CHOICE_AFTER_MS,
  HostChoice,
  MAX_CHAT_LENGTH,
  MAX_INPUT_DELAY,
  MAX_PLAYERS,
  NO_ORDERS,
  PauseReason,
  PLAYER_COLOURS,
  Presence,
  readSaveHeader,
  RoomPhase,
  slotMask,
  STEPS_PER_SECOND,
  WireError,
  type ClientMessage,
  type PlayerInfo,
  type SaveHeader,
  type ServerMessage,
  type WireFrame,
  withoutDebugOrders,
} from '@blockyrts/protocol';
import type { Identity } from '../accounts.ts';

/** A socket as the room sees it. */
export interface Conn {
  readonly id: number;
  identity: Identity;
  /** The player's address, for keeping a kicked guest out (Patch 5). */
  readonly address: string;
  /** The server lets this socket's account use the debugger (Patch 5); everyone else's debugger orders are dropped. */
  debugger: boolean;
  send(bytes: Uint8Array): void;
  close(code: number, reason: string): void;
}

/** Timeouts, in ms. Tests shorten them. */
export interface RoomTimings {
  heartbeatMs: number;
  /** A player silent this long is treated as disconnected. */
  dropAfterMs: number;
  /** The host is asked what to do after a player has been gone this long. */
  hostChoiceAfterMs: number;
  /** A room with nobody connected closes after this long. */
  emptyRoomMs: number;
  /** Messages a player may send per second, sustained, and in a burst; more closes the socket. */
  messagesPerSecond: number;
  messageBurst: number;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  heartbeatMs: HEARTBEAT_INTERVAL_MS,
  dropAfterMs: DROP_AFTER_MS,
  hostChoiceAfterMs: HOST_CHOICE_AFTER_MS,
  emptyRoomMs: 10 * 60_000,
  // 20 frames a second is the legal rate, plus hashes, pongs and catch-up after a stall.
  messagesPerSecond: 60,
  messageBurst: 120,
};
/** Hash checkpoints remembered after agreement, for players who report late. */
const AGREED_KEPT = 30;
/** Pending hash checks older than this many steps behind the newest are settled with the reports they have. */
const HASH_SETTLE_STEPS = 10 * HASH_INTERVAL_STEPS;

export class Player {
  slot: number;
  name: string;
  colour: number;
  ready = false;
  /** Account id, or '' for a guest. */
  accountId: string;
  guest: boolean;
  readonly rejoinToken = randomBytes(18).toString('base64url');
  conn: Conn | null = null;
  /** The session and address it last came from, for a kick's ban. */
  tokenHash = '';
  address = '';
  presence: Presence = Presence.Connected;
  joinOrder: number;
  lastSeen = 0;
  disconnectedAt = 0;
  /** The host slot that was last asked about this player, or -1. */
  promptedHost = -1;
  /** Waiting for a snapshot before it can rejoin the match. */
  syncing = false;
  /** Missed a desync reload while away: must rejoin from a snapshot. */
  needsSnapshot = false;
  /** Smoothed round trip in ms, or -1 before the first pong. */
  rtt = -1;
  /** Message budget (token bucket) against floods. */
  budget = 0;
  budgetAt = 0;

  constructor(slot: number, name: string, colour: number, accountId: string, guest: boolean, joinOrder: number) {
    this.slot = slot;
    this.name = name;
    this.colour = colour;
    this.accountId = accountId;
    this.guest = guest;
    this.joinOrder = joinOrder;
  }
}

interface SnapshotRequest {
  purpose: 'desync' | 'rejoin';
  source: number;
}

export interface RoomHooks {
  /** The room's match now has an owner account (a guest host made an account). */
  setMatchOwner(matchId: string, accountId: string): void;
  /** The room is over; the relay forgets it. */
  closed(room: Room): void;
  log(message: string): void;
}

/** Who is asking to see or join a room, for the kick ban (Patch 5). */
export interface Visitor {
  /** Account id, or '' for a guest. */
  accountId: string;
  tokenHash: string;
  address: string;
}

export interface RoomOptions {
  code: string;
  matchId: string;
  seed: number;
  /** Listed under the open games but joined only by the code (Patch 5). */
  isPrivate?: boolean;
  /** The save file this room continues, or null for a new world. */
  save: Uint8Array | null;
  hooks: RoomHooks;
  now: number;
  timings?: Partial<RoomTimings>;
}

export class Room {
  readonly code: string;
  readonly matchId: string;
  readonly seed: number;
  readonly fromSave: boolean;
  readonly isPrivate: boolean;
  /** When the room opened (the open games list shows the newest first). */
  readonly openedAt: number;
  private readonly save: Uint8Array | null;
  private readonly saveHeader: SaveHeader | null;
  private readonly hooks: RoomHooks;
  private readonly t: RoomTimings;

  phase: RoomPhase = RoomPhase.Lobby;
  readonly players: Array<Player | undefined> = new Array<Player | undefined>(MAX_PLAYERS);
  hostSlot = 0;
  /** Account that owns the match's saves ('' while the host is a guest). */
  ownerAccountId = '';
  /** The slot of the player who created the room: if they were a guest and make an account, the match becomes theirs. */
  private creatorSlot = 0;
  private joins = 0;

  // Lockstep state.
  epoch = 0;
  inputDelay = DEFAULT_INPUT_DELAY;
  private startStep = 0;
  private readonly active = new Set<number>();
  /** The next step each slot must send a frame for. */
  readonly expectedNext: number[] = new Array<number>(MAX_PLAYERS).fill(0);
  private log: WireFrame[] = [];
  /** Every frame for a step at or after this is in the log. */
  private logFloor = 0;
  private readonly hashes = new Map<number, Map<number, number>>();
  private readonly agreed = new Map<number, number>();
  private newestHashStep = 0;
  private recovering = false;
  private manualPauseBy = -1;
  private requests = new Map<number, SnapshotRequest>();
  private nextRequestId = 1;
  private lastPause = '';
  private lastPing = 0;
  private emptySince = -1;
  /**
   * Who the host kicked (Jade, Patch 5: "when kicked they cannot rejoin that
   * same lobby"): their account, their session, and for a guest their address
   * too, since a guest can always get a new session.
   */
  private readonly banned = { accounts: new Set<string>(), tokens: new Set<string>(), guestAddresses: new Set<string>() };

  constructor(opts: RoomOptions) {
    this.code = opts.code;
    this.matchId = opts.matchId;
    this.seed = opts.seed >>> 0;
    this.save = opts.save;
    this.fromSave = opts.save !== null;
    this.isPrivate = opts.isPrivate ?? false;
    this.openedAt = opts.now;
    this.hooks = opts.hooks;
    this.t = { ...DEFAULT_TIMINGS, ...opts.timings };
    this.saveHeader = opts.save ? readSaveHeader(opts.save) : null;
    if (this.saveHeader) {
      for (const sp of this.saveHeader.players) {
        if (sp.slot >= MAX_PLAYERS || this.players[sp.slot]) throw new WireError('bad player list in save');
        const p = new Player(sp.slot, sp.name, sp.colour % MAX_PLAYERS, sp.accountId, sp.accountId === '', -1);
        p.presence = Presence.Reserved;
        this.players[sp.slot] = p;
      }
    }
    this.lastPing = opts.now;
  }

  // ------------------------------------------------------------- sending

  private sendTo(p: Player, m: ServerMessage): void {
    p.conn?.send(encodeServer(m));
  }

  private broadcast(m: ServerMessage, filter: (p: Player) => boolean = () => true): void {
    const bytes = encodeServer(m);
    for (const p of this.players) if (p?.conn && filter(p)) p.conn.send(bytes);
  }

  private error(conn: Conn, code: string, message: string): void {
    conn.send(encodeServer({ type: 'error', code, message }));
  }

  private playerInfos(): PlayerInfo[] {
    const out: PlayerInfo[] = [];
    for (const p of this.players) {
      if (p) out.push({ slot: p.slot, name: p.name, colour: p.colour, ready: p.ready, presence: p.presence, guest: p.guest, accountId: p.accountId });
    }
    return out;
  }

  private sendRoomState(): void {
    const players = this.playerInfos();
    for (const p of this.players) {
      if (!p?.conn) continue;
      this.sendTo(p, {
        type: 'roomState',
        code: this.code,
        matchId: this.matchId,
        phase: this.phase,
        seed: this.seed,
        fromSave: this.fromSave,
        private: this.isPrivate,
        hostSlot: this.hostSlot,
        yourSlot: p.slot,
        rejoinToken: p.rejoinToken,
        players,
      });
    }
  }

  /** What the match is waiting on, if anything, sent whenever it changes. */
  private sendPause(force = false): void {
    if (this.phase !== RoomPhase.Running) return;
    let waiting = 0;
    let syncing = false;
    for (const s of this.active) {
      const p = this.players[s]!;
      if (p.presence !== Presence.Connected) waiting |= 1 << s;
      if (p.syncing) {
        waiting |= 1 << s;
        syncing = true;
      }
    }
    let reason: PauseReason = PauseReason.None;
    if (this.recovering) reason = PauseReason.Desync;
    else if (syncing) reason = PauseReason.Rejoin;
    else if (waiting) reason = PauseReason.Disconnect;
    else if (this.manualPauseBy >= 0) reason = PauseReason.Player;
    const m: ServerMessage = {
      type: 'pauseState',
      paused: reason !== PauseReason.None,
      reason,
      held: this.manualPauseBy >= 0,
      bySlot: this.manualPauseBy >= 0 ? this.manualPauseBy : 0,
      waitingFor: waiting,
    };
    const key = `${m.paused}|${m.reason}|${m.held}|${m.bySlot}|${m.waitingFor}`;
    if (!force && key === this.lastPause) return;
    this.lastPause = key;
    this.broadcast(m, (p) => !p.syncing);
  }

  // ------------------------------------------------------------- people

  get connectedCount(): number {
    let n = 0;
    for (const p of this.players) if (p?.presence === Presence.Connected) n++;
    return n;
  }

  get openSlots(): number {
    if (this.phase !== RoomPhase.Lobby) return 0;
    let n = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const p = this.players[s];
      if (this.fromSave ? p?.presence === Presence.Reserved : !p) n++;
    }
    return n;
  }

  get hostName(): string {
    return this.players[this.hostSlot]?.name ?? '';
  }

  /** The account of whoever holds the host role now, or null. */
  get hostAccountId(): string | null {
    return this.players[this.hostSlot]?.accountId || null;
  }

  playerOf(conn: Conn): Player | null {
    for (const p of this.players) if (p?.conn === conn) return p;
    return null;
  }

  private attach(p: Player, conn: Conn, now: number): void {
    p.conn = conn;
    p.presence = Presence.Connected;
    p.lastSeen = now;
    p.budget = this.t.messageBurst;
    p.budgetAt = now;
    p.promptedHost = -1;
    p.name = conn.identity.name;
    p.guest = conn.identity.account === null;
    if (conn.identity.account) p.accountId = conn.identity.account.id;
    p.tokenHash = conn.identity.tokenHash;
    p.address = conn.address;
    this.emptySince = -1;
  }

  /** The creator of the room: takes a slot and the host role. */
  create(conn: Conn, now: number): boolean {
    this.ownerAccountId = conn.identity.account?.id ?? '';
    const ok = this.joinLobby(conn, now);
    if (ok) {
      const p = this.playerOf(conn)!;
      this.hostSlot = p.slot;
      this.creatorSlot = p.slot;
      this.sendRoomState();
    }
    return ok;
  }

  /** Whether the host kicked this visitor out of this room. */
  bans(v: Visitor): boolean {
    return (v.accountId !== '' && this.banned.accounts.has(v.accountId)) || (v.tokenHash !== '' && this.banned.tokens.has(v.tokenHash)) || (v.accountId === '' && this.banned.guestAddresses.has(v.address));
  }

  /** A join request: a newcomer in the lobby, or a returning player. */
  join(conn: Conn, msg: Extract<ClientMessage, { type: 'joinRoom' }>, now: number): boolean {
    if (this.phase === RoomPhase.Ended) {
      this.error(conn, 'room_closed', 'That game has ended.');
      return false;
    }
    if (this.bans({ accountId: conn.identity.account?.id ?? '', tokenHash: conn.identity.tokenHash, address: conn.address })) {
      this.error(conn, 'kicked', 'The host removed you from this game, so you cannot join it again.');
      return false;
    }
    const back = this.findReturning(conn, msg.rejoinToken);
    if (back) {
      this.rejoin(back, conn, msg.haveStep, now);
      return true;
    }
    if (this.phase === RoomPhase.Running) {
      this.error(conn, 'game_in_progress', 'That game has already started. Only its own players can rejoin.');
      return false;
    }
    if (this.joinLobby(conn, now)) {
      this.sendRoomState();
      return true;
    }
    return false;
  }

  private findReturning(conn: Conn, token: string): Player | null {
    for (const p of this.players) {
      if (!p || p.presence === Presence.Gone || p.presence === Presence.Reserved) continue;
      if (token && p.rejoinToken === token) return p;
    }
    const account = conn.identity.account?.id;
    if (account) {
      for (const p of this.players) {
        if (p && p.presence === Presence.Disconnected && p.accountId === account) return p;
      }
    }
    return null;
  }

  private joinLobby(conn: Conn, now: number): boolean {
    let slot = -1;
    if (this.fromSave) {
      const account = conn.identity.account?.id ?? '';
      const reserved = this.players.filter((p): p is Player => p?.presence === Presence.Reserved);
      slot = (reserved.find((p) => account !== '' && p.accountId === account) ?? reserved.find((p) => p.accountId === ''))?.slot ?? -1;
      if (slot < 0) {
        this.error(conn, 'no_slot', 'There is no place for you in this saved game.');
        return false;
      }
      const p = this.players[slot]!;
      p.joinOrder = this.joins++;
      p.ready = false;
      this.attach(p, conn, now);
      return true;
    }
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!this.players[s]) {
        slot = s;
        break;
      }
    }
    if (slot < 0) {
      this.error(conn, 'room_full', 'That game is full: 8 players is the most.');
      return false;
    }
    const used = new Set(this.players.filter((p) => p).map((p) => p!.colour));
    let colour = 0;
    while (used.has(colour)) colour++;
    const p = new Player(slot, conn.identity.name, colour, conn.identity.account?.id ?? '', conn.identity.account === null, this.joins++);
    this.players[slot] = p;
    this.attach(p, conn, now);
    return true;
  }

  private rejoin(p: Player, conn: Conn, haveStep: number, now: number): void {
    const old = p.conn;
    if (old && old !== conn) old.close(4000, 'replaced by a new connection');
    this.attach(p, conn, now);
    this.hooks.log(`room ${this.code}: ${p.name} is back in slot ${p.slot}`);
    if (this.phase !== RoomPhase.Running) {
      this.sendRoomState();
      return;
    }
    if (this.active.has(p.slot)) {
      const next = this.expectedNext[p.slot]!;
      const fromLog = haveStep >= 0 && !p.needsSnapshot && haveStep >= this.logFloor && haveStep <= next;
      if (fromLog) {
        p.syncing = false;
        this.sendRoomState();
        this.sendTo(p, {
          type: 'resume',
          epoch: this.epoch,
          frames: this.framesFrom(haveStep),
          nextFrameStep: next,
          activeSlots: slotMask(this.active),
          inputDelay: this.inputDelay,
        });
      } else {
        p.syncing = true;
        this.sendRoomState();
        this.requestSnapshot('rejoin', now);
      }
    } else {
      this.sendRoomState();
    }
    this.lastPause = '';
    this.sendPause(true);
  }

  /** The socket closed or went silent. */
  disconnect(conn: Conn, now: number): void {
    const p = this.playerOf(conn);
    if (!p) return;
    p.conn = null;
    if (this.phase === RoomPhase.Lobby) {
      if (this.fromSave) {
        p.presence = Presence.Reserved;
        p.ready = false;
      } else {
        p.presence = Presence.Disconnected;
        p.disconnectedAt = now;
      }
    } else if (this.phase === RoomPhase.Running) {
      p.presence = Presence.Disconnected;
      p.disconnectedAt = now;
      p.syncing = false;
      for (const [id, r] of this.requests) {
        if (r.source === p.slot) {
          this.requests.delete(id);
          this.requestSnapshot(r.purpose, now);
        }
      }
      // A player's pause outlives their connection: anyone may resume it (Jade's patch notes 1).
    }
    this.hooks.log(`room ${this.code}: ${p.name} disconnected from slot ${p.slot}`);
    if (p.slot === this.hostSlot) this.passHost();
    if (this.connectedCount === 0) this.emptySince = now;
    this.sendRoomState();
    this.sendPause();
  }

  /** The host role passes to the next connected player in join order (technical decision 3). */
  private passHost(): void {
    let best: Player | null = null;
    for (const p of this.players) {
      if (p?.presence === Presence.Connected && (!best || p.joinOrder < best.joinOrder)) best = p;
    }
    if (best && best.slot !== this.hostSlot) {
      this.hostSlot = best.slot;
      this.hooks.log(`room ${this.code}: host role passes to ${best.name}`);
    }
  }

  private removeFromLobby(p: Player): void {
    if (this.fromSave) {
      p.presence = Presence.Reserved;
      p.ready = false;
      p.conn = null;
    } else {
      this.players[p.slot] = undefined;
    }
  }

  // ------------------------------------------------------------- messages

  /** A message from a player already in this room. */
  handle(conn: Conn, msg: ClientMessage, now: number): void {
    const p = this.playerOf(conn);
    if (!p) return;
    p.lastSeen = now;
    p.budget = Math.min(this.t.messageBurst, p.budget + ((now - p.budgetAt) * this.t.messagesPerSecond) / 1000);
    p.budgetAt = now;
    if (--p.budget < 0) {
      this.error(conn, 'rate_limited', 'Too many messages.');
      conn.close(4008, 'rate limited');
      this.disconnect(conn, now);
      return;
    }
    switch (msg.type) {
      case 'frame':
        this.onFrame(p, msg.step, msg.orders);
        break;
      case 'hash':
        this.onHash(p, msg.epoch, msg.step, msg.hash, now);
        break;
      case 'pong':
        this.onPong(p, msg.serverTime, now);
        break;
      case 'setColour':
        this.onSetColour(p, msg.colour);
        break;
      case 'setReady':
        if (this.phase === RoomPhase.Lobby && p.ready !== msg.ready) {
          p.ready = msg.ready;
          this.sendRoomState();
        }
        break;
      case 'startGame':
        this.onStart(p, now);
        break;
      case 'snapshot':
        this.onSnapshot(p, msg.requestId, msg.step, msg.data, now);
        break;
      case 'hostChoice':
        this.onHostChoice(p, msg.slot, msg.choice, now);
        break;
      case 'pause':
        this.onPause(p, msg.paused);
        break;
      case 'leave':
        this.onLeave(p, now);
        break;
      case 'chat': {
        const text = msg.text.trim().slice(0, MAX_CHAT_LENGTH);
        if (text) this.broadcast({ type: 'chat', slot: p.slot, name: p.name, text });
        break;
      }
      case 'mapPing':
        if (this.phase === RoomPhase.Running) this.broadcast({ type: 'mapPing', slot: p.slot, x: msg.x, z: msg.z });
        break;
      case 'kick':
        this.onKick(p, msg.slot);
        break;
      default:
        this.error(conn, 'bad_message', `"${msg.type}" is not allowed here.`);
    }
  }

  /** The player's socket is now signed in as an account (a guest registered mid-match). */
  identityChanged(conn: Conn): void {
    const p = this.playerOf(conn);
    if (!p) return;
    const account = conn.identity.account;
    p.name = conn.identity.name;
    p.guest = account === null;
    if (account) {
      p.accountId = account.id;
      if (p.slot === this.creatorSlot && this.ownerAccountId === '') {
        this.ownerAccountId = account.id;
        this.hooks.setMatchOwner(this.matchId, account.id);
      }
    }
    this.sendRoomState();
  }

  private onSetColour(p: Player, colour: number): void {
    if (this.phase !== RoomPhase.Lobby) return;
    if (colour >= PLAYER_COLOURS.length) return this.error(p.conn!, 'bad_colour', 'No such colour.');
    if (this.players.some((o) => o && o !== p && o.colour === colour && o.presence !== Presence.Gone)) {
      return this.error(p.conn!, 'colour_taken', 'Someone else has that colour.');
    }
    p.colour = colour;
    this.sendRoomState();
  }

  /** The host removes a player from the lobby for good (Jade, Patch 5); the match itself has no kicking. */
  private onKick(p: Player, slot: number): void {
    const conn = p.conn!;
    if (this.phase !== RoomPhase.Lobby) return this.error(conn, 'not_lobby', 'Players can only be removed in the lobby.');
    if (p.slot !== this.hostSlot) return this.error(conn, 'not_host', 'Only the host can remove a player.');
    const target = slot < MAX_PLAYERS ? this.players[slot] : undefined;
    if (!target || target === p || target.presence === Presence.Reserved) return this.error(conn, 'no_player', 'There is nobody in that place.');
    // A saved game's account places belong to those players: only they can take them, so removing one would leave the game unable to start.
    if (this.fromSave && target.accountId !== '' && this.saveHeader?.players.some((sp) => sp.slot === slot && sp.accountId === target.accountId)) {
      return this.error(conn, 'kick_saved', 'That place in the saved game is theirs: the game cannot start without them.');
    }
    if (target.accountId) this.banned.accounts.add(target.accountId);
    if (target.tokenHash) this.banned.tokens.add(target.tokenHash);
    if (target.guest && target.address) this.banned.guestAddresses.add(target.address);
    const gone = target.conn;
    gone?.send(encodeServer({ type: 'roomClosed', reason: CloseReason.Kicked }));
    target.conn = null;
    this.removeFromLobby(target);
    // A saved game's guest place is free again for anyone.
    const saved = this.saveHeader?.players.find((sp) => sp.slot === slot);
    if (saved) {
      target.name = saved.name;
      target.accountId = saved.accountId;
      target.guest = saved.accountId === '';
    }
    this.hooks.log(`room ${this.code}: ${p.name} removed ${target.name} from slot ${slot}`);
    this.sendRoomState();
    gone?.close(1000, 'removed by the host');
  }

  private onStart(p: Player, now: number): void {
    if (this.phase !== RoomPhase.Lobby) return;
    if (p.slot !== this.hostSlot) return this.error(p.conn!, 'not_host', 'Only the host can start the game.');
    const present = this.players.filter((o): o is Player => o !== undefined);
    if (present.some((o) => o.presence === Presence.Reserved)) {
      return this.error(p.conn!, 'not_everyone_back', 'Everyone who was in this saved game has to be back before it starts.');
    }
    if (present.some((o) => o.presence !== Presence.Connected)) {
      return this.error(p.conn!, 'player_missing', 'A player has lost their connection.');
    }
    if (present.some((o) => o !== p && !o.ready)) return this.error(p.conn!, 'not_ready', 'Not everyone is ready.');
    this.phase = RoomPhase.Running;
    this.startStep = this.saveHeader?.step ?? 0;
    this.logFloor = this.startStep;
    for (const o of present) {
      this.active.add(o.slot);
      this.expectedNext[o.slot] = this.startStep;
      o.ready = true;
    }
    this.hooks.log(`room ${this.code}: match starts with ${present.length} players at step ${this.startStep}`);
    this.lastPing = now;
    this.sendRoomState();
    this.broadcast({
      type: 'gameStart',
      startStep: this.startStep,
      inputDelay: this.inputDelay,
      epoch: this.epoch,
      activeSlots: slotMask(this.active),
      snapshot: this.save ?? new Uint8Array(),
    });
  }

  // ------------------------------------------------------------- lockstep

  private onFrame(p: Player, step: number, orders: Uint8Array): void {
    if (this.phase !== RoomPhase.Running || !this.active.has(p.slot) || p.syncing) return;
    const expected = this.expectedNext[p.slot]!;
    if (step < expected) return; // already have it (a resend after a rejoin)
    if (step > expected) {
      this.error(p.conn!, 'frame_gap', `Frame for step ${step} skips step ${expected}.`);
      return;
    }
    this.expectedNext[p.slot] = expected + 1;
    // Only the admin accounts may use the debugger (Jade, Patch 5): anyone else's debugger orders never reach the match.
    this.relay({ slot: p.slot, step, flags: 0, orders: p.conn?.debugger ? orders : withoutDebugOrders(orders) });
  }

  private relay(f: WireFrame): void {
    this.log.push(f);
    let newest = 0;
    for (const s of this.active) newest = Math.max(newest, this.expectedNext[s]!);
    const floor = newest - FRAME_LOG_STEPS;
    if (floor > this.logFloor) {
      this.logFloor = floor;
      let cut = 0;
      while (cut < this.log.length && this.log[cut]!.step < floor) cut++;
      if (cut > 256) this.log = this.log.slice(cut);
    }
    this.broadcast({ type: 'frame', frame: f }, (p) => !p.syncing);
  }

  private framesFrom(step: number): WireFrame[] {
    return this.log.filter((f) => f.step >= step);
  }

  private onHash(p: Player, epoch: number, step: number, hash: number, now: number): void {
    if (this.phase !== RoomPhase.Running || this.recovering || p.syncing) return;
    if (epoch !== this.epoch || step % HASH_INTERVAL_STEPS !== 0 || !this.active.has(p.slot)) return;
    const agreed = this.agreed.get(step);
    if (agreed !== undefined) {
      if (agreed !== hash) this.desync(step, 1 << p.slot, now);
      return;
    }
    let reports = this.hashes.get(step);
    if (!reports) {
      reports = new Map();
      this.hashes.set(step, reports);
    }
    reports.set(p.slot, hash);
    this.newestHashStep = Math.max(this.newestHashStep, step);
    const needed = [...this.active].filter((s) => {
      const o = this.players[s]!;
      return o.presence === Presence.Connected && !o.syncing;
    });
    if (needed.every((s) => reports.has(s))) this.settle(step, now);
    for (const old of [...this.hashes.keys()]) {
      if (old < this.newestHashStep - HASH_SETTLE_STEPS && !this.recovering) this.settle(old, now);
    }
  }

  /** Compares the hashes reported for a step; the majority is right, the host's breaks a tie. */
  private settle(step: number, now: number): void {
    const reports = this.hashes.get(step);
    this.hashes.delete(step);
    if (!reports || reports.size === 0) return;
    const counts = new Map<number, number>();
    for (const h of reports.values()) counts.set(h, (counts.get(h) ?? 0) + 1);
    const hostHash = reports.get(this.hostSlot);
    let best = -1;
    let bestCount = 0;
    for (const [h, n] of counts) {
      if (n > bestCount || (n === bestCount && h === hostHash)) {
        best = h;
        bestCount = n;
      }
    }
    this.agreed.set(step, best);
    if (this.agreed.size > AGREED_KEPT) this.agreed.delete(this.agreed.keys().next().value!);
    let minority = 0;
    for (const [s, h] of reports) if (h !== best) minority |= 1 << s;
    if (minority) this.desync(step, minority, now);
  }

  /** A desync: everyone stops, the host sends its state, everyone loads it (Multiplayer model). */
  private desync(step: number, minority: number, now: number): void {
    if (this.recovering) return;
    this.hooks.log(`room ${this.code}: desync at step ${step}, slots ${minority.toString(2)} disagree; reloading from the host`);
    this.recovering = true;
    this.epoch = (this.epoch + 1) & 0xffff;
    this.hashes.clear();
    this.agreed.clear();
    for (const s of this.active) {
      const o = this.players[s]!;
      if (o.presence !== Presence.Connected) o.needsSnapshot = true;
    }
    this.broadcast({ type: 'desync', step, minority }, (p) => !p.syncing);
    this.sendPause();
    this.requestSnapshot('desync', now);
  }

  /** Asks a present player (the host first) for a save file of their state. */
  private requestSnapshot(purpose: SnapshotRequest['purpose'], _now: number): void {
    for (const r of this.requests.values()) if (r.purpose === purpose) return;
    const candidates = [this.hostSlot, ...[...this.active].filter((s) => s !== this.hostSlot)];
    const source = candidates.find((s) => {
      const o = this.players[s];
      return o && this.active.has(s) && o.presence === Presence.Connected && !o.syncing;
    });
    if (source === undefined) return; // retried by tick() once someone is back
    const requestId = this.nextRequestId++;
    this.requests.set(requestId, { purpose, source });
    this.sendTo(this.players[source]!, { type: 'snapshotRequest', requestId });
  }

  private onSnapshot(p: Player, requestId: number, step: number, data: Uint8Array, now: number): void {
    const req = this.requests.get(requestId);
    if (!req || req.source !== p.slot) return;
    let header: SaveHeader;
    try {
      header = readSaveHeader(data);
    } catch {
      this.requests.delete(requestId);
      this.error(p.conn!, 'bad_snapshot', 'That snapshot is not a save file.');
      this.requestSnapshot(req.purpose, now);
      return;
    }
    if (header.step !== step || step < this.logFloor) {
      this.requests.delete(requestId);
      this.error(p.conn!, 'bad_snapshot', 'That snapshot is for the wrong step.');
      this.requestSnapshot(req.purpose, now);
      return;
    }
    this.requests.delete(requestId);
    const frames = this.framesFrom(step);
    const targets = (o: Player): boolean =>
      req.purpose === 'desync' ? this.active.has(o.slot) && o.presence === Presence.Connected : o.syncing;
    for (const o of this.players) {
      if (!o?.conn || !targets(o)) continue;
      o.syncing = false;
      o.needsSnapshot = false;
      this.sendTo(o, {
        type: 'loadSnapshot',
        epoch: this.epoch,
        step,
        data,
        frames,
        nextFrameStep: this.expectedNext[o.slot]!,
        activeSlots: slotMask(this.active),
        inputDelay: this.inputDelay,
      });
    }
    if (req.purpose === 'desync') this.recovering = false;
    this.lastPause = '';
    this.sendPause(true);
  }

  private onPong(p: Player, serverTime: number, now: number): void {
    const rtt = ((now >>> 0) - serverTime) >>> 0;
    if (rtt > 60_000) return;
    p.rtt = p.rtt < 0 ? rtt : Math.round((p.rtt * 3 + rtt) / 4);
  }

  /**
   * Pause or Resume from any player (Jade's patch notes 1): a press that
   * changes the player's pause is passed on to everyone with who pressed it,
   * so every page opens or closes its menu and says who; a press that
   * changes nothing (two players pausing at once) is dropped.
   */
  private onPause(p: Player, paused: boolean): void {
    if (this.phase !== RoomPhase.Running) return;
    if (paused === (this.manualPauseBy >= 0)) return;
    this.manualPauseBy = paused ? p.slot : -1;
    this.hooks.log(`room ${this.code}: ${p.name} ${paused ? 'paused' : 'resumed'} the game`);
    this.sendPause();
    this.broadcast({ type: 'pauseToggled', slot: p.slot, paused }, (o) => !o.syncing);
  }

  private onHostChoice(p: Player, slot: number, choice: HostChoice, now: number): void {
    if (p.slot !== this.hostSlot || this.phase !== RoomPhase.Running) return;
    if (choice === HostChoice.SaveAndQuit) {
      this.close(CloseReason.SavedAndQuit);
      return;
    }
    if (choice !== HostChoice.CarryOn) return;
    const gone = this.players[slot];
    if (!gone || gone.presence !== Presence.Disconnected || !this.active.has(slot)) return;
    // Carry on without them: their assets are shared out as if eliminated. The
    // leave marker takes the place of their next frame, so every machine
    // applies it at the same step.
    const step = this.expectedNext[slot]!;
    this.relay({ slot, step, flags: FrameFlag.Leave, orders: NO_ORDERS });
    this.active.delete(slot);
    gone.presence = Presence.Gone;
    this.hooks.log(`room ${this.code}: carrying on without ${gone.name} from step ${step}`);
    this.sendRoomState();
    this.sendPause();
    void now;
  }

  private onLeave(p: Player, now: number): void {
    const conn = p.conn!;
    if (this.phase === RoomPhase.Lobby) {
      p.conn = null;
      this.removeFromLobby(p);
      if (p.slot === this.hostSlot) this.passHost();
      if (this.connectedCount === 0) this.close(CloseReason.Abandoned);
      else this.sendRoomState();
    } else {
      // Leaving a running match is a disconnect whose host choice is due at once.
      this.disconnect(conn, now);
      p.disconnectedAt = now - this.t.hostChoiceAfterMs;
      this.tick(now);
    }
    conn.close(1000, 'left the game');
  }

  // ------------------------------------------------------------- time

  /** Heartbeats, drop detection, the 30 s host choice and the input delay; called a few times a second. */
  tick(now: number): void {
    if (this.phase === RoomPhase.Ended) return;
    for (const p of this.players) {
      if (p?.conn && p.presence === Presence.Connected && now - p.lastSeen > this.t.dropAfterMs) {
        const conn = p.conn;
        conn.close(4001, 'no heartbeat');
        this.disconnect(conn, now);
      }
    }
    if (now - this.lastPing >= this.t.heartbeatMs) {
      this.lastPing = now;
      this.broadcast({ type: 'ping', serverTime: now >>> 0 });
      if (this.phase === RoomPhase.Running) this.updateInputDelay();
    }
    if (this.phase === RoomPhase.Lobby && !this.fromSave) {
      for (const p of this.players) {
        if (p?.presence === Presence.Disconnected && now - p.disconnectedAt > this.t.hostChoiceAfterMs) {
          this.players[p.slot] = undefined;
          this.sendRoomState();
        }
      }
    }
    if (this.phase === RoomPhase.Running) {
      const host = this.players[this.hostSlot];
      for (const s of this.active) {
        const p = this.players[s]!;
        if (p.presence === Presence.Disconnected && now - p.disconnectedAt >= this.t.hostChoiceAfterMs && host?.conn && p.promptedHost !== this.hostSlot) {
          p.promptedHost = this.hostSlot;
          this.sendTo(host, { type: 'hostChoiceNeeded', slot: s });
        }
      }
      if (this.requests.size === 0) {
        if (this.recovering) this.requestSnapshot('desync', now);
        else if (this.players.some((p) => p?.syncing)) this.requestSnapshot('rejoin', now);
      }
    }
    if (this.emptySince >= 0 && now - this.emptySince > this.t.emptyRoomMs) this.close(CloseReason.Abandoned);
    if (this.phase === RoomPhase.Lobby && !this.players.some((p) => p && p.presence !== Presence.Reserved)) this.close(CloseReason.Abandoned);
  }

  /** Round trip in steps plus 2, at least 4 and at most 12 (technical decision 3). */
  private updateInputDelay(): void {
    let worst = 0;
    for (const s of this.active) worst = Math.max(worst, this.players[s]!.rtt);
    const stepMs = 1000 / STEPS_PER_SECOND;
    const want = Math.max(DEFAULT_INPUT_DELAY, Math.min(MAX_INPUT_DELAY, Math.ceil(worst / stepMs) + 2));
    if (want !== this.inputDelay) {
      this.inputDelay = want;
      this.broadcast({ type: 'inputDelay', steps: want }, (p) => !p.syncing);
    }
  }

  close(reason: CloseReason): void {
    if (this.phase === RoomPhase.Ended) return;
    this.phase = RoomPhase.Ended;
    this.hooks.log(`room ${this.code}: closed (${reason})`);
    this.broadcast({ type: 'roomClosed', reason });
    for (const p of this.players) {
      if (p?.conn) {
        const c = p.conn;
        p.conn = null;
        c.close(1000, 'room closed');
      }
    }
    this.hooks.closed(this);
  }
}
