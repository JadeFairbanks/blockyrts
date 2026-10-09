// The Tavern's look beyond its model (Patch 5, Jade, GP-19 and GP-20). Open
// for business, "the lights are on and flickering with occasional
// silhouettes in the windows and it just generally looks like a party in
// there": each of its 16 windows glows and flickers on its own, now and then
// someone walks past inside, a warm light spills out of the door at night,
// and the chimney smokes hard. Closed, the windows and the lantern go dark
// (the model paints them lit) and the chimney only smokes a little. Over a
// Tavern of the player's a plain bar shows its progress: the Dreadnought
// being hired, else the till filling to the next silver ingot while it is
// open. [The shared bar stack over buildings (UI-18) and the lit windows and
// chimney smoke of other buildings (VX-2, VX-3) belong to other threads; this
// bar and this smoke are the Tavern's own until those land.]
import * as THREE from 'three';
import { BuildingKind } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import type { BuildingInfo } from '../messages.ts';
import { catalogueIds } from './buildings-view.ts';
import { COLUMN_M, UNIT_M } from './mesher.ts';

/** One model unit, metres (16 to a column). */
const U = COLUMN_M / 16;

/** The glass of each lit window, model units (from tavern.bbmodel's glow_window cubes): the box and the way it faces out. */
const WINDOWS: ReadonlyArray<readonly [number, number, number, number, number, number, 'x-' | 'x+' | 'z-' | 'z+']> = [
  [-56.5, 37, -42.3, -47.5, 51, -39.5, 'z-'],
  [-32.5, 37, -42.3, -23.5, 51, -39.5, 'z-'],
  [30, 36, -42.3, 50, 52, -39.5, 'z-'],
  [-38, 98, -50.3, -28, 118, -47.5, 'z-'],
  [-16, 98, -50.3, -6, 118, -47.5, 'z-'],
  [6, 98, -50.3, 16, 118, -47.5, 'z-'],
  [28, 98, -50.3, 38, 118, -47.5, 'z-'],
  [-66.3, 37, 25, -63.5, 51, 35, 'x-'],
  [-66.3, 98, -29, -63.5, 118, -19, 'x-'],
  [63.5, 37, 25, 66.3, 51, 35, 'x+'],
  [63.5, 98, -29, 66.3, 118, -19, 'x+'],
  [-41, 98, 63.5, -31, 118, 66.3, 'z+'],
  [-5, 98, 63.5, 5, 118, 66.3, 'z+'],
  [31, 98, 63.5, 41, 118, 66.3, 'z+'],
  [-34, 168, -32.3, -26, 178, -29.5, 'z-'],
  [26, 168, -32.3, 34, 178, -29.5, 'z-'],
];
/** The lantern over the door (glow_lantern), and the chimney pot's top (fx_smoke), model units. */
const LANTERN = [-2.6, 58.8, -46.6, 2.6, 64.8, -43.4] as const;
const CHIMNEY = [70.75, 245, 8] as const;
/** The roof's top, model units: the bar floats above it. */
const ROOF_U = 245;

const MAX_TAVERNS = 24;
const MAX_PANES = MAX_TAVERNS * WINDOWS.length;
const MAX_PUFFS = 240;
/** Seconds between puffs from the chimney, open and closed; how long one lasts. */
const PUFF_OPEN_S = 0.35;
const PUFF_CLOSED_S = 1.4;
const PUFF_LIFE_S = 3.2;

const WARM = new THREE.Color(0xffb050);

/** A quarter-turn round y that makes a plane facing +z face this way. */
function turn(face: 'x-' | 'x+' | 'z-' | 'z+'): number {
  return face === 'z+' ? 0 : face === 'z-' ? Math.PI : face === 'x+' ? Math.PI / 2 : -Math.PI / 2;
}

/** A small hash of whole numbers, for each window's own rhythm. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
}

export class TavernView {
  private readonly covers: THREE.InstancedMesh;
  private readonly lanterns: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly figures: THREE.InstancedMesh;
  private readonly smoke: THREE.InstancedMesh;
  private readonly light = new THREE.PointLight(0xffa850, 0, 9, 1.6);
  private readonly bars: Array<{ back: THREE.Sprite; fill: THREE.Sprite }> = [];
  private readonly fillMats: Record<'hire' | 'till', THREE.SpriteMaterial>;
  private readonly puffs: Puff[] = [];
  /** When each Tavern last puffed, s. */
  private readonly lastPuff = new Map<number, number>();
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private last = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly player: number,
  ) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const make = (mat: THREE.Material, n: number, geo: THREE.BufferGeometry = plane): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.covers = make(new THREE.MeshBasicMaterial({ color: 0x241c16, transparent: true, opacity: 0.88, depthWrite: false }), MAX_PANES);
    this.lanterns = make(new THREE.MeshBasicMaterial({ color: 0x2a2018 }), MAX_TAVERNS, new THREE.BoxGeometry(1, 1, 1));
    this.figures = make(new THREE.MeshBasicMaterial({ color: 0x1a0e06, transparent: true, opacity: 0.7, depthWrite: false }), MAX_PANES);
    this.halos = make(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAX_PANES);
    this.halos.renderOrder = 4;
    this.figures.renderOrder = 3;
    this.covers.renderOrder = 3;
    this.smoke = make(new THREE.MeshLambertMaterial({ color: 0x9a9894, transparent: true, opacity: 0.5, depthWrite: false }), MAX_PUFFS, new THREE.BoxGeometry(1, 1, 1));
    scene.add(this.light);
    this.fillMats = {
      hire: new THREE.SpriteMaterial({ color: 0xe8c25a, depthTest: false }),
      till: new THREE.SpriteMaterial({ color: 0xc8d2dc, depthTest: false }),
    };
  }

  /** Where a Tavern's model stands (its origin), metres. */
  private origin(b: BuildingInfo): THREE.Vector3 {
    const m = catalogueIds(b)[0];
    return new THREE.Vector3(b.x * COLUMN_M + (m?.dx ?? 0), b.y * UNIT_M, b.z * COLUMN_M + (m?.dz ?? 0));
  }

  /** Where a model point of a Tavern is in the world, metres, from its origin. */
  private at(o: THREE.Vector3, ux: number, uy: number, uz: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(o.x + ux * U, o.y + uy * U, o.z + uz * U);
  }

  /** Brings the effects in line with the latest info; call once a frame. darkness: 0 by day, 1 at night. */
  update(info: GameInfo, now: number, focus: THREE.Vector3, darkness: number): void {
    const t = now / 1000;
    const dt = this.last ? Math.min(0.1, t - this.last) : 0;
    this.last = t;
    const taverns = [...info.buildings.values()].filter((b) => b.kind === BuildingKind.Tavern && b.complete).slice(0, MAX_TAVERNS);
    let covers = 0;
    let halos = 0;
    let figures = 0;
    let lanterns = 0;
    let bars = 0;
    let nearest: { p: THREE.Vector3; d: number; flicker: number } | null = null;
    const p = new THREE.Vector3();
    const d = this.dummy;
    for (const b of taverns) {
      const o = this.origin(b);
      const open = b.tavern?.open ?? false;
      if (open) {
        WINDOWS.forEach(([x0, y0, z0, x1, y1, z1, face], k) => {
          const [cx, cy, cz, w, h] = this.pane(x0, y0, z0, x1, y1, z1, face);
          // Each window flickers to its own beat, a party going on inside.
          const flicker = 0.7 + 0.3 * Math.sin(t * (5 + 3 * hash(b.id, k)) + k) * Math.sin(t * (2.3 + hash(k, b.id)) + b.id);
          this.place(o, cx, cy, cz, face, w + 6, h + 6, 0.6, p);
          this.halos.setMatrixAt(halos, d.matrix);
          this.halos.setColorAt(halos, this.colour.copy(WARM).multiplyScalar(flicker * (0.3 + 0.6 * darkness)));
          halos++;
          // Now and then someone walks past the window: a dark figure crossing the pane.
          const period = 6 + 7 * hash(b.id * 31 + k, 7);
          const into = (t + period * hash(k, b.id * 17)) % period;
          if (into < 1.4) {
            const s = into / 1.4;
            const fw = w * 0.4 * Math.min(1, Math.min(s, 1 - s) * 6);
            const along = (s - 0.5) * (w - w * 0.4);
            const [ax, az] = face === 'z-' ? [-along, 0] : face === 'z+' ? [along, 0] : face === 'x+' ? [0, -along] : [0, along];
            this.place(o, cx + ax, cy - h * 0.12, cz + az, face, fw, h * 0.76, 0.3, p);
            this.figures.setMatrixAt(figures, d.matrix);
            figures++;
          }
        });
        const door = this.at(o, 0, 40, -62, new THREE.Vector3());
        const dist = door.distanceToSquared(focus);
        if (!nearest || dist < nearest.d) nearest = { p: door, d: dist, flicker: 0.8 + 0.2 * Math.sin(t * 7 + b.id) * Math.sin(t * 3.1) };
      } else {
        for (const [x0, y0, z0, x1, y1, z1, face] of WINDOWS) {
          const [cx, cy, cz, w, h] = this.pane(x0, y0, z0, x1, y1, z1, face);
          this.place(o, cx, cy, cz, face, w + 0.4, h + 0.4, 0.3, p);
          this.covers.setMatrixAt(covers, d.matrix);
          covers++;
        }
        const [lx0, ly0, lz0, lx1, ly1, lz1] = LANTERN;
        this.at(o, (lx0 + lx1) / 2, (ly0 + ly1) / 2, (lz0 + lz1) / 2, p);
        d.position.copy(p);
        d.rotation.set(0, 0, 0);
        d.scale.set((lx1 - lx0 + 0.6) * U, (ly1 - ly0 + 0.6) * U, (lz1 - lz0 + 0.6) * U);
        d.updateMatrix();
        this.lanterns.setMatrixAt(lanterns, d.matrix);
        lanterns++;
      }
      // The chimney: a puff every so often, more while open.
      const every = open ? PUFF_OPEN_S : PUFF_CLOSED_S;
      const lastPuff = this.lastPuff.get(b.id) ?? -Infinity;
      if (t - lastPuff >= every && this.puffs.length < MAX_PUFFS) {
        this.lastPuff.set(b.id, t);
        this.at(o, CHIMNEY[0], CHIMNEY[1], CHIMNEY[2], p);
        this.puffs.push({ x: p.x, y: p.y + 0.05, z: p.z, vx: (Math.random() - 0.5) * 0.25 + 0.12, vz: (Math.random() - 0.5) * 0.25, age: 0 });
      }
      if (b.owner === this.player) bars = this.bar(b, o, bars, p);
    }
    for (const id of this.lastPuff.keys()) if (!info.buildings.has(id)) this.lastPuff.delete(id);
    this.finish(this.covers, covers);
    this.finish(this.halos, halos);
    this.finish(this.figures, figures);
    this.finish(this.lanterns, lanterns);
    for (let k = bars; k < this.bars.length; k++) {
      this.bars[k]!.back.visible = false;
      this.bars[k]!.fill.visible = false;
    }
    this.updateSmoke(dt);
    if (nearest && darkness > 0.02) {
      this.light.position.copy(nearest.p);
      this.light.intensity = 5 * darkness * nearest.flicker;
    } else this.light.intensity = 0;
  }

  /** A window's glass: its middle on the outside face, and its width and height across that face, model units. */
  private pane(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, face: 'x-' | 'x+' | 'z-' | 'z+'): [number, number, number, number, number] {
    const cy = (y0 + y1) / 2;
    const h = y1 - y0;
    if (face === 'z-' || face === 'z+') return [(x0 + x1) / 2, cy, face === 'z-' ? z0 : z1, x1 - x0, h];
    return [face === 'x-' ? x0 : x1, cy, (z0 + z1) / 2, z1 - z0, h];
  }

  /** Sets the dummy to a quad on a Tavern's wall: centred on a model point, this size (model units), out from the wall by `out` units. */
  private place(o: THREE.Vector3, cx: number, cy: number, cz: number, face: 'x-' | 'x+' | 'z-' | 'z+', w: number, h: number, out: number, p: THREE.Vector3): void {
    const ox = face === 'x-' ? -out : face === 'x+' ? out : 0;
    const oz = face === 'z-' ? -out : face === 'z+' ? out : 0;
    this.at(o, cx + ox, cy, cz + oz, p);
    const d = this.dummy;
    d.position.copy(p);
    d.rotation.set(0, turn(face), 0);
    d.scale.set(Math.max(0.001, w * U), h * U, 1);
    d.updateMatrix();
  }

  /** The bar over one of the player's Taverns: hiring the Dreadnought, else the till while open. Returns the bars used. */
  private bar(b: BuildingInfo, o: THREE.Vector3, n: number, p: THREE.Vector3): number {
    const head = b.queue[0];
    const till = b.tavern?.open ? b.tavern.done : -1;
    const done = head ? head.done : till;
    if (done < 0) return n;
    let bar = this.bars[n];
    if (!bar) {
      const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x101010, transparent: true, opacity: 0.75, depthTest: false }));
      const fill = new THREE.Sprite(this.fillMats.till);
      for (const s of [back, fill]) {
        s.renderOrder = 10;
        this.scene.add(s);
      }
      fill.renderOrder = 11;
      bar = { back, fill };
      this.bars.push(bar);
    }
    const W = 2.2;
    const H = 0.16;
    this.at(o, 0, ROOF_U + 20, 4, p);
    const frac = Math.max(0.01, Math.min(1, done / 1000));
    bar.back.position.copy(p);
    bar.back.scale.set(W + 0.06, H + 0.06, 1);
    bar.back.visible = true;
    bar.fill.material = head ? this.fillMats.hire : this.fillMats.till;
    bar.fill.position.copy(p);
    bar.fill.scale.set(W * frac, H, 1);
    // Anchored at its left end: the bar grows from the left of the trough.
    bar.fill.center.set(0.5 / frac, 0.5);
    bar.fill.visible = true;
    return n + 1;
  }

  private finish(m: THREE.InstancedMesh, n: number): void {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Puffs rise and drift, swelling as they thin out. */
  private updateSmoke(dt: number): void {
    const d = this.dummy;
    let w = 0;
    for (const s of this.puffs) {
      s.age += dt;
      if (s.age >= PUFF_LIFE_S) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.y += 0.55 * dt;
      const k = s.age / PUFF_LIFE_S;
      this.puffs[w] = s;
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(0, s.age * 0.6, 0);
      d.scale.setScalar(0.18 + 0.4 * k - 0.25 * k * k * k);
      d.updateMatrix();
      this.smoke.setMatrixAt(w, d.matrix);
      w++;
    }
    this.puffs.length = w;
    this.finish(this.smoke, w);
  }
}
