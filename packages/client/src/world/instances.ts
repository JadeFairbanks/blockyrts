// Handing an InstancedMesh this frame's count. Most instanced meshes here are
// sized for their busiest moment (2048 attachments, 3000 particles) and fill
// only their first rows each frame. three.js sends a whole attribute to the
// GPU when no update range is set, so every frame used to send megabytes of
// empty rows; and a mesh with nothing in it still had its material set up and
// its uniforms sent for a draw of nothing, in the main, shadow and outline
// passes alike.
import type * as THREE from 'three';

/**
 * Draws the first n instances and sends the GPU only those rows, of the
 * matrices, the colours and any extra per-instance attributes. An empty mesh
 * leaves every camera's layer, so three.js skips it outright; `visible` stays
 * its owner's to set.
 */
export function showInstances(mesh: THREE.InstancedMesh, n: number, ...more: THREE.BufferAttribute[]): void {
  mesh.count = n;
  mesh.layers.mask = n > 0 ? 1 : 0;
  if (n === 0) return;
  sendRows(mesh.instanceMatrix, n);
  if (mesh.instanceColor) sendRows(mesh.instanceColor, n);
  for (const a of more) sendRows(a, n);
}

/** Marks the first n rows of an attribute for upload (and only those). */
export function sendRows(a: THREE.BufferAttribute, n: number): void {
  a.clearUpdateRanges();
  a.addUpdateRange(0, n * a.itemSize);
  a.needsUpdate = true;
}
