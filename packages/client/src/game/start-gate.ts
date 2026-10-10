// When a match begins behind the loading screen (mini patch 7.3, Jade: "if
// one player finishes loading first then the game doesn't start until all
// players are loaded"). A page starts its sim only once its own loading is
// done, and online the lockstep itself is where the players meet: a sim sends
// its first frames when it starts, and no page can run the first step before
// every playing slot's frame for it is in. So play has begun for everyone
// when the sim has run one step past the one it started at, and until then
// the screen says whom it is waiting for. Alone the sim is held still until
// the screen goes. Either way the screen also waits, a little, for the land
// round the camera to be drawn, so the first sight of the game is whole.

import { LOADING_TEXT } from '../ui/loading-screen.ts';

/** The longest the screen waits for the land round the camera after loading, milliseconds. */
export const LAND_WAIT_MS = 5000;

export class StartGate {
  private readonly online: boolean;
  /** This page's own slot online: its frames come back through the relay too, so it is briefly among those waited on. */
  private readonly ownSlot: number;
  private loadedAt = -1;
  private firstStep = -1;
  private began = false;
  private waitingFor: readonly number[] = [];
  private released = false;

  constructor(online: boolean, ownSlot = -1) {
    this.online = online;
    this.ownSlot = ownSlot;
  }

  /** This page has loaded everything, and its sim starts now. */
  loaded(now: number): void {
    if (this.loadedAt < 0) this.loadedAt = now;
  }

  /** A state from the sim: the first is where it starts; a later step means every player's first frames were in. */
  state(step: number): void {
    if (this.firstStep < 0) this.firstStep = step;
    else if (step > this.firstStep) this.began = true;
  }

  /** The playing slots the sim is waiting on for its next step (none once they are in). */
  waiting(slots: readonly number[]): void {
    this.waitingFor = slots;
  }

  /** Something the player must see now (a player holding the pause, the host's choice about a player who is gone, the game closing): the screen goes at once. */
  release(): void {
    this.released = true;
  }

  /** Online, whether every player has loaded and play has begun. */
  get everyoneIn(): boolean {
    return !this.online || this.began;
  }

  /**
   * What the screen says while it stays, or null once the game may be shown.
   * `landReady` is whether the land round the camera is drawn; `name` names a slot.
   */
  view(now: number, landReady: boolean, name: (slot: number) => string): string | null {
    if (this.released) return null;
    if (this.loadedAt < 0) return LOADING_TEXT;
    if (!this.everyoneIn) {
      const names = this.waitingFor.filter((s) => s !== this.ownSlot).map(name);
      return names.length > 0 ? `Waiting for ${names.join(' and ')} to finish loading…` : 'Waiting for the other players to finish loading…';
    }
    if (!landReady && now - this.loadedAt < LAND_WAIT_MS) return 'Drawing the land…';
    return null;
  }
}
