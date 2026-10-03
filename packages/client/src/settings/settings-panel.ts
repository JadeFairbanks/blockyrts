// The settings screen (Outside the match: Settings): graphics quality,
// resolution scale, shadows, view distance, the three volumes, hotkeys, the
// camera sliders and the first-day hints. The same panel opens from the main
// menu and from the in-game menu; every change is saved at once.
import { ACTIONS, clashes, keyFor } from '../input/bindings.ts';
import { keyId, keyLabel } from '../input/keys.ts';
import { applyQuality, saveSettings, SCALE_MAX, SCALE_MIN, SPEED_MAX, SPEED_MIN, type Quality, type Settings, type ViewDistance } from './settings.ts';

/** Keys that cannot be bound to a command (they already do something everywhere). */
const RESERVED = new Set(['Escape', 'Enter', 'F10', 'F11', 'F12', 'Backquote', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

export interface SettingsPanelHooks {
  /** A hotkey was rebound: buttons show the new key. */
  keysChanged?(): void;
  /** Whether the panel is on screen (it listens for a key only then). */
  visible(): boolean;
}

export class SettingsPanel {
  readonly el: HTMLElement;
  /** The action waiting for its new key, or null. */
  private waiting: { action: string; button: HTMLButtonElement } | null = null;
  private readonly refreshers: Array<() => void> = [];

  constructor(
    private readonly settings: Settings,
    private readonly hooks: SettingsPanelHooks,
  ) {
    const el = document.createElement('div');
    el.className = 'settings-panel';
    this.el = el;
    const save = (): void => {
      saveSettings(settings);
      for (const r of this.refreshers) r();
    };

    const heading = (text: string): void => {
      const h = document.createElement('h3');
      h.textContent = text;
      el.append(h);
    };
    const row = (label: string, control: HTMLElement, after?: HTMLElement): HTMLElement => {
      const r = document.createElement('label');
      r.className = 'setting';
      const name = document.createElement('span');
      name.textContent = label;
      r.append(name, control);
      if (after) r.append(after);
      el.append(r);
      return r;
    };
    const slider = (label: string, min: number, max: number, stepBy: number, get: () => number, set: (v: number) => void, show: (v: number) => string): void => {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(stepBy);
      const out = document.createElement('output');
      const refresh = (): void => {
        input.value = String(get());
        out.textContent = show(get());
      };
      refresh();
      this.refreshers.push(refresh);
      input.addEventListener('input', () => {
        set(Number(input.value));
        out.textContent = show(get());
        save();
      });
      row(label, input, out);
    };
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, note: string): void => {
      const r = document.createElement('label');
      r.className = 'setting toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      const refresh = (): void => {
        input.checked = get();
      };
      refresh();
      this.refreshers.push(refresh);
      const name = document.createElement('span');
      name.textContent = label;
      const small = document.createElement('small');
      small.textContent = note;
      input.addEventListener('change', () => {
        set(input.checked);
        save();
      });
      r.append(input, name, small);
      el.append(r);
    };
    const choice = <T extends string>(label: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (v: T) => void): void => {
      const group = document.createElement('span');
      group.className = 'choice';
      const buttons: Array<[T, HTMLButtonElement]> = [];
      for (const [value, text] of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', () => {
          set(value);
          save();
        });
        buttons.push([value, b]);
        group.append(b);
      }
      const refresh = (): void => {
        for (const [v, b] of buttons) b.classList.toggle('lit', v === get());
      };
      refresh();
      this.refreshers.push(refresh);
      const r = document.createElement('div');
      r.className = 'setting';
      const name = document.createElement('span');
      name.textContent = label;
      r.append(name, group);
      el.append(r);
    };
    const percent = (v: number): string => `${Math.round(v * 100)}%`;

    heading('Graphics');
    choice<Quality>('Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => settings.quality, (q) => applyQuality(settings, q));
    slider('Resolution scale', SCALE_MIN, SCALE_MAX, 0.05, () => settings.resolutionScale, (v) => (settings.resolutionScale = v), percent);
    toggle('Shadows', () => settings.shadows, (v) => (settings.shadows = v), 'Sun and moon shadows; off is faster');
    choice<ViewDistance>('View distance', [['near', 'Near'], ['medium', 'Medium'], ['far', 'Far']], () => settings.viewDistance, (v) => (settings.viewDistance = v));

    heading('Sound');
    slider('Music', 0, 1, 0.05, () => settings.musicVolume, (v) => (settings.musicVolume = v), percent);
    slider('Effects', 0, 1, 0.05, () => settings.effectsVolume, (v) => (settings.effectsVolume = v), percent);
    slider('Voices', 0, 1, 0.05, () => settings.voiceVolume, (v) => (settings.voiceVolume = v), percent);

    heading('Camera');
    const x = (v: number): string => `${v.toFixed(2)}x`;
    slider('Edge pan speed', SPEED_MIN, SPEED_MAX, 0.05, () => settings.edgePanSpeed, (v) => (settings.edgePanSpeed = v), x);
    slider('Arrow key pan speed', SPEED_MIN, SPEED_MAX, 0.05, () => settings.arrowPanSpeed, (v) => (settings.arrowPanSpeed = v), x);
    slider('Zoom speed', SPEED_MIN, SPEED_MAX, 0.05, () => settings.zoomSpeed, (v) => (settings.zoomSpeed = v), x);
    toggle('Edge panning', () => settings.edgePan, (v) => (settings.edgePan = v), 'Pan when the cursor touches the edge of the window');
    toggle('Lock the cursor in the window', () => settings.cursorLock, (v) => (settings.cursorLock = v), 'So edge panning works next to a second monitor');

    heading('Help');
    toggle('First-day hints', () => settings.hints, (v) => (settings.hints = v), 'A few hints through the first day: select a worker, gather wood, build, light a torch, shelter at dusk');

    this.buildHotkeys();
  }

  /** Hotkeys: click one, then press the new key (Command card and hotkeys: all hotkeys can be rebound). */
  private buildHotkeys(): void {
    const settings = this.settings;
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
      this.hooks.keysChanged?.();
    });
    keys.append(reset);
    this.el.append(keys);
    show();
    // Grab the next key press while a hotkey waits, before the game sees it.
    window.addEventListener(
      'keydown',
      (e) => {
        const w = this.waiting;
        if (!w || !this.hooks.visible()) return;
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
            this.hooks.keysChanged?.();
          }
        }
        show();
      },
      { capture: true },
    );
  }

  /** True while a hotkey waits for its new key. */
  get capturing(): boolean {
    return this.waiting !== null;
  }

  /** Drops a pending key capture (the panel is closing). */
  stopCapture(): void {
    if (!this.waiting) return;
    this.waiting.button.classList.remove('waiting');
    this.waiting = null;
  }
}
