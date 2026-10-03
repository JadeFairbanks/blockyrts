// The main menu's picture: the first night falling on a torch-lit camp.
// Warriors hold the line in front of the Big House while rangers shoot over
// them and a battle mage throws fire; the dead and the beasts of the dark come
// out of the forest. Staged on the generated land of a real seed's start
// pocket, with the catalogue's models posed in their own clips.
//
// The menu panel sits over the left third, so the camp and the fight sit
// centre and right. Positions are metres from the start pocket, with -z north
// (into the picture) and +x east (right), as in the game.
import * as THREE from 'three';
import { COLUMNS_PER_CHUNK as N } from '@blockyrts/sim';
import { COLUMN_M } from '../../world/mesher.ts';
import { NEUTRAL_GRADE } from '../post.ts';
import { bonePoint, figure, type FigureSpec } from '../pose.ts';
import { rng } from '../random.ts';
import { skyDome } from '../sky.ts';
import { buildTerrain, worldFor } from '../terrain.ts';
import type { Stager } from './types.ts';

const SEED = 1;
const BLUE = new THREE.Color(0x3460b2);

/** Heading (game convention: 0 faces -z) that turns a figure at a to face b. */
const face = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(-(bx - ax), -(bz - az));

const KNIGHT: Partial<FigureSpec> = {
  team: BLUE,
  hold: [
    ['sword', 'slot_hand_r'],
    ['shield_iron_kite', 'slot_shield_l'],
    ['helmet_iron_nasal', 'slot_head'],
  ],
  wear: ['armour_iron_mail'],
};
const AXEMAN: Partial<FigureSpec> = {
  team: BLUE,
  hold: [
    ['axe_war', 'slot_hand_r'],
    ['shield_wicker', 'slot_shield_l'],
    ['helmet_leather_cap', 'slot_head'],
  ],
  wear: ['armour_leather'],
};
const PIKEMAN: Partial<FigureSpec> = {
  team: BLUE,
  hold: [
    ['pike', 'slot_hand_r'],
    ['helmet_bronze', 'slot_head'],
  ],
  wear: ['armour_bronze_scale'],
};
const RANGER: Partial<FigureSpec> = { team: BLUE, parts: ['bow', 'quiver'], hold: [['helmet_leather_cap', 'slot_head']], wear: ['armour_leather'] };
const MINOTAUR_GEAR = ['gear_axe', 'gear_pauldron', 'gear_harness', 'gear_kilt', 'gear_bracer_l', 'gear_bracer_r'];

export const battleScene: Stager = {
  models: [
    'main_base_l1', 'torch_post', 'bush_hazel', 'rock_stone', 'campfire', 'banner_pole', 'brazier', 'log_stack', 'woodpile', 'barrel', 'crate', 'weapon_rack', 'lean_to', 'sack_pile',
    'warrior', 'mage', 'worker', 'zombie', 'skeleton_archer', 'grave_hound', 'minotaur', 'bone_colossus', 'giant_spider',
    'sword', 'axe_war', 'pike', 'shield_iron_kite', 'shield_wicker', 'armour_iron_mail', 'armour_leather', 'armour_bronze_scale',
    'helmet_iron_nasal', 'helmet_leather_cap', 'helmet_bronze', 'torch_hand', 'wand_mage', 'arrow_flight', 'spell_fireball',
  ],
  async build({ library, params }) {
    const scene = new THREE.Scene();
    const world = worldFor(Number(params.get('seed') ?? SEED));
    const pocket = world.gen.start.pockets[0]!;
    const px = pocket.x * COLUMN_M;
    const pz = pocket.z * COLUMN_M;
    const pcx = Math.floor(pocket.x / N);
    const pcz = Math.floor(pocket.z / N);
    // The stage itself is kept clear of trees and rocks.
    const stage = (gx: number, gz: number): boolean => {
      const x = gx * COLUMN_M - px;
      const z = gz * COLUMN_M - pz;
      return x > -12 && x < 24 && z > -14 && z < 22;
    };
    const terrain = buildTerrain(world, { cx0: pcx - 3, cx1: pcx + 5, cz0: pcz - 6, cz1: pcz + 2, clear: stage, srgb: true, tint: 0xd8e0c8 });
    scene.add(terrain.group);
    const ground = (x: number, z: number): number => terrain.heightAt(px + x, pz + z);
    const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(px + x, ground(x, z) + y, pz + z);
    const put = async (spec: FigureSpec, x: number, z: number, heading: number): Promise<THREE.Group> => {
      const g = await figure(library, spec, px + x, ground(x, z), pz + z, heading);
      scene.add(g);
      return g;
    };
    const fire = (colour: number, intensity: number, distance: number, p: THREE.Vector3, shadow = false): void => {
      const l = new THREE.PointLight(colour, intensity, distance, 2);
      l.position.copy(p);
      if (shadow) {
        l.castShadow = true;
        l.shadow.mapSize.set(1024, 1024);
        l.shadow.bias = -0.004;
        l.shadow.camera.near = 0.2;
      }
      scene.add(l);
    };
    const flameTip = (id: string, x: number, z: number): THREE.Vector3 => {
      const m = library.models.get(id);
      const tip = m ? bonePoint(m, 'flicker', 0, 'fx_flame') : new THREE.Vector3(0, 1.8, 0);
      return at(x + tip.x, tip.y, z + tip.z);
    };

    /** Heading for a figure at x, z facing along dx, dz. */
    const along = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

    // The camp: the Big House behind the fight, torches, the fire, stores.
    await put({ body: 'main_base_l1', team: BLUE }, 4, -10.5, face(4, -10.5, 8.5, 15.5) + 0.5);
    await put({ body: 'banner_pole', team: BLUE, clip: 'idle', time: 0.6 }, 8.6, -7, Math.PI * 0.8);
    for (const [x, z, shadow] of [
      [0.8, -1.6, false],
      [1.4, -7.4, false],
      [7.8, -8.4, false],
      [13.8, -6.8, true],
    ] as const) {
      await put({ body: 'torch_post', clip: 'flicker', time: x, glow: 3 }, x, z, 0);
      fire(0xff9a40, 12, 13, flameTip('torch_post', x, z).add(new THREE.Vector3(0, 0.45, 0.25)), shadow);
    }
    const FIRE = { x: 2, z: 2.8 };
    await put({ body: 'campfire', clip: 'flicker', time: 0.3, glow: 4, hideBones: ['cold'] }, FIRE.x, FIRE.z, 0.4);
    fire(0xff7020, 22, 14, at(FIRE.x, 0.7, FIRE.z), true);
    await put({ body: 'brazier', clip: 'flicker', time: 0.5, glow: 1.6, hideBones: ['unlit'] }, 2.4, -7.8, 0);
    fire(0xffc040, 8, 10, at(2.4, 2.1, -7.6));
    await put({ body: 'woodpile' }, 7.2, -12.4, 0.2);
    await put({ body: 'log_stack' }, -0.6, -9.8, 0.3);
    await put({ body: 'barrel' }, -0.4, -4.6, 0);
    await put({ body: 'barrel' }, -1, -3.9, 0.6);
    await put({ body: 'crate' }, 0.3, -3.7, 0.3);
    await put({ body: 'sack_pile' }, -1.4, -5.4, 0.8);
    await put({ body: 'weapon_rack' }, 3, -3.4, 0.9);
    await put({ body: 'lean_to' }, -2.8, -8.4, 0.9);

    // Dark shapes at the picture's lower corners.
    await put({ body: 'bush_hazel', tint: new THREE.Color(0.5, 0.5, 0.55) }, 17.5, 12, 0.7);
    await put({ body: 'rock_stone', tint: new THREE.Color(0.6, 0.6, 0.65) }, 2, 10.5, 0.3);

    // The defenders hold a line facing east, turned a little to the viewer,
    // as the dark comes on from the right turned a little to the viewer too.
    const MINO = { x: 11, z: 1.2 };
    await put({ body: 'warrior', ...KNIGHT, clip: 'shield_block', time: 0.4 }, 8.2, 0.4, along(0.95, 0.25));
    await put({ body: 'warrior', ...AXEMAN, clip: 'attack_1h_slash', time: 0.4 }, 7.6, 4, along(0.75, 0.65));
    await put({ body: 'warrior', ...PIKEMAN, clip: 'attack_polearm_thrust', time: 0.45 }, 7.8, -3.2, along(0.95, 0.2));
    await put({ body: 'warrior', ...KNIGHT, clip: 'guard_1h', time: 0.7 }, 5.8, 1.8, along(0.9, 0.45));
    const RANGERS = [
      { x: 4.2, z: -1.4, at: [16, 1] },
      { x: 5.2, z: -5.2, at: [18, -1] },
    ] as const;
    for (const [i, g] of RANGERS.entries()) await put({ body: 'warrior', ...RANGER, clip: 'bow_shoot', time: 0.6 + i * 0.05 }, g.x, g.z, face(g.x, g.z, g.at[0], g.at[1]));
    const MAGE = { x: 4.8, z: 3.8 };
    await put({ body: 'mage', team: BLUE, clip: 'cast_bolt', time: 0.62, hold: [['wand_mage', 'slot_hand_r']] }, MAGE.x, MAGE.z, face(MAGE.x, MAGE.z, MINO.x, MINO.z));
    await put({ body: 'worker', team: BLUE, clip: 'run', time: 0.2, hold: [['torch_hand', 'slot_hand_r', 'snuffed']] }, 2.6, -2.2, face(2.6, -2.2, 4, -8));
    fire(0xffa048, 8, 8, at(2.6, 1.7, -2.2));

    // The night: the dead, the hounds, a minotaur and a bone colossus coming out of the trees.
    await put({ body: 'minotaur', parts: MINOTAUR_GEAR, clip: 'attack_cleave', time: 0.26, scale: 1.6, glow: 3 }, MINO.x, MINO.z, along(-0.95, 0.25));
    await put({ body: 'zombie', clip: 'attack_grab', time: 0.72, glow: 4 }, 9.8, 4.9, along(-0.9, 0.35));
    await put({ body: 'grave_hound', clip: 'attack_bite', time: 0.5, glow: 4 }, 10.2, -2.6, along(-0.95, 0.2));
    await put({ body: 'grave_hound', clip: 'run', time: 0.1, glow: 4 }, 13.4, 5.2, along(-0.9, 0.4));
    const r = rng(7);
    for (const [x, z] of [
      [12.8, -5.2],
      [13.8, -1.2],
      [14.6, 3],
      [15.6, 7],
      [16.4, -3.6],
      [17.2, 1.6],
      [12.6, 9.6],
      [18.6, 5.4],
      [14.8, -8],
    ] as const) {
      await put({ body: 'zombie', clip: 'walk', time: r() * 1.5, glow: 4 }, x, z, face(x, z, 6, 2) + (r() - 0.5) * 0.4);
    }
    await put({ body: 'giant_spider', clip: 'attack_pounce', time: 0.7, scale: 1.6, glow: 4 }, 11.6, 7.8, along(-0.85, 0.5));
    await put({ body: 'skeleton_archer', parts: ['quiver', 'recurve_bow'], clip: 'bow_shoot', time: 0.6, glow: 4 }, 17.4, -1.6, face(17.4, -1.6, 7, 1));
    await put({ body: 'skeleton_archer', parts: ['quiver', 'recurve_bow'], clip: 'bow_shoot', time: 0.5, glow: 4 }, 19.2, 3.4, face(19.2, 3.4, 8, 4));
    await put({ body: 'bone_colossus', clip: 'walk', time: 0.76, glow: 0, scale: 1.3 }, 19.5, -9, face(19.5, -9, 9, 2));
    await put({ body: 'zombie', clip: 'death', time: 9, glow: 0 }, 8.6, 7.8, 2.2);

    // Arrows and fire in the air.
    const arrow = library.models.get('arrow_flight');
    const shoot = async (from: THREE.Vector3, to: THREE.Vector3, t: number): Promise<void> => {
      if (!arrow) return;
      const p = from.clone().lerp(to, t);
      p.y += Math.sin(Math.PI * t) * from.distanceTo(to) * 0.12;
      const next = from.clone().lerp(to, t + 0.02);
      next.y += Math.sin(Math.PI * (t + 0.02)) * from.distanceTo(to) * 0.12;
      const g = await figure(library, { body: 'arrow_flight', scale: 1.5 }, p.x, p.y, p.z, 0);
      g.lookAt(p.clone().multiplyScalar(2).sub(next));
      // A faint streak behind it, the way the eye sees a fast arrow.
      const streak = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1).translate(0, 0, 0.75), streakMat);
      g.add(streak);
      g.traverse((o) => (o.castShadow = false));
      scene.add(g);
    };
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xc8c0b0, transparent: true, opacity: 0.08, depthWrite: false });
    const [ra, rb] = RANGERS;
    await shoot(at(ra.x, 1.4, ra.z), at(16, 1.2, 1), 0.55);
    await shoot(at(rb.x, 1.4, rb.z), at(18, 1.2, -1), 0.42);
    await shoot(at(ra.x, 1.4, ra.z), at(17, 1.2, 4.5), 0.3);
    await shoot(at(rb.x, 1.4, rb.z), at(15, 1.2, -4), 0.72);
    await shoot(at(17.4, 1.4, -1.6), at(7, 1.2, 1), 0.5);
    await shoot(at(19.2, 1.4, 3.4), at(8, 1.2, 4), 0.35);
    // The fireball, two thirds of the way to the minotaur, with a trail of embers.
    const wand = at(MAGE.x + 0.3, 1.5, MAGE.z - 0.4);
    const target = at(MINO.x, 1.8, MINO.z);
    // The fireball is lobbed: a shallow arc over the defenders' heads.
    const flight = (t: number): THREE.Vector3 => {
      const p = wand.clone().lerp(target, t);
      p.y += Math.sin(Math.PI * t) * 1.1;
      return p;
    };
    const BALL_T = 0.46;
    const ball = flight(BALL_T);
    const fb = await figure(library, { body: 'spell_fireball', clip: 'loop', time: 0.2, glow: 6, scale: 1.6 }, ball.x, ball.y, ball.z, 0);
    fb.lookAt(flight(BALL_T - 0.05));
    scene.add(fb);
    fire(0xff8030, 30, 12, ball);
    // Embers: the fireball's tail, sparks over the campfire, eyes under the trees.
    // Each is a small glowing cube; colours above 1 feed the bloom.
    const motes: { p: THREE.Vector3; s: number; c: THREE.Color; flat?: boolean }[] = [];
    const TAIL = 110;
    for (let i = 0; i < TAIL; i++) {
      const t = (i / TAIL) ** 1.3;
      const p = flight(BALL_T * (1 - t * 0.92));
      const spread = 0.04 + t * 0.45;
      p.x += (r() - 0.5) * spread;
      p.y += (r() - 0.35) * spread + t * t * 0.25;
      p.z += (r() - 0.5) * spread;
      const heat = 1 - t;
      motes.push({ p, s: 0.02 + 0.16 * heat ** 2 * (0.6 + 0.4 * r()), c: new THREE.Color(0.6 + 3.2 * heat, 0.12 + 1.5 * heat ** 1.5, 0.03 + 0.5 * heat ** 3) });
    }
    for (let i = 0; i < 18; i++) {
      const rise = r();
      const p = at(FIRE.x + (r() - 0.5) * (0.4 + rise), 0.8 + rise * 2.6, FIRE.z + (r() - 0.5) * (0.4 + rise));
      motes.push({ p, s: 0.018 + (1 - rise) * 0.025, c: new THREE.Color(3, 1.2, 0.3).multiplyScalar(1.2 - rise * 0.8) });
    }
    for (let i = 0; i < 16; i++) {
      const head = at(6 + r() * 22, 0.9 + r() * 1.1, -16 - r() * 14);
      const side = new THREE.Vector3(0.09, 0, 0);
      const c = r() < 0.7 ? new THREE.Color(4, 0.6, 0.25) : new THREE.Color(1.2, 3.5, 0.6);
      motes.push({ p: head.clone().sub(side), s: 0.05, c, flat: true }, { p: head.clone().add(side), s: 0.05, c, flat: true });
    }
    const motesMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), motes.length);
    const m = new THREE.Matrix4();
    motes.forEach((o, i) => {
      motesMesh.setMatrixAt(i, m.makeScale(o.s, o.flat ? o.s * 0.7 : o.s, o.s).setPosition(o.p));
      motesMesh.setColorAt(i, o.c);
    });
    scene.add(motesMesh);

    // Dusk's last light low in the west, the moon rising in the east.
    scene.background = new THREE.Color(0x141c3c);
    scene.fog = new THREE.Fog(0x3a3050, 34, 120);
    const sunDir = new THREE.Vector3(-1, 0.03, -0.35).normalize();
    const moonDir = new THREE.Vector3(0.62, 0.21, -1).normalize();
    const sky = skyDome({ zenith: 0x0e1430, horizon: 0x3a3050, glow: 0xd0582c, sun: sunDir, moon: moonDir, moonSize: 0.022, stars: 1.2, pixel: 0.0035 });
    sky.position.set(px, 0, pz);
    scene.add(sky);
    scene.add(new THREE.HemisphereLight(0x4a5088, 0x20160e, 0.55));
    const sun = new THREE.DirectionalLight(0xff6a30, 1.4);
    sun.position.set(px + sunDir.x * 80, ground(0, 0) + 6, pz + sunDir.z * 80);
    sun.target.position.set(px + 6, ground(0, 0), pz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 1, far: 200 });
    scene.add(sun, sun.target);
    // Moonlight on the faces of the dark (from the east and a little in front,
    // where a moon would light the picture best, not where the drawn moon is).
    const moon = new THREE.DirectionalLight(0x8fa8ff, 1.6);
    moon.position.set(px + 50, ground(0, 0) + 40, pz + 25);
    moon.target.position.set(px + 8, ground(0, 0), pz);
    moon.castShadow = true;
    moon.shadow.mapSize.set(4096, 4096);
    moon.shadow.bias = -0.0006;
    Object.assign(moon.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
    scene.add(moon, moon.target);

    const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 38), 16 / 9, 0.3, 1200);
    if (params.get('view') === 'top') {
      camera.position.set(px + 6, ground(0, 0) + 70, pz + 1);
      camera.lookAt(px + 6, ground(0, 0), pz);
    } else {
      const c = (params.get('cam') ?? '7.2,3.4,15.5').split(',').map(Number);
      const l = (params.get('look') ?? '9.8,1.5,-3').split(',').map(Number);
      camera.position.copy(at(c[0]!, c[1]!, c[2]!));
      camera.lookAt(at(l[0]!, l[1]!, l[2]!));
    }
    return {
      scene,
      camera,
      finish: {
        grade: { ...NEUTRAL_GRADE, exposure: 1.35, saturation: 0.95, shadowTint: [0.42, 0.48, 0.62], highlightTint: [0.62, 0.52, 0.4], toning: 0.35, vignette: 0.45, grain: 0.012 },
        bloom: { strength: 0.7, radius: 0.55, threshold: 0.9 },
        ao: 0,
      },
      note: `Seed ${SEED}, pocket at ${pocket.x}, ${pocket.z} columns.`,
    };
  },
};

