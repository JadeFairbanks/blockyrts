// The in-game menu (F10 or the Menu button): pausing, saving, the settings,
// full screen, the world seed and leaving. While it is open the cursor lock
// is released and the page's own controls work with the real cursor.
//
// Pausing (Jade's patch notes 1): alone, the open menu is the pause, so it
// has no Pause or Resume button, only the ✕ that closes it. Online, opening
// it stops nothing; its one Pause button stops the game for every player and
// opens every player's menu, and then reads Resume.
import { IS_MAC } from '../input/platform.ts';
import { SettingsPanel } from '../settings/settings-panel.ts';
import type { Settings } from '../settings/settings.ts';
import { gameScroll } from './game-scroll.ts';

export interface MenuActions {
  /** Closes the menu (alone, the game carries on). */
  resume(): void;
  quit(): void;
  /** A hotkey was rebound: buttons show the new key. */
  keysChanged(): void;
  /** Saves to the player's account (a guest is offered one first). */
  save(): void;
  /** Hands the game to the browser as a .sac file. */
  download(): void;
  /** Online: pauses or resumes for every player. */
  togglePause(): void;
  /** Online: the player who holds the pause, or null while nobody does. */
  pausedBy(): string | null;
  /** Why saving is not possible here, or ''. */
  saveBlocked(): string;
}

export interface MenuInfo {
  seed: number;
  online: boolean;
  /** The room's invite code, online. */
  code?: string | undefined;
}

export class GameMenu {
  readonly el: HTMLElement;
  private open = false;
  private readonly settingsPanel: SettingsPanel;
  private readonly pauseBtn: HTMLButtonElement | null = null;
  private readonly pauseNote: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly saveNote: HTMLElement;

  constructor(parent: HTMLElement, settings: Settings, info: MenuInfo, private readonly actions: MenuActions) {
    this.el = document.createElement('div');
    this.el.className = 'overlay menu-overlay';
    this.el.hidden = true;
    const box = document.createElement('div');
    box.className = 'dialog menu';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Game menu');
    // The game's own scroll bar when the settings make it long (Patch 7, J-16).
    gameScroll(box);
    this.el.append(box);
    parent.append(this.el);

    const h = document.createElement('h2');
    h.textContent = 'Menu';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu-close';
    close.textContent = '✕';
    close.title = 'Close the menu (F10 or Esc)';
    close.setAttribute('aria-label', 'Close the menu');
    close.addEventListener('click', () => actions.resume());
    const head = document.createElement('div');
    head.className = 'menu-head';
    head.append(h, close);
    box.append(head);
    const seed = document.createElement('p');
    seed.className = 'note menu-seed';
    seed.textContent = `World seed ${info.seed}: type it in New game to play this world again.${info.code ? ` Invite code ${info.code}.` : ''}`;
    box.append(seed);

    const button = (text: string, onClick: () => void, cls = ''): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      if (cls) b.className = cls;
      b.addEventListener('click', onClick);
      box.append(b);
      return b;
    };
    const note = (text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = text;
      box.append(p);
      return p;
    };
    if (info.online) this.pauseBtn = button('Pause', () => actions.togglePause(), 'primary');
    this.pauseNote = note(info.online ? '' : 'The game is paused while this menu is open; closing it carries on.');
    this.pauseNote.classList.add('lead');
    this.saveBtn = button('Save game', () => actions.save());
    this.saveNote = note('');
    button('Download a save file', () => actions.download());
    note('A .sac file you can open again from Load game, on any computer.');

    const fs = button('Full screen', () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    });
    note(IS_MAC ? 'or press Ctrl + Cmd + F' : 'or press F11');
    document.addEventListener('fullscreenchange', () => {
      fs.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen';
    });

    const settingsBox = document.createElement('details');
    settingsBox.className = 'menu-settings';
    const summary = document.createElement('summary');
    summary.textContent = 'Settings';
    settingsBox.append(summary);
    this.settingsPanel = new SettingsPanel(settings, { keysChanged: () => actions.keysChanged(), visible: () => this.open });
    settingsBox.append(this.settingsPanel.el);
    box.append(settingsBox);

    const sep = document.createElement('hr');
    box.append(sep);
    const quitText = info.online ? 'Leave the game' : 'Quit to the main menu';
    button(
      quitText,
      () => {
        const ask = info.online
          ? 'Leave this game? Your people are shared out among the other players, and the game carries on without you.'
          : 'Quit to the main menu? Anything since your last save is lost.';
        if (window.confirm(ask)) actions.quit();
      },
      'danger',
    );
    note('F10 or Esc closes the menu.');
  }

  /** True while a hotkey waits for its new key. */
  get capturing(): boolean {
    return this.settingsPanel.capturing;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The pause and save buttons say what they would do now. */
  refresh(): void {
    if (this.pauseBtn) {
      const by = this.actions.pausedBy();
      this.pauseBtn.textContent = by === null ? 'Pause' : 'Resume';
      this.pauseNote.textContent =
        by === null
          ? 'The game carries on while this menu is open. Pause stops it for every player and opens their menus; anyone can resume.'
          : `${by} paused the game. Anyone can resume it, and everyone's menu closes.`;
    }
    const why = this.actions.saveBlocked();
    this.saveBtn.disabled = why !== '';
    this.saveNote.textContent = why || 'Saved to your account; a guest is offered an account first.';
  }

  show(on: boolean): void {
    this.open = on;
    if (!on) this.settingsPanel.stopCapture();
    else this.refresh();
    this.el.hidden = !on;
    if (!on && document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }
}
