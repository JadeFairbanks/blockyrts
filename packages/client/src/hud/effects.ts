// The bar on each spell's picture in the middle of the HUD (Jade's Patch 5,
// GP-34: "add a progress bar, visually inline with other progress bars for
// that type of icon"): the share of the spell's time still to run. The sim
// sends the steps left; the full length is the spell's own (Table 13), the
// shortest of those the time left fits in where two spells give the same
// mark (Heal and Mending bloom). Pure logic, no DOM.
import { HEX_STEPS, SPELLS, type SpellSpec } from '@blockyrts/sim';
import { SpellOn } from '../messages.ts';

const EFFECTS: ReadonlyArray<readonly [number, ReadonlyArray<SpellSpec['effect']>]> = [
  [SpellOn.Quicken, ['quicken']],
  [SpellOn.Fortify, ['fortify']],
  [SpellOn.Rally, ['rally']],
  [SpellOn.Warding, ['ward']],
  [SpellOn.Healing, ['heal', 'bloom']],
];

/** Each mark's spell lengths in steps, shortest first. */
const LENGTHS = new Map<number, number[]>(EFFECTS.map(([bit, kinds]) => [bit, [...new Set(SPELLS.filter((s) => kinds.includes(s.effect)).map((s) => s.steps))].sort((a, b) => a - b)]));
LENGTHS.set(SpellOn.Hexed, [HEX_STEPS]);

/** How full a spell's bar is, 0 to 100, from the steps it has left. */
export function effectPct(bit: number, left: number): number {
  if (left <= 0) return 0;
  const total = (LENGTHS.get(bit) ?? []).find((d) => d >= left) ?? left;
  return Math.max(0, Math.min(100, Math.round((left * 100) / total)));
}

/** "4 s left", for the picture's tooltip. */
export function effectLeftText(left: number, stepsPerSecond: number): string {
  return `${Math.max(1, Math.ceil(left / stepsPerSecond))} s left.`;
}
