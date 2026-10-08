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

/** Grows bounds to hold every point (metres) with a margin round it: marks the minimap must show wherever they are (Patch 3: every lair, explored land or not). */
export function boundsHolding(b: Bounds, points: ReadonlyArray<{ x: number; z: number }>, margin: number): Bounds {
  const out = { ...b };
  for (const p of points) {
    out.minX = Math.min(out.minX, p.x - margin);
    out.minZ = Math.min(out.minZ, p.z - margin);
    out.maxX = Math.max(out.maxX, p.x + margin);
    out.maxZ = Math.max(out.maxZ, p.z + margin);
  }
  return out;
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

/** The least land the minimap shows across its shorter side once the land is too big to show whole, metres; past that it follows the camera (Patch 5 BG-5). */
export const MAX_MINIMAP_SIDE = 600;

/**
 * The part of the land the minimap shows (Patch 5 BG-5). It fitted all the
 * explored land in, so the farther units went the smaller everything drew,
 * until the map was a thin line with the base a speck on it. Now the land
 * shows whole while it fits in MAX_MINIMAP_SIDE across the minimap's shorter
 * side (aspect: its width over its height), and past that a window of that
 * size round the camera's focus. The window stays put while the focus is
 * inside it, so a click or a drag on the minimap never moves the map under
 * the cursor, and it never strays off the land.
 */
export function minimapWindow(all: Bounds, prev: Bounds | null, focus: { x: number; z: number } | null, aspect: number): Bounds {
  const allW = all.maxX - all.minX;
  const allH = all.maxZ - all.minZ;
  const w = Math.min(allW, MAX_MINIMAP_SIDE * Math.max(1, aspect));
  const h = Math.min(allH, MAX_MINIMAP_SIDE * Math.max(1, 1 / aspect));
  if (w === allW && h === allH) return all;
  const inside = (b: Bounds, x: number, z: number): boolean => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  const keep = prev !== null && Math.abs(prev.maxX - prev.minX - w) < 1e-6 && Math.abs(prev.maxZ - prev.minZ - h) < 1e-6 && (focus === null || inside(prev, focus.x, focus.z));
  if (keep && prev.minX >= all.minX && prev.maxX <= all.maxX && prev.minZ >= all.minZ && prev.maxZ <= all.maxZ) return prev;
  let cx = keep ? (prev.minX + prev.maxX) / 2 : focus ? focus.x : (all.minX + all.maxX) / 2;
  let cz = keep ? (prev.minZ + prev.maxZ) / 2 : focus ? focus.z : (all.minZ + all.maxZ) / 2;
  cx = Math.min(all.maxX - w / 2, Math.max(all.minX + w / 2, cx));
  cz = Math.min(all.maxZ - h / 2, Math.max(all.minZ + h / 2, cz));
  return { minX: cx - w / 2, minZ: cz - h / 2, maxX: cx + w / 2, maxZ: cz + h / 2 };
}
