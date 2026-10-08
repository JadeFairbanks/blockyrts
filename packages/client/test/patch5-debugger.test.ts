// Jade's Patch 5: godmode's unit on the cursor is drawn as what a click will
// place (EX-11: "the corresponding opaque unit model"), with its kit, its
// mount and its side, and every entry of the spawn grid has a picture or a
// name to show.
import { describe, expect, it } from 'vitest';
import { GOD_SPAWNS, MONSTERS, Mount, School, TOP_MAGE_TIER, TOP_TIER, Troop, UnitKind, WILD } from '@blockyrts/sim';
import { godGhostRow } from '../src/game/god-ghost.ts';
import { godSpawnIconFile } from '../src/hud/unit-icons.ts';
import { S } from '../src/messages.ts';

const find = (what: string, id: number): number => GOD_SPAWNS.findIndex((g) => g.what === what && g.id === id);

describe('godmode cursor ghost (Patch 5)', () => {
  it('wears the top kit a placed troop gets, and cavalry sits a horse', () => {
    const close = godGhostRow(find('troop', Troop.Close), 2)!;
    expect([close[S.owner], close[S.kind], close[S.troop], close[S.wTier], close[S.aTier]]).toEqual([2, UnitKind.Warrior, Troop.Close, TOP_TIER, TOP_TIER]);
    expect(close[S.weapon]).toBeGreaterThan(0);
    expect(close[S.armour]).toBeGreaterThan(0);
    expect(close[S.shield]).toBeGreaterThan(0);
    const ranger = godGhostRow(find('troop', Troop.Ranger), 0)!;
    expect(ranger[S.ranged]).toBeGreaterThan(0);
    const cavalry = godGhostRow(find('troop', Troop.Cavalry), 0)!;
    expect(cavalry[S.mount]).toBe(Mount.Horse);
    const mage = godGhostRow(find('mage', School.Battle), 0)!;
    expect([mage[S.kind], mage[S.school], mage[S.wTier], mage[S.aTier]]).toEqual([UnitKind.Mage, School.Battle, TOP_MAGE_TIER, TOP_MAGE_TIER]);
  });

  it('is the placing player\'s, the wild\'s or the monsters\', as the placed thing will be', () => {
    GOD_SPAWNS.forEach((g, k) => {
      const row = godGhostRow(k, 3)!;
      expect(row[S.owner], g.name).toBe(g.side === 'player' ? 3 : g.side === 'wild' ? WILD : MONSTERS);
    });
    expect(godGhostRow(GOD_SPAWNS.length, 0)).toBeNull();
  });

  it('gives every players\' unit in the grid a picture', () => {
    for (const g of GOD_SPAWNS) if (g.side === 'player' && g.what !== 'engine' && g.what !== 'animal') expect(godSpawnIconFile(g), g.name).not.toBe('');
  });
});
