// The WebSocket side of the server: accepts sockets on /relay, signs them in
// (session cookie, or a token in the hello message, or a fresh guest name),
// creates rooms with join codes and hands every other message to the room
// the socket is in. A malformed message closes the socket.

import { randomInt, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  decodeClient,
  encodeServer,
  MAX_SAVE_BYTES,
  Presence,
  PROTOCOL_VERSION,
  RELAY_PATH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomPhase,
  WireError,
  type ClientMessage,
  type OpenRoom,
  type RoomInfo,
} from '@blockyrts/protocol';
import { guestName, type AccountService, type Identity } from '../accounts.ts';
import type { Database } from '../db/types.ts';
import type { SaveService } from '../saves.ts';
import { Room, type Conn, type RoomTimings, type Visitor } from './room.ts';

/** Rooms one address may have open at once (hosting plan: a cap on rooms per address). */
const ROOMS_PER_ADDRESS = 5;
/** A socket must say hello within this time. */
const HELLO_TIMEOUT_MS = 10_000;
/** Most lobbies the open games list shows. */
const OPEN_ROOMS_LISTED = 50;

export interface RelayOptions {
  accounts: AccountService;
  saves: SaveService;
  db: Database;
  /** Reads the session token from a request's cookie or Authorization header. */
  tokenOf: (req: IncomingMessage) => string;
  /** The player's address (behind a trusted proxy, from its header). */
  addressOf: (req: IncomingMessage) => string;
  /** Origins allowed to open a socket; empty allows any. */
  allowedOrigins: string[];
  now?: () => number;
  log?: (message: string) => void;
  timings?: Partial<RoomTimings>;
}

interface Client extends Conn {
  ws: WebSocket;
  address: string;
  room: Room | null;
  ready: boolean;
  /** Messages are handled one at a time per socket, in order, even when one needs the database. */
  queue: Promise<void>;
}

export class Relay {
  readonly rooms = new Map<string, Room>();
  private readonly byMatch = new Map<string, Room>();
  private readonly roomAddress = new Map<Room, string>();
  private readonly wss: WebSocketServer;
  private readonly opts: RelayOptions;
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  private readonly timer: NodeJS.Timeout;
  private nextConnId = 1;
  private readonly clients = new Set<Client>();

  constructor(opts: RelayOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(m));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_SAVE_BYTES + 4096 });
    // Often enough for a held frame's short wait (room.ts, FRAME_HOLD_MS).
    this.timer = setInterval(() => this.tick(), 50);
    this.timer.unref();
  }

  /** The account hosting the live room of a match, for save permission. */
  hostAccountOf(matchId: string): string | null {
    return this.byMatch.get(matchId)?.hostAccountId ?? null;
  }

  /** What an invite link resolves to. */
  roomInfo(code: string): RoomInfo | null {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return null;
    return {
      code: room.code,
      phase: room.phase === RoomPhase.Lobby ? 'lobby' : room.phase === RoomPhase.Running ? 'running' : 'ended',
      hostName: room.hostName,
      players: room.players.filter((p) => p).length,
      openSlots: room.openSlots,
      fromSave: room.fromSave,
    };
  }

  /**
   * The lobbies waiting for players, for the Join game list (Jade, Patch 5):
   * public games first, then private ones without their codes, newest first
   * within each. Full and running games, and games the host kicked this
   * visitor from, are left out.
   */
  openRooms(visitor: Visitor): OpenRoom[] {
    const rooms = [...this.rooms.values()].filter((r) => r.phase === RoomPhase.Lobby && r.openSlots > 0 && !r.bans(visitor));
    rooms.sort((a, b) => Number(a.isPrivate) - Number(b.isPrivate) || b.openedAt - a.openedAt);
    return rooms.slice(0, OPEN_ROOMS_LISTED).map((r) => ({
      code: r.isPrivate ? '' : r.code,
      hostName: r.hostName,
      players: r.players.filter((p) => p && p.presence !== Presence.Reserved && p.presence !== Presence.Gone).length,
      openSlots: r.openSlots,
      private: r.isPrivate,
      fromSave: r.fromSave,
    }));
  }

  /** For the HTTP server's 'upgrade' event. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== RELAY_PATH) {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (this.opts.allowedOrigins.length > 0 && origin && !this.opts.allowedOrigins.includes(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, req));
  }

  private accept(ws: WebSocket, req: IncomingMessage): void {
    const cookieToken = this.opts.tokenOf(req);
    const client: Client = {
      id: this.nextConnId++,
      ws,
      address: this.opts.addressOf(req),
      identity: { tokenHash: '', account: null, name: guestName() },
      debugger: false,
      room: null,
      ready: false,
      queue: Promise.resolve(),
      send: (bytes) => {
        if (ws.readyState === ws.OPEN) ws.send(bytes);
      },
      close: (code, reason) => ws.close(code, reason),
    };
    this.clients.add(client);
    const helloTimer = setTimeout(() => {
      if (!client.ready) ws.close(4002, 'no hello');
    }, HELLO_TIMEOUT_MS);
    ws.on('message', (data: RawData, isBinary: boolean) => {
      client.queue = client.queue
        .then(() => this.onMessage(client, data, isBinary, cookieToken))
        .catch((e: unknown) => {
          this.log(`relay: socket ${client.id} failed: ${(e as Error).stack ?? String(e)}`);
          ws.close(1011, 'server error');
        });
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      this.clients.delete(client);
      client.room?.disconnect(client, this.now());
    });
    ws.on('error', () => ws.terminate());
  }

  private async onMessage(c: Client, data: RawData, isBinary: boolean, cookieToken: string): Promise<void> {
    if (!isBinary) return this.refuse(c, 'Only binary messages are accepted.');
    // A view, not a copy: the decoder copies out the few bytes it keeps (a frame's orders, a snapshot).
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let msg: ClientMessage;
    try {
      msg = decodeClient(bytes);
    } catch (e) {
      if (e instanceof WireError) return this.refuse(c, e.message);
      throw e;
    }
    if (!c.ready) {
      if (msg.type !== 'hello') return this.refuse(c, 'The first message must be hello.');
      if (msg.version !== PROTOCOL_VERSION) {
        c.send(encodeServer({ type: 'error', code: 'version', message: 'This game needs updating: reload the page.' }));
        c.ws.close(4003, 'protocol version');
        return;
      }
      const who = (await this.opts.accounts.identify(msg.token || cookieToken)) ?? c.identity;
      c.identity = who;
      c.debugger = this.opts.accounts.canDebug(who);
      c.ready = true;
      c.send(encodeServer({ type: 'welcome', version: PROTOCOL_VERSION, name: who.name, accountId: who.account?.id ?? '', guest: who.account === null, debugger: c.debugger }));
      return;
    }
    const now = this.now();
    switch (msg.type) {
      case 'hello':
        return this.refuse(c, 'Already said hello.');
      case 'createRoom':
        return this.createRoom(c, msg.seed, msg.saveId, msg.private, now);
      case 'joinRoom': {
        if (c.room) return this.error(c, 'in_room', 'Leave your current game first.');
        const room = this.rooms.get(msg.code.trim().toUpperCase());
        if (!room) return this.error(c, 'no_room', 'No game has that code.');
        if (room.join(c, msg, now)) c.room = room;
        return;
      }
      case 'authenticate': {
        const who = await this.opts.accounts.identify(msg.token);
        if (!who) return this.error(c, 'bad_token', 'That session has expired; sign in again.');
        c.identity = who;
        c.debugger = this.opts.accounts.canDebug(who);
        c.room?.identityChanged(c);
        c.send(encodeServer({ type: 'welcome', version: PROTOCOL_VERSION, name: who.name, accountId: who.account?.id ?? '', guest: who.account === null, debugger: c.debugger }));
        return;
      }
      default:
        if (!c.room) return this.error(c, 'not_in_room', 'Join a game first.');
        c.room.handle(c, msg, now);
        if (msg.type === 'leave') c.room = null;
    }
  }

  private async createRoom(c: Client, seed: number | null, saveId: string, isPrivate: boolean, now: number): Promise<void> {
    if (c.room) return this.error(c, 'in_room', 'Leave your current game first.');
    let open = 0;
    for (const a of this.roomAddress.values()) if (a === c.address) open++;
    if (open >= ROOMS_PER_ADDRESS) return this.error(c, 'too_many_rooms', 'You already host several games.');
    let matchId: string;
    let roomSeed: number;
    let save: Uint8Array | null = null;
    if (saveId) {
      let loaded;
      try {
        loaded = await this.opts.saves.load(c.identity, saveId);
      } catch (e) {
        return this.error(c, 'no_save', (e as Error).message);
      }
      matchId = loaded.row.matchId;
      roomSeed = loaded.row.seed;
      save = loaded.data;
      if (this.byMatch.has(matchId)) return this.error(c, 'already_hosted', 'That game is already open.');
    } else {
      matchId = randomUUID();
      roomSeed = seed ?? randomInt(0, 0x100000000);
      await this.opts.db.createMatch({ id: matchId, ownerAccountId: c.identity.account?.id ?? null, seed: roomSeed, createdAt: new Date(now) });
    }
    let room: Room;
    try {
      room = new Room({
        code: this.newCode(),
        matchId,
        seed: roomSeed,
        save,
        isPrivate,
        now,
        ...(this.opts.timings ? { timings: this.opts.timings } : {}),
        hooks: {
          setMatchOwner: (id, account) => {
            this.opts.db.setMatchOwner(id, account).catch((e: unknown) => this.log(`relay: could not set match owner: ${String(e)}`));
          },
          closed: (r) => this.forget(r),
          log: this.log,
        },
      });
    } catch (e) {
      if (e instanceof WireError) return this.error(c, 'bad_save', e.message);
      throw e;
    }
    this.rooms.set(room.code, room);
    this.byMatch.set(matchId, room);
    this.roomAddress.set(room, c.address);
    if (room.create(c, now)) {
      c.room = room;
      this.log(`relay: room ${room.code} opened by ${c.identity.name}${save ? ' from a save' : ''}${isPrivate ? ' (private)' : ''}`);
    } else {
      this.forget(room);
    }
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(0, ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private forget(room: Room): void {
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    if (this.byMatch.get(room.matchId) === room) this.byMatch.delete(room.matchId);
    this.roomAddress.delete(room);
    for (const c of this.clients) if (c.room === room) c.room = null;
  }

  private error(c: Client, code: string, message: string): void {
    c.send(encodeServer({ type: 'error', code, message }));
  }

  private refuse(c: Client, message: string): void {
    c.send(encodeServer({ type: 'error', code: 'bad_message', message }));
    c.ws.close(4004, 'bad message');
  }

  private tick(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) room.tick(now);
  }

  /** Tells everyone the server is going away and closes every socket. */
  async close(): Promise<void> {
    clearInterval(this.timer);
    for (const room of [...this.rooms.values()]) room.close(2);
    for (const c of this.clients) c.ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }
}

export type { Identity };
