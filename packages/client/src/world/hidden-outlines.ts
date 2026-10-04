// Jade's Patch 3: when one of the player's own units is 80% or more hidden
// from the camera (by trees, buildings, very large units, the land), a 2D
// outline is drawn round its silhouette, over whatever hides it. Not the
// selection box: the outline follows the unit's posed model.
//
// How much of each unit is hidden is measured on the graphics card, a few
// times a second, at a quarter of the screen's resolution and only over the
// part of the screen where the player's units stand: the scene is drawn there
// in flat black with the player's units in their ids (what is left of each
// unit is what can be seen), and beside it the player's units alone (all of
// each unit). The two are read back without stalling the frame, and each
// unit's share of pixels gone is its hidden share. The outline itself is a
// mask of the outlined units' silhouettes and one screen pass that draws a
// line round the mask's edge, both kept to the outlined units' corner of the
// screen. With no unit outlined that part costs nothing.
import * as THREE from 'three';
import { MarkMode, setMarkMode } from '../models/index.ts';

/** A unit is outlined once this share of it or more is hidden (Jade). */
export const HIDDEN_ON = 0.8;
/** ... and keeps its outline until less than this share is hidden (s): no flicker at the edge. */
export const HIDDEN_OFF = 0.7;
/** An outline stays at least this long once it is shown, ms (s). */
export const HOLD_MS = 400;
/** How often the hidden shares are measured, ms (s). */
export const SAMPLE_MS = 125;
/** The measuring picture's resolution: pixels to a screen (CSS) pixel each way (s). */
export const COVERAGE_SCALE = 0.25;
/** A unit this few measuring pixels across or fewer is not judged (s). */
export const MIN_PIXELS = 4;
/** The outline's width and the dark edge outside it, screen (CSS) pixels (s). */
export const OUTLINE_PX = 2.5;
export const HALO_PX = 1.5;
/** How far the outline's colour is lifted from the player's colour towards white, as seen on screen (s). */
export const OUTLINE_LIGHTEN = 0.3;

/** One of the local player's own units as drawn this frame: its entity id, its feet (metres), its height and reach from its middle, and whether it is outlined. */
export interface OwnDraw {
  id: number;
  x: number;
  y: number;
  z: number;
  h: number;
  r: number;
  outlined: boolean;
}

/** The units view, as the outlines use it (units-view.ts). */
export interface OutlineSource {
  /** Every unit model, in one group. */
  readonly bodyGroup: THREE.Object3D;
  ownDraws(): readonly OwnDraw[];
  /** Sets the unit models up for a pass (a MarkMode), or back as they were (null). */
  passPools(mode: number | null): void;
  /** Hides (or shows) carried items, loads, shots, beams and bursts, which hide no one. */
  hideExtras(hidden: boolean): void;
}

/** Pixels of a unit in the measuring picture: those left in sight, and all of them. */
export interface Tally {
  seen: number;
  all: number;
}

/** A rectangle of the drawing buffer, pixels from the top left. */
export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Counts each unit's pixels in a measuring picture read back from the card:
 * rows of `rowWidth` RGBA pixels, the scene with the units in it on the left
 * `half`, the units alone on the right. A unit's pixel is its id in rgb with
 * alpha 0; anything else (empty, or something in the way) is not counted.
 */
export function countCoverage(pixels: Uint8Array, rowWidth: number, half: number, rows: number, out: Map<number, Tally>): void {
  const u = new Uint32Array(pixels.buffer, pixels.byteOffset, rowWidth * rows);
  for (let y = 0; y < rows; y++) {
    const row = y * rowWidth;
    for (let x = 0; x < rowWidth; x++) {
      const p = u[row + x]!;
      // Little-endian: red is the low byte, alpha the high.
      if (p === 0 || p >>> 24 !== 0) continue;
      const id = p & 0xffffff;
      let t = out.get(id);
      if (!t) {
        t = { seen: 0, all: 0 };
        out.set(id, t);
      }
      if (x < half) t.seen++;
      else t.all++;
    }
  }
}

/**
 * Which units are outlined: on at HIDDEN_ON hidden, off below HIDDEN_OFF once
 * it has shown for HOLD_MS, and off when the unit is no longer drawn on the
 * screen. A unit too small to judge keeps what it had.
 */
export class HiddenSet {
  readonly ids = new Set<number>();
  private readonly since = new Map<number, number>();

  update(tallies: ReadonlyMap<number, Tally>, now: number): void {
    for (const id of this.ids) {
      if (!tallies.has(id)) this.drop(id);
    }
    for (const [id, t] of tallies) {
      if (t.all < MIN_PIXELS) continue;
      const hidden = 1 - Math.min(t.seen, t.all) / t.all;
      if (this.ids.has(id)) {
        if (hidden < HIDDEN_OFF && now - (this.since.get(id) ?? 0) >= HOLD_MS) this.drop(id);
      } else if (hidden >= HIDDEN_ON) {
        this.ids.add(id);
        this.since.set(id, now);
      }
    }
  }

  clear(): void {
    this.ids.clear();
    this.since.clear();
  }

  private drop(id: number): void {
    this.ids.delete(id);
    this.since.delete(id);
  }
}

const CAM_SPACE = new THREE.Vector3();

/**
 * Where some of the units stand on the screen: the box round their boxes
 * (feet to head, reach either side), clipped to a W by H drawing buffer,
 * whole pixels from the top left; null when none is on the screen. Units
 * behind the camera are skipped.
 */
export function screenBox(draws: readonly OwnDraw[], camera: THREE.Camera, w: number, h: number, outlinedOnly: boolean, near: number): PixelBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const v = CAM_SPACE;
  for (const d of draws) {
    if (outlinedOnly && !d.outlined) continue;
    let ux0 = Infinity;
    let uy0 = Infinity;
    let ux1 = -Infinity;
    let uy1 = -Infinity;
    let behind = false;
    for (let k = 0; k < 8 && !behind; k++) {
      v.set(d.x + (k & 1 ? d.r : -d.r), d.y + (k & 2 ? d.h : 0), d.z + (k & 4 ? d.r : -d.r)).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -near) behind = true;
      v.applyMatrix4(camera.projectionMatrix);
      const px = ((v.x + 1) / 2) * w;
      const py = ((1 - v.y) / 2) * h;
      ux0 = Math.min(ux0, px);
      ux1 = Math.max(ux1, px);
      uy0 = Math.min(uy0, py);
      uy1 = Math.max(uy1, py);
    }
    if (behind) continue;
    // Clip each unit to the screen before joining, so one far off it does not stretch the box.
    ux0 = Math.max(0, ux0);
    uy0 = Math.max(0, uy0);
    ux1 = Math.min(w, ux1);
    uy1 = Math.min(h, uy1);
    if (ux1 <= ux0 || uy1 <= uy0) continue;
    x0 = Math.min(x0, ux0);
    y0 = Math.min(y0, uy0);
    x1 = Math.max(x1, ux1);
    y1 = Math.max(y1, uy1);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const bx = Math.floor(x0);
  const by = Math.floor(y0);
  return { x: bx, y: by, w: Math.ceil(x1) - bx, h: Math.ceil(y1) - by };
}

/** A box grown by m pixels each way and kept inside a W by H buffer. */
export function grow(b: PixelBox, m: number, w: number, h: number): PixelBox {
  const x = Math.max(0, b.x - m);
  const y = Math.max(0, b.y - m);
  return { x, y, w: Math.min(w, b.x + b.w + m) - x, h: Math.min(h, b.y + b.h + m) - y };
}

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// A line round the mask's edge: the pixel is outside the silhouette and the
// silhouette lies within the line's width, or a faint dark edge just past it.
const OUTLINE_FRAGMENT = /* glsl */ `
uniform sampler2D mask;
uniform vec2 texel;
uniform float line;
uniform float halo;
uniform vec3 colour;
varying vec2 vUv;
void main() {
  if (texture2D(mask, vUv).r > 0.5) discard;
  float l = 0.0;
  float e = 0.0;
  for (int k = 0; k < 12; k++) {
    float a = float(k) * 0.5235988;
    vec2 d = vec2(cos(a), sin(a)) * texel;
    l = max(l, max(texture2D(mask, vUv + d * line).r, texture2D(mask, vUv + d * line * 0.5).r));
    e = max(e, texture2D(mask, vUv + d * (line + halo)).r);
  }
  l = smoothstep(0.2, 0.8, l);
  e = smoothstep(0.2, 0.8, e) * 0.55;
  float alpha = l + e * (1.0 - l);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(colour * (l / alpha), alpha);
}
`;

export interface OutlineStats {
  /** Measurements taken, and main-thread milliseconds spent on them (drawing, reading back and counting). */
  samples: number;
  sampleMs: number;
  /** Frames with an outline drawn, and main-thread milliseconds spent drawing them. */
  outlineFrames: number;
  outlineMs: number;
  /** Units outlined now. */
  outlined: number;
}

export class HiddenOutlines {
  private readonly hidden = new HiddenSet();
  private readonly passCam = new THREE.PerspectiveCamera();
  /** The measuring picture: the scene on the left, the units alone on the right. */
  private readonly coverage = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private pixels = new Uint8Array(4);
  private readonly tallies = new Map<number, Tally>();
  private reading = false;
  private lastSample = -Infinity;
  private failures = 0;
  private readonly occluder = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  /** The outlined units' silhouettes, full resolution. */
  private readonly mask = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  private readonly quad: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  private readonly savedClear = new THREE.Color();
  private readonly savedScissor = new THREE.Vector4();
  private readonly hiddenNow: THREE.Object3D[] = [];
  readonly stats: OutlineStats = { samples: 0, sampleMs: 0, outlineFrames: 0, outlineMs: 0, outlined: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly units: OutlineSource,
    playerColour: THREE.Color,
  ) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const srgb = { r: 0, g: 0, b: 0 };
    playerColour.getRGB(srgb, THREE.SRGBColorSpace);
    const lift = (c: number): number => c + (1 - c) * OUTLINE_LIGHTEN;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.mask.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        line: { value: OUTLINE_PX },
        halo: { value: HALO_PX },
        colour: { value: new THREE.Vector3(lift(srgb.r), lift(srgb.g), lift(srgb.b)) },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(g, mat);
    this.quad.frustumCulled = false;
  }

  /** Entity ids of the units to outline, for the units view's next frame. */
  get outlined(): ReadonlySet<number> {
    return this.hidden.ids;
  }

  /** After the frame's scene is drawn to the screen: measures when it is due, then draws the outlines over it. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, now: number): void {
    const draws = this.units.ownDraws();
    if (draws.length === 0) {
      this.hidden.clear();
      this.stats.outlined = 0;
      return;
    }
    renderer.getDrawingBufferSize(this.size);
    if (!this.reading && now - this.lastSample >= SAMPLE_MS && this.failures < 3) {
      this.lastSample = now;
      const t0 = performance.now();
      this.measure(renderer, camera, draws);
      this.stats.sampleMs += performance.now() - t0;
    }
    this.stats.outlined = this.hidden.ids.size;
    if (this.hidden.ids.size > 0 && draws.some((d) => d.outlined)) {
      const t0 = performance.now();
      this.outline(renderer, camera, draws);
      this.stats.outlineMs += performance.now() - t0;
      this.stats.outlineFrames++;
    }
  }

  /** Draws the measuring picture over the player's units' corner of the screen and starts reading it back. */
  private measure(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, draws: readonly OwnDraw[]): void {
    const W = this.size.x;
    const H = this.size.y;
    const box = screenBox(draws, camera, W, H, false, camera.near);
    if (!box) return;
    const k = COVERAGE_SCALE / renderer.getPixelRatio();
    const lw = Math.max(1, Math.ceil(box.w * k));
    const lh = Math.max(1, Math.ceil(box.h * k));
    const rt = this.coverage;
    if (rt.width < lw * 2 || rt.height < lh) rt.setSize(Math.max(rt.width, Math.ceil(W * k) * 2 + 2, lw * 2), Math.max(rt.height, Math.ceil(H * k) + 1, lh));
    const cam = this.passCam;
    cam.copy(camera, false);
    cam.setViewOffset(W, H, box.x, box.y, box.w, box.h);

    const scene = this.scene;
    const background = scene.background;
    const override = scene.overrideMaterial;
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    const target = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClear);
    const clearAlpha = renderer.getClearAlpha();
    // Glass-like things (water, ghosts, lines, loot) and what hangs on the units hide no one.
    const hide = this.hiddenNow;
    hide.length = 0;
    scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m && (Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent)) hide.push(o);
    });
    for (const o of hide) o.visible = false;
    this.units.hideExtras(true);
    try {
      scene.background = null;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      rt.scissorTest = false;
      rt.viewport.set(0, 0, rt.width, rt.height);
      renderer.setRenderTarget(rt);
      renderer.clear(true, true, false);
      // Left: the scene in flat black, the player's units in their ids where they can be seen.
      rt.viewport.set(0, 0, lw, lh);
      renderer.setRenderTarget(rt);
      scene.overrideMaterial = this.occluder;
      setMarkMode(MarkMode.Ids);
      this.units.passPools(MarkMode.Ids);
      renderer.render(scene, cam);
      // Right: the player's units alone, all of each.
      scene.overrideMaterial = override;
      rt.viewport.set(lw, 0, lw, lh);
      renderer.setRenderTarget(rt);
      setMarkMode(MarkMode.Own);
      this.units.passPools(MarkMode.Own);
      renderer.render(this.units.bodyGroup, cam);
    } finally {
      this.units.passPools(null);
      this.units.hideExtras(false);
      for (const o of hide) o.visible = true;
      hide.length = 0;
      scene.overrideMaterial = override;
      scene.background = background;
      renderer.shadowMap.autoUpdate = shadows;
      renderer.autoClear = autoClear;
      renderer.setClearColor(this.savedClear, clearAlpha);
      rt.viewport.set(0, 0, rt.width, rt.height);
      renderer.setRenderTarget(target);
    }
    const n = lw * 2 * lh * 4;
    if (this.pixels.length < n) this.pixels = new Uint8Array(n);
    const view = this.pixels.subarray(0, n);
    this.reading = true;
    this.stats.samples++;
    renderer
      .readRenderTargetPixelsAsync(rt, 0, 0, lw * 2, lh, view)
      .then(() => {
        const t0 = performance.now();
        this.tallies.clear();
        countCoverage(view, lw * 2, lw, lh, this.tallies);
        this.hidden.update(this.tallies, performance.now());
        this.stats.sampleMs += performance.now() - t0;
        this.failures = 0;
      })
      .catch(() => {
        // A lost context or a driver that cannot read back: try a few more times, then stop measuring.
        this.failures++;
      })
      .finally(() => {
        this.reading = false;
      });
  }

  /** The outlined units' silhouettes into the mask, then the line round them onto the screen, both kept to their corner of it. */
  private outline(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, draws: readonly OwnDraw[]): void {
    const W = this.size.x;
    const H = this.size.y;
    const box = screenBox(draws, camera, W, H, true, camera.near);
    if (!box) return;
    const pr = renderer.getPixelRatio();
    const line = OUTLINE_PX * pr;
    const reach = Math.ceil(line + HALO_PX * pr) + 2;
    // The pass reads up to `reach` past what it draws, so the mask is cleared twice as far out.
    const cleared = grow(box, reach * 2, W, H);
    const drawn = grow(box, reach, W, H);
    const mask = this.mask;
    if (mask.width !== W || mask.height !== H) mask.setSize(W, H);
    const autoClear = renderer.autoClear;
    const target = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClear);
    const clearAlpha = renderer.getClearAlpha();
    const scissorTest = renderer.getScissorTest();
    renderer.getScissor(this.savedScissor);
    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      mask.viewport.set(0, 0, W, H);
      mask.scissor.set(cleared.x, H - cleared.y - cleared.h, cleared.w, cleared.h);
      mask.scissorTest = true;
      renderer.setRenderTarget(mask);
      renderer.clear(true, false, false);
      setMarkMode(MarkMode.Outlined);
      this.units.passPools(MarkMode.Outlined);
      renderer.render(this.units.bodyGroup, camera);
      this.units.passPools(null);
      renderer.setRenderTarget(target);
      const u = this.quad.material.uniforms;
      (u.texel!.value as THREE.Vector2).set(1 / W, 1 / H);
      u.line!.value = line;
      u.halo!.value = HALO_PX * pr;
      renderer.setScissorTest(true);
      renderer.setScissor(drawn.x / pr, (H - drawn.y - drawn.h) / pr, drawn.w / pr, drawn.h / pr);
      renderer.render(this.quad, this.quadCam);
    } finally {
      this.units.passPools(null);
      renderer.setScissor(this.savedScissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(this.savedClear, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }

  dispose(): void {
    this.coverage.dispose();
    this.mask.dispose();
    this.occluder.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
