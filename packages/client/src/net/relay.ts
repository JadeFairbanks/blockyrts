// The relay WebSocket from the page (technical decision 3): the lobby, then
// the match's frames. When the connection drops it tries again by itself and
// rejoins its room with the rejoin token, telling the relay which step the
// game here is at so it can send only what was missed.
import {
  decodeServer,
  encodeClient,
  PROTOCOL_VERSION,
  RoomPhase,
  type ClientMessage,
  type RoomStateMessage,
  type ServerMessage,
} from '@blockyrts/protocol';
import { relayUrl } from './api.ts';

/** The socket's state, for the lobby and the pause overlay. */
export type RelayStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** A refused request or a lost connection while waiting for an answer. */
export class RelayFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Waits between reconnect tries, in milliseconds; the last repeats. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];
/** Gives up after this long without a connection (the host's choice runs out long before). */
const GIVE_UP_MS = 5 * 60_000;

export class RelayClient {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<(m: ServerMessage) => void>();
  private readonly statusListeners = new Set<(s: RelayStatus) => void>();
  private wanted = true;
  private held: ServerMessage[] | null = null;
  private tries = 0;
  private downSince = 0;
  status: RelayStatus = 'connecting';
  /** Who the relay says this page is. */
  me = { name: '', accountId: '', guest: true, debugger: false };
  /** The room, as the relay last described it. */
  room: RoomStateMessage | null = null;
  /** The step the game here is at, for a rejoin (-1 before a match starts). */
  haveStep: () => number = () => -1;

  constructor(
    private token: string,
    private readonly url = relayUrl(),
  ) {}

  /** Opens the socket and says hello; resolves on the relay's welcome. */
  async connect(): Promise<void> {
    this.wanted = true;
    await this.open();
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let welcomed = false;
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => ws.send(encodeClient({ type: 'hello', version: PROTOCOL_VERSION, token: this.token }));
      ws.onmessage = (ev: MessageEvent) => {
        let m: ServerMessage;
        try {
          m = decodeServer(new Uint8Array(ev.data as ArrayBuffer));
        } catch {
          return; // a newer server's message this page cannot read
        }
        if (m.type === 'welcome' && !welcomed) {
          welcomed = true;
          this.me = { name: m.name, accountId: m.accountId, guest: m.guest, debugger: m.debugger };
          this.tries = 0;
          this.setStatus('open');
          resolve();
        }
        this.dispatch(m);
      };
      ws.onerror = () => {
        if (!welcomed) reject(new RelayFailure('offline', 'The game server cannot be reached. Check your connection, then try again.'));
      };
      ws.onclose = (ev: CloseEvent) => {
        if (this.ws !== ws) return;
        console.warn(`relay connection closed (${ev.code} ${ev.reason})`);
        this.ws = null;
        if (!welcomed) reject(new RelayFailure('offline', 'The game server closed the connection.'));
        this.lost();
      };
    });
  }

  private dispatch(m: ServerMessage): void {
    if (m.type === 'ping') this.send({ type: 'pong', serverTime: m.serverTime });
    if (m.type === 'roomState') {
      this.room = m;
      rememberRejoin(m.code, m.rejoinToken);
    }
    if (m.type === 'roomClosed') this.wanted = false;
    this.deliver(m);
  }

  /** To the listeners, or kept back while holding. */
  private deliver(m: ServerMessage): void {
    if (this.held) this.held.push(m);
    else for (const f of [...this.listeners]) f(m);
  }

  /** Keeps messages back (between the lobby and the match being ready for them). */
  hold(): void {
    this.held ??= [];
  }

  /** Stops holding: what was kept back goes to the listeners now, in order; if one of them holds again, the rest waits. */
  release(): void {
    const h = this.held ?? [];
    this.held = null;
    for (const m of h) this.deliver(m);
  }

  /** The connection dropped: try again, and rejoin the room if there is one. */
  private lost(): void {
    if (!this.wanted) {
      this.setStatus('closed');
      return;
    }
    if (this.status !== 'reconnecting') this.downSince = performance.now();
    this.setStatus('reconnecting');
    if (performance.now() - this.downSince > GIVE_UP_MS) {
      this.wanted = false;
      this.setStatus('closed');
      return;
    }
    const wait = RETRY_MS[Math.min(this.tries, RETRY_MS.length - 1)]!;
    this.tries++;
    setTimeout(() => {
      if (!this.wanted) return;
      this.open()
        .then(() => {
          const r = this.room;
          if (r && r.phase !== RoomPhase.Ended) this.send({ type: 'joinRoom', code: r.code, rejoinToken: r.rejoinToken, haveStep: r.phase === RoomPhase.Running ? this.haveStep() : -1 });
        })
        .catch(() => undefined); // onclose follows and tries again
    }, wait);
  }

  private setStatus(s: RelayStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const f of [...this.statusListeners]) f(s);
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeClient(m));
  }

  /** Every message from the relay; returns the unsubscribe. */
  on(f: (m: ServerMessage) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  onStatus(f: (s: RelayStatus) => void): () => void {
    this.statusListeners.add(f);
    return () => this.statusListeners.delete(f);
  }

  /** The next message matching `pred`; an error message from the relay fails it. */
  waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs = 15_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const done = (): void => {
        off();
        offStatus();
        clearTimeout(timer);
      };
      const off = this.on((m) => {
        if (pred(m)) {
          done();
          resolve(m);
        } else if (m.type === 'error') {
          done();
          reject(new RelayFailure(m.code, m.message));
        }
      });
      const offStatus = this.onStatus((s) => {
        if (s === 'closed') {
          done();
          reject(new RelayFailure('offline', 'The connection to the game server was lost.'));
        }
      });
      const timer = setTimeout(() => {
        done();
        reject(new RelayFailure('timeout', 'The game server did not answer.'));
      }, timeoutMs);
    });
  }

  /** Hosts a new game (seed) or continues a saved one (saveId), public or private; resolves with the room. */
  host(seed: number | null, saveId = '', isPrivate = false): Promise<RoomStateMessage> {
    this.send({ type: 'createRoom', seed, saveId, private: isPrivate });
    return this.waitFor((m): m is RoomStateMessage => m.type === 'roomState');
  }

  /** Joins a room by its code; a page reloaded mid-match takes its old place back with the token it kept. */
  join(code: string): Promise<RoomStateMessage> {
    this.send({ type: 'joinRoom', code, rejoinToken: rejoinTokenFor(code), haveStep: -1 });
    return this.waitFor((m): m is RoomStateMessage => m.type === 'roomState');
  }

  /** Re-identifies the socket after the player made an account or signed in. */
  authenticate(token: string): void {
    this.token = token;
    this.send({ type: 'authenticate', token });
  }

  /** Leaves the room for good and closes the socket. */
  leave(): void {
    this.send({ type: 'leave' });
    this.close();
  }

  close(): void {
    this.wanted = false;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setStatus('closed');
  }
}

// A page reloaded during a match (or a closed tab opened again) rejoins with
// the token the relay gave it for that room, kept for this tab only.
const REJOIN_KEY = 'survive-and-conquer.rejoin.';

function rememberRejoin(code: string, token: string): void {
  try {
    sessionStorage.setItem(REJOIN_KEY + code, token);
  } catch {
    // Storage blocked: a reload joins as someone new.
  }
}

function rejoinTokenFor(code: string): string {
  try {
    return sessionStorage.getItem(REJOIN_KEY + code) ?? '';
  } catch {
    return '';
  }
}
