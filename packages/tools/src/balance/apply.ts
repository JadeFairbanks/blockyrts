// Applies a balance editor export to the sim's source: finds each value's
// literal, rewrites it, then re-reads the whole sim in a fresh process to
// check every change took and to list anything else that moved with it.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathKey, type BalanceChange, type BalanceFile } from '@blockyrts/balance';
import { literalValue, SourceIndex, type Located, type Runtime } from './locate.ts';
import { importAll, snapshot, type Snapshot } from './snapshot.ts';

export type Status = 'applied' | 'planned' | 'already' | 'moved' | 'missing' | 'manual';

export interface Outcome {
  change: BalanceChange;
  status: Status;
  /** What happened, in plain words. */
  detail: string;
  /** file:line in packages/sim/src. */
  where?: string;
}

export interface ApplyResult {
  outcomes: Outcome[];
  /** Values that changed although no change named them: derived numbers, or something shared. */
  alsoChanged: Array<{ key: string; before: number | boolean; after: number | boolean }>;
  filesWritten: string[];
}

export interface ApplyOptions {
  simSrc: string;
  /** Plan only: locate everything, write nothing. */
  dryRun?: boolean;
  /** Apply even where the tables no longer hold the file's old value. */
  force?: boolean;
}

interface Edit {
  loc: Located;
  newText: string;
  outcome: Outcome;
  retried?: boolean;
}

const SNAPSHOT_SCRIPT = fileURLToPath(new URL('./snapshot.ts', import.meta.url));
const TOOLS_DIR = fileURLToPath(new URL('../..', import.meta.url));

/** A snapshot taken in a new process, so edited files are read afresh. */
function freshSnapshot(simSrc: string): Snapshot {
  const r = spawnSync(process.execPath, ['--import', 'tsx', SNAPSHOT_SCRIPT, simSrc], { cwd: TOOLS_DIR, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`the sim no longer loads after the edits:\n${r.stderr}`);
  return JSON.parse(r.stdout) as Snapshot;
}

function show(v: number | boolean | undefined): string {
  return v === undefined ? 'nothing' : String(v);
}

/** How a value is written: an enum member by name where the source names one (Res.Stone), else the number. */
function written(v: number | boolean, enumName: string | undefined, runtime: Runtime): string {
  if (typeof v === 'boolean') return String(v);
  if (enumName) {
    for (const mod of Object.values(runtime)) {
      const e = mod[enumName];
      if (!e || typeof e !== 'object') continue;
      const member = Object.entries(e).find(([, x]) => x === v)?.[0];
      if (member) return `${enumName}.${member}`;
      // An id the enum does not name (a made trinket's resource, say).
      return `(${v} as ${enumName})`;
    }
  }
  return String(v);
}

/** The new text for the located spot, or why it cannot be written exactly. */
function newText(loc: Located, current: number | boolean, target: number | boolean, runtime: Runtime): { text: string } | { why: string } {
  if (typeof target === 'number' && !Number.isInteger(target)) return { why: 'the sim only holds whole numbers' };
  // After the last key: ", key: v"; after a trailing comma or in an empty object: " key: v,".
  if (loc.kind === 'insert') return { text: loc.comma ? `, ${loc.key}: ${written(target, undefined, runtime)}` : ` ${loc.key}: ${written(target, undefined, runtime)},` };
  if (loc.kind === 'replace') return { text: written(target, loc.enumName, runtime) };
  if (typeof target === 'boolean') {
    if (loc.text !== 'true' && loc.text !== 'false') return { why: 'the source does not write this flag as true or false' };
    return { text: String(target) };
  }
  if (loc.kind === 'literal') return { text: String(target) };
  const lit = literalValue(loc.text);
  if (typeof lit !== 'number' || lit === 0 || typeof current !== 'number' || current === 0) return { why: `it is written as ${loc.text} through a helper whose scale cannot be worked out from zero` };
  const scaled = (target * lit) / current;
  if (!Number.isInteger(scaled)) {
    const step = current / lit;
    return { why: `the code writes it as ${loc.text} in steps of ${step} sim units, and ${target} is not a multiple of ${step}` };
  }
  return { text: String(scaled) };
}

export function applyChanges(file: BalanceFile, opts: ApplyOptions): Promise<ApplyResult> {
  return run(file, opts);
}

async function run(file: BalanceFile, opts: ApplyOptions): Promise<ApplyResult> {
  const before = await snapshot(opts.simSrc);
  const runtime = await importAll(opts.simSrc);
  const index = new SourceIndex(opts.simSrc, runtime);
  const outcomes: Outcome[] = [];
  const edits: Edit[] = [];

  for (const change of file.changes) {
    const key = pathKey(change.module, change.path);
    const cur = before[key];
    if (cur === undefined) {
      outcomes.push({ change, status: 'missing', detail: 'this value no longer exists in the sim' });
      continue;
    }
    if (cur === change.new) {
      outcomes.push({ change, status: 'already', detail: 'the sim already has the new value' });
      continue;
    }
    if (cur !== change.old && !opts.force) {
      outcomes.push({ change, status: 'moved', detail: `the file says it was ${show(change.old)}, but the sim now has ${show(cur)}; skipped (rerun with --force to apply anyway)` });
      continue;
    }
    const loc = index.locate(change.module, change.path);
    if (!loc.ok) {
      outcomes.push({ change, status: 'manual', detail: `${loc.reason}; set it to ${show(change.new)} by hand`, ...(loc.where ? { where: loc.where } : {}) });
      continue;
    }
    const lit = newText(loc, cur, change.new, runtime);
    const where = `${loc.file}:${loc.line}`;
    if ('why' in lit) {
      outcomes.push({ change, status: 'manual', detail: `${lit.why}; set it by hand`, where });
      continue;
    }
    const how = loc.kind === 'insert' ? `adds "${lit.text.replace(/^,?\s*|,$/g, '')}" to the row` : `${loc.text} → ${lit.text}`;
    const outcome: Outcome = { change, status: opts.dryRun ? 'planned' : 'applied', detail: how, where };
    const clash = edits.find((e) => e.loc.file === loc.file && e.loc.start === loc.start && (e.loc.kind === 'insert') === (loc.kind === 'insert') && e.loc.key === loc.key);
    if (clash && clash.newText !== lit.text) {
      outcome.status = 'manual';
      outcome.detail = `it is written in the same place as "${clash.outcome.change.label}", which asks for a different value; set both by hand`;
      clash.outcome.status = 'manual';
      clash.outcome.detail = outcome.detail.replace(clash.outcome.change.label, change.label);
      edits.splice(edits.indexOf(clash), 1);
      outcomes.push(outcome);
      continue;
    }
    if (!clash) edits.push({ loc, newText: lit.text, outcome });
    outcomes.push(outcome);
  }

  const result: ApplyResult = { outcomes, alsoChanged: [], filesWritten: [] };
  if (opts.dryRun || edits.length === 0) return result;

  const originals = new Map<string, string>();
  const writeAll = (list: Edit[]): void => {
    const byFile = new Map<string, Edit[]>();
    for (const e of list) {
      if (!byFile.has(e.loc.file)) byFile.set(e.loc.file, []);
      byFile.get(e.loc.file)!.push(e);
    }
    const touched = new Set([...originals.keys(), ...byFile.keys()]);
    for (const f of touched) {
      const abs = join(opts.simSrc, f);
      if (!originals.has(f)) originals.set(f, readFileSync(abs, 'utf8'));
      let text = originals.get(f)!;
      for (const e of (byFile.get(f) ?? []).sort((a, b) => b.loc.start - a.loc.start)) text = text.slice(0, e.loc.start) + e.newText + text.slice(e.loc.end);
      writeFileSync(abs, text);
    }
  };

  let live = [...edits];
  let after: Snapshot = {};
  for (let round = 0; round < 6; round++) {
    writeAll(live);
    try {
      after = freshSnapshot(opts.simSrc);
    } catch (err) {
      // Put everything back rather than leave a sim that does not load.
      writeAll([]);
      throw err;
    }
    let bad = live.filter((e) => after[pathKey(e.outcome.change.module, e.outcome.change.path)] !== e.outcome.change.new);
    if (bad.length === 0) break;
    // A scale that another change moved (N * CYCLE_STEPS when the day got longer): rescale once against the new scale.
    const rescaled = bad.filter((e) => {
      const got = after[pathKey(e.outcome.change.module, e.outcome.change.path)];
      const lit = Number(e.newText);
      const target = e.outcome.change.new;
      if (e.loc.kind !== 'scaled' || e.retried || typeof got !== 'number' || typeof target !== 'number' || !lit) return false;
      const unit = got / lit;
      if (!Number.isInteger(unit) || unit === 0 || target % unit !== 0) return false;
      e.retried = true;
      e.newText = String(target / unit);
      e.outcome.detail = `${e.loc.text} → ${e.newText}`;
      return true;
    });
    bad = bad.filter((e) => !rescaled.includes(e));
    if (bad.length === 0) continue;
    for (const e of bad) {
      const got = after[pathKey(e.outcome.change.module, e.outcome.change.path)];
      e.outcome.status = 'manual';
      e.outcome.detail = `editing ${e.loc.text} there gave ${show(got)}, not ${show(e.outcome.change.new)}, so the edit was undone; set it by hand`;
    }
    live = live.filter((e) => !bad.includes(e));
  }
  if (live.length === 0) writeAll([]);

  const named = new Set(live.map((e) => pathKey(e.outcome.change.module, e.outcome.change.path)));
  for (const [key, v] of Object.entries(after)) {
    if (key.startsWith('index.ts#') || named.has(key) || before[key] === v) continue;
    result.alsoChanged.push({ key, before: before[key] ?? v, after: v });
  }
  result.filesWritten = [...originals.keys()].filter((f) => readFileSync(join(opts.simSrc, f), 'utf8') !== originals.get(f));
  return result;
}
