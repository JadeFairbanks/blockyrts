// The finished sound files (the sound redo): public/audio/<name>.mp3 and the
// index the build script wrote beside this file
// (`pnpm --filter @blockyrts/audio sounds:build <folder>`). The engine plays
// these and makes any sound without a file in code.
import type { SoundFileIndex, SoundFiles } from '@blockyrts/audio';
import index from './sound-files.json';

export function soundFiles(): SoundFiles {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return { base: `${base}audio/`, index: index as SoundFileIndex };
}
