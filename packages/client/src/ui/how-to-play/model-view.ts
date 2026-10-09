// A page's model, drawn once: How to Play shows the game's own catalogue
// model for a page that has no interface-kit picture (a lair, a people's
// building, a tree or rock, a stone circle's trilithon). It takes the model
// from the library the menu is already loading, draws it a single time with
// the game's own model drawing (InstancedModel), standing still and turned
// three quarters to the camera, into one small shared canvas, and keeps the
// picture for the rest of the visit. Nothing animates and nothing redraws.
//
// This is how the book gets a thing's picture: from its model or its kit
// icon, never from a picture made for the page. Screenshots of the game are
// only for the guides and the patch notes (picture-url.ts).
import * as THREE from 'three';
import { InstancedModel, type ModelLibrary } from '../../models/index.ts';

const SIZE = 256;
const FOV = 22;
const ELEVATION = THREE.MathUtils.degToRad(28);
/** Faces the camera three quarters on (0 faces away, -Z). */
const HEADING = Math.PI * 0.8;

let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
const done = new Map<string, Promise<string>>();

function stageOf(): NonNullable<typeof stage> {
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a3a28, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  stage = { renderer, scene, camera: new THREE.PerspectiveCamera(FOV, 1, 0.01, 2000) };
  return stage;
}

async function draw(library: ModelLibrary, id: string): Promise<string> {
  await library.ready([id]);
  const model = library.models.get(id);
  if (!model) return '';
  const { renderer, scene, camera } = stageOf();
  const view = new InstancedModel(model, 1);
  view.setInstance(0, 0, 0, 0, HEADING, model.clips.has('idle') ? 'idle' : '', 0, null);
  view.setCount(1);
  view.commit();
  scene.add(view.object);
  // Framed to the model's bounding sphere, so a tall tower and a flat rock both fill the picture.
  const box = model.boundingBox;
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(FOV) / 2);
  camera.position.set(centre.x, centre.y + Math.sin(ELEVATION) * dist, centre.z + Math.cos(ELEVATION) * dist);
  camera.lookAt(centre);
  camera.near = Math.max(0.01, dist - radius * 2);
  camera.far = dist + radius * 2;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(view.object);
  view.dispose();
  return url;
}

/** A still picture of a catalogue model, as a data URL ('' when it cannot be drawn); drawn once a visit. */
export function modelPicture(library: ModelLibrary, id: string): Promise<string> {
  let p = done.get(id);
  if (!p) {
    p = draw(library, id).catch((e: unknown) => {
      console.warn(`How to Play: model ${id} not drawn`, e);
      return '';
    });
    done.set(id, p);
  }
  return p;
}

/** Lets the shared canvas go when the book closes (the pictures drawn stay for the visit). */
export function closeModelViews(): void {
  if (!stage) return;
  stage.renderer.dispose();
  stage.renderer.forceContextLoss();
  stage = null;
}
