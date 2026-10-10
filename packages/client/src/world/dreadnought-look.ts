// How the Dreadnought looks (Patch 5, Jade, GP-21; Patch 7): his body, his
// plate worn over it and his spiked mace or the two-handed weapon he was
// given in his right hand (units-view.ts dreadnoughtLook), his two blows each played whole, the smash and then the
// swing, so the follow-through plays on after the blow lands; his war cry
// when he makes a remark; the jump clip over a rise; and the crescent his
// swing leaves in front of him, drawn briefly half way through it and
// fading fast.
import * as THREE from 'three';
import { OrderKind, SECOND_BLOW, Slot, Troop, UnitKind } from '@blockyrts/sim';
import { S, UnitFlag } from '../messages.ts';

/** His body (Patch 7: without his plate and his mace, which are pieces of their own), and his plate. */
export const DREADNOUGHT_MODEL = 'heavy_knight_body';
export const DREADNOUGHT_HARNESS = 'armour_dreadnought_harness';
/** He falls as the whole heavy knight, in his plate, with his mace (a part of it) unless he held another weapon. */
export const DREADNOUGHT_CORPSE = 'heavy_knight';
export const DREADNOUGHT_PARTS: readonly string[] = ['mace'];
/** His height, metres: the heavy knight's 90 model units of 2.8125 cm. */
export const DREADNOUGHT_M = 2.53;

/** His blows by the state's swing (the blow's slot + 1): the smash, then the swing. */
const BLOW_CLIPS: Readonly<Record<number, string>> = { [Slot.Weapon + 1]: 'attack_smash', [SECOND_BLOW + 1]: 'attack_swing' };
/** The part of the jump clip a hop plays, seconds: from the push off to the landing. */
const JUMP_FROM_S = 0.6;
const JUMP_TO_S = 1.25;

/** Whether a row of the state message is a Dreadnought. */
export function isDreadnoughtRow(d: Int32Array, o: number): boolean {
  return d[o + S.kind] === UnitKind.Warrior && d[o + S.troop] === Troop.Dreadnought;
}

export class DreadnoughtLooks {
  /** Each one's blow on screen: its clip and when it began (ms), kept until the clip ends. */
  private readonly blows = new Map<number, { clip: string; t0: number }>();
  /** When each one last raised his war cry (ms). */
  private readonly cries = new Map<number, number>();

  /** A remark: he plays his war cry. */
  cry(id: number, now: number): void {
    this.cries.set(id, now);
  }

  /**
   * His clip and its time this frame: a hop's jump; a blow, played to its
   * end; hurt; walking (or running away); his war cry; else idle. swingT is
   * how far into the swing under way (s); clipT the looping clips' time;
   * moving whether he moved since the last state.
   */
  clip(d: Int32Array, o: number, id: number, now: number, swingT: number, clipT: number, clips: ReadonlyMap<string, { length: number }>, hop: { t: number } | null, moving: boolean): [string, number] {
    const swing = d[o + S.swing]!;
    const order = d[o + S.order]!;
    const flags = d[o + S.flags]!;
    const len = (name: string): number => clips.get(name)?.length ?? 0;
    if (hop) {
      this.blows.delete(id);
      return ['jump', JUMP_FROM_S + hop.t * (JUMP_TO_S - JUMP_FROM_S)];
    }
    const blow = BLOW_CLIPS[swing];
    if (blow) this.blows.set(id, { clip: blow, t0: now - swingT * 1000 });
    const b = this.blows.get(id);
    if (b) {
      const age = (now - b.t0) / 1000;
      // Walking off ends the follow-through; a new blow starts its own.
      if (blow || (age < len(b.clip) && order !== OrderKind.Move)) return [b.clip, age];
      this.blows.delete(id);
    }
    if (flags & UnitFlag.Hurt) return ['injured', clipT];
    // Standing at a foe between blows is no walk.
    if (moving) return [flags & UnitFlag.Fleeing ? 'run' : 'walk', clipT];
    const c = this.cries.get(id);
    if (c !== undefined) {
      const age = (now - c) / 1000;
      if (age < len('warcry')) return ['warcry', age];
      this.cries.delete(id);
    }
    return ['idle', clipT];
  }

  /** Forgets the ones no longer drawn. */
  keep(live: ReadonlySet<number>): void {
    for (const id of this.blows.keys()) if (!live.has(id)) this.blows.delete(id);
    for (const id of this.cries.keys()) if (!live.has(id)) this.cries.delete(id);
  }
}

/** How long a crescent shows, and how far it reaches round him (metres; his reach is 2 m). */
const CRESCENT_S = 0.35;
const CRESCENT_IN_M = 0.9;
const CRESCENT_OUT_M = 2.1;
const CRESCENTS = 12;

/** The crescents of his swings: a flat quarter ring in front of him at waist height, swelling a little as it fades. */
export class Crescents {
  private readonly meshes: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t0: number }> = [];
  private readonly group = new THREE.Group();
  private next = 0;

  constructor(scene: THREE.Scene) {
    // A quarter ring centred on -Z, the way the models face at heading 0.
    const geo = new THREE.RingGeometry(CRESCENT_IN_M, CRESCENT_OUT_M, 20, 1, Math.PI / 4, Math.PI / 2).rotateX(-Math.PI / 2);
    for (let k = 0; k < CRESCENTS; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);
      this.meshes.push({ mesh, mat, t0: -1 });
    }
    scene.add(this.group);
  }

  /** A swing landing at (x, y, z), metres, facing heading (radians). */
  spawn(x: number, y: number, z: number, heading: number, now: number): void {
    const c = this.meshes[this.next]!;
    this.next = (this.next + 1) % this.meshes.length;
    c.mesh.position.set(x, y + 0.9, z);
    c.mesh.rotation.y = heading;
    c.t0 = now;
    c.mesh.visible = true;
  }

  update(now: number): void {
    for (const c of this.meshes) {
      if (c.t0 < 0) continue;
      const k = (now - c.t0) / 1000 / CRESCENT_S;
      if (k >= 1) {
        c.t0 = -1;
        c.mesh.visible = false;
        continue;
      }
      c.mat.opacity = 0.85 * (1 - k) * (1 - k);
      c.mesh.scale.setScalar(0.9 + 0.2 * k);
    }
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }
}
