// Finished sound files (the redo from the outside sound service): the index
// the build script writes, and how to cut a decoded file back to the exact
// sound. Any sound without a file is still made in code.

/** One encoded sound, as scripts/build-sound-files.ts recorded it. */
export interface FileEntry {
  /** Sample rate of the original WAV. */
  readonly rate: number;
  readonly channels: number;
  /** Length of the sound itself, in frames at `rate`. */
  readonly frames: number;
  /** Frames of wrap-around encoded before a loop (and after it); 0 for one-shots. */
  readonly pre: number;
  /** Frames handed to the encoder: frames + 2 * pre. */
  readonly total: number;
  /** Silence the encoder added at the start and the end (LAME tag), in frames. */
  readonly delay: number;
  readonly padding: number;
}

export interface SoundFileIndex {
  /** File extension of every sound. */
  readonly format: string;
  /** By name: "chop.0", "voice.worker.select.2", "music.day.base", "mob.zombie.call.1". */
  readonly entries: Readonly<Record<string, FileEntry>>;
}

/** Where the files are served from and what there is. */
export interface SoundFiles {
  /** URL of the folder, ending in "/". */
  readonly base: string;
  readonly index: SoundFileIndex;
}

/**
 * The part of a decoded buffer that is the sound: decoders either drop the
 * encoder's start silence and end padding or keep them (and some keep only
 * one), so the decoded length says which, and the start moves to match.
 * `decoded` is in frames at `rate`, the rate it was decoded at.
 */
export function trimRange(e: FileEntry, decoded: number, rate: number): { start: number; length: number } {
  const k = rate / e.rate;
  const options: { len: number; lead: number }[] = [
    { len: e.total, lead: 0 },
    { len: e.total + e.padding, lead: 0 },
    { len: e.delay + e.total, lead: e.delay },
    { len: e.delay + e.total + e.padding, lead: e.delay },
  ];
  let best = options[0]!;
  for (const o of options) if (Math.abs(o.len * k - decoded) < Math.abs(best.len * k - decoded)) best = o;
  const start = Math.min(Math.max(0, decoded - 1), Math.round((best.lead + e.pre) * k));
  return { start, length: Math.max(1, Math.min(Math.round(e.frames * k), decoded - start)) };
}

/** Fetches and decodes one file into `ctx`'s format, cut to the exact sound. */
export async function loadSoundFile(ctx: BaseAudioContext, files: SoundFiles, name: string): Promise<AudioBuffer> {
  const e = files.index.entries[name];
  if (!e) throw new Error(`No file for ${name}`);
  const res = await fetch(`${files.base}${name}.${files.index.format}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const whole = await ctx.decodeAudioData(await res.arrayBuffer());
  const { start, length } = trimRange(e, whole.length, whole.sampleRate);
  if (start === 0 && length === whole.length) return whole;
  const out = ctx.createBuffer(whole.numberOfChannels, length, whole.sampleRate);
  for (let c = 0; c < whole.numberOfChannels; c++) out.copyToChannel(whole.getChannelData(c).subarray(start, start + length), c);
  return out;
}
