// The main menu's music (the sound redo's menu theme), from the first click
// on the menu until a game starts. Only the music: no sound effects load.
import { AudioEngine } from '@blockyrts/audio';
import { onSettingsChange, type Settings } from '../settings/settings.ts';
import { soundFiles } from './files.ts';

/** Seconds the menu music takes to fade out as a game starts. */
const FADE_S = 1.5;

export class MenuMusic {
  private readonly engine: AudioEngine;
  private readonly off: () => void;

  constructor(settings: Settings) {
    this.engine = new AudioEngine({ files: soundFiles(), preload: false });
    this.engine.attachUnlock();
    const apply = (s: Settings): void => this.engine.setVolume('music', s.musicVolume);
    apply(settings);
    this.off = onSettingsChange(apply);
    this.engine.setMusicState('menu', 2);
  }

  /** Fades out, then lets the engine go; the match brings its own. */
  stop(): void {
    this.off();
    this.engine.setMusicState(null, FADE_S);
    setTimeout(() => this.engine.dispose(), (FADE_S + 0.2) * 1000);
  }
}

/** The menu music, or nothing where audio cannot start (no Web Audio). */
export function startMenuMusic(settings: Settings): MenuMusic | null {
  try {
    return new MenuMusic(settings);
  } catch (err) {
    console.warn('menu music unavailable', err);
    return null;
  }
}
