// The selection panel (Controls: Selecting units and buildings): one thing's
// name and details, or a portrait for each thing grouped by type with a
// health bar under each, subgroup tabs with the active one bright, and for a
// building its production queue (click to cancel), the units inside (click to
// let one out), its workers and its rally route; at a farm, the harvest bar
// (farm-panel.ts); at a Barracks, the Stables
// or a main base, the troop panel (Troops and gear: Training troops): a
// picture button per troop type, weapon and armour tier dropdowns with icons,
// a Lock, and what the choice costs.
import { buildingSpec, kitName, productSpec, troopOf, Troop } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import { FarmBlock } from './farm-panel.ts';
import { armourIcon, autoIcon, setIcon, troopIcon, weaponIcon } from './icons.ts';
import { armourOptions, pickTier, troopChoice, troopCostText, troopName, troopWhy, weaponOptions, type TierOption } from './troops.ts';
import { CTRL_NAME } from '../input/platform.ts';
import { isOwn } from '../selection/rules.ts';
import { NOBODY, type Selectable } from '../selection/types.ts';
import type { ButtonPress, ButtonRegistry, HudButton } from './buttons.ts';
import { hungerLine, type HungerView } from './hunger.ts';

/** Most portraits shown at once; the rest are counted. */
const MAX_PORTRAITS = 40;

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
  /** The troop panel: the game it reads, training (Shift: 5), the Lock, and a pick that changes the card. */
  game: GameInfo;
  trainTroop(building: number, troop: number, count: number): void;
  lockTroop(building: number, troop: number, lock: number): void;
  troopsChanged(): void;
}

/** Fixed order of types in the panel, so the same army always looks the same. */
export function typeOrder(typeKey: string): number {
  if (typeKey === 'worker') return 0;
  if (typeKey === 'warrior') return 1;
  if (typeKey === 'mage:support') return 2;
  if (typeKey === 'mage:battle') return 3;
  if (typeKey.startsWith('building:')) return 100 + Number(typeKey.split(':')[1]);
  return 1000;
}

/** The selection split into subgroups by type, in the fixed order. */
export function subgroups(list: readonly Selectable[]): Array<{ typeKey: string; items: Selectable[] }> {
  const map = new Map<string, Selectable[]>();
  for (const t of list) {
    const g = map.get(t.typeKey);
    if (g) g.push(t);
    else map.set(t.typeKey, [t]);
  }
  return [...map].map(([typeKey, items]) => ({ typeKey, items })).sort((a, b) => typeOrder(a.typeKey) - typeOrder(b.typeKey) || (a.typeKey < b.typeKey ? -1 : 1));
}

function glyph(t: Selectable): string {
  if (t.typeKey === 'worker') return '⚒';
  if (t.typeKey === 'warrior') return '⚔';
  if (t.typeKey === 'mage:support') return '✚';
  if (t.typeKey === 'mage:battle') return '✦';
  if (t.kind === 'building') return '⌂';
  if (t.kind === 'node') return '♣';
  return '•';
}

function shortType(t: Selectable): string {
  return t.label.replace(/ \(.*\)$/, '');
}

function ownerText(owner: number, player: number): string {
  if (owner === player) return 'Yours';
  if (owner === NOBODY) return 'Nobody’s';
  return `Player ${owner + 1}`;
}

export class SelectionPanel {
  /** Buttons made for the panel, kept across redraws so a press in progress survives one. */
  private readonly dynamic = new Map<string, HudButton>();
  private used = new Set<string>();
  private sig = '';
  private readonly bars = new Map<string, HTMLElement>();
  private readonly manaBars = new Map<string, HTMLElement>();
  /** The single selection's hunger line (patch 1): the text, the bar's fill and the starving status, kept to update in place. */
  private hunger: { next: HTMLElement; fill: HTMLElement; status: HTMLElement } | null = null;
  /** An open tier dropdown of the troop panel. */
  private menu: { b: number; troop: number; line: 'w' | 'a' } | null = null;
  /** A farm's harvest bar, moved in place between redraws. */
  private farm: FarmBlock | null = null;

  constructor(
    private readonly title: HTMLElement,
    private readonly body: HTMLElement,
    private readonly buttons: ButtonRegistry,
    private readonly a: PanelActions,
  ) {}

  private clear(): void {
    this.used = new Set();
    this.bars.clear();
    this.manaBars.clear();
    this.farm = null;
    this.body.replaceChildren();
  }

  /** Drops the buttons the last redraw did not use. */
  private sweep(): void {
    for (const [id] of this.dynamic) {
      if (this.used.has(id)) continue;
      this.buttons.remove(id);
      this.dynamic.delete(id);
    }
  }

  private button(id: string, def: Omit<Parameters<ButtonRegistry['add']>[0], 'id'>): HudButton {
    this.used.add(id);
    const old = this.dynamic.get(id);
    if (old) {
      old.redefine({ id, ...def });
      for (const c of [...old.el.children]) if (c.classList.contains('hp')) c.remove();
      return old;
    }
    const b = this.buttons.add({ id, ...def });
    this.dynamic.set(id, b);
    return b;
  }

  private row(cls: string, text: string, parent: HTMLElement = this.body): HTMLElement {
    const d = document.createElement('div');
    d.className = `sel-row ${cls}`.trim();
    d.textContent = text;
    parent.append(d);
    return d;
  }

  /** Redraws when what is shown changed; otherwise only the health bars move. */
  render(list: readonly Selectable[], active: string | null, hints: string[]): void {
    const one = list.length === 1 ? list[0]! : null;
    const b = one ? this.a.building(one) : undefined;
    const sig = [
      list.map((t) => `${t.key}:${t.label}:${(t.details ?? []).join('|')}`).join(','),
      active,
      b ? `${b.queue.map((q) => `${q.product}`).join('.')}/${b.inside.join('.')}/${b.rally.length}/${b.assigned}/${b.working}/${b.farm ? Number(b.farm.grows) : ''}` : '',
      b && b.owner === this.a.player ? this.troopSig(b) : '',
      hints.join('|'),
    ].join('#');
    if (sig === this.sig) {
      this.updateBars(list);
      if (one) this.updateHunger(one);
      if (this.farm && b?.farm) this.farm.update(b.farm);
      return;
    }
    this.sig = sig;
    this.clear();
    if (list.length === 0) {
      this.setTitle('Nothing selected');
      for (const h of hints) this.row('hint', h);
    } else if (one) {
      this.setTitle(one.label);
      this.single(one, b);
    } else {
      this.setTitle(`${list.length} selected`);
      this.multi(list, active);
      this.updateBars(list);
    }
    this.sweep();
  }

  private setTitle(text: string): void {
    if (this.title.textContent !== text) this.title.textContent = text;
  }

  private single(t: Selectable, b: BuildingInfo | undefined): void {
    for (const d of t.details ?? []) this.row('', d);
    this.hunger = null;
    if (this.a.hunger(t)) {
      const box = this.row('hunger', '');
      const next = document.createElement('span');
      const bar = document.createElement('span');
      bar.className = 'hunger-bar';
      const fill = document.createElement('span');
      bar.append(fill);
      box.append(next, bar);
      this.hunger = { next, fill, status: this.row('hunger-status', '') };
      this.updateHunger(t);
    }
    if (b && b.owner === this.a.player) {
      const spec = buildingSpec(b.kind);
      if (b.queue.length > 0) {
        const q = document.createElement('div');
        q.className = 'sel-queue';
        this.row('label', 'Queue (click to cancel, refunded in full):');
        b.queue.forEach((item, k) => {
          const ps = productSpec(item.product);
          const t = troopOf(item.product);
          const name = t ? `${ps.name} (${kitName(t.troop, t.w, t.a).toLowerCase()})` : ps.name;
          const btn = this.button(`queue${k}`, {
            face: t ? '' : name.startsWith('Planks') ? 'P' : name.slice(0, 1),
            name: `${name}: cancel`,
            keys: [],
            description: k === 0 ? `In production: ${Math.floor(item.done / 10)}% done. Click to cancel; what it cost comes back.` : 'Waiting. Click to cancel; what it cost comes back.',
            className: 'portrait queue-item',
            onPress: () => this.a.cancelQueued(b.id, k),
          });
          if (t) setIcon(btn.el, troopIcon(t.troop, 20));
          if (k === 0) {
            const bar = document.createElement('span');
            bar.className = 'hp';
            bar.style.width = `${Math.floor(item.done / 10)}%`;
            btn.el.append(bar);
          }
          q.append(btn.el);
        });
        this.body.append(q);
      }
      // A farm's harvest under its queue, above the farmers sheltering inside at night.
      this.farmRows(b);
      if (b.complete && b.troops.length > 0) this.troopPanel(b);
      if (b.inside.length > 0) {
        this.row('label', `Inside (${b.inside.length}; click one to let it out):`);
        const q = document.createElement('div');
        q.className = 'sel-queue';
        for (const id of b.inside) {
          const btn = this.button(`inside${id}`, {
            face: '⚒',
            name: this.a.unitName(id),
            keys: [],
            description: 'Click to let this one out.',
            className: 'portrait',
            onPress: () => this.a.letOut(b.id, id),
          });
          q.append(btn.el);
        }
        this.body.append(q);
      }
      const workers = b.complete ? (spec.levels[b.level - 1]?.workers ?? 0) : 0;
      if (workers > 0) this.row('', `Workers: ${b.assigned} of ${workers} assigned (right-click it with workers to assign them).`);
      if (b.rally.length > 0) this.row('owner', `Rally route: ${b.rally.length} point${b.rally.length > 1 ? 's' : ''}.`);
    } else if (b) this.farmRows(b);
    this.row('owner', ownerText(t.owner, this.a.player));
    if (!isOwn(t, this.a.player)) this.row('hint', 'Not yours: you can look but not give orders.');
  }

  /** A farm's harvest bar, its line and its band line (farm-panel.ts). */
  private farmRows(b: BuildingInfo): void {
    if (!b.farm) return;
    this.farm = new FarmBlock(this.body);
    this.farm.update(b.farm);
  }

  /** What the troop panel shows, so it redraws when a choice, a Lock or what the pool pays for changes. */
  private troopSig(b: BuildingInfo): string {
    if (!b.complete || b.troops.length === 0) return '';
    const g = this.a.game;
    const m = this.menu && this.menu.b === b.id ? `${this.menu.troop}${this.menu.line}` : '';
    const rows = b.troops.map((t) => {
      const c = troopChoice(b, t.troop);
      const opts = [...weaponOptions(g, b, t.troop), ...armourOptions(g, b, t.troop)].map((o) => (o.why ? (o.short ? 's' : 'n') : 'y')).join('');
      return `${t.troop}:${c.w}.${c.a}.${t.lock}:${troopWhy(g, b, t.troop, c.w, c.a)}:${opts}`;
    });
    return `${m}|${b.horses}|${rows.join(';')}`;
  }

  /** The troop panel, or the open dropdown's list of tiers. */
  private troopPanel(b: BuildingInfo): void {
    const g = this.a.game;
    const menu = this.menu && this.menu.b === b.id && b.troops.some((t) => t.troop === this.menu!.troop) ? this.menu : null;
    if (menu) {
      this.tierMenu(b, menu.troop, menu.line);
      return;
    }
    this.row('label', b.troops.some((t) => t.troop === Troop.Cavalry) ? `Train cavalry (${b.horses} tamed horse${b.horses === 1 ? '' : 's'} in the stalls):` : 'Train troops (pick the kit, then click the picture; Shift: 5):');
    for (const t of b.troops) {
      const c = troopChoice(b, t.troop);
      const why = troopWhy(g, b, t.troop, c.w, c.a);
      const row = document.createElement('div');
      row.className = 'troop-row';
      const name = troopName(t.troop);
      const cost = troopCostText(b, t.troop, c.w, c.a);
      const pic = this.button(`troop-${t.troop}`, {
        face: '',
        name: `Train ${name.toLowerCase()}`,
        keys: [],
        description: `${kitName(t.troop, c.w, c.a)}. Cost: ${cost}. The kit is made here while it trains. Shift + click: 5.`,
        className: 'portrait troop-pic',
        onPress: (p) => this.a.trainTroop(b.id, t.troop, p.shift ? 5 : 1),
      });
      pic.setEnabled(why === '', why);
      setIcon(pic.el, troopIcon(t.troop));
      const weapons = weaponOptions(g, b, t.troop);
      const wName = weapons.find((o) => o.tier === c.w)?.name ?? '';
      const wBtn = this.button(`troopw-${t.troop}`, {
        face: `${c.w} ${shortKit(wName)}`,
        name: `${name}: weapon`,
        keys: [],
        description: `Weapon tier ${c.w}: ${wName}. Click to pick another tier.${weapons.length < 2 ? ' This type has only the one.' : ''}`,
        className: 'troop-pick',
        onPress: () => this.openMenu(b, t.troop, 'w'),
      });
      wBtn.setEnabled(weapons.length > 1 && t.lock === 0, t.lock ? 'Locked: unlock to change it.' : 'There is only the one.');
      setIcon(wBtn.el, weaponIcon(t.troop, c.w));
      const armours = armourOptions(g, b, t.troop);
      const aName = armours.find((o) => o.tier === c.a)?.name ?? '';
      const aBtn = this.button(`troopa-${t.troop}`, {
        face: `${c.a} ${shortKit(aName)}`,
        name: `${name}: armour`,
        keys: [],
        description: `Armour tier ${c.a}: ${aName}. Click to pick another tier.`,
        className: 'troop-pick',
        onPress: () => this.openMenu(b, t.troop, 'a'),
      });
      aBtn.setEnabled(t.lock === 0, 'Locked: unlock to change it.');
      setIcon(aBtn.el, armourIcon(c.a));
      const lock = this.button(`troopl-${t.troop}`, {
        face: t.lock ? 'Locked' : 'Lock',
        name: t.lock ? 'Unlock' : 'Lock this kit',
        keys: [],
        description: t.lock
          ? 'This building always trains this kit. Click to unlock: it goes back to the best the stock pays for.'
          : 'Keep this weapon and armour for this troop type at this building, even when the stock could pay for better or worse. Allies see it too.',
        className: 'troop-lock',
        onPress: () => this.a.lockTroop(b.id, t.troop, t.lock ? 0 : 1 + c.w * 10 + c.a),
      });
      lock.setLit(t.lock !== 0);
      row.append(pic.el, wBtn.el, aBtn.el, lock.el);
      this.body.append(row);
      const line = this.row(why ? 'troop-cost short' : 'troop-cost', `${name}: ${cost}${c.picked || t.lock ? '' : ' (best the stock pays for)'}${why ? `. ${why}` : ''}`);
      line.title = why;
    }
  }

  private openMenu(b: BuildingInfo, troop: number, line: 'w' | 'a'): void {
    this.menu = { b: b.id, troop, line };
    this.sig = '';
    this.a.troopsChanged();
  }

  private closeMenu(): void {
    this.menu = null;
    this.sig = '';
    this.a.troopsChanged();
  }

  /** A dropdown's tiers as buttons: Best affordable first, each tier with its icon, greyed with what it needs. */
  private tierMenu(b: BuildingInfo, troop: number, line: 'w' | 'a'): void {
    const g = this.a.game;
    const opts: TierOption[] = line === 'w' ? weaponOptions(g, b, troop) : armourOptions(g, b, troop);
    const c = troopChoice(b, troop);
    this.row('label', `${troopName(troop)}: pick the ${line === 'w' ? 'weapon' : 'armour'} (red: the stock is short of it now).`);
    const list = document.createElement('div');
    list.className = 'troop-menu';
    const auto = this.button('tier-auto', {
      face: 'Best affordable',
      name: 'Best affordable',
      keys: [],
      description: 'The best weapon the stock pays for, then the best armour with it. It changes as the stock does.',
      className: 'troop-opt',
      onPress: () => {
        pickTier(b, troop, line, null);
        this.closeMenu();
      },
    });
    auto.setLit(!c.picked);
    setIcon(auto.el, autoIcon());
    list.append(auto.el);
    for (const o of opts) {
      const btn = this.button(`tier-${o.tier}`, {
        face: `${o.tier} ${o.name}`,
        name: o.name,
        keys: [],
        description: `Tier ${o.tier}.${o.why ? ` ${o.why}` : ''}`,
        className: `troop-opt${o.short ? ' short' : ''}`,
        onPress: () => {
          pickTier(b, troop, line, o.tier);
          this.closeMenu();
        },
      });
      btn.setEnabled(o.why === '' || o.short, o.why);
      btn.setLit(c.picked && (line === 'w' ? c.w : c.a) === o.tier);
      setIcon(btn.el, line === 'w' ? weaponIcon(troop, o.tier) : armourIcon(o.tier));
      list.append(btn.el);
    }
    const back = this.button('tier-back', { face: 'Back', name: 'Back', keys: [], description: 'Close the list.', className: 'troop-opt', onPress: () => this.closeMenu() });
    list.append(back.el);
    this.body.append(list);
  }

  private multi(list: readonly Selectable[], active: string | null): void {
    const groups = subgroups(list);
    const tabs = document.createElement('div');
    tabs.className = 'sel-tabs';
    for (const g of groups) {
      const t = this.button(`sub-${g.typeKey}`, {
        face: `${shortType(g.items[0]!)} ${g.items.length}`,
        name: shortType(g.items[0]!),
        keys: [],
        description: 'Click: make this the active subgroup (its commands show on the card; Tab cycles). Double click: keep only these. Right click: remove them.',
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
        const p = this.button(`pt-${t.key}`, {
          face: glyph(t),
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
    this.body.append(grid);
    if (list.length > shown) this.row('owner', `and ${list.length - shown} more`);
  }

  /** The hunger line, every frame: the countdown moves without redrawing the panel. */
  private updateHunger(t: Selectable): void {
    const h = this.hunger;
    const v = h ? this.a.hunger(t) : null;
    if (!h || !v) return;
    const line = hungerLine(v);
    if (h.next.textContent !== line.next) h.next.textContent = line.next;
    const w = `${line.pct}%`;
    if (h.fill.style.width !== w) h.fill.style.width = w;
    if (h.status.textContent !== line.status) h.status.textContent = line.status;
    h.status.hidden = line.status === '';
    h.next.parentElement!.classList.toggle('starving', line.status !== '');
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

/** A kit name short enough for a dropdown button: "Recurve bow, iron arrowheads" to "Recurve bow (iron)". */
function shortKit(name: string): string {
  const m = /^(.*), (.*) arrowheads$/.exec(name);
  if (m) return `${m[1]} (${m[2]})`;
  return name.replace(/, .*$/, '');
}
