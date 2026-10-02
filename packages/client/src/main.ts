// Client entry: the start screen, then the renderer, the sim worker, the
// stand-in world and the game shell (input, camera, HUD, selection, minimap).
//
// The world-specific parts are all in the "World" section below, behind the
// WorldHooks interface (src/hud/shell.ts). The generated world replaces the
// M0 stand-ins there; nothing else in this file needs to know about it.
import './hud/hud.css';
import * as THREE from 'three';
import { ANGLE_TURN, hashHex, STEPS_PER_SECOND, WORLD_EDGE_WU, WU_PER_METRE } from '@blockyrts/sim';
import { GameShell, type ShellOrder, type WorldHooks } from './hud/shell.ts';
import { STATE_STRIDE, type FromWorker, type StateMessage, type ToWorker } from './messages.ts';
import type { GroundPicker, MinimapSource, Selectable, SelectableSource } from './selection/types.ts';
import { loadSettings } from './settings/settings.ts';
import { chooseStart } from './start/start-screen.ts';

const STEP_MS = 1000 / STEPS_PER_SECOND;
/** The local player. */
const PLAYER = 0;

// ---------------------------------------------------------------------------
// World: M0 stand-ins. Everything here is replaced by the generated world.
// ---------------------------------------------------------------------------

/** Placeholder team colour from the model pipeline (decision 8). */
const TEAM_BLUE = new THREE.Color(52 / 255, 96 / 255, 178 / 255);
const NEUTRAL_GREY = new THREE.Color(0.55, 0.55, 0.5);
/** The M0 ground: 4 x 4 chunks of 28.8 m. */
const GROUND = 4 * 28.8;
/** The world edge, 100 km from the origin in every direction. */
const WORLD_EDGE_M = WORLD_EDGE_WU / WU_PER_METRE;
const BLOCK_HALF = new THREE.Vector3(0.225, 0.845, 0.225);

interface StandInWorld {
  hooks: WorldHooks;
  /** A new sim state arrived. */
  onState(msg: StateMessage): void;
  /** Once a frame before the shell: interpolate and update the drawing. */
  update(now: number): void;
}

function createStandInWorld(scene: THREE.Scene): StandInWorld {
  scene.background = new THREE.Color(0x9fb8c8);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x5d7a3a }),
  );
  scene.add(ground);
  const grid = new THREE.GridHelper(GROUND, 4, 0x2c3a1c, 0x2c3a1c);
  grid.position.y = 0.01;
  scene.add(grid);

  // Entities: one instanced block each, 0.45 m square and 1.69 m tall, with a nose for the heading.
  const MAX_ENTITIES = 1024;
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.45, 1.69, 0.45).translate(0, 0.845, 0),
    new THREE.MeshLambertMaterial(),
    MAX_ENTITIES,
  );
  blocks.count = 0;
  scene.add(blocks);
  const noses = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.2).translate(0, 1.45, -0.3),
    new THREE.MeshLambertMaterial({ color: 0xffe08a }),
    MAX_ENTITIES,
  );
  noses.count = 0;
  scene.add(noses);

  // A few stand-in resource nodes, so node selection (double click, Ctrl + click) can be tried before the world has real ones.
  const nodes: Selectable[] = [];
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2f5a2c });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8a84 });
  const pineGeo = new THREE.ConeGeometry(1.1, 4, 7).translate(0, 2, 0);
  const rockGeo = new THREE.DodecahedronGeometry(0.7).translate(0, 0.45, 0);
  for (let i = 0; i < 14; i++) {
    const pine = i % 3 !== 2;
    const a = i * 2.39996;
    const r = 26 + (i % 5) * 4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const mesh = new THREE.Mesh(pine ? pineGeo : rockGeo, pine ? pineMat : rockMat);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    nodes.push({
      key: `p:0:${i}`,
      kind: 'node',
      owner: 255,
      typeKey: pine ? 'node:pine' : 'node:stone',
      centre: new THREE.Vector3(x, pine ? 2 : 0.45, z),
      halfSize: pine ? new THREE.Vector3(1.1, 2, 1.1) : new THREE.Vector3(0.7, 0.45, 0.7),
      label: pine ? 'Pine (20 softwood lumber)' : 'Stone (30 stone)',
      details: ['Stand-in node until the generated world arrives.'],
    });
  }

  // Interpolation keeps the last two states and blends by the time since the newest arrived.
  let prev: StateMessage | null = null;
  let curr: StateMessage | null = null;
  let currAt = 0;
  const units: Selectable[] = [];
  const dummy = new THREE.Object3D();

  function onState(msg: StateMessage): void {
    prev = curr;
    curr = msg;
    currAt = performance.now();
    // Keys: own units carry their entity id (the state lists own ids in entity order); the M0 message has no
    // ids for the rest, so they get index keys until it does.
    let own = 0;
    units.length = msg.count;
    for (let i = 0; i < msg.count; i++) {
      const owner = msg.data[i * STATE_STRIDE + 3]!;
      const key = owner === PLAYER ? `e:${msg.ownIds[own++]}` : `n:${i}`;
      const u = units[i];
      if (!u || u.key !== key) {
        units[i] = {
          key,
          kind: 'unit',
          owner,
          typeKey: 'worker',
          centre: new THREE.Vector3(),
          halfSize: BLOCK_HALF,
          label: owner === PLAYER ? 'Worker' : 'Wanderer',
          details: owner === PLAYER ? ['Placeholder unit (M0 block).'] : ['Wanders on the seeded random stream.'],
        };
        blocks.setColorAt(i, owner === PLAYER ? TEAM_BLUE : NEUTRAL_GREY);
        if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
      }
    }
  }

  function update(now: number): void {
    if (!curr) return;
    const alpha = prev && prev.count === curr.count ? Math.min(1, (now - currAt) / STEP_MS) : 1;
    for (let i = 0; i < curr.count; i++) {
      const o = i * STATE_STRIDE;
      const cx = curr.data[o]!;
      const cz = curr.data[o + 1]!;
      const px = prev && alpha < 1 ? prev.data[o]! : cx;
      const pz = prev && alpha < 1 ? prev.data[o + 1]! : cz;
      const x = (px + (cx - px) * alpha) / WU_PER_METRE;
      const z = (pz + (cz - pz) * alpha) / WU_PER_METRE;
      dummy.position.set(x, 0, z);
      dummy.rotation.y = (curr.data[o + 2]! / ANGLE_TURN) * Math.PI * 2;
      dummy.updateMatrix();
      blocks.setMatrixAt(i, dummy.matrix);
      noses.setMatrixAt(i, dummy.matrix);
      units[i]?.centre.set(x, BLOCK_HALF.y, z);
    }
    blocks.count = curr.count;
    noses.count = curr.count;
    blocks.instanceMatrix.needsUpdate = true;
    noses.instanceMatrix.needsUpdate = true;
  }

  // HOOK: the ground under a screen ray. Stand-in: the plane y = 0.
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundPicker: GroundPicker = (ray) => ray.ray.intersectPlane(groundPlane, new THREE.Vector3());

  // HOOK: everything selectable near the view. Stand-in: the M0 blocks as units, plus the stand-in nodes.
  const selectables: SelectableSource = {
    *candidates() {
      yield* units;
      yield* nodes;
    },
  };

  // HOOK: the minimap's land. Stand-in: the ground square in green, with its chunk lines.
  const minimap: MinimapSource = {
    bounds: () => ({ minX: -150, minZ: -150, maxX: 150, maxZ: 150 }),
    paint(ctx) {
      ctx.fillStyle = '#5d7a3a';
      ctx.fillRect(-GROUND / 2, -GROUND / 2, GROUND, GROUND);
      ctx.strokeStyle = 'rgba(30, 45, 20, 0.8)';
      ctx.lineWidth = 0.6;
      for (let i = 0; i <= 4; i++) {
        const v = -GROUND / 2 + i * 28.8;
        ctx.beginPath();
        ctx.moveTo(v, -GROUND / 2);
        ctx.lineTo(v, GROUND / 2);
        ctx.moveTo(-GROUND / 2, v);
        ctx.lineTo(GROUND / 2, v);
        ctx.stroke();
      }
      ctx.fillStyle = '#9a9a92';
      for (const n of nodes) {
        if (n.typeKey === 'node:stone') ctx.fillRect(n.centre.x - 1.5, n.centre.z - 1.5, 3, 3);
      }
    },
    version: () => 1,
  };

  // HOOK: the camera focus limits: the world edge, 100 km from the origin in every direction.
  const limits = () => ({ minX: -WORLD_EDGE_M, maxX: WORLD_EDGE_M, minZ: -WORLD_EDGE_M, maxZ: WORLD_EDGE_M });

  return { hooks: { ground: groundPicker, selectables, minimap, limits }, onState, update };
}

// ---------------------------------------------------------------------------
// Startup and the frame loop.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  const settings = loadSettings();
  const { seed, players } = await chooseStart(app);
  // A refresh (or a shared link) starts the same world again.
  history.replaceState(null, '', `${location.pathname}?seed=${seed}&players=${players}`);

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();

  const world = createStandInWorld(scene);

  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker): void => worker.postMessage(msg);

  let leaving = false;
  const shell = new GameShell(app, {
    scene,
    world: world.hooks,
    player: PLAYER,
    seed,
    players,
    settings,
    // HOOK: orders from the controls go to the sim here.
    issueOrder(order: ShellOrder, { queued }) {
      // TODO: queued orders (Shift / Queue Mode) need an order queue in the sim; until then every order replaces.
      void queued;
      if (order.kind === 'move') send({ type: 'order', order });
      // TODO: forward { kind: 'stop' } once @blockyrts/sim has the stop order kind.
      else shell.message('Stop is not in the simulation yet.');
    },
    onQuit() {
      leaving = true;
      location.href = location.pathname;
    },
  });

  // Leaving or refreshing the page during a match asks first.
  window.addEventListener('beforeunload', (e) => {
    if (leaving) return;
    e.preventDefault();
    e.returnValue = '';
  });

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    shell.resize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  let stepsSeen = 0;
  let rateFrom = performance.now();
  let stepsPerSecond = 0;
  let greeted = false;
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    world.onState(msg);
    stepsSeen++;
    const now = performance.now();
    if (now - rateFrom >= 1000) {
      stepsPerSecond = Math.round((stepsSeen * 1000) / (now - rateFrom));
      stepsSeen = 0;
      rateFrom = now;
    }
    shell.setSimInfo({ step: msg.step, stepsPerSecond, hash: hashHex(msg.hash), hashStep: msg.hashStep });
    if (!greeted) {
      greeted = true;
      shell.message(`World generated from seed ${seed}.`);
      if (players > 1) shell.message(`${players} players: you are player 1.`);
    }
  };
  send({ type: 'start', seed });
  shell.start();
  // For browser checks in development (test-e2e): the shell is reachable from the console.
  if (import.meta.env.DEV) (window as unknown as { shell: GameShell }).shell = shell;

  let lastFrame = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    world.update(now);
    shell.frame(dt, now);
    renderer.render(scene, shell.cam.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
