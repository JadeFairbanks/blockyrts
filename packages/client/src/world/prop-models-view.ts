// The world props' own models (Patch 5): every tree, sapling and seed, bush,
// rock, ore, carcass and fish stretch, and the stone circles' pieces, drawn
// with its catalogue model (prop-models.ts) in the full-detail chunks round
// the camera, one instanced draw per model. A prop's cubes stand in until its
// model has loaded (the mesh workers leave them out from then on). The idols
// stand on their altars until taken, and a chest the player has opened
// stands open.
import * as THREE from 'three';
import { CircleType, PropKind, variantCircle, variantLook, variantType, type CirclesView } from '@blockyrts/sim';
import { InstancedModel, type ModelData, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import type { PropModelPlace } from './mesh-messages.ts';
import { PROP_MODEL_IDS } from './prop-models.ts';

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

interface Animated {
  draw: InstancedModel;
  i: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  clip: string;
  phase: number;
  scale: number;
  hovered: boolean;
}

export class PropModelsView {
  private lib: ModelLibrary | null = null;
  /** By model id, and `<id>|<clip>` for the ones that play a clip. */
  private readonly draws = new Map<string, InstancedModel>();
  private animated: Animated[] = [];
  private dirty = true;
  private sig = '';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly patch: ModelShaderPatch,
  ) {}

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    this.dirty = true;
  }

  /** The chunks or their props changed: rebuilt on the next update. */
  invalidate(): void {
    this.dirty = true;
  }

  /** The draws with an instance under the cursor, for the hover outline. */
  hovered(): InstancedModel[] {
    return [...this.draws.values()].filter((d) => d.hoveredCount > 0);
  }

  /**
   * Brings the draws in line with the props in view: rebuilt when the chunks,
   * the hover, the idols taken or the chests opened change; the fish swim
   * every frame.
   */
  update(props: Iterable<readonly PlacedProp[]>, circles: CirclesView | null | undefined, hover: ReadonlySet<string>, now: number): void {
    const lib = this.lib;
    if (!lib) return;
    const taken = circles?.taken ?? [];
    const opened = circles?.chests.map((c) => c[0]) ?? [];
    const sig = `${taken.join(',')}|${opened.join(',')}|${[...hover].join(',')}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.dirty = true;
    }
    if (this.dirty) this.rebuild(lib, props, new Set(taken), new Set(opened), hover);
    if (this.animated.length > 0) {
      const t = now / 1000;
      for (const a of this.animated) {
        a.draw.setInstance(a.i, a.x, a.y, a.z, a.yaw, a.clip, t + a.phase, null, a.scale);
        if (a.hovered) a.draw.setHover(a.i);
      }
      for (const [key, d] of this.draws) if (key.includes('|')) d.commit();
    }
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

  private rebuild(lib: ModelLibrary, chunks: Iterable<readonly PlacedProp[]>, taken: ReadonlySet<number>, opened: ReadonlySet<number>, hover: ReadonlySet<string>): void {
    this.dirty = false;
    // Gathered first, so each draw is made once with room for all of its instances.
    const byKey = new Map<string, { id: string; list: PlacedProp[] }>();
    const idols: Array<{ p: PlacedProp; id: string }> = [];
    for (const list of chunks) {
      for (const p of list) {
        const m = p.model;
        if (!lib.models.has(m.id)) continue;
        const key = m.clip ? `${m.id}|${m.clip}` : m.id;
        let e = byKey.get(key);
        if (!e) byKey.set(key, (e = { id: m.id, list: [] }));
        e.list.push(p);
        if (p.kind === PropKind.CircleAltar) {
          const idol = IDOL_MODEL[variantType(p.variant)];
          if (idol && !taken.has(variantCircle(p.variant))) idols.push({ p, id: idol });
        }
      }
    }
    this.animated = [];
    const counts = new Map<string, number>();
    const altars = new Map<string, { draw: InstancedModel; i: number; model: ModelData }>();
    for (const [key, { id, list }] of byKey) {
      const copies = list.reduce((n, p) => n + (p.model.copies?.length ?? 1), 0);
      const d = this.draw(lib, key, id, copies);
      if (!d) continue;
      let n = 0;
      for (const p of list) {
        const m = p.model;
        const x = p.ox + m.x;
        const z = p.oz + m.z;
        const clip = p.kind === PropKind.BluestoneChest && opened.has(variantCircle(p.variant) * 8 + variantLook(p.variant)) ? 'idle_open' : '';
        if (m.copies) {
          const c = Math.cos(m.yaw);
          const s = Math.sin(m.yaw);
          for (const [dx, dz, turn] of m.copies) {
            const at = { draw: d, i: n, x: x + c * dx + s * dz, y: m.y, z: z - s * dx + c * dz, yaw: m.yaw + turn, clip: m.clip ?? '', phase: turn, scale: m.scale, hovered: hover.has(p.key) };
            d.setInstance(n, at.x, at.y, at.z, at.yaw, at.clip, at.phase, null, m.scale);
            if (m.clip) this.animated.push(at);
            if (hover.has(p.key)) d.setHover(n);
            n++;
          }
          continue;
        }
        d.setInstance(n, x, m.y, z, m.yaw, clip, 0, null, m.scale);
        if (hover.has(p.key)) d.setHover(n);
        if (p.kind === PropKind.CircleAltar) altars.set(p.key, { draw: d, i: n, model: d.model });
        n++;
      }
      counts.set(key, n);
    }
    // The idols on their altars' slot.
    const idolCounts = new Map<string, PlacedProp[]>();
    for (const { p, id } of idols) {
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
