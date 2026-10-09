// The HTTP API for accounts, saves and invite links. Plain JSON over HTTPS
// (it is not on the lockstep hot path); save files travel as raw bytes with
// Content-Type application/octet-stream. Requests are authenticated by the
// session cookie, or by "Authorization: Bearer <token>" for clients without
// cookies (the headless test client).

/** Every route, so client and server spell them the same way. */
export const ApiRoutes = {
  /** POST { email, username, password } -> SessionResponse. Upgrades a guest session. */
  accounts: '/api/accounts',
  /** POST { login, password } -> SessionResponse (login); DELETE -> 204 (logout). */
  sessions: '/api/sessions',
  /** POST -> SessionResponse for a new guest. */
  guests: '/api/guests',
  /** GET -> MeResponse. */
  me: '/api/me',
  /** POST { email } -> 202 always, so it never reveals whether an address has an account; 503 email_not_configured on a server without email. */
  passwordResets: '/api/password-resets',
  /** POST { token, password } -> 204, or 400 reset_invalid when the link is used or expired. */
  passwordResetConfirm: '/api/password-resets/confirm',
  /** POST { seed } -> { matchId } for a single-player game (multiplayer matches are made by the relay). */
  matches: '/api/matches',
  /** POST save file bytes -> SaveSummary. `kind` query: manual (default) or autosave. */
  matchSaves: (matchId: string): string => `/api/matches/${encodeURIComponent(matchId)}/saves`,
  /** POST save file bytes -> SaveSummary: the dawn autosave hook, keeps the newest three per match. */
  matchAutosave: (matchId: string): string => `/api/matches/${encodeURIComponent(matchId)}/autosave`,
  /** GET -> { saves: SaveSummary[] }, newest first. */
  saves: '/api/saves',
  /** GET -> save file bytes; DELETE -> 204. */
  save: (saveId: string): string => `/api/saves/${encodeURIComponent(saveId)}`,
  /** GET -> RoomInfo: what an invite link /join/<code> resolves to. */
  room: (code: string): string => `/api/rooms/${encodeURIComponent(code)}`,
  /** GET -> { rooms: OpenRoom[] }: the lobbies waiting for players, public first (Patch 5). */
  rooms: '/api/rooms',
  health: '/healthz',
} as const;

export interface AccountInfo {
  id: string;
  email: string;
  username: string;
}

export interface SessionResponse {
  /** Null for a guest session. */
  account: AccountInfo | null;
  /** The in-game name: the username, or "Guest 4821". */
  name: string;
  /** This account may open the debugger (Patch 5: only the admin accounts; the server decides). */
  debugger: boolean;
  /**
   * The session token (also set as the httpOnly cookie). A browser presents it
   * on an open relay socket with the authenticate message after a guest makes
   * an account mid-match; otherwise the cookie does the work.
   */
  token: string;
}

export interface MeResponse {
  account: AccountInfo | null;
  name: string | null;
  guest: boolean;
  /** This account may open the debugger (Patch 5). */
  debugger: boolean;
}

export interface SavePlayerSummary {
  slot: number;
  name: string;
  colour: number;
}

export interface SaveSummary {
  id: string;
  matchId: string;
  kind: 'manual' | 'autosave';
  label: string;
  night: number;
  step: number;
  seed: number;
  players: SavePlayerSummary[];
  sizeBytes: number;
  /** ISO 8601; the Load screen's "last played". */
  createdAt: string;
  /**
   * From an older version of the game than the live one (Patch 5): its file
   * is gone from the server, and the Load screen shows it greyed out until
   * its owner acknowledges it, which deletes it for good.
   */
  outdated: boolean;
}

export interface RoomInfo {
  code: string;
  phase: 'lobby' | 'running' | 'ended';
  hostName: string;
  players: number;
  /** Open slots a newcomer could take (0 once running: only the match's own players may rejoin). */
  openSlots: number;
  fromSave: boolean;
}

/** A lobby in the Join game list (Patch 5): public games first, then private ones, whose code is not shown. */
export interface OpenRoom {
  /** The join code, or '' for a private game (a player needs the code from its host). */
  code: string;
  hostName: string;
  players: number;
  /** Places a newcomer could take. */
  openSlots: number;
  private: boolean;
  /** A continued saved game: only its own players' places are open. */
  fromSave: boolean;
}

/** Error body for every 4xx and 5xx: a stable code and a sentence for people. */
export interface ApiError {
  error: string;
  message: string;
}

/** The error codes the API returns. */
export const ApiErrorCode = {
  BadRequest: 'bad_request',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  EmailTaken: 'email_taken',
  UsernameTaken: 'username_taken',
  InvalidEmail: 'invalid_email',
  InvalidUsername: 'invalid_username',
  WeakPassword: 'weak_password',
  BadCredentials: 'bad_credentials',
  ResetInvalid: 'reset_invalid',
  /** A guest tried to save: the client offers to make an account (Accounts and guests). */
  GuestMustRegister: 'guest_must_register',
  BadSave: 'bad_save',
  /** A save from an older version of the game than the live one (Patch 5). */
  SaveOutdated: 'save_outdated',
  SaveTooLarge: 'save_too_large',
  QuotaExceeded: 'quota_exceeded',
  RateLimited: 'rate_limited',
  /** The server has no email service: password resets are done by its admin. */
  EmailNotConfigured: 'email_not_configured',
} as const;

/** Account rules: usernames are 3 to 20 letters, digits, _ or -, and may not pose as a guest. */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
export const PASSWORD_RESET_MINUTES = 30;
