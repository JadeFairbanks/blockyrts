// The JSON files the model converter writes next to each .glb
// (packages/tools/src/models/convert.ts is the writer; keep the two in step).

export type Vec3 = [number, number, number];

export interface ModelIndex {
  version: 1;
  models: { id: string; category: string; glb: string; json: string }[];
}

export interface SidecarBone {
  name: string;
  /** Index of the parent bone, or -1. Parents come before children. */
  parent: number;
  /** Rest-pose pivot in model space, metres. */
  pivot: Vec3;
  /** Rest local rotation [x, y, z, w]. */
  rotation: [number, number, number, number];
  /** Index into `parts` for bones of an equipment part, else -1. */
  part: number;
}

export interface SidecarClip {
  name: string;
  /** Seconds. */
  length: number;
  /** Looping clips wrap; the others hold their last frame. */
  loop: boolean;
  mode: string;
  /** Key moments in sim steps (20 per second) from the clip start. */
  keys: number[];
}

export interface ModelSidecar {
  version: 1;
  id: string;
  category: string;
  source: string;
  unitMetres: number;
  bones: SidecarBone[];
  /** Equipment parts; vertex attribute _PART is 0 for the body, 1 + index for a part. */
  parts: string[];
  /** The parts shown in Blockbench by default (the model's own kit); absent from sidecars built before Patch 5. */
  partsShown?: string[];
  clips: SidecarClip[];
  /** Rest-pose bounds of the body without parts, metres. */
  bounds: { min: Vec3; max: Vec3 };
  boundsWithParts: { min: Vec3; max: Vec3 };
  texture: { width: number; height: number };
  cubes: number;
  vertices: number;
}
