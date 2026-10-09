// Save files from the page (technical decision 4): the sim's snapshot in the
// SIMS section, and who sat where in the SEAT section, so a loaded match gives
// each returning player their own people. The newest dawn autosave of each
// recent match is also kept in this browser (IndexedDB), and any save can be
// downloaded as a .sac file and opened again from the Load screen.
import { readSaveFile, SAVE_FORMAT_VERSION, SaveSection, writeSaveFile, type SaveHeader, type SavePlayer } from '@blockyrts/protocol';
import { OLD_SAVE_TEXT } from '@blockyrts/sim';

const utf8 = { encode: (t: string): Uint8Array => new TextEncoder().encode(t), decode: (b: Uint8Array): string => new TextDecoder().decode(b) };

/** The game's save format version (in the protocol since Patch 5, so the server knows it too) and the build that wrote a save. */
export { SAVE_FORMAT_VERSION };
export const GAME_VERSION = '0.11.0';
export { OLD_SAVE_TEXT };

/** The SEAT section: one entry per sim player, in player order. */
export const SEAT_SECTION = 'SEAT';

/**
 * A sim player's seat: the relay slot that plays them (-1 when nobody does,
 * as for the empty pockets of a game started alone with more players), their
 * name and their colour (an index into PLAYER_COLOURS).
 */
export interface Seat {
  slot: number;
  name: string;
  colour: number;
  /** The player's account id, or '' for a guest or nobody. */
  accountId: string;
}

/** What a page needs to know about the match it is saving. */
export interface MatchMeta {
  matchId: string;
  seed: number;
  seats: Seat[];
}

/** A worker snapshot: the sim's state at a step between steps. */
export interface Snapshot {
  step: number;
  night: number;
  data: Uint8Array;
}

/**
 * Builds a save file. The header lists only the seats a person plays who is
 * still in the game: those are the places the relay holds for a continued
 * game, so a player who left or was beaten does not keep it from starting.
 */
export function makeSave(meta: MatchMeta, snap: Snapshot, label: string, out: readonly boolean[] = []): Promise<Uint8Array> {
  const players: SavePlayer[] = [];
  meta.seats.forEach((s, p) => {
    if (s.slot >= 0 && !out[p]) players.push({ slot: s.slot, name: s.name, colour: s.colour, accountId: s.accountId });
  });
  const header: SaveHeader = {
    formatVersion: SAVE_FORMAT_VERSION,
    gameVersion: GAME_VERSION,
    matchId: meta.matchId,
    seed: meta.seed,
    step: snap.step,
    night: snap.night,
    label,
    players,
  };
  const seats = utf8.encode(JSON.stringify({ seats: meta.seats.map(({ slot, name, colour }) => ({ slot, name, colour })) }));
  return writeSaveFile(header, [
    { tag: SaveSection.SimState, version: 1, data: snap.data },
    { tag: SEAT_SECTION, version: 1, data: seats },
  ]);
}

export interface OpenedSave {
  header: SaveHeader;
  /** The sim's serialised state. */
  sim: Uint8Array;
  /** One per sim player; a save without a SEAT section gets them from the header. */
  seats: Seat[];
}

/** Reads a save file; throws with a sentence for people when it is not one. */
export async function openSave(bytes: Uint8Array): Promise<OpenedSave> {
  let file;
  try {
    file = await readSaveFile(bytes);
  } catch {
    throw new Error('That is not a Survive and Conquer save file.');
  }
  if (file.header.formatVersion !== SAVE_FORMAT_VERSION) throw new Error(OLD_SAVE_TEXT);
  const sims = file.sections.get(SaveSection.SimState);
  if (!sims) throw new Error('That save has no game in it.');
  const accounts = new Map(file.header.players.map((p) => [p.slot, p.accountId]));
  let seats: Seat[] = file.header.players.map((p) => ({ slot: p.slot, name: p.name, colour: p.colour, accountId: p.accountId }));
  const seat = file.sections.get(SEAT_SECTION);
  if (seat) {
    try {
      const parsed = JSON.parse(utf8.decode(seat.data)) as { seats?: Array<Partial<Seat>> };
      seats = (parsed.seats ?? []).map((s) => {
        const slot = Number.isInteger(s.slot) ? s.slot! : -1;
        return { slot, name: String(s.name ?? ''), colour: Number.isInteger(s.colour) ? s.colour! : 0, accountId: accounts.get(slot) ?? '' };
      });
    } catch {
      // A damaged seat list: the header's players stand in.
    }
  }
  return { header: file.header, sim: sims.data, seats };
}

/** The sim player each relay slot plays: seats[p] is the slot of player p. */
export function seatSlots(seats: readonly Seat[]): number[] {
  return seats.map((s) => s.slot);
}

/** A save's file name for downloading: the night and the date. */
export function saveFileName(header: SaveHeader, when = new Date()): string {
  const d = when.toISOString().slice(0, 10);
  return `survive-and-conquer-night-${header.night}-${d}.sac`;
}

/** Hands a save to the browser as a download. */
export function downloadSave(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------- saves kept in this browser

const DB_NAME = 'survive-and-conquer';
const STORE = 'autosaves';
/** Matches whose newest dawn autosave this browser keeps. */
export const LOCAL_AUTOSAVES = 5;

export interface LocalSave {
  matchId: string;
  savedAt: number;
  night: number;
  step: number;
  seed: number;
  players: string[];
  data: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'matchId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
  });
}

function all(db: IDBDatabase): Promise<LocalSave[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as LocalSave[]);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
  });
}

/** Keeps this save as the match's newest local autosave, and forgets the oldest matches past LOCAL_AUTOSAVES. Never throws. */
export async function keepLocal(header: SaveHeader, data: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    const record: LocalSave = {
      matchId: header.matchId,
      savedAt: Date.now(),
      night: header.night,
      step: header.step,
      seed: header.seed,
      players: header.players.map((p) => p.name),
      data,
    };
    const old = (await all(db)).filter((s) => s.matchId !== header.matchId).sort((a, b) => b.savedAt - a.savedAt);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(record);
      for (const s of old.slice(LOCAL_AUTOSAVES - 1)) store.delete(s.matchId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB failed'));
    });
    db.close();
  } catch {
    // Storage blocked or full: the server copy (when there is one) still stands.
  }
}

/** This browser's autosaves, newest first. */
export async function localSaves(): Promise<LocalSave[]> {
  try {
    const db = await openDb();
    const list = await all(db);
    db.close();
    return list.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function forgetLocal(matchId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(matchId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB failed'));
    });
    db.close();
  } catch {
    // Nothing to forget.
  }
}
