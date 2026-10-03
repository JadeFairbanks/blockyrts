// Which keys the game claims (Controls > Browser requirements) and how a key
// event is named for bindings. Pure.

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Keys a menu or dialogue keeps for itself: Tab moves between its buttons, Enter and Space press the one in focus. */
export const MENU_KEYS = new Set(['Tab', 'Enter', 'NumpadEnter', 'Space']);

/** Keys blocked whatever the modifiers: they do something else in the browser otherwise. */
const BLOCK_CODES = new Set([
  'Backquote',
  'Backspace',
  'Space',
  'Tab',
  'Enter',
  'NumpadEnter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Pause',
]);

/**
 * Whether the game stops a key's normal browser job. Every key the game uses
 * is blocked while no text field has focus; F11 and F12 never are. Letters and
 * digits with Ctrl, Cmd or Alt are left to the browser (copy, find, tab
 * switching), since no game control uses those.
 */
export function shouldBlockKey(ev: KeyLike, textFieldFocused: boolean): boolean {
  if (textFieldFocused) return false;
  if (ev.code === 'F11' || ev.code === 'F12') return false;
  if (BLOCK_CODES.has(ev.code)) return true;
  if (/^(Key[A-Z]|Digit[0-9])$/.test(ev.code)) return !ev.ctrlKey && !ev.metaKey && !ev.altKey;
  return false;
}

/**
 * The binding name of a key: letters by the character they type (commands are
 * named after letters, so they follow the layout), as 'KeyM' style codes;
 * everything else, the group key included, by physical code.
 */
export function keyId(ev: Pick<KeyLike, 'key' | 'code'>): string {
  if (ev.key.length === 1 && /[a-z]/i.test(ev.key)) return `Key${ev.key.toUpperCase()}`;
  // The keypad's Enter opens and sends chat like the main one.
  if (ev.code === 'NumpadEnter') return 'Enter';
  return ev.code;
}

/** The label a hotkey badge shows for a binding name. */
export function keyLabel(id: string): string {
  if (/^Key[A-Z]$/.test(id)) return id.slice(3);
  if (/^Digit[0-9]$/.test(id)) return id.slice(5);
  const names: Record<string, string> = {
    Backspace: 'Bksp',
    Escape: 'Esc',
    Backquote: '`',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    ShiftLeft: 'Shift',
    Space: 'Space',
    Equal: '+',
    Minus: '−',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Enter: 'Enter',
  };
  return names[id] ?? id;
}
