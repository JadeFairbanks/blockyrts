// The selection panel, the middle of the bottom strip (Controls: Selecting
// units and buildings; Patch 2, round 2: pictures and bars with sparse short
// text, every full sentence in the tooltip of its picture). The title row
// (Jade's Patch 3) runs the full width: the name at the size of the bars'
// words (Patch 3b; as tall as two bars in Patch 3), in the middle of the row, a
// divider, then "HP:" and the health bar with its numbers to the clear
// button, and under it "XP:" and the experience bar for a unit with ranks (a
// mage's mana, a rider's mount or a building's progress as a row more).
// Under it: for nothing selected, the three help lines; for one unit, its
// kit slots with tier numbers and what applies now (loot, load, the next
// meal, spells on it) and a word for what it is doing; for one building,
// its queue as large pictures, its training cards (training-cards.ts) or its
// level, workers, lights, farm bar, men up top and inside; for several, tabs
// with a picture and a count, and portraits with their bars. The title row
// and all under it grow together to fill the section (middle-fit.ts).
import {
  buildingSpec,
  engineSpec,
  isGame,
  itemsText,
  kitName,
  linePiece,
  Mount,
  productSpec,
  QUEUE_LIMIT,
  RATING_NAMES,
  RESOURCES,
  ROBE_KITS,
  shieldRow,
  speciesSpec,
  STEPS_PER_SECOND,
  TOOL_KITS,
  troopOf,
  Troop,
  unitOrderText,
  UnitKind,
  WAND_KITS,
  weaponPiece,
  ARMOUR_KITS,
  type Piece,
} from '@blockyrts/sim';
import type { GameInfo, UnitInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import { SpellOn } from '../messages.ts';
import { CTRL_NAME } from '../input/platform.ts';
import { buildingIdOf, entityIdOf, NOBODY, type Selectable } from '../selection/types.ts';
import type { ButtonIcon, ButtonPress, ButtonRegistry, HudButton, HudButtonDef } from './buttons.ts';
import { productIcon } from './card-icons.ts';
import { garrisonRoom } from './commands.ts';
import { harvestText } from './farm-panel.ts';
import { hungerLine, type HungerView } from './hunger.ts';
import { armourPic, robePic, shieldPic, toolPic, wandPic, weaponPic, type Pic } from './icons.ts';
import { goodIcon } from './inventory-icons.ts';
import { kitUrl } from './kit-icons.ts';
import { pieceStats } from './kit-text.ts';
import { bestScale, MIDDLE_MARGIN } from './middle-fit.ts';
import { queueText } from './queue-clock.ts';
import { TrainingCards } from './training-cards.ts';
import { cardsOf, keepPicks } from './troops.ts';
import { BATTLE_MAGE_ICON, buildingIconFile, selectableIconFile, SUPPORT_MAGE_ICON, troopIconFile, WORKER_ICON, type UnitLook } from './unit-icons.ts';
import { oneIsSingular } from './wording.ts';
import { hasRanks, xpView } from './xp-bar.ts';

/** Most portraits shown at once; the rest are counted ("+8"). */
const MAX_PORTRAITS = 40;
/** Most Barracks tiles in the row under the title. */
const MAX_TILES = 10;
/** The name takes at most this share of the title row beside its bars; a longer one goes on two lines. */
const TITLE_SHARE = 0.5;

/** A name on two lines, broken at the space that leaves the longer line shortest ("Support mage" over "(Novice Acolyte)"); one word stays whole. */
export function twoLines(name: string): string {
  let best = name;
  let most = Infinity;
  for (let k = name.indexOf(' '); k >= 0; k = name.indexOf(' ', k + 1)) {
    const longer = Math.max(k, name.length - k - 1);
    if (longer < most) {
      most = longer;
      best = `${name.slice(0, k)}\n${name.slice(k + 1)}`;
    }
  }
  return best;
}

export interface PanelActions {
  player: number;
  health(t: Selectable): [number, number] | null;
  /** A mage's mana and the bar's most, or null for everything else. */
  mana(t: Selectable): [number, number] | null;
  /** One of the player's units that eats: its next meal and its starving, or null. */
  hunger(t: Selectable): HungerView | null;
  building(t: Selectable): BuildingInfo | undefined;
  /** Left click a portrait; Shift removes it, Ctrl keeps its type, Ctrl + Shift removes its type. */
  portrait(t: Selectable, p: ButtonPress): void;
  portraitDouble(t: Selectable): void;
  portraitRight(t: Selectable): void;
  /** Subgroup tabs. */
  activate(typeKey: string): void;
  keepType(typeKey: string): void;
  dropType(typeKey: string): void;
  cancelQueued(building: number, index: number): void;
  letOut(building: number, unit: number): void;
  unitName(id: number): string;
  /** The label of the key bound to an action now. */
  keyName(action: string): string;
  /** The training cards: the game they read, training (Shift: 5), the padlock, and a change that redraws the card. */
  game: GameInfo;
  trainCard(buildings: number[], card: number, count: number): void;
  lockTroop(building: number, card: number, lock: number): void;
  troopsChanged(): void;
  /** A type's worth, for the subgroup order of a mixed selection. */
  worth?(typeKey: string, items: readonly Selectable[]): number;
  /** A unit's troop and weapon tier, for its picture. */
  look?(t: Selectable): UnitLook | null;
  /** Seconds until a building's head item is done, or null while it is on hold (queue-clock.ts). */
  queueLeft?(b: BuildingInfo): number | null;
  /** Another player's name and colour, for the title row of their units and buildings. */
  ownerTag?(owner: number): { name: string; colour: string } | null;
}

const pic = (file: string): ButtonIcon | undefined => (file ? { layers: [{ file }] } : undefined);
const layer = (p: Pic, tag?: string): ButtonIcon => ({ layers: [p.filter ? { file: p.file, filter: p.filter } : { file: p.file }], ...(tag !== undefined ? { tag } : {}) });

/** Fixed order of types in the panel, so the same army always looks the same. */
export function typeOrder(typeKey: string): number {
  if (typeKey === 'worker') return 0;
  if (typeKey === 'warrior') return 1;
  if (typeKey === 'warrior:crew') return 1.5;
  if (typeKey === 'mage:support') return 2;
  if (typeKey === 'mage:battle') return 3;
  if (typeKey.startsWith('building:')) return 100 + Number(typeKey.split(':')[1]);
  return 1000;
}

/**
 * The selection split into subgroups by type. With `worth`, the most valuable
 * type comes first (a mixed selection shows it on the card and the portrait,
 * and Tab steps down from it); ties and everything else keep the fixed order.
 */
export function subgroups(list: readonly Selectable[], worth?: (typeKey: string, items: readonly Selectable[]) => number): Array<{ typeKey: string; items: Selectable[] }> {
  const map = new Map<string, Selectable[]>();
  for (const t of list) {
    const g = map.get(t.typeKey);
    if (g) g.push(t);
    else map.set(t.typeKey, [t]);
  }
  const groups = [...map].map(([typeKey, items]) => ({ typeKey, items, worth: worth ? worth(typeKey, items) : 0 }));
  groups.sort((a, b) => b.worth - a.worth || typeOrder(a.typeKey) - typeOrder(b.typeKey) || (a.typeKey < b.typeKey ? -1 : 1));
  return groups.map(({ typeKey, items }) => ({ typeKey, items }));
}

/** A glyph for what has no picture (a resource node). */
function glyph(t: Selectable): string {
  if (t.kind === 'node') return '♣';
  return '•';
}

/** A unit's picture from the sim's copy of it (the units inside a building). */
function unitInfoIcon(u: { kind: number; troop: number; wTier: number; school: number } | null): string {
  if (!u) return WORKER_ICON;
  if (u.kind === UnitKind.Warrior) return troopIconFile(u.troop, u.wTier);
  if (u.kind === UnitKind.Mage) return u.school === 2 ? BATTLE_MAGE_ICON : SUPPORT_MAGE_ICON;
  return WORKER_ICON;
}

/** A name without its rank in brackets: "Close melee (Veteran)" is "Close melee", the rank going to its badge. */
export function bareName(label: string): string {
  return label.replace(/ \([^)]*\)$/, '');
}

/** "5 Close melee, 4 Rangers": the troops of a selection by name, most first. */
export function armyMix(items: readonly Selectable[]): string {
  const counts = new Map<string, number>();
  for (const t of items) counts.set(bareName(t.label), (counts.get(bareName(t.label)) ?? 0) + 1);
  const plural = (name: string, n: number): string => {
    if (n === 1 || /(melee|cavalry|s)$/i.test(name)) return name;
    if (/man$/.test(name)) return `${name.slice(0, -3)}men`;
    return `${name}s`;
  };
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([name, n]) => `${n} ${plural(name, n)}`).join(', ');
}

/** What the spells on a unit look like (the kit has quickened, fortified, rallied and hexed; the ward and heal spells stand for the rest). */
const SPELL_PICS: ReadonlyArray<readonly [number, string, string]> = [
  [SpellOn.Quicken, 'icon_status_quickened', 'Quickened'],
  [SpellOn.Fortify, 'icon_status_fortified', 'Fortified'],
  [SpellOn.Rally, 'icon_status_rallied', 'Rallied'],
  [SpellOn.Warding, 'icon_spell_warding', 'Warded'],
  [SpellOn.Healing, 'icon_spell_heal', 'Being healed'],
  [SpellOn.Hexed, 'icon_status_hexed', 'Hexed'],
];

/** A number in a picture's bottom corner (a count). */
function tag(text: string): HTMLElement {
  const t = document.createElement('span');
  t.className = 'chip-count';
  t.textContent = text;
  return t;
}

/** A bar in the title row or under a picture, kept to move every frame without a redraw. */
interface LiveBar {
  fill: HTMLElement;
  num: HTMLElement | null;
  btn: HudButton | null;
  read: () => { pct: number; text: string; tip: string; low?: boolean } | null;
}

export class SelectionPanel {
  /** Buttons made for the panel, kept across redraws so a press in progress survives one. */
  private readonly dynamic = new Map<string, HudButton>();
  private used = new Set<string>();
  private sig = '';
  private readonly bars = new Map<string, HTMLElement>();
  private readonly manaBars = new Map<string, HTMLElement>();
  /** Bars that move every frame: the title row's, a meal's, an upgrade's, a farm's, the Barracks tiles'. */
  private live: LiveBar[] = [];
  /** The shown queue's head: its button and bar, updated live (patch notes 1). */
  private head: { btn: HudButton; bar: HTMLElement } | null = null;
  /** The training cards and their tier strip. */
  readonly cards: TrainingCards;
  /** The building ids whose card picks still hold (Jade: only while selected). */
  private selected = '';
  /** The block holding the title row and the body, and the room it is scaled to fill (layout.ts). */
  private readonly content: HTMLElement;
  private readonly room: HTMLElement;
  /** The room's size the content was last fitted to. */
  private fitted = '';
  /** The name in the title row, before fitTitle breaks it in two. */
  private titleText = '';

  constructor(
    private readonly title: HTMLElement,
    private readonly extra: HTMLElement,
    private readonly body: HTMLElement,
    strip: HTMLElement,
    private readonly buttons: ButtonRegistry,
    private readonly a: PanelActions,
  ) {
    this.content = body.parentElement ?? body;
    this.room = this.content.parentElement ?? this.content;
    // The display font arrives after the first draw and changes every word's width: fit again then.
    void document.fonts?.ready.then(() => {
      this.fitted = '';
    });
    this.cards = new TrainingCards(
      {
        button: (id, def) => this.button(id, def),
        game: a.game,
        keyName: (action) => a.keyName(action),
        train: (ids, card, count) => a.trainCard(ids, card, count),
        lock: (orders, card) => {
          for (const o of orders) a.lockTroop(o.building, card, o.lock);
        },
        changed: () => {
          this.sig = '';
          a.troopsChanged();
        },
      },
      strip,
    );
  }

  private clear(): void {
    this.head = null;
    this.used = new Set();
    this.bars.clear();
    this.manaBars.clear();
    this.live = [];
    this.body.replaceChildren();
    this.extra.replaceChildren();
  }

  /** Drops the buttons the last redraw did not use. */
  private sweep(): void {
    for (const [id] of this.dynamic) {
      if (this.used.has(id)) continue;
      this.buttons.remove(id);
      this.dynamic.delete(id);
    }
  }

  private button(id: string, def: Omit<HudButtonDef, 'id'>): HudButton {
    this.used.add(id);
    const old = this.dynamic.get(id);
    if (old) {
      old.redefine({ id, ...def });
      old.note = '';
      old.setEnabled(true);
      old.setLit(false);
      for (const c of [...old.el.children]) if (!c.classList.contains('face') && !c.classList.contains('key') && !c.classList.contains('btn-icon')) c.remove();
      return old;
    }
    const b = this.buttons.add({ id, ...def });
    this.dynamic.set(id, b);
    return b;
  }

  /** A picture that only explains itself: its tooltip carries the sentences. */
  private chip(id: string, o: { icon?: ButtonIcon | undefined; face?: string; name: string; description: string; className?: string; foot?: string }, parent: HTMLElement): HudButton {
    const b = this.button(id, { face: o.face ?? '', icon: o.icon, name: oneIsSingular(o.name), keys: [], description: o.description, ...(o.foot ? { foot: o.foot } : {}), className: `chip ${o.className ?? ''}`.trim() });
    parent.append(b.el);
    return b;
  }

  private row(cls: string, text: string, parent: HTMLElement = this.body): HTMLElement {
    const d = document.createElement('div');
    d.className = `sel-row ${cls}`.trim();
    d.textContent = oneIsSingular(text);
    parent.append(d);
    return d;
  }

  private strip(cls: string, parent: HTMLElement = this.body): HTMLElement {
    const d = document.createElement('div');
    d.className = `sel-strip ${cls}`.trim();
    parent.append(d);
    return d;
  }

  /** Redraws when what is shown changed; otherwise only the bars move. */
  render(list: readonly Selectable[], active: string | null, hints: string[]): void {
    const one = list.length === 1 ? list[0]! : null;
    const b = one ? this.a.building(one) : undefined;
    const cardSet = this.cardSet(list);
    // A card's pick holds only while its building stays selected (Jade).
    const ids = list.map((t) => buildingIdOf(t.key)).filter((id): id is number => id !== null);
    const sel = ids.join('.');
    if (sel !== this.selected) {
      this.selected = sel;
      keepPicks(new Set(ids));
    }
    const sig = [
      list.map((t) => `${t.key}:${t.label}:${(t.details ?? []).join('|')}`).join(','),
      active,
      b ? this.buildingSig(b) : '',
      cardSet ? `${cardSet.map((x) => `${x.id}.${x.queue.length}.${x.queue.map((q) => q.product).join('-')}`).join(',')}#${this.cards.sig(cardSet)}` : '',
      one && !b ? this.unitSig(one) : '',
      hints.join('|'),
    ].join('#');
    if (sig === this.sig) {
      this.update(list, b);
      // The section changed size (the window, the HUD's scale, a phone's fold): fit the same content again.
      if (this.roomKey() !== this.fitted) this.fit();
      this.cards.place(this.panelEl());
      return;
    }
    this.sig = sig;
    this.clear();
    if (list.length === 0) {
      this.setTitle('Nothing selected');
      for (const h of hints) this.row('hint', h);
    } else if (cardSet && cardSet.length > 1) {
      this.setTitle(bareName(cardSet[0]!.name));
      this.severalCards(list, cardSet);
    } else if (one) {
      this.setTitle(one.kind === 'unit' && !one.typeKey.startsWith('mage:') ? bareName(one.label) : one.label);
      if (b) this.oneBuilding(one, b);
      else this.oneThing(one);
    } else {
      this.setTitle(`${list.length} selected`);
      this.multi(list, active);
    }
    if (!cardSet) this.cards.none();
    this.update(list, b);
    this.sweep();
    this.fit();
    this.cards.place(this.panelEl());
  }

  /**
   * The section at its standard height, or taller when the content at its own
   * size (`need`, px) is taller than that leaves room for: it grows upward as
   * the action menu's card does, up to the portrait's height (layout.ts reads
   * the height wanted, so a new layout keeps it). Returns the room's height.
   */
  private grow(need: number): number {
    const panel = this.panelEl();
    const d = panel.dataset;
    const std = Number(d.h ?? 0);
    const most = Number(d.most ?? 0);
    if (!(std > 0)) return this.room.clientHeight;
    panel.style.height = `${std}px`;
    const short = need + 2 * MIDDLE_MARGIN - this.room.clientHeight;
    const want = short > 0 && most > std ? Math.min(most, std + Math.ceil(short)) : 0;
    d.want = String(want);
    if (want > 0) panel.style.height = `${want}px`;
    return this.room.clientHeight;
  }

  private roomKey(): string {
    return `${this.room.clientWidth}x${this.room.clientHeight}`;
  }

  /**
   * Jade's Patch 3: the title row and everything under it grow together to
   * fill the section, as the action menu's buttons fill the card: one scale,
   * the largest at which the content (laid out that much narrower) is no
   * taller than the room and no row runs wider than it did at its own size
   * (middle-fit.ts). Nothing stretches. Too tall at its own size, the
   * section grows upward first (grow), then the content shrinks a little;
   * past that the body scrolls, as before Patch 3.
   */
  private fit(): void {
    const c = this.content;
    const st = c.style;
    st.transform = '';
    st.height = '';
    const w = this.room.clientWidth - 2 * MIDDLE_MARGIN;
    if (w <= 0) {
      this.fitted = this.roomKey();
      return;
    }
    // How far the rows that may not wrap run past their width (the cards scroll sideways, the bars keep their least).
    const watched = [c, this.body, this.extra, this.title, ...c.querySelectorAll<HTMLElement>('.kit-cards, .sel-strip')];
    const spill = (): number => watched.reduce((n, el) => n + Math.max(0, el.scrollWidth - el.clientWidth), 0);
    const lay = (k: number): void => {
      st.width = `${w / k}px`;
    };
    lay(1);
    this.fitTitle();
    const h = this.grow(c.offsetHeight) - 2 * MIDDLE_MARGIN;
    this.fitted = this.roomKey();
    if (h <= 0) return;
    const base = spill();
    const k = bestScale((k) => {
      lay(k);
      return c.offsetHeight * k <= h + 0.5 && spill() <= base + 1;
    });
    lay(k);
    // The block is as tall as the room, so a body too long even at its own size scrolls inside it.
    st.height = `${h / k}px`;
    st.transform = k === 1 ? '' : `scale(${k})`;
  }

  /**
   * The name is the size of "HP:" and "XP:" beside it (Jade's Patch 3b), the
   * bars taking the rest of the row. One too long for its share of the row
   * goes on two lines; with no bars it may take the row up to the clear button.
   */
  private fitTitle(): void {
    const t = this.title;
    t.classList.remove('long', 'one');
    if (t.textContent !== this.titleText) t.textContent = this.titleText;
    const row = t.parentElement?.clientWidth ?? 0;
    const corner = t.parentElement?.querySelector<HTMLElement>('.sel-corner')?.offsetWidth ?? 0;
    const most = this.extra.childElementCount > 0 ? Math.floor(row * TITLE_SHARE) : row - corner - 4;
    t.style.maxWidth = `${Math.max(0, most)}px`;
    if (t.scrollWidth <= t.clientWidth + 1) return;
    const lines = twoLines(this.titleText);
    t.textContent = lines;
    t.classList.add('long');
    t.classList.toggle('one', !lines.includes('\n'));
  }

  private panelEl(): HTMLElement {
    return this.body.closest<HTMLElement>('.selection-panel') ?? this.body;
  }

  private setTitle(text: string): void {
    this.titleText = text;
    if (this.title.textContent !== text) this.title.textContent = text;
  }

  /** The own buildings of one kind with training cards, when they are all that is selected; else null. */
  private cardSet(list: readonly Selectable[]): BuildingInfo[] | null {
    if (list.length === 0 || list.some((t) => t.kind !== 'building')) return null;
    const all: BuildingInfo[] = [];
    for (const t of list) {
      const b = this.a.building(t);
      if (!b || (b.owner !== this.a.player && !b.shared) || cardsOf(b).length === 0) return null;
      if (all[0] && all[0].kind !== b.kind) return null;
      all.push(b);
    }
    return all;
  }

  // ---- The title row ----

  /** A bar, with its numbers on it (health, a farm's harvest) or with them only in its tooltip. */
  private bar(kind: 'hp' | 'xp' | 'mana' | 'horse' | 'build' | 'meal' | 'up', parent: HTMLElement, read: LiveBar['read'], name: string, withNum = true, id = `bar-${kind}`): HTMLElement {
    const btn = this.button(id, { face: '', name, keys: [], description: '', className: `sel-bar ${kind}` });
    const fill = document.createElement('span');
    fill.className = 'fill';
    btn.el.append(fill);
    let num: HTMLElement | null = null;
    if (withNum) {
      num = document.createElement('span');
      num.className = 'num';
      btn.el.append(num);
    }
    parent.append(btn.el);
    this.live.push({ fill, num, btn, read });
    return btn.el;
  }

  /**
   * The title row after the name (Jade's Patch 3): a divider, then a row per
   * bar, each its word and a bar running to the clear button, all as tall as
   * the health bar. "HP:" the health with its numbers on it; "XP:" a unit's
   * experience toward its next rank (workers, troops, mages), solid light
   * blue, the numbers in its tooltip; "MP:" a mage's mana; the mount's health
   * for a rider; a building's construction or upgrade.
   */
  private titleBars(t: Selectable, b: BuildingInfo | undefined, u: UnitInfo | null): void {
    const divider = document.createElement('span');
    divider.className = 'sel-divider';
    const box = document.createElement('div');
    box.className = 'sel-bars';
    this.extra.append(divider, box);
    const label = (text: string): void => {
      const l = document.createElement('span');
      l.className = 'bar-label';
      l.textContent = text;
      box.append(l);
    };
    label('HP:');
    this.bar('hp', box, () => {
      const h = this.a.health(t);
      if (!h || h[1] <= 0) return null;
      const pct = Math.max(0, Math.min(100, Math.round((h[0] * 100) / h[1])));
      return { pct, text: `${h[0]}/${h[1]}`, tip: `Health ${h[0]} of ${h[1]}.`, low: pct < 35 };
    }, 'Health');
    // Another player's units show their experience too; the peoples' and the monsters' have no ranks.
    if (u && hasRanks(u.kind) && u.owner < 8) {
      const unit = u.id;
      label('XP:');
      this.bar('xp', box, () => {
        const v = this.a.game.unit(unit);
        const x = v ? xpView(v.kind, v.rank, v.xp, v.xpNext) : null;
        return x ? { pct: x.pct, text: '', tip: x.tip } : null;
      }, 'Experience', false);
    }
    if (u && u.kind === UnitKind.Mage) {
      label('MP:');
      this.bar('mana', box, () => {
        const m = this.a.mana(t);
        if (!m) return null;
        return { pct: m[1] > 0 ? Math.max(0, Math.min(100, Math.round((m[0] * 100) / m[1]))) : 0, text: '', tip: `Mana ${m[0]} of ${m[1]}.` };
      }, 'Mana', false);
    }
    if (u && u.mount !== Mount.None) {
      const unit = u.id;
      label(u.mount === Mount.Horse ? 'Horse:' : 'Mount:');
      this.bar('horse', box, () => {
        const v = this.a.game.unit(unit);
        if (!v || v.mountMax <= 0) return null;
        return { pct: Math.max(0, Math.min(100, Math.round((v.mountHp * 100) / v.mountMax))), text: '', tip: `Riding: its mount's health is ${v.mountHp} of ${v.mountMax}.` };
      }, 'Mount', false);
    }
    if (b && (!b.complete || b.upgrading)) {
      const id = b.id;
      label(b.complete ? 'Upgrade:' : 'Build:');
      this.bar('build', box, () => {
        const v = this.a.game.buildings.get(id);
        if (!v) return null;
        const per = v.complete ? v.upgraded : v.built;
        const pct = Math.floor(per / 10);
        return { pct, text: '', tip: v.complete ? `Upgrading: ${pct}%.` : `Under construction: ${pct}%.` };
      }, b.complete ? 'Upgrading' : 'Under construction', false);
    }
  }

  /** Another player's name in their colour, first under the title row (others' units and buildings only). */
  private ownerTag(owner: number): void {
    if (owner === this.a.player || owner === NOBODY || owner >= 8) return;
    const tag = this.a.ownerTag?.(owner) ?? { name: `Player ${owner + 1}`, colour: '' };
    const b = this.chip('owner', { face: tag.name, name: tag.name, description: 'Not yours: you can look but not give orders.', className: 'owner-tag' }, this.strip('owner'));
    if (tag.colour) b.el.style.setProperty('--owner', tag.colour);
  }

  /**
   * The queue under the title row (Jade's Patch 3), its pictures larger than
   * in the title row before, read like a book from the left: the first with
   * its bar, then the rest, then an empty place for each more it can take. A
   * click cancels one, refunded in full.
   */
  private queue(b: BuildingInfo): void {
    const q = this.strip('queue');
    b.queue.forEach((item, k) => {
      const ps = productSpec(item.product);
      const t = troopOf(item.product);
      const name = t ? `${ps.name} (${kitName(t.troop, t.w, t.a).toLowerCase()})` : ps.name;
      // The same picture as the unit once it is out, and as the button that queued it.
      const icon = productIcon(item.product);
      const btn = this.button(`queue${k}`, {
        face: icon ? '' : name.slice(0, 1),
        icon,
        name: `${name}: cancel`,
        keys: [],
        description: queueText(k === 0, k === 0 ? (this.a.queueLeft?.(b) ?? null) : null),
        className: 'portrait queue-item',
        onPress: () => this.a.cancelQueued(b.id, k),
      });
      if (k === 0) {
        const bar = document.createElement('span');
        bar.className = 'hp';
        bar.style.width = `${item.done / 10}%`;
        btn.el.append(bar);
        this.head = { btn, bar };
      }
      q.append(btn.el);
    });
    for (let k = b.queue.length; k < QUEUE_LIMIT; k++) {
      const empty = document.createElement('span');
      empty.className = 'queue-empty';
      q.append(empty);
    }
  }

  /** Whether a building of the player's makes anything in a queue (units, goods, research): its queue row shows, empty or not. */
  private queues(b: BuildingInfo): boolean {
    return b.queue.length > 0 || (b.complete && (buildingSpec(b.kind).trainsWorkers || b.products.length > 0 || cardsOf(b).length > 0));
  }

  // ---- One building ----

  private buildingSig(b: BuildingInfo): string {
    return [b.queue.map((q) => q.product).join('.'), b.inside.join('.'), b.up.join('.'), b.rally.length, b.assigned, b.working, b.complete, b.upgrading, b.level, b.lit, b.herd, b.rating, b.stock.join('.'), b.horses, b.farm ? `${Number(b.farm.grows)}${b.farm.res}${b.farm.band}` : ''].join('/');
  }

  private oneBuilding(t: Selectable, b: BuildingInfo): void {
    const own = b.owner === this.a.player || b.shared;
    this.titleBars(t, b, null);
    this.ownerTag(b.owner);
    if (own && this.queues(b)) this.queue(b);
    // A training building's facts (its workers, the rally route) stand in a column beside its cards.
    const cards = own && b.complete && cardsOf(b).length > 0 ? this.cards.render(this.body, [b]) : null;
    this.buildingFacts(b, own, cards ?? this.body);
    if (b.farm) this.farmBar(b);
    if (own) this.garrison(b);
    if (!own && t.details) this.notes(t, t.details.slice(1));
  }

  /** The small pictures with a count: workers, stalls, a light's reach, a mine's rating and goods, the rally route. */
  private buildingFacts(b: BuildingInfo, own: boolean, parent: HTMLElement): void {
    const spec = buildingSpec(b.kind);
    const row = this.strip('facts', parent);
    // The tier, where the building has tiers (the main base, four from Patch 5): first of its facts, the title row being the name and bars only (Patch 3).
    if (spec.levels.length > 1 && b.complete) this.chip('level', { face: `Tier ${b.level}`, name: `Tier ${b.level} of ${spec.levels.length}`, description: b.name, className: 'word' }, row);
    const room = b.complete ? (spec.levels[b.level - 1]?.workers ?? 0) : 0;
    if (own && room > 0) {
      const at = b.status && !b.status.startsWith('Under construction') && !b.status.startsWith('Upgrading') ? `${b.status}.` : '';
      this.chip('workers', {
        icon: pic(WORKER_ICON),
        face: `${b.assigned}/${room}`,
        name: `Workers: ${b.assigned} of ${room}`,
        description: [at, `${b.working} at work now.`, 'Right-click it with workers to assign them.'].filter((x) => x).join('\n'),
        className: `count${b.status.includes('no stretch') ? ' warn' : ''}`,
      }, row);
    }
    if (own && b.herd > 0) {
      this.chip('herd', { icon: pic('icon_pen_barn'), face: String(b.herd), name: `${b.herd} animal${b.herd === 1 ? '' : 's'}`, description: b.status ? `${b.status}.` : '', className: 'count' }, row);
    }
    const light = spec.light;
    if (light && b.complete) {
      if (b.lit) {
        this.chip('light', { icon: pic('icon_torch_post'), face: `${light.lightM} m`, name: 'Light', description: `Lights ${light.lightM} m round it.`, className: 'count' }, row);
        if (light.claimM > 0) this.chip('claim', { icon: pic(`team_banner_${Math.min(8, b.owner + 1)}`), face: `${light.claimM} m`, name: 'Claim', description: `Claims ${light.claimM} m round it while lit.`, className: 'count' }, row);
      } else {
        this.chip('light', { icon: pic('icon_torch_post'), face: 'Out', name: 'Out', description: `Put out: no light, no claim. Lit, it lights ${light.lightM} m${light.claimM > 0 ? ` and claims ${light.claimM} m` : ''}.`, className: 'count warn' }, row);
      }
    }
    if (b.rating > 0) this.chip('rating', { face: RATING_NAMES[b.rating - 1] ?? '', name: 'The spot', description: b.status ? `${b.status}.` : '', className: 'word' }, row);
    b.stock.forEach(([res, n], k) => {
      const g = goodIcon(res);
      this.chip(`stock${k}`, { icon: g ? layer(g.tint ? { file: g.file, filter: g.tint } : { file: g.file }) : undefined, face: String(n), name: RESOURCES[res]?.name ?? 'Goods', description: `${itemsText([[res, n]])} waiting to be hauled.`, className: 'count' }, row);
    });
    if (own && b.rally.length > 0) this.chip('rally', { icon: pic('icon_cmd_rally'), face: String(b.rally.length), name: 'Rally route', description: `New units go along ${b.rally.length} point${b.rally.length > 1 ? 's' : ''}. Right-click the ground with it selected to set another.`, className: 'count' }, row);
    if (row.childElementCount === 0) row.remove();
  }

  /** A farm's harvest: the crop's picture and "6 in 3:40" on its bar, the sentences in the tooltip. */
  private farmBar(b: BuildingInfo): void {
    const f = b.farm!;
    if (!f.grows && !f.band) return;
    const row = this.strip('farm');
    const g = goodIcon(f.res);
    if (g) this.chip('crop', { icon: layer(g.tint ? { file: g.file, filter: g.tint } : { file: g.file }), name: RESOURCES[f.res]?.name ?? 'Harvest', description: f.band || harvestText(f), className: 'crop' }, row);
    if (!f.grows) return;
    const id = b.id;
    this.bar('meal', row, () => {
      const v = this.a.game.buildings.get(id)?.farm;
      if (!v) return null;
      const s = Math.ceil(v.stepsLeft / STEPS_PER_SECOND);
      const time = v.stepsLeft > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'still';
      return { pct: Math.max(0, Math.min(100, v.done / 10)), text: `${v.items} in ${time}`, tip: [harvestText(v), v.band].filter((x) => x).join('\n') };
    }, 'Harvest', true, 'farm-bar');
  }

  /** Up top and inside: a picture and a count, then their portraits, each one's tooltip saying what a click does. */
  private garrison(b: BuildingInfo): void {
    const top = garrisonRoom(b);
    if (top > 0) {
      const row = this.strip('garrison');
      this.chip('top', {
        icon: pic('icon_tower_softwood'),
        face: `Up top ${b.up.length}/${top}`,
        name: `Up top: ${b.up.length} of ${top}`,
        description: b.up.length > 0 ? 'Click one to bring it down.' : 'Select men and right click it.',
        className: 'word',
      }, row);
      this.portraits(b, b.up, 'top', 'Click to bring this one down.', row);
    }
    const sheltering = b.inside.filter((id) => !b.up.includes(id));
    if (sheltering.length > 0) {
      const row = this.strip('garrison');
      this.chip('inside', { icon: pic('icon_status_sheltered'), face: `Inside ${sheltering.length}`, name: `Inside: ${sheltering.length}`, description: 'Click one to let it out.', className: 'word' }, row);
      this.portraits(b, sheltering, 'inside', 'Click to let this one out.', row);
    }
  }

  /** A row of portraits of units in a building, each letting that one out when clicked. */
  private portraits(b: BuildingInfo, ids: readonly number[], key: string, description: string, parent: HTMLElement): void {
    for (const id of ids) {
      const btn = this.button(`${key}${id}`, {
        face: '',
        icon: pic(unitInfoIcon(this.a.game.unit(id))),
        name: this.a.unitName(id),
        keys: [],
        description,
        className: 'portrait',
        onPress: () => this.a.letOut(b.id, id),
      });
      parent.append(btn.el);
    }
  }

  /** Lines with no picture of their own (the peoples' buildings, a resource node): one marker whose tooltip holds them. */
  private notes(t: Selectable, lines: readonly string[], parent?: HTMLElement): void {
    const text = lines.filter((l) => l && !/^Health \d/.test(l));
    if (text.length === 0) return;
    const row = parent ?? this.strip('facts');
    this.chip('notes', { face: '?', name: t.label, description: text.join('\n'), className: 'notes' }, row);
  }

  // ---- Several Barracks ----

  /** Only Barracks (or only Sanctums) selected: a tile per building under the title row, as one's queue is, then their cards. */
  private severalCards(list: readonly Selectable[], all: BuildingInfo[]): void {
    const tiles = this.strip('tiles');
    list.slice(0, MAX_TILES).forEach((t, k) => {
      const b = all[k]!;
      const btn = this.button(`tile-${b.id}`, {
        face: '',
        icon: pic(buildingIconFile(b.kind, b.level)),
        name: `${bareName(b.name)}: ${b.queue.length} in the queue`,
        keys: [],
        description: `Click: select only this one. Shift + click or right click: remove it.`,
        className: 'portrait tile',
        onPress: (p) => this.a.portrait(t, p),
        onRightClick: () => this.a.portraitRight(t),
        onDoubleClick: () => this.a.portraitDouble(t),
      });
      if (b.queue.length > 0) {
        const n = document.createElement('span');
        n.className = 'tile-count';
        n.textContent = String(b.queue.length);
        btn.el.append(n);
      }
      const bar = document.createElement('span');
      bar.className = 'hp';
      btn.el.append(bar);
      this.bars.set(t.key, bar);
      tiles.append(btn.el);
    });
    if (list.length > MAX_TILES) this.row('more', `+${list.length - MAX_TILES}`, tiles);
    this.cards.render(this.body, all);
  }

  // ---- One unit, animal, monster, engine, loot or node ----

  private unitSig(t: Selectable): string {
    const id = entityIdOf(t.key);
    const u = id === null ? null : this.a.game.unit(id);
    if (!u) return '';
    const bag = this.a.game.info?.bags.find(([x]) => x === u.id)?.[1] ?? [];
    return [u.kind, u.troop, u.wTier, u.aTier, u.rank, u.upLine, u.upTo, u.mount, u.carryRes, u.carryAmt, u.spells, u.meal > 0, u.crew, bag.map(([r, n]) => `${r}x${n}`).join('.')].join('/');
  }

  private oneThing(t: Selectable): void {
    const id = entityIdOf(t.key);
    const u = id === null ? null : this.a.game.unit(id);
    if (t.kind === 'unit') this.titleBars(t, undefined, u);
    this.ownerTag(t.owner);
    if (u && (u.kind === UnitKind.Warrior || u.kind === UnitKind.Worker || u.kind === UnitKind.Mage) && !u.group) {
      this.unitBody(t, u);
      return;
    }
    if (u && u.kind === UnitKind.Engine) this.engine(t, u);
    else if (u && u.kind === UnitKind.Animal) this.animal(t, u);
    else if (t.typeKey === 'loot') this.lootPile(t);
    else this.notes(t, t.details ?? []);
  }

  /** A worker's, troop's or mage's kit slots, then what applies now, then a word for what it is doing. */
  private unitBody(t: Selectable, u: UnitInfo): void {
    const row = this.strip('kit');
    const slots = this.kitSlots(u);
    slots.forEach((s, k) => {
      const btn = this.chip(`slot${k}`, { icon: layer(s.pic, s.tag), name: s.name, description: s.text, className: 'kit-slot' }, row);
      if (s.line >= 0 && u.upLine - 1 === s.line) {
        const piece = linePiece({ kind: u.kind === UnitKind.Worker ? 'worker' : u.kind === UnitKind.Mage ? 'mage' : 'warrior', troop: u.troop, w: u.wTier, a: u.aTier }, s.line, u.upTo);
        const unit = u.id;
        const bar = document.createElement('span');
        bar.className = 'up-bar';
        const fill = document.createElement('span');
        bar.append(fill);
        btn.el.append(bar);
        btn.el.classList.add('upgrading');
        this.live.push({
          fill,
          num: null,
          btn,
          read: () => {
            const v = this.a.game.unit(unit);
            if (!v || v.upLine === 0) return null;
            const pct = Math.floor(v.upDone / 10);
            return { pct, text: '', tip: `${s.text}\nUpgrading to ${piece?.name ?? 'the next tier'}: ${v.upDone > 0 ? `${pct}%` : 'on the way'}.` };
          },
        });
      }
    });
    const gap = document.createElement('span');
    gap.className = 'kit-gap';
    row.append(gap);
    // Loot in the bag (own units), a worker's load, the next meal, the spells on it.
    const bag = this.a.game.info?.bags.find(([x]) => x === u.id)?.[1] ?? [];
    if (bag.length > 0) this.chip('loot', { icon: pic('icon_status_carrying'), name: 'Loot', description: `${itemsText(bag)}.`, className: 'count' }, row).el.append(tag(String(bag.reduce((n, [, c]) => n + c, 0))));
    if (u.kind === UnitKind.Worker && u.carryAmt > 0 && RESOURCES[u.carryRes]) {
      const g = goodIcon(u.carryRes);
      const c = this.chip('carry', { icon: g ? layer(g.tint ? { file: g.file, filter: g.tint } : { file: g.file }) : pic('icon_status_carrying'), name: 'Carrying', description: `Carrying ${itemsText([[u.carryRes, u.carryAmt]])}.`, className: 'count' }, row);
      c.el.append(tag(String(u.carryAmt)));
    }
    if (this.a.hunger(t)) {
      const meal = this.chip('meal', { icon: pic('icon_status_hungry'), name: 'Hunger', description: '', className: 'meal' }, row);
      const bar = document.createElement('span');
      bar.className = 'meal-bar';
      const fill = document.createElement('span');
      bar.append(fill);
      meal.el.append(bar);
      this.live.push({
        fill,
        num: null,
        btn: meal,
        read: () => {
          const v = this.a.hunger(t);
          if (!v) return null;
          const line = hungerLine(v);
          const starving = line.status !== '';
          meal.el.classList.toggle('starving', starving);
          const img = meal.el.querySelector<HTMLImageElement>('.btn-icon img');
          const want = starving ? 'icon_status_starving' : 'icon_status_hungry';
          if (img && !img.src.includes(want)) meal.redefine({ ...meal.def, icon: pic(want) });
          return { pct: line.pct, text: '', tip: [line.next, line.status].filter((x) => x).join('\n') };
        },
      });
    }
    for (const [bit, file, name] of SPELL_PICS) {
      if ((u.spells & bit) === 0) continue;
      this.chip(`spell${bit}`, { icon: pic(file), name, description: `${name}: a mage's spell is on it.`, className: 'spell' }, row);
    }
    if (u.owner === this.a.player) {
      const q = this.a.game.queues.get(u.id) ?? [];
      this.row('doing', `${unitOrderText(q[0])}${q.length > 1 ? ` +${q.length - 1}` : ''}`);
    }
  }

  /** The kit a unit wears, slot by slot: picture, tier number, name and numbers. */
  private kitSlots(u: UnitInfo): Array<{ pic: Pic; tag?: string; name: string; text: string; line: number }> {
    const named = (p: Piece | undefined, tier: number, what: string): { name: string; text: string } =>
      p && (tier > 0 || what === 'weapon') ? { name: `${p.name}, tier ${tier}`, text: pieceStats(p) } : { name: `No ${what}`, text: `No ${what}.` };
    if (u.kind === UnitKind.Worker) {
      const k = TOOL_KITS[u.wTier];
      return [{ pic: toolPic(u.wTier), tag: String(u.wTier), ...named(k, u.wTier, 'tools'), line: 0 }];
    }
    if (u.kind === UnitKind.Mage) {
      return [
        { pic: wandPic(u.wTier), tag: String(u.wTier), ...named(WAND_KITS[u.wTier], u.wTier, 'wand'), line: 0 },
        { pic: robePic(u.aTier), tag: String(u.aTier), ...named(ROBE_KITS[u.aTier], u.aTier, 'robe'), line: 1 },
      ];
    }
    const out: Array<{ pic: Pic; tag?: string; name: string; text: string; line: number }> = [
      { pic: weaponPic(u.troop, u.wTier), tag: String(u.wTier), ...named(weaponPiece(u.troop, u.wTier), u.wTier, 'weapon'), line: 0 },
      { pic: armourPic(u.aTier), tag: String(u.aTier), ...named(ARMOUR_KITS[u.aTier], u.aTier, 'armour'), line: 1 },
    ];
    // Close melee's shield comes with the armour: no number of its own.
    if (u.troop === Troop.Close && u.aTier > 0) {
      const s = shieldRow(u.aTier);
      out.push({ pic: shieldPic(s.tier), name: s.name, text: `${pieceStats(s)}\nComes with the armour.`, line: -1 });
    }
    return out;
  }

  /** An engine: its crew as small crewmen, filled or empty, and how it moves, the sentences in the tooltip. */
  private engine(t: Selectable, u: UnitInfo): void {
    const spec = engineSpec(u.mob);
    const row = this.strip('facts');
    const crew = u.crew % 1000;
    const c = this.chip('crew', { face: '', name: `Crew ${crew} of ${spec.crew}`, description: (t.details ?? []).slice(1).join('\n'), className: 'crew' }, row);
    for (let k = 0; k < spec.crew; k++) {
      const img = document.createElement('img');
      img.src = kitUrl('icon_train_warrior_cannon_crew');
      img.alt = '';
      img.draggable = false;
      if (k >= crew) img.className = 'empty';
      c.el.append(img);
    }
    const hauled = u.crew >= 1000;
    const moves = hauled ? 'icon_train_horse' : crew >= spec.crew && spec.pushed > 0 ? 'icon_cmd_move' : '';
    if (moves) this.chip('moves', { icon: pic(moves), name: hauled ? 'Hauled' : 'Pushed', description: hauled ? 'Hauled by its animal, which stands in for its crew: it fires with none.' : 'Pushed by its crew.', className: 'spell' }, row);
    if (u.owner === this.a.player) {
      const q = this.a.game.queues.get(u.id) ?? [];
      this.row('doing', unitOrderText(q[0]));
    }
  }

  /** An animal: its name and health bar; a wild one a Tame or Hunt picture with the hint in its tooltip. */
  private animal(t: Selectable, u: UnitInfo): void {
    const spec = speciesSpec(u.mob);
    const lines = (t.details ?? []).slice(1);
    if (lines.length === 0) return;
    const row = this.strip('facts');
    const tame = spec.tameAt.length > 0 && t.owner === NOBODY;
    const hunt = t.owner === NOBODY && isGame(spec.id);
    const file = u.partner ? WORKER_ICON : tame ? 'icon_rope' : hunt ? 'icon_cmd_hunt' : '';
    this.chip('animal', { icon: pic(file), face: file ? '' : '?', name: u.partner ? 'Working' : tame ? 'Tame' : hunt ? 'Hunt' : t.label, description: lines.join('\n'), className: file ? 'spell' : 'notes' }, row);
  }

  /** Loot on the ground: the good's picture and the count, the sentences in the tooltip. */
  private lootPile(t: Selectable): void {
    const m = /^(.*) \((\d+)\)$/.exec(t.label);
    const res = m ? RESOURCES.findIndex((r) => r.name === m[1]) : -1;
    const row = this.strip('facts');
    const g = res >= 0 ? goodIcon(res) : undefined;
    const c = this.chip('pile', { icon: g ? layer({ file: g.file }) : undefined, face: g ? '' : '?', name: t.label, description: (t.details ?? []).join('\n'), className: 'count' }, row);
    if (m) c.el.append(tag(m[2]!));
  }

  // ---- Several ----

  private multi(list: readonly Selectable[], active: string | null): void {
    const groups = subgroups(list, this.a.worth);
    const tabs = document.createElement('div');
    tabs.className = 'sel-tabs';
    for (const g of groups) {
      const first = g.items[0]!;
      const army = g.typeKey === 'warrior';
      const file = army ? 'icon_util_select_army' : selectableIconFile(g.typeKey, this.a.look?.(first) ?? null);
      const t = this.button(`sub-${g.typeKey}`, {
        face: file ? String(g.items.length) : `${bareName(first.label)} ${g.items.length}`,
        icon: pic(file),
        name: army ? 'Troops' : bareName(first.label),
        keys: [],
        description: `${army ? `${armyMix(g.items)}.\n` : ''}Click: make this the active subgroup (its commands and portrait show; Tab and Shift + Tab step through the types). Double click: keep only these. Right click: remove them.`,
        className: 'sub-tab',
        onPress: () => this.a.activate(g.typeKey),
        onDoubleClick: () => this.a.keepType(g.typeKey),
        onRightClick: () => this.a.dropType(g.typeKey),
      });
      t.setLit(g.typeKey === active);
      tabs.append(t.el);
    }
    this.body.append(tabs);
    const grid = document.createElement('div');
    grid.className = 'sel-portraits';
    let shown = 0;
    for (const g of groups) {
      for (const t of g.items) {
        if (shown >= MAX_PORTRAITS) break;
        shown++;
        const icon = pic(selectableIconFile(t.typeKey, this.a.look?.(t) ?? null));
        const p = this.button(`pt-${t.key}`, {
          face: icon ? '' : glyph(t),
          icon,
          name: t.label,
          keys: [],
          description: `Click: select only this. Shift + click or right click: remove it. ${CTRL_NAME} + click: only this type. Double click: centre on it.`,
          className: `portrait${g.typeKey === active ? ' active' : ''}`,
          onPress: (pr) => this.a.portrait(t, pr),
          onDoubleClick: () => this.a.portraitDouble(t),
          onRightClick: () => this.a.portraitRight(t),
        });
        const bar = document.createElement('span');
        bar.className = 'hp';
        p.el.append(bar);
        this.bars.set(t.key, bar);
        if (t.typeKey.startsWith('mage:')) {
          const mana = document.createElement('span');
          mana.className = 'mana';
          p.el.append(mana);
          this.manaBars.set(t.key, mana);
        }
        grid.append(p.el);
      }
    }
    if (list.length > shown) {
      const more = document.createElement('span');
      more.className = 'sel-more';
      more.textContent = `+${list.length - shown}`;
      grid.append(more);
    }
    this.body.append(grid);
  }

  // ---- Every frame ----

  private update(list: readonly Selectable[], b: BuildingInfo | undefined): void {
    this.updateBars(list);
    if (b) this.updateHead(b);
    for (const l of this.live) {
      const v = l.read();
      const pct = v ? v.pct : 0;
      const w = `${pct}%`;
      if (l.fill.style.width !== w) l.fill.style.width = w;
      // The kit's health bar runs red to green along the whole bar: the fill shows the part up to the health left.
      const size = pct > 0 ? `${Math.round(10000 / pct)}% 100%` : '';
      if (l.fill.style.backgroundSize !== size) l.fill.style.backgroundSize = size;
      if (l.num && v && l.num.textContent !== v.text) l.num.textContent = v.text;
      if (v) l.fill.classList.toggle('low', v.low === true);
      if (l.btn && v && l.btn.def.description !== v.tip) l.btn.def = { ...l.btn.def, description: v.tip };
    }
  }

  /** The head of the queue counts down: its bar and its hover text follow the sim every refresh. */
  private updateHead(b: BuildingInfo): void {
    const h = this.head;
    const item = b.queue[0];
    if (!h || !item) return;
    const w = `${item.done / 10}%`;
    if (h.bar.style.width !== w) h.bar.style.width = w;
    const text = queueText(true, this.a.queueLeft?.(b) ?? null);
    if (h.btn.def.description !== text) h.btn.def = { ...h.btn.def, description: text };
  }

  private updateBars(list: readonly Selectable[]): void {
    for (const t of list) {
      const bar = this.bars.get(t.key);
      if (!bar) continue;
      const h = this.a.health(t);
      const pct = h && h[1] > 0 ? Math.max(0, Math.min(100, Math.round((h[0] * 100) / h[1]))) : 100;
      const w = `${pct}%`;
      if (bar.style.width !== w) bar.style.width = w;
      bar.classList.toggle('low', pct < 35);
      const manaBar = this.manaBars.get(t.key);
      const m = manaBar ? this.a.mana(t) : null;
      if (manaBar && m) {
        const mw = `${m[1] > 0 ? Math.max(0, Math.min(100, Math.round((m[0] * 100) / m[1]))) : 0}%`;
        if (manaBar.style.width !== mw) manaBar.style.width = mw;
      }
    }
  }
}
