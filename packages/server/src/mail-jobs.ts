// An email to every account (Patch 5: "send an email to every account made at
// the game, telling each of the players that patch 5 is now live"). The
// Droplet takes no inbound traffic and deploys are pulled, so the request
// arrives the same way: the "Email players" workflow puts a job at
// jobs/mail.json in the save store, this server picks it up within half a
// minute, sends, and writes what happened to jobs/results/<request>.json.
// Each account gets a named message at most once, however often the job is
// run (the mail_sent table). A dry run only counts. Nothing written back
// names an address: the workflow prints the result in a public run log.

import type { BlobStore } from './blobs.ts';
import type { Database } from './db/types.ts';
import type { Mailer } from './mailer.ts';

export const MAIL_JOB_KEY = 'jobs/mail.json';
export const mailResultKey = (request: string): string => `jobs/results/${request}.json`;

/** How often the server looks for a job. */
export const MAIL_JOB_CHECK_MS = 30_000;
/** Between two sends: under the mail service's default rate limit (Resend: 2 a second). */
export const MAIL_SPACING_MS = 600;
/** Tries per address before it counts as failed (a later run tries it again). */
export const MAIL_ATTEMPTS = 3;
const RETRY_MS = 2_000;
const MAX_ERRORS = 10;

export interface MailJob {
  /** The message's name, such as "patch-5-live": an account gets each name once. */
  name: string;
  /** Who asked (the workflow run): the result is written under it. */
  request: string;
  /** Only count; send nothing. */
  dryRun: boolean;
  subject: string;
  /** Plain text; {username} becomes the account's username. */
  text: string;
}

export interface MailJobResult {
  request: string;
  name: string;
  dryRun: boolean;
  /** Whether the server has an email service (EMAIL_API_KEY) to send with. */
  emailOn: boolean;
  /** Every account on the server. */
  accounts: number;
  /** Accounts that already had this message. */
  alreadySent: number;
  /** Accounts a stopped run was sending to: never sent again, since it may have gone. */
  unsure: number;
  /** Accounts still to get it when the job started. */
  toSend: number;
  sent: number;
  failed: number;
  /** The mail service's answers for the failures, addresses taken out. */
  errors: string[];
  /** Why the job was not run at all. */
  refused?: string;
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** The job, or why it is not one. */
export function readMailJob(value: unknown): MailJob | string {
  if (typeof value !== 'object' || value === null) return 'the job is not a JSON object';
  const j = value as Record<string, unknown>;
  if (typeof j.name !== 'string' || !NAME.test(j.name)) return 'name must be lower-case letters, digits and dashes';
  if (typeof j.request !== 'string' || !REQUEST.test(j.request)) return 'request must be letters, digits and dashes';
  if (typeof j.dryRun !== 'boolean') return 'dryRun must be true or false';
  if (typeof j.subject !== 'string' || !j.subject.trim() || j.subject.length > 200 || /[\r\n]/.test(j.subject)) return 'subject must be one line of up to 200 characters';
  if (typeof j.text !== 'string' || !j.text.trim() || j.text.length > 10_000) return 'text must be up to 10,000 characters';
  return { name: j.name, request: j.request, dryRun: j.dryRun, subject: j.subject.trim(), text: j.text };
}

/** Takes anything shaped like an email address out of a message. */
export const withoutAddresses = (s: string): string => s.replace(/[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+/g, '<address>');

export interface MailJobDeps {
  db: Database;
  /** Null when the server has no email service: a send is refused, a dry run still counts. */
  mailer: Mailer | null;
  now?: () => Date;
  /** Waits between sends; tests pass one that does not wait. */
  pause?: (ms: number) => Promise<void>;
  /** True once the server is closing: the run stops before the next address. */
  stopped?: () => boolean;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function runMailJob(job: MailJob, deps: MailJobDeps): Promise<MailJobResult> {
  const now = deps.now ?? (() => new Date());
  const pause = deps.pause ?? wait;
  const accounts = await deps.db.listAccounts();
  const records = new Map((await deps.db.mailRecords(job.name)).map((r) => [r.accountId, r.state]));
  const waiting = accounts.filter((a) => !records.has(a.id));
  const result: MailJobResult = {
    request: job.request,
    name: job.name,
    dryRun: job.dryRun,
    emailOn: deps.mailer !== null,
    accounts: accounts.length,
    alreadySent: accounts.filter((a) => records.get(a.id) === 'sent').length,
    unsure: accounts.filter((a) => records.get(a.id) === 'sending').length,
    toSend: waiting.length,
    sent: 0,
    failed: 0,
    errors: [],
  };
  if (job.dryRun) return result;
  if (!deps.mailer) return { ...result, refused: 'the server has no email service (EMAIL_API_KEY is not set)' };

  for (const account of waiting) {
    if (deps.stopped?.()) break;
    // Another run got there first.
    if (!(await deps.db.claimMail(job.name, account.id, now()))) continue;
    let error = '';
    for (let attempt = 1; attempt <= MAIL_ATTEMPTS; attempt++) {
      try {
        await deps.mailer.send({ to: account.email, subject: job.subject, text: job.text.replaceAll('{username}', account.username) });
        error = '';
        break;
      } catch (e) {
        error = withoutAddresses(e instanceof Error ? e.message : String(e));
        if (attempt < MAIL_ATTEMPTS) await pause(RETRY_MS * attempt);
      }
    }
    await deps.db.settleMail(job.name, account.id, !error, now());
    if (error) {
      result.failed++;
      if (result.errors.length < MAX_ERRORS && !result.errors.includes(error)) result.errors.push(error);
    } else {
      result.sent++;
    }
    await pause(MAIL_SPACING_MS);
  }
  return result;
}

export interface MailInboxDeps extends MailJobDeps {
  blobs: BlobStore;
  log: (message: string) => void;
}

/** Looks for a mail job in the save store every half minute and runs it. */
export class MailInbox {
  private readonly deps: MailInboxDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private closed = false;

  constructor(deps: MailInboxDeps) {
    this.deps = deps;
  }

  start(everyMs = MAIL_JOB_CHECK_MS): void {
    this.timer = setInterval(() => void this.check(), everyMs);
    this.timer.unref();
  }

  stop(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Looks once; true when there was a job. */
  async check(): Promise<boolean> {
    if (this.busy || this.closed) return false;
    this.busy = true;
    const { blobs, log } = this.deps;
    try {
      const bytes = await blobs.get(MAIL_JOB_KEY);
      if (!bytes) return false;
      // Taken off before it runs, so it runs once even if the server stops
      // part-way; running the workflow again carries on where it stopped.
      await blobs.delete(MAIL_JOB_KEY);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        parsed = null;
      }
      const job = readMailJob(parsed);
      if (typeof job === 'string') {
        const request = (parsed as { request?: unknown } | null)?.request;
        log(`mail: refused a job: ${job}`);
        if (typeof request === 'string' && REQUEST.test(request)) await this.answer(request, { request, refused: job });
        return true;
      }
      log(`mail: ${job.dryRun ? 'counting for' : 'sending'} "${job.name}"`);
      const result = await runMailJob(job, { ...this.deps, stopped: () => this.closed || (this.deps.stopped?.() ?? false) });
      log(
        result.refused
          ? `mail: "${job.name}" refused: ${result.refused}`
          : `mail: "${job.name}": ${result.accounts} accounts, ${result.alreadySent} had it, ${job.dryRun ? `${result.toSend} to send` : `${result.sent} sent, ${result.failed} failed`}`,
      );
      await this.answer(job.request, result);
      return true;
    } catch (e) {
      log(`mail: the job check failed: ${String(e)}`);
      return false;
    } finally {
      this.busy = false;
    }
  }

  private async answer(request: string, result: Partial<MailJobResult>): Promise<void> {
    await this.deps.blobs.put(mailResultKey(request), new TextEncoder().encode(`${JSON.stringify(result, null, 2)}\n`));
  }
}
