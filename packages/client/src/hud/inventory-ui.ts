// The stockpile in the top right as a Minecraft-style inventory (Controls >
// Screen layout and mouse zones: Inventory grid). Food and Supply stand to
// its left; then 16 square slots, 8 across and 2 down, each a HUD button with
// the good's picture, its count in the corner and a tooltip; then the scroll
// arrows with a thumb between them. The mouse wheel over the grid scrolls a
// row at a time. Right click on a slot opens the item's menu (Patch 5, Jade's
// GP-2 with decisions 3.6, item-menu.ts): Use, Equip and Scrap for gear,
// Don't eat for a food (Food, supply and health), a food kept back shown
// crossed out. Food counts are whole
// items; the Food cell is the food value of them all (patch 1). In the
// debugger's godmode (Jade's Patch 5) the grid holds everything godmode can
// place instead of the goods: a click puts one on the cursor.
import { foodAmountText, FOODS, GOD_SPAWNS, isGearItem, RESOURCES, type Res } from '@blockyrts/sim';
import type { InfoMessage } from '../messages.ts';
import { shineEl, type ButtonRegistry, type CompareTip, type HudButton, type HudButtonDef } from './buttons.ts';
import { rarityClass, shineOf } from './gear-compare.ts';
import { FOOD_ICON, goodIcon, iconUrl, SUPPLY_ICON, type GoodIcon } from './inventory-icons.ts';
import { changeText, INVENTORY_COLUMNS, INVENTORY_ROWS, INVENTORY_SLOTS, InventoryGrid, PoolHistory, slotCount, WheelRows } from './inventory.ts';
import { equippable } from './item-menu.ts';
import { godSpawnIconFile } from './unit-icons.ts';

export interface InventoryActions {
  /** Opens the item's menu (item-menu.ts) over its slot. */
  menu(at: HTMLElement, res: number): void;
  /** Sends wheel deltas over an element to a handler (the cursor may be locked). */
  addWheel(id: string, el: HTMLElement, onWheel: (dy: number) => void): void;
  /** Godmode: puts one of GOD_SPAWNS on the cursor to place. */
  pickSpawn(k: number): void;
  /** A piece of gear's numbers beside what the one selected unit has (Patch 7, the hover), worked out as its tooltip shows. */
  compare(res: number): CompareTip | null;
}

/** Rows of godmode's grid. */
const GOD_ROWS = Math.ceil(GOD_SPAWNS.length / INVENTORY_COLUMNS);

function el(cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement('div');
  e.className = cls;
  parent.append(e);
  return e;
}

function img(cls: string, parent: HTMLElement): HTMLImageElement {
  const i = document.createElement('img');
  i.className = cls;
  i.alt = '';
  i.draggable = false;
  i.width = 32;
  i.height = 32;
  parent.prepend(i);
  return i;
}

/** Icons whose solid background has been keyed out, by URL ('' while working on it). */
const keyedCache = new Map<string, string>();

/** The icon's picture: its file, or for an icon with a background, that background made transparent once it has loaded. */
function iconSrc(icon: GoodIcon, onReady: () => void): string {
  const url = iconUrl(icon.file);
  if (!icon.keyed || !url) return url;
  const done = keyedCache.get(url);
  if (done) return done;
  if (done === undefined) {
    keyedCache.set(url, '');
    const pic = new Image();
    pic.onload = () => {
      keyedCache.set(url, keyOutBackground(pic) || url);
      onReady();
    };
    pic.src = url;
  }
  return url;
}

/** Clears the flat colour that fills an icon from its edges inwards (the training buttons' dark square). */
function keyOutBackground(pic: HTMLImageElement): string {
  const w = pic.naturalWidth;
  const h = pic.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g || w === 0) return '';
  g.drawImage(pic, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const same = (i: number): boolean => px[i] === px[0] && px[i + 1] === px[1] && px[i + 2] === px[2] && px[i + 3] === px[3];
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || !same(p * 4)) continue;
    seen[p] = 1;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (seen[p]) px[p * 4 + 3] = 0;
  g.putImageData(data, 0, 0);
  return c.toDataURL();
}

interface Slot {
  cell: HTMLElement;
  btn: HudButton;
  pic: HTMLImageElement;
  /** An epic piece's glint or a legendary one's sparkle over its picture (Patch 7, plan section 3). */
  shine: HTMLElement | null;
  /** What the slot shows now, to skip unchanged work. */
  sig: string;
}

export class InventoryUi {
  private readonly grid = new InventoryGrid();
  private readonly history = new PoolHistory();
  private readonly wheel = new WheelRows();
  private readonly slots: Slot[] = [];
  private readonly food: HudButton;
  private readonly supply: HudButton;
  private readonly up: HudButton;
  private readonly down: HudButton;
  private readonly thumb: HTMLElement;
  private info: InfoMessage | null = null;
  private foodTotal = 0;
  /** Godmode shows what it can place, from this row; the goods' own grid waits, untouched, until it ends. */
  private god = false;
  private godTop = 0;

  constructor(
    container: HTMLElement,
    private readonly buttons: ButtonRegistry,
    private readonly actions: InventoryActions,
  ) {
    // Food and Supply: totals, not goods, so they stand apart to the left of the grid.
    const sum = el('stock-sum', container);
    this.food = this.cell(sum, {
      id: 'stock-food',
      face: '0',
      name: 'Food',
      keys: [],
      description: 'The food value of every food in stock, in whole food, kept back or not. Each unit eats ½ food four times a day (a rider and horse 1), from every kind in turn. Workers cost 20 to train. Red while someone is starving.',
      className: 'stock-cell food',
    }, FOOD_ICON);
    this.supply = this.cell(sum, {
      id: 'stock-supply',
      face: '0/0',
      name: 'Supply',
      keys: [],
      description: 'Units you have, and how many your farms and main base support. Red when full.',
      className: 'stock-cell supply',
    }, SUPPLY_ICON);

    const gridEl = el('inv-grid', container);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const cell = el('inv-cell empty', gridEl);
      const btn = buttons.add({ id: `inv-${i}`, face: '', name: '', keys: [], description: '', className: 'inv-slot' });
      btn.el.hidden = true;
      const pic = img('inv-icon', btn.el);
      cell.append(btn.el);
      this.slots.push({ cell, btn, pic, shine: null, sig: '' });
    }
    actions.addWheel('inventory', gridEl, (dy) => {
      const rows = this.wheel.push(dy);
      if (rows !== 0) this.scroll(rows);
    });

    const bar = el('inv-scroll', container);
    this.up = buttons.add({
      id: 'inv-up',
      face: '▲',
      name: 'Scroll up',
      keys: [],
      description: 'Shows the row of goods above. The mouse wheel over the slots scrolls too.',
      className: 'inv-arrow',
      onPress: () => this.scroll(-1),
    });
    bar.append(this.up.el);
    const track = el('inv-track', bar);
    this.thumb = el('inv-thumb', track);
    this.down = buttons.add({
      id: 'inv-down',
      face: '▼',
      name: 'Scroll down',
      keys: [],
      description: 'Shows the row of goods below. The mouse wheel over the slots scrolls too.',
      className: 'inv-arrow',
      onPress: () => this.scroll(1),
    });
    bar.append(this.down.el);
    this.render();
  }

  private cell(parent: HTMLElement, def: HudButtonDef, icon: string): HudButton {
    const b = this.buttons.add(def);
    const pic = img('stock-icon', b.el);
    pic.src = iconUrl(icon);
    parent.append(b.el);
    return b;
  }

  /** Takes in the latest state of the pool. */
  update(info: InfoMessage, food: number): void {
    this.info = info;
    this.foodTotal = food;
    const god = info.god === true;
    if (god !== this.god) {
      this.god = god;
      this.godTop = 0;
    }
    // Godmode's full pool gives no good a slot and no change over the last minute.
    if (!god) {
      this.grid.update(info.pool);
      this.history.add(info.step, info.pool);
    }
    this.render();
  }

  /** Scrolls by whole rows. */
  scroll(rows: number): void {
    if (this.god) {
      const top = Math.max(0, Math.min(GOD_ROWS - INVENTORY_ROWS, this.godTop + rows));
      if (top === this.godTop) return;
      this.godTop = top;
      this.render();
    } else if (this.grid.scroll(rows)) this.render();
  }

  private render(): void {
    const info = this.info;
    if (this.god) this.slots.forEach((slot, i) => this.renderSpawn(slot, this.godTop * INVENTORY_COLUMNS + i));
    else this.grid.visible().forEach((res, i) => this.renderSlot(this.slots[i]!, res));

    this.food.setFace(this.god ? '∞' : String(this.foodTotal));
    this.food.el.classList.toggle('starving', info !== null && (info.starveWorkers || info.starveTroops));
    this.supply.setFace(info ? `${info.supplyUsed}/${info.supplyCap}` : '0/0');
    this.supply.el.classList.toggle('full', info !== null && info.supplyUsed >= info.supplyCap);

    const none = 'Every good you hold fits on screen.';
    const top = this.god ? this.godTop : this.grid.top;
    const maxTop = this.god ? GOD_ROWS - INVENTORY_ROWS : this.grid.maxTop();
    this.up.setEnabled(top > 0, maxTop === 0 ? none : 'This is the top row.');
    this.down.setEnabled(top < maxTop, maxTop === 0 ? none : 'This is the bottom row.');
    const rows = this.god ? GOD_ROWS : this.grid.rows();
    this.thumb.style.top = `${(100 * top) / rows}%`;
    this.thumb.style.height = `${(100 * INVENTORY_ROWS) / rows}%`;
    this.thumb.parentElement!.classList.toggle('idle', maxTop === 0);
  }

  /** A godmode slot: something to place, its picture, its name in the tooltip; a click puts it on the cursor. */
  private renderSpawn(slot: Slot, k: number): void {
    this.setShine(slot, undefined);
    const g = GOD_SPAWNS[k];
    if (!g) {
      if (slot.sig !== '') {
        slot.sig = '';
        slot.btn.el.hidden = true;
        slot.cell.classList.add('empty');
      }
      return;
    }
    const src = iconUrl(godSpawnIconFile(g));
    const sig = `god|${k}|${src.length}`;
    if (sig === slot.sig) return;
    slot.sig = sig;
    const whose = g.side === 'player' ? 'Yours once placed.' : g.side === 'wild' ? 'Wild once placed.' : 'Hostile once placed: it comes for you.';
    const extra = g.what === 'engine' ? ' It comes with its full crew.' : g.what === 'lair' ? ' Its guardians come with it.' : g.what === 'troop' || g.what === 'mage' ? ' At the top of its kit.' : '';
    slot.btn.redefine({
      id: slot.btn.def.id,
      // Nothing to show it by: its name's first letters.
      face: src ? '' : g.name.split(' ').map((w) => w[0]).join('').slice(0, 3),
      name: g.name,
      keys: [],
      description: `Godmode: click to hold it on the cursor, then click the ground to place it, as many as you like. ${whose}${extra} Right click, Esc, or the Cancel placement button puts it away.`,
      className: 'inv-slot god-spawn',
      onPress: () => this.actions.pickSpawn(k),
    });
    if (slot.pic.getAttribute('src') !== src) slot.pic.src = src;
    slot.pic.style.filter = '';
    slot.btn.el.hidden = false;
    slot.cell.classList.remove('empty');
  }

  private renderSlot(slot: Slot, res: number): void {
    const info = this.info;
    if (res < 0 || !info) {
      if (slot.sig !== '') {
        slot.sig = '';
        slot.btn.el.hidden = true;
        slot.cell.classList.add('empty');
        this.setShine(slot, undefined);
      }
      return;
    }
    const have = info.pool[res] ?? 0;
    const food = FOODS.includes(res as Res);
    const kept = food && info.kept.includes(res);
    const open = food ? (info.open[res] ?? 0) : 0;
    const change = changeText(this.history.change(res, info.step, have));
    const icon = goodIcon(res);
    const src = icon ? iconSrc(icon, () => this.render()) : '';
    const sig = `${res}|${have}|${kept ? 1 : 0}|${open}|${change}|${src.length}`;
    if (sig === slot.sig) return;
    slot.sig = sig;
    const r = RESOURCES[res]!;
    const parts = [`${have.toLocaleString('en-GB')} in the pool. ${r.source}`];
    if (food) parts.push(`Each is ${r.nutrition} food.`);
    // The started item is out of the count until it is eaten up; its food still counts on the Food cell.
    if (open > 0) parts.push(`One more is started: ${foodAmountText(open)} of it is left for the next meals.`);
    if (change) parts.push(change);
    if (kept) parts.push('Kept back: nobody eats it.');
    const btn = slot.btn;
    // A piece of gear (Patch 7): its name in its rarity's colour, its numbers beside the selected unit's, and it drags onto a unit or the Workshop.
    const gear = isGearItem(res);
    slot.btn.redefine({
      id: slot.btn.def.id,
      face: slotCount(have),
      name: r.name,
      keys: [],
      description: parts.join(' '),
      foot: food
        ? 'Right click: Don\'t eat, or eat it again. Drag it onto one of your units: it fetches enough to heal once from a store point, to eat from its bag.'
        : gear
          ? 'Right click: Equip or Scrap. Drag it onto one of your units to equip it, or onto the Workshop to scrap it.'
          : equippable(res)
            ? 'Right click: Equip or Scrap.'
            : 'Right click: its menu.',
      className: `inv-slot${have === 0 ? ' zero' : ''}${kept ? ' dont-eat' : ''}`,
      onRightClick: () => this.actions.menu(btn.el, res),
      ...(gear ? { nameClass: rarityClass(res), compare: () => this.actions.compare(res) } : {}),
      // Gear drags onto a unit or the Workshop, food onto a unit to fetch (Patch 7).
      ...((gear || food) && have > 0 ? { holds: { res, unit: null, line: -1 } } : {}),
    });
    this.setShine(slot, shineOf(res));
    if (slot.pic.getAttribute('src') !== src) slot.pic.src = src;
    slot.pic.style.filter = icon?.tint ?? '';
    slot.btn.el.hidden = false;
    slot.cell.classList.remove('empty');
  }

  /** Puts a slot's glint or sparkle on or takes it off. */
  private setShine(slot: Slot, kind: 'glint' | 'sparkle' | undefined): void {
    if (slot.shine?.classList.contains(kind ?? '-')) return;
    slot.shine?.remove();
    slot.shine = kind ? shineEl(kind) : null;
    if (slot.shine) slot.btn.el.append(slot.shine);
  }
}
