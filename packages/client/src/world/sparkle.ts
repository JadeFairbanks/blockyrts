// The world's glitter (Jade's Patch 5, VX-6: "glitter of gold color for
// gold, glitter of silver color for silver"): tiny pixel stars that wink on
// gold and silver lying in the world. Cubes (AR-3), the light additive. The
// muzzle flashes are drawn from each gun's muzzle (units-view.ts, MB-7).
// The glints wink at a gold or silver node model's own fx_glint spots, its
// veins. Steam rises from where the models put it (Patch 5): a hot spring's
// fx_steam vents, with bubbles at its fx_bubble, and a sulphur rock's
// fx_steam (its fx_steam_depleted vent once it is half dug out).
// Patch 7 (plan section 3): an epic piece of gear on the ground glints
// purple now and then, a legendary one sparkles white, often.
// Decoration only; nothing here reaches the sim. Every number is a pick (s).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isGearItem, itemRarity, Rarity, Res, RESOURCES, TRINKET_BASE, TRINKET_METALS } from '@blockyrts/sim';
import { showInstances } from './instances.ts';

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
  /** How often it starts a glint, on average, seconds (GLINT_EVERY_S when left out), and how many it has alive at once (GLINTS_PER_SPOT). */
  every?: number;
  most?: number;
}

/** An epic piece's glint (its name colour, a little paler) and a legendary piece's sparkle (Patch 7, plan section 3). */
export const EPIC_GLINT = 0xd6a8ff;
export const LEGENDARY_GLINT = 0xffffff;

/** How a piece of gear on the ground shines: an epic one glints slightly (now and then, one at a time), a legendary one sparkles (often, several at once); null for anything else. */
export function gearGlint(res: number): { colour: number; every: number; most: number } | null {
  if (!isGearItem(res)) return null;
  const r = itemRarity(res);
  if (r === Rarity.Legendary) return { colour: LEGENDARY_GLINT, every: 0.3, most: 4 };
  if (r === Rarity.Epic) return { colour: EPIC_GLINT, every: 1.8, most: 1 };
  return null;
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
    showInstances(this.mesh, w);
  }
}

/** A vent that steams: where (metres), how big its puffs start (m), puffs a second, how fast they rise (m/s), how long they last (s), and their colour. */
export interface SteamSpot {
  x: number;
  y: number;
  z: number;
  size: number;
  rate: number;
  rise: number;
  life: number;
  colour: number;
}

/** A hot spring's vents, a hot spring's bubbles and a sulphur rock's vent. */
export const SPRING_STEAM = { size: 0.3, rate: 1.4, rise: 0.4, life: 2.4, colour: 0xf2f4f6 } as const;
export const SPRING_BUBBLE = { size: 0.05, rate: 1.6, rise: 0.08, life: 0.45, colour: 0xe8f2f4 } as const;
export const SULPHUR_STEAM = { size: 0.22, rate: 0.9, rise: 0.35, life: 2, colour: 0xeeeacc } as const;

const MAX_STEAM = 240;

/** Soft puffs that rise, drift, swell and shrink away; lit by the day like the land. */
class Steam {
  readonly mesh: THREE.InstancedMesh;
  /** Per puff: x y z vx vy vz age life size. */
  private readonly p = new Float32Array(MAX_STEAM * 9);
  private n = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.42, depthWrite: false }), MAX_STEAM);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STEAM * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  add(s: SteamSpot): void {
    if (this.n >= MAX_STEAM) return;
    const o = this.n * 9;
    const p = this.p;
    p[o] = s.x + (Math.random() - 0.5) * s.size * 0.6;
    p[o + 1] = s.y;
    p[o + 2] = s.z + (Math.random() - 0.5) * s.size * 0.6;
    // A light breeze from the west, as the chimney smoke has.
    p[o + 3] = 0.05 + (Math.random() - 0.5) * 0.08;
    p[o + 4] = s.rise * (0.8 + Math.random() * 0.4);
    p[o + 5] = (Math.random() - 0.5) * 0.08;
    p[o + 6] = 0;
    p[o + 7] = s.life * (0.8 + Math.random() * 0.4);
    p[o + 8] = s.size * (0.8 + Math.random() * 0.4);
    this.mesh.setColorAt(this.n, this.c.setHex(s.colour));
    this.n++;
  }

  update(dt: number): void {
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * 9;
      const age = p[o + 6]! + dt;
      if (age >= p[o + 7]!) continue;
      const d = w * 9;
      if (d !== o) {
        p.copyWithin(d, o, o + 9);
        this.mesh.getColorAt(r, this.c);
        this.mesh.setColorAt(w, this.c);
      }
      p[d] = p[d]! + p[d + 3]! * dt;
      p[d + 1] = p[d + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[d + 2]! + p[d + 5]! * dt;
      p[d + 6] = age;
      const k = age / p[d + 7]!;
      // Swells as it rises, then thins away to nothing.
      this.dummy.position.set(p[d]!, p[d + 1]!, p[d + 2]!);
      this.dummy.rotation.y = age * 0.5;
      this.dummy.scale.setScalar(Math.max(0.001, p[d + 8]! * (0.5 + 1.5 * k) * (1 - k * k * k)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(w, this.dummy.matrix);
      w++;
    }
    this.n = w;
    showInstances(this.mesh, w);
  }
}

export class WorldFx {
  private readonly glints: Pool;
  private spots: readonly GlitterSpot[] = [];
  private readonly steam = new Steam();
  private vents: readonly SteamSpot[] = [];
  /** Puffs owed to each vent. */
  private readonly owed = new Map<SteamSpot, number>();
  /** Glints running at each spot this frame. */
  private readonly running = new Map<GlitterSpot, number>();
  private readonly owner: GlitterSpot[] = [];

  constructor(scene: THREE.Scene) {
    const light = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.glints = new Pool(starGeometry(), light, MAX_GLINTS);
    this.glints.mesh.renderOrder = 3;
    scene.add(this.glints.mesh);
    scene.add(this.steam.mesh);
  }

  /** The vents that steam now (hot springs and sulphur rocks near the view). */
  setSteam(vents: readonly SteamSpot[]): void {
    this.vents = vents;
    this.owed.clear();
  }

  /** The spots that glitter now (gold and silver nodes and loot near the view). */
  setSpots(spots: readonly GlitterSpot[]): void {
    this.spots = spots;
  }

  /** Each frame: the glitter winks and the steam rises where it is seen. */
  update(dt: number, seen: (x: number, z: number) => boolean): void {
    for (const v of this.vents) {
      let owed = (this.owed.get(v) ?? Math.random()) + v.rate * dt;
      for (; owed >= 1; owed--) if (seen(v.x, v.z)) this.steam.add(v);
      this.owed.set(v, owed);
    }
    this.steam.update(dt);
    this.running.clear();
    for (let k = 0; k < this.glints.n; k++) {
      const s = this.owner[k];
      if (s) this.running.set(s, (this.running.get(s) ?? 0) + 1);
    }
    for (const s of this.spots) {
      if (this.glints.n >= MAX_GLINTS) break;
      if ((this.running.get(s) ?? 0) >= (s.most ?? GLINTS_PER_SPOT) || Math.random() >= dt / (s.every ?? GLINT_EVERY_S) || !seen(s.x, s.z)) continue;
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
