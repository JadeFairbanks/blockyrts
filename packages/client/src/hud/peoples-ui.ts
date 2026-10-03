// The neutral peoples on screen (Neutral villages and trade): the trade menu,
// the war pop-up, the mercenaries' hire box and the Peoples panel. Each is a
// HUD panel with HUD buttons, so all of it works with the mouse alone and
// with the cursor locked. Values stay hidden: the menu shows goods, never
// prices, and a rough worth bar under the offer box.
import {
  Cat,
  CAT_COUNT,
  CAT_NAMES,
  catOf,
  DAILY_BUY_TENTHS,
  FactionKind,
  goodName,
  HIRE_SILVER,
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
import type { PeopleInfo } from '../messages.ts';
import type { ButtonPress, ButtonRegistry, HudButtonDef } from './buttons.ts';
import type { HudPanels } from './panels.ts';

export interface PeoplesActions {
  send(o: Order): void;
  jumpTo(x: number, z: number): void;
  message(text: string, kind?: 'system' | 'alert'): void;
}

/** What the worth bar says of an offer, by how much of a day's buying of one kind it comes to (s). */
export function worthWords(worth: number): string {
  if (worth <= 0) return 'Put goods in the box to make an offer.';
  const k = worth / DAILY_BUY_TENTHS;
  if (k < 0.1) return 'A small offer.';
  if (k < 0.4) return 'A fair offer.';
  if (k < 0.9) return 'A good offer.';
  return 'A rich offer.';
}

/**
 * What an offer is worth to a faction, tenths, as the sim reckons it: each
 * good at what they pay for it, each kind of good no more than they still
 * buy today. Refused goods count nothing.
 */
export function offerWorth(f: Pick<PeopleInfo, 'pays' | 'room'>, goods: ReadonlyMap<number, number>): number {
  const byCat = new Array<number>(CAT_COUNT).fill(0);
  for (const [good, n] of goods) {
    const at = f.pays.findIndex((g, k) => k % 2 === 0 && g === good);
    const pct = at >= 0 ? f.pays[at + 1]! : REFUSE;
    if (pct === REFUSE) continue;
    const c = catOf(good);
    byCat[c] = byCat[c]! + Math.floor((valueTenths(good) * n * pct) / 100);
  }
  let worth = 0;
  for (let c = 0; c < CAT_COUNT; c++) worth += Math.min(byCat[c]!, f.room[c] ?? 0);
  return worth;
}

/** "Smoked fish ×5, Halfling shortbow" */
export function goodsText(pairs: readonly number[]): string {
  const out: string[] = [];
  for (let k = 0; k + 1 < pairs.length; k += 2) out.push(pairs[k + 1] === 1 ? goodName(pairs[k]!) : `${goodName(pairs[k]!)} ×${pairs[k + 1]}`);
  return out.join(', ');
}

/** The faction's state in a few words, for the Peoples panel. */
export function statusText(f: PeopleInfo): string {
  if (f.status === Status.Leaving) return 'Leaving their home.';
  if (f.status === Status.Migrated) return 'Gone to rebuild elsewhere. They will raid you until you pay reparations.';
  if (f.surrender) return 'They offer to surrender: accept or refuse.';
  if (f.war) return 'At war with you.';
  if (f.kind === FactionKind.MercCamp) return `${f.hire?.left ?? 0} of ${f.hire?.size ?? 0} for hire, ${HIRE_SILVER} silver each for a day.`;
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

  add(parent: HTMLElement, def: Omit<HudButtonDef, 'id' | 'keys'> & { keys?: string[] }, disabled = ''): void {
    const id = `${this.prefix}-${this.n++}`;
    const b = this.reg.add({ keys: [], ...def, id });
    if (disabled) b.setEnabled(false, disabled);
    this.ids.push(id);
    parent.append(b.el);
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
  private warThen: (() => void) | null = null;

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

  // ---- The Peoples panel ----

  private drawList(): void {
    const all = this.game.info?.peoples ?? [];
    const sig = JSON.stringify(all.map((f) => [f.id, f.status, f.war, f.surrender, f.owed, f.fighters, f.tradeWhy, f.hire, f.traded, f.visiting]));
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.listButtons.clear();
    this.list.replaceChildren();
    const head = el('div', 'dlg-head', this.list);
    el('h3', 'dlg-title', head, 'Peoples');
    this.listButtons.add(head, { face: '×', name: 'Close', description: 'Close the Peoples panel (O or Esc).', className: 'dlg-close', onPress: () => this.togglePanel() });
    if (all.length === 0) {
      el('p', 'dlg-note', this.list, 'You have not met any of the neutral peoples yet. Halflings live in the Heartland; Runkin, Dwarves, Elves and mercenaries farther out.');
      return;
    }
    for (const f of all) {
      const row = el('div', 'ppl-row', this.list);
      el('div', `ppl-name${f.war ? ' war' : ''}`, row, f.title);
      el('div', 'ppl-status', row, `${statusText(f)}${f.kind !== FactionKind.MercCamp ? ` Fighters: ${f.fighters}.` : ''}`);
      const btns = el('div', 'dlg-row', row);
      this.listButtons.add(btns, { face: 'Go there', name: 'Go there', description: 'Centre the camera on them.', className: 'dlg-btn', onPress: () => this.a.jumpTo(f.x / WU_PER_METRE, f.z / WU_PER_METRE) });
      if (f.kind === FactionKind.MercCamp) {
        this.listButtons.add(btns, { face: 'Hire', name: 'Hire mercenaries', description: `Hire up to ${MERC_MAX} for the day at ${HIRE_SILVER} silver each; they walk home at dusk.`, className: 'dlg-btn', onPress: () => this.openHire(f.id) }, f.hire?.why ?? '');
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

  private put(good: number, n: number): void {
    const cur = this.draft.get(good) ?? 0;
    if (cur === 0 && this.draft.size >= OFFER_SLOTS) {
      this.a.message(`The offer box holds ${OFFER_SLOTS} kinds of goods.`, 'alert');
      return;
    }
    const next = Math.max(0, Math.min(this.have(good), cur + n));
    if (next === 0) this.draft.delete(good);
    else this.draft.set(good, next);
    this.tradeSig = '';
    this.drawTrade();
  }

  private drawTrade(): void {
    const f = this.game.faction(this.tradeWith);
    if (!f || f.kind === FactionKind.MercCamp) {
      this.closeTrade();
      return;
    }
    // Goods the player no longer has leave the box.
    for (const [g, n] of [...this.draft]) {
      const h = this.have(g);
      if (h <= 0) this.draft.delete(g);
      else if (n > h) this.draft.set(g, h);
    }
    const mine = this.mine();
    const sig = JSON.stringify([f.stock, f.tradeWhy, f.offer, f.pays, f.room, mine, [...this.draft]]);
    if (sig === this.tradeSig) return;
    this.tradeSig = sig;
    this.tradeButtons.clear();
    const t = this.trade;
    t.replaceChildren();
    const head = el('div', 'dlg-head', t);
    el('h3', 'dlg-title', head, `Trade with ${f.title}`);
    this.tradeButtons.add(head, { face: '×', name: 'Close', description: 'Close the trade menu (Esc). An offer left open stays open.', className: 'dlg-close', onPress: () => this.closeTrade() });
    if (f.lean) el('p', 'dlg-note', t, `They lean to ${f.lean}: what they make of it is cheap, and they pay well for what they lack.`);
    if (f.tradeWhy) el('p', 'dlg-why', t, f.tradeWhy);
    const cols = el('div', 'trade-cols', t);

    // What they sell, and what they want.
    const theirs = el('div', 'trade-col', cols);
    el('div', 'trade-head', theirs, 'They sell today');
    const stock = el('div', 'trade-list', theirs);
    if (f.stock.length === 0) el('div', 'trade-good muted', stock, 'Nothing left today. Their stock refills each morning.');
    for (let k = 0; k < f.stock.length; k += 2) el('div', 'trade-good', stock, f.stock[k + 1] === 1 ? goodName(f.stock[k]!) : `${goodName(f.stock[k]!)} ×${f.stock[k + 1]}`);
    el('div', 'trade-head', theirs, 'They want');
    const wants = el('div', 'trade-list', theirs);
    const well = CAT_NAMES.filter((_, c) => (f.wants[c] ?? 0) >= 100);
    const refused = CAT_NAMES.filter((_, c) => f.wants[c] === REFUSE);
    const full = CAT_NAMES.filter((_, c) => f.wants[c] !== REFUSE && (f.room[c] ?? 0) <= 0);
    if (well.length) el('div', 'trade-good', wants, `Pay well for ${well.join(', ')}.`);
    el('div', 'trade-good muted', wants, 'Take most other goods for less.');
    if (refused.length) el('div', 'trade-good refused', wants, `Will not take ${refused.join(', ')}.`);
    if (full.length) el('div', 'trade-good refused', wants, `Have bought all the ${full.join(', ')} they want today.`);

    // The player's goods: click puts one in the box, Shift + click or right click puts ten.
    const yours = el('div', 'trade-col', cols);
    el('div', 'trade-head', yours, 'Your goods');
    const pool = el('div', 'trade-list goods', yours);
    pool.dataset.scroll = '';
    const open = f.offer !== null;
    for (const [good, n] of mine) {
      const refusedGood = this.pays(f, good) === REFUSE;
      const inBox = this.draft.get(good) ?? 0;
      this.tradeButtons.add(
        pool,
        {
          face: `${goodName(good)} ${n - inBox}`,
          name: goodName(good),
          description: 'Click to put one in the offer box; Shift + click or right click puts ten.',
          className: `trade-item${refusedGood ? ' refused' : ''}`,
          onPress: (p: ButtonPress) => this.put(good, p.shift ? 10 : 1),
          onRightClick: () => this.put(good, 10),
        },
        refusedGood ? (f.people === People.Elf && catOf(good) === Cat.Lumber ? 'The Elves take lumber as an insult: offering it closes trade with you for a day.' : 'They will not take this.') : open ? 'Withdraw the open offer to change it.' : f.tradeWhy,
      );
    }
    if (mine.length === 0) el('div', 'trade-good muted', pool, 'Your stock is empty.');

    // The offer box, its worth bar, and their answer.
    const box = el('div', 'trade-col', cols);
    el('div', 'trade-head', box, 'Your offer');
    const offered = el('div', 'trade-list offer', box);
    const goods = open ? new Map<number, number>(pairsOf(f.offer!.goods)) : this.draft;
    if (goods.size === 0) el('div', 'trade-good muted', offered, 'Click your goods to put them here.');
    for (const [good, n] of goods) {
      this.tradeButtons.add(
        offered,
        {
          face: `${goodName(good)} ×${n}`,
          name: goodName(good),
          description: 'Click to take one back out; right click takes them all.',
          className: 'trade-item in-box',
          onPress: () => this.put(good, -1),
          onRightClick: () => this.put(good, -n),
        },
        open ? 'Withdraw the open offer to change it.' : '',
      );
    }
    const worth = open ? f.offer!.worth : offerWorth(f, goods);
    const bar = el('div', 'worth-bar', box);
    const fill = el('div', 'worth-fill', bar);
    fill.style.width = `${Math.min(100, Math.round((worth / DAILY_BUY_TENTHS) * 100))}%`;
    el('div', 'worth-words', box, worthWords(worth));
    if (open) el('div', 'trade-head', box, 'They offer');
    const actions = el('div', 'dlg-row', box);
    if (!open) {
      this.tradeButtons.add(
        actions,
        {
          face: 'Make offer',
          name: 'Make offer',
          description: 'They weigh your goods and answer with three bundles of about that worth from their stock.',
          className: 'dlg-btn primary',
          onPress: () => this.a.send({ kind: 'tradeOffer', player: this.player, faction: f.id, goods: [...this.draft].flat() }),
        },
        f.tradeWhy || (this.draft.size === 0 ? 'Put goods in the offer box first.' : ''),
      );
      return;
    }
    f.offer!.bundles.forEach((b, k) => {
      this.tradeButtons.add(actions, {
        face: goodsText(b),
        name: `Take bundle ${k + 1}`,
        description: 'Take this bundle: the goods change hands at once.',
        className: 'dlg-btn bundle',
        onPress: () => {
          this.a.send({ kind: 'tradeTake', player: this.player, faction: f.id, bundle: k });
          this.draft.clear();
        },
      }, f.tradeWhy);
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
    const silver = this.game.have(Res.Silver);
    const sig = JSON.stringify([f.hire, silver]);
    if (sig === this.hireSig) return;
    this.hireSig = sig;
    this.hireButtons.clear();
    const h = this.hire;
    h.replaceChildren();
    const head = el('div', 'dlg-head', h);
    el('h3', 'dlg-title', head, f.title);
    this.hireButtons.add(head, { face: '×', name: 'Close', description: 'Close (Esc).', className: 'dlg-close', onPress: () => this.closeHire() });
    el('p', 'dlg-note', h, `Swords for hire: ${HIRE_SILVER} silver a head for one day. They fight for you until dusk, then walk home. ${f.hire.left} of ${f.hire.size} here now; you have ${silver} silver.`);
    if (f.hire.why) el('p', 'dlg-why', h, f.hire.why);
    const row = el('div', 'dlg-row', h);
    for (let n = 1; n <= Math.max(1, Math.min(MERC_MAX, f.hire.left)); n++) {
      const cost = n * HIRE_SILVER;
      this.hireButtons.add(
        row,
        { face: `Hire ${n} (${cost} silver)`, name: `Hire ${n}`, description: `${n} mercenar${n === 1 ? 'y' : 'ies'} until dusk for ${cost} silver.`, className: 'dlg-btn', onPress: () => this.a.send({ kind: 'hire', player: this.player, faction: f.id, count: n }) },
        f.hire.why || (n > f.hire.left ? 'Nobody here for hire today.' : silver < cost ? `Needs ${cost} silver; you have ${silver}.` : ''),
      );
    }
  }
}

function pairsOf(list: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 1 < list.length; k += 2) out.push([list[k]!, list[k + 1]!]);
  return out;
}
