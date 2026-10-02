// The minimap: the world's explored land, painted only when it changes, and
// the camera's view footprint drawn over it every frame.
import type * as THREE from 'three';
import type { Pt } from '../hud/rects.ts';
import type { MinimapSource } from '../selection/types.ts';
import { fitBounds, mapToWorld, normalizeBounds, sameBounds, worldToMap, type Bounds, type MapTransform } from './transform.ts';

const UNEXPLORED = '#0b0e12';
/** How long a ping shows, ms. */
const PING_MS = 4000;

/**
 * Two stacked canvases inside the minimap element: the land, repainted only
 * when the source changes, and the view footprint, redrawn every frame.
 */
export class Minimap {
  private readonly land: HTMLCanvasElement;
  private readonly view: HTMLCanvasElement;
  private readonly landCtx: CanvasRenderingContext2D;
  private readonly viewCtx: CanvasRenderingContext2D;
  private paintedVersion = -1;
  private paintedBounds: Bounds | null = null;
  private bounds: Bounds = { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
  private t: MapTransform = { scale: 1, ox: 0, oy: 0 };
  /** Urgent messages' pings: where (metres) and when they began (ms). */
  private pings: Array<{ x: number; z: number; t0: number }> = [];

  constructor(
    readonly el: HTMLElement,
    private source: MinimapSource,
  ) {
    this.land = document.createElement('canvas');
    this.view = document.createElement('canvas');
    this.land.className = 'minimap-land';
    this.view.className = 'minimap-view';
    el.append(this.land, this.view);
    this.landCtx = this.land.getContext('2d')!;
    this.viewCtx = this.view.getContext('2d')!;
  }

  setSource(source: MinimapSource): void {
    this.source = source;
    this.paintedVersion = -1;
  }

  /** Redraws: the land if it changed, then the view footprint (four ground points, in order round the quad). */
  draw(footprint: readonly THREE.Vector3[] | null): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.el.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.el.clientHeight * dpr));
    const resized = this.land.width !== w || this.land.height !== h;
    if (resized) {
      this.land.width = this.view.width = w;
      this.land.height = this.view.height = h;
    }
    const b = normalizeBounds(this.source.bounds());
    const version = this.source.version();
    if (resized || version !== this.paintedVersion || !this.paintedBounds || !sameBounds(b, this.paintedBounds)) {
      this.bounds = b;
      this.t = fitBounds(b, w, h);
      const c = this.landCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = UNEXPLORED;
      c.fillRect(0, 0, w, h);
      c.setTransform(this.t.scale, 0, 0, this.t.scale, this.t.ox, this.t.oy);
      c.save();
      this.source.paint(c);
      c.restore();
      this.paintedVersion = version;
      this.paintedBounds = b;
    }

    const ctx = this.viewCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (footprint && footprint.length === 4) {
      ctx.beginPath();
      footprint.forEach((v, i) => {
        const p = worldToMap(this.t, v.x, v.z);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.25 * dpr;
      ctx.stroke();
    }
    this.drawPings(ctx, dpr);
  }

  /** Pings a spot (an urgent message): rings that grow and fade for a few seconds. */
  ping(x: number, z: number): void {
    this.pings.push({ x, z, t0: performance.now() });
    if (this.pings.length > 8) this.pings.shift();
  }

  private drawPings(ctx: CanvasRenderingContext2D, dpr: number): void {
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.t0 < PING_MS);
    for (const p of this.pings) {
      const at = worldToMap(this.t, p.x, p.z);
      const k = (now - p.t0) / PING_MS;
      for (const lag of [0, 0.35]) {
        const f = (k * 3 + lag) % 1;
        ctx.beginPath();
        ctx.arc(at.x, at.y, (3 + f * 14) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 210, 90, ${(1 - f) * (1 - k * 0.5)})`;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
    }
  }

  /** The world point under a screen point on the minimap, clamped to the shown area. */
  toWorld(p: Pt): { x: number; z: number } {
    const r = this.el.getBoundingClientRect();
    const px = ((p.x - r.left) / Math.max(1, r.width)) * this.land.width;
    const py = ((p.y - r.top) / Math.max(1, r.height)) * this.land.height;
    return mapToWorld(this.t, this.bounds, px, py);
  }
}
