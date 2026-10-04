// balance:apply against a copy of the sim: every value the editor offers
// is changed at once, and each one must either land exactly (checked by
// re-reading the sim in a fresh process) or be reported for a person.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildCatalog, FILE_KIND, pathKey, SCHEMA_VERSION, type BalanceChange, type BalanceFile, type Catalog } from '@blockyrts/balance';
import { importSimModules, readSimDocs, SIM_SRC } from '@blockyrts/balance/node';
import { applyChanges } from '../src/balance/apply.ts';
import { SourceIndex } from '../src/balance/locate.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'blockyrts-balance-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function copySim(name: string): string {
  const dir = join(tmp, name, 'src');
  cpSync(SIM_SRC, dir, { recursive: true });
  return dir;
}

function file(changes: BalanceChange[]): BalanceFile {
  return { kind: FILE_KIND, schema: SCHEMA_VERSION, commit: 'test', builtAt: '', exportedAt: '', changes, entryNotes: [], notes: '' };
}

/** A different valid value for every editable field. */
function everyChange(cat: Catalog): BalanceChange[] {
  const out: BalanceChange[] = [];
  for (const f of cat.fields.values()) {
    if (f.readOnly) continue;
    let next: number | boolean;
    if (typeof f.value === 'boolean') next = !f.value;
    else if (f.ref) {
      const ids = [...cat.refNames[f.ref].keys()].sort((a, b) => a - b);
      next = ids.find((id) => id > (f.value as number)) ?? ids[0]!;
      if (next === f.value) continue;
    } else next = f.value === 0 ? 1 : f.value * 2;
    out.push({ module: f.module, path: f.path, label: f.id, old: f.value, new: next, unit: '', oldDisplay: '', newDisplay: '' });
  }
  return out;
}

describe('balance:apply', () => {
  it('changes one value in one place and nothing else', async () => {
    const src = copySim('one');
    const before = readFileSync(join(src, 'buildings/data.ts'), 'utf8');
    const result = await applyChanges(file([
      { module: 'buildings/data.ts', path: ['BUILDINGS', 0, 'levels', 1, 'ws'], label: 'Longhall build work', old: 400, new: 450, unit: '', oldDisplay: '', newDisplay: '' },
    ]), { simSrc: src });
    expect(result.outcomes.map((o) => o.status)).toEqual(['applied']);
    expect(result.alsoChanged).toEqual([]);
    const after = readFileSync(join(src, 'buildings/data.ts'), 'utf8');
    expect(after).toBe(before.replace("mainBase('Longhall', [[S, 100], [ST, 40]], 400,", "mainBase('Longhall', [[S, 100], [ST, 40]], 450,"));
  });

  it('writes a time through its helper, a resource by name, and a row of its own over a shared default', async () => {
    const src = copySim('kinds');
    const result = await applyChanges(file([
      // Research Bronze: sec(75) -> sec(90).
      { module: 'combat/items.ts', path: ['RESEARCH', 2, 'steps'], label: 'Bronze time', old: 1500, new: 1800, unit: '', oldDisplay: '', newDisplay: '' },
      // Big House level 1 pays stone: [ST, 150] -> [Res.Flint, 150].
      { module: 'buildings/data.ts', path: ['BUILDINGS', 0, 'levels', 0, 'cost', 1, 0], label: 'Big House cost resource', old: 3, new: 4, unit: '', oldDisplay: '', newDisplay: '' },
      // Zombies take the shared pierce default: the zombie gets its own.
      { module: 'combat/mobs.ts', path: ['MOBS', 0, 'pierceBp'], label: 'Zombie pierce', old: 10000, new: 8000, unit: '', oldDisplay: '', newDisplay: '' },
    ]), { simSrc: src });
    expect(result.outcomes.map((o) => [o.change.label, o.status])).toEqual([
      ['Bronze time', 'applied'], ['Big House cost resource', 'applied'], ['Zombie pierce', 'applied'],
    ]);
    expect(result.alsoChanged).toEqual([]);
    expect(readFileSync(join(src, 'combat/items.ts'), 'utf8')).toContain("steps: sec(90), made: Made.TinIngot");
    expect(readFileSync(join(src, 'buildings/data.ts'), 'utf8')).toContain("mainBase('Big House', [[S, 300], [Res.Flint, 150]], 1200");
    expect(readFileSync(join(src, 'combat/mobs.ts'), 'utf8')).toMatch(/drops: \[\{ res: Res\.Bone, min: 1, max: 1, chancePm: 150 \}[^\n]*\],?\s*pierceBp: 8000/);
  });

  it('skips a value that moved since the export, and says why', async () => {
    const src = copySim('moved');
    const result = await applyChanges(file([
      { module: 'combat/mobs.ts', path: ['MOBS', 0, 'hp'], label: 'Zombie health', old: 55, new: 70, unit: '', oldDisplay: '', newDisplay: '' },
      { module: 'combat/mobs.ts', path: ['MOBS', 0, 'nope'], label: 'Gone', old: 1, new: 2, unit: '', oldDisplay: '', newDisplay: '' },
    ]), { simSrc: src });
    expect(result.outcomes.map((o) => o.status)).toEqual(['moved', 'missing']);
    expect(result.filesWritten).toEqual([]);
  });

  it('lands every value it claims, with every editable value changed at once, and the sim still typechecks', async () => {
    const mods = await importSimModules();
    const cat = buildCatalog(mods, readSimDocs());
    const changes = everyChange(cat);
    const src = copySim('all');
    const result = await applyChanges(file(changes), { simSrc: src });
    const by = (s: string): number => result.outcomes.filter((o) => o.status === s).length;
    // A few helpers round (metres to columns): those edits are undone and listed for a person.
    const undone = result.outcomes.filter((o) => o.detail.includes('so the edit was undone'));
    expect(undone.length).toBeLessThan(changes.length / 100);
    expect(by('applied') + by('manual') + by('already')).toBe(changes.length);
    expect(by('applied') / changes.length).toBeGreaterThan(0.6);
    // Read the edited copy afresh: every value reported applied holds its new value.
    const snap = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/balance/snapshot.ts', import.meta.url)), src], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    });
    const values = JSON.parse(snap.stdout) as Record<string, number | boolean>;
    const wrong = result.outcomes.filter((o) => o.status === 'applied' && values[pathKey(o.change.module, o.change.path)] !== o.change.new);
    expect(wrong.map((o) => o.change.label)).toEqual([]);
    // The edited copy still compiles.
    writeFileSync(join(tmp, 'all', 'tsconfig.json'), JSON.stringify({ extends: join(ROOT, 'tsconfig.base.json'), include: ['src'] }));
    const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', join(tmp, 'all', 'tsconfig.json')], { encoding: 'utf8' });
    expect(tsc.stdout + tsc.stderr).toBe('');
  }, 240_000);

  it('finds most of the values in the source (dry check of the locator)', async () => {
    const mods = await importSimModules();
    const cat = buildCatalog(mods, readSimDocs());
    const index = new SourceIndex(SIM_SRC, mods);
    const editable = [...cat.fields.values()].filter((f) => !f.readOnly);
    const found = editable.filter((f) => index.locate(f.module, f.path).ok).length;
    expect(found / editable.length).toBeGreaterThan(0.6);
  });
});
