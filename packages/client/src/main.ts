// Client entry: the start screen, then the renderer, the sim worker, the
// generated world on screen and the game shell (input, camera, HUD,
// selection, minimap).
//
// The world plugs into the shell through the WorldHooks interface
// (src/hud/shell.ts); WorldView (src/world/world-view.ts) implements it.
import './hud/hud.css';
import * as THREE from 'three';
import { hashHex, Mat, WU_PER_METRE, type Order } from '@blockyrts/sim';
import { GameShell, type ShellOrder } from './hud/shell.ts';
import { STATE_STRIDE, type FromWorker, type ToWorker } from './messages.ts';
import { loadSettings } from './settings/settings.ts';
import { chooseStart } from './start/start-screen.ts';
import { COLUMN_M, UNIT_M } from './world/mesher.ts';
import { WorldView } from './world/world-view.ts';

/** The local player. */
const PLAYER = 0;

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

  const world = new WorldView({ scene, seed, players, player: PLAYER });

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
    issueOrder(order: ShellOrder, { queued }) {
      // TODO: queued orders (Shift / Queue Mode) need an order queue in the sim; until then every order replaces.
      void queued;
      send({ type: 'order', order });
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

  addDebugTools(shell, world, (order) => send({ type: 'order', order }));

  let stepsSeen = 0;
  let rateFrom = performance.now();
  let stepsPerSecond = 0;
  let placed = false;
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    if (msg.type === 'deltas') {
      world.onDeltas(msg);
      return;
    }
    if (msg.type === 'fog') {
      world.onFog(msg);
      return;
    }
    world.onState(msg);
    stepsSeen++;
    const now = performance.now();
    if (now - rateFrom >= 1000) {
      stepsPerSecond = Math.round((stepsSeen * 1000) / (now - rateFrom));
      stepsSeen = 0;
      rateFrom = now;
    }
    shell.setSimInfo({ step: msg.step, stepsPerSecond, hash: hashHex(msg.hash), hashStep: msg.hashStep });
    if (!placed) {
      // Start the camera over the player's own units, in their pocket.
      placed = true;
      let x = 0;
      let z = 0;
      let n = 0;
      for (let i = 0; i < msg.count; i++) {
        const o = i * STATE_STRIDE;
        if (msg.data[o + 1] !== PLAYER) continue;
        x += msg.data[o + 3]!;
        z += msg.data[o + 5]!;
        n++;
      }
      if (n > 0) shell.cam.jumpTo(x / n / WU_PER_METRE, z / n / WU_PER_METRE);
      shell.message(`World generated from seed ${seed}.`);
      if (players > 1) shell.message(`${players} players: you are player 1.`);
    }
  };
  send({ type: 'start', seed, players });
  shell.start();
  // For browser checks in development (test-e2e): the shell and the world are reachable from the console.
  if (import.meta.env.DEV) Object.assign(window as object, { shell, world });

  let lastFrame = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    world.update(now, shell.cam.focus);
    shell.frame(dt, now);
    renderer.render(scene, shell.cam.camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Debug buttons in the debug readout (top left): the M1 tools a tester uses
 * to see the world. They act at the camera's focus (the middle of the view),
 * and the land changes go through the sim as orders, so they are in the hash.
 */
function addDebugTools(shell: GameShell, world: WorldView, order: (o: Order) => void): void {
  const bar = document.createElement('div');
  bar.className = 'dbg-tools';
  shell.layout.debug.append(bar);
  const focusColumn = (): { x: number; z: number; y: number } => {
    const f = shell.cam.focus;
    const x = Math.floor(f.x / COLUMN_M);
    const z = Math.floor(f.z / COLUMN_M);
    return { x, z, y: Math.round((world.heightAt(f.x, f.z) ?? 0) / UNIT_M) };
  };
  const add = (id: string, face: string, name: string, description: string, onPress: () => void): void => {
    const b = shell.buttons.add({ id, face, name, keys: [], description, className: 'dbg-btn', onPress });
    bar.append(b.el);
  };
  add('dbg-reveal', 'Reveal', 'Debug: reveal', 'Marks the land within 150 m of the middle of the view explored (a sim order, so it is in the hash). The minimap fills in behind it.', () => {
    const f = shell.cam.focus;
    order({ kind: 'debugReveal', player: PLAYER, x: Math.round(f.x * WU_PER_METRE), z: Math.round(f.z * WU_PER_METRE), radius: 150 * WU_PER_METRE });
  });
  add('dbg-all', 'Show all', 'Debug: show all', 'Draws the land without fog of war, on this screen only; the sim and the minimap still keep to what is explored.', () => {
    world.setShowAll(!world.showingAll);
    shell.buttons.get('dbg-all')?.setLit(world.showingAll);
  });
  add('dbg-dig', 'Dig', 'Debug: dig', 'Digs a 3 m square pit 1 m deep in the middle of the view, as a terrain edit. Water nearby flows in.', () => {
    const c = focusColumn();
    order({ kind: 'terrain', player: PLAYER, x0: c.x - 3, z0: c.z - 3, x1: c.x + 3, z1: c.z + 3, bottom: c.y - 9, top: c.y + 40, material: Mat.Air });
  });
  add('dbg-raise', 'Raise', 'Debug: raise', 'Builds a 2 m stone block 1 m high in the middle of the view, as a terrain edit.', () => {
    const c = focusColumn();
    order({ kind: 'terrain', player: PLAYER, x0: c.x - 2, z0: c.z - 2, x1: c.x + 2, z1: c.z + 2, bottom: c.y, top: c.y + 9, material: Mat.Stone });
  });
  add('dbg-fell', 'Fell', 'Debug: fell', 'Takes everything from the selected trees, bushes and rocks: trees fall and drop seeds, hazel and herbs grow back from the stump.', () => {
    let n = 0;
    for (const s of shell.selection.list()) {
      const p = WorldView.propKey(s.key);
      if (!p) continue;
      order({ kind: 'debugHarvest', player: PLAYER, cx: p.cx, cz: p.cz, index: p.index, amount: 100000 });
      n++;
    }
    shell.message(n > 0 ? `Felled ${n}.` : 'Select trees, bushes or rocks first.');
  });
}

void main();
