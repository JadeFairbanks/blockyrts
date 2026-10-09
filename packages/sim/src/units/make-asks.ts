// The Workshop's offer (Patch 5, Jade's UI-8): "Make workshop put up
// actionable every 200-300 seconds for making an item from raw materials, if
// the player has any items it can make. Yes makes one copy/set of the item,
// no does not." Each player's Workshop asks in its bubble, with the same wait,
// Yes and No and cap of open questions as units/questions.ts; what it offers
// is the thing it can make now that the stock holds the fewest of (planks,
// leather, rope, sticks, a cart, a trinket, poison tips and the rest; never a
// scrap, which turns an item back into materials). The other half of UI-8, a
// greyed-out click on something short of a good the Workshop makes, is the
// Workshop's "Shall I make ...?" in units/greyed.ts.
//
// The wait between offers runs 200 to 300 s, the spread worked out from the
// Workshop's id and how many times it has asked (no random stream). Like the
// other questions, none of this is state: a loaded game waits afresh.

import { BuildingKind, QUEUE_LIMIT } from '../buildings/data.ts';
import { productProblem, queueProduct, usableBy } from '../buildings/production.ts';
import { RECIPES, type RecipeSpec } from '../buildings/recipes.ts';
import { RECIPE_PRODUCT, type Building } from '../buildings/store.ts';
import { costText } from '../economy/resources.ts';
import { STEPS_PER_SECOND } from '../fixed.ts';
import type { AnswerOrder } from '../orders.ts';
import { sayBuilding } from '../peoples/speech.ts';
import type { SimState } from '../state.ts';
import { answerKinds, askOwn, canAsk, isAsking } from './questions.ts';

/** The question (units/questions.ts Ask keeps 1 to 9, units/greyed.ts GreyAsk 10 to 15, night work 16, units/work-asks.ts 17 to 19). */
export const MakeAsk = {
  /** The Workshop can make something from the stock: make one? */
  Workshop: 30,
} as const;

/** The shortest wait between a Workshop's offers (Jade: "every 200-300 seconds"). */
export const MAKE_ASK_MIN_STEPS = 200 * STEPS_PER_SECOND;
/** The spread on top of it: up to 100 s more. */
const MAKE_ASK_SPREAD_S = 101;

/** Not state: when each Workshop (by building id) next offers, how many times it has, and the recipe it offers now. */
interface Next {
  at: number;
  asked: number;
  offer: number;
}
const books = new WeakMap<SimState, Map<number, Next>>();

function bookOf(state: SimState): Map<number, Next> {
  let b = books.get(state);
  if (!b) {
    b = new Map();
    books.set(state, b);
  }
  return b;
}

/** The wait before a Workshop's next offer: 200 s plus 0 to 100 s, from its id and its count of offers. */
function waitSteps(id: number, asked: number): number {
  return MAKE_ASK_MIN_STEPS + ((id * 37 + asked * 53) % MAKE_ASK_SPREAD_S) * STEPS_PER_SECOND;
}

/** What a Workshop offers to make: the recipe it can make now whose good the stock holds fewest of (table order on a tie), never a scrap; or undefined. */
export function workshopOffer(state: SimState, b: Building, player: number): RecipeSpec | undefined {
  const pool = state.players[player]!.pool;
  let best: RecipeSpec | undefined;
  let bestHave = 0;
  for (const r of RECIPES) {
    if (r.scrap !== undefined || !r.at.includes(b.kind) || r.outputs.length === 0) continue;
    if (productProblem(state, b, RECIPE_PRODUCT + r.id, player) !== '') continue;
    const have = pool[r.outputs[0]![0]]!;
    if (!best || have < bestHave) {
      best = r;
      bestHave = have;
    }
  }
  return best;
}

/** "planks", "4 sticks", "a hand cart": what a recipe makes, in a sentence. */
function makesText(r: RecipeSpec): string {
  const [res, n] = r.outputs[0]!;
  const one = costText([[res, n]]).replace(/^\d+ /, '');
  if (n > 1) return `${n} ${one}`;
  return /s$/.test(one) ? one : `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}`;
}

/** Once a second, each player's first finished Workshop may offer to make something, its wait over. */
export function updateMakeAsks(state: SimState): void {
  if (state.step % STEPS_PER_SECOND !== 0) return;
  const book = bookOf(state);
  for (let player = 0; player < state.players.length; player++) {
    const b = state.buildings.list.find((x) => x.owner === player && x.kind === BuildingKind.Workshop && x.complete && x.hp > 0);
    if (!b) continue;
    let next = book.get(b.id);
    if (!next) {
      next = { at: state.step + waitSteps(b.id, 0), asked: 0, offer: -1 };
      book.set(b.id, next);
    }
    if (state.step < next.at || !canAsk(state, player) || isAsking(state, b.id, true) || b.queue.length >= QUEUE_LIMIT) continue;
    const r = workshopOffer(state, b, player);
    // Nothing it can make: it looks again in a second, until there is.
    if (!r) continue;
    next.asked++;
    next.at = state.step + waitSteps(b.id, next.asked);
    next.offer = r.id;
    const what = makesText(r);
    const product = RECIPE_PRODUCT + r.id;
    askOwn(state, {
      player,
      who: b.id,
      building: true,
      q: MakeAsk.Workshop,
      units: [],
      text: `We have what it takes for ${what}. Shall I make ${r.outputs[0]![1] > 1 || /s$/.test(what) ? 'them' : 'one'}?`,
      yes: `The Workshop makes ${what}. From the stock: ${costText(r.inputs[0] ?? [])}.`,
      no: 'Nothing is made. It offers again in a few minutes.',
      holds: () => b.complete && b.hp > 0 && productProblem(state, b, product, player) === '',
    });
  }
}

answerKinds.set(MakeAsk.Workshop, (state: SimState, o: AnswerOrder) => {
  if (o.yes !== 1) return;
  const b = state.buildings.get(o.who);
  const id = bookOf(state).get(o.who)?.offer ?? -1;
  if (!b || id < 0 || !b.complete || !usableBy(state, b, o.player)) return;
  const why = queueProduct(state, b, RECIPE_PRODUCT + id, o.player);
  if (why) sayBuilding(state, b, why, true);
});
