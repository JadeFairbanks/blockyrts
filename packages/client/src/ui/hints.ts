// Onboarding (Outside the match): no tutorial, only a short series of tips
// through the first day: select a worker, gather wood, build, light a torch,
// shelter at dusk. Patch 2 (Jade): a tip is plain outlined text on the game,
// no frame and no background, at the top of the screen. Each goes by itself
// after 12 s of game time (the wait stands still while paused), and an X
// closes it sooner. The first X in a game asks "Turn tips off?": Yes ends the
// tips for this game; No (or no answer in 12 s) closes the tip, and every
// later X just closes its tip. The next tip waits until the player has done
// what the last one said. Settings' Tips switch keeps them off in every game.
import { BuildingKind, clockAt, Period, Res, STEPS_PER_SECOND } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { HudButton } from '../hud/buttons.ts';
import type { GameShell } from '../hud/shell.ts';
import { YesNoButtons } from '../hud/yes-no.ts';
import type { Settings } from '../settings/settings.ts';

/** How long a tip, or the question, shows: 12 s of game time (Jade). */
export const TIP_STEPS = 12 * STEPS_PER_SECOND;

interface Tip {
  text: string;
  /** Whether the player has done it. */
  done(): boolean;
  /** Waits for this before showing (the dusk tip waits for dusk). */
  when?(): boolean;
}

/** What the tip box shows: the current tip, the one question, or nothing. */
export type TipView = 'tip' | 'ask' | 'none';

/**
 * The tips' timing and the one question, apart from the page: fed the game
 * step, whether the current tip is done, whether it may show yet, and the X,
 * Yes and No presses. Pure.
 */
export class TipSeries {
  /** The tip the series is on, or -1 when the series is over (or never began). */
  at = -1;
  /** The step the current tip first showed, or -1 before it has. */
  private shownAt = -1;
  /** The current tip has gone: timed out, or closed with the X. */
  private closed = false;
  /** The one question has been asked this game. */
  private asked = false;
  /** The step the question began, or -1 when it is not up. */
  private askedAt = -1;
  /** Yes: no more tips this game. */
  ended = false;

  constructor(private readonly count: number) {}

  start(): void {
    this.at = 0;
    this.shownAt = -1;
    this.closed = false;
  }

  /** Moves on past tips done (skipping to `floor` first, the dusk tip at dusk); true when the last one has just been done. */
  advance(done: (k: number) => boolean, floor = 0): boolean {
    if (this.at < 0) return false;
    if (floor > this.at) this.next(floor);
    while (this.at < this.count && done(this.at)) this.next(this.at + 1);
    if (this.at < this.count) return false;
    this.at = -1;
    return true;
  }

  private next(k: number): void {
    this.at = k;
    this.shownAt = -1;
    this.closed = false;
  }

  /** What to show at this step; `ready` is false while the current tip waits for its moment (dusk). */
  view(step: number, ready: boolean): TipView {
    if (this.ended || this.at < 0) return 'none';
    if (this.askedAt >= 0) {
      // Unanswered for 12 s counts as No.
      if (step - this.askedAt < TIP_STEPS) return 'ask';
      this.askedAt = -1;
    }
    if (this.closed || !ready) return 'none';
    if (this.shownAt < 0) this.shownAt = step;
    if (step - this.shownAt >= TIP_STEPS) {
      this.closed = true;
      return 'none';
    }
    return 'tip';
  }

  /** The X: the first time in a game it asks "Turn tips off?", after that it only closes the tip. */
  close(step: number): void {
    this.closed = true;
    if (this.asked) return;
    this.asked = true;
    this.askedAt = step;
  }

  /** The answer to "Turn tips off?". */
  answer(yes: boolean): void {
    this.askedAt = -1;
    if (yes) this.ended = true;
  }
}

export class FirstDayHints {
  private readonly box: HTMLElement;
  private readonly text: HTMLElement;
  /** The buttons: the only part of a tip that takes clicks (a HUD panel of its own). */
  private readonly controls: HTMLElement;
  private readonly x: HudButton;
  private readonly yesNo: YesNoButtons;
  private tips: Tip[] = [];
  private series = new TipSeries(0);
  private wood = 0;
  private buildings = 0;
  private shown = '';

  constructor(
    private readonly shell: GameShell,
    private readonly game: GameInfo,
    private readonly settings: Settings,
  ) {
    this.box = document.createElement('div');
    this.box.className = 'tip-box';
    this.box.hidden = true;
    this.text = document.createElement('span');
    this.text.className = 'tip-text';
    this.controls = document.createElement('span');
    this.controls.className = 'tip-controls';
    this.x = shell.buttons.add({
      id: 'tip-close',
      face: '✕',
      name: 'Close the tip',
      keys: [],
      description: 'Closes this tip now. The first time, it asks whether to turn tips off for this game.',
      className: 'tip-btn',
      onPress: () => {
        this.series.close(this.game.step);
        this.show();
      },
    });
    // The question bubbles' Yes and No (round 3): the tick and the red cross.
    this.yesNo = new YesNoButtons(shell.buttons, shell.panels, {
      key: 'tips',
      yes: {
        name: 'Yes: turn tips off',
        description: 'No more tips for the rest of this game. The Tips switch in Settings turns them off for every game.',
        onPress: () => {
          this.series.answer(true);
          this.show();
          this.shell.message('Tips are off for the rest of this game.');
        },
      },
      no: {
        name: 'No: keep tips',
        description: 'Keeps the tips coming; from now on the ✕ just closes a tip.',
        onPress: () => {
          this.series.answer(false);
          this.show();
        },
      },
    });
    this.controls.append(this.x.el, this.yesNo.el);
    this.box.append(this.text, this.controls);
    shell.layout.root.append(this.box);
    shell.panels.register('tip', this.controls);
  }

  private own(kind?: number): number {
    let n = 0;
    for (const b of this.game.buildings.values()) if (b.owner === this.game.player && (kind === undefined || b.kind === kind)) n++;
    return n;
  }

  private period(): number {
    const info = this.game.info;
    return info ? clockAt(info.step, info.blood).period : Period.Day;
  }

  /** Starts the series (a new game; a loaded one has no tips). */
  start(): void {
    if (!this.settings.hints) return;
    const woodNow = (): number => this.game.have(Res.SoftwoodLumber) + this.game.have(Res.HardwoodLumber);
    this.wood = woodNow();
    this.buildings = this.own();
    this.tips = [
      {
        text: 'Select a worker: left click one, or drag a box round several.',
        done: () => this.shell.selection.list().some((t) => t.typeKey === 'worker' && t.owner === this.game.player),
      },
      { text: 'Gather wood: with workers selected, right click a tree. They carry it to the Big House.', done: () => woodNow() > this.wood },
      { text: 'Build: with a worker selected press B (or click Build on the card), pick a building and left click to place it.', done: () => this.own() > this.buildings },
      { text: 'Light a torch: build a Torch post (B, then Lights, then its key). Light claims land and keeps the night’s monsters back.', done: () => this.own(BuildingKind.TorchPost) > 0 },
      {
        text: 'Dusk: shelter for the night. Click Everyone Home (⇊, beside the minimap) to send your workers inside; warriors hold the walls.',
        when: () => this.period() === Period.Dusk,
        done: () => this.period() === Period.Night,
      },
    ];
    this.series = new TipSeries(this.tips.length);
    this.series.start();
    this.show();
  }

  private show(): void {
    const tip = this.tips[this.series.at];
    const off = !this.settings.hints;
    const v: TipView = off || !tip ? 'none' : this.series.view(this.game.step, tip.when === undefined || tip.when());
    const text = v === 'tip' ? `Tip: ${tip!.text}` : v === 'ask' ? 'Turn tips off?' : '';
    if (text === this.shown) return;
    this.shown = text;
    this.box.hidden = text === '';
    this.text.textContent = text;
    this.x.el.hidden = v !== 'tip';
    this.yesNo.el.hidden = v !== 'ask';
    this.shell.panels.measure();
  }

  /** Each info update: move on when the player has done what the tip says, and time the tip out. */
  update(): void {
    if (this.series.at < 0) return;
    if (!this.settings.hints || this.series.ended) {
      this.series.at = -1;
      this.show();
      return;
    }
    // Dusk does not wait for the day's tips.
    const floor = this.period() === Period.Dusk ? this.tips.length - 1 : 0;
    if (this.series.advance((k) => this.tips[k]!.done(), floor)) {
      this.show();
      this.shell.message('That was the last tip. Survive the night! Tips can be turned off or on in Settings.');
      return;
    }
    this.show();
  }
}
