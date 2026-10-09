// The world's glitter (Jade's Patch 5, VX-6: "glitter of gold color for
// gold, glitter of silver color for silver"): tiny pixel stars that wink on
// gold and silver lying in the world. Cubes (AR-3), the light additive. The
// muzzle flashes are drawn from each gun's muzzle (units-view.ts, MB-7).
// Decoration only; nothing here reaches the sim. Every number is a pick (s).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Res, RESOURCES, TRINKET_BASE, TRINKET_METALS } from '@blockyrts/sim';

/** The glitter's colours (AR-16, AR-17: silver white-grey, gold yellow), a touch brighter than the metal. */
export const GOLD_GLINT = 0xffd75a;
export const SILVER_GLINT = 0xeef4ff;

/** A spot that glitters: its middle (metres), how far round it the stars wink, and their colour. */
export interface GlitterSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  colour: number;
}

/** The glitter colour of a prop's resource ('gold', 'silver'), or 0 for none. */
export function glitterOfResource(resource: string): number {
  if (resource === 'gold') return GOLD_GLINT;
  if (resource === 'silver') return SILVER_GLINT;
  return 0;
}

const SILVER_METAL = TRINKET_METALS.indexOf('Silver');
const GOLD_METAL = TRINKET_METALS.indexOf('Gold');

/** The glitter colour of a good lying on the ground: gold and silver, and the trinkets made of them; 0 for none. */
export function glitterOfGood(res: number): number {
  if (res === Res.Gold || res === Res.Sunheart) return GOLD_GLINT;
  if (res === Res.Silver || res === Res.Moonleaf) return SILVER_GLINT;
  const t = res - TRINKET_BASE;
  if (t >= 0 && t < TRINKET_METALS.length * 4) {
    const metal = Math.floor(t / 4);
    if (metal === GOLD_METAL) return GOLD_GLINT;
    if (metal === SILVER_METAL) return SILVER_GLINT;
  }
  const name = RESOURCES[res]?.name.toLowerCase() ?? '';
  return name.includes('gold') ? GOLD_GLINT : name.includes('silver') ? SILVER_GLINT : 0;
}

const MAX_GLINTS = 120;
/** Glints alive at once by one spot, at most; and how often a spot starts one, on average, seconds. */
const GLINTS_PER_SPOT = 2;
const GLINT_EVERY_S = 1.1;
const GLINT_LIFE_S = 0.5;
const GLINT_SIZE_M = 0.2;

/** A small three-armed star: one thin bar along each axis, so it reads as a twinkle from any side. */
function starGeometry(): THREE.BufferGeometry {
  const t = 0.18;
  return mergeGeometries([new THREE.BoxGeometry(1, t, t), new THREE.BoxGeometry(t, 1, t), new THREE.BoxGeometry(t, t, 1)])!;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  /** Per particle: x y z vx vy vz age life size grow colour. */
  readonly p: Float32Array;
  n = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly c = new THREE.Color();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    readonly max: number,
  ) {
    this.p = new Float32Array(max * 11);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, colour: number): void {
    if (this.n >= this.max) return;
    const o = this.n++ * 11;
    const p = this.p;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = z;
    p[o + 3] = vx;
    p[o + 4] = vy;
    p[o + 5] = vz;
    p[o + 6] = 0;
    p[o + 7] = life;
    p[o + 8] = size;
    p[o + 9] = grow;
    p[o + 10] = colour;
  }

  update(dt: number): void {
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * 11;
      const age = p[o + 6]! + dt;
      if (age >= p[o + 7]!) continue;
      const d = w * 11;
      if (d !== o) p.copyWithin(d, o, o + 11);
      p[d] = p[d]! + p[d + 3]! * dt;
      p[d + 1] = p[d + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[d + 2]! + p[d + 5]! * dt;
      p[d + 6] = age;
      const f = age / p[d + 7]!;
      // Light swells and dies away (a sine over its life).
      const s = p[d + 8]! * Math.sin(Math.PI * Math.min(1, f + 0.15));
      this.dummy.position.set(p[d]!, p[d + 1]!, p[d + 2]!);
      this.dummy.scale.setScalar(Math.max(0.001, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(w, this.dummy.matrix);
      this.c.setHex(p[d + 10]!);
      this.c.multiplyScalar(Math.max(0, 1 - f * f));
      this.mesh.setColorAt(w, this.c);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class WorldFx {
  private readonly glints: Pool;
  private spots: readonly GlitterSpot[] = [];
  /** Glints running at each spot this frame. */
  private readonly running = new Map<GlitterSpot, number>();
  private readonly owner: GlitterSpot[] = [];

  constructor(scene: THREE.Scene) {
    const light = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.glints = new Pool(starGeometry(), light, MAX_GLINTS);
    this.glints.mesh.renderOrder = 3;
    scene.add(this.glints.mesh);
  }

  /** The spots that glitter now (gold and silver nodes and loot near the view). */
  setSpots(spots: readonly GlitterSpot[]): void {
    this.spots = spots;
  }

  /** Each frame: the glitter winks where it is seen. */
  update(dt: number, seen: (x: number, z: number) => boolean): void {
    this.running.clear();
    for (let k = 0; k < this.glints.n; k++) {
      const s = this.owner[k];
      if (s) this.running.set(s, (this.running.get(s) ?? 0) + 1);
    }
    const chance = dt / GLINT_EVERY_S;
    for (const s of this.spots) {
      if (this.glints.n >= MAX_GLINTS) break;
      if ((this.running.get(s) ?? 0) >= GLINTS_PER_SPOT || Math.random() >= chance || !seen(s.x, s.z)) continue;
      const a = Math.random() * Math.PI * 2;
      const r = s.r * Math.sqrt(Math.random());
      this.owner[this.glints.n] = s;
      this.glints.add(s.x + Math.cos(a) * r, s.y + Math.random() * s.r * 0.6, s.z + Math.sin(a) * r, 0, 0, 0, GLINT_LIFE_S * (0.7 + Math.random() * 0.6), GLINT_SIZE_M * (0.7 + Math.random() * 0.6), 0, s.colour);
    }
    this.compactOwners(dt);
    this.glints.update(dt);
  }

  /** Keeps each glint's spot beside it as the pool drops the finished ones (the same order as Pool.update). */
  private compactOwners(dt: number): void {
    const p = this.glints.p;
    let w = 0;
    for (let r = 0; r < this.glints.n; r++) {
      const o = r * 11;
      if (p[o + 6]! + dt >= p[o + 7]!) continue;
      this.owner[w++] = this.owner[r]!;
    }
    this.owner.length = w;
  }
}
