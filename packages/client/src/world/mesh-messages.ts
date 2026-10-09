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
  | { type: 'minimap'; id: number; cx: number; cz: number }
  /** The prop models loaded so far, with their rest bounds (min x, y, z, max x, y, z, metres): props with one leave out their cubes. */
  | { type: 'propModels'; bounds: Array<[string, number, number, number, number, number, number]> };

/** Where a prop's catalogue model stands (prop-models.ts), metres from the chunk corner. */
export interface PropModelPlace {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  clip?: string;
  copies?: ReadonlyArray<readonly [number, number, number]>;
}

/** A prop in a full-detail chunk, for selection and the panel. Positions in metres from the chunk corner. */
export interface PropSummary {
  index: number;
  kind: number;
  /** The column it stands on, in the chunk. */
  lx: number;
  lz: number;
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
  /** Its seeded variant (a stone circle piece's heading, look, circle type and circle). */
  variant: number;
  /** Its catalogue model, once loaded (it has no cubes then), or null. */
  model: PropModelPlace | null;
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
  /** Prop models this chunk would draw that are not loaded yet: the view asks the library for them first. */
  wants: string[];
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

/** Where the bands lie (columns): the main bases they are measured from, and where each after the Heartland starts. */
export interface BandsResult {
  type: 'bands';
  anchors: Array<[number, number]>;
  starts: number[];
}

export type FromMesh = MeshResult | MinimapResult | BandsResult;
