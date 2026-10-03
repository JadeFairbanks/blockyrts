// Applies a balance editor export (balance-changes-YYYY-MM-DD.json) to the
// sim's data files and reports what it could not do:
//
//   pnpm --filter @blockyrts/tools balance:apply <file> [--dry-run] [--force]
//
// --dry-run finds every value and says what it would change, writing nothing.
// --force applies values whose old number no longer matches the sim.
// Exits 1 when anything is left for a person (moved, missing or manual),
// after printing exactly what and where. Run the tests afterwards.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBalanceFile } from '@blockyrts/balance';
import { applyChanges, type Status } from './balance/apply.ts';

const SIM_SRC = fileURLToPath(new URL('../../sim/src/', import.meta.url));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const name = args.find((a) => !a.startsWith('--'));
if (!name) {
  console.error('usage: pnpm --filter @blockyrts/tools balance:apply <balance-changes.json> [--dry-run] [--force]');
  process.exit(2);
}
// pnpm runs the script in packages/tools; a relative path means where it was typed.
const candidates = [resolve(process.env.INIT_CWD ?? process.cwd(), name), resolve(name)];
const path = candidates.find((p) => existsSync(p));
if (!path) {
  console.error(`no file ${name}`);
  process.exit(2);
}

const file = parseBalanceFile(JSON.parse(readFileSync(path, 'utf8')));
console.log(`${file.changes.length} change(s) from ${path}`);
console.log(`exported ${file.exportedAt || 'at an unknown time'} from tables at commit ${file.commit || 'unknown'}${dryRun ? ' (dry run: nothing is written)' : ''}\n`);

const result = await applyChanges(file, { simSrc: SIM_SRC, dryRun, force });

const MARK: Record<Status, string> = { applied: 'applied', planned: 'would apply', already: 'already so', moved: 'MOVED', missing: 'MISSING', manual: 'BY HAND' };
const order: Status[] = ['manual', 'moved', 'missing', 'applied', 'planned', 'already'];
for (const status of order) {
  const list = result.outcomes.filter((o) => o.status === status);
  if (!list.length) continue;
  console.log(`${MARK[status]} (${list.length})`);
  for (const o of list) {
    const c = o.change;
    console.log(`  ${c.label}: ${c.oldDisplay} -> ${c.newDisplay}  [${c.module} ${c.path.join('.')}: ${String(c.old)} -> ${String(c.new)}]`);
    console.log(`    ${o.detail}${o.where ? `  (packages/sim/src/${o.where})` : ''}`);
    if (c.note) console.log(`    note: ${c.note}`);
  }
  console.log('');
}
if (result.alsoChanged.length) {
  console.log(`Also changed as a result (${result.alsoChanged.length}): check these were meant`);
  for (const a of result.alsoChanged.slice(0, 60)) console.log(`  ${a.key}: ${String(a.before)} -> ${String(a.after)}`);
  if (result.alsoChanged.length > 60) console.log(`  ... and ${result.alsoChanged.length - 60} more`);
  console.log('');
}
if (file.entryNotes.length) {
  console.log('Notes on entries (not applied: read and act on these)');
  for (const n of file.entryNotes) console.log(`  ${n.label}: ${n.note}`);
  console.log('');
}
if (file.notes) console.log(`General notes: ${file.notes}\n`);
if (result.filesWritten.length) console.log(`Files written: ${result.filesWritten.map((f) => `packages/sim/src/${f}`).join(', ')}`);

const open = result.outcomes.filter((o) => o.status === 'manual' || o.status === 'moved' || o.status === 'missing').length;
if (open) console.log(`${open} change(s) need a person (listed above).`);
else console.log(dryRun ? 'Every change can be applied; nothing was written (dry run).' : 'Every change is in. Run pnpm check next.');
process.exit(open ? 1 : 0);
