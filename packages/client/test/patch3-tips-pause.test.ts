// Jade's Patch 3: the tips in plain words, and only the music, the ambience
// and the interface heard while the game is paused.
import { AudioEngine, playsWhilePaused, SOUNDS, soundDef } from '@blockyrts/audio';
import type { AudioEngine as Engine } from '@blockyrts/audio';
import { BuildingKind, buildingSpec, clockAt, OrderKind, Period, STEPS_PER_SECOND, UnitKind, WU_PER_METRE } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { GameAudio } from '../src/audio/game-audio.ts';
import { cue } from '../src/audio/cues.ts';
import { GameInfo } from '../src/game/game-info.ts';
import { menuSlots, submenuChoices } from '../src/hud/menu-keys.ts';
import { S, STATE_STRIDE, type StateMessage } from '../src/messages.ts';
import { sanitizeSettings } from '../src/settings/settings.ts';
import { tipTexts, TORCH_TIP_STEP } from '../src/ui/hints.ts';

describe('the tips (Patch 3)', () => {
  it('say how to light a torch in the clicks the player makes, with what it costs', () => {
    const t = tipTexts({});
    expect(t.torch).not.toMatch(/B, then/);
    // The names the build menu shows: Build, then the Lights button, then the Torch post in it.
    const slot = menuSlots().find((specs) => specs.some((s) => s.kind === BuildingKind.TorchPost))!;
    const group = slot[0]!.group!;
    const choice = submenuChoices(slot).find((c) => c.spec.kind === BuildingKind.TorchPost)!;
    expect(t.torch).toContain(`click Build, then ${group}, then ${choice.name}`);
    expect(t.torch).toContain('2 lumber, 1 resin');
  });

  it('name the main base as it is called, and the player own keys', () => {
    const t = tipTexts({});
    expect(t.gather).toContain(buildingSpec(BuildingKind.MainBase).levels[0]!.name);
    expect(t.build).toContain('press B');
    expect(t.dusk).toContain('press J');
    const rebound = tipTexts({ build: 'KeyK', home: 'KeyH' });
    expect(rebound.build).toContain('press K');
    expect(rebound.dusk).toContain('press H');
  });

  it('hold the torch tip until 10 s into the first dusk (Patch 3b)', () => {
    const c = clockAt(TORCH_TIP_STEP);
    expect(c).toMatchObject({ period: Period.Dusk, cycle: 0, into: 10 * STEPS_PER_SECOND });
  });

  it('stay short and plain', () => {
    for (const text of Object.values(tipTexts({}))) {
      expect(text.length, text).toBeLessThan(260);
      // No key chains, no "card", no doubled spaces.
      expect(text, text).not.toMatch(/\bcard\b|, then [A-Z]\b| {2}/);
    }
  });
});

describe('the sounds while paused (Patch 3)', () => {
  it('keep only the interface; every sound of the world stops', () => {
    for (const def of SOUNDS) expect(playsWhilePaused(def), def.id).toBe(def.group === 'interface');
    expect(playsWhilePaused(soundDef('chop')!)).toBe(false);
    expect(playsWhilePaused(soundDef('horn_dusk')!)).toBe(false);
    expect(playsWhilePaused(soundDef('ui_click')!)).toBe(true);
    // The player's own refusal buzz and ping still answer the hand.
    expect(playsWhilePaused(soundDef('error')!, { ui: true })).toBe(true);
  });

  it('the engine fades out the world as the game pauses, keeps the interface, and plays the world again on resuming', () => {
    const ctx = fakeContext();
    const engine = new AudioEngine({ context: ctx as unknown as AudioContext, useWorker: false, preload: false });
    const buf = { duration: 1 } as AudioBuffer;
    const buffers = (engine as unknown as { buffers: Map<string, AudioBuffer[]> }).buffers;
    for (const id of ['chop', 'ui_click', 'error']) buffers.set(id, [buf]);

    expect(engine.play('chop', { x: 0, z: 0 })).toBe(true);
    const chop = ctx.sources.at(-1)!;
    expect(engine.play('ui_click')).toBe(true);
    const click = ctx.sources.at(-1)!;

    engine.setWorldPaused(true);
    expect(chop.stoppedAt).not.toBeNull();
    expect(click.stoppedAt).toBeNull();
    expect(engine.play('chop', { x: 0, z: 0 })).toBe(false);
    expect(engine.play('ui_click')).toBe(true);
    expect(engine.play('error')).toBe(false);
    expect(engine.play('error', { ui: true })).toBe(true);

    engine.setWorldPaused(false);
    expect(engine.play('chop', { x: 0, z: 0 })).toBe(true);
  });

  it('the match stops the work sounds while paused and keeps its clicks', () => {
    const played: string[] = [];
    const paused: boolean[] = [];
    const engine = {
      hasSound: () => true,
      preload: () => undefined,
      setAmbience: () => undefined,
      attachUnlock: () => undefined,
      setVolume: () => undefined,
      setListener: () => undefined,
      setMusicState: () => undefined,
      prepareMusic: () => Promise.resolve(),
      setMusicIntensity: () => undefined,
      setWorldPaused: (p: boolean) => paused.push(p),
      play: (id: string, o?: { ui?: boolean }) => {
        played.push(o?.ui ? `ui:${id}` : id);
        return true;
      },
      voice: () => true,
      dispose: () => undefined,
    } as unknown as Engine;
    const game = new GameInfo(0);
    const audio = new GameAudio(sanitizeSettings(null), game, 0, engine);
    const msg = chopping(10);
    game.onState(msg);
    audio.onState(msg);

    audio.setPaused(true);
    audio.setPaused(true);
    expect(paused).toEqual([true]);
    for (let t = 0; t <= 3000; t += 100) audio.frame(0, 0, t);
    expect(played).not.toContain('chop');
    cue('ui_click');
    expect(played).toContain('ui:ui_click');

    audio.setPaused(false);
    expect(paused).toEqual([true, false]);
    for (let t = 3000; t <= 6000; t += 100) audio.frame(0, 0, t);
    expect(played).toContain('chop');
    audio.dispose();
  });
});

/** One worker chopping by the camera. */
function chopping(step: number): StateMessage {
  const data = new Int32Array(STATE_STRIDE);
  data[S.id] = 1;
  data[S.kind] = UnitKind.Worker;
  data[S.x] = 2 * WU_PER_METRE;
  data[S.order] = OrderKind.Chop;
  data[S.hp] = 10;
  return { type: 'state', step, hash: 0, hashStep: 0, count: 1, data, shots: new Int32Array(0), hits: [] };
}

interface FakeSource {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  onended: (() => void) | null;
  stoppedAt: number | null;
  connect(): void;
  disconnect(): void;
  start(): void;
  stop(at?: number): void;
}

/** Just enough of an AudioContext for the engine's one-shots. */
function fakeContext(): { currentTime: number; destination: object; state: string; sources: FakeSource[] } & Record<string, unknown> {
  const param = (): Record<string, unknown> => ({
    value: 1,
    setTargetAtTime: () => undefined,
    setValueAtTime: () => undefined,
    cancelScheduledValues: () => undefined,
    linearRampToValueAtTime: () => undefined,
  });
  const node = (): Record<string, unknown> => ({ gain: param(), pan: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: () => undefined, disconnect: () => undefined });
  const sources: FakeSource[] = [];
  return {
    currentTime: 0,
    destination: {},
    state: 'running',
    sources,
    createGain: node,
    createStereoPanner: node,
    createDynamicsCompressor: node,
    createBufferSource: () => {
      const s: FakeSource = {
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        stoppedAt: null,
        connect: () => undefined,
        disconnect: () => undefined,
        start: () => undefined,
        stop: (at = 0) => {
          s.stoppedAt = at;
        },
      };
      sources.push(s);
      return s;
    },
  };
}
