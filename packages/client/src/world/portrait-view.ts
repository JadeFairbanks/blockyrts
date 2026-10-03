// The portrait (patch notes 1): a live headshot of the selected unit in its
// idle clip, or a still of the selected building from about 45 degrees,
// drawn into the portrait panel's window on the main canvas after the world.
// It is a scene of its own with one subject at the origin: a unit is the
// world's units view fed a one-row state message (the unit as it is, standing
// idle, three-quarters to the camera), so it wears the same body, kit and
// colour as on the map; a building is its catalogue model or its blocks.
// Enemy and neutral things show the same way.
import * as THREE from 'three';
import { footprintDims, mobSpec, mountSpec, OrderKind, PEOPLES, peopleUnitSpec, Role, speciesSpec, UnitKind, WU_PER_METRE } from '@blockyrts/sim';
import type { GameInfo } from '../game/game-info.ts';
import { S, STATE_STRIDE, UnitFlag, type BuildingInfo, type StateMessage } from '../messages.ts';
import { InstancedModel, type ModelLibrary } from '../models/index.ts';
import { makeLook } from './building-looks.ts';
import { catalogueIds } from './buildings-view.ts';
import { COLUMN_M } from './mesher.ts';
import { UnitsView } from './units-view.ts';

/** How the camera looks at its subject: at a point, far enough to hold a sphere this big, from this side and height. */
export interface PortraitFrame {
  /** The point looked at, metres from the subject's feet (or footprint corner). */
  target: readonly [number, number, number];
  /** The radius that must fit in the window, metres. */
  radius: number;
  /** The camera's direction round the subject (radians, 0 from +Z) and above it (radians). */
  azimuth: number;
  elevation: number;
}

/** Humans' height (the worker, warrior and mage bodies), metres. */
const HUMAN_M = 1.69;
/** The unit turns this far from facing the camera: three-quarters on. */
const TURN = (25 * Math.PI) / 180;
/** A unit's heading in the one-row state (65536 a turn): it faces +Z turned by TURN (the bodies face -Z at heading 0). */
export const PORTRAIT_HEADING = Math.round(((Math.PI + TURN) / (Math.PI * 2)) * 65536);
const BACKGROUND = new THREE.Color(0x2a2016);

/** A head and shoulders for something this tall: the top fifth, a little above eye level. */
function headshot(height: number): PortraitFrame {
  return { target: [0, height * 0.86, 0], radius: Math.max(0.22, height * 0.17), azimuth: 0, elevation: 0.08 };
}

/** All of something this tall and this wide, from a little above. */
function whole(height: number, width: number): PortraitFrame {
  return { target: [0, height * 0.5, 0], radius: Math.max(0.18, 0.5 * Math.hypot(height, width)) * 1.05, azimuth: 0, elevation: 0.3 };
}

/**
 * The frame for a unit by its row of the state message: a headshot for
 * anything that stands up (the players' units, the peoples, upright
 * creatures), the whole of anything long or low (animals, spiders, engines,
 * a rider on its mount) and of a lair or a people's building.
 */
export function unitFrame(row: Int32Array): PortraitFrame {
  const kind = row[S.kind]!;
  const mob = row[S.mob]!;
  if (kind === UnitKind.Engine) return whole(2, 3);
  if (kind === UnitKind.Animal) {
    const s = speciesSpec(mob);
    const scale = (row[S.flags]! & UnitFlag.Young) !== 0 ? 0.5 : 1;
    return whole((s.height / WU_PER_METRE) * scale, (s.halfWidth * 3 * scale) / WU_PER_METRE);
  }
  if (kind === UnitKind.Mob) {
    const s = mobSpec(mob);
    const h = s.height / WU_PER_METRE;
    const w = (s.halfWidth * 2) / WU_PER_METRE;
    if (s.role === Role.Structure || h < w * 1.4) return whole(h, w);
    return headshot(h);
  }
  // The peoples (and the mercenaries they hire out) have their own heights.
  const tall = row[S.owner] === PEOPLES || row[S.group] !== 0 ? peopleUnitSpec(mob).heightCm / 100 : HUMAN_M;
  const mount = row[S.mount]!;
  if (mount !== 0) return whole(mountSpec(mount).shoulderCm / 100 + tall * 0.55, 2.4);
  return headshot(tall);
}

/** A building's still: the whole footprint and its height from the front corner, about 45 degrees round and 30 up. */
export function buildingFrame(kind: number, variant: number, height: number): PortraitFrame {
  const dims = footprintDims(kind, variant);
  const w = dims.w * COLUMN_M;
  const d = dims.d * COLUMN_M;
  return { target: [w / 2, height * 0.45, d / 2], radius: 0.5 * Math.hypot(w, d, height) * 0.8, azimuth: Math.PI / 4, elevation: 0.5 };
}

/** The camera distance that fits a sphere of this radius in a window of this aspect (width / height) at this vertical field of view. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return radius / Math.sin(Math.min(v, h) / 2);
}

/** What the portrait shows: a unit or building by its key ('e:12', 'b:4'), or nothing. */
export interface PortraitSubject {
  key: string;
  /** The window on screen, CSS px. */
  rect: DOMRect;
}

export class PortraitView {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(26, 1, 0.05, 400);
  private readonly units: UnitsView;
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private lib: ModelLibrary | null = null;
  /** The building on show: its signature, its mesh or models, and its frame. */
  private building: { sig: string; mesh: THREE.Mesh | null; models: InstancedModel[]; frame: PortraitFrame } | null = null;
  private readonly row = new Int32Array(STATE_STRIDE);
  private readonly msg: StateMessage = { type: 'state', step: 0, hash: 0, hashStep: 0, count: 0, data: this.row, shots: new Int32Array(0), hits: [] };
  private readonly size = new THREE.Vector2();
  private readonly clear = new THREE.Color();

  constructor(
    private readonly colours: readonly THREE.Color[],
    private readonly neutral: THREE.Color,
  ) {
    this.scene.background = BACKGROUND;
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a3e30, 1.9));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.1);
    key.position.set(-2, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 0.6);
    rim.position.set(3, 2, -4);
    this.scene.add(rim);
    this.units = new UnitsView(this.scene);
  }

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    this.units.setModels(lib);
    lib.onLoad(() => {
      if (this.building) this.building.sig = '';
    });
  }

  /**
   * Draws the subject into its window on the main canvas: after the world's
   * render, each frame. Nothing to draw (no subject, a resource node, the
   * window folded away) leaves the canvas as the world drew it.
   */
  render(renderer: THREE.WebGLRenderer, subject: PortraitSubject | null, game: GameInfo, now: number): void {
    if (!subject || subject.rect.width < 4 || subject.rect.height < 4) return;
    const frame = this.stage(subject.key, game, now);
    if (!frame) return;
    const canvas = renderer.domElement.getBoundingClientRect();
    renderer.getSize(this.size);
    const k = this.size.x / Math.max(1, canvas.width);
    const x = (subject.rect.left - canvas.left) * k;
    const w = subject.rect.width * k;
    const h = subject.rect.height * k;
    const y = this.size.y - (subject.rect.bottom - canvas.top) * k;
    this.aim(frame, w / h);
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, this.size.x, this.size.y);
    renderer.setScissor(0, 0, this.size.x, this.size.y);
    renderer.setClearColor(this.clear, alpha);
  }

  private aim(f: PortraitFrame, aspect: number): void {
    this.camera.aspect = aspect;
    const dist = fitDistance(f.radius, this.camera.fov, aspect);
    const [tx, ty, tz] = f.target;
    const flat = Math.cos(f.elevation) * dist;
    this.camera.position.set(tx + Math.sin(f.azimuth) * flat, ty + Math.sin(f.elevation) * dist, tz + Math.cos(f.azimuth) * flat);
    this.camera.lookAt(tx, ty, tz);
    this.camera.near = Math.max(0.02, dist - f.radius * 3);
    this.camera.far = dist + f.radius * 4;
    this.camera.updateProjectionMatrix();
  }

  /** Puts the subject on the stage; returns its frame, or null when there is nothing to show. */
  private stage(key: string, game: GameInfo, now: number): PortraitFrame | null {
    if (key.startsWith('e:')) {
      this.showBuilding(null);
      const live = game.unitRow(Number(key.slice(2)));
      if (!live) return this.empty(now);
      this.row.set(live);
      this.pose(this.row);
      this.msg.count = 1;
      this.msg.step = game.step;
      this.drawUnits(now);
      return unitFrame(this.row);
    }
    this.empty(now);
    if (key.startsWith('b:')) {
      const b = game.buildings.get(Number(key.slice(2)));
      if (!b) return this.showBuilding(null);
      return this.showBuilding(b);
    }
    return this.showBuilding(null);
  }

  /** Standing idle at the origin, three-quarters on: no swing, cast, hop, or walk; still hurt or young as it is. */
  private pose(r: Int32Array): void {
    r[S.x] = 0;
    r[S.y] = 0;
    r[S.z] = 0;
    r[S.heading] = PORTRAIT_HEADING;
    r[S.order] = OrderKind.Idle;
    r[S.swing] = 0;
    r[S.cast] = 0;
    r[S.beam] = 0;
    r[S.hop] = 0;
    r[S.inside] = 0;
    r[S.target] = 0;
    r[S.flags] = r[S.flags]! & ~(UnitFlag.Hurt | UnitFlag.Fleeing | UnitFlag.Charging | UnitFlag.Cloaked | UnitFlag.Climbing | UnitFlag.Swooping);
  }

  private empty(now: number): null {
    if (this.msg.count !== 0) {
      this.msg.count = 0;
      this.drawUnits(now);
    }
    return null;
  }

  private drawUnits(now: number): void {
    this.units.update({
      curr: this.msg,
      prev: null,
      sinceMs: 0,
      now,
      player: 0,
      colours: this.colours,
      neutral: this.neutral,
      seen: () => true,
      known: () => true,
      ruins: [],
      groundAt: () => 0,
      place: () => undefined,
    });
  }

  /** The building's still: its catalogue models once loaded, else its blocks. */
  private showBuilding(b: BuildingInfo | null): PortraitFrame | null {
    const sig = b ? `${b.kind}:${b.level}:${b.variant}:${b.owner}` : '';
    const cur = this.building;
    if (cur && cur.sig === sig) return cur.frame;
    if (cur) {
      if (cur.mesh) this.scene.remove(cur.mesh);
      for (const m of cur.models) {
        this.scene.remove(m.object);
        m.dispose();
      }
      this.building = null;
    }
    if (!b) return null;
    const team = this.colours[b.owner] ?? this.neutral;
    const look = makeLook(b.kind, Math.max(1, b.level), b.variant, team.getHex(), b.status.startsWith('Lying fallow'));
    const lib = this.lib;
    const ids = lib ? catalogueIds({ kind: b.kind, level: Math.max(1, b.level) }) : [];
    for (const m of ids) if (lib && !lib.models.has(m.id)) lib.request(m.id);
    const ready = lib !== null && ids.length > 0 && ids.every((m) => lib.models.has(m.id));
    const models: InstancedModel[] = [];
    let mesh: THREE.Mesh | null = null;
    let height = look.height;
    if (ready) {
      for (const m of ids) {
        const model = new InstancedModel(lib.get(m.id), 1);
        model.object.frustumCulled = false;
        model.setInstance(0, m.dx, 0, m.dz, 0, '', 0, team);
        model.setCount(1);
        model.commit();
        this.scene.add(model.object);
        models.push(model);
        const box = lib.get(m.id).boundingBox;
        height = Math.max(height, box.max.y);
      }
    } else {
      mesh = new THREE.Mesh(look.geometry, this.material);
      this.scene.add(mesh);
    }
    const frame = buildingFrame(b.kind, b.variant, Math.max(0.6, height));
    // Blocks stand in while its models load; setModels' onLoad clears the signature so it switches over.
    this.building = { sig, mesh, models, frame };
    return frame;
  }
}
