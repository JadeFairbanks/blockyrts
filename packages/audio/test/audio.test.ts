import { describe, expect, it } from 'vitest';
import { hashString } from '../src/dsp/core.ts';
import { trimRange } from '../src/engine/files.ts';
import { falloff, panFor, sliderToGain } from '../src/engine/spatial.ts';
import { EXTRA_SOUNDS, MOB_SOUND_NAMES, SFX, SOUNDS, VOICES, soundDef, voiceId } from '../src/manifest.ts';
import { parsePattern, renderMusic, stereoPeak } from '../src/music/render.ts';
import { MUSIC, MUSIC_STATES, loopSeconds } from '../src/music/score.ts';
import { renderDef } from '../src/render.ts';
import { FAMILY_EVENTS, VOICE_FAMILIES, type VoiceFamilyId } from '../src/voice/voices.ts';

const SR = 44100;

function fingerprint(buf: Float32Array): number {
  return hashString(Array.from(buf.subarray(0, 4000), (x) => x.toFixed(6)).join(','));
}

/** Each sound the design names (the old blueprint's Audio section), and the ids that play it. */
const DOC_SOUNDS: Record<string, readonly string[]> = {
  chopping: ['chop'],
  mining: ['mine'],
  digging: ['dig'],
  building: ['build'],
  hits: ['hit_blade', 'hit_blunt', 'hit_arrow', 'hit_building'],
  blocks: ['block_wood', 'block_metal'],
  deaths: ['death_body', 'death_monster', 'death_building'],
  explosions: ['explosion_small', 'explosion_large'],
  'a torch being lit': ['torch_light'],
  'snuffed out': ['torch_snuff'],
  'horns at dusk': ['horn_dusk'],
  dawn: ['horn_dawn'],
  'the idle-worker alert': ['alert_idle_worker'],
  'map pings': ['ping'],
  'an error sound': ['error'],
};

describe('the sound list', () => {
  it('covers every sound the design names', () => {
    for (const ids of Object.values(DOC_SOUNDS)) for (const id of ids) expect(soundDef(id), id).toBeDefined();
  });

  it('has the blood night double horn and the voice moments the doc names', () => {
    expect(soundDef('horn_blood_night')).toBeDefined();
    // "short voice cues when units get orders, are hungry, are under attack, or run out of a resource"
    expect(FAMILY_EVENTS.worker).toEqual(expect.arrayContaining(['acknowledge', 'select', 'hungry', 'under_attack', 'resource_out', 'cannot']));
    for (const fam of ['warrior', 'mage'] as const) expect(FAMILY_EVENTS[fam]).toEqual(expect.arrayContaining(['acknowledge', 'select', 'hungry', 'under_attack']));
    for (const fam of ['halfling', 'runkin', 'elf', 'dwarf'] as const) expect(FAMILY_EVENTS[fam]).toEqual(expect.arrayContaining(['greet', 'trade', 'under_attack', 'warn']));
  });

  it('has unique ids, and a voice entry for every family and event', () => {
    const ids = SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fam of Object.keys(VOICE_FAMILIES) as VoiceFamilyId[]) {
      for (const ev of FAMILY_EVENTS[fam]) expect(soundDef(voiceId(fam, ev))).toBeDefined();
    }
    expect(VOICES.length).toBeGreaterThan(60);
    expect(SFX.length).toBeGreaterThan(30);
  });
});

describe('rendering every sound', () => {
  for (const def of SOUNDS) {
    it(`${def.id}: right length, level and shape; no silence`, () => {
      const prints = new Set<number>();
      for (let v = 0; v < def.variants; v++) {
        const buf = renderDef(def, v, SR);
        const secs = buf.length / SR;
        expect(secs, 'duration').toBeGreaterThan(0.03);
        expect(secs, 'duration').toBeLessThanOrEqual(def.maxSeconds);
        let peak = 0;
        let sq = 0;
        let finite = true;
        for (const x of buf) {
          if (!Number.isFinite(x)) finite = false;
          peak = Math.max(peak, Math.abs(x));
          sq += x * x;
        }
        expect(finite, 'no NaN or infinity').toBe(true);
        expect(peak, 'peak').toBeLessThanOrEqual(def.level + 1e-4);
        expect(peak, 'peak').toBeGreaterThan(def.level * 0.99);
        expect(Math.sqrt(sq / buf.length), 'rms (not silent)').toBeGreaterThan(0.01);
        // Starts and ends at rest, so nothing clicks.
        expect(Math.abs(buf[0]!)).toBeLessThan(0.02);
        expect(Math.abs(buf[buf.length - 1]!)).toBeLessThan(0.02);
        prints.add(fingerprint(buf));
      }
      expect(prints.size, 'variants differ').toBe(def.variants);
    });
  }

  it('renders the same samples every time', () => {
    for (const id of ['chop', 'explosion_large', 'horn_dusk', 'voice.dwarf.greet', 'ping']) {
      const def = soundDef(id)!;
      expect(fingerprint(renderDef(def, 1 % def.variants, SR))).toBe(fingerprint(renderDef(def, 1 % def.variants, SR)));
    }
  });
});

describe('music', () => {
  it('has the five states the doc names', () => {
    expect([...MUSIC_STATES].sort()).toEqual(['blood_night', 'dawn', 'day', 'dusk', 'night']);
  });

  for (const state of MUSIC_STATES) {
    it(`${state}: patterns fill whole bars`, () => {
      const def = MUSIC[state];
      const steps = def.bars * def.beatsPerBar * def.stepsPerBeat;
      for (const layer of def.layers) {
        const events = parsePattern(layer.pattern, layer.instrument === 'drums', steps);
        expect(events.length, layer.name).toBeGreaterThan(0);
        for (const e of events) for (const n of e.notes) expect(n, layer.name).toBeGreaterThanOrEqual(24);
      }
      expect(def.layers.some((l) => l.stem === 'base')).toBe(true);
      expect(def.layers.some((l) => l.stem === 'tension')).toBe(true);
    });

    it(`${state}: renders two seamless loops at a safe level`, () => {
      const sr = 32000;
      const m = renderMusic(state, sr);
      expect(m.length).toBe(Math.round(loopSeconds(MUSIC[state]) * sr));
      for (const stem of [m.stems.base, m.stems.tension]) {
        expect(stem.left.length).toBe(m.length);
        expect(stem.right.length).toBe(m.length);
        for (const ch of [stem.left, stem.right]) {
          expect(ch.every(Number.isFinite), 'no NaN or infinity').toBe(true);
          // The loop point: the jump from the last sample to the first is no
          // bigger than an ordinary step in the music.
          expect(Math.abs(ch[0]! - ch[ch.length - 1]!)).toBeLessThan(0.15);
        }
      }
      let full = 0;
      for (let i = 0; i < m.length; i++) full = Math.max(full, Math.abs(m.stems.base.left[i]! + m.stems.tension.left[i]!), Math.abs(m.stems.base.right[i]! + m.stems.tension.right[i]!));
      expect(full).toBeLessThanOrEqual(0.8001);
      expect(stereoPeak(m.stems.base)).toBeGreaterThan(0.3);
      expect(stereoPeak(m.stems.tension)).toBeGreaterThan(0.1);
      // No dead air: every second of the base loop has sound in it.
      for (let s = 0; s + sr <= m.length; s += sr) {
        let sq = 0;
        for (let i = s; i < s + sr; i++) sq += m.stems.base.left[i]! ** 2;
        expect(Math.sqrt(sq / sr), `second ${s / sr}`).toBeGreaterThan(0.01);
      }
    });
  }
});

describe('placing sounds in the world', () => {
  const l = { x: 100, z: 50, rightX: 1, rightZ: 0 };
  it('plays near sounds at full level and fades far ones out', () => {
    expect(falloff(l, 100, 50)).toBe(1);
    expect(falloff(l, 110, 50)).toBe(1);
    const mid = falloff(l, 140, 50);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(falloff(l, 200, 50)).toBe(0);
  });
  it('pans by side, never fully', () => {
    expect(panFor(l, 100, 80)).toBe(0);
    expect(panFor(l, 80, 50)).toBeLessThan(0);
    expect(panFor(l, 500, 50)).toBe(0.8);
  });
  it('maps sliders on a squared curve', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(0.5)).toBe(0.25);
    expect(sliderToGain(2)).toBe(1);
  });
});

describe('finished sound files', () => {
  // A one-shot of 1000 frames and a loop of 2000 with 100 frames of wrap-around each side, as the build script records them.
  const shot = { rate: 44100, channels: 1, frames: 1000, pre: 0, total: 1000, delay: 1105, padding: 434 };
  const loop = { rate: 44100, channels: 2, frames: 2000, pre: 100, total: 2200, delay: 1105, padding: 434 };

  it('cuts a decoded file to the sound, whether or not the decoder dropped the encoder silence', () => {
    expect(trimRange(shot, 1000, 44100)).toEqual({ start: 0, length: 1000 });
    expect(trimRange(shot, 1105 + 1000 + 434, 44100)).toEqual({ start: 1105, length: 1000 });
    expect(trimRange(shot, 1000 + 434, 44100)).toEqual({ start: 0, length: 1000 });
    expect(trimRange(shot, 1105 + 1000, 44100)).toEqual({ start: 1105, length: 1000 });
    expect(trimRange(loop, 2200, 44100)).toEqual({ start: 100, length: 2000 });
    expect(trimRange(loop, 1105 + 2200 + 434, 44100)).toEqual({ start: 1205, length: 2000 });
  });

  it('scales to the rate it was decoded at', () => {
    expect(trimRange(loop, Math.round(2200 * (48000 / 44100)), 48000)).toEqual({ start: Math.round(100 * (48000 / 44100)), length: Math.round(2000 * (48000 / 44100)) });
    expect(trimRange(shot, Math.round((1105 + 1000 + 434) * (32000 / 44100)), 32000)).toEqual({ start: Math.round(1105 * (32000 / 44100)), length: Math.round(1000 * (32000 / 44100)) });
  });

  it('lists the extras apart from the code-made sounds, and makes none of them in code', () => {
    const ids = new Set(SOUNDS.map((s) => s.id));
    expect(EXTRA_SOUNDS.length).toBe(MOB_SOUND_NAMES.length * 2);
    for (const def of EXTRA_SOUNDS) {
      expect(ids.has(def.id), def.id).toBe(false);
      expect(soundDef(def.id)).toBe(def);
      expect(() => renderDef(def, 0, 8000)).toThrow();
    }
  });
});
