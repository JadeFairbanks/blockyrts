// The HTTP API (accounts, saves, invite links) on Node's own http module.
// JSON in and out, except save files, which travel as raw bytes. Requests
// with a body must say application/json or application/octet-stream, which a
// cross-site form cannot, and the cookie is SameSite=Lax: together that is
// the CSRF protection.

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ApiErrorCode,
  ApiRoutes,
  MAX_SAVE_BYTES,
  SESSION_COOKIE,
  type ApiError,
  type MeResponse,
  type SessionResponse,
} from '@blockyrts/protocol';
import { ApiFailure, SESSION_DAYS, type AccountService, type Identity } from './accounts.ts';
import { RateLimiter } from './rate-limit.ts';
import type { SaveService } from './saves.ts';
import type { Relay } from './relay/relay.ts';

export interface HttpOptions {
  accounts: AccountService;
  saves: SaveService;
  relay: Relay;
  allowedOrigins: string[];
  /** Mark the cookie Secure (the public address is https; TLS ends at the edge). */
  secureCookie: boolean;
  addressOf: (req: IncomingMessage) => string;
  now?: () => number;
  log?: (message: string) => void;
  limits?: Partial<HttpLimits>;
}

/** Per address: attempts allowed per window. */
export interface HttpLimits {
  loginsPerMinute: number;
  accountsPerHour: number;
  resetsPerHour: number;
  guestsPerHour: number;
}

export const DEFAULT_HTTP_LIMITS: HttpLimits = { loginsPerMinute: 10, accountsPerHour: 5, resetsPerHour: 5, guestsPerHour: 30 };

const JSON_LIMIT = 16 * 1024;

/** The session token from the Authorization header or the cookie. */
export function tokenOf(req: IncomingMessage): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.cookie ?? '';
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return '';
}

/** The caller's address: the socket's, or the trusted proxy's header. */
export function addressReader(trustedProxy: '' | 'cloudflare' | 'x-forwarded-for'): (req: IncomingMessage) => string {
  return (req) => {
    if (trustedProxy === 'cloudflare') {
      const h = req.headers['cf-connecting-ip'];
      if (typeof h === 'string' && h) return h;
    } else if (trustedProxy === 'x-forwarded-for') {
      const h = req.headers['x-forwarded-for'];
      if (typeof h === 'string' && h) return h.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? '';
  };
}

async function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new ApiFailure(413, ApiErrorCode.SaveTooLarge, 'That request is too large.');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > limit) throw new ApiFailure(413, ApiErrorCode.SaveTooLarge, 'That request is too large.');
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function contentType(req: IncomingMessage): string {
  return (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (contentType(req) !== 'application/json') throw new ApiFailure(415, ApiErrorCode.BadRequest, 'Send JSON with Content-Type application/json.');
  const body = await readBody(req, JSON_LIMIT);
  try {
    const v: unknown = JSON.parse(Buffer.from(body).toString('utf8') || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiFailure(400, ApiErrorCode.BadRequest, 'The request body is not a JSON object.');
}

export function createHttpHandler(opts: HttpOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.log(m));
  const l = { ...DEFAULT_HTTP_LIMITS, ...opts.limits };
  const limits = {
    login: new RateLimiter(l.loginsPerMinute, 60_000),
    register: new RateLimiter(l.accountsPerHour, 3_600_000),
    reset: new RateLimiter(l.resetsPerHour, 3_600_000),
    guest: new RateLimiter(l.guestsPerHour, 3_600_000),
  };
  const limit = (which: keyof typeof limits, req: IncomingMessage): void => {
    if (!limits[which].take(opts.addressOf(req), now())) {
      throw new ApiFailure(429, ApiErrorCode.RateLimited, 'Too many attempts. Wait a little and try again.');
    }
  };

  const cookie = (token: string, maxAge: number): string =>
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${opts.secureCookie ? '; Secure' : ''}`;

  const sendJson = (res: ServerResponse, status: number, body: unknown, setCookie?: string): void => {
    const data = Buffer.from(JSON.stringify(body));
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (setCookie) res.setHeader('Set-Cookie', setCookie);
    res.end(data);
  };

  const session = (res: ServerResponse, status: number, s: { token: string; identity: Identity }): void => {
    const body: SessionResponse = { account: s.identity.account, name: s.identity.name, debugger: opts.accounts.canDebug(s.identity), token: s.token };
    sendJson(res, status, body, cookie(s.token, SESSION_DAYS * 86_400));
  };

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const who = (): Promise<Identity | null> => opts.accounts.identify(tokenOf(req));

    if (path === ApiRoutes.health && (method === 'GET' || method === 'HEAD')) {
      // The deploy workflow waits until this names the commit it shipped.
      return sendJson(res, 200, { ok: true, build: process.env.BUILD_SHA ?? 'dev', rooms: opts.relay.rooms.size });
    }

    if (path === ApiRoutes.accounts && method === 'POST') {
      limit('register', req);
      const body = await readJson(req);
      const current = await who();
      const s = await opts.accounts.register(
        { email: body.email, username: body.username, password: body.password },
        current && !current.account ? tokenOf(req) : undefined,
      );
      return session(res, 201, s);
    }
    if (path === ApiRoutes.sessions && method === 'POST') {
      limit('login', req);
      const body = await readJson(req);
      return session(res, 200, await opts.accounts.login({ login: body.login, password: body.password }));
    }
    if (path === ApiRoutes.sessions && method === 'DELETE') {
      const token = tokenOf(req);
      if (token) await opts.accounts.logout(token);
      res.statusCode = 204;
      res.setHeader('Set-Cookie', cookie('', 0));
      return void res.end();
    }
    if (path === ApiRoutes.guests && method === 'POST') {
      limit('guest', req);
      return session(res, 201, await opts.accounts.createGuest());
    }
    if (path === ApiRoutes.me && method === 'GET') {
      const id = await who();
      const body: MeResponse = { account: id?.account ?? null, name: id?.name ?? null, guest: id !== null && id.account === null, debugger: opts.accounts.canDebug(id) };
      return sendJson(res, 200, body);
    }
    if (path === ApiRoutes.passwordResets && method === 'POST') {
      limit('reset', req);
      const body = await readJson(req);
      if (!opts.accounts.canEmail) {
        throw new ApiFailure(503, ApiErrorCode.EmailNotConfigured, 'Password reset email is not set up on this server. Ask its admin to reset your password.');
      }
      // Sent in the background: answering at once whether or not the address is known reveals nothing.
      opts.accounts.requestReset({ email: body.email }).catch((e: unknown) => log(`http: reset email failed: ${String(e)}`));
      return sendJson(res, 202, { ok: true });
    }
    if (path === ApiRoutes.passwordResetConfirm && method === 'POST') {
      limit('reset', req);
      const body = await readJson(req);
      await opts.accounts.confirmReset({ token: body.token, password: body.password });
      res.statusCode = 204;
      return void res.end();
    }
    if (path === ApiRoutes.matches && method === 'POST') {
      const body = await readJson(req);
      return sendJson(res, 201, { matchId: await opts.saves.createMatch(await who(), body.seed) });
    }
    const matchSave = /^\/api\/matches\/([^/]+)\/(saves|autosave)$/.exec(path);
    if (matchSave && method === 'POST') {
      if (contentType(req) !== 'application/octet-stream') {
        throw new ApiFailure(415, ApiErrorCode.BadRequest, 'Send the save file with Content-Type application/octet-stream.');
      }
      const id = await who();
      const data = await readBody(req, MAX_SAVE_BYTES);
      const kind = matchSave[2] === 'autosave' || url.searchParams.get('kind') === 'autosave' ? 'autosave' : 'manual';
      return sendJson(res, 201, await opts.saves.store(id, decodeURIComponent(matchSave[1]!), kind, data));
    }
    if (path === ApiRoutes.saves && method === 'GET') return sendJson(res, 200, { saves: await opts.saves.list(await who()) });
    const save = /^\/api\/saves\/([^/]+)$/.exec(path);
    if (save && method === 'GET') {
      const { data, row } = await opts.saves.load(await who(), decodeURIComponent(save[1]!));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="night-${row.night}.sac"`);
      res.setHeader('Cache-Control', 'no-store');
      return void res.end(data);
    }
    if (save && method === 'DELETE') {
      await opts.saves.delete(await who(), decodeURIComponent(save[1]!));
      res.statusCode = 204;
      return void res.end();
    }
    if (path === ApiRoutes.rooms && method === 'GET') {
      const id = await who();
      return sendJson(res, 200, { rooms: opts.relay.openRooms({ accountId: id?.account?.id ?? '', tokenHash: id?.tokenHash ?? '', address: opts.addressOf(req) }) });
    }
    const room = /^\/api\/rooms\/([^/]+)$/.exec(path);
    if (room && method === 'GET') {
      const info = opts.relay.roomInfo(decodeURIComponent(room[1]!));
      if (!info) throw new ApiFailure(404, ApiErrorCode.NotFound, 'No game has that code. It may have ended.');
      return sendJson(res, 200, info);
    }
    throw new ApiFailure(404, ApiErrorCode.NotFound, 'No such page.');
  };

  return (req, res) => {
    const origin = req.headers.origin;
    if (origin && opts.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '600');
        res.statusCode = 204;
        res.end();
        return;
      }
    }
    route(req, res).catch((e: unknown) => {
      if (res.headersSent) return void res.destroy();
      if (e instanceof ApiFailure) {
        const body: ApiError = { error: e.code, message: e.message };
        return sendJson(res, e.status, body);
      }
      log(`http: ${req.method} ${req.url} failed: ${(e as Error).stack ?? String(e)}`);
      const body: ApiError = { error: 'server_error', message: 'Something went wrong on the server.' };
      sendJson(res, 500, body);
    });
  };
}
