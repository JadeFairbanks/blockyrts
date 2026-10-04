// @blockyrts/audio: every sound and piece of music in the game, as finished
// files from the sound redo with the code-made versions behind them, and the
// Web Audio engine that plays them. See README.md.
export { AudioEngine, type AudioEngineOptions, type MusicId, type PlayOptions, type VolumeSlider } from './engine/engine.ts';
export { loadSoundFile, trimRange, type FileEntry, type SoundFileIndex, type SoundFiles } from './engine/files.ts';
export { DEFAULT_SPATIAL, falloff, panFor, sliderToGain, type Listener, type SpatialSettings } from './engine/spatial.ts';
export { AMBIENCES, EXTRA_SOUNDS, MOB_SOUND_NAMES, SFX, SOUNDS, VOICES, soundDef, voiceId, type AmbienceId, type AnySoundDef, type FileSoundDef, type MobSoundName, type SfxDef, type SoundGroup, type VoiceDef, type VolumeCategory } from './manifest.ts';
export { MUSIC, MUSIC_STATES, loopSeconds, type MusicStateDef, type MusicStateId } from './music/score.ts';
export { renderMusic, type RenderedMusic } from './music/render.ts';
export { renderDef, renderSound } from './render.ts';
export { FAMILY_EVENTS, VOICE_EVENTS, VOICE_FAMILIES, type VoiceEventId, type VoiceFamilyId } from './voice/voices.ts';
