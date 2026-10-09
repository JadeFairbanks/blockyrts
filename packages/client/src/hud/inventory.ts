// The stockpile as a Minecraft-style inventory (Controls > Screen layout and
// mouse zones: Inventory grid): equal square slots, each with the good's
// picture and its count in the corner, 8 across and 2 down, scrolled a row at
// a time once more than 16 types of goods are held. Pure logic, no DOM: the
// slot order, which goods have slots, the scroll position, the count text and
// the change over the last minute. inventory-ui.ts draws it.
import { FISHES, MEATS, Res, RESOURCE_COUNT, RESOURCES, ResGroup, STEPS_PER_SECOND, TRINKET_METALS, TRINKET_TIERS, trinketRes } from '@blockyrts/sim';

/** Slots across and rows on screen. */
export const INVENTORY_COLUMNS = 8;
export const INVENTORY_ROWS = 2;
export const INVENTORY_SLOTS = INVENTORY_COLUMNS * INVENTORY_ROWS;

const trinkets: Res[] = [];
TRINKET_METALS.forEach((_, m) => TRINKET_TIERS.forEach((_t, t) => trinkets.push(trinketRes(m, t + 1))));

/**
 * Every good in slot order, by category, so a count changing never moves a
 * slot: woods, stone and flint, ores, metals, foods (each kind of meat and
 * fish apart, then the rest, and medicine), crafting goods, trinkets,
 * crystals, gear. A recipe's "meat" and "fish" (any kind) are never held, so they
 * have no slot.
 */
export const INVENTORY_GROUPS: ReadonlyArray<{ name: string; items: readonly Res[] }> = [
  { name: 'Woods', items: [Res.SoftwoodLumber, Res.HardwoodLumber, Res.Sticks, Res.Planks, Res.Resin] },
  { name: 'Stone and flint', items: [Res.Stone, Res.Flint, Res.Obsidian, Res.Marble, Res.Bluestone, Res.Earth, Res.Clay, Res.Sand] },
  {
    name: 'Ores',
    items: [Res.Coal, Res.Charcoal, Res.CopperOre, Res.TinOre, Res.BogIron, Res.IronRock, Res.VeinIron, Res.LeadOre, Res.Saltpetre, Res.Sulphur],
  },
  {
    name: 'Metals',
    items: [Res.CopperIngot, Res.TinIngot, Res.BronzeIngot, Res.WroughtIron, Res.PigIron, Res.IronIngot, Res.SteelIngot, Res.CarbonSteel, Res.Silver, Res.Gold],
  },
  {
    name: 'Foods',
    items: [
      ...MEATS,
      ...FISHES,
      Res.Eggs,
      Res.FarmFare,
      Res.BlackBerries,
      Res.Raspberries,
      Res.Blueberries,
      Res.Mushrooms,
      Res.BogPear,
      Res.HawthorneFruit,
      Res.Honey,
      Res.HawthorneCider,
      Res.EnchantedWine,
      Res.Herbs,
      Res.Bandage,
      Res.Remedy,
    ],
  },
  {
    name: 'Crafting goods',
    items: [
      Res.Hides,
      Res.Leather,
      Res.HardenedLeather,
      Res.Flax,
      Res.Rope,
      Res.Feathers,
      Res.Bone,
      Res.Bonemeal,
      Res.SpiderSilk,
      Res.Venom,
      Res.DemonHorn,
      Res.MoonRose,
      Res.AncientSeed,
      Res.Bricks,
      Res.Glass,
      Res.Gunpowder,
      Res.PoisonTips,
      Res.HandCart,
      Res.OxCart,
      Res.PanFlute,
    ],
  },
  { name: 'Trinkets', items: [...trinkets, Res.Moonleaf, Res.Sunheart, Res.BluestoneTrinket, Res.MoonIdol, Res.HeadlessIdol] },
  { name: 'Crystals', items: [Res.Hexstone, Res.ManaCrystal, Res.Emeralds, Res.Rubies, Res.Diamonds] },
  // Patch 5 (Jade's GP-1): weapons, armour, shields, tools, wands and robes in stock, as the kit tables list them.
  { name: 'Gear', items: RESOURCES.filter((r) => r.group === ResGroup.Gear).map((r) => r.id) },
];

/** Every good in slot order. */
export const INVENTORY_ORDER: readonly Res[] = INVENTORY_GROUPS.flatMap((g) => g.items);

const rank = new Int32Array(RESOURCE_COUNT).fill(-1);
INVENTORY_ORDER.forEach((r, i) => (rank[r] = i));

/** A count as it fits a slot's corner: exact to 9999, then 12k, 999k, 1.2M. The tooltip has the exact number. */
export function slotCount(n: number): string {
  if (n < 10_000) return String(n);
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  const m = Math.floor(n / 100_000) / 10;
  return `${m >= 100 ? Math.floor(m) : m}M`;
}

/**
 * Which goods have slots and which row is at the top. A good gets its slot the
 * first time the pool holds any and keeps it for the rest of the match, shown
 * greyed at zero, so the grid never shuffles as stock comes and goes.
 */
export class InventoryGrid {
  private readonly held = new Uint8Array(RESOURCE_COUNT);
  private list: Res[] = [];
  /** The first row on screen. */
  top = 0;

  /** Takes in the pool; true when a good got its first slot. */
  update(pool: ArrayLike<number>): boolean {
    let added = false;
    for (let r = 0; r < RESOURCE_COUNT; r++) {
      if (!this.held[r] && (pool[r] ?? 0) > 0) {
        this.held[r] = 1;
        added = true;
      }
    }
    if (added) {
      this.list = INVENTORY_ORDER.filter((r) => this.held[r] === 1);
      this.clamp();
    }
    return added;
  }

  /** The goods with slots, in slot order. */
  goods(): readonly Res[] {
    return this.list;
  }

  /** All rows, at least the two on screen. */
  rows(): number {
    return Math.max(INVENTORY_ROWS, Math.ceil(this.list.length / INVENTORY_COLUMNS));
  }

  maxTop(): number {
    return this.rows() - INVENTORY_ROWS;
  }

  canScroll(dir: -1 | 1): boolean {
    return dir < 0 ? this.top > 0 : this.top < this.maxTop();
  }

  /** Moves the view by whole rows; false when it was already at that end. */
  scroll(rows: number): boolean {
    const before = this.top;
    this.top += rows;
    this.clamp();
    return this.top !== before;
  }

  /** The 16 slots on screen: a good, or -1 for an empty slot. */
  visible(): number[] {
    const out: number[] = [];
    const first = this.top * INVENTORY_COLUMNS;
    for (let i = 0; i < INVENTORY_SLOTS; i++) out.push(this.list[first + i] ?? -1);
    return out;
  }

  private clamp(): void {
    this.top = Math.max(0, Math.min(this.maxTop(), this.top));
  }
}

/** Wheel travel (CSS pixels) that scrolls one row on a touchpad; a mouse wheel notch is always one row. */
export const WHEEL_ROW_PX = 40;

/**
 * Turns wheel deltas into whole rows: one row per mouse notch (Chrome sends
 * 100 px, Firefox 3 lines), and one row per 40 px of smooth touchpad travel.
 */
export class WheelRows {
  private acc = 0;

  /** The rows to move for this wheel event (0, 1 or -1). */
  push(dy: number): number {
    if (dy === 0) return 0;
    if (Math.sign(dy) !== Math.sign(this.acc)) this.acc = 0;
    this.acc += dy;
    if (Math.abs(this.acc) < WHEEL_ROW_PX) return 0;
    const rows = Math.sign(this.acc);
    this.acc = 0;
    return rows;
  }
}

/** How far back the tooltip's change looks: one minute of game time. */
export const CHANGE_WINDOW_STEPS = 60 * STEPS_PER_SECOND;
const SAMPLE_EVERY = STEPS_PER_SECOND;

/**
 * The pool once a second of game time, for the tooltip's "+12 in the last
 * minute": what was gathered or made less what was spent, as the HUD sees it.
 */
export class PoolHistory {
  private readonly samples: Array<{ step: number; pool: Int32Array }> = [];

  add(step: number, pool: ArrayLike<number>): void {
    const last = this.samples[this.samples.length - 1];
    if (last && step < last.step) this.samples.length = 0; // a loaded save or a rewind starts over
    else if (last && step - last.step < SAMPLE_EVERY) return;
    this.samples.push({ step, pool: Int32Array.from(pool as ArrayLike<number>) });
    // Keep the newest sample at or before the window's start, and everything after it.
    while (this.samples.length > 2 && this.samples[1]!.step <= step - CHANGE_WINDOW_STEPS) this.samples.shift();
  }

  /** The change in a good's count over the last minute (or since the first sample), and the seconds it covers. */
  change(res: number, step: number, now: number): { delta: number; seconds: number } {
    const base = this.samples[0];
    if (!base || step <= base.step) return { delta: 0, seconds: 0 };
    return { delta: now - (base.pool[res] ?? 0), seconds: Math.round((step - base.step) / STEPS_PER_SECOND) };
  }
}

/** The tooltip's change line: "+12 in the last minute", "-3 in the last 20 s", or "" before a second has passed. */
export function changeText(c: { delta: number; seconds: number }): string {
  if (c.seconds <= 0) return '';
  const d = c.delta > 0 ? `+${c.delta}` : c.delta < 0 ? `−${-c.delta}` : 'No change';
  return c.seconds >= 60 ? `${d} in the last minute.` : `${d} in the last ${c.seconds} s.`;
}

/** Where a good sits in slot order (for tests and sorting), or -1. */
export function slotRank(res: number): number {
  return rank[res] ?? -1;
}
