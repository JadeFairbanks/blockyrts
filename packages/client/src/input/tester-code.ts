// The tester tools' key code (Patch 2, Jade): the debug readout and the
// tester buttons stay hidden until M N B V C X Z is typed in that order during
// a game, and typing it again hides them. Any other key or any click on the
// way starts the count again, so nobody opens them by accident. The keys keep
// their usual jobs while they are typed. Pure.

/** The letters, in order. */
export const TESTER_CODE = 'mnbvcxz';

/** Keys that only modify another (Shift, Ctrl and the like): pressing one alone is not typing. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'OS']);

export interface CodeKey {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export class KeyCode {
  private at = 0;

  constructor(private readonly code: string = TESTER_CODE) {}

  /** A key went down: true when it completes the code (and the count starts again). */
  key(e: CodeKey): boolean {
    // A held key repeating, or Shift on its own, is not a new key typed.
    if (e.repeat || MODIFIER_KEYS.has(e.key)) return false;
    const k = e.ctrlKey || e.metaKey || e.altKey ? '' : e.key.toLowerCase();
    if (k === this.code[this.at]) {
      this.at++;
      if (this.at < this.code.length) return false;
      this.at = 0;
      return true;
    }
    // Any other key cuts the run short; its own letter may begin a new one.
    this.at = k === this.code[0] ? 1 : 0;
    return false;
  }

  /** A click, or anything else that breaks the run. */
  reset(): void {
    this.at = 0;
  }
}
