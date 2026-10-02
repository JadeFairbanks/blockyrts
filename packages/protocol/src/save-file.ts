// The save file: one versioned container for a whole match (technical
// decision 4). The same bytes are a save slot on the server, the snapshot a
// peer hands a rejoining player, and the state everyone reloads after a
// desync.
//
//   0   "SACF"                       magic
//   4   u16 container version        (this layout; 1)
//   6   u16 flags                    (bit 0: body is gzip)
//   8   u32 header length
//   12  header                       uncompressed, so the server can list a
//                                     save without unpacking it
//   ..  body                         gzip of the sections
//
// Each section is a 4-character tag, a u16 section version, a u32 length and
// its bytes. The sim's whole-state snapshot is the SIMS section; edited
// chunks are the CHNK section; later milestones add sections with new tags,
// and a reader skips tags it does not know. The number tables are never in a
// save, so balance patches apply to old saves.

import { MAX_PLAYERS } from './constants.ts';
import { utf8Decoder, utf8Encoder } from './text.ts';
import { Reader, WireError, Writer } from './wire.ts';

const MAGIC = 0x46434153; // "SACF" little-endian
export const SAVE_CONTAINER_VERSION = 1;
const FLAG_GZIP = 1;

/** Section tags. */
export const SaveSection = {
  /** The sim's canonical whole-state serialisation (serializeState in @blockyrts/sim). */
  SimState: 'SIMS',
  /** Edited chunks, as encodeChunkDeltas writes them. */
  ChunkDeltas: 'CHNK',
} as const;

export interface SavePlayer {
  slot: number;
  name: string;
  colour: number;
  /** The player's account id, or '' for a guest. Used to give each returning player their slot. */
  accountId: string;
}

export interface SaveHeader {
  /** The game's save format version, for the per-version migration functions. */
  formatVersion: number;
  gameVersion: string;
  matchId: string;
  seed: number;
  step: number;
  night: number;
  label: string;
  players: SavePlayer[];
}

export interface SaveSectionData {
  tag: string;
  version: number;
  data: Uint8Array;
}

function writeHeader(h: SaveHeader): Uint8Array {
  const w = new Writer(128);
  w.u16(h.formatVersion).str(h.gameVersion).str(h.matchId).u32(h.seed).u32(h.step).u32(h.night).str(h.label);
  w.varuint(h.players.length);
  for (const p of h.players) w.u8(p.slot).str(p.name).u8(p.colour).str(p.accountId);
  return w.finish();
}

function readHeaderBytes(b: Uint8Array): SaveHeader {
  const r = new Reader(b);
  const formatVersion = r.u16();
  const gameVersion = r.str(64);
  const matchId = r.str(64);
  const seed = r.u32();
  const step = r.u32();
  const night = r.u32();
  const label = r.str(256);
  const n = r.varuint();
  if (n > MAX_PLAYERS) throw new WireError('too many players in save');
  const players: SavePlayer[] = [];
  for (let i = 0; i < n; i++) players.push({ slot: r.u8(), name: r.str(64), colour: r.u8(), accountId: r.str(64) });
  r.end();
  return { formatVersion, gameVersion, matchId, seed, step, night, label, players };
}

function tagBytes(tag: string): Uint8Array {
  if (!/^[A-Z0-9]{4}$/.test(tag)) throw new WireError(`bad section tag ${tag}`);
  return utf8Encoder.encode(tag);
}

/** Builds a save file. Async because it compresses with the platform's CompressionStream. */
export async function writeSaveFile(header: SaveHeader, sections: readonly SaveSectionData[]): Promise<Uint8Array> {
  const body = new Writer(1024);
  for (const s of sections) body.raw(tagBytes(s.tag)).u16(s.version).u32(s.data.length).raw(s.data);
  const packed = await gzip(body.finish());
  const head = writeHeader(header);
  const w = new Writer(12 + head.length + packed.length);
  w.u32(MAGIC).u16(SAVE_CONTAINER_VERSION).u16(FLAG_GZIP).u32(head.length).raw(head).raw(packed);
  return w.finish();
}

function split(bytes: Uint8Array): { header: SaveHeader; flags: number; body: Uint8Array } {
  const r = new Reader(bytes);
  if (r.u32() !== MAGIC) throw new WireError('not a save file');
  const version = r.u16();
  if (version !== SAVE_CONTAINER_VERSION) throw new WireError(`unsupported save container version ${version}`);
  const flags = r.u16();
  const headLen = r.u32();
  const header = readHeaderBytes(r.raw(headLen));
  return { header, flags, body: r.raw(r.remaining) };
}

/** Reads only the header: cheap, no decompression. Throws WireError on anything malformed. */
export function readSaveHeader(bytes: Uint8Array): SaveHeader {
  return split(bytes).header;
}

/** Reads the whole save. Unknown section tags are kept so a caller can ignore them. */
export async function readSaveFile(bytes: Uint8Array): Promise<{ header: SaveHeader; sections: Map<string, SaveSectionData> }> {
  const { header, flags, body } = split(bytes);
  const raw = flags & FLAG_GZIP ? await gunzip(body) : body;
  const r = new Reader(raw);
  const sections = new Map<string, SaveSectionData>();
  while (!r.done) {
    const tag = utf8Decoder.decode(r.raw(4));
    const version = r.u16();
    const data = r.raw(r.u32());
    sections.set(tag, { tag, version, data });
  }
  return { header, sections };
}

/** One edited chunk: its chunk coordinates and the sim's opaque delta bytes. */
export interface ChunkDelta {
  cx: number;
  cz: number;
  data: Uint8Array;
}

export function encodeChunkDeltas(chunks: readonly ChunkDelta[]): Uint8Array {
  const w = new Writer(64);
  w.varuint(chunks.length);
  for (const c of chunks) w.i32(c.cx).i32(c.cz).bytes(c.data);
  return w.finish();
}

export function decodeChunkDeltas(bytes: Uint8Array): ChunkDelta[] {
  const r = new Reader(bytes);
  const n = r.varuint();
  const out: ChunkDelta[] = [];
  for (let i = 0; i < n; i++) out.push({ cx: r.i32(), cz: r.i32(), data: r.bytes() });
  r.end();
  return out;
}

// gzip through the CompressionStream every supported browser and Node 22 have,
// typed structurally so this package needs neither the DOM nor Node types.

interface StreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}
interface StreamWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface TransformLike {
  readable: { getReader(): StreamReader };
  writable: { getWriter(): StreamWriter };
}
type TransformCtor = new (format: 'gzip') => TransformLike;

async function transform(ctorName: 'CompressionStream' | 'DecompressionStream', data: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as Record<string, TransformCtor | undefined>)[ctorName];
  if (!Ctor) throw new Error(`${ctorName} is not available on this platform`);
  const ts = new Ctor('gzip');
  const writer = ts.writable.getWriter();
  // Not awaited before reading: the stream applies backpressure until read.
  const written = writer.write(data).then(() => writer.close());
  // A corrupt input fails both ends; the reader's error is the one reported.
  written.catch(() => undefined);
  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await written;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function gzip(data: Uint8Array): Promise<Uint8Array> {
  return transform('CompressionStream', data);
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  try {
    return await transform('DecompressionStream', data);
  } catch (e) {
    throw new WireError(`save body does not decompress: ${(e as Error).message}`);
  }
}
