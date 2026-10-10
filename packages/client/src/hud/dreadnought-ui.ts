// The Hire Dreadnought window (Patch 5, Jade, GP-21): the Tavern's Hire
// Dreadnought button opens it. It shows what the player will pay: the 100
// food, which is not negotiable, and the ingots, which the player sets with
// - and + or types: gold, silver or a mix of the two (one gold ingot is
// worth 7 silver), so the ingots are worth at least the price. A little over
// is allowed and not given back; under never. Hire queues him at the Tavern
// with the shortest queue and closes the window. Laid out like every
// trade-style menu (decisions 2.16, goods-ui.ts): the title and its x stay in
// sight, only the body scrolls, and each good keeps its picture, name and
// count at full size. A HUD panel with HUD buttons, so it works with the
// mouse alone and with the cursor locked.
import { DREADNOUGHT, dreadnoughtPrice, dreadnoughtProduct, ingotWorth, paysForDreadnought, productSpec, Res, STEPS_PER_SECOND, type Order } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { MouseTarget } from '../input/input-manager.ts';
import type { ButtonRegistry, HudButtonDef } from './buttons.ts';
import { amountBox, FOCUS_BOX, goodCount, goodPic } from './goods-ui.ts';
import { FOOD_ICON, iconUrl } from './inventory-icons.ts';
import type { HudPanels } from './panels.ts';
import { gameScroll } from './game-scroll.ts';

/** The Dreadnought's 64 px portrait (Patch 5), from his model heavy_knight. */
const PORTRAIT = 'portrait_heavy_knight';

export interface HireActions {
  send(o: Order): void;
  message(text: string): void;
  /** Lets a click on a text field focus it (the cursor may be locked). */
  addArea(id: string, el: HTMLElement, target: MouseTarget): void;
}

/** The silver that makes up the price with this much gold: none once the gold pays it all. */
export function silverFor(gold: number): number {
  return Math.max(0, dreadnoughtPrice() - gold * DREADNOUGHT.silverPerGold);
}

/** Where the window starts: as much of the price in gold as the stock has, the rest in silver. */
export function startingSplit(haveGold: number): [number, number] {
  const gold = Math.max(0, Math.min(DREADNOUGHT.gold, haveGold));
  return [gold, silverFor(gold)];
}

/** What a payment of gold and silver ingots comes to against the price, in words. */
export function paymentLine(gold: number, silver: number): string {
  const worth = ingotWorth(gold, silver);
  const price = dreadnoughtPrice();
  const s = (n: number): string => `${n} silver ingot${n === 1 ? '' : 's'}`;
  if (gold > DREADNOUGHT.gold) return `At most ${DREADNOUGHT.gold} gold ingots.`;
  if (worth < price) return `Worth ${s(worth)}: ${s(price - worth)} short of the price.`;
  if (worth > price + DREADNOUGHT.overSilver) return `Worth ${s(worth)}: at most ${s(DREADNOUGHT.overSilver)} over the price.`;
  if (worth > price) return `Worth ${s(worth)}: ${s(worth - price)} over the price, not given back.`;
  return `Worth ${s(worth)}: the price exactly.`;
}

function el(tag: string, cls: string, parent?: HTMLElement, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

export class DreadnoughtUi {
  private readonly box: HTMLElement;
  private ids: string[] = [];
  private sig = '';
  /** The Taverns it hires at, and the ingots set. */
  private taverns: number[] = [];
  private gold = 0;
  private silver = 0;

  constructor(
    root: HTMLElement,
    panels: HudPanels,
    private readonly buttons: ButtonRegistry,
    private readonly game: GameInfo,
    private readonly player: number,
    private readonly a: HireActions,
  ) {
    this.box = el('div', 'panel dread-dialog', root);
    this.box.hidden = true;
    panels.register('dreadnought', this.box);
  }

  get open(): boolean {
    return !this.box.hidden;
  }

  /** Opens the window for these Taverns, the ingots set to as much gold as the stock has. */
  show(taverns: readonly number[]): void {
    this.taverns = [...taverns];
    [this.gold, this.silver] = startingSplit(this.game.have(Res.Gold));
    this.box.hidden = false;
    this.sig = '';
    this.refresh();
  }

  close(): void {
    this.blurBox();
    this.box.hidden = true;
    this.clear();
  }

  /** Esc: closes it when it is open. */
  closeTop(): boolean {
    if (this.box.hidden) return false;
    this.close();
    return true;
  }

  private clear(): void {
    for (const id of this.ids) this.buttons.remove(id);
    this.ids = [];
  }

  /** A button with an id of its own, the same each time the window is drawn, so a press survives a redraw. */
  private button(id: string, parent: HTMLElement, def: Omit<HudButtonDef, 'id' | 'keys'>, disabled = ''): HTMLElement {
    const b = this.buttons.add({ keys: [], ...def, id: `dread-${id}` });
    if (disabled) b.setEnabled(false, disabled);
    this.ids.push(`dread-${id}`);
    parent.append(b.el);
    return b.el;
  }

  private blurBox(): void {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && this.box.contains(a)) a.blur();
  }

  /** A change made with a button: any number being typed is left first, then the window is drawn again. */
  private change(fn: () => void): void {
    this.blurBox();
    fn();
    this.sig = '';
    this.refresh();
  }

  /** Leaving a number box draws the window again, unless the press went to the other box. */
  private boxLeft(): void {
    window.setTimeout(() => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && this.box.contains(a)) return;
      this.sig = '';
      this.refresh();
    }, 0);
  }

  /** The player's own finished Taverns of those it was opened for, the shortest queue first. */
  private ready(): number[] {
    const out = this.taverns.filter((id) => {
      const b = this.game.buildings.get(id);
      return b !== undefined && b.complete && (b.tavern ?? null) !== null;
    });
    return out.sort((x, y) => (this.game.buildings.get(x)?.queue.length ?? 0) - (this.game.buildings.get(y)?.queue.length ?? 0) || x - y);
  }

  /** Why Hire is greyed out now, or ''. */
  private why(at: number[]): string {
    const first = this.game.buildings.get(at[0] ?? -1)?.tavern;
    if (!first) return 'The Tavern is gone.';
    if (first.hireWhy) return first.hireWhy;
    const info = this.game.info;
    if (info && info.supplyUsed + DREADNOUGHT.supply > info.supplyCap) return `Not enough supply for him (he takes ${DREADNOUGHT.supply}; ${info.supplyUsed} of ${info.supplyCap}). Build farms or upgrade the main base.`;
    if (at.every((id) => (this.game.buildings.get(id)?.queue.length ?? 0) >= 5)) return 'The queue is full (5).';
    if (!paysForDreadnought(this.gold, this.silver)) return paymentLine(this.gold, this.silver);
    if (this.game.have(Res.Gold) < this.gold) return `Not enough gold ingots (you have ${this.game.have(Res.Gold)}).`;
    if (this.game.have(Res.Silver) < this.silver) return `Not enough silver ingots (you have ${this.game.have(Res.Silver)}).`;
    return '';
  }

  /** Each info update: the stock and the reasons as they are now (not while a number is being typed). */
  refresh(): void {
    if (this.box.hidden) return;
    const at = this.ready();
    if (at.length === 0) {
      this.close();
      return;
    }
    const why = this.why(at);
    const sig = `${this.gold}|${this.silver}|${this.game.have(Res.Gold)}|${this.game.have(Res.Silver)}|${this.game.food()}|${why}`;
    if (sig === this.sig) return;
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && this.box.contains(a)) return; // not while typing
    this.sig = sig;
    this.clear();
    this.box.replaceChildren();
    const head = el('div', 'dlg-head', this.box);
    el('h3', 'dlg-title', head, 'Hire Dreadnought');
    this.button('close', head, { face: '×', name: 'Close', description: 'Close the window (Esc).', className: 'dlg-close', onPress: () => this.close() });
    const body = el('div', 'dlg-body', this.box);
    gameScroll(body);
    const ps = productSpec(dreadnoughtProduct(DREADNOUGHT.gold, 0));
    // His portrait, rendered from his own model, beside the price.
    const intro = el('div', 'dread-intro', body);
    const face = document.createElement('img');
    face.className = 'dread-portrait';
    face.src = iconUrl(PORTRAIT);
    face.alt = '';
    face.draggable = false;
    intro.append(face);
    el('p', 'dlg-note', intro, `Pay ${DREADNOUGHT.food} food and ingots worth ${DREADNOUGHT.gold} gold: gold, silver or a mix, one gold ingot worth ${DREADNOUGHT.silverPerGold} silver. He takes ${ps.steps / STEPS_PER_SECOND} s to hire.`);
    el('div', 'trade-head', body, 'You pay');
    const list = el('div', 'send-list', body);
    // The food: not negotiable.
    const food = el('div', 'good-row', list);
    const pic = document.createElement('img');
    pic.className = 'good-pic';
    pic.src = iconUrl(FOOD_ICON);
    pic.alt = '';
    pic.draggable = false;
    food.append(pic);
    el('span', 'good-name', food, `${DREADNOUGHT.food} food, not negotiable`);
    food.append(goodCount(`you have ${this.game.food()}`));
    const ingots = (which: 'gold' | 'silver'): void => {
      const res = which === 'gold' ? Res.Gold : Res.Silver;
      const have = this.game.have(res);
      const now = which === 'gold' ? this.gold : this.silver;
      const set = (v: number): void => {
        if (which === 'gold') {
          this.gold = Math.max(0, Math.min(DREADNOUGHT.gold, v));
          this.silver = silverFor(this.gold);
        } else this.silver = Math.max(0, v);
      };
      const line = el('div', 'good-row offer-line', list);
      line.append(goodPic(res));
      el('span', 'good-name', line, which === 'gold' ? 'Gold ingots' : 'Silver ingots');
      this.button(`${which}-less`, line, { face: '−', name: 'One fewer', description: which === 'gold' ? 'One gold ingot fewer: the silver makes up the rest.' : 'One silver ingot fewer.', className: 'dlg-btn mini', onPress: () => this.change(() => set(now - 1)) }, now <= 0 ? 'None to take off.' : '');
      // Gold typed sets the silver to what makes up the price; silver typed stays as typed.
      const most = which === 'gold' ? DREADNOUGHT.gold : dreadnoughtPrice() + DREADNOUGHT.overSilver;
      const box = amountBox(now, most, which === 'gold' ? 'Gold ingots to pay' : 'Silver ingots to pay', (v) => set(v), () => this.boxLeft());
      this.a.addArea('dread-amount', box, FOCUS_BOX);
      line.append(box);
      this.button(`${which}-more`, line, { face: '+', name: 'One more', description: which === 'gold' ? 'One gold ingot more: the silver goes down to what makes up the rest.' : 'One silver ingot more.', className: 'dlg-btn mini', onPress: () => this.change(() => set(now + 1)) }, now >= most ? `At most ${most}.` : '');
      line.append(goodCount(`you have ${have}`));
    };
    ingots('gold');
    ingots('silver');
    el('p', `dlg-note dread-worth${paysForDreadnought(this.gold, this.silver) ? '' : ' warn'}`, body, paymentLine(this.gold, this.silver));
    const actions = el('div', 'dlg-row', body);
    this.button('gold', actions, { face: 'All gold', name: 'All gold', description: `${DREADNOUGHT.gold} gold ingots.`, className: 'dlg-btn', onPress: () => this.change(() => this.pick(DREADNOUGHT.gold, 0)) });
    this.button('silver', actions, { face: 'All silver', name: 'All silver', description: `${dreadnoughtPrice()} silver ingots.`, className: 'dlg-btn', onPress: () => this.change(() => this.pick(0, dreadnoughtPrice())) });
    this.button(
      'hire',
      actions,
      {
        face: 'Hire',
        name: 'Hire Dreadnought',
        description: `Pay ${DREADNOUGHT.food} food, ${this.gold} gold and ${this.silver} silver ingots now, and he is hired at the Tavern.`,
        className: 'dlg-btn primary',
        onPress: () => this.hire(),
      },
      why,
    );
  }

  private pick(gold: number, silver: number): void {
    this.gold = gold;
    this.silver = silver;
  }

  private hire(): void {
    this.blurBox();
    const at = this.ready();
    if (at.length === 0 || this.why(at)) return;
    this.a.send({ kind: 'produce', player: this.player, building: at[0]!, product: dreadnoughtProduct(this.gold, this.silver), count: 1 });
    this.a.message('A Dreadnought is being hired at the Tavern.');
    this.close();
  }
}
