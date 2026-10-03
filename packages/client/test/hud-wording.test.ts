// Patch notes 1: no "1 more minutes" anywhere, and informational speech
// stays a bubble (only lines that need the player reach the message panel).
import { describe, expect, it } from 'vitest';
import { count, oneIsSingular, speechToPanel } from '../src/hud/wording.ts';

describe('one is singular', () => {
  it('fixes the lines the sim and the client write', () => {
    expect(oneIsSingular('Lying fallow for 1 more minutes')).toBe('Lying fallow for 1 more minute');
    expect(oneIsSingular('Lying fallow for 2 more minutes')).toBe('Lying fallow for 2 more minutes');
    expect(oneIsSingular('0 of 1 workers inside')).toBe('0 of 1 worker inside');
    expect(oneIsSingular('1 of 2 farmers at work; 1 animals')).toBe('1 of 2 farmers at work; 1 animal');
    expect(oneIsSingular('Cost: 1 hardwood sticks, 1 eggs, 1 feathers, 1 potatoes')).toBe('Cost: 1 hardwood stick, 1 egg, 1 feather, 1 potato');
    expect(oneIsSingular('1 berries and 1 torches')).toBe('1 berry and 1 torch');
    expect(oneIsSingular('1 Rubies')).toBe('1 Ruby');
    expect(oneIsSingular('1 oxen')).toBe('1 ox');
  });

  it('leaves labels, other numbers and other words alone', () => {
    for (const line of [
      'Player 1 has left the game.',
      'Workers keep tier 1 tools.',
      'Needs a level 1 walls tech',
      'Night 1 monsters',
      '11 minutes',
      '21 seconds',
      '1.5 seconds',
      '0.1 minutes',
      '1 of the walls',
      '1 of 3 workers',
      'Train 1 more',
      'Speed ×1 minutes',
    ]) {
      expect(oneIsSingular(line), line).toBe(line);
    }
  });

  it('counts the client\'s own lines', () => {
    expect(count(1, 'wall')).toBe('1 wall');
    expect(count(3, 'wall')).toBe('3 walls');
    expect(count(0, 'berry')).toBe('0 berries');
  });
});

describe('speech in the message panel', () => {
  it('keeps an own unit\'s informational lines as bubbles and lets its alerts through', () => {
    expect(speechToPanel({ urgent: false }, 0, true)).toBe(false);
    expect(speechToPanel({}, 0, true)).toBe(false);
    expect(speechToPanel({ urgent: true }, 0, false)).toBe(true);
  });

  it('lets another people\'s lines through when said to the player, or important and heard', () => {
    expect(speechToPanel({ foreign: true, player: 1, important: false }, 1, false)).toBe(true);
    expect(speechToPanel({ foreign: true, player: -1, important: false }, 1, true)).toBe(false);
    expect(speechToPanel({ foreign: true, player: -1, important: true, near: 0b10 }, 1, false)).toBe(true);
    expect(speechToPanel({ foreign: true, player: -1, important: true, near: 0b01 }, 1, false)).toBe(false);
    expect(speechToPanel({ foreign: true, player: -1, important: true, near: 0 }, 1, true)).toBe(true);
  });
});
