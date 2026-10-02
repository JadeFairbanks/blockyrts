// What the selection looks like in the world: a ring on the ground under each
// selected thing, a bright box around what a drag box (or the cursor) would
// pick, and a short ring at the target of each accepted order.
import * as THREE from 'three';
import type { Selectable } from './types.ts';

const RING_SEGMENTS = 24;
const OWN = new THREE.Color(0x63e06b);
const NOBODY_COL = new THREE.Color(0xf2d24b);
const OTHER = new THREE.Color(0xff5c5c);
const HOVER = new THREE.Color(0xffffff);

interface Marker {
  x: number;
  y: number;
  z: number;
  colour: THREE.Color;
  born: number;
}
const MARKER_S = 0.6;

export class SelectionVisuals {
  private readonly lines: THREE.LineSegments;
  private readonly geometry = new THREE.BufferGeometry();
  private positions = new Float32Array(0);
  private colours = new Float32Array(0);
  private n = 0;
  private readonly markers: Marker[] = [];

  constructor(scene: THREE.Scene) {
    this.lines = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    scene.add(this.lines);
  }

  /** Colour for a thing: green for the player's own, yellow for nobody's, red for anyone else's. */
  static colourFor(t: Selectable, player: number): THREE.Color {
    return t.owner === player ? OWN : t.owner === 255 ? NOBODY_COL : OTHER;
  }

  /** A short ring at an accepted order's target: green for a move, yellow for a target (a node, a building, a unit). */
  orderMarker(at: THREE.Vector3, kind: 'move' | 'target' = 'move'): void {
    this.markers.push({ x: at.x, y: at.y, z: at.z, colour: kind === 'move' ? OWN : NOBODY_COL, born: performance.now() });
  }

  update(selected: readonly Selectable[], highlighted: readonly Selectable[], player: number, now: number): void {
    this.n = 0;
    for (const t of selected) {
      const r = Math.max(t.halfSize.x, t.halfSize.z) * 1.35 + 0.2;
      this.ring(t.centre.x, t.centre.y - t.halfSize.y + 0.05, t.centre.z, r, SelectionVisuals.colourFor(t, player));
    }
    for (const t of highlighted) this.box(t);
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i]!;
      const age = (now - m.born) / 1000 / MARKER_S;
      if (age >= 1) {
        this.markers.splice(i, 1);
        continue;
      }
      this.ring(m.x, m.y + 0.05, m.z, 1.2 * (1 - age) + 0.2, m.colour);
    }
    this.geometry.setDrawRange(0, this.n);
    if (this.positions.length > 0) this.markDirty();
    this.lines.visible = this.n > 0;
  }

  private markDirty(): void {
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
  }

  private reserve(vertices: number): void {
    const need = (this.n + vertices) * 3;
    if (need <= this.positions.length) return;
    const size = Math.max(need, this.positions.length * 2, 3 * 1024);
    const p = new Float32Array(size);
    const c = new Float32Array(size);
    p.set(this.positions);
    c.set(this.colours);
    this.positions = p;
    this.colours = c;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3).setUsage(THREE.DynamicDrawUsage));
  }

  private vertex(x: number, y: number, z: number, c: THREE.Color): void {
    const o = this.n * 3;
    this.positions[o] = x;
    this.positions[o + 1] = y;
    this.positions[o + 2] = z;
    this.colours[o] = c.r;
    this.colours[o + 1] = c.g;
    this.colours[o + 2] = c.b;
    this.n++;
  }

  private ring(x: number, y: number, z: number, r: number, c: THREE.Color): void {
    this.reserve(RING_SEGMENTS * 2);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a0 = (i / RING_SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / RING_SEGMENTS) * Math.PI * 2;
      this.vertex(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r, c);
      this.vertex(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, c);
    }
  }

  private box(t: Selectable): void {
    this.reserve(24);
    const pad = 0.08;
    const hx = t.halfSize.x + pad;
    const hy = t.halfSize.y + pad;
    const hz = t.halfSize.z + pad;
    const c = t.centre;
    const corners: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) corners.push([c.x + (i & 1 ? hx : -hx), c.y + (i & 2 ? hy : -hy), c.z + (i & 4 ? hz : -hz)]);
    const edges = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
    for (const e of edges) {
      const k = corners[e]!;
      this.vertex(k[0], k[1], k[2], HOVER);
    }
  }
}
