// Jade's Patch 5 (GP-23): where the selected units are headed. A thin dotted
// line runs from a moving group to the end of its order, one line a group
// from where it is densest, and another for any part of it more than 10 m
// from the rest until they come together. A small flag marks the end: green
// for a move, red for an attack-move (whose units' rings turn red too), blue
// for a patrol; a direct attack has no flag, only a tiny red dot on its
// target. Rally points end in a little yellow flag. Only the owner sees them.
import * as THREE from 'three';

/** Parts of a group this far apart (metres) each get a line, as do units this far from the rest (Jade). */
export const APART_M = 10;
/** Units this close (metres) count as one cluster for where a group's line starts (s). */
export const DENSE_M = 3;
/** Ends of one order this close (metres) are one group's: a group's units are spread round the spot clicked (s). */
export const SAME_END_M = 6;

export type OrderLineKind = 'move' | 'attackMove' | 'patrol' | 'attack';

/** A selected unit on its way somewhere: where it stands and where its order ends (metres); a patrol's other point; an attack's target. */
export interface Mover {
  x: number;
  z: number;
  kind: OrderLineKind;
  endX: number;
  endZ: number;
  /** Patrol: the point it walks to after this one. */
  backX?: number;
  backZ?: number;
  /** Attack: the target's entity id. */
  target?: number;
}

/** One line to draw: from (x, z) to the group's end, metres. */
export interface OrderLine {
  x: number;
  z: number;
  kind: OrderLineKind;
  endX: number;
  endZ: number;
  backX?: number;
  backZ?: number;
  target?: number;
}

/** Groups of indices whose points are linked through neighbours within `reach` (single linkage). */
function linked(n: number, near: (a: number, b: number) => boolean): number[][] {
  const group = new Array<number>(n).fill(-1);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (group[i] !== -1) continue;
    const g = out.length;
    const members = [i];
    group[i] = g;
    for (let k = 0; k < members.length; k++) {
      const a = members[k]!;
      for (let b = 0; b < n; b++) {
        if (group[b] === -1 && near(a, b)) {
          group[b] = g;
          members.push(b);
        }
      }
    }
    out.push(members);
  }
  return out;
}

/**
 * The lines for the selected movers: they group by order (the same kind, ends
 * within SAME_END_M, or the same target), each group ends at the middle of its
 * ends, and each part of a group more than APART_M from the rest draws its own
 * line from where it is densest.
 */
export function orderLines(movers: readonly Mover[]): OrderLine[] {
  const out: OrderLine[] = [];
  const groups = linked(movers.length, (a, b) => {
    const p = movers[a]!;
    const q = movers[b]!;
    if (p.kind !== q.kind) return false;
    if (p.kind === 'attack') return p.target === q.target;
    return Math.hypot(p.endX - q.endX, p.endZ - q.endZ) <= SAME_END_M;
  });
  for (const g of groups) {
    const first = movers[g[0]!]!;
    let ex = 0;
    let ez = 0;
    for (const i of g) {
      ex += movers[i]!.endX;
      ez += movers[i]!.endZ;
    }
    ex /= g.length;
    ez /= g.length;
    const parts = linked(g.length, (a, b) => Math.hypot(movers[g[a]!]!.x - movers[g[b]!]!.x, movers[g[a]!]!.z - movers[g[b]!]!.z) <= APART_M);
    for (const part of parts) {
      // Where the part is densest: the unit with the most others close by, and the middle of those.
      let best: number[] = [];
      for (const a of part) {
        const p = movers[g[a]!]!;
        const near = part.filter((b) => Math.hypot(movers[g[b]!]!.x - p.x, movers[g[b]!]!.z - p.z) <= DENSE_M);
        if (near.length > best.length) best = near;
      }
      let x = 0;
      let z = 0;
      for (const b of best) {
        x += movers[g[b]!]!.x;
        z += movers[g[b]!]!.z;
      }
      const line: OrderLine = { x: x / best.length, z: z / best.length, kind: first.kind, endX: ex, endZ: ez };
      if (first.backX !== undefined && first.backZ !== undefined) {
        line.backX = first.backX;
        line.backZ = first.backZ;
      }
      if (first.target !== undefined) line.target = first.target;
      out.push(line);
    }
  }
  return out;
}

export const MOVE_COLOUR = new THREE.Color(0x63e06b);
export const ATTACK_COLOUR = new THREE.Color(0xff4a3d);
export const PATROL_COLOUR = new THREE.Color(0x4aa0ff);
export const RALLY_COLOUR = new THREE.Color(0xf2d24b);

/** A line's colour by its order. */
export function orderColour(kind: OrderLineKind): THREE.Color {
  return kind === 'move' ? MOVE_COLOUR : kind === 'patrol' ? PATROL_COLOUR : ATTACK_COLOUR;
}

/** The small flags at the ends of orders and rally points, and the red dots on attack targets: pooled meshes, shown afresh each frame. */
export class OrderFlags {
  private readonly flags: THREE.Group[] = [];
  private readonly dots: THREE.Mesh[] = [];
  private nFlags = 0;
  private nDots = 0;
  private readonly poleGeo = new THREE.BoxGeometry(0.035, 0.75, 0.035).translate(0, 0.375, 0);
  private readonly flagGeo: THREE.BufferGeometry;
  private readonly dotGeo = new THREE.SphereGeometry(0.09, 10, 8);
  private readonly poleMat = new THREE.MeshBasicMaterial({ color: 0x2a2520 });
  private readonly mats = new Map<number, THREE.MeshBasicMaterial>();
  private readonly dotMat = new THREE.MeshBasicMaterial({ color: ATTACK_COLOUR, depthTest: false, transparent: true });

  constructor(private readonly scene: THREE.Scene) {
    // A pennant off the top of the pole, pointing right.
    this.flagGeo = new THREE.BufferGeometry();
    this.flagGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.74, 0, 0, 0.5, 0, 0.32, 0.62, 0]), 3));
  }

  begin(): void {
    this.nFlags = 0;
    this.nDots = 0;
  }

  /** A flag standing at a point on the ground (metres). */
  flag(x: number, y: number, z: number, colour: THREE.Color): void {
    let f = this.flags[this.nFlags];
    if (!f) {
      f = new THREE.Group();
      f.add(new THREE.Mesh(this.poleGeo, this.poleMat), new THREE.Mesh(this.flagGeo, this.mat(colour)));
      this.scene.add(f);
      this.flags.push(f);
    }
    (f.children[1] as THREE.Mesh).material = this.mat(colour);
    f.position.set(x, y, z);
    f.visible = true;
    this.nFlags++;
  }

  /** A tiny red dot on a direct attack's target, seen through what is in front of it. */
  dot(x: number, y: number, z: number): void {
    let d = this.dots[this.nDots];
    if (!d) {
      d = new THREE.Mesh(this.dotGeo, this.dotMat);
      d.renderOrder = 11;
      this.scene.add(d);
      this.dots.push(d);
    }
    d.position.set(x, y, z);
    d.visible = true;
    this.nDots++;
  }

  end(): void {
    for (let i = this.nFlags; i < this.flags.length; i++) this.flags[i]!.visible = false;
    for (let i = this.nDots; i < this.dots.length; i++) this.dots[i]!.visible = false;
  }

  private mat(c: THREE.Color): THREE.MeshBasicMaterial {
    const key = c.getHex();
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
      this.mats.set(key, m);
    }
    return m;
  }
}
