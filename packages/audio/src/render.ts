// Renders any sound in the manifest to a mono buffer. Pure: the same id,
// variant and sample rate always give the same samples, in a browser worker
// or in Node.
import { Reverb, finishOneShot, hashString, makeRng, samples } from './dsp/core.ts';
import { soundDef, type AnySoundDef } from './manifest.ts';
import { GENERATORS, type GenContext } from './sfx/generators.ts';
import { voice } from './voice/voices.ts';

export function renderDef(def: AnySoundDef, variant: number, sr: number): Float32Array {
  const ctx: GenContext = { sr, rng: makeRng(hashString(`${def.id}#${variant}`)), variant };
  let buf: Float32Array;
  if (def.gen === 'voice') buf = voice(ctx, def.params);
  else {
    const gen = GENERATORS[def.gen] as (c: GenContext, p: unknown) => Float32Array;
    buf = gen(ctx, def.params);
  }
  if (def.reverb) buf = addReverb(buf, sr, def.reverb.mix, def.reverb.room);
  return finishOneShot(buf, sr, def.level);
}

export function renderSound(id: string, variant: number, sr: number): Float32Array {
  const def = soundDef(id);
  if (!def) throw new Error(`Unknown sound "${id}"`);
  return renderDef(def, variant % def.variants, sr);
}

function addReverb(dry: Float32Array, sr: number, mix: number, room: number): Float32Array {
  const out = new Float32Array(dry.length + samples(1.5 * room + 0.3, sr));
  const verb = new Reverb(sr, room, 0.4);
  for (let i = 0; i < out.length; i++) {
    const x = i < dry.length ? dry[i]! : 0;
    out[i] = x + verb.process(x) * mix * 4;
  }
  return out;
}
