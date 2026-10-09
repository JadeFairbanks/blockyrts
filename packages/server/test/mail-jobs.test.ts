// An email to every account (Patch 5): dry run, send once, try failures again,
// and the job taken from the save store with its answer written back.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryBlobStore } from '../src/blobs.ts';
import { MemoryDatabase } from '../src/db/memory.ts';
import { MAIL_JOB_KEY, MailInbox, mailResultKey, readMailJob, runMailJob, withoutAddresses, type MailJob, type MailJobResult } from '../src/mail-jobs.ts';
import { MemoryMailer, type Mail, type Mailer } from '../src/mailer.ts';

const noWait = async (): Promise<void> => undefined;

async function withAccounts(names: string[]): Promise<MemoryDatabase> {
  const db = new MemoryDatabase();
  for (const [i, name] of names.entries()) {
    await db.createAccount({ id: randomUUID(), email: `${name}@example.com`, username: name, passwordHash: 'h', createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)) });
  }
  return db;
}

const job = (over: Partial<MailJob> = {}): MailJob => ({
  name: 'patch-5-live',
  request: 'run-1-1',
  dryRun: false,
  subject: 'Patch 5 is live',
  text: 'Hello {username},\nPatch 5 is live.',
  ...over,
});

/** Fails every send to the addresses given, with an answer that names the address. */
class FlakyMailer implements Mailer {
  readonly sent: Mail[] = [];
  constructor(private readonly failing: Set<string>) {}
  async send(mail: Mail): Promise<void> {
    if (this.failing.has(mail.to)) throw new Error(`email API answered 422: ${mail.to} is not a valid address`);
    this.sent.push(mail);
  }
}

describe('email to every account', () => {
  it('a dry run counts and sends nothing', async () => {
    const db = await withAccounts(['ana', 'bo', 'cy']);
    const mailer = new MemoryMailer();
    const r = await runMailJob(job({ dryRun: true }), { db, mailer, pause: noWait });
    expect(r).toMatchObject({ dryRun: true, emailOn: true, accounts: 3, alreadySent: 0, toSend: 3, sent: 0, failed: 0 });
    expect(mailer.sent).toEqual([]);
    expect((await runMailJob(job({ dryRun: true }), { db, mailer: null, pause: noWait })).emailOn).toBe(false);
  });

  it('sends each account the message once, with its username', async () => {
    const db = await withAccounts(['ana', 'bo']);
    const mailer = new MemoryMailer();
    const first = await runMailJob(job(), { db, mailer, pause: noWait });
    expect(first).toMatchObject({ accounts: 2, toSend: 2, sent: 2, failed: 0, alreadySent: 0 });
    expect(mailer.sent.map((m) => [m.to, m.text])).toEqual([
      ['ana@example.com', 'Hello ana,\nPatch 5 is live.'],
      ['bo@example.com', 'Hello bo,\nPatch 5 is live.'],
    ]);
    expect(mailer.sent[0]!.subject).toBe('Patch 5 is live');
    const again = await runMailJob(job(), { db, mailer, pause: noWait });
    expect(again).toMatchObject({ accounts: 2, alreadySent: 2, toSend: 0, sent: 0 });
    expect(mailer.sent).toHaveLength(2);
    // A new account, or a message of another name, still goes.
    await db.createAccount({ id: randomUUID(), email: 'cy@example.com', username: 'cy', passwordHash: 'h', createdAt: new Date() });
    expect((await runMailJob(job(), { db, mailer, pause: noWait })).sent).toBe(1);
    expect((await runMailJob(job({ name: 'patch-6-live' }), { db, mailer, pause: noWait })).sent).toBe(3);
  });

  it('counts a failure without its address and tries it again on the next run', async () => {
    const db = await withAccounts(['ana', 'bo']);
    const flaky = new FlakyMailer(new Set(['bo@example.com']));
    const pauses: number[] = [];
    const r = await runMailJob(job(), { db, mailer: flaky, pause: async (ms) => void pauses.push(ms) });
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(r.errors).toEqual(['email API answered 422: <address> is not a valid address']);
    expect(JSON.stringify(r)).not.toContain('@example.com');
    // Three tries for the failing address, with a wait between them.
    expect(pauses.filter((ms) => ms >= 2000)).toHaveLength(2);
    const mailer = new MemoryMailer();
    const retry = await runMailJob(job(), { db, mailer, pause: noWait });
    expect(retry).toMatchObject({ alreadySent: 1, toSend: 1, sent: 1, failed: 0 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['bo@example.com']);
  });

  it('never sends again to an account a stopped run was sending to', async () => {
    const db = await withAccounts(['ana', 'bo']);
    const [ana] = await db.listAccounts();
    await db.claimMail('patch-5-live', ana!.id, new Date());
    const mailer = new MemoryMailer();
    const r = await runMailJob(job(), { db, mailer, pause: noWait });
    expect(r).toMatchObject({ unsure: 1, toSend: 1, sent: 1 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['bo@example.com']);
  });

  it('refuses to send with no email service', async () => {
    const db = await withAccounts(['ana']);
    const r = await runMailJob(job(), { db, mailer: null, pause: noWait });
    expect(r.refused).toMatch(/EMAIL_API_KEY/);
    expect(r.sent).toBe(0);
    expect(await db.mailRecords('patch-5-live')).toEqual([]);
  });

  it('reads only well-formed jobs', () => {
    expect(readMailJob(job())).toEqual(job());
    expect(readMailJob(null)).toMatch(/object/);
    expect(readMailJob({ ...job(), name: 'Patch 5' })).toMatch(/name/);
    expect(readMailJob({ ...job(), request: '../x' })).toMatch(/request/);
    expect(readMailJob({ ...job(), dryRun: 'yes' })).toMatch(/dryRun/);
    expect(readMailJob({ ...job(), subject: 'a\nBcc: x' })).toMatch(/subject/);
    expect(readMailJob({ ...job(), text: ' ' })).toMatch(/text/);
    expect(withoutAddresses('to <a.b+c@mail.example.com>, d@e.co: bad')).toBe('to <<address>>, <address>: bad');
  });

  it('takes a job from the save store, runs it once and writes the answer back', async () => {
    const db = await withAccounts(['ana', 'bo']);
    const blobs = new MemoryBlobStore();
    const mailer = new MemoryMailer();
    const logs: string[] = [];
    const inbox = new MailInbox({ db, mailer, blobs, log: (m) => logs.push(m), pause: noWait });
    expect(await inbox.check()).toBe(false);
    await blobs.put(MAIL_JOB_KEY, new TextEncoder().encode(JSON.stringify(job({ request: 'run-7-1' }))));
    expect(await inbox.check()).toBe(true);
    expect(await blobs.get(MAIL_JOB_KEY)).toBeNull();
    const answer = JSON.parse(new TextDecoder().decode((await blobs.get(mailResultKey('run-7-1')))!)) as MailJobResult;
    expect(answer).toMatchObject({ request: 'run-7-1', name: 'patch-5-live', accounts: 2, sent: 2, failed: 0 });
    expect(mailer.sent).toHaveLength(2);
    expect(await inbox.check()).toBe(false);
    expect(logs.join('\n')).not.toContain('@example.com');
    // A bad job is answered with why, when it says who asked.
    await blobs.put(MAIL_JOB_KEY, new TextEncoder().encode(JSON.stringify({ ...job({ request: 'run-8-1' }), name: '' })));
    expect(await inbox.check()).toBe(true);
    expect(JSON.parse(new TextDecoder().decode((await blobs.get(mailResultKey('run-8-1')))!))).toMatchObject({ refused: expect.stringMatching(/name/) });
    // Once stopped it looks no more.
    inbox.stop();
    await blobs.put(MAIL_JOB_KEY, new TextEncoder().encode(JSON.stringify(job({ request: 'run-9-1' }))));
    expect(await inbox.check()).toBe(false);
    expect(mailer.sent).toHaveLength(2);
  });
});
