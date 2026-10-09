// Props drawn as their catalogue models (Jade's Patch 5): a bog's silver
// nuggets and a Fae Guardian's large mana crystal node (prop-models.ts
// CATALOGUE_PROPS). The chunk's cubes (props-gen.ts) stand in until a model
// has loaded; then its cubes are hidden and the model stands on the prop's
// column, turned by its spot. Only the near chunks have props to draw.
import * as THREE from 'three';
import { hash2 } from '@blockyrts/sim';
import { InstancedModel, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import type { PropSummary } from './mesh-messages.ts';
import { CATALOGUE_PROPS } from './prop-models.ts';

/** The most of each model drawn at once (s: a guarded bog has up to 6 nuggets, a band about 3 crystals). */
const MAX_INSTANCES = 256;

interface Placed {
  /** The prop's selection key (`p:cx,cz:index`), for the hover outline. */
  key: string;
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  first: number;
  cubes: number;
}

interface ChunkProps {
  mesh: THREE.InstancedMesh | null;
  list: Placed[];
}

export class PropModelsView {
  private lib: ModelLibrary | null = null;
  private readonly chunks = new Map<string, ChunkProps>();
  private readonly draws = new Map<string, InstancedModel>();
  private readonly wanted = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly patch: ModelShaderPatch,
  ) {}

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    lib.onLoad((m) => {
      if (!this.wanted.has(m.id)) return;
      for (const c of this.chunks.values()) this.hide(c);
    });
    for (const c of this.chunks.values()) this.hide(c);
  }

  /** A chunk's props as meshed (world-view.ts install): the ones with a catalogue model are drawn by it. */
  chunk(key: string, cx: number, cz: number, chunkM: number, mesh: THREE.InstancedMesh | null, props: readonly PropSummary[]): void {
    const list: Placed[] = [];
    for (const p of props) {
      const id = CATALOGUE_PROPS[p.kind];
      if (!id) continue;
      const x = cx * chunkM + p.baseX;
      const z = cz * chunkM + p.baseZ;
      const yaw = ((hash2(Math.round(x * 100), Math.round(z * 100), 0x70726f70) & 0xffff) / 0x10000) * Math.PI * 2;
      list.push({ key: `p:${cx},${cz}:${p.index}`, id, x, y: p.baseY, z, yaw, first: p.first, cubes: p.cubes });
    }
    if (list.length === 0) {
      this.chunks.delete(key);
      return;
    }
    const c = { mesh, list };
    this.chunks.set(key, c);
    this.hide(c);
  }

  /** A chunk gone, or meshed far off with no props. */
  drop(key: string): void {
    this.chunks.delete(key);
  }

  /** Whether the model stands for this prop now (its cubes hidden): the hover outline draws it instead. */
  drawn(key: string): boolean {
    for (const c of this.chunks.values()) for (const p of c.list) if (p.key === key) return this.lib?.models.has(p.id) ?? false;
    return false;
  }

  /** Each frame: every prop whose model has loaded, hovered ones marked for the outline. */
  update(hovered: ReadonlySet<string>): void {
    const lib = this.lib;
    if (!lib) return;
    const counts = new Map<string, number>();
    for (const c of this.chunks.values()) {
      for (const p of c.list) {
        if (!lib.models.has(p.id)) continue;
        let d = this.draws.get(p.id);
        if (!d) {
          d = new InstancedModel(lib.get(p.id), MAX_INSTANCES, this.patch);
          d.object.frustumCulled = false;
          this.scene.add(d.object);
          this.draws.set(p.id, d);
        }
        const n = counts.get(p.id) ?? 0;
        if (n >= MAX_INSTANCES) continue;
        counts.set(p.id, n + 1);
        d.setInstance(n, p.x, p.y, p.z, p.yaw, '', 0, null);
        if (hovered.has(p.key)) d.setHover(n);
      }
    }
    for (const [id, d] of this.draws) {
      d.setCount(counts.get(id) ?? 0);
      d.commit();
    }
  }

  /** The models with a hovered prop this frame, for the hover outline. */
  hoverModels(): InstancedModel[] {
    return [...this.draws.values()].filter((d) => d.hoveredCount > 0);
  }

  /** Hides the cubes of the props whose model has loaded, asking for those not loaded yet. */
  private hide(c: ChunkProps): void {
    const lib = this.lib;
    if (!lib || !c.mesh) return;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    let changed = false;
    for (const p of c.list) {
      if (!lib.models.has(p.id)) {
        if (!this.wanted.has(p.id) && lib.listed(p.id)) {
          this.wanted.add(p.id);
          lib.request(p.id);
        }
        continue;
      }
      for (let k = p.first; k < p.first + p.cubes; k++) c.mesh.setMatrixAt(k, m);
      changed = true;
    }
    if (changed) c.mesh.instanceMatrix.needsUpdate = true;
  }
}
