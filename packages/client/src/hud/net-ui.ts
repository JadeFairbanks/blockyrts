// What the match shows about the other players' connections (Saving and
// disconnects): the pause banner ("Jade paused the game", "Waiting for Sam",
// a few seconds of "Sam resumed the game"), the
// host's choice when a player has been gone 30 seconds, and the notice when
// the game closes. The banner and the choice are HUD panels with HUD
// buttons, so they work with the cursor locked.
import type { ButtonRegistry } from './buttons.ts';
import type { HudPanels } from './panels.ts';
import { gameScroll } from './game-scroll.ts';

/** How long a stall lasts before the banner names who the game waits for (technical decision 3: after 1 s). */
export const WAITING_NOTICE_MS = 1000;
/** How long a passing notice ("Sam resumed the game.") stays on the banner, ms (s). */
export const NOTICE_MS = 4000;

export interface ChoiceOption {
  face: string;
  description: string;
  primary?: boolean;
  danger?: boolean;
  run(): void;
}

export class NetUi {
  private readonly banner: HTMLElement;
  private readonly bannerText: HTMLElement;
  private readonly bannerButtons: HTMLElement;
  private readonly choice: HTMLElement;
  private choiceIds: string[] = [];
  private bannerIds: string[] = [];
  private pauseText = '';
  private waitText = '';
  private waitTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeText = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private resume: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    panels: HudPanels,
    private readonly buttons: ButtonRegistry,
  ) {
    this.banner = document.createElement('div');
    this.banner.className = 'panel net-banner';
    this.banner.hidden = true;
    this.bannerText = document.createElement('span');
    this.bannerText.className = 'net-banner-text';
    this.bannerButtons = document.createElement('span');
    this.banner.append(this.bannerText, this.bannerButtons);
    root.append(this.banner);
    panels.register('net-banner', this.banner);
    this.choice = document.createElement('div');
    this.choice.className = 'panel host-choice';
    this.choice.hidden = true;
    gameScroll(this.choice);
    root.append(this.choice);
    panels.register('host-choice', this.choice);
  }

  /** The game is paused (text says by whom), or not (null); `resume` puts a Resume button on the banner. */
  setPaused(text: string | null, resume: (() => void) | null = null): void {
    this.pauseText = text ?? '';
    this.resume = text ? resume : null;
    if (text) this.notice(null);
    this.draw();
  }

  /** A passing notice for a few seconds when nothing else is on the banner ("Sam resumed the game."); null clears it. */
  notice(text: string | null): void {
    clearTimeout(this.noticeTimer);
    this.noticeText = text ?? '';
    if (text) {
      this.noticeTimer = setTimeout(() => {
        this.noticeText = '';
        this.draw();
      }, NOTICE_MS);
    }
    this.draw();
  }

  /** The game waits for these players' frames; the banner names them once the wait passes a second. */
  setWaiting(names: string[]): void {
    clearTimeout(this.waitTimer);
    if (names.length === 0) {
      this.waitText = '';
      this.draw();
      return;
    }
    const text = `Waiting for ${names.join(' and ')}…`;
    this.waitTimer = setTimeout(() => {
      this.waitText = text;
      this.draw();
    }, WAITING_NOTICE_MS);
  }

  private draw(): void {
    const text = this.pauseText || this.waitText || this.noticeText;
    this.banner.hidden = text === '';
    this.bannerText.textContent = text;
    for (const id of this.bannerIds) this.buttons.remove(id);
    this.bannerIds = [];
    const resume = this.resume;
    if (this.pauseText && resume) {
      const b = this.buttons.add({ id: 'net-resume', face: 'Resume', name: 'Resume', keys: [], description: 'Resume the game for every player.', className: 'dlg-btn primary', onPress: () => resume() });
      this.bannerIds.push('net-resume');
      this.bannerButtons.replaceChildren(b.el);
    } else this.bannerButtons.replaceChildren();
  }

  /** A choice for the player (the host's, when someone has been gone 30 s); null closes it. */
  ask(title: string | null, note = '', options: ChoiceOption[] = []): void {
    for (const id of this.choiceIds) this.buttons.remove(id);
    this.choiceIds = [];
    this.choice.replaceChildren();
    this.choice.hidden = title === null;
    if (title === null) return;
    const h = document.createElement('h3');
    h.className = 'dlg-title';
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'dlg-note';
    p.textContent = note;
    const row = document.createElement('div');
    row.className = 'dlg-row';
    options.forEach((o, k) => {
      const id = `host-choice-${k}`;
      const b = this.buttons.add({
        id,
        face: o.face,
        name: o.face,
        keys: [],
        description: o.description,
        className: `dlg-btn${o.primary ? ' primary' : ''}${o.danger ? ' danger' : ''}`,
        onPress: () => {
          this.ask(null);
          o.run();
        },
      });
      this.choiceIds.push(id);
      row.append(b.el);
    });
    this.choice.append(h, p, row);
  }

  /** The game is over for this page (the room closed): a notice with the way back to the main menu. */
  closed(title: string, note: string, back: () => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const box = document.createElement('div');
    box.className = 'dialog';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = note;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.textContent = 'Back to the main menu';
    b.addEventListener('click', back);
    box.append(h, p, b);
    overlay.append(box);
    this.root.parentElement?.append(overlay);
  }
}
