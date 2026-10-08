// Balance harness (Technical decisions 11): the pacing check and supply at
// night 110 worked out from the sim's own tables (harness/pacing.ts), then
// the wave versus defence checks at nights 0, 10, 20, 40, 60, 80 and 110
// against fixture towns, one CSV row per run (harness/defence.ts). Run it
// again after a balance change to see what moved.
//
//   pnpm --filter @blockyrts/tools balance                  everything, seeds 1 to 3 (about 10 minutes)
//   pnpm --filter @blockyrts/tools balance --pacing         the pacing and supply checks only (a second)
//   pnpm --filter @blockyrts/tools balance --nights 0,10 --seeds 1,2 [--csv out.csv]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFENCES, NIGHT_COLUMNS, runNight, type NightRow } from './harness/defence.ts';
import { DEFAULT_ASSUMPTIONS, NIGHT_110_TOWN, pacingCheck, supplyCheck } from './harness/pacing.ts';

const { values } = parseArgs({
  options: {
    nights: { type: 'string', default: DEFENCES.map((d) => d.night).join(',') },
    seeds: { type: 'string', default: '1,2,3' },
    csv: { type: 'string' },
    pacing: { type: 'boolean', default: false },
  },
});
const cwd = process.env.INIT_CWD ?? process.cwd();

const a = DEFAULT_ASSUMPTIONS;
console.log(`Pacing check: ${a.startWorkers} workers at the start, ${a.workersPerDay} more a day (at most ${a.maxWorkers}), ${a.ladderSharePm / 10}% of the working day on the tech ladder (s)`);
console.log('tier,target nights,build ws,material worker-s,research s,lands on night,verdict');
for (const r of pacingCheck()) console.log([r.tier, r.target, r.buildS, r.materialS, r.researchS, r.night, r.verdict].join(','));
const t = NIGHT_110_TOWN;
const sup = supplyCheck();
console.log(`\nSupply at night 110: ${t.warriors} warriors, ${t.mages} mages, ${t.workers} workers, ${t.lodges} Lodges; main base ${t.mainBaseLevel} and ${t.farms} Farms`);
console.log(`supply ${sup.supplyUsed} of ${sup.supplyCap}; ${sup.nutritionPerDay} nutrition a day, ${sup.perFarmer} per farmer as farm fare: ${sup.farmersNeeded} farmers (room for ${sup.farmersRoom}): ${sup.ok ? 'carries' : 'SHORT'}`);
if (values.pacing) process.exit(0);

console.log('\nWave versus defence:');
const nights = values.nights.split(',').map(Number);
const seeds = values.seeds.split(',').map(Number);
const rows: NightRow[] = [];
console.log(NIGHT_COLUMNS.join(','));
for (const night of nights) {
  for (const seed of seeds) {
    const t0 = process.hrtime.bigint();
    const row = runNight(seed, night);
    rows.push(row);
    console.log(NIGHT_COLUMNS.map((k) => String(row[k])).join(','), `# ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)} s`);
  }
}
if (values.csv) {
  writeFileSync(resolve(cwd, values.csv), [NIGHT_COLUMNS.join(','), ...rows.map((r) => NIGHT_COLUMNS.map((k) => String(r[k])).join(','))].join('\n') + '\n');
}
