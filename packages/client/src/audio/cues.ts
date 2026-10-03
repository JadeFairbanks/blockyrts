// Interface sounds asked for from anywhere in the HUD (a button pressed, an
// order refused, a building placed), played by the match's GameAudio once it
// is listening. Before that, and on pages without a match, they do nothing.

export type UiCue = 'ui_click' | 'ui_place' | 'error' | 'ping';

let sink: ((cue: UiCue) => void) | null = null;

/** The match's audio listens from here on (null stops it). */
export function setCueSink(f: ((cue: UiCue) => void) | null): void {
  sink = f;
}

export function cue(id: UiCue): void {
  sink?.(id);
}
