import { describe, expect, it } from 'vitest';
import { keyId, keyLabel, shouldBlockKey } from '../src/input/keys.ts';

const k = (code: string, key = '', mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  code,
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('key blocking', () => {
  it('blocks the keys the game uses', () => {
    for (const code of ['KeyA', 'Digit1', 'Backquote', 'F1', 'F5', 'F10', 'Backspace', 'Space', 'Tab', 'ArrowUp', 'PageDown', 'Home', 'Enter', 'Escape']) {
      expect(shouldBlockKey(k(code), false), code).toBe(true);
    }
    expect(shouldBlockKey(k('F5', 'F5', { ctrlKey: true }), false)).toBe(true);
  });
  it('leaves F11, F12 and browser shortcuts alone', () => {
    expect(shouldBlockKey(k('F11'), false)).toBe(false);
    expect(shouldBlockKey(k('F12'), false)).toBe(false);
    expect(shouldBlockKey(k('KeyC', 'c', { ctrlKey: true }), false)).toBe(false);
    expect(shouldBlockKey(k('Digit1', '1', { metaKey: true }), false)).toBe(false);
  });
  it('blocks nothing while a text field has focus', () => {
    expect(shouldBlockKey(k('Space'), true)).toBe(false);
    expect(shouldBlockKey(k('KeyA'), true)).toBe(false);
  });
});

describe('key names', () => {
  it('names letters by the character typed and the rest by position', () => {
    expect(keyId({ code: 'KeyM', key: 'm' })).toBe('KeyM');
    expect(keyId({ code: 'KeyM', key: 'M' })).toBe('KeyM');
    expect(keyId({ code: 'Semicolon', key: 'm' })).toBe('KeyM'); // AZERTY M
    expect(keyId({ code: 'Backquote', key: '²' })).toBe('Backquote');
    expect(keyId({ code: 'F5', key: 'F5' })).toBe('F5');
    expect(keyId({ code: 'NumpadEnter', key: 'Enter' })).toBe('Enter');
  });
  it('labels badges', () => {
    expect(keyLabel('KeyM')).toBe('M');
    expect(keyLabel('Backspace')).toBe('Bksp');
    expect(keyLabel('F10')).toBe('F10');
  });
});
