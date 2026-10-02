// Bundled by the cross-browser test and loaded into each browser page. It
// exposes one function that runs the same headless simulation as Node.
import { createWorld, run, type InputFrame } from '@blockyrts/sim';

declare global {
  var runSim: (seed: number, steps: number, frames: InputFrame[], players: number) => { hashes: Array<[number, number]>; finalHash: number };
}

globalThis.runSim = (seed, steps, frames, players) => {
  const r = run(createWorld(seed, { players }), steps, frames);
  return { hashes: r.hashes, finalHash: r.finalHash };
};
