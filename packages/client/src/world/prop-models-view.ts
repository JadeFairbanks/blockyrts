// The world props' own models (Patch 5): every tree, sapling and seed, bush,
// rock, ore and carcass, and the stone circles' pieces (a fish stretch's live
// fish are fish-view.ts's), drawn
// with its catalogue model (prop-models.ts) in the full-detail chunks round
// the camera, one instanced draw per model. A prop's cubes stand in until its
// model has loaded (the mesh workers leave them out from then on). The idols
// stand on their altars until taken, and a chest the player has opened
// stands open. anchorsAt says where a drawn prop's effect anchors are (a hot
// spring's steam, a gold node's glints), for the world's effects.
//
// Only the props on screen, or whose shadows can reach it, are drawn: the
// full-detail chunks are 144 m a side and the screen shows a small part of
// that, so most of their props were drawn (and drawn again for the shadows)
// out of sight.
import * as THREE from 'three';
import { CircleType, PropKind, variantCircle, variantLook, variantType, type CirclesView } from '@blockyrts/sim';
import { InstancedModel, type ModelData, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import type { PropModelPlace } from './mesh-messages.ts';
import { PROP_MODEL_IDS } from './prop-models.ts';
import { SHADOW_BELOW_M, SUN_FROM } from './sun-shadows.ts';

/** A prop drawn with its model: its selectable's key, where it stands (world metres) and what it is. */
export interface PlacedProp {
  key: string;
  kind: number;
  variant: number;
  /** The chunk's corner, metres. */
  ox: number;
  oz: number;
  model: PropModelPlace;
}

/** The idol on a circle type's altar (SCA-4, SCB-1). */
const IDOL_MODEL: Readonly<Record<number, string>> = {
  [CircleType.Lunar]: 'moon_goddess_idol',
  [CircleType.Boneyard]: 'headless_god_idol',
};

/** Every model id this view may draw. */
export const PROP_VIEW_IDS: ReadonlySet<string> = new Set([...PROP_MODEL_IDS, ...Object.values(IDOL_MODEL)]);

/** Room for this many instances of one model at first; a draw grows by doubling. */
const FIRST_ROOM = 64;
const BONE = new THREE.Matrix4();
const AT = new THREE.Vector3();
const PLACE = new THREE.Matrix4();
const SIZE = new THREE.Vector3();

/** Towards the sun: a prop's shadow falls the other way. */
const TO_SUN = SUN_FROM.clone().normalize();
/**
 * A prop's shadow is followed down the sun's rays until it is this far below
 * the prop's feet (the shadow box keeps as much ground under the camera's
 * focus), in this many spheres; and every sphere has this much room more,
 * metres (the shadows' soft edge, an idol on its altar).
 */
const SHADOW_DROP_M = SHADOW_BELOW_M;
const SHADOW_SPHERES = 4;
const ROOM_M = 0.5;
const IDOL_ROOM_M = 2;
const FRUSTUM = new THREE.Frustum();
const SCREEN = new THREE.Matrix4();
const SPHERE = new THREE.Sphere();

/** A prop as gathered for drawing: what it is, and the spheres holding it and its shadow (x, y, z, radius each). */
interface Gathered {
  p: PlacedProp;
  spheres: Float32Array;
}

/** The spheres that hold a prop's model, posed as drawn, and its shadow down the sun's rays to SHADOW_DROP_M below its feet. */
function shadowSpheres(model: ModelData, x: number, y: number, z: number, scale: number, room: number): Float32Array {
  const box = model.boundingBox;
  // Round the upright line through its feet, so it holds the model whichever way it is turned.
  const across = Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z));
  const r = Math.hypot(across, (box.max.y - box.min.y) / 2) * scale + room;
  const cy = y + ((box.max.y + box.min.y) / 2) * scale;
  const top = y + Math.max(0, box.max.y) * scale;
  // Along the rays from the top of the prop down to SHADOW_DROP_M under its feet.
  const reach = (top - (y - SHADOW_DROP_M)) / TO_SUN.y;
  const out = new Float32Array(SHADOW_SPHERES * 4);
  for (let k = 0; k < SHADOW_SPHERES; k++) {
    const t = (reach * (k + 0.5)) / SHADOW_SPHERES;
    out[k * 4] = x - TO_SUN.x * t;
    out[k * 4 + 1] = cy - TO_SUN.y * t;
    out[k * 4 + 2] = z - TO_SUN.z * t;
    out[k * 4 + 3] = r + reach / (2 * SHADOW_SPHERES);
  }
  return out;
}

/** Where a prop's model has the bones whose names match, in the world (metres), placed as it is drawn: turned, sized and moved from its chunk's corner (ox, oz). */
export function anchorsAt(model: ModelData, place: PropModelPlace, ox: number, oz: number, match: RegExp): THREE.Vector3[] {
  PLACE.makeRotationY(place.yaw).scale(SIZE.setScalar(place.scale)).setPosition(ox + place.x, place.y, oz + place.z);
  const out: THREE.Vector3[] = [];
  model.boneNames.forEach((name, i) => {
    const rest = model.restWorld[i];
    if (rest && match.test(name)) out.push(new THREE.Vector3().setFromMatrixPosition(rest).applyMatrix4(PLACE));
  });
  return out;
}

export class PropModelsView {
  private lib: ModelLibrary | null = null;
  /** By model id. */
  private readonly draws = new Map<string, InstancedModel>();
  private dirty = true;
  private sig = '';
  /** The props in the full-detail chunks by model id, and the idols to stand on their altars. */
  private gathered = new Map<string, Gathered[]>();
  private idols: Array<{ p: PlacedProp; id: string }> = [];
  private taken: ReadonlySet<number> = new Set();
  private opened: ReadonlySet<number> = new Set();
  private hover: ReadonlySet<string> = new Set();
  /** Per gathered prop in order: 1 when the camera can see it or its shadow, as last drawn. */
  private seen = new Uint8Array(0);
  /** Gathered anew since the draws were last filled. */
  private refill = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly patch: ModelShaderPatch,
  ) {}

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    this.dirty = true;
  }

  /** The chunks or their props changed: gathered anew on the next update. */
  invalidate(): void {
    this.dirty = true;
  }

  /** The draws with an instance under the cursor, for the hover outline. */
  hovered(): InstancedModel[] {
    return [...this.draws.values()].filter((d) => d.hoveredCount > 0);
  }

  /**
   * Gathers the props in the full-detail chunks anew when the chunks, the
   * hover, the idols taken or the chests opened change; cull draws them.
   */
  update(props: Iterable<readonly PlacedProp[]>, circles: CirclesView | null | undefined, hover: ReadonlySet<string>): void {
    const lib = this.lib;
    if (!lib) return;
    const taken = circles?.taken ?? [];
    const opened = circles?.chests.map((c) => c[0]) ?? [];
    const sig = `${taken.join(',')}|${opened.join(',')}|${[...hover].join(',')}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.dirty = true;
    }
    if (this.dirty) {
      this.taken = new Set(taken);
      this.opened = new Set(opened);
      this.hover = new Set(hover);
      this.gather(lib, props);
    }
  }

  /**
   * Draws the gathered props the camera can see or whose shadows can fall in
   * its sight, refilling the draws when that set changes. Call once the camera
   * has moved for the frame, before it is drawn.
   */
  cull(camera: THREE.Camera): void {
    const lib = this.lib;
    if (!lib) return;
    camera.updateMatrixWorld();
    FRUSTUM.setFromProjectionMatrix(SCREEN.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let changed = this.refill;
    let k = 0;
    for (const list of this.gathered.values()) {
      for (const g of list) {
        let on = 0;
        const s = g.spheres;
        for (let j = 0; j < s.length && on === 0; j += 4) {
          SPHERE.center.set(s[j]!, s[j + 1]!, s[j + 2]!);
          SPHERE.radius = s[j + 3]!;
          if (FRUSTUM.intersectsSphere(SPHERE)) on = 1;
        }
        if (this.seen[k] !== on) {
          this.seen[k] = on;
          changed = true;
        }
        k++;
      }
    }
    if (changed) this.fill(lib);
  }

  private draw(lib: ModelLibrary, key: string, id: string, need: number): InstancedModel | null {
    const model = lib.models.get(id);
    if (!model) return null;
    let d = this.draws.get(key);
    if (d && d.maxInstances >= need) return d;
    let room = d ? d.maxInstances : FIRST_ROOM;
    while (room < need) room *= 2;
    if (d) {
      this.scene.remove(d.object);
      d.dispose();
    }
    d = new InstancedModel(model, room, this.patch);
    this.scene.add(d.object);
    this.draws.set(key, d);
    return d;
  }

  private gather(lib: ModelLibrary, chunks: Iterable<readonly PlacedProp[]>): void {
    this.dirty = false;
    this.refill = true;
    const byKey = new Map<string, Gathered[]>();
    const idols: Array<{ p: PlacedProp; id: string }> = [];
    let n = 0;
    for (const list of chunks) {
      for (const p of list) {
        const m = p.model;
        const model = lib.models.get(m.id);
        if (!model) continue;
        let idolRoom = 0;
        if (p.kind === PropKind.CircleAltar) {
          const idol = IDOL_MODEL[variantType(p.variant)];
          if (idol && !this.taken.has(variantCircle(p.variant))) {
            idols.push({ p, id: idol });
            idolRoom = IDOL_ROOM_M;
          }
        }
        let e = byKey.get(m.id);
        if (!e) byKey.set(m.id, (e = []));
        e.push({ p, spheres: shadowSpheres(model, p.ox + m.x, m.y, p.oz + m.z, m.scale, ROOM_M + idolRoom) });
        n++;
      }
    }
    this.gathered = byKey;
    this.idols = idols;
    if (this.seen.length !== n) this.seen = new Uint8Array(n);
  }

  /** Fills the draws with the gathered props marked seen, each draw made once with room for all of its gathered props. */
  private fill(lib: ModelLibrary): void {
    this.refill = false;
    const { opened, hover, seen } = this;
    const counts = new Map<string, number>();
    const altars = new Map<string, { draw: InstancedModel; i: number; model: ModelData }>();
    let k = 0;
    for (const [key, list] of this.gathered) {
      const d = this.draw(lib, key, key, list.length);
      if (!d) {
        k += list.length;
        continue;
      }
      let n = 0;
      for (const { p } of list) {
        if (seen[k++] === 0) continue;
        const m = p.model;
        const x = p.ox + m.x;
        const z = p.oz + m.z;
        const clip = p.kind === PropKind.BluestoneChest && opened.has(variantCircle(p.variant) * 8 + variantLook(p.variant)) ? 'idle_open' : '';
        d.setInstance(n, x, m.y, z, m.yaw, clip, 0, null, m.scale);
        if (hover.has(p.key)) d.setHover(n);
        if (p.kind === PropKind.CircleAltar) altars.set(p.key, { draw: d, i: n, model: d.model });
        n++;
      }
      counts.set(key, n);
    }
    // The idols on their altars' slot (an idol is drawn with its altar).
    const idolCounts = new Map<string, PlacedProp[]>();
    for (const { p, id } of this.idols) {
      if (!lib.models.has(id) || !altars.has(p.key)) continue;
      const list = idolCounts.get(id) ?? [];
      list.push(p);
      idolCounts.set(id, list);
    }
    for (const [id, list] of idolCounts) {
      const d = this.draw(lib, id, id, list.length);
      if (!d) continue;
      let n = 0;
      for (const p of list) {
        const a = altars.get(p.key)!;
        const slot = a.model.boneNames.indexOf('slot_idol');
        a.draw.boneWorld(a.i, Math.max(0, slot), BONE);
        AT.setFromMatrixPosition(BONE);
        d.setInstance(n, AT.x, AT.y, AT.z, p.model.yaw, '', 0, null, 1);
        if (hover.has(p.key)) d.setHover(n);
        n++;
      }
      counts.set(id, n);
    }
    for (const [key, d] of this.draws) {
      d.setCount(counts.get(key) ?? 0);
      d.commit();
    }
  }

  dispose(): void {
    for (const d of this.draws.values()) {
      this.scene.remove(d.object);
      d.dispose();
    }
    this.draws.clear();
  }
}
