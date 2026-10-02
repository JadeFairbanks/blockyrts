// World <-> minimap canvas mapping. Pure. North (-z) is up, as in the game view.

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** The smallest area the minimap shows, metres a side. */
export const MIN_MINIMAP_SIDE = 300;

/** Grows bounds about their centre so each side is at least MIN_MINIMAP_SIDE. */
export function normalizeBounds(b: Bounds): Bounds {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const hw = Math.max(b.maxX - b.minX, MIN_MINIMAP_SIDE) / 2;
  const hh = Math.max(b.maxZ - b.minZ, MIN_MINIMAP_SIDE) / 2;
  return { minX: cx - hw, minZ: cz - hh, maxX: cx + hw, maxZ: cz + hh };
}

/** Canvas pixels = world metres * scale + offset; the bounds fit the canvas, centred, keeping their shape. */
export interface MapTransform {
  scale: number;
  ox: number;
  oy: number;
}

export function fitBounds(b: Bounds, width: number, height: number): MapTransform {
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  const scale = Math.min(width / w, height / h);
  return { scale, ox: (width - w * scale) / 2 - b.minX * scale, oy: (height - h * scale) / 2 - b.minZ * scale };
}

export function worldToMap(t: MapTransform, x: number, z: number): { x: number; y: number } {
  return { x: x * t.scale + t.ox, y: z * t.scale + t.oy };
}

/** The world point under a canvas point, clamped to the bounds. */
export function mapToWorld(t: MapTransform, b: Bounds, px: number, py: number): { x: number; z: number } {
  const x = (px - t.ox) / t.scale;
  const z = (py - t.oy) / t.scale;
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), z: Math.min(b.maxZ, Math.max(b.minZ, z)) };
}

export function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.minX === b.minX && a.minZ === b.minZ && a.maxX === b.maxX && a.maxZ === b.maxZ;
}
