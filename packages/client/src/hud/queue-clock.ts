// How long the item a building is making still takes (patch notes 1: the
// queue's hover text reads "Complete in <seconds> seconds" and counts down as
// it goes). The sim sends how far the head item is (per mille) with every
// info message; the pace is read off how fast that moves, in game steps, so
// it follows the hands at a workshop and stops with a pause. Before the pace
// is known, a guess from the product's own time stands in.
import { BuildingKind, cookSteps, needsHands, PLANK_STEPS, Product, productSpec, recipeSpec, RESEARCH_PRODUCT, STEPS_PER_SECOND } from '@blockyrts/sim';

/** No progress for this long while it was moving before: the item is on hold (no hands, the troops starving, no supply). */
export const STALL_STEPS = 3 * STEPS_PER_SECOND;

interface Track {
  product: number;
  /** The last change seen, and the step it was seen at. */
  done: number;
  at: number;
  /** Per mille per step, smoothed over the changes seen; 0 until two changes. */
  rate: number;
  changes: number;
}

export class QueueClock {
  private readonly tracks = new Map<number, Track>();

  /** Notes a building's head item at a step. */
  note(building: number, product: number, done: number, step: number): void {
    const t = this.tracks.get(building);
    if (!t || t.product !== product || done < t.done) {
      this.tracks.set(building, { product, done, at: step, rate: 0, changes: 0 });
      return;
    }
    if (done === t.done || step <= t.at) return;
    const inst = (done - t.done) / (step - t.at);
    // The first change only sets the baseline: the item may have been part way through a step when first seen.
    if (t.changes > 0) t.rate = t.rate > 0 ? t.rate * 0.6 + inst * 0.4 : inst;
    t.changes++;
    t.done = done;
    t.at = step;
  }

  /** Forgets buildings that make nothing now. */
  keep(buildings: ReadonlySet<number>): void {
    for (const id of this.tracks.keys()) if (!buildings.has(id)) this.tracks.delete(id);
  }

  /**
   * Seconds until the head item is done: from the pace seen, else from the
   * guess (steps for the whole item at this building, or null when it cannot
   * move now). Null while it is on hold.
   */
  secondsLeft(building: number, product: number, done: number, step: number, guessSteps: number | null): number | null {
    const t = this.tracks.get(building);
    if (t && t.product === product && t.rate > 0) {
      const since = Math.max(0, step - t.at);
      if (since > Math.max(STALL_STEPS, 3 / t.rate)) return null;
      // Counts down between changes too: the steps since the last one are already spent.
      return Math.max(0, ((1000 - Math.max(done, t.done)) / t.rate - since) / STEPS_PER_SECOND);
    }
    if (guessSteps === null || guessSteps <= 0) return null;
    return Math.max(0, (guessSteps * (1000 - done)) / 1000 / STEPS_PER_SECOND);
  }
}

/** A guess at the steps an item takes at a building, from its own time and the hands at work there; null when it cannot move now. */
export function guessSteps(product: number, kind: number, level: number, working: number): number | null {
  const ps = productSpec(product);
  if (product === Product.PlanksSoftwood || product === Product.PlanksHardwood) return working > 0 ? PLANK_STEPS / working : null;
  if (product < RESEARCH_PRODUCT) return ps.steps;
  if (ps.research !== undefined) {
    // Research loads four quarters a step at a lodge, five at a Scriptorium, six at a Grand Academy.
    return (ps.steps * 4) / (3 + Math.max(1, Math.min(3, level)));
  }
  if (ps.recipe !== undefined) {
    const r = recipeSpec(ps.recipe);
    const steps = r.cooked ? cookSteps(r, level) : r.steps;
    if (!needsHands(kind)) return steps;
    const hands = working * (kind === BuildingKind.Workshop && level >= 4 ? 2 : 1);
    return hands > 0 ? steps / hands : null;
  }
  return ps.steps;
}

/** "1 second", "12 seconds", "2 minutes 5 seconds": the time the queue's hover text reads. */
export function timeWords(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (s < 120) return unit(s, 'second');
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? unit(m, 'minute') : `${unit(m, 'minute')} ${unit(r, 'second')}`;
}

/** The hover text of an item in a building's queue (patch notes 1, word for word where it can be). */
export function queueText(head: boolean, seconds: number | null): string {
  if (!head) return 'Waiting in the queue. Click to cancel; full refund.';
  if (seconds === null) return 'On hold: nothing is working on it right now. Click to cancel; full refund.';
  return `Complete in ${timeWords(seconds)}. Click to cancel; full refund.`;
}
