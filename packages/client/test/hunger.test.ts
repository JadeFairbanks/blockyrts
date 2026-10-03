// The selection panel's hunger line (patch 1): the countdown to one unit's
// next meal, and its starving, in words with the right plurals.
import { describe, expect, it } from 'vitest';
import { CYCLE_STEPS, MEAL_STEPS, STEPS_PER_SECOND } from '@blockyrts/sim';
import { countdownText, hungerLine } from '../src/hud/hunger.ts';

const s = (seconds: number): number => seconds * STEPS_PER_SECOND;

describe('hunger line', () => {
  it('counts down to the next meal and fills its bar towards it', () => {
    expect([s(72), s(5) - 3, s(60), s(121), s(1)].map(countdownText)).toEqual(['1 minute 12 seconds', '5 seconds', '1 minute', '2 minutes 1 second', '1 second']);
    const fed = hungerLine({ left: s(72), meal: 2, since: 0, maxHp: 100 });
    expect(fed.next).toBe('Next meal in 1 minute 12 seconds (½ food).');
    expect(fed.status).toBe('');
    expect(fed.pct).toBe(Math.round(((MEAL_STEPS - s(72)) * 100) / MEAL_STEPS));
    // A rider and its horse eat 1 food a meal.
    expect(hungerLine({ left: MEAL_STEPS, meal: 4, since: 0, maxHp: 100 }).next).toBe('Next meal in 1 minute 50 seconds (1 food).');
  });

  it('says how long a unit has starved and what it costs, with the right plurals', () => {
    expect(hungerLine({ left: s(30), meal: 2, since: s(60), maxHp: 100 }).status).toBe('Starving for 1 minute: 20% slower, no healing. Loses health in 21 minutes.');
    expect(hungerLine({ left: s(30), meal: 2, since: 3 * CYCLE_STEPS - s(1), maxHp: 100 }).status).toBe('Starving for 21 minutes: 20% slower, no healing. Loses health in 1 second.');
    expect(hungerLine({ left: s(30), meal: 2, since: 3 * CYCLE_STEPS + s(90), maxHp: 160 }).status).toBe(
      'Starving for 23 minutes: 20% slower, losing 3 health every 15 seconds.',
    );
  });
});
