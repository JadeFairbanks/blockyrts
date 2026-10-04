// Onboarding (Outside the match): no tutorial, only a short series of hints
// through the first day: select a worker, gather wood, build, light a torch,
// shelter at dusk. Each stays in a small box at the top of the screen until
// the player has done it; they can be turned off in Settings.
import { BuildingKind, clockAt, Period, Res } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { GameShell } from '../hud/shell.ts';
import type { Settings } from '../settings/settings.ts';

interface Hint {
  text: string;
  /** Whether the player has done it. */
  done(): boolean;
  /** Waits for this before showing (the dusk hint waits for dusk). */
  when?(): boolean;
}

export class FirstDayHints {
  private readonly box: HTMLElement;
  private hints: Hint[] = [];
  private at = -1;
  private wood = 0;
  private buildings = 0;

  constructor(
    private readonly shell: GameShell,
    private readonly game: GameInfo,
    private readonly settings: Settings,
  ) {
    this.box = document.createElement('div');
    this.box.className = 'hint-box';
    this.box.hidden = true;
    shell.layout.root.append(this.box);
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

  /** Starts the series (a new game; a loaded one has no hints). */
  start(): void {
    if (!this.settings.hints) return;
    const woodNow = (): number => this.game.have(Res.SoftwoodLumber) + this.game.have(Res.HardwoodLumber);
    this.wood = woodNow();
    this.buildings = this.own();
    this.hints = [
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
    this.at = 0;
    this.show();
  }

  private show(): void {
    const h = this.hints[this.at];
    this.box.hidden = !h || !this.settings.hints || (h.when !== undefined && !h.when());
    if (h) this.box.textContent = `Hint: ${h.text}`;
  }

  /** Each info update: move on when the player has done what the hint says. */
  update(): void {
    if (this.at < 0) return;
    if (!this.settings.hints) {
      this.at = -1;
      this.box.hidden = true;
      return;
    }
    // Dusk does not wait for the day's hints.
    if (this.period() === Period.Dusk) this.at = Math.max(this.at, this.hints.length - 1);
    while (this.at < this.hints.length && this.hints[this.at]!.done()) this.at++;
    if (this.at >= this.hints.length) {
      this.at = -1;
      this.box.hidden = true;
      this.shell.message('That was the last hint. Survive the night! Hints can be turned off or on in Settings.');
      return;
    }
    this.show();
  }
}
