// What each building looks like when the model library has no model for it:
// a few coloured blocks per kind and level, merged into one geometry with
// vertex colours (one draw call per building). Every main base tier has its
// own look (Main base: Big House to Citadel), the Farm shows its crop, and
// lights carry a flame.
//
// Local space: origin at the footprint's corner (smallest x and z) on the
// floor, metres, x east, z south.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BuildingKind, buildingSpec, footprintDims, MAIN_BASE_TIER_LEVELS } from '@blockyrts/sim';
import { COLUMN_M } from './mesher.ts';

export interface Look {
  geometry: THREE.BufferGeometry;
  /** Height of the tallest part, metres. */
  height: number;
  /** Where flames burn (lights), local metres. */
  flames: THREE.Vector3[];
}

const C = {
  wood: 0x8a5a32,
  darkWood: 0x5e3b20,
  plank: 0xa7774a,
  thatch: 0xb08a40,
  stone: 0x8c8c86,
  darkStone: 0x66665f,
  marble: 0xe6e2d8,
  slate: 0x4a4e5a,
  redRoof: 0x8e3b2a,
  soil: 0x5a3e26,
  furrow: 0x47301c,
  iron: 0x3a3a3e,
  water: 0x3a6ea8,
  gold: 0xd8b040,
  hay: 0xd6be6a,
  white: 0xf0ece0,
} as const;

/** The Farm's crop colour: a medley of green vegetables (Patch 2: farm fare). */
const CROP = 0x5f9a3a;

class Parts {
  readonly list: THREE.BufferGeometry[] = [];
  height = 0;
  readonly flames: THREE.Vector3[] = [];

  private add(g: THREE.BufferGeometry, colour: number): void {
    const g2 = g.index ? g.toNonIndexed() : g;
    if (g2 !== g) g.dispose();
    const n = g2.getAttribute('position').count;
    const c = new THREE.Color(colour);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g2.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g2.deleteAttribute('uv');
    this.list.push(g2);
    g2.computeBoundingBox();
    this.height = Math.max(this.height, g2.boundingBox!.max.y);
  }

  /** A box from its min corner. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, colour: number): this {
    this.add(new THREE.BoxGeometry(w, h, d).translate(x + w / 2, y + h / 2, z + d / 2), colour);
    return this;
  }

  /** A gable roof over a rectangle: the ridge runs along x when alongX, else along z. */
  gable(x: number, y: number, z: number, w: number, d: number, h: number, colour: number, alongX = true): this {
    const span = alongX ? d : w;
    const len = alongX ? w : d;
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2 - 0.12, 0);
    shape.lineTo(span / 2 + 0.12, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: len + 0.24, bevelEnabled: false });
    // The shape is in x-y and extrudes along +z.
    g.translate(0, 0, -(len + 0.24) / 2);
    if (alongX) g.rotateY(Math.PI / 2);
    g.translate(x + w / 2, y, z + d / 2);
    this.add(g, colour);
    return this;
  }

  cyl(cx: number, y: number, cz: number, r: number, h: number, colour: number, seg = 8): this {
    this.add(new THREE.CylinderGeometry(r, r, h, seg).translate(cx, y + h / 2, cz), colour);
    return this;
  }

  /** A log lying along x from (x, y, z), its axis at height y. */
  log(x: number, y: number, z: number, r: number, len: number, colour: number): this {
    this.add(new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2).translate(x + len / 2, y, z), colour);
    return this;
  }

  /** A wheel standing on edge facing x, its hub at (x, y, z). */
  wheel(x: number, y: number, z: number, r: number, thickness: number, colour: number): this {
    this.add(new THREE.CylinderGeometry(r, r, thickness, 12).rotateZ(Math.PI / 2).translate(x + thickness / 2, y, z), colour);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      this.add(new THREE.BoxGeometry(thickness + 0.1, 0.12, 0.35).translate(0, r, 0).rotateX(a).translate(x + thickness / 2, y, z), C.plank);
    }
    return this;
  }

  /** A pyramid roof (towers). */
  /** A square beam 0.1 m thick from one point to another (a diagonal brace). */
  brace(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, colour: number): this {
    const from = new THREE.Vector3(x0, y0, z0);
    const to = new THREE.Vector3(x1, y1, z1);
    const g = new THREE.BoxGeometry(0.1, from.distanceTo(to), 0.1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, colour);
    return this;
  }

  cone(cx: number, y: number, cz: number, r: number, h: number, colour: number, seg = 4): this {
    this.add(new THREE.ConeGeometry(r, h, seg).rotateY(Math.PI / 4).translate(cx, y + h / 2, cz), colour);
    return this;
  }

  /** A rail fence round a rectangle, with posts every 0.9 m and a gap on the south side. */
  fence(x: number, z: number, w: number, d: number, colour: number, h = 0.6): this {
    const post = 0.08;
    const rails = (x0: number, z0: number, len: number, alongX: boolean): void => {
      for (let t = 0; t <= len + 0.01; t += 0.9) this.box(alongX ? x0 + t : x0, 0, alongX ? z0 : z0 + t, post, h, post, colour);
      this.box(x0, h * 0.45, z0, alongX ? len : post, 0.05, alongX ? post : len, colour);
      this.box(x0, h * 0.85, z0, alongX ? len : post, 0.05, alongX ? post : len, colour);
    };
    rails(x, z, w, true);
    rails(x, z, d, false);
    rails(x + w - post, z, d, false);
    const gap = 1.0;
    rails(x, z + d - post, (w - gap) / 2, true);
    rails(x + (w + gap) / 2, z + d - post, (w - gap) / 2, true);
    return this;
  }

  flame(x: number, y: number, z: number): this {
    this.flames.push(new THREE.Vector3(x, y, z));
    return this;
  }

  /** A simple house: walls, a gable roof, a door on the south face. */
  house(x: number, z: number, w: number, d: number, wallH: number, wall: number, roof: number, roofH = wallH * 0.7): this {
    this.box(x, 0, z, w, wallH, d, wall);
    this.box(x + w / 2 - 0.3, 0, z + d - 0.02, 0.6, Math.min(1.9, wallH * 0.85), 0.06, C.darkWood);
    this.gable(x, wallH, z, w, d, roofH, roof, w >= d);
    return this;
  }

  build(): Look {
    const geometry = mergeGeometries(this.list, false)!;
    for (const g of this.list) g.dispose();
    geometry.computeBoundingSphere();
    return { geometry, height: this.height, flames: this.flames };
  }
}

/** The main base at each old level (a tier draws the level it stands on, MAIN_BASE_TIER_LEVELS), inside its 10 x 10 column core (4.5 m), 0.9 m in from the footprint edge. */
function mainBase(p: Parts, level: number, team: number): void {
  const o = 2 * COLUMN_M;
  const s = 10 * COLUMN_M;
  const banner = (x: number, z: number, top: number): void => {
    p.box(x, top, z, 0.06, 1.2, 0.06, C.darkWood).box(x + 0.06, top + 0.6, z, 0.5, 0.45, 0.04, team);
  };
  switch (level) {
    case 1: // Big House: a timber longhouse with a thatched roof.
      p.box(o, 0, o + 0.6, s, 0.25, s - 1.2, C.darkStone);
      p.house(o, o + 0.6, s, s - 1.2, 2.4, C.wood, C.thatch, 1.9);
      break;
    case 2: // Longhall: longer, a stone footing and a porch.
      p.box(o - 0.2, 0, o + 0.2, s + 0.4, 0.5, s - 0.4, C.darkStone);
      p.house(o, o + 0.3, s, s - 0.6, 2.8, C.plank, C.thatch, 2.2);
      p.box(o + s / 2 - 0.9, 0, o + s - 0.3, 1.8, 0.12, 0.6, C.darkWood);
      break;
    case 3: // Hall: stone walls, a timber upper floor and a chimney.
      p.box(o, 0, o, s, 1.4, s, C.stone);
      p.box(o + 0.1, 1.4, o + 0.1, s - 0.2, 1.6, s - 0.2, C.plank);
      p.gable(o + 0.1, 3.0, o + 0.1, s - 0.2, s - 0.2, 2.2, C.redRoof);
      p.box(o + s - 1.0, 2.5, o + 0.6, 0.6, 3.2, 0.6, C.darkStone);
      p.box(o + s / 2 - 0.35, 0, o + s - 0.02, 0.7, 1.9, 0.06, C.darkWood);
      break;
    case 4: // Stockade Hall: the hall behind a palisade with a gatehouse.
      p.box(o + 0.5, 0, o + 0.5, s - 1, 1.4, s - 1, C.stone);
      p.box(o + 0.6, 1.4, o + 0.6, s - 1.2, 1.4, s - 1.2, C.plank);
      p.gable(o + 0.6, 2.8, o + 0.6, s - 1.2, s - 1.2, 2.0, C.redRoof);
      for (let t = 0; t < s; t += 0.3) {
        p.box(o + t, 0, o, 0.26, 2.2, 0.26, C.wood).box(o, 0, o + t, 0.26, 2.2, 0.26, C.wood).box(o + s - 0.26, 0, o + t, 0.26, 2.2, 0.26, C.wood);
        if (t < s / 2 - 0.8 || t > s / 2 + 0.6) p.box(o + t, 0, o + s - 0.26, 0.26, 2.2, 0.26, C.wood);
      }
      banner(o + s / 2, o + s - 0.2, 2.2);
      break;
    case 5: // Marble Hall: white walls, a colonnade and a low slate roof.
      p.box(o, 0, o, s, 0.4, s, C.marble);
      p.box(o + 0.4, 0.4, o + 0.4, s - 0.8, 3.2, s - 1.4, C.marble);
      for (let t = 0.5; t < s - 0.3; t += 0.75) p.cyl(o + t, 0.4, o + s - 0.55, 0.14, 3.2, C.white);
      p.box(o, 3.6, o + 0.2, s, 0.3, s - 0.4, C.marble);
      p.gable(o, 3.9, o + 0.2, s, s - 0.4, 1.4, C.slate);
      banner(o + 0.2, o + s - 0.4, 4.0);
      break;
    case 6: // Keep: a square stone tower.
      p.box(o + 0.4, 0, o + 0.4, s - 0.8, 6.0, s - 0.8, C.stone);
      for (let t = 0.4; t < s - 0.6; t += 0.6) {
        p.box(o + t, 6.0, o + 0.4, 0.35, 0.45, 0.35, C.stone).box(o + t, 6.0, o + s - 0.75, 0.35, 0.45, 0.35, C.stone);
        p.box(o + 0.4, 6.0, o + t, 0.35, 0.45, 0.35, C.stone).box(o + s - 0.75, 6.0, o + t, 0.35, 0.45, 0.35, C.stone);
      }
      p.box(o + s / 2 - 0.4, 0, o + s - 0.42, 0.8, 2.0, 0.06, C.darkWood);
      banner(o + s / 2, o + s / 2, 6.0);
      break;
    default: {
      // Fortified Keep, Castle, Great Castle, Citadel: a keep with corner towers, walls between them from the Castle on.
      const facing = level >= 9 ? C.marble : C.stone;
      const keepH = 6 + (level - 7) * 0.8;
      p.box(o + 1.1, 0, o + 1.1, s - 2.2, keepH, s - 2.2, facing);
      const tower = (x: number, z: number): void => {
        p.cyl(x, 0, z, 0.6, keepH - 1.0, facing, 10);
        if (level >= 9) p.cone(x, keepH - 1.0, z, 0.75, 1.4, C.slate, 10);
        else p.cyl(x, keepH - 1.0, z, 0.7, 0.4, C.darkStone, 10);
      };
      tower(o + 0.6, o + 0.6);
      tower(o + s - 0.6, o + 0.6);
      tower(o + 0.6, o + s - 0.6);
      tower(o + s - 0.6, o + s - 0.6);
      if (level >= 8) {
        p.box(o + 0.6, 0, o + 0.3, s - 1.2, 2.8, 0.5, C.darkStone).box(o + 0.3, 0, o + 0.6, 0.5, 2.8, s - 1.2, C.darkStone);
        p.box(o + s - 0.8, 0, o + 0.6, 0.5, 2.8, s - 1.2, C.darkStone);
        p.box(o + 0.6, 0, o + s - 0.8, s / 2 - 1.5, 2.8, 0.5, C.darkStone).box(o + s / 2 + 0.9, 0, o + s - 0.8, s / 2 - 1.5, 2.8, 0.5, C.darkStone);
      }
      banner(o + s / 2, o + s / 2, keepH);
      if (level >= 9) {
        banner(o + 0.6, o + 0.6, keepH + 0.4);
        banner(o + s - 0.6, o + s - 0.6, keepH + 0.4);
      }
      if (level >= 10) for (const [x, z] of [[1.6, 1.6], [s - 1.6, 1.6], [1.6, s - 1.6], [s - 1.6, s - 1.6]] as const) p.cyl(o + x, keepH, o + z, 0.22, 0.5, C.iron, 8).box(o + x - 0.1, keepH + 0.35, o + z, 0.2, 0.2, 0.7, C.iron);
      break;
    }
  }
}

function farm(p: Parts, kind: number, level: number, variant: number, fallow: boolean): void {
  const spec = buildingSpec(kind);
  const w = spec.w * COLUMN_M;
  const d = spec.d * COLUMN_M;
  const [, , hw, hd] = footprintDims(kind, variant, level).solid;
  const houseW = hw * COLUMN_M;
  const houseD = hd * COLUMN_M;
  // The field: soil with furrows, crops in rows unless it lies bare (nothing grows there).
  p.box(0, 0, 0, w, 0.06, d, C.soil);
  for (let z = 0.3; z < d - 0.2; z += 0.6) {
    const x0 = z < houseD + 0.2 ? houseW + 0.2 : 0.2;
    p.box(x0, 0.06, z, w - x0 - 0.2, 0.05, 0.22, C.furrow);
    if (!fallow) p.box(x0 + 0.05, 0.11, z + 0.03, w - x0 - 0.3, 0.25 + level * 0.08, 0.16, CROP);
  }
  // The farmhouse in the corner, better at each tier.
  const wall = level >= 3 ? C.stone : C.plank;
  p.house(0, 0, houseW, houseD, 1.4 + level * 0.15, wall, level >= 2 ? C.redRoof : C.thatch, 1.0);
  if (level >= 2) p.fence(0.05, 0.05, w - 0.1, d - 0.1, C.wood);
  if (level >= 2) p.box(houseW + 0.1, 0, 0.1, 0.9, 1.0, 0.9, C.darkWood).gable(houseW + 0.1, 1.0, 0.1, 0.9, 0.9, 0.5, C.thatch);
  if (level >= 3) {
    p.box(0, 0, d - 0.35, w, 0.7, 0.3, C.darkStone);
    p.cyl(w - 0.8, 0, 0.8, 0.45, 0.6, C.stone, 10).cyl(w - 0.8, 0.55, 0.8, 0.32, 0.06, C.water, 10);
  }
}

/** The look of a building at a level. `team` is the owner's colour for banners and flags. */
export function makeLook(kind: number, level: number, variant: number, team: number, fallow: boolean): Look {
  const p = new Parts();
  const spec = buildingSpec(kind);
  const dims = footprintDims(kind, variant, level);
  const w = dims.w * COLUMN_M;
  const d = dims.d * COLUMN_M;
  const tall = spec.heightCm / 100;
  const timber = kind === BuildingKind.WallHardwood || kind === BuildingKind.TowerHardwood ? C.darkWood : C.wood;
  switch (kind) {
    case BuildingKind.Wall:
    case BuildingKind.WallHardwood:
      // A palisade column: two sharpened logs side by side.
      for (let k = 0; k < 2; k++) {
        const cx = w * (k === 0 ? 0.27 : 0.73);
        p.cyl(cx, 0, d / 2, w * 0.24, tall - 0.3, timber).cone(cx, tall - 0.3, d / 2, w * 0.24, 0.3, timber, 6);
      }
      p.box(0, tall * 0.55, d / 2 - 0.04, w, 0.12, 0.08, C.darkWood);
      break;
    case BuildingKind.WallStone:
      p.box(0, 0, 0, w, tall - 0.3, d, C.stone);
      p.box(0, tall - 0.3, 0, w * 0.45, 0.3, d, C.darkStone);
      break;
    case BuildingKind.Gate: {
      // Posts at both ends and a plank door between them, turned with the footprint.
      const along = w >= d;
      const len = along ? w : d;
      const post = 0.3;
      const door = (a: number, la: number, h: number, colour: number, y = 0): void => {
        if (along) p.box(a, y, d * 0.3, la, h, d * 0.4, colour);
        else p.box(w * 0.3, y, a, w * 0.4, h, la, colour);
      };
      door(0, post, tall + 0.3, C.darkWood);
      door(len - post, post, tall + 0.3, C.darkWood);
      door(post, len - post * 2, tall - 0.2, C.plank);
      door(post, len - post * 2, 0.15, C.darkWood, tall * 0.3);
      door(post, len - post * 2, 0.15, C.darkWood, tall * 0.7);
      break;
    }
    case BuildingKind.Tower:
    case BuildingKind.TowerHardwood:
    case BuildingKind.TowerStone: {
      const deck = tall - 1.1;
      const leg = 0.3;
      if (kind === BuildingKind.TowerStone) p.box(0.1, 0, 0.1, w - 0.2, deck, d - 0.2, C.stone);
      else {
        for (const [x, z] of [[0, 0], [w - leg, 0], [0, d - leg], [w - leg, d - leg]] as const) p.box(x, 0, z, leg, deck, leg, timber);
        p.box(0, deck * 0.45, 0, w, 0.12, 0.12, C.darkWood).box(0, deck * 0.45, d - 0.12, w, 0.12, 0.12, C.darkWood);
        p.box(0, deck * 0.45, 0, 0.12, 0.12, d, C.darkWood).box(w - 0.12, deck * 0.45, 0, 0.12, 0.12, d, C.darkWood);
        // Cross braces close every side up to the deck: the tower is solid to walkers (footprints.ts).
        for (let k = 0; k < 2; k++) {
          const y0 = k === 0 ? 0.15 : deck * 0.45 + 0.1;
          const y1 = k === 0 ? deck * 0.45 : deck - 0.05;
          p.brace(0.04, y0, 0.04, w - 0.04, y1, 0.04, C.darkWood).brace(w - 0.04, y0, 0.04, 0.04, y1, 0.04, C.darkWood);
          p.brace(0.04, y0, d - 0.04, w - 0.04, y1, d - 0.04, C.darkWood).brace(w - 0.04, y0, d - 0.04, 0.04, y1, d - 0.04, C.darkWood);
          p.brace(0.04, y0, 0.04, 0.04, y1, d - 0.04, C.darkWood).brace(0.04, y0, d - 0.04, 0.04, y1, 0.04, C.darkWood);
          p.brace(w - 0.04, y0, 0.04, w - 0.04, y1, d - 0.04, C.darkWood).brace(w - 0.04, y0, d - 0.04, w - 0.04, y1, 0.04, C.darkWood);
        }
      }
      p.box(-0.1, deck, -0.1, w + 0.2, 0.2, d + 0.2, C.plank);
      const wallC = kind === BuildingKind.TowerStone ? C.darkStone : timber;
      p.box(-0.1, deck + 0.2, -0.1, w + 0.2, 0.9, 0.15, wallC).box(-0.1, deck + 0.2, d - 0.05, w + 0.2, 0.9, 0.15, wallC);
      p.box(-0.1, deck + 0.2, -0.1, 0.15, 0.9, d + 0.2, wallC).box(w - 0.05, deck + 0.2, -0.1, 0.15, 0.9, d + 0.2, wallC);
      break;
    }
    case BuildingKind.MainBase:
      mainBase(p, MAIN_BASE_TIER_LEVELS[level - 1] ?? 1, team);
      break;
    case BuildingKind.Farm:
      farm(p, kind, level, variant, fallow);
      break;
    case BuildingKind.Barn:
      // A red barn with white trim and its yard (Patch 2), until its model comes.
      p.house(0, 0, w / 2, d, 2.6, C.redRoof, C.slate, 1.3);
      p.box(w / 4 - 0.6, 0, d - 0.06, 1.2, 1.6, 0.08, C.white);
      p.fence(w / 2 + 0.05, 0.05, w / 2 - 0.1, d - 0.1, C.wood, 0.9);
      p.box(w / 2 + 0.4, 0, 0.4, 0.8, 0.5, 0.6, C.hay);
      break;
    case BuildingKind.Storehouse:
      p.box(0, 0, 0, w, 0.3, d, C.darkStone);
      p.house(0.2, 0.2, w - 0.4, d - 0.4, 2.4, C.stone, C.slate, 1.3);
      p.box(0.3, 0, d - 0.15, 0.6, 0.6, 0.6, C.plank).box(1.0, 0, d - 0.15, 0.5, 0.5, 0.5, C.plank);
      break;
    case BuildingKind.TorchPost:
      p.box(w / 2 - 0.06, 0, d / 2 - 0.06, 0.12, 1.7, 0.12, C.darkWood).box(w / 2 - 0.1, 1.6, d / 2 - 0.1, 0.2, 0.18, 0.2, C.iron);
      p.flame(w / 2, 1.9, d / 2);
      break;
    case BuildingKind.Bonfire:
      // A ring of stones round a stack of logs, no spit (Jade): drawn until the campfire model stands in for it.
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        p.box(w / 2 + Math.cos(a) * 0.55 - 0.1, 0, d / 2 + Math.sin(a) * 0.55 - 0.1, 0.2, 0.18, 0.2, C.stone);
      }
      for (let k = 0; k < 3; k++) p.log(w / 2 - 0.45, 0.12 + k * 0.16, d / 2 - 0.2 + (k % 2) * 0.4, 0.09, 0.9, C.darkWood);
      p.flame(w / 2, 0.6, d / 2);
      break;
    default:
      // Not built in this milestone: a plain block in the building's size.
      p.house(0, 0, w, d, Math.min(3, 0.8 + w * 0.3), C.plank, C.slate);
      break;
  }
  return p.build();
}
