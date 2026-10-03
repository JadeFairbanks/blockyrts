// The stockpile in the top right as a Minecraft-style inventory (Controls >
// Screen layout and mouse zones: Inventory grid). Food and Supply stand to
// its left; then 16 square slots, 8 across and 2 down, each a HUD button with
// the good's picture, its count in the corner and a tooltip; then the scroll
// arrows with a thumb between them. The mouse wheel over the grid scrolls a
// row at a time. Right click on a food keeps it back from meals (Food,
// supply and health: Don't eat), shown crossed out.
import { FOODS, RESOURCES, type Res } from '@blockyrts/sim';
import type { InfoMessage } from '../messages.ts';
import type { ButtonRegistry, HudButton, HudButtonDef } from './buttons.ts';
import { FOOD_ICON, goodIcon, iconUrl, SUPPLY_ICON, type GoodIcon } from './inventory-icons.ts';
import { changeText, INVENTORY_ROWS, INVENTORY_SLOTS, InventoryGrid, PoolHistory, slotCount, WheelRows } from './inventory.ts';

export interface InventoryActions {
  /** Keeps a food back from meals (on) or lets it be eaten again. */
  dontEat(res: number, on: boolean): void;
  /** Sends wheel deltas over an element to a handler (the cursor may be locked). */
  addWheel(id: string, el: HTMLElement, onWheel: (dy: number) => void): void;
}

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
      description: 'Every kind of food in the pool. Workers cost 20 to train. Red while someone is starving.',
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
      this.slots.push({ cell, btn, pic, sig: '' });
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
    this.grid.update(info.pool);
    this.history.add(info.step, info.pool);
    this.render();
  }

  /** Scrolls by whole rows. */
  scroll(rows: number): void {
    if (this.grid.scroll(rows)) this.render();
  }

  private render(): void {
    const info = this.info;
    const visible = this.grid.visible();
    visible.forEach((res, i) => this.renderSlot(this.slots[i]!, res));

    this.food.setFace(String(this.foodTotal));
    this.food.el.classList.toggle('starving', info !== null && (info.starveWorkers || info.starveTroops));
    this.supply.setFace(info ? `${info.supplyUsed}/${info.supplyCap}` : '0/0');
    this.supply.el.classList.toggle('full', info !== null && info.supplyUsed >= info.supplyCap);

    const none = 'Every good you hold fits on screen.';
    this.up.setEnabled(this.grid.canScroll(-1), this.grid.maxTop() === 0 ? none : 'This is the top row.');
    this.down.setEnabled(this.grid.canScroll(1), this.grid.maxTop() === 0 ? none : 'This is the bottom row.');
    const rows = this.grid.rows();
    this.thumb.style.top = `${(100 * this.grid.top) / rows}%`;
    this.thumb.style.height = `${(100 * INVENTORY_ROWS) / rows}%`;
    this.thumb.parentElement!.classList.toggle('idle', this.grid.maxTop() === 0);
  }

  private renderSlot(slot: Slot, res: number): void {
    const info = this.info;
    if (res < 0 || !info) {
      if (slot.sig !== '') {
        slot.sig = '';
        slot.btn.el.hidden = true;
        slot.cell.classList.add('empty');
      }
      return;
    }
    const have = info.pool[res] ?? 0;
    const k = FOODS.indexOf(res as Res);
    const kept = k >= 0 && (info.dontEat & (1 << k)) !== 0;
    const change = changeText(this.history.change(res, info.step, have));
    const icon = goodIcon(res);
    const src = icon ? iconSrc(icon, () => this.render()) : '';
    const sig = `${res}|${have}|${kept ? 1 : 0}|${change}|${src.length}`;
    if (sig === slot.sig) return;
    slot.sig = sig;
    const r = RESOURCES[res]!;
    const parts = [`${have.toLocaleString('en-GB')} in the pool. ${r.source}`];
    if (change) parts.push(change);
    if (k >= 0) parts.push(kept ? 'Kept back: nobody eats it. Right click to eat it again.' : 'Right click to keep it back from meals (Don\'t eat).');
    const toggle = (): void => {
      const on = ((this.info?.dontEat ?? 0) & (1 << k)) === 0;
      this.actions.dontEat(res, on);
    };
    slot.btn.redefine({
      id: slot.btn.def.id,
      face: slotCount(have),
      name: r.name,
      keys: [],
      description: parts.join(' '),
      className: `inv-slot${have === 0 ? ' zero' : ''}${kept ? ' dont-eat' : ''}`,
      ...(k >= 0 ? { onRightClick: toggle } : {}),
    });
    if (slot.pic.getAttribute('src') !== src) slot.pic.src = src;
    slot.pic.style.filter = icon?.tint ?? '';
    slot.btn.el.hidden = false;
    slot.cell.classList.remove('empty');
  }
}
