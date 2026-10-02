// The day and night clock (Day and night: day 3 min, dusk 40 s, night 3 min,
// dawn 40 s). Everything follows from the step number and the list of blood
// nights so far, which last twice as long (6 min); a blood night is decided
// at its dusk, before its night begins, so the list never changes the past.
// A game starts at the beginning of day 1; the first night is night 0, and
// "nights survived" is the number of dawns reached.

import { DAWN_STEPS, DAY_STEPS, DUSK_STEPS, NIGHT_STEPS, CYCLE_STEPS } from './rules.ts';
import { floorDiv } from './fixed.ts';

export const Period = { Day: 0, Dusk: 1, Night: 2, Dawn: 3 } as const;
export type Period = (typeof Period)[keyof typeof Period];

export const PERIOD_NAMES = ['Day', 'Dusk', 'Night', 'Dawn'] as const;

/** Where each period starts within a cycle, in steps. */
const STARTS = [0, DAY_STEPS, DAY_STEPS + DUSK_STEPS, DAY_STEPS + DUSK_STEPS + NIGHT_STEPS] as const;
const LENGTHS = [DAY_STEPS, DUSK_STEPS, NIGHT_STEPS, DAWN_STEPS] as const;

export interface Clock {
  period: Period;
  /** The cycle number from 0; the day shown is cycle + 1 and the night is cycle. */
  cycle: number;
  /** Steps into the current period, and steps left in it. */
  into: number;
  left: number;
}

/** No blood nights. */
export const NO_BLOOD: readonly number[] = [];

/**
 * The clock at a step. `blood` lists the nights (cycles, ascending) that were
 * or are blood nights: each one's night runs NIGHT_STEPS longer, and every
 * later period starts that much later.
 */
export function clockAt(step: number, blood: readonly number[] = NO_BLOOD): Clock {
  let shift = 0;
  for (const b of blood) {
    const nightStart = b * CYCLE_STEPS + STARTS[2] + shift;
    if (step < nightStart + NIGHT_STEPS) break;
    if (step < nightStart + 2 * NIGHT_STEPS) return { period: Period.Night, cycle: b, into: step - nightStart, left: nightStart + 2 * NIGHT_STEPS - step };
    shift += NIGHT_STEPS;
  }
  const c = plainClock(step - shift);
  if (c.period === Period.Night && blood.includes(c.cycle)) c.left += NIGHT_STEPS;
  return c;
}

/** The clock of a game: its step and its blood nights. */
export function clockOf(state: { step: number; blood: readonly number[] }): Clock {
  return clockAt(state.step, state.blood);
}

/** How long a night lasts in steps: twice as long on a blood night. */
export function nightLength(cycle: number, blood: readonly number[] = NO_BLOOD): number {
  return blood.includes(cycle) ? 2 * NIGHT_STEPS : NIGHT_STEPS;
}

function plainClock(step: number): Clock {
  const cycle = floorDiv(step, CYCLE_STEPS);
  const t = step - cycle * CYCLE_STEPS;
  let period: Period = Period.Dawn;
  if (t < STARTS[1]) period = Period.Day;
  else if (t < STARTS[2]) period = Period.Dusk;
  else if (t < STARTS[3]) period = Period.Night;
  const into = t - STARTS[period];
  return { period, cycle, into, left: LENGTHS[period] - into };
}

/** The period that begins exactly at this step, or -1 if the step is inside a period. */
export function periodStarting(step: number, blood: readonly number[] = NO_BLOOD): Period | -1 {
  const c = clockAt(step, blood);
  return c.into === 0 ? c.period : -1;
}

/** The alert each period opens with (Day and night; the message panel). */
export function periodMessage(c: Clock): string {
  switch (c.period) {
    case Period.Day:
      return c.cycle === 0 ? 'Day 1. Gather, build and explore while the sun is up.' : `Day ${c.cycle + 1}. You survived night ${c.cycle - 1}.`;
    case Period.Dusk:
      return 'Night is falling. Get everyone home.';
    case Period.Night:
      return `Night ${c.cycle} has begun.`;
    case Period.Dawn:
      return 'Dawn is breaking.';
  }
}

/** Whether it is dark (dusk and night), when lights matter and farmers go in. */
export function isDark(step: number, blood: readonly number[] = NO_BLOOD): boolean {
  const p = clockAt(step, blood).period;
  return p === Period.Dusk || p === Period.Night;
}
