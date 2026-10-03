// The art stager's finishing passes: the staged scene rendered with ambient
// occlusion, bloom round every flame, then a grade (lift, gain, split
// toning, vignette and a little grain) and the output transform. Used only
// by the art stager page (art.html), never by the game.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export interface Grade {
  /** Added to the shadows, linear RGB. */
  lift: [number, number, number];
  /** Multiplies the whole image, linear RGB. */
  gain: [number, number, number];
  /** Colour pushed into the darks and into the lights (split toning), and how much. */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  toning: number;
  /** 0 = none; 1 = corners nearly black. */
  vignette: number;
  /** Film grain strength (0 to about 0.05). */
  grain: number;
  /** Saturation multiplier. */
  saturation: number;
  /** Exposure before the tone map. */
  exposure: number;
}

export interface Finish {
  grade: Grade;
  bloom: { strength: number; radius: number; threshold: number } | null;
  /** Ambient occlusion radius in metres (0 = off). */
  ao: number;
}

export const NEUTRAL_GRADE: Grade = {
  lift: [0, 0, 0],
  gain: [1, 1, 1],
  shadowTint: [0.5, 0.5, 0.5],
  highlightTint: [0.5, 0.5, 0.5],
  toning: 0,
  vignette: 0,
  grain: 0,
  saturation: 1,
  exposure: 1,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    lift: { value: new THREE.Vector3() },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    shadowTint: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    highlightTint: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    toning: { value: 0 },
    vignette: { value: 0 },
    grain: { value: 0 },
    saturation: { value: 1 },
    exposure: { value: 1 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 lift, gain, shadowTint, highlightTint;
    uniform float toning, vignette, grain, saturation, exposure, aspect;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * exposure;
      c = c * gain + lift * (1.0 - clamp(c, 0.0, 1.0));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      float t = smoothstep(0.0, 0.6, l);
      vec3 tone = mix(shadowTint, highlightTint, t) * 2.0;
      c = mix(c, c * tone, toning);
      vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
      float v = 1.0 - vignette * smoothstep(0.35, 1.05, length(d) * 1.25);
      c *= v;
      c += (hash(vUv * 1024.0) - 0.5) * grain;
      gl_FragColor = vec4(max(c, 0.0), src.a);
    }`,
};

/** The passes for one picture at one size. */
export class Finisher {
  readonly composer: EffectComposer;
  private readonly gradePass: ShaderPass;
  private readonly ao: GTAOPass | null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, width: number, height: number, finish: Finish) {
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(scene, camera));
    if (finish.ao > 0) {
      this.ao = new GTAOPass(scene, camera, width, height);
      this.ao.updateGtaoMaterial({ radius: finish.ao, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 16 });
      this.ao.blendIntensity = 0.85;
      this.composer.addPass(this.ao);
    } else this.ao = null;
    if (finish.bloom) {
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), finish.bloom.strength, finish.bloom.radius, finish.bloom.threshold));
    }
    this.gradePass = new ShaderPass(GradeShader);
    const u = this.gradePass.uniforms as typeof GradeShader.uniforms;
    const g = finish.grade;
    u.lift.value.set(...g.lift);
    u.gain.value.set(...g.gain);
    u.shadowTint.value.set(...g.shadowTint);
    u.highlightTint.value.set(...g.highlightTint);
    u.toning.value = g.toning;
    u.vignette.value = g.vignette;
    u.grain.value = g.grain;
    u.saturation.value = g.saturation;
    u.exposure.value = g.exposure;
    u.aspect.value = width / height;
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.ao?.dispose();
    this.composer.dispose();
  }
}
