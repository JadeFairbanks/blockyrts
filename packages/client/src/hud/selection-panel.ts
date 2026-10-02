// The selection panel (Controls: Selecting units and buildings): one thing's
// name and details, or a portrait for each thing grouped by type with a
// health bar under each, subgroup tabs with the active one bright, and for a
// building its production queue (click to cancel), the units inside (click to
// let one out), its workers and its rally route.
import { buildingSpec, productSpec } from '@blockyrts/sim';
import type { BuildingInfo } from '../messages.ts';
import { isOwn } from '../selection/rules.ts';
import { NOBODY, type Selectable } from '../selection/types.ts';
import type { ButtonPress, ButtonRegistry, HudButton } from './buttons.ts';

/** Most portraits shown at once; the rest are counted. */
const MAX_PORTRAITS = 40;

export interface PanelActions {
  player: number;
  health(t: Selectable): [number, number] | null;
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
}

/** Fixed order of types in the panel, so the same army always looks the same. */
export function typeOrder(typeKey: string): number {
  if (typeKey === 'worker') return 0;
  if (typeKey === 'warrior') return 1;
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

  constructor(
    private readonly title: HTMLElement,
    private readonly body: HTMLElement,
    private readonly buttons: ButtonRegistry,
    private readonly a: PanelActions,
  ) {}

  private clear(): void {
    this.used = new Set();
    this.bars.clear();
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
      b ? `${b.queue.map((q) => `${q.product}`).join('.')}/${b.inside.join('.')}/${b.rally.length}/${b.assigned}/${b.working}` : '',
      hints.join('|'),
    ].join('#');
    if (sig === this.sig) {
      this.updateBars(list);
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
    if (b && b.owner === this.a.player) {
      const spec = buildingSpec(b.kind);
      if (b.queue.length > 0) {
        const q = document.createElement('div');
        q.className = 'sel-queue';
        this.row('label', 'Queue (click to cancel, refunded in full):');
        b.queue.forEach((item, k) => {
          const ps = productSpec(item.product);
          const name = ps.name;
          const btn = this.button(`queue${k}`, {
            face: name.startsWith('Planks') ? 'P' : name.startsWith('Refurbish') ? 'F' : name.slice(0, 1),
            name: `${name}: cancel`,
            keys: [],
            description: k === 0 ? `In production: ${Math.floor((item.done * 100) / ps.steps)}% done. Click to cancel; what it cost comes back.` : 'Waiting. Click to cancel; what it cost comes back.',
            className: 'portrait queue-item',
            onPress: () => this.a.cancelQueued(b.id, k),
          });
          if (k === 0) {
            const bar = document.createElement('span');
            bar.className = 'hp';
            bar.style.width = `${Math.floor((item.done * 100) / ps.steps)}%`;
            btn.el.append(bar);
          }
          q.append(btn.el);
        });
        this.body.append(q);
      }
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
    }
    this.row('owner', ownerText(t.owner, this.a.player));
    if (!isOwn(t, this.a.player)) this.row('hint', 'Not yours: you can look but not give orders.');
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
          description: 'Click: select only this. Shift + click or right click: remove it. Ctrl + click: only this type. Double click: centre on it.',
          className: `portrait${g.typeKey === active ? ' active' : ''}`,
          onPress: (pr) => this.a.portrait(t, pr),
          onDoubleClick: () => this.a.portraitDouble(t),
          onRightClick: () => this.a.portraitRight(t),
        });
        const bar = document.createElement('span');
        bar.className = 'hp';
        p.el.append(bar);
        this.bars.set(t.key, bar);
        grid.append(p.el);
      }
    }
    this.body.append(grid);
    if (list.length > shown) this.row('owner', `and ${list.length - shown} more`);
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
    }
  }
}
