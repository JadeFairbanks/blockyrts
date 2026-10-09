// The storage interface for accounts, sessions, password resets, matches and
// save metadata. Two implementations: PostgreSQL for real servers and an
// in-memory one for tests and quick local runs. Save bytes live in a
// BlobStore, never in the database (technical decision 9).

export interface AccountRow {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface SessionRow {
  /** SHA-256 of the token, hex. The token itself is never stored. */
  tokenHash: string;
  /** Null for a guest session. */
  accountId: string | null;
  /** "Guest 4821" for a guest session, null for an account. */
  guestName: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface ResetRow {
  tokenHash: string;
  accountId: string;
  expiresAt: Date;
}

export interface MatchRow {
  id: string;
  /** Null while the match belongs to a guest host: it cannot be saved until they make an account. */
  ownerAccountId: string | null;
  seed: number;
  createdAt: Date;
}

export interface SaveRow {
  id: string;
  matchId: string;
  /** Whose account the save counts against: the match owner (a multiplayer save is the host's). */
  accountId: string;
  kind: 'manual' | 'autosave';
  label: string;
  night: number;
  step: number;
  seed: number;
  players: Array<{ slot: number; name: string; colour: number; accountId: string }>;
  sizeBytes: number;
  formatVersion: number;
  blobKey: string;
  createdAt: Date;
}

/** An email to every account (Patch 5): where one named message stands for one account. */
export interface MailRecord {
  accountId: string;
  /** 'sending' is left behind when a run stops part-way: the message may have gone, so it is never sent again. */
  state: 'sending' | 'sent';
}

/** Thrown by createAccount when the email or username is already taken. */
export class DuplicateError extends Error {
  readonly field: 'email' | 'username';

  constructor(field: 'email' | 'username') {
    super(`${field} already taken`);
    this.field = field;
    this.name = 'DuplicateError';
  }
}

export interface Database {
  createAccount(row: AccountRow): Promise<void>;
  findAccountById(id: string): Promise<AccountRow | null>;
  /** Case-insensitive match on email or username. */
  findAccountByLogin(login: string): Promise<AccountRow | null>;
  setPasswordHash(accountId: string, hash: string): Promise<void>;
  /** Every account, oldest first (an email to every account, Patch 5). */
  listAccounts(): Promise<AccountRow[]>;

  /** The accounts a named message was sent, or was being sent, to. */
  mailRecords(name: string): Promise<MailRecord[]>;
  /** Marks a named message as being sent to an account; false if it already was or has been. Atomic. */
  claimMail(name: string, accountId: string, now: Date): Promise<boolean>;
  /** After claimMail: sent marks it sent; not sent removes the mark, so a later run tries again. */
  settleMail(name: string, accountId: string, sent: boolean, now: Date): Promise<void>;

  createSession(row: SessionRow): Promise<void>;
  /** The session if it exists and has not expired at `now`. */
  findSession(tokenHash: string, now: Date): Promise<SessionRow | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForAccount(accountId: string): Promise<void>;

  createReset(row: ResetRow): Promise<void>;
  /** Marks the reset used and returns its account, if it exists, is unused and has not expired. Atomic. */
  consumeReset(tokenHash: string, now: Date): Promise<string | null>;

  createMatch(row: MatchRow): Promise<void>;
  findMatch(id: string): Promise<MatchRow | null>;
  setMatchOwner(id: string, accountId: string): Promise<void>;

  insertSave(row: SaveRow): Promise<void>;
  findSave(id: string): Promise<SaveRow | null>;
  /** An account's saves, newest first. */
  listSaves(accountId: string): Promise<SaveRow[]>;
  /** A match's saves of one kind, newest first. */
  listMatchSaves(matchId: string, kind: SaveRow['kind']): Promise<SaveRow[]>;
  deleteSave(id: string): Promise<void>;
  totalSaveBytes(accountId: string): Promise<number>;
  /** Saves of an older format than `formatVersion` whose files are still stored (Patch 5), oldest first, at most `limit`. */
  outdatedSaves(formatVersion: number, limit: number): Promise<SaveRow[]>;
  /** A save's file was removed: no file and no size against the quota; the row stays until its owner acknowledges it (Patch 5). */
  expireSave(id: string): Promise<void>;

  close(): Promise<void>;
}
