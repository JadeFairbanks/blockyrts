// The neutral peoples on screen (Neutral villages and trade): the trade menu,
// the war pop-up, the mercenaries' hire box and the Peoples panel. Each is a
// HUD panel with HUD buttons, so all of it works with the mouse alone and
// with the cursor locked. Values stay hidden: the menu shows goods, never
// prices, and rough bars for the offer's worth and their trade left today.
// Patch 5 (decisions 2.16): the title and its × stay put while the rest
// scrolls, and every good keeps its picture, name and count at full size.
import {
  Cat,
  CAT_NAMES,
  catOf,
  FactionKind,
  goodName,
  MERC_MAX,
  OFFER_SLOTS,
  People,
  REFUSE,
  Res,
  Status,
  valueTenths,
  WU_PER_METRE,
  type Order,
} from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { MouseTarget } from '../input/input-manager.ts';
import type { PeopleInfo } from '../messages.ts';
import type { ButtonPress, ButtonRegistry, HudButton, HudButtonDef } from './buttons.ts';
import { amountBox, FOCUS_BOX, goodCount, goodPic, goodRow } from './goods-ui.ts';
import type { HudPanels } from './panels.ts';

export interface PeoplesActions {
  send(o: Order): void;
  jumpTo(x: number, z: number): void;
  message(text: string, kind?: 'system' | 'alert'): void;
  /** Lets a click on an amount box focus it (the cursor may be locked). */
  addArea(id: string, el: HTMLElement, target: MouseTarget): void;
}

/** What the worth bar says of an offer, by how much of their whole day of trade it comes to (s). */
export function worthWords(worth: number, day: number): string {
  if (worth <= 0) return 'Put goods in the box to make an offer.';
  const k = day > 0 ? worth / day : 1;
  if (k < 0.1) return 'A small offer.';
  if (k < 0.3) return 'A fair offer.';
  if (k < 0.6) return 'A good offer.';
  return 'A rich offer.';
}

/** What the bar of their trade left today says (Patch 5, GP-46: a day of trade per settlement, shared by every player). */
export function tradeLeftWords(room: number, day: number): string {
  if (room <= 0) return 'They have traded all they will today. More at dawn.';
  const k = day > 0 ? room / day : 1;
  if (k >= 0.95) return 'A whole day of trade is left.';
  if (k >= 0.5) return 'Most of today\'s trade is left.';
  if (k >= 0.2) return 'Some of today\'s trade is left.';
  return 'Only a little trade is left today.';
}

/** What an offer's goods come to at what the faction pays, tenths, before their day of trade is reckoned; refused goods count nothing. */
export function offerSum(f: Pick<PeopleInfo, 'pays'>, goods: ReadonlyMap<number, number>): number {
  let sum = 0;
  for (const [good, n] of goods) {
    const at = f.pays.findIndex((g, k) => k % 2 === 0 && g === good);
    const pct = at >= 0 ? f.pays[at + 1]! : REFUSE;
    if (pct === REFUSE || n <= 0) continue;
    sum += Math.floor((valueTenths(good) * n * pct) / 100);
  }
  return sum;
}

/**
 * What an offer is worth to a faction, tenths, as the sim reckons it: each
 * good at what they pay for it, the whole no more than their trade left
 * today (Patch 5, GP-46). Refused goods count nothing.
 */
export function offerWorth(f: Pick<PeopleInfo, 'pays' | 'room'>, goods: ReadonlyMap<number, number>): number {
  return Math.min(offerSum(f, goods), Math.max(0, f.room));
}

/** "Smoked fish ×5, Halfling shortbow" */
export function goodsText(pairs: readonly number[]): string {
  const out: string[] = [];
  for (let k = 0; k + 1 < pairs.length; k += 2) out.push(pairs[k + 1] === 1 ? goodName(pairs[k]!) : `${goodName(pairs[k]!)} ×${pairs[k + 1]}`);
  return out.join(', ');
}

/** A mercenary's price: "7 silver or 1 gold". */
export function hirePrice(hire: Pick<NonNullable<PeopleInfo['hire']>, 'silver' | 'gold'>): string {
  return `${hire.silver} silver or ${hire.gold} gold`;
}

/** The faction's state in a few words, for the Peoples panel. */
export function statusText(f: PeopleInfo): string {
  if (f.status === Status.Leaving) return 'Leaving their home.';
  if (f.status === Status.Migrated) return 'Gone to rebuild elsewhere. They will raid you until you pay reparations.';
  if (f.surrender) return 'They offer to surrender: accept or refuse.';
  if (f.war) return 'At war with you.';
  if (f.kind === FactionKind.MercCamp) return `${f.hire?.left ?? 0} of ${f.hire?.size ?? 0} for hire at ${f.hire ? hirePrice(f.hire) : '?'} each, yours for good.`;
  if (f.kind === FactionKind.ElfCaravan) return f.visiting ? 'A caravan at your main base. It leaves at dusk.' : 'A wandering caravan.';
  return f.traded ? 'At peace. You have traded with them.' : 'At peace.';
}

/** A panel's buttons, made again whenever its content changes. */
class Buttons {
  private ids: string[] = [];
  private n = 0;

  constructor(
    private readonly reg: ButtonRegistry,
    private readonly prefix: string,
  ) {}

  add(parent: HTMLElement, def: Omit<HudButtonDef, 'id' | 'keys'> & { keys?: string[] }, disabled = ''): HudButton {
    const id = `${this.prefix}-${this.n++}`;
    const b = this.reg.add({ keys: [], ...def, id });
    if (disabled) b.setEnabled(false, disabled);
    this.ids.push(id);
    parent.append(b.el);
    return b;
  }

  /** A good's button: its picture, its name on the face and its count at the end. */
  good(parent: HTMLElement, good: number, count: number | string, def: Omit<HudButtonDef, 'id' | 'keys' | 'face'>, disabled = ''): HudButton {
    const b = this.add(parent, { ...def, face: goodName(good) }, disabled);
    b.el.prepend(goodPic(good));
    b.el.append(goodCount(count));
    return b;
  }

  clear(): void {
    for (const id of this.ids) this.reg.remove(id);
    this.ids = [];
  }
}

function el(tag: string, cls: string, parent?: HTMLElement, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

/** A panel's title row and the body under it, which scrolls on its own so the title and its × always show (decisions 2.16). */
function frame(panel: HTMLElement, title: string): { head: HTMLElement; body: HTMLElement } {
  panel.replaceChildren();
  const head = el('div', 'dlg-head', panel);
  el('h3', 'dlg-title', head, title);
  const body = el('div', 'dlg-body', panel);
  body.dataset.scroll = '';
  return { head, body };
}

/** An amount box in this panel has the keyboard: the panel waits to be drawn again until it is left. */
function typing(panel: HTMLElement): boolean {
  const a = document.activeElement;
  return a instanceof HTMLInputElement && panel.contains(a);
}

export class PeoplesUi {
  private readonly list: HTMLElement;
  private readonly trade: HTMLElement;
  private readonly hire: HTMLElement;
  private readonly war: HTMLElement;
  private readonly listButtons: Buttons;
  private readonly tradeButtons: Buttons;
  private readonly hireButtons: Buttons;
  private readonly warButtons: Buttons;
  /** The faction whose trade menu or hire box is open, or 0. */
  private tradeWith = 0;
  private hireFrom = 0;
  /** The goods in the offer box before it is made (good, count). */
  private readonly draft = new Map<number, number>();
  private listSig = '';
  private tradeSig = '';
  private hireSig = '';
  /** The hire box pays in gold rather than silver (Patch 5, BL-4: 1 gold for 7 silver). */
  private payGold = false;
  /** The offer's worth bar and words, kept to follow an amount as it is typed. */
  private worthFill: HTMLElement | null = null;
  private worthText: HTMLElement | null = null;
  private worthOver: HTMLElement | null = null;
  private warThen: (() => void) | null = null;
  /** The last thing each faction said to this player (Patch 2: the trade menu and hire box show it, since chat no longer carries it). */
  private readonly said = new Map<number, { name: string; text: string }>();

  constructor(
    root: HTMLElement,
    panels: HudPanels,
    buttons: ButtonRegistry,
    private readonly game: GameInfo,
    private readonly player: number,
    private readonly a: PeoplesActions,
  ) {
    this.list = el('div', 'panel peoples-panel', root);
    this.trade = el('div', 'panel trade-dialog', root);
    this.hire = el('div', 'panel hire-dialog', root);
    this.war = el('div', 'panel war-confirm', root);
    for (const p of [this.list, this.trade, this.hire, this.war]) {
      p.hidden = true;
      p.dataset.scroll = '';
    }
    panels.register('peoples', this.list);
    panels.register('trade', this.trade);
    panels.register('hire', this.hire);
    panels.register('war-confirm', this.war);
    this.listButtons = new Buttons(buttons, 'ppl');
    this.tradeButtons = new Buttons(buttons, 'trd');
    this.hireButtons = new Buttons(buttons, 'hire');
    this.warButtons = new Buttons(buttons, 'war');
  }

  /**
   * One of a faction's people said something to this player (a trade or hire
   * answer, a greeting): its trade menu or hire box shows it under the title.
   */
  heard(faction: number, name: string, text: string): void {
    this.said.set(faction, { name, text });
    if (faction === this.tradeWith) this.drawTrade();
    if (faction === this.hireFrom) this.drawHire();
  }

  /** Their last line to this player, under a menu's title. */
  private saidLine(parent: HTMLElement, faction: number): void {
    const s = this.said.get(faction);
    if (s) el('p', 'dlg-said', parent, `${s.name}: "${s.text}"`);
  }

  get panelOpen(): boolean {
    return !this.list.hidden;
  }

  togglePanel(): void {
    this.list.hidden = !this.list.hidden;
    this.listSig = '';
    this.refresh();
  }

  /** Esc: the war pop-up, then the trade menu or hire box, then the panel. False when nothing was open. */
  closeTop(): boolean {
    if (!this.war.hidden) {
      this.closeWar();
      return true;
    }
    if (this.tradeWith) {
      this.closeTrade();
      return true;
    }
    if (this.hireFrom) {
      this.closeHire();
      return true;
    }
    if (!this.list.hidden) {
      this.togglePanel();
      return true;
    }
    return false;
  }

  /** Right click on one of theirs: the trade menu, or the hire box at a mercenary camp. */
  open(factionId: number): void {
    const f = this.game.faction(factionId);
    if (!f) return;
    if (f.kind === FactionKind.MercCamp) this.openHire(factionId);
    else this.openTrade(factionId);
  }

  openTrade(factionId: number): void {
    const f = this.game.faction(factionId);
    if (!f) return;
    this.closeHire();
    if (this.tradeWith !== factionId) this.draft.clear();
    this.tradeWith = factionId;
    this.trade.hidden = false;
    this.tradeSig = '';
    this.refresh();
  }

  openHire(factionId: number): void {
    this.closeTrade();
    this.hireFrom = factionId;
    this.hire.hidden = false;
    this.hireSig = '';
    this.refresh();
  }

  /** The war pop-up (Neutral villages and trade: an attack order on a neutral village never starts straight away). */
  confirmWar(factionId: number, then: () => void = () => undefined): void {
    const f = this.game.faction(factionId);
    if (!f) return;
    this.warThen = then;
    this.warButtons.clear();
    this.war.replaceChildren();
    el('h3', 'dlg-title', this.war, `Declare war on ${f.title}?`);
    el('p', 'dlg-note', this.war, 'Every one of your allies is drawn into the war too. Their people will fight yours on sight, and trade with them ends until the war does.');
    const row = el('div', 'dlg-row', this.war);
    this.warButtons.add(row, {
      face: 'Declare war',
      name: 'Declare war',
      description: `War on ${f.title}. Your units then attack their people like any other enemy.`,
      className: 'dlg-btn danger',
      onPress: () => {
        this.a.send({ kind: 'declareWar', player: this.player, faction: factionId });
        const go = this.warThen;
        this.closeWar();
        go?.();
      },
    });
    this.warButtons.add(row, { face: 'Cancel', name: 'Cancel', description: 'No war, and no order is given.', className: 'dlg-btn', onPress: () => this.closeWar() });
    this.war.hidden = false;
  }

  /** Each info update: whatever is open shows the latest. */
  refresh(): void {
    if (!this.list.hidden) this.drawList();
    if (this.tradeWith) this.drawTrade();
    if (this.hireFrom) this.drawHire();
  }

  private closeWar(): void {
    this.war.hidden = true;
    this.warThen = null;
    this.warButtons.clear();
  }

  private closeTrade(): void {
    if (typing(this.trade)) (document.activeElement as HTMLElement).blur();
    this.tradeWith = 0;
    this.trade.hidden = true;
    this.tradeButtons.clear();
    this.draft.clear();
  }

  private closeHire(): void {
    this.hireFrom = 0;
    this.hire.hidden = true;
    this.hireButtons.clear();
  }

  /** The × in a panel's title row: always in sight, since only the body under it scrolls. */
  private closeButton(bs: Buttons, head: HTMLElement, description: string, onPress: () => void): void {
    bs.add(head, { face: '×', name: 'Close', description, className: 'dlg-close', onPress });
  }

  // ---- The Peoples panel ----

  private drawList(): void {
    const all = this.game.info?.peoples ?? [];
    const sig = JSON.stringify(all.map((f) => [f.id, f.status, f.war, f.surrender, f.owed, f.fighters, f.tradeWhy, f.hire, f.traded, f.visiting]));
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.listButtons.clear();
    const { head, body } = frame(this.list, 'Peoples');
    this.closeButton(this.listButtons, head, 'Close the Peoples panel (O or Esc).', () => this.togglePanel());
    if (all.length === 0) {
      el('p', 'dlg-note', body, 'You have not met any of the neutral peoples yet. Halflings live in the Heartland; Runkin, Dwarves, Elves and mercenaries farther out.');
      return;
    }
    for (const f of all) {
      const row = el('div', 'ppl-row', body);
      el('div', `ppl-name${f.war ? ' war' : ''}`, row, f.title);
      el('div', 'ppl-status', row, `${statusText(f)}${f.kind !== FactionKind.MercCamp ? ` Fighters: ${f.fighters}.` : ''}`);
      const btns = el('div', 'dlg-row', row);
      this.listButtons.add(btns, { face: 'Go there', name: 'Go there', description: 'Centre the camera on them.', className: 'dlg-btn', onPress: () => this.a.jumpTo(f.x / WU_PER_METRE, f.z / WU_PER_METRE) });
      if (f.kind === FactionKind.MercCamp) {
        const price = f.hire ? ` at ${hirePrice(f.hire)} each` : '';
        this.listButtons.add(btns, { face: 'Hire', name: 'Hire mercenaries', description: `Hire up to ${MERC_MAX}${price}. They are yours for good, 1 supply each.`, className: 'dlg-btn', onPress: () => this.openHire(f.id) }, f.hire?.why ?? '');
      } else if (f.status === Status.Settled) {
        this.listButtons.add(btns, { face: 'Trade', name: 'Trade', description: 'Open their trade menu: put goods in the offer box and they answer with three bundles.', className: 'dlg-btn', onPress: () => this.openTrade(f.id) }, f.tradeWhy);
        if (!f.war) this.listButtons.add(btns, { face: 'War', name: 'Declare war', description: 'Asks first: your allies are drawn in, and their people fight yours on sight.', className: 'dlg-btn danger', onPress: () => this.confirmWar(f.id) });
      }
      if (f.surrender) {
        this.listButtons.add(btns, { face: 'Accept surrender', name: 'Accept surrender', description: 'The war ends: you take their livestock, their fighters’ weapons and some loot, and they leave their home.', className: 'dlg-btn primary', onPress: () => this.a.send({ kind: 'surrender', player: this.player, faction: f.id, accept: 1 }) });
        this.listButtons.add(btns, { face: 'Refuse', name: 'Refuse surrender', description: 'They fight on to the last.', className: 'dlg-btn', onPress: () => this.a.send({ kind: 'surrender', player: this.player, faction: f.id, accept: 0 }) });
      }
      if (f.owed > 0) {
        const vp = Math.ceil(f.owed / 10);
        this.listButtons.add(btns, {
          face: `Pay reparations (${vp})`,
          name: 'Pay reparations',
          description: `Pays ${vp} worth from your stock, most valuable first: trinkets, then gold, silver and gems, then food. Peace with them follows.`,
          className: 'dlg-btn primary',
          onPress: () => this.a.send({ kind: 'reparations', player: this.player, faction: f.id }),
        });
      }
    }
  }

  // ---- The trade menu ----

  /** The goods the player has, as (good, count). */
  private mine(): Array<[number, number]> {
    const info = this.game.info;
    if (!info) return [];
    const out: Array<[number, number]> = [];
    info.pool.forEach((n, r) => {
      if (n > 0) out.push([r, n]);
    });
    return out;
  }

  private have(good: number): number {
    const info = this.game.info;
    if (!info) return 0;
    return info.pool[good] ?? 0;
  }

  private pays(f: PeopleInfo, good: number): number {
    const at = f.pays.findIndex((g, k) => k % 2 === 0 && g === good);
    return at >= 0 ? f.pays[at + 1]! : REFUSE;
  }

  /** Puts n more of a good in the offer box (fewer for n < 0), at most what the player has. */
  private put(good: number, n: number): void {
    const cur = this.draft.get(good);
    if (cur === undefined && this.draft.size >= OFFER_SLOTS) {
      this.a.message(`The offer box holds ${OFFER_SLOTS} kinds of goods.`, 'alert');
      return;
    }
    this.change(() => {
      const next = Math.max(0, Math.min(this.have(good), (cur ?? 0) + n));
      if (next === 0) this.draft.delete(good);
      else this.draft.set(good, next);
    });
  }

  /** A press that changes the offer box: a box being typed in lets go first, then the menu is drawn again. */
  private change(fn: () => void): void {
    if (typing(this.trade)) (document.activeElement as HTMLElement).blur();
    fn();
    this.tradeSig = '';
    this.drawTrade();
  }

  /** The offer's worth bar, words and warning, from the box as it stands (also while an amount is typed). */
  private drawWorth(f: PeopleInfo, goods: ReadonlyMap<number, number>, worth = offerWorth(f, goods)): void {
    if (this.worthFill) this.worthFill.style.width = `${f.day > 0 ? Math.min(100, Math.round((worth / f.day) * 100)) : 0}%`;
    if (this.worthText) this.worthText.textContent = worthWords(worth, f.day);
    if (this.worthOver) this.worthOver.hidden = f.offer !== null || offerSum(f, goods) <= Math.max(0, f.room);
  }

  /** Leaving an amount box draws the menu again, unless the press went to another box in it. */
  private boxLeft(): void {
    window.setTimeout(() => {
      if (typing(this.trade)) return;
      this.tradeSig = '';
      this.drawTrade();
    }, 0);
  }

  private drawTrade(): void {
    const f = this.game.faction(this.tradeWith);
    if (!f || f.kind === FactionKind.MercCamp) {
      this.closeTrade();
      return;
    }
    // Not while an amount is typed: leaving the box draws it again.
    if (typing(this.trade)) return;
    // Goods the player no longer has leave the box.
    for (const [g, n] of [...this.draft]) {
      const h = this.have(g);
      if (h <= 0) this.draft.delete(g);
      else if (n > h) this.draft.set(g, h);
    }
    const mine = this.mine();
    const sig = JSON.stringify([f.stock, f.tradeWhy, f.offer, f.pays, f.wants, f.room, f.day, mine, [...this.draft], this.said.get(f.id)]);
    if (sig === this.tradeSig) return;
    this.tradeSig = sig;
    this.tradeButtons.clear();
    const { head, body } = frame(this.trade, `Trade with ${f.title}`);
    this.closeButton(this.tradeButtons, head, 'Close the trade menu (Esc). An offer left open stays open.', () => this.closeTrade());
    this.saidLine(body, f.id);
    if (f.lean) el('p', 'dlg-note', body, `They lean to ${f.lean}: what they make of it is cheap, and they pay well for what they lack.`);
    if (f.tradeWhy) el('p', 'dlg-why', body, f.tradeWhy);

    // Their trade left today, shared by every player (Patch 5, GP-46).
    const left = el('div', 'trade-left', body);
    el('div', 'trade-head', left, 'Their trade left today');
    const leftBar = el('div', 'worth-bar', left);
    el('div', 'worth-fill left', leftBar).style.width = `${f.day > 0 ? Math.min(100, Math.round((Math.max(0, f.room) / f.day) * 100)) : 0}%`;
    el('div', 'worth-words', left, `${tradeLeftWords(f.room, f.day)} Every player trades from the same day's trade; it fills again at dawn.`);

    const cols = el('div', 'trade-cols', body);

    // What they sell, and what they want.
    const theirs = el('div', 'trade-col', cols);
    el('div', 'trade-head', theirs, 'They sell today');
    const stock = el('div', 'trade-list', theirs);
    stock.dataset.scroll = '';
    if (f.stock.length === 0) el('div', 'trade-good muted', stock, 'Nothing left today. Their stock refills each morning.');
    for (let k = 0; k + 1 < f.stock.length; k += 2) goodRow(stock, f.stock[k]!, goodName(f.stock[k]!), f.stock[k + 1]!);
    el('div', 'trade-head', theirs, 'They want');
    const wants = el('div', 'trade-notes', theirs);
    const well = CAT_NAMES.filter((_, c) => (f.wants[c] ?? 0) >= 100);
    const refused = CAT_NAMES.filter((_, c) => f.wants[c] === REFUSE);
    if (well.length) el('div', 'trade-good', wants, `Pay well for ${well.join(', ')}.`);
    el('div', 'trade-good muted', wants, 'Take most other goods for less. Stone fetches little, and nobody takes earth.');
    if (refused.length) el('div', 'trade-good refused', wants, `Will not take ${refused.join(', ')}.`);

    // The player's goods: click puts one in the box, Shift + click or right click puts ten.
    const yours = el('div', 'trade-col', cols);
    el('div', 'trade-head', yours, 'Your goods');
    const pool = el('div', 'trade-list goods', yours);
    pool.dataset.scroll = '';
    const open = f.offer !== null;
    for (const [good, n] of mine) {
      const refusedGood = this.pays(f, good) === REFUSE;
      const inBox = this.draft.get(good) ?? 0;
      this.tradeButtons.good(
        pool,
        good,
        n - inBox,
        {
          name: goodName(good),
          description: 'Click to put one in the offer box; Shift + click or right click puts ten. Type an amount in the box.',
          className: `trade-item${refusedGood ? ' refused' : ''}`,
          onPress: (p: ButtonPress) => this.put(good, p.shift ? 10 : 1),
          onRightClick: () => this.put(good, 10),
        },
        refusedGood ? (f.people === People.Elf && catOf(good) === Cat.Lumber ? 'The Elves take lumber as an insult: offering it closes trade with you for a day.' : good === Res.Earth ? 'Nobody takes earth.' : 'They will not take this.') : open ? 'Withdraw the open offer to change it.' : f.tradeWhy,
      );
    }
    if (mine.length === 0) el('div', 'trade-good muted', pool, 'Your stock is empty.');

    // The offer box, its worth bar, and their answer.
    const box = el('div', 'trade-col', cols);
    el('div', 'trade-head', box, 'Your offer');
    const offered = el('div', 'trade-list offer', box);
    offered.dataset.scroll = '';
    const goods = open ? new Map<number, number>(pairsOf(f.offer!.goods)) : this.draft;
    if (goods.size === 0) el('div', 'trade-good muted', offered, 'Click your goods to put them here, then type how many.');
    for (const [good, n] of goods) {
      if (open) {
        goodRow(offered, good, goodName(good), n);
        continue;
      }
      const line = el('div', 'good-row offer-line', offered);
      line.append(goodPic(good));
      el('span', 'good-name', line, goodName(good));
      const most = this.have(good);
      const amount = amountBox(
        n,
        most,
        `How many ${goodName(good)} to offer`,
        (v) => {
          this.draft.set(good, v);
          this.drawWorth(f, this.draft);
        },
        () => this.boxLeft(),
      );
      this.a.addArea('trade-amount', amount, FOCUS_BOX);
      line.append(amount);
      this.tradeButtons.add(line, { face: 'All', name: 'All of it', description: `Offer all ${most} you have.`, className: 'dlg-btn mini', onPress: () => this.change(() => this.draft.set(good, most)) });
      this.tradeButtons.add(line, { face: '×', name: 'Take out', description: 'Take this good out of the offer box.', className: 'dlg-btn mini', onPress: () => this.change(() => this.draft.delete(good)) });
    }
    if (!open && goods.size > 0) this.tradeButtons.add(offered, { face: 'Clear', name: 'Clear the offer box', description: 'Take everything back out of the offer box.', className: 'dlg-btn', onPress: () => this.change(() => this.draft.clear()) });
    const bar = el('div', 'worth-bar', box);
    this.worthFill = el('div', 'worth-fill', bar);
    this.worthText = el('div', 'worth-words', box);
    this.worthOver = el('div', 'dlg-why', box, 'More than they will trade today: they take only what fits and leave you the rest.');
    this.drawWorth(f, goods, open ? f.offer!.worth : undefined);
    if (open) el('div', 'trade-head', box, 'They offer');
    const actions = el('div', 'dlg-row', box);
    if (!open) {
      const empty = [...this.draft.values()].every((v) => v <= 0);
      this.tradeButtons.add(
        actions,
        {
          face: 'Make offer',
          name: 'Make offer',
          description: 'They weigh your goods and answer with three bundles of about that worth from their stock.',
          className: 'dlg-btn primary',
          onPress: () => {
            if (typing(this.trade)) (document.activeElement as HTMLElement).blur();
            this.a.send({ kind: 'tradeOffer', player: this.player, faction: f.id, goods: [...this.draft].filter(([, v]) => v > 0).flat() });
          },
        },
        f.tradeWhy || (empty ? 'Put goods in the offer box first.' : f.room <= 0 ? tradeLeftWords(f.room, f.day) : ''),
      );
      return;
    }
    f.offer!.bundles.forEach((b, k) => {
      const btn = this.tradeButtons.add(
        actions,
        {
          face: '',
          name: `Take bundle ${k + 1}: ${goodsText(b)}`,
          description: 'Take this bundle: the goods change hands at once.',
          className: 'dlg-btn bundle',
          onPress: () => {
            this.a.send({ kind: 'tradeTake', player: this.player, faction: f.id, bundle: k });
            this.draft.clear();
          },
        },
        f.tradeWhy,
      );
      for (const [good, n] of pairsOf(b)) {
        const g = el('span', 'bundle-good', btn.el);
        g.append(goodPic(good));
        el('span', 'good-name', g, n === 1 ? goodName(good) : `${goodName(good)} ×${n}`);
      }
    });
    this.tradeButtons.add(actions, {
      face: 'Withdraw',
      name: 'Withdraw the offer',
      description: 'Take your offer back and lose nothing. Offering the same goods again after turning their answer down three times in a day closes trade until dawn.',
      className: 'dlg-btn',
      onPress: () => {
        this.draft.clear();
        for (const [g, n] of goods) this.draft.set(g, n);
        this.a.send({ kind: 'tradeWithdraw', player: this.player, faction: f.id });
      },
    });
  }

  // ---- Hiring ----

  private drawHire(): void {
    const f = this.game.faction(this.hireFrom);
    if (!f || !f.hire) {
      this.closeHire();
      return;
    }
    const info = this.game.info;
    const silver = this.game.have(Res.Silver);
    const gold = this.game.have(Res.Gold);
    const room = info ? Math.max(0, info.supplyCap - info.supplyUsed) : 0;
    const sig = JSON.stringify([f.hire, silver, gold, room, this.payGold, this.said.get(f.id)]);
    if (sig === this.hireSig) return;
    this.hireSig = sig;
    this.hireButtons.clear();
    const hire = f.hire;
    const { head, body } = frame(this.hire, f.title);
    this.closeButton(this.hireButtons, head, 'Close (Esc).', () => this.closeHire());
    this.saidLine(body, f.id);
    el('p', 'dlg-note', body, `Swords for hire at ${hirePrice(hire)} a head. Once hired they are yours for good: each takes 1 supply and eats like any troop. ${hire.left} of ${hire.size} here now.`);
    const purse = el('div', 'hire-purse', body);
    goodRow(purse, Res.Silver, 'Silver', silver);
    goodRow(purse, Res.Gold, 'Gold', gold);
    el('div', 'good-row muted', purse, `Room for ${room} more supply.`);
    if (hire.why) el('p', 'dlg-why', body, hire.why);
    const pay = el('div', 'dlg-row', body);
    this.hireButtons.good(pay, Res.Silver, hire.silver, { name: 'Pay in silver', description: `Pay ${hire.silver} silver a head.`, className: 'dlg-btn pay-pick', onPress: () => { this.payGold = false; this.drawHire(); } }).setLit(!this.payGold);
    this.hireButtons.good(pay, Res.Gold, hire.gold, { name: 'Pay in gold', description: `Pay ${hire.gold} gold a head (1 gold is worth 7 silver).`, className: 'dlg-btn pay-pick', onPress: () => { this.payGold = true; this.drawHire(); } }).setLit(this.payGold);
    const price = this.payGold ? hire.gold : hire.silver;
    const coin = this.payGold ? 'gold' : 'silver';
    const purseNow = this.payGold ? gold : silver;
    const row = el('div', 'dlg-row', body);
    for (let n = 1; n <= Math.max(1, Math.min(MERC_MAX, hire.left)); n++) {
      const cost = n * price;
      this.hireButtons.add(
        row,
        {
          face: `Hire ${n} (${cost} ${coin})`,
          name: `Hire ${n}`,
          description: `${n} mercenar${n === 1 ? 'y' : 'ies'} for ${cost} ${coin}, yours for good.`,
          className: 'dlg-btn',
          onPress: () => this.a.send({ kind: 'hire', player: this.player, faction: f.id, count: n, ...(this.payGold ? { gold: 1 } : {}) }),
        },
        hire.why || (n > hire.left ? 'Nobody here for hire now.' : n > room ? `Needs ${n} supply; you have room for ${room}.` : purseNow < cost ? `Needs ${cost} ${coin}; you have ${purseNow}.` : ''),
      );
    }
  }
}

function pairsOf(list: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 1 < list.length; k += 2) out.push([list[k]!, list[k + 1]!]);
  return out;
}
