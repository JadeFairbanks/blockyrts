// Messages between the page and the mesh workers. Each mesh worker keeps a
// mirror of the world (same seed and players, so the same generated land)
// with the sim's chunk deltas applied, and turns chunks into drawable arrays.
import type { ChunkDelta } from '@blockyrts/sim';
import type { MeshArrays } from './mesher.ts';

export type ToMesh =
  | { type: 'init'; seed: number; players: number }
  | { type: 'deltas'; deltas: ChunkDelta[] }
  /** lod is the sample step in columns: 1 is full detail, 2, 4, 8 less. */
  | { type: 'mesh'; id: number; cx: number; cz: number; lod: number; simStep: number; scenery: boolean }
  | { type: 'minimap'; id: number; cx: number; cz: number };

/** A prop in a full-detail chunk, for selection and the panel. Positions in metres from the chunk corner. */
export interface PropSummary {
  index: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  /** Bounding box half sizes, metres. */
  hx: number;
  hy: number;
  hz: number;
  amount: number;
  /** What it holds when grown (sim PropView.most). */
  most: number;
  /** Growth stage (sim Stage). */
  stage: number;
  /** The sim step it reaches its next growth stage, or -1 once grown. */
  nextAt: number;
  /** Its cubes in the chunk's cube mesh: the first and how many (Patch 5, UI-5: the hover outline draws just them). */
  first: number;
  cubes: number;
}

export interface MeshResult {
  type: 'mesh';
  id: number;
  cx: number;
  cz: number;
  lod: number;
  land: MeshArrays;
  water: MeshArrays | null;
  /** Prop and scenery cubes, CUBE_STRIDE floats each (full detail only). */
  cubes: Float32Array | null;
  props: PropSummary[];
  /** Ground tops in terrain units, size x size samples (row-major, z then x). */
  heights: Int16Array;
  size: number;
  /** Milliseconds spent, for the debug panel. */
  ms: number;
}

export interface MinimapResult {
  type: 'minimap';
  id: number;
  cx: number;
  cz: number;
  /** 16 x 16 RGBA. */
  rgba: Uint8ClampedArray;
}

export type FromMesh = MeshResult | MinimapResult;
