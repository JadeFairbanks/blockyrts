// The catalogue's .bbmodel files by model id, for tools that read models by
// the ids the sim's tables name.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS_DIR } from './build-models.ts';

const MODELS = join(ASSETS_DIR, 'src/models');

let files: Map<string, string> | undefined;

/** Every catalogue .bbmodel by id (a folder may hold a model's tiers side by side). */
function modelFiles(): Map<string, string> {
  const out = new Map<string, string>();
  for (const category of readdirSync(MODELS)) {
    for (const folder of readdirSync(join(MODELS, category))) {
      let names: string[];
      try {
        names = readdirSync(join(MODELS, category, folder));
      } catch {
        continue;
      }
      for (const f of names) if (f.endsWith('.bbmodel')) out.set(f.slice(0, -'.bbmodel'.length), join(MODELS, category, folder, f));
    }
  }
  return out;
}

/** A catalogue model's .bbmodel, parsed, by id. */
export function readModel(id: string): unknown {
  const path = (files ??= modelFiles()).get(id);
  if (!path) throw new Error(`no model ${id} in ${MODELS}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
