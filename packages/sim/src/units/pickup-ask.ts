// The pickup prompt (Patch 7, plan section 7): "when a unit picks up a piece
// that fits it and beats what it has, it asks with a Yes/No bubble: 'Ooh, can
// I use this [item] I just found?' Yes swaps it in. No keeps it in the bag."
// A question of its own kind, asked through units/questions.ts, so it lives
// apart from units/handling.ts (which the unit behaviour loads before the
// questions are ready).

import { RESOURCES } from '../economy/resources.ts';
import type { AnswerOrder } from '../orders.ts';
import type { SimState } from '../state.ts';
import { orderEquipBag, wantsPiece } from './handling.ts';
import { bagCount, canLoot, lootHooks } from './loot.ts';
import { answerKinds, askOwn, canAsk, isAsking } from './questions.ts';

/** The pickup prompt's question kind (units/questions.ts kinds: 25 was free). */
export const PICKUP_ASK = 25;

/**
 * A unit of the player's that just put goods in its bag (picked up, a kill's
 * drop, or handed over with Give, `found` false) asks about the first of
 * them it wants (units/handling.ts wantsPiece): Yes puts it on where it
 * stands, as Equip from the bag; No leaves it in the bag. It asks only when
 * its player has room for another question and it is not asking already,
 * and the question goes when the piece leaves its bag.
 */
export function offerPickup(state: SimState, i: number, got: ReadonlyArray<readonly [number, number]>, found: boolean): void {
  const e = state.entities;
  const player = e.owner[i]!;
  const id = e.id[i]!;
  if (!canLoot(state, i) || !canAsk(state, player) || isAsking(state, id, false)) return;
  const res = got.find(([r, n]) => n > 0 && wantsPiece(state, i, r))?.[0];
  if (res === undefined) return;
  const name = (RESOURCES[res]?.name ?? 'item').toLowerCase();
  askOwn(state, {
    player,
    who: id,
    building: false,
    q: PICKUP_ASK,
    units: [id],
    res,
    text: found ? `Ooh, can I use this ${name} I just found?` : `Ooh, can I use this ${name}?`,
    yes: `It puts the ${name} on now; what it had goes into its bag.`,
    no: `It keeps the ${name} in its bag.`,
    holds: () => {
      const j = e.indexOf(id);
      return j >= 0 && e.hp[j]! > 0 && bagCount(state, j, res) > 0;
    },
  });
}

/** The pickup prompt answered: Yes puts the piece on where the unit stands (or it says why it no longer can); No leaves it in the bag. */
function answerPickup(state: SimState, o: AnswerOrder): void {
  if (o.yes !== 1) return;
  const e = state.entities;
  const i = e.indexOf(o.who);
  if (i < 0 || e.owner[i] !== o.player || o.res < 0) return;
  orderEquipBag(state, [i], o.res);
}

answerKinds.set(PICKUP_ASK, answerPickup);
lootHooks.picked = offerPickup;
