// Patch 7's gear menus (plan section 7, the drafts in blueprint/patch7/
// ui-drafts): a gear slot's menu and Swap for…, a piece in a unit's bag, the
// hover's numbers, rarity's colours and shine, and Bag full.
import { describe, expect, it } from 'vitest';
import { ARMOUR_GEAR, CLOSE_GEAR, DREADNOUGHT_GEAR, Res, SHIELD_GEAR, SMASHING_LINE, Troop, UnitKind, type Order } from '@blockyrts/sim';
import type { UnitInfo } from '../src/game/game-info.ts';
import type { MenuChoice } from '../src/hud/card-pop.ts';
import { compareRows, rarityClass, shineOf, whoUses } from '../src/hud/gear-compare.ts';
import { bagFree, bagMenu, slotMenu, swapList, swapPage, wornItem, type GearMenuDeps } from '../src/hud/gear-menus.ts';

function unit(over: Partial<UnitInfo> = {}): UnitInfo {
  return {
    id: 7, owner: 0, kind: UnitKind.Warrior, x: 0, y: 0, z: 0, hp: 50, maxHp: 50, rank: 0, tools: [0, 0, 0, 0], carryRes: 0, carryAmt: 0, inside: 0, act: 0, order: 0, mob: 0,
    weapon: CLOSE_GEAR[6]!, ranged: 0, shield: SHIELD_GEAR[2]!, troop: Troop.Close, wTier: 6, aTier: 6, sTier: 2, tips: 0, upDone: 0, upLine: 0, upTo: 0, flags: 0, lock: 0, target: 0,
    armour: ARMOUR_GEAR[6]!, kit: 0, partner: 0, school: 0, mana: 0, maxMana: 0, cast: 0, beam: 0, spells: 0, group: 0, mount: 0, mountHp: 0, mountMax: 0, crew: 0, meal: 0, hungry: 0, xp: 0, xpNext: 0,
    ...over,
  };
}

function deps(bag: Array<[number, number]>, stock: Record<number, number>, over: Partial<GearMenuDeps> = {}): { d: GearMenuDeps; sent: Order[] } {
  const sent: Order[] = [];
  const d: GearMenuDeps = {
    player: 0,
    bag: () => bag,
    have: (res) => stock[res] ?? 0,
    kept: () => false,
    queued: () => false,
    send: (o) => sent.push(o),
    startGive: () => undefined,
    scrapWhy: () => '',
    use: () => ({ name: 'Use', description: '', why: 'It has no use of its own.', run: () => undefined }),
    ...over,
  };
  return { d, sent };
}

const names = (c: readonly MenuChoice[]): string[] => c.map((x) => x.name);

describe('rarity', () => {
  it('colours a piece of gear by its grade, and lets epic glint and legendary sparkle', () => {
    expect(rarityClass(Res.IronBroadsword)).toBe('rarity-rare');
    expect(rarityClass(Res.BasketHiltedBroadsword)).toBe('rarity-epic');
    expect(shineOf(Res.BasketHiltedBroadsword)).toBe('glint');
    expect(rarityClass(Res.MorvathStaff)).toBe('rarity-legendary');
    expect(shineOf(Res.MorvathStaff)).toBe('sparkle');
    expect(rarityClass(Res.Stone)).toBe('');
    expect(shineOf(Res.Stone)).toBeUndefined();
  });
});

describe('a gear slot menu (the drafts\' scene 1)', () => {
  it('offers Swap for…, Take off, Drop and Scrap for the piece it wears, named in its rarity\'s colour', () => {
    const u = unit();
    const { d, sent } = deps([[Res.ObsidianHandAxe, 1]], { [Res.BasketHiltedBroadsword]: 1 });
    const m = slotMenu(u, 0, d);
    expect(m.title).toBe('Iron broadsword');
    expect(m.titleClass).toBe('rarity-rare');
    expect(names(m.choices)).toEqual(['Swap for…', 'Take off', 'Drop', 'Scrap']);
    expect(m.choices[0]!.note).toBe('2 pieces fit: 1 in its bag, 1 in the stock.');
    m.choices[1]!.run();
    m.choices[2]!.run();
    m.choices[3]!.run();
    expect(sent).toEqual([
      { kind: 'takeOff', player: 0, units: [7], line: 0, drop: 0 },
      { kind: 'takeOff', player: 0, units: [7], line: 0, drop: 1 },
      { kind: 'scrapItem', player: 0, units: [7], res: Res.IronBroadsword, worn: 1, building: 0 },
    ]);
  });

  it('lists its bag first, then the stock, best first, then what will not fit with why', () => {
    const u = unit();
    const { d, sent } = deps([[Res.ObsidianHandAxe, 1], [Res.MinotaurGreatAxe, 1]], { [Res.BasketHiltedBroadsword]: 1, [Res.SteelSideSword]: 3, [Res.WoodenCudgel]: 2 });
    const l = swapList(u, 0, d);
    expect(l.bag).toEqual([Res.ObsidianHandAxe]);
    expect(l.stock).toEqual([Res.BasketHiltedBroadsword, Res.SteelSideSword, Res.WoodenCudgel]);
    expect(l.not.map((n) => n.res)).toEqual([Res.MinotaurGreatAxe]);
    expect(l.not[0]!.why).toMatch(/^Too heavy/);
    const page = swapPage(u, 0, d);
    expect(page.choices.map((c) => c.group)).toEqual([
      'In its bag · puts it on now',
      'In the stock · walks to the nearest store point',
      'In the stock · walks to the nearest store point',
      'In the stock · walks to the nearest store point',
      'Will not fit',
    ]);
    // The best that beats what it has is lit, with an up arrow; the hand-axe is worse.
    expect(page.choices[0]!.value?.dir).toBe('down');
    expect(page.choices[1]!.lit).toBe(true);
    expect(page.choices[1]!.value?.dir).toBe('up');
    expect(page.choices[1]!.name).toBe('Basket-hilted broadsword');
    expect(page.choices[2]!.name).toBe('Steel side-sword ×3');
    page.choices[0]!.run();
    page.choices[1]!.run();
    // A greyed row still sends its order: the unit says why.
    expect(page.choices[4]!.why).toMatch(/^Too heavy/);
    page.choices[4]!.greyRun!();
    expect(sent).toEqual([
      { kind: 'equipBag', player: 0, units: [7], res: Res.ObsidianHandAxe },
      { kind: 'equip', player: 0, units: [7], res: Res.BasketHiltedBroadsword, queued: false },
      { kind: 'equipBag', player: 0, units: [7], res: Res.MinotaurGreatAxe },
    ]);
  });

  it('greys Take off with Bag full when the piece would not fit in its bag', () => {
    const full = unit();
    const { d } = deps([[Res.Stone, 1000]], {});
    expect(bagFree(full, d.bag(7))).toBe(0);
    const m = slotMenu(full, 0, d);
    expect(m.choices[1]!.why).toBe('Bag full');
  });

  it('greys a one-handed sword for the Dreadnought with his line, and still sends it', () => {
    const big = unit({ troop: Troop.Dreadnought, weapon: DREADNOUGHT_GEAR.mace, armour: DREADNOUGHT_GEAR.plate, shield: 0, wTier: 0, aTier: 0, sTier: 0 });
    expect(wornItem(big, 0)).toBe(Res.HeavySpikedMace);
    const { d, sent } = deps([], { [Res.SteelSideSword]: 1, [Res.MinotaurGreatAxe]: 1 });
    const page = swapPage(big, 0, d);
    const sword = page.choices.find((c) => c.name === 'Steel side-sword')!;
    expect(sword.why).toBe(SMASHING_LINE);
    sword.greyRun!();
    expect(sent).toEqual([{ kind: 'equip', player: 0, units: [7], res: Res.SteelSideSword, queued: false }]);
    expect(page.choices.find((c) => c.name === "Minotaur's great axe")!.why).toBeUndefined();
  });
});

describe('a piece in a unit\'s bag (the drafts\' scene 6)', () => {
  it('offers Use, Equip, Keep in bag, Give…, Unload, Drop and Scrap', () => {
    const u = unit();
    const gave: string[] = [];
    const { d, sent } = deps([[Res.ObsidianHandAxe, 1]], {}, { startGive: (unit, res) => gave.push(`${unit} ${res}`) });
    const m = bagMenu(u, Res.ObsidianHandAxe, d);
    expect(names(m.choices)).toEqual(['Use', 'Equip', 'Keep in bag', 'Give…', 'Unload', 'Drop', 'Scrap']);
    expect(m.choices[1]!.note).toBe('In place of its iron broadsword, which goes into its bag.');
    for (const c of m.choices.slice(1)) c.run();
    expect(gave).toEqual([`7 ${Res.ObsidianHandAxe}`]);
    expect(sent).toEqual([
      { kind: 'equipBag', player: 0, units: [7], res: Res.ObsidianHandAxe },
      { kind: 'keepItem', player: 0, units: [7], res: Res.ObsidianHandAxe, on: 1 },
      { kind: 'unloadItem', player: 0, units: [7], res: Res.ObsidianHandAxe },
      { kind: 'dropItem', player: 0, units: [7], res: Res.ObsidianHandAxe },
      { kind: 'scrapItem', player: 0, units: [7], res: Res.ObsidianHandAxe, worn: 0, building: 0 },
    ]);
  });

  it('lets a kept good go again, and gives plain goods no Equip or Scrap', () => {
    const u = unit();
    const { d } = deps([[Res.Stone, 3]], {}, { kept: () => true, scrapWhy: () => null });
    expect(names(bagMenu(u, Res.Stone, d).choices)).toEqual(['Use', 'Stop keeping', 'Give…', 'Unload', 'Drop']);
  });
});

describe('the hover (plan section 7)', () => {
  it('sets a piece\'s numbers beside what the unit has, with arrows; Heft is a size, not better or worse', () => {
    const rows = compareRows(CLOSE_GEAR[8]!, null, CLOSE_GEAR[6]!);
    const damage = rows.find((r) => r.label === 'Damage')!;
    expect(damage.dir).toBe('up');
    const heft = rows.find((r) => r.label === 'Heft')!;
    expect(heft.dir).toBeUndefined();
  });

  it('says who can use a piece', () => {
    const who = whoUses(Res.IronBroadsword);
    expect(who[0]).toEqual({ text: 'Swordsmen', ok: true });
    expect(who.at(-1)!.ok).toBe(false);
    expect(who.at(-1)!.text).toContain('the Dreadnought');
  });
});
