// Unit and creature models: the converter's .glb files drawn as one instanced
// mesh per model type (the old blueprint's technical decisions 7 and 8).
export { loadModelLibrary, openModelLibrary, BAKE_FPS, TURN_CLIP, type BakedClip, type ModelData, type ModelLibrary } from './library.ts';
export { InstancedModel, instancedModelOf, MarkMode, MAX_PARTS, setMarkMode, TEAM_KEY_CHROMA_TOLERANCE, TEAM_KEY_MIN_BLUE, TEAM_KEY_RGB, useTeamKey, type ModelShaderPatch } from './instanced-model.ts';
export type { ModelIndex, ModelSidecar, SidecarBone, SidecarClip } from './format.ts';
