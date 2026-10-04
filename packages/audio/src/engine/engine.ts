// The Web Audio playback engine the client uses. Each sound comes from a
// finished file when the client hands it one (the sound redo), else it is
// rendered in code in a worker once; then it plays one-shots at world
// positions, voice cues, the music with crossfades between states, and the
// background ambience.
//
//   const audio = new AudioEngine();
//   audio.attachUnlock();                 // starts on the first click or key
//   audio.setMusicState('day');
//   audio.setListener(camX, camZ);        // every frame, metres
//   audio.play('chop', { x, z });         // a sound in the world
//   audio.voice('worker', 'acknowledge', { x, z });
//   audio.play('horn_dusk');              // a flat alert
//   audio.setVolume('music', 0.5);        // the Settings sliders
//   audio.setWorldPaused(true);           // the game is paused: music and ambience only
import { SOUNDS, soundDef, voiceId, type AmbienceId, type AnySoundDef, type VolumeCategory } from '../manifest.ts';
import { MUSIC_STATES, type MusicStateId } from '../music/score.ts';
import type { VoiceEventId, VoiceFamilyId } from '../voice/voices.ts';
import { loadSoundFile, type SoundFiles } from './files.ts';
import { Renderer } from './renderer.ts';
import { DEFAULT_SPATIAL, falloff, panFor, sliderToGain, type Listener, type SpatialSettings } from './spatial.ts';

export type VolumeSlider = VolumeCategory | 'master';

export interface AudioEngineOptions {
  /** Distance falloff (metres). */
  readonly spatial?: Partial<SpatialSettings>;
  /** Most sounds playing at once, music aside. */
  readonly maxVoices?: number;
  /** Sample rate the music is rendered at (32 kHz keeps memory modest). */
  readonly musicSampleRate?: number;
  /** Fade everything out while the tab is hidden (default true). */
  readonly muteWhenHidden?: boolean;
  /** Render in a Web Worker (default true; falls back to the main thread). */
  readonly useWorker?: boolean;
  /** An existing context to play into, for tests or a host page. */
  readonly context?: AudioContext;
  /** Finished sound files to play instead of the code-made sounds (any missing or failing file falls back to code). */
  readonly files?: SoundFiles;
  /** Load every sound when audio unlocks (default true); a page with only music passes false. */
  readonly preload?: boolean;
}

/** A music track: a time of day, or the main menu's (files only). */
export type MusicId = MusicStateId | 'menu';

export interface PlayOptions {
  /** World position in metres; omit for a flat sound (alerts, interface). */
  readonly x?: number;
  readonly z?: number;
  /** Extra gain, 0 to 1. */
  readonly gain?: number;
  /** A specific variant instead of the rotation. */
  readonly variant?: number;
  /** The player's own interface (a click, a ping): it plays while the game is paused too. */
  readonly ui?: boolean;
}

/**
 * Whether a sound plays while the game is paused (Jade's Patch 3: "Only the
 * music and ambient sounds like birds should be heard during a pause"). The
 * music and the ambience loop are not one-shots and never stop; of the
 * one-shots only the interface's own sounds play (s): its clicks and chimes,
 * and anything the player's hands set off (`ui`).
 */
export function playsWhilePaused(def: Pick<AnySoundDef, 'group'>, opts: Pick<PlayOptions, 'ui'> = {}): boolean {
  return def.group === 'interface' || opts.ui === true;
}

/** How fast the world's sounds already playing fade out as the game pauses (seconds). */
const PAUSE_FADE_S = 0.08;

interface Playing {
  readonly id: string;
  readonly src: AudioBufferSourceNode;
  /** Its own gain node, faded out when the game pauses. */
  readonly out: GainNode;
  /** A sound of the world (not the interface): it stops when the game pauses. */
  readonly world: boolean;
  readonly gain: number;
  /** Context time by which it has certainly finished. */
  readonly ends: number;
}

interface MusicVoice {
  readonly state: MusicId;
  readonly out: GainNode;
  readonly tension: GainNode;
  readonly sources: AudioBufferSourceNode[];
}

/** The cycle of the day, for loading the next state ahead of time. */
const NEXT: Record<MusicId, MusicId | null> = { day: 'dusk', dusk: 'night', night: 'dawn', dawn: 'day', blood_night: 'dawn', menu: null };
/** Music states kept decoded: the one playing and the next. */
const MUSIC_CACHE = 2;

interface AmbienceVoice {
  readonly id: AmbienceId;
  readonly out: GainNode;
  readonly src: AudioBufferSourceNode;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly hiddenGain: GainNode;
  private readonly buses: Record<VolumeCategory, GainNode>;
  private readonly sliders: Record<VolumeSlider, number> = { master: 1, music: 0.6, effects: 1, voice: 1 };
  private readonly spatial: SpatialSettings;
  private readonly maxVoices: number;
  private readonly musicSr: number;
  private readonly sfxRenderer: Renderer;
  private readonly musicRenderer: Renderer;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly requested = new Set<string>();
  private readonly lastVariant = new Map<string, number>();
  private readonly playing: Playing[] = [];
  private readonly music = new Map<MusicId, AudioBuffer[]>();
  private readonly musicRequested = new Map<MusicId, Promise<void>>();
  private readonly musicUse: MusicId[] = [];
  private current: MusicVoice | null = null;
  private wanted: MusicId | null = null;
  private readonly files: SoundFiles | null;
  private readonly preloadOnUnlock: boolean;
  private readonly ambienceBufs = new Map<AmbienceId, Promise<AudioBuffer | null>>();
  private ambience: AmbienceVoice | null = null;
  private wantedAmbience: AmbienceId | null = null;
  private wantedFade = 4;
  private intensity = 0;
  private listener: Listener = { x: 0, z: 0, rightX: 1, rightZ: 0 };
  private worldPaused = false;
  private unlockAttached = false;
  private readonly onVisibility = (): void => this.applyVisibility();
  private readonly muteWhenHidden: boolean;

  constructor(opts: AudioEngineOptions = {}) {
    this.ctx = opts.context ?? new AudioContext({ latencyHint: 'interactive' });
    this.spatial = { ...DEFAULT_SPATIAL, ...opts.spatial };
    this.maxVoices = opts.maxVoices ?? 48;
    this.musicSr = opts.musicSampleRate ?? 32000;
    this.muteWhenHidden = opts.muteWhenHidden ?? true;
    this.files = opts.files ?? null;
    this.preloadOnUnlock = opts.preload ?? true;
    this.sfxRenderer = new Renderer(opts.useWorker ?? true);
    this.musicRenderer = new Renderer(opts.useWorker ?? true);

    this.hiddenGain = this.ctx.createGain();
    this.hiddenGain.connect(this.ctx.destination);
    // A gentle limiter so a big battle never clips.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(this.hiddenGain);
    this.master = this.ctx.createGain();
    this.master.connect(limiter);
    this.buses = {
      music: this.ctx.createGain(),
      effects: this.ctx.createGain(),
      voice: this.ctx.createGain(),
    };
    for (const bus of Object.values(this.buses)) bus.connect(this.master);
    for (const k of Object.keys(this.sliders) as VolumeSlider[]) this.applyVolume(k, 0);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.applyVisibility();
    }
  }

  // ------------------------------------------------------------ lifecycle

  /**
   * Browsers keep audio locked until the player clicks or presses a key.
   * Call this from such an event (or use attachUnlock). It also starts
   * loading every sound in the background (unless `preload` is false).
   */
  async unlock(): Promise<void> {
    if (this.preloadOnUnlock) this.preloadAll();
    if (this.ctx.state === 'suspended' && !(this.muteWhenHidden && isHidden())) await this.ctx.resume();
  }

  /** Unlocks on the first pointer or key press on `target` (default: the window). */
  attachUnlock(target: EventTarget = window): void {
    if (this.unlockAttached) return;
    this.unlockAttached = true;
    const go = (): void => {
      void this.unlock();
      target.removeEventListener('pointerdown', go);
      target.removeEventListener('keydown', go);
    };
    target.addEventListener('pointerdown', go);
    target.addEventListener('keydown', go);
  }

  /** Renders every sound in the manifest (once). */
  preloadAll(): void {
    for (const def of SOUNDS) this.request(def);
  }

  /** True once a sound's buffers are rendered. */
  isReady(id: string): boolean {
    return this.buffers.has(id);
  }

  /** Resolves when every sound is rendered. */
  async whenAllReady(): Promise<void> {
    this.preloadAll();
    while (SOUNDS.some((d) => !this.buffers.has(d.id))) await new Promise((r) => setTimeout(r, 50));
  }

  dispose(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopMusic(0);
    this.stopAmbience(0);
    for (const p of this.playing) p.src.stop();
    this.sfxRenderer.dispose();
    this.musicRenderer.dispose();
    void this.ctx.close();
  }

  // ------------------------------------------------------------ volume

  /** Sets a Settings slider, 0 to 1 (master, music, effects, voice). */
  setVolume(slider: VolumeSlider, value: number): void {
    this.sliders[slider] = Math.max(0, Math.min(1, value));
    this.applyVolume(slider, 0.05);
  }

  volume(slider: VolumeSlider): number {
    return this.sliders[slider];
  }

  private applyVolume(slider: VolumeSlider, smooth: number): void {
    const node = slider === 'master' ? this.master : this.buses[slider];
    const g = sliderToGain(this.sliders[slider]);
    if (smooth > 0) node.gain.setTargetAtTime(g, this.ctx.currentTime, smooth);
    else node.gain.value = g;
  }

  private applyVisibility(): void {
    if (!this.muteWhenHidden) return;
    const now = this.ctx.currentTime;
    if (isHidden()) {
      this.hiddenGain.gain.setTargetAtTime(0, now, 0.05);
      setTimeout(() => {
        if (isHidden()) void this.ctx.suspend();
      }, 300);
    } else {
      this.hiddenGain.gain.setTargetAtTime(1, now, 0.1);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    }
  }

  // ------------------------------------------------------------ pause

  /**
   * The game is paused (or resumed): while paused the world falls silent.
   * Its sounds already playing fade out at once and no new ones start; the
   * music, the ambience and the interface's own sounds carry on. Resuming
   * lets the world's sounds play again as the game sends them.
   */
  setWorldPaused(paused: boolean): void {
    if (paused === this.worldPaused) return;
    this.worldPaused = paused;
    if (!paused) return;
    const now = this.ctx.currentTime;
    for (let i = this.playing.length - 1; i >= 0; i--) {
      const p = this.playing[i]!;
      if (!p.world) continue;
      p.out.gain.cancelScheduledValues(now);
      p.out.gain.setValueAtTime(p.out.gain.value, now);
      p.out.gain.linearRampToValueAtTime(0, now + PAUSE_FADE_S);
      p.src.stop(now + PAUSE_FADE_S + 0.02);
      this.playing.splice(i, 1);
    }
  }

  worldIsPaused(): boolean {
    return this.worldPaused;
  }

  // ------------------------------------------------------------ one-shots

  /** Where the camera is looking, in metres; call once a frame. */
  setListener(x: number, z: number, rightX = 1, rightZ = 0): void {
    this.listener = { x, z, rightX, rightZ };
  }

  /**
   * Plays a sound from the manifest. Positional sounds pass x and z;
   * returns false if it was not played (unknown, not rendered yet, out of
   * earshot or too many at once).
   */
  play(id: string, opts: PlayOptions = {}): boolean {
    const def = soundDef(id);
    if (!def) {
      console.warn(`Unknown sound "${id}"`);
      return false;
    }
    const world = !playsWhilePaused(def, opts);
    if (world && this.worldPaused) return false;
    const bufs = this.buffers.get(id);
    if (!bufs) {
      this.request(def);
      return false;
    }
    const positional = def.positional && opts.x !== undefined && opts.z !== undefined;
    let gain = opts.gain ?? 1;
    let pan = 0;
    if (positional) {
      gain *= falloff(this.listener, opts.x!, opts.z!, this.spatial);
      pan = panFor(this.listener, opts.x!, opts.z!, this.spatial);
    }
    if (gain < 0.01) return false;
    this.prune();
    const same = this.playing.filter((p) => p.id === id);
    if (same.length >= def.maxInstances) return false;
    if (this.playing.length >= this.maxVoices) {
      // Alerts always play; otherwise replace the quietest sound if this one is louder.
      const quietest = this.playing.reduce((a, b) => (b.gain < a.gain ? b : a));
      if (positional && quietest.gain >= gain) return false;
      quietest.src.stop();
      this.playing.splice(this.playing.indexOf(quietest), 1);
    }
    const variant = opts.variant ?? this.pickVariant(id, bufs.length);
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[variant % bufs.length]!;
    // Small pitch differences keep repeated work sounds from sounding mechanical.
    if (def.group !== 'alerts' && def.group !== 'interface') src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.buses[def.volume]);
    } else g.connect(this.buses[def.volume]);
    const entry: Playing = { id, src, out: g, world, gain, ends: this.ctx.currentTime + src.buffer.duration / src.playbackRate.value + 0.1 };
    this.playing.push(entry);
    src.onended = () => {
      const i = this.playing.indexOf(entry);
      if (i >= 0) this.playing.splice(i, 1);
      src.disconnect();
      g.disconnect();
    };
    src.start();
    return true;
  }

  /** Plays a unit voice cue, such as voice('worker', 'acknowledge', { x, z }). */
  voice(family: VoiceFamilyId, event: VoiceEventId, opts: PlayOptions = {}): boolean {
    return this.play(voiceId(family, event), opts);
  }

  private pickVariant(id: string, n: number): number {
    const last = this.lastVariant.get(id) ?? -1;
    let v = Math.floor(Math.random() * n);
    if (n > 1 && v === last) v = (v + 1) % n;
    this.lastVariant.set(id, v);
    return v;
  }

  private prune(): void {
    // onended can lag behind; drop anything that has certainly finished.
    const now = this.ctx.currentTime;
    for (let i = this.playing.length - 1; i >= 0; i--) if (this.playing[i]!.ends < now) this.playing.splice(i, 1);
  }

  /** Whether a sound can play at all: it is made in code, or its files are here. */
  hasSound(id: string): boolean {
    const def = soundDef(id);
    return def !== undefined && (def.gen !== 'file' || this.fileNames(def) !== null);
  }

  /** Starts loading a sound before it is first played (a monster kind coming into view). */
  preload(id: string): void {
    const def = soundDef(id);
    if (def) this.request(def);
  }

  /** The file names of every take of a sound, or null unless all of them are there. */
  private fileNames(def: AnySoundDef): string[] | null {
    if (!this.files) return null;
    const names = Array.from({ length: def.variants }, (_, v) => `${def.id}.${v}`);
    return names.every((n) => this.files!.index.entries[n]) ? names : null;
  }

  private request(def: AnySoundDef): void {
    if (this.requested.has(def.id)) return;
    this.requested.add(def.id);
    const names = this.fileNames(def);
    if (names) {
      Promise.all(names.map((n) => loadSoundFile(this.ctx, this.files!, n)))
        .then((bufs) => this.buffers.set(def.id, bufs))
        .catch((err: unknown) => {
          console.warn(`Could not load the sound file for ${def.id}; ${def.gen === 'file' ? 'it stays silent' : 'making it in code'}`, err);
          if (def.gen !== 'file') this.renderInCode(def);
        });
      return;
    }
    if (def.gen !== 'file') this.renderInCode(def);
  }

  private renderInCode(def: AnySoundDef): void {
    void this.sfxRenderer.render({ kind: 'sound', id: def.id, sr: this.ctx.sampleRate }).then((res) => {
      if (res.kind !== 'sound') {
        this.requested.delete(def.id);
        if (res.kind === 'error') console.warn(`Could not render ${def.id}: ${res.message}`);
        return;
      }
      this.buffers.set(def.id, res.variants.map((data) => this.toBuffer([data], res.sr)));
    });
  }

  private toBuffer(channels: Float32Array[], sr: number): AudioBuffer {
    const b = this.ctx.createBuffer(channels.length, channels[0]!.length, sr);
    channels.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return b;
  }

  // ------------------------------------------------------------ music

  /**
   * Switches the music to a state with a crossfade (seconds). The first
   * time a state is used it is rendered in the background, which takes a
   * few seconds; prepareMusic renders one ahead of time. null stops it.
   */
  setMusicState(state: MusicId | null, fade = 4): void {
    this.wanted = state;
    this.wantedFade = fade;
    if (state === null) {
      this.stopMusic(fade);
      return;
    }
    if (this.current?.state === state) return;
    void this.prepareMusic(state).then(() => {
      if (this.wanted === state && this.current?.state !== state) this.startMusic(state, this.wantedFade);
    });
  }

  musicState(): MusicId | null {
    return this.wanted;
  }

  /**
   * How tense the music is, 0 to 1: fades in each state's tension layers
   * (war drums, battle drums, stabs). The client raises it when fighting
   * is on screen.
   */
  setMusicIntensity(value: number, seconds = 2): void {
    this.intensity = Math.max(0, Math.min(1, value));
    if (this.current) this.current.tension.gain.setTargetAtTime(this.intensity, this.ctx.currentTime, seconds / 3);
  }

  musicIntensity(): number {
    return this.intensity;
  }

  /** Loads or renders a state's music ahead of time (call at dusk for a coming blood night). */
  prepareMusic(state: MusicId): Promise<void> {
    if (this.music.has(state)) return Promise.resolve();
    let p = this.musicRequested.get(state);
    if (!p) {
      p = this.loadMusicFiles(state).then((loaded) => {
        if (loaded) {
          this.musicRequested.delete(state);
          this.music.set(state, loaded);
          this.touchMusic(state);
          return;
        }
        if (state === 'menu' || !MUSIC_STATES.includes(state)) {
          this.musicRequested.delete(state);
          return;
        }
        return this.renderMusicInCode(state);
      });
      this.musicRequested.set(state, p);
    }
    return p;
  }

  /** A state's stems from files (base, and tension when there is one), or null to make it in code. */
  private async loadMusicFiles(state: MusicId): Promise<AudioBuffer[] | null> {
    const names = [`music.${state}.base`, `music.${state}.tension`].filter((n) => this.files?.index.entries[n]);
    if (!names.length) return null;
    try {
      // Decoded at the music rate (32 kHz by default) to keep long loops modest in memory.
      const ctx = typeof OfflineAudioContext !== 'undefined' ? new OfflineAudioContext(2, 1, this.musicSr) : this.ctx;
      return await Promise.all(names.map((n) => loadSoundFile(ctx, this.files!, n)));
    } catch (err) {
      console.warn(`Could not load the music files for ${state}; making it in code`, err);
      return null;
    }
  }

  private renderMusicInCode(state: MusicStateId): Promise<void> {
    return this.musicRenderer.render({ kind: 'music', state, sr: this.musicSr }).then((res) => {
      this.musicRequested.delete(state);
      if (res.kind !== 'music') {
        if (res.kind === 'error') console.warn(`Could not render music ${state}: ${res.message}`);
        return;
      }
      const [bl, br, tl, tr] = res.channels as [Float32Array, Float32Array, Float32Array, Float32Array];
      this.music.set(state, [this.toBuffer([bl, br], res.sr), this.toBuffer([tl, tr], res.sr)]);
      this.touchMusic(state);
    });
  }

  private touchMusic(state: MusicId): void {
    const i = this.musicUse.indexOf(state);
    if (i >= 0) this.musicUse.splice(i, 1);
    this.musicUse.push(state);
    while (this.musicUse.length > MUSIC_CACHE) {
      const old = this.musicUse.find((s) => s !== this.current?.state && s !== this.wanted);
      if (!old) break;
      this.musicUse.splice(this.musicUse.indexOf(old), 1);
      this.music.delete(old);
    }
  }

  private startMusic(state: MusicId, fade: number): void {
    const bufs = this.music.get(state);
    if (!bufs) return;
    this.touchMusic(state);
    this.stopMusic(fade);
    const now = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
    out.connect(this.buses.music);
    const tension = this.ctx.createGain();
    tension.gain.value = this.intensity;
    tension.connect(out);
    const at = now + 0.05;
    const sources = bufs.map((buf, i) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(i === 0 ? out : tension);
      src.start(at);
      return src;
    });
    this.current = { state, out, tension, sources };
    // Load the next state in the day's cycle while this one plays.
    const next = NEXT[state];
    if (next) void this.prepareMusic(next);
  }

  private stopMusic(fade: number): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    const now = this.ctx.currentTime;
    old.out.gain.cancelScheduledValues(now);
    old.out.gain.setValueAtTime(old.out.gain.value, now);
    old.out.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
    for (const s of old.sources) s.stop(now + Math.max(0.05, fade) + 0.05);
    setTimeout(() => old.out.disconnect(), (fade + 0.5) * 1000);
  }

  // ------------------------------------------------------------ ambience

  /**
   * The background loop under the music (day, night, blood night), on the
   * effects slider, crossfading like the music. Files only: without its
   * file there is no ambience. null stops it.
   */
  setAmbience(id: AmbienceId | null, fade = 4): void {
    this.wantedAmbience = id;
    if (id === null) {
      this.stopAmbience(fade);
      return;
    }
    if (this.ambience?.id === id) return;
    void this.ambienceBuffer(id).then((buf) => {
      if (!buf || this.wantedAmbience !== id || this.ambience?.id === id) return;
      this.stopAmbience(fade);
      const now = this.ctx.currentTime;
      const out = this.ctx.createGain();
      out.gain.setValueAtTime(0, now);
      out.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fade));
      out.connect(this.buses.effects);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(out);
      src.start(now + 0.05);
      this.ambience = { id, out, src };
    });
  }

  ambienceState(): AmbienceId | null {
    return this.wantedAmbience;
  }

  private ambienceBuffer(id: AmbienceId): Promise<AudioBuffer | null> {
    const name = `ambience.${id}.0`;
    if (!this.files?.index.entries[name]) return Promise.resolve(null);
    let p = this.ambienceBufs.get(id);
    if (!p) {
      const ctx = typeof OfflineAudioContext !== 'undefined' ? new OfflineAudioContext(2, 1, this.musicSr) : this.ctx;
      p = loadSoundFile(ctx, this.files, name).catch((err: unknown) => {
        console.warn(`Could not load the ambience ${id}`, err);
        return null;
      });
      this.ambienceBufs.set(id, p);
    }
    return p;
  }

  private stopAmbience(fade: number): void {
    const old = this.ambience;
    if (!old) return;
    this.ambience = null;
    const now = this.ctx.currentTime;
    old.out.gain.cancelScheduledValues(now);
    old.out.gain.setValueAtTime(old.out.gain.value, now);
    old.out.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade));
    old.src.stop(now + Math.max(0.05, fade) + 0.05);
    setTimeout(() => old.out.disconnect(), (fade + 0.5) * 1000);
  }
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

