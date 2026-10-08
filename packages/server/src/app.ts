// Wires the pieces into one Node HTTP server: the API on /api, the relay
// WebSocket on /relay, and /healthz. TLS ends at the edge (Cloudflare or
// Caddy); this process speaks plain HTTP behind it.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AccountService } from './accounts.ts';
import { DiskBlobStore, MemoryBlobStore, S3BlobStore, type BlobStore } from './blobs.ts';
import type { Config } from './config.ts';
import { MemoryDatabase } from './db/memory.ts';
import { PostgresDatabase } from './db/postgres.ts';
import type { Database } from './db/types.ts';
import { addressReader, createHttpHandler, tokenOf, type HttpLimits } from './http.ts';
import { HttpMailer, type Mailer } from './mailer.ts';
import { Relay } from './relay/relay.ts';
import type { RoomTimings } from './relay/room.ts';
import { SaveService } from './saves.ts';

export interface AppDeps {
  db?: Database;
  blobs?: BlobStore;
  /** Null turns reset email off; undefined builds one from the config. */
  mailer?: Mailer | null;
  log?: (message: string) => void;
  /** Shorter room timeouts, for tests. */
  timings?: Partial<RoomTimings>;
  /** Looser per-address API limits, for tests that sign many people up from one address. */
  limits?: Partial<HttpLimits>;
}

export interface App {
  server: Server;
  relay: Relay;
  db: Database;
  /** The port actually bound (useful with port 0 in tests). */
  port: number;
  close(): Promise<void>;
}

export async function startApp(config: Config, deps: AppDeps = {}): Promise<App> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const db = deps.db ?? (config.databaseUrl ? await PostgresDatabase.connect(config.databaseUrl) : new MemoryDatabase());
  const blobs =
    deps.blobs ??
    (config.saveStore === 's3' ? new S3BlobStore(config.s3) : config.saveStore === 'disk' ? new DiskBlobStore(config.saveDir) : new MemoryBlobStore());
  const mailer = deps.mailer ?? (config.emailApiKey ? new HttpMailer({ apiKey: config.emailApiKey, from: config.emailFrom, url: config.emailApiUrl }) : null);
  if (!deps.db && !config.databaseUrl) log('server: no DATABASE_URL, accounts and saves are kept in memory only');
  if (!deps.blobs && config.saveStore === 'memory') log('server: SAVE_STORE is memory, save files are lost on restart');
  if (!mailer) log('server: no EMAIL_API_KEY, password reset email is off (an admin can set a password with --set-password)');

  const addressOf = addressReader(config.trustedProxy);
  const accounts = new AccountService({ db, mailer, publicUrl: config.publicUrl, debugAccounts: config.debugAccounts });
  const saves = new SaveService({ db, blobs });
  const relay = new Relay({ accounts, saves, db, tokenOf, addressOf, allowedOrigins: config.allowedOrigins, log, ...(deps.timings ? { timings: deps.timings } : {}) });
  saves.liveHostAccount = (matchId) => relay.hostAccountOf(matchId);
  // A new version is live: older saves' files go, in the background (Patch 5).
  void saves
    .expireOutdated()
    .then((n) => {
      if (n > 0) log(`server: removed ${n} save files from older versions of the game`);
    })
    .catch((e: unknown) => log(`server: could not remove outdated saves: ${String(e)}`));
  const handler = createHttpHandler({
    accounts,
    saves,
    relay,
    allowedOrigins: config.allowedOrigins,
    secureCookie: config.publicUrl.startsWith('https:'),
    addressOf,
    log,
    ...(deps.limits ? { limits: deps.limits } : {}),
  });

  const server = createServer(handler);
  // Cloudflare closes connections idle for 100 s; keep-alive below that.
  server.keepAliveTimeout = 65_000;
  server.on('upgrade', (req, socket, head) => relay.handleUpgrade(req, socket, head));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  log(`server: listening on port ${port}`);

  return {
    server,
    relay,
    db,
    port,
    async close() {
      await relay.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
