// Client entry: the start screen, then the renderer, the sim worker, the
// generated world on screen and the game shell (input, camera, HUD,
// selection, minimap).
//
// The world plugs into the shell through the WorldHooks interface
// (src/hud/shell.ts); WorldView (src/world/world-view.ts) implements it.
import './hud/hud.css';
import * as THREE from 'three';
import { hashHex, Mat, WU_PER_METRE, type Order } from '@blockyrts/sim';
import { GameInfo } from './game/game-info.ts';
import { GameShell } from './hud/shell.ts';
import { S, STATE_STRIDE, type FromWorker, type ToWorker } from './messages.ts';
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
  const game = new GameInfo(PLAYER);
  world.setGame(game);

  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker): void => worker.postMessage(msg);

  let leaving = false;
  const shell: GameShell = new GameShell(app, {
    scene,
    world: world.hooks,
    extras: {
      heightAt: (x, z) => world.groundAt(x, z),
      node: (cx, cz, i) => world.node(cx, cz, i),
      setGhost: (g) => world.buildings.setGhost(g, PLAYER, (x, z) => world.groundAt(x, z)),
      setPlanned: () => world.buildings.setPlanned(game.queues, PLAYER, (x, z) => world.groundAt(x, z)),
      overlay: world.overlay,
    },
    game,
    player: PLAYER,
    seed,
    players,
    settings,
    issueOrder(order) {
      send({ type: 'order', order });
    },
    askPlacement(kind, variant, spots) {
      send({ type: 'place', id: 0, kind, variant, spots });
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

  addDebugTools(shell, world, (order) => send({ type: 'order', order }), (factor) => send({ type: 'speed', factor }));

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
    if (msg.type === 'info') {
      game.onInfo(msg);
      return;
    }
    if (msg.type === 'placed') {
      shell.onPlaced(msg.kind, msg.spots);
      return;
    }
    game.onState(msg);
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
        if (msg.data[o + S.owner] !== PLAYER) continue;
        x += msg.data[o + S.x]!;
        z += msg.data[o + S.z]!;
        n++;
      }
      if (n > 0) shell.cam.jumpTo(x / n / WU_PER_METRE, z / n / WU_PER_METRE);
      shell.message(`World generated from seed ${seed}.`);
      if (players > 1) shell.message(`${players} players: you are player 1.`);
      shell.message('Select your workers and right-click trees and rocks to gather; press B to build.');
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
function addDebugTools(shell: GameShell, world: WorldView, order: (o: Order) => void, speed: (factor: number) => void): void {
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
  let factor = 1;
  add('dbg-speed', 'Speed ×1', 'Debug: game speed', 'Runs the game at 1, 4 or 16 times speed, to see the day turn and farms grow without waiting. Every step is the same as at normal speed, so the hash does not change.', () => {
    factor = factor === 1 ? 4 : factor === 4 ? 16 : 1;
    speed(factor);
    shell.buttons.get('dbg-speed')?.setFace(`Speed ×${factor}`).setLit(factor > 1);
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
