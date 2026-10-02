import { describe, expect, it } from 'vitest';
import { getTable, lookup, NUMBER_TABLES, tablesNumbered } from '../src/index.ts';

describe('the number tables', () => {
  it('include every table from 1 to 19', () => {
    const numbers = new Set(NUMBER_TABLES.map((t) => t.table));
    for (let n = 1; n <= 19; n++) expect(numbers.has(n), `table ${n}`).toBe(true);
  });

  it('have unique ids and Table 2 in its six parts', () => {
    const ids = NUMBER_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tablesNumbered(2).map((t) => t.id)).toEqual(['2a', '2b', '2c', '2d', '2e', '2f']);
  });

  it('have rows as wide as their columns', () => {
    for (const t of NUMBER_TABLES) {
      expect(t.columns.length).toBeGreaterThan(1);
      expect(t.rows.length).toBeGreaterThan(0);
      for (const r of t.rows) expect(r.length, `table ${t.id}`).toBe(t.columns.length);
    }
  });

  it('carry the suggested flags from the key', () => {
    // Own mark.
    const hand = lookup('1', ['Worker', '2 Hand'], 'Health');
    expect(hand).toEqual({ text: '70 (s)', suggested: true, marked: true });
    // A value marked (doc) in a suggested row stays fixed.
    const t2e = getTable('2e');
    const bow = t2e.rows.find((r) => r[0]!.text === 'Bow')!;
    const madeAt = bow[t2e.columns.indexOf('Made at')]!;
    expect(madeAt.text).toMatch(/\(doc\)$/);
    expect(madeAt.suggested).toBe(false);
    // A sub-table captioned "all (s)" is suggested in every cell with a number.
    expect(getTable('2b').rows.every((r) => r.every((c) => c.suggested === /\d/.test(c.text)))).toBe(true);
    // A column headed "Cost (s)" is suggested.
    const bronze = getTable('2a').rows.find((r) => r[0]!.text === 'Bronze')!;
    expect(bronze[2]!).toEqual({ text: '10 copper ingots, 2 tin ingots', suggested: true, marked: false });
    // Labels without numbers are never suggested by a row mark.
    expect(lookup('1', ['Worker', '2 Hand'], 'Unit').suggested).toBe(false);
  });

  it('strip markdown from headers', () => {
    expect(getTable('1').columns[0]).toBe('Unit');
    expect(getTable('8').title).toBe('Night spawn geometry');
  });
});
