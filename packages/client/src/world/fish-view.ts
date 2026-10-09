// The live fish (Patch 5, Jade's FR-1 and FR-2): "Change fish to live models
// swimming in water". Each fish stretch near the camera shows its fish
// swimming in the water beside its bank, as many as it holds out of its most
// (up to 8 drawn, at least 1 while it has any), so a stretch fished down
// looks it. When a woodsman lands one ("When a fish is fished it gets
// visually pulled up on the line to the woodsman, and disappears, going into
// the woodsman's inventory/backpack"), the sim sends a 'catch' hit: the fish
// comes up out of the water on his line in an arc to him, and is gone.
import * as THREE from 'three';
import { PropKind, WU_PER_METRE, type HitEvent } from '@blockyrts/sim';
import { InstancedModel } from '../models/instanced-model.ts';
import type { ModelLibrary } from '../models/library.ts';
import { CHUNK_M, COLUMN_M } from './mesher.ts';
import type { PropSummary } from './mesh-messages.ts';

/** Each stretch's fish model. */
const FISH_MODELS: Readonly<Record<number, string>> = {
  [PropKind.FishTrout]: 'fish_trout',
  [PropKind.FishSalmon]: 'fish_salmon',
  [PropKind.FishCatfish]: 'fish_giant_catfish',
};

/** Fish drawn for a full stretch; fewer as it is fished down. */
const MOST_SHOWN = 8;
/** Fish of one kind on screen at once, at most. */
const MAX_FISH = 256;
/** Stretches farther than this from the camera's focus show no fish, metres. */
const SHOW_M = 70;
/** How far each kind swims round its spot, how deep under the surface its middle is and half its length, metres: a trout is 0.5 m long, a salmon 0.8 m, a giant catfish 1.3 m. */
const SWIM: Readonly<Record<number, { round: number; depth: number; half: number }>> = {
  [PropKind.FishTrout]: { round: 0.3, depth: 0.12, half: 0.25 },
  [PropKind.FishSalmon]: { round: 0.4, depth: 0.18, half: 0.4 },
  [PropKind.FishCatfish]: { round: 0.6, depth: 0.32, half: 0.65 },
};
/** How far a fish's spot may sit off the middle of its water, metres. */
const JITTER_M = 0.08;
/** A catch: how long it takes to come up to the woodsman (s), how high the arc rises over the straight line (m). */
const CATCH_S = 0.9;
const ARC_M = 1.1;
/** Where the line runs from: his rod's tip, above and out in front of him toward the water (m). */
const ROD_UP_M = 1.9;
const ROD_OUT_M = 1.3;
/** Where the fish ends up: his bag at his hip (m). */
const BAG_UP_M = 1;
/** Catches drawn at once, at most. */
const MAX_CATCHES = 16;

/**
 * Where a fish swims, kept clear of the bank: the middle of the open water
 * round one of the stretch's columns and how far it may swim from there along
 * x and along z with its whole length still in the water (world metres).
 */
interface Spot {
  x: number;
  y: number;
  z: number;
  ax: number;
  az: number;
  /** Whether the water runs farther along x than along z. */
  alongX: boolean;
}

interface Stretch {
  kind: number;
  shown: number;
  /** The water it swims in: x, y, z per column, world metres. */
  water: number[];
  /** Where its fish swim: the spots each fits in lengthwise, or the roomiest it has. */
  spots: Spot[];
  /** A number of its own, so its fish do not swim in step with the next stretch's. */
  seed: number;
}

interface Catch {
  kind: number;
  t0: number;
  /** Where it comes out of the water and the woodsman it goes to (his entity id). */
  from: THREE.Vector3;
  who: number;
}

/** A unit's place for a catch's line, wu. */
type Where = (id: number) => { x: number; y: number; z: number } | null;

export class FishView {
  private readonly chunks = new Map<string, Stretch[]>();
  private readonly models = new Map<number, InstancedModel>();
  private lib: ModelLibrary | null = null;
  private readonly catches: Catch[] = [];
  private readonly line: THREE.LineSegments;
  private readonly linePos: Float32Array;

  constructor(private readonly scene: THREE.Scene) {
    this.linePos = new Float32Array(MAX_CATCHES * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 3;
    scene.add(this.line);
  }

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    for (const id of Object.values(FISH_MODELS)) if (lib.listed(id)) lib.request(id);
  }

  /** A chunk's props as meshed (world-view install): its fish stretches, their water in world metres. */
  setChunk(key: string, cx: number, cz: number, props: readonly PropSummary[]): void {
    const list: Stretch[] = [];
    for (const p of props) {
      if (!p.water || p.water.length === 0 || !(p.kind in FISH_MODELS) || p.amount <= 0) continue;
      const water = p.water.map((v, k) => (k % 3 === 0 ? v + cx * CHUNK_M : k % 3 === 2 ? v + cz * CHUNK_M : v));
      const shown = Math.max(1, Math.min(MOST_SHOWN, Math.ceil((p.amount * MOST_SHOWN) / Math.max(1, p.most))));
      list.push({ kind: p.kind, shown, water, spots: fishSpots(p.kind, water, p.room), seed: (cx * 73856093) ^ (cz * 19349663) ^ (p.index * 83492791) });
    }
    if (list.length > 0) this.chunks.set(key, list);
    else this.chunks.delete(key);
  }

  dropChunk(key: string): void {
    this.chunks.delete(key);
  }

  /** The state message's hits: each 'catch' starts a fish up the line. */
  onHits(hits: readonly HitEvent[], seen: (x: number, z: number) => boolean, now: number): void {
    for (const h of hits) {
      if (h.look !== 'catch') continue;
      const x = h.x / WU_PER_METRE;
      const z = h.z / WU_PER_METRE;
      if (!seen(x, z)) continue;
      if (this.catches.length >= MAX_CATCHES) this.catches.shift();
      this.catches.push({ kind: h.mob ?? PropKind.FishTrout, t0: now, from: new THREE.Vector3(x, h.y / WU_PER_METRE, z), who: h.id });
    }
  }

  /** Each frame: the fish swim, and each catch comes up its line. */
  update(now: number, focus: THREE.Vector3, where: Where): void {
    const s = now / 1000;
    const counts = new Map<number, number>();
    const put = (kind: number, x: number, y: number, z: number, heading: number, clip: string, t: number): void => {
      const m = this.model(kind);
      if (!m) return;
      const n = counts.get(kind) ?? 0;
      if (n >= m.maxInstances) return;
      m.setInstance(n, x, y, z, heading, clip, t, null);
      counts.set(kind, n + 1);
    };
    for (const list of this.chunks.values()) {
      for (const st of list) {
        if (Math.hypot(st.water[0]! - focus.x, st.water[2]! - focus.z) > SHOW_M) continue;
        for (let k = 0; k < st.shown; k++) {
          // Each fish circles a spot of its own in the water, some one way and some the other, at its own pace.
          const r = hash(st.seed + k * 7919);
          const sp = st.spots[(r >>> 3) % st.spots.length]!;
          const dir = r & 1 ? 1 : -1;
          const pace = 0.35 + ((r >>> 8) % 50) / 100;
          const a = dir * pace * s + ((r >>> 16) % 628) / 100;
          const cx = sp.x + (sp.ax > 0 ? ((((r >>> 20) % 9) - 4) / 4) * JITTER_M : 0);
          const cz = sp.z + (sp.az > 0 ? ((((r >>> 24) % 9) - 4) / 4) * JITTER_M : 0);
          let x: number, z: number, dx: number, dz: number;
          if (sp.ax > 0 && sp.az > 0) {
            // Round its spot, facing the way it swims.
            x = cx + sp.ax * Math.cos(a);
            z = cz + sp.az * Math.sin(a);
            dx = -sp.ax * Math.sin(a) * dir;
            dz = sp.az * Math.cos(a) * dir;
          } else {
            // Too narrow to turn round in: it holds facing along the water, drifting up and back, as a big fish does in a stream.
            const drift = (sp.alongX ? sp.ax : sp.az) * Math.sin(a);
            x = cx + (sp.alongX ? drift : 0);
            z = cz + (sp.alongX ? 0 : drift);
            dx = sp.alongX ? dir : 0;
            dz = sp.alongX ? 0 : dir;
          }
          put(st.kind, x, sp.y - SWIM[st.kind]!.depth, z, Math.atan2(-dx, -dz), 'swim', s + (r % 97) / 10);
        }
      }
    }
    // The catches: up out of the water on the line, in an arc to the woodsman, then gone into his bag.
    let lines = 0;
    for (let k = this.catches.length - 1; k >= 0; k--) {
      const c = this.catches[k]!;
      const t = (now - c.t0) / 1000 / CATCH_S;
      const u = where(c.who);
      if (t >= 1 || !u) {
        this.catches.splice(k, 1);
        continue;
      }
      const ux = u.x / WU_PER_METRE;
      const uy = u.y / WU_PER_METRE;
      const uz = u.z / WU_PER_METRE;
      const along = Math.hypot(c.from.x - ux, c.from.z - uz) || 1;
      const tipX = ux + ((c.from.x - ux) / along) * Math.min(ROD_OUT_M, along);
      const tipZ = uz + ((c.from.z - uz) / along) * Math.min(ROD_OUT_M, along);
      const tipY = uy + ROD_UP_M;
      const x = c.from.x + (ux - c.from.x) * t;
      const z = c.from.z + (uz - c.from.z) * t;
      const y = c.from.y + (uy + BAG_UP_M - c.from.y) * t + 4 * ARC_M * t * (1 - t);
      // Head up on the line, turning as it comes.
      put(c.kind, x, y, z, Math.atan2(c.from.x - ux, c.from.z - uz) + t * 5, 'swim', s * 3);
      this.linePos.set([tipX, tipY, tipZ, x, y + 0.08, z], lines * 6);
      lines++;
    }
    for (const [kind, m] of this.models) {
      m.setCount(counts.get(kind) ?? 0);
      m.commit();
    }
    const g = this.line.geometry;
    g.setDrawRange(0, lines * 2);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.line.visible = lines > 0;
  }

  /** The kind's instanced model once its model has loaded, or null. */
  private model(kind: number): InstancedModel | null {
    let m = this.models.get(kind);
    if (m) return m;
    const id = FISH_MODELS[kind];
    const data = id ? this.lib?.models.get(id) : undefined;
    if (!data) return null;
    m = new InstancedModel(data, MAX_FISH);
    this.scene.add(m.object);
    this.models.set(kind, m);
    return m;
  }
}

/**
 * A stretch's spots (world metres; room: four counts per column of the open
 * water past it toward -x, +x, -z and +z): each column's water centred on the
 * run it lies in, the fish's swim cut so its nose and tail stay off the bank.
 * Where the kind fits lengthwise somewhere it swims only there; else in the
 * roomiest water the stretch has.
 */
export function fishSpots(kind: number, water: readonly number[], room: readonly number[] | undefined): Spot[] {
  const swim = SWIM[kind] ?? SWIM[PropKind.FishTrout]!;
  const spots: Array<Spot & { fit: number }> = [];
  for (let k = 0; k < water.length / 3; k++) {
    const [l = 0, r = 0, b = 0, f = 0] = room?.slice(k * 4, k * 4 + 4) ?? [];
    const halfX = ((l + r + 1) * COLUMN_M) / 2;
    const halfZ = ((b + f + 1) * COLUMN_M) / 2;
    spots.push({
      x: water[k * 3]! + ((r - l) * COLUMN_M) / 2,
      y: water[k * 3 + 1]!,
      z: water[k * 3 + 2]! + ((f - b) * COLUMN_M) / 2,
      ax: Math.min(swim.round, Math.max(0, halfX - swim.half - JITTER_M)),
      az: Math.min(swim.round, Math.max(0, halfZ - swim.half - JITTER_M)),
      alongX: halfX > halfZ,
      fit: Math.max(halfX, halfZ),
    });
  }
  const most = Math.max(...spots.map((p) => p.fit));
  const fits = spots.filter((p) => p.fit >= swim.half);
  return (fits.length > 0 ? fits : spots.filter((p) => p.fit === most)).map(({ fit: _, ...p }) => p);
}

/** A small integer hash, for each fish's own spot and pace (looks only). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
