// A match on screen: the renderer, the sim worker, the world view and the
// game shell, played alone or online through the relay (Multiplayer and
// saving). Alone, the worker runs the sim at its own pace; online it runs a
// step only when every player's frame for it is in (lockstep), and this
// page passes frames, hashes and snapshots between the worker and the relay.
// Saving, the dawn autosave, pausing, chat, map pings and the host's choice
// all live here; the shell only asks for them.
import * as THREE from 'three';
import {
  ApiErrorCode,
  CloseReason,
  HostChoice,
  maskSlots,
  PauseReason,
  PLAYER_COLOURS,
  Presence,
  type RoomStateMessage,
  type ServerMessage,
  type WireFrame,
} from '@blockyrts/protocol';
import { hashHex, WU_PER_METRE } from '@blockyrts/sim';
import { NetUi } from '../hud/net-ui.ts';
import { GameShell, type ShellSession } from '../hud/shell.ts';
import { IS_MAC } from '../input/platform.ts';
import { S, STATE_STRIDE, type FromWorker, type SnapshotMessage, type ToWorker } from '../messages.ts';
import type { ModelLibrary } from '../models/index.ts';
import { ApiFailure, type Api } from '../net/api.ts';
import type { RelayClient } from '../net/relay.ts';
import { downloadSave, keepLocal, makeSave, openSave, saveFileName, seatSlots, type MatchMeta, type Seat, type Snapshot } from '../net/saves.ts';
import { onSettingsChange, VIEW_RINGS, type Settings } from '../settings/settings.ts';
import { accountPage } from '../ui/account.ts';
import { Screen } from '../ui/dom.ts';
import { FirstDayHints } from '../ui/hints.ts';
import { WorldView } from '../world/world-view.ts';
import { addDebugTools } from './debug-tools.ts';
import { GameInfo } from './game-info.ts';

/**
 * Models on screen when a match starts: the three bodies, the level 1 main
 * base and the hand torch. The match waits for these (at most
 * START_MODELS_WAIT_MS), so nothing swaps from a block to its model in view;
 * everything else loads behind them, and whatever comes into view first jumps
 * the queue.
 */
export const START_MODELS = ['worker', 'warrior', 'mage', 'main_base_l1', 'torch_hand'];
const START_MODELS_WAIT_MS = 20000;

/** Joining online: what the relay said when the match began (or when this page came back into it). */
export interface OnlineStart {
  relay: RelayClient;
  room: RoomStateMessage;
  epoch: number;
  activeSlots: number;
  inputDelay: number;
  /** A rejoin into a match under way: the first step this page sends, and the frames already relayed. */
  nextFrameStep?: number | undefined;
  frames?: WireFrame[] | undefined;
}

export interface MatchPlan {
  seed: number;
  /** One per sim player. */
  seats: Seat[];
  /** This page's sim player. */
  player: number;
  /** The server's id for the match, or '' until one is made (a first save makes it). */
  matchId: string;
  /** A saved state to carry on from, or null for a new world. */
  sim: Uint8Array | null;
  online: OnlineStart | null;
}

export interface MatchContext {
  api: Api;
  settings: Settings;
  library: Promise<ModelLibrary | null>;
  /** Back to the main menu (the page reloads, so nothing of the match is left over). */
  toMenu(): void;
}

/** A player's colour as CSS, from their lobby colour index. */
export function colourHex(index: number): string {
  return PLAYER_COLOURS[index % PLAYER_COLOURS.length]!.hex;
}

/** The seats of a new online match: the playing slots in order, with the lobby's names and colours. */
export function seatsOf(room: RoomStateMessage, activeSlots: number): Seat[] {
  return maskSlots(activeSlots).map((slot) => {
    const p = room.players.find((x) => x.slot === slot);
    return { slot, name: p?.name ?? `Player ${slot + 1}`, colour: p?.colour ?? slot, accountId: p?.accountId ?? '' };
  });
}

export async function runMatch(app: HTMLElement, plan: MatchPlan, ctx: MatchContext): Promise<void> {
  const { api, settings } = ctx;
  const online = plan.online;
  const relay = online?.relay ?? null;
  const seats = plan.seats;
  const players = seats.length;
  const PLAYER = plan.player;
  const meta: MatchMeta = { matchId: plan.matchId, seed: plan.seed, seats };
  if (online) {
    relay!.hold();
    meta.matchId = online.room.matchId;
  }
  let room = online?.room ?? null;
  const isHost = (): boolean => room !== null && room.hostSlot === room.yourSlot;
  const slotName = (slot: number): string => room?.players.find((p) => p.slot === slot)?.name ?? seats.find((s) => s.slot === slot)?.name ?? `Player ${slot + 1}`;
  // A refresh during an online match rejoins it; alone it starts the same world again.
  history.replaceState(null, '', online ? `/join/${online.room.code}` : `/?seed=${plan.seed}&players=${players}`);

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();

  const world = new WorldView({ scene, seed: plan.seed, players, player: PLAYER, colours: seats.map((s) => colourHex(s.colour)) });
  const game = new GameInfo(PLAYER);
  world.setGame(game);

  const worker = new Worker(new URL('../sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker, transfer: Transferable[] = []): void => worker.postMessage(msg, transfer);

  // ---- Pausing ----
  // Alone: the Pause button, the open menu and the account form each hold the game. Online: the relay's pause.
  const holds = new Set<string>();
  let netPause: { paused: boolean; reason: number; by: number; waiting: number } = { paused: false, reason: PauseReason.None, by: 0, waiting: 0 };
  const hold = (why: string, on: boolean): void => {
    if (online) return;
    if (on) holds.add(why);
    else holds.delete(why);
    send({ type: 'pause', paused: holds.size > 0 });
    showPause();
  };
  const pausedNow = (): boolean => (online ? netPause.paused : holds.has('button'));
  const togglePause = (): void => {
    if (online) relay!.send({ type: 'pause', paused: !(netPause.paused && netPause.reason === PauseReason.Player) });
    else hold('button', !holds.has('button'));
  };

  // ---- Snapshots from the worker ----
  let nextSnap = 1;
  const snaps = new Map<number, (s: Snapshot) => void>();
  const snapshot = (): Promise<Snapshot> =>
    new Promise((resolve) => {
      const id = nextSnap++;
      snaps.set(id, resolve);
      send({ type: 'snapshot', id });
    });
  const outOf = (): boolean[] => (game.info?.players ?? []).map((p) => p.out);

  // ---- Saving ----
  let saving = false;
  const saveBlocked = (): string => {
    if (online && !isHost()) return 'Only the host can save this game; the host can save at any time.';
    if (saving) return 'Saving…';
    return '';
  };
  /** Makes sure this page may save to the server: a guest is offered an account first (the game pauses meanwhile). */
  const ensureAccount = async (): Promise<boolean> => {
    if (api.me?.account) return true;
    hold('account', true);
    shell.releaseInput(true);
    const screen = new Screen(app);
    screen.overlay.classList.remove('start-overlay');
    const ok = await accountPage(screen, api, {
      start: 'register',
      reason: online ? 'Make an account to save this game: multiplayer saves are kept under the host’s account. You keep your place in the game.' : 'Make an account to save this game. A guest’s games are not saved.',
      backText: 'Not now',
    });
    screen.remove();
    shell.releaseInput(false);
    hold('account', false);
    if (ok && online) {
      relay!.authenticate(api.token);
      await relay!.waitFor((m): m is RoomStateMessage => m.type === 'roomState', 5000).catch(() => undefined);
    }
    return ok;
  };
  const upload = async (data: Uint8Array, autosave: boolean): Promise<void> => {
    try {
      await api.uploadSave(meta.matchId, data, autosave);
    } catch (e) {
      // Just after a guest made an account the server may not yet know them as the match's owner: once more.
      if (!(e instanceof ApiFailure) || e.code !== ApiErrorCode.GuestMustRegister) throw e;
      await new Promise((r) => setTimeout(r, 1500));
      await api.uploadSave(meta.matchId, data, autosave);
    }
  };
  const save = async (): Promise<void> => {
    const why = saveBlocked();
    if (why) return shell.message(why, 'alert');
    saving = true;
    try {
      if (!(await ensureAccount())) {
        shell.message('Not saved: saving needs an account. Download a save file from the menu to keep it on this computer.');
        return;
      }
      if (!meta.matchId) meta.matchId = await api.createMatch(plan.seed);
      const snap = await snapshot();
      const data = await makeSave(meta, snap, `Night ${snap.night}`, outOf());
      await upload(data, false);
      shell.message(`Game saved (night ${snap.night}). Continue it from Load game.`);
    } catch (e) {
      shell.message(`Not saved: ${e instanceof Error ? e.message : String(e)}`, 'alert');
    } finally {
      saving = false;
    }
  };
  const download = async (): Promise<void> => {
    const snap = await snapshot();
    const data = await makeSave({ ...meta, matchId: meta.matchId || 'local' }, snap, `Night ${snap.night}`, outOf());
    downloadSave(data, saveFileName({ night: snap.night } as Parameters<typeof saveFileName>[0]));
  };
  /** The dawn autosave: kept in this browser, and on the server for a signed-in player alone or the host. */
  const autosave = async (snap: Snapshot): Promise<void> => {
    try {
      const mayUpload = api.me?.account && (!online || isHost());
      if (mayUpload && !meta.matchId) meta.matchId = await api.createMatch(plan.seed).catch(() => '');
      const data = await makeSave({ ...meta, matchId: meta.matchId || `local-${plan.seed}` }, snap, `Dawn, night ${snap.night}`, outOf());
      void keepLocal((await openSave(data)).header, data);
      if (mayUpload && meta.matchId) {
        await upload(data, true);
        shell.message(`Autosaved at dawn (night ${snap.night}).`);
      }
    } catch (e) {
      shell.message(`The dawn autosave failed: ${e instanceof Error ? e.message : String(e)}`, 'alert');
    }
  };

  // ---- The shell ----
  let leaving = false;
  const toMenu = (): void => {
    leaving = true;
    ctx.toMenu();
  };
  const quit = (): void => {
    if (relay) relay.leave();
    toMenu();
  };
  const session: ShellSession = {
    online: online !== null,
    code: online?.room.code,
    name: (p) => seats[p]?.name || `Player ${p + 1}`,
    colour: (p) => colourHex(seats[p]?.colour ?? p),
    chat: relay ? (text) => relay.send({ type: 'chat', text }) : null,
    ping: (x, z) => {
      const wx = Math.round(x * WU_PER_METRE);
      const wz = Math.round(z * WU_PER_METRE);
      if (relay) relay.send({ type: 'mapPing', x: wx, z: wz });
      else shell.pinged(seats[PLAYER]?.name ?? 'You', x, z);
    },
    save: () => void save(),
    download: () => void download(),
    togglePause,
    paused: pausedNow,
    saveBlocked,
    menuOpened: (open) => hold('menu', open),
  };
  const shell: GameShell = new GameShell(app, {
    scene,
    world: world.hooks,
    extras: {
      heightAt: (x, z) => world.groundAt(x, z),
      seen: (x, z) => world.seenNow(x, z),
      node: (cx, cz, i) => world.node(cx, cz, i),
      setGhost: (g) => world.buildings.setGhost(g, PLAYER, (x, z) => world.groundAt(x, z)),
      setPlanned: () => world.buildings.setPlanned(game.queues, PLAYER, (x, z) => world.groundAt(x, z)),
      overlay: world.overlay,
    },
    game,
    player: PLAYER,
    seed: plan.seed,
    players,
    settings,
    issueOrder(order) {
      send({ type: 'order', order });
    },
    askPlacement(kind, variant, spots) {
      send({ type: 'place', id: 0, kind, variant, spots });
    },
    onQuit: quit,
    session,
  });
  const net = new NetUi(shell.layout.root, shell.panels, shell.buttons);
  const showPause = (): void => {
    if (online) {
      const p = netPause;
      if (!p.paused) net.setPaused(null);
      else if (p.reason === PauseReason.Player) net.setPaused(`Paused by ${slotName(p.by)}.`, () => togglePause());
      else if (p.reason === PauseReason.Disconnect) net.setPaused(`${maskSlots(p.waiting).map(slotName).join(' and ')} lost the connection. The game waits for them.`);
      else if (p.reason === PauseReason.Desync) net.setPaused('The game went out of step; reloading everyone from one copy…');
      else net.setPaused(`${maskSlots(p.waiting).map(slotName).join(' and ') || 'A player'} is catching up…`);
    } else net.setPaused(holds.has('button') ? 'Paused.' : null, () => togglePause());
    shell.buttons.get('pause')?.setLit(pausedNow());
  };

  // Leaving or refreshing the page during a match asks first.
  window.addEventListener('beforeunload', (e) => {
    if (leaving) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---- Graphics settings ----
  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    shell.resize(w, h);
  }
  const applyGraphics = (s: Settings): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * s.resolutionScale);
    renderer.shadowMap.enabled = s.shadows;
    world.setGraphics({ viewRing: VIEW_RINGS[s.viewDistance], shadows: s.shadows });
    resize();
  };
  applyGraphics(settings);
  onSettingsChange(applyGraphics);
  window.addEventListener('resize', resize);

  addDebugTools(shell, world, PLAYER, (order) => send({ type: 'order', order }), online ? null : (factor) => send({ type: 'speed', factor }));

  // ---- Messages from the worker ----
  let stepsSeen = 0;
  let rateFrom = performance.now();
  let stepsPerSecond = 0;
  let placed = false;
  let lastStep = -1;
  if (relay) relay.haveStep = () => lastStep;
  const hints = new FirstDayHints(shell, game, settings);
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    switch (msg.type) {
      case 'deltas':
        world.onDeltas(msg);
        return;
      case 'fog':
        world.onFog(msg);
        return;
      case 'info':
        game.onInfo(msg);
        hints.update();
        return;
      case 'placed':
        shell.onPlaced(msg.kind, msg.spots);
        return;
      case 'frames':
        for (const f of msg.frames) relay?.send({ type: 'frame', step: f.step, orders: f.orders });
        return;
      case 'hash':
        relay?.send({ type: 'hash', epoch: msg.epoch, step: msg.step, hash: msg.hash });
        return;
      case 'waiting':
        net.setWaiting(msg.slots.map(slotName));
        return;
      case 'snapshot':
      case 'dawn':
        onSnapshot(msg);
        return;
      default:
        break;
    }
    game.onState(msg);
    world.onState(msg);
    lastStep = msg.step;
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
      greet();
    }
  };
  const onSnapshot = (msg: SnapshotMessage): void => {
    const snap = { step: msg.step, night: msg.night, data: msg.data };
    if (msg.type === 'dawn') {
      void autosave(snap);
      return;
    }
    const f = snaps.get(msg.id ?? 0);
    snaps.delete(msg.id ?? 0);
    f?.(snap);
  };
  const greet = (): void => {
    shell.message(`World seed ${plan.seed}.${plan.sim ? ' Carrying on from the saved game.' : ''}`);
    if (players > 1) {
      const others = seats.filter((_, p) => p !== PLAYER).map((s) => s.name);
      shell.message(online ? `Playing with ${others.join(', ')}. Enter chats; [ opens Allies, ] Send resources, \\ pings the map.` : `${players} players: you are player ${PLAYER + 1}.`);
    }
    // Full screen (Outside the match): some controls only work there.
    shell.message(`Press ${IS_MAC ? 'Ctrl + Cmd + F' : 'F11'} for full screen: some controls, such as Ctrl + number groups, only work in full screen.`);
    if (!plan.sim) hints.start();
  };

  // ---- Messages from the relay ----
  const onRelay = (m: ServerMessage): void => {
    switch (m.type) {
      case 'frame':
        send({ type: 'frames', frames: [m.frame] });
        break;
      case 'inputDelay':
        send({ type: 'inputDelay', steps: m.steps });
        break;
      case 'pauseState':
        netPause = { paused: m.paused, reason: m.reason, by: m.bySlot, waiting: m.waitingFor };
        send({ type: 'pause', paused: m.paused });
        showPause();
        break;
      case 'roomState': {
        room = m;
        // Names change when a guest makes an account; the panel says who left for good.
        for (const s of seats) {
          const p = m.players.find((x) => x.slot === s.slot);
          if (!p) continue;
          if (p.presence === Presence.Gone && s.name && seatPresence.get(s.slot) !== Presence.Gone) shell.message(`${s.name} has left the game.`);
          seatPresence.set(s.slot, p.presence);
          s.name = p.name;
          s.accountId = p.accountId;
        }
        break;
      }
      case 'hostChoiceNeeded': {
        const name = slotName(m.slot);
        net.ask(`${name} has been gone for 30 seconds`, 'The game waits while a player is away. You are the host: choose what happens.', [
          { face: 'Wait', description: `Keep waiting for ${name}.`, primary: true, run: () => relay!.send({ type: 'hostChoice', slot: m.slot, choice: HostChoice.Wait }) },
          {
            face: 'Carry on without them',
            description: `${name}'s resources are split between the rest of you, and their buildings and units are shared by everyone, as if they had been eliminated.`,
            run: () => relay!.send({ type: 'hostChoice', slot: m.slot, choice: HostChoice.CarryOn }),
          },
          {
            face: 'Save and quit',
            description: 'Saves the game to your account, then closes it for everyone. Continue it later from Load game; the others rejoin by invite.',
            danger: true,
            run: () => {
              void (async () => {
                await save();
                relay!.send({ type: 'hostChoice', slot: m.slot, choice: HostChoice.SaveAndQuit });
              })();
            },
          },
        ]);
        break;
      }
      case 'snapshotRequest':
        void (async () => {
          const snap = await snapshot();
          const data = await makeSave(meta, snap, 'snapshot', outOf());
          relay!.send({ type: 'snapshot', requestId: m.requestId, step: snap.step, data });
        })();
        break;
      case 'loadSnapshot':
        void (async () => {
          const opened = await openSave(m.data);
          lastStep = m.step;
          send({ type: 'load', snapshot: opened.sim, frames: m.frames, nextFrameStep: m.nextFrameStep, slot: room!.yourSlot, seats: seatSlots(seats), epoch: m.epoch, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
          if (resynced) shell.message('This game had gone out of step with the others, so it was reloaded from their copy. Play carries on.', 'alert');
          resynced = false;
        })();
        break;
      case 'resume':
        send({ type: 'resume', epoch: m.epoch, frames: m.frames, nextFrameStep: m.nextFrameStep, activeSlots: m.activeSlots, inputDelay: m.inputDelay });
        shell.message('Back in the game.');
        break;
      case 'desync':
        if (m.minority & (1 << (room?.yourSlot ?? 0))) resynced = true;
        shell.message('The game went out of step between players; it is being reloaded from one copy.', 'alert');
        break;
      case 'chat':
        shell.chatLine(m.name, m.text);
        break;
      case 'mapPing':
        shell.pinged(slotName(m.slot), m.x / WU_PER_METRE, m.z / WU_PER_METRE);
        break;
      case 'roomClosed':
        leaving = true;
        net.closed(
          'The game has closed',
          m.reason === CloseReason.SavedAndQuit ? 'The host saved the game and closed it. The host can continue it from Load game; you rejoin by invite.' : m.reason === CloseReason.ServerShutdown ? 'The game server is restarting. The host can continue from the last save.' : 'Everyone else has left.',
          toMenu,
        );
        shell.releaseInput(true);
        break;
      case 'error':
        shell.message(m.message, 'alert');
        break;
      default:
        break;
    }
  };
  const seatPresence = new Map<number, number>();
  let resynced = false;
  if (relay) {
    relay.on(onRelay);
    relay.onStatus((s) => {
      if (s === 'reconnecting') net.setPaused('Lost the connection to the game server. Reconnecting…');
      else if (s === 'open') showPause();
      else if (s === 'closed' && !leaving) net.closed('Disconnected', 'The connection to the game server was lost and could not be made again.', toMenu);
    });
  }

  // ---- Start ----
  const lib = await ctx.library;
  if (lib) {
    world.setModels(lib);
    const loading = document.createElement('div');
    loading.className = 'overlay start-overlay';
    loading.innerHTML = '<div class="dialog loading">Loading models…</div>';
    app.appendChild(loading);
    await Promise.race([lib.ready(START_MODELS), new Promise((resolve) => setTimeout(resolve, START_MODELS_WAIT_MS))]);
    loading.remove();
  }
  const start: ToWorker = {
    type: 'start',
    seed: plan.seed,
    players,
    player: PLAYER,
    snapshot: plan.sim ?? undefined,
    net: online
      ? { slot: online.room.yourSlot, seats: seatSlots(seats), epoch: online.epoch, activeSlots: online.activeSlots, inputDelay: online.inputDelay, nextFrameStep: online.nextFrameStep, frames: online.frames }
      : undefined,
  };
  send(start);
  // Frames that came in while the models loaded go to the worker now, after the start.
  relay?.release();
  shell.start();
  // For browser checks in development (test-e2e): the shell and the world are reachable from the console.
  if (import.meta.env.DEV) Object.assign(window as object, { shell, world, relay });

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

