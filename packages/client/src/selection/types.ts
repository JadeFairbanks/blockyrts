// The interfaces the selection, camera and minimap code is written against.
// The world code implements them; main.ts has the M0 stand-ins.
import type * as THREE from 'three';

export interface Selectable {
  /** Unique and stable, e.g. 'e:12' for entity 12, 'p:<chunk>:<index>' for a resource node. */
  key: string;
  kind: 'unit' | 'building' | 'node';
  /** Player index 0..7, or 255 for nobody. */
  owner: number;
  /** 'worker', 'warrior', 'node:pine', ... used for "all of this type". */
  typeKey: string;
  /** World-space centre of its bounding box, metres. */
  centre: THREE.Vector3;
  /** World-space half extents. */
  halfSize: THREE.Vector3;
  /** Shown in the selection panel, e.g. 'Worker' or 'Pine (20 lumber)'. */
  label: string;
  /** Extra lines for the panel when it is the only thing selected. */
  details?: string[];
  /** Resource nodes: what gathering it gives ('' for nothing gatherable). */
  resource?: string;
}

/** Everything near the view; the selection code filters by screen. */
export interface SelectableSource {
  candidates(): Iterable<Selectable>;
}

/** The ground under a screen point: given a raycaster already set from the camera, the hit point or null. */
export type GroundPicker = (ray: THREE.Raycaster) => THREE.Vector3 | null;

export interface MinimapSource {
  /** World-space rectangle (metres) the minimap should show: the explored bounds, never smaller than 300 m a side. */
  bounds(): { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Called when the minimap needs a redraw; paint explored land into ctx, which is already transformed so 1 unit = 1 metre in world x/z. */
  paint(ctx: CanvasRenderingContext2D): void;
  /** A counter that increases whenever paint would draw something different. */
  version(): number;
}

/** The world rectangle the camera focus may move in, metres. */
export interface CameraLimits {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** No player: resource nodes, wild things. */
export const NOBODY = 255;

/** The entity id in a key of the form 'e:<id>', or null for anything else. */
export function entityIdOf(key: string): number | null {
  if (!key.startsWith('e:')) return null;
  const id = Number(key.slice(2));
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/** The building id in a key of the form 'b:<id>', or null for anything else. */
export function buildingIdOf(key: string): number | null {
  if (!key.startsWith('b:')) return null;
  const id = Number(key.slice(2));
  return Number.isInteger(id) && id >= 0 ? id : null;
}
