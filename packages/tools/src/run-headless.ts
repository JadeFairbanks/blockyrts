// Headless runner: runs the simulation from a seed with an optional order
// script and prints the state hash every 20 steps.
//
//   pnpm sim:run --seed 1 --steps 10000 --orders packages/tools/orders/m0-demo.json
//
// Options: --seed N (default 1), --steps N (default 10000), --orders FILE,
// --quiet (print only the final hash), --record FILE (write a recording for
// the desync tool).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createWorld, hashHex, makeRecording, run } from '@blockyrts/sim';
import { loadOrderScript, recordingToJson } from './script.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    steps: { type: 'string', default: '10000' },
    orders: { type: 'string' },
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
const frames = values.orders ? loadOrderScript(resolve(cwd, values.orders)).frames : [];

const state = createWorld(seed);
const recording = makeRecording(state);
recording.frames = frames;
const started = process.hrtime.bigint();
const result = run(state, steps, frames);
const ms = Number(process.hrtime.bigint() - started) / 1e6;
recording.hashes = result.hashes;

if (!values.quiet) {
  for (const [s, h] of result.hashes) console.log(`step ${s} hash ${hashHex(h)}`);
}
console.log(`final step ${result.finalStep} hash ${hashHex(result.finalHash)} (seed ${seed}, ${frames.length} order frames, ${ms.toFixed(1)} ms)`);

if (values.record) {
  const path = resolve(cwd, values.record);
  writeFileSync(path, recordingToJson(recording));
  console.log(`recording written to ${path}`);
}
