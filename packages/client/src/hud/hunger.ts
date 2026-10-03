// The hunger line of the selection panel (patch 1): for one selected unit
// that eats, the time to its next meal and what the meal is, and while it
// starves, for how long and what that does to it. Pure logic, no DOM; the
// selection panel draws it, for a single selection only.
import {
  foodAmountText,
  HEALTH_TICK_STEPS,
  healthPerTick,
  MEAL_STEPS,
  spanText,
  STARVE_HARM_AFTER_STEPS,
  STARVE_HARM_PER_MILLE,
  STARVING_SLOW_BP,
  STEPS_PER_SECOND,
} from '@blockyrts/sim';

export interface HungerView {
  /** Steps to the unit's next meal (1 to MEAL_STEPS). */
  left: number;
  /** Its meal, quarters of nutrition. */
  meal: number;
  /** Steps it has been starving, or 0 while fed. */
  since: number;
  maxHp: number;
}

export interface HungerLine {
  /** "Next meal in 1 minute 12 seconds (½ food)." */
  next: string;
  /** While starving: for how long and what it costs; else ''. */
  status: string;
  /** How far through the wait for the meal, per cent (the bar fills towards it). */
  pct: number;
}

/** "1 minute 12 seconds", "2 minutes", "45 seconds" for a span of steps, rounded up to the second, as the farm panel counts. */
export function countdownText(steps: number): string {
  const s = Math.ceil(Math.max(0, steps) / STEPS_PER_SECOND);
  const m = Math.floor(s / 60);
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s % 60 > 0 || m === 0) parts.push(`${s % 60} second${s % 60 === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function hungerLine(v: HungerView): HungerLine {
  const next = `Next meal in ${countdownText(v.left)} (${foodAmountText(v.meal)}).`;
  const pct = Math.max(0, Math.min(100, Math.round(((MEAL_STEPS - v.left) * 100) / MEAL_STEPS)));
  if (v.since <= 0) return { next, status: '', pct };
  const howLong = `Starving for ${spanText(v.since)}`;
  if (v.since < STARVE_HARM_AFTER_STEPS) {
    return { next, status: `${howLong}: ${STARVING_SLOW_BP / 100}% slower, no healing. Loses health in ${spanText(STARVE_HARM_AFTER_STEPS - v.since)}.`, pct };
  }
  const harm = healthPerTick(v.maxHp, STARVE_HARM_PER_MILLE);
  return { next, status: `${howLong}: ${STARVING_SLOW_BP / 100}% slower, losing ${harm} health every ${HEALTH_TICK_STEPS / STEPS_PER_SECOND} seconds.`, pct };
}
