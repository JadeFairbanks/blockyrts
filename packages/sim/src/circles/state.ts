// What the stone circles keep in the game state. The circles themselves,
// their trilithons, chests and plants, are made from the seed (place.ts) and
// changed like any other prop; this is only what belongs to the players: the
// Goddess's blessing, the idols' nights, the Pan Flute's plays, which
// altars have lost their idol, and the Sweet Hawthornes planted and cut down.

import type { ByteReader, ByteWriter } from '../bytes.ts';

export interface CircleState {
  /** Per player: the first of their Bright Nights since the Goddess blessed them (one in ten from it, for the rest of the game), or -1. */
  blessed: number[];
  /** Per player: the night a Moon Goddess idol was last used for, or -1. */
  idolNight: number[];
  /** Per player: plays left on the Pan Flute in use; 0 starts a new flute at the next play. */
  flute: number[];
  /** Circles whose altar's idol was taken, sorted. */
  taken: number[];
  /** Chests something was taken from: pairs of (circle * 8 + chest number, the slots still filled, a bit each), sorted by the first. */
  chests: number[];
  /** Sweet Hawthornes grown from an Ancient Seed (SC-8): triples of (column x, column z, the step it was planted, or -1 once grown into a tree). */
  planted: number[];
  /** The stone circles' own Sweet Hawthornes that were cut down: pairs of (column x, column z). */
  felled: number[];
}

export function newCircles(players: number): CircleState {
  return { blessed: Array(players).fill(-1), idolNight: Array(players).fill(-1), flute: Array(players).fill(0), taken: [], chests: [], planted: [], felled: [] };
}

const LISTS = ['blessed', 'idolNight', 'flute', 'taken', 'chests', 'planted', 'felled'] as const;

export function writeCircles(w: ByteWriter, c: CircleState): void {
  for (const k of LISTS) {
    w.u32(c[k].length);
    for (const v of c[k]) w.i32(v);
  }
}

export function readCircles(r: ByteReader): CircleState {
  const read = (): number[] => {
    const n = r.u32();
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(r.i32());
    return out;
  };
  const blessed = read();
  const idolNight = read();
  const flute = read();
  const taken = read();
  const chests = read();
  const planted = read();
  const felled = read();
  return { blessed, idolNight, flute, taken, chests, planted, felled };
}

/** The circles' state as canonical text for diffing. */
export function circlesJson(c: CircleState): string {
  return JSON.stringify(LISTS.map((k) => c[k]));
}
