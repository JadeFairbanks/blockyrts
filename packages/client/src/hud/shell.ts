// The game shell: wires the input manager, camera, HUD, selection, minimap and
// the command card together and runs them once a frame. Everything about the
// world comes in through WorldHooks and the GameInfo copy of the sim's state;
// orders go out through issueOrder.
import * as THREE from 'three';
import {
  BuildingKind,
  buildingSpec,
  clockAt,
  Period,
  RESOURCES,
  WU_PER_METRE,
  type Order,
  type SimEvent,
} from '@blockyrts/sim';
import { EDGE_DELAY_S, edgePanDirection, type PanDir } from '../camera/edge-pan.ts';
import { RtsCamera, ZOOM_STEP, type CameraView } from '../camera/rts-camera.ts';
import { GameInfo } from '../game/game-info.ts';
import { keyFor } from '../input/bindings.ts';
import { Btn, InputManager, type Mods, type MouseTarget } from '../input/input-manager.ts';
import { CTRL_NAME } from '../input/platform.ts';
import type { InfoMessage } from '../messages.ts';
import { Minimap } from '../minimap/minimap.ts';
import { SelectionController } from '../selection/controller.ts';
import { projectCandidates } from '../selection/project.ts';
import { isOwn, pickAt, type ScreenItem } from '../selection/rules.ts';
import { SelectionSet } from '../selection/selection.ts';
import {
  buildingIdOf,
  entityIdOf,
  type CameraLimits,
  type GroundPicker,
  type MinimapSource,
  type Selectable,
  type SelectableSource,
} from '../selection/types.ts';
import { SelectionVisuals } from '../selection/visuals.ts';
import type { Settings } from '../settings/settings.ts';
import type { Ghost } from '../world/buildings-view.ts';
import { COLUMN_M } from '../world/mesher.ts';
import type { Overlay } from '../world/overlay.ts';
import { ButtonRegistry, Tooltip, type ButtonPress, type HudButton } from './buttons.ts';
import { Commands, type Card } from './commands.ts';
import { ControlGroups } from './groups.ts';
import { buildLayout, type HudLayout } from './layout.ts';
import { GameMenu } from './menu.ts';
import { HudPanels } from './panels.ts';
import type { Pt } from './rects.ts';
import { FOOD, SUPPLY } from './resources.ts';
import { SelectionPanel, subgroups } from './selection-panel.ts';

/** What the shell needs from the world. */
export interface WorldHooks {
  ground: GroundPicker;
  selectables: SelectableSource;
  minimap: MinimapSource;
  limits(): CameraLimits;
}

/** The rest of the world the M2 controls draw on: heights, nodes, the ghost, planned buildings and overlay lines. */
export interface WorldExtras {
  heightAt(x: number, z: number): number;
  node(cx: number, cz: number, index: number): Selectable | undefined;
  setGhost(g: Ghost | null): void;
  setPlanned(): void;
  overlay: Overlay;
}

export type ShellOrder = Order;

export interface ShellOptions {
  scene: THREE.Scene;
  world: WorldHooks;
  extras: WorldExtras;
  game: GameInfo;
  /** Sends an order to the sim. */
  issueOrder(order: ShellOrder): void;
  /** Asks the sim for placement tiles; the answer comes back through GameShell.onPlaced. */
  askPlacement(kind: number, spots: Array<[number, number]>): void;
  settings: Settings;
  seed: number;
  players: number;
  /** The local player's index (0 is player 1). */
  player: number;
  /** Quit to the start screen (after the player confirmed). */
  onQuit(): void;
}

export interface SimInfo {
  step: number;
  stepsPerSecond: number;
  hash: string;
  hashStep: number;
}

const MAX_MESSAGES = 60;
const CAMERA_SLOTS = 4;
/** Urgent messages Space steps back through. */
const URGENT_KEEP = 8;
const TARGET_GREEN = '#5ee06a';
const TARGET_YELLOW = '#f2d24b';
/** Two presses of a command key within this time are a double tap (auto-target). */
const DOUBLE_TAP_MS = 300;
const RALLY = new THREE.Color(0xf2d24b);
const QUEUE = new THREE.Color(0x63e06b);
const CLAIM = new THREE.Color(0xf2d24b);
const LIGHT = new THREE.Color(0xff9a40);

export class GameShell {
  readonly cam: RtsCamera;
  readonly panels = new HudPanels();
  readonly buttons = new ButtonRegistry();
  readonly selection = new SelectionSet();
  readonly input: InputManager;
  readonly layout: HudLayout;
  readonly commands: Commands;
  readonly groups: ControlGroups;
  private readonly tooltip: Tooltip;
  private readonly menu: GameMenu;
  private readonly minimap: Minimap;
  private readonly visuals: SelectionVisuals;
  private readonly selector: SelectionController;
  private readonly panel: SelectionPanel;
  private readonly cardButtons: HudButton[] = [];
  private world: WorldHooks;
  private readonly extras: WorldExtras;
  private readonly game: GameInfo;
  private readonly settings: Settings;
  private readonly player: number;

  private items: ScreenItem<Selectable>[] = [];
  private readonly fresh = new Map<string, Selectable>();
  /** Set when a left press confirmed a targeted order or placed a building, so its release does not also select. */
  private leftConsumed = false;
  private middleDrag = false;
  private minimapSlide = false;
  /** When the cursor entered an edge pan zone (ms), or -1. */
  private edgeSince = -1;
  private edgeDir: PanDir | null = null;
  private followKey: string | null = null;
  private queueMode = false;
  private readonly cameraSlots: (CameraView | null)[] = Array.from({ length: CAMERA_SLOTS }, () => null);
  private resourcesOpen = false;
  private selectionDirty = true;
  private cardDirty = true;
  private lastPanelText = 0;
  private width = 1;
  private height = 1;
  private readonly startedAt = performance.now();
  /** The active subgroup's type. */
  private active: string | null = null;
  private lastKey = { id: '', t: 0 };
  private idleCycle = 0;
  private townCycle = 0;
  private readonly urgent: Array<{ x: number; z: number; text: string }> = [];
  private urgentAt = -1;
  private messageSeq = 0;
  private lastInfoStep = -1;
  private lastPlannedSig = '';

  constructor(
    parent: HTMLElement,
    private readonly opts: ShellOptions,
  ) {
    this.world = opts.world;
    this.extras = opts.extras;
    this.game = opts.game;
    this.settings = opts.settings;
    this.player = opts.player;
    this.layout = buildLayout(parent, this.panels);
    this.tooltip = new Tooltip(parent);
    this.cam = new RtsCamera(() => this.world.limits(), this.world.ground);
    this.visuals = new SelectionVisuals(opts.scene);
    this.minimap = new Minimap(this.layout.minimapEl, this.world.minimap);
    this.selector = new SelectionController(this.cam, this.panels, this.selection, this.player, () => this.items, this.layout.dragBox);
    this.menu = new GameMenu(parent, this.settings, {
      resume: () => this.closeMenu(),
      quit: () => opts.onQuit(),
      keysChanged: () => this.rebind(),
    });
    this.commands = new Commands({
      player: this.player,
      game: this.game,
      settings: this.settings,
      selection: () => this.selection.list(),
      activeType: () => this.activeType(),
      send: (o) => opts.issueOrder(o),
      queued: () => this.queued(),
      held: (k) => this.input.held(k),
      message: (t, k) => this.message(t, k),
      marker: (at, kind) => this.visuals.orderMarker(at, kind === 'move' ? 'move' : 'target'),
      askPlacement: (kind, spots) => opts.askPlacement(kind, spots),
      node: (cx, cz, i) => this.extras.node(cx, cz, i),
      heightAt: (x, z) => this.extras.heightAt(x, z),
      changed: () => {
        this.cardDirty = true;
      },
    });
    this.input = new InputManager(
      {
        game: this.gameMouse(),
        hudPress: (_panel, button, area) => {
          // Clicking a HUD panel other than the minimap cancels a targeted command (not the ghost: the card is how the player picks another).
          if (this.commands.targeting && area !== 'minimap' && button !== Btn.Middle) {
            this.commands.targeting = null;
            this.cardDirty = true;
          }
        },
        keyDown: (id, ev) => this.keyDown(id, ev),
        keyUp: () => undefined,
      },
      this.panels,
      this.buttons,
      this.tooltip,
      this.settings,
      parent,
    );
    this.input.addArea('minimap', this.layout.minimapEl, this.minimapMouse());
    this.groups = new ControlGroups(this.layout.groupTabs, this.buttons, {
      selection: () => this.selection.list(),
      lookup: (k) => this.fresh.get(k),
      select: (list) => this.selection.set(list),
      centreOn: (list) => this.centreOn(list),
      message: (t) => this.message(t),
    });
    this.panel = new SelectionPanel(this.layout.selectionTitle, this.layout.selectionBody, this.buttons, {
      player: this.player,
      health: (t) => this.health(t),
      building: (t) => this.buildingOf(t),
      portrait: (t, p) => this.portraitClick(t, p),
      portraitDouble: (t) => this.centreOn([t]),
      portraitRight: (t) => this.selection.set(this.selection.list().filter((x) => x.key !== t.key)),
      activate: (k) => this.setActive(k),
      keepType: (k) => this.selection.set(this.selection.list().filter((x) => x.typeKey === k)),
      dropType: (k) => this.selection.set(this.selection.list().filter((x) => x.typeKey !== k)),
      cancelQueued: (b, index) => opts.issueOrder({ kind: 'cancelProduce', player: this.player, building: b, index }),
      letOut: (b, unit) => opts.issueOrder({ kind: 'unload', player: this.player, building: b, unit }),
      unitName: (id) => this.fresh.get(`e:${id}`)?.label ?? 'Worker',
    });
    this.buildButtons();
    this.selection.onChange(() => {
      this.selectionDirty = true;
      this.cardDirty = true;
      this.setQueueMode(false);
      this.commands.reset();
      this.active = null;
    });
    this.game.onInfoUpdate((info) => this.onInfo(info));
    this.refreshSelectionPanel();
    this.refreshCommandCard();
  }

  /** Swaps the world hooks. */
  setWorld(world: WorldHooks): void {
    this.world = world;
    this.cam.setGround(world.ground);
    this.minimap.setSource(world.minimap);
  }

  /** Starts taking input; call from a user gesture so the cursor lock can be granted. */
  start(): void {
    this.input.setMode('game');
    this.input.requestLock();
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.cam.resize(w, h);
  }

  /** The sim's answer about placement tiles. */
  onPlaced(kind: number, spots: Array<{ x: number; z: number; tiles: Uint8Array }>): void {
    this.commands.onPlaced(kind, spots);
  }

  // ---- Messages and readouts ----

  /** Adds a message to the message panel. A message with a place can be clicked to jump there. */
  message(text: string, kind: 'system' | 'alert' = 'system', at?: { x: number; z: number }): void {
    const list = this.layout.messageList;
    let row: HTMLElement;
    if (at) {
      const id = `msg${this.messageSeq++}`;
      const b = this.buttons.add({
        id,
        face: '',
        name: 'Go there',
        keys: [],
        description: 'Click to jump the camera to where this happened. Space jumps to the latest urgent message.',
        className: `msg msg-btn ${kind}`,
        onPress: () => this.jumpTo(at.x, at.z),
      });
      row = b.el;
      row.replaceChildren();
    } else {
      row = document.createElement('div');
      row.className = `msg ${kind}`;
    }
    const t = document.createElement('span');
    t.className = 'msg-time';
    t.textContent = formatClock((performance.now() - this.startedAt) / 1000);
    row.append(t, document.createTextNode(text));
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
    list.append(row);
    while (list.childElementCount > MAX_MESSAGES) {
      const first = list.firstElementChild as HTMLElement;
      if (first.dataset.btn) this.buttons.remove(first.dataset.btn);
      else first.remove();
    }
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  setSimInfo(info: SimInfo): void {
    const f = this.layout.debugFields;
    setText(f.seed, String(this.opts.seed));
    setText(f.players, String(this.opts.players));
    setText(f.step, String(info.step));
    setText(f.rate, String(info.stepsPerSecond));
    if (info.hashStep > 0) {
      setText(f.hash, info.hash);
      setText(f.hashStep, String(info.hashStep));
    }
    this.updateClock(info.step);
  }

  /** Day N and the time left in the period; Dusk, Night N, Dawn (Day and night: 3 min, 40 s, 3 min, 40 s). */
  private updateClock(step: number): void {
    const c = clockAt(step);
    const name = c.period === Period.Day ? `Day ${c.cycle + 1}` : c.period === Period.Dusk ? `Dusk · Day ${c.cycle + 1}` : c.period === Period.Night ? `Night ${c.cycle}` : `Dawn · Night ${c.cycle}`;
    setText(this.layout.clockDay, name);
    setText(this.layout.clockTime, `${formatClock(c.left / 20)} left`);
    this.layout.clock.dataset.period = String(c.period);
  }

  private onInfo(info: InfoMessage): void {
    // Resources: the shared pool, food and supply.
    for (const [name, els] of this.layout.resourceValues) {
      let v: string;
      if (name === FOOD) v = String(this.game.food());
      else if (name === SUPPLY) v = `${info.supplyUsed}/${info.supplyCap}`;
      else {
        const r = RESOURCES.findIndex((x) => x.name === name);
        v = r >= 0 ? String(info.pool[r] ?? 0) : '0';
      }
      for (const el of els) setText(el, v);
    }
    const supply = this.layout.resourceBar.querySelector('.res.supply');
    supply?.classList.toggle('full', info.supplyUsed >= info.supplyCap);
    // Outlying lights against the coming night's limit (Table 8).
    const o = info.outlying;
    setText(this.layout.clockNote, o.halves > 0 ? `Lights outside: ${o.halves / 2} of ${o.limit}` : '');
    this.layout.clockNote.classList.toggle('over', o.halves > o.limit * 2);
    // Events into the message panel.
    for (const ev of info.events) this.onEvent(ev);
    // Idle gatherers and the dusk button.
    const idle = this.game.idleWorkers().length;
    const idleBtn = this.buttons.get('idle');
    idleBtn?.setFace(idle > 0 ? `⚒${idle}` : '⚒').setLit(idle > 0);
    const p = clockAt(info.step).period;
    this.buttons.get('home')?.setLit(p === Period.Dusk);
    this.groups.refresh((k) => this.exists(k));
    this.selection.retain((k) => this.exists(k) || k.startsWith('p:'));
    // Planned buildings move only when the order lists change.
    let sig = '';
    for (const q of this.game.queues.values()) for (const ord of q) if (ord.t === 'build') sig += `${ord.kind},${ord.x},${ord.z};`;
    if (sig !== this.lastPlannedSig) {
      this.lastPlannedSig = sig;
      this.extras.setPlanned();
    }
    if (info.step - this.lastInfoStep >= 5) {
      this.lastInfoStep = info.step;
      this.cardDirty = true;
    }
  }

  private exists(key: string): boolean {
    const u = entityIdOf(key);
    if (u !== null) return this.game.unit(u) !== null;
    const b = buildingIdOf(key);
    if (b !== null) return this.game.buildings.has(b);
    return true;
  }

  private onEvent(ev: SimEvent): void {
    const at = ev.x !== undefined && ev.z !== undefined ? { x: ev.x / WU_PER_METRE, z: ev.z / WU_PER_METRE } : undefined;
    const urgent = ev.kind === 'alert' || ev.kind === 'idle' || (ev.kind === 'period' && ev.text.startsWith('Night is falling'));
    this.message(ev.text, urgent ? 'alert' : 'system', at);
    if (urgent && at) {
      this.urgent.unshift({ ...at, text: ev.text });
      this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
      this.urgentAt = -1;
    } else if (urgent && ev.kind === 'period') {
      // The dusk warning has no place: Space centres on the main base.
      const base = this.game.mainBases()[0];
      if (base) {
        const c = GameInfo.centre(base, COLUMN_M);
        this.urgent.unshift({ ...c, text: ev.text });
        this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
        this.urgentAt = -1;
      }
    }
  }

  // ---- Buttons ----

  private buildButtons(): void {
    const L = this.layout;
    const util = (def: Parameters<ButtonRegistry['add']>[0], reason?: string): HudButton => {
      const b = this.buttons.add({ ...def, className: `util ${def.className ?? ''}` });
      if (reason) b.setEnabled(false, reason);
      L.utilityBar.append(b.el);
      return b;
    };
    const k = (action: string): string[] => [keyFor(this.settings.keys, action)];
    util({
      id: 'idle',
      face: '⚒',
      name: 'Idle Gatherer',
      keys: k('idle'),
      description: 'Select an idle gatherer and centre on it; again for the next. Shift + F1 or double click: all of them. The number is how many are idle.',
      onPress: (p) => this.selectIdle(p.shift),
      onDoubleClick: () => this.selectIdle(true),
    });
    util({ id: 'army', face: '⚔', name: 'Select Army', keys: k('army'), description: 'Select every combat unit you own (gatherers excluded).', onPress: () => this.selectArmy() });
    util({
      id: 'townhall',
      face: '⌂',
      name: 'Town Hall',
      keys: k('townhall'),
      description: 'Centre the camera on your main base; again to cycle through them.',
      onPress: () => this.townHall(),
    });
    util({
      id: 'follow',
      face: '◎',
      name: 'Follow',
      keys: k('follow'),
      description: 'Keep the camera on the selected unit until you pan or press L again.',
      onPress: () => this.toggleFollow(),
    });
    util({
      id: 'queue',
      face: '⇶',
      name: 'Queue Mode',
      keys: [],
      badge: 'Shift',
      description: 'While lit, every order is added to the queue as if Shift were held. Click again to turn it off; it also turns off when the selection changes.',
      onPress: () => this.setQueueMode(!this.queueMode),
    });
    util({ id: 'autoequip', face: '⚙', name: 'Auto-Equip', keys: ['F4'], description: 'Toggle units picking the best equipment from the pool by themselves.' }, 'Comes with equipment (milestone 3).');
    util({ id: 'rations', face: '▤', name: 'Rations', keys: ['F9'], description: 'Cycle the food ration setting.' }, 'Comes with food and supply (milestone 4).');
    util({
      id: 'home',
      face: '⇊',
      name: 'Everyone Home',
      keys: k('home'),
      description: 'Send every unit without a standing job to the nearest shelter (main base or farm). Lights up at dusk. Farmers go to their own farm by themselves; at daybreak everyone comes out and carries on.',
      onPress: () => {
        this.opts.issueOrder({ kind: 'everyoneHome', player: this.player });
        this.message('Everyone home: workers are heading for shelter.');
      },
    });
    util({
      id: 'resetzoom',
      face: '⊙',
      name: 'Reset Zoom',
      keys: ['Home'],
      description: 'Back to the default zoom. The wheel and Page Up / Page Down zoom in and out.',
      onPress: () => this.cam.resetZoom(),
    });
    for (let i = 0; i < CAMERA_SLOTS; i++) {
      const key = `F${5 + i}`;
      util({
        id: `cam${i}`,
        face: String(i + 1),
        name: `Camera Location ${i + 1}`,
        keys: [key],
        description: `Left click or ${key}: jump to the saved view. Right click or group key (\`) + ${key}: save the current view here.`,
        className: 'cam',
        onPress: () => (this.input.held('Backquote') ? this.saveCamera(i) : this.jumpCamera(i)),
        onRightClick: () => this.saveCamera(i),
      });
    }
    util({ id: 'menu', face: '☰', name: 'Menu', keys: ['F10'], description: 'Settings, hotkeys, full screen and quitting. Releases the cursor.', onPress: () => this.openMenu() });

    // Top right: Allies and Send resources (multiplayer), and the resource list toggle.
    const top = (def: Parameters<ButtonRegistry['add']>[0], reason?: string): HudButton => {
      const b = this.buttons.add({ ...def, className: `top ${def.className ?? ''}` });
      if (reason) b.setEnabled(false, reason);
      L.topRightButtons.append(b.el);
      return b;
    };
    top({ id: 'allies', face: 'Allies', name: 'Allies', keys: [], description: 'Diplomacy and shared control with the other players. No hotkey yet.' }, 'Comes with multiplayer (milestone 9).');
    top({ id: 'send', face: 'Send', name: 'Send resources', keys: [], description: 'Give resources to another player. No hotkey yet.' }, 'Comes with multiplayer (milestone 9).');
    const more = this.buttons.add({
      id: 'resources',
      face: '▾',
      name: 'All resources',
      keys: [],
      description: 'Show or hide every resource type. No hotkey yet.',
      className: 'res-toggle',
      onPress: () => this.toggleResources(),
    });
    L.resourceBar.append(more.el);

    // Selection panel corner: clear the selection (mouse version of Esc / F3).
    const clear = this.buttons.add({
      id: 'clear',
      face: '✕',
      name: 'Clear selection',
      keys: k('clear'),
      description: 'Deselect everything. Esc does the same when no order is pending.',
      className: 'clear',
      onPress: () => this.selection.clear(),
    });
    L.selectionCorner.append(clear.el);

    // Command card: 15 slots whose meaning follows the selection.
    for (let i = 0; i < 15; i++) {
      const b = this.buttons.add({ id: `card${i}`, face: '', name: '', keys: [], description: '', className: 'cmd' });
      b.el.hidden = true;
      L.commandSlots[i]!.append(b.el);
      this.cardButtons.push(b);
    }
  }

  /** Hotkeys were rebound in the menu: the buttons show the new keys. */
  private rebind(): void {
    for (const [id, action] of [
      ['idle', 'idle'],
      ['army', 'army'],
      ['townhall', 'townhall'],
      ['follow', 'follow'],
      ['home', 'home'],
      ['clear', 'clear'],
    ] as const) {
      const b = this.buttons.get(id);
      if (b) b.redefine({ ...b.def, keys: [keyFor(this.settings.keys, action)] });
    }
    this.cardDirty = true;
  }

  // ---- Selection helpers ----

  private activeType(): string | null {
    const list = this.selection.list().filter((t) => isOwn(t, this.player));
    if (list.length === 0) return null;
    const groups = subgroups(list);
    if (this.active && groups.some((g) => g.typeKey === this.active)) return this.active;
    return groups[0]!.typeKey;
  }

  private setActive(typeKey: string): void {
    this.active = typeKey;
    this.commands.reset();
    this.cardDirty = true;
    this.selectionDirty = true;
  }

  /** Tab / Shift + Tab: the next or previous subgroup. */
  private cycleSubgroup(back: boolean): void {
    const groups = subgroups(this.selection.list().filter((t) => isOwn(t, this.player)));
    if (groups.length < 2) return;
    const cur = groups.findIndex((g) => g.typeKey === this.activeType());
    const next = groups[(cur + (back ? groups.length - 1 : 1)) % groups.length]!;
    this.setActive(next.typeKey);
  }

  private health(t: Selectable): [number, number] | null {
    const u = entityIdOf(t.key);
    if (u !== null) {
      const info = this.game.unit(u);
      return info ? [info.hp, info.maxHp] : null;
    }
    const b = this.buildingOf(t);
    return b ? [b.hp, b.maxHp] : null;
  }

  private buildingOf(t: Selectable): ReturnType<GameInfo['buildings']['get']> {
    const id = buildingIdOf(t.key);
    return id === null ? undefined : this.game.buildings.get(id);
  }

  private portraitClick(t: Selectable, p: ButtonPress): void {
    const list = this.selection.list();
    if (p.ctrl && p.shift) this.selection.set(list.filter((x) => x.typeKey !== t.typeKey));
    else if (p.ctrl) this.selection.set(list.filter((x) => x.typeKey === t.typeKey));
    else if (p.shift) this.selection.set(list.filter((x) => x.key !== t.key));
    else this.selection.set([t]);
  }

  private centreOn(list: readonly Selectable[]): void {
    if (list.length === 0) return;
    let x = 0;
    let z = 0;
    for (const t of list) {
      x += t.centre.x;
      z += t.centre.z;
    }
    this.jumpTo(x / list.length, z / list.length);
  }

  private jumpTo(x: number, z: number): void {
    this.setFollow(null);
    this.cam.jumpTo(x, z);
  }

  // ---- Commands ----

  private queued(): boolean {
    return this.queueMode || this.input.held('ShiftLeft') || this.input.held('ShiftRight');
  }

  /** What is under a screen point, and the ground there. */
  private under(p: Pt): { item: Selectable | null; ground: THREE.Vector3 | null } {
    const hit = pickAt(this.items, p);
    return { item: hit?.item ?? null, ground: this.cam.pick(p) };
  }

  private setQueueMode(on: boolean): void {
    this.queueMode = on;
    this.buttons.get('queue')?.setLit(on);
  }

  private selectArmy(): void {
    const army: Selectable[] = [];
    for (const t of this.world.selectables.candidates()) if (t.kind === 'unit' && t.owner === this.player && t.typeKey === 'warrior') army.push(t);
    if (army.length === 0) this.message('You have no warriors yet.');
    else this.selection.set(army);
  }

  /** F1: the next idle worker, centred; Shift or a double click: all of them. */
  private selectIdle(all: boolean): void {
    const ids = this.game.idleWorkers();
    const list = ids.map((id) => this.fresh.get(`e:${id}`)).filter((t): t is Selectable => t !== undefined);
    if (list.length === 0) {
      this.message('No gatherer is idle.');
      return;
    }
    if (all) {
      this.selection.set(list);
      return;
    }
    const t = list[this.idleCycle++ % list.length]!;
    this.selection.set([t]);
    this.centreOn([t]);
  }

  /** Backspace: centre on the main base; again for the next one. */
  private townHall(): void {
    const bases = this.game.mainBases();
    if (bases.length === 0) {
      this.message('You have no main base.');
      return;
    }
    const b = bases[this.townCycle++ % bases.length]!;
    const c = GameInfo.centre(b, COLUMN_M);
    this.jumpTo(c.x, c.z);
  }

  /** Space: the latest urgent message; again to step back through the last 8. */
  private jumpUrgent(): void {
    if (this.urgent.length === 0) {
      this.message('No urgent messages.');
      return;
    }
    this.urgentAt = (this.urgentAt + 1) % this.urgent.length;
    const u = this.urgent[this.urgentAt]!;
    this.jumpTo(u.x, u.z);
  }

  private toggleFollow(): void {
    if (this.followKey) {
      this.setFollow(null);
      return;
    }
    const first = this.selection.list().find((t) => t.kind === 'unit') ?? this.selection.list()[0];
    if (!first) {
      this.message('Select a unit to follow.');
      return;
    }
    this.setFollow(first.key);
  }

  private setFollow(key: string | null): void {
    this.followKey = key;
    this.buttons.get('follow')?.setLit(key !== null);
  }

  private saveCamera(i: number): void {
    this.cameraSlots[i] = this.cam.view();
    this.buttons.get(`cam${i}`)?.el.classList.add('saved');
    this.message(`Camera location ${i + 1} saved.`);
  }

  private jumpCamera(i: number): void {
    const v = this.cameraSlots[i];
    if (!v) {
      this.message(`Camera location ${i + 1} is empty: right click it, or press \` + F${5 + i}, to save the view.`);
      return;
    }
    this.setFollow(null);
    this.cam.setView(v);
  }

  private toggleResources(): void {
    this.resourcesOpen = !this.resourcesOpen;
    this.layout.resourceAll.hidden = !this.resourcesOpen;
    this.buttons.get('resources')?.setLit(this.resourcesOpen).setFace(this.resourcesOpen ? '▴' : '▾');
    this.panels.measure();
  }

  private openMenu(): void {
    if (this.menu.isOpen) return;
    this.selector.cancel();
    this.commands.reset();
    this.menu.show(true);
    this.input.setMode('menu');
  }

  private closeMenu(): void {
    if (!this.menu.isOpen) return;
    this.menu.show(false);
    this.input.setMode('game');
    this.input.requestLock();
  }

  // ---- Keyboard ----

  private keyDown(id: string, ev: KeyboardEvent): void {
    if (this.menu.isOpen) {
      if (this.menu.capturing) return;
      if (id === 'Escape' || id === 'F10') this.closeMenu();
      return;
    }
    if (id === 'Escape') {
      // Esc backs out of a pending order, ghost or menu first, then clears the selection.
      if (this.selector.dragging) this.selector.cancel();
      else if (this.commands.back()) this.cardDirty = true;
      else if (this.resourcesOpen) this.toggleResources();
      else this.selection.clear();
      return;
    }
    if (id === 'PageUp' || id === 'PageDown') {
      this.cam.zoomBy(Math.pow(ZOOM_STEP, (id === 'PageUp' ? -1 : 1) * this.settings.zoomSpeed), null);
      return;
    }
    if (ev.repeat) return;
    // Ctrl, Cmd and Alt combinations belong to the browser (no game control uses them).
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.groups.key(id, this.input.held('Backquote'), ev.shiftKey)) return;
    const k = (action: string): string => keyFor(this.settings.keys, action);
    if (id === k('subgroup')) return this.cycleSubgroup(ev.shiftKey);
    if (id === k('urgent')) return this.jumpUrgent();
    const press: ButtonPress = { shift: ev.shiftKey, ctrl: false };
    // In a build menu the grid keys go by key position.
    const grid = this.cardButtons.find((b) => !b.el.hidden && b.def.keys[0] === ev.code && b.el.classList.contains('grid'));
    const btn = grid ?? this.buttons.forKey(id);
    if (!btn) return;
    const now = performance.now();
    const twice = this.lastKey.id === id && now - this.lastKey.t <= DOUBLE_TAP_MS;
    this.lastKey = { id, t: now };
    if (twice && btn.def.onDoubleClick && btn.enabled) btn.def.onDoubleClick(press);
    else this.input.pressButton(btn, press);
  }

  // ---- Mouse ----

  private gameMouse(): MouseTarget {
    return {
      down: (button, p) => {
        if (button === Btn.Left) {
          if (this.commands.placing) {
            this.leftConsumed = true;
            this.commands.placeDown();
          } else if (this.commands.targeting) {
            this.leftConsumed = true;
            const u = this.under(p);
            this.commands.confirmTarget(u.item, u.ground);
          } else {
            this.selector.down(p);
          }
        } else if (button === Btn.Middle) {
          this.middleDrag = true;
          this.setFollow(null);
          this.cam.grabStart(p);
        } else if (button === Btn.Right) {
          if (this.commands.placing) this.commands.endPlacing();
          else if (this.commands.targeting) this.commands.back();
          else if (!this.selector.dragging) {
            const u = this.under(p);
            this.commands.smart(u.item, u.ground);
          }
        }
      },
      move: (p) => {
        this.selector.move(p);
        if (this.middleDrag) this.cam.grabMove(p);
      },
      up: (button, p, mods: Mods) => {
        if (button === Btn.Left) {
          if (this.leftConsumed) {
            this.leftConsumed = false;
            if (this.commands.placing) this.commands.placeUp();
          } else this.selector.up(p, mods);
        } else if (button === Btn.Middle) {
          this.middleDrag = false;
          this.cam.grabEnd();
        }
      },
      wheel: (p, dy) => {
        this.cam.zoomBy(Math.pow(ZOOM_STEP, (dy / 100) * this.settings.zoomSpeed), p);
      },
    };
  }

  private minimapMouse(): MouseTarget {
    const groundAt = (p: Pt): THREE.Vector3 => {
      const w = this.minimap.toWorld(p);
      return new THREE.Vector3(w.x, this.extras.heightAt(w.x, w.z), w.z);
    };
    return {
      down: (button, p) => {
        const at = groundAt(p);
        if (button === Btn.Left) {
          if (this.commands.targeting) {
            this.commands.confirmTarget(null, at);
            return;
          }
          this.minimapSlide = true;
          this.setFollow(null);
          this.cam.jumpTo(at.x, at.z);
        } else if (button === Btn.Right) {
          if (this.commands.placing) this.commands.endPlacing();
          else if (this.commands.targeting) this.commands.back();
          else this.commands.smart(null, at);
        }
      },
      move: (p) => {
        if (!this.minimapSlide) return;
        const at = groundAt(p);
        this.cam.jumpTo(at.x, at.z);
      },
      up: (button) => {
        if (button === Btn.Left) this.minimapSlide = false;
      },
    };
  }

  // ---- Frame ----

  /** Once a frame, before rendering. */
  frame(dt: number, now: number): void {
    this.panels.measure();
    const panelRects = this.panels.rects();
    const pos = this.input.pos;
    const playing = this.input.mode === 'game';

    // Arrow keys pan at any time in play, even during a drag; edge panning waits 0.1 s and pauses for drags and menus.
    let panX = 0;
    let panY = 0;
    let moved = false;
    if (playing) {
      const ax = (this.input.held('ArrowRight') ? 1 : 0) - (this.input.held('ArrowLeft') ? 1 : 0);
      const ay = (this.input.held('ArrowDown') ? 1 : 0) - (this.input.held('ArrowUp') ? 1 : 0);
      if (ax || ay) {
        const k = (this.cam.panSpeed() * this.settings.arrowPanSpeed * dt) / Math.hypot(ax, ay);
        panX += ax * k;
        panY += ay * k;
        moved = true;
      }
    }
    const edgeOk =
      playing &&
      this.settings.edgePan &&
      this.input.inWindow &&
      !this.selector.dragging &&
      !this.middleDrag &&
      !this.minimapSlide &&
      !this.input.gameCaptured(Btn.Left);
    this.edgeDir = edgeOk ? edgePanDirection(pos.x, pos.y, this.width, this.height, panelRects) : null;
    if (this.edgeDir) {
      if (this.edgeSince < 0) this.edgeSince = now;
      // Pan only for the time spent in the zone beyond the delay.
      const t = Math.min(dt, (now - this.edgeSince) / 1000 - EDGE_DELAY_S);
      if (t > 0) {
        const { dx, dy } = this.edgeDir;
        const k = (this.cam.panSpeed() * this.settings.edgePanSpeed * t) / Math.hypot(dx, dy);
        panX += dx * k;
        panY += dy * k;
        moved = true;
      }
    } else {
      this.edgeSince = -1;
    }
    if (moved) {
      // Screen right is world +x and screen down is world +z: the camera never rotates.
      this.setFollow(null);
      this.cam.panBy(panX, panY);
    }

    // This frame's candidates and their snapshots.
    this.fresh.clear();
    for (const t of this.world.selectables.candidates()) this.fresh.set(t.key, t);
    this.selection.refresh(this.fresh);
    if (this.followKey) {
      const t = this.fresh.get(this.followKey);
      if (t) this.cam.jumpTo(t.centre.x, t.centre.z);
      else this.setFollow(null);
    }

    this.cam.update(dt);
    if (this.middleDrag) this.cam.grabMove(pos);
    projectCandidates(this.fresh.values(), this.cam, this.width, this.height, panelRects, this.items);

    const inGameView = playing && this.input.inWindow && this.panels.at(pos) === null;
    this.selector.hover(pos);
    this.selector.frame(inGameView && !this.commands.placing);
    this.visuals.update(this.selection.list(), this.selector.highlighted, this.player, now);
    this.minimap.draw(this.cam.footprint());

    // The placement ghost follows the cursor over the game view.
    const ghost = this.commands.updatePlacing(inGameView ? this.cam.pick(pos) : null, now);
    this.extras.setGhost(ghost);
    this.drawOverlay(ghost);

    // Cursor shape.
    const overMinimap = playing && this.input.inWindow && this.overMinimapCanvas(pos);
    const t = this.commands.targeting;
    if (t && (inGameView || overMinimap)) this.input.cursor.setShape({ kind: 'target', colour: t.command === 'rally' ? TARGET_YELLOW : TARGET_GREEN });
    else if (this.edgeDir) this.input.cursor.setShape({ kind: 'pan', dx: this.edgeDir.dx, dy: this.edgeDir.dy });
    else this.input.cursor.setShape({ kind: 'arrow' });

    if (this.selectionDirty) {
      this.selectionDirty = false;
      this.refreshSelectionPanel();
      this.lastPanelText = now;
    } else if (now - this.lastPanelText > 250) {
      // Labels and health change: refresh the text now and then.
      this.lastPanelText = now;
      this.refreshSelectionPanel();
    }
    if (this.cardDirty) {
      this.cardDirty = false;
      this.refreshCommandCard();
    }
  }

  /** Rally routes of selected buildings, Shift queue paths of selected units, claimed land and light rings while placing. */
  private drawOverlay(ghost: Ghost | null): void {
    const o = this.extras.overlay;
    const h = (x: number, z: number): number => this.extras.heightAt(x, z);
    o.begin();
    const lift = 0.15;
    const pt = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, h(x, z) + lift, z);
    for (const t of this.selection.list()) {
      const b = this.buildingOf(t);
      if (b && b.owner === this.player && b.rally.length > 0) {
        let from = pt(t.centre.x, t.centre.z);
        for (const r of b.rally) {
          const to = this.rallyPoint(r);
          if (!to) continue;
          o.dashed(from, to, RALLY);
          o.ring(to.x, to.z, 0.5, RALLY, h);
          from = to;
        }
      }
    }
    if (this.queued()) {
      for (const t of this.selection.list()) {
        const id = entityIdOf(t.key);
        if (id === null || t.owner !== this.player) continue;
        const q = this.game.queues.get(id);
        if (!q || q.length === 0) continue;
        let from = pt(t.centre.x, t.centre.z);
        for (const ord of q) {
          const to = this.orderPoint(ord);
          if (!to) continue;
          o.line(from, to, QUEUE);
          from = to;
        }
      }
    }
    if (ghost) {
      // Claimed land: lit torches' circles and buildings' 10 m rectangles.
      const claims = this.game.info?.claims;
      if (claims) {
        for (const [x, z, r] of claims.circles) o.ring(x / WU_PER_METRE, z / WU_PER_METRE, r / WU_PER_METRE, CLAIM, h);
        for (const [x0, z0, x1, z1] of claims.rects) {
          const a = x0 / WU_PER_METRE;
          const b = z0 / WU_PER_METRE;
          const c = x1 / WU_PER_METRE;
          const d = z1 / WU_PER_METRE;
          o.rect(a, b, c, d, h((a + c) / 2, (b + d) / 2) + 0.2, CLAIM);
        }
      }
      const spec = buildingSpec(ghost.kind);
      const light = spec.light;
      for (const s of ghost.spots) {
        const cx = (s.x + spec.w / 2) * COLUMN_M;
        const cz = (s.z + spec.d / 2) * COLUMN_M;
        if (light) {
          o.ring(cx, cz, light.lightM, LIGHT, h);
          if (light.claimM > 0) o.ring(cx, cz, light.claimM, CLAIM, h);
        } else if (spec.kind !== BuildingKind.TorchPost) {
          // Every building claims the land 10 m round it.
          const g = 10;
          o.rect(s.x * COLUMN_M - g, s.z * COLUMN_M - g, (s.x + spec.w) * COLUMN_M + g, (s.z + spec.d) * COLUMN_M + g, h(cx, cz) + 0.2, CLAIM);
        }
      }
    }
    o.end();
  }

  private rallyPoint(r: { t: 'ground'; x: number; z: number } | { t: 'unit'; id: number } | { t: 'node'; cx: number; cz: number; i: number }): THREE.Vector3 | null {
    if (r.t === 'ground') return this.groundPoint(r.x / WU_PER_METRE, r.z / WU_PER_METRE);
    if (r.t === 'unit') {
      const u = this.game.unit(r.id);
      return u ? this.groundPoint(u.x / WU_PER_METRE, u.z / WU_PER_METRE) : null;
    }
    const n = this.extras.node(r.cx, r.cz, r.i);
    return n ? this.groundPoint(n.centre.x, n.centre.z) : null;
  }

  private groundPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.extras.heightAt(x, z) + 0.15, z);
  }

  /** Where a queued order happens, for the Shift queue lines. */
  private orderPoint(o: import('@blockyrts/sim').UnitOrder): THREE.Vector3 | null {
    switch (o.t) {
      case 'move':
        return this.groundPoint(o.x / WU_PER_METRE, o.z / WU_PER_METRE);
      case 'follow': {
        const u = this.game.unit(o.id);
        return u ? this.groundPoint(u.x / WU_PER_METRE, u.z / WU_PER_METRE) : null;
      }
      case 'gather': {
        const n = this.extras.node(o.cx, o.cz, o.i);
        return n ? this.groundPoint(n.centre.x, n.centre.z) : null;
      }
      case 'build': {
        const s = buildingSpec(o.kind);
        return this.groundPoint((o.x + s.w / 2) * COLUMN_M, (o.z + s.d / 2) * COLUMN_M);
      }
      case 'work':
      case 'dropoff':
      case 'enter':
      case 'job':
      case 'refuel':
      case 'train': {
        const b = this.game.buildings.get(o.b);
        if (!b) return null;
        const c = GameInfo.centre(b, COLUMN_M);
        return this.groundPoint(c.x, c.z);
      }
      default:
        return null;
    }
  }

  private overMinimapCanvas(p: Pt): boolean {
    const r = this.layout.minimapEl.getBoundingClientRect();
    return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
  }

  // ---- Panels ----

  private refreshSelectionPanel(): void {
    const list = this.selection.list();
    this.buttons.get('clear')?.el.classList.toggle('idle', list.length === 0);
    this.panel.render(list, this.activeType(), [
      `Left click or drag to select. Double click or ${CTRL_NAME} + click: all of that type on screen.`,
      'Right click to give orders. Shift adds to the selection and queues orders.',
      'F1: an idle gatherer. Backspace: your main base. ` + 1 to 0: save a control group.',
    ]);
  }

  private refreshCommandCard(): void {
    const card: Card = this.commands.card();
    for (let i = 0; i < 15; i++) {
      const b = this.cardButtons[i]!;
      const e = card[i];
      if (!e) {
        b.el.hidden = true;
        continue;
      }
      b.redefine({
        id: `card${i}`,
        face: e.face,
        name: e.name,
        keys: [e.key],
        description: e.description,
        className: `cmd${e.grid ? ' grid' : ''}${e.action === 'cancel' || e.action === 'cancelBuild' ? ' cancel' : ''}${e.short ? ' short' : ''}`,
        onPress: (p) => e.run(p),
        ...(e.double ? { onDoubleClick: (p: ButtonPress) => e.double!(p) } : {}),
      });
      b.setEnabled(e.enabled, e.reason);
      b.setLit(e.lit === true);
      b.el.hidden = false;
    }
    this.input.refreshHover();
  }
}

function formatClock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
