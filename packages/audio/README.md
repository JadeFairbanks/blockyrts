# @blockyrts/audio

Every sound and piece of music in Survive and Conquer. The game plays the
sound redo's finished recordings (MP3s in `packages/client/public/audio/`,
listed in `packages/client/src/audio/sound-files.json`) and keeps a version
of every sound generated in code behind them: any sound whose file is
missing or will not load is synthesised from oscillators, noise, envelopes
and filters, and the music is note data played by small synthetic
instruments. Renders are seeded, so the same sound always comes out the same.

## Sound files

`pnpm --filter @blockyrts/audio sounds:build <folder>` (needs ffmpeg) turns a
folder of WAVs named as in the project's `audio/sound-redo-brief.txt` into
the MP3s and the index. It refuses a folder missing any sound, take or music
stem the game plays, and takes the extras when they are there: the night
monsters' calls and deaths (`mob.<name>.call|death`, see `MOB_SOUND_NAMES`),
the ambience loops and the menu theme, which exist only as files. The index
records each sound's exact length and the MP3 encoder's added silence, and
`trimRange` (`src/engine/files.ts`) cuts a decoded file back to the sound
whether the browser dropped that silence or not. Loops are encoded with a
second of their own end before and start after, and cut back, so they have
no seam. The WAVs are never committed.

## Listening

```sh
pnpm audio:dev
```

opens the audition page at http://localhost:5174. Press **Start audio**,
then play any sound, voice cue or music state; the tension slider fades in a
state's fight layers and the pad sets where positional sounds play.
`pnpm --filter @blockyrts/audio render out/` writes everything as WAV files
instead (not committed).

## What is here

| Part | File | What it covers (doc: Audio) |
|---|---|---|
| Sound list | `src/manifest.ts` | Every sound id, its generator, parameters, level, variants and volume slider. The doc's list (chopping, mining, digging, building, hits, blocks, deaths, explosions, torch lit and snuffed, horns at dusk and dawn, idle-worker alert, map pings, error) plus a few the doc implies: shots, spell casts, urgent and war alerts, interface ticks |
| Generators | `src/sfx/generators.ts` | Strikes, digging, chimes, horns, explosions, flame, snuffing, bowstrings, sparkles, monster deaths, collapses, clicks |
| Unit voices | `src/voice/voices.ts` | Non-verbal formant-synth cues for 11 families (worker, warrior, mage; Halflings, Runkin, Elves, Dwarves; goblins, kobolds, gnolls, hobgoblins) and the events each voices: selected, order taken, attack, hungry, under attack, resource run out, can't do that, greeting, trade, warning, spotting, death |
| Music | `src/music/score.ts`, `instruments.ts`, `render.ts` | Day, dusk, night and dawn as looping note data in two stems: base, and tension (fight layers the game fades in) |
| Engine | `src/engine/engine.ts` | The Web Audio API the client uses |
| Audition page | `index.html`, `src/audition/` | Its own Vite entry, separate from the client |

## Using it from the client

```ts
import { AudioEngine } from '@blockyrts/audio';

const audio = new AudioEngine({ files });        // files: { base, index }; omit to make everything in code
audio.attachUnlock();                          // browsers unlock audio on the first click or key
audio.setMusicState('day');                    // crossfades; 'dusk', 'night', 'dawn', or null
audio.prepareMusic('night');                   // render a state ahead of time
audio.setMusicIntensity(0.8);                  // fights on screen raise the tension layers
audio.setListener(camX, camZ, rightX, rightZ); // each frame: the camera's ground point, metres
audio.play('chop', { x, z });                  // a sound in the world, with falloff and panning
audio.voice('worker', 'acknowledge', { x, z });
audio.play('horn_dusk');                       // flat alerts and interface sounds take no position
audio.setVolume('music', 0.5);                 // Settings sliders: master, music, effects, voice
audio.setAmbience('night');                    // the background loop: 'day', 'night' or null
audio.hasSound('mob.zombie.call');             // whether a sound can play (file-only sounds need their file)
```

Everything renders in a Web Worker once (about two seconds for all sounds,
two to four seconds per music state; a state renders on first use, and the
next state in the day's cycle renders ahead of time). Sounds the client plays
before they are ready are skipped. Audio fades out and suspends while the
tab is hidden. Per-sound instance caps and a 48-voice limit keep big battles
from turning to mush; a limiter keeps them from clipping.

Audio never feeds the simulation, so this package uses floats and
`Math.random` for playback variety; renders themselves are seeded.

## Tests

`test/audio.test.ts` renders every sound and variant and both stems of every
music state offline in Node and checks length, peak level, silence, clicks at
the ends, that variants differ, that renders repeat exactly, that loops are
seamless, and that the doc's Audio list still matches the manifest.
