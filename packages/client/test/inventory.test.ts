// The stockpile's inventory grid (Controls > Screen layout and mouse zones:
// Inventory grid): slot order, which goods have slots, scrolling by rows, the
// count in a slot's corner, the wheel, the change over the last minute, and a
// catalogue icon for every good.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FISHES, FOODS, isAnyRes, MEATS, Res, RESOURCE_COUNT, RESOURCES, STEPS_PER_SECOND } from '@blockyrts/sim';
import { FOOD_ICON, goodIcon, iconUrl, SUPPLY_ICON } from '../src/hud/inventory-icons.ts';
import {
  changeText,
  CHANGE_WINDOW_STEPS,
  INVENTORY_GROUPS,
  INVENTORY_ORDER,
  INVENTORY_SLOTS,
  InventoryGrid,
  PoolHistory,
  slotCount,
  slotRank,
  WheelRows,
} from '../src/hud/inventory.ts';

const pool = (have: Partial<Record<number, number>>): Int32Array => {
  const p = new Int32Array(RESOURCE_COUNT);
  for (const [r, n] of Object.entries(have)) p[Number(r)] = n!;
  return p;
};

/** Every good that can be held: a recipe's "meat" and "fish" (any kind) never are. */
const HELD = RESOURCES.filter((r) => !isAnyRes(r.id));

describe('slot order', () => {
  it('gives every good one slot, in the categories the doc names', () => {
    expect(INVENTORY_ORDER).toHaveLength(HELD.length);
    expect(new Set(INVENTORY_ORDER).size).toBe(HELD.length);
    for (const r of HELD) expect(slotRank(r.id)).toBeGreaterThanOrEqual(0);
    expect(slotRank(Res.AnyMeat)).toBe(-1);
    expect(INVENTORY_GROUPS.map((g) => g.name)).toEqual(['Woods', 'Stone and flint', 'Ores', 'Metals', 'Foods', 'Crafting goods', 'Trinkets', 'Crystals']);
  });

  it('keeps every food in the Foods group, and woods first', () => {
    const foods = INVENTORY_GROUPS.find((g) => g.name === 'Foods')!.items;
    for (const f of FOODS) expect(foods).toContain(f);
    // Each kind of meat and fish has its own slot, raw meats first.
    expect(foods.slice(0, MEATS.length + FISHES.length)).toEqual([...MEATS, ...FISHES]);
    expect(INVENTORY_ORDER.slice(0, 2)).toEqual([Res.SoftwoodLumber, Res.HardwoodLumber]);
  });
});

describe('icons', () => {
  const ui = (file: string): string => fileURLToPath(new URL(`../../assets/src/ui/${file}.png`, import.meta.url));

  it('has a catalogue icon for every good, in the build', () => {
    for (const r of HELD) {
      const icon = goodIcon(r.id);
      expect(icon, r.name).toBeDefined();
      expect(existsSync(ui(icon!.file)), `${r.name}: ${icon!.file}`).toBe(true);
      expect(iconUrl(icon!.file), `${r.name}: ${icon!.file} is not in the glob`).not.toBe('');
    }
    for (const f of [FOOD_ICON, SUPPLY_ICON]) expect(iconUrl(f)).not.toBe('');
  });
});

describe('the grid', () => {
  it('gives a good its slot when it is first held, in slot order, not arrival order', () => {
    const g = new InventoryGrid();
    expect(g.update(pool({ [Res.Venison]: 25 }))).toBe(true);
    expect(g.update(pool({ [Res.Venison]: 25, [Res.Stone]: 3, [Res.SoftwoodLumber]: 1 }))).toBe(true);
    expect(g.goods()).toEqual([Res.SoftwoodLumber, Res.Stone, Res.Venison]);
    expect(g.update(pool({ [Res.Venison]: 30, [Res.Stone]: 9, [Res.SoftwoodLumber]: 1 }))).toBe(false);
    const v = g.visible();
    expect(v).toHaveLength(INVENTORY_SLOTS);
    expect(v.slice(0, 4)).toEqual([Res.SoftwoodLumber, Res.Stone, Res.Venison, -1]);
  });

  it('keeps a slot at zero for the rest of the match', () => {
    const g = new InventoryGrid();
    g.update(pool({ [Res.Flint]: 4 }));
    g.update(pool({}));
    expect(g.goods()).toEqual([Res.Flint]);
  });

  it('scrolls a row of 8 at a time once more than 16 goods are held, and not before', () => {
    const g = new InventoryGrid();
    const have: Record<number, number> = {};
    for (const r of INVENTORY_ORDER.slice(0, 16)) have[r] = 1;
    g.update(pool(have));
    expect(g.maxTop()).toBe(0);
    expect(g.canScroll(1)).toBe(false);
    expect(g.scroll(1)).toBe(false);

    for (const r of INVENTORY_ORDER.slice(16, 17)) have[r] = 1;
    g.update(pool(have));
    expect(g.rows()).toBe(3);
    expect(g.canScroll(-1)).toBe(false);
    expect(g.scroll(1)).toBe(true);
    expect(g.top).toBe(1);
    expect(g.visible().slice(0, 9)).toEqual([...INVENTORY_ORDER.slice(8, 17)]);
    expect(g.visible()[9]).toBe(-1);
    expect(g.scroll(5)).toBe(false);
    expect(g.scroll(-9)).toBe(true);
    expect(g.top).toBe(0);
  });
});

describe('a slot', () => {
  it('fits the count in its corner', () => {
    expect(slotCount(0)).toBe('0');
    expect(slotCount(9999)).toBe('9999');
    expect(slotCount(12_345)).toBe('12k');
    expect(slotCount(999_999)).toBe('999k');
    expect(slotCount(1_250_000)).toBe('1.2M');
    expect(slotCount(123_456_789)).toBe('123M');
  });
});

describe('the wheel', () => {
  it('moves one row per mouse notch and one per 40 px of touchpad travel', () => {
    const w = new WheelRows();
    expect(w.push(100)).toBe(1);
    expect(w.push(48)).toBe(1);
    expect(w.push(-100)).toBe(-1);
    expect([10, 10, 10].map((d) => w.push(d))).toEqual([0, 0, 0]);
    expect(w.push(10)).toBe(1);
    expect(w.push(30)).toBe(0);
    expect(w.push(-30)).toBe(0); // turning back starts again
    expect(w.push(-10)).toBe(-1);
  });
});

describe('the change over the last minute', () => {
  it('compares with the pool a minute of game time ago', () => {
    const h = new PoolHistory();
    for (let s = 0; s <= 2 * CHANGE_WINDOW_STEPS; s += 5) h.add(s, pool({ [Res.Stone]: s / STEPS_PER_SECOND }));
    const now = 2 * CHANGE_WINDOW_STEPS;
    expect(h.change(Res.Stone, now, now / STEPS_PER_SECOND)).toEqual({ delta: 60, seconds: 60 });
    expect(changeText({ delta: 60, seconds: 60 })).toBe('+60 in the last minute.');
  });

  it('covers less than a minute early on, and starts over when the game steps back', () => {
    const h = new PoolHistory();
    expect(h.change(Res.Stone, 0, 5)).toEqual({ delta: 0, seconds: 0 });
    h.add(100, pool({ [Res.Stone]: 50 }));
    h.add(500, pool({ [Res.Stone]: 20 }));
    expect(h.change(Res.Stone, 500, 20)).toEqual({ delta: -30, seconds: 20 });
    expect(changeText({ delta: -30, seconds: 20 })).toBe('−30 in the last 20 s.');
    expect(changeText({ delta: 0, seconds: 60 })).toBe('No change in the last minute.');
    expect(changeText({ delta: 5, seconds: 0 })).toBe('');
    h.add(40, pool({ [Res.Stone]: 7 }));
    expect(h.change(Res.Stone, 40, 7)).toEqual({ delta: 0, seconds: 0 });
  });
});
