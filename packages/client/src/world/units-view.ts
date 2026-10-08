// The people and monsters on screen (Unit models; Seeing equipment; Hit
// feedback; Combat): workers and warriors on the shared body with what they
// carry hanging from its slots, every night mob on its catalogue model (a
// coloured block until the model is in the library), the injured and death
// clips, arrows, stones and webs in flight, and the little bursts of blood,
// bone, slime, splinters and dust when something is hit. Mages wear their
// school and rank's look once it is in the library (else the plain mage
// body), play the clip of the spell they cast, and hold a beam on a target.
// Riders sit on their mount's model at its rider slot, siege engines and
// cannons stand on their own models (a cannon in a Citadel's port on the
// roof), the Rift-touched beasts shed violet motes and a cloaked void
// stalker shows only as a shimmer. The models take the fog of war like the
// land (remembered lairs and huts darkened), and the local player's own
// units carry their ids for the hidden-unit outlines (Jade's Patch 3,
// hidden-outlines.ts).
import * as THREE from 'three';
import { engineSpec, gearSpec, HOP_STEPS, MOBS, mobSpec, Moves, mountSpec, NEUTRAL, PEOPLES, peopleUnitSpec, NO_CARRY, OrderKind, RESOURCES, Role, Shot, Slot, speciesSpec, Spell, SPELLS, Troop, UnitKind, WU_PER_METRE, type HitEvent } from '@blockyrts/sim';
import { S, SHOT_STRIDE, SpellOn, STATE_STRIDE, UnitFlag, type StateMessage } from '../messages.ts';
import { InstancedModel, MarkMode, type ModelData, type ModelLibrary, type ModelShaderPatch } from '../models/index.ts';
import { fowPatch, type FowUniforms } from './fog-material.ts';
import type { OwnDraw } from './hidden-outlines.ts';

const STEP_MS = 50;
const MAX_UNITS = 2048;
const MAX_SHOTS = 1024;
const MAX_PARTICLES = 3000;
const MAX_ATTACH = 2048;
/** How long the dead lie before they sink away, and how long sinking takes, seconds. */
const CORPSE_LIE_S = 4;
const CORPSE_SINK_S = 2;

/** Worker clips by OrderKind (Idle, Move, Chop, Mine, Farm, Swim, Carry, Attack, Shoot, Climb, Dig). */
const WORKER_CLIPS = ['idle', 'walk', 'chop', 'chop', 'hoe', 'walk', 'walk', 'chop', 'chop', 'walk', 'hoe'];

/** Where an item hangs: a part of the body model, or a model of its own at a slot bone. */
interface Look {
  parts: string[];
  attach: Array<[string, string]>;
  clip: string;
}

/** The catalogue model of a gear id ('' for none). */
const gearModel = (id: number): string => (id ? gearSpec(id).model : '');
/** Whether a gear id is held like a polearm: spears, pikes and halberds. */
const polearm = (id: number): boolean => /^(spear|pike|halberd)/.test(gearModel(id));

/** Colour of a monster's stand-in block: the night mobs, then (14 on) the lair guardians, the tribes, the village goblins, the lairs and the village's buildings. */
const MOB_COLOURS = [
  0x6a7a5a, 0x3a3040, 0x6a5a4a, 0x2a2a2a, 0x7ac040, 0x9ad060, 0xd8d0b8, 0x8a9a6a, 0xc8c0a8, 0x5a3a20, 0x4a7a3a, 0x5a8a4a, 0x3a6a2a, 0x4a4a5a,
  0x8a3a20, 0xc8a8d0, 0x3a2a24, 0x6a9ad8, 0xa8885a, 0x7a8a3a, 0xa04a2a, 0x5a8a3a, 0x4a7a32, 0x6a4a8a,
  0x7a7a68, 0x4a4440, 0xd8d8d0, 0x5a4a3a, 0x6a5030, 0x5a5a50, 0x8a2a1a, 0x3a1a4a, 0x7a6038, 0x3a3030, 0x8a6a3a,
  // The peoples' buildings: Halfling burrow, mill, inn, barn; Runkin tent, drying rack, wolf den, fire;
  // Elf hall, tree platform, bear pen, gate, caravan wagon; Dwarf house, forge, mineshaft, hall, city gate.
  0x7a9a4a, 0xc8b890, 0xa0703a, 0x9a3a2a, 0x9a8060, 0x8a6a40, 0x5a4a38, 0xe08a30,
  0xd8d0a0, 0x7a9a6a, 0x6a5a3a, 0x8ab070, 0xb89058, 0x8a8a90, 0x6a6a70, 0x4a4a50, 0xa0a0a8, 0x5a5a60,
];

/** Each people's colour, for their units until their models are in (Halflings, Runkin, Elves, Dwarves). */
const PEOPLE_COLOURS = [new THREE.Color(0x8ac850), new THREE.Color(0xb08050), new THREE.Color(0x50c0a8), new THREE.Color(0xa8a8b8)];

/** The artillery crewman's stand-in look (Patch 2, until its own model): an unarmed warrior, its tunic in its player's colour gone sooty (s). */
const SOOT = new THREE.Color(0x2a2420);
const SOOTY = new Map<number, THREE.Color>();
function sooty(colour: THREE.Color): THREE.Color {
  const hex = colour.getHex();
  let c = SOOTY.get(hex);
  if (!c) {
    c = colour.clone().lerp(SOOT, 0.55);
    SOOTY.set(hex, c);
  }
  return c;
}

/** Colour of an animal's stand-in block, by Species (14 on: the territorial creatures). */
const ANIMAL_COLOURS = [
  0x6a4a30, 0xe8e0d0, 0x7a5030, 0x5a4030, 0xb09070, 0x9a6a3a, 0x4a3a30, 0x7a7a80, 0xc09a60, 0x6a9a40, 0x4a5a30, 0xc05030, 0x5a5a5a, 0x4a3020,
  0x2a3a4a, 0xd8b030, 0x6a7a30, 0x9a6a2a, 0xc8a050, 0x5a3020,
];

/** Particle colours and counts by hit look. */
const HIT_LOOKS: Record<string, { colour: number; n: number; speed: number; up: number }> = {
  blood: { colour: 0x8a1010, n: 6, speed: 1.6, up: 1.5 },
  bone: { colour: 0xe8e0c8, n: 6, speed: 1.8, up: 1.6 },
  slime: { colour: 0x7ac040, n: 7, speed: 1.4, up: 1.4 },
  wood: { colour: 0x8a5a2a, n: 5, speed: 1.6, up: 1.4 },
  stone: { colour: 0x9a9a94, n: 5, speed: 1.6, up: 1.8 },
  spark: { colour: 0xffd040, n: 5, speed: 2.4, up: 1.6 },
  shake: { colour: 0x4a7a3a, n: 3, speed: 0.6, up: 0.4 },
  burst: { colour: 0x6a8a30, n: 24, speed: 3.2, up: 2.4 },
  blast: { colour: 0xff8020, n: 36, speed: 5, up: 3.5 },
  death: { colour: 0x7a6a50, n: 8, speed: 1.2, up: 0.8 },
};

/** Shots by Shot id: length, thickness, colour. */
const SHOT_LOOKS: ReadonlyArray<{ len: number; w: number; colour: number }> = [
  { len: 0.7, w: 0.04, colour: 0x8a6a40 },
  { len: 0.1, w: 0.1, colour: 0x8a8a84 },
  { len: 1.3, w: 0.05, colour: 0x7a5a30 },
  { len: 0.7, w: 0.04, colour: 0xd8d0b8 },
  { len: 0.1, w: 0.1, colour: 0x7a7a70 },
  { len: 0.3, w: 0.3, colour: 0xf0f0e8 },
  { len: 0.7, w: 0.06, colour: 0xff8030 },
  { len: 0.45, w: 0.05, colour: 0x6a6a70 },
  { len: 0.25, w: 0.18, colour: 0xffa020 },
  { len: 0.5, w: 0.22, colour: 0x7ab8ff },
  // The mages' Arcane bolt (violet-white) and Fireball, until their spell models are in the library.
  { len: 0.32, w: 0.2, colour: 0xd8b8ff },
  { len: 0.45, w: 0.42, colour: 0xff7020 },
  // A Grovesinger's thorn.
  { len: 0.5, w: 0.06, colour: 0x5a8a30 },
  // Cannonball, catapult stone, ballista bolt, musket ball (the shots fly still; Patch 2 cut them from the stock).
  { len: 0.16, w: 0.16, colour: 0x2a2a2e },
  { len: 0.5, w: 0.5, colour: 0x8a8a84 },
  { len: 1.5, w: 0.08, colour: 0x6a4a28 },
  { len: 0.05, w: 0.05, colour: 0x5a5a60 },
  // A bone colossus's boulder, a scorchwing's burning pitch, a flamecaller's hellfire.
  { len: 0.7, w: 0.7, colour: 0xd8d0b8 },
  { len: 0.35, w: 0.35, colour: 0xff5010 },
  { len: 0.5, w: 0.45, colour: 0xff3010 },
];

/** Shots drawn with a spell's catalogue model once it is listed. */
const SHOT_MODELS: Record<number, string> = { [Shot.ArcaneBolt]: SPELLS[Spell.ArcaneBolt]!.model, [Shot.Fireball]: SPELLS[Spell.Fireball]!.model, [Shot.Thorn]: SPELLS[Spell.ThornVolley]!.model };

/** Where a spell lands, by Spell: the colour of its motes, how many and how far they fly. */
const SPELL_LOOKS: ReadonlyArray<{ colour: number; n: number; speed: number; up: number }> = [
  { colour: 0x8ae070, n: 10, speed: 0.8, up: 1.8 },
  { colour: 0xf0e060, n: 10, speed: 1.2, up: 1.2 },
  { colour: 0x9ab0c8, n: 24, speed: 2.4, up: 1 },
  { colour: 0xff6040, n: 24, speed: 2.4, up: 1.4 },
  { colour: 0xd8b8ff, n: 8, speed: 1.8, up: 1.4 },
  { colour: 0xc8a0ff, n: 4, speed: 1.2, up: 1 },
  { colour: 0xff8020, n: 40, speed: 4.5, up: 3 },
  { colour: 0xb080ff, n: 60, speed: 6, up: 2.5 },
  { colour: 0x60a0ff, n: 24, speed: 2.4, up: 1.2 },
  { colour: 0xffffff, n: 16, speed: 2, up: 2 },
  // The Grovesingers': Rootbind, Thorn volley, Barkskin, Mending bloom, Call of the wild.
  { colour: 0x6a5a2a, n: 24, speed: 1.2, up: 0.6 },
  { colour: 0x5a8a30, n: 10, speed: 2, up: 1 },
  { colour: 0x8a6a40, n: 20, speed: 1, up: 1.6 },
  { colour: 0xf0a0c8, n: 24, speed: 1, up: 1.8 },
  { colour: 0xe0b040, n: 30, speed: 3, up: 1.2 },
];

/** Motes rising off a unit with a spell on it, by SpellOn bit. */
const SPELL_ON_COLOURS: ReadonlyArray<readonly [number, number]> = [
  [SpellOn.Healing, 0x8ae070],
  [SpellOn.Quicken, 0xf0e060],
  [SpellOn.Fortify, 0x9ab0c8],
  [SpellOn.Rally, 0xff6040],
  [SpellOn.Warding, 0x60a0ff],
  [SpellOn.Hexed, 0x6a3a8a],
];

/** A rank wand's model in a Mage's, Master Mage's or Grand Magician's hand, by Item. */
const SCHOOL_LOOKS = ['support', 'support', 'battle'];

interface Corpse {
  model: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  t0: number;
  colour: THREE.Color | null;
  /** A stand-in block's mob kind, when the model is missing. */
  mob: number;
}

/** One instanced model of a body with a set of parts, and how many of its instances this frame are the local player's own units, and outlined. */
interface PoolEntry {
  m: InstancedModel;
  n: number;
  own: number;
  outlined: number;
  /** The counts as of the last commit, for the outline passes after it. */
  ownDrawn: number;
  outlinedDrawn: number;
}

/** An instance taken from a pool. */
interface PoolSlot {
  m: InstancedModel;
  i: number;
  e: PoolEntry;
}

/** Instanced models of one body, one per set of visible parts. */
class BodyPool {
  private readonly byKey = new Map<string, PoolEntry>();

  constructor(
    private readonly parent: THREE.Object3D,
    readonly model: ModelData,
    private readonly patch: ModelShaderPatch | undefined,
  ) {}

  /** The instance to fill for a look; parts the model does not have are skipped. */
  take(parts: readonly string[]): PoolSlot | null {
    const have = parts.filter((p) => this.model.partNames.includes(p)).sort();
    const key = have.join(',');
    let e = this.byKey.get(key);
    if (!e) {
      const m = new InstancedModel(this.model, MAX_UNITS, this.patch);
      for (const p of have) m.setPartVisible(p, true);
      this.parent.add(m.object);
      e = { m, n: 0, own: 0, outlined: 0, ownDrawn: 0, outlinedDrawn: 0 };
      this.byKey.set(key, e);
    }
    if (e.n >= MAX_UNITS) return null;
    return { m: e.m, i: e.n++, e };
  }

  /** Marks a slot as one of the local player's own units (its entity id), outlined or not. */
  mark(slot: PoolSlot, id: number, outlined: boolean): void {
    slot.m.setMark(slot.i, id, outlined);
    slot.e.own++;
    if (outlined) slot.e.outlined++;
  }

  commit(): void {
    for (const e of this.byKey.values()) {
      e.m.setCount(e.n);
      e.m.commit();
      e.n = 0;
      e.ownDrawn = e.own;
      e.outlinedDrawn = e.outlined;
      e.own = 0;
      e.outlined = 0;
    }
  }

  /**
   * Sets the pool up for an outline pass (a MarkMode): the mark material, and
   * only the models the pass needs drawn. Null puts it back as it was.
   */
  pass(mode: number | null): void {
    for (const e of this.byKey.values()) {
      const drawn = e.m.instanceCount > 0;
      e.m.useMarkMaterial(mode !== null);
      e.m.object.visible = drawn && (mode === null || mode === MarkMode.Ids || (mode === MarkMode.Own ? e.ownDrawn > 0 : e.outlinedDrawn > 0));
    }
  }

  bone(name: string): number {
    return this.model.boneNames.indexOf(name);
  }
}

/** Items hanging from slot bones: the item's own model with full matrices, or a small block. */
class AttachPool {
  private readonly meshes = new Map<string, { mesh: THREE.InstancedMesh; n: number; standIn: boolean }>();
  private readonly asked = new Set<string>();
  private readonly fallbackGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(0, -0.1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    private lib: ModelLibrary | null,
  ) {}

  setLibrary(lib: ModelLibrary): void {
    this.lib = lib;
  }

  add(id: string, m: THREE.Matrix4): void {
    let e = this.meshes.get(id);
    // A stand-in block gives way to the item's model once it has loaded.
    if (e?.standIn && this.lib?.models.has(id)) {
      this.scene.remove(e.mesh);
      (e.mesh.material as THREE.Material).dispose();
      e.mesh.dispose();
      this.meshes.delete(id);
      e = undefined;
    }
    if (!e) {
      const model = this.lib?.models.get(id);
      if (!model && this.lib && !this.asked.has(id)) {
        this.asked.add(id);
        this.lib.request(id);
      }
      const mesh = model
        ? new THREE.InstancedMesh(model.geometry, new THREE.MeshLambertMaterial({ map: model.texture, alphaTest: 0.5 }), MAX_ATTACH)
        : new THREE.InstancedMesh(this.fallbackGeo, new THREE.MeshLambertMaterial({ color: id.includes('torch') ? 0xffa040 : id.includes('shield') ? 0x9a7a4a : 0x6a5a48 }), MAX_ATTACH);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      e = { mesh, n: 0, standIn: !model };
      this.meshes.set(id, e);
    }
    if (e.n >= MAX_ATTACH) return;
    e.mesh.setMatrixAt(e.n++, m);
  }

  commit(): void {
    for (const e of this.meshes.values()) {
      e.mesh.count = e.n;
      e.mesh.instanceMatrix.needsUpdate = true;
      e.n = 0;
    }
  }

  setVisible(on: boolean): void {
    for (const e of this.meshes.values()) e.mesh.visible = on;
  }
}

/** Little cubes thrown out by hits, falling and fading. */
class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly p = new Float32Array(MAX_PARTICLES * 8); // x y z vx vy vz age life
  private readonly colours: THREE.Color[] = [];
  private n = 0;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshLambertMaterial(), MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x: number, y: number, z: number, colour: number, n: number, speed: number, up: number): void {
    const c = new THREE.Color(colour);
    for (let k = 0; k < n && this.n < MAX_PARTICLES; k++) {
      const o = this.n * 8;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.p[o] = x;
      this.p[o + 1] = y;
      this.p[o + 2] = z;
      this.p[o + 3] = Math.cos(a) * s;
      this.p[o + 4] = up * (0.5 + Math.random() * 0.5);
      this.p[o + 5] = Math.sin(a) * s;
      this.p[o + 6] = 0;
      this.p[o + 7] = 0.5 + Math.random() * 0.4;
      this.colours[this.n] = c;
      this.n++;
    }
  }

  update(dt: number): void {
    const p = this.p;
    let w = 0;
    for (let r = 0; r < this.n; r++) {
      const o = r * 8;
      const age = p[o + 6]! + dt;
      if (age >= p[o + 7]!) continue;
      const d = w * 8;
      p[d + 3] = p[o + 3]!;
      p[d + 4] = p[o + 4]! - 9.8 * dt;
      p[d + 5] = p[o + 5]!;
      p[d] = p[o]! + p[d + 3]! * dt;
      p[d + 1] = p[o + 1]! + p[d + 4]! * dt;
      p[d + 2] = p[o + 2]! + p[d + 5]! * dt;
      p[d + 6] = age;
      p[d + 7] = p[o + 7]!;
      this.colours[w] = this.colours[r]!;
      const s = 1 - age / p[d + 7]!;
      this.dummy.position.set(p[d]!, p[d + 1]!, p[d + 2]!);
      this.dummy.scale.setScalar(Math.max(0.2, s));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(w, this.dummy.matrix);
      this.mesh.setColorAt(w, this.colours[w]!);
      w++;
    }
    this.n = w;
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export interface UnitsFrame {
  curr: StateMessage;
  prev: StateMessage | null;
  /** Milliseconds since curr arrived. */
  sinceMs: number;
  now: number;
  player: number;
  colours: readonly THREE.Color[];
  neutral: THREE.Color;
  /** Whether a point (metres) is in sight of the players now (they share their vision). */
  seen(x: number, z: number): boolean;
  /** Whether a point (metres) is explored by the players: lairs, huts and ruins stay drawn there. */
  known(x: number, z: number): boolean;
  /** Destroyed lairs: the lair's mob kind and where it stood, wu. */
  ruins: ReadonlyArray<readonly [number, number, number]>;
  /** Ground height at a point, metres. */
  groundAt(x: number, z: number): number;
  /** Tells the selection where unit i stands this frame (metres, its middle). */
  place(i: number, x: number, y: number, z: number): void;
  /** Entity ids of the local player's units to outline this frame (hidden-outlines.ts). */
  outlined?: ReadonlySet<number>;
}

export class UnitsView {
  private lib: ModelLibrary | null = null;
  /** Every unit, creature and corpse model, in one group the outline passes draw on their own. */
  readonly bodyGroup = new THREE.Group();
  private readonly bodies = new Map<string, BodyPool>();
  /** The fog of war on the models, when the world gives one. */
  private readonly patch: ModelShaderPatch | undefined;
  /** The local player's own units drawn this frame, where and how big (owned), out of a pool of records reused frame to frame. */
  private readonly owned: OwnDraw[] = [];
  private readonly ownedPool: OwnDraw[] = [];
  private readonly asked = new Set<string>();
  private readonly attach: AttachPool;
  private readonly particles: Particles;
  private readonly blocks: THREE.InstancedMesh;
  private readonly loads: THREE.InstancedMesh;
  private readonly shots: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;
  /** Where each unit stands this frame (metres), by entity id, while a beam is held. */
  private readonly where = new Map<number, THREE.Vector3>();
  private readonly dummy = new THREE.Object3D();
  private readonly mat = new THREE.Matrix4();
  private readonly corpses: Corpse[] = [];
  /** When each unit's current swing began on screen (ms), by entity id. */
  private readonly swingStart = new Map<number, number>();
  /** When each unit sat down at a timed action (Jade's Patch 2 tinkering), ms, so it sits once and then tinkers. */
  private readonly tinkerStart = new Map<number, number>();
  /** The state step each engine last fired on, by entity id: its smoke is thrown once per shot. */
  private readonly fired = new Map<number, number>();
  private lastFrame = 0;

  constructor(
    private readonly scene: THREE.Scene,
    fow?: FowUniforms,
  ) {
    this.patch = fow ? { key: 'fow', apply: fowPatch(fow, false) } : undefined;
    this.bodyGroup.name = 'unit models';
    scene.add(this.bodyGroup);
    this.attach = new AttachPool(scene, null);
    this.particles = new Particles(scene);
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), MAX_UNITS);
    this.blocks.count = 0;
    this.blocks.frustumCulled = false;
    scene.add(this.blocks);
    this.loads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.3, 0.2), new THREE.MeshLambertMaterial(), MAX_UNITS);
    this.loads.count = 0;
    this.loads.frustumCulled = false;
    scene.add(this.loads);
    this.shots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_SHOTS);
    this.shots.count = 0;
    this.shots.frustumCulled = false;
    scene.add(this.shots);
    this.beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xd8b8ff, transparent: true, opacity: 0.85 }), 256);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    scene.add(this.beams);
  }

  setModels(lib: ModelLibrary): void {
    this.lib = lib;
    this.attach.setLibrary(lib);
  }

  private body(wanted: string): BodyPool | null {
    // A model still to be made borrows a near kin's until it is in the catalogue.
    const id = this.lib && !this.lib.listed(wanted) ? (STAND_IN_MODELS[wanted] ?? wanted) : wanted;
    let b = this.bodies.get(id);
    if (b) return b;
    const model = this.lib?.models.get(id);
    if (!model) {
      // Came into view before its model loaded: load it next, and draw a block until then.
      if (this.lib && !this.asked.has(id)) {
        this.asked.add(id);
        this.lib.request(id);
      }
      return null;
    }
    b = new BodyPool(this.bodyGroup, model, this.patch);
    this.bodies.set(id, b);
    return b;
  }

  /** The local player's own units drawn this frame. */
  ownDraws(): readonly OwnDraw[] {
    return this.owned;
  }

  /** Sets every body model up for an outline pass (a MarkMode), or back as it was (null). */
  passPools(mode: number | null): void {
    for (const b of this.bodies.values()) b.pass(mode);
  }

  /** Hides (or shows again) what hangs on or flies round the units, which hides nothing: carried items, loads, shots, beams and bursts. */
  hideExtras(hidden: boolean): void {
    this.attach.setVisible(!hidden);
    this.loads.visible = !hidden;
    this.shots.visible = !hidden;
    this.beams.visible = !hidden;
    this.particles.mesh.visible = !hidden;
  }

  /** Notes one of the local player's own units drawn this frame: its id, its feet (metres), its height and reach round its middle. */
  private noteOwn(id: number, x: number, y: number, z: number, h: number, r: number, outlined: boolean): void {
    let rec = this.ownedPool[this.owned.length];
    if (!rec) {
      rec = { id: 0, x: 0, y: 0, z: 0, h: 0, r: 0, outlined: false };
      this.ownedPool.push(rec);
    }
    rec.id = id;
    rec.x = x;
    rec.y = y;
    rec.z = z;
    rec.h = h;
    rec.r = r;
    rec.outlined = outlined;
    this.owned.push(rec);
  }

  /** Hits and deaths of one state message: particles now, the dead kept to play their death clip. */
  onHits(hits: readonly HitEvent[], seen: (x: number, z: number) => boolean, now: number): void {
    for (const h of hits) {
      const x = h.x / WU_PER_METRE;
      const y = h.y / WU_PER_METRE;
      const z = h.z / WU_PER_METRE;
      if (!seen(x, z)) continue;
      // An animal leaves a carcass where it fell, drawn with the props.
      if (h.look === 'death' && h.kind !== undefined && h.kind !== UnitKind.Animal) {
        const model = h.kind === UnitKind.Mob ? mobSpec(h.mob ?? 0).model : h.kind === UnitKind.Warrior ? 'warrior' : h.kind === UnitKind.Mage ? 'mage' : 'worker';
        this.corpses.push({ model, x, y, z, heading: ((h.heading ?? 0) / 65536) * Math.PI * 2, t0: now, colour: null, mob: h.kind === UnitKind.Mob ? (h.mob ?? 0) : -1 });
      }
      const look = HIT_LOOKS[h.look];
      if (look) this.particles.spawn(x, y + (h.look === 'death' ? 0.2 : 0), z, look.colour, look.n, look.speed, look.up);
      if (h.look === 'blast') this.particles.spawn(x, y, z, 0x505050, 24, 3, 3);
      const spell = h.look === 'spell' ? SPELL_LOOKS[h.spell ?? 0] : undefined;
      if (spell) this.particles.spawn(x, y, z, spell.colour, spell.n, spell.speed, spell.up);
    }
  }

  update(f: UnitsFrame): void {
    const { curr, now } = f;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const prev = f.prev && f.prev.count === curr.count ? f.prev : null;
    const alpha = prev ? Math.min(1, f.sinceMs / STEP_MS) : 1;
    const t = now / 1000;
    const d = curr.data;
    let blocks = 0;
    let loads = 0;
    const dummy = this.dummy;
    const live = new Set<number>();
    this.where.clear();
    let beaming = false;
    for (let i = 0; i < curr.count && !beaming; i++) beaming = d[i * STATE_STRIDE + S.beam] !== 0;
    this.owned.length = 0;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      // A cannon in a Citadel's port and the men up on a tower or a main base's top are drawn there; everything else inside a building is hidden.
      if (d[o + S.inside] !== 0 && d[o + S.kind] !== UnitKind.Engine && !(d[o + S.flags]! & UnitFlag.OnTop)) continue;
      const id = d[o + S.id]!;
      const p = prev && alpha < 1 && prev.data[o + S.id] === id ? prev.data : d;
      const x = (p[o + S.x]! + (d[o + S.x]! - p[o + S.x]!) * alpha) / WU_PER_METRE;
      const hop = hopAt(d, o, alpha);
      const y = hop ? hop.y : (p[o + S.y]! + (d[o + S.y]! - p[o + S.y]!) * alpha) / WU_PER_METRE;
      const z = (p[o + S.z]! + (d[o + S.z]! - p[o + S.z]!) * alpha) / WU_PER_METRE;
      const heading = (d[o + S.heading]! / 65536) * Math.PI * 2;
      const owner = d[o + S.owner]!;
      const kind = d[o + S.kind]!;
      f.place(i, x, y, z);
      // The local player's own units carry their ids for the outline passes (never a monster).
      const own = owner === f.player && kind !== UnitKind.Mob;
      const outlined = own && (f.outlined?.has(id) ?? false);
      if (beaming) this.where.set(id, new THREE.Vector3(x, y, z));
      const mobUnit = kind === UnitKind.Mob;
      // Lairs and the goblins' buildings stay on the map once found, like the land; creatures only while in sight.
      const structure = mobUnit && mobSpec(d[o + S.mob]!).role === Role.Structure;
      if (mobUnit && !(structure ? f.known(x, z) : f.seen(x, z))) continue;
      // How far into its swing: clips start when the swing does.
      const swing = d[o + S.swing]!;
      live.add(id);
      let swingT = 0;
      if (swing !== 0) {
        let s0 = this.swingStart.get(id);
        if (s0 === undefined) {
          s0 = now;
          this.swingStart.set(id, now);
        }
        swingT = (now - s0) / 1000;
      } else this.swingStart.delete(id);
      const clipT = swing !== 0 ? swingT : t + (id % 7) * 0.37;
      // Sitting at a timed action: seconds since it sat down, counted from the sim's steps for a unit first seen mid-way.
      let sat = -1;
      if (d[o + S.order] === OrderKind.Tinker && d[o + S.tinkerOf]! > 0) {
        let t0 = this.tinkerStart.get(id);
        if (t0 === undefined) {
          t0 = now - d[o + S.tinkerDone]! * STEP_MS;
          this.tinkerStart.set(id, t0);
        }
        sat = (now - t0) / 1000;
      } else this.tinkerStart.delete(id);
      const colour = mobUnit ? null : owner === NEUTRAL ? f.neutral : (f.colours[owner] ?? f.neutral);
      if (mobUnit) {
        const mob = d[o + S.mob]!;
        const spec = mobSpec(mob);
        const flags = d[o + S.flags]!;
        // A cloaked void stalker is only a shimmer in the dark until it strikes or comes into the light.
        if (flags & UnitFlag.Cloaked) {
          if (Math.random() < dt * 6) this.particles.spawn(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 1.8, z + (Math.random() - 0.5) * 0.8, 0x2a1a3a, 1, 0.2, 0.3);
          continue;
        }
        if (spec.tint === 'rift' && Math.random() < dt * 5) this.particles.spawn(x, y + spec.height / WU_PER_METRE, z, 0xb040ff, 1, 0.6, 1.2);
        const pool = this.body(structureModel(spec.model, id));
        if (pool) {
          const slot = pool.take([]);
          if (slot) slot.m.setInstance(slot.i, x, y, z, heading, mobClip(pool.model, d, o), clipT, null, mobScale(spec.model, spec.height));
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, heading, 0);
          dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE, (spec.halfWidth * 2) / WU_PER_METRE);
          dummy.updateMatrix();
          this.blocks.setMatrixAt(blocks, dummy.matrix);
          this.blocks.setColorAt(blocks, new THREE.Color(mobColour(mob)));
          blocks++;
        }
        continue;
      }
      if (kind === UnitKind.Engine) {
        blocks = this.drawEngine(f, d, o, x, y, z, heading, colour, clipT, blocks, own ? id : 0, outlined);
        continue;
      }
      if (kind === UnitKind.Animal) {
        if (!f.seen(x, z)) continue;
        const spec = speciesSpec(d[o + S.mob]!);
        const scale = (d[o + S.flags]! & UnitFlag.Young) !== 0 ? 0.5 : 1;
        const moving = d[o + S.order] === OrderKind.Move;
        const pool = this.body(spec.model);
        if (pool) {
          const slot = pool.take([]);
          // A stand-in model is sized to the animal's own height; the young are the adult model at half size.
          const fit = pool.model.id === spec.model ? 1 : spec.height / WU_PER_METRE / Math.max(0.05, pool.model.boundingBox.max.y - pool.model.boundingBox.min.y);
          if (slot) {
            slot.m.setInstance(slot.i, x, y, z, heading, animalClip(pool.model, d, o, moving), clipT, null, fit * scale);
            if (own) {
              pool.mark(slot, id, outlined);
              this.noteOwn(id, x, y, z, (spec.height * scale) / WU_PER_METRE, (spec.halfWidth * 1.6 * scale) / WU_PER_METRE, outlined);
            }
          }
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, heading, 0);
          dummy.scale.set((spec.halfWidth * 2 * scale) / WU_PER_METRE, (spec.height * scale) / WU_PER_METRE, (spec.halfWidth * 3 * scale) / WU_PER_METRE);
          dummy.updateMatrix();
          this.blocks.setMatrixAt(blocks, dummy.matrix);
          this.blocks.setColorAt(blocks, new THREE.Color(ANIMAL_COLOURS[spec.id] ?? 0x8a7a60));
          blocks++;
        }
        continue;
      }
      const on = d[o + S.spells]!;
      if (on !== 0 && f.seen(x, z)) {
        for (const [bit, c] of SPELL_ON_COLOURS) if (on & bit && Math.random() < dt * 4) this.particles.spawn(x, y + 0.3 + Math.random() * 1.2, z, c, 1, 0.3, 0.8);
      }
      // The neutral peoples (and the mercenaries they hire out): their own bodies once the models are in, until then a person's body in their people's colour.
      const people = owner === PEOPLES || d[o + S.group] !== 0;
      if (owner === PEOPLES && !f.seen(x, z)) continue;
      const look = kind === UnitKind.Warrior ? warriorLook(d, o) : kind === UnitKind.Mage ? (people ? workerLook(d, o) : mageLook(d, o, this.lib)) : workerLook(d, o);
      // A rider sits at its mount's rider slot, its hips on the saddle.
      const mount = d[o + S.mount]!;
      let ry = y;
      const tall = owner === PEOPLES ? peopleUnitSpec(d[o + S.mob]!).heightCm / 100 : 1.69;
      if (mount !== 0) {
        const seat = this.drawMount(d, o, mount, x, y, z, heading, clipT, owner === PEOPLES ? null : colour, blocks, own ? id : 0, outlined);
        blocks = seat.blocks;
        ry = seat.y - tall * HIP_SHARE;
      }
      const kin = people ? this.body(peopleUnitSpec(d[o + S.mob]!).model) : null;
      const pool = kin ?? this.body(kind === UnitKind.Warrior ? 'warrior' : kind === UnitKind.Mage && !people ? mageBody(d, o, this.lib) : 'worker');
      const crewman = kind === UnitKind.Warrior && d[o + S.troop] === Troop.Crew && colour !== null;
      const tint = owner === PEOPLES ? (PEOPLE_COLOURS[peopleUnitSpec(d[o + S.mob]!).people] ?? null) : crewman ? sooty(colour) : colour;
      let drawn = false;
      if (kin) {
        const slot = kin.take([]);
        const clip = mount !== 0 ? rideClip(kin.model.clips, d, o) : kin.model.clips.has(look.clip) ? look.clip : mobClip(kin.model, d, o);
        if (slot) {
          slot.m.setInstance(slot.i, x, ry, z, heading, clip, clipT, tint);
          if (own) kin.mark(slot, id, outlined);
          drawn = true;
        }
      } else if (pool) {
        const slot = pool.take(look.parts);
        if (slot) {
          const pose = mount === 0 && sat >= 0 ? tinkerPose(pool.model.clips, sat, id) : null;
          const clip = pose?.clip ?? (mount !== 0 ? rideClip(pool.model.clips, d, o) : hop ? hopClip(pool.model.clips, look.clip, hop.up) : look.clip);
          slot.m.setInstance(slot.i, x, ry, z, heading, clip, pose?.t ?? clipT, tint);
          if (own) pool.mark(slot, id, outlined);
          drawn = true;
          for (const [item, bone] of look.attach) {
            const b = pool.bone(bone);
            if (b >= 0) this.attach.add(item, slot.m.boneWorld(slot.i, b, this.mat));
          }
        }
      } else {
        dummy.position.set(x, ry, z);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(0.45, tall, 0.45);
        dummy.updateMatrix();
        this.blocks.setMatrixAt(blocks, dummy.matrix);
        this.blocks.setColorAt(blocks, tint ?? f.neutral);
        blocks++;
      }
      // A rider reaches from the ground under its mount to the top of its head.
      if (drawn && own) this.noteOwn(id, x, y, z, ry - y + tall + 0.15, mount !== 0 ? 1.3 : 0.45, outlined);
      const carry = d[o + S.carryRes]!;
      if (carry !== NO_CARRY && d[o + S.carryAmt]! > 0) {
        // On the back: behind the unit (the model faces -Z at heading 0).
        dummy.position.set(x + Math.sin(heading) * 0.22, y + 1.05, z + Math.cos(heading) * 0.22);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.loads.setMatrixAt(loads, dummy.matrix);
        this.loads.setColorAt(loads, loadColour(carry));
        loads++;
      }
    }
    for (const id of this.swingStart.keys()) if (!live.has(id)) this.swingStart.delete(id);
    for (const id of this.tinkerStart.keys()) if (!live.has(id)) this.tinkerStart.delete(id);
    for (const id of this.fired.keys()) if (!live.has(id)) this.fired.delete(id);
    blocks = this.drawCorpses(t, blocks);
    blocks = this.drawRuins(f, blocks);
    for (const b of this.bodies.values()) b.commit();
    this.attach.commit();
    this.blocks.count = blocks;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
    this.loads.count = loads;
    this.loads.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
    this.drawShots(f, prev ? alpha : 1);
    this.drawBeams(f);
    this.particles.update(dt);
  }

  /**
   * A mount under its rider: its own model with the clip for its pace (a
   * gallop or charge once the run counts as a charge), else a block the
   * mount's size. Returns the height of the rider's seat, metres.
   */
  private drawMount(d: Int32Array, o: number, mount: number, x: number, y: number, z: number, heading: number, clipT: number, colour: THREE.Color | null, blocks: number, ownId: number, outlined: boolean): { y: number; blocks: number } {
    const spec = mountSpec(mount);
    const pool = this.body(spec.model);
    const flags = d[o + S.flags]!;
    const moving = d[o + S.order] !== OrderKind.Idle;
    if (pool) {
      const slot = pool.take(spec.model === 'elf_war_bear' ? ['saddle'] : []);
      if (slot) {
        const clips = pool.model.clips;
        const clip = flags & UnitFlag.Charging ? firstClip(clips, ['charge', 'gallop', 'run', 'walk']) : moving ? firstClip(clips, ['trot', 'walk']) : 'idle';
        slot.m.setInstance(slot.i, x, y, z, heading, clip, clipT, colour);
        // The mount carries its rider's id: one silhouette for the outline.
        if (ownId) pool.mark(slot, ownId, outlined);
        const b = pool.bone('slot_rider');
        if (b >= 0) {
          const at = new THREE.Vector3().setFromMatrixPosition(slot.m.boneWorld(slot.i, b, this.mat));
          return { y: at.y, blocks };
        }
      }
      return { y: y + spec.shoulderCm / 100, blocks };
    }
    if (blocks < MAX_UNITS) {
      const dummy = this.dummy;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(0.7, spec.shoulderCm / 100, 2.1);
      dummy.updateMatrix();
      this.blocks.setMatrixAt(blocks, dummy.matrix);
      this.blocks.setColorAt(blocks, new THREE.Color(MOUNT_COLOURS[mount] ?? 0x6a4a30));
      blocks++;
    }
    return { y: y + spec.shoulderCm / 100, blocks };
  }

  /** A siege engine or cannon: its model with the clip for what it does (towed, aimed, firing), smoke when it fires, else a wooden block its size. */
  private drawEngine(f: UnitsFrame, d: Int32Array, o: number, x: number, y: number, z: number, heading: number, colour: THREE.Color | null, clipT: number, blocks: number, ownId: number, outlined: boolean): number {
    if (!f.seen(x, z)) return blocks;
    const spec = engineSpec(d[o + S.mob]!);
    const id = d[o + S.id]!;
    const firing = d[o + S.order] === OrderKind.Shoot;
    if (firing && this.fired.get(id) !== f.curr.step) {
      this.fired.set(id, f.curr.step);
      const ahead = 1.2;
      const sx = x - Math.sin(heading) * ahead;
      const sz = z - Math.cos(heading) * ahead;
      if (spec.cannon) {
        this.particles.spawn(sx, y + 1, sz, 0xffd060, 10, 3, 1.5);
        this.particles.spawn(sx, y + 1, sz, 0x8a8a8a, 20, 1.2, 1.6);
      } else this.particles.spawn(x, y + 1.2, z, 0x8a5a2a, 6, 1.2, 1.4);
    }
    const pool = this.body(spec.model);
    if (pool) {
      const slot = pool.take([]);
      const clips = pool.model.clips;
      const hauled = d[o + S.crew]! >= 1000;
      const clip = firing ? 'fire' : d[o + S.order] === OrderKind.Move ? (hauled ? 'move_towed' : firstClip(clips, ['move', 'move_towed'])) : d[o + S.target] !== 0 ? 'aim' : d[o + S.hp]! * 3 < d[o + S.maxHp]! ? firstClip(clips, ['damaged', 'idle']) : 'idle';
      if (slot) {
        slot.m.setInstance(slot.i, x, y, z, heading, clip, firing ? 0 : clipT, colour);
        if (ownId) {
          pool.mark(slot, ownId, outlined);
          this.noteOwn(ownId, x, y, z, spec.height / WU_PER_METRE, (spec.halfWidth * 1.6) / WU_PER_METRE, outlined);
        }
      }
      return blocks;
    }
    if (blocks >= MAX_UNITS) return blocks;
    const dummy = this.dummy;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE / 2, (spec.halfWidth * 3) / WU_PER_METRE);
    dummy.updateMatrix();
    this.blocks.setMatrixAt(blocks, dummy.matrix);
    this.blocks.setColorAt(blocks, new THREE.Color(spec.cannon ? 0xb08a40 : 0x7a5a30));
    return blocks + 1;
  }

  /** A held Beam: a violet-white bar from the mage's hand to her target, flickering a little. */
  private drawBeams(f: UnitsFrame): void {
    const d = f.curr.data;
    const dummy = this.dummy;
    const dir = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < f.curr.count && k < 256; i++) {
      const o = i * STATE_STRIDE;
      const target = d[o + S.beam]!;
      if (target === 0 || d[o + S.kind] !== UnitKind.Mage) continue;
      const a = this.where.get(d[o + S.id]!);
      const b = this.where.get(target);
      if (!a || !b) continue;
      // From her wand hand to the target's chest.
      const from = new THREE.Vector3(a.x, a.y + 1.1, a.z);
      const to = new THREE.Vector3(b.x, b.y + 0.9, b.z);
      dir.subVectors(to, from);
      const len = dir.length();
      if (len < 0.1) continue;
      dummy.position.copy(from);
      dummy.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
      const w = 0.07 + Math.random() * 0.04;
      dummy.scale.set(w, w, len);
      dummy.updateMatrix();
      this.beams.setMatrixAt(k++, dummy.matrix);
      if (Math.random() < 0.3) this.particles.spawn(to.x, to.y, to.z, 0xc8a0ff, 1, 1, 1);
    }
    this.beams.count = k;
    this.beams.instanceMatrix.needsUpdate = true;
  }

  private drawCorpses(t: number, blocks: number): number {
    const keep: Corpse[] = [];
    for (const c of this.corpses) {
      const age = t - c.t0 / 1000;
      if (age > CORPSE_LIE_S + CORPSE_SINK_S) continue;
      keep.push(c);
      const sink = age > CORPSE_LIE_S ? ((age - CORPSE_LIE_S) / CORPSE_SINK_S) * 0.6 : 0;
      const pool = this.body(c.model);
      if (pool) {
        const slot = pool.take([]);
        if (slot) slot.m.setInstance(slot.i, c.x, c.y - sink, c.z, c.heading, 'death', age, c.colour, c.mob >= 0 ? mobScale(c.model, mobSpec(c.mob).height) : 1);
      } else if (c.mob >= 0) {
        const spec = mobSpec(c.mob);
        const dummy = this.dummy;
        dummy.position.set(c.x, c.y - sink, c.z);
        dummy.rotation.set(0, c.heading, Math.PI / 2);
        dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, spec.height / WU_PER_METRE, (spec.halfWidth * 2) / WU_PER_METRE);
        dummy.updateMatrix();
        this.blocks.setMatrixAt(blocks, dummy.matrix);
        this.blocks.setColorAt(blocks, new THREE.Color(MOB_COLOURS[c.mob] ?? 0x555555).multiplyScalar(0.6));
        blocks++;
      }
    }
    this.corpses.length = 0;
    this.corpses.push(...keep);
    return blocks;
  }

  /** Destroyed lairs on explored land: the lair's destroyed model, else a low dark block. */
  private drawRuins(f: UnitsFrame, blocks: number): number {
    const dummy = this.dummy;
    for (const [mob, wx, wz] of f.ruins) {
      const x = wx / WU_PER_METRE;
      const z = wz / WU_PER_METRE;
      if (!f.known(x, z)) continue;
      const spec = mobSpec(mob);
      const y = f.groundAt(x, z);
      const pool = this.body(`${spec.model}_destroyed`);
      if (pool) {
        const slot = pool.take([]);
        if (slot) slot.m.setInstance(slot.i, x, y, z, 0, 'idle', 0, null);
        continue;
      }
      if (blocks >= MAX_UNITS) break;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set((spec.halfWidth * 2) / WU_PER_METRE, 0.4, (spec.halfWidth * 2) / WU_PER_METRE);
      dummy.updateMatrix();
      this.blocks.setMatrixAt(blocks, dummy.matrix);
      this.blocks.setColorAt(blocks, new THREE.Color(MOB_COLOURS[mob] ?? 0x555555).multiplyScalar(0.45));
      blocks++;
    }
    return blocks;
  }

  private drawShots(f: UnitsFrame, alpha: number): void {
    const s = f.curr.shots;
    const n = Math.min(MAX_SHOTS, Math.floor(s.length / SHOT_STRIDE));
    const dummy = this.dummy;
    const dir = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < n; i++) {
      const o = i * SHOT_STRIDE;
      const x0 = s[o]! / WU_PER_METRE;
      const y0 = s[o + 1]! / WU_PER_METRE;
      const z0 = s[o + 2]! / WU_PER_METRE;
      const x1 = s[o + 3]! / WU_PER_METRE;
      const y1 = s[o + 4]! / WU_PER_METRE;
      const z1 = s[o + 5]! / WU_PER_METRE;
      const x = x0 + (x1 - x0) * alpha;
      const y = y0 + (y1 - y0) * alpha;
      const z = z0 + (z1 - z0) * alpha;
      if (!f.seen(x, z)) continue;
      const look = SHOT_LOOKS[s[o + 6]!] ?? SHOT_LOOKS[0]!;
      dummy.position.set(x, y, z);
      dir.set(x1 - x0, y1 - y0, z1 - z0);
      if (dir.lengthSq() > 1e-9) dummy.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
      const model = SHOT_MODELS[s[o + 6]!];
      if (model && this.lib?.listed(model)) {
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.attach.add(model, dummy.matrix);
        continue;
      }
      dummy.scale.set(look.w, look.w, look.len);
      dummy.updateMatrix();
      this.shots.setMatrixAt(k, dummy.matrix);
      this.shots.setColorAt(k, new THREE.Color(look.colour));
      k++;
    }
    this.shots.count = k;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** The model a structure is drawn with: goblin huts come in three looks, picked by the hut's id. */
function structureModel(model: string, id: number): string {
  return model === 'goblin_hut_1' ? `goblin_hut_${1 + (id % 3)}` : model;
}

/**
 * Models still to be made (models/troop_kits_models.md), drawn with a near
 * kin's model until theirs is in the catalogue (s).
 */
const STAND_IN_MODELS: Readonly<Record<string, string>> = { wild_goose: 'chicken_hen', pheasant: 'chicken_hen' };

/** Each model's height as drawn for the first mob that uses it, metres. */
const MOB_MODEL_HEIGHT = new Map<string, number>();
for (const m of MOBS) if (!MOB_MODEL_HEIGHT.has(m.model)) MOB_MODEL_HEIGHT.set(m.model, m.height);

/** A mob sharing another's model (the small slime) is that model sized to its own height. */
function mobScale(model: string, height: number): number {
  const first = MOB_MODEL_HEIGHT.get(model);
  return first ? height / first : 1;
}

/** An animal's clip: its attack while it swings, hurt, running away, walking or standing. */
function animalClip(model: ModelData, d: Int32Array, o: number, moving: boolean): string {
  const flags = d[o + S.flags]!;
  if (d[o + S.swing] !== 0) {
    for (const n of model.clips.keys()) if (n.startsWith('attack') || n === 'bite' || n === 'peck' || n === 'swipe' || n === 'charge') return n;
  }
  if (flags & UnitFlag.Hurt && model.clips.has('injured')) return 'injured';
  // Hornets and griffins fly from place to place.
  if (moving) return flags & UnitFlag.Fleeing ? firstClip(model.clips, ['fly', 'run', 'walk']) : firstClip(model.clips, ['fly', 'walk', 'run']);
  return 'idle';
}

/** A monster's clip: its attack while it swings, climbing, flying, running away, hurt, walking or standing. */
function mobClip(model: ModelData, d: Int32Array, o: number): string {
  const has = (n: string): boolean => model.clips.has(n);
  const flags = d[o + S.flags]!;
  if (d[o + S.swing] !== 0) {
    for (const n of model.clips.keys()) if (n.startsWith('attack') || n === 'bow_shoot' || n === 'sling_throw' || n === 'detonate') return n;
  }
  if (flags & UnitFlag.Climbing && has('climb')) return 'climb';
  if (flags & UnitFlag.Hurt && has('injured')) return 'injured';
  const moving = d[o + S.order] !== OrderKind.Idle;
  const moves = mobSpec(d[o + S.mob]!).moves;
  // A high flyer stooping on a lone worker dives; circling, it flies.
  if (flags & UnitFlag.Swooping && has('dive')) return 'dive';
  if ((moves === Moves.LowFlyer || moves === Moves.HighFlyer) && has('fly')) return 'fly';
  // A goblin wolf rider's model rides (charge, ride, ride_idle) where others walk.
  if (flags & UnitFlag.Charging && has('charge')) return 'charge';
  if (moving) return flags & UnitFlag.Fleeing && has('run') ? 'run' : firstClip(model.clips, ['walk', 'ride']);
  return firstClip(model.clips, ['idle', 'ride_idle']);
}

/** The first of some clips a model has, else the last named. */
function firstClip(clips: ReadonlyMap<string, unknown>, names: readonly string[]): string {
  for (const n of names) if (clips.has(n)) return n;
  return names[names.length - 1]!;
}

/** Where a rider's hips sit up its height (s): the seat is at the mount's rider slot. */
const HIP_SHARE = 0.53;

/** Mount stand-in colours by Mount: horse, war ox, wolf, war bear. */
const MOUNT_COLOURS = [0, 0x6a4a30, 0x5a4030, 0x7a7a80, 0x4a3020];

/** A rider's clip (the riding clips of the warrior body, or a people's rider's own): shooting, a thrust or slash, the charge, else sitting. */
function rideClip(clips: ReadonlyMap<string, unknown>, d: Int32Array, o: number): string {
  const swing = d[o + S.swing]!;
  const flags = d[o + S.flags]!;
  const inHand = d[o + S.weapon]!;
  if (swing === Slot.Ranged + 1) return firstClip(clips, ['ride_bow_shoot', 'ride_attack_1h', 'ride']);
  if (swing !== 0) return polearm(inHand) ? firstClip(clips, ['ride_attack_polearm', 'ride_thrust', 'ride']) : firstClip(clips, ['ride_attack_1h', 'ride_slash', 'ride']);
  if (flags & UnitFlag.Charging) return firstClip(clips, ['ride_charge', 'ride']);
  return firstClip(clips, ['ride_idle', 'ride', 'idle']);
}

/** A monster's stand-in block colour: its own for the early ones, else a colour from its id (violet for the Rift-touched). */
function mobColour(mob: number): number {
  const c = MOB_COLOURS[mob];
  if (c !== undefined) return c;
  if (mobSpec(mob).tint === 'rift') return 0x8a40c0;
  return LATE_COLOURS[mob % LATE_COLOURS.length]!;
}
const LATE_COLOURS = [0x5a2a2a, 0x8a3a1a, 0x3a3a4a, 0x6a5a40, 0x9a2a1a, 0x2a2a3a, 0x7a4a2a, 0x4a2a4a];

/** How high a hop arcs above the straight line from one level to the other, metres (s). */
const HOP_ARC_M = 0.22;

/**
 * A hop up or down a rise under way (Moving over the land): the unit's
 * height on an arc from the level it left to the one it lands on, and
 * whether it goes up. Null when it is not hopping.
 */
export function hopAt(d: Int32Array, o: number, alpha: number): { y: number; up: boolean } | null {
  const left = d[o + S.hop]!;
  if (left <= 0) return null;
  const t = Math.min(1, Math.max(0, (HOP_STEPS - left + alpha) / HOP_STEPS));
  const rise = d[o + S.hopRise]! / WU_PER_METRE;
  return { y: d[o + S.y]! / WU_PER_METRE - rise * (1 - t) + HOP_ARC_M * 4 * t * (1 - t), up: rise > 0 };
}

/** The pose of a hop: the body's climb clip going up (or a jump clip, if it has one), else what it was doing. */
function hopClip(clips: ReadonlyMap<string, unknown>, clip: string, up: boolean): string {
  if (clips.has('jump')) return 'jump';
  if (up && clips.has('climb')) return 'climb';
  return clip;
}

/** Tools with a model of their own, attached to the right hand. */
const TOOL_MODELS = new Set(['maul_stone', 'hammer_stone', 'axe_flint']);

/** The sit_down clip's length: the unit sits, then tinkers (the base bodies' clips, Jade's Patch 2). */
const SIT_DOWN_S = 0.6;

/**
 * Jade's Patch 2 tinkering pose for a unit sitting at a timed action `sat`
 * seconds: it sits down, then works with its hands at its chest, head bowed.
 * Null for a body without the clips, which keeps its own.
 */
function tinkerPose(clips: ReadonlyMap<string, unknown>, sat: number, id: number): { clip: string; t: number } | null {
  if (!clips.has('tinker')) return null;
  if (sat < SIT_DOWN_S && clips.has('sit_down')) return { clip: 'sit_down', t: sat };
  return { clip: 'tinker', t: sat - SIT_DOWN_S + (id % 5) * 0.29 };
}

/** A worker's tool in hand while it works, a torch in the other, its clip. */
function workerLook(d: Int32Array, o: number): Look {
  const order = d[o + S.order]!;
  const flags = d[o + S.flags]!;
  const parts: string[] = [];
  const attach: Array<[string, string]> = [];
  const working = order === OrderKind.Chop || order === OrderKind.Mine || order === OrderKind.Attack || order === OrderKind.Shoot;
  // The tool for the job in hand (Table 2c): the stone maul and hammer and the flint axe have their own models; the
  // hardwood set and the metal sets show the body's hoe for digging and farming and its wooden axe otherwise.
  const tool = d[o + S.toolHand]!;
  const own = TOOL_MODELS.has(gearModel(tool)) ? gearModel(tool) : '';
  if (own && (working || order === OrderKind.Dig)) attach.push([own, 'slot_hand_r']);
  else if (order === OrderKind.Farm || order === OrderKind.Dig) parts.push('hoe');
  else if (working && tool) parts.push('hardwood_axe');
  let clip = WORKER_CLIPS[order] ?? (order !== OrderKind.Idle ? 'walk' : 'idle');
  if (flags & UnitFlag.Hurt && d[o + S.swing] === 0) clip = 'injured';
  return { parts, attach, clip };
}

/** A mage's body: her school and rank's look once it is in the library, else the plain mage. */
function mageBody(d: Int32Array, o: number, lib: ModelLibrary | null): string {
  const look = `mage_${SCHOOL_LOOKS[d[o + S.school]!] ?? 'support'}_${d[o + S.rank]!}`;
  return lib?.listed(look) ? look : 'mage';
}

/**
 * A mage's wand (her rank wand's own model once listed) and clip: the
 * spell's own clip while she casts (Table 13), the beam clip while she holds
 * one, the bolt clip for a tap of the wand, then hurt, walking or standing.
 */
function mageLook(d: Int32Array, o: number, lib: ModelLibrary | null): Look {
  const parts: string[] = [];
  const attach: Array<[string, string]> = [];
  const wand = gearModel(d[o + S.weapon]!);
  if (wand.startsWith('wand_') && lib?.listed(wand)) attach.push([wand, 'slot_hand_r']);
  else parts.push('wand');
  const cast = d[o + S.cast]!;
  const flags = d[o + S.flags]!;
  const order = d[o + S.order]!;
  let clip = 'idle';
  if (cast !== 0) clip = SPELLS[cast - 1]?.clip ?? 'cast_bolt';
  else if (d[o + S.beam] !== 0) clip = 'cast_beam';
  else if (d[o + S.swing] !== 0) clip = 'cast_bolt';
  else if (flags & UnitFlag.Hurt) clip = 'injured';
  else if (order !== OrderKind.Idle) clip = flags & UnitFlag.Fleeing ? 'run' : 'walk';
  return { parts, attach, clip };
}

/** A warrior's gear on its body: the weapon or the ranged weapon in hand, the other carried, the shield, the quiver. */
function warriorLook(d: Int32Array, o: number): Look {
  const parts: string[] = [];
  const attach: Array<[string, string]> = [];
  const swing = d[o + S.swing]!;
  const weapon = d[o + S.weapon]!;
  const ranged = d[o + S.ranged]!;
  const shooting = swing === Slot.Ranged + 1;
  // A ranger's close weapon is its fists: its bow, sling or gun stays in hand.
  const inHand = shooting || (ranged && !gearModel(weapon)) ? ranged : weapon;
  const hand = (model: string): void => {
    if (/^(spear|pike|halberd)/.test(model)) parts.push('flint_spear');
    else if (model === 'sling') parts.push('sling');
    else if (model === 'bow') parts.push('bow', 'quiver');
    else if (model === 'club' || model === 'axe_war_flint') attach.push([model, 'slot_hand_r']);
  };
  hand(gearModel(inHand));
  // What is not in hand is carried.
  if (ranged && inHand !== ranged && gearModel(ranged) === 'bow') parts.push('quiver');
  const shield = gearModel(d[o + S.shield]!);
  if (shield === 'shield_wood') parts.push('wood_shield');
  else if (shield === 'shield_wicker') attach.push(['shield_wicker', 'slot_shield_l']);
  return { parts, attach, clip: warriorClip(d, o, inHand) };
}

function warriorClip(d: Int32Array, o: number, inHand: number): string {
  const swing = d[o + S.swing]!;
  const flags = d[o + S.flags]!;
  const model = gearModel(inHand);
  if (swing === Slot.Ranged + 1) return model === 'bow' ? 'bow_shoot' : model === 'sling' ? 'sling_throw' : 'throw_spear';
  if (swing !== 0) return polearm(inHand) ? 'attack_polearm_thrust' : 'attack_1h_slash';
  if (flags & UnitFlag.Hurt) return 'injured';
  const order = d[o + S.order]!;
  if (order !== OrderKind.Idle) return flags & UnitFlag.Fleeing ? 'run' : 'walk';
  if (d[o + S.target] !== 0) return polearm(inHand) ? 'guard_polearm' : 'guard_1h';
  return 'idle';
}

/** Colour of a carried load by resource (a few families; the rest sandy). */
const LOAD_COLOURS = new Map<number, THREE.Color>();
function loadColour(res: number): THREE.Color {
  let c = LOAD_COLOURS.get(res);
  if (!c) {
    const name = RESOURCES[res]?.name.toLowerCase() ?? '';
    c = new THREE.Color(name.includes('softwood') ? 0xb07a48 : name.includes('hardwood') ? 0x7a4e2a : name.includes('stone') ? 0x9a9a94 : name.includes('flint') ? 0x5a5a66 : name.includes('herb') ? 0x4a9a4a : name.includes('stick') ? 0x8a6a3a : 0xc8b070);
    LOAD_COLOURS.set(res, c);
  }
  return c;
}
