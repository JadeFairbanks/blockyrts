// Shaders: the pixel texture and the fog of war (black unexplored, grey
// explored and unseen), patched into three.js Lambert materials. Shared by the
// land, the props and the buildings.
import type * as THREE from 'three';

export interface FowUniforms {
  fowTex: { value: THREE.DataTexture };
  fowArea: { value: THREE.Vector3 };
  fowAll: { value: number };
}

export function patchMaterial(mat: THREE.Material, fow: FowUniforms, pixelNoise: boolean): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fow);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFowWorld;\nvarying vec3 vFowN;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vFowWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vFowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  vFowN = objectNormal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D fowTex;
uniform vec3 fowArea;
uniform float fowAll;
varying vec3 vFowWorld;
varying vec3 vFowN;`,
      )
      .replace(
        '#include <color_fragment>',
        pixelNoise
          ? `#include <color_fragment>
  {
    vec3 cell = floor((vFowWorld - vFowN * 0.02) / 0.1125);
    float n = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= 0.9 + 0.18 * n;
  }`
          : '#include <color_fragment>',
      )
      .replace(
        '#include <dithering_fragment>',
        `{
    vec2 fuv = (vFowWorld.xz - fowArea.xy) / fowArea.z;
    float f = (fuv.x < 0.0 || fuv.y < 0.0 || fuv.x > 1.0 || fuv.y > 1.0) ? 0.0 : texture2D(fowTex, fuv).r;
    f = max(f, fowAll);
    float explored = smoothstep(0.08, 0.4, f);
    float seen = smoothstep(0.6, 0.9, f);
    vec3 grey = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11))) * 0.55;
    gl_FragColor.rgb = mix(vec3(0.0), mix(grey, gl_FragColor.rgb, seen), explored);
  }
#include <dithering_fragment>`,
      );
  };
}
