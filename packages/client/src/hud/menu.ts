// The in-game menu (F10 or the Menu button): resume, full screen, the camera
// settings and quitting. While it is open the cursor lock is released and the
// page's own controls work with the real cursor.
import { ACTIONS, clashes, keyFor } from '../input/bindings.ts';
import { keyId, keyLabel } from '../input/keys.ts';
import { IS_MAC } from '../input/platform.ts';
import { saveSettings, SPEED_MAX, SPEED_MIN, type Settings } from '../settings/settings.ts';

export interface MenuActions {
  resume(): void;
  quit(): void;
  /** A hotkey was rebound: buttons show the new key. */
  keysChanged(): void;
}

/** Keys that cannot be bound to a command (they already do something everywhere). */
const RESERVED = new Set(['Escape', 'F10', 'F11', 'F12', 'Backquote', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

export class GameMenu {
  readonly el: HTMLElement;
  private open = false;
  /** The action waiting for its new key, or null. */
  private waiting: { action: string; button: HTMLButtonElement } | null = null;

  constructor(parent: HTMLElement, settings: Settings, actions: MenuActions) {
    this.el = document.createElement('div');
    this.el.className = 'overlay menu-overlay';
    this.el.hidden = true;
    const box = document.createElement('div');
    box.className = 'dialog menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Game menu');
    this.el.append(box);
    parent.append(this.el);

    const h = document.createElement('h2');
    h.textContent = 'Menu';
    box.append(h);

    const button = (text: string, onClick: () => void, cls = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      if (cls) b.className = cls;
      b.addEventListener('click', onClick);
      box.append(b);
      return b;
    };
    button('Resume', () => actions.resume(), 'primary');

    const fs = button('Full screen', () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    });
    const fsNote = document.createElement('p');
    fsNote.className = 'note';
    fsNote.textContent = IS_MAC ? 'or press Ctrl + Cmd + F' : 'or press F11';
    box.append(fsNote);
    document.addEventListener('fullscreenchange', () => {
      fs.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
    });

    const heading = document.createElement('h3');
    heading.textContent = 'Camera';
    box.append(heading);

    const slider = (label: string, key: 'edgePanSpeed' | 'arrowPanSpeed' | 'zoomSpeed'): void => {
      const row = document.createElement('label');
      row.className = 'setting';
      const name = document.createElement('span');
      name.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(SPEED_MIN);
      input.max = String(SPEED_MAX);
      input.step = '0.05';
      input.value = String(settings[key]);
      const out = document.createElement('output');
      const show = (): void => {
        out.textContent = `${settings[key].toFixed(2)}x`;
      };
      show();
      input.addEventListener('input', () => {
        settings[key] = Number(input.value);
        show();
        saveSettings(settings);
      });
      row.append(name, input, out);
      box.append(row);
    };
    const toggle = (label: string, key: 'edgePan' | 'cursorLock', note: string): void => {
      const row = document.createElement('label');
      row.className = 'setting toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[key];
      const name = document.createElement('span');
      name.textContent = label;
      const small = document.createElement('small');
      small.textContent = note;
      input.addEventListener('change', () => {
        settings[key] = input.checked;
        saveSettings(settings);
      });
      row.append(input, name, small);
      box.append(row);
    };
    slider('Edge pan speed', 'edgePanSpeed');
    slider('Arrow key pan speed', 'arrowPanSpeed');
    slider('Zoom speed', 'zoomSpeed');
    toggle('Edge panning', 'edgePan', 'Pan when the cursor touches the edge of the window');
    toggle('Lock the cursor in the window', 'cursorLock', 'So edge panning works next to a second monitor');

    // Hotkeys: click one, then press the new key (Command card and hotkeys: all hotkeys can be rebound).
    const keys = document.createElement('details');
    keys.className = 'hotkeys';
    const summary = document.createElement('summary');
    summary.textContent = 'Hotkeys';
    keys.append(summary);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'Click a key, then press the new one (Esc keeps the old one). Build menu keys follow the grid Q to B and stay as they are.';
    keys.append(note);
    const warn = document.createElement('p');
    warn.className = 'note warn';
    const keyButtons = new Map<string, HTMLButtonElement>();
    const show = (): void => {
      for (const [id, b] of keyButtons) b.textContent = keyLabel(keyFor(settings.keys, id));
    };
    let group = '';
    for (const a of ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        const g = document.createElement('div');
        g.className = 'hotkey-group';
        g.textContent = group;
        keys.append(g);
      }
      const row = document.createElement('div');
      row.className = 'setting hotkey';
      const name = document.createElement('span');
      name.textContent = a.name;
      const b = document.createElement('button');
      b.type = 'button';
      b.addEventListener('click', () => {
        if (this.waiting) this.waiting.button.classList.remove('waiting');
        this.waiting = { action: a.id, button: b };
        b.classList.add('waiting');
        b.textContent = 'Press a key';
        warn.textContent = '';
      });
      keyButtons.set(a.id, b);
      row.append(name, b);
      keys.append(row);
    }
    keys.append(warn);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset all hotkeys';
    reset.addEventListener('click', () => {
      settings.keys = {};
      saveSettings(settings);
      show();
      warn.textContent = '';
      actions.keysChanged();
    });
    keys.append(reset);
    box.append(keys);
    show();
    // Grab the next key press while a hotkey waits, before the game sees it.
    window.addEventListener(
      'keydown',
      (e) => {
        const w = this.waiting;
        if (!w || !this.open) return;
        e.preventDefault();
        e.stopPropagation();
        this.waiting = null;
        w.button.classList.remove('waiting');
        if (e.code !== 'Escape') {
          const id = keyId(e);
          if (RESERVED.has(e.code) || RESERVED.has(id)) warn.textContent = `${keyLabel(id)} cannot be used for a command.`;
          else {
            settings.keys[w.action] = id;
            saveSettings(settings);
            const c = clashes(settings.keys, w.action, id);
            warn.textContent = c.length > 0 ? `${keyLabel(id)} is also ${c.join(' and ')}.` : '';
            actions.keysChanged();
          }
        }
        show();
      },
      { capture: true },
    );

    const sep = document.createElement('hr');
    box.append(sep);
    button(
      'Quit to start',
      () => {
        if (window.confirm('Quit this game and go back to the start screen?')) actions.quit();
      },
      'danger',
    );
    const hint = document.createElement('p');
    hint.className = 'note';
    hint.textContent = 'F10 or Esc closes the menu.';
    box.append(hint);
  }

  /** True while a hotkey waits for its new key. */
  get capturing(): boolean {
    return this.waiting !== null;
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(on: boolean): void {
    this.open = on;
    if (!on && this.waiting) {
      this.waiting.button.classList.remove('waiting');
      this.waiting = null;
    }
    this.el.hidden = !on;
    if (!on && document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}
