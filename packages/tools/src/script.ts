// Loading order scripts and recordings from JSON files.
import { readFileSync } from 'node:fs';
import type { InputFrame, Recording } from '@blockyrts/sim';

export interface OrderScript {
  description?: string;
  frames: InputFrame[];
}

export function loadOrderScript(path: string): OrderScript {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as OrderScript;
  if (!Array.isArray(parsed.frames)) throw new Error(`${path}: expected a "frames" array`);
  return parsed;
}

interface RecordingJson {
  snapshot: string;
  frames: InputFrame[];
  hashes: Array<[number, number]>;
}

export function recordingToJson(rec: Recording): string {
  const out: RecordingJson = {
    snapshot: Buffer.from(rec.snapshot).toString('base64'),
    frames: rec.frames,
    hashes: rec.hashes,
  };
  return JSON.stringify(out);
}

export function loadRecording(path: string): Recording {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as RecordingJson;
  return {
    snapshot: new Uint8Array(Buffer.from(parsed.snapshot, 'base64')),
    frames: parsed.frames,
    hashes: parsed.hashes,
  };
}
