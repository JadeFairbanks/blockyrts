// A piece of gear's numbers and looks for the HUD (Patch 7, plan sections 3
// and 7): its rarity's name colour and shine, the numbers a menu row and a
// tooltip show, and how they compare with what a unit has now. Pieces rank by
// their real numbers (plan 2.4: weapons by damage per second against one
// enemy, armour by protection, wands by spell power, robes by their bonuses),
// so the number a menu row shows is the one it is ranked by and its arrow
// never disagrees with the order.
import {
  Body,
  bodyOf,
  dreadnoughtMelee,
  FIT_RANGES,
  fits,
  gearSpec,
  isGearItem,
  itemGear,
  itemHeft,
  itemRarity,
  itemStature,
  type KitHolder,
  Rarity,
  RARITY_NAMES,
  STEPS_PER_SECOND,
  Troop,
  WU_PER_METRE,
  type GearSpec,
} from '@blockyrts/sim';
import type { CompareRow, CompareTip } from './buttons.ts';
import type { RowValue } from './card-pop.ts';

/** A rarity's name colour, as a class (hud.css: Common blue, Rare orange, Epic purple, Legendary white). */
export const RARITY_CLASS: readonly string[] = ['rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary'];

/** A good's name colour class: its rarity's for a piece of gear, '' for anything else. */
export function rarityClass(res: number): string {
  return isGearItem(res) ? (RARITY_CLASS[itemRarity(res)] ?? '') : '';
}

/** How a good's picture shines (plan section 3): an epic piece glints, a legendary one sparkles. */
export function shineOf(res: number): 'glint' | 'sparkle' | undefined {
  if (!isGearItem(res)) return undefined;
  const r = itemRarity(res);
  return r === Rarity.Legendary ? 'sparkle' : r === Rarity.Epic ? 'glint' : undefined;
}

/** A rarity's word ("Epic"). */
export function rarityName(res: number): string {
  return isGearItem(res) ? (RARITY_NAMES[itemRarity(res)] ?? '') : '';
}

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));
const round1 = (v: number): number => Math.round(v * 10) / 10;

/** One number of a piece: its word, its value and how it reads, and which way is better. */
export interface GearNum {
  key: string;
  label: string;
  value: number;
  text: string;
  /** Lower is better (the time between swings). */
  lowBetter?: boolean;
  /** Its unit for a change ("s", "m", "%"), '' for none. */
  unit: string;
}

const n = (key: string, label: string, value: number, unit: string, lowBetter = false): GearNum => ({
  key,
  label,
  value: round1(value),
  text: `${fmt(round1(value))}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`,
  unit,
  ...(lowBetter ? { lowBetter } : {}),
});

/** Whether a holder is the Dreadnought (his blows are 1.5 times, plan 2.3). */
function big(h: KitHolder | null): boolean {
  return h !== null && bodyOf(h) === Body.Dreadnought;
}

/** A gear row's numbers, in the holder's hands (the Dreadnought hits 1.5 times as hard with any weapon but his own mace). */
export function gearNums(gear: number, h: KitHolder | null = null): GearNum[] {
  const g: GearSpec = gearSpec(gear);
  const out: GearNum[] = [];
  if (g.melee) {
    const m = big(h) ? dreadnoughtMelee(g.melee) : g.melee;
    out.push(n('damage', 'Damage', m.damage, ''), n('swing', 'Swing', m.attackSteps / STEPS_PER_SECOND, 's', true), n('reach', 'Reach', m.reach / WU_PER_METRE, 'm'));
  } else if (g.ranged) {
    const r = g.ranged;
    out.push(n('damage', 'Damage', r.damage, ''), n('shot', 'Shot every', r.attackSteps / STEPS_PER_SECOND, 's', true), n('range', 'Range', r.range / WU_PER_METRE, 'm'));
  }
  if (g.wand) out.push(n('power', 'Spell power', g.wand.powerPct, '%'), n('mana', 'Mana bar', g.wand.mana, ''));
  if (g.armourBp !== undefined) out.push(n('protection', 'Protection', g.armourBp / 100, '%'));
  if (g.robe) out.push(n('regain', 'Mana regain', g.robe.regainPct, '%'));
  if (g.blockBp !== undefined) out.push(n('block', 'Block', g.blockBp / 100, '%'));
  if (g.tool !== undefined) out.push(n('tool', 'Tool tier', g.tool, ''));
  if (g.heft) out.push({ key: 'heft', label: 'Heft', value: g.heft, text: String(g.heft), unit: '', lowBetter: false });
  if (g.stature) out.push({ key: 'stature', label: 'Stature', value: g.stature, text: String(g.stature), unit: '' });
  return out;
}

/** The number a row ranks by and shows (plan 2.4), with its words for a menu's line ("damage a second"). */
export function headNum(gear: number, h: KitHolder | null = null): { value: number; text: string; words: string } | null {
  const g = gearSpec(gear);
  const hit = g.melee ? (big(h) ? dreadnoughtMelee(g.melee) : g.melee) : g.ranged;
  if (hit) {
    const v = round1((hit.damage * STEPS_PER_SECOND) / Math.max(1, hit.attackSteps));
    return { value: v, text: `${fmt(v)}/s`, words: `${fmt(v)} damage a second` };
  }
  if (g.wand) return { value: g.wand.powerPct, text: `${g.wand.powerPct}%`, words: `spell power ${g.wand.powerPct}%` };
  if (g.blockBp !== undefined) return { value: g.blockBp / 100, text: `${fmt(g.blockBp / 100)}%`, words: `block ${fmt(g.blockBp / 100)}%` };
  if (g.armourBp !== undefined) {
    const p = round1(g.armourBp / 100);
    return { value: p, text: `${fmt(p)}%`, words: `protection ${fmt(p)}%` };
  }
  if (g.tool !== undefined) return { value: g.tool, text: `tier ${g.tool}`, words: `tool tier ${g.tool}` };
  return null;
}

/** Which way a number moved from what the unit has, and by how much. */
function towards(has: number, is: number, lowBetter: boolean): { dir: 'up' | 'down' | 'same'; by: string } {
  const d = round1(is - has);
  if (d === 0) return { dir: 'same', by: '' };
  return { dir: d > 0 !== lowBetter ? 'up' : 'down', by: fmt(Math.abs(d)) };
}

/** A menu row's value: its number and an arrow against what the unit has now (none when it has nothing on that line). */
export function rowValue(gear: number, h: KitHolder | null, now: number): RowValue | undefined {
  const v = headNum(gear, h);
  if (!v) return undefined;
  const had = now ? headNum(now, h) : null;
  if (!had) return { text: v.text };
  const t = towards(had.value, v.value, false);
  return t.dir === 'same' ? { text: v.text, dir: 'same' } : { text: v.text, dir: t.dir, by: t.by };
}

/** The numbers of a piece beside those of what a unit has now (`now` 0: nothing to compare), as the tooltip's table rows. */
export function compareRows(gear: number, h: KitHolder | null, now: number): CompareRow[] {
  const is = gearNums(gear, h);
  const has = now ? gearNums(now, h) : [];
  return is.map((x) => {
    const old = has.find((y) => y.key === x.key);
    if (!now) return { label: x.label, is: x.text };
    if (!old) return { label: x.label, has: '—', is: x.text };
    // Heft and Stature are sizes, not better or worse.
    if (x.key === 'heft' || x.key === 'stature') return { label: x.label, has: old.text, is: x.text };
    const t = towards(old.value, x.value, x.lowBetter === true);
    return { label: x.label, has: old.text, is: x.text, dir: t.dir, ...(t.by ? { by: `${t.by}${x.unit === '%' ? '%' : x.unit ? ` ${x.unit}` : ''}` } : {}) };
  });
}

/** Everyone a piece could go on, one holder of each kind, with the word the tooltip names them by. */
const WHO: ReadonlyArray<{ word: string; h: KitHolder }> = [
  { word: 'Swordsmen', h: { kind: 'warrior', troop: Troop.Close, w: 1, a: 1, s: 1, t: 0 } },
  { word: 'Spearmen', h: { kind: 'warrior', troop: Troop.Long, w: 1, a: 1, s: 0, t: 0 } },
  { word: 'Cavalry', h: { kind: 'warrior', troop: Troop.Cavalry, w: 1, a: 1, s: 0, t: 0 } },
  { word: 'Woodsmen', h: { kind: 'warrior', troop: Troop.Woodsman, w: 1, a: 0, s: 0, t: 0 } },
  { word: 'Rangers', h: { kind: 'warrior', troop: Troop.Ranger, w: 1, a: 1, s: 0, t: 0 } },
  { word: 'Brawlers', h: { kind: 'warrior', troop: Troop.Brawler, w: 8, a: 1, s: 0, t: 0 } },
  { word: 'Mages', h: { kind: 'mage', troop: 0, w: 1, a: 1, s: 0, t: 0 } },
  { word: 'Workers', h: { kind: 'worker', troop: 0, w: 1, a: 0, s: 0, t: 0 } },
  { word: 'The Dreadnought', h: { kind: 'warrior', troop: Troop.Dreadnought, w: 0, a: 0, s: 0, t: 0 } },
];

/** Who can use a piece (plan section 7, "who can use the piece"): those it fits, then everyone else in one line. */
export function whoUses(res: number): Array<{ text: string; ok: boolean }> {
  const yes: string[] = [];
  const no: string[] = [];
  for (const w of WHO) (fits(w.h, res) ? yes : no).push(w.word);
  if (yes.length === 0) return [{ text: 'Fits nobody: the Workshop can scrap it', ok: false }];
  const out = yes.map((text) => ({ text, ok: true }));
  if (no.length > 0) out.push({ text: no.map((w, k) => (k === 0 ? w : w.replace(/^The /, 'the '))).join(', '), ok: false });
  return out;
}

/** "Heft 33" or "Stature 17" for an item (its Stature as it would fit the holder, the Fluted Gothic harness having two), '' for a piece with neither. */
export function sizeText(res: number, h: KitHolder | null = null): string {
  const heft = itemHeft(res);
  if (heft) return `Heft ${heft}`;
  const st = itemStature(res, h ?? undefined);
  return st ? `Stature ${st}` : '';
}

/** A holder's Heft and Stature ranges ("Heft 4 to 125 · Stature 16 to 21"). */
export function rangeText(h: KitHolder): string {
  const r = FIT_RANGES[bodyOf(h)]!;
  return `Heft ${r.heftMin} to ${r.heftMax} · Stature ${r.statureMin} to ${r.statureMax}`;
}

/** A tooltip comparing a piece with what a unit has on that line now (`h` null: no unit, its numbers alone). */
export function compareTip(res: number, h: KitHolder | null, now: number, where: string): CompareTip {
  const gear = h ? itemGear(res, h) : 0;
  // A piece that does not go on this unit shows its numbers as in anyone's hands that it fits.
  const shown = gear || itemGear(res, WHO.find((w) => fits(w.h, res))?.h ?? WHO[0]!.h);
  const sub = [rarityName(res), sizeText(res, h), where].filter((s) => s).join(' · ');
  const rows = shown ? compareRows(shown, gear ? h : null, gear ? now : 0) : [];
  const heads: readonly [string, string] | null = gear && now ? ['It has', 'This'] : null;
  return { sub, heads, rows, who: whoUses(res) };
}
