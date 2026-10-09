// The balance editor's tree, built from the real sim: every table shows,
// every value has one stable id, and units turn back into the sim's integers.
import { describe, expect, it } from 'vitest';
import { buildCatalog, extractDocs, fromDisplay, parseBalanceFile, pathKey, toDisplay, UNITS, valueAt, type UnitId } from '../src/core/index.ts';
import { ENTRY_ARRAYS, ENTRY_RECORDS, EXPORT_GROUPS, GROUPS, PLACEHOLDER_ROWS, SKIP_EXPORTS } from '../src/core/rules.ts';
import { Session } from '../src/core/session.ts';
import { importSimModules, readSimDocs } from '../scripts/sim-node.ts';

const mods = await importSimModules();
const cat = buildCatalog(mods, readSimDocs());

describe('catalog', () => {
  it('has an entry for every building, research step, kit tier, recipe, mob, animal and lair', () => {
    const count = (exportName: string): number => [...cat.entries.values()].filter((e) => e.path[0] === exportName).length;
    const len = (module: string, name: string): number => (mods[module]![name] as unknown[]).length;
    expect(count('BUILDINGS')).toBe(len('buildings/data.ts', 'BUILDINGS'));
    // "none" and the steps the troop rework retired are left out.
    const retired = (mods['combat/items.ts']!.RESEARCH as Array<{ retired?: boolean }>).filter((r) => r.retired).length;
    expect(retired).toBeGreaterThan(0);
    expect(count('RESEARCH')).toBe(len('combat/items.ts', 'RESEARCH') - 1 - retired);
    // Troops and gear: a tier each, the empty tier 0 rows left out (close melee's tier 0 is the fists, and stays).
    expect(count('CLOSE_KITS')).toBe(len('units/kits.ts', 'CLOSE_KITS'));
    for (const name of ['LONG_KITS', 'RANGER_KITS', 'ARMOUR_KITS', 'SHIELD_KITS', 'TOOL_KITS', 'WAND_KITS', 'ROBE_KITS']) {
      expect(count(name), name).toBe(len('units/kits.ts', name) - 1);
    }
    expect(count('TIER_NEEDS')).toBe(len('units/kits.ts', 'TIER_NEEDS'));
    expect(count('BRAWLER_KIT')).toBe(1);
    expect(count('ITEMS')).toBe(0);
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
    // Bronze kit needs the bronze material tier, which needs the research (Troops and gear: Tiers).
    expect(users).toContain('Tier 4: Bronze');
    const crossbows = cat.entries.get(cat.refEntry('research', 5)!)!;
    expect(crossbows.usedBy.map((r) => cat.entries.get(r.from)!.label)).toContain('Tier 7: Steel-prod crossbow');
  });

  it('gives the kit tables a group each, in the blueprint\'s order (Tables 2c, 2d, 2e, 3, 7, 13)', () => {
    const ids = cat.groups.map((g) => g.id);
    const kitGroups = ['tools', 'melee', 'ranged', 'armour', 'training', 'wands'];
    const at = ids.indexOf('tools');
    expect(ids.slice(at, at + kitGroups.length)).toEqual(kitGroups);
    expect(ids).not.toContain('equipment');
    const menus = (group: string): string[] => [...new Set(cat.groups.find((g) => g.id === group)!.entries.flatMap((e) => (e.module === 'units/kits.ts' ? e.menu : [])))];
    expect(menus('tools')).toEqual(['Tool kits']);
    expect(menus('melee')).toEqual(['Close melee', 'Long melee and cavalry']);
    expect(menus('ranged')).toEqual(['Rangers', 'Brawlers']);
    expect(menus('armour')).toEqual(['Armour', 'Shields (close melee)']);
    expect(menus('training')).toEqual(['Material tiers']);
    expect(menus('wands')).toEqual(['Wands', 'Robes']);
    // Every kit table and rule has a home: none is left under Other numbers.
    const other = cat.groups.find((g) => g.id === 'other')?.entries ?? [];
    expect([...cat.fields.values()].filter((f) => f.module === 'units/kits.ts' && other.some((e) => e.id === f.entryId))).toEqual([]);
    expect(cat.entries.get('units/kits.ts:LONG_KITS:0')).toBeUndefined();
    expect(cat.entries.get('units/kits.ts:CLOSE_KITS:0')!.label).toBe('Tier 0: Fists');
    expect(cat.entries.get('units/kits.ts:SHIELD_KITS:1')!.label).toBe('Tier 1: Wooden shield');
  });

  it('leaves nothing under Other numbers', () => {
    // A new sim table belongs in a group (MODULE_GROUPS) or, if it is plumbing, in SKIP_EXPORTS (src/core/rules.ts).
    const other = cat.groups.find((g) => g.id === 'other')?.entries ?? [];
    expect(other.map((e) => e.id)).toEqual([]);
  });

  it('names the goods a people sells cheap and pays extra for, live animals too', () => {
    const lean = [...cat.fields.values()].filter((f) => f.module === 'peoples/data.ts' && (f.path.includes('sells') || f.path.includes('lacks')));
    expect(lean.length).toBeGreaterThan(10);
    for (const f of lean) {
      expect(f.ref, f.id).toBe('good');
      expect(cat.refNames.good.get(f.value as number), f.id).toBeDefined();
    }
    expect([...cat.refNames.good.values()]).toContain('Live cattle');
  });

  it('shows a kit row in the blueprint\'s units, its tier fixed and its material tier linked', () => {
    const at = (path: Array<string | number>) => cat.fields.get(pathKey('units/kits.ts', path))!;
    const bronze = cat.entries.get('units/kits.ts:CLOSE_KITS:4')!;
    expect(bronze.label).toBe('Tier 4: Bronze shortsword');
    expect(bronze.group).toBe('melee');
    const swing = at(['CLOSE_KITS', 4, 'swingDs']);
    expect([swing.label, swing.unit, toDisplay(swing.value as number, swing.unit)]).toEqual(['Swing time', 'deciseconds', '1.2']);
    const reach = at(['LONG_KITS', 6, 'reachCm']);
    expect([reach.unit, toDisplay(reach.value as number, reach.unit)]).toEqual(['metresCm', '3.5']);
    expect(at(['CLOSE_KITS', 4, 'timeS']).unit).toBe('wholeSeconds');
    expect(at(['RANGER_KITS', 8, 'rangeM']).unit).toBe('metres');
    expect(at(['ARMOUR_KITS', 5, 'protectionPct']).unit).toBe('percent');
    expect(at(['CRIT', 'outerPm']).unit).toBe('percentPm');
    expect(at(['TRAINING', 'troopFood']).unit).toBe('nutrition');
    expect(at(['CLOSE_KITS', 4, 'tier']).readOnly).toBe(true);
    const need = at(['WAND_KITS', 5, 'need']);
    expect([need.ref, need.readOnly, cat.refNames.tierNeed.get(need.value as number)]).toEqual(['tierNeed', true, '7: steel']);
    // The material tier lists what is made of it.
    const steel = cat.entries.get(cat.refEntry('tierNeed', 7)!)!;
    const made = steel.usedBy.map((r) => cat.entries.get(r.from)!.label);
    expect(made).toEqual(expect.arrayContaining(['Tier 7: Steel side-sword', 'Tier 7: Steel halberd', 'Tier 7: Steel plate harness', 'Tier 5: Crystal staff']));
    // A tool kit's tool for each job, by job.
    const chop = at(['TOOL_KITS', 2, 'tools', 0]);
    expect([chop.label, chop.ref, cat.refNames.tool.get(chop.value as number)]).toEqual(['Chop', 'tool', 'Flint']);
    // Kit costs read as resources, every way of paying shown.
    const sling = cat.entries.get('units/kits.ts:RANGER_KITS:1')!;
    expect(sling.children.find((n) => n.type === 'section' && n.label === 'Cost')).toMatchObject({ children: [{ label: 'Way 1' }, { label: 'Way 2' }] });
    // The brawler's one kit is an entry of its own.
    expect(cat.entries.get('units/kits.ts:BRAWLER_KIT')).toMatchObject({ group: 'ranged', label: 'Tier 8: Flintlock pistol and cutlass', path: ['BRAWLER_KIT'] });
  });

  it('leaves the gear catalogue out: it is worked out from the kit rows', () => {
    const derived = ['GEAR', 'PeopleGear', 'CLOSE_GEAR', 'LONG_GEAR', 'RANGER_GEAR', 'PISTOL_GEAR', 'ARMOUR_GEAR', 'SHIELD_GEAR', 'TOOL_GEAR', 'WAND_GEAR', 'ROBE_GEAR'];
    for (const name of derived) expect(name in mods['units/kits.ts']!, name).toBe(true);
    expect([...cat.fields.values()].filter((f) => f.module === 'units/kits.ts' && derived.includes(String(f.path[0]))).map((f) => f.id)).toEqual([]);
    // Nor do products repeat the kit pieces they carry.
    expect([...cat.fields.keys()].some((id) => id.includes('.pieces.'))).toBe(false);
    // The peoples' fixed gear is named from the catalogue, and not edited here.
    const row = (mods['peoples/data.ts']!.PEOPLE_UNITS as Array<{ name: string }>).findIndex((u) => u.name === 'Halfling spearman');
    const spearman = cat.fields.get(pathKey('peoples/data.ts', ['PEOPLE_UNITS', row, 'weapon']))!;
    expect([spearman.ref, spearman.readOnly, cat.refNames.gear.get(spearman.value as number)]).toEqual(['gear', true, 'Bronze spear']);
  });

  it('keeps its rules in step with the sim: every export they name exists', () => {
    const has = (key: string): boolean => {
      const [module, name] = key.split(/(?<=\.ts):/);
      return !!mods[module!] && name!.split(':')[0]! in mods[module!]!;
    };
    const named = [...SKIP_EXPORTS, ...Object.keys(EXPORT_GROUPS), ...ENTRY_ARRAYS, ...ENTRY_RECORDS, ...[...PLACEHOLDER_ROWS].map((k) => k.replace(/:\d+$/, ''))];
    expect(named.filter((k) => !has(k))).toEqual([]);
    expect(Object.values(EXPORT_GROUPS).filter((g) => !GROUPS.some((x) => x.id === g))).toEqual([]);
  });

  it('files loose rules under their groups and leaves no plumbing in', () => {
    const ids = [...cat.fields.keys()];
    expect(ids).toContain('rules.ts#DAY_STEPS');
    expect(ids.some((id) => id.startsWith('fixed.ts#') || id.startsWith('trig-table.ts#') || id.startsWith('index.ts#'))).toBe(false);
    const day = cat.fields.get('rules.ts#DAY_STEPS')!;
    expect(cat.entries.get(day.entryId)!.group).toBe('pacing');
    expect(toDisplay(day.value as number, day.unit)).toBe('180');
  });

  it("files loot, Hunt, Gather and guarding workers under their own group (Jade's play-test notes)", () => {
    const group = (id: string): string => cat.entries.get(cat.fields.get(id)!.entryId)!.group;
    for (const id of ['units/loot.ts#LOOT_BAG_TENTHS_LB', 'units/loot.ts#LOOT_NOTICE_M', 'units/forage.ts#FORAGE_DARK_M', 'units/field.ts#HUNT_HOME_PCT', 'combat/fight.ts#GUARD_HELP_M']) expect(group(id), id).toBe('loot');
    expect(toDisplay(cat.fields.get('units/loot.ts#LOOT_BAG_TENTHS_LB')!.value as number, cat.fields.get('units/loot.ts#LOOT_BAG_TENTHS_LB')!.unit)).toBe('25');
    const plenty = [...cat.fields.values()].find((f) => f.module === 'units/forage.ts' && f.path.join('.') === 'FORAGE_GOODS.0.plenty')!;
    expect(plenty.label).toBe('Wanted until the stock holds');
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

  it('exports a kit row\'s numbers with the path balance:apply follows into units/kits.ts', () => {
    const s = new Session(cat);
    const damage = cat.fields.get(pathKey('units/kits.ts', ['CLOSE_KITS', 4, 'damage']))!;
    const swing = cat.fields.get(pathKey('units/kits.ts', ['CLOSE_KITS', 4, 'swingDs']))!;
    const flax = cat.fields.get(pathKey('units/kits.ts', ['ARMOUR_KITS', 3, 'cost', 1, 2, 1]))!;
    s.set(damage.id, 12);
    s.set(swing.id, fromDisplay('1.1', swing.unit)!);
    s.set(flax.id, 2);
    s.entryNotes.set('units/kits.ts:BRAWLER_KIT', 'pistol feels weak');
    const file = s.toFile({ commit: 'abc', builtAt: '', now: new Date(Date.UTC(2026, 9, 3)) });
    expect(file.changes).toEqual([
      {
        module: 'units/kits.ts', path: ['ARMOUR_KITS', 3, 'cost', 1, 2, 1], label: 'Armour and shields > Tier 3: Copper scale jack > Cost > Way 2 > Amount',
        old: 1, new: 2, unit: 'a count', oldDisplay: '1', newDisplay: '2',
      },
      {
        module: 'units/kits.ts', path: ['CLOSE_KITS', 4, 'damage'], label: 'Melee weapons > Tier 4: Bronze shortsword > Damage',
        old: 11, new: 12, unit: 'damage per hit, before armour', oldDisplay: '11 dmg', newDisplay: '12 dmg',
      },
      {
        module: 'units/kits.ts', path: ['CLOSE_KITS', 4, 'swingDs'], label: 'Melee weapons > Tier 4: Bronze shortsword > Swing time',
        old: 12, new: 11, unit: 'seconds (held in tenths of a second)', oldDisplay: '1.2 s', newDisplay: '1.1 s',
      },
    ]);
    expect(file.entryNotes).toEqual([{ module: 'units/kits.ts', path: ['BRAWLER_KIT'], label: 'Ranged weapons > Tier 8: Flintlock pistol and cutlass', note: 'pistol feels weak' }]);
    for (const c of file.changes) expect(valueAt(mods[c.module]!, c.path)).toBe(c.old);

    const again = new Session(cat);
    expect(again.load(parseBalanceFile(JSON.parse(JSON.stringify(file))))).toEqual({ applied: 3, moved: [], missing: [], same: [] });
    expect(again.current(swing)).toBe(11);
    expect(again.entryNotes.get('units/kits.ts:BRAWLER_KIT')).toBe('pistol feels weak');
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
