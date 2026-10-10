import { describe, expect, it } from 'vitest';
import { budgetFieldIds, budgetFormulaText, budgetView } from '../src/core/budget.ts';
import { buildCatalog } from '../src/core/index.ts';
import { Session } from '../src/core/session.ts';
import { importSimModules, readSimDocs } from '../scripts/sim-node.ts';

const mods = await importSimModules();
const cat = buildCatalog(mods, readSimDocs());

describe('the night budget preview', () => {
  it('shows Jade\'s formula and nights 1 to 100 as the sim works them out', () => {
    const v = budgetView(mods, () => undefined)!;
    // Mini patch 7.3: night 1 raised by 10%, the raise gone by night 50.
    expect(budgetFormulaText(v.terms)).toBe('12 + (n − 1) + 3n + 0.04n², raised 10% on night 1 to nothing by night 50');
    expect(v.nights).toHaveLength(100);
    expect(v.nights.map((n) => n.tenths / 10).filter((_, i) => [0, 9, 49, 99].includes(i))).toEqual([16.5, 59.4, 311, 811]);
    expect(v.nights.every((n) => n.tenths === n.tableTenths)).toBe(true);
  });

  it('follows edited terms, and its terms are editable fields in Mobs and nights', () => {
    const ids = budgetFieldIds(mods)!;
    for (const id of Object.values(ids)) {
      const f = cat.fields.get(id)!;
      expect(f.readOnly, id).toBe(false);
      expect(cat.entries.get(f.entryId)!.group).toBe('mobs');
    }
    const s = new Session(cat);
    s.set(ids.curveThousandths!, 50);
    s.set(ids.scalePct!, 90);
    const v = budgetView(mods, (id) => s.current(cat.fields.get(id)!))!;
    expect(budgetFormulaText(v.terms)).toBe('12 + (n − 1) + 3n + 0.05n², × 90%, raised 10% on night 1 to nothing by night 50');
    // Night 100: (120 + 990 + 3000 + 5000) x 90% = 8199 tenths.
    expect(v.nights[99]!.tenths).toBe(8199);
    expect(v.nights[99]!.tableTenths).toBe(8110);
  });
});
