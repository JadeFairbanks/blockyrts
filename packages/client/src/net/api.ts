// The game server's HTTP API from the page (Accounts and guests; Saving and
// disconnects): sessions, accounts, password resets, save slots and invite
// codes. The session token is kept in localStorage and sent as a Bearer
// token, so it works whether or not the browser lets the server's cookie
// through; the relay gets the same token in its hello.
import {
  ApiRoutes,
  RELAY_PATH,
  type AccountInfo,
  type ApiError,
  type MeResponse,
  type RoomInfo,
  type SaveSummary,
  type SessionResponse,
} from '@blockyrts/protocol';

const TOKEN_KEY = 'survive-and-conquer.session';
const OFFLINE = 'The game server cannot be reached. Check your connection; playing alone still works.';

/**
 * Where the server is: the build's VITE_SERVER_URL (the live site's
 * https://api.<domain>), else this page's own origin (the dev server
 * proxies /api and /relay to a local game server on port 8080).
 */
export function serverUrl(): string {
  const env = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  return (env || location.origin).replace(/\/+$/, '');
}

/** The relay's WebSocket address. */
export function relayUrl(base = serverUrl()): string {
  return base.replace(/^http/, 'ws') + RELAY_PATH;
}

/** A refused request: the API's error code and its sentence for people. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Who is signed in: an account, or a guest ("Guest 4821"). */
export interface Identity {
  name: string;
  account: AccountInfo | null;
}

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(t: string): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the session lasts until the page closes.
  }
}

export class Api {
  token = readToken();
  /** Who this page is signed in as, once known. */
  me: Identity | null = null;
  private readonly listeners = new Set<(me: Identity | null) => void>();

  constructor(readonly base = serverUrl()) {}

  /** Called whenever the signed-in player changes. */
  onChange(f: (me: Identity | null) => void): void {
    this.listeners.add(f);
  }

  private setSession(s: SessionResponse): Identity {
    this.token = s.token;
    writeToken(s.token);
    this.me = { name: s.name, account: s.account };
    for (const f of this.listeners) f(this.me);
    return this.me;
  }

  private async request<T>(method: string, path: string, body?: object | Uint8Array): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) {
      headers['Content-Type'] = 'application/octet-stream';
      payload = body as Uint8Array<ArrayBuffer>;
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers, body: payload ?? null, credentials: 'include' });
    } catch {
      throw new ApiFailure(0, 'offline', OFFLINE);
    }
    if (res.status === 204 || res.status === 202) return undefined as T;
    if (!res.ok) {
      let err: Partial<ApiError> = {};
      try {
        err = (await res.json()) as ApiError;
      } catch {
        // Not JSON: a proxy's error page.
      }
      if (!err.error && res.status >= 502) throw new ApiFailure(0, 'offline', OFFLINE);
      throw new ApiFailure(res.status, err.error ?? 'server_error', err.message ?? `The server answered ${res.status}.`);
    }
    if ((res.headers.get('Content-Type') ?? '').startsWith('application/octet-stream')) return new Uint8Array(await res.arrayBuffer()) as T;
    return (await res.json()) as T;
  }

  /** Who the stored session is, or a new guest session when there is none. */
  async ensureSession(): Promise<Identity> {
    if (this.token) {
      const me = await this.request<MeResponse>('GET', ApiRoutes.me);
      if (me.name) {
        this.me = { name: me.name, account: me.account };
        for (const f of this.listeners) f(this.me);
        return this.me;
      }
    }
    return this.setSession(await this.request<SessionResponse>('POST', ApiRoutes.guests));
  }

  /** Makes an account; a guest session becomes the account (a guest mid-match keeps their place). */
  async register(email: string, username: string, password: string): Promise<Identity> {
    return this.setSession(await this.request<SessionResponse>('POST', ApiRoutes.accounts, { email, username, password }));
  }

  async signIn(login: string, password: string): Promise<Identity> {
    return this.setSession(await this.request<SessionResponse>('POST', ApiRoutes.sessions, { login, password }));
  }

  /** Signs out; the page carries on as a new guest. */
  async signOut(): Promise<Identity> {
    try {
      await this.request('DELETE', ApiRoutes.sessions);
    } catch {
      // Gone already: forget it here anyway.
    }
    this.token = '';
    writeToken('');
    return this.ensureSession();
  }

  requestReset(email: string): Promise<void> {
    return this.request('POST', ApiRoutes.passwordResets, { email });
  }

  confirmReset(token: string, password: string): Promise<void> {
    return this.request('POST', ApiRoutes.passwordResetConfirm, { token, password });
  }

  /** A new single-player match under this account, for its saves. */
  async createMatch(seed: number): Promise<string> {
    return (await this.request<{ matchId: string }>('POST', ApiRoutes.matches, { seed })).matchId;
  }

  uploadSave(matchId: string, data: Uint8Array, autosave: boolean): Promise<SaveSummary> {
    return this.request('POST', autosave ? ApiRoutes.matchAutosave(matchId) : ApiRoutes.matchSaves(matchId), data);
  }

  async listSaves(): Promise<SaveSummary[]> {
    return (await this.request<{ saves: SaveSummary[] }>('GET', ApiRoutes.saves)).saves;
  }

  loadSave(id: string): Promise<Uint8Array> {
    return this.request('GET', ApiRoutes.save(id));
  }

  deleteSave(id: string): Promise<void> {
    return this.request('DELETE', ApiRoutes.save(id));
  }

  room(code: string): Promise<RoomInfo> {
    return this.request('GET', ApiRoutes.room(code));
  }
}

/** The invite link for a room code: /join/<code> on this page's site. */
export function inviteLink(code: string): string {
  return `${location.origin}/join/${code}`;
}

/** A join code typed or linked: case-insensitive, spaces and dashes dropped, or the code out of a pasted invite link. */
export function normaliseCode(text: string): string {
  const t = text.trim();
  const link = /\/join\/([A-Za-z0-9-]+)/.exec(t);
  return (link ? link[1]! : t).toUpperCase().replace(/[\s-]/g, '');
}

/** The code in an invite link: /join/<code>, or ?join=<code>. */
export function joinCodeOf(path: string, search: string): string | null {
  const m = /^\/join\/([A-Za-z0-9-]{1,32})\/?$/.exec(path);
  if (m) return m[1]!;
  return new URLSearchParams(search).get('join');
}
