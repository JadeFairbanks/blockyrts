// Every number and flag the sim's modules export, flattened to
// "module#EXPORT.key.0.key" -> value. balance:apply takes one before and one
// after editing (the second in a fresh process, so it sees the new source).
//
// Run as a script it prints the snapshot of the sim at the given src folder:
//   tsx src/balance/snapshot.ts <packages/sim/src>
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Snapshot = Record<string, number | boolean>;

function files(root: string): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
    });
  return walk(root).sort();
}

function flatten(out: Snapshot, prefix: string, v: unknown, seen: Set<unknown>): void {
  if (typeof v === 'number' || typeof v === 'boolean') {
    out[prefix] = v;
    return;
  }
  if (!v || typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  for (const [k, x] of Object.entries(v)) flatten(out, `${prefix}.${k}`, x, seen);
  seen.delete(v);
}

/** The sim's modules by path under its src folder. */
export async function importAll(simSrc: string): Promise<Record<string, Record<string, unknown>>> {
  const mods: Record<string, Record<string, unknown>> = {};
  for (const abs of files(simSrc)) mods[relative(simSrc, abs).split('\\').join('/')] = (await import(pathToFileURL(abs).href)) as Record<string, unknown>;
  return mods;
}

export async function snapshot(simSrc: string): Promise<Snapshot> {
  const out: Snapshot = {};
  for (const [rel, mod] of Object.entries(await importAll(simSrc))) {
    for (const [name, v] of Object.entries(mod)) {
      if (typeof v === 'function') continue;
      flatten(out, `${rel}#${name}`, v, new Set());
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: snapshot.ts <sim src folder>');
  process.stdout.write(JSON.stringify(await snapshot(root)));
}
