// The in-game menu (F10 or the Menu button): resume, full screen, the camera
// settings and quitting. While it is open the cursor lock is released and the
// page's own controls work with the real cursor.
import { IS_MAC } from '../input/platform.ts';
import { saveSettings, SPEED_MAX, SPEED_MIN, type Settings } from '../settings/settings.ts';

export interface MenuActions {
  resume(): void;
  quit(): void;
}

export class GameMenu {
  readonly el: HTMLElement;
  private open = false;

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

  get isOpen(): boolean {
    return this.open;
  }

  show(on: boolean): void {
    this.open = on;
    this.el.hidden = !on;
    if (!on && document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}
