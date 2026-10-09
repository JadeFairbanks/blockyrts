// The HTTP API end to end on an in-memory server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiRoutes, SAVE_FORMAT_VERSION, writeSaveFile, type MeResponse, type OpenRoom, type SaveSummary, type SessionResponse } from '@blockyrts/protocol';
import { startApp, type App } from '../src/app.ts';
import { MemoryBlobStore } from '../src/blobs.ts';
import { loadConfig } from '../src/config.ts';
import { MemoryDatabase } from '../src/db/memory.ts';
import { MemoryMailer } from '../src/mailer.ts';
import { OUTDATED_TEXT, SaveService } from '../src/saves.ts';

let app: App;
let base = '';
const mailer = new MemoryMailer();

beforeAll(async () => {
  app = await startApp(loadConfig({ PORT: '0', PUBLIC_URL: 'https://play.example.com', ALLOWED_ORIGINS: 'https://play.example.com' }), { mailer, log: () => undefined, limits: { accountsPerHour: 1000, loginsPerMinute: 8 } });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => {
  await app.close();
});

async function call<T = Record<string, unknown>>(path: string, init: { method?: string; token?: string; json?: unknown; bytes?: Uint8Array; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let body: string | Uint8Array | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] ??= 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.bytes) {
    headers['Content-Type'] ??= 'application/octet-stream';
    body = init.bytes;
  }
  const res = await fetch(base + path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, ...(body !== undefined ? { body: body as unknown as string } : {}) });
  const text = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, body: text as T, headers: res.headers };
}

let n = 0;
const register = async (name = `p${Date.now() % 100000}_${n++}`): Promise<SessionResponse> => {
  const r = await call<SessionResponse>(ApiRoutes.accounts, { json: { email: `${name}@example.com`, username: name, password: 'long enough pw' } });
  expect(r.status).toBe(201);
  return r.body;
};

const save = (matchId: string, seed: number, step = 100, formatVersion = SAVE_FORMAT_VERSION): Promise<Uint8Array> =>
  writeSaveFile({ formatVersion, gameVersion: 't', matchId, seed, step, night: 0, label: 'x', players: [] }, [{ tag: 'SIMS', version: 1, data: new Uint8Array(64) }]);

describe('accounts', () => {
  it('reports health with the build', async () => {
    const r = await call(ApiRoutes.health);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, build: 'dev' });
  });

  it('registers, sets an httpOnly cookie and knows who you are', async () => {
    const r = await call<SessionResponse>(ApiRoutes.accounts, { json: { email: 'jade@example.com', username: 'Jade', password: 'a good password' } });
    expect(r.status).toBe(201);
    expect(r.headers.get('set-cookie')).toMatch(/sac_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
    const me = await call(ApiRoutes.me, { token: r.body.token });
    expect(me.body).toMatchObject({ name: 'Jade', guest: false, account: { username: 'Jade' } });
    const viaCookie = await call(ApiRoutes.me, { headers: { Cookie: `sac_session=${r.body.token}` } });
    expect(viaCookie.body).toMatchObject({ name: 'Jade' });
  });

  it('refuses bad input and taken names', async () => {
    expect((await call(ApiRoutes.accounts, { json: { email: 'nope', username: 'abc', password: 'long enough pw' } })).body).toMatchObject({ error: 'invalid_email' });
    expect((await call(ApiRoutes.accounts, { json: { email: 'a@b.cd', username: 'Guest1234', password: 'long enough pw' } })).body).toMatchObject({ error: 'invalid_username' });
    expect((await call(ApiRoutes.accounts, { json: { email: 'a@b.cd', username: 'abc', password: 'short' } })).body).toMatchObject({ error: 'weak_password' });
    expect((await call(ApiRoutes.accounts, { json: { email: 'JADE@example.com', username: 'other', password: 'long enough pw' } })).status).toBe(409);
    expect((await call(ApiRoutes.accounts, { json: { email: 'x@example.com', username: 'jade', password: 'long enough pw' } })).body).toMatchObject({ error: 'username_taken' });
  });

  it('refuses a JSON body sent as a form (CSRF)', async () => {
    const r = await call(ApiRoutes.sessions, { json: { login: 'jade', password: 'a good password' }, headers: { 'Content-Type': 'text/plain' } });
    expect(r.status).toBe(415);
  });

  it('logs in by username or email, and refuses a wrong password', async () => {
    expect((await call(ApiRoutes.sessions, { json: { login: 'JADE', password: 'a good password' } })).status).toBe(200);
    expect((await call(ApiRoutes.sessions, { json: { login: 'jade@example.com', password: 'a good password' } })).status).toBe(200);
    expect((await call(ApiRoutes.sessions, { json: { login: 'jade', password: 'wrong password' } })).body).toMatchObject({ error: 'bad_credentials' });
    expect((await call(ApiRoutes.sessions, { json: { login: 'nobody', password: 'wrong password' } })).status).toBe(401);
  });

  it('logs out', async () => {
    const s = await register();
    expect((await call(ApiRoutes.sessions, { method: 'DELETE', token: s.token })).status).toBe(204);
    expect((await call(ApiRoutes.me, { token: s.token })).body).toMatchObject({ account: null, guest: false });
  });

  it('turns a guest into an account', async () => {
    const g = await call<SessionResponse>(ApiRoutes.guests, { method: 'POST' });
    expect(g.body.name).toMatch(/^Guest \d{4}$/);
    expect((await call(ApiRoutes.me, { token: g.body.token })).body).toMatchObject({ guest: true, name: g.body.name });
    const r = await call<SessionResponse>(ApiRoutes.accounts, { token: g.body.token, json: { email: 'former@guest.com', username: 'former', password: 'long enough pw' } });
    expect(r.status).toBe(201);
    expect((await call(ApiRoutes.me, { token: g.body.token })).body).toMatchObject({ guest: false, account: null });
    expect((await call(ApiRoutes.me, { token: r.body.token })).body).toMatchObject({ name: 'former' });
  });

  it('emails a reset link that works once and signs everyone out', async () => {
    const s = await register('resetme');
    expect((await call(ApiRoutes.passwordResets, { json: { email: 'unknown@example.com' } })).status).toBe(202);
    expect((await call(ApiRoutes.passwordResets, { json: { email: 'resetme@example.com' } })).status).toBe(202);
    await new Promise((r) => setTimeout(r, 50));
    const mail = mailer.sent.at(-1)!;
    expect(mail.to).toBe('resetme@example.com');
    const token = /#token=([\w-]+)/.exec(mail.text)![1]!;
    expect(mail.text).toContain('https://play.example.com/reset-password#token=');
    expect((await call(ApiRoutes.passwordResetConfirm, { json: { token, password: 'brand new password' } })).status).toBe(204);
    expect((await call(ApiRoutes.passwordResetConfirm, { json: { token, password: 'another new password' } })).body).toMatchObject({ error: 'reset_invalid' });
    expect((await call(ApiRoutes.me, { token: s.token })).body).toMatchObject({ account: null });
    expect((await call(ApiRoutes.sessions, { json: { login: 'resetme', password: 'brand new password' } })).status).toBe(200);
  });

  it('answers CORS preflights for the game page only', async () => {
    const ok = await fetch(base + ApiRoutes.sessions, { method: 'OPTIONS', headers: { Origin: 'https://play.example.com' } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await fetch(base + ApiRoutes.me, { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('saves', () => {
  it('stores, lists, downloads and deletes a single-player save; others cannot see it', async () => {
    const me = await register();
    const other = await register();
    const m = await call<{ matchId: string }>(ApiRoutes.matches, { token: me.token, json: { seed: 7 } });
    expect(m.status).toBe(201);
    const bytes = await save(m.body.matchId, 7, 8800);
    const s = await call<SaveSummary>(ApiRoutes.matchSaves(m.body.matchId), { token: me.token, bytes });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ kind: 'manual', step: 8800, seed: 7, sizeBytes: bytes.length });
    expect((await call(ApiRoutes.matchSaves(m.body.matchId), { token: other.token, bytes })).status).toBe(403);
    const list = await call<{ saves: SaveSummary[] }>(ApiRoutes.saves, { token: me.token });
    expect(list.body.saves.map((x) => x.id)).toEqual([s.body.id]);
    const file = await fetch(base + ApiRoutes.save(s.body.id), { headers: { Authorization: `Bearer ${me.token}` } });
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect((await call(ApiRoutes.save(s.body.id), { token: other.token })).status).toBe(404);
    expect((await call(ApiRoutes.save(s.body.id), { method: 'DELETE', token: me.token })).status).toBe(204);
    expect((await call<{ saves: SaveSummary[] }>(ApiRoutes.saves, { token: me.token })).body.saves).toEqual([]);
  });

  it('refuses a file that is not a save, or belongs to another game', async () => {
    const me = await register();
    const m = await call<{ matchId: string }>(ApiRoutes.matches, { token: me.token, json: { seed: 9 } });
    expect((await call(ApiRoutes.matchSaves(m.body.matchId), { token: me.token, bytes: new Uint8Array(40) })).body).toMatchObject({ error: 'bad_save' });
    const wrongSeed = await save(m.body.matchId, 10);
    expect((await call(ApiRoutes.matchSaves(m.body.matchId), { token: me.token, bytes: wrongSeed })).body).toMatchObject({ error: 'bad_save' });
  });

  it('refuses a save from an older version of the game (Patch 5)', async () => {
    const me = await register();
    const m = await call<{ matchId: string }>(ApiRoutes.matches, { token: me.token, json: { seed: 4 } });
    const old = await save(m.body.matchId, 4, 100, SAVE_FORMAT_VERSION - 1);
    expect((await call(ApiRoutes.matchSaves(m.body.matchId), { token: me.token, bytes: old })).body).toMatchObject({ error: 'save_outdated' });
  });

  it('asks a guest to make an account', async () => {
    const g = await call<SessionResponse>(ApiRoutes.guests, { method: 'POST' });
    expect((await call(ApiRoutes.matches, { token: g.body.token, json: { seed: 1 } })).body).toMatchObject({ error: 'guest_must_register' });
    expect((await call(ApiRoutes.saves, {})).status).toBe(401);
  });
});

describe('Patch 5', () => {
  it('lets only the admin accounts use the debugger, whatever the capitals', async () => {
    // Registered as "Jade" in the accounts tests above; signing in by any capitals finds the same account.
    const jade = (await call<SessionResponse>(ApiRoutes.sessions, { json: { login: 'JADE', password: 'a good password' } })).body;
    expect(jade.debugger).toBe(true);
    const proteus = await register('PROTEUS');
    expect(proteus.debugger).toBe(true);
    const other = await register('jade_two');
    expect(other.debugger).toBe(false);
    expect((await call<MeResponse>(ApiRoutes.me, { token: jade.token })).body.debugger).toBe(true);
    const g = await call<SessionResponse>(ApiRoutes.guests, { method: 'POST' });
    expect(g.body.debugger).toBe(false);
    expect((await call<MeResponse>(ApiRoutes.me, { token: g.body.token })).body.debugger).toBe(false);
  });

  it('lists the open games, signed in or not', async () => {
    const r = await call<{ rooms: OpenRoom[] }>(ApiRoutes.rooms);
    expect(r.status).toBe(200);
    expect(r.body.rooms).toEqual([]);
  });

  it('removes older saves\' files and lists them as out of date until acknowledged', async () => {
    const db = new MemoryDatabase();
    const blobs = new MemoryBlobStore();
    const saves = new SaveService({ db, blobs });
    const who = { tokenHash: 't', account: { id: 'a1', email: 'a@b.cd', username: 'a1' }, name: 'a1' };
    const row = (id: string, formatVersion: number) => ({
      id,
      matchId: 'm',
      accountId: 'a1',
      kind: 'manual' as const,
      label: '',
      night: 3,
      step: 10,
      seed: 1,
      players: [],
      sizeBytes: 50,
      formatVersion,
      blobKey: `saves/a1/${id}.sac`,
      createdAt: new Date(Number(id.slice(-1)) * 1000),
    });
    const oldId = '00000000-0000-4000-8000-000000000001';
    const newId = '00000000-0000-4000-8000-000000000002';
    for (const r of [row(oldId, SAVE_FORMAT_VERSION - 1), row(newId, SAVE_FORMAT_VERSION)]) {
      await db.insertSave(r);
      await blobs.put(r.blobKey, new Uint8Array(50));
    }
    expect(await saves.expireOutdated()).toBe(1);
    expect(await saves.expireOutdated()).toBe(0);
    expect(blobs.blobs.has(`saves/a1/${oldId}.sac`)).toBe(false);
    expect(blobs.blobs.has(`saves/a1/${newId}.sac`)).toBe(true);
    expect(await db.totalSaveBytes('a1')).toBe(50);
    const list = await saves.list(who);
    expect(list.map((s) => [s.id, s.outdated])).toEqual([
      [newId, false],
      [oldId, true],
    ]);
    await expect(saves.load(who, oldId)).rejects.toThrow(OUTDATED_TEXT);
    await saves.delete(who, oldId);
    expect((await saves.list(who)).map((s) => s.id)).toEqual([newId]);
  });
});

describe('rate limits', () => {
  it('stops password guessing from one address', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call(ApiRoutes.sessions, { json: { login: 'jade', password: `guess ${i} guess` } })).status;
    expect(last).toBe(429);
  });
});

describe('without an email service', () => {
  it('still starts, and says reset email is off', async () => {
    const quiet = await startApp(loadConfig({ PORT: '0' }), { log: () => undefined });
    try {
      const r = await fetch(`http://127.0.0.1:${quiet.port}${ApiRoutes.passwordResets}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.cd' }),
      });
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ error: 'email_not_configured' });
    } finally {
      await quiet.close();
    }
  });
});
