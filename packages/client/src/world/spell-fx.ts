// Magic on screen (Patch 5: MB-20, MB-22, MB-25, VX-5): glowing motes drawn
// from the effect sprites (fx_magic_*, fx_mana_motes, fx_embers, fx_ripple,
// particle_spark_white) and a soft light, trails behind every bolt of magic in
// flight, the bolts as their own models lit by their own light (tilted along
// their arc and playing their own loops in flight, and a bolt's impact clip
// where it ends), each spell's
// landing model played through its clips (rise, loop, fade), the Beam as a
// stream of light out of the wand's tip, a spell's light gathering at the tip
// while it is cast, and Area blast's ring of force. It
// only reads what the state messages carry (hits, shots, beams, the spells on
// a unit); nothing here goes back to the sim.
import * as THREE from 'three';
import { School, Shot, Spell, SPELLS, type HitEvent } from '@blockyrts/sim';
import { SpellOn } from '../messages.ts';
import { InstancedModel, type ModelData, type ModelLibrary } from '../models/index.ts';
import { showInstances } from './instances.ts';

const SPRITES = import.meta.glob<string>(
  [
    '../../../assets/src/effects/fx_magic_*.png',
    '../../../assets/src/effects/fx_mana_motes.png',
    '../../../assets/src/effects/fx_embers.png',
    '../../../assets/src/effects/fx_ripple.png',
    '../../../assets/src/effects/particle_spark_white.png',
  ],
  { eager: true, query: '?no-inline', import: 'default' },
);

/** A strip of sprite frames, 16 or 8 px each, left to right: animated over a mote's life, or (variants) one picked per mote. */
interface SheetSpec {
  file: string;
  frames: number;
  fps: number;
  variants?: boolean;
}

const SHEETS = {
  violet: { file: 'fx_magic_violet', frames: 6, fps: 10 },
  blue: { file: 'fx_magic_blue', frames: 6, fps: 10 },
  gold: { file: 'fx_magic_gold', frames: 6, fps: 10 },
  green: { file: 'fx_magic_green', frames: 6, fps: 10 },
  hex: { file: 'fx_magic_hex', frames: 6, fps: 10 },
  void: { file: 'fx_magic_void', frames: 6, fps: 10 },
  mana: { file: 'fx_mana_motes', frames: 6, fps: 6 },
  embers: { file: 'fx_embers', frames: 6, fps: 8 },
  ripple: { file: 'fx_ripple', frames: 6, fps: 6 },
  spark: { file: 'particle_spark_white', frames: 4, fps: 0, variants: true },
  // A soft round light drawn here, for halos, flashes and the Beam's core.
  glow: { file: '', frames: 1, fps: 0 },
} as const satisfies Record<string, SheetSpec>;
type Sheet = keyof typeof SHEETS;

/** Motes per sheet at once. */
const MAX_MOTES = 2400;
/** Floats per mote: x y z, vx vy vz, age life, size grow, r g b, alpha, gravity, drag, frame. */
const STRIDE = 17;
/** Landing models of one kind at once. */
const MAX_LANDINGS = 64;
/** Bolts and beam segments of one model at once. */
const MAX_STATIC = 512;
/** How far from where a bolt ends the one that flew there was last drawn, at most, metres: its impact faces the way it flew. */
const BOLT_END_M = 6;
/** Where the body's own wand ends past the hand: its glow gem 10 px out, at 2.8125 cm a px. */
const WAND_TIP_M = 0.28;

export interface MoteOptions {
  /** Size grows by this share of itself each second (negative shrinks). */
  grow?: number;
  /** Metres per second squared, down (negative floats up). */
  gravity?: number;
  /** Share of the speed lost each second. */
  drag?: number;
  alpha?: number;
}

/** One sheet's motes: additive points sized in metres, each fading out over its life. */
class MoteLayer {
  readonly points: THREE.Points;
  private readonly p = new Float32Array(MAX_MOTES * STRIDE);
  private readonly pos = new Float32Array(MAX_MOTES * 3);
  private readonly tint = new Float32Array(MAX_MOTES * 3);
  private readonly look = new Float32Array(MAX_MOTES * 3); // size, alpha, frame
  private readonly geometry = new THREE.BufferGeometry();
  private n = 0;

  constructor(
    scene: THREE.Scene,
    private readonly sheet: SheetSpec,
    texture: THREE.Texture,
  ) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('look', new THREE.BufferAttribute(this.look, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    const uniforms = { map: { value: texture }, frames: { value: sheet.frames }, pxScale: { value: 600 } };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    const size = new THREE.Vector2();
    // Pixels per metre at one metre away, for the screen the frame is drawn at.
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(size);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
      uniforms.pxScale.value = size.y / (2 * Math.tan((fov * Math.PI) / 360));
    };
    scene.add(this.points);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, colour: THREE.Color, o: MoteOptions = {}): void {
    if (this.n >= MAX_MOTES) return;
    const p = this.p;
    const k = this.n++ * STRIDE;
    p[k] = x;
    p[k + 1] = y;
    p[k + 2] = z;
    p[k + 3] = vx;
    p[k + 4] = vy;
    p[k + 5] = vz;
    p[k + 6] = 0;
    p[k + 7] = Math.max(0.02, life);
    p[k + 8] = size;
    p[k + 9] = o.grow ?? 0;
    p[k + 10] = colour.r;
    p[k + 11] = colour.g;
    p[k + 12] = colour.b;
    p[k + 13] = o.alpha ?? 1;
    p[k + 14] = o.gravity ?? 0;
    p[k + 15] = o.drag ?? 0;
    // A variant strip keeps the one picked; an animation starts on any frame, so a cloud of them does not blink together.
    p[k + 16] = Math.floor(Math.random() * this.sheet.frames);
  }

  update(dt: number): void {
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * STRIDE;
      const age = p[o + 6]! + dt;
      const life = p[o + 7]!;
      if (age >= life) continue;
      const d = w * STRIDE;
      if (d !== o) p.copyWithin(d, o, o + STRIDE);
      const keep = Math.max(0, 1 - p[d + 15]! * dt);
      p[d + 3] = p[d + 3]! * keep;
      p[d + 4] = p[d + 4]! * keep - p[d + 14]! * dt;
      p[d + 5] = p[d + 5]! * keep;
      p[d] = p[d]! + p[d + 3]! * dt;
      p[d + 1] = p[d + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[d + 2]! + p[d + 5]! * dt;
      p[d + 6] = age;
      const t = age / life;
      this.pos[w * 3] = p[d]!;
      this.pos[w * 3 + 1] = p[d + 1]!;
      this.pos[w * 3 + 2] = p[d + 2]!;
      this.tint[w * 3] = p[d + 10]!;
      this.tint[w * 3 + 1] = p[d + 11]!;
      this.tint[w * 3 + 2] = p[d + 12]!;
      this.look[w * 3] = Math.max(0, p[d + 8]! * (1 + p[d + 9]! * age));
      // In fast, out slow: bright at once, fading over the rest of its life.
      this.look[w * 3 + 1] = p[d + 13]! * Math.min(1, t * 12) * (1 - t * t);
      const frame = this.sheet.variants || this.sheet.fps === 0 ? p[d + 16]! : (p[d + 16]! + Math.floor(age * this.sheet.fps)) % this.sheet.frames;
      this.look[w * 3 + 2] = frame;
      w++;
    }
    this.n = w;
    this.geometry.setDrawRange(0, w);
    for (const name of ['position', 'tint', 'look']) {
      const a = this.geometry.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * 3);
      a.needsUpdate = true;
    }
  }
}

const MOTE_VERTEX = /* glsl */ `
attribute vec3 tint;
attribute vec3 look;
uniform float pxScale;
varying vec3 vTint;
varying float vAlpha;
varying float vFrame;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = look.x * pxScale / max(0.1, -mv.z);
  vTint = tint;
  vAlpha = look.y;
  vFrame = look.z;
}
`;

const MOTE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float frames;
varying vec3 vTint;
varying float vAlpha;
varying float vFrame;
void main() {
  vec2 uv = vec2((vFrame + gl_PointCoord.x) / frames, 1.0 - gl_PointCoord.y);
  vec4 c = texture2D(map, uv);
  if (c.a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(c.rgb * vTint, c.a * vAlpha);
}
`;

/** A soft round light, white at its heart. */
function glowTexture(): THREE.Texture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2));
      const a = Math.pow(1 - r, 2.2);
      const o = (y * n + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** How a spell looks where it lands: its model, and its motes. */
interface Landing {
  /** Its landing model (models/projectiles-and-spells), played through its clips. */
  model?: string;
  /** Rides on the unit it landed on while it plays. */
  follow?: boolean;
  /** Seconds a model with a looping clip (or none) plays; its once clips set the rest. */
  life?: number;
  /** The spell's reach in metres: the model is scaled to it (its own size read off the model), growing out to it over `grow` seconds. */
  reach?: number;
  grow?: number;
  sheet: Sheet;
  colour: number;
  /** Motes thrown out: how many, how fast, how far up. */
  n: number;
  speed: number;
  up: number;
  /** A ring of motes out to this many metres. */
  ring?: number;
  /** A flash of light this many metres across. */
  flash?: number;
  /** White sparks thrown out with it. */
  sparks?: number;
}

const LANDINGS: Partial<Record<number, Landing>> = {
  [Spell.Heal]: { model: 'spell_heal_motes', follow: true, life: 3, sheet: 'green', colour: 0xd8ffc8, n: 30, speed: 0.6, up: 1.6, flash: 1.4 },
  [Spell.Quicken]: { model: 'spell_quicken', follow: true, life: 2, sheet: 'blue', colour: 0xe0f4ff, n: 26, speed: 2.4, up: 0.8, flash: 1.2, sparks: 10 },
  [Spell.Fortify]: { model: 'spell_fortify', follow: true, sheet: 'gold', colour: 0xfff0c0, n: 24, speed: 1, up: 1.2, ring: 5, flash: 1.6 },
  [Spell.Rally]: { model: 'spell_rally', reach: 6, sheet: 'gold', colour: 0xffd8a0, n: 30, speed: 2, up: 2.4, ring: 6, flash: 2.4, sparks: 20 },
  [Spell.Beam]: { sheet: 'violet', colour: 0xffffff, n: 14, speed: 1.6, up: 1, flash: 1, sparks: 8 },
  [Spell.Fireball]: { sheet: 'embers', colour: 0xffffff, n: 70, speed: 5, up: 3.5, ring: 2, flash: 3.4, sparks: 34 },
  // MB-25: "more vibrant and powerful particle effects": the ring of force runs out to the blast's 4 m, a flash, a burst of light and sparks.
  [Spell.AreaBlast]: { model: 'spell_area_ring', reach: 4, grow: 0.35, life: 0.6, sheet: 'violet', colour: 0xffffff, n: 90, speed: 7, up: 3, ring: 4, flash: 5.5, sparks: 60 },
  [Spell.Warding]: { model: 'spell_warding', reach: 8, life: 3, sheet: 'blue', colour: 0xe8f0ff, n: 30, speed: 1, up: 2, ring: 8, flash: 2 },
  [Spell.Counterspell]: { model: 'spell_counterspell', sheet: 'spark', colour: 0xd8f0ff, n: 34, speed: 3.2, up: 1.6, flash: 1.6 },
  [Spell.Rootbind]: { model: 'spell_rootbind', life: 3, sheet: 'green', colour: 0xc8b070, n: 30, speed: 1.4, up: 0.8, ring: 4 },
  [Spell.Barkskin]: { model: 'spell_barkskin', follow: true, sheet: 'green', colour: 0xd8c090, n: 24, speed: 1, up: 1.2, ring: 6 },
  [Spell.MendingBloom]: { model: 'spell_mending_bloom', sheet: 'green', colour: 0xe0ffd0, n: 40, speed: 0.8, up: 1.8, ring: 4, flash: 1.6 },
  [Spell.CallOfTheWild]: { model: 'spell_call_of_the_wild', sheet: 'green', colour: 0xf0ffe0, n: 30, speed: 1.6, up: 1.4, flash: 1.4 },
};

/** A bolt of magic in flight: its trail of motes and the halo round it; and where it ends ('zap'), its burst. */
interface BoltLook {
  sheet: Sheet;
  tint: number;
  /** Motes a second behind it, their size and life. */
  rate: number;
  size: number;
  life: number;
  /** The light round it, metres across, and its colour. */
  halo: number;
  glow: number;
  /** White sparks a second, tinted. */
  sparks: number;
  /** Its end: motes, flash. */
  burst: number;
  flash: number;
}

const BOLTS: Partial<Record<number, BoltLook>> = {
  [Shot.ArcaneBolt]: { sheet: 'violet', tint: 0xffffff, rate: 80, size: 0.3, life: 0.55, halo: 1, glow: 0xa878ff, sparks: 18, burst: 28, flash: 1.3 },
  [Shot.EnergyDart]: { sheet: 'gold', tint: 0xffffff, rate: 70, size: 0.22, life: 0.45, halo: 0.7, glow: 0xfff0b8, sparks: 24, burst: 20, flash: 1 },
  [Shot.Fireball]: { sheet: 'embers', tint: 0xffffff, rate: 90, size: 0.38, life: 0.6, halo: 1.4, glow: 0xff7a20, sparks: 24, burst: 0, flash: 0 },
  [Shot.Spark]: { sheet: 'embers', tint: 0xffffff, rate: 45, size: 0.22, life: 0.4, halo: 0.6, glow: 0xffb040, sparks: 10, burst: 14, flash: 0.7 },
  [Shot.ManaBolt]: { sheet: 'mana', tint: 0xffffff, rate: 55, size: 0.26, life: 0.5, halo: 0.7, glow: 0x60e0ff, sparks: 8, burst: 18, flash: 0.9 },
  [Shot.Hellfire]: { sheet: 'embers', tint: 0xff7050, rate: 80, size: 0.36, life: 0.6, halo: 1.2, glow: 0xff3010, sparks: 20, burst: 30, flash: 1.6 },
  [Shot.Thorn]: { sheet: 'green', tint: 0xffffff, rate: 16, size: 0.16, life: 0.35, halo: 0, glow: 0, sparks: 0, burst: 0, flash: 0 },
  // Jade's Patch 5 stone circles: a Satyr Reveler's pale green bolt, Silenus' amber and leaf-green nature bolt, the Lich's grey-green Acrid Wind.
  [Shot.RevelerBolt]: { sheet: 'green', tint: 0xe0ffc8, rate: 50, size: 0.22, life: 0.45, halo: 0.7, glow: 0xc8f0a0, sparks: 8, burst: 18, flash: 0.9 },
  [Shot.NatureBolt]: { sheet: 'green', tint: 0xfff0b0, rate: 60, size: 0.26, life: 0.5, halo: 0.9, glow: 0xffb030, sparks: 12, burst: 24, flash: 1.1 },
  [Shot.AcridWind]: { sheet: 'green', tint: 0x9aa880, rate: 70, size: 0.4, life: 0.7, halo: 0, glow: 0x8a9a70, sparks: 0, burst: 30, flash: 0 },
};

/** The glow at the wand's tip while a spell without a bolt is cast, by school: support gold-white, battle violet, the Grovesingers green. */
const CAST_GLOW: Partial<Record<number, number>> = { [School.Support]: 0xfff0c8, [School.Battle]: 0xb890ff, [School.Grove]: 0xb8f0a0 };

/** The bolts drawn here as their own models: the shot's model in the sim's table. */
const BOLT_MODELS: Partial<Record<number, string>> = {
  [Shot.ArcaneBolt]: 'arcane_bolt',
  [Shot.EnergyDart]: 'energy_dart',
  [Shot.Fireball]: SPELLS[Spell.Fireball]!.model,
  [Shot.Spark]: 'spark',
  [Shot.ManaBolt]: 'mana_bolt',
  [Shot.Hellfire]: 'hellfire',
  [Shot.Thorn]: SPELLS[Spell.ThornVolley]!.model,
  [Shot.RevelerBolt]: 'reveler_bolt',
  [Shot.NatureBolt]: 'nature_bolt',
  [Shot.AcridWind]: 'acrid_wind',
};
/** Bolts whose head is down -Z though their trail behind is the longer end (Jade's nature and reveler bolts). */
const HEAD_DOWN_MINUS_Z: ReadonlySet<string> = new Set(['nature_bolt', 'reveler_bolt']);

/** Which end of a bolt's model is its head (-Z, else +Z), and how far that is from its origin, metres. */
function boltNose(model: ModelData, id: string): { forward: boolean; len: number } {
  const b = model.boundingBox;
  const forward = HEAD_DOWN_MINUS_Z.has(id) || -b.min.z > b.max.z;
  return { forward, len: forward ? -b.min.z : b.max.z };
}

/** The sparkle round a unit under a spell, by SpellOn bit. */
const AURAS: ReadonlyArray<readonly [number, Sheet, number]> = [
  [SpellOn.Healing, 'green', 0xffffff],
  [SpellOn.Quicken, 'blue', 0xffffff],
  [SpellOn.Fortify, 'gold', 0xffffff],
  [SpellOn.Rally, 'spark', 0xff9060],
  [SpellOn.Warding, 'blue', 0xc8d8ff],
  [SpellOn.Hexed, 'hex', 0xffffff],
];

/** The Beam's light (MB-22). */
const BEAM_CORE = 0xe8d8ff;
const BEAM_GLOW = 0xa070ff;

/** A bolt drawn this frame: its Shot, its head (metres) and which way it flies. */
interface Flown {
  kind: number;
  x: number;
  y: number;
  z: number;
  dir: THREE.Vector3;
}

interface Playing {
  model: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  t0: number;
  life: number;
  /** Tilt about its own X, radians (a bolt's impact along its arc; 0 for the rest). */
  pitch: number;
  /** Entity id it rides on, or 0. */
  follow: number;
  /** Scale at the start and at full size, and how long it takes to grow. */
  from: number;
  to: number;
  grow: number;
}

/** A landing model's clips in order: those before its loop play once, the loop until the end, those after it to finish. */
function clipAt(model: ModelData, age: number, life: number): { clip: string; t: number } {
  const clips = [...model.clips.values()];
  if (clips.length === 0) return { clip: '', t: 0 };
  const loopAt = clips.findIndex((c) => c.loop);
  const intro = loopAt < 0 ? clips : clips.slice(0, loopAt);
  let t = age;
  for (const c of intro) {
    if (t < c.length) return { clip: c.name, t };
    t -= c.length;
  }
  if (loopAt < 0) {
    const last = clips[clips.length - 1]!;
    return { clip: last.name, t: last.length };
  }
  const outro = clips.slice(loopAt + 1).filter((c) => !c.loop);
  const outLen = outro.reduce((s, c) => s + c.length, 0);
  const introLen = intro.reduce((s, c) => s + c.length, 0);
  const loopLen = Math.max(0, life - introLen - outLen);
  if (t < loopLen) return { clip: clips[loopAt]!.name, t };
  t -= loopLen;
  for (const c of outro) {
    if (t < c.length) return { clip: c.name, t };
    t -= c.length;
  }
  const last = outro[outro.length - 1] ?? clips[loopAt]!;
  return { clip: last.name, t: last.length };
}

/** How long a landing model plays: its once clips, and its loop (or a model with no clips) for the time asked. */
function playLength(model: ModelData, life: number): number {
  const clips = [...model.clips.values()];
  const once = clips.filter((c) => !c.loop).reduce((s, c) => s + c.length, 0);
  return clips.some((c) => c.loop) ? Math.max(life, once + 0.4) : Math.max(once, life, 0.3);
}

/** A model's radius on the ground, metres (for scaling a ring or a dome to a spell's reach). */
function groundRadius(model: ModelData): number {
  const b = model.boundingBox;
  return Math.max(0.05, Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z));
}

/** Bolts and beam segments: the model with full matrices, lit by its own texture so it glows at night as by day. */
class GlowStatic {
  private readonly meshes = new Map<string, { mesh: THREE.InstancedMesh; n: number }>();

  constructor(private readonly scene: THREE.Scene) {}

  add(model: ModelData, m: THREE.Matrix4): void {
    let e = this.meshes.get(model.id);
    if (!e) {
      const material = new THREE.MeshLambertMaterial({ map: model.texture, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: model.texture, emissiveIntensity: 0.9 });
      const mesh = new THREE.InstancedMesh(model.geometry, material, MAX_STATIC);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      e = { mesh, n: 0 };
      this.meshes.set(model.id, e);
    }
    if (e.n >= MAX_STATIC) return;
    e.mesh.setMatrixAt(e.n++, m);
  }

  commit(visible: boolean): void {
    for (const e of this.meshes.values()) {
      showInstances(e.mesh, e.n);
      e.mesh.visible = visible;
      e.n = 0;
    }
  }
}

/**
 * Models posed through their clips, a pool of each drawn this frame: the
 * landing models, and the bolts that play their loops in flight (Patch 5,
 * here and in units-view.ts).
 */
export class ModelPools {
  private readonly pools = new Map<string, { m: InstancedModel; n: number }>();
  private visible = true;

  /** At most `max` of each model a frame, lit by its own texture this strongly (InstancedModel.glow, 0 for none). */
  constructor(
    private readonly scene: THREE.Scene,
    private readonly max: number,
    private readonly glowing: number,
  ) {}

  take(model: ModelData): { m: InstancedModel; i: number } | null {
    let e = this.pools.get(model.id);
    if (!e) {
      const m = new InstancedModel(model, this.max);
      if (this.glowing > 0) m.glow(this.glowing);
      this.scene.add(m.object);
      e = { m, n: 0 };
      this.pools.set(model.id, e);
    }
    if (e.n >= this.max) return null;
    return { m: e.m, i: e.n++ };
  }

  /** Hidden for the outline passes, which draw nothing that hides nothing. */
  setVisible(on: boolean): void {
    this.visible = on;
    for (const e of this.pools.values()) e.m.object.visible = on && e.m.instanceCount > 0;
  }

  commit(): void {
    for (const e of this.pools.values()) {
      e.m.setCount(e.n);
      e.m.commit();
      e.m.object.visible = this.visible && e.n > 0;
      e.n = 0;
    }
  }
}

/** A model's loop to play in flight: its first looping clip ('' for none). */
export function flightClip(model: ModelData): string {
  for (const c of model.clips.values()) if (c.loop) return c.name;
  return '';
}

/**
 * The heading and pitch (InstancedModel.setInstance) that point a model's
 * nose along dir (a unit vector): its -Z end when forwardMinusZ, else its +Z
 * end, kept upright about its length.
 */
export function aimAlong(dir: THREE.Vector3, forwardMinusZ: boolean): { heading: number; pitch: number } {
  const up = Math.asin(Math.min(1, Math.max(-1, dir.y)));
  return forwardMinusZ ? { heading: Math.atan2(-dir.x, -dir.z), pitch: up } : { heading: Math.atan2(dir.x, dir.z), pitch: -up };
}

const Z_FORWARD = new THREE.Vector3(0, 0, 1);
const Z_BACK = new THREE.Vector3(0, 0, -1);
const TIP_MAT = new THREE.Matrix4();

/**
 * Where a mage's wand ends (MB-22): out along her hand slot from the hand,
 * as far as her wand reaches (its own model once one hangs there, else the
 * body's wand).
 */
export function wandTip(m: InstancedModel, i: number, bone: number, wand: ModelData | undefined, out: THREE.Vector3): THREE.Vector3 {
  m.boneWorld(i, bone, TIP_MAT);
  const len = wand ? Math.max(0.1, -wand.boundingBox.min.z) : WAND_TIP_M;
  return out.set(0, 0, -len).applyMatrix4(TIP_MAT);
}

export class SpellFx {
  private lib: ModelLibrary | null = null;
  private readonly layers = new Map<Sheet, MoteLayer>();
  private readonly statics: GlowStatic;
  private readonly landings: ModelPools;
  /** Bolts that play their loops in flight. */
  private readonly flying: ModelPools;
  /** The bolts drawn this frame (kind, where, which way): where one ends, its impact faces the way it flew. */
  private readonly flown: Flown[] = [];
  private readonly playing: Playing[] = [];
  private readonly asked = new Set<string>();
  private readonly colour = new THREE.Color();
  private readonly tmp = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();
  private visible = true;
  private follows = false;
  private dt = 0;
  private t = 0;
  private last = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.statics = new GlowStatic(scene);
    this.landings = new ModelPools(scene, MAX_LANDINGS, 0.85);
    this.flying = new ModelPools(scene, MAX_STATIC, 0.9);
  }

  setLibrary(lib: ModelLibrary): void {
    this.lib = lib;
  }

  /** Hidden for the outline passes, which draw nothing that hides nothing. */
  setVisible(on: boolean): void {
    this.visible = on;
    for (const l of this.layers.values()) l.points.visible = on;
    this.landings.setVisible(on);
    this.flying.setVisible(on);
  }

  /** Whether a landing rides on a unit this frame: the units view then says where every unit stands. */
  get following(): boolean {
    return this.follows;
  }

  /** The start of a frame (ms). */
  begin(now: number): void {
    this.dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.t = now / 1000;
    this.follows = this.playing.some((p) => p.follow !== 0);
    this.flown.length = 0;
  }

  /** A spell landing or a bolt of magic ending, in sight; metres. */
  onHit(h: HitEvent, x: number, y: number, z: number): void {
    if (h.look === 'zap') {
      const b = BOLTS[h.shot ?? -1];
      if (!b) return;
      if (b.burst > 0) this.burst(b.sheet, x, y, z, this.colour.set(b.tint), b.burst, 2.6, 1.6, 0.6, 0.3);
      if (b.flash > 0) this.flash(x, y, z, b.flash, b.glow);
      if (b.sparks > 0) this.burst('spark', x, y, z, this.colour.set(b.glow).lerp(WHITE, 0.5), Math.ceil(b.sparks / 2), 3.2, 2, 0.45, 0.12, 6);
      this.impact(h.shot ?? -1, x, y, z);
      return;
    }
    const s = SPELLS[h.spell ?? -1];
    const l = LANDINGS[h.spell ?? -1];
    if (!s || !l) return;
    const c = this.colour.set(l.colour);
    if (l.flash) this.flash(x, y + 0.4, z, l.flash, l.colour);
    this.burst(l.sheet, x, y, z, c, l.n, l.speed, l.up, 0.9, 0.34, l.sheet === 'embers' ? 4 : -0.4);
    if (l.ring) this.ring(l.sheet, x, y + 0.15, z, l.ring, c, Math.round(l.ring * 14));
    if (l.sparks) this.burst('spark', x, y + 0.3, z, this.colour.set(l.colour).lerp(WHITE, 0.4), l.sparks, l.speed * 1.4, l.up * 1.5, 0.7, 0.14, 7);
    if (h.spell === Spell.AreaBlast) {
      // A column of light where the blast struck, rising out of the ring.
      for (let k = 0; k < 26; k++) this.mote('glow', x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.8, 0, 2.5 + Math.random() * 3, 0, 0.7, 0.9, this.colour.set(0xc8a8ff), { grow: -0.6, drag: 1.2 });
    }
    if (l.model) {
      const follow = l.follow && h.id ? h.id : 0;
      this.follows ||= follow !== 0;
      // The models stand on the ground: a spell on a unit shows at its middle, a spell on the ground at the ground.
      const feet = s.target === 'point' ? y : y - 0.85;
      this.playing.push({ model: l.model, x, y: feet, z, heading: Math.random() * Math.PI * 2, pitch: 0, t0: this.t, life: l.life ?? 0, follow, from: l.grow ? 0.2 : 1, to: 1, grow: l.grow ?? 0 });
      const p = this.playing[this.playing.length - 1]!;
      if (l.reach) p.to = -l.reach; // sized by the model's own radius once it is loaded (negative: a reach in metres)
      if (l.reach && !l.grow) p.from = p.to;
    }
  }

  /**
   * One of the stone circle keepers' models played through (Jade's Patch 5:
   * the Lash of Thorns, the roots letting go): metres, turned to `heading`,
   * for `life` s at least, riding on unit `follow` when it is not 0, `skip` s
   * of its clips already played.
   */
  play(model: string, x: number, y: number, z: number, heading: number, life: number, follow = 0, scale = 1, skip = 0): void {
    this.follows ||= follow !== 0;
    this.playing.push({ model, x, y, z, heading, pitch: 0, t0: this.t - skip, life, follow, from: scale, to: scale, grow: 0 });
  }

  /**
   * A bolt's own impact where it ends (Jade's reveler bolt; PRE-3: "Make sure
   * to use all of what I give you"): the clips after its flight loop, placed
   * and turned as the bolt was last drawn flying there.
   */
  private impact(kind: number, x: number, y: number, z: number): void {
    const id = BOLT_MODELS[kind];
    const m = id ? this.lib?.models.get(id) : undefined;
    if (!id || !m) return;
    const clips = [...m.clips.values()];
    const loopAt = clips.findIndex((c) => c.loop);
    const outro = loopAt < 0 ? 0 : clips.slice(loopAt + 1).reduce((s, c) => s + (c.loop ? 0 : c.length), 0);
    if (outro <= 0) return;
    let near: Flown | undefined;
    let best = BOLT_END_M * BOLT_END_M;
    for (const f of this.flown) {
      const d = (f.x - x) ** 2 + (f.y - y) ** 2 + (f.z - z) ** 2;
      if (f.kind === kind && d < best) {
        best = d;
        near = f;
      }
    }
    const a = Math.random() * Math.PI * 2;
    const dir = near ? near.dir : this.dir.set(Math.sin(a), 0, Math.cos(a));
    const { forward, len } = boltNose(m, id);
    const { heading, pitch } = aimAlong(dir, forward);
    // Started where its flight loop ends: playLength gives a looping model its once clips and 0.4 s of loop.
    const life = playLength(m, 0);
    this.playing.push({ model: id, x: x - dir.x * len, y: y - dir.y * len, z: z - dir.z * len, heading, pitch, t0: this.t - (life - outro), life: 0, follow: 0, from: 1, to: 1, grow: 0 });
  }

  /** A model's clips after its loop played through (entangling roots letting go of a unit), metres. */
  release(model: string, x: number, y: number, z: number, heading: number): void {
    const m = this.model(model);
    if (!m) return;
    const clips = [...m.clips.values()];
    const loopAt = clips.findIndex((c) => c.loop);
    if (loopAt < 0) return;
    const intro = clips.slice(0, loopAt).reduce((s, c) => s + c.length, 0);
    const outro = clips.slice(loopAt + 1).reduce((s, c) => s + (c.loop ? 0 : c.length), 0);
    if (outro > 0) this.play(model, x, y, z, heading, intro + outro, 0, 1, intro);
  }

  /**
   * One of the keepers' models drawn this frame only, `age` s into its clips
   * (those before its loop once, then the loop for as long as it lasts): the
   * roots round a unit they hold, Touch of the Grave on one it lies on, the
   * rite's orb in the Lich's hand.
   */
  at(model: string, x: number, y: number, z: number, heading: number, age: number, scale = 1): void {
    const m = this.model(model);
    const slot = m ? this.landings.take(m) : null;
    if (!m || !slot) return;
    const { clip, t } = clipAt(m, age, Number.POSITIVE_INFINITY);
    slot.m.setInstance(slot.i, x, y, z, heading, clip, t, null, scale);
  }

  /** A tether this frame (the Sacrificial Rite's beam, Jade's SCB-2 model): the model's segments laid end to end from one point to the other, turning, and motes flowing along it. */
  chain(model: string, from: THREE.Vector3, to: THREE.Vector3, colour: number): void {
    const dir = this.dir.subVectors(to, from);
    const len = dir.length();
    if (len < 0.1) return;
    dir.divideScalar(len);
    const seg = this.model(model);
    if (seg) {
      const step = Math.max(0.1, -seg.boundingBox.min.z);
      for (let d = 0, k = 0; d < len && k < 200; d += step, k++) {
        this.dummy.quaternion.setFromUnitVectors(Z_BACK, dir);
        this.dummy.rotateZ(this.t * 5 + k * 0.9);
        this.dummy.position.set(from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d);
        this.dummy.scale.set(1, 1, Math.min(1, (len - d) / step));
        this.dummy.updateMatrix();
        this.statics.add(seg, this.dummy.matrix);
      }
    }
    const c = this.colour.set(colour);
    for (let k = this.count(90 * this.dt); k > 0; k--) {
      const d = Math.random() * len;
      const speed = 6 + Math.random() * 4;
      this.mote('glow', from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d, dir.x * speed, dir.y * speed, dir.z * speed, Math.min(0.3, (len - d) / speed), 0.3, c);
    }
  }

  /** A model from the library, asked for the first time it is wanted. */
  private model(id: string): ModelData | undefined {
    const m = this.lib?.models.get(id);
    if (!m && this.lib?.listed(id) && !this.asked.has(id)) {
      this.asked.add(id);
      this.lib.request(id);
    }
    return m;
  }

  /**
   * A bolt of magic in flight (metres; dir is where it is going): its trail
   * and halo, and its model once that is in. True when it is drawn here, so
   * the caller draws no stand-in.
   */
  shot(kind: number, x: number, y: number, z: number, dir: THREE.Vector3): boolean {
    const b = BOLTS[kind];
    if (!b) return false;
    const id = BOLT_MODELS[kind] ?? '';
    const model = id ? this.lib?.models.get(id) : undefined;
    let tailX = x;
    let tailY = y;
    let tailZ = z;
    if (model) {
      // Head on the shot's point, tail behind it: Jade's bolts point their head down -Z, the older models up +Z.
      const { forward, len } = boltNose(model, id);
      const loop = flightClip(model);
      const slot = loop ? this.flying.take(model) : null;
      if (slot) {
        // Its own loop playing as it flies (PRE-3), tilted along its arc.
        const { heading, pitch } = aimAlong(dir, forward);
        slot.m.setInstance(slot.i, x - dir.x * len, y - dir.y * len, z - dir.z * len, heading, loop, this.t, null, 1, pitch);
      } else if (!loop) {
        this.dummy.quaternion.setFromUnitVectors(forward ? Z_BACK : Z_FORWARD, dir);
        this.dummy.position.set(x - dir.x * len, y - dir.y * len, z - dir.z * len);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.statics.add(model, this.dummy.matrix);
      }
      this.flown.push({ kind, x, y, z, dir: dir.clone() });
      tailX -= dir.x * len;
      tailY -= dir.y * len;
      tailZ -= dir.z * len;
    } else if (id && this.lib?.listed(id) && !this.asked.has(id)) {
      this.asked.add(id);
      this.lib.request(id);
    }
    const dt = this.dt;
    const c = this.colour.set(b.tint);
    for (let k = this.count(b.rate * dt); k > 0; k--) {
      const j = 0.6;
      this.mote(b.sheet, tailX + (Math.random() - 0.5) * 0.1, tailY + (Math.random() - 0.5) * 0.1, tailZ + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * j - dir.x, (Math.random() - 0.5) * j - dir.y + 0.3, (Math.random() - 0.5) * j - dir.z, b.life * (0.6 + Math.random() * 0.4), b.size * (1.6 + Math.random() * 1), c, { grow: -0.8, drag: 1.5 });
    }
    // A soft streak of its light behind it.
    if (b.halo > 0) {
      const g = this.colour.set(b.glow);
      for (let k = this.count(b.rate * 0.6 * dt); k > 0; k--) this.mote('glow', tailX, tailY, tailZ, -dir.x * 0.5, -dir.y * 0.5, -dir.z * 0.5, b.life * 0.6, b.halo * 0.55, g, { grow: -1.2, alpha: 0.5 });
    }
    if (b.halo > 0) this.mote('glow', x, y, z, 0, 0, 0, 0.07, b.halo, this.colour.set(b.glow), { alpha: 0.85 });
    if (b.sparks > 0) {
      const sc = this.colour.set(b.glow).lerp(WHITE, 0.5);
      for (let k = this.count(b.sparks * dt); k > 0; k--) this.mote('spark', tailX, tailY, tailZ, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5, 0.35, 0.1, sc, { gravity: 5 });
    }
    return model !== undefined || (id !== '' && this.lib?.listed(id) === true);
  }

  /**
   * A mage casting (VX-5: "somewhat flashy effects ... to augment models for
   * magic"): her spell's own light gathers at the wand's tip over the cast,
   * motes drawn in from round her hand to a glow that pulses there.
   */
  casting(spell: number, tip: THREE.Vector3): void {
    const s = SPELLS[spell];
    if (!s) return;
    const bolt = BOLTS[s.shot];
    const l = LANDINGS[spell];
    const c = this.colour.set(bolt?.tint ?? l?.colour ?? 0xffffff);
    const sheet = bolt?.sheet ?? l?.sheet ?? 'violet';
    for (let k = this.count(70 * this.dt); k > 0; k--) {
      // From a point round the tip, straight in, so it reaches the tip as it fades.
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.5) * Math.PI;
      const r = 0.4 + Math.random() * 0.3;
      const life = 0.3 + Math.random() * 0.15;
      const dx = Math.cos(a) * Math.cos(e) * r;
      const dy = Math.sin(e) * r;
      const dz = Math.sin(a) * Math.cos(e) * r;
      this.mote(sheet, tip.x + dx, tip.y + dy, tip.z + dz, -dx / life, -dy / life, -dz / life, life, 0.3, c, { grow: -1.2 });
    }
    this.mote('glow', tip.x, tip.y, tip.z, 0, 0, 0, 0.06, 0.35 + 0.1 * Math.sin(this.t * 30), this.colour.set(bolt?.glow || CAST_GLOW[s.school] || 0xd8c8ff), { alpha: 0.85 });
  }

  /** The sparkle round a unit under spells (SpellOn bits), its feet at y and this tall. */
  aura(bits: number, x: number, y: number, z: number, tall: number): void {
    for (const [bit, sheet, tint] of AURAS) {
      if (!(bits & bit) || Math.random() >= this.dt * 6) continue;
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.2;
      this.mote(sheet, x + Math.cos(a) * r, y + 0.2 + Math.random() * tall * 0.8, z + Math.sin(a) * r, 0, 0.5 + Math.random() * 0.4, 0, 0.9, 0.45, this.colour.set(tint), { drag: 0.5 });
    }
  }

  /**
   * A held Beam (MB-22): a stream of light from the wand's tip to its
   * target, the beam's segments turning along it, motes racing down it and
   * sparks where it strikes.
   */
  beam(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = this.dir.subVectors(to, from);
    const len = dir.length();
    if (len < 0.1) return;
    dir.divideScalar(len);
    const t = this.t;
    const seg = this.lib?.models.get('spell_beam_segment');
    if (seg) {
      const step = Math.max(0.1, -seg.boundingBox.min.z);
      const q = this.dummy.quaternion;
      for (let d = 0, k = 0; d < len && k < 200; d += step, k++) {
        q.setFromUnitVectors(Z_BACK, dir);
        this.dummy.rotateZ(t * 9 + k * 0.7);
        const s = 0.9 + 0.25 * Math.sin(t * 24 + k * 1.3);
        this.dummy.position.set(from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d);
        this.dummy.scale.set(s, s, Math.min(1, (len - d) / step));
        this.dummy.updateMatrix();
        this.statics.add(seg, this.dummy.matrix);
      }
    } else if (this.lib?.listed('spell_beam_segment') && !this.asked.has('spell_beam_segment')) {
      this.asked.add('spell_beam_segment');
      this.lib.request('spell_beam_segment');
    }
    // The core: soft light all along it, flickering.
    const core = this.colour.set(BEAM_GLOW);
    for (let d = 0; d < len; d += 0.3) {
      const k = 0.85 + Math.random() * 0.3;
      this.mote('glow', from.x + dir.x * d, from.y + dir.y * d, from.z + dir.z * d, 0, 0, 0, 0.06, 0.42 * k, core, { alpha: 0.9 });
    }
    // Motes racing from the wand to the target.
    const race = this.colour.set(BEAM_CORE);
    for (let k = this.count(160 * this.dt); k > 0; k--) {
      const d = Math.random() * len;
      const j = 0.06;
      const speed = 9 + Math.random() * 5;
      this.mote('violet', from.x + dir.x * d + (Math.random() - 0.5) * j, from.y + dir.y * d + (Math.random() - 0.5) * j, from.z + dir.z * d + (Math.random() - 0.5) * j, dir.x * speed, dir.y * speed, dir.z * speed, Math.min(0.3, (len - d) / speed), 0.42, race);
    }
    // A flare at the wand's tip and a splash of sparks where it strikes.
    this.mote('glow', from.x, from.y, from.z, 0, 0, 0, 0.06, 0.55 + Math.random() * 0.15, this.colour.set(BEAM_CORE));
    this.mote('glow', to.x, to.y, to.z, 0, 0, 0, 0.06, 0.8 + Math.random() * 0.3, this.colour.set(BEAM_GLOW));
    const spark = this.colour.set(0xe0d0ff);
    for (let k = this.count(50 * this.dt); k > 0; k--) this.mote('spark', to.x, to.y, to.z, (Math.random() - 0.5) * 4 - dir.x * 2, Math.random() * 2.5, (Math.random() - 0.5) * 4 - dir.z * 2, 0.4, 0.1, spark, { gravity: 7 });
  }

  /** The end of a frame: landings ride, play and run out; the motes move; everything is uploaded. */
  end(where: ReadonlyMap<number, THREE.Vector3>): void {
    let w = 0;
    for (const p of this.playing) {
      const model = this.lib?.models.get(p.model);
      if (!model && this.lib?.listed(p.model) && !this.asked.has(p.model)) {
        this.asked.add(p.model);
        this.lib.request(p.model);
      }
      const age = this.t - p.t0;
      const life = model ? playLength(model, p.life) : Math.max(p.life, 1);
      if (age > life) continue;
      this.playing[w++] = p;
      if (!model) continue;
      if (p.follow) {
        const u = where.get(p.follow);
        if (u) {
          p.x = u.x;
          p.y = u.y;
          p.z = u.z;
        }
      }
      // A negative scale is a reach in metres, the model scaled to it by its own radius.
      const size = (k: number): number => (k < 0 ? -k / groundRadius(model) : k);
      const grown = p.grow > 0 ? Math.min(1, age / p.grow) : 1;
      const ease = 1 - (1 - grown) * (1 - grown);
      const scale = size(p.from) + (size(p.to) - size(p.from)) * ease;
      const slot = this.landings.take(model);
      if (!slot) continue;
      const { clip, t } = clipAt(model, age, life);
      slot.m.setInstance(slot.i, p.x, p.y, p.z, p.heading, clip, t, null, scale, p.pitch);
    }
    this.playing.length = w;
    for (const l of this.layers.values()) l.update(this.dt);
    this.statics.commit(this.visible);
    this.landings.commit();
    this.flying.commit();
  }

  // ---- Motes ----

  private layer(sheet: Sheet): MoteLayer {
    let l = this.layers.get(sheet);
    if (!l) {
      const spec: SheetSpec = SHEETS[sheet];
      const url = spec.file ? SPRITES[`../../../assets/src/effects/${spec.file}.png`] : undefined;
      let texture: THREE.Texture;
      if (url) {
        texture = new THREE.TextureLoader().load(url);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
      } else texture = glowTexture();
      l = new MoteLayer(this.scene, url || !spec.file ? spec : SHEETS.glow, texture);
      l.points.visible = this.visible;
      this.layers.set(sheet, l);
    }
    return l;
  }

  private mote(sheet: Sheet, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, colour: THREE.Color, o?: MoteOptions): void {
    this.layer(sheet).emit(x, y, z, vx, vy, vz, life, size, colour, o);
  }

  /** A whole number of motes for a rate this frame, the part left over by chance. */
  private count(n: number): number {
    const whole = Math.floor(n);
    return whole + (Math.random() < n - whole ? 1 : 0);
  }

  /** Motes thrown out every way from a point, rising. */
  private burst(sheet: Sheet, x: number, y: number, z: number, colour: THREE.Color, n: number, speed: number, up: number, life: number, size: number, gravity = 0): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.mote(sheet, x, y + 0.2, z, Math.cos(a) * s, up * (0.3 + Math.random() * 0.7), Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (1.4 + Math.random() * 1), colour, { drag: 1.6, gravity });
    }
  }

  /** A ring of motes running out to a radius over about a third of a second. */
  private ring(sheet: Sheet, x: number, y: number, z: number, radius: number, colour: THREE.Color, n: number): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.1;
      const s = radius * 3;
      this.mote(sheet, x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.4 + Math.random() * 0.5, Math.sin(a) * s, 0.45 + Math.random() * 0.25, 0.55 + Math.random() * 0.3, colour, { drag: 4.5 });
    }
  }

  /** A flash of light, this many metres across, gone in a moment. */
  private flash(x: number, y: number, z: number, size: number, colour: number): void {
    this.mote('glow', x, y, z, 0, 0, 0, 0.32, size, this.colour.set(colour), { grow: 1.6 });
    this.mote('glow', x, y, z, 0, 0, 0, 0.18, size * 0.45, WHITE, { grow: 1 });
  }
}

const WHITE = new THREE.Color(0xffffff);
