// Headless runner: runs the simulation from a seed with an optional order
// script and prints the state hash every 20 steps.
//
//   pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m0-demo.json
//
// Options: --seed N (default 1), --steps N (default 10000), --orders FILE,
// --players N (default: the script's "players", else 1),
// --quiet (print only the final hash), --record FILE (write a recording for
// the desync tool).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createWorld, hashHex, makeRecording, run } from '@blockyrts/sim';
import { loadOrderScript, recordingToJson } from './script.ts';

// Exit quietly when piped into head or similar.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    steps: { type: 'string', default: '10000' },
    orders: { type: 'string' },
    players: { type: 'string' },
    quiet: { type: 'boolean', default: false },
    record: { type: 'string' },
  },
});

// pnpm --filter runs scripts inside packages/tools; resolve paths against the caller's directory.
const cwd = process.env.INIT_CWD ?? process.cwd();
const seed = Number(values.seed);
const steps = Number(values.steps);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be an integer 0..4294967295');
if (!Number.isInteger(steps) || steps < 0) throw new Error('--steps must be a non-negative integer');
const script = values.orders ? loadOrderScript(resolve(cwd, values.orders)) : { frames: [], players: 1 };
const frames = script.frames;
const players = values.players ? Number(values.players) : (script.players ?? 1);
if (!Number.isInteger(players) || players < 1 || players > 8) throw new Error('--players must be 1 to 8');

const state = createWorld(seed, { players });
const recording = makeRecording(state);
recording.frames = frames;
const started = process.hrtime.bigint();
const result = run(state, steps, frames);
const ms = Number(process.hrtime.bigint() - started) / 1e6;
recording.hashes = result.hashes;

if (!values.quiet) {
  for (const [s, h] of result.hashes) console.log(`step ${s} hash ${hashHex(h)}`);
}
console.log(`final step ${result.finalStep} hash ${hashHex(result.finalHash)} (seed ${seed}, ${players} player${players === 1 ? '' : 's'}, ${frames.length} order frames, ${ms.toFixed(1)} ms)`);

if (values.record) {
  const path = resolve(cwd, values.record);
  writeFileSync(path, recordingToJson(recording));
  console.log(`recording written to ${path}`);
}
