import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, SPEED_MAX, SPEED_MIN } from '../src/settings/settings.ts';
import { MAX_SEED, parsePlayers, parseSeed, randomSeed, startFromUrl } from '../src/start/seed.ts';

describe('settings', () => {
  it('fills in defaults and clamps speeds', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ edgePanSpeed: 99, arrowPanSpeed: -1, zoomSpeed: 'fast', edgePan: false, cursorLock: 1 });
    expect(s).toEqual({ edgePanSpeed: SPEED_MAX, arrowPanSpeed: SPEED_MIN, zoomSpeed: 1, edgePan: false, cursorLock: true, keys: {} });
  });
});

describe('seeds', () => {
  it('accepts any whole number 0..4294967295', () => {
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed(' 42 ')).toBe(42);
    expect(parseSeed('4,294,967,295')).toBe(MAX_SEED);
    expect(parseSeed('4294967296')).toBeNull();
    expect(parseSeed('-1')).toBeNull();
    expect(parseSeed('1.5')).toBeNull();
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
  });
  it('rolls seeds in range', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999999)).toBe(MAX_SEED);
  });
  it('reads players 1 to 8', () => {
    expect(parsePlayers('1')).toBe(1);
    expect(parsePlayers('8')).toBe(8);
    expect(parsePlayers('9')).toBeNull();
    expect(parsePlayers('0')).toBeNull();
    expect(parsePlayers(null)).toBeNull();
  });
  it('skips the start screen with ?seed=N', () => {
    expect(startFromUrl('?seed=7&players=3')).toEqual({ seed: 7, players: 3 });
    expect(startFromUrl('?seed=7')).toEqual({ seed: 7, players: 1 });
    expect(startFromUrl('?seed=7&players=12')).toEqual({ seed: 7, players: 1 });
    expect(startFromUrl('?players=3')).toBeNull();
    expect(startFromUrl('?seed=x')).toBeNull();
  });
});
