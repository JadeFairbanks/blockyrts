// Bundled by the cross-browser test and loaded into each browser page. It
// exposes one function that runs the same headless simulation as Node.
import { createWorld, run, type InputFrame } from '@blockyrts/sim';

declare global {
  var runSim: (seed: number, steps: number, frames: InputFrame[], players: number, peaceful: boolean) => { hashes: Array<[number, number]>; finalHash: number };
}

globalThis.runSim = (seed, steps, frames, players, peaceful) => {
  const r = run(createWorld(seed, { players, peaceful }), steps, frames);
  return { hashes: r.hashes, finalHash: r.finalHash };
};
