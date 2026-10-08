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
    expect(oneIsSingular('Cost: 1 sticks, 1 eggs, 1 feathers, 1 potatoes')).toBe('Cost: 1 stick, 1 egg, 1 feather, 1 potato');
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

describe('speech in the message panel (Patch 2, What reaches chat)', () => {
  it('lets through only the urgent lines of the player\'s own units', () => {
    expect(speechToPanel({ player: 0, speaker: 5, urgent: true }, 0)).toBe(true);
    expect(speechToPanel({ player: 0, speaker: 5 }, 0)).toBe(false);
    expect(speechToPanel({ player: 0, speaker: 5, urgent: false }, 0)).toBe(false);
    expect(speechToPanel({ player: 0, speaker: 5, quiet: true }, 0)).toBe(false);
    // A building's urgent line ("No idle workers to repair them.").
    expect(speechToPanel({ player: 0, urgent: true }, 0)).toBe(true);
  });

  it('keeps out another player\'s units, a leaver\'s, questions and other peoples\' lines', () => {
    // Another player's unit, or one a leaver left behind (its player is the leaver).
    expect(speechToPanel({ player: 1, speaker: 5, urgent: true }, 0)).toBe(false);
    // Questions are bubbles with buttons, never chat.
    expect(speechToPanel({ kind: 'question', player: 0, speaker: 5, urgent: true }, 0)).toBe(false);
    // Another people's lines, said to the player or not: their bubble, and a trade or hire answer in its menu.
    expect(speechToPanel({ foreign: true, player: 0, speaker: 9 }, 0)).toBe(false);
    expect(speechToPanel({ foreign: true, player: 0, speaker: 9, urgent: true }, 0)).toBe(false);
    expect(speechToPanel({ foreign: true, player: -1, speaker: 9 }, 0)).toBe(false);
  });

  it('still lets through a people\'s line from afar, which has no one on the map to be a bubble', () => {
    expect(speechToPanel({ foreign: true, player: 0, speaker: 0 }, 0)).toBe(true);
    expect(speechToPanel({ foreign: true, player: 1, speaker: 0 }, 0)).toBe(false);
  });
});
