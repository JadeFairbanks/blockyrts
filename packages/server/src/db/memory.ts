// In-memory Database for tests and for running the server with no PostgreSQL.
// Everything is lost when the process stops.

import { DuplicateError, type AccountRow, type Database, type MailRecord, type MatchRow, type ResetRow, type SaveRow, type SessionRow } from './types.ts';

interface ResetEntry extends ResetRow {
  used: boolean;
}

const copy = <T>(v: T): T => structuredClone(v);

export class MemoryDatabase implements Database {
  private readonly accounts = new Map<string, AccountRow>();
  private readonly sessions = new Map<string, SessionRow>();
  private readonly resets = new Map<string, ResetEntry>();
  private readonly matches = new Map<string, MatchRow>();
  private readonly saves = new Map<string, SaveRow>();
  /** Keyed by message name and account id. */
  private readonly mail = new Map<string, MailRecord & { name: string }>();

  async createAccount(row: AccountRow): Promise<void> {
    for (const a of this.accounts.values()) {
      if (a.email.toLowerCase() === row.email.toLowerCase()) throw new DuplicateError('email');
      if (a.username.toLowerCase() === row.username.toLowerCase()) throw new DuplicateError('username');
    }
    this.accounts.set(row.id, copy(row));
  }

  async findAccountById(id: string): Promise<AccountRow | null> {
    const a = this.accounts.get(id);
    return a ? copy(a) : null;
  }

  async findAccountByLogin(login: string): Promise<AccountRow | null> {
    const l = login.toLowerCase();
    for (const a of this.accounts.values()) {
      if (a.email.toLowerCase() === l || a.username.toLowerCase() === l) return copy(a);
    }
    return null;
  }

  async setPasswordHash(accountId: string, hash: string): Promise<void> {
    const a = this.accounts.get(accountId);
    if (a) a.passwordHash = hash;
  }

  async listAccounts(): Promise<AccountRow[]> {
    return [...this.accounts.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1))
      .map(copy);
  }

  async mailRecords(name: string): Promise<MailRecord[]> {
    return [...this.mail.values()].filter((m) => m.name === name).map((m) => ({ accountId: m.accountId, state: m.state }));
  }

  async claimMail(name: string, accountId: string, _now: Date): Promise<boolean> {
    const key = `${name}\n${accountId}`;
    if (this.mail.has(key)) return false;
    this.mail.set(key, { name, accountId, state: 'sending' });
    return true;
  }

  async settleMail(name: string, accountId: string, sent: boolean, _now: Date): Promise<void> {
    const key = `${name}\n${accountId}`;
    const m = this.mail.get(key);
    if (!m) return;
    if (sent) m.state = 'sent';
    else this.mail.delete(key);
  }

  async createSession(row: SessionRow): Promise<void> {
    this.sessions.set(row.tokenHash, copy(row));
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionRow | null> {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expiresAt <= now) return null;
    return copy(s);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteSessionsForAccount(accountId: string): Promise<void> {
    for (const [k, s] of this.sessions) if (s.accountId === accountId) this.sessions.delete(k);
  }

  async createReset(row: ResetRow): Promise<void> {
    this.resets.set(row.tokenHash, { ...copy(row), used: false });
  }

  async consumeReset(tokenHash: string, now: Date): Promise<string | null> {
    const r = this.resets.get(tokenHash);
    if (!r || r.used || r.expiresAt <= now) return null;
    r.used = true;
    return r.accountId;
  }

  async createMatch(row: MatchRow): Promise<void> {
    this.matches.set(row.id, copy(row));
  }

  async findMatch(id: string): Promise<MatchRow | null> {
    const m = this.matches.get(id);
    return m ? copy(m) : null;
  }

  async setMatchOwner(id: string, accountId: string): Promise<void> {
    const m = this.matches.get(id);
    if (m) m.ownerAccountId = accountId;
  }

  async insertSave(row: SaveRow): Promise<void> {
    this.saves.set(row.id, copy(row));
  }

  async findSave(id: string): Promise<SaveRow | null> {
    const s = this.saves.get(id);
    return s ? copy(s) : null;
  }

  private sorted(filter: (s: SaveRow) => boolean): SaveRow[] {
    return [...this.saves.values()]
      .filter(filter)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map(copy);
  }

  async listSaves(accountId: string): Promise<SaveRow[]> {
    return this.sorted((s) => s.accountId === accountId);
  }

  async listMatchSaves(matchId: string, kind: SaveRow['kind']): Promise<SaveRow[]> {
    return this.sorted((s) => s.matchId === matchId && s.kind === kind);
  }

  async deleteSave(id: string): Promise<void> {
    this.saves.delete(id);
  }

  async totalSaveBytes(accountId: string): Promise<number> {
    let total = 0;
    for (const s of this.saves.values()) if (s.accountId === accountId) total += s.sizeBytes;
    return total;
  }

  async outdatedSaves(formatVersion: number, limit: number): Promise<SaveRow[]> {
    return this.sorted((s) => s.formatVersion < formatVersion && s.blobKey !== '')
      .reverse()
      .slice(0, limit);
  }

  async expireSave(id: string): Promise<void> {
    const s = this.saves.get(id);
    if (s) {
      s.blobKey = '';
      s.sizeBytes = 0;
    }
  }

  async close(): Promise<void> {}
}
