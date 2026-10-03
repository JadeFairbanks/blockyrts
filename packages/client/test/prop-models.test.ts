// The growth stages' model hook names only models and state sets the
// catalogue has, so the wiring pass can draw them as they are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { growthStages, PropKind, PROPS, Stage } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { propModel } from '../src/world/prop-models.ts';

const MODELS = fileURLToPath(new URL('../../assets/src/models/', import.meta.url));

/** Every .bbmodel in the catalogue by id. */
function catalogue(dir: string, out = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) catalogue(full, out);
    else if (name.endsWith('.bbmodel')) out.set(name.slice(0, -'.bbmodel'.length), full);
  }
  return out;
}

/** Top-level groups under the model's root that Blockbench hides by default (its state sets). */
function hiddenSets(file: string): string[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { outliner: Array<{ name: string; visibility?: boolean; children: unknown[] } | string> };
  const out: string[] = [];
  const walk = (nodes: readonly unknown[]): void => {
    for (const n of nodes) {
      if (typeof n === 'string') continue;
      const g = n as { name: string; visibility?: boolean; children: unknown[] };
      if (g.visibility === false && !g.name.startsWith('slot_')) out.push(g.name);
      walk(g.children);
    }
  };
  walk(raw.outliner);
  return out;
}

describe('the growth stages\' model hook', () => {
  const models = catalogue(MODELS);

  it('names a catalogue model, or one of its state sets, for every stage of every plant', () => {
    let checked = 0;
    for (const p of PROPS) {
      const stages = growthStages(p.kind);
      if (!stages) continue;
      for (const g of stages) {
        const m = propModel(p.kind, g.stage);
        expect(m, `${p.name} ${g.name}`).not.toBeNull();
        const [id, set] = m!.id.split('@') as [string, string | undefined];
        expect(models.has(id), m!.id).toBe(true);
        if (set) expect(hiddenSets(models.get(id)!), m!.id).toContain(set);
        expect(m!.scale).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('never draws a hazel picked bare as the cut stub', () => {
    expect(propModel(PropKind.Hazel, Stage.Sapling)!.id).not.toContain('@cut');
  });
});
