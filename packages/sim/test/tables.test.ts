import { describe, expect, it } from 'vitest';
import {
  ARMOUR_GEAR,
  ARMOUR_KITS,
  BRAWLER_KIT,
  CLOSE_GEAR,
  CLOSE_KITS,
  gearSpec,
  getTable,
  LONG_GEAR,
  LONG_KITS,
  lookup,
  NUMBER_TABLES,
  RANGER_GEAR,
  RANGER_KITS,
  Research,
  RESOURCES,
  ROBE_GEAR,
  ROBE_KITS,
  SHIELD_GEAR,
  SHIELD_KITS,
  shieldRow,
  Shot,
  tablesNumbered,
  TIER_NEEDS,
  TOOL_GEAR,
  TOOL_KITS,
  TOP_MAGE_TIER,
  TOP_TIER,
  WAND_GEAR,
  WAND_KITS,
  weaponPiece,
  Troop,
  type Piece,
} from '../src/index.ts';

describe('the number tables', () => {
  it('include every table from 1 to 19', () => {
    const numbers = new Set(NUMBER_TABLES.map((t) => t.table));
    for (let n = 1; n <= 19; n++) expect(numbers.has(n), `table ${n}`).toBe(true);
  });

  it('have unique ids, Table 2 in its parts and Tables 3 and 13 in two each', () => {
    const ids = NUMBER_TABLES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Melee is close melee (2d.1) and long melee and cavalry (2d.2) (Troops and gear).
    expect(tablesNumbered(2).map((t) => t.id)).toEqual(['2a', '2b', '2c', '2d.1', '2d.2', '2e', '2f']);
    // Armour and shields; spells, then wands and robes.
    expect(tablesNumbered(3).map((t) => t.id)).toEqual(['3.1', '3.2']);
    expect(tablesNumbered(13).map((t) => t.id)).toEqual(['13.1', '13.2']);
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
    const t2f = getTable('2f');
    const cart = t2f.rows.find((r) => r[0]!.text === 'Hand cart')!;
    expect(cart.some((c) => c.suggested)).toBe(true);
    const madeAt = cart[t2f.columns.indexOf('Made at')]!;
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

// ----- the kit tables (Troops and gear; Tables 2c, 2d.1, 2d.2, 2e, 3.1, 3.2 and 13.2) -----

/** A piece's every way of paying is something, in whole positive amounts (tier 0 is nothing, or none at all for a type that starts at 1). */
function sanePiece(p: Piece, what: string): void {
  if (p.tier > 0) expect(p.cost.length, what).toBeGreaterThan(0);
  for (const way of p.cost) for (const [r, n] of way) {
    expect(RESOURCES[r], what).toBeDefined();
    expect(Number.isInteger(n) && n > 0, what).toBe(true);
  }
  expect(TIER_NEEDS[p.need], what).toBeDefined();
  if (p.tier === 0) return;
  expect(p.cost.every((w) => w.length > 0), what).toBe(true);
  expect(p.timeS, what).toBeGreaterThan(0);
  expect(p.name, what).not.toBe('');
}

/** A table's rows by their first cell. */
function rowsOf(id: string): Map<string, string[]> {
  const t = getTable(id);
  return new Map(t.rows.map((r) => [r[0]!.text, r.map((c) => c.text)]));
}

const num = (text: string): number => parseFloat(text);

describe('the kit tables', () => {
  it('have a row for every tier, indexed by tier', () => {
    for (const [name, rows, top] of [
      ['close', CLOSE_KITS, TOP_TIER],
      ['long', LONG_KITS, TOP_TIER],
      ['ranger', RANGER_KITS, TOP_TIER],
      ['armour', ARMOUR_KITS, TOP_TIER],
      ['tools', TOOL_KITS, TOP_TIER],
      ['wands', WAND_KITS, TOP_MAGE_TIER],
      ['robes', ROBE_KITS, TOP_MAGE_TIER],
    ] as const) {
      expect(rows.length, name).toBe(top + 1);
      rows.forEach((p, t) => {
        expect(p.tier, `${name} ${t}`).toBe(t);
        sanePiece(p, `${name} ${t}`);
      });
    }
    expect(TIER_NEEDS.map((n) => n.tier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Each troop type's weapon at each tier it has: close melee from its fists, the rest from 1, the brawler at 8 only.
    for (let t = 0; t <= TOP_TIER; t++) {
      expect(weaponPiece(Troop.Close, t)).toBe(CLOSE_KITS[t]);
      expect(weaponPiece(Troop.Long, t)).toBe(t > 0 ? LONG_KITS[t] : undefined);
      expect(weaponPiece(Troop.Cavalry, t)).toBe(t > 0 ? LONG_KITS[t] : undefined);
      expect(weaponPiece(Troop.Ranger, t)).toBe(t > 0 ? RANGER_KITS[t] : undefined);
      expect(weaponPiece(Troop.Brawler, t)).toBe(t === TOP_TIER ? BRAWLER_KIT : undefined);
    }
    sanePiece(BRAWLER_KIT, 'brawler');
  });

  it('have sane stats that grow with the tier', () => {
    for (const [name, rows] of [['close', CLOSE_KITS], ['long', LONG_KITS.slice(1)]] as const) {
      rows.forEach((k, n) => {
        expect(k.damage, `${name} ${k.tier}`).toBeGreaterThan(0);
        expect(k.swingDs, `${name} ${k.tier}`).toBeGreaterThan(0);
        expect(k.reachCm, `${name} ${k.tier}`).toBeGreaterThanOrEqual(100);
        if (n > 0) expect(k.damage, `${name} ${k.tier}`).toBeGreaterThan(rows[n - 1]!.damage);
      });
    }
    // Long melee and cavalry reach further than close melee.
    for (let t = 1; t <= TOP_TIER; t++) expect(LONG_KITS[t]!.reachCm).toBeGreaterThan(CLOSE_KITS[t]!.reachCm);
    RANGER_KITS.slice(1).forEach((k, n, rows) => {
      expect(k.damage).toBeGreaterThan(0);
      expect(k.attackDs).toBeGreaterThan(0);
      expect(k.rangeM).toBeGreaterThanOrEqual(15);
      expect(k.spreadPct).toBeGreaterThan(0);
      if (n > 0) expect(k.damage).toBeGreaterThan(rows[n - 1]!.damage);
    });
    ARMOUR_KITS.forEach((k, t) => {
      expect(k.protectionPct).toBeLessThan(100);
      if (t > 0) expect(k.protectionPct).toBeGreaterThan(ARMOUR_KITS[t - 1]!.protectionPct);
    });
    TOOL_KITS.forEach((k, t) => {
      expect(k.tools.length).toBe(4);
      if (t > 0) {
        expect(k.damage).toBeGreaterThan(TOOL_KITS[t - 1]!.damage);
        for (let j = 0; j < 4; j++) expect(k.tools[j]!).toBeGreaterThanOrEqual(TOOL_KITS[t - 1]!.tools[j]!);
      }
    });
    WAND_KITS.forEach((k, t) => {
      if (t > 0) expect(k.powerPct).toBeGreaterThanOrEqual(WAND_KITS[t - 1]!.powerPct);
      if (t > 0) expect(k.mana).toBeGreaterThanOrEqual(WAND_KITS[t - 1]!.mana);
    });
    ROBE_KITS.forEach((k, t) => {
      if (t > 0) expect(k.protectionPct).toBeGreaterThanOrEqual(ROBE_KITS[t - 1]!.protectionPct);
    });
  });

  it('match the blueprint\'s melee, ranged, armour, shield, tool and wand tables', () => {
    for (const [id, rows] of [['2d.1', CLOSE_KITS], ['2d.2', LONG_KITS.slice(1)]] as const) {
      const doc = rowsOf(id);
      for (const k of rows) {
        const r = doc.get(String(k.tier))!;
        expect(r, `${id} ${k.tier}`).toBeDefined();
        expect(r[1]!.toLowerCase().startsWith(k.name.toLowerCase()), `${id} ${k.tier}`).toBe(true);
        expect(num(r[2]!), `${id} ${k.tier}`).toBe(k.damage);
        expect(Math.round(num(r[3]!) * 10), `${id} ${k.tier}`).toBe(k.swingDs);
        expect(Math.round(num(r[4]!) * 100), `${id} ${k.tier}`).toBe(k.reachCm);
        expect(num(r[7]!), `${id} ${k.tier}`).toBe(k.timeS);
      }
    }
    const t2e = rowsOf('2e');
    for (const k of RANGER_KITS.slice(1)) {
      const r = t2e.get(String(k.tier))!;
      expect(r[1]!.toLowerCase().startsWith(k.name.toLowerCase()), `2e ${k.tier}`).toBe(true);
      expect([num(r[2]!), Math.round(num(r[3]!) * 10), num(r[4]!), num(r[5]!), num(r[7]!)], `2e ${k.tier}`).toEqual([k.damage, k.attackDs, k.rangeM, k.spreadPct, k.timeS]);
    }
    const t31 = rowsOf('3.1');
    for (const k of ARMOUR_KITS.slice(1)) {
      const r = t31.get(String(k.tier))!;
      expect(r[1]!.toLowerCase()).toBe(k.name.toLowerCase());
      expect([num(r[2]!), num(r[5]!)], `3.1 ${k.tier}`).toEqual([k.protectionPct, k.timeS]);
    }
    const t32 = getTable('3.2').rows.map((r) => r.map((c) => c.text));
    for (const k of SHIELD_KITS.slice(1)) {
      const r = t32.find((x) => x[1]!.toLowerCase().startsWith(k.name.toLowerCase()))!;
      expect(r, k.name).toBeDefined();
      expect([num(r[2]!), num(r[4]!)], k.name).toEqual([k.blockPct, k.timeS]);
    }
    const t2c = rowsOf('2c');
    for (const k of TOOL_KITS.slice(1)) {
      const r = t2c.get(String(k.tier))!;
      expect(r[1]!.split(' ')[0], `2c ${k.tier}`).toBe(k.name.split(' ')[0]);
      expect([num(r[3]!), num(r[5]!)], `2c ${k.tier}`).toEqual([k.damage, k.timeS]);
    }
    const t132 = rowsOf('13.2');
    for (let t = 1; t <= TOP_MAGE_TIER; t++) {
      const r = t132.get(String(t))!;
      const w = WAND_KITS[t]!;
      const robe = ROBE_KITS[t]!;
      expect(r[1]!.toLowerCase().startsWith(w.name.toLowerCase()), `13.2 wand ${t}`).toBe(true);
      expect(r[2]).toMatch(new RegExp(`^x${(w.powerPct / 100).toFixed(2).replace(/0$/, '(0)?')}, \\+${w.mana}$`));
      expect(r[4]!.toLowerCase().startsWith(robe.name.toLowerCase()), `13.2 robe ${t}`).toBe(true);
      expect(r[5]).toBe(`${robe.protectionPct}%, +${robe.regainPct}%`);
      expect(r[7]).toBe(`${w.timeS} / ${robe.timeS} s`);
    }
  });

  it('give the ranger one ladder: a sling, a longbow, the recurve bow four times, a crossbow and a musket', () => {
    const [, sling, longbow, ...rest] = RANGER_KITS;
    const recurves = rest.slice(0, 4);
    const [crossbow, musket] = rest.slice(4);
    expect(sling!.name).toMatch(/sling/i);
    expect([sling!.shot, sling!.blunt]).toEqual([Shot.SlingStone, true]);
    expect(longbow!.name).toMatch(/longbow/i);
    expect(longbow!.shot).toBe(Shot.Arrow);
    // The same bow at 3 to 6: only the arrowheads (damage and the ingot) change.
    expect(recurves.map((k) => k.tier)).toEqual([3, 4, 5, 6]);
    for (const k of recurves) {
      expect(k.name).toMatch(/^Recurve bow, /);
      expect([k.shot, k.model, k.attackDs, k.rangeM, k.spreadPct, k.timeS]).toEqual([Shot.Arrow, 'bow', 20, 25, 6, 35]);
    }
    expect(crossbow!.name).toMatch(/crossbow/i);
    expect(crossbow!.shot).toBe(Shot.Bolt);
    expect(crossbow!.research).toEqual([Research.Crossbows]);
    expect(musket!.name).toMatch(/musket/i);
    expect(musket!.shot).toBe(Shot.MusketBall);
    expect(musket!.research).toEqual([Research.Gunpowder, Research.Muskets]);
    expect(TIER_NEEDS[musket!.need]!.forge).toBe(4);
    // The gear catalogue carries the same ladder.
    for (let t = 1; t <= TOP_TIER; t++) expect(gearSpec(RANGER_GEAR[t]!).ranged!.shot).toBe(RANGER_KITS[t]!.shot);
  });

  it('give close melee the shield of its armour tier: wooden, boiled-leather targe, iron-rimmed heater, steel heater, steel rotella', () => {
    expect(shieldRow(0).tier).toBe(0);
    const names = [1, 2, 3, 4, 5, 6, 7, 8].map((a) => shieldRow(a).name);
    expect(names).toEqual([
      'Wooden shield',
      'Wooden shield',
      'Boiled-leather targe',
      'Boiled-leather targe',
      'Boiled-leather targe',
      'Iron-rimmed heater shield',
      'Steel heater shield',
      'Steel rotella',
    ]);
    // Blocking never falls as the armour gets better.
    for (let a = 2; a <= TOP_TIER; a++) expect(shieldRow(a).blockPct).toBeGreaterThanOrEqual(shieldRow(a - 1).blockPct);
  });

  it('build the gear catalogue from the rows', () => {
    const check = (ids: readonly number[], rows: readonly { name: string; tier: number }[], from: number): void => {
      for (let t = from; t < rows.length; t++) {
        expect(ids[t], rows[t]!.name).toBeGreaterThan(0);
        expect(gearSpec(ids[t]!).name).toBe(rows[t]!.name);
      }
    };
    check(CLOSE_GEAR, CLOSE_KITS, 0);
    check(LONG_GEAR, LONG_KITS, 1);
    check(RANGER_GEAR, RANGER_KITS, 1);
    check(ARMOUR_GEAR, ARMOUR_KITS, 1);
    check(SHIELD_GEAR, SHIELD_KITS, 1);
    check(WAND_GEAR, WAND_KITS, 1);
    check(ROBE_GEAR, ROBE_KITS, 1);
    for (let t = 1; t <= TOP_TIER; t++) {
      expect(gearSpec(CLOSE_GEAR[t]!).melee!.damage).toBe(CLOSE_KITS[t]!.damage);
      expect(gearSpec(LONG_GEAR[t]!).melee!.crit).toBe(true);
      expect(gearSpec(CLOSE_GEAR[t]!).melee!.crit).toBe(false);
      expect(gearSpec(ARMOUR_GEAR[t]!).armourBp).toBe(ARMOUR_KITS[t]!.protectionPct * 100);
      for (const id of TOOL_GEAR[t]!) expect(gearSpec(id).tier).toBe(t);
    }
    expect(TOOL_GEAR[0]).toEqual([0, 0, 0, 0]);
  });
});
