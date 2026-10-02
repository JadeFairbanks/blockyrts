// Accounts, guests, sessions and password resets (Accounts and guests;
// technical decision 9). Passwords are Argon2id hashes. Session and reset
// tokens are random 256-bit strings; only their SHA-256 is stored, so a
// database leak gives nobody a way in.

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import {
  ApiErrorCode,
  GUEST_NAME_PREFIX,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_MINUTES,
  USERNAME_PATTERN,
  type AccountInfo,
} from '@blockyrts/protocol';
import type { Mailer } from './mailer.ts';
import { DuplicateError, type AccountRow, type Database, type SessionRow } from './db/types.ts';

export const SESSION_DAYS = 30;

/** A refused request, carrying the API error code and an HTTP status. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
  }
}

/** Who is making a request or holding a socket. */
export interface Identity {
  tokenHash: string;
  /** Null for a guest. */
  account: AccountInfo | null;
  /** The in-game name: the username, or "Guest 4821". */
  name: string;
}

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const newToken = (): string => randomBytes(32).toString('base64url');

export function guestName(): string {
  return `${GUEST_NAME_PREFIX}${randomInt(1000, 10000)}`;
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function info(a: AccountRow): AccountInfo {
  return { id: a.id, email: a.email, username: a.username };
}

// Checked against when a login names no account, so the response takes as long either way.
let dummyHash: Promise<string> | null = null;

export interface AccountServiceOptions {
  db: Database;
  /** Null when no email service is configured: reset requests are refused with email_not_configured. */
  mailer: Mailer | null;
  /** Base of the links in emails, such as https://play.example.com. */
  publicUrl: string;
  now?: () => Date;
}

export class AccountService {
  private readonly db: Database;
  private readonly mailer: Mailer | null;
  private readonly publicUrl: string;
  private readonly now: () => Date;

  constructor(opts: AccountServiceOptions) {
    this.db = opts.db;
    this.mailer = opts.mailer;
    this.publicUrl = opts.publicUrl.replace(/\/+$/, '');
    this.now = opts.now ?? (() => new Date());
  }

  private async newSession(accountId: string | null, guest: string | null): Promise<string> {
    const token = newToken();
    const now = this.now();
    const row: SessionRow = {
      tokenHash: sha256(token),
      accountId,
      guestName: guest,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
    };
    await this.db.createSession(row);
    return token;
  }

  /** A session for a guest: "Guest" and a random 4-digit number. */
  async createGuest(): Promise<{ token: string; identity: Identity }> {
    const name = guestName();
    const token = await this.newSession(null, name);
    return { token, identity: { tokenHash: sha256(token), account: null, name } };
  }

  /**
   * Makes an account and signs it in. If `replaceToken` names a guest
   * session, that session ends: the guest has become this account.
   */
  async register(input: { email: unknown; username: unknown; password: unknown }, replaceToken?: string): Promise<{ token: string; identity: Identity }> {
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new ApiFailure(400, ApiErrorCode.InvalidEmail, 'That email address does not look right.');
    if (!USERNAME_PATTERN.test(username) || username.toLowerCase().startsWith(GUEST_NAME_PREFIX.trim().toLowerCase())) {
      throw new ApiFailure(400, ApiErrorCode.InvalidUsername, 'Usernames are 3 to 20 letters, digits, _ or -, and cannot start with "Guest".');
    }
    checkPassword(password);
    const row: AccountRow = { id: randomUUID(), email, username, passwordHash: await argonHash(password), createdAt: this.now() };
    try {
      await this.db.createAccount(row);
    } catch (e) {
      if (e instanceof DuplicateError) {
        throw e.field === 'email'
          ? new ApiFailure(409, ApiErrorCode.EmailTaken, 'An account with that email already exists.')
          : new ApiFailure(409, ApiErrorCode.UsernameTaken, 'That username is taken.');
      }
      throw e;
    }
    if (replaceToken) await this.db.deleteSession(sha256(replaceToken));
    const token = await this.newSession(row.id, null);
    return { token, identity: { tokenHash: sha256(token), account: info(row), name: row.username } };
  }

  async login(input: { login: unknown; password: unknown }): Promise<{ token: string; identity: Identity }> {
    const login = typeof input.login === 'string' ? input.login.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const account = login && password.length <= MAX_PASSWORD_LENGTH ? await this.db.findAccountByLogin(login) : null;
    if (!account) {
      dummyHash ??= argonHash('not a real password');
      await argonVerify(await dummyHash, password.slice(0, MAX_PASSWORD_LENGTH)).catch(() => false);
      throw new ApiFailure(401, ApiErrorCode.BadCredentials, 'Wrong email, username or password.');
    }
    if (!(await argonVerify(account.passwordHash, password).catch(() => false))) {
      throw new ApiFailure(401, ApiErrorCode.BadCredentials, 'Wrong email, username or password.');
    }
    const token = await this.newSession(account.id, null);
    return { token, identity: { tokenHash: sha256(token), account: info(account), name: account.username } };
  }

  async logout(token: string): Promise<void> {
    await this.db.deleteSession(sha256(token));
  }

  /** Who a session token belongs to, or null if it is unknown or expired. */
  async identify(token: string): Promise<Identity | null> {
    if (!token || token.length > 128) return null;
    const tokenHash = sha256(token);
    const s = await this.db.findSession(tokenHash, this.now());
    if (!s) return null;
    if (s.accountId === null) return { tokenHash, account: null, name: s.guestName ?? guestName() };
    const a = await this.db.findAccountById(s.accountId);
    return a ? { tokenHash, account: info(a), name: a.username } : null;
  }

  /**
   * Emails a one-time link that sets a new password and expires in 30
   * minutes. Says nothing about whether the address has an account.
   */
  async requestReset(input: { email: unknown }): Promise<void> {
    if (!this.mailer) return;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!EMAIL_PATTERN.test(email)) return;
    const account = await this.db.findAccountByLogin(email);
    if (!account || account.email.toLowerCase() !== email.toLowerCase()) return;
    const token = newToken();
    await this.db.createReset({
      tokenHash: sha256(token),
      accountId: account.id,
      expiresAt: new Date(this.now().getTime() + PASSWORD_RESET_MINUTES * 60_000),
    });
    // The token rides in the fragment, which browsers never send to a server or in a Referer.
    const link = `${this.publicUrl}/reset-password#token=${token}`;
    await this.mailer.send({
      to: account.email,
      subject: 'Reset your Survive and Conquer password',
      text:
        `Hello ${account.username},\n\n` +
        `Someone asked to reset the password for your Survive and Conquer account. ` +
        `To choose a new one, open this link within ${PASSWORD_RESET_MINUTES} minutes:\n\n${link}\n\n` +
        `The link works once. If you did not ask for this, ignore this email; your password stays as it is.\n`,
    });
  }

  /** Whether password-reset email can be sent. */
  get canEmail(): boolean {
    return this.mailer !== null;
  }

  /** For the server admin when email is off: sets a password by email or username, and signs that account out everywhere. */
  async setPasswordByHand(login: string, password: string): Promise<AccountInfo> {
    checkPassword(password);
    const account = await this.db.findAccountByLogin(login.trim());
    if (!account) throw new ApiFailure(404, ApiErrorCode.NotFound, `No account is called ${login}.`);
    await this.db.setPasswordHash(account.id, await argonHash(password));
    await this.db.deleteSessionsForAccount(account.id);
    return info(account);
  }

  /** Sets the new password and signs every session out. */
  async confirmReset(input: { token: unknown; password: unknown }): Promise<void> {
    const token = typeof input.token === 'string' ? input.token : '';
    const password = typeof input.password === 'string' ? input.password : '';
    checkPassword(password);
    const accountId = token ? await this.db.consumeReset(sha256(token), this.now()) : null;
    if (!accountId) throw new ApiFailure(400, ApiErrorCode.ResetInvalid, 'That reset link has expired or was already used. Ask for a new one.');
    await this.db.setPasswordHash(accountId, await argonHash(password));
    await this.db.deleteSessionsForAccount(accountId);
  }
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new ApiFailure(400, ApiErrorCode.WeakPassword, `Passwords are at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
}
