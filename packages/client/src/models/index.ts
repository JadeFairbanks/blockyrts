// Unit and creature models: the converter's .glb files drawn as one instanced
// mesh per model type (docs/blueprint.md, technical decisions 7 and 8).
export { loadModelLibrary, BAKE_FPS, type BakedClip, type ModelData, type ModelLibrary } from './library.ts';
export { InstancedModel, MAX_PARTS, TEAM_KEY_CHROMA_TOLERANCE, TEAM_KEY_MIN_BLUE, TEAM_KEY_RGB } from './instanced-model.ts';
export type { ModelIndex, ModelSidecar, SidecarBone, SidecarClip } from './format.ts';
