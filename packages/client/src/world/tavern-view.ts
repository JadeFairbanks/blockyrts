// The Tavern's look beyond its model (Patch 5, Jade, GP-19 and GP-20). Open
// for business, "the lights are on and flickering with occasional
// silhouettes in the windows and it just generally looks like a party in
// there": each of its 16 windows glows and flickers on its own, now and then
// someone walks past inside, and a warm light spills out of the door at
// night. Closed, the windows and the lantern go dark (the model paints them
// lit). Its chimney smokes with the other buildings' chimneys, while it is open
// from dusk to dawn (building-glow.ts). Its bars are in the shared stack over
// buildings (UI-18): the stack draws a Dreadnought being hired as any queue's
// gold bar, and hud/tavern-bars.ts adds the till's silver bar to the next
// ingot while it is open.
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
/** The lantern over the door (glow_lantern), model units. */
const LANTERN = [-2.6, 58.8, -46.6, 2.6, 64.8, -43.4] as const;

const MAX_TAVERNS = 24;
const MAX_PANES = MAX_TAVERNS * WINDOWS.length;

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

export class TavernView {
  private readonly covers: THREE.InstancedMesh;
  private readonly lanterns: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly figures: THREE.InstancedMesh;
  private readonly light = new THREE.PointLight(0xffa850, 0, 9, 1.6);
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();

  constructor(scene: THREE.Scene) {
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
    scene.add(this.light);
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
    const taverns = [...info.buildings.values()].filter((b) => b.kind === BuildingKind.Tavern && b.complete).slice(0, MAX_TAVERNS);
    let covers = 0;
    let halos = 0;
    let figures = 0;
    let lanterns = 0;
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
    }
    this.finish(this.covers, covers);
    this.finish(this.halos, halos);
    this.finish(this.figures, figures);
    this.finish(this.lanterns, lanterns);
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

  private finish(m: THREE.InstancedMesh, n: number): void {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
