// The music, as note data. Five states from the doc's Audio list: day, dusk,
// night, dawn and blood night. Each state is a loop of whole bars made of
// layers; layers go into one of two stems: "base", which always plays, and
// "tension", which the game fades in by intensity (a fight by day, a wave
// at the walls by night).
//
// Pattern notation, one token per step (an eighth note unless a state says
// otherwise): a note such as C4, F#3 or Bb2; a chord such as G3+B3+D4; "."
// for a rest; "-" to hold the previous note. A "!" suffix accents a note,
// "_" softens it. Drum patterns use drum letters (see DRUMS) instead of
// notes. "|" separates bars for reading and is ignored. A pattern shorter
// than the loop repeats.
import type { InstrumentId } from './instruments.ts';

export type MusicStateId = 'day' | 'dusk' | 'night' | 'dawn' | 'blood_night';
export const MUSIC_STATES: readonly MusicStateId[] = ['day', 'dusk', 'night', 'dawn', 'blood_night'];

export type Stem = 'base' | 'tension';

export interface Layer {
  readonly name: string;
  readonly instrument: InstrumentId | 'drums';
  readonly stem: Stem;
  readonly pattern: string;
  readonly gain: number;
  /** -1 left to 1 right. */
  readonly pan: number;
  /** Reverb send, 0 to 1. */
  readonly reverb: number;
}

export interface MusicStateDef {
  readonly id: MusicStateId;
  readonly title: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly stepsPerBeat: number;
  readonly bars: number;
  /** Reverb room size, 0 to 1. */
  readonly room: number;
  readonly layers: readonly Layer[];
}

/** Repeats each bar pattern `n` times. */
const rep = (n: number, bar: string): string => Array.from({ length: n }, () => bar).join(' | ');

/** Turns a note name up an octave: C2 to C3. */
const oct = (note: string): string => note.replace(/(-?\d)$/, (d) => String(Number(d) + 1));

/** A held chord for a whole bar of `steps` steps. */
const held = (chords: readonly string[], steps: number): string =>
  chords.map((c) => [c, ...Array.from({ length: steps - 1 }, () => '-')].join(' ')).join(' | ');

// ---------------------------------------------------------------- day
// G major, a pastoral walk: lute melody, flute answers, pad, bass, frame drum.

const DAY_CHORDS = ['G3+B3+D4', 'G3+B3+E4', 'G3+C4+E4', 'F#3+A3+D4', 'G3+B3+D4', 'F#3+B3+D4', 'G3+C4+E4', 'F#3+A3+D4',
  'G3+B3+E4', 'G3+C4+E4', 'G3+B3+D4', 'F#3+A3+D4', 'G3+C4+E4', 'G3+B3+D4', 'A3+C4+E4', 'F#3+A3+D4'];
const DAY_ROOTS = ['G2', 'E2', 'C2', 'D2', 'G2', 'B1', 'C2', 'D2', 'E2', 'C2', 'G2', 'D2', 'C2', 'G2', 'A1', 'D2'];
const DAY_FIFTHS = ['D3', 'B2', 'G2', 'A2', 'D3', 'F#2', 'G2', 'A2', 'B2', 'G2', 'D3', 'A2', 'G2', 'D3', 'E2', 'A2'];

const day: MusicStateDef = {
  id: 'day',
  title: 'Day',
  bpm: 92,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  room: 0.72,
  layers: [
    { name: 'pad', instrument: 'pad', stem: 'base', pattern: held(DAY_CHORDS, 8), gain: 0.5, pan: 0, reverb: 0.5 },
    { name: 'bass', instrument: 'bass', stem: 'base', pattern: DAY_ROOTS.map((r, i) => `${r} - - . ${DAY_FIFTHS[i]} - . .`).join(' | '), gain: 0.55, pan: 0, reverb: 0.1 },
    {
      name: 'lute', instrument: 'lute', stem: 'base', gain: 0.9, pan: -0.3, reverb: 0.35,
      pattern: [
        'D4 - G4 - A4 B4 A4 G4', 'E4 - - - G4 - E4 D4', 'C4 - E4 G4 E4 - D4 C4', 'D4 - - - . . A3 B3',
        'D4 - G4 - A4 B4 D5 B4', 'A4 - F#4 - D4 - F#4 A4', 'G4 - E4 - C4 - E4 G4', 'F#4 - - - A4 - - -',
        'B4 - - A4 G4 - E4 -', 'E4 G4 - E4 D4 - C4 -', 'D4 - B3 - D4 G4 A4 B4', 'A4 - - - F#4 - D4 -',
        'E4 - G4 - C5 - B4 A4', 'B4 - - D5 - B4 A4 G4', 'A4 - C5 - B4 - A4 G4', 'F#4 - - - D4 - . .',
      ].join(' | '),
    },
    {
      name: 'flute', instrument: 'flute', stem: 'base', gain: 0.32, pan: 0.35, reverb: 0.5,
      pattern: [
        '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . . . . .',
        '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . D5 - E5 -',
        'G5 - - - - - E5 -', 'E5 - - - D5 - - -', 'B4 - - - - - - -', 'A4 - - - - - - -',
        'G4 - - - C5 - - -', 'D5 - - - - - - -', 'E5 - - - C5 - - -', 'D5 - - - - - - -',
      ].join(' | '),
    },
    { name: 'frame drum', instrument: 'drums', stem: 'base', pattern: rep(16, 'H_ . . s_ h_ . s_ .'), gain: 0.5, pan: 0.1, reverb: 0.2 },
    { name: 'war drums', instrument: 'drums', stem: 'tension', pattern: rep(16, 'T! . t . T . t t'), gain: 0.65, pan: -0.1, reverb: 0.3 },
    { name: 'horn calls', instrument: 'brass', stem: 'tension', pattern: rep(2, '. . . . . . . . | . . . . . . . . | . . . . . . . . | D3 - - - G3 - - - | . . . . . . . . | . . . . . . . . | . . . . . . . . | A3 - - - D3 - - -'), gain: 0.5, pan: 0.2, reverb: 0.5 },
  ],
};

// ---------------------------------------------------------------- dusk
// D minor, slow: a low horn sings over a pad, a bell counts down, toms.

const DUSK_CHORDS = ['D3+F3+A3', 'D3+F3+Bb3', 'C3+F3+A3', 'C#3+E3+A3', 'D3+F3+A3', 'D3+G3+Bb3', 'D3+F3+Bb3', 'C#3+E3+A3'];
const DUSK_ROOTS = ['D2', 'Bb1', 'F2', 'A1', 'D2', 'G1', 'Bb1', 'A1'];

const dusk: MusicStateDef = {
  id: 'dusk',
  title: 'Dusk',
  bpm: 72,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 8,
  room: 0.8,
  layers: [
    { name: 'pad', instrument: 'pad', stem: 'base', pattern: held(DUSK_CHORDS, 8), gain: 0.5, pan: 0, reverb: 0.55 },
    { name: 'bass', instrument: 'bass', stem: 'base', pattern: DUSK_ROOTS.map((r) => `${r} - - - - - - -`).join(' | '), gain: 0.55, pan: 0, reverb: 0.1 },
    {
      name: 'horn', instrument: 'brass', stem: 'base', gain: 0.6, pan: 0.15, reverb: 0.55,
      pattern: 'A3 - - - - - D4 - | F4 - - - D4 - - - | C4 - - - A3 - - - | E4 - - - - - - - | A3 - - - D4 - F4 - | G4 - - - F4 - D4 - | F4 - - - D4 - Bb3 - | A3 - - - - - - -',
    },
    {
      name: 'bell', instrument: 'bell', stem: 'base', gain: 0.32, pan: -0.35, reverb: 0.6,
      pattern: 'D5_ . A4_ . F4_ . A4_ . | D5_ . Bb4_ . F4_ . Bb4_ . | C5_ . A4_ . F4_ . A4_ . | C#5_ . A4_ . E4_ . A4_ . | D5_ . A4_ . F4_ . A4_ . | D5_ . Bb4_ . G4_ . Bb4_ . | D5_ . Bb4_ . F4_ . Bb4_ . | C#5_ . A4_ . E4_ . A4_ .',
    },
    { name: 'toms', instrument: 'drums', stem: 'base', pattern: rep(8, 'T_ . . . . . t_ .'), gain: 0.55, pan: 0, reverb: 0.3 },
    { name: 'war drums', instrument: 'drums', stem: 'tension', pattern: rep(8, 'K! . t . T . t t'), gain: 0.6, pan: 0, reverb: 0.3 },
  ],
};

// ---------------------------------------------------------------- night
// A minor with a Phrygian B flat: drone, a pulsing low ostinato, taiko,
// a dark horn line; the tension stem adds driving drums and high bells.

const NIGHT_CHORDS = ['A2+E3+C4', 'A2+E3+C4', 'F2+C3+A3', 'E2+B2+G#3', 'A2+E3+C4', 'Bb2+F3+D4', 'D3+F3+A3', 'E2+B2+G#3',
  'F2+C3+A3', 'D3+F3+A3', 'A2+E3+C4', 'E2+B2+G#3', 'Bb2+F3+D4', 'F2+C3+A3', 'E2+B2+G#3', 'E2+B2+G#3'];
const NIGHT_ROOTS = ['A1', 'A1', 'F1', 'E1', 'A1', 'Bb1', 'D2', 'E1', 'F1', 'D2', 'A1', 'E1', 'Bb1', 'F1', 'E1', 'E1'];

const night: MusicStateDef = {
  id: 'night',
  title: 'Night',
  bpm: 84,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  room: 0.85,
  layers: [
    { name: 'drone', instrument: 'darkPad', stem: 'base', pattern: held(NIGHT_CHORDS, 8), gain: 0.6, pan: 0, reverb: 0.5 },
    { name: 'ostinato', instrument: 'bass', stem: 'base', pattern: NIGHT_ROOTS.map((r) => `${r}! . ${r}_ . ${r} . ${r}_ ${r}_`).join(' | '), gain: 0.55, pan: 0, reverb: 0.1 },
    { name: 'taiko', instrument: 'drums', stem: 'base', pattern: rep(8, 'K . . . . . K_ . | K . . . T_ . . .'), gain: 0.7, pan: 0, reverb: 0.35 },
    {
      name: 'horn', instrument: 'brass', stem: 'base', gain: 0.45, pan: -0.2, reverb: 0.6,
      pattern: [
        'E4 - - - - - - -', 'D4 - C4 - B3 - C4 -', 'A3 - - - - - - -', 'G#3 - - - B3 - - -',
        'E4 - - - F4 - E4 -', 'D4 - - - F4 - - -', 'D4 - - - A3 - - -', 'B3 - - - - - - -',
        'C4 - - - A3 - C4 -', 'F4 - - - E4 - D4 -', 'E4 - - - C4 - A3 -', 'B3 - - - G#3 - - -',
        'Bb3 - - - D4 - F4 -', 'E4 - - - C4 - - -', 'B3 - - - - - - -', '. . . . . . . .',
      ].join(' | '),
    },
    { name: 'battle drums', instrument: 'drums', stem: 'tension', pattern: rep(16, 'K! . t t K . T t'), gain: 0.65, pan: 0.05, reverb: 0.3 },
    { name: 'alarm bells', instrument: 'bell', stem: 'tension', pattern: rep(4, 'E5 . . F5_ . . . . | . . . . . . . . | E5 . . Bb4_ . . . . | . . . . . . . .'), gain: 0.3, pan: 0.4, reverb: 0.6 },
  ],
};

// ---------------------------------------------------------------- dawn
// F major, slow and open: rising bells, a flute, warm pad and bass.

const DAWN_CHORDS = ['F3+A3+C4', 'E3+G3+C4', 'F3+A3+D4', 'F3+Bb3+D4', 'F3+A3+C4', 'E3+A3+C4', 'F3+Bb3+D4', 'E3+G3+C4'];
const DAWN_BASS = ['F2 - - - C3 - - -', 'C2 - - - G2 - - -', 'D2 - - - A2 - - -', 'Bb1 - - - F2 - - -', 'F2 - - - C3 - - -', 'A1 - - - E2 - - -', 'Bb1 - - - F2 - - -', 'C2 - - - G2 - - -'];
const DAWN_ARP = ['F4_ A4_ C5_ F5_ . . . .', 'E4_ G4_ C5_ E5_ . . . .', 'D4_ F4_ A4_ D5_ . . . .', 'D4_ F4_ Bb4_ D5_ . . . .', 'F4_ A4_ C5_ F5_ . . . .', 'E4_ A4_ C5_ E5_ . . . .', 'D4_ F4_ Bb4_ D5_ . . . .', 'E4_ G4_ C5_ E5_ . . . .'];

const dawn: MusicStateDef = {
  id: 'dawn',
  title: 'Dawn',
  bpm: 66,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 8,
  room: 0.82,
  layers: [
    { name: 'pad', instrument: 'pad', stem: 'base', pattern: held(DAWN_CHORDS, 8), gain: 0.5, pan: 0, reverb: 0.55 },
    { name: 'bass', instrument: 'bass', stem: 'base', pattern: DAWN_BASS.join(' | '), gain: 0.5, pan: 0, reverb: 0.1 },
    { name: 'bells', instrument: 'bell', stem: 'base', pattern: DAWN_ARP.join(' | '), gain: 0.35, pan: -0.35, reverb: 0.6 },
    {
      name: 'flute', instrument: 'flute', stem: 'base', gain: 0.4, pan: 0.3, reverb: 0.55,
      pattern: 'C5 - - - A4 - - - | G4 - - - E4 - C4 - | D4 - F4 - A4 - - - | Bb4 - A4 - G4 - - - | A4 - - - C5 - - - | E5 - - - C5 - A4 - | D5 - - - Bb4 - - - | C5 - - - - - - -',
    },
    { name: 'frame drum', instrument: 'drums', stem: 'tension', pattern: rep(8, 'H . . h_ H . h_ .'), gain: 0.5, pan: 0, reverb: 0.25 },
  ],
};

// ---------------------------------------------------------------- blood night
// C minor, fast and relentless: driven bass, choir, brass stabs, big drums.

const BLOOD_CHORDS = ['C3+G3+C4+Eb4', 'C3+G3+C4+Eb4', 'Ab2+Eb3+C4', 'G2+D3+B3', 'C3+G3+C4+Eb4', 'Db3+Ab3+F4', 'Ab2+Eb3+C4', 'G2+D3+B3',
  'F2+C3+Ab3', 'F2+C3+Ab3', 'Db3+Ab3+F4', 'G2+D3+B3', 'C3+G3+C4+Eb4', 'Db3+Ab3+F4', 'G2+D3+B3', 'G2+D3+B3'];
const BLOOD_ROOTS = ['C2', 'C2', 'Ab1', 'G1', 'C2', 'Db2', 'Ab1', 'G1', 'F1', 'F1', 'Db2', 'G1', 'C2', 'Db2', 'G1', 'G1'];

const bloodNight: MusicStateDef = {
  id: 'blood_night',
  title: 'Blood night',
  bpm: 126,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  room: 0.75,
  layers: [
    { name: 'choir', instrument: 'choir', stem: 'base', pattern: held(BLOOD_CHORDS, 8), gain: 0.5, pan: 0, reverb: 0.55 },
    { name: 'driven bass', instrument: 'growlBass', stem: 'base', pattern: BLOOD_ROOTS.map((r) => `${r}! ${r} ${oct(r)} ${r} ${r}! ${r} ${oct(r)} ${r}`).join(' | '), gain: 0.55, pan: 0, reverb: 0.08 },
    { name: 'drums', instrument: 'drums', stem: 'base', pattern: rep(16, 'B! . S . K K S .'), gain: 0.7, pan: 0, reverb: 0.25 },
    {
      name: 'horn', instrument: 'brightBrass', stem: 'base', gain: 0.55, pan: 0.2, reverb: 0.45,
      pattern: [
        'C4 - - - - - Eb4 -', 'D4 - - - B3 - - -', 'C4 - - - Eb4 - Ab4 -', 'G4 - - - - - - -',
        'C5 - - - Bb4 - G4 -', 'Ab4 - - - F4 - Db4 -', 'Eb4 - - - C4 - Eb4 -', 'D4 - - - B3 - - -',
        'C4 - F4 - Ab4 - C5 -', 'Bb4 - Ab4 - G4 - F4 -', 'Ab4 - - - F4 - Db4 -', 'D4 - - - G4 - - -',
        'C5 - - - G4 - Eb4 -', 'F4 - - - Db4 - - -', 'B3 - - - D4 - F4 -', 'G4 - - - - - - -',
      ].join(' | '),
    },
    { name: 'toms', instrument: 'drums', stem: 'tension', pattern: rep(16, 't t T t t! t T T'), gain: 0.55, pan: -0.15, reverb: 0.25 },
    { name: 'stabs', instrument: 'brightBrass', stem: 'tension', pattern: BLOOD_CHORDS.map((c) => `${c}! . . ${c}_ . . . .`).join(' | '), gain: 0.35, pan: 0.25, reverb: 0.4 },
  ],
};

export const MUSIC: Record<MusicStateId, MusicStateDef> = { day, dusk, night, dawn, blood_night: bloodNight };

/** Seconds in one loop of a state. */
export function loopSeconds(def: MusicStateDef): number {
  return (def.bars * def.beatsPerBar * 60) / def.bpm;
}
