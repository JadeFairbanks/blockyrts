// Save slots: the bytes in a BlobStore, the listing in the database. A save
// always belongs to its match owner's account, so a multiplayer save is the
// host's (Accounts and saved data). The dawn autosave keeps the newest three
// per match; manual saves stay until deleted; an account may use 500 MB.

import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_SAVE_QUOTA_BYTES,
  ApiErrorCode,
  AUTOSAVES_PER_MATCH,
  MAX_SAVE_BYTES,
  readSaveHeader,
  WireError,
  type SaveHeader,
  type SaveSummary,
} from '@blockyrts/protocol';
import { ApiFailure, type Identity } from './accounts.ts';
import type { BlobStore } from './blobs.ts';
import type { Database, SaveRow } from './db/types.ts';

export interface SaveServiceOptions {
  db: Database;
  blobs: BlobStore;
  /** The account currently hosting a live room for the match, if any: the host role may have passed from the owner. */
  liveHostAccount?: (matchId: string) => string | null;
  now?: () => Date;
}

export function summary(row: SaveRow): SaveSummary {
  return {
    id: row.id,
    matchId: row.matchId,
    kind: row.kind,
    label: row.label,
    night: row.night,
    step: row.step,
    seed: row.seed,
    players: row.players.map((p) => ({ slot: p.slot, name: p.name, colour: p.colour })),
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class SaveService {
  private readonly db: Database;
  private readonly blobs: BlobStore;
  private readonly now: () => Date;
  liveHostAccount: (matchId: string) => string | null;
  /** One save at a time per account, so the quota check and the autosave rotation cannot race. */
  private readonly locks = new Map<string, Promise<unknown>>();
  private lastTime = 0;

  constructor(opts: SaveServiceOptions) {
    this.db = opts.db;
    this.blobs = opts.blobs;
    this.now = opts.now ?? (() => new Date());
    this.liveHostAccount = opts.liveHostAccount ?? (() => null);
  }

  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    }
  }

  /** Strictly increasing times, so "newest first" never ties. */
  private stamp(): Date {
    const t = Math.max(this.now().getTime(), this.lastTime + 1);
    this.lastTime = t;
    return new Date(t);
  }

  /** A new single-player match owned by the caller. */
  async createMatch(who: Identity | null, seed: unknown): Promise<string> {
    const account = requireAccount(who);
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new ApiFailure(400, ApiErrorCode.BadRequest, 'The seed must be a whole number from 0 to 4294967295.');
    }
    const id = randomUUID();
    await this.db.createMatch({ id, ownerAccountId: account, seed, createdAt: this.now() });
    return id;
  }

  /** Stores a save file for a match. */
  async store(who: Identity | null, matchId: string, kind: SaveRow['kind'], data: Uint8Array): Promise<SaveSummary> {
    const caller = requireAccount(who);
    const match = UUID.test(matchId) ? await this.db.findMatch(matchId) : null;
    if (!match) throw new ApiFailure(404, ApiErrorCode.NotFound, 'No such game.');
    const owner = match.ownerAccountId;
    if (owner === null) {
      throw new ApiFailure(403, ApiErrorCode.GuestMustRegister, "This game's host is a guest; the host must make an account before it can be saved.");
    }
    if (caller !== owner && this.liveHostAccount(matchId) !== caller) {
      throw new ApiFailure(403, ApiErrorCode.Forbidden, 'Only the host can save this game.');
    }
    if (data.length > MAX_SAVE_BYTES) throw new ApiFailure(413, ApiErrorCode.SaveTooLarge, 'That save is larger than 50 MB.');
    let header: SaveHeader;
    try {
      header = readSaveHeader(data);
    } catch (e) {
      if (e instanceof WireError) throw new ApiFailure(400, ApiErrorCode.BadSave, `Not a save file: ${e.message}.`);
      throw e;
    }
    const bodyAt = 12 + new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(8, true);
    if (data[bodyAt] !== 0x1f || data[bodyAt + 1] !== 0x8b) throw new ApiFailure(400, ApiErrorCode.BadSave, 'The save body is not compressed.');
    if (header.matchId !== matchId || header.seed !== match.seed) {
      throw new ApiFailure(400, ApiErrorCode.BadSave, 'That save belongs to a different game.');
    }

    return this.locked(owner, async () => {
      const prune = kind === 'autosave' ? (await this.db.listMatchSaves(matchId, 'autosave')).slice(AUTOSAVES_PER_MATCH - 1) : [];
      const freed = prune.reduce((n, s) => n + s.sizeBytes, 0);
      const used = await this.db.totalSaveBytes(owner);
      if (used - freed + data.length > ACCOUNT_SAVE_QUOTA_BYTES) {
        throw new ApiFailure(413, ApiErrorCode.QuotaExceeded, 'Your saved games use the 500 MB limit. Delete an old save to make room.');
      }
      const id = randomUUID();
      const row: SaveRow = {
        id,
        matchId,
        accountId: owner,
        kind,
        label: header.label.slice(0, 100),
        night: header.night,
        step: header.step,
        seed: header.seed,
        players: header.players,
        sizeBytes: data.length,
        formatVersion: header.formatVersion,
        blobKey: `saves/${owner}/${id}.sac`,
        createdAt: this.stamp(),
      };
      await this.blobs.put(row.blobKey, data);
      try {
        await this.db.insertSave(row);
      } catch (e) {
        await this.blobs.delete(row.blobKey).catch(() => undefined);
        throw e;
      }
      for (const old of prune) await this.remove(old);
      return summary(row);
    });
  }

  private async remove(row: SaveRow): Promise<void> {
    await this.db.deleteSave(row.id);
    await this.blobs.delete(row.blobKey).catch((e: unknown) => console.warn(`could not delete blob ${row.blobKey}:`, e));
  }

  async list(who: Identity | null): Promise<SaveSummary[]> {
    return (await this.db.listSaves(requireAccount(who))).map(summary);
  }

  private async owned(who: Identity | null, saveId: string): Promise<SaveRow> {
    const account = requireAccount(who);
    const row = UUID.test(saveId) ? await this.db.findSave(saveId) : null;
    if (!row || row.accountId !== account) throw new ApiFailure(404, ApiErrorCode.NotFound, 'No such save.');
    return row;
  }

  /** The save's bytes and metadata, for its owner. */
  async load(who: Identity | null, saveId: string): Promise<{ row: SaveRow; data: Uint8Array }> {
    const row = await this.owned(who, saveId);
    const data = await this.blobs.get(row.blobKey);
    if (!data) throw new ApiFailure(404, ApiErrorCode.NotFound, 'That save file is missing from storage.');
    return { row, data };
  }

  async delete(who: Identity | null, saveId: string): Promise<void> {
    const row = await this.owned(who, saveId);
    await this.locked(row.accountId, () => this.remove(row));
  }
}

function requireAccount(who: Identity | null): string {
  if (!who) throw new ApiFailure(401, ApiErrorCode.Unauthorized, 'Sign in first.');
  if (!who.account) throw new ApiFailure(403, ApiErrorCode.GuestMustRegister, 'Guests cannot save. Make an account to keep this game.');
  return who.account.id;
}
