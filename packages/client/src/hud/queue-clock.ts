// How long the item a building is making still takes (patch notes 1: the
// queue's hover text reads "Complete in <seconds> seconds" and counts down as
// it goes). The sim sends the head item's steps left at its own pace with
// every info message (production.ts queueHead, the same numbers the step
// moves it by), so the countdown is the sim's time: it follows the hands at a
// workshop, stands still with a pause and goes on hold when nothing moves the
// item. Before Patch 2 the client guessed the pace from how fast the per
// mille bar moved; the bar's rounding made that guess swing, so the seconds
// jumped up and down (the Magi Sanctum's mages, most troops).
import { STEPS_PER_SECOND } from '@blockyrts/sim';

/** Seconds until the head item is done: its steps left when the sim last said, less the steps run since; null while it is on hold. */
export function queueSeconds(stepsLeft: number, since: number): number | null {
  if (stepsLeft <= 0) return null;
  return Math.max(0, stepsLeft - Math.max(0, since)) / STEPS_PER_SECOND;
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
