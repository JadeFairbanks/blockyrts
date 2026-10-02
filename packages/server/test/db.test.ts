// The Database contract, run against the in-memory store and, when
// TEST_DATABASE_URL is set (CI does), against PostgreSQL.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryDatabase } from '../src/db/memory.ts';
import { PostgresDatabase } from '../src/db/postgres.ts';
import { DuplicateError, type Database, type SaveRow } from '../src/db/types.ts';

const pgUrl = process.env.TEST_DATABASE_URL;
const stores: Array<[string, () => Promise<Database>]> = [['memory', async () => new MemoryDatabase()]];
if (pgUrl) stores.push(['postgres', () => PostgresDatabase.connect(pgUrl)]);

describe.each(stores)('database (%s)', (_name, make) => {
  let db: Database;
  const open: Database[] = [];
  const get = async (): Promise<Database> => {
    db ??= await make();
    open.push(db);
    return db;
  };
  afterAll(async () => {
    if (db) await db.close();
  });
  const u = (): string => randomUUID().slice(0, 8);

  it('creates accounts and finds them by email or username, ignoring case', async () => {
    const d = await get();
    const tag = u();
    const id = randomUUID();
    await d.createAccount({ id, email: `A${tag}@Example.com`, username: `User${tag}`, passwordHash: 'h', createdAt: new Date() });
    expect((await d.findAccountByLogin(`a${tag}@example.com`))?.id).toBe(id);
    expect((await d.findAccountByLogin(`user${tag}`))?.id).toBe(id);
    await expect(d.createAccount({ id: randomUUID(), email: `a${tag}@example.com`, username: `x${tag}`, passwordHash: 'h', createdAt: new Date() })).rejects.toThrow(DuplicateError);
    const dup = await d
      .createAccount({ id: randomUUID(), email: `b${tag}@example.com`, username: `USER${tag}`, passwordHash: 'h', createdAt: new Date() })
      .catch((e: unknown) => e);
    expect(dup).toBeInstanceOf(DuplicateError);
    expect((dup as DuplicateError).field).toBe('username');
  });

  it('expires sessions and consumes a reset only once, before it expires', async () => {
    const d = await get();
    const tag = u();
    const id = randomUUID();
    await d.createAccount({ id, email: `${tag}@e.com`, username: `s${tag}`, passwordHash: 'h', createdAt: new Date() });
    const now = new Date();
    await d.createSession({ tokenHash: `t${tag}`, accountId: id, guestName: null, createdAt: now, expiresAt: new Date(now.getTime() + 1000) });
    expect(await d.findSession(`t${tag}`, now)).not.toBeNull();
    expect(await d.findSession(`t${tag}`, new Date(now.getTime() + 2000))).toBeNull();
    await d.createReset({ tokenHash: `r${tag}`, accountId: id, expiresAt: new Date(now.getTime() + 1000) });
    expect(await d.consumeReset(`r${tag}`, new Date(now.getTime() + 2000))).toBeNull();
    expect(await d.consumeReset(`r${tag}`, now)).toBe(id);
    expect(await d.consumeReset(`r${tag}`, now)).toBeNull();
    await d.deleteSessionsForAccount(id);
    expect(await d.findSession(`t${tag}`, now)).toBeNull();
  });

  it('lists saves newest first and totals their size', async () => {
    const d = await get();
    const tag = u();
    const account = randomUUID();
    await d.createAccount({ id: account, email: `${tag}@s.com`, username: `v${tag}`, passwordHash: 'h', createdAt: new Date() });
    const matchId = randomUUID();
    await d.createMatch({ id: matchId, ownerAccountId: null, seed: 4_000_000_000, createdAt: new Date() });
    await d.setMatchOwner(matchId, account);
    expect(await d.findMatch(matchId)).toMatchObject({ ownerAccountId: account, seed: 4_000_000_000 });
    const row = (n: number, kind: SaveRow['kind']): SaveRow => ({
      id: randomUUID(),
      matchId,
      accountId: account,
      kind,
      label: `save ${n}`,
      night: n,
      step: n * 8800,
      seed: 4_000_000_000,
      players: [{ slot: 0, name: 'Jade', colour: 0, accountId: account }],
      sizeBytes: 1000 + n,
      formatVersion: 1,
      blobKey: `k${n}`,
      createdAt: new Date(Date.UTC(2026, 9, 2, 0, 0, n)),
    });
    for (const [n, k] of [[1, 'autosave'], [2, 'manual'], [3, 'autosave']] as const) await d.insertSave(row(n, k));
    expect((await d.listSaves(account)).map((s) => s.night)).toEqual([3, 2, 1]);
    expect((await d.listMatchSaves(matchId, 'autosave')).map((s) => s.night)).toEqual([3, 1]);
    expect(await d.totalSaveBytes(account)).toBe(3006);
    const first = (await d.listSaves(account))[0]!;
    expect(first.players).toEqual([{ slot: 0, name: 'Jade', colour: 0, accountId: account }]);
    await d.deleteSave(first.id);
    expect(await d.findSave(first.id)).toBeNull();
  });
});
