// Patch 5's unit inventory and item menu (Jade's GP-2, GP-7 and GP-34, with
// decisions 3.6): one menu for every item, one unit's goods and weight, and
// the bars on the spells' pictures.
import { describe, expect, it } from 'vitest';
import { HEX_STEPS, Res, SPELLS, Spell, STEPS_PER_SECOND } from '@blockyrts/sim';
import { SpellOn } from '../src/messages.ts';
import { effectLeftText, effectPct } from '../src/hud/effects.ts';
import { equippable, itemChoices, NO_USE, registerItemUse, type ItemMenuActions } from '../src/hud/item-menu.ts';
import { pounds, UNIT_SLOTS, unitGoods, weightView } from '../src/hud/unit-inventory.ts';

function actions(over: Partial<ItemMenuActions> = {}): { a: ItemMenuActions; done: string[] } {
  const done: string[] = [];
  const a: ItemMenuActions = {
    have: () => 1,
    kept: () => false,
    dontEat: (res, on) => done.push(`dontEat ${res} ${on}`),
    equip: (res) => done.push(`equip ${res}`),
    scrapWhy: (res) => (equippable(res) ? '' : null),
    scrap: (res) => done.push(`scrap ${res}`),
    unload: (unit, res) => done.push(`unload ${unit} ${res}`),
    drop: (unit, res) => done.push(`drop ${unit} ${res}`),
    selected: () => 0,
    equipSelected: (res) => done.push(`equipSelected ${res}`),
    fetchSelected: (res) => done.push(`fetchSelected ${res}`),
    ...over,
  };
  return { a, done };
}

const names = (c: ReturnType<typeof itemChoices>): string[] => c.map((x) => x.name);

describe('one item menu for the stock and a unit (decisions 3.6)', () => {
  it('offers Use, Equip and Scrap for gear in the stock, Use greyed with why', () => {
    const { a, done } = actions();
    const c = itemChoices({ res: Res.SteelSideSword, unit: null }, a);
    expect(names(c)).toEqual(['Use', 'Equip', 'Scrap']);
    expect(c[0]!.why).toBe(NO_USE);
    c[1]!.run();
    c[2]!.run();
    expect(done).toEqual([`equip ${Res.SteelSideSword}`, `scrap ${Res.SteelSideSword}`]);
    // None in the stock: Equip and Scrap greyed out.
    const none = itemChoices({ res: Res.SteelSideSword, unit: null }, actions({ have: () => 0 }).a);
    expect(none[1]!.why).toBe('There is none in the stock.');
    expect(none[2]!.why).toBe('There is none in the stock.');
    // No Workshop: Scrap says so.
    expect(itemChoices({ res: Res.SteelSideSword, unit: null }, actions({ scrapWhy: () => 'There is no Workshop to scrap it at.' }).a)[2]!.why).toBe('There is no Workshop to scrap it at.');
  });

  it('equips the selected units from the stock, and still offers Equip… to pick one (Patch 7)', () => {
    const { a, done } = actions({ selected: () => 3 });
    const c = itemChoices({ res: Res.SteelSideSword, unit: null }, a);
    expect(names(c)).toEqual(['Use', 'Equip', 'Equip…', 'Fetch', 'Scrap']);
    expect(c[1]!.description).toContain('Each of the 3 selected units it would better takes one');
    c[1]!.run();
    c[2]!.run();
    c[3]!.run();
    expect(done).toEqual([`equipSelected ${Res.SteelSideSword}`, `equip ${Res.SteelSideSword}`, `fetchSelected ${Res.SteelSideSword}`]);
  });

  it('keeps a food back with Don\'t eat, and lets it be eaten again', () => {
    const { a, done } = actions();
    const c = itemChoices({ res: Res.Venison, unit: null }, a);
    expect(names(c)).toEqual(['Use', "Don't eat"]);
    c[1]!.run();
    expect(done).toEqual([`dontEat ${Res.Venison} true`]);
    expect(names(itemChoices({ res: Res.Venison, unit: null }, actions({ kept: () => true }).a))).toEqual(['Use', 'Eat again']);
  });

  it('offers Unload and Drop for what one unit carries, not Equip or Scrap', () => {
    const { a, done } = actions();
    const c = itemChoices({ res: Res.Stone, unit: 42 }, a);
    expect(names(c)).toEqual(['Use', 'Unload', 'Drop']);
    c[1]!.run();
    c[2]!.run();
    expect(done).toEqual([`unload 42 ${Res.Stone}`, `drop 42 ${Res.Stone}`]);
    expect(names(itemChoices({ res: Res.SteelSideSword, unit: 42 }, a))).toEqual(['Use', 'Unload', 'Drop']);
  });

  it('runs an item\'s own use, under its own name, greyed with its reason', () => {
    let used = 0;
    registerItemUse(Res.Moonleaf, { name: 'Plant seed', description: 'Plant it.', why: (at) => (at.unit === null ? '' : 'Plant it from the stock.'), run: () => used++ });
    const c = itemChoices({ res: Res.Moonleaf, unit: null }, actions().a);
    expect(c[0]).toMatchObject({ name: 'Plant seed', description: 'Plant it.' });
    expect(c[0]!.why).toBeUndefined();
    c[0]!.run();
    expect(used).toBe(1);
    expect(itemChoices({ res: Res.Moonleaf, unit: 7 }, actions().a)[0]!.why).toBe('Plant it from the stock.');
  });

  it('equips every weapon, armour, shield, tool, wand and robe, and poison tips', () => {
    for (const r of [Res.SteelSideSword, Res.LeatherJerkin, Res.WoodenShield, Res.CopperTools, Res.HazelWand, Res.HomespunRobe, Res.PoisonTips]) expect(equippable(r)).toBe(true);
    for (const r of [Res.Stone, Res.Venison, Res.Rope]) expect(equippable(r)).toBe(false);
  });
});

describe('one unit\'s inventory (GP-7)', () => {
  it('puts its load and its loot together, a slot per good in the stockpile\'s order', () => {
    expect(unitGoods({ res: Res.Stone, amt: 5 }, [[Res.Venison, 3], [Res.Stone, 2], [Res.SoftwoodLumber, 1]])).toEqual([
      [Res.SoftwoodLumber, 1],
      [Res.Stone, 7],
      [Res.Venison, 3],
    ]);
    expect(unitGoods(null, [])).toEqual([]);
    expect(unitGoods({ res: Res.Stone, amt: 0 }, [])).toEqual([]);
    expect(UNIT_SLOTS).toBe(8);
  });

  it('says the weight it carries out of what it can, in pounds', () => {
    expect(pounds(125)).toBe('12.5');
    expect(pounds(250)).toBe('25');
    const w = weightView(125, 250);
    expect(w.text).toBe('12.5/25 lb');
    expect(w.name).toBe('Weight: 12.5 of 25 lb');
    expect(w.tip).toMatch(/^The first number is what everything it carries weighs now/);
    expect(w.full).toBe(false);
    expect(weightView(250, 250).full).toBe(true);
  });
});

describe('the bars on spells (GP-34)', () => {
  it('runs from full to empty over each spell\'s own time', () => {
    const quicken = SPELLS[Spell.Quicken]!.steps;
    expect(effectPct(SpellOn.Quicken, quicken)).toBe(100);
    expect(effectPct(SpellOn.Quicken, quicken / 2)).toBe(50);
    expect(effectPct(SpellOn.Quicken, 0)).toBe(0);
    expect(effectPct(SpellOn.Hexed, HEX_STEPS / 4)).toBe(25);
    // Heal (3 s) and Mending bloom (8 s) both heal: the time left says which.
    expect(effectPct(SpellOn.Healing, SPELLS[Spell.Heal]!.steps)).toBe(100);
    expect(effectPct(SpellOn.Healing, SPELLS[Spell.MendingBloom]!.steps)).toBe(100);
    expect(effectLeftText(STEPS_PER_SECOND * 3 + 1, STEPS_PER_SECOND)).toBe('4 s left.');
  });
});
