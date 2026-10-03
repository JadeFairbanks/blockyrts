// Orders and the command card (Controls: Unit orders; Command card and
// hotkeys; Building placement; Queuing orders with Shift; Production queues).
// Works out the 15 buttons for the active subgroup, the targeted commands and
// their clicks, the smart right click, and the placement ghost with Shift
// chains, wall chains clicked from point to point, and dragged lines of
// lights; and the dig area, with tunnel chains clicked the same way. Orders go out through `issue`; what the
// world looks like comes from GameInfo and the selectables under the cursor.
import * as THREE from 'three';
import { cue } from '../audio/cues.ts';
import {
  BuildingKind,
  costText,
  engineSpec,
  holderKind,
  Line,
  linePiece,
  mainCost,
  Research,
  Skill,
  SKILL_TRAINING,
  BUILDINGS,
  buildingSpec,
  footprintDims,
  kitName,
  levelSpec,
  MAGE_RANK_TRAINING,
  MONSTERS,
  FactionKind,
  Mob,
  PEOPLES,
  TRADE_BUILDINGS,
  nextMageTraining,
  PickOwn,
  Product,
  productSpec,
  RANK_TRAINING,
  Res,
  RESEARCH,
  RESEARCH_PRODUCT,
  RESOURCES,
  schoolSpells,
  plannedSpots,
  siteCells,
  SiteKind,
  SITE_MAX_COLUMNS,
  snapStretch,
  speciesSpec,
  stretchBetween,
  stretchCells,
  stretchEnd,
  stretchRoom,
  STRETCH_DIRS,
  TUNNEL_HEIGHT_UNITS,
  TUNNEL_MAX_UNITS,
  TUNNEL_MIN_UNITS,
  TUNNEL_STRETCH_MAX_COLUMNS,
  TUNNEL_WIDTH_COLUMNS,
  WALL_STRETCH_MAX_COLUMNS,
  Spell,
  SPELLS,
  Troop,
  TROOP_PRODUCT,
  troopProduct,
  TOOL_KITS,
  upgradePieces,
  upgradeTarget,
  type KitHolder,
  WU_PER_COLUMN,
  WU_PER_METRE,
  WU_PER_TERRAIN_UNIT,
  type BuildingSpec,
  type Cost,
  type Order,
} from '@blockyrts/sim';
import type { UnitInfo } from '../game/game-info.ts';
import type { GameInfo } from '../game/game-info.ts';
import { GRID_CODES, keyFor, spellAction } from '../input/bindings.ts';
import type { BuildingInfo, PeopleInfo } from '../messages.ts';
import { isOwn } from '../selection/rules.ts';
import { buildingIdOf, entityIdOf, type Selectable } from '../selection/types.ts';
import type { Settings } from '../settings/settings.ts';
import type { Ghost, GhostSpot } from '../world/buildings-view.ts';
import { COLUMN_M } from '../world/mesher.ts';
import type { ButtonPress } from './buttons.ts';
import { troopChoice, troopCostText, troopName, troopWhy } from './troops.ts';

/** One button of the command card. */
export interface CardEntry {
  /** Stable name of what it does (tests, lit state). */
  action: string;
  face: string;
  name: string;
  /** Binding name: a letter by character ('KeyG'), or a grid position by physical code in a build menu. */
  key: string;
  /** In a build menu the key is a key position, not a character. */
  grid?: boolean;
  description: string;
  enabled: boolean;
  /** Why it is greyed out. */
  reason: string;
  lit?: boolean;
  /** Shown in red: it cannot be paid for right now (the ghost still appears, so the player can plan). */
  short?: boolean;
  run(p: ButtonPress): void;
  double?(p: ButtonPress): void;
}

export type Card = Array<CardEntry | null>;

/** The card's commands that work on another player's shared units (the sim's allied orders). */
const ALLIED_ACTIONS = new Set(['attack', 'stop', 'hold', 'patrol', 'move', 'gather', 'returnCargo', 'cancel']);

type TargetCommand = 'move' | 'gather' | 'repair' | 'enter' | 'rally' | 'attack' | 'patrol' | 'prospect' | 'hunt' | 'cast' | 'hitch';

/** Pages of the command card: the main card, the build menus and a building's K menu (smelting, cooking, research and the rest). */
export type CardPage = 'main' | 'basic' | 'advanced' | 'make';

/**
 * Dig (D) and earthworks: an area dragged on the ground, then confirmed with
 * a left click (Dig: area, depth, preview); or, for Dig, a tunnel chain
 * clicked from point to point (Digging: tunnel chains).
 */
export interface Area {
  mode: 'dig' | 'earthwork';
  /** Earthworks: 0 earth bank, 1 earth ramp, 2 fill, 3 lumber ramp, 4 stone ramp. */
  variant: number;
  /** Global columns where the drag started, and where it is now or ended. */
  from: { x: number; z: number } | null;
  to: { x: number; z: number } | null;
  dragging: boolean;
  /** Dig depth or bank height, terrain units. */
  units: number;
  /** A tunnel's height, terrain units. */
  tunnelUnits: number;
  /** Tunnel (D again on the dig card): presses start a tunnel chain on flat ground too, not only on a face. */
  tunnel: boolean;
  /** A tunnel chain under way: the anchor the next stretch runs from, and the floor every stretch keeps (terrain units). */
  chain: { x: number; z: number; floor: number } | null;
  /** Stretches of this chain ordered so far: the first goes in with Shift or not, the rest after it. */
  stretches: number;
  /** The column under the cursor, while a chain waits for its next click. */
  cursor: { x: number; z: number } | null;
}

/** A stretch being previewed: from its anchor, its direction and length, and the columns it covers. */
export interface StretchPlan {
  x: number;
  z: number;
  dir: number;
  length: number;
  cells: Array<[number, number]>;
}

/** What an area would mark, in the sim's terms, with the heights the preview draws. */
export interface AreaPlan {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Dig: the face is a hillside, so this is a tunnel. */
  tunnel: boolean;
  /** As in the dig and earthwork orders (terrain units). */
  level: number;
  level2: number;
  axis: number;
  /** Ground at the drag start, and the highest and lowest ground in the box (terrain units). */
  start: number;
  top: number;
  low: number;
  /** Earthworks: Earth it needs (one per column per terrain unit raised). */
  earth: number;
}

/** A terrain unit in metres (about 11 cm). */
export const TERRAIN_UNIT_M = WU_PER_TERRAIN_UNIT / WU_PER_METRE;
/** Depth and height steps of the + and - buttons and the wheel: 3 units, about 34 cm (s). */
export const AREA_STEP_UNITS = 3;
/** Depth of a new dig and height of a new bank: 9 units, about 1 m (s). */
export const AREA_DEFAULT_UNITS = 9;
/** The dig limit: 3 m below the natural ground (Digging and building up the land). */
export const AREA_MAX_UNITS = 27;
/** A dig starts a tunnel when the box rises this far above where the drag started: a face about 2.25 m tall (s). */
export const TUNNEL_FACE_UNITS = 20;
/** A press on the side of land at least this much taller than the ground in front of it (a rise nobody can jump, 5 units) starts a tunnel chain into that face (s). */
export const FACE_MIN_UNITS = 5;
const EARTHWORK_NAMES = ['Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp'];
/** Earthworks variants shaped as a ramp: earth, lumber and stone. */
const rampVariant = (v: number): boolean => v === 1 || v === 3 || v === 4;

const LOCK_FACES = ['Auto', 'Melee', 'Ranged'];

/** The troop types' card actions, their buttons' faces and slots on a Barracks or Stables card (a main base shifts them one along for Worker). */
const TROOP_ACTIONS: Readonly<Record<number, readonly [string, string, number]>> = {
  [Troop.Close]: ['trainClose', 'Close', 0],
  [Troop.Long]: ['trainLong', 'Long', 1],
  [Troop.Ranger]: ['trainRanger', 'Ranger', 2],
  [Troop.Brawler]: ['trainBrawler', 'Brawler', 3],
  [Troop.Cavalry]: ['trainCavalry', 'Cavalry', 0],
};

/** Whether a selectable's type is one of the player's units that wears gear and eats: workers, warriors and mages. */
const geared = (u: Selectable): boolean => u.typeKey === 'worker' || u.typeKey === 'warrior' || u.typeKey.startsWith('mage:');

/** Whether a building trains workers, warriors or mages, which come out to its rally point. */
const trainsUnits = (b: BuildingInfo): boolean =>
  buildingSpec(b.kind).trainsWorkers || b.troops.length > 0 || b.products.some(([p]) => p === Product.SupportMage || p === Product.BattleMage);

export interface Targeting {
  command: TargetCommand;
  /** The hotkey that started it: holding it keeps the command for the next click. */
  key: string;
  /** For 'cast': the spell waiting for its target. */
  spell?: number;
}

export interface Placing {
  kind: number;
  variant: number;
  /** Corner of the footprint under the cursor, global columns. */
  x: number;
  z: number;
  /** A dragged line of lights: where the drag started, or null. */
  dragFrom: { x: number; z: number } | null;
  /** A wall chain under way: the anchor the next stretch runs from (the end of the last), or null before the first click. */
  chain: { x: number; z: number } | null;
  /** The spots being shown, with the sim's answers once they arrive. */
  spots: GhostSpot[];
}

export interface CommandDeps {
  player: number;
  game: GameInfo;
  settings: Settings;
  selection(): readonly Selectable[];
  /** The kinds of thing in the active subgroup ('worker', 'building:0:1', ...). */
  activeType(): string | null;
  send(order: Order): void;
  /** Shift held or Queue Mode lit. */
  queued(): boolean;
  held(key: string): boolean;
  message(text: string, kind?: 'system' | 'alert'): void;
  marker(at: THREE.Vector3, kind: 'move' | 'target'): void;
  /** Ask the sim for placement tiles at these corners; answers come back through onPlaced. */
  askPlacement(kind: number, variant: number, spots: Array<[number, number]>): void;
  /** A resource node's selectable by chunk and index, if it is loaded. */
  node(cx: number, cz: number, index: number): Selectable | undefined;
  /** Ground height in metres. */
  heightAt(x: number, z: number): number;
  /** Something changed that the card shows. */
  changed(): void;
  /** The war pop-up for one of the neutral peoples; `then` runs once the player declares war. */
  confirmWar(faction: number, then: () => void): void;
  /** The trade menu, or a mercenary camp's hire box. */
  openPeople(faction: number): void;
}

/** Spacing of lights placed along a dragged line: 8 m, so their 5 m claims overlap. */
export const LIGHT_LINE_SPACING_M = 8;

/** Grid slot (0..14) of a Table 4 menu slot (1-based); slot 15 (B) is always Back. */
export function gridSlot(menuSlot: number): number {
  return menuSlot - 1;
}

/** The buildings of a build menu by grid slot: one kind, or several sharing a slot (shown as a submenu). */
export function menuSlots(menu: 'basic' | 'advanced'): BuildingSpec[][] {
  const out: BuildingSpec[][] = Array.from({ length: 15 }, () => []);
  for (const b of BUILDINGS) if (b.menu === menu) out[gridSlot(b.slot)]!.push(b);
  return out;
}

/** The choices of a submenu: each building, each crop of a farm, each way of a gate or earthwork, in grid order. */
export function submenuChoices(specs: readonly BuildingSpec[]): Array<{ spec: BuildingSpec; variant: number; name: string }> {
  const out: Array<{ spec: BuildingSpec; variant: number; name: string }> = [];
  for (const spec of specs) {
    if (spec.crops && spec.kind !== BuildingKind.HerbBed) spec.crops.forEach((c, v) => out.push({ spec, variant: v, name: c.name }));
    else if (spec.variants) spec.variants.forEach((name, v) => out.push({ spec, variant: v, name }));
    else out.push({ spec, variant: 0, name: spec.name });
  }
  return out.slice(0, 14);
}

/** "300 softwood lumber, 150 stone" */
export function costLine(cost: Cost): string {
  if (cost.length === 0) return 'free';
  return cost.map(([r, n]) => `${n} ${RESOURCES[r]!.name.toLowerCase()}`).join(', ');
}

function seconds(ws: number): string {
  return ws >= 60 && ws % 60 === 0 ? `${ws / 60} min` : `${ws} s`;
}

/** The submenu names for shared slots. */
const SUBMENU_NAMES: Record<string, string> = { '2': 'Farms', '10': 'Walls', '11': 'Earthworks', '13': 'Lights' };

export class Commands {
  menu: { page: CardPage; sub: number } = { page: 'main', sub: -1 };
  targeting: Targeting | null = null;
  placing: Placing | null = null;
  area: Area | null = null;
  private plan: { sig: string; plan: AreaPlan | null } = { sig: '', plan: null };
  private placeAsked = '';
  private lastPlaceAsk = 0;

  constructor(private readonly d: CommandDeps) {}

  private key(action: string): string {
    return keyFor(this.d.settings.keys, action);
  }

  // ---- What is selected ----

  /** Own units in the selection that are workers. */
  workerIds(): number[] {
    return this.unitIds((u) => u.typeKey === 'worker');
  }

  /** Own units in the selection, optionally filtered. */
  unitIds(filter: (t: Selectable) => boolean = () => true): number[] {
    const out: number[] = [];
    for (const t of this.d.selection()) {
      if (t.kind !== 'unit' || !isOwn(t, this.d.player) || !filter(t)) continue;
      const id = entityIdOf(t.key);
      if (id !== null) out.push(id);
    }
    return out;
  }

  /** Own buildings in the selection, as the sim last described them. */
  buildings(): BuildingInfo[] {
    const out: BuildingInfo[] = [];
    for (const t of this.d.selection()) {
      if (t.kind !== 'building' || !isOwn(t, this.d.player)) continue;
      const id = buildingIdOf(t.key);
      const b = id === null ? undefined : this.d.game.buildings.get(id);
      if (b) out.push(b);
    }
    return out;
  }

  /** Esc (and right click): back out of a chain, a target, a ghost or a submenu; true if there was one. Ending a chain with Shift held keeps the ghost or Dig for another. */
  back(): boolean {
    if (this.area) {
      if (this.area.chain && this.d.queued()) {
        this.area = { ...this.area, chain: null, stretches: 0, cursor: null };
        this.d.changed();
      } else this.endArea();
      return true;
    }
    if (this.placing) {
      if (this.placing.chain && this.d.queued()) {
        this.placing.chain = null;
        this.d.changed();
      } else this.endPlacing();
      return true;
    }
    if (this.targeting) {
      this.targeting = null;
      this.d.changed();
      return true;
    }
    if (this.menu.page !== 'main') {
      const menus = this.menu.page === 'basic' || this.menu.page === 'advanced';
      this.menu = this.menu.sub >= 0 && menus ? { page: this.menu.page, sub: -1 } : { page: 'main', sub: -1 };
      this.d.changed();
      return true;
    }
    return false;
  }

  /** The selection changed: menus, targets and ghosts belong to the old one. */
  reset(): void {
    this.menu = { page: 'main', sub: -1 };
    this.targeting = null;
    this.area = null;
    if (this.placing) this.endPlacing();
  }

  // ---- The card ----

  card(): Card {
    const card: Card = Array.from({ length: 15 }, () => null);
    const active = this.d.activeType();
    if (this.placing || this.targeting || this.area) {
      card[14] = this.cancelEntry();
    }
    if (active === null) return card;
    if (this.area && active === 'worker') return this.areaCard(card);
    if (active === 'worker' || active === 'warrior' || active.startsWith('mage:')) {
      if (this.alliedOnly(active)) return this.alliedCard(card, active);
      if ((this.menu.page === 'basic' || this.menu.page === 'advanced') && active === 'worker') return this.buildMenuCard(card);
      this.unitCard(card, active);
    } else if (active.startsWith('engine:')) {
      this.engineCard(card);
    } else if (active.startsWith('building:')) {
      const kind = Number(active.split(':')[1]);
      if (this.menu.page === 'make') return this.makeCard(card, kind);
      this.buildingCard(card, kind);
    }
    return card;
  }

  /** Whether every selected unit of the active type is another player's, shared with this one. */
  private alliedOnly(active: string): boolean {
    const list = this.d.selection().filter((t) => t.kind === 'unit' && t.typeKey === active);
    return list.length > 0 && list.every((t) => t.owner !== this.d.player);
  }

  /** Shared units take the shared orders only (Allies panel): move, attack, patrol, hold, gather, shelter and garrison. */
  private alliedCard(card: Card, active: string): Card {
    this.unitCard(card, active);
    for (let i = 0; i < card.length; i++) {
      const e = card[i];
      if (e && !ALLIED_ACTIONS.has(e.action)) card[i] = null;
    }
    return card;
  }

  private cancelEntry(): CardEntry {
    const chain = this.placing?.chain ?? this.area?.chain ?? null;
    if (chain) {
      const walls = this.placing !== null;
      return {
        action: 'cancel',
        face: 'Done',
        name: walls ? 'End the wall chain' : 'End the tunnel',
        key: 'Escape',
        description: `${walls ? 'End the wall chain: the walls already placed stay planned and the workers build them.' : 'End the tunnel: the stretches already marked stay marked and the workers dig them.'} Right click does the same. With Shift held, ${walls ? 'the wall stays on the cursor' : 'Dig stays on'} for a new chain.`,
        enabled: true,
        reason: '',
        run: () => this.back(),
      };
    }
    return {
      action: 'cancel',
      face: 'Cancel',
      name: 'Cancel',
      key: 'Escape',
      description: this.placing
        ? Commands.chained(this.placing.kind)
          ? 'Put the wall away without placing it. Right click does the same.'
          : 'Put the building away without placing it. Right click does the same.'
        : this.area
          ? 'Stop marking the area. Right click does the same.'
          : 'Cancel the command waiting for a target. Right click does the same.',
      enabled: true,
      reason: '',
      run: () => this.back(),
    };
  }

  private entry(action: string, face: string, description: string, run: (p: ButtonPress) => void, extra: Partial<CardEntry> = {}): CardEntry {
    const a = action;
    return { action: a, face, name: extra.name ?? face, key: this.key(a), description, enabled: true, reason: '', run, ...extra };
  }

  private off(action: string, face: string, description: string, reason: string, name?: string): CardEntry {
    return { action, face, name: name ?? face, key: this.key(action), description, enabled: false, reason, run: () => undefined };
  }

  private unitCard(card: Card, active: string): void {
    const t = this.targeting?.command;
    card[0] = this.entry('attack', 'Attack', 'Then left click an enemy to attack it, or ground to attack-move there: walk, and fight whatever comes in range on the way. Right click or Esc cancels. Press twice (or double click) and each one attacks the nearest enemy it can see.', () => this.target('attack', 'attack'), { lit: t === 'attack', double: () => this.pickOwn(PickOwn.Attack, 'Each one attacks the nearest enemy it can see.') });
    card[1] = this.entry('stop', 'Stop', 'Cancel every queued order; units stand still but fight back.', () => this.stop());
    card[2] = this.entry('hold', 'Hold', 'Cancel every order and never move, not even to chase: they fight only what comes in reach. With Shift, they hold once their earlier orders are done.', () => this.hold(), { name: 'Hold Position' });
    card[3] = this.entry('patrol', 'Patrol', 'Then left click ground: they walk back and forth between here and there, fighting whatever they meet.', () => this.target('patrol', 'patrol'), { lit: t === 'patrol' });
    card[4] = this.entry('move', 'Move', 'Then left click ground or the minimap to move there, or a unit to follow it. Right click or Esc cancels. Hold M (or Shift) to give several.', () => this.target('move', 'move'), { lit: t === 'move' });
    if (active === 'worker') {
      const workers = this.workerIds();
      const carrying = workers.some((id) => {
        const u = this.d.game.unit(id);
        return u !== null && u.carryAmt > 0;
      });
      card[5] = this.entry('gather', 'Gather', 'Then left click a tree, rock or bush. Gatherers carry 25 lb loads to the nearest drop-off and come back until it runs out, then try the nearest node of the same kind. Press twice (or double click) and each one gathers the nearest node it can within 15 m, more of what it carries first.', () => this.target('gather', 'gather'), { lit: t === 'gather', double: () => this.pickOwn(PickOwn.Gather, 'Each one gathers the nearest node it can.') });
      card[6] = carrying
        ? this.entry('returnCargo', 'Return', 'Take what they carry to the nearest drop-off, then go back to the node.', () => this.unitOrder({ kind: 'returnCargo' }), { name: 'Return Cargo' })
        : this.off('returnCargo', 'Return', 'Take what they carry to the nearest drop-off, then go back to the node.', 'They are not carrying anything.', 'Return Cargo');
      card[7] = this.entry(
        'repair',
        'Repair',
        'Then left click one of your buildings to build, upgrade or repair it. Press twice (or double click) and they repair every damaged building nearby, worst first.',
        () => this.target('repair', 'repair'),
        { lit: t === 'repair', double: () => this.repairAll() },
      );
      card[8] = this.entry(
        'dig',
        'Dig',
        'Then left drag over the ground to mark an area. + and - (or the wheel) set the depth, about 34 cm a step, down to the 3 m limit; a see-through box shows the cut. Left click confirms. Clicking the side of a cliff or hillside starts a tunnel instead (D again, or Tunnel, for one on flat ground): click where it goes and each click digs the stretch from the last point, level, straight or diagonal; keep clicking to turn corners, right click ends it. Digging gives Earth, stone or what the ground is made of. Earth digs with any digging tool; rock needs a stone maul or a pickaxe, marble a bronze pickaxe.',
        () => this.startArea('dig', 0),
      );
      card[9] = this.entry(
        'prospect',
        'Prospect',
        'Then left click the ground: a worker walks there and spends 40 s (20 s with a prospecting hammer) finding out what lies under it. The rating, Poor, Fair, Good or Rich, sets what a mineshaft there brings up (x0.5 to x2.5). Press twice (or double click) and each worker prospects where it stands.',
        () => this.target('prospect', 'prospect'),
        { lit: t === 'prospect', double: () => this.pickOwn(PickOwn.Prospect, 'Prospecting where they stand.') },
      );
      card[10] = this.entry('buildBasic', 'Build', 'Open the Basic Structures menu: homes, farms, storage, walls, lights. Grid keys pick a building; B is Back.', () => this.openMenu('basic'), { name: 'Build Basic Structures' });
      card[11] = this.entry('buildAdvanced', 'Adv.', 'Open the Advanced Structures menu: buildings that need rare resources or technology.', () => this.openMenu('advanced'), { name: 'Build Advanced Structures' });
      // Workers never patrol (s): the slot is their rank training, which the equipment panel used to hold.
      card[3] = this.rankEntry(workers);
      card[13] = this.upgradeEntry(workers, Line.Weapon, false);
      if (!card[14]) card[14] = this.cartEntry(workers);
    } else if (active.startsWith('mage:')) {
      this.mageCard(card, active);
    } else {
      const troops = this.unitIds((u) => u.typeKey === 'warrior');
      card[5] = this.upgradeEntry(troops, Line.Weapon, false);
      card[6] = this.upgradeEntry(troops, Line.Armour, false);
      card[7] = this.lockEntry();
      card[8] = this.cannonEntry();
      card[9] = this.entry(
        'hunt',
        'Hunt',
        'Then left click an animal: the warriors chase it down, and workers in the selection follow and carry the meat home. Press twice (or double click) and they keep hunting the nearest game within 40 m, bringing the meat home each time. Bears and creatures that guard their ground are left alone unless clicked. A hunt ends at dusk.',
        () => this.target('hunt', 'hunt'),
        { lit: t === 'hunt', double: () => this.huntAuto() },
      );
      card[10] = this.eatEntry();
      // The Max twins show only when they would go further than the plain buttons.
      card[11] = this.maxEntry(troops, Line.Weapon, card[5]);
      card[13] = this.maxEntry(troops, Line.Armour, card[6]);
    }
    card[12] = this.entry(
      'enter',
      'Enter',
      'Then left click a building to go inside. Workers shelter in main bases and farms and take 10% of the damage the building takes. Ranged warriors and mages garrison towers (4) and the parapets of a level 3 main base (8) and shoot or cast from the top. Warriors clicked onto one of your siege engines or cannons crew it. Press twice (or double click) and each one goes into the nearest building with room for it.',
      () => this.target('enter', 'enter'),
      { lit: t === 'enter', double: () => this.pickOwn(PickOwn.Enter, 'Each one goes into the nearest building with room for it.') },
    );
  }

  /**
   * A mage's card (Magic): her school's five spells in the middle row, each
   * waiting for a click on its target, or cast on the best target by every
   * selected mage when pressed twice; then Eat, rank training, Enter and gear.
   */
  private mageCard(card: Card, active: string): void {
    const ids = this.unitIds((u) => u.typeKey === active);
    const school = active === 'mage:battle' ? 2 : 1;
    schoolSpells(school).slice(0, 5).forEach((spell, k) => {
      card[5 + k] = this.spellEntry(ids, spell);
    });
    // F is Fortify and Fireball on this card, so Eat has no key here; it is a click.
    card[10] = { ...this.eatEntry(), key: '' };
    card[11] = this.mageRankEntry(ids);
    // No room for Max twins on a mage's card: pressing an upgrade twice goes to the best.
    card[13] = this.upgradeEntry(ids, Line.Weapon, false);
    if (!card[14]) card[14] = this.upgradeEntry(ids, Line.Armour, false);
  }

  /** A spell button: greyed with the reason when none of the selected mages can cast it now (a cooldown only delays it). */
  private spellEntry(ids: number[], spell: number): CardEntry {
    const s = SPELLS[spell]!;
    const action = spellAction(spell);
    const states = ids.map((id) => this.d.game.spells(id).find(([sp]) => sp === spell)).filter((x) => x !== undefined);
    const usable = states.filter(([, why]) => why === '' || why === 'Not ready yet.');
    const ready = usable.filter(([, why]) => why === '');
    const wait = usable.length > 0 && ready.length === 0 ? Math.min(...usable.map(([, , steps]) => steps)) : 0;
    const aim =
      s.target === 'ally'
        ? 'Then left click one of your units.'
        : s.target === 'point'
          ? 'Then left click the ground where it lands.'
          : s.target === 'counter'
            ? 'Then left click an enemy that is casting.'
            : 'Then left click an enemy.';
    const pick = s.target === 'counter' ? 'Pressed twice, each mage stops the nearest enemy spell.' : 'Pressed twice (or double clicked), every selected mage casts it on the best target herself.';
    const lines = [
      s.text,
      `Mana ${s.mana}, ready again after ${Math.round(s.cooldown / 2) / 10} s, range ${Math.round(s.range / WU_PER_METRE)} m. Learned at rank ${s.rank}${s.hexcraft ? ', with Hexcraft' : ''}.`,
      aim,
      pick,
    ];
    if (s.target === 'counter') lines.push('A mage who knows it also casts it by herself when an enemy spell starts in range.');
    if (s.id === SPELLS[schoolSpells(s.school)[0]!]!.id) lines.push('She casts this one by herself too.');
    if (wait > 0) lines.push(`Ready in ${Math.ceil(wait / 20)} s.`);
    const reason = usable.length > 0 ? '' : (states[0]?.[1] ?? 'Only mages cast spells.');
    const short = SPELL_FACES[spell] ?? shortFace(s.name);
    const face = wait > 0 ? `${short} ${Math.ceil(wait / 20)}` : short;
    return {
      action,
      face,
      name: s.name,
      key: this.key(action),
      description: lines.join(' '),
      enabled: reason === '',
      reason,
      lit: this.targeting?.command === 'cast' && this.targeting.spell === spell,
      run: () => {
        this.targeting = { command: 'cast', key: this.key(action), spell };
        this.d.changed();
      },
      double: () => this.castAuto(spell),
    };
  }

  /** A spell pressed twice: each mage that knows it picks her own target. */
  private castAuto(spell: number): void {
    const units = this.unitIds((u) => u.typeKey.startsWith('mage:'));
    if (units.length === 0) return;
    this.targeting = null;
    this.d.send({ kind: 'cast', player: this.d.player, units, spell, target: 0, x: 0, z: 0, auto: 1, queued: this.d.queued() });
    this.d.changed();
  }

  /** Rank training at a Magi Sanctum (Table 7): food and crystals for the first two ranks, a rank wand and her experience for the three above. */
  private mageRankEntry(ids: number[]): CardEntry {
    const name = 'Upgrade rank';
    const desc = `Send them to train at a Magi Sanctum. ${MAGE_RANK_TRAINING.map((t) => `${t.name}: ${[t.food ? `${t.food} food` : '', t.crystals ? `${t.crystals} mana crystals` : ''].filter((x) => x).join(' and ')}${t.combat ? ', once her experience from combat is enough' : ''}, ${t.steps / 20} s`).join('; ')}. Experience from combat also raises her to Acolyte and Adept Acolyte by itself.`;
    const units = ids.map((id) => this.d.game.unit(id)).filter((u): u is UnitInfo => u !== null);
    const why = (u: UnitInfo): string => {
      const t = nextMageTraining(u.rank);
      if (!t) return 'She is at the highest rank.';
      const own = this.d.game.mageRankWhy(u.id);
      if (own) return own;
      if (this.d.game.food() < t.food) return `Not enough food (needs ${t.food}).`;
      if (t.crystals && this.d.game.have(Res.ManaCrystal) < t.crystals) return `Needs ${t.crystals} mana crystals.`;
      return '';
    };
    const able = units.filter((u) => why(u) === '');
    const sanctum = [...this.d.game.buildings.values()].find((b) => b.owner === this.d.player && b.kind === BuildingKind.MagiSanctum && b.complete);
    let reason = units.length === 0 ? 'Select a mage.' : able.length === 0 ? why(units[0]!) : '';
    if (!reason && !sanctum) reason = 'Needs a Magi Sanctum.';
    const next = able.length > 0 ? nextMageTraining(able[0]!.rank) : undefined;
    if (reason) return this.off('mageRank', 'Rank', desc, reason, name);
    return this.entry('mageRank', 'Rank', desc, () => this.d.send({ kind: 'trainRank', player: this.d.player, units: able.map((u) => u.id), building: sanctum!.id, queued: this.d.queued() }), {
      name: next ? `${name} (to ${next.name})` : name,
    });
  }

  private eatEntry(): CardEntry {
    const units = this.unitIds(geared);
    const desc = `Walk to the nearest main base, storehouse or kitchen and eat: 2 food heals half their health over 10 s, and a remedy or a bandage from the stock heals what is left.`;
    const where = [...this.d.game.buildings.values()].some((b) => b.owner === this.d.player && b.complete && (b.kind === BuildingKind.MainBase || b.kind === BuildingKind.Storehouse || b.kind === BuildingKind.Cooking));
    if (!where) return this.off('eat', 'Eat', desc, 'There is no main base, storehouse or kitchen to eat at.');
    if (this.d.game.food() < 1) return this.off('eat', 'Eat', desc, 'There is no food.');
    return this.entry('eat', 'Eat', desc, () => this.d.send({ kind: 'eat', player: this.d.player, units, building: 0, queued: this.d.queued() }));
  }

  /** A, G, E or T pressed twice: each unit picks its own target (PickOwn). */
  private pickOwn(command: number, text: string): void {
    const units = command === PickOwn.Gather || command === PickOwn.Prospect ? this.workerIds() : this.unitIds();
    if (units.length === 0) return;
    this.targeting = null;
    this.d.send({ kind: 'pickOwn', player: this.d.player, units, command, queued: this.d.queued() });
    this.d.message(text);
    this.d.changed();
  }

  /** N pressed twice: hunt the nearest game, over and over, until dusk. */
  private huntAuto(): void {
    const units = this.unitIds();
    if (units.length === 0) return;
    this.targeting = null;
    this.d.send({ kind: 'hunt', player: this.d.player, units, target: 0, auto: 1, queued: this.d.queued() });
    this.d.message('Hunting: the warriors take the nearest game within 40 m until dusk.');
    this.d.changed();
  }

  private lockEntry(): CardEntry {
    const warriors = this.unitIds((u) => u.typeKey === 'warrior');
    const lock = this.d.game.unit(warriors[0] ?? -1)?.lock ?? 0;
    const next = (lock + 1) % 3;
    return this.entry(
      'lock',
      LOCK_FACES[lock]!,
      `Now: ${LOCK_FACES[lock]!.toLowerCase()}${lock === 0 ? ' (ranged while the enemy is far, melee when it gets close)' : ' only'}. Press to switch to ${LOCK_FACES[next]!.toLowerCase()}${next === 0 ? ' (switches by itself)' : ' only'}.`,
      () => this.d.send({ kind: 'lock', player: this.d.player, units: warriors, lock: next }),
      { name: 'Ranged or melee lock', lit: lock !== 0 },
    );
  }

  /** Cannon crew training at a Gunnery yard (Table 7): the one skill left; every other weapon comes with its troop type. */
  private cannonEntry(): CardEntry {
    const skill = Skill.Cannon;
    const t = SKILL_TRAINING[skill]!;
    const at = buildingSpec(t.at).name;
    const name = `Train in ${t.name}`;
    const face = 'Cannon';
    const desc = `Send them to a ${at} to learn ${t.name}, one at a time: ${t.food} food and ${t.steps / 20} s each. Cannon crew fire cannons; catapults and ballistas need no training.`;
    const untrained = this.unitIds((u) => u.typeKey === 'warrior').filter((id) => ((this.d.game.unit(id)?.skills ?? 0) & skill) === 0);
    if (untrained.length === 0) return this.off('train', face, desc, `They are already trained in ${t.name}.`, name);
    if (t.research !== Research.None && !this.d.game.researched(t.research)) return this.off('train', face, desc, `Needs ${RESEARCH[t.research]!.name} researched.`, name);
    const school = [...this.d.game.buildings.values()].find((b) => b.owner === this.d.player && b.kind === t.at && b.complete);
    if (!school) return this.off('train', face, desc, `Needs a ${at}.`, name);
    if (this.d.game.food() < t.food) return this.off('train', face, desc, `Not enough food (needs ${t.food}).`, name);
    return this.entry('train', face, desc, () => this.d.send({ kind: 'trainSkill', player: this.d.player, units: untrained, building: school.id, skill, queued: this.d.queued() }), { name });
  }

  /** The selected units as the kit rules see them, with their ids. */
  private holders(ids: number[]): Holder[] {
    const out: Holder[] = [];
    for (const id of ids) {
      const u = this.d.game.unit(id);
      const kind = u ? holderKind(u.kind) : undefined;
      if (!u || !kind) continue;
      out.push({ id, h: { kind, troop: u.troop, w: u.wTier, a: u.aTier }, rank: u.rank, pending: u.upLine !== 0 });
    }
    return out;
  }

  /**
   * Upgrade weapon (tools, wand) or armour (robe) (Troops and gear:
   * Upgrading): each unit the stock pays for, highest rank first, walks to
   * the nearest Forge, Barracks or main base (cavalry also the Stables,
   * mages also a Magi Sanctum) and gets its next tier there; Max goes to the best tier
   * researched and paid for. Pressing it twice is Max too.
   */
  private upgradeEntry(ids: number[], line: number, max: boolean): CardEntry {
    const list = this.holders(ids);
    const kind = list[0]?.h.kind ?? 'warrior';
    const what = kind === 'worker' ? 'tools' : kind === 'mage' ? (line === Line.Weapon ? 'wand' : 'robe') : line === Line.Weapon ? 'weapon' : 'armour';
    const action = line === Line.Weapon ? (max ? 'upgradeWeaponMax' : 'upgradeWeapon') : max ? 'upgradeArmourMax' : 'upgradeArmour';
    const where = kind === 'mage' ? 'the nearest Magi Sanctum, Forge, Barracks or main base' : kind === 'worker' ? 'the nearest Forge, Barracks or main base' : 'the nearest Forge, Barracks or main base (cavalry also the Stables)';
    const name = max ? `Upgrade ${what} to the best` : `Upgrade ${what}`;
    const face = max ? `${capital(what)} max` : `${capital(what)} +`;
    const plans = this.upgradePlans(list, line, max);
    const sent = plans.filter((p) => p.to > 0);
    const lines = [
      max ? `Each one gets the best ${what} researched that the stock pays for.` : `Each one gets the next tier of ${what}.`,
      `They walk to ${where}, the highest ranks first, and pay from the stock; the old kit goes back to the stock in full when the new one goes on.`,
    ];
    if (sent.length > 0) {
      const p = sent[0]!;
      const holder = list.find((x) => x.id === p.id)!;
      const piece = linePiece(holder.h, line, p.to);
      lines.push(`${sent.length === list.length ? 'All of them' : `${sent.length} of ${list.length}`} can go${piece ? `: the first to ${piece.name} (tier ${p.to}) for ${p.cost}` : ''}.`);
    }
    if (!max && kind !== 'worker') lines.push('Press twice (or double click) for the best.');
    const reason = list.length === 0 ? 'Select a unit.' : sent.length === 0 ? (plans[0]?.why ?? 'Nothing to upgrade.') : '';
    const run = (best: boolean): void => {
      const units = list.map((x) => x.id);
      if (units.length > 0) this.d.send({ kind: 'upgradeKit', player: this.d.player, units, line, max: best ? 1 : 0 });
    };
    if (reason) return this.off(action, face, lines.join(' '), reason, name);
    const extra: Partial<CardEntry> = { name };
    if (!max && kind !== 'worker') extra.double = () => run(true);
    return this.entry(action, face, lines.join(' '), () => run(max), extra);
  }

  /** The Max twin of an upgrade button, or null when it would go no further than the plain one. */
  private maxEntry(ids: number[], line: number, plain: CardEntry | null): CardEntry | null {
    if (!plain) return null;
    const list = this.holders(ids);
    const one = this.upgradePlans(list, line, false);
    const best = this.upgradePlans(list, line, true);
    const differs = best.some((b, k) => b.to > (one[k]?.to ?? 0));
    return differs ? this.upgradeEntry(ids, line, true) : null;
  }

  /** Where each unit's upgrade would go, as the sim works it out: the stock set aside unit by unit, highest rank first. */
  private upgradePlans(list: readonly Holder[], line: number, max: boolean): Array<{ id: number; to: number; cost: string; why: string }> {
    const pool = this.d.game.pool();
    const tech = this.d.game.tech();
    const held: Array<[number, number]> = [];
    const order = [...list].sort((a, b) => b.rank - a.rank || a.id - b.id);
    return order.map(({ id, h, pending }) => {
      if (pending) return { id, to: 0, cost: '', why: 'Already on the way to an upgrade.' };
      const t = upgradeTarget(h, line, max, pool, tech, held as Cost);
      if ('why' in t) return { id, to: 0, cost: '', why: t.why };
      for (const [r, n] of t.plan.cost) {
        const at = held.findIndex(([x]) => x === r);
        if (at >= 0) held[at] = [r, held[at]![1] + n];
        else held.push([r, n]);
      }
      return { id, to: t.to, cost: costText(mainCost(upgradePieces(h, line, t.to))), why: '' };
    });
  }

  /** X: workers fetch a cart from the main base (an ox cart when their ox is hitched), or hand theirs back. */
  private cartEntry(workers: number[]): CardEntry {
    const units = workers.map((id) => this.d.game.unit(id)).filter((u): u is UnitInfo => u !== null);
    const back = units.length > 0 && units.every((u) => u.kit !== 0);
    const desc = back
      ? 'Take the carts back to the main base and hand them in to the stock.'
      : 'Walk to the main base and take a cart from the stock: a hand cart carries 150 lb, an ox cart (for a worker with an ox hitched) much more. Make carts at a Workshop.';
    const name = back ? 'Hand the cart back' : 'Fetch a cart';
    const base = this.d.game.mainBases().some((b) => b.complete);
    if (!base) return this.off('cart', 'Cart', desc, 'There is no main base.', name);
    if (!back && this.d.game.have(Res.HandCart) + this.d.game.have(Res.OxCart) === 0) return this.off('cart', 'Cart', desc, 'There are no carts in the stock (make one at a Workshop).', name);
    const ids = units.filter((u) => (back ? u.kit !== 0 : u.kit === 0)).map((u) => u.id);
    return this.entry('cart', back ? 'Cart back' : 'Cart', desc, () => this.d.send({ kind: 'cart', player: this.d.player, units: ids, back: back ? 1 : 0 }), { name });
  }

  /**
   * A siege engine's or cannon's card (Table 2f): move, attack, stop and
   * hold; Hitch a horse or ox to haul it, or let it go; Enter takes a
   * cannon up into a Citadel's cannon port.
   */
  private engineCard(card: Card): void {
    const t = this.targeting?.command;
    const ids = this.unitIds((u) => u.typeKey.startsWith('engine:'));
    card[0] = this.entry('attack', 'Attack', 'Then left click an enemy or one of its buildings to shoot at it (it closes in while hauled or pushed), or ground to move and shoot whatever comes in range. It fires only while its crew stand by it.', () => this.target('attack', 'attack'), { lit: t === 'attack' });
    card[1] = this.entry('stop', 'Stop', 'Cancel every queued order.', () => this.stop());
    card[2] = this.entry('hold', 'Hold', 'Stay put and shoot what comes in range.', () => this.hold(), { name: 'Hold Position' });
    card[4] = this.entry('move', 'Move', 'Then left click ground. It moves only while a horse or ox is hitched to it, or while enough of its crew push it, and its wheels need ramps, not steps.', () => this.target('move', 'move'), { lit: t === 'move' });
    const u = ids.length > 0 ? this.d.game.unit(ids[0]!) : null;
    const hauled = u !== null && u.partner !== 0;
    card[5] = hauled
      ? this.entry('hitch', 'Let go', 'Unhitch the horse or ox hauling it.', () => this.d.send({ kind: 'hitch', player: this.d.player, units: ids.slice(0, 1), target: 0, queued: false }), { name: 'Let the animal go' })
      : this.entry('hitch', 'Hitch', 'Then left click one of your horses or oxen: it walks over and hauls the engine wherever it is sent (a horse is faster; an ox is slower but steadier). Right clicking the animal does the same.', () => this.target('hitch', 'hitch'), { lit: t === 'hitch', name: 'Hitch an animal' });
    const powder = u !== null && engineSpec(u.mob).powder;
    card[12] = powder
      ? this.entry('enter', 'Port', 'Then left click your Citadel (main base level 10): the cannon is hauled to its door and up into one of the 4 cannon ports on the roof, where its crew fire it from behind the walls.', () => this.target('enter', 'enter'), { lit: t === 'enter', name: 'Into a cannon port' })
      : this.off('enter', 'Port', 'Cannons go up into a Citadel\'s cannon ports.', 'Only cannons go in the cannon ports.', 'Into a cannon port');
  }

  private rankEntry(workers: number[]): CardEntry {
    const name = 'Upgrade rank';
    const desc = 'Send them to train at a main base: Labourer to Hand (20 food, 60 s, needs a Longhall), Hand to Master worker (40 food, 120 s, needs a Marble Hall). Better ranks have more health.';
    const ranks = workers.map((id) => this.d.game.unit(id)?.rank ?? 1);
    const next = RANK_TRAINING.find((r) => ranks.some((k) => k + 1 === r.rank));
    if (!next) return this.off('rankUp', 'Rank', desc, 'They are at the highest rank they can train to.', name);
    const base = this.nearestBase(next.base);
    if (!base) return this.off('rankUp', 'Rank', desc, `Needs a level ${next.base} main base (${levelSpec(BuildingKind.MainBase, next.base).name}).`, name);
    if (this.d.game.food() < next.food) return this.off('rankUp', 'Rank', desc, `Not enough food (needs ${next.food}).`, name);
    return this.entry('rankUp', 'Rank', desc, () => this.unitOrder({ kind: 'trainRank', building: base.id }), { name: `${name} (to ${next.name})` });
  }

  private nearestBase(level: number): BuildingInfo | null {
    const bases = this.d.game.mainBases().filter((b) => b.complete && b.level >= level);
    return bases[0] ?? null;
  }

  private buildMenuCard(card: Card): Card {
    const page = this.menu.page as 'basic' | 'advanced';
    const slots = menuSlots(page);
    const choices: Array<{ spec: BuildingSpec; variant: number; name: string } | null> = [];
    let sub: BuildingSpec[] | null = null;
    if (this.menu.sub >= 0) {
      sub = slots[this.menu.sub] ?? [];
      for (const c of submenuChoices(sub)) choices.push(c);
    }
    for (let i = 0; i < 14; i++) {
      if (sub) {
        const c = choices[i];
        if (c) card[i] = this.buildEntry(i, c.spec, c.variant, c.name);
        continue;
      }
      const specs = slots[i]!;
      if (specs.length === 1) card[i] = this.buildEntry(i, specs[0]!, 0, specs[0]!.name);
      else if (specs.length > 1) {
        const name = SUBMENU_NAMES[String(i + 1)] ?? specs.map((s) => s.name).join(', ');
        const any = specs.some((s) => this.d.game.info?.buildWhy[s.kind] === '');
        card[i] = {
          action: `menu-${i}`,
          face: name,
          name,
          key: GRID_CODES[i]!,
          grid: true,
          description: `${specs.map((s) => s.name).join(', ')}.`,
          enabled: any,
          reason: any ? '' : (this.d.game.info?.buildWhy[specs[0]!.kind] ?? ''),
          run: () => {
            this.menu = { page, sub: i };
            this.d.changed();
          },
        };
      }
    }
    // A ghost or target waiting keeps its Cancel in the corner; otherwise B is Back.
    if (!card[14]) {
      card[14] = {
        action: 'back',
        face: 'Back',
        name: 'Back',
        key: GRID_CODES[14],
        grid: true,
        description: sub ? 'Back to the build menu.' : 'Back to the worker commands.',
        enabled: true,
        reason: '',
        run: () => this.back(),
      };
    }
    return card;
  }

  private buildEntry(slot: number, spec: BuildingSpec, variant: number, name: string): CardEntry {
    const l = spec.levels[0]!;
    const why = this.d.game.info?.buildWhy[spec.kind] ?? spec.comesWith;
    const short = this.d.game.costProblem(l.cost);
    const lines = [spec.purpose, `Cost: ${costLine(l.cost)}. Build time: ${seconds(l.ws)} of one worker's work.`];
    if (l.gives) lines.push(`Gives: ${l.gives}.`);
    if (l.supply) lines.push(`Supply +${l.supply}.`);
    if (spec.light) lines.push(`Light ${spec.light.lightM} m${spec.light.claimM ? `, claims ${spec.light.claimM} m while lit` : ''}.`);
    if (spec.site) lines.push(EARTHWORK_HELP[variant] ?? '');
    else if (Commands.chained(spec.kind)) lines.push(WALL_CHAIN_HELP);
    else if (spec.w === 1 && spec.d === 1) lines.push('Drag to place a line of them, 8 m apart.');
    if (!spec.site && !Commands.chained(spec.kind)) lines.push('Shift + click to place several.');
    if (short) lines.push(short);
    return {
      action: `build-${spec.kind}-${variant}`,
      face: name,
      name,
      key: GRID_CODES[slot]!,
      grid: true,
      description: lines.join(' '),
      enabled: why === '',
      reason: why,
      short: short !== '',
      run: () => (spec.site ? this.startArea('earthwork', variant) : this.startPlacing(spec.kind, variant)),
    };
  }

  private buildingCard(card: Card, kind: number): void {
    const all = this.buildings().filter((b) => b.kind === kind);
    if (all.length === 0) return;
    const spec = buildingSpec(kind);
    const first = all[0]!;
    // Production: workers at the main base and farms, troops at the Barracks, the Stables and (tier 1) the main base, planks at the mill, mages at the Sanctum.
    const rows: Array<[number, string, string, number]> = [];
    const main = kind === BuildingKind.MainBase;
    if (first.complete) {
      if (spec.trainsWorkers) rows.push([Product.Worker, 'trainWorker', 'Worker', 0]);
      // Mages at a Magi Sanctum, and at a main base of level 6 and up (Magic), after the main base's troops.
      if (first.products.some(([p]) => p === Product.SupportMage)) {
        const at = main ? 4 : 0;
        rows.push([Product.SupportMage, 'trainSupportMage', 'Support', at], [Product.BattleMage, 'trainBattleMage', 'Battle', at + 1]);
      }
      if (kind === BuildingKind.LumberMill) rows.push([Product.PlanksSoftwood, 'planksSoft', 'Planks S', 0], [Product.PlanksHardwood, 'planksHard', 'Planks H', 1]);
    }
    for (const [p, action, face, slot] of rows) card[slot] = this.productEntry(all, p, action, face);
    if (first.complete) {
      for (const t of first.troops) {
        const [action, face, slot] = TROOP_ACTIONS[t.troop]!;
        card[slot + (main ? 1 : 0)] = this.troopEntry(all, t.troop, action, face);
      }
    }
    if (first.complete && first.products.some(([p]) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT)) {
      const what = MAKE_WORDS[kind] ?? ['Make', 'Open the production menu. Grid keys pick one; V shows the next page; B is Back.'];
      // A main base's mages sit on 4 and 5, so its K menu (rope) moves along.
      card[main ? 7 : 5] = this.entry('craft', what[0], what[1], () => this.openMenu('make'), { name: what[0] });
    }
    if (first.complete && trainsUnits(first)) {
      card[9] = this.entry('rally', 'Rally', 'Then left click ground, a unit or a resource node: new units go there (workers gather, on a node). Shift adds a waypoint. Right click with the building selected does the same.', () => this.target('rally', 'rally'), {
        name: 'Set Rally Point',
        lit: this.targeting?.command === 'rally',
      });
    }
    const next = spec.levels[first.level];
    if (first.complete && next) {
      const why = first.upgrading ? `Upgrading to ${levelSpec(kind, first.upgrading).name}.` : first.upgradeWhy;
      card[10] = {
        action: 'upgrade',
        face: 'Upgrade',
        name: `Upgrade to ${next.name}`,
        key: this.key('upgrade'),
        description: `Cost: ${costLine(next.cost)}, paid now. Then workers build it: ${seconds(next.ws)} of one worker's work (right-click it with workers). Gives: ${next.gives || 'more health'}.${next.supply ? ` Supply ${next.supply}.` : ''}`,
        enabled: why === '',
        reason: why,
        run: () => {
          for (const b of all) this.d.send({ kind: 'upgrade', player: this.d.player, building: b.id });
        },
      };
    }
    if (all.some((b) => b.inside.length > 0)) {
      card[12] = this.entry('unload', 'Unload', 'Let everyone inside out. Click a portrait in the panel to let one out.', () => {
        for (const b of all) if (b.inside.length > 0) this.d.send({ kind: 'unload', player: this.d.player, building: b.id, unit: 0 });
      }, { name: 'Unload All' });
    }
    if (!card[14] && (!first.complete || first.upgrading)) {
      card[14] = this.entry(
        'cancelBuild',
        'Cancel',
        first.complete ? 'Stop the upgrade; 75% of its cost comes back.' : 'Take down the unfinished building; 75% of its cost comes back.',
        () => {
          for (const b of all) if (!b.complete || b.upgrading) this.d.send({ kind: 'cancelBuild', player: this.d.player, building: b.id });
        },
        { name: first.complete ? 'Cancel upgrade' : 'Cancel construction' },
      );
    }
  }

  /** A training, making or research button, greyed out with the reason it cannot be queued. */
  private productEntry(all: BuildingInfo[], p: number, action: string, face: string, grid?: number, why?: string): CardEntry {
    const ps = productSpec(p);
    const g = this.d.game;
    const info = g.info;
    const costs = [ps.cost.length > 0 ? costLine(ps.cost) : '', ps.food > 0 ? `${ps.food} food` : ''].filter((x) => x).join(', ') || 'free';
    let reason = '';
    if (ps.research !== undefined && g.researched(ps.research)) reason = 'Already researched.';
    else if (ps.research !== undefined && [...g.buildings.values()].some((b) => b.owner === this.d.player && b.queue.some((q) => q.product === p))) reason = 'Being researched.';
    else if (ps.food > 0 && g.food() < ps.food) reason = `Not enough food (needs ${ps.food}).`;
    else if (ps.food === 0) reason = g.costProblem(ps.cost);
    if (!reason && (p === Product.Worker || p === Product.SupportMage || p === Product.BattleMage) && info && info.supplyUsed >= info.supplyCap) reason = `Not enough supply (${info.supplyUsed} of ${info.supplyCap}). Build or upgrade farms.`;
    if (why !== undefined) reason = why;
    if (!reason && all.every((b) => b.queue.length >= 5)) reason = 'The queue is full (5).';
    return {
      action,
      face,
      name: ps.name,
      key: grid !== undefined ? GRID_CODES[grid]! : this.key(action),
      grid: grid !== undefined,
      description: `${ps.tooltip} Cost: ${costs}. Time: ${Math.round(ps.steps / 2) / 10} s. Shift: queue 5.`,
      enabled: reason === '',
      reason,
      run: (press) => this.produce(all, p, press.shift ? 5 : 1),
    };
  }

  /** A troop type's button: trains the kit picked in the panel (or the building's default), greyed out with why it cannot. */
  private troopEntry(all: BuildingInfo[], troop: number, action: string, face: string): CardEntry {
    const first = all[0]!;
    const c = troopChoice(first, troop);
    const why = troopWhy(this.d.game, first, troop, c.w, c.a);
    const others = all.length > 1 ? ' With several selected, each trains its own pick and the shortest queue goes first.' : '';
    const any = all.some((b) => {
      const k = troopChoice(b, troop);
      return troopWhy(this.d.game, b, troop, k.w, k.a) === '';
    });
    return {
      action,
      face,
      name: `Train ${troopName(troop).toLowerCase()}`,
      key: this.key(action),
      description: `${kitName(troop, c.w, c.a)} (weapon tier ${c.w}, armour tier ${c.a}). Cost: ${troopCostText(first, troop, c.w, c.a)}. Pick the kit in the panel.${others} Shift: queue 5.`,
      enabled: any,
      reason: any ? '' : why,
      run: (press) => this.trainTroopAt(all, troop, press.shift ? 5 : 1),
    };
  }

  /** The panel's picture button: train a troop type at one building. */
  trainTroop(building: number, troop: number, count: number): void {
    const b = this.d.game.buildings.get(building);
    if (b) this.trainTroopAt([b], troop, count);
  }

  /** Spreads troops over the buildings with the shortest queues, each with its own pick. */
  private trainTroopAt(all: BuildingInfo[], troop: number, count: number): void {
    const ready = all.filter((b) => b.complete && b.troops.some((t) => t.troop === troop));
    for (let k = 0; k < count && ready.length > 0; k++) {
      ready.sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
      const b = ready[0]!;
      const c = troopChoice(b, troop);
      const product = troopProduct(troop, c.w, c.a);
      this.d.send({ kind: 'produce', player: this.d.player, building: b.id, product, count: 1 });
      b.queue.push({ product, done: 0 });
    }
    this.d.changed();
  }

  /**
   * K (smelt, cook, research, make, slaughter): a button per product the
   * building makes, 13 to a page, greyed out with the sim's reason; V shows
   * the next page and B is Back.
   */
  private makeCard(card: Card, kind: number): Card {
    const page = 'make';
    const all = this.buildings().filter((b) => b.kind === kind && b.complete);
    const first = all[0];
    if (first) {
      const list = first.products.filter(([p]) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT);
      const pages = Math.max(1, Math.ceil(list.length / MAKE_PER_PAGE));
      const at = Math.max(0, this.menu.sub) % pages;
      list.slice(at * MAKE_PER_PAGE, (at + 1) * MAKE_PER_PAGE).forEach(([p, why], k) => {
        const ps = productSpec(p);
        const face = shortFace(ps.name);
        card[k] = this.productEntry(all, p, `make-${p}`, face, k, why);
      });
      if (pages > 1) {
        card[13] = {
          action: 'more',
          face: `More ${at + 1}/${pages}`,
          name: 'Next page',
          key: GRID_CODES[13],
          grid: true,
          description: `Page ${at + 1} of ${pages}. Show the next page.`,
          enabled: true,
          reason: '',
          run: () => {
            this.menu = { page, sub: (at + 1) % pages };
            this.d.changed();
          },
        };
      }
    }
    card[14] = this.backEntry('Back to the building commands.');
    return card;
  }

  private backEntry(description: string): CardEntry {
    return { action: 'back', face: 'Back', name: 'Back', key: GRID_CODES[14], grid: true, description, enabled: true, reason: '', run: () => this.back() };
  }

  /** Dig and earthworks: + and - set the depth or height, Tunnel (D again) clicks out a tunnel chain, Mark confirms, Esc cancels. */
  private areaCard(card: Card): Card {
    const a = this.area!;
    const plan = this.areaPlan();
    const chain = a.mode === 'dig' && (a.tunnel || a.chain !== null);
    const tunnel = chain || plan?.tunnel === true;
    const what = a.mode === 'dig' ? (tunnel ? 'tunnel height' : 'depth') : 'height';
    const fixed = a.mode === 'earthwork' && a.variant !== 0;
    const m = ((tunnel ? a.tunnelUnits : a.units) * TERRAIN_UNIT_M).toFixed(2);
    const down = a.mode === 'dig' && !tunnel;
    if (!fixed) {
      card[0] = this.entry('deeper', down ? 'Deeper' : 'Higher', `The ${what} is ${m} m. Press for about 34 cm more. The wheel does the same while marking.`, () => this.adjustArea(1), { name: `More ${what}` });
      card[1] = this.entry('shallower', down ? 'Shallower' : 'Lower', `The ${what} is ${m} m. Press for about 34 cm less.`, () => this.adjustArea(-1), { name: `Less ${what}` });
    }
    if (a.mode === 'dig') card[2] = this.entry('tunnel', 'Tunnel', TUNNEL_CHAIN_HELP, () => this.toggleTunnel(), { key: this.key('dig'), lit: chain, name: 'Dig a tunnel' });
    if (chain) return card;
    const ready = plan !== null && !a.dragging;
    const name = a.mode === 'dig' ? (tunnel ? 'Dig the tunnel' : 'Dig it out') : `Make the ${EARTHWORK_NAMES[a.variant]!.toLowerCase()}`;
    const stuff = HEAP_STUFF[a.variant] ?? HEAP_STUFF[0]!;
    const earth = a.mode === 'earthwork' && plan ? ` It needs ${plan.earth} ${stuff[1]} (you have ${this.d.game.have(stuff[0])}).` : '';
    card[4] = {
      action: 'markArea',
      face: 'Mark',
      name,
      key: '',
      description: `Mark the area for the selected workers. Left clicking the ground does the same.${earth}`,
      enabled: ready,
      reason: ready ? '' : 'Drag over the ground first.',
      run: () => this.confirmArea(),
    };
    return card;
  }

  // ---- Orders ----

  private unitOrder(o: { kind: 'returnCargo' } | { kind: 'repairAll' } | { kind: 'trainRank'; building: number }, units = this.workerIds()): void {
    if (units.length === 0) return;
    this.d.send({ ...o, player: this.d.player, units, queued: this.d.queued() } as Order);
  }

  private stop(): void {
    const units = this.unitIds();
    if (units.length > 0) this.d.send({ kind: 'stop', player: this.d.player, units });
  }

  private hold(): void {
    const units = this.unitIds();
    if (units.length > 0) this.d.send({ kind: 'hold', player: this.d.player, units, queued: this.d.queued() });
  }

  private repairAll(): void {
    this.targeting = null;
    this.unitOrder({ kind: 'repairAll' });
    this.d.message('Repairing every damaged building nearby, worst first.');
    this.d.changed();
  }

  /** Produce at the building of the group with the shortest queue (Control groups: spread the work). */
  private produce(all: BuildingInfo[], product: number, count: number): void {
    const ready = all.filter((b) => b.complete);
    if (ready.length === 0) return;
    for (let k = 0; k < count; k++) {
      ready.sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
      const b = ready[0]!;
      this.d.send({ kind: 'produce', player: this.d.player, building: b.id, product, count: 1 });
      b.queue.push({ product, done: 0 });
    }
  }

  private target(command: TargetCommand, action: string): void {
    this.targeting = { command, key: this.key(action) };
    this.d.changed();
  }

  private openMenu(page: CardPage): void {
    this.menu = { page, sub: -1 };
    this.d.changed();
  }

  /** A left click while a command waits for its target. `item` is what is under the cursor. */
  confirmTarget(item: Selectable | null, ground: THREE.Vector3 | null): void {
    const t = this.targeting;
    if (!t) return;
    let ok = false;
    switch (t.command) {
      case 'move':
        ok = item && item.kind === 'unit' ? this.follow(item) : ground ? this.moveTo(ground) : false;
        break;
      case 'gather':
        ok = item?.kind === 'node' ? this.gather(item) : false;
        if (!ok) this.d.message('Pick a tree, rock or bush to gather from.', 'alert');
        break;
      case 'repair':
        ok = this.ownBuilding(item) ? this.work(item!) : item && this.ownEngine(item) ? this.mend(item) : false;
        if (!ok) this.d.message('Pick one of your buildings, siege engines or cannons to build or repair.', 'alert');
        break;
      case 'enter':
        ok = this.ownBuilding(item) ? this.enter(item!) : item && this.ownEngine(item) ? this.crew(item) : false;
        break;
      case 'hitch':
        ok = item ? this.hitchTo(item) : false;
        if (!ok) this.d.message('Pick one of your tamed horses or oxen.', 'alert');
        break;
      case 'rally':
        ok = this.rally(item, ground);
        break;
      case 'attack': {
        // An attack on one of the neutral peoples at peace asks first (Neutral villages and trade: war); workers may break down what they left.
        const f = item ? this.peopleAtPeace(item) : null;
        if (f !== null && item) {
          this.d.confirmWar(f, () => this.attack(item));
          ok = true;
        } else ok = item && (this.enemy(item) || this.ruin(item)) ? this.attack(item) : ground ? this.attackMove(ground) : false;
        break;
      }
      case 'patrol':
        ok = ground ? this.patrol(ground) : false;
        break;
      case 'prospect':
        ok = ground ? this.prospect(ground) : false;
        break;
      case 'hunt':
        ok = item && this.wildAnimal(item) ? this.hunt(item) : false;
        if (!ok) this.d.message('Pick a wild animal to hunt.', 'alert');
        break;
      case 'cast':
        ok = this.cast(t.spell ?? 0, item, ground);
        break;
    }
    if (ok && !this.d.held(t.key) && !this.d.queued()) {
      this.targeting = null;
      this.d.changed();
    }
  }

  /** A spell's click: one of the player's units for a support spell, an enemy for an attack, the ground for an area. */
  private cast(spell: number, item: Selectable | null, ground: THREE.Vector3 | null): boolean {
    const s = SPELLS[spell];
    const units = this.unitIds((u) => u.typeKey.startsWith('mage:'));
    if (!s || units.length === 0) return false;
    const send = (target: number, at: THREE.Vector3): boolean => {
      this.d.send({ kind: 'cast', player: this.d.player, units, spell, target, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE), auto: 0, queued: this.d.queued() });
      this.d.marker(at, s.target === 'ally' ? 'move' : 'target');
      return true;
    };
    if (s.target === 'point') {
      const at = ground ?? item?.centre ?? null;
      if (at) return send(0, at);
      this.d.message(`Pick a spot on the ground for ${s.name}.`, 'alert');
      return false;
    }
    const target = item && item.kind === 'unit' ? entityIdOf(item.key) : null;
    if (s.target === 'ally') {
      if (target !== null && item!.owner !== MONSTERS && !item!.typeKey.startsWith('animal:')) return send(target, item!.centre);
      this.d.message(`Pick one of your units for ${s.name}.`, 'alert');
      return false;
    }
    if (target !== null && this.enemy(item!)) return send(target, item!.centre);
    this.d.message(s.target === 'counter' ? 'Pick an enemy that is casting a spell.' : `Pick an enemy for ${s.name}.`, 'alert');
    return false;
  }

  /** A unit the local player's units fight: monsters, and the neutral peoples at war with the player (other players are allies in this co-op game). */
  private enemy(item: Selectable): boolean {
    if (item.kind !== 'unit') return false;
    if (item.owner === MONSTERS) return true;
    if (item.owner !== PEOPLES) return false;
    return this.factionOf(item)?.war === true;
  }

  /** The faction of one of the peoples' units or buildings. */
  private factionOf(item: Selectable): PeopleInfo | null {
    const id = entityIdOf(item.key);
    const u = id === null ? null : this.d.game.unit(id);
    return u && u.group ? this.d.game.faction(u.group) : null;
  }

  /** The faction id of one of the peoples' units or buildings while at peace with the player, else null. */
  private peopleAtPeace(item: Selectable): number | null {
    if (item.kind !== 'unit' || item.owner !== PEOPLES) return null;
    const f = this.factionOf(item);
    return f && !f.war ? f.id : null;
  }

  /** A building one of the peoples left (workers break it down for its materials). */
  private ruin(item: Selectable): boolean {
    return item.kind === 'unit' && item.typeKey.startsWith('ruin:');
  }

  /** Right click on the peoples at peace: their leader, a trade building or a caravan opens trade; a mercenary camp the hire box. */
  private talkTo(item: Selectable): boolean {
    const f = this.factionOf(item);
    if (!f || f.war || item.owner !== PEOPLES) return false;
    const id = entityIdOf(item.key);
    const mob = Number(item.typeKey.split(':')[1]);
    const trader = item.typeKey.startsWith('peoples:') ? TRADE_BUILDINGS.includes(mob) || mob === Mob.ElfCaravanWagon : id === f.leader;
    if (!trader && f.kind !== FactionKind.ElfCaravan && f.kind !== FactionKind.MercCamp) return false;
    this.d.openPeople(f.id);
    return true;
  }

  /** A wild animal on screen. */
  private wildAnimal(item: Selectable): boolean {
    return item.kind === 'unit' && item.typeKey.startsWith('animal:wild:');
  }

  private hunt(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds();
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'hunt', player: this.d.player, units, target, auto: 0, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private prospect(at: THREE.Vector3): boolean {
    const units = this.workerIds().slice(0, 1);
    if (units.length === 0) return false;
    this.d.send({ kind: 'prospect', player: this.d.player, units, x: Math.floor(at.x / COLUMN_M), z: Math.floor(at.z / COLUMN_M), queued: this.d.queued() });
    this.d.marker(at, 'target');
    return true;
  }

  private attack(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds();
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'attack', player: this.d.player, units, target, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private attackMove(at: THREE.Vector3): boolean {
    const units = this.unitIds();
    if (units.length === 0) return false;
    this.d.send({ kind: 'attackMove', player: this.d.player, units, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE), queued: this.d.queued() });
    this.d.marker(at, 'target');
    return true;
  }

  private patrol(at: THREE.Vector3): boolean {
    const units = this.unitIds();
    if (units.length === 0) return false;
    this.d.send({ kind: 'patrol', player: this.d.player, units, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE), queued: this.d.queued() });
    this.d.marker(at, 'move');
    return true;
  }

  private ownEngine(item: Selectable): boolean {
    return item.kind === 'unit' && item.owner === this.d.player && item.typeKey.startsWith('engine:');
  }

  /** Warriors in the selection crew an engine: they stand by it to fire it, and push it if nothing hauls it. */
  private crew(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds((u) => u.typeKey === 'warrior');
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'crew', player: this.d.player, units, target, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  /** Workers repair an engine (they are the only ones who can; engines never heal by themselves). */
  private mend(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.workerIds();
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'mend', player: this.d.player, units, target, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  /** An engine in the selection takes one of the player's horses or oxen to haul it. */
  private hitchTo(item: Selectable): boolean {
    if (item.kind !== 'unit' || item.owner !== this.d.player || !item.typeKey.startsWith('animal:own:')) return false;
    const target = entityIdOf(item.key);
    const engines = this.unitIds((u) => u.typeKey.startsWith('engine:'));
    if (target === null || engines.length === 0) return false;
    this.d.send({ kind: 'hitch', player: this.d.player, units: engines.slice(0, 1), target, queued: false });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private ownBuilding(item: Selectable | null): boolean {
    return item !== null && item.kind === 'building' && item.owner === this.d.player;
  }

  private buildingOf(item: Selectable): BuildingInfo | undefined {
    const id = buildingIdOf(item.key);
    return id === null ? undefined : this.d.game.buildings.get(id);
  }

  moveTo(at: THREE.Vector3): boolean {
    const units = this.unitIds();
    if (units.length === 0) return false;
    this.d.send({ kind: 'move', player: this.d.player, units, x: Math.round(at.x * WU_PER_METRE), z: Math.round(at.z * WU_PER_METRE), queued: this.d.queued() });
    this.d.marker(at, 'move');
    return true;
  }

  private follow(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds().filter((id) => id !== target);
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'follow', player: this.d.player, units, target, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private gather(item: Selectable): boolean {
    const m = /^p:(-?\d+),(-?\d+):(\d+)$/.exec(item.key);
    const units = this.workerIds();
    if (!m || units.length === 0) return false;
    if (!item.resource) {
      this.d.message(`Nothing to gather from that ${item.label.toLowerCase()}.`, 'alert');
      return false;
    }
    this.d.send({ kind: 'gather', player: this.d.player, units, cx: Number(m[1]), cz: Number(m[2]), index: Number(m[3]), queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private work(item: Selectable): boolean {
    const b = this.buildingOf(item);
    const units = this.workerIds();
    if (!b || units.length === 0) return false;
    this.d.send({ kind: 'work', player: this.d.player, units, building: b.id, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  private enter(item: Selectable): boolean {
    const b = this.buildingOf(item);
    const units = this.unitIds();
    if (!b || units.length === 0) return false;
    const room = b.complete ? levelSpec(b.kind, b.level).shelters + garrisonRoom(b) : 0;
    if (room === 0) {
      this.d.message(`${b.name} cannot take anyone in. Workers shelter in main bases and farms; ranged warriors garrison towers.`, 'alert');
      return false;
    }
    this.d.send({ kind: 'enter', player: this.d.player, units, building: b.id, queued: this.d.queued() });
    this.d.marker(item.centre, 'target');
    return true;
  }

  /** Rally for the selected buildings that train: a node, a unit, or ground. */
  rally(item: Selectable | null, ground: THREE.Vector3 | null): boolean {
    const bs = this.buildings().filter((b) => b.complete && trainsUnits(b));
    if (bs.length === 0) return false;
    const add = this.d.queued();
    for (const b of bs) {
      const base = { kind: 'rally' as const, player: this.d.player, building: b.id, add };
      const nodeKey = item?.kind === 'node' ? /^p:(-?\d+),(-?\d+):(\d+)$/.exec(item.key) : null;
      const unitId = item?.kind === 'unit' ? entityIdOf(item.key) : null;
      if (nodeKey && item?.resource) this.d.send({ ...base, point: 'node', x: Number(nodeKey[1]), z: Number(nodeKey[2]), id: Number(nodeKey[3]) });
      else if (unitId !== null) this.d.send({ ...base, point: 'unit', x: 0, z: 0, id: unitId });
      else if (ground) this.d.send({ ...base, point: 'ground', x: Math.round(ground.x * WU_PER_METRE), z: Math.round(ground.z * WU_PER_METRE), id: 0 });
      else return false;
    }
    this.d.marker(item?.centre ?? ground!, item ? 'target' : 'move');
    return true;
  }

  /**
   * Right click: the obvious order for what is under the cursor (Smart order).
   * Workers gather from nodes, build or repair their own buildings, drop
   * their load at drop-offs, take up a farm or the mill, refuel lights;
   * everyone follows friendly units and walks to ground. With only buildings
   * selected, it sets their rally point.
   */
  smart(item: Selectable | null, ground: THREE.Vector3 | null): void {
    const units = this.unitIds();
    if (units.length === 0) {
      if (this.buildings().length > 0) this.rally(item, ground);
      return;
    }
    const workers = this.workerIds();
    const queued = this.d.queued();
    const player = this.d.player;
    if (item?.kind === 'node' && workers.length > 0 && item.resource) {
      this.gather(item);
      const others = units.filter((id) => !workers.includes(id));
      if (others.length > 0 && ground) this.d.send({ kind: 'move', player, units: others, x: Math.round(ground.x * WU_PER_METRE), z: Math.round(ground.z * WU_PER_METRE), queued });
      return;
    }
    if (item && this.ownBuilding(item) && workers.length > 0) {
      const b = this.buildingOf(item);
      if (b) {
        const spec = buildingSpec(b.kind);
        const send = (o: Order): void => {
          this.d.send(o);
          this.d.marker(item.centre, 'target');
        };
        if (!b.complete || b.upgrading || b.hp < b.maxHp) return send({ kind: 'work', player, units: workers, building: b.id, queued });
        const carriers = workers.filter((id) => {
          const u = this.d.game.unit(id);
          if (!u || u.carryAmt === 0) return false;
          if (spec.dropoff === 'all') return true;
          return spec.dropoff === 'wood' && (u.carryRes === 0 || u.carryRes === 1);
        });
        if (carriers.length > 0) return send({ kind: 'dropoff', player, units: carriers, building: b.id, queued });
        // A mineshaft with all its miners, or workers with a cart: they haul what waits there.
        if (b.kind === BuildingKind.Mineshaft && b.complete) {
          const carts = workers.filter((id) => (this.d.game.unit(id)?.kit ?? 0) !== 0);
          const full = b.assigned >= levelSpec(b.kind, b.level).workers;
          if (full || carts.length > 0) return send({ kind: 'haul', player, units: full ? workers : carts, building: b.id, queued });
        }
        if (levelSpec(b.kind, b.level).workers > 0) return send({ kind: 'assign', player, units: workers, building: b.id, queued });
        if (spec.light) return send({ kind: 'refuel', player, units: workers, building: b.id, queued });
      }
    }
    // Engines and cannons: an own horse or ox hitches, the Citadel takes a cannon into a port.
    const engines = this.unitIds((u) => u.typeKey.startsWith('engine:'));
    if (item && engines.length > 0 && engines.length === units.length) {
      if (item.typeKey.startsWith('animal:own:') && this.hitchTo(item)) return;
      if (this.ownBuilding(item) && this.enter(item)) return;
    }
    if (item && this.ownEngine(item)) {
      // Warriors crew one of the player's engines; workers repair a damaged one.
      const u = this.d.game.unit(entityIdOf(item.key) ?? -1);
      if (workers.length > 0 && u && u.hp < u.maxHp && this.mend(item)) return;
      if (this.crew(item)) return;
    }
    if (item && this.enemy(item) && this.attack(item)) return;
    if (item && this.talkTo(item)) return;
    if (item && this.ruin(item) && workers.length > 0 && this.attack(item)) return;
    if (item && this.animalOrder(item, units, workers)) return;
    if (item?.kind === 'unit' && item.owner === player && this.follow(item)) return;
    if (!item && ground && workers.length > 0 && this.helpSite(workers, ground)) return;
    const at = item && item.kind !== 'unit' ? item.centre : ground;
    if (at) this.moveTo(at);
  }

  /**
   * Right click on an animal: warriors hunt a wild one (workers along haul);
   * workers alone tame a wild horse, ox, cow or hen, and hitch one of the
   * player's own horses or oxen to a cart or pack.
   */
  private animalOrder(item: Selectable, units: number[], workers: number[]): boolean {
    if (item.kind !== 'unit' || !item.typeKey.startsWith('animal:')) return false;
    const target = entityIdOf(item.key);
    if (target === null) return false;
    const species = Number(item.typeKey.split(':')[2]);
    const player = this.d.player;
    const queued = this.d.queued();
    const warriors = units.length > workers.length;
    if (item.typeKey.startsWith('animal:wild:')) {
      if (warriors) return this.hunt(item);
      if (workers.length === 0 || speciesSpec(species).tameAt.length === 0) return false;
      this.d.send({ kind: 'tame', player, units: workers.slice(0, 1), target, queued });
      this.d.marker(item.centre, 'target');
      return true;
    }
    if (item.owner !== player || workers.length === 0) return false;
    const s = speciesSpec(species);
    if (s.cartTenthsLb === 0 && s.packTenthsLb === 0) return false;
    this.d.send({ kind: 'hitch', player, units: workers.slice(0, 1), target, queued });
    this.d.marker(item.centre, 'target');
    return true;
  }

  /** Right click on a marked dig or earthwork: the workers help with it. */
  private helpSite(workers: number[], at: THREE.Vector3): boolean {
    const x = Math.floor(at.x / COLUMN_M);
    const z = Math.floor(at.z / COLUMN_M);
    const site = this.d.game.info?.sites.find((s) => siteCells(s).some(([cx, cz]) => cx === x && cz === z));
    if (!site) return false;
    if (site.kind === SiteKind.TunnelLine) {
      // The same stretch again: the sim gives these workers the one already marked.
      const { dir, length } = stretchBetween(site.x0, site.z0, site.x1, site.z1);
      this.d.send({ kind: 'tunnelStretch', player: this.d.player, units: workers, x: site.x0, z: site.z0, dir, length, level: site.level, level2: site.level2, queued: this.d.queued() });
      this.d.marker(at, 'target');
      return true;
    }
    const box = { player: this.d.player, units: workers, x0: site.x0, z0: site.z0, x1: site.x1, z1: site.z1, level: site.level, level2: site.level2, queued: this.d.queued() };
    if (site.kind === SiteKind.Dig || site.kind === SiteKind.Tunnel) this.d.send({ kind: 'dig', ...box, tunnel: site.kind === SiteKind.Tunnel ? 1 : 0 });
    else this.d.send({ kind: 'earthwork', ...box, variant: site.kind === SiteKind.Ramp ? 1 : site.kind === SiteKind.LumberRamp ? 3 : site.kind === SiteKind.StoneRamp ? 4 : 0, axis: site.axis });
    this.d.marker(at, 'target');
    return true;
  }

  // ---- Dig and earthworks ----

  startArea(mode: 'dig' | 'earthwork', variant: number): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
    if (this.placing) this.placing = null;
    this.menu = { page: 'main', sub: -1 };
    this.area = { mode, variant, from: null, to: null, dragging: false, units: AREA_DEFAULT_UNITS, tunnelUnits: TUNNEL_HEIGHT_UNITS, tunnel: false, chain: null, stretches: 0, cursor: null };
    this.d.changed();
  }

  endArea(): void {
    this.area = null;
    this.d.changed();
  }

  /** Each frame while marking: the column under the cursor while dragging, or while a tunnel chain waits for its next click. */
  updateArea(ground: THREE.Vector3 | null): void {
    const a = this.area;
    if (!a || !ground) return;
    const x = Math.floor(ground.x / COLUMN_M);
    const z = Math.floor(ground.z / COLUMN_M);
    if (a.chain) {
      if (!a.cursor || a.cursor.x !== x || a.cursor.z !== z) a.cursor = { x, z };
      return;
    }
    if (!a.dragging) return;
    if (a.to && a.to.x === x && a.to.z === z) return;
    a.to = { x, z };
    this.d.changed();
  }

  /** Left button down while marking: start a drag, confirm one already marked, or a click of a tunnel chain. */
  areaDown(ground: THREE.Vector3 | null): void {
    const a = this.area;
    if (!a) return;
    if (a.mode === 'dig' && (a.chain || a.tunnel)) {
      this.tunnelClick(ground);
      return;
    }
    if (a.from && a.to && !a.dragging) {
      this.confirmArea();
      return;
    }
    if (!ground) return;
    const c = { x: Math.floor(ground.x / COLUMN_M), z: Math.floor(ground.z / COLUMN_M) };
    // A press on the side of a cliff or hillside starts a tunnel chain into it instead.
    if (a.mode === 'dig' && this.faceAt(ground, c.x, c.z)) {
      this.tunnelClick(ground);
      return;
    }
    a.from = c;
    a.to = { ...c };
    a.dragging = true;
    this.d.changed();
  }

  /**
   * One click of a tunnel chain (Digging: tunnel chains). The first sets the
   * anchor: on a cliff or hillside face the tunnel's floor is the ground in
   * front of it, elsewhere the ground clicked. Each later click digs the
   * stretch from the anchor to the click, snapped to the nearest of the eight
   * directions and level with the anchor, and its end is the next anchor.
   */
  private tunnelClick(ground: THREE.Vector3 | null): void {
    const a = this.area;
    if (!a || !ground) return;
    const c = { x: Math.floor(ground.x / COLUMN_M), z: Math.floor(ground.z / COLUMN_M) };
    if (!a.chain) {
      const face = this.faceAt(ground, c.x, c.z);
      a.chain = face ? { x: face.x, z: face.z, floor: face.floor } : { x: c.x, z: c.z, floor: this.groundUnits(c.x, c.z) };
      a.cursor = c;
      a.from = null;
      a.to = null;
      a.dragging = false;
      this.d.changed();
      return;
    }
    a.cursor = c;
    const plan = this.tunnelPlan();
    const units = this.workerIds();
    if (!plan || plan.length === 0 || units.length === 0) return;
    this.d.send({ kind: 'tunnelStretch', player: this.d.player, units, x: plan.x, z: plan.z, dir: plan.dir, length: plan.length, level: a.chain.floor, level2: a.chain.floor + a.tunnelUnits, queued: a.stretches > 0 || this.d.queued() });
    const [ex, ez] = stretchEnd(plan.x, plan.z, plan.dir, plan.length);
    a.chain = { x: ex, z: ez, floor: a.chain.floor };
    a.stretches++;
    const wx = (ex + 0.5) * COLUMN_M;
    const wz = (ez + 0.5) * COLUMN_M;
    this.d.marker(new THREE.Vector3(wx, this.d.heightAt(wx, wz), wz), 'target');
    this.d.changed();
  }

  /** The next stretch of the tunnel chain, from its anchor towards the cursor. */
  tunnelPlan(): StretchPlan | null {
    const a = this.area;
    if (!a?.chain || !a.cursor) return null;
    const { dir, length } = snapStretch(a.chain.x, a.chain.z, a.cursor.x, a.cursor.z, TUNNEL_STRETCH_MAX_COLUMNS);
    return { x: a.chain.x, z: a.chain.z, dir, length, cells: stretchCells(a.chain.x, a.chain.z, dir, length, TUNNEL_WIDTH_COLUMNS) };
  }

  /** D again on the dig card: tunnel chains on flat ground too, or back to digging down. */
  private toggleTunnel(): void {
    const a = this.area;
    if (!a) return;
    const on = !(a.tunnel || a.chain);
    this.area = { ...a, tunnel: on, chain: null, stretches: 0, cursor: null, from: null, to: null, dragging: false };
    this.d.changed();
  }

  /** The ground at a column, terrain units, as the client draws it. */
  private groundUnits(x: number, z: number): number {
    return Math.round(this.d.heightAt((x + 0.5) * COLUMN_M, (z + 0.5) * COLUMN_M) / TERRAIN_UNIT_M);
  }

  /**
   * Whether a point the cursor picked is on the side of a cliff or hillside
   * rather than on top of the ground: below its column's top, on the edge of
   * the column next to lower ground at least FACE_MIN_UNITS down. Returns the
   * face column, the way out of it and the ground in front of it, or null.
   */
  private faceAt(p: THREE.Vector3, x: number, z: number): { x: number; z: number; nx: number; nz: number; floor: number } | null {
    const top = this.groundUnits(x, z);
    if (p.y / TERRAIN_UNIT_M > top - 1) return null;
    // Which side of the column the point is on: the nearest edge with low ground beyond it.
    const fx = p.x / COLUMN_M - x;
    const fz = p.z / COLUMN_M - z;
    let best: { x: number; z: number; nx: number; nz: number; floor: number } | null = null;
    let bestD = 0.2;
    for (const [nx, nz, d] of [[-1, 0, fx], [1, 0, 1 - fx], [0, -1, fz], [0, 1, 1 - fz]] as const) {
      const floor = this.groundUnits(x + nx, z + nz);
      if (top - floor < FACE_MIN_UNITS || d >= bestD) continue;
      best = { x, z, nx, nz, floor };
      bestD = d;
    }
    return best;
  }

  areaUp(): void {
    const a = this.area;
    if (!a || !a.dragging) return;
    a.dragging = false;
    this.d.changed();
  }

  /** + / - and the wheel: deeper or shallower (higher or lower for banks and tunnels). */
  adjustArea(dir: number): void {
    const a = this.area;
    if (!a) return;
    if (a.chain || a.tunnel || this.areaPlan()?.tunnel) a.tunnelUnits = Math.max(TUNNEL_MIN_UNITS, Math.min(TUNNEL_MAX_UNITS, a.tunnelUnits + dir * AREA_STEP_UNITS));
    else a.units = Math.max(AREA_STEP_UNITS, Math.min(AREA_MAX_UNITS, a.units + dir * AREA_STEP_UNITS));
    this.d.changed();
  }

  /** What the area would mark: its box, levels and the ground in it (cached until it changes). */
  areaPlan(): AreaPlan | null {
    const a = this.area;
    if (!a || !a.from || !a.to) return null;
    const sig = `${a.mode},${a.variant},${a.from.x},${a.from.z},${a.to.x},${a.to.z},${a.units},${a.tunnelUnits}`;
    if (sig === this.plan.sig) return this.plan.plan;
    const lim = SITE_MAX_COLUMNS - 1;
    const tx = a.from.x + Math.max(-lim, Math.min(lim, a.to.x - a.from.x));
    const tz = a.from.z + Math.max(-lim, Math.min(lim, a.to.z - a.from.z));
    const x0 = Math.min(a.from.x, tx);
    const x1 = Math.max(a.from.x, tx);
    const z0 = Math.min(a.from.z, tz);
    const z1 = Math.max(a.from.z, tz);
    const g = (x: number, z: number): number => this.groundUnits(x, z);
    const start = g(a.from.x, a.from.z);
    let top = -Infinity;
    let low = Infinity;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const h = g(x, z);
        top = Math.max(top, h);
        low = Math.min(low, h);
      }
    }
    const axis = Math.abs(tx - a.from.x) >= Math.abs(tz - a.from.z) ? 0 : 1;
    const plan: AreaPlan = { x0, z0, x1, z1, tunnel: false, level: 0, level2: 0, axis: 0, start, top, low, earth: 0 };
    if (a.mode === 'dig') {
      plan.tunnel = top - start >= TUNNEL_FACE_UNITS;
      plan.level = plan.tunnel ? start : start - a.units;
      plan.level2 = plan.tunnel ? start + a.tunnelUnits : 0;
    } else if (rampVariant(a.variant)) {
      // A ramp from the ground where the drag started to the ground where it ended; level is at the low-x (or low-z) end.
      const end = g(tx, tz);
      const forward = axis === 0 ? tx >= a.from.x : tz >= a.from.z;
      plan.axis = axis;
      plan.level = forward ? start : end;
      plan.level2 = forward ? end : start;
    } else {
      plan.level = a.variant === 2 ? start : start + a.units;
    }
    if (a.mode === 'earthwork') {
      const len = plan.axis === 0 ? x1 - x0 : z1 - z0;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const at = plan.axis === 0 ? x - x0 : z - z0;
          const want = rampVariant(a.variant) && len > 0 ? plan.level + Math.floor(((plan.level2 - plan.level) * at) / len) : plan.level;
          plan.earth += Math.max(0, want - g(x, z));
        }
      }
    }
    this.plan = { sig, plan };
    return plan;
  }

  /** Sends the dig or earthwork order for the marked area. */
  confirmArea(): void {
    const a = this.area;
    const plan = this.areaPlan();
    const units = this.workerIds();
    if (!a || !plan || units.length === 0) return;
    const box = { player: this.d.player, units, x0: plan.x0, z0: plan.z0, x1: plan.x1, z1: plan.z1, level: plan.level, level2: plan.level2, queued: this.d.queued() };
    if (a.mode === 'dig') {
      this.d.send({ kind: 'dig', ...box, tunnel: plan.tunnel ? 1 : 0 });
      this.d.message(plan.tunnel ? 'Tunnelling into the face.' : `Digging out ${((plan.start - plan.level) * TERRAIN_UNIT_M).toFixed(1)} m deep.`);
    } else {
      const [res, what, where] = HEAP_STUFF[a.variant] ?? HEAP_STUFF[0]!;
      if (this.d.game.have(res) < plan.earth) this.d.message(`Not enough ${what} yet (needs ${plan.earth}): the workers heap what there is and wait for more. ${where}`, 'alert');
      this.d.send({ kind: 'earthwork', ...box, variant: a.variant, axis: plan.axis });
    }
    const cx = ((plan.x0 + plan.x1 + 1) / 2) * COLUMN_M;
    const cz = ((plan.z0 + plan.z1 + 1) / 2) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'target');
    // Shift keeps marking for the next area.
    if (this.d.queued()) this.area = { ...a, from: null, to: null, dragging: false };
    else this.area = null;
    this.d.changed();
  }

  /** The words beside the cursor while a chain's next stretch is shown: what it builds or digs, and what it costs. */
  chainLabel(): { text: string; short: boolean } | null {
    const t = this.tunnelPlan();
    if (t && this.area) {
      if (t.length === 0) return { text: 'Click where the tunnel goes', short: false };
      return { text: `${(t.length * COLUMN_M).toFixed(1)} m of tunnel, ${(this.area.tunnelUnits * TERRAIN_UNIT_M).toFixed(2)} m tall`, short: false };
    }
    const p = this.placing;
    const plan = this.wallPlan();
    if (!p || !plan || !Commands.chained(p.kind)) return null;
    if (p.chain && plan.length === 0) return { text: 'Click the far end of the next stretch', short: false };
    const est = this.chainEstimate(plan);
    const name = buildingSpec(p.kind).name.toLowerCase();
    const n = Math.min(est.open, est.room);
    const parts = [est.open === 1 && est.blocked === 0 ? `1 ${name}: ${costLine(est.cost)}` : `${est.open} walls: ${costLine(est.cost.map(([r, k]) => [r, k * est.open] as const))}`];
    if (est.blocked > 0) parts.push(`${est.blocked} skipped`);
    if (n < est.open) parts.push(n === 0 ? `not enough ${RESOURCES[est.short]!.name.toLowerCase()}` : `enough for ${n}`);
    return { text: parts.join(', '), short: n < est.open };
  }

  // ---- Placement ----

  startPlacing(kind: number, variant: number): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
    this.area = null;
    this.placing = { kind, variant, x: Number.NaN, z: Number.NaN, dragFrom: null, chain: null, spots: [] };
    this.placeAsked = '';
    this.d.changed();
  }

  endPlacing(): void {
    this.placing = null;
    this.d.changed();
  }

  /** Whether a building kind is placed in lines by dragging (1 x 1 lights). */
  static draggable(kind: number): boolean {
    const s = buildingSpec(kind);
    return s.w === 1 && s.d === 1 && !Commands.chained(kind);
  }

  /** Whether a building kind is placed in chains of stretches, click by click (walls; Building placement: wall chains). */
  static chained(kind: number): boolean {
    const s = buildingSpec(kind);
    return s.defence === 'wall' && s.w === 1 && s.d === 1;
  }

  /** Each frame while placing: the corner under the cursor and the spots of a drag; asks the sim for tiles when they change. */
  updatePlacing(ground: THREE.Vector3 | null, now: number): Ghost | null {
    const p = this.placing;
    if (!p) return null;
    const s = footprintDims(p.kind, p.variant);
    if (ground) {
      p.x = Math.round(ground.x / COLUMN_M - s.w / 2);
      p.z = Math.round(ground.z / COLUMN_M - s.d / 2);
    }
    if (Number.isNaN(p.x)) return null;
    const corners = this.spotCorners();
    const sig = corners.map(([x, z]) => `${x},${z}`).join(';');
    // Ask again now and then: land, props and other buildings change under a ghost that stands still.
    if (sig !== this.placeAsked || now - this.lastPlaceAsk > 400) {
      const keep = new Map(p.spots.map((sp) => [`${sp.x},${sp.z}`, sp]));
      p.spots = corners.map(([x, z]) => keep.get(`${x},${z}`) ?? { x, z, tiles: null });
      this.placeAsked = sig;
      this.lastPlaceAsk = now;
      this.d.askPlacement(p.kind, p.variant, corners);
    }
    if (Commands.chained(p.kind)) {
      // A stretch is cut short where the stock runs out: the walls past that point show greyed.
      const plan = this.wallPlan();
      const est = plan ? this.chainEstimate(plan) : null;
      for (const sp of p.spots) sp.short = est !== null && !est.takes.has(`${sp.x},${sp.z}`);
      return { kind: p.kind, variant: p.variant, spots: p.spots, affordable: est !== null && est.room > 0 };
    }
    const n = p.spots.length;
    const cost = levelSpec(p.kind, 1).cost.map(([r, k]) => [r, k * n] as const);
    return { kind: p.kind, variant: p.variant, spots: p.spots, affordable: this.d.game.shortOf(cost) < 0 };
  }

  /** The sim's answer about placement tiles. */
  onPlaced(kind: number, spots: Array<{ x: number; z: number; tiles: Uint8Array }>): void {
    const p = this.placing;
    if (!p || p.kind !== kind) return;
    const byKey = new Map(spots.map((s) => [`${s.x},${s.z}`, s.tiles]));
    for (const sp of p.spots) {
      const t = byKey.get(`${sp.x},${sp.z}`);
      if (t) sp.tiles = t;
    }
  }

  /** The corners being placed: one, a line from the drag start to the cursor, or a wall chain's next stretch (without its anchor, placed already). */
  private spotCorners(): Array<[number, number]> {
    const p = this.placing!;
    if (Commands.chained(p.kind)) {
      const plan = this.wallPlan()!;
      return p.chain ? plan.cells.slice(1) : plan.cells;
    }
    if (!p.dragFrom) return [[p.x, p.z]];
    const dx = p.x - p.dragFrom.x;
    const dz = p.z - p.dragFrom.z;
    const len = Math.hypot(dx, dz);
    const step = (LIGHT_LINE_SPACING_M * WU_PER_METRE) / WU_PER_COLUMN;
    const n = Math.max(1, Math.floor(len / step) + 1);
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n && i < 40; i++) {
      const t = len === 0 ? 0 : (i * step) / len;
      out.push([Math.round(p.dragFrom.x + dx * t), Math.round(p.dragFrom.z + dz * t)]);
    }
    return out;
  }

  /** The wall chain's next stretch: from the anchor towards the cursor, or the one wall under the cursor before the first click. */
  private wallPlan(): StretchPlan | null {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return null;
    if (!p.chain) return { x: p.x, z: p.z, dir: 0, length: 0, cells: [[p.x, p.z]] };
    const { dir, length } = snapStretch(p.chain.x, p.chain.z, p.x, p.z, WALL_STRETCH_MAX_COLUMNS);
    return { x: p.chain.x, z: p.chain.z, dir, length, cells: stretchCells(p.chain.x, p.chain.z, dir, length) };
  }

  /**
   * What a wall stretch would place, worked out as the sim will: the columns
   * that take a wall (not red, not planned already), how many the stock less
   * the planned buildings pays for, and which ones those are.
   */
  private chainEstimate(plan: StretchPlan): { open: number; blocked: number; room: number; short: number; cost: Cost; takes: Set<string>; last: [number, number] | null } {
    const p = this.placing!;
    const game = this.d.game;
    const units = new Set(this.workerIds());
    const queued = p.chain !== null || this.d.queued();
    const queues = [...game.queues].filter(([id]) => queued || !units.has(id)).map(([, q]) => q);
    const standing = (kind: number, x: number, z: number): boolean => [...game.buildings.values()].some((b) => b.owner === this.d.player && b.kind === kind && b.x === x && b.z === z);
    const planned = plannedSpots(queues, standing);
    const owed = new Map<number, number>();
    for (const kind of planned.values()) for (const [r, n] of levelSpec(kind, 1).cost) owed.set(r, (owed.get(r) ?? 0) + n);
    const cost = levelSpec(p.kind, 1).cost;
    const { room, short } = stretchRoom((r) => game.have(r), owed, cost);
    const tiles = new Map(p.spots.map((sp) => [`${sp.x},${sp.z}`, sp.tiles]));
    let open = 0;
    let blocked = 0;
    const takes = new Set<string>();
    let last: [number, number] | null = null;
    for (const [x, z] of p.chain ? plan.cells.slice(1) : plan.cells) {
      const k = `${x},${z}`;
      if (planned.has(k)) continue;
      const t = tiles.get(k);
      if (t && t.some((r) => r !== 0)) {
        blocked++;
        continue;
      }
      open++;
      if (takes.size < room) {
        takes.add(k);
        last = [x, z];
      }
    }
    return { open, blocked, room, short, cost, takes, last };
  }

  /** Left button down while placing: start a line drag for lights. */
  placeDown(): void {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return;
    if (Commands.draggable(p.kind)) p.dragFrom = { x: p.x, z: p.z };
  }

  /** Left button up while placing: place if every tile is green and it can be paid for; for walls, a click of the chain. */
  placeUp(): void {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return;
    if (Commands.chained(p.kind)) return this.chainClick();
    const spots = p.dragFrom ? p.spots : p.spots.filter((s) => s.x === p.x && s.z === p.z);
    p.dragFrom = null;
    if (spots.length === 0 || spots.some((s) => !s.tiles)) return;
    const bad = spots.find((s) => s.tiles!.some((t) => t !== 0));
    if (bad) {
      const reason = bad.tiles!.find((t) => t !== 0)!;
      this.d.message(`Cannot build there: ${BLOCKED_TEXT[reason] ?? 'blocked.'}`, 'alert');
      return;
    }
    const cost = levelSpec(p.kind, 1).cost.map(([r, k]) => [r, k * spots.length] as const);
    const short = this.d.game.costProblem(cost);
    if (short) {
      this.d.message(short, 'alert');
      return;
    }
    const units = this.workerIds();
    if (units.length === 0) return this.endPlacing();
    const queued = this.d.queued();
    spots.forEach((s, i) => {
      this.d.send({ kind: 'build', player: this.d.player, units, building: p.kind, variant: p.variant, x: s.x, z: s.z, queued: queued || i > 0 });
    });
    const s = footprintDims(p.kind, p.variant);
    const last = spots[spots.length - 1]!;
    const cx = (last.x + s.w / 2) * COLUMN_M;
    const cz = (last.z + s.d / 2) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'move');
    cue('ui_place');
    // Shift keeps the ghost for the next one; otherwise placement ends.
    if (!queued) this.endPlacing();
  }

  /**
   * One click of a wall chain (Building placement: wall chains). The first
   * places one wall and makes it the anchor; each later click places the
   * stretch from the anchor to the click, snapped to the nearest of the eight
   * directions, and its far end is the next anchor (or the last wall the
   * stock paid for, if it ran out, so clicking the same end again later goes
   * on from there). The ghost stays until right click, Esc or Done.
   */
  private chainClick(): void {
    const p = this.placing!;
    const units = this.workerIds();
    if (units.length === 0) return this.endPlacing();
    const plan = this.wallPlan();
    if (!plan || (p.chain && plan.length === 0)) return;
    const est = this.chainEstimate(plan);
    if (est.open === 0) {
      const red = p.spots.find((s) => s.tiles?.some((t) => t !== 0));
      const reason = red?.tiles?.find((t) => t !== 0);
      this.d.message(reason === undefined ? 'Every wall of that stretch is planned already.' : `Cannot build there: ${BLOCKED_TEXT[reason] ?? 'blocked.'}`, 'alert');
      return;
    }
    if (est.room === 0) {
      this.d.message(`Not enough ${RESOURCES[est.short]!.name.toLowerCase()} for another ${buildingSpec(p.kind).name.toLowerCase()} (${costLine(est.cost)} each, counting what is already planned).`, 'alert');
      return;
    }
    this.d.send({ kind: 'wallStretch', player: this.d.player, units, building: p.kind, x: plan.x, z: plan.z, dir: plan.dir, length: plan.length, skip: p.chain ? 1 : 0, queued: p.chain !== null || this.d.queued() });
    const [ex, ez] = est.room < est.open && est.last ? est.last : stretchEnd(plan.x, plan.z, plan.dir, plan.length);
    p.chain = { x: ex, z: ez };
    const cx = (ex + 0.5) * COLUMN_M;
    const cz = (ez + 0.5) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'move');
    cue('ui_place');
    this.d.changed();
  }
}

/** The help line of a wall in the build menu. */
const WALL_CHAIN_HELP = 'Click to place one, then click further points: each click builds the whole stretch from the last point, straight or diagonal, skipping what is in the way. Right click, Esc or Done ends the chain.';

/** The Tunnel button's help on the dig card. */
const TUNNEL_CHAIN_HELP = 'Dig a tunnel, level: click where it starts (on a cliff or hillside, the floor is the ground in front of it; on flat ground, the ground you click), then click where it goes; each click digs the stretch from the last point, straight or diagonal, 90 cm wide. Keep clicking to turn corners. + and - set its height. Right click, Esc or Done ends it. Press again to dig down instead.';

/**
 * Boxes that outline a stretch for the overlay: one round a straight run,
 * one round each step of a diagonal.
 */
export function stretchBoxes(x: number, z: number, dir: number, length: number, width: number): Array<[number, number, number, number]> {
  const [dx, dz] = STRETCH_DIRS[dir]!;
  const cells = stretchCells(x, z, dir, length, width);
  if (dx === 0 || dz === 0) {
    const xs = cells.map(([cx]) => cx);
    const zs = cells.map(([, cz]) => cz);
    return [[Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]];
  }
  const out: Array<[number, number, number, number]> = [[x, z, x, z]];
  for (let k = 1; k <= length; k++) {
    const ax = x + dx * (k - 1);
    const az = z + dz * (k - 1);
    const bx = x + dx * k;
    const bz = z + dz * k;
    out.push(width > 1 ? [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)] : [bx, Math.min(az, bz), bx, Math.max(az, bz)]);
  }
  return out;
}

/** A garrison: a tower's slots, or the parapets of a level 3 main base (Table 4). */
export function garrisonRoom(b: Pick<BuildingInfo, 'kind' | 'level' | 'complete'>): number {
  if (!b.complete) return 0;
  const spec = buildingSpec(b.kind);
  if (spec.slots) return spec.slots;
  return b.kind === BuildingKind.MainBase && b.level >= 3 ? 8 : 0;
}

const EARTH = RESOURCES.findIndex((r) => r.name === 'Earth');
/** What each earthworks variant is heaped from: the resource, its name, and where it comes from. */
const HEAP_STUFF: ReadonlyArray<readonly [number, string, string]> = [
  [EARTH, 'Earth', 'Dig somewhere to get Earth.'],
  [EARTH, 'Earth', 'Dig somewhere to get Earth.'],
  [EARTH, 'Earth', 'Dig somewhere to get Earth.'],
  [RESOURCES.findIndex((r) => r.name === 'Lumber ramp step'), 'lumber ramp steps', 'Make them at a workshop.'],
  [RESOURCES.findIndex((r) => r.name === 'Stone ramp step'), 'stone ramp steps', 'Make them at a workshop.'],
];

const EARTHWORK_HELP = [
  'Drag over the ground to mark it; + and - set the height of the bank. Left click confirms. Earth comes from digging.',
  'Drag from the bottom of the slope to the top: the ramp climbs from the ground where the drag starts to the ground where it ends.',
  'Drag over a hole or ditch, starting on its rim: it is filled up to the ground where the drag starts.',
  'Drag from the bottom of the slope to the top, like an earth ramp, but laid from lumber ramp steps made at a workshop: one step for each 11 cm it rises in each column.',
  'Drag from the bottom of the slope to the top, like an earth ramp, but laid from stone ramp steps made at a workshop: one step for each 11 cm it rises in each column.',
];

/** Products on one page of the K menu (slot 13 is the next page, 14 Back). */
const MAKE_PER_PAGE = 13;

/** Spell button faces where the name is too long for the button. */
const SPELL_FACES: Record<number, string> = { [Spell.ArcaneBolt]: 'Bolt', [Spell.AreaBlast]: 'Blast', [Spell.Counterspell]: 'Counter' };

/** The K button by building kind: its face and tooltip. */
const MAKE_WORDS: Record<number, [string, string]> = {
  [BuildingKind.ScholarsLodge]: ['Research', 'Open the research menu: every step, greyed out with what it still needs. Research takes the lodge\'s time and stops while the troops starve. V shows the next page; B is Back.'],
  [BuildingKind.Forge]: ['Smelt', 'Open the forge menu: smelting ore into ingots (copper, tin and bronze at a Casting Hearth, wrought iron at a Bloomery, iron at an Ironworks, steel and carbon steel at a Steelworks). Kit is made where a unit trains or upgrades, not here. Needs workers inside. B is Back.'],
  [BuildingKind.Cooking]: ['Cook', 'Open the cooking menu: raw food into food with more nutrition, burning lumber or coal. V shows the next page; B is Back.'],
  [BuildingKind.LivestockFarm]: ['Slaughter', 'Slaughter one of the grown animals of the farm for its meat and hides. The farm keeps its breeding pairs longest. B is Back.'],
  [BuildingKind.Kiln]: ['Fire', 'Open the kiln menu: charcoal, bricks and glass. Needs workers inside. B is Back.'],
  [BuildingKind.Tannery]: ['Tan', 'Open the tannery menu: leather, hardened leather and rope. Needs workers inside. B is Back.'],
  [BuildingKind.HerbalistHut]: ['Brew', 'Open the herbalist menu: bandages, remedies and poison. Needs workers inside. B is Back.'],
  [BuildingKind.MagiSanctum]: ['Research', 'Open the Magi Sanctum menu: Hexcraft research. Wands and robes are upgraded on the mages themselves. B is Back.'],
  [BuildingKind.Workshop]: ['Make', 'Open the workshop menu: carts, ramp steps, siege engines and the rest. Needs workers inside. V shows the next page; B is Back.'],
};

/** A short button face from a product name. */
export function shortFace(name: string): string {
  const plain = name.replace(/\s*\(.*\)\s*/, '').trim();
  if (plain.length <= 10) return plain;
  const words = plain.split(' ');
  return words.length > 1 ? `${words[0]!.slice(0, 8)} ${words[words.length - 1]![0]}.` : plain.slice(0, 10);
}

/** "Weapon" from "weapon". */
function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A worker's tool kit in words, by tier (Table 2c). */
export function toolKitText(tier: number): string {
  return TOOL_KITS[tier]?.name ?? 'no tools';
}

const BLOCKED_TEXT = ['', 'the ground is too steep.', 'it cannot be built on water.', 'another building is in the way.', 'a tree, rock or bush is in the way.', 'that land is unexplored.'];

/** A selected unit as the upgrade buttons see it. */
interface Holder {
  id: number;
  h: KitHolder;
  rank: number;
  /** An upgrade already under way. */
  pending: boolean;
}
