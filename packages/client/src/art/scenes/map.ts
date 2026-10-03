// The lobby's picture: a generated world for four players seen from high
// above, the way the map lies before anyone has walked it. The basin with its
// four start pockets (a Big House and its light in each) sits in the middle,
// the Fringe's forests, rivers and ridges roll out round it, late sun lies
// across the land and the far edges are lost in haze.
//
// Out to the edge of the picture the land is drawn at full detail with its
// trees; past that, the coarser levels the game draws in the distance fill
// the haze.
import * as THREE from 'three';
import { CHUNK_M, COLUMN_M } from '../../world/mesher.ts';
import { NEUTRAL_GRADE } from '../post.ts';
import { figure } from '../pose.ts';
import { buildTerrain, worldFor } from '../terrain.ts';
import type { Stager } from './types.ts';

const SEED = 20261003;
const PLAYERS = 4;

export const mapScene: Stager = {
  models: ['main_base_l1'],
  async build({ library, params }) {
    const scene = new THREE.Scene();
    const seed = Number(params.get('seed') ?? SEED);
    const players = Number(params.get('players') ?? PLAYERS);
    const world = worldFor(seed, players);
    const R = Number(params.get('r') ?? 34);
    const full = Number(params.get('full') ?? 26);
    const cx = Number(params.get('cx') ?? 0);
    const cz = Number(params.get('cz') ?? 0);
    const t0 = performance.now();
    const terrain = buildTerrain(world, {
      cx0: cx - R,
      cx1: cx + R,
      cz0: cz - R,
      cz1: cz + R,
      lod: (x, z) => {
        const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
        return d <= full ? 1 : d <= full * 2 ? 4 : 8;
      },
      srgb: true,
      tint: 0xe8e8e0,
    });
    scene.add(terrain.group);
    const built = performance.now() - t0;

    // Each start pocket's Big House, so the camps show as specks of light.
    for (const p of world.gen.start.pockets) {
      const x = p.x * COLUMN_M;
      const z = p.z * COLUMN_M;
      const y = terrain.heightAt(x, z);
      scene.add(await figure(library, { body: 'main_base_l1' }, x, y, z, Math.PI));
      const l = new THREE.PointLight(0xffa050, 400, 60, 2);
      l.position.set(x, y + 6, z + 4);
      scene.add(l);
    }

    // Late afternoon: a low warm sun from the west, a cool sky, haze far out.
    const hazeColour = new THREE.Color(0x2c3448);
    scene.background = hazeColour;
    const dist = Number(params.get('dist') ?? 950);
    scene.fog = new THREE.Fog(hazeColour, dist * 0.8, dist * 1.75);
    scene.add(new THREE.HemisphereLight(0x8aa8d8, 0x3a2c1c, 0.75));
    const sun = new THREE.DirectionalLight(0xffb870, 3.8);
    const sunDir = new THREE.Vector3(-1, 0.4, 0.3).normalize();
    const centre = new THREE.Vector3(cx * CHUNK_M, 0, cz * CHUNK_M);
    sun.position.copy(centre).addScaledVector(sunDir, 1500);
    sun.target.position.copy(centre);
    sun.castShadow = true;
    sun.shadow.mapSize.set(8192, 8192);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    const span = (full + 4) * CHUNK_M;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 100, far: 3000 });
    scene.add(sun, sun.target);

    // The basin sits right of the middle, clear of the lobby's box on the left.
    const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 32), 16 / 9, 5, 6000);
    const pitch = THREE.MathUtils.degToRad(Number(params.get('pitch') ?? 52));
    const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 0));
    const look = centre.clone().add(new THREE.Vector3(Number(params.get('lx') ?? -160), 0, Number(params.get('lz') ?? 0)));
    camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(look);
    return {
      scene,
      camera,
      finish: {
        grade: { ...NEUTRAL_GRADE, exposure: 1.5, saturation: 0.86, shadowTint: [0.44, 0.48, 0.58], highlightTint: [0.6, 0.53, 0.44], toning: 0.3, vignette: 0.55, grain: 0.01 },
        bloom: { strength: 0.35, radius: 0.6, threshold: 1.2 },
        ao: 0,
      },
      note: `Seed ${seed}, ${players} players, ${(2 * R + 1) ** 2} chunks in ${Math.round(built)} ms; basin ${Math.round(world.layout.basinRadius * COLUMN_M)} m.`,
    };
  },
};

