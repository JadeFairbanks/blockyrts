// Control groups (Controls: Control groups and camera hotkeys): ten groups on
// 1 to 9 and 0. Group key (`) + number saves, Shift + number adds, group key +
// Shift + number steals, a number selects, twice quickly centres. Each group
// has a tab above the selection panel: left click selects, double click
// centres, right click saves, Shift + right click adds.
import type { ButtonRegistry, HudButton } from './buttons.ts';
import type { Selectable } from '../selection/types.ts';

export const GROUP_COUNT = 10;
/** Two presses of the same number within this time centre the camera. */
export const DOUBLE_TAP_MS = 300;

/** Group index (0..9) of a key: Digit1..Digit9 are 0..8, Digit0 is 9; -1 for anything else. */
export function groupOfKey(id: string): number {
  const m = /^Digit(\d)$/.exec(id);
  if (!m) return -1;
  const n = Number(m[1]);
  return n === 0 ? 9 : n - 1;
}

/** The pure part: lists of selectable keys. */
export class GroupStore {
  readonly groups: string[][] = Array.from({ length: GROUP_COUNT }, () => []);

  save(i: number, keys: readonly string[]): void {
    this.groups[i] = [...keys];
  }

  add(i: number, keys: readonly string[]): void {
    const g = this.groups[i]!;
    for (const k of keys) if (!g.includes(k)) g.push(k);
  }

  /** Save to one group and take those things out of every other group. */
  steal(i: number, keys: readonly string[]): void {
    const set = new Set(keys);
    for (let j = 0; j < GROUP_COUNT; j++) if (j !== i) this.groups[j] = this.groups[j]!.filter((k) => !set.has(k));
    this.save(i, keys);
  }

  /** Dead things drop out of their groups. */
  prune(exists: (key: string) => boolean): void {
    for (let j = 0; j < GROUP_COUNT; j++) this.groups[j] = this.groups[j]!.filter(exists);
  }
}

export interface GroupActions {
  selection(): readonly Selectable[];
  /** Fresh snapshots by key, or undefined for things that no longer exist. */
  lookup(key: string): Selectable | undefined;
  select(list: Selectable[]): void;
  centreOn(list: readonly Selectable[]): void;
  message(text: string): void;
}

export class ControlGroups {
  readonly store = new GroupStore();
  private readonly tabs: HudButton[] = [];
  private lastTap = { group: -1, t: 0 };

  constructor(
    row: HTMLElement,
    buttons: ButtonRegistry,
    private readonly a: GroupActions,
  ) {
    for (let i = 0; i < GROUP_COUNT; i++) {
      const label = String((i + 1) % 10);
      const b = buttons.add({
        id: `group${i}`,
        face: '',
        name: `Control group ${label}`,
        keys: [],
        badge: label,
        description: `Left click or ${label}: select the group; twice: centre on it. Right click or \` + ${label}: save the selection here. Shift + right click or Shift + ${label}: add to it. \` + Shift + ${label}: save and take them out of other groups.`,
        className: 'group-tab',
        onPress: () => this.recall(i),
        onDoubleClick: () => this.recall(i, true),
        onRightClick: (p) => (p.shift ? this.add(i) : this.save(i)),
      });
      row.append(b.el);
      this.tabs.push(b);
    }
    this.refresh();
  }

  private keys(): string[] {
    return this.a.selection().filter((t) => t.kind !== 'node').map((t) => t.key);
  }

  save(i: number): void {
    const keys = this.keys();
    if (keys.length === 0) return this.a.message('Select something first to save it to a group.');
    this.store.save(i, keys);
    this.refresh();
  }

  add(i: number): void {
    this.store.add(i, this.keys());
    this.refresh();
  }

  steal(i: number): void {
    const keys = this.keys();
    if (keys.length === 0) return;
    this.store.steal(i, keys);
    this.refresh();
  }

  /** Select a group; a second press within 0.3 s (or `centre`) also centres the camera on it. */
  recall(i: number, centre = false): void {
    const now = performance.now();
    const twice = this.lastTap.group === i && now - this.lastTap.t <= DOUBLE_TAP_MS;
    this.lastTap = { group: i, t: now };
    const list = this.store.groups[i]!.map((k) => this.a.lookup(k)).filter((t): t is Selectable => t !== undefined);
    if (list.length === 0) return;
    this.a.select(list);
    if (twice || centre) this.a.centreOn(list);
  }

  /** Called with each key press: digits with the group key, Shift or alone. True if it was a group key. */
  key(id: string, groupKeyHeld: boolean, shift: boolean): boolean {
    const i = groupOfKey(id);
    if (i < 0) return false;
    if (groupKeyHeld && shift) this.steal(i);
    else if (groupKeyHeld) this.save(i);
    else if (shift) this.add(i);
    else this.recall(i);
    return true;
  }

  /** Drops dead things and updates the tab counts. */
  refresh(exists?: (key: string) => boolean): void {
    if (exists) this.store.prune(exists);
    for (let i = 0; i < GROUP_COUNT; i++) {
      const n = this.store.groups[i]!.length;
      const t = this.tabs[i]!;
      t.setFace(n > 0 ? String(n) : '');
      t.el.classList.toggle('empty', n === 0);
    }
  }
}
