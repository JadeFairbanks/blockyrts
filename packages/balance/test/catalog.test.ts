// The balance editor's tree, built from the real sim: every table shows,
// every value has one stable id, and units turn back into the sim's integers.
import { describe, expect, it } from 'vitest';
import { buildCatalog, extractDocs, fromDisplay, parseBalanceFile, pathKey, toDisplay, UNITS, valueAt, type UnitId } from '../src/core/index.ts';
import { Session } from '../src/core/session.ts';
import { importSimModules, readSimDocs } from '../scripts/sim-node.ts';

const mods = await importSimModules();
const cat = buildCatalog(mods, readSimDocs());

describe('catalog', () => {
  it('has an entry for every building, research step, item, recipe, mob, animal and lair', () => {
    const count = (exportName: string): number => [...cat.entries.values()].filter((e) => e.path[0] === exportName).length;
    const len = (module: string, name: string): number => (mods[module]![name] as unknown[]).length;
    expect(count('BUILDINGS')).toBe(len('buildings/data.ts', 'BUILDINGS'));
    expect(count('RESEARCH')).toBe(len('combat/items.ts', 'RESEARCH') - 1); // "none" left out
    expect(count('ITEMS')).toBe(len('combat/items.ts', 'ITEMS') - 1);
    expect(count('RECIPES')).toBe(len('buildings/recipes.ts', 'RECIPES'));
    expect(count('MOBS')).toBe(len('combat/mobs.ts', 'MOBS'));
    expect(count('SPECIES')).toBe(len('animals/species.ts', 'SPECIES'));
    expect(count('LAIRS')).toBe(len('threats/data.ts', 'LAIRS'));
  });

  it('files the mounts and the siege engines under Mounts, siege and guns, with their speeds in m/s', () => {
    const siege = cat.groups.find((g) => g.id === 'siege')!;
    const labels = siege.entries.map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(['Horse', 'Elf war bear', 'Catapult', 'Ballista', 'Bronze cannon', 'Iron cannon']));
    const gallop = [...cat.fields.values()].find((f) => f.module === 'mounts/data.ts' && f.path.join('.') === 'MOUNTS.1.gallop')!;
    expect(gallop.unit).toBe('speed');
    expect(toDisplay(gallop.value as number, gallop.unit)).toBe('8');
  });

  it('gives every value a path that reads back the same value from the sim', () => {
    for (const f of cat.fields.values()) expect(valueAt(mods[f.module]!, f.path), f.id).toBe(f.value);
    expect(cat.fields.size).toBeGreaterThan(3000);
  });

  it('shows the Big House levels with their costs, build work and what each unlocks', () => {
    const bigHouse = cat.entries.get(cat.refEntry('building', 0)!)!;
    expect(bigHouse.label).toBe('Big House');
    const ws = cat.fields.get(pathKey('buildings/data.ts', ['BUILDINGS', 0, 'levels', 0, 'ws']))!;
    expect(ws.unit).toBe('workerSeconds');
    expect(ws.trail).toEqual(['Levels', 'Level 1: Big House']);
    // Buildings that need a main base level link back to the Big House.
    expect(bigHouse.usedBy.some((r) => r.how === 'needs this main base level' && r.detail === 'level 2')).toBe(true);
  });

  it('links research both ways', () => {
    const bronze = cat.entries.get(cat.refEntry('research', 2)!)!;
    expect(bronze.label).toBe('Bronze');
    const users = bronze.usedBy.map((r) => cat.entries.get(r.from)!.label);
    expect(users).toContain('Deep Mining I');
    expect(users).toContain('Bronze tools');
  });

  it('files loose rules under their groups and leaves no plumbing in', () => {
    const ids = [...cat.fields.keys()];
    expect(ids).toContain('rules.ts#DAY_STEPS');
    expect(ids.some((id) => id.startsWith('fixed.ts#') || id.startsWith('trig-table.ts#') || id.startsWith('index.ts#'))).toBe(false);
    const day = cat.fields.get('rules.ts#DAY_STEPS')!;
    expect(cat.entries.get(day.entryId)!.group).toBe('pacing');
    expect(toDisplay(day.value as number, day.unit)).toBe('180');
  });

  it('names the peoples\' tables by what their keys stand for and pages them by section', () => {
    const peoples = cat.groups.find((g) => g.id === 'peoples')!;
    const woman = peoples.entries.find((e) => e.label === 'Halfling (woman)')!;
    expect(woman.menu).toEqual(['Halflings']);
    const trade = peoples.entries.find((e) => e.label.startsWith('Trade:'))!;
    expect(trade.menu).toEqual(['Rules and settings']);
    const labels = (n: { label?: string; children?: unknown[] }): string[] =>
      [n.label ?? '', ...((n.children ?? []) as Array<{ label?: string; children?: unknown[] }>).flatMap(labels)];
    const all = labels(trade as never);
    expect(all).toContain('Steel ingot');
    expect(all).toContain('Dwarf colony');
    expect(all).toContain('Live chicken');
    expect(all).toContain('Bronze cannon');
    expect(all.some((l) => /Lines|Names/.test(l))).toBe(false);
    const steel = [...cat.fields.values()].find((f) => f.module === 'peoples/data.ts' && f.path[0] === 'RES_VALUE_TENTHS' && f.label === 'Steel ingot')!;
    expect(toDisplay(steel.value as number, steel.unit)).toBe('30');
  });
});

describe('units', () => {
  it('round-trip every value through what the editor shows', () => {
    for (const f of cat.fields.values()) {
      if (typeof f.value !== 'number' || f.ref) continue;
      expect(fromDisplay(toDisplay(f.value, f.unit), f.unit), f.id).toBe(f.value);
    }
  });

  it('read seconds, percent and metres', () => {
    const cases: Array<[string, UnitId, number]> = [['1.5', 'seconds', 30], ['20', 'percentBp', 2000], ['1.2', 'metresWu', 9600], ['1.4', 'speed', 560], ['abc', 'seconds', NaN]];
    for (const [text, unit, raw] of cases) expect(fromDisplay(text, unit) ?? NaN).toBe(raw);
    expect(UNITS.speed.suffix).toBe('m/s');
  });
});

describe('session', () => {
  it('exports only changes, with labels and both values, and imports them back', () => {
    const s = new Session(cat);
    const hp = cat.fields.get(pathKey('combat/mobs.ts', ['MOBS', 0, 'hp']))!;
    s.set(hp.id, 75);
    s.setNote(hp.id, 'zombies die too fast');
    s.set(hp.id, 75);
    s.entryNotes.set(hp.entryId, 'look at the speed too');
    const file = s.toFile({ commit: 'abc', builtAt: '', now: new Date(Date.UTC(2026, 9, 2)) });
    expect(file.changes).toEqual([{
      module: 'combat/mobs.ts', path: ['MOBS', 0, 'hp'], label: 'Mobs and nights > Zombie > Health', old: hp.value, new: 75,
      unit: 'health points', oldDisplay: `${hp.value} HP`, newDisplay: '75 HP', note: 'zombies die too fast',
    }]);
    expect(file.entryNotes[0]!.note).toBe('look at the speed too');

    const again = new Session(cat);
    const report = again.load(parseBalanceFile(JSON.parse(JSON.stringify(file))));
    expect(report).toEqual({ applied: 1, moved: [], missing: [], same: [] });
    expect(again.current(hp)).toBe(75);
    expect(again.entryNotes.get(hp.entryId)).toBe('look at the speed too');
  });

  it('setting a value back to the table drops the change', () => {
    const s = new Session(cat);
    const f = [...cat.fields.values()].find((x) => !x.readOnly && typeof x.value === 'number')!;
    s.set(f.id, (f.value as number) + 1);
    s.set(f.id, f.value);
    expect(s.changes.size).toBe(0);
  });

  it('reports values that moved or vanished since the file was made', () => {
    const s = new Session(cat);
    const hp = cat.fields.get(pathKey('combat/mobs.ts', ['MOBS', 0, 'hp']))!;
    const report = s.load(parseBalanceFile({
      kind: 'blockyrts-balance-changes', schema: 1, changes: [
        { module: 'combat/mobs.ts', path: ['MOBS', 0, 'hp'], old: (hp.value as number) + 5, new: 99 },
        { module: 'combat/mobs.ts', path: ['MOBS', 0, 'gone'], old: 1, new: 2, label: 'Gone' },
      ],
    }));
    expect(report.applied).toBe(1);
    expect(report.moved).toHaveLength(1);
    expect(report.missing).toEqual(['Gone']);
  });

  it('rejects files that are not balance changes', () => {
    expect(() => parseBalanceFile({ hello: 1 })).toThrow(/not a balance changes file/);
    expect(() => parseBalanceFile({ kind: 'blockyrts-balance-changes', schema: 99, changes: [] })).toThrow(/schema 99/);
  });
});

describe('docs', () => {
  it('reads export and field comments', () => {
    const d = extractDocs([
      '// Header line one.',
      '// Header line two.',
      '',
      '/** How long a thing takes. */',
      'export const THING_STEPS = 20;',
      'export interface X {',
      '  /** The health. */',
      '  hp: number;',
      '}',
    ].join('\n'));
    expect(d.header).toBe('Header line one. Header line two.');
    expect(d.exports.THING_STEPS).toEqual({ doc: 'How long a thing takes.', line: 5 });
    expect(extractDocs('const a = 1;\n// ----- trade -----\nexport const B = 2;').exports.B!.section).toBe('trade');
    expect(d.props.hp).toBe('The health.');
  });
});
