// The generated land for the art stager: the same world generation, mesher,
// trees and scenery the mesh workers use (world/mesh.worker.ts), run on the
// page for a block of chunks, with the terrain shader's pixel noise but
// physically lit materials and no fog of war.
import * as THREE from 'three';
import { COLUMNS_PER_CHUNK as N, NO_WATER, World } from '@blockyrts/sim';
import { CHUNK_M, COLUMN_M, meshChunk, meshLowRes, meshWater, UNIT_M, type MeshArrays } from '../world/mesher.ts';
import { CUBE_STRIDE, propCubes, sceneryCubes } from '../world/props-gen.ts';

function geometryOf(a: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3, true));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * The terrain shader's per-block colour noise (world/fog-material.ts), without
 * the fog of war. With `srgb`, the colour bytes are read as sRGB, the way the
 * models' textures are, instead of going to the shader as they are; that
 * gives the deeper colours a dusk picture wants. `tint` multiplies them.
 */
function pixelNoise(mat: THREE.Material, srgb: boolean, tint: THREE.Color): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArtWorld;\nvarying vec3 vArtN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vArtWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vArtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  vArtN = objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vArtWorld;\nvarying vec3 vArtN;').replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    vec3 cell = floor((vArtWorld - vArtN * 0.02) / 0.1125);
    float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.9 + 0.18 * n;
    ${srgb ? 'diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2));' : ''}
    diffuseColor.rgb *= vec3(${tint.r.toFixed(4)}, ${tint.g.toFixed(4)}, ${tint.b.toFixed(4)});
  }`,
    );
  };
}

export interface TerrainOptions {
  /** Chunk range, inclusive. */
  cx0: number;
  cx1: number;
  cz0: number;
  cz1: number;
  /** Sample step per chunk (1 full detail with trees and scenery, 2, 4, 8 coarser). */
  lod?: (cx: number, cz: number) => number;
  /** Leave props out of these columns (global column -> true), where the stage is set. */
  clear?: (gx: number, gz: number) => boolean;
  /** Draw grass tufts and pebbles. */
  scenery?: boolean;
  roughness?: number;
  /** Read the colour bytes as sRGB (deeper colours) instead of as they are. */
  srgb?: boolean;
  /** Multiplies the land, tree and scenery colours. */
  tint?: THREE.ColorRepresentation;
}

export interface Terrain {
  group: THREE.Group;
  world: World;
  /** Ground height in metres at a point (full-detail columns), or 0 off the generated area. */
  heightAt(x: number, z: number): number;
}

export function buildTerrain(world: World, opts: TerrainOptions): Terrain {
  const group = new THREE.Group();
  const land = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.95, metalness: 0 });
  const srgb = opts.srgb ?? false;
  const tint = new THREE.Color(opts.tint ?? 0xffffff);
  pixelNoise(land, srgb, tint);
  const water = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.78, depthWrite: false });
  if (opts.srgb) {
    water.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = pow(diffuseColor.rgb, vec3(2.2));');
    };
  }
  const cubeMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  pixelNoise(cubeMat, srgb, tint);
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  for (let cz = opts.cz0; cz <= opts.cz1; cz++) {
    for (let cx = opts.cx0; cx <= opts.cx1; cx++) {
      const lod = opts.lod?.(cx, cz) ?? 1;
      const chunk = new THREE.Group();
      chunk.position.set(cx * CHUNK_M, 0, cz * CHUNK_M);
      if (lod > 1) {
        const lr = world.gen.lowRes(cx, cz, lod);
        const m = meshLowRes(lr);
        const g = new THREE.Mesh(geometryOf(m.land), land);
        g.receiveShadow = true;
        chunk.add(g);
        if (m.water) chunk.add(new THREE.Mesh(geometryOf(m.water), water));
        group.add(chunk);
        continue;
      }
      const centre = world.columns(cx, cz);
      const h = { centre, west: world.columns(cx - 1, cz), east: world.columns(cx + 1, cz), north: world.columns(cx, cz - 1), south: world.columns(cx, cz + 1) };
      const g = new THREE.Mesh(geometryOf(meshChunk(h)), land);
      g.receiveShadow = true;
      g.castShadow = true;
      chunk.add(g);
      const wm = meshWater(h);
      if (wm) {
        const w = new THREE.Mesh(geometryOf(wm), water);
        w.receiveShadow = true;
        w.renderOrder = 1;
        chunk.add(w);
      }
      const cubes: number[] = [];
      const taken = new Set<number>();
      for (const p of world.props(cx, cz, 0)) {
        const gx = cx * N + p.lx;
        const gz = cz * N + p.lz;
        if (opts.clear?.(gx, gz)) continue;
        propCubes(p, cubes);
        taken.add(p.lz * N + p.lx);
      }
      if (opts.scenery !== false) {
        for (let i = 0; i < N * N; i++) {
          if (taken.has(i) || centre.water[i] !== NO_WATER) continue;
          const lx = i % N;
          const lz = (i - lx) / N;
          if (opts.clear?.(cx * N + lx, cz * N + lz)) continue;
          sceneryCubes(world.seed, cx * N + lx, cz * N + lz, lx, lz, centre.top(i), centre.topMaterial(i), cubes);
        }
      }
      const n = cubes.length / CUBE_STRIDE;
      if (n > 0) {
        const mesh = new THREE.InstancedMesh(cubeGeo, cubeMat, n);
        const m = new THREE.Matrix4();
        const c = new THREE.Color();
        for (let k = 0; k < n; k++) {
          const o = k * CUBE_STRIDE;
          m.makeScale(cubes[o + 3]!, cubes[o + 4]!, cubes[o + 5]!).setPosition(cubes[o]!, cubes[o + 1]!, cubes[o + 2]!);
          mesh.setMatrixAt(k, m);
          const rgb = cubes[o + 6]!;
          // As the game does: the colour's bytes go to the shader as they are.
          c.setRGB(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, THREE.LinearSRGBColorSpace);
          mesh.setColorAt(k, c);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        chunk.add(mesh);
      }
      group.add(chunk);
    }
  }
  const heightAt = (x: number, z: number): number => {
    const gx = Math.floor(x / COLUMN_M);
    const gz = Math.floor(z / COLUMN_M);
    const cx = Math.floor(gx / N);
    const cz = Math.floor(gz / N);
    const c = world.columns(cx, cz);
    return c.top((gz - cz * N) * N + (gx - cx * N)) * UNIT_M;
  };
  return { group, world, heightAt };
}

/** A new world for the seed (the land a game on that seed starts with). */
export function worldFor(seed: number, players = 1): World {
  return new World(seed >>> 0, players);
}
