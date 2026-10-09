// What every trade-style menu shares (the trade menus, the hire box, Send
// resources). Patch 5, decisions 2.16: "the item list you have gets too
// compressed when you have alot of items so you can barely see what they
// are". A good shows its picture, name and count in a row that keeps its size
// and scrolls with its list, and an amount can be typed in a box.
import type { MouseTarget } from '../input/input-manager.ts';
import { goodIcon, iconUrl } from './inventory-icons.ts';

/** The amount after a +N press, never past what the pool holds (the sim clamps too). */
export function addAmount(amount: number, by: number, have: number): number {
  return Math.max(0, Math.min(have, amount + by));
}

/** A typed amount: digits only, at most the pool; empty is 0. */
export function parseAmount(text: string, have: number): number {
  const t = text.replace(/[\s,_]/g, '');
  if (!/^\d{0,9}$/.test(t)) return -1;
  return Math.min(have, Number(t || '0'));
}

/** A good's picture at the inventory's size, or an empty square of that size for a good with none (an animal, an engine). */
export function goodPic(good: number): HTMLElement {
  const icon = goodIcon(good);
  const url = icon ? iconUrl(icon.file) : '';
  if (!icon || !url) {
    const s = document.createElement('span');
    s.className = 'good-pic none';
    return s;
  }
  const img = document.createElement('img');
  img.className = 'good-pic';
  img.src = url;
  img.alt = '';
  img.draggable = false;
  if (icon.tint) img.style.filter = icon.tint;
  return img;
}

/** A good's count at the end of its row. */
export function goodCount(n: number | string): HTMLElement {
  const s = document.createElement('span');
  s.className = 'good-count';
  s.textContent = typeof n === 'number' ? `×${n}` : n;
  return s;
}

/** A row that is not a button: the good's picture, name and count. */
export function goodRow(parent: HTMLElement, good: number, name: string, count?: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'good-row';
  const label = document.createElement('span');
  label.className = 'good-name';
  label.textContent = name;
  row.append(goodPic(good), label);
  if (count !== undefined) row.append(goodCount(count));
  parent.append(row);
  return row;
}

/**
 * A box to type an amount in, at most `most`: `set` hears each change that
 * reads as a number, `done` when the box loses focus (Enter and Esc leave it).
 */
export function amountBox(value: number, most: number, label: string, set: (n: number) => void, done: () => void): HTMLInputElement {
  const box = document.createElement('input');
  box.className = 'amount-box';
  box.inputMode = 'numeric';
  box.autocomplete = 'off';
  box.value = String(value);
  box.setAttribute('aria-label', label);
  box.addEventListener('input', () => {
    const v = parseAmount(box.value, most);
    if (v >= 0) set(v);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      box.blur();
    }
  });
  box.addEventListener('blur', () => done());
  return box;
}

/** A press on an amount box focuses it: the cursor may be locked, so the press reaches it through the input manager's areas. */
export const FOCUS_BOX: MouseTarget = {
  down: (_b, p) => {
    const t = document.elementFromPoint(p.x, p.y);
    if (t instanceof HTMLInputElement) {
      t.focus();
      t.select();
    }
  },
  move: () => undefined,
  up: () => undefined,
};
