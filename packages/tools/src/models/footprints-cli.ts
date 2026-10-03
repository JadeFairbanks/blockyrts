// pnpm --filter @blockyrts/tools footprints: measures every modelled level of
// the sim's footprint table (packages/sim/src/buildings/footprints.ts) from
// its catalogue models and prints the rows, marking each level that differs
// from the table and each post that does not stand on the model's top. Paste
// the printed rows into the table after a model changes.
import { BuildingKind } from '@blockyrts/sim';
import { checkFootprints } from './footprints.ts';
import { readModel } from './model-files.ts';

const names = Object.fromEntries(Object.entries(BuildingKind).map(([name, n]) => [n, name]));
let off = 0;
for (const c of checkFootprints(readModel)) {
  const same = c.measured.every((r, k) => r === c.table[k]);
  if (!same || c.posts.length > 0) off++;
  console.log(`${names[c.kind] ?? c.kind} level ${c.level}${c.fitted ? ' (set by hand)' : ''}${same ? '' : ': DIFFERS from the table'}`);
  for (const r of c.measured) console.log(`  '${r}',`);
  for (const p of c.posts) console.log(`  ${p}`);
}
console.log(off === 0 ? 'Every modelled level matches the table.' : `${off} level(s) differ from the table.`);
process.exitCode = off === 0 ? 0 : 1;
