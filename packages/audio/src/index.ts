// @blockyrts/audio: every sound and piece of music in the game, generated in
// code, and the Web Audio engine that plays them. See README.md.
export { AudioEngine, type AudioEngineOptions, type PlayOptions, type VolumeSlider } from './engine/engine.ts';
export { DEFAULT_SPATIAL, falloff, panFor, sliderToGain, type Listener, type SpatialSettings } from './engine/spatial.ts';
export { SFX, SOUNDS, VOICES, soundDef, voiceId, type AnySoundDef, type SfxDef, type SoundGroup, type VoiceDef, type VolumeCategory } from './manifest.ts';
export { MUSIC, MUSIC_STATES, loopSeconds, type MusicStateDef, type MusicStateId } from './music/score.ts';
export { renderMusic, type RenderedMusic } from './music/render.ts';
export { renderDef, renderSound } from './render.ts';
export { FAMILY_EVENTS, VOICE_EVENTS, VOICE_FAMILIES, type VoiceEventId, type VoiceFamilyId } from './voice/voices.ts';
