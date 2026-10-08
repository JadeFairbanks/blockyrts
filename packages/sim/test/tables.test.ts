import { describe, expect, it } from 'vitest';
import {
  ARMOUR_GEAR,
  ARMOUR_KITS,
  BRAWLER_KIT,
  CLOSE_GEAR,
  CLOSE_KITS,
  gearSpec,
  LONG_GEAR,
  LONG_KITS,
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

// ----- the kit tables (Troops and gear) -----

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
