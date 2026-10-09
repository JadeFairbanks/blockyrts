// PostgreSQL Database. Migrations are numbered SQL steps applied in order
// inside a transaction, recorded in schema_migrations; the server runs them
// on start, and `pnpm --filter @blockyrts/server migrate` runs them alone.

import pg from 'pg';
import { DuplicateError, type AccountRow, type Database, type MailRecord, type MatchRow, type ResetRow, type SaveRow, type SessionRow } from './types.ts';

const MIGRATIONS: string[] = [
  // 1: accounts, sessions, password resets, matches and save metadata.
  `
  CREATE TABLE accounts (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE UNIQUE INDEX accounts_email_lower ON accounts (lower(email));
  CREATE UNIQUE INDEX accounts_username_lower ON accounts (lower(username));

  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    account_id uuid REFERENCES accounts (id) ON DELETE CASCADE,
    guest_name text,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX sessions_account ON sessions (account_id);

  CREATE TABLE password_resets (
    token_hash text PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
  );

  CREATE TABLE matches (
    id uuid PRIMARY KEY,
    owner_account_id uuid REFERENCES accounts (id) ON DELETE SET NULL,
    seed bigint NOT NULL,
    created_at timestamptz NOT NULL
  );

  CREATE TABLE saves (
    id uuid PRIMARY KEY,
    match_id uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('manual', 'autosave')),
    label text NOT NULL,
    night integer NOT NULL,
    step bigint NOT NULL,
    seed bigint NOT NULL,
    players jsonb NOT NULL,
    size_bytes bigint NOT NULL,
    format_version integer NOT NULL,
    blob_key text NOT NULL,
    created_at timestamptz NOT NULL
  );
  CREATE INDEX saves_account_created ON saves (account_id, created_at DESC);
  CREATE INDEX saves_match_kind ON saves (match_id, kind, created_at DESC);
  `,
  // 2: emails to every account (Patch 5): which account has had which named message, so each goes once.
  `
  CREATE TABLE mail_sent (
    name text NOT NULL,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    state text NOT NULL CHECK (state IN ('sending', 'sent')),
    at timestamptz NOT NULL,
    PRIMARY KEY (name, account_id)
  );
  `,
];

export async function migrate(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    // One server migrating at a time, even if two start together.
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await client.query<{ v: number | null }>('SELECT max(version) AS v FROM schema_migrations');
    const current = rows[0]?.v ?? 0;
    for (let v = current + 1; v <= MIGRATIONS.length; v++) {
      await client.query('BEGIN');
      try {
        await client.query(MIGRATIONS[v - 1]!);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [v]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    return MIGRATIONS.length;
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => undefined);
    client.release();
  }
}

interface AccountDb {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

const toAccount = (r: AccountDb): AccountRow => ({
  id: r.id,
  email: r.email,
  username: r.username,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
});

interface SaveDb {
  id: string;
  match_id: string;
  account_id: string;
  kind: 'manual' | 'autosave';
  label: string;
  night: number;
  step: string;
  seed: string;
  players: SaveRow['players'];
  size_bytes: string;
  format_version: number;
  blob_key: string;
  created_at: Date;
}

const toSave = (r: SaveDb): SaveRow => ({
  id: r.id,
  matchId: r.match_id,
  accountId: r.account_id,
  kind: r.kind,
  label: r.label,
  night: r.night,
  step: Number(r.step),
  seed: Number(r.seed),
  players: r.players,
  sizeBytes: Number(r.size_bytes),
  formatVersion: r.format_version,
  blobKey: r.blob_key,
  createdAt: r.created_at,
});

export class PostgresDatabase implements Database {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /** Connects and brings the schema up to date. */
  static async connect(url: string): Promise<PostgresDatabase> {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    await migrate(pool);
    return new PostgresDatabase(pool);
  }

  async createAccount(row: AccountRow): Promise<void> {
    try {
      await this.pool.query('INSERT INTO accounts (id, email, username, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
        row.id,
        row.email,
        row.username,
        row.passwordHash,
        row.createdAt,
      ]);
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      if (err.code === '23505') throw new DuplicateError(err.constraint === 'accounts_email_lower' ? 'email' : 'username');
      throw e;
    }
  }

  async findAccountById(id: string): Promise<AccountRow | null> {
    const { rows } = await this.pool.query<AccountDb>('SELECT * FROM accounts WHERE id = $1', [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async findAccountByLogin(login: string): Promise<AccountRow | null> {
    const { rows } = await this.pool.query<AccountDb>(
      'SELECT * FROM accounts WHERE lower(email) = lower($1) OR lower(username) = lower($1) LIMIT 1',
      [login],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async setPasswordHash(accountId: string, hash: string): Promise<void> {
    await this.pool.query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [accountId, hash]);
  }

  async listAccounts(): Promise<AccountRow[]> {
    const { rows } = await this.pool.query<AccountDb>('SELECT * FROM accounts ORDER BY created_at, id');
    return rows.map(toAccount);
  }

  async mailRecords(name: string): Promise<MailRecord[]> {
    const { rows } = await this.pool.query<{ account_id: string; state: MailRecord['state'] }>(
      'SELECT account_id, state FROM mail_sent WHERE name = $1',
      [name],
    );
    return rows.map((r) => ({ accountId: r.account_id, state: r.state }));
  }

  async claimMail(name: string, accountId: string, now: Date): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "INSERT INTO mail_sent (name, account_id, state, at) VALUES ($1, $2, 'sending', $3) ON CONFLICT DO NOTHING",
      [name, accountId, now],
    );
    return rowCount === 1;
  }

  async settleMail(name: string, accountId: string, sent: boolean, now: Date): Promise<void> {
    if (sent) await this.pool.query("UPDATE mail_sent SET state = 'sent', at = $3 WHERE name = $1 AND account_id = $2", [name, accountId, now]);
    else await this.pool.query('DELETE FROM mail_sent WHERE name = $1 AND account_id = $2', [name, accountId]);
  }

  async createSession(row: SessionRow): Promise<void> {
    await this.pool.query('INSERT INTO sessions (token_hash, account_id, guest_name, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)', [
      row.tokenHash,
      row.accountId,
      row.guestName,
      row.createdAt,
      row.expiresAt,
    ]);
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionRow | null> {
    const { rows } = await this.pool.query<{
      token_hash: string;
      account_id: string | null;
      guest_name: string | null;
      created_at: Date;
      expires_at: Date;
    }>('SELECT * FROM sessions WHERE token_hash = $1 AND expires_at > $2', [tokenHash, now]);
    const r = rows[0];
    return r ? { tokenHash: r.token_hash, accountId: r.account_id, guestName: r.guest_name, createdAt: r.created_at, expiresAt: r.expires_at } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteSessionsForAccount(accountId: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE account_id = $1', [accountId]);
  }

  async createReset(row: ResetRow): Promise<void> {
    await this.pool.query('INSERT INTO password_resets (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [
      row.tokenHash,
      row.accountId,
      row.expiresAt,
    ]);
  }

  async consumeReset(tokenHash: string, now: Date): Promise<string | null> {
    const { rows } = await this.pool.query<{ account_id: string }>(
      'UPDATE password_resets SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING account_id',
      [tokenHash, now],
    );
    return rows[0]?.account_id ?? null;
  }

  async createMatch(row: MatchRow): Promise<void> {
    await this.pool.query('INSERT INTO matches (id, owner_account_id, seed, created_at) VALUES ($1, $2, $3, $4)', [
      row.id,
      row.ownerAccountId,
      row.seed,
      row.createdAt,
    ]);
  }

  async findMatch(id: string): Promise<MatchRow | null> {
    const { rows } = await this.pool.query<{ id: string; owner_account_id: string | null; seed: string; created_at: Date }>(
      'SELECT * FROM matches WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, ownerAccountId: r.owner_account_id, seed: Number(r.seed), createdAt: r.created_at } : null;
  }

  async setMatchOwner(id: string, accountId: string): Promise<void> {
    await this.pool.query('UPDATE matches SET owner_account_id = $2 WHERE id = $1', [id, accountId]);
  }

  async insertSave(row: SaveRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO saves (id, match_id, account_id, kind, label, night, step, seed, players, size_bytes, format_version, blob_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        row.id,
        row.matchId,
        row.accountId,
        row.kind,
        row.label,
        row.night,
        row.step,
        row.seed,
        JSON.stringify(row.players),
        row.sizeBytes,
        row.formatVersion,
        row.blobKey,
        row.createdAt,
      ],
    );
  }

  async findSave(id: string): Promise<SaveRow | null> {
    const { rows } = await this.pool.query<SaveDb>('SELECT * FROM saves WHERE id = $1', [id]);
    return rows[0] ? toSave(rows[0]) : null;
  }

  async listSaves(accountId: string): Promise<SaveRow[]> {
    const { rows } = await this.pool.query<SaveDb>('SELECT * FROM saves WHERE account_id = $1 ORDER BY created_at DESC, id DESC', [accountId]);
    return rows.map(toSave);
  }

  async listMatchSaves(matchId: string, kind: SaveRow['kind']): Promise<SaveRow[]> {
    const { rows } = await this.pool.query<SaveDb>(
      'SELECT * FROM saves WHERE match_id = $1 AND kind = $2 ORDER BY created_at DESC, id DESC',
      [matchId, kind],
    );
    return rows.map(toSave);
  }

  async deleteSave(id: string): Promise<void> {
    await this.pool.query('DELETE FROM saves WHERE id = $1', [id]);
  }

  async outdatedSaves(formatVersion: number, limit: number): Promise<SaveRow[]> {
    const { rows } = await this.pool.query<SaveDb>(
      "SELECT * FROM saves WHERE format_version < $1 AND blob_key <> '' ORDER BY created_at, id LIMIT $2",
      [formatVersion, limit],
    );
    return rows.map(toSave);
  }

  async expireSave(id: string): Promise<void> {
    await this.pool.query("UPDATE saves SET blob_key = '', size_bytes = 0 WHERE id = $1", [id]);
  }

  async totalSaveBytes(accountId: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: string | null }>('SELECT sum(size_bytes) AS total FROM saves WHERE account_id = $1', [accountId]);
    return Number(rows[0]?.total ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
