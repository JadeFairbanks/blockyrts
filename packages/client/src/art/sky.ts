// A sky for the art stager's pictures: a dome shaded from the horizon to the
// zenith, a glow where the sun has just gone down, square pixel stars and a
// square-pixelled moon, so the sky keeps the game's blocky look.
import * as THREE from 'three';

export interface SkyOptions {
  zenith: THREE.ColorRepresentation;
  /** The horizon all the way round. */
  horizon: THREE.ColorRepresentation;
  /** The afterglow on the horizon under the sun. */
  glow: THREE.ColorRepresentation;
  /** Direction to the sun (just below the horizon). */
  sun: THREE.Vector3;
  /** Direction to the moon, and its angular radius in radians (0 = none). */
  moon?: THREE.Vector3;
  moonSize?: number;
  /** Star brightness (0 = none). */
  stars?: number;
  /** Angular size of one sky pixel, radians. */
  pixel?: number;
  radius?: number;
}

export function skyDome(o: SkyOptions): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(o.zenith) },
      horizon: { value: new THREE.Color(o.horizon) },
      glow: { value: new THREE.Color(o.glow) },
      sunDir: { value: o.sun.clone().normalize() },
      moonDir: { value: (o.moon ?? new THREE.Vector3(0, -1, 0)).clone().normalize() },
      moonSize: { value: o.moon ? (o.moonSize ?? 0.05) : 0 },
      stars: { value: o.stars ?? 0 },
      pixel: { value: o.pixel ?? 0.004 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, glow, sunDir, moonDir;
      uniform float moonSize, stars, pixel;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horizon, zenith, pow(up, 0.55));
        // Afterglow: strongest on the horizon under the sun, fading up and round.
        float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
        float g = pow(toward, 3.0) * exp(-up * 7.0) + pow(toward, 12.0) * exp(-up * 22.0) * 0.8;
        c = mix(c, glow, clamp(g, 0.0, 1.0));
        // Pixel stars, more of them high and away from the glow.
        vec3 cell = floor(d / pixel);
        float s = hash(cell);
        float starry = smoothstep(0.12, 0.5, up) * (1.0 - clamp(g * 2.0, 0.0, 1.0));
        if (s > 0.9965) c += vec3(0.75, 0.8, 1.0) * stars * starry * (0.4 + 0.6 * hash(cell + 7.0));
        // The moon: a disc of square pixels with a darker sea, and a halo.
        if (moonSize > 0.0) {
          vec3 m = normalize(moonDir);
          vec3 right = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
          vec3 top = cross(right, m);
          vec2 q = vec2(dot(d, right), dot(d, top)) / (moonSize / 7.0);
          vec2 qp = floor(q) + 0.5;
          float r = length(qp) / 7.0;
          float facing = dot(d, m);
          if (facing > 0.0 && r < 1.0) {
            float sea = step(0.7, hash(vec3(floor(qp * 0.5), 3.0))) * 0.2;
            vec3 moonC = vec3(1.0, 0.96, 0.86) * (1.0 - sea) * (0.92 + 0.08 * hash(vec3(qp, 1.0)));
            c = moonC * 0.95;
          } else if (facing > 0.0) {
            float halo = exp(-(length(q) / 7.0 - 1.0) * 2.2);
            c += vec3(0.55, 0.6, 0.8) * 0.12 * halo;
          }
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 900, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
