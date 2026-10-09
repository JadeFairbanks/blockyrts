// What lies on a unit for a while (Jade's Patch 5 stone circles): a Satyr
// Trickster vanished (SCS-2), Touch of the Grave (SCB-2) and entangling
// roots (SCS-4). Kept in state.threats.marks, so a loaded game has them; the
// encounters (threats/encounters.ts) put them on and tick them. Apart from
// that module so the fighting code can ask about them without a loop of
// imports.

import type { SimState } from '../state.ts';

export const MarkKind = { Vanished: 0, Grave: 1, Roots: 2 } as const;
export type MarkKind = (typeof MarkKind)[keyof typeof MarkKind];

/** The index of a unit's mark of a kind (by entity id) in state.threats.marks, or -1. */
export function markOn(state: SimState, id: number, kind: MarkKind): number {
  const list = state.threats.marks;
  for (let k = 0; k < list.length; k++) if (list[k]!.id === id && list[k]!.kind === kind) return k;
  return -1;
}

/** Puts a mark on a unit until a step, or moves its end there if it has one. */
export function putMark(state: SimState, id: number, kind: MarkKind, until: number, from: number, next = 0): void {
  const k = markOn(state, id, kind);
  if (k >= 0) {
    const m = state.threats.marks[k]!;
    m.until = until;
    m.from = from;
    return;
  }
  state.threats.marks.push({ id, kind, until, from, next });
}

/** Takes a unit's mark of a kind off. */
export function dropMark(state: SimState, id: number, kind: MarkKind): void {
  const k = markOn(state, id, kind);
  if (k >= 0) state.threats.marks.splice(k, 1);
}
