// What the stone circles bring as each period begins: at dusk, each player
// with a Bright Night tonight hears of it (SCA-6); as night falls the Moon
// Roses open where the night is bright, and at daybreak they shut (SCA-8);
// and an Ancient Seed's sapling that has grown its nights becomes a tree (SC-8).

import { Period } from '../clock.ts';
import type { SimState } from '../state.ts';
import { brightFor } from './bright.ts';
import { growPlanted, openRoses, shutRoses } from './trees.ts';

export function circlesAtPeriod(state: SimState, period: Period, night: number): void {
  if (period === Period.Night) openRoses(state, night);
  if (period === Period.Day) shutRoses(state);
  growPlanted(state);
  if (period !== Period.Dusk) return;
  for (let p = 0; p < state.players.length; p++) {
    if (state.players[p]!.out || !brightFor(state, p, night)) continue;
    state.events.push({ player: p, kind: 'alert', text: 'A Bright Night: a full, smiling moon is rising, and its light will lie over your lands until dawn.' });
  }
}
