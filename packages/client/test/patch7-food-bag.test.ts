// Patch 7 (Jade): a food in one unit's own inventory opens Eat, which eats it
// where the unit stands; a food with a use of its own (enchanted wine) has both.
import { describe, expect, it } from 'vitest';
import { ARMOUR_GEAR, CLOSE_GEAR, Res, SHIELD_GEAR, Troop, UnitKind, type Order } from '@blockyrts/sim';
import type { UnitInfo } from '../src/game/game-info.ts';
import { bagMenu, type GearMenuDeps } from '../src/hud/gear-menus.ts';
import { NO_USE } from '../src/hud/item-menu.ts';

function unit(over: Partial<UnitInfo> = {}): UnitInfo {
  return {
    id: 7, owner: 0, kind: UnitKind.Warrior, x: 0, y: 0, z: 0, hp: 20, maxHp: 50, rank: 0, tools: [0, 0, 0, 0], carryRes: 0, carryAmt: 0, inside: 0, act: 0, order: 0, mob: 0,
    weapon: CLOSE_GEAR[6]!, ranged: 0, shield: SHIELD_GEAR[2]!, troop: Troop.Close, wTier: 6, aTier: 6, sTier: 2, tips: 0, upDone: 0, upLine: 0, upTo: 0, flags: 0, lock: 0, target: 0,
    armour: ARMOUR_GEAR[6]!, kit: 0, partner: 0, school: 0, mana: 0, maxMana: 0, cast: 0, beam: 0, spells: 0, group: 0, mount: 0, mountHp: 0, mountMax: 0, crew: 0, meal: 0, hungry: 0, xp: 0, xpNext: 0,
    ...over,
  };
}

function deps(bag: Array<[number, number]>, use = { name: 'Use', description: '', why: NO_USE, run: () => undefined }): { d: GearMenuDeps; sent: Order[] } {
  const sent: Order[] = [];
  const d: GearMenuDeps = {
    player: 0,
    bag: () => bag,
    have: () => 0,
    kept: () => false,
    queued: () => false,
    send: (o) => sent.push(o),
    startGive: () => undefined,
    scrapWhy: () => '',
    use: () => use,
  };
  return { d, sent };
}

describe('Eat in a unit\'s own inventory', () => {
  it('stands in for Use on a food and sends the unit to eat it where it stands', () => {
    const { d, sent } = deps([[Res.Beef, 2]]);
    const m = bagMenu(unit(), Res.Beef, d);
    expect(m.choices.map((c) => c.name)).toEqual(['Eat', 'Keep in bag', 'Give…', 'Unload', 'Drop']);
    expect(m.choices[0]!.why).toBeUndefined();
    m.choices[0]!.run();
    expect(sent).toEqual([{ kind: 'eatBag', player: 0, units: [7], res: Res.Beef }]);
  });

  it('is greyed out at full health', () => {
    const { d } = deps([[Res.Beef, 1]]);
    expect(bagMenu(unit({ hp: 50 }), Res.Beef, d).choices[0]!.why).toBe('It is at full health.');
  });

  it('sits beside a food\'s own use: enchanted wine is drunk for mana or eaten to heal', () => {
    const { d } = deps([[Res.EnchantedWine, 1]], { name: 'Drink', description: '', why: '', run: () => undefined });
    expect(bagMenu(unit({ kind: UnitKind.Mage }), Res.EnchantedWine, d).choices.map((c) => c.name).slice(0, 2)).toEqual(['Drink', 'Eat']);
  });

  it('leaves goods that are not food as they were', () => {
    const { d } = deps([[Res.Stone, 3]]);
    expect(bagMenu(unit(), Res.Stone, d).choices[0]!.name).toBe('Use');
  });
});
