// The game shell: wires the input manager, camera, HUD, selection and minimap
// together and runs them once a frame. Everything about the world comes in
// through WorldHooks (see main.ts for the M0 stand-ins), and orders go out
// through issueOrder.
import * as THREE from 'three';
import { WU_PER_METRE, type Order } from '@blockyrts/sim';
import { EDGE_DELAY_S, edgePanDirection, type PanDir } from '../camera/edge-pan.ts';
import { RtsCamera, ZOOM_STEP, type CameraView } from '../camera/rts-camera.ts';
import { Btn, InputManager, type Mods, type MouseTarget } from '../input/input-manager.ts';
import { CTRL_NAME } from '../input/platform.ts';
import { Minimap } from '../minimap/minimap.ts';
import { SelectionController } from '../selection/controller.ts';
import { projectCandidates } from '../selection/project.ts';
import { isOwn, type ScreenItem } from '../selection/rules.ts';
import { SelectionSet } from '../selection/selection.ts';
import {
  entityIdOf,
  NOBODY,
  type CameraLimits,
  type GroundPicker,
  type MinimapSource,
  type Selectable,
  type SelectableSource,
} from '../selection/types.ts';
import { SelectionVisuals } from '../selection/visuals.ts';
import type { Settings } from '../settings/settings.ts';
import { ButtonRegistry, Tooltip, type ButtonPress, type HudButton } from './buttons.ts';
import { buildLayout, type HudLayout } from './layout.ts';
import { GameMenu } from './menu.ts';
import { HudPanels } from './panels.ts';
import type { Pt } from './rects.ts';

/** What the shell needs from the world. main.ts supplies M0 stand-ins; the generated world replaces them. */
export interface WorldHooks {
  ground: GroundPicker;
  selectables: SelectableSource;
  minimap: MinimapSource;
  limits(): CameraLimits;
}

// TODO: import StopOrder from @blockyrts/sim once the sim has the 'stop' order kind.
export interface StopOrder {
  kind: 'stop';
  player: number;
  units: number[];
}
export type ShellOrder = Order | StopOrder;

export interface ShellOptions {
  scene: THREE.Scene;
  world: WorldHooks;
  /** Sends an order to the sim. queued: Shift was held or Queue Mode is lit (no order queue in the sim yet). */
  issueOrder(order: ShellOrder, opts: { queued: boolean }): void;
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

type Targeting = { command: 'move'; key: string } | null;

const MAX_MESSAGES = 60;
const CAMERA_SLOTS = 4;
const TARGET_GREEN = '#5ee06a';

export class GameShell {
  readonly cam: RtsCamera;
  readonly panels = new HudPanels();
  readonly buttons = new ButtonRegistry();
  readonly selection = new SelectionSet();
  readonly input: InputManager;
  readonly layout: HudLayout;
  private readonly tooltip: Tooltip;
  private readonly menu: GameMenu;
  private readonly minimap: Minimap;
  private readonly visuals: SelectionVisuals;
  private readonly selector: SelectionController;
  private world: WorldHooks;
  private readonly settings: Settings;
  private readonly player: number;

  private items: ScreenItem<Selectable>[] = [];
  private readonly fresh = new Map<string, Selectable>();
  private targeting: Targeting = null;
  /** Set when a left press confirmed a targeted order, so its release does not also select. */
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
  private lastPanelText = 0;
  private width = 1;
  private height = 1;
  private readonly startedAt = performance.now();

  constructor(
    parent: HTMLElement,
    private readonly opts: ShellOptions,
  ) {
    this.world = opts.world;
    this.settings = opts.settings;
    this.player = opts.player;
    this.layout = buildLayout(parent, this.panels);
    this.tooltip = new Tooltip(parent);
    this.cam = new RtsCamera(() => this.world.limits(), this.world.ground);
    this.visuals = new SelectionVisuals(opts.scene);
    this.minimap = new Minimap(this.layout.minimapEl, this.world.minimap);
    this.selector = new SelectionController(
      this.cam,
      this.panels,
      this.selection,
      this.player,
      () => this.items,
      this.layout.dragBox,
    );
    this.menu = new GameMenu(parent, this.settings, {
      resume: () => this.closeMenu(),
      quit: () => opts.onQuit(),
    });
    this.input = new InputManager(
      {
        game: this.gameMouse(),
        hudPress: (_panel, button, area) => {
          // Clicking a HUD panel other than the minimap cancels a targeted command.
          if (this.targeting && area !== 'minimap' && button !== Btn.Middle) this.cancelTargeting();
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
    this.buildButtons();
    this.selection.onChange(() => {
      this.selectionDirty = true;
      this.setQueueMode(false);
    });
    this.refreshSelectionPanel();
    this.refreshCommandCard();
  }

  /** Swaps the world hooks (the generated world replacing the stand-ins). */
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

  // ---- Messages and readouts ----

  /** Adds a system message to the message panel. */
  message(text: string, kind: 'system' | 'alert' = 'system'): void {
    const list = this.layout.messageList;
    const row = document.createElement('div');
    row.className = `msg ${kind}`;
    const t = document.createElement('span');
    t.className = 'msg-time';
    t.textContent = formatClock((performance.now() - this.startedAt) / 1000);
    row.append(t, document.createTextNode(text));
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
    list.append(row);
    while (list.childElementCount > MAX_MESSAGES) list.firstElementChild!.remove();
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
    // The day cycle comes later (M2); for now the clock shows Day 1 and the game time from the step counter.
    setText(this.layout.clockTime, formatClock(info.step / 20));
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
    util(
      {
        id: 'idle',
        face: '⚒',
        name: 'Idle Gatherer',
        keys: ['F1'],
        description: 'Select an idle gatherer and centre on it; again for the next. Shift + F1 or double click: all of them.',
      },
      'Comes with workers (M2).',
    );
    util({
      id: 'army',
      face: '⚔',
      name: 'Select Army',
      keys: ['F2'],
      description: 'Select every combat unit you own (gatherers excluded).',
      onPress: () => this.selectArmy(),
    });
    util(
      {
        id: 'townhall',
        face: '⌂',
        name: 'Town Hall',
        keys: ['Backspace'],
        description: 'Centre the camera on your town hall; again to cycle through them.',
      },
      'Comes with the main base (M2).',
    );
    util({
      id: 'follow',
      face: '◎',
      name: 'Follow',
      keys: ['KeyL'],
      description: 'Keep the camera on the selected unit until you pan or press L again.',
      onPress: () => this.toggleFollow(),
    });
    util({
      id: 'queue',
      face: '⇶',
      name: 'Queue Mode',
      keys: [],
      badge: 'Shift',
      description:
        'While lit, every order is added to the queue as if Shift were held. Click again to turn it off; it also turns off when the selection changes.',
      onPress: () => this.setQueueMode(!this.queueMode),
    });
    util(
      {
        id: 'autoequip',
        face: '⚙',
        name: 'Auto-Equip',
        keys: ['F4'],
        description: 'Toggle units picking the best equipment from the pool by themselves.',
      },
      'Comes with equipment (M3).',
    );
    util(
      {
        id: 'rations',
        face: '▤',
        name: 'Rations',
        keys: ['F9'],
        description: 'Cycle the food ration setting.',
      },
      'Comes with food and supply (M4).',
    );
    util(
      {
        id: 'home',
        face: '⇊',
        name: 'Everyone Home',
        keys: ['KeyJ'],
        description: 'At dusk, send every worker to shelter.',
      },
      'Comes with the day and night (M2).',
    );
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
    util({
      id: 'menu',
      face: '☰',
      name: 'Menu',
      keys: ['F10'],
      description: 'Settings, full screen and quitting. Releases the cursor.',
      onPress: () => this.openMenu(),
    });

    // Top right: Allies and Send resources (multiplayer), and the resource list toggle.
    const top = (def: Parameters<ButtonRegistry['add']>[0], reason?: string): HudButton => {
      const b = this.buttons.add({ ...def, className: `top ${def.className ?? ''}` });
      if (reason) b.setEnabled(false, reason);
      L.topRightButtons.append(b.el);
      return b;
    };
    top(
      { id: 'allies', face: 'Allies', name: 'Allies', keys: [], description: 'Diplomacy and shared control with the other players. No hotkey yet.' },
      'Comes with multiplayer (M9).',
    );
    top(
      { id: 'send', face: 'Send', name: 'Send resources', keys: [], description: 'Give resources to another player. No hotkey yet.' },
      'Comes with multiplayer (M9).',
    );
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
      keys: ['F3'],
      description: 'Deselect everything. Esc does the same when no order is pending.',
      className: 'clear',
      onPress: () => this.selection.clear(),
    });
    L.selectionCorner.append(clear.el);

    // Command card: the movement row is always in the same five places; Cancel goes bottom right.
    const cmd = (slot: number, def: Parameters<ButtonRegistry['add']>[0], reason?: string): void => {
      const b = this.buttons.add({ ...def, className: `cmd ${def.className ?? ''}` });
      if (reason) b.setEnabled(false, reason);
      b.el.hidden = true;
      L.commandSlots[slot]!.append(b.el);
    };
    cmd(0, { id: 'cmd-attack', face: 'Attack', name: 'Attack', keys: ['KeyA'], description: 'Click an enemy to attack it, or ground to attack-move.' }, 'Comes with combat (M3).');
    cmd(1, {
      id: 'cmd-stop',
      face: 'Stop',
      name: 'Stop',
      keys: ['KeyS'],
      description: 'Cancel every queued order; units stand still but fight back.',
      onPress: () => this.stopOrder(),
    });
    cmd(2, { id: 'cmd-hold', face: 'Hold', name: 'Hold Position', keys: ['KeyH'], description: 'Cancel every order and never move, not even to chase.' }, 'Comes with combat (M3).');
    cmd(3, { id: 'cmd-patrol', face: 'Patrol', name: 'Patrol', keys: ['KeyP'], description: 'Walk back and forth between here and a point, fighting on the way.' }, 'Comes with combat (M3).');
    cmd(4, {
      id: 'cmd-move',
      face: 'Move',
      name: 'Move',
      keys: ['KeyM'],
      description: 'Then left click ground or the minimap to move there. Right click or Esc cancels. Hold M (or Shift) to give several.',
      onPress: () => this.startTargeting('KeyM'),
    });
    cmd(14, {
      id: 'cmd-cancel',
      face: 'Cancel',
      name: 'Cancel',
      keys: ['Escape'],
      description: 'Cancel the command waiting for a target. Right click does the same.',
      className: 'cancel',
      onPress: () => this.cancelTargeting(),
    });
  }

  // ---- Commands ----

  private ownUnits(): Selectable[] {
    return this.selection.list().filter((t) => t.kind === 'unit' && t.owner === this.player);
  }

  private ownUnitIds(): number[] {
    const ids: number[] = [];
    for (const t of this.ownUnits()) {
      const id = entityIdOf(t.key);
      if (id !== null) ids.push(id);
    }
    return ids;
  }

  private queued(): boolean {
    return this.queueMode || this.input.held('ShiftLeft') || this.input.held('ShiftRight');
  }

  /** A move order for the selected own units; false when there is nobody to order. */
  private moveTo(at: THREE.Vector3): boolean {
    const units = this.ownUnitIds();
    if (units.length === 0) return false;
    this.opts.issueOrder(
      { kind: 'move', player: this.player, units, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE) },
      { queued: this.queued() },
    );
    this.visuals.orderMarker(at);
    return true;
  }

  private stopOrder(): void {
    const units = this.ownUnitIds();
    if (units.length > 0) this.opts.issueOrder({ kind: 'stop', player: this.player, units }, { queued: false });
  }

  /** Right click: the smart order for what is under the cursor. In M1 that is a move to the ground. */
  private smartOrder(at: THREE.Vector3 | null): void {
    if (at) this.moveTo(at);
  }

  private startTargeting(key: string): void {
    if (this.ownUnits().length === 0) return;
    this.targeting = { command: 'move', key };
    this.refreshCommandCard();
  }

  private cancelTargeting(): void {
    if (!this.targeting) return;
    this.targeting = null;
    this.refreshCommandCard();
  }

  /** A left click confirmed the targeted command at a point; holding its key (or Shift) keeps it for the next click. */
  private confirmTarget(at: THREE.Vector3 | null): void {
    const t = this.targeting;
    if (!t || !at) return;
    if (t.command === 'move') this.moveTo(at);
    if (!this.input.held(t.key) && !this.input.held('ShiftLeft') && !this.input.held('ShiftRight')) this.cancelTargeting();
  }

  private setQueueMode(on: boolean): void {
    this.queueMode = on;
    this.buttons.get('queue')?.setLit(on);
  }

  private selectArmy(): void {
    const army: Selectable[] = [];
    for (const t of this.world.selectables.candidates()) {
      if (t.kind === 'unit' && t.owner === this.player && t.typeKey === 'warrior') army.push(t);
    }
    if (army.length === 0) this.message('You have no warriors yet.');
    else this.selection.set(army);
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
    this.cancelTargeting();
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
      if (id === 'Escape' || id === 'F10') this.closeMenu();
      return;
    }
    if (id === 'Escape') {
      // Esc backs out of a pending order first, then clears the selection.
      if (this.selector.dragging) this.selector.cancel();
      else if (this.targeting) this.cancelTargeting();
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
    const btn = this.buttons.forKey(id);
    if (btn) this.input.pressButton(btn, { shift: ev.shiftKey, ctrl: false } satisfies ButtonPress);
  }

  // ---- Mouse ----

  private gameMouse(): MouseTarget {
    return {
      down: (button, p) => {
        if (button === Btn.Left) {
          if (this.targeting) {
            this.leftConsumed = true;
            this.confirmTarget(this.cam.pick(p));
          } else {
            this.selector.down(p);
          }
        } else if (button === Btn.Middle) {
          this.middleDrag = true;
          this.setFollow(null);
          this.cam.grabStart(p);
        } else if (button === Btn.Right) {
          if (this.targeting) this.cancelTargeting();
          else if (!this.selector.dragging) this.smartOrder(this.cam.pick(p));
        }
      },
      move: (p) => {
        this.selector.move(p);
        if (this.middleDrag) this.cam.grabMove(p);
      },
      up: (button, p, mods: Mods) => {
        if (button === Btn.Left) {
          if (this.leftConsumed) this.leftConsumed = false;
          else this.selector.up(p, mods);
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
      return new THREE.Vector3(w.x, this.cam.focus.y, w.z);
    };
    return {
      down: (button, p) => {
        const at = groundAt(p);
        if (button === Btn.Left) {
          if (this.targeting) {
            this.confirmTarget(at);
            return;
          }
          this.minimapSlide = true;
          this.setFollow(null);
          this.cam.jumpTo(at.x, at.z);
        } else if (button === Btn.Right) {
          if (this.targeting) this.cancelTargeting();
          else this.smartOrder(at);
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
    this.selector.frame(inGameView);
    this.visuals.update(this.selection.list(), this.selector.highlighted, this.player, now);
    this.minimap.draw(this.cam.footprint());

    // Cursor shape.
    const overMinimap = playing && this.input.inWindow && this.overMinimapCanvas(pos);
    if (this.targeting && (inGameView || overMinimap)) this.input.cursor.setShape({ kind: 'target', colour: TARGET_GREEN });
    else if (this.edgeDir) this.input.cursor.setShape({ kind: 'pan', dx: this.edgeDir.dx, dy: this.edgeDir.dy });
    else this.input.cursor.setShape({ kind: 'arrow' });

    if (this.selectionDirty) {
      this.selectionDirty = false;
      this.refreshSelectionPanel();
      this.refreshCommandCard();
      this.lastPanelText = now;
    } else if (now - this.lastPanelText > 250) {
      // Labels can change (a node's yield going down): refresh the text now and then.
      this.lastPanelText = now;
      this.refreshSelectionPanel();
    }
  }

  private overMinimapCanvas(p: Pt): boolean {
    const r = this.layout.minimapEl.getBoundingClientRect();
    return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
  }

  // ---- Panels ----

  private refreshSelectionPanel(): void {
    const list = this.selection.list();
    const L = this.layout;
    if (list.length === 0) {
      setText(L.selectionTitle, 'Nothing selected');
      setHtmlRows(L.selectionBody, [
        { cls: 'hint', text: `Left click or drag to select. Double click or ${CTRL_NAME} + click: all of that type on screen.` },
        { cls: 'hint', text: 'Right click to give orders. Shift adds to the selection.' },
      ]);
      this.buttons.get('clear')?.el.classList.add('idle');
      return;
    }
    this.buttons.get('clear')?.el.classList.remove('idle');
    if (list.length === 1) {
      const t = list[0]!;
      setText(L.selectionTitle, t.label);
      const rows = (t.details ?? []).map((text) => ({ cls: '', text }));
      rows.push({ cls: 'owner', text: ownerText(t.owner, this.player) });
      if (!isOwn(t, this.player)) rows.push({ cls: 'hint', text: 'Not yours: you can look but not give orders.' });
      setHtmlRows(L.selectionBody, rows);
      return;
    }
    setText(L.selectionTitle, `${list.length} selected`);
    const groups = new Map<string, number>();
    for (const t of list) groups.set(t.label, (groups.get(t.label) ?? 0) + 1);
    setHtmlRows(
      L.selectionBody,
      [...groups].map(([label, n]) => ({ cls: 'group', text: `${n} × ${label}` })),
    );
  }

  private refreshCommandCard(): void {
    const own = this.ownUnits().length > 0;
    for (const id of ['cmd-attack', 'cmd-stop', 'cmd-hold', 'cmd-patrol', 'cmd-move']) {
      const b = this.buttons.get(id);
      if (b) b.el.hidden = !own;
    }
    const cancel = this.buttons.get('cmd-cancel');
    if (cancel) cancel.el.hidden = !this.targeting;
    this.buttons.get('cmd-move')?.setLit(this.targeting?.command === 'move');
    this.input.refreshHover();
  }
}

function ownerText(owner: number, player: number): string {
  if (owner === player) return 'Yours';
  if (owner === NOBODY) return 'Nobody’s';
  return `Player ${owner + 1}`;
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

function setHtmlRows(el: HTMLElement, rows: { cls: string; text: string }[]): void {
  const sig = rows.map((r) => `${r.cls}:${r.text}`).join('\n');
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.replaceChildren(
    ...rows.map((r) => {
      const d = document.createElement('div');
      d.className = `sel-row ${r.cls}`.trim();
      d.textContent = r.text;
      return d;
    }),
  );
}
