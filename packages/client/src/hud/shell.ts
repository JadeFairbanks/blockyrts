// The game shell: wires the input manager, camera, HUD, selection, minimap and
// the command card together and runs them once a frame. Everything about the
// world comes in through WorldHooks and the GameInfo copy of the sim's state;
// orders go out through issueOrder.
import * as THREE from 'three';
import {
  buildingSpec,
  clockAt,
  GOD_SPAWNS,
  nextMealIn,
  Period,
  RESOURCES,
  SiteKind,
  SPELLS,
  PEOPLE_UNITS,
  stretchBetween,
  TUNNEL_WIDTH_COLUMNS,
  UnitKind,
  WU_PER_METRE,
  troopOf,
  mageLock,
  mageOf,
  OrderKind,
  type HitEvent,
  type Order,
  type SimEvent,
} from '@blockyrts/sim';
import { cue } from '../audio/cues.ts';
import { EDGE_DELAY_S, edgePanDirection, type PanDir } from '../camera/edge-pan.ts';
import { RtsCamera, ZOOM_STEP, type CameraView } from '../camera/rts-camera.ts';
import { GameInfo } from '../game/game-info.ts';
import { godGhostRow } from '../game/god-ghost.ts';
import { keyFor } from '../input/bindings.ts';
import { keyLabel } from '../input/keys.ts';
import { Btn, InputManager, type Mods, type MouseTarget, type TouchHooks } from '../input/input-manager.ts';
import type { ToolCursor } from '../input/cursor.ts';
import { CTRL_NAME } from '../input/platform.ts';
import { KeyCode } from '../input/tester-code.ts';
import { UnitFlag, type InfoMessage } from '../messages.ts';
import { Minimap } from '../minimap/minimap.ts';
import { SelectionController } from '../selection/controller.ts';
import { projectCandidates } from '../selection/project.ts';
import { isOwn, pickAt, setSharedControl, type ScreenItem } from '../selection/rules.ts';
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
import { onSettingsChange, type Settings } from '../settings/settings.ts';
import type { Ghost } from '../world/buildings-view.ts';
import { COLUMN_M } from '../world/mesher.ts';
import type { Overlay } from '../world/overlay.ts';
import { AlliesUi } from './allies.ts';
import { ButtonRegistry, Tooltip, type ButtonPress, type HudButton } from './buttons.ts';
import { queueSeconds } from './queue-clock.ts';
import { ChatBox } from './chat.ts';
import { Commands, stretchBoxes, TERRAIN_UNIT_M, type Card } from './commands.ts';
import { ControlGroups } from './groups.ts';
import { applyGeometry, buildLayout, fitDebug, type Folds, type HudLayout } from './layout.ts';
import { buttonRoom, cardInner, fitButtons, hudLayout, type ButtonFit, type HudGeometry } from './hud-layout.ts';
import { SpeechBubbles, type Speaker } from './bubbles.ts';
import { remarkLine, remarkVoice, sceneOf } from './remarks.ts';
import { markEntry, WorldMarks, type MarkEntry, type MarkSource, type StackBar } from './world-marks.ts';
import { ATTACK_COLOUR, orderColour, OrderFlags, orderLines, RALLY_COLOUR, type Mover } from './order-lines.ts';
import { YesNoButtons } from './yes-no.ts';
import { MessagePanel, type MessageKind } from './message-panel.ts';
import { GameMenu } from './menu.ts';
import { PeoplesUi } from './peoples-ui.ts';
import { HudPanels } from './panels.ts';
import type { Pt } from './rects.ts';
import { InventoryUi } from './inventory-ui.ts';
import { typeWorth } from './worth.ts';
import { actionIcon } from './card-icons.ts';
import { siteTraces, sitesInOrders, TRACE_LIFT_M, TRACE_NUDGE_M } from './site-marks.ts';
import { doingActions } from './doing.ts';
import { speechToPanel } from './wording.ts';
import { goodIcon } from './inventory-icons.ts';
import { kitUrl } from './kit-icons.ts';
import type { PortraitSubject } from '../world/portrait-view.ts';

/** Each people's list of random remarks (Halflings, Runkin, Elves, Dwarves). */
const REMARK_KEYS = ['halfling', 'runkin', 'elf', 'dwarf'];

/** The Rations button face by setting: everyone, troops only, workers only. */
const RATIONS_FACES = ['▤', '⚔', '⚒'];
import { SelectionPanel, subgroups } from './selection-panel.ts';

/** What the shell needs from the world. */
export interface WorldHooks {
  ground: GroundPicker;
  selectables: SelectableSource;
  minimap: MinimapSource;
  /** What the cursor is over, or a drag box would pick, for its silhouette outline (Patch 5, UI-5). */
  hover?(list: readonly Selectable[]): void;
  limits(): CameraLimits;
}

/** The rest of the world the M2 controls draw on: heights, nodes, the ghost, planned buildings and overlay lines. */
export interface WorldExtras {
  heightAt(x: number, z: number): number;
  /** Whether a point (metres) is in sight of the players now (they share their vision). */
  seen(x: number, z: number): boolean;
  node(cx: number, cz: number, index: number): Selectable | undefined;
  setGhost(g: Ghost | null): void;
  /** Godmode's unit on the cursor: its state row standing at a point (metres), or nothing. */
  setUnitGhost(row: Int32Array | null, x: number, z: number): void;
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
  askPlacement(kind: number, variant: number, spots: Array<[number, number]>): void;
  settings: Settings;
  seed: number;
  players: number;
  /** The local player's index (0 is player 1). */
  player: number;
  /** Quit to the main menu, or leave an online game (after the player confirmed). */
  onQuit(): void;
  /** Online play, the players' names and colours, saving and pausing (game/match.ts). */
  session: ShellSession;
}

/** What the shell needs from the match around it. */
export interface ShellSession {
  online: boolean;
  /** The room's invite code, online. */
  code?: string | undefined;
  /** A player's name and CSS colour, by sim player. */
  name(p: number): string;
  colour(p: number): string;
  /** Sends a chat line to the other players; null when playing alone. */
  chat: ((text: string) => void) | null;
  /** Flashes a spot for every player (metres). */
  ping(x: number, z: number): void;
  save(): void;
  download(): void;
  /** Online: Pause or Resume for every player (alone, the menu is the pause). */
  togglePause(): void;
  /** Online: the player holding the pause, or null while nobody does. */
  pausedBy(): string | null;
  /** The game is stopped now, for whatever reason (alone: while the menu or the account form is open). */
  stopped(): boolean;
  /** Why saving is not possible here, or ''. */
  saveBlocked(): string;
  /** The menu opened or closed (alone, it pauses the game). */
  menuOpened(open: boolean): void;
}

export interface SimInfo {
  step: number;
  stepsPerSecond: number;
  hash: string;
  hashStep: number;
}

/** How the page is running, for the debug readout: averaged over the last second. */
export interface PerfInfo {
  fps: number;
  /** Main-thread time per frame (update and render), ms. */
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /** Units in the latest state, and how many of them are drawn. */
  units: number;
  /** JavaScript heap in use, MB (Chromium only), or -1. */
  heapMb: number;
}

/** Saved camera spots, F5 up: the fourth gave its place (F8) to Repair all in Jade's Patch 5 (GP-25). */
const CAMERA_SLOTS = 3;
/** Urgent messages F4 steps back through. */
const URGENT_KEEP = 8;
/** Meal bubbles at most this often, ms (patch 1, s): a hundred units eat about once a second between them. */
const MEAL_BUBBLE_GAP_MS = 1000;
const TARGET_GREEN = '#5ee06a';
const TARGET_YELLOW = '#f2d24b';
const TARGET_RED = '#e8503a';
/** Two presses of a command key within this time are a double tap (auto-target). */
const DOUBLE_TAP_MS = 300;
const RALLY = new THREE.Color(0xf2d24b);
const QUEUE = new THREE.Color(0x63e06b);
const LIGHT = new THREE.Color(0xff9a40);
const DIG = new THREE.Color(0xe08a3a);
const TUNNEL = new THREE.Color(0xb48ae8);

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
  private readonly messages: MessagePanel;
  private readonly bubbles: SpeechBubbles;
  private readonly marks: WorldMarks;
  private readonly markSource: MarkSource;
  /**
   * Other parts' progress bars in a thing's stack over the world (Patch 5, UI-18): each gives the bars for a
   * key ('e:<id>' or 'b:<id>'), in the order they stack, and the bar stack draws them with the rest.
   */
  readonly stackBars: Array<(key: string) => readonly StackBar[]> = [];
  readonly peoples: PeoplesUi;
  readonly allies: AlliesUi;
  readonly inventory: InventoryUi;
  readonly chat: ChatBox;
  /** Waiting for a spot to ping (the Ping button). */
  private pinging = false;
  private readonly visuals: SelectionVisuals;
  /** Patch 5 (GP-23): the flags at the ends of the selected units' orders and rally points, and the dots on attack targets. */
  private readonly flags: OrderFlags;
  private readonly selector: SelectionController;
  private readonly panel: SelectionPanel;
  private readonly cardButtons: HudButton[] = [];
  /** What each card button stands for, to mark what the selection is doing now (its action, or the product or troop a building makes). */
  private cardDoing: string[] = [];
  /** Selected units seen outside any building at the last info (CT-2, CT-3: leaveForBuildings). */
  private seenOut = new Set<string>();
  /** What the portrait shows (a unit or building key), and its window on screen (null until measured again). */
  private portraitKey: string | null = null;
  private portraitRect: DOMRect | null = null;
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
  /** The phone layout was in force at the last layout (the message panel folds once on the way in). */
  private phoneFolded = false;
  /** Touch controls: the next one-finger drag draws the selection box (the Box button). */
  private boxMode = false;
  private readonly cameraSlots: (CameraView | null)[] = Array.from({ length: CAMERA_SLOTS }, () => null);
  private selectionDirty = true;
  private cardDirty = true;
  private lastPanelText = 0;
  private width = 1;
  private height = 1;
  /** Where the panels go for this screen size, and the rows the card shows now. */
  private geometry: HudGeometry;
  private cardFit: ButtonFit | null = null;
  /** The phone's unfolded panels, and the tester tools (hidden until their key code is typed). */
  private readonly folds: Folds = { map: false, info: true, stock: false, debug: false };
  private readonly testerCode = new KeyCode();
  /** Whether the key code opens the debugger (Jade's Patch 5: only for the admin accounts, as the server says; anyone on a dev build). */
  debugAllowed = false;
  /** Godmode asked for from the debugger and not yet turned off. */
  private godWanted = false;
  /** Godmode came on with the debugger shut (a save made in godmode): it has been told to end. */
  private godOffSent = false;
  /** Godmode: the GOD_SPAWNS entry on the cursor (-1 for none), and its look. */
  private godPick = -1;
  private godGhost: Int32Array | null = null;
  /** Godmode's Cancel placement button: over the whole command card, at the card's own size, while a unit is on the cursor. */
  private readonly godCancel: HudButton;
  private readonly startedAt = performance.now();
  /** The active subgroup's type. */
  private active: string | null = null;
  private lastKey = { id: '', t: 0 };
  private idleCycle = 0;
  private townCycle = 0;
  private readonly urgent: Array<{ x: number; z: number; text: string }> = [];
  private urgentAt = -1;
  private lastInfoStep = -1;
  private lastPlannedSig = '';
  private overShown = false;
  private readonly parent: HTMLElement;
  /** Beside the cursor during a wall or tunnel chain: what the next click builds and costs, and below it how to go on or stop. */
  private readonly chainLabel: HTMLElement;
  private readonly chainText: HTMLElement;
  private readonly chainHint: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly opts: ShellOptions,
  ) {
    this.parent = parent;
    this.world = opts.world;
    this.extras = opts.extras;
    this.game = opts.game;
    this.settings = opts.settings;
    this.player = opts.player;
    this.layout = buildLayout(parent, this.panels);
    this.geometry = hudLayout({ width: window.innerWidth, height: window.innerHeight, topRight: 112 });
    this.chainLabel = document.createElement('div');
    this.chainLabel.className = 'chain-label';
    this.chainLabel.hidden = true;
    this.chainText = document.createElement('div');
    this.chainHint = document.createElement('div');
    this.chainHint.className = 'chain-hint';
    this.chainLabel.append(this.chainText, this.chainHint);
    this.layout.root.append(this.chainLabel);
    this.tooltip = new Tooltip(parent);
    this.cam = new RtsCamera(() => this.world.limits(), this.world.ground);
    this.visuals = new SelectionVisuals(opts.scene);
    this.flags = new OrderFlags(opts.scene);
    // GP-23: a unit on an attack-move or an attack has a red ring.
    this.visuals.ringColour = (t) => {
      const id = t.owner === this.player ? entityIdOf(t.key) : null;
      const k = id === null ? undefined : this.game.queues.get(id)?.[0]?.t;
      return k === 'attackMove' || k === 'attack' ? ATTACK_COLOUR : null;
    };
    this.minimap = new Minimap(this.layout.minimapEl, this.world.minimap);
    // The bars, stars and damage numbers over the world go in first, so speech bubbles draw over them (Patch 5).
    this.marks = new WorldMarks(this.layout.root);
    this.markSource = {
      player: opts.player,
      players: opts.players,
      colour: (p) => opts.session.colour(p),
      row: (id) => this.game.unitRow(id),
      building: (id) => this.game.buildings.get(id),
      extra: (key) => (this.stackBars.length === 0 ? [] : this.stackBars.flatMap((f) => f(key))),
    };
    this.bubbles = new SpeechBubbles(this.layout.root);
    this.messages = new MessagePanel(this.layout.messagePanel, this.layout.messageList, this.layout.root, this.panels, this.buttons, {
      jumpTo: (x, z) => this.jumpTo(x, z),
      jumpToUnit: (id) => {
        const t = this.fresh.get(`e:${id}`);
        if (!t || !this.game.unit(id)) return false;
        this.jumpTo(t.centre.x, t.centre.z);
        return true;
      },
      ping: (x, z, style) => this.minimap.ping(x, z, style),
      clock: () => formatClock((performance.now() - this.startedAt) / 1000),
    });
    this.peoples = new PeoplesUi(this.layout.root, this.panels, this.buttons, opts.game, opts.player, {
      send: (o) => opts.issueOrder(o),
      jumpTo: (x, z) => this.jumpTo(x, z),
      message: (t, k) => this.message(t, k),
      addArea: (id, el, target) => this.input.addArea(id, el, target),
    });
    this.selector = new SelectionController(this.cam, this.panels, this.selection, this.player, () => this.items, this.layout.dragBox);
    const session = opts.session;
    this.menu = new GameMenu(parent, this.settings, { seed: opts.seed, online: session.online, code: session.code }, {
      resume: () => this.closeMenu(),
      quit: () => opts.onQuit(),
      keysChanged: () => this.rebind(),
      save: () => {
        this.closeMenu();
        session.save();
      },
      download: () => session.download(),
      togglePause: () => session.togglePause(),
      pausedBy: () => session.pausedBy(),
      saveBlocked: () => session.saveBlocked(),
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
      askPlacement: (kind, variant, spots) => opts.askPlacement(kind, variant, spots),
      node: (cx, cz, i) => this.extras.node(cx, cz, i),
      heightAt: (x, z) => this.extras.heightAt(x, z),
      changed: () => {
        this.cardDirty = true;
      },
      confirmWar: (faction, then) => this.peoples.confirmWar(faction, then),
      openPeople: (faction) => this.peoples.open(faction),
      slots: () => {
        const room = buttonRoom(cardInner(this.geometry).w, this.geometry.maxH);
        return { most: room.cols * room.rows };
      },
    });
    this.input = new InputManager(
      {
        game: this.gameMouse(),
        anyPress: (button, inHud, el) => this.panel.cards.pressed(button === Btn.Left, inHud, el),
        hudPress: (_panel, button, area) => {
          // Clicking a HUD panel other than the minimap cancels a targeted command (not the ghost: the card is how the player picks another).
          if (this.commands.targeting && area !== 'minimap' && button !== Btn.Middle) {
            this.commands.targeting = null;
            this.cardDirty = true;
          }
        },
        keyDown: (id, ev) => this.keyDown(id, ev),
        keyUp: () => undefined,
        touch: this.touchHooks(),
      },
      this.panels,
      this.buttons,
      this.tooltip,
      this.settings,
      parent,
    );
    this.input.addArea('minimap', this.layout.minimapEl, this.minimapMouse());
    // Any click or tap on the way cuts the tester tools' code short.
    window.addEventListener('pointerdown', () => this.testerCode.reset(), true);
    // Touch controls turned on or off in Settings: the page follows at once.
    onSettingsChange(() => this.input.syncTouch());
    this.allies = new AlliesUi(this.layout.root, this.panels, this.buttons, opts.game, opts.player, {
      send: (o) => opts.issueOrder(o),
      message: (t) => this.message(t),
      name: (p) => session.name(p),
      colour: (p) => session.colour(p),
      addArea: (id, el, target) => this.input.addArea(id, el, target),
    });
    this.chat = new ChatBox(this.layout.chat, session.chat);
    this.inventory = new InventoryUi(this.layout.stockpile, this.buttons, {
      // Don't eat (Food: keeping a food back): right click on a food's slot.
      dontEat: (res, on) => {
        opts.issueOrder({ kind: 'dontEat', player: this.player, res, on: on ? 1 : 0 });
        this.message(on ? `${RESOURCES[res]!.name} is kept back: nobody eats it.` : `${RESOURCES[res]!.name} is eaten again.`);
      },
      addWheel: (id, el, onWheel) => this.input.addWheel(id, el, onWheel),
      pickSpawn: (k) => this.pickSpawn(k),
    });
    this.godCancel = this.buttons.add({
      id: 'god-cancel',
      face: 'Cancel placement',
      name: 'Cancel placement',
      keys: [],
      description: 'Puts away the unit on the cursor: moving the cursor here does too. Godmode stays on.',
      className: 'god-cancel',
      onPress: () => this.dropSpawn(),
    });
    this.godCancel.el.hidden = true;
    this.layout.commandCard.append(this.godCancel.el);
    // Another player's units this player may order: shared with them, or inherited from a player who left.
    setSharedControl((t, player) => {
      const info = this.game.info;
      if (!info || info.players[player]?.out) return false;
      if (t.kind === 'building') {
        const id = buildingIdOf(t.key);
        return id !== null && this.game.buildings.get(id)?.shared === true;
      }
      if (t.kind !== 'unit' || t.owner >= info.players.length) return false;
      // Share control covers combat units only (Jade's Patch 5, UI-14): troops, mages and engines.
      const combat = t.typeKey.startsWith('warrior') || t.typeKey.startsWith('mage:') || t.typeKey.startsWith('engine:');
      if (combat && ((info.players[t.owner]?.share ?? 0) & (1 << player)) !== 0) return true;
      const id = entityIdOf(t.key);
      const u = id === null ? null : this.game.unit(id);
      return u !== null && (u.flags & UnitFlag.Shared) !== 0;
    });
    const rings = new Map<number, THREE.Color>();
    this.visuals.sharedColour = (t) => {
      if (t.owner >= 8 || !isOwn(t, this.player)) return null;
      let c = rings.get(t.owner);
      if (!c) rings.set(t.owner, (c = new THREE.Color(session.colour(t.owner))));
      return c;
    };
    this.input.addArea('chat', this.layout.chat, { down: () => this.chat.open(), move: () => undefined, up: () => undefined });
    this.groups = new ControlGroups(this.layout.groupTabs, this.buttons, {
      selection: () => this.selection.list(),
      lookup: (k) => this.fresh.get(k),
      select: (list) => this.selection.set(list),
      centreOn: (list) => this.centreOn(list),
      message: (t) => this.message(t),
    });
    this.panel = new SelectionPanel(this.layout.selectionTitle, this.layout.selectionExtra, this.layout.selectionBody, this.layout.tierStrip, this.buttons, {
      player: this.player,
      health: (t) => this.health(t),
      mana: (t) => {
        const u = entityIdOf(t.key);
        const info = u === null ? null : this.game.unit(u);
        return info && info.kind === UnitKind.Mage ? [info.mana, info.maxMana] : null;
      },
      hunger: (t) => {
        const u = entityIdOf(t.key);
        const info = u === null ? null : this.game.unit(u);
        if (!info || info.owner !== this.player || info.meal <= 0) return null;
        const step = this.game.step;
        return { left: nextMealIn(step, info.id), meal: info.meal, since: info.hungry > 0 ? Math.max(0, step - info.hungry) : 0, maxHp: info.maxHp };
      },
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
      keyName: (action) => keyLabel(keyFor(this.settings.keys, action)),
      game: this.game,
      trainCard: (ids, card, count) => this.commands.trainCard(ids, card, count),
      lockTroop: (b, troop, lock) => opts.issueOrder({ kind: 'troopLock', player: this.player, building: b, troop, lock }),
      ownerTag: (owner) => (owner < this.opts.players ? { name: session.name(owner), colour: session.colour(owner) } : null),
      troopsChanged: () => {
        this.selectionDirty = true;
        this.cardDirty = true;
      },
      worth: this.worth,
      look: (t) => {
        const u = entityIdOf(t.key);
        const info = u === null ? null : this.game.unit(u);
        return info ? { troop: info.troop, wTier: info.wTier, aTier: info.aTier } : null;
      },
      queueLeft: (b) => {
        const head = b.queue[0];
        if (!head) return null;
        return queueSeconds(head.stepsLeft, this.game.step - (this.game.info?.step ?? this.game.step));
      },
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
    this.relayout();
  }

  /** Puts the panels where the screen size says (hud-layout.ts), then redraws the card for its new size. */
  private relayout(): void {
    const s = this.geometry.scale;
    this.geometry = hudLayout({ width: this.width, height: this.height, topRight: this.layout.topRight.offsetHeight || 112 });
    this.layout.root.classList.toggle('phone', this.geometry.phone);
    // A phone starts with the message panel folded (its button flashes on an urgent message), so the view stays clear.
    if (this.geometry.phone !== this.phoneFolded) {
      this.phoneFolded = this.geometry.phone;
      if (this.phoneFolded) this.messages.setCollapsed(true);
    }
    applyGeometry(this.layout, this.geometry, this.cardFit, this.folds);
    fitDebug(this.layout, this.geometry);
    this.portraitRect = null;
    this.panels.measure();
    if (s !== this.geometry.scale) this.selectionDirty = true;
    this.cardDirty = true;
  }

  /** The debug tools were added or changed: the readout fits itself in again (layout.ts fitDebug). */
  debugChanged(): void {
    fitDebug(this.layout, this.geometry);
    this.panels.measure();
  }

  /**
   * The key code was typed: shows the debugger, or hides it again (a new game
   * or a reload starts with it hidden). Jade's Patch 5: it opens only for the
   * admin accounts, and does nothing for anyone else; closing it ends godmode.
   */
  private toggleTesterTools(): void {
    if (!this.debugAllowed) return;
    this.folds.debug = !this.folds.debug;
    if (!this.folds.debug) this.setGod(false);
    applyGeometry(this.layout, this.geometry, this.cardFit, this.folds);
    fitDebug(this.layout, this.geometry);
    this.panels.measure();
    this.message(this.folds.debug ? 'Tester tools shown. Type the code again to hide them.' : 'Tester tools hidden.');
  }

  /** The debugger's Godmode button. */
  toggleGod(): void {
    this.setGod(!this.godWanted);
  }

  /** Turns godmode on or off (the debugger's Godmode button; off when the debugger closes). */
  setGod(on: boolean): void {
    if (!on) this.dropSpawn();
    if (on === this.godWanted && on === (this.game.info?.god === true)) return;
    this.godWanted = on;
    this.opts.issueOrder({ kind: 'debugGod', player: this.player, on: on ? 1 : 0 });
    this.buttons.get('dbg-god')?.setLit(on);
  }

  /** Godmode: puts one of GOD_SPAWNS on the cursor, to place with a click on the ground (the inventory's spawn grid). */
  private pickSpawn(k: number): void {
    if (this.game.info?.god !== true || !GOD_SPAWNS[k]) return;
    // A building's ghost, a dig or a targeted order in hand is put away first.
    while (this.commands.placing || this.commands.area || this.commands.targeting) if (!this.commands.back()) break;
    this.godPick = k;
    this.godGhost = godGhostRow(k, this.player);
    this.godCancel.el.hidden = false;
  }

  /** Godmode: the unit on the cursor is put away and the usual cursor comes back. */
  private dropSpawn(): void {
    if (this.godPick < 0) return;
    this.godPick = -1;
    this.godGhost = null;
    this.godCancel.el.hidden = true;
    this.extras.setUnitGhost(null, 0, 0);
  }

  /** Whether the cursor is over godmode's Cancel placement button. */
  private overGodCancel(p: Pt): boolean {
    if (this.godCancel.el.hidden) return false;
    const r = this.godCancel.el.getBoundingClientRect();
    return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
  }

  /** Phone: unfolds or folds a panel; the minimap and the selection share the strip, so one closes the other. */
  private toggleFold(which: keyof Folds): void {
    const on = !this.folds[which];
    this.folds[which] = on;
    if (on && which === 'map') this.folds.info = false;
    if (on && which === 'info') this.folds.map = false;
    applyGeometry(this.layout, this.geometry, this.cardFit, this.folds);
    this.portraitRect = null;
    this.panels.measure();
    for (const k of ['map', 'info', 'stock'] as const) this.buttons.get(`fold-${k}`)?.setLit(this.folds[k]);
  }

  /** The sim's answer about placement tiles. */
  onPlaced(kind: number, spots: Array<{ x: number; z: number; tiles: Uint8Array }>): void {
    this.commands.onPlaced(kind, spots);
  }

  // ---- Messages and readouts ----

  /** Adds a message to the message panel. A message with a place can be clicked to jump there; an alert is urgent. */
  message(text: string, kind: 'system' | 'alert' = 'system', at?: { x: number; z: number }): void {
    // Something the player asked for cannot be done (Order feedback: an error sound and a message).
    if (kind === 'alert') cue('error');
    this.messages.add({ text, kind, urgent: kind === 'alert', at });
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

  setPerfInfo(p: PerfInfo): void {
    const f = this.layout.debugFields;
    setText(f.fps, `${p.fps} (${p.frameMs.toFixed(1)} ms)`);
    setText(f.draws, `${p.drawCalls} (${Math.round(p.triangles / 1000)}k tris)`);
    setText(f.units, String(p.units));
    setText(f.memory, p.heapMb < 0 ? '-' : `${p.heapMb} MB`);
  }

  /** Day N and the time left in the period; Dusk, Night N, Dawn (Day and night: 3 min, 40 s, 3 min, 40 s). */
  private updateClock(step: number): void {
    const c = clockAt(step);
    const name = c.period === Period.Day ? `Day ${c.cycle + 1}` : c.period === Period.Dusk ? `Dusk · Day ${c.cycle + 1}` : c.period === Period.Night ? `Night ${c.cycle}` : `Dawn · Night ${c.cycle}`;
    setText(this.layout.clockDay, name);
    setText(this.layout.clockTime, `${formatClock(c.left / 20)} left`);
    this.layout.clock.dataset.period = String(c.period);
    this.layout.clock.classList.toggle('fog', this.game.info?.fog === true);
  }

  private onInfo(info: InfoMessage): void {
    // Godmode lives only while the debugger is open (Jade's Patch 5): a save made in godmode comes back without it.
    const god = info.god === true;
    if (god && !this.folds.debug && !this.godOffSent) {
      this.godOffSent = true;
      this.godWanted = true;
      this.setGod(false);
    } else if (!god) this.godOffSent = false;
    this.buttons.get('dbg-god')?.setLit(god);
    // The stockpile: food, supply and the inventory grid (in godmode, what it can place).
    this.inventory.update(info, this.game.foodValue());
    // Outlying lights against the coming night's limit (Table 8).
    const o = info.outlying;
    setText(this.layout.clockNote, o.halves > 0 ? `Lights outside: ${o.halves / 2} of ${o.limit}` : '');
    this.layout.clockNote.classList.toggle('over', o.halves > o.limit * 2);
    // Events into the message panel.
    for (const ev of info.events) this.onEvent(ev);
    this.peoples.refresh();
    this.allies.refresh();
    // Idle gatherers and the dusk button.
    const idle = this.game.idleWorkers().length;
    const idleBtn = this.buttons.get('idle');
    idleBtn?.setFace(idle > 0 ? `⚒${idle}` : '⚒').setLit(idle > 0);
    const p = clockAt(info.step).period;
    this.buttons.get('home')?.setLit(p === Period.Dusk);
    this.buttons.get('rations')?.setLit(info.rations !== 0).setFace(RATIONS_FACES[info.rations] ?? '▤');
    if ((info.over > 0 || info.out) && !this.overShown) this.showGameOver(info);
    this.groups.refresh((k) => this.exists(k));
    this.selection.retain((k) => this.exists(k) || k.startsWith('p:'));
    this.leaveForBuildings();
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

  /** The end of the game: the score is the nights survived (Winning, losing and score). */
  private showGameOver(info: InfoMessage): void {
    this.overShown = true;
    const el = document.createElement('div');
    el.className = 'game-over';
    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '30%',
      transform: 'translate(-50%, -50%)',
      padding: '18px 32px',
      background: 'rgba(20, 14, 10, 0.85)',
      border: '2px solid #c9a24a',
      color: '#f2e6c8',
      textAlign: 'center',
      font: '600 20px system-ui, sans-serif',
      pointerEvents: 'none',
      zIndex: '20',
    });
    const head = document.createElement('div');
    head.style.fontSize = '30px';
    head.textContent = info.over > 0 ? 'The game is over' : 'You are out of the game';
    const score = document.createElement('div');
    score.textContent = `Nights survived: ${info.nights}`;
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 14px; margin-top: 8px; opacity: 0.8';
    hint.textContent = 'F10 opens the menu to quit.';
    el.append(head, score, hint);
    this.parent.append(el);
  }

  /** "Player 2" in the sim's messages becomes that player's name. */
  private named(text: string): string {
    return text.replace(/\bPlayer ([1-8])\b/g, (m, n: string) => {
      const p = Number(n) - 1;
      return p < this.opts.players ? this.opts.session.name(p) : m;
    });
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
    // The debugger's Elf kingdom button: the camera goes there at once.
    if (ev.look && at) this.jumpTo(at.x, at.z);
    if (ev.kind === 'question') {
      this.onQuestion(ev);
      return;
    }
    if (ev.kind === 'speech') {
      this.onSpeech(ev, at);
      return;
    }
    const urgent = ev.kind === 'alert' || (ev.kind === 'period' && ev.text.startsWith('Night is falling'));
    // A unit's own alert ("I cannot reach that.") is speech too: its bubble, and its name in the panel.
    if (ev.speaker !== undefined) this.bubbles.say(ev.speaker, ev.text, performance.now());
    const kind: MessageKind = urgent ? 'alert' : 'system';
    // A new lair (Patch 3) pings the minimap in red.
    this.messages.add({ text: this.named(ev.text), kind, name: ev.name, urgent, at, unit: ev.speaker, ping: ev.lair !== undefined ? 'lair' : undefined });
    if (ev.faction && (ev.urgent || urgent)) this.buttons.get('peoples')?.setLit(true);
    if (urgent && at) {
      this.urgent.unshift({ ...at, text: ev.text });
      this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
      this.urgentAt = -1;
    } else if (urgent && ev.kind === 'period') {
      // The dusk warning has no place: F4 centres on the main base.
      const base = this.game.mainBases()[0];
      if (base) {
        const c = GameInfo.centre(base, COLUMN_M);
        this.urgent.unshift({ ...c, text: ev.text });
        this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
        this.urgentAt = -1;
      }
    }
  }

  /**
   * Speech: a bubble over the speaker, and the message panel only when the
   * speaker is the player's own and the line needs them now (Patch 2, What
   * reaches chat; wording.ts speechToPanel). Another people's lines said to
   * this player (trade and hire answers) show in their menu instead.
   */
  private onSpeech(ev: SimEvent, at: { x: number; z: number } | undefined): void {
    if (ev.bubble) {
      // A meal or hunger (patch 1) is a bubble over a unit on screen; meal lines at most one a second, so a big army's meals do not crowd the screen.
      const now = performance.now();
      if (ev.speaker !== undefined && this.headOnScreen(ev.speaker) !== null && (ev.bubble !== 'meal' || now >= this.mealBubbleAt)) {
        if (ev.bubble === 'meal') this.mealBubbleAt = now + MEAL_BUBBLE_GAP_MS;
        this.bubbles.say(ev.speaker, ev.text, now, 'own', ev.hold);
      }
    } else if (ev.building !== undefined) this.bubbles.speak({ id: ev.building, building: true }, ev.text, performance.now(), 'own', ev.hold);
    else if (ev.speaker) this.bubbles.say(ev.speaker, ev.text, performance.now(), ev.foreign ? 'foreign' : 'own', ev.hold);
    if (ev.foreign && ev.faction && ev.player === this.player && ev.name) this.peoples.heard(ev.faction, ev.name, ev.text);
    if (!speechToPanel(ev, this.player)) return;
    this.messages.add({ text: ev.text, kind: 'speech', name: ev.name, urgent: ev.urgent, at, unit: ev.speaker || undefined });
    if (ev.urgent && at) {
      this.urgent.unshift({ ...at, text: ev.text });
      this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
      this.urgentAt = -1;
    }
  }

  /** The bar stacks, stars and damage numbers over the world this frame (Patch 5: UI-9, 10, 12, 18). */
  private drawMarks(now: number): void {
    const entries: MarkEntry[] = [];
    for (const t of this.fresh.values()) {
      if (t.kind === 'node' || !this.extras.seen(t.centre.x, t.centre.z)) continue;
      const e = markEntry(t, this.markSource);
      if (e) entries.push(e);
    }
    this.marks.draw(entries, this.projectMark, this.width, this.height, window.devicePixelRatio || 1, now);
  }

  private readonly markTmp = new THREE.Vector3();
  private readonly projectMark = (x: number, y: number, z: number, out: { x: number; y: number }): boolean => this.cam.project(this.markTmp.set(x, y, z), out);

  /** A bubble's anchor lifted over the thing's bar stack, when it has one this frame. */
  private overMarks(key: string, at: { x: number; y: number } | null): { x: number; y: number } | null {
    const top = at ? this.marks.top(key) : null;
    return at && top !== null ? { x: at.x, y: Math.min(at.y, top - 2) } : at;
  }

  /** A state message's hits: the damage numbers over what they hit (Patch 5, UI-10). */
  onHits(hits: readonly HitEvent[]): void {
    this.marks.hits(hits, (x, z) => this.extras.seen(x, z), (h, x, y, z) => this.hitAnchor(h, x, y, z), WU_PER_METRE, performance.now());
  }

  /** Where a hit's number starts: halfway up the unit it hit, or halfway up the building where the blow landed (UI-10). */
  private hitAnchor(h: HitEvent, x: number, y: number, z: number): { x: number; y: number; z: number } {
    const u = this.fresh.get(`e:${h.id}`);
    if (u && Math.abs(u.centre.x - x) < 1.5 && Math.abs(u.centre.z - z) < 1.5) return { x: u.centre.x, y: u.centre.y, z: u.centre.z };
    const b = this.fresh.get(`b:${h.id}`);
    if (b && Math.abs(b.centre.x - x) <= b.halfSize.x + 1 && Math.abs(b.centre.z - z) <= b.halfSize.z + 1) return { x, y: b.centre.y, z };
    return { x, y, z };
  }

  /** The top of a unit's head on screen, px, or null when it is off screen or out of sight. */
  private headOnScreen(id: number): { x: number; y: number } | null {
    return this.topOnScreen(`e:${id}`);
  }

  /** The middle of a building's roof on screen, px, or null when it is off screen or out of sight (Patch 2: buildings' bubbles). */
  private roofOnScreen(id: number): { x: number; y: number } | null {
    return this.topOnScreen(`b:${id}`);
  }

  private topOnScreen(key: string): { x: number; y: number } | null {
    const t = this.fresh.get(key);
    if (!t || !this.extras.seen(t.centre.x, t.centre.z)) return null;
    const v = this.headTmp.set(t.centre.x, t.centre.y + t.halfSize.y + 0.25, t.centre.z);
    const p = { x: 0, y: 0 };
    if (!this.cam.project(v, p)) return null;
    if (p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height) return null;
    return p;
  }

  /**
   * A question (Patch 2, round 3): its bubble over the unit or building that
   * asks, with Yes and No for its owner and without them for everyone else
   * (Jade); the words go to no chat. Or the news that it ended.
   */
  private onQuestion(ev: SimEvent): void {
    const a = ev.ask;
    if (!a) return;
    if (a.closed) {
      if (this.bubbles.closeAsk(a.id)) this.input.refreshHover();
      return;
    }
    if (a.retold) {
      if (this.bubbles.retell(a.id, a.yes)) this.input.refreshHover();
      return;
    }
    const who: Speaker | null = ev.building !== undefined ? { id: ev.building, building: true } : ev.speaker !== undefined ? { id: ev.speaker } : null;
    if (!who) return;
    const buttons =
      ev.player === this.player
        ? new YesNoButtons(this.buttons, this.panels, {
            key: String(a.id),
            yes: { description: a.yes, onPress: () => this.answer(ev, true) },
            no: { description: a.no, onPress: () => this.answer(ev, false) },
          })
        : null;
    this.bubbles.ask(a.id, who, ev.text, a.until, buttons);
  }

  /** Yes or No: the answer goes to the sim as an order (every machine does the same), and the bubble goes at once. */
  private answer(ev: SimEvent, yes: boolean): void {
    const a = ev.ask!;
    this.opts.issueOrder({ kind: 'answer', player: this.player, ask: a.id, yes: yes ? 1 : 0, q: a.q, who: ev.building ?? ev.speaker ?? 0, units: [...a.units], res: a.res, ...(a.n !== undefined ? { n: a.n } : {}) });
    this.bubbles.closeAsk(a.id);
    this.input.refreshHover();
  }

  private readonly headTmp = new THREE.Vector3();
  /** When the next meal bubble may show, ms. */
  private mealBubbleAt = 0;

  /** Units on screen that may make a random remark, with their list of remarks. */
  private remarkers(): Array<[number, string]> {
    const out: Array<[number, string]> = [];
    for (const s of this.items) {
      const t = s.item;
      if (t.kind !== 'unit') continue;
      const id = entityIdOf(t.key);
      if (id === null) continue;
      if (t.typeKey.startsWith('people:')) {
        const spec = PEOPLE_UNITS[Number(t.typeKey.slice(7))];
        if (spec) out.push([id, REMARK_KEYS[spec.people]!]);
      } else if (t.owner < 8 && (t.typeKey === 'worker' || t.typeKey.startsWith('warrior') || t.typeKey.startsWith('mage:'))) {
        // Every player's workers, troops and mages (Jade's Patch 5, GP-28), each in its own voice.
        const u = this.game.unit(id);
        const voice = u ? remarkVoice(u.kind, u.troop, u.mount) : '';
        if (voice) out.push([id, voice]);
      }
    }
    return out;
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
    util({
      id: 'rations',
      face: '▤',
      name: 'Rations',
      keys: k('rations'),
      description: 'Who eats when food runs short: everyone, the troops only (the workers and working animals starve and slow down), or the workers only (the troops starve and slow down, and the Scholar\'s Lodge goes unfed, so research stops). Click to cycle.',
      onPress: () => {
        const next = ((this.game.info?.rations ?? 0) + 1) % 3;
        this.opts.issueOrder({ kind: 'rations', player: this.player, rations: next });
        this.buttons.get('rations')?.setLit(next !== 0).setFace(RATIONS_FACES[next]!);
      },
    });
    util({
      id: 'home',
      face: '⇊',
      name: 'Everyone Home',
      keys: k('home'),
      description: 'Send every unit without a standing job to the nearest shelter (main base or farm). Lights up at dusk. Farmers go to their own farm by themselves. Sent in the dark, they come out at dawn once no monster is within 25 m (in the day whatever the monsters do) and carry on, or gather if they had nothing to do; sent by day, they come out at daybreak.',
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
    util({
      id: 'repairall',
      face: '⚒',
      name: 'Repair All',
      keys: ['F8'],
      description: 'Every worker within 20 m of one of your damaged buildings goes to repair it, idle workers first, the worst damaged building first. Farm and barn workers stay at their jobs. Once it is whole they go back to what they were doing, and those that were idle start gathering. A repair uses up the building\'s own materials for the health it gives back.',
      className: 'repairall',
      icon: actionIcon('repair', '⚒'),
      onPress: () => {
        this.opts.issueOrder({ kind: 'repairNearby', player: this.player });
        this.message('Repair all: workers near damaged buildings are heading to repair them.');
      },
    });
    util({ id: 'menu', face: '☰', name: 'Menu', keys: ['F10'], description: 'Settings, hotkeys, full screen and quitting. Releases the cursor.', onPress: () => this.openMenu() });

    // Top right: Peoples, Allies and Send resources (multiplayer), Ping and Pause.
    const top = (def: Parameters<ButtonRegistry['add']>[0], reason?: string): HudButton => {
      const b = this.buttons.add({ ...def, className: `top ${def.className ?? ''}` });
      if (reason) b.setEnabled(false, reason);
      L.topRightButtons.append(b.el);
      return b;
    };
    top({
      id: 'peoples',
      face: 'Peoples',
      name: 'Peoples',
      keys: k('peoples'),
      description: 'The neutral peoples you have met: trade, hire, war, surrender and reparations. Lights up when one of them needs an answer.',
      onPress: () => {
        this.peoples.togglePanel();
        this.buttons.get('peoples')?.setLit(false);
      },
    });
    const alone = this.opts.players < 2 ? 'You are playing alone.' : undefined;
    top(
      {
        id: 'allies',
        face: 'Allies',
        name: 'Allies',
        keys: k('allies'),
        description: 'The other players, with a Share control box for each: ticked, that player may order your units.',
        onPress: () => this.allies.toggleAllies(),
      },
      alone,
    );
    top({ id: 'send', face: 'Send', name: 'Send resources', keys: k('send'), description: 'Give resources to another player: they arrive at once, all of them.', onPress: () => this.allies.toggleSend() }, alone);
    top({
      id: 'ping',
      face: 'Ping',
      name: 'Ping',
      keys: k('ping'),
      description: 'Then left click a spot in the view or on the minimap: it flashes for every player, to point out a threat or a target. Right click or Esc cancels.',
      onPress: () => this.startPing(),
    });
    top({
      id: 'pause',
      face: '❚❚',
      name: 'Pause',
      keys: k('pause'),
      description: this.opts.session.online
        ? 'Pause the game for every player and open everyone’s menu; again, or Resume in the menu, carries on for everyone.'
        : 'Opens the menu: the game waits while it is open.',
      onPress: () => this.pausePressed(),
    });
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

    // Command card: a button per slot whose meaning follows the selection (more are made as the card grows).
    this.ensureCardButtons();

    // The phone's fold buttons: the menu, the minimap, the selection, the stockpile and the messages.
    const fold = (id: string, face: string, name: string, description: string, onPress: () => void): HudButton => {
      const b = this.buttons.add({ id, face, name, keys: [], description, className: 'fold', onPress });
      L.folds.append(b.el);
      return b;
    };
    // The portrait's window: a click centres the camera on what it shows.
    L.portraitWindow.append(this.buttons.add({ ...PORTRAIT_VIEW }).el);
    fold('fold-menu', '☰', 'Menu', 'Settings, saving, full screen and quitting.', () => this.openMenu());
    fold('fold-map', '◫', 'Map', 'Show or hide the minimap and the buttons along its top (idle gatherer, army, camera spots).', () => this.toggleFold('map'));
    fold('fold-info', 'ⓘ', 'Selection', 'Show or hide the portrait and what is selected.', () => this.toggleFold('info')).setLit(this.folds.info);
    fold('fold-stock', '▦', 'Stock', 'Show or hide the inventory: what you have of every good.', () => this.toggleFold('stock'));
    fold('fold-chat', '✉', 'Messages', 'Show or hide the message panel. It flashes when something urgent comes in.', () => this.messages.setCollapsed(!this.messages.isCollapsed()));
    // Touch controls: a drag moves the camera, so the selection box waits for this button.
    const boxText = 'Touch controls: light it, then drag to draw a selection box round your units. A drag otherwise moves the camera.';
    fold('fold-box', '⬚', 'Box select', boxText, () => this.setBoxMode(!this.boxMode)).el.classList.add('touch-only');
    util({ id: 'box', face: '⬚', name: 'Box select', keys: [], description: boxText, className: 'touch-only', onPress: () => this.setBoxMode(!this.boxMode) });
  }

  private setBoxMode(on: boolean): void {
    this.boxMode = on;
    this.buttons.get('box')?.setLit(on);
    this.buttons.get('fold-box')?.setLit(on);
  }

  /**
   * Touch controls (patch notes 1): what a finger means here. A tap gives
   * the right click's order when something of the player's is selected and
   * the tap is not on something of theirs; otherwise it selects.
   */
  private touchHooks(): TouchHooks {
    return {
      on: () => this.settings.touch,
      aiming: () => this.pinging || this.commands.targeting !== null || this.commands.placing !== null || this.commands.area !== null,
      orders: (p) => {
        if (!this.selection.list().some((t) => isOwn(t, this.player))) return false;
        const u = this.under(p);
        return u.item === null ? u.ground !== null : !isOwn(u.item, this.player);
      },
      boxing: () => this.boxMode,
      boxed: () => this.setBoxMode(false),
      zoom: (factor, p) => this.cam.zoomBy(factor, p),
    };
  }

  /** One button in each card slot. */
  private ensureCardButtons(): void {
    const slots = this.layout.commandSlots;
    for (let i = this.cardButtons.length; i < slots.length; i++) {
      const b = this.buttons.add({ id: `card${i}`, face: '', name: '', keys: [], description: '', className: 'cmd' });
      b.el.hidden = true;
      slots[i]!.append(b.el);
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
      ['rations', 'rations'],
      ['clear', 'clear'],
      ['peoples', 'peoples'],
      ['allies', 'allies'],
      ['send', 'send'],
      ['ping', 'ping'],
      ['pause', 'pause'],
    ] as const) {
      const b = this.buttons.get(id);
      if (b) b.redefine({ ...b.def, keys: [keyFor(this.settings.keys, action)] });
    }
    this.cardDirty = true;
  }

  // ---- Selection helpers ----

  /** A type's worth for the subgroup order: what it cost, the dearest kit for troops. */
  private readonly worth = (typeKey: string, items: readonly Selectable[]): number =>
    typeWorth(typeKey, () =>
      items.map((t) => {
        const id = entityIdOf(t.key);
        const u = id === null ? null : this.game.unit(id);
        return { troop: u?.troop ?? 0, wTier: u?.wTier ?? 0, aTier: u?.aTier ?? 0 };
      }),
    );

  /** The active subgroup's type: the one picked with a tab or Tab, else the most valuable type selected. */
  private activeType(): string | null {
    const list = this.selection.list().filter((t) => isOwn(t, this.player));
    if (list.length === 0) return null;
    const groups = subgroups(list, this.worth);
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
    const groups = subgroups(this.selection.list().filter((t) => isOwn(t, this.player)), this.worth);
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

  /**
   * The portrait (patch notes 1): the first of the active type (the most
   * valuable selected, or the one Tab picked), else the one thing selected
   * (an enemy's or a neutral's looks the same). Units and buildings are drawn
   * live through the window (match.ts, after the world); a resource node
   * shows its good's picture.
   */
  private refreshPortrait(list: readonly Selectable[]): void {
    const active = this.activeType();
    const t = (active ? list.find((x) => x.typeKey === active && isOwn(x, this.player)) : undefined) ?? list[0];
    const live = t !== undefined && t.kind !== 'node';
    this.portraitKey = live ? t.key : null;
    this.layout.portraitWindow.classList.toggle('live', live);
    // A node shows its good; loot on the ground ("Raw meat (4)") the good it is.
    const good = t?.typeKey === 'loot' ? t.label.replace(/ \(\d+\)$/, '') : t?.resource;
    const icon = t && t.kind === 'node' ? goodIcon(RESOURCES.find((r) => r.name === good)?.id ?? -1) : undefined;
    const url = icon ? kitUrl(icon.file) : '';
    this.layout.portraitIcon.hidden = url === '';
    if (url && this.layout.portraitIcon.getAttribute('src') !== url) this.layout.portraitIcon.src = url;
    const view = this.buttons.get('portrait-view');
    if (view) {
      view.redefine({
        ...PORTRAIT_VIEW,
        name: t ? t.label : 'Portrait',
        description: t ? 'Click to centre the camera on it.' : 'Select something to see it here.',
        onPress: () => {
          if (t) this.centreOn([t]);
        },
      });
      view.setEnabled(t !== undefined, '');
    }
  }

  /** What the portrait draws this frame and where, or null (nothing selected, a resource node, the panel folded away on a phone). */
  portraitSubject(): PortraitSubject | null {
    if (!this.portraitKey || this.layout.portraitPanel.hidden) return null;
    this.portraitRect ??= this.layout.portraitWindow.getBoundingClientRect();
    return { key: this.portraitKey, rect: this.portraitRect };
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
    let posted = 0;
    for (const t of this.world.selectables.candidates()) {
      if (t.kind !== 'unit' || t.owner !== this.player || (t.typeKey !== 'warrior' && !t.typeKey.startsWith('mage:'))) continue;
      // Not the men on towers and tops (Jade's Patch 5, CT-4), so F2 never pulls them off their posts.
      const id = entityIdOf(t.key);
      if (id !== null && (this.game.unit(id)?.inside ?? 0) !== 0) posted++;
      else army.push(t);
    }
    if (army.length === 0) this.message(posted > 0 ? 'Every warrior and mage you have is in a tower or a building.' : 'You have no warriors or mages yet.');
    else this.selection.set(army);
  }

  /**
   * Jade's Patch 5 (CT-2, CT-3): a selected unit of the player's that goes
   * into a building, up on its top or out to work its farm's field leaves the
   * selection; one picked while already in stays. Run on each info.
   */
  private leaveForBuildings(): void {
    const out = new Set<string>();
    this.selection.retain((k) => {
      const id = entityIdOf(k);
      const u = id === null ? null : this.game.unit(id);
      if (!u || u.owner !== this.player) return true;
      const inside = u.inside !== 0 || (u.order === OrderKind.Farm && this.game.queues.get(id!)?.[0]?.t === 'job');
      if (!inside) out.add(k);
      return !inside || !this.seenOut.has(k);
    });
    this.seenOut = out;
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

  /** Space (Jade's patch notes 1): the camera jumps to the middle of the selection. */
  private centreSelection(): void {
    const list = this.selection.list();
    if (list.length === 0) {
      this.message('Nothing is selected to centre the camera on.');
      return;
    }
    this.centreOn(list);
  }

  /** F4: the latest urgent message; again to step back through the last 8. */
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

  /** The Pause key or ❚❚: online, Pause or Resume for everyone; alone, the menu opens (it is the pause) or closes. */
  private pausePressed(): void {
    if (this.opts.session.online) this.opts.session.togglePause();
    else if (this.menu.isOpen) this.closeMenu();
    else this.openMenu();
  }

  /**
   * Online, a player pressed Pause or Resume (`text` says who): the menu
   * opens with Resume on it, or closes, on every page.
   */
  pauseToggled(paused: boolean, text: string): void {
    this.message(text);
    if (paused) this.openMenu();
    else this.closeMenu();
    this.pauseChanged();
  }

  /** The pause changed: the menu's Pause or Resume and the ❚❚ button follow. */
  pauseChanged(): void {
    if (this.menu.isOpen) this.menu.refresh();
    this.buttons.get('pause')?.setLit(this.opts.session.pausedBy() !== null);
  }

  private openMenu(): void {
    if (this.menu.isOpen) return;
    this.selector.cancel();
    this.commands.reset();
    this.menu.show(true);
    this.input.setMode('menu');
    this.opts.session.menuOpened(true);
  }

  private closeMenu(): void {
    if (!this.menu.isOpen) return;
    this.menu.show(false);
    this.input.setMode('game');
    this.input.requestLock();
    this.opts.session.menuOpened(false);
  }

  /** Opens the in-game menu (the host's choice and the save prompts use the real cursor too). */
  showMenu(): void {
    this.openMenu();
  }

  /** Hands the real cursor to a page dialog (an account form over the game), or takes it back. */
  releaseInput(on: boolean): void {
    if (on) {
      this.selector.cancel();
      this.input.setMode('menu');
    } else if (!this.menu.isOpen) {
      this.input.setMode('game');
      this.input.requestLock();
    }
  }

  // ---- Players ----

  /** A player's chat line (only the panel, never a bubble); another player's counts as unread while the panel is collapsed. */
  chatLine(name: string, text: string, other = true): void {
    this.messages.addPlayer(name, text, other);
  }

  /** A player pinged a spot (metres): it flashes on the minimap and in the view, and the panel says who. */
  pinged(name: string, x: number, z: number, other = false): void {
    cue('ping');
    this.messages.add({ text: 'Look here!', kind: 'player', name, urgent: true, at: { x, z }, other });
    this.visuals.orderMarker(new THREE.Vector3(x, this.extras.heightAt(x, z), z), 'target');
    this.urgent.unshift({ x, z, text: `${name} pinged the map.` });
    this.urgent.length = Math.min(this.urgent.length, URGENT_KEEP);
    this.urgentAt = -1;
  }

  private startPing(): void {
    this.pinging = !this.pinging;
    this.buttons.get('ping')?.setLit(this.pinging);
    if (this.pinging) this.message('Ping: left click a spot in the view or on the minimap. Right click or Esc cancels.');
  }

  private endPing(): void {
    this.pinging = false;
    this.buttons.get('ping')?.setLit(false);
  }

  // ---- Keyboard ----

  private keyDown(id: string, ev: KeyboardEvent): void {
    // The tester tools' code counts only keys typed in the game itself; the keys still do their usual jobs.
    if (this.menu.isOpen || this.input.mode !== 'game') this.testerCode.reset();
    else if (this.testerCode.key(ev)) this.toggleTesterTools();
    if (this.menu.isOpen) {
      if (this.menu.capturing) return;
      if (id === 'Escape' || id === 'F10') this.closeMenu();
      else if (id === keyFor(this.settings.keys, 'pause') && !ev.repeat) this.pausePressed();
      return;
    }
    if (id === 'Escape') {
      // Esc backs out of a pending order, ghost or menu first, then clears the selection.
      if (this.panel.cards.close()) return;
      if (this.godPick >= 0) this.dropSpawn();
      else if (this.selector.dragging) this.selector.cancel();
      else if (this.pinging) this.endPing();
      else if (this.commands.back()) this.cardDirty = true;
      else if (this.allies.closeTop()) return;
      else if (this.peoples.closeTop()) return;
      else this.selection.clear();
      return;
    }
    if (id === 'PageUp' || id === 'PageDown') {
      this.cam.zoomBy(Math.pow(ZOOM_STEP, (id === 'PageUp' ? -1 : 1) * this.settings.zoomSpeed), null);
      return;
    }
    if (ev.repeat) return;
    if (id === 'Enter') {
      this.chat.open();
      return;
    }
    // Ctrl, Cmd and Alt combinations belong to the browser (no game control uses them).
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.groups.key(id, this.input.held('Backquote'), ev.shiftKey)) return;
    const k = (action: string): string => keyFor(this.settings.keys, action);
    if (id === k('subgroup')) return this.cycleSubgroup(ev.shiftKey);
    if (id === k('centre')) return this.centreSelection();
    if (id === k('urgent')) return this.jumpUrgent();
    const press: ButtonPress = { shift: ev.shiftKey, ctrl: false };
    // Jade's Patch 4: the build and K menus' keys are letters like every other button's (before, they went by key position).
    const btn = this.buttons.forKey(id);
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
        if (this.pinging) {
          this.leftConsumed = button === Btn.Left;
          const at = this.cam.pick(p);
          if (button === Btn.Left && at) this.opts.session.ping(at.x, at.z);
          this.endPing();
          return;
        }
        if (button === Btn.Left) {
          if (this.godPick >= 0) {
            // Godmode: the unit on the cursor is placed there, and stays on the cursor for the next.
            this.leftConsumed = true;
            const at = this.cam.pick(p);
            if (at) this.opts.issueOrder({ kind: 'debugPlace', player: this.player, what: this.godPick, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE) });
          } else if (this.commands.area) {
            this.leftConsumed = true;
            this.commands.areaDown(this.cam.pick(p));
          } else if (this.commands.placing) {
            this.leftConsumed = true;
            this.commands.aimPlacing(this.cam.pick(p));
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
          // Right click ends a wall or tunnel chain, or puts the ghost, the dig or godmode's unit away.
          if (this.godPick >= 0) this.dropSpawn();
          else if (this.commands.area || this.commands.placing || this.commands.targeting) this.commands.back();
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
            if (this.commands.area) this.commands.areaUp();
            else if (this.commands.placing) {
              this.commands.aimPlacing(this.cam.pick(p));
              this.commands.placeUp();
            }
          } else this.selector.up(p, mods);
        } else if (button === Btn.Middle) {
          this.middleDrag = false;
          this.cam.grabEnd();
        }
      },
      wheel: (p, dy) => {
        // While marking an area or a tunnel chain, the wheel sets the depth or height instead of zooming.
        if (this.commands.area?.from || this.commands.area?.chain) {
          this.commands.adjustArea(dy < 0 ? 1 : -1);
          return;
        }
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
        if (this.pinging) {
          if (button === Btn.Left) this.opts.session.ping(at.x, at.z);
          this.endPing();
          return;
        }
        if (button === Btn.Left) {
          if (this.commands.targeting) {
            this.commands.confirmTarget(null, at);
            return;
          }
          this.minimapSlide = true;
          this.setFollow(null);
          this.cam.jumpTo(at.x, at.z);
        } else if (button === Btn.Right) {
          if (this.commands.placing || this.commands.area || this.commands.targeting) this.commands.back();
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
      !this.settings.touch &&
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
    this.selector.frame(inGameView && !this.commands.placing && !this.commands.area);
    this.world.hover?.(this.selector.highlighted);
    this.visuals.update(this.selection.list(), this.player, now);
    this.minimap.draw(this.cam.footprint());
    // Patch 5: each unit's and building's bar stack, the stars over other players' things and the damage numbers
    // (world-marks.ts); the units at a timed action have their bar there.
    this.drawMarks(now);
    // The bubbles that stay while a timed action's bar runs (Jade's Patch 3).
    const sitting = new Set(this.game.tinkering().map(([id]) => id));
    // No random remarks while the game is paused (Jade's patch notes 1). Bubbles sit over the bar stacks.
    const anchor = { head: (id: number) => this.overMarks(`e:${id}`, this.headOnScreen(id)), roof: (id: number) => this.overMarks(`b:${id}`, this.roofOnScreen(id)) };
    this.bubbles.update(now, anchor, () => this.remarkers(), this.opts.session.stopped(), this.game.step, sitting, (id, voice) => {
      const scene = sceneOf(this.game, id, voice);
      return scene ? remarkLine(scene) : null;
    });

    // The placement ghost follows the cursor over the game view.
    const ghost = this.commands.updatePlacing(inGameView ? this.cam.pick(pos) : null, now);
    this.commands.updateArea(inGameView ? this.cam.pick(pos) : null);
    this.extras.setGhost(ghost);
    this.drawOverlay(ghost);
    // Godmode's unit on the cursor, where it points; the cursor over Cancel placement puts it away (Jade's Patch 5).
    if (this.godPick >= 0) {
      if (this.game.info?.god !== true || this.commands.placing || this.commands.area || this.commands.targeting || this.overGodCancel(pos)) this.dropSpawn();
      else {
        const at = inGameView ? this.cam.pick(pos) : null;
        this.extras.setUnitGhost(at ? this.godGhost : null, at?.x ?? 0, at?.z ?? 0);
      }
    }
    const label = inGameView ? this.commands.chainLabel() : null;
    this.chainLabel.hidden = label === null;
    if (label) {
      setText(this.chainText, label.text);
      setText(this.chainHint, label.hint);
      this.chainLabel.classList.toggle('short', label.short);
      this.chainLabel.style.left = `${pos.x + 18}px`;
      this.chainLabel.style.top = `${pos.y + 14}px`;
    }

    // Cursor shape.
    const overMinimap = playing && this.input.inWindow && this.overMinimapCanvas(pos);
    const t = this.commands.targeting;
    const tool = t ? TOOL_CURSORS[t.command] : undefined;
    if (tool && inGameView) this.input.cursor.setShape({ kind: 'tool', tool });
    else if (t && (inGameView || overMinimap)) this.input.cursor.setShape({ kind: 'target', colour: t.command === 'rally' ? TARGET_YELLOW : t.command === 'attack' || (t.command === 'cast' && SPELLS[t.spell ?? 0]?.target !== 'ally') ? TARGET_RED : TARGET_GREEN });
    else if (this.commands.area && inGameView) this.input.cursor.setShape({ kind: 'target', colour: TARGET_YELLOW });
    else if (this.godPick >= 0 && inGameView) this.input.cursor.setShape({ kind: 'target', colour: TARGET_GREEN });
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
      this.markDoing();
      // The hovered button's words may have changed (the queue's countdown).
      this.input.refreshHover();
    }
    if (this.cardDirty) {
      this.cardDirty = false;
      this.refreshCommandCard();
      this.markDoing();
    }
  }

  /** Rally routes of selected buildings, Shift queue paths of selected units, and a light's reach while placing it. */
  private drawOverlay(ghost: Ghost | null): void {
    const o = this.extras.overlay;
    const h = (x: number, z: number): number => this.extras.heightAt(x, z);
    o.begin();
    const lift = 0.15;
    const pt = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, h(x, z) + lift, z);
    this.flags.begin();
    for (const t of this.selection.list()) {
      const b = this.buildingOf(t);
      if (b && b.owner === this.player && b.rally.length > 0) {
        let from = pt(t.centre.x, t.centre.z);
        for (let k = 0; k < b.rally.length; k++) {
          const to = this.rallyPoint(b.rally[k]!);
          if (!to) continue;
          o.dashed(from, to, RALLY);
          // Patch 5 (GP-23): the route ends in a little yellow flag.
          if (k === b.rally.length - 1) this.flags.flag(to.x, to.y - lift, to.z, RALLY_COLOUR);
          else o.ring(to.x, to.z, 0.5, RALLY, h);
          from = to;
        }
      }
    }
    this.drawOrderLines(o, h, lift);
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
    this.flags.end();
    this.drawSites(o, h);
    if (ghost) {
      // Only the footprint decides whether a building can go there, and its green and red tiles show it;
      // a light also shows how far it will shine (Jade's patch notes 1: no claimed-land outline while placing).
      const spec = buildingSpec(ghost.kind);
      const light = spec.light;
      if (light) {
        for (const s of ghost.spots) o.ring((s.x + spec.w / 2) * COLUMN_M, (s.z + spec.d / 2) * COLUMN_M, light.lightM, LIGHT, h);
      }
    }
    o.end();
  }

  /** Patch 5 (GP-23): a dotted line from each moving group of the selection to where its order ends, and the flag or dot there. */
  private drawOrderLines(o: Overlay, h: (x: number, z: number) => number, lift: number): void {
    const movers: Mover[] = [];
    for (const t of this.selection.list()) {
      const id = t.owner === this.player ? entityIdOf(t.key) : null;
      const ord = id === null ? undefined : this.game.queues.get(id)?.[0];
      const m = ord ? this.mover(t, ord) : null;
      if (m) movers.push(m);
    }
    if (movers.length === 0) return;
    const flagged = new Set<string>();
    const flag = (x: number, z: number, kind: string, c: THREE.Color): void => {
      const key = `${kind}:${x.toFixed(1)}:${z.toFixed(1)}`;
      if (flagged.has(key)) return;
      flagged.add(key);
      this.flags.flag(x, h(x, z), z, c);
    };
    for (const l of orderLines(movers)) {
      const c = orderColour(l.kind);
      o.dotted(l.x, l.z, l.endX, l.endZ, (x, z) => h(x, z) + lift, c);
      if (l.kind === 'attack') {
        const tg = this.fresh.get(`e:${l.target}`);
        if (tg && !flagged.has(tg.key)) {
          flagged.add(tg.key);
          this.flags.dot(tg.centre.x, tg.centre.y, tg.centre.z);
        }
        continue;
      }
      flag(l.endX, l.endZ, l.kind, c);
      if (l.kind === 'patrol' && l.backX !== undefined && l.backZ !== undefined) flag(l.backX, l.backZ, l.kind, c);
    }
  }

  /** A selected unit on a move, an attack-move, a patrol or an attack: where it stands and where its order ends (GP-23). */
  private mover(t: Selectable, ord: import('@blockyrts/sim').UnitOrder): Mover | null {
    const at = { x: t.centre.x, z: t.centre.z };
    switch (ord.t) {
      case 'move':
      case 'attackMove':
        return { ...at, kind: ord.t, endX: ord.x / WU_PER_METRE, endZ: ord.z / WU_PER_METRE };
      case 'patrol': {
        const there = ord.leg === 0 ? [ord.x, ord.z] : [ord.x2, ord.z2];
        const back = ord.leg === 0 ? [ord.x2, ord.z2] : [ord.x, ord.z];
        return { ...at, kind: 'patrol', endX: there[0]! / WU_PER_METRE, endZ: there[1]! / WU_PER_METRE, backX: back[0]! / WU_PER_METRE, backZ: back[1]! / WU_PER_METRE };
      }
      case 'attack': {
        const tg = this.fresh.get(`e:${ord.id}`);
        if (tg) return { ...at, kind: 'attack', endX: tg.centre.x, endZ: tg.centre.z, target: ord.id };
        const u = this.game.unit(ord.id);
        return u ? { ...at, kind: 'attack', endX: u.x / WU_PER_METRE, endZ: u.z / WU_PER_METRE, target: ord.id } : null;
      }
      default:
        return null;
    }
  }

  /**
   * Marked digs and tunnels until done (Jade's Patch 4): the full
   * see-through box while a selected worker has the site in its orders, and
   * otherwise one thin dotted line tracing it (site-marks.ts). The area being
   * marked shows the cut as a see-through box.
   */
  private drawSites(o: Overlay, h: (x: number, z: number) => number): void {
    const tu = TERRAIN_UNIT_M;
    const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, c: THREE.Color): void => {
      o.box(x0 * COLUMN_M, Math.min(y0, y1), z0 * COLUMN_M, (x1 + 1) * COLUMN_M, Math.max(y0, y1), (z1 + 1) * COLUMN_M, c);
    };
    const stretch = (x: number, z: number, dir: number, length: number, width: number, y0: number, y1: number, c: THREE.Color): void => {
      for (const [x0, z0, x1, z1] of stretchBoxes(x, z, dir, length, width)) box(x0, z0, x1, z1, y0, y1, c);
    };
    const sites = this.game.info?.sites ?? [];
    const selected: number[] = [];
    for (const t of this.selection.list()) {
      const id = entityIdOf(t.key);
      if (id !== null && t.owner === this.player) selected.push(id);
    }
    const worked = sitesInOrders(selected, this.game.queues);
    const traces = siteTraces(sites);
    for (const s of sites) {
      const c = s.kind === SiteKind.Dig ? DIG : TUNNEL;
      if (!worked.has(s.id)) {
        for (const r of traces.get(s.id) ?? []) {
          const y = r.y;
          o.dotted(r.ax, r.az, r.bx, r.bz, y === null ? (x, z) => h(x + r.nx * TRACE_NUDGE_M, z + r.nz * TRACE_NUDGE_M) + TRACE_LIFT_M : () => y, c);
        }
        continue;
      }
      const cx = ((s.x0 + s.x1 + 1) / 2) * COLUMN_M;
      const cz = ((s.z0 + s.z1 + 1) / 2) * COLUMN_M;
      const ground = h(cx, cz);
      if (s.kind === SiteKind.TunnelLine) {
        const { dir, length } = stretchBetween(s.x0, s.z0, s.x1, s.z1);
        stretch(s.x0, s.z0, dir, length, s.axis, s.level * tu, s.level2 * tu, c);
      } else if (s.kind === SiteKind.Tunnel) box(s.x0, s.z0, s.x1, s.z1, s.level * tu, s.level2 * tu, c);
      else box(s.x0, s.z0, s.x1, s.z1, s.level * tu, ground + 0.1, c);
    }
    // A tunnel chain: its anchor, and the next stretch towards the cursor.
    const a = this.commands.area;
    if (a?.chain) {
      const t = this.commands.tunnelPlan();
      const y1 = (a.chain.floor + a.tunnelUnits) * tu;
      if (t && t.length > 0) stretch(t.x, t.z, t.dir, t.length, TUNNEL_WIDTH_COLUMNS, a.chain.floor * tu, y1, TUNNEL);
      else box(a.chain.x, a.chain.z, a.chain.x, a.chain.z, a.chain.floor * tu, y1, TUNNEL);
      return;
    }
    const plan = this.commands.areaPlan();
    if (!plan || !a) return;
    if (plan.tunnel) box(plan.x0, plan.z0, plan.x1, plan.z1, plan.level * tu, plan.level2 * tu, TUNNEL);
    else box(plan.x0, plan.z0, plan.x1, plan.z1, plan.level * tu, plan.top * tu + 0.05, DIG);
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
      case 'attackMove':
      case 'patrol':
        return this.groundPoint(o.x / WU_PER_METRE, o.z / WU_PER_METRE);
      case 'attack':
      case 'follow': {
        const u = this.game.unit(o.id);
        return u ? this.groundPoint(u.x / WU_PER_METRE, u.z / WU_PER_METRE) : null;
      }
      case 'gather': {
        const n = this.extras.node(o.cx, o.cz, o.i);
        return n ? this.groundPoint(n.centre.x, n.centre.z) : null;
      }
      case 'loot': {
        const l = o.id ? this.game.info?.loot.find((p) => p.id === o.id) : undefined;
        return l ? this.groundPoint(l.x / WU_PER_METRE, l.z / WU_PER_METRE) : null;
      }
      case 'build': {
        const s = buildingSpec(o.kind);
        return this.groundPoint((o.x + s.w / 2) * COLUMN_M, (o.z + s.d / 2) * COLUMN_M);
      }
      case 'work':
      case 'dropoff':
      case 'enter':
      case 'job':
      case 'relight':
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
    this.refreshPortrait(list);
    this.buttons.get('clear')?.el.classList.toggle('idle', list.length === 0);
    // Plain words with the player's own keys (Jade's Patch 3).
    const key = (action: string): string => {
      const id = keyFor(this.settings.keys, action);
      return id === 'Backspace' ? 'Backspace' : keyLabel(id);
    };
    this.panel.render(list, this.activeType(), [
      `Left click a unit to select it, or drag a box around several. Double click one (or ${CTRL_NAME} + click) to select all of its kind on screen.`,
      'Right click to give an order. Hold Shift to add to the selection or to line up orders.',
      `${key('idle')}: find an idle worker. ${key('townhall')}: go to your main base. Hold \` and press 1 to 0 to save a control group.`,
    ]);
  }

  /**
   * The doing-now marker (patch notes 1): an animated mark on the card button
   * of what the active subgroup is doing or walking to do, from each unit's
   * current order; for a building, what it makes now or its upgrade.
   */
  private markDoing(): void {
    const active = this.activeType();
    const doing = new Set<string>();
    if (active && !this.commands.targeting && !this.commands.placing && !this.commands.area) {
      if (active.startsWith('building:')) {
        for (const b of this.commands.buildings()) {
          if (b.kind !== Number(active.split(':')[1])) continue;
          const head = b.queue[0];
          if (head) {
            doing.add(`product:${head.product}`);
            const t = troopOf(head.product);
            if (t) doing.add(`troop:${t.troop}`);
            const m = mageOf(head.product);
            if (m) doing.add(`troop:${mageLock(m.school)}`);
          }
          if (b.upgrading) doing.add('upgrade');
        }
      } else {
        const heads = this.commands.unitIds((t) => t.typeKey === active).map((id) => this.game.queues.get(id)?.[0]);
        for (const a of doingActions(heads, active)) doing.add(a);
      }
    }
    for (let i = 0; i < this.cardButtons.length; i++) {
      const b = this.cardButtons[i]!;
      const on = !b.el.hidden && doing.has(this.cardDoing[i] ?? '');
      if (b.el.classList.contains('doing') !== on) b.el.classList.toggle('doing', on);
    }
  }

  private refreshCommandCard(): void {
    const card: Card = this.commands.card();
    // Jade's Patch 2: square buttons as big as the card holds, never under the minimum; the card grows upward only when they cannot fit at it.
    // Jade, indev 0.8: the minimum is the size at which the card holds CARD_HOLDS buttons (g.buttonMin).
    const g = this.geometry;
    const inner = cardInner(g);
    const fit = fitButtons(card.length, inner.w, inner.h, g.maxH, g.buttonMin);
    const was = this.cardFit;
    if (!was || was.size !== fit.size || was.cols !== fit.cols || was.rows !== fit.rows || was.height !== fit.height || was.shown !== fit.shown) {
      this.cardFit = fit;
      applyGeometry(this.layout, g, fit, this.folds);
      this.portraitRect = null;
      this.panels.measure();
      this.ensureCardButtons();
    }
    for (let i = 0; i < this.cardButtons.length; i++) {
      const b = this.cardButtons[i]!;
      const e = i < fit.shown ? card[i] : undefined;
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
        icon: e.icon ?? actionIcon(e.action, e.face),
        className: `cmd${e.menu ? ' menu-item' : ''}${e.action === 'cancel' || e.action === 'cancelBuild' ? ' cancel' : ''}${e.auto ? ' auto-on' : ''}`,
        onPress: (p) => e.run(p),
        ...(e.double ? { onDoubleClick: (p: ButtonPress) => e.double!(p) } : {}),
        ...(e.right ? { onRightClick: (p: ButtonPress) => e.right!(p) } : {}),
        ...(e.grey ? { onGreyPress: () => e.grey!() } : {}),
      });
      this.cardDoing[i] = e.product !== undefined ? `product:${e.product}` : e.troop !== undefined ? `troop:${e.troop}` : e.action;
      b.setEnabled(e.enabled, e.reason);
      b.setLit(e.lit === true);
      b.el.hidden = false;
    }
    this.input.refreshHover();
  }
}

/** Commands whose cursor is the tool for the job (Jade's Patch 5, CT-1: "something basic and visually clear that fits it"). */
const TOOL_CURSORS: Partial<Record<string, ToolCursor>> = { gather: 'axe', hunt: 'spear', repair: 'hammer' };

/** The portrait's window is a button: its tooltip names what is shown, a click centres the camera on it. */
const PORTRAIT_VIEW = { id: 'portrait-view', face: '', name: 'Portrait', keys: [], description: '', className: 'portrait-view' };

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
