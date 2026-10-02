// The current selection: an ordered list of things, kept as fresh snapshots
// while they are near the view (a thing that leaves the candidates keeps its
// last snapshot).
import type { Selectable } from './types.ts';

export class SelectionSet {
  private items: Selectable[] = [];
  private readonly listeners: (() => void)[] = [];

  list(): readonly Selectable[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  has(key: string): boolean {
    return this.items.some((t) => t.key === key);
  }

  /** Replaces the selection; listeners hear about it only when the set of things changed. */
  set(list: readonly Selectable[]): void {
    const changed = list.length !== this.items.length || list.some((t, i) => t.key !== this.items[i]!.key);
    this.items = [...list];
    if (changed) for (const fn of this.listeners) fn();
  }

  clear(): void {
    this.set([]);
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Swaps in this frame's snapshots for things that are still among the candidates. */
  refresh(fresh: ReadonlyMap<string, Selectable>): void {
    for (let i = 0; i < this.items.length; i++) {
      const f = fresh.get(this.items[i]!.key);
      if (f) this.items[i] = f;
    }
  }

  /** Drops things that no longer exist. */
  retain(exists: (key: string) => boolean): void {
    const kept = this.items.filter((t) => exists(t.key));
    if (kept.length !== this.items.length) this.set(kept);
  }
}
