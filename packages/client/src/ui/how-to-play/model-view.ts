// How to Play's models, live (Jade's Patch 7): a page about a creature, a
// person, a lair or anything else the game draws shows the game's own
// catalogue model, playing its idle animation, the whole body in view, and
// turning round when it is dragged. Jade's words: "replace all images with
// the rendered models (you can still use 2d images of things that are
// already 2d images such as icons. Once code is in place for rendering the
// models then this should be all automatic and fast to do."
//
// Kept cheap (Jade's Patch 6 rule: "only load the 3D models for each of the
// pages in a really compute easy way"): one shared WebGL canvas (never on
// the page) draws each model in view into its own 2D canvas, about 30 times
// a second, with one InstancedModel per model however many pictures show
// it. A picture out of view is not drawn, and a model is loaded only when
// its picture first comes into view. A page's own picture moves all the
// time; a small one (a card, the sidebar) is drawn once and moves while the
// pointer is on it, so a page of cards stays as cheap as a page of icons. A
// model with no idle clip (a lair, a building) is drawn again only when it
// is turned. When the book closes, everything goes (closeModelViews).
//
// This is how the book gets a thing's picture: from its model or its kit
// icon, never from a picture made for the page (book.ts MODEL_PICTURE).
import * as THREE from 'three';
import { InstancedModel, type ModelData, type ModelLibrary } from '../../models/index.ts';
import { BAKED_STRIDE } from '../../models/library.ts';

/** The shared canvas's side, device pixels: the largest picture drawn (a bigger one is drawn at this and scaled). */
const STAGE = 1024;
const FOV = 24;
const ELEVATION = THREE.MathUtils.degToRad(18);
/** Faces the camera three quarters on (0 faces away, -Z). */
const HEADING = Math.PI * 0.8;
/** Room round the body, so an idle clip's reach stays in the picture. */
const MARGIN = 1.08;
const FRAME_MS = 1000 / 30;
/** A picture this wide (CSS pixels) or narrower moves only while the pointer is on it. */
const SMALL = 100;
/** Radians a drag turns the model for each CSS pixel. */
const TURN = 0.012;
/** A press that moves this far (CSS pixels) is a drag, not a click. */
const DRAG_PX = 4;

interface View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  id: string;
  /** The model, once loaded (null while loading). */
  data: ModelData | null;
  loading: boolean;
  heading: number;
  /** Seconds into the idle clip at the first frame, so pictures of one model do not move in step. */
  offset: number;
  inView: boolean;
  /** The pointer is on it (or on the card or link it is in). */
  hover: boolean;
  /** Drawn since its last change (a static model draws again only when this is false). */
  drawn: boolean;
  library: Promise<ModelLibrary | null>;
  /** Puts the thing's 2D picture in this one's place. */
  fail: () => void;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

let stage: Stage | null = null;
const instances = new Map<string, InstancedModel>();
const views = new Map<Element, View>();
let observer: IntersectionObserver | null = null;
let raf = 0;
let last = 0;

function stageOf(): Stage {
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE, STAGE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a28, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  stage = { renderer, scene, camera: new THREE.PerspectiveCamera(FOV, 1, 0.01, 2000) };
  return stage;
}

function observerOf(): IntersectionObserver {
  observer ??= new IntersectionObserver((seen) => {
    for (const s of seen) {
      const v = views.get(s.target);
      if (!v) continue;
      v.inView = s.isIntersecting;
      v.drawn = false;
      // A model is loaded the first time its picture comes into view.
      if (v.inView) load(v);
    }
    wake();
  });
  return observer;
}

function instanceOf(data: ModelData): InstancedModel {
  let m = instances.get(data.id);
  if (!m) {
    m = new InstancedModel(data, 1);
    instances.set(data.id, m);
  }
  return m;
}

const animated = (data: ModelData): boolean => data.clips.has('idle');

/** Where a model's whole body is, posed through its idle clip: the height of its middle, half its height, and how far round its upright axis it reaches. */
interface Frame {
  y: number;
  half: number;
  reach: number;
}
const frames = new Map<string, Frame>();

/**
 * The room a model takes at any turn: every point of its body (no hidden
 * gear) at a few moments of its idle clip, as an upright drum round its
 * axis, so it stays whole in the picture as it moves and as it is turned
 * (a bat's idle flutters well above where it rests).
 */
function frameOf(data: ModelData): Frame {
  let f = frames.get(data.id);
  if (f) return f;
  const pos = data.geometry.getAttribute('position');
  const bone = data.geometry.getAttribute('bone');
  const part = data.geometry.getAttribute('part');
  const clip = data.clips.get('idle');
  let minY = Infinity;
  let maxY = -Infinity;
  let reach = 0;
  const take = (x: number, y: number, z: number): void => {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    reach = Math.max(reach, x * x + z * z);
  };
  if (clip && pos && bone) {
    const m = clip.data;
    const bones = data.boneCount;
    const step = Math.max(1, Math.floor(clip.frames / 8));
    for (let k = 0; k < clip.frames; k += step) {
      for (let i = 0; i < pos.count; i++) {
        if (part && part.getX(i) > 0.5) continue;
        const o = (k * bones + Math.round(bone.getX(i))) * BAKED_STRIDE;
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        take(
          m[o]! * x + m[o + 3]! * y + m[o + 6]! * z + m[o + 9]!,
          m[o + 1]! * x + m[o + 4]! * y + m[o + 7]! * z + m[o + 10]!,
          m[o + 2]! * x + m[o + 5]! * y + m[o + 8]! * z + m[o + 11]!,
        );
      }
    }
  }
  if (!Number.isFinite(minY)) {
    const b = data.boundingBox;
    for (const x of [b.min.x, b.max.x]) {
      for (const z of [b.min.z, b.max.z]) {
        take(x, b.min.y, z);
        take(x, b.max.y, z);
      }
    }
  }
  const half = Math.max(0.025, (maxY - minY) / 2);
  f = { y: minY + half, half, reach: Math.max(0.025, Math.sqrt(reach)) };
  frames.set(data.id, f);
  return f;
}

/** Draws one picture: the model in the shared canvas's corner, then copied into the picture's own canvas. */
function draw(v: View, seconds: number): void {
  const data = v.data!;
  // Its box inside any frame (a model's picture has no padding).
  const css = { width: v.canvas.clientWidth, height: v.canvas.clientHeight };
  if (css.width < 1 || css.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = Math.min(1, STAGE / (css.width * dpr), STAGE / (css.height * dpr));
  const w = Math.max(1, Math.round(css.width * dpr * scale));
  const h = Math.max(1, Math.round(css.height * dpr * scale));
  if (v.canvas.width !== w || v.canvas.height !== h) {
    v.canvas.width = w;
    v.canvas.height = h;
  }
  const { renderer, scene, camera } = stageOf();
  const m = instanceOf(data);
  m.setInstance(0, 0, 0, 0, v.heading, animated(data) ? 'idle' : '', seconds + v.offset, null);
  m.setCount(1);
  m.commit();
  // The whole body in view from every side: its drum, seen from the nearest it comes, fits both angles of view.
  const frame = frameOf(data);
  const centre = new THREE.Vector3(0, frame.y, 0);
  const r = frame.reach * MARGIN;
  const tall = (frame.half * Math.cos(ELEVATION) + r * Math.sin(ELEVATION)) * MARGIN;
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const tanH = tanV * (w / h);
  const dist = r + Math.max(tall / tanV, r / tanH);
  const depth = r + frame.half;
  camera.aspect = w / h;
  camera.position.set(centre.x, centre.y + Math.sin(ELEVATION) * dist, centre.z + Math.cos(ELEVATION) * dist);
  camera.lookAt(centre);
  camera.near = Math.max(0.01, dist - depth * 2);
  camera.far = dist + depth * 2;
  camera.updateProjectionMatrix();
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.clear();
  scene.add(m.object);
  renderer.render(scene, camera);
  scene.remove(m.object);
  v.ctx.clearRect(0, 0, w, h);
  // The viewport sits at the bottom of the shared canvas; a 2D copy counts from its top.
  v.ctx.drawImage(renderer.domElement, 0, STAGE - h, w, h, 0, 0, w, h);
  v.canvas.style.visibility = '';
  v.drawn = true;
}

function tick(now: number): void {
  raf = 0;
  if (views.size === 0) return;
  if (now - last >= FRAME_MS) {
    last = now;
    const seconds = now / 1000;
    for (const v of views.values()) {
      if (!v.canvas.isConnected) {
        drop(v);
        continue;
      }
      if (!v.inView || !v.data) continue;
      const moving = animated(v.data) && (v.hover || v.canvas.clientWidth > SMALL);
      if (v.drawn && !moving) continue;
      try {
        draw(v, seconds);
      } catch (e) {
        // No WebGL here: the 2D pictures stay.
        console.warn(`How to Play: model ${v.id} not drawn`, e);
        drop(v);
        v.fail();
      }
    }
  }
  wake();
}

function wake(): void {
  if (!raf && views.size > 0) raf = requestAnimationFrame(tick);
}

function drop(v: View): void {
  views.delete(v.canvas);
  observer?.unobserve(v.canvas);
}

/** Loads a picture's model; one that cannot be drawn hands the place back to the 2D picture. */
function load(v: View): void {
  if (v.loading) return;
  v.loading = true;
  void v.library
    .then(async (lib) => {
      if (!lib || !lib.listed(v.id)) return null;
      await lib.ready([v.id]);
      return lib.models.get(v.id) ?? null;
    })
    .catch((e: unknown) => {
      console.warn(`How to Play: model ${v.id} not drawn`, e);
      return null;
    })
    .then((data) => {
      if (!data) {
        drop(v);
        if (v.canvas.isConnected) v.fail();
        return;
      }
      v.data = data;
      v.drawn = false;
      wake();
    });
}

/** Turns the model when the picture is dragged; a drag on a card is not a click on it. */
function draggable(v: View): void {
  const c = v.canvas;
  c.classList.add('turns');
  c.title = 'Drag to turn it round';
  let from = -1;
  let moved = 0;
  c.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    from = e.clientX;
    moved = 0;
    c.setPointerCapture(e.pointerId);
    // No link drag or text selection from a press on a card's model.
    if (e.pointerType === 'mouse') e.preventDefault();
  });
  c.addEventListener('pointermove', (e) => {
    if (from < 0) return;
    const dx = e.clientX - from;
    from = e.clientX;
    moved += Math.abs(dx);
    v.heading += dx * TURN;
    v.drawn = false;
    wake();
  });
  const end = (): void => {
    from = -1;
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener(
    'click',
    (e) => {
      if (moved > DRAG_PX) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

/**
 * Shows a catalogue model live in this canvas (already on the page, sized
 * by its CSS): idle, the whole body, turned by dragging when `turns`. When
 * the model cannot be drawn (not in the catalogue, or no WebGL), `fail`
 * puts the thing's 2D picture in its place.
 */
export function liveModel(library: Promise<ModelLibrary | null>, id: string, canvas: HTMLCanvasElement, turns: boolean, fail: () => void): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return fail();
  canvas.style.visibility = 'hidden';
  const v: View = { canvas, ctx, id, data: null, heading: HEADING, offset: (views.size * 0.37) % 3, inView: false, hover: false, drawn: false, loading: false, library, fail };
  views.set(canvas, v);
  const over = canvas.parentElement?.closest('a, summary, .card') ?? canvas;
  over.addEventListener('pointerenter', () => {
    v.hover = true;
    wake();
  });
  over.addEventListener('pointerleave', () => (v.hover = false));
  if (turns) draggable(v);
  observerOf().observe(canvas);
}

/** Lets everything go when the book closes. */
export function closeModelViews(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  views.clear();
  observer?.disconnect();
  observer = null;
  for (const m of instances.values()) m.dispose();
  instances.clear();
  frames.clear();
  if (!stage) return;
  stage.renderer.dispose();
  stage.renderer.forceContextLoss();
  stage = null;
}
