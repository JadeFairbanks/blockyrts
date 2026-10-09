// Jade's Patch 5 (UI-5): what the cursor is over, and what a drag box would
// pick, gets a white line round its model's silhouette in place of the white
// box, drawn as the hidden units' outlines are (hidden-outlines.ts): the
// silhouettes into a mask, then one screen pass that draws a line round the
// mask's edge, kept to their corner of the screen. Units and catalogue
// buildings draw their hovered instances with the mark material; code-built
// buildings, loot icons and the props' cubes draw in plain white.
import * as THREE from 'three';
import { MarkMode, setMarkMode, type InstancedModel } from '../models/index.ts';
import { grow, HALO_PX, OUTLINE_FRAGMENT, QUAD_VERTEX, screenBox, type OwnDraw } from './hidden-outlines.ts';

/** The hover line's width, screen (CSS) pixels (s). */
export const HOVER_LINE_PX = 2;

/** What the hover outline draws this frame. */
export interface HoverParts {
  /** The unit models' group and its pass switch (units-view.ts), when a unit is hovered. */
  units: { group: THREE.Object3D; pass(mode: number | null): void } | null;
  /** Catalogue models with hovered instances. */
  models: readonly InstancedModel[];
  /** Whole meshes: code-built buildings. */
  meshes: readonly THREE.Mesh[];
  /** Loot icons. */
  sprites: readonly THREE.Sprite[];
  /** A prop's cubes in its chunk's cube mesh. */
  cubes: ReadonlyArray<{ mesh: THREE.InstancedMesh; first: number; count: number }>;
  /** Where they stand, for the corner of the screen the pass is kept to. */
  boxes: readonly OwnDraw[];
}

const CUBE_VERTEX = /* glsl */ `
uniform float first;
uniform float count;
void main() {
  float i = float(gl_InstanceID);
  if (i < first || i >= first + count) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const WHITE_FRAGMENT = /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0);
}
`;

export class HoverOutline {
  private readonly mask = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  private readonly quad: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private readonly cubeMat = new THREE.ShaderMaterial({ uniforms: { first: { value: 0 }, count: { value: 0 } }, vertexShader: CUBE_VERTEX, fragmentShader: WHITE_FRAGMENT });
  private readonly spriteMats = new Map<THREE.Texture | null, THREE.SpriteMaterial>();
  private readonly size = new THREE.Vector2();
  private readonly savedClear = new THREE.Color();
  private readonly savedScissor = new THREE.Vector4();

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.mask.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        line: { value: HOVER_LINE_PX },
        halo: { value: HALO_PX },
        colour: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: OUTLINE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(g, mat);
    this.quad.frustumCulled = false;
  }

  /** After the scene is drawn to the screen: the silhouettes of what is hovered into the mask, then the white line round them. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, parts: HoverParts): void {
    if (!parts.units && parts.models.length === 0 && parts.meshes.length === 0 && parts.sprites.length === 0 && parts.cubes.length === 0) return;
    renderer.getDrawingBufferSize(this.size);
    const W = this.size.x;
    const H = this.size.y;
    const box = screenBox(parts.boxes, camera, W, H, false, camera.near);
    if (!box) return;
    const pr = renderer.getPixelRatio();
    const line = HOVER_LINE_PX * pr;
    const reach = Math.ceil(line + HALO_PX * pr) + 2;
    const cleared = grow(box, reach * 2, W, H);
    const drawn = grow(box, reach, W, H);
    const mask = this.mask;
    if (mask.width !== W || mask.height !== H) mask.setSize(W, H);
    const autoClear = renderer.autoClear;
    const target = renderer.getRenderTarget();
    renderer.getClearColor(this.savedClear);
    const clearAlpha = renderer.getClearAlpha();
    const scissorTest = renderer.getScissorTest();
    renderer.getScissor(this.savedScissor);
    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      mask.viewport.set(0, 0, W, H);
      mask.scissor.set(cleared.x, H - cleared.y - cleared.h, cleared.w, cleared.h);
      mask.scissorTest = true;
      renderer.setRenderTarget(mask);
      renderer.clear(true, false, false);
      setMarkMode(MarkMode.Hover);
      if (parts.units) {
        parts.units.pass(MarkMode.Hover);
        try {
          renderer.render(parts.units.group, camera);
        } finally {
          parts.units.pass(null);
        }
      }
      for (const m of parts.models) {
        m.useMarkMaterial(true);
        try {
          renderer.render(m.object, camera);
        } finally {
          m.useMarkMaterial(false);
        }
      }
      for (const mesh of parts.meshes) this.drawWith(renderer, camera, mesh, this.white);
      for (const s of parts.sprites) this.drawWith(renderer, camera, s, this.spriteMat(s.material.map));
      for (const c of parts.cubes) {
        const u = this.cubeMat.uniforms;
        u.first!.value = c.first;
        u.count!.value = c.count;
        this.drawWith(renderer, camera, c.mesh, this.cubeMat);
      }
      renderer.setRenderTarget(target);
      const u = this.quad.material.uniforms;
      (u.texel!.value as THREE.Vector2).set(1 / W, 1 / H);
      u.line!.value = line;
      u.halo!.value = HALO_PX * pr;
      renderer.setScissorTest(true);
      renderer.setScissor(drawn.x / pr, (H - drawn.y - drawn.h) / pr, drawn.w / pr, drawn.h / pr);
      renderer.render(this.quad, this.quadCam);
    } finally {
      renderer.setScissor(this.savedScissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(this.savedClear, clearAlpha);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }

  /** Draws one object into the mask with another material, then gives it its own back. */
  private drawWith(renderer: THREE.WebGLRenderer, camera: THREE.Camera, o: THREE.Mesh | THREE.Sprite, mat: THREE.Material): void {
    const own = o.material;
    o.material = mat;
    try {
      renderer.render(o, camera);
    } finally {
      o.material = own;
    }
  }

  /** A loot icon's shape in white: its picture's see-through parts left out. */
  private spriteMat(map: THREE.Texture | null): THREE.SpriteMaterial {
    let m = this.spriteMats.get(map);
    if (!m) {
      m = new THREE.SpriteMaterial({ map, alphaTest: 0.5, fog: false });
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'gl_FragColor = vec4(1.0);');
      };
      m.customProgramCacheKey = () => 'hover-white';
      this.spriteMats.set(map, m);
    }
    return m;
  }

  dispose(): void {
    this.mask.dispose();
    this.white.dispose();
    this.cubeMat.dispose();
    for (const m of this.spriteMats.values()) m.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
