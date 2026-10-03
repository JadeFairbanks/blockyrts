// Simulation speed check (Technical decisions 10: 3,000 live mobile units in
// 25 ms a step on the minimum machine, 6,000 on the reference one). Builds
// the night 80 fixture town (balance harness), lets night fall, sets down N
// monsters of the night's kinds on a ring 30 to 70 m out, all coming for the
// town, and times the steps while they march, break walls and fight.
//
//   pnpm --filter @blockyrts/tools perf:sim [--units 3000,6000] [--steps 400]
import { parseArgs } from 'node:util';
import { addMob, CYCLE_STEPS, DAY_STEPS, DUSK_STEPS, hashHex, hashState, Mob, step, UnitKind, WU_PER_METRE } from '@blockyrts/sim';
import { buildFixture, defenceFor } from './harness/defence.ts';

const { values } = parseArgs({
  options: {
    units: { type: 'string', default: '3000,6000' },
    steps: { type: 'string', default: '400' },
    seed: { type: 'string', default: '1' },
  },
});

/** Walkers, a climber, a fast pack runner, archers and brutes: the mix a late night sends. */
const KINDS = [Mob.Zombie, Mob.GiantRat, Mob.SkeletonArcher, Mob.GraveHound, Mob.GoblinCutter, Mob.Hellhound, Mob.Fiend, Mob.BloatedCorpse];

/** A ring point for the k-th of n: whole-number spiral, no trig. */
function ringPoint(k: number, n: number): [number, number] {
  const r = (30 + ((k * 7) % 41)) * WU_PER_METRE;
  // Walk the square ring of half-side r: 8r steps round it.
  const t = Math.floor((k * 8 * r) / n);
  const side = Math.floor(t / (2 * r));
  const u = (t % (2 * r)) - r;
  return side === 0 ? [u, -r] : side === 1 ? [r, u] : side === 2 ? [-u, r] : [-r, -u];
}

function mobile(e: ReturnType<typeof buildFixture>['state']['entities']): number {
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.hp[i]! > 0 && (e.kind[i] === UnitKind.Mob || e.kind[i] === UnitKind.Warrior || e.kind[i] === UnitKind.Worker || e.kind[i] === UnitKind.Mage)) n++;
  return n;
}

const night = 80;
for (const units of values.units.split(',').map(Number)) {
  const { state: s } = buildFixture(Number(values.seed), defenceFor(night));
  while (s.step < night * CYCLE_STEPS + DAY_STEPS + DUSK_STEPS + 1) step(s);
  for (let k = 0; k < units; k++) {
    const [x, z] = ringPoint(k, units);
    addMob(s, KINDS[k % KINDS.length]!, 0, x, z, night);
  }
  const times: number[] = [];
  let live = 0;
  const steps = Number(values.steps);
  for (let k = 0; k < steps; k++) {
    const t0 = process.hrtime.bigint();
    step(s);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (k % 20 === 0) live += mobile(s.entities);
  }
  const warm = times.slice(Math.floor(steps / 10)).sort((a, b) => a - b);
  const mean = warm.reduce((a, b) => a + b, 0) / warm.length;
  const p95 = warm[Math.floor(warm.length * 0.95)]!;
  const max = warm[warm.length - 1]!;
  console.log(`${units} monsters set down: ${Math.round(live / Math.ceil(steps / 20))} live mobile units on average; step mean ${mean.toFixed(1)} ms, 95th percentile ${p95.toFixed(1)} ms, worst ${max.toFixed(1)} ms (target 25 ms); hash ${hashHex(hashState(s))}`);
}
