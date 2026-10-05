// Lines drawn over the world each frame: rally routes, Shift queue paths,
// claim and light rings, planned building outlines, marked digs. Rebuilt from
// scratch every frame between begin() and end(); drawn on top of the land.
import * as THREE from 'three';

/** A dotted line's dots: 15 cm long, about one every 45 cm, a column (s). */
export const DOT_M = 0.15;
export const DOT_EVERY_M = 0.45;

export class Overlay {
  private readonly lines: THREE.LineSegments;
  private readonly geometry = new THREE.BufferGeometry();
  private positions = new Float32Array(0);
  private colours = new Float32Array(0);
  private n = 0;

  constructor(scene: THREE.Scene) {
    this.lines = new THREE.LineSegments(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9;
    scene.add(this.lines);
  }

  begin(): void {
    this.n = 0;
  }

  end(): void {
    this.geometry.setDrawRange(0, this.n);
    if (this.positions.length > 0) {
      this.geometry.getAttribute('position').needsUpdate = true;
      this.geometry.getAttribute('color').needsUpdate = true;
    }
    this.lines.visible = this.n > 0;
  }

  private reserve(vertices: number): void {
    const need = (this.n + vertices) * 3;
    if (need <= this.positions.length) return;
    const size = Math.max(need, this.positions.length * 2, 3 * 2048);
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

  line(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color): void {
    this.reserve(2);
    this.vertex(a.x, a.y, a.z, c);
    this.vertex(b.x, b.y, b.z, c);
  }

  /** A dashed line: short dashes every 0.6 m. */
  dashed(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color): void {
    const len = a.distanceTo(b);
    const steps = Math.max(1, Math.floor(len / 0.6));
    this.reserve(steps * 2);
    for (let k = 0; k < steps; k += 1) {
      const t0 = k / steps;
      const t1 = Math.min(1, (k + 0.6) / steps);
      this.vertex(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.z + (b.z - a.z) * t0, c);
      this.vertex(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1, a.z + (b.z - a.z) * t1, c);
    }
  }

  /**
   * A dotted line (Jade's Patch 4: a marked dig nobody selected is working
   * on): dots 15 cm long, about one a column (45 cm), the first centred on
   * `a` and the last on `b`, so corners and ends are marked; `y` gives the
   * height at each end of a dot.
   */
  dotted(ax: number, az: number, bx: number, bz: number, y: (x: number, z: number) => number, c: THREE.Color): void {
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) return;
    const n = Math.max(1, Math.round(len / DOT_EVERY_M));
    const half = DOT_M / 2 / len;
    this.reserve((n + 1) * 2);
    for (let k = 0; k <= n; k++) {
      const t0 = Math.max(0, k / n - half);
      const t1 = Math.min(1, k / n + half);
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      this.vertex(x0, y(x0, z0), z0, c);
      this.vertex(x1, y(x1, z1), z1, c);
    }
  }

  /** A ring on the ground; `heightAt` lifts each point onto the land. */
  ring(x: number, z: number, r: number, c: THREE.Color, heightAt: (x: number, z: number) => number): void {
    const seg = Math.max(16, Math.min(96, Math.round(r * 4)));
    this.reserve(seg * 2);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = x + Math.cos(a0) * r;
      const z0 = z + Math.sin(a0) * r;
      const x1 = x + Math.cos(a1) * r;
      const z1 = z + Math.sin(a1) * r;
      this.vertex(x0, heightAt(x0, z0) + 0.08, z0, c);
      this.vertex(x1, heightAt(x1, z1) + 0.08, z1, c);
    }
  }

  /** A see-through box: its twelve edges (metres). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: THREE.Color): void {
    this.rect(x0, z0, x1, z1, y0, c);
    this.rect(x0, z0, x1, z1, y1, c);
    this.reserve(8);
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as const) {
      this.vertex(x, y0, z, c);
      this.vertex(x, y1, z, c);
    }
  }

  /** A rectangle on the ground (metres). */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, c: THREE.Color): void {
    const p = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ] as const;
    this.reserve(8);
    for (let i = 0; i < 4; i++) {
      const a = p[i]!;
      const b = p[(i + 1) % 4]!;
      this.vertex(a[0], y, a[1], c);
      this.vertex(b[0], y, b[1], c);
    }
  }
}
