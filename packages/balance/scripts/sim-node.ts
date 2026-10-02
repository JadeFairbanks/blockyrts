// The sim's modules and their comments, read from disk in Node: for the
// Vite build (comments only) and for tests (both).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractDocs, type SimDocs } from '../src/core/docs.ts';
import type { SimModules } from '../src/core/catalog.ts';

export const SIM_SRC = fileURLToPath(new URL('../../sim/src/', import.meta.url));

/** Every source file of the sim, relative to packages/sim/src with forward slashes, tests left out. */
export function simFiles(): string[] {
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
    });
  return walk(SIM_SRC).map((p) => relative(SIM_SRC, p).split('\\').join('/')).sort();
}

export function readSimDocs(): SimDocs {
  const docs: SimDocs = {};
  for (const f of simFiles()) docs[f] = extractDocs(readFileSync(join(SIM_SRC, f), 'utf8'));
  return docs;
}

export async function importSimModules(): Promise<SimModules> {
  const mods: Record<string, Record<string, unknown>> = {};
  for (const f of simFiles()) mods[f] = (await import(pathToFileURL(join(SIM_SRC, f)).href)) as Record<string, unknown>;
  return mods;
}
