// Every message on the relay WebSocket, as a binary codec. One byte of message
// tag, then the fields. Client to server tags are 1 to 99, server to client
// 100 and up, so a message sent the wrong way round is refused.

import { MAX_CHAT_LENGTH, MAX_FRAME_ORDER_BYTES, MAX_PLAYERS, MAX_SAVE_BYTES } from './constants.ts';
import { Reader, WireError, Writer } from './wire.ts';

/** The lobby, the match running in lockstep, or over. */
export const RoomPhase = { Lobby: 0, Running: 1, Ended: 2 } as const;
export type RoomPhase = (typeof RoomPhase)[keyof typeof RoomPhase];

/** A slot's connection. Reserved: a slot from a loaded save that nobody has claimed yet. Gone: left for good. */
export const Presence = { Connected: 0, Disconnected: 1, Gone: 2, Reserved: 3 } as const;
export type Presence = (typeof Presence)[keyof typeof Presence];

export const PauseReason = { None: 0, Player: 1, Disconnect: 2, Desync: 3, Rejoin: 4 } as const;
export type PauseReason = (typeof PauseReason)[keyof typeof PauseReason];

/** What the host decides when a player has been gone 30 s (Saving and disconnects). */
export const HostChoice = { Wait: 0, CarryOn: 1, SaveAndQuit: 2 } as const;
export type HostChoice = (typeof HostChoice)[keyof typeof HostChoice];

export const CloseReason = { SavedAndQuit: 0, Abandoned: 1, ServerShutdown: 2 } as const;
export type CloseReason = (typeof CloseReason)[keyof typeof CloseReason];

/** Frame flags. Leave: the relay's marker that this slot plays no more after this step (eliminated or departed). */
export const FrameFlag = { Leave: 1 } as const;

/** One player's input for one step. `orders` is the encodeOrders payload, opaque to the relay. */
export interface WireFrame {
  slot: number;
  step: number;
  flags: number;
  orders: Uint8Array;
}

export interface PlayerInfo {
  slot: number;
  name: string;
  colour: number;
  ready: boolean;
  presence: Presence;
  guest: boolean;
  /** The player's account id ('' for a guest): the host writes it into a save so each returning player gets their own place. */
  accountId: string;
}

// ---------------------------------------------------------------- client to server

export type ClientMessage =
  /** First message on a socket. `token` is a session token for clients that cannot send the cookie; '' otherwise. */
  | { type: 'hello'; version: number; token: string }
  /** Host a new game (seed, or a random one when null) or continue a saved one (saveId). */
  | { type: 'createRoom'; seed: number | null; saveId: string }
  /** Join by code. On rejoin: the token from RoomState, and the step the client's state is at (-1 if it has none). */
  | { type: 'joinRoom'; code: string; rejoinToken: string; haveStep: number }
  | { type: 'setColour'; colour: number }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startGame' }
  /** This player's orders for `step`. Frames must be sent for every step in order. */
  | { type: 'frame'; step: number; orders: Uint8Array }
  /** The state hash after `step` (every 20 steps), tagged with the snapshot epoch it was computed in. */
  | { type: 'hash'; epoch: number; step: number; hash: number }
  /** Reply to a snapshot request: a save file of the current state. */
  | { type: 'snapshot'; requestId: number; step: number; data: Uint8Array }
  | { type: 'hostChoice'; slot: number; choice: HostChoice }
  | { type: 'pause'; paused: boolean }
  | { type: 'pong'; serverTime: number }
  | { type: 'leave' }
  /** Re-identifies this socket after the player made an account mid-match. */
  | { type: 'authenticate'; token: string }
  | { type: 'chat'; text: string }
  | { type: 'mapPing'; x: number; z: number };

const C = {
  hello: 1,
  createRoom: 2,
  joinRoom: 3,
  setColour: 4,
  setReady: 5,
  startGame: 6,
  frame: 7,
  hash: 8,
  snapshot: 9,
  hostChoice: 10,
  pause: 11,
  pong: 12,
  leave: 13,
  authenticate: 14,
  chat: 15,
  mapPing: 16,
} as const;

export function encodeClient(m: ClientMessage): Uint8Array {
  const w = new Writer(m.type === 'frame' ? 16 + m.orders.length : m.type === 'snapshot' ? 16 + m.data.length : 32);
  w.u8(C[m.type]);
  switch (m.type) {
    case 'hello':
      w.u16(m.version).str(m.token);
      break;
    case 'createRoom':
      w.bool(m.seed !== null).u32(m.seed ?? 0).str(m.saveId);
      break;
    case 'joinRoom':
      w.str(m.code).str(m.rejoinToken).varint(m.haveStep);
      break;
    case 'setColour':
      w.u8(m.colour);
      break;
    case 'setReady':
      w.bool(m.ready);
      break;
    case 'startGame':
    case 'leave':
      break;
    case 'frame':
      w.u32(m.step).bytes(m.orders);
      break;
    case 'hash':
      w.u16(m.epoch).u32(m.step).u32(m.hash);
      break;
    case 'snapshot':
      w.u32(m.requestId).u32(m.step).bytes(m.data);
      break;
    case 'hostChoice':
      w.u8(m.slot).u8(m.choice);
      break;
    case 'pause':
      w.bool(m.paused);
      break;
    case 'pong':
      w.u32(m.serverTime);
      break;
    case 'authenticate':
      w.str(m.token);
      break;
    case 'chat':
      w.str(m.text);
      break;
    case 'mapPing':
      w.i32(m.x).i32(m.z);
      break;
  }
  return w.finish();
}

function hostChoice(v: number): HostChoice {
  if (v > 2) throw new WireError('bad host choice');
  return v as HostChoice;
}

export function decodeClient(bytes: Uint8Array): ClientMessage {
  const r = new Reader(bytes);
  const tag = r.u8();
  let m: ClientMessage;
  switch (tag) {
    case C.hello:
      m = { type: 'hello', version: r.u16(), token: r.str(256) };
      break;
    case C.createRoom: {
      const hasSeed = r.bool();
      const seed = r.u32();
      m = { type: 'createRoom', seed: hasSeed ? seed : null, saveId: r.str(64) };
      break;
    }
    case C.joinRoom:
      m = { type: 'joinRoom', code: r.str(32), rejoinToken: r.str(128), haveStep: r.varint() };
      break;
    case C.setColour:
      m = { type: 'setColour', colour: r.u8() };
      break;
    case C.setReady:
      m = { type: 'setReady', ready: r.bool() };
      break;
    case C.startGame:
      m = { type: 'startGame' };
      break;
    case C.frame:
      m = { type: 'frame', step: r.u32(), orders: r.bytes(MAX_FRAME_ORDER_BYTES) };
      break;
    case C.hash:
      m = { type: 'hash', epoch: r.u16(), step: r.u32(), hash: r.u32() };
      break;
    case C.snapshot:
      m = { type: 'snapshot', requestId: r.u32(), step: r.u32(), data: r.bytes(MAX_SAVE_BYTES) };
      break;
    case C.hostChoice:
      m = { type: 'hostChoice', slot: r.u8(), choice: hostChoice(r.u8()) };
      break;
    case C.pause:
      m = { type: 'pause', paused: r.bool() };
      break;
    case C.pong:
      m = { type: 'pong', serverTime: r.u32() };
      break;
    case C.leave:
      m = { type: 'leave' };
      break;
    case C.authenticate:
      m = { type: 'authenticate', token: r.str(256) };
      break;
    case C.chat:
      m = { type: 'chat', text: r.str(MAX_CHAT_LENGTH * 4) };
      break;
    case C.mapPing:
      m = { type: 'mapPing', x: r.i32(), z: r.i32() };
      break;
    default:
      throw new WireError(`unknown client message ${tag}`);
  }
  r.end();
  return m;
}

// ---------------------------------------------------------------- server to client

export interface RoomStateMessage {
  type: 'roomState';
  code: string;
  matchId: string;
  phase: RoomPhase;
  seed: number;
  /** True when the room continues a saved game: its slots are the save's players. */
  fromSave: boolean;
  hostSlot: number;
  /** This client's slot, and the token that lets it rejoin after losing the connection. */
  yourSlot: number;
  rejoinToken: string;
  players: PlayerInfo[];
}

export type ServerMessage =
  | { type: 'welcome'; version: number; name: string; accountId: string; guest: boolean }
  /** A refused request. `code` is a stable machine-readable word; `message` is for people. */
  | { type: 'error'; code: string; message: string }
  | RoomStateMessage
  /**
   * The match starts at `startStep`. `activeSlots` is a bitmask of the slots
   * playing. `snapshot` is a save file to load (a continued game), or empty
   * for a new world built from the room's seed.
   */
  | { type: 'gameStart'; startStep: number; inputDelay: number; epoch: number; activeSlots: number; snapshot: Uint8Array }
  | { type: 'frame'; frame: WireFrame }
  /** `waitingFor` is a bitmask of the slots the match is waiting on. */
  | { type: 'pauseState'; paused: boolean; reason: PauseReason; bySlot: number; waitingFor: number }
  /** Sent to the host when `slot` has been gone 30 s: wait, carry on without them, or save and quit. */
  | { type: 'hostChoiceNeeded'; slot: number }
  | { type: 'inputDelay'; steps: number }
  /** Asks this client for a save file of its current state (for a rejoin or a desync reload). */
  | { type: 'snapshotRequest'; requestId: number }
  /**
   * Replace the local state with `data` (a save file at `step`), then apply
   * `frames`. `nextFrameStep` is the first step this client still has to send
   * a frame for; frames before it are already in the relay's log.
   */
  | {
      type: 'loadSnapshot';
      epoch: number;
      step: number;
      data: Uint8Array;
      frames: WireFrame[];
      nextFrameStep: number;
      activeSlots: number;
      inputDelay: number;
    }
  /** A rejoin that keeps the client's own state: the frames it missed since `haveStep`. */
  | { type: 'resume'; epoch: number; frames: WireFrame[]; nextFrameStep: number; activeSlots: number; inputDelay: number }
  /** The relay saw different hashes at `step`; `minority` is a bitmask of the slots that disagreed. */
  | { type: 'desync'; step: number; minority: number }
  | { type: 'ping'; serverTime: number }
  | { type: 'roomClosed'; reason: CloseReason }
  | { type: 'chat'; slot: number; name: string; text: string }
  | { type: 'mapPing'; slot: number; x: number; z: number };

const S = {
  welcome: 100,
  error: 101,
  roomState: 102,
  gameStart: 103,
  frame: 104,
  pauseState: 105,
  hostChoiceNeeded: 106,
  inputDelay: 107,
  snapshotRequest: 108,
  loadSnapshot: 109,
  resume: 110,
  desync: 111,
  ping: 112,
  roomClosed: 113,
  chat: 114,
  mapPing: 115,
} as const;

function writeFrame(w: Writer, f: WireFrame): void {
  w.u8(f.slot).u8(f.flags).u32(f.step).bytes(f.orders);
}

function readFrame(r: Reader): WireFrame {
  const slot = r.u8();
  if (slot >= MAX_PLAYERS) throw new WireError('bad slot');
  return { slot, flags: r.u8(), step: r.u32(), orders: r.bytes(MAX_FRAME_ORDER_BYTES) };
}

function writeFrames(w: Writer, frames: readonly WireFrame[]): void {
  w.varuint(frames.length);
  for (const f of frames) writeFrame(w, f);
}

function readFrames(r: Reader): WireFrame[] {
  const n = r.varuint();
  const out: WireFrame[] = [];
  for (let i = 0; i < n; i++) out.push(readFrame(r));
  return out;
}

function enumValue<T extends number>(v: number, max: number, what: string): T {
  if (v > max) throw new WireError(`bad ${what}`);
  return v as T;
}

export function encodeServer(m: ServerMessage): Uint8Array {
  const w = new Writer(64);
  w.u8(S[m.type]);
  switch (m.type) {
    case 'welcome':
      w.u16(m.version).str(m.name).str(m.accountId).bool(m.guest);
      break;
    case 'error':
      w.str(m.code).str(m.message);
      break;
    case 'roomState':
      w.str(m.code).str(m.matchId).u8(m.phase).u32(m.seed).bool(m.fromSave).u8(m.hostSlot);
      w.u8(m.yourSlot).str(m.rejoinToken).u8(m.players.length);
      for (const p of m.players) w.u8(p.slot).str(p.name).u8(p.colour).bool(p.ready).u8(p.presence).bool(p.guest).str(p.accountId);
      break;
    case 'gameStart':
      w.u32(m.startStep).u8(m.inputDelay).u16(m.epoch).u8(m.activeSlots).bytes(m.snapshot);
      break;
    case 'frame':
      writeFrame(w, m.frame);
      break;
    case 'pauseState':
      w.bool(m.paused).u8(m.reason).u8(m.bySlot).u8(m.waitingFor);
      break;
    case 'hostChoiceNeeded':
      w.u8(m.slot);
      break;
    case 'inputDelay':
      w.u8(m.steps);
      break;
    case 'snapshotRequest':
      w.u32(m.requestId);
      break;
    case 'loadSnapshot':
      w.u16(m.epoch).u32(m.step).bytes(m.data);
      writeFrames(w, m.frames);
      w.u32(m.nextFrameStep).u8(m.activeSlots).u8(m.inputDelay);
      break;
    case 'resume':
      w.u16(m.epoch);
      writeFrames(w, m.frames);
      w.u32(m.nextFrameStep).u8(m.activeSlots).u8(m.inputDelay);
      break;
    case 'desync':
      w.u32(m.step).u8(m.minority);
      break;
    case 'ping':
      w.u32(m.serverTime);
      break;
    case 'roomClosed':
      w.u8(m.reason);
      break;
    case 'chat':
      w.u8(m.slot).str(m.name).str(m.text);
      break;
    case 'mapPing':
      w.u8(m.slot).i32(m.x).i32(m.z);
      break;
  }
  return w.finish();
}

export function decodeServer(bytes: Uint8Array): ServerMessage {
  const r = new Reader(bytes);
  const tag = r.u8();
  let m: ServerMessage;
  switch (tag) {
    case S.welcome:
      m = { type: 'welcome', version: r.u16(), name: r.str(), accountId: r.str(), guest: r.bool() };
      break;
    case S.error:
      m = { type: 'error', code: r.str(), message: r.str() };
      break;
    case S.roomState: {
      const code = r.str();
      const matchId = r.str();
      const phase = enumValue<RoomPhase>(r.u8(), 2, 'phase');
      const seed = r.u32();
      const fromSave = r.bool();
      const hostSlot = r.u8();
      const yourSlot = r.u8();
      const rejoinToken = r.str();
      const n = r.u8();
      const players: PlayerInfo[] = [];
      for (let i = 0; i < n; i++) {
        players.push({
          slot: r.u8(),
          name: r.str(),
          colour: r.u8(),
          ready: r.bool(),
          presence: enumValue<Presence>(r.u8(), 3, 'presence'),
          guest: r.bool(),
          accountId: r.str(),
        });
      }
      m = { type: 'roomState', code, matchId, phase, seed, fromSave, hostSlot, yourSlot, rejoinToken, players };
      break;
    }
    case S.gameStart:
      m = { type: 'gameStart', startStep: r.u32(), inputDelay: r.u8(), epoch: r.u16(), activeSlots: r.u8(), snapshot: r.bytes() };
      break;
    case S.frame:
      m = { type: 'frame', frame: readFrame(r) };
      break;
    case S.pauseState:
      m = {
        type: 'pauseState',
        paused: r.bool(),
        reason: enumValue<PauseReason>(r.u8(), 4, 'pause reason'),
        bySlot: r.u8(),
        waitingFor: r.u8(),
      };
      break;
    case S.hostChoiceNeeded:
      m = { type: 'hostChoiceNeeded', slot: r.u8() };
      break;
    case S.inputDelay:
      m = { type: 'inputDelay', steps: r.u8() };
      break;
    case S.snapshotRequest:
      m = { type: 'snapshotRequest', requestId: r.u32() };
      break;
    case S.loadSnapshot:
      m = {
        type: 'loadSnapshot',
        epoch: r.u16(),
        step: r.u32(),
        data: r.bytes(),
        frames: readFrames(r),
        nextFrameStep: r.u32(),
        activeSlots: r.u8(),
        inputDelay: r.u8(),
      };
      break;
    case S.resume:
      m = {
        type: 'resume',
        epoch: r.u16(),
        frames: readFrames(r),
        nextFrameStep: r.u32(),
        activeSlots: r.u8(),
        inputDelay: r.u8(),
      };
      break;
    case S.desync:
      m = { type: 'desync', step: r.u32(), minority: r.u8() };
      break;
    case S.ping:
      m = { type: 'ping', serverTime: r.u32() };
      break;
    case S.roomClosed:
      m = { type: 'roomClosed', reason: enumValue<CloseReason>(r.u8(), 2, 'close reason') };
      break;
    case S.chat:
      m = { type: 'chat', slot: r.u8(), name: r.str(), text: r.str() };
      break;
    case S.mapPing:
      m = { type: 'mapPing', slot: r.u8(), x: r.i32(), z: r.i32() };
      break;
    default:
      throw new WireError(`unknown server message ${tag}`);
  }
  r.end();
  return m;
}

/** Bitmask helpers for slot sets. */
export function slotMask(slots: Iterable<number>): number {
  let m = 0;
  for (const s of slots) m |= 1 << s;
  return m;
}

export function maskSlots(mask: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_PLAYERS; s++) if (mask & (1 << s)) out.push(s);
  return out;
}
