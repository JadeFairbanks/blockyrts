// One draw call per model type for any number of instances (the old blueprint,
// technical decision 7): each vertex carries the index of the bone it moves
// with (rigid cubes, no skin weights), and each instance's bone matrices sit in
// a float DataTexture, four RGBA texels (the four columns) per matrix, that the
// vertex shader reads by gl_InstanceID and bone index. The matrices already
// include the instance's position and heading. A second material draws the
// same posed models flat, in ids or white, for the hidden-unit outlines
// (world/hidden-outlines.ts).
import * as THREE from 'three';
import { BAKED_STRIDE, type BakedClip, type ModelData } from './library.ts';

/** Texels per row of the bone texture (a multiple of 4, so a matrix never straddles rows). */
const TEXTURE_WIDTH = 2048;
/** Most equipment parts a model may have (the body takes visibility slot 0). */
export const MAX_PARTS = 63;

/** The placeholder team blue, sRGB 8-bit. */
export const TEAM_KEY_RGB: readonly [number, number, number] = [52, 96, 178];
/** How far a texel's red / blue and green / blue ratios (sRGB) may stray from the key's. */
export const TEAM_KEY_CHROMA_TOLERANCE = 0.07;
/** Darkest blue channel (sRGB 8-bit) that still counts as team colour. */
export const TEAM_KEY_MIN_BLUE = 96;

const SHADER_KEY = 'blockyrts-instanced-model-1';
const IDENTITY = new THREE.Matrix4();
const PLACE = new THREE.Matrix4();
const SCALE = new THREE.Vector3();
/** Floats per instance in inst: x, y, z, heading, clip time, scale. */
const INST_STRIDE = 6;

/**
 * What the mark material draws (Jade's Patch 3 outlines): Ids draws every
 * instance, the local player's units in their mark's id (rgb, alpha 0) and
 * the rest opaque black, as things that hide them; Own draws only the local
 * player's units, in their ids; Outlined draws only those marked for an
 * outline, in white.
 */
export const MarkMode = { Ids: 0, Own: 1, Outlined: 2 } as const;
/** Shared by every model's mark material, so one call sets the mode for a pass. */
const MARK_MODE: THREE.IUniform<number> = { value: MarkMode.Ids };
export function setMarkMode(mode: number): void {
  MARK_MODE.value = mode;
}

/** A patch for the main material's shader, run after the model's own (the fog of war, world/fog-material.ts). */
export interface ModelShaderPatch {
  /** Names the patched program apart from the unpatched one. */
  key: string;
  apply(shader: THREE.WebGLProgramParametersWithUniforms): void;
}

const VERTEX_PARS = /* glsl */ `
uniform highp sampler2D boneTexture_bf;
uniform int boneCount_bf;
uniform float partVisible_bf[${MAX_PARTS + 1}];
attribute float bone;
attribute float part;
mat4 boneMatrix_bf() {
  int w = textureSize(boneTexture_bf, 0).x;
  int base = (gl_InstanceID * boneCount_bf + int(bone + 0.5)) * 4;
  ivec2 p = ivec2(base % w, base / w);
  return mat4(
    texelFetch(boneTexture_bf, p, 0),
    texelFetch(boneTexture_bf, p + ivec2(1, 0), 0),
    texelFetch(boneTexture_bf, p + ivec2(2, 0), 0),
    texelFetch(boneTexture_bf, p + ivec2(3, 0), 0));
}
`;

// Hidden equipment parts collapse to one point, so their triangles draw nothing.
const VERTEX_TRANSFORM = /* glsl */ `
#include <begin_vertex>
transformed = partVisible_bf[int(part + 0.5)] > 0.5 ? (bone_bf * vec4(transformed, 1.0)).xyz : vec3(0.0);
`;

const FRAGMENT_PARS = /* glsl */ `#include <common>
varying vec4 team_bf;
uniform vec2 teamKeyChroma_bf;
uniform float teamKeyLuma_bf;
vec3 linearToSrgb_bf(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

const FRAGMENT_TEAM = /* glsl */ `#include <map_fragment>
#ifdef USE_MAP
if (team_bf.a > 0.5) {
  vec3 srgb_bf = linearToSrgb_bf(sampledDiffuseColor.rgb);
  vec2 chroma_bf = srgb_bf.rg / max(srgb_bf.b, 1e-4);
  if (srgb_bf.b >= srgb_bf.r && srgb_bf.b >= srgb_bf.g && srgb_bf.b >= ${(TEAM_KEY_MIN_BLUE - 0.5).toFixed(1)} / 255.0
      && all(lessThanEqual(abs(chroma_bf - teamKeyChroma_bf), vec2(${TEAM_KEY_CHROMA_TOLERANCE})))) {
    float brightness_bf = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / teamKeyLuma_bf;
    diffuseColor.rgb = diffuse * team_bf.rgb * brightness_bf;
  }
}
#endif`;

// The mark material: the posed model, flat. Instances the mode leaves out land past the far plane and draw nothing.
const MARK_VERTEX = /* glsl */ `
${VERTEX_PARS}
attribute float mark;
uniform float markMode_bf;
varying vec2 vUv_bf;
flat varying vec4 vMark_bf;
void main() {
  float own = abs(mark) > 0.5 ? 1.0 : 0.0;
  float keep = markMode_bf < 0.5 ? 1.0 : markMode_bf < 1.5 ? own : step(mark, -0.5);
  if (keep < 0.5 || partVisible_bf[int(part + 0.5)] < 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  mat4 bone_bf = boneMatrix_bf();
  gl_Position = projectionMatrix * modelViewMatrix * (bone_bf * vec4(position, 1.0));
  vUv_bf = uv;
  float id = abs(mark);
  vMark_bf = own > 0.5 ? vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 0.0) / 255.0 : vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const MARK_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float markMode_bf;
varying vec2 vUv_bf;
flat varying vec4 vMark_bf;
void main() {
  if (texture2D(map, vUv_bf).a < 0.5) discard;
  gl_FragColor = markMode_bf > 1.5 ? vec4(1.0) : vMark_bf;
}
`;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

interface SharedUniforms {
  boneTexture_bf: THREE.IUniform<THREE.DataTexture>;
  boneCount_bf: THREE.IUniform<number>;
  partVisible_bf: THREE.IUniform<number[]>;
}

export class InstancedModel {
  /** Add this to the scene. */
  readonly object: THREE.Mesh;
  /** Rest-pose bounds of one instance's body, metres, before position and heading. */
  readonly boundingBox: THREE.Box3;
  readonly model: ModelData;
  readonly maxInstances: number;

  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly boneTexture: THREE.DataTexture;
  private readonly boneData: Float32Array;
  private readonly team: THREE.InstancedBufferAttribute;
  /** Per instance: 0, or the id of a local player's unit (negative when it is to be outlined). */
  private readonly mark: THREE.InstancedBufferAttribute;
  private markMat: THREE.ShaderMaterial | null = null;
  private readonly uniforms: SharedUniforms;
  private readonly clipList: BakedClip[];
  private readonly clipIndex: ReadonlyMap<string, number>;
  private readonly restFrame: Float32Array;
  private readonly inst: Float32Array; // x, y, z, heading, clip time, scale per instance
  private readonly instClip: Int32Array; // clip index, or -1 for the rest pose
  private count = 0;

  constructor(model: ModelData, maxInstances: number, patch?: ModelShaderPatch) {
    if (model.partNames.length > MAX_PARTS) throw new Error(`${model.id} has ${model.partNames.length} parts; at most ${MAX_PARTS} are supported`);
    this.model = model;
    this.maxInstances = Math.max(1, Math.floor(maxInstances));
    this.boundingBox = model.boundingBox.clone();
    this.clipList = [...model.clips.values()];
    this.clipIndex = new Map(this.clipList.map((c, i) => [c.name, i]));
    this.restFrame = new Float32Array(model.boneCount * BAKED_STRIDE);
    for (let b = 0; b < model.boneCount; b++) {
      const o = b * BAKED_STRIDE;
      this.restFrame[o] = 1;
      this.restFrame[o + 4] = 1;
      this.restFrame[o + 8] = 1;
    }
    this.inst = new Float32Array(this.maxInstances * INST_STRIDE);
    this.instClip = new Int32Array(this.maxInstances).fill(-1);

    const texels = this.maxInstances * model.boneCount * 4;
    const height = Math.max(1, Math.ceil(texels / TEXTURE_WIDTH));
    this.boneData = new Float32Array(TEXTURE_WIDTH * height * 4);
    this.boneTexture = new THREE.DataTexture(this.boneData, TEXTURE_WIDTH, height, THREE.RGBAFormat, THREE.FloatType);
    this.boneTexture.magFilter = THREE.NearestFilter;
    this.boneTexture.minFilter = THREE.NearestFilter;
    this.boneTexture.generateMipmaps = false;
    this.boneTexture.needsUpdate = true;

    this.geometry = new THREE.InstancedBufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'bone', 'part']) {
      const a = model.geometry.getAttribute(name);
      if (a) this.geometry.setAttribute(name, a);
    }
    this.geometry.setIndex(model.geometry.index);
    // rgb: team colour (linear), a: 1 to recolour the team blue, 0 to keep it.
    this.team = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 4), 4);
    this.team.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('team', this.team);
    this.mark = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances), 1);
    this.mark.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('mark', this.mark);
    this.geometry.instanceCount = 0;

    const partVisible = new Array<number>(MAX_PARTS + 1).fill(0);
    partVisible[0] = 1; // the body; equipment parts start hidden
    this.uniforms = {
      boneTexture_bf: { value: this.boneTexture },
      boneCount_bf: { value: model.boneCount },
      partVisible_bf: { value: partVisible },
    };

    // Team colour is a colour key in the fragment shader rather than a build-time
    // mask. The placeholder blue (52, 96, 178) is painted with per-texel noise
    // and darker shading bands, so an exact +-3 per channel match catches only a
    // quarter of a belt's texels. Instead a texel is team colour when it has the
    // key's chromaticity at any brightness: in sRGB, blue is its largest channel,
    // its red / blue and green / blue ratios are within 0.07 of the key's
    // (0.292, 0.539), and blue is at least 96. Every blue belt texel of the three
    // base bodies matches, and nothing else in their textures does (the mage's
    // purple robe and light blue crystal stay as they are). The texel takes the
    // instance's team colour scaled by its brightness relative to the key, so the
    // painted shading survives. Nearest filtering keeps the texels exact.
    const key = TEAM_KEY_RGB.map((c) => srgbToLinear(c / 255));
    const keyLuma = 0.2126 * (key[0] ?? 0) + 0.7152 * (key[1] ?? 0) + 0.0722 * (key[2] ?? 0);
    const [kr, kg, kb] = TEAM_KEY_RGB;
    const uniforms = this.uniforms;

    // MeshLambertMaterial brings hemisphere and directional lighting, shadows and fog.
    this.material = new THREE.MeshLambertMaterial({ map: model.texture, alphaTest: 0.5 });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, {
        teamKeyChroma_bf: { value: new THREE.Vector2(kr / kb, kg / kb) },
        teamKeyLuma_bf: { value: keyLuma },
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}\nattribute vec4 team;\nvarying vec4 team_bf;`)
        .replace('void main() {', 'void main() {\n  mat4 bone_bf = boneMatrix_bf();\n  team_bf = team;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = mat3(bone_bf) * objectNormal;')
        .replace('#include <begin_vertex>', VERTEX_TRANSFORM);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', FRAGMENT_PARS)
        .replace('#include <map_fragment>', FRAGMENT_TEAM);
      patch?.apply(shader);
    };
    this.material.customProgramCacheKey = () => (patch ? `${SHADER_KEY}-${patch.key}` : SHADER_KEY);
    // A pass that draws the scene in one flat material (the outlines' occlusion pass) still poses these.
    this.material.allowOverride = false;

    // Shadows must see the animated pose too.
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.depthMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('void main() {', 'void main() {\n  mat4 bone_bf = boneMatrix_bf();')
        .replace('#include <begin_vertex>', VERTEX_TRANSFORM);
    };
    this.depthMaterial.customProgramCacheKey = () => `${SHADER_KEY}-depth`;

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.name = `${model.id} instances`;
    this.object.customDepthMaterial = this.depthMaterial;
    // Instances are placed by the bone texture, so the mesh's own bounds mean nothing.
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Multiplies the model's texture by a colour (0xrrggbb), for every instance: a stand-in model dressed as another building. */
  tint(colour: number): void {
    this.material.color.set(colour);
  }

  /** Lights the model by its own texture as well as the sun and the lights, this strongly (Patch 5: spells glow at night as by day); 0 for none. */
  glow(strength: number): void {
    this.material.emissive.set(strength > 0 ? 0xffffff : 0x000000);
    this.material.emissiveMap = strength > 0 ? this.model.texture : null;
    this.material.emissiveIntensity = strength;
    this.material.needsUpdate = true;
  }

  /** Clip names this model has. */
  get clipNames(): string[] {
    return this.clipList.map((c) => c.name);
  }

  /**
   * Sets instance i (0 <= i < maxInstances) for the next commit(). Position in
   * metres; heading in radians, 0 facing -Z (three.js rotation.y). An unknown
   * clip shows the rest pose. Looping clips wrap; the others hold their last
   * frame. teamColour null keeps the texture's placeholder blue. scale sizes
   * the instance about its feet (1 is the model's own size).
   */
  setInstance(i: number, x: number, y: number, z: number, headingRadians: number, clip: string, clipTimeSeconds: number, teamColour: THREE.Color | null, scale = 1): void {
    if (i < 0 || i >= this.maxInstances) throw new RangeError(`instance ${i} is outside 0..${this.maxInstances - 1}`);
    const o = i * INST_STRIDE;
    this.inst[o] = x;
    this.inst[o + 1] = y;
    this.inst[o + 2] = z;
    this.inst[o + 3] = headingRadians;
    this.inst[o + 4] = clipTimeSeconds;
    this.inst[o + 5] = scale;
    this.instClip[i] = this.clipIndex.get(clip) ?? -1;
    (this.mark.array as Float32Array)[i] = 0;
    const t = this.team.array as Float32Array;
    if (teamColour) {
      t[i * 4] = teamColour.r;
      t[i * 4 + 1] = teamColour.g;
      t[i * 4 + 2] = teamColour.b;
      t[i * 4 + 3] = 1;
    } else t[i * 4 + 3] = 0;
  }

  /**
   * Marks instance i, after its setInstance, as the local player's unit with
   * this id (1 to 2^24 - 1), outlined or not: the hidden-unit outlines find it
   * by the id.
   */
  setMark(i: number, id: number, outlined: boolean): void {
    if (i < 0 || i >= this.maxInstances) return;
    (this.mark.array as Float32Array)[i] = outlined ? -id : id;
  }

  /** The flat material that draws ids and outlines (see MarkMode), made on first use. */
  markMaterial(): THREE.ShaderMaterial {
    if (!this.markMat) {
      this.markMat = new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, map: { value: this.model.texture }, markMode_bf: MARK_MODE },
        vertexShader: MARK_VERTEX,
        fragmentShader: MARK_FRAGMENT,
        blending: THREE.NoBlending,
      });
      this.markMat.allowOverride = false;
    }
    return this.markMat;
  }

  /** Draws with the mark material (true) or the model's own (false) until called again. */
  useMarkMaterial(on: boolean): void {
    this.object.material = on ? this.markMaterial() : this.material;
  }

  /** Draws instances 0 .. n - 1. */
  setCount(n: number): void {
    this.count = Math.max(0, Math.min(this.maxInstances, Math.floor(n)));
    this.geometry.instanceCount = this.count;
    this.object.visible = this.count > 0;
  }

  get instanceCount(): number {
    return this.count;
  }

  /** Shows or hides an equipment part on every instance. Unknown names throw. */
  setPartVisible(partName: string, visible: boolean): void {
    const index = this.model.partNames.indexOf(partName);
    if (index < 0) throw new Error(`${this.model.id} has no part "${partName}" (parts: ${this.model.partNames.join(', ') || 'none'})`);
    this.uniforms.partVisible_bf.value[index + 1] = visible ? 1 : 0;
  }

  isPartVisible(partName: string): boolean {
    const index = this.model.partNames.indexOf(partName);
    return index >= 0 && this.uniforms.partVisible_bf.value[index + 1] === 1;
  }

  /** Evaluates the clips for every drawn instance and uploads the bone texture. Call once per frame. */
  commit(): void {
    const bones = this.model.boneCount;
    const out = this.boneData;
    for (let i = 0; i < this.count; i++) {
      const o = i * INST_STRIDE;
      const x = this.inst[o] ?? 0;
      const y = this.inst[o + 1] ?? 0;
      const z = this.inst[o + 2] ?? 0;
      const heading = this.inst[o + 3] ?? 0;
      const clip = this.clipList[this.instClip[i] ?? -1];
      let a: Float32Array = this.restFrame;
      let aOff = 0;
      let bOff = 0;
      let alpha = 0;
      if (clip) {
        let t = this.inst[o + 4] ?? 0;
        if (clip.loop && clip.length > 0) t = ((t % clip.length) + clip.length) % clip.length;
        else t = Math.min(Math.max(t, 0), clip.length);
        const f = clip.length > 0 ? (t / clip.length) * (clip.frames - 1) : 0;
        const f0 = Math.min(Math.floor(f), clip.frames - 1);
        const f1 = Math.min(f0 + 1, clip.frames - 1);
        alpha = f - f0;
        a = clip.data;
        aOff = f0 * bones * BAKED_STRIDE;
        bOff = f1 * bones * BAKED_STRIDE;
      }
      const k0 = this.inst[o + 5] ?? 1;
      const c = Math.cos(heading) * k0;
      const s = Math.sin(heading) * k0;
      for (let b = 0; b < bones; b++) {
        const pa = aOff + b * BAKED_STRIDE;
        const pb = bOff + b * BAKED_STRIDE;
        const dst = (i * bones + b) * 16;
        for (let col = 0; col < 4; col++) {
          const k = col * 3;
          const mx = (a[pa + k] ?? 0) + ((a[pb + k] ?? 0) - (a[pa + k] ?? 0)) * alpha;
          const my = (a[pa + k + 1] ?? 0) + ((a[pb + k + 1] ?? 0) - (a[pa + k + 1] ?? 0)) * alpha;
          const mz = (a[pa + k + 2] ?? 0) + ((a[pb + k + 2] ?? 0) - (a[pa + k + 2] ?? 0)) * alpha;
          // Instance transform: scale, turn by the heading about +Y (three.js rotation.y), then move.
          const d = dst + col * 4;
          out[d] = c * mx + s * mz + (col === 3 ? x : 0);
          out[d + 1] = k0 * my + (col === 3 ? y : 0);
          out[d + 2] = -s * mx + c * mz + (col === 3 ? z : 0);
          out[d + 3] = col === 3 ? 1 : 0;
        }
      }
    }
    // Upload only the rows in use when that is a small part of the texture.
    const rows = Math.ceil((this.count * bones * 4) / TEXTURE_WIDTH);
    this.boneTexture.clearUpdateRanges();
    if (rows > 0 && rows * 2 < this.boneTexture.image.height) {
      for (let r = 0; r < rows; r++) this.boneTexture.addUpdateRange(r * TEXTURE_WIDTH * 4, TEXTURE_WIDTH * 4);
    }
    this.boneTexture.needsUpdate = true;
    this.team.clearUpdateRanges();
    this.team.addUpdateRange(0, this.count * 4);
    this.team.needsUpdate = true;
    this.mark.clearUpdateRanges();
    this.mark.addUpdateRange(0, this.count);
    this.mark.needsUpdate = true;
  }

  /**
   * The world matrix of bone `bone` of instance i as set for the next commit:
   * its animated pose, heading and position. Equipment that is not a part of
   * the body hangs from slot bones this way.
   */
  boneWorld(i: number, bone: number, out: THREE.Matrix4): THREE.Matrix4 {
    const bones = this.model.boneCount;
    const o = i * INST_STRIDE;
    const clip = this.clipList[this.instClip[i] ?? -1];
    let a: Float32Array = this.restFrame;
    let aOff = 0;
    let bOff = 0;
    let alpha = 0;
    if (clip) {
      let t = this.inst[o + 4] ?? 0;
      if (clip.loop && clip.length > 0) t = ((t % clip.length) + clip.length) % clip.length;
      else t = Math.min(Math.max(t, 0), clip.length);
      const f = clip.length > 0 ? (t / clip.length) * (clip.frames - 1) : 0;
      const f0 = Math.min(Math.floor(f), clip.frames - 1);
      const f1 = Math.min(f0 + 1, clip.frames - 1);
      alpha = f - f0;
      a = clip.data;
      aOff = f0 * bones * BAKED_STRIDE;
      bOff = f1 * bones * BAKED_STRIDE;
    }
    const pa = aOff + bone * BAKED_STRIDE;
    const pb = bOff + bone * BAKED_STRIDE;
    const m = (k: number): number => (a[pa + k] ?? 0) + ((a[pb + k] ?? 0) - (a[pa + k] ?? 0)) * alpha;
    out.set(m(0), m(3), m(6), m(9), m(1), m(4), m(7), m(10), m(2), m(5), m(8), m(11), 0, 0, 0, 1);
    out.multiply(this.model.restWorld[bone] ?? IDENTITY);
    const k0 = this.inst[o + 5] ?? 1;
    PLACE.makeRotationY(this.inst[o + 3] ?? 0).scale(SCALE.set(k0, k0, k0)).setPosition(this.inst[o] ?? 0, this.inst[o + 1] ?? 0, this.inst[o + 2] ?? 0);
    return out.premultiply(PLACE);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.markMat?.dispose();
    this.depthMaterial.dispose();
    this.boneTexture.dispose();
  }
}
