import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareRecordings, createWorld, makeRecording, run } from '@blockyrts/sim';
import { loadRecording, recordingToJson } from '../src/script.ts';

describe('recording files', () => {
  it('round-trip through JSON and compare clean', () => {
    const s = createWorld(4);
    const rec = makeRecording(s);
    rec.hashes = run(s, 200).hashes;
    const path = join(mkdtempSync(join(tmpdir(), 'sac-')), 'rec.json');
    writeFileSync(path, recordingToJson(rec));
    const back = loadRecording(path);
    expect(back.snapshot).toEqual(rec.snapshot);
    expect(back.hashes).toEqual(rec.hashes);
    expect(compareRecordings(rec, back)).toBeNull();
  });
});
