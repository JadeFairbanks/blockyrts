// The minimap: the world's explored land, painted only when it changes; the
// units and buildings over it (Patch 2: in their owner's colour, enemies in
// red) with the marks on top, a few times a second; and the camera's view
// footprint drawn over it every frame.
import type * as THREE from 'three';
import { LAIR_PING_STEPS, STEPS_PER_SECOND } from '@blockyrts/sim';
import type { Pt } from '../hud/rects.ts';
import type { MinimapSource } from '../selection/types.ts';
import { fitBounds, mapToWorld, normalizeBounds, sameBounds, worldToMap, type Bounds, type MapTransform } from './transform.ts';

const UNEXPLORED = '#0b0e12';
/**
 * A ping's look: an urgent message's gold rings for 4 s, or a new lair's red
 * rings (Patch 3) for the Lairs group's LAIR_PING_STEPS; rgb, how long it
 * shows (ms) and its rings' width (px).
 */
export type PingStyle = 'urgent' | 'lair';
export const PINGS: Readonly<Record<PingStyle, { rgb: string; ms: number; line: number }>> = {
  urgent: { rgb: '255, 210, 90', ms: 4000, line: 2 },
  lair: { rgb: '224, 48, 42', ms: (LAIR_PING_STEPS * 1000) / STEPS_PER_SECOND, line: 2.5 },
};
/** A new ring goes out every 4/3 s, however long the ping lasts. */
const PULSE_MS = 4000 / 3;
/** Pings shown at once: enough for a lair for each of 8 players at one dusk, with urgent messages besides. */
const PINGS_KEPT = 16;
/** Units and buildings are repainted this often, ms. */
const THINGS_MS = 150;

/**
 * Three stacked canvases inside the minimap element: the land, repainted only
 * when the source changes; the units, buildings and marks, a few times a
 * second; and the view footprint, redrawn every frame.
 */
export class Minimap {
  private readonly land: HTMLCanvasElement;
  private readonly things: HTMLCanvasElement;
  private readonly view: HTMLCanvasElement;
  private readonly landCtx: CanvasRenderingContext2D;
  private readonly thingsCtx: CanvasRenderingContext2D;
  private readonly viewCtx: CanvasRenderingContext2D;
  /** When the units and buildings were last painted (ms), or -Infinity to paint them at the next frame. */
  private thingsAt = -Infinity;
  private paintedVersion = -1;
  private paintedBounds: Bounds | null = null;
  private bounds: Bounds = { minX: -150, minZ: -150, maxX: 150, maxZ: 150 };
  private t: MapTransform = { scale: 1, ox: 0, oy: 0 };
  /** Urgent messages' and new lairs' pings: where (metres), when they began (ms) and how they look. */
  private pings: Array<{ x: number; z: number; t0: number; style: PingStyle }> = [];

  constructor(
    readonly el: HTMLElement,
    private source: MinimapSource,
  ) {
    this.land = document.createElement('canvas');
    this.things = document.createElement('canvas');
    this.view = document.createElement('canvas');
    this.land.className = 'minimap-land';
    this.things.className = 'minimap-things';
    this.view.className = 'minimap-view';
    el.append(this.land, this.things, this.view);
    this.landCtx = this.land.getContext('2d')!;
    this.thingsCtx = this.things.getContext('2d')!;
    this.viewCtx = this.view.getContext('2d')!;
  }

  setSource(source: MinimapSource): void {
    this.source = source;
    this.paintedVersion = -1;
    this.thingsAt = -Infinity;
  }

  /** Redraws: the land if it changed, then the view footprint (four ground points, in order round the quad). */
  draw(footprint: readonly THREE.Vector3[] | null): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.el.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.el.clientHeight * dpr));
    const resized = this.land.width !== w || this.land.height !== h;
    if (resized) {
      this.land.width = this.things.width = this.view.width = w;
      this.land.height = this.things.height = this.view.height = h;
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
      this.thingsAt = -Infinity;
    }
    const now = performance.now();
    if (now - this.thingsAt >= THINGS_MS) {
      this.thingsAt = now;
      const c = this.thingsCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      if (this.source.paintThings) {
        c.setTransform(this.t.scale, 0, 0, this.t.scale, this.t.ox, this.t.oy);
        c.save();
        this.source.paintThings(c, dpr);
        c.restore();
      }
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

  /** Pings a spot (an urgent message, or a new lair): rings that grow and fade for a few seconds. */
  ping(x: number, z: number, style: PingStyle = 'urgent'): void {
    this.pings.push({ x, z, t0: performance.now(), style });
    if (this.pings.length > PINGS_KEPT) this.pings.shift();
  }

  private drawPings(ctx: CanvasRenderingContext2D, dpr: number): void {
    const now = performance.now();
    this.pings = this.pings.filter((p) => now - p.t0 < PINGS[p.style].ms);
    for (const p of this.pings) {
      const look = PINGS[p.style];
      const at = worldToMap(this.t, p.x, p.z);
      const k = (now - p.t0) / look.ms;
      for (const lag of [0, 0.35]) {
        const f = ((now - p.t0) / PULSE_MS + lag) % 1;
        ctx.beginPath();
        ctx.arc(at.x, at.y, (3 + f * 14) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${look.rgb}, ${(1 - f) * (1 - k * 0.5)})`;
        ctx.lineWidth = look.line * dpr;
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
