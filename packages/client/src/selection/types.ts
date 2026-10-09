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
  /**
   * Where a double click's "all of this type" draws its line more finely than
   * typeKey (Jade's Patch 5, CT-5): troops split into cavalry, close melee,
   * long melee and each other kind. Absent: typeKey.
   */
  clickType?: string;
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
  /** Props (Patch 5): its kind, its variant, the column it stands on and what it holds, for the stone circles' right clicks. */
  prop?: { kind: number; variant: number; gx: number; gz: number; amount: number };
}

/** Everything near the view; the selection code filters by screen. */
export interface SelectableSource {
  candidates(): Iterable<Selectable>;
}

/** The ground under a screen point: given a raycaster already set from the camera, the hit point or null. */
export type GroundPicker = (ray: THREE.Raycaster) => THREE.Vector3 | null;

export interface MinimapSource {
  /** World-space rectangle (metres) of all the land the minimap could show: the explored bounds, never smaller than 300 m a side. */
  bounds(): { minX: number; minZ: number; maxX: number; maxZ: number };
  /** Called when the minimap needs a redraw; paint explored land into ctx, which is already transformed so 1 unit = 1 metre in world x/z. `shown` is the part of the land the minimap shows. */
  paint(ctx: CanvasRenderingContext2D, shown?: { minX: number; minZ: number; maxX: number; maxZ: number }): void;
  /** A counter that increases whenever paint would draw something different. */
  version(): number;
  /**
   * Paints what moves over the land, a few times a second: units and
   * buildings in their owner's colour, enemies in sight in red, then the
   * marks (lairs, villages, peoples). Same transform as paint; `dpr` device
   * pixels make one CSS pixel. `shown` is the part of the land the minimap
   * shows: marks off it are pinned to its edge.
   */
  paintThings?(ctx: CanvasRenderingContext2D, dpr: number, shown?: { minX: number; minZ: number; maxX: number; maxZ: number }): void;
  /** The camera's focus (metres), which the minimap follows over land too big to show whole (Patch 5 BG-5). */
  focus?(): { x: number; z: number } | null;
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

/** The loot id in a key of the form 'l:<id>' (loot on the ground), or null for anything else. */
export function lootIdOf(key: string): number | null {
  if (!key.startsWith('l:')) return null;
  const id = Number(key.slice(2));
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/** The building id in a key of the form 'b:<id>', or null for anything else. */
export function buildingIdOf(key: string): number | null {
  if (!key.startsWith('b:')) return null;
  const id = Number(key.slice(2));
  return Number.isInteger(id) && id >= 0 ? id : null;
}
