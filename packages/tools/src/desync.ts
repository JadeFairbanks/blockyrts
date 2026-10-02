// Desync tool: compares two clients' recordings (snapshot, frames since, and
// the hashes each computed), replays both offline and reports the first
// diverging checkpoint, step and field.
//
//   pnpm desync a.json b.json
import { resolve } from 'node:path';
import { compareRecordings } from '@blockyrts/sim';
import { loadRecording } from './script.ts';

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error('usage: pnpm desync <recording-a.json> <recording-b.json>');
  process.exit(2);
}
const cwd = process.env.INIT_CWD ?? process.cwd();
const report = compareRecordings(loadRecording(resolve(cwd, fileA)), loadRecording(resolve(cwd, fileB)));
if (!report) {
  console.log('No desync: every shared hash checkpoint agrees.');
} else {
  console.log(`First disagreeing checkpoint: step ${report.firstBadStep}`);
  console.log(report.diff ? `First differing field in the replays: ${report.diff}` : 'Both recordings replay identically on this machine.');
  if (report.notReproduced.length > 0) {
    console.log(`This machine does not reproduce the hashes of recording ${report.notReproduced.join(' and ')}: that client computed differently.`);
  }
  process.exitCode = 1;
}
