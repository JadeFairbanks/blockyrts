// The training cards (Patch 2, round 2b, mock-up panels 1, 2 and 4): at a
// Barracks or a Magi Sanctum, one card per troop type or school,
// side by side under the title row. A card is the training picture (the bust
// for the tier it would train, the action menu's key in its corner), the
// name, two slots (weapon and armour, a mage's wand and robe) with their tier
// numbers, and a padlock in its top right corner. A slot opens the tier strip
// just above the panel: every tier the building offers as its picture and
// number, gold round the one trained now, red where the stock is short (still
// pickable), dark where not unlocked yet. Esc, a right click or a click
// anywhere else closes it. Every sentence is in a tooltip.
import { ARMOUR_KITS, mainCost, piecesTime, ROBE_KITS, Troop, WAND_KITS, armourPieces, weaponPiece, type Piece } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import type { ButtonIcon, HudButton, HudButtonDef } from './buttons.ts';
import { armourPic, robePic, wandPic, weaponPic, type Pic } from './icons.ts';
import { piecesStats } from './kit-text.ts';
import {
  aTroopName,
  cardAction,
  cardChoice,
  cardName,
  cardOptions,
  cardSchool,
  cardsOf,
  cardTooltip,
  cardWhy,
  goodsText,
  isMageCard,
  lockedCount,
  padlock,
  pickTier,
  type KitLine,
  type TierOption,
} from './troops.ts';
import { BATTLE_MAGE_ICON, SUPPORT_MAGE_ICON, troopIconFile } from './unit-icons.ts';

/** Makes (or reuses) one of the panel's buttons. */
export type MakeButton = (id: string, def: Omit<HudButtonDef, 'id'>) => HudButton;

export interface CardsHost {
  button: MakeButton;
  game: GameInfo;
  /** The label of the key bound to an action now. */
  keyName(action: string): string;
  /** Trains one (or five) of a card's unit, spread over the buildings with the shortest queues. */
  train(buildings: number[], card: number, count: number): void;
  /** Sends padlock orders (lock 0 opens it). */
  lock(orders: Array<{ building: number; lock: number }>, card: number): void;
  /** The cards changed without the sim: a pick, the strip opening or closing. */
  changed(): void;
}

const div = (cls: string, parent?: HTMLElement, text?: string): HTMLElement => {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text;
  parent?.append(d);
  return d;
};

/** The bust a card shows: the troop for the weapon tier it would train, or the school's mage. */
function cardBust(card: number, w: number): string {
  if (isMageCard(card)) return cardSchool(card) === 2 ? BATTLE_MAGE_ICON : SUPPORT_MAGE_ICON;
  return troopIconFile(card, w);
}

/** A slot's picture at a tier. */
function slotPic(card: number, line: KitLine, tier: number): Pic {
  if (isMageCard(card)) return line === 'w' ? wandPic(tier) : robePic(tier);
  return line === 'w' ? weaponPic(card, tier) : armourPic(tier);
}

/** The pieces one line of a card holds at a tier (close melee's armour carries its shield). */
function linePieces(card: number, line: KitLine, tier: number): Piece[] {
  if (isMageCard(card)) return [line === 'w' ? WAND_KITS[tier]! : ROBE_KITS[tier]!];
  if (line === 'a') return tier === 0 ? [ARMOUR_KITS[0]!] : armourPieces(card, tier);
  const p = weaponPiece(card, tier);
  return p ? [p] : [];
}

const icon = (p: Pic, tag: string): ButtonIcon => ({ layers: [p.filter ? { file: p.file, filter: p.filter } : { file: p.file }], tag });

export class TrainingCards {
  /** The open strip: the card and line it changes, for the buildings it was opened on. */
  private strip: { card: number; line: KitLine; on: string } | null = null;
  private stripSlot: HudButton | null = null;
  /** The ids of the buildings the cards were last drawn for. */
  private on = '';

  constructor(
    private readonly host: CardsHost,
    private readonly stripEl: HTMLElement,
  ) {}

  /** Whether the strip is open. */
  get open(): boolean {
    return this.strip !== null;
  }

  /** What the cards show, so the panel redraws when a choice, a padlock, a reason or the stock's reach changes. */
  sig(all: readonly BuildingInfo[]): string {
    const first = all[0];
    if (!first) return '';
    const g = this.host.game;
    const rows = cardsOf(first).map((r) => {
      const c = cardChoice(first, r.card);
      const tiers = (line: KitLine): string => cardOptions(g, first, r.card, line).map((o) => (o.why ? (o.short ? 's' : 'n') : 'y')).join('');
      const why = all.map((b) => {
        const k = cardChoice(b, r.card);
        return cardWhy(g, b, r.card, k.w, k.a);
      });
      return `${r.card}:${c.w}.${c.a}.${c.picked}.${c.locked}:${lockedCount(all, r.card)}:${why.join('/')}:${tiers('w')}|${tiers('a')}:${this.host.keyName(cardAction(r.card))}`;
    });
    const s = this.strip;
    return `${s ? `${s.card}${s.line}${s.on}` : ''}|${first.horses}|${rows.join(';')}`;
  }

  /** The cards for these buildings (all of one kind; the first one's kits show), and the strip when one is open. */
  render(parent: HTMLElement, all: readonly BuildingInfo[]): HTMLElement {
    const first = all[0]!;
    this.on = all.map((b) => b.id).join('.');
    if (this.strip && (this.strip.on !== this.on || !cardsOf(first).some((r) => r.card === this.strip!.card))) this.strip = null;
    this.stripSlot = null;
    const g = this.host.game;
    const ids = all.map((b) => b.id);
    const what = first.name.replace(/ \(.*\)$/, '') || 'building';
    const box = div('kit-cards', parent);
    box.classList.toggle('many', cardsOf(first).length >= 5);
    for (const r of cardsOf(first)) {
      const card = r.card;
      const c = cardChoice(first, card);
      // With several selected, the picture works while any of them can train its own choice.
      let why = '';
      for (const b of all) {
        const k = cardChoice(b, card);
        why = cardWhy(g, b, card, k.w, k.a);
        if (why === '') break;
      }
      if (all.length > 1 && why) {
        const k = cardChoice(first, card);
        why = cardWhy(g, first, card, k.w, k.a);
      }
      const el = div(`kit-card${c.locked ? ' locked' : ''}${why ? ' cannot' : ''}`, box);
      el.dataset.card = String(card);
      const name = cardName(card);
      const horses = card === Troop.Cavalry ? `\n${first.horses} grown tamed horse${first.horses === 1 ? '' : 's'} ready in the nearest Barn.` : '';
      const pic = this.host.button(`card-${card}`, {
        face: name.slice(0, 1),
        icon: { layers: [{ file: cardBust(card, c.w) }] },
        name: `Train ${name.toLowerCase()}`,
        keys: [],
        badge: this.host.keyName(cardAction(card)),
        description: cardTooltip(card, c, what) + horses,
        foot: 'Click: train one. Shift + click: five.',
        reasonFirst: true,
        className: 'card-pic',
        onPress: (p) => this.host.train(ids, card, p.shift ? 5 : 1),
      });
      pic.setEnabled(why === '', why);
      for (const old of pic.el.querySelectorAll('.card-horses')) old.remove();
      if (card === Troop.Cavalry) {
        const h = document.createElement('span');
        h.className = `card-horses${first.horses === 0 ? ' none' : ''}`;
        h.textContent = String(first.horses);
        pic.el.append(h);
      }
      const locked = lockedCount(all, card);
      const several = all.length > 1 ? ` Locked at ${locked} of ${all.length} selected ${what}.` : '';
      const lock = this.host.button(`card-lock-${card}`, {
        face: '',
        icon: { layers: [{ file: c.locked ? 'icon_padlock_closed' : 'icon_padlock_open' }] },
        name: c.locked ? 'Locked' : 'Lock this kit',
        keys: [],
        description: c.locked
          ? `Always this kit here; allies see it. Picking another tier keeps the lock, on the new tier.${several}`
          : `Train it here every time, even when the stock could pay for better or worse. Saved with the game; allies see it.${all.length > 1 ? ` Locks all ${all.length} selected ${what}.` : ''}${several && locked > 0 ? several : ''}`,
        foot: c.locked ? 'Click to unlock; the card follows the stock again.' : 'Click to lock it.',
        className: 'card-lock',
        onPress: () => {
          this.host.lock(padlock(all, card), card);
          this.host.changed();
        },
      });
      lock.setLit(c.locked);
      el.append(pic.el, lock.el);
      div('card-name', el, name);
      const slots = div('card-slots', el);
      for (const line of ['w', 'a'] as const) slots.append(this.slot(first, card, line, line === 'w' ? c.w : c.a).el);
    }
    this.renderStrip(all);
    return box;
  }

  /** One slot: the piece's picture and tier; a click opens the strip (the brawler's one weapon opens nothing). */
  private slot(b: BuildingInfo, card: number, line: KitLine, tier: number): HudButton {
    const g = this.host.game;
    const opts = cardOptions(g, b, card, line);
    const o = opts.find((x) => x.tier === tier);
    const pieces = linePieces(card, line, tier);
    const name = o?.name ?? pieces[0]?.name ?? '';
    const open = this.strip?.card === card && this.strip.line === line;
    const dark = !!o && o.why !== '' && !o.short;
    const what = line === 'w' ? (isMageCard(card) ? 'wand' : 'weapon') : isMageCard(card) ? 'robe' : 'armour';
    const btn = this.host.button(`card-${card}-${line}`, {
      face: String(tier),
      icon: icon(slotPic(card, line, tier), String(tier)),
      name: `${name}, tier ${tier}`,
      keys: [],
      description: piecesStats(pieces.filter((p) => p.tier > 0 || line === 'w'), undefined, isMageCard(card)) || `No ${what}.`,
      foot: opts.length > 1 ? 'Click to change it.' : 'There is only the one.',
      className: `card-slot${o?.short ? ' short' : ''}${dark ? ' dark' : ''}${open ? ' open' : ''}`,
      onPress: () => {
        if (opts.length > 1) this.toggle(card, line);
      },
    });
    btn.note = o?.why ?? '';
    if (open) this.stripSlot = btn;
    return btn;
  }

  /** A slot pressed: its strip opens, or closes when it is the one open. */
  private toggle(card: number, line: KitLine): void {
    const s = this.strip;
    this.strip = s && s.card === card && s.line === line ? null : { card, line, on: this.on };
    this.host.changed();
  }

  private renderStrip(all: readonly BuildingInfo[]): void {
    const el = this.stripEl;
    el.replaceChildren();
    const s = this.strip;
    if (!s) {
      el.hidden = true;
      return;
    }
    const first = all[0]!;
    const g = this.host.game;
    const c = cardChoice(first, s.card);
    const now = s.line === 'w' ? c.w : c.a;
    const current = linePieces(s.card, s.line, now);
    const row = div('tier-row', el);
    for (const o of cardOptions(g, first, s.card, s.line)) {
      const dark = o.why !== '' && !o.short;
      const btn = this.host.button(`tier-${o.tier}`, {
        face: String(o.tier),
        icon: icon(slotPic(s.card, s.line, o.tier), String(o.tier)),
        name: `${o.name}, tier ${o.tier}`,
        keys: [],
        description: this.tileText(s.card, s.line, o, current),
        foot: dark ? '' : 'Click to pick it.',
        className: `tier-tile${o.tier === now ? ' current' : ''}${o.short ? ' short' : ''}${dark ? ' dark' : ''}`,
        onPress: () => {
          const orders = pickTier(all, s.card, s.line, o.tier);
          if (orders.length > 0) this.host.lock(orders, s.card);
          this.strip = null;
          this.host.changed();
        },
      });
      btn.setEnabled(!dark, o.why);
      btn.note = o.short ? o.why : '';
      row.append(btn.el);
    }
    div('tier-point', el);
    el.hidden = false;
  }

  /** A tile's tooltip: its numbers against the tier trained now, and what it costs and adds to the training time. */
  private tileText(card: number, line: KitLine, o: TierOption, current: readonly Piece[]): string {
    const pieces = linePieces(card, line, o.tier);
    const shown = pieces.filter((p) => p.tier > 0 || line === 'w');
    const stats = piecesStats(shown, current.filter((p) => p.tier > 0 || line === 'w'), isMageCard(card));
    const cost = goodsText(mainCost(pieces));
    const time = piecesTime(pieces);
    const pay = cost ? `Costs ${cost}${time > 0 ? `; adds ${time} s to training` : ''}.` : 'Costs nothing.';
    // A weapon tier names the troop it makes (Patch 2, troop names).
    const makes = line === 'w' && !isMageCard(card) ? `Trains ${aTroopName(card, o.tier)}.` : '';
    return [makes, stats, pay].filter((x) => x).join('\n');
  }

  /** Puts the open strip just above the middle, pointing at its slot. */
  place(panel: HTMLElement): void {
    const el = this.stripEl;
    const slot = this.stripSlot;
    if (!this.strip || !slot || el.hidden) return;
    const s = Number(getComputedStyle(el.parentElement ?? el).getPropertyValue('--hud-s')) || 1;
    const r = slot.el.getBoundingClientRect();
    const top = panel.getBoundingClientRect().top;
    const w = el.offsetWidth * s;
    const h = el.offsetHeight * s;
    const mid = r.left + r.width / 2;
    const left = Math.max(4, Math.min(window.innerWidth - w - 4, mid - w / 2));
    const st = el.style;
    st.transformOrigin = '0 0';
    st.transform = s === 1 ? '' : `scale(${s})`;
    st.left = `${Math.round(left)}px`;
    st.top = `${Math.round(top - h - 6)}px`;
    const point = el.querySelector<HTMLElement>('.tier-point');
    if (point) point.style.left = `${Math.round((mid - left) / s)}px`;
  }

  /** No cards on show: the strip goes with them. */
  none(): void {
    this.strip = null;
    this.stripSlot = null;
    if (!this.stripEl.hidden) {
      this.stripEl.replaceChildren();
      this.stripEl.hidden = true;
    }
  }

  /** Closes the strip; true when it was open. */
  close(): boolean {
    if (!this.strip) return false;
    this.strip = null;
    this.stripEl.hidden = true;
    this.host.changed();
    return true;
  }

  /**
   * Any press anywhere while the strip is open: a left click on a tile or a
   * slot is theirs; everything else closes the strip, and a press in the game
   * view does nothing more (it only closes it). True to swallow the press.
   */
  pressed(left: boolean, inHud: boolean, el: Element | null): boolean {
    if (!this.strip) return false;
    if (left && el && (this.stripEl.contains(el) || el.closest('.card-slot'))) return false;
    this.close();
    return !inHud;
  }
}
