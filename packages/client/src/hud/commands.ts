// Orders and the command card (Controls: Unit orders; Command card and
// hotkeys; Building placement; Queuing orders with Shift; Production queues).
// Works out the buttons for the active subgroup, the targeted commands and
// their clicks, the smart right click, and the placement ghost with Shift
// chains, wall chains clicked from point to point, and dragged lines of
// lights; and the dig area, with tunnel chains clicked the same way. Orders go out through `issue`; what the
// world looks like comes from GameInfo and the selectables under the cursor.
import * as THREE from 'three';
import { cue } from '../audio/cues.ts';
import {
  BuildingKind,
  costText,
  craftRate,
  CREWMAN_RETRAIN_STEPS,
  EAT_NUTRITION,
  ENGINE_PRODUCT,
  type Engine,
  engineSpec,
  engineUpgrade,
  engineUpgradeCrew,
  FIXED_ENGINES,
  holderKind,
  Line,
  linePiece,
  mainCost,
  buildingSpec,
  footprintDims,
  kitName,
  levelSpec,
  PARAPET_SLOTS,
  PARAPET_TIER,
  MAGE_RANK_TRAINING,
  MONSTERS,
  FactionKind,
  PEOPLES,
  OUT_OF_REACH,
  HAND_CART_TENTHS_LB,
  nextMageTraining,
  PickOwn,
  Product,
  productSpec,
  Res,
  RESEARCH_PRODUCT,
  RESOURCES,
  schoolSpells,
  plannedSpots,
  chainPiece,
  platformProducts,
  siteCells,
  SiteKind,
  SITE_MAX_COLUMNS,
  snapStretch,
  speciesSpec,
  stretchBetween,
  stretchCells,
  stretchSpots,
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
  troopOf,
  troopProduct,
  upgradeClimbs,
  Greyed,
  mageLock,
  School,
  TOOL_KITS,
  upgradePieces,
  equipmentPlans,
  type EquipmentHolder,
  WU_PER_COLUMN,
  WU_PER_METRE,
  WU_PER_TERRAIN_UNIT,
  type BuildingSpec,
  type Cost,
  type Order,
} from '@blockyrts/sim';
import type { UnitInfo } from '../game/game-info.ts';
import type { GameInfo } from '../game/game-info.ts';
import { keyFor, spellAction } from '../input/bindings.ts';
import { UnitFlag, type BuildingInfo, type PeopleInfo } from '../messages.ts';
import { isOwn } from '../selection/rules.ts';
import { buildingIdOf, entityIdOf, lootIdOf, type Selectable } from '../selection/types.ts';
import type { Settings } from '../settings/settings.ts';
import type { Ghost, GhostSpot } from '../world/buildings-view.ts';
import { COLUMN_M } from '../world/mesher.ts';
import type { ButtonIcon, ButtonPress } from './buttons.ts';
import { buildIcon, buildingUpgradeIcon, equipIcon, productIcon, trainTroopIcon } from './card-icons.ts';
import { defenseAction, flatMake, makeAction, menuSlots, MORE_ACTION, placeAction, submenuAction, submenuChoices } from './menu-keys.ts';
import { buildingIconFile } from './unit-icons.ts';
import { cardChoice, cardCostText, cardOffered, cardProduct, cardTrainsText, cardWhy, troopChoice, troopCostText, troopName, troopWhy } from './troops.ts';
import { count } from './wording.ts';

/** One button of the command card. */
export interface CardEntry {
  /** Stable name of what it does (tests, lit state). */
  action: string;
  face: string;
  name: string;
  /** Binding name: a letter by character ('KeyG'), else a physical code ('Escape', 'Equal'); '' for a click only. */
  key: string;
  /** A build or K menu button: its face is a name, set small. */
  menu?: boolean;
  description: string;
  enabled: boolean;
  /** Why it is greyed out. */
  reason: string;
  lit?: boolean;
  run(p: ButtonPress): void;
  double?(p: ButtonPress): void;
  /** A right click (Jade's Patch 5, CT-1 and UI-13: the button's auto function), and a touch held on it. */
  right?(p: ButtonPress): void;
  /** Its auto function is on for the selection (UI-13: autorepair): a small mark on the button. */
  auto?: boolean;
  /** A click while it is greyed out (Jade's Patch 3): those who can sort out why ask, in bubbles (sim units/greyed.ts). */
  grey?(): void;
  /** Its picture, when it has one of its own (card-icons.ts); else the shell picks one by action. */
  icon?: ButtonIcon | undefined;
  /** What it trains or makes, so the card can mark what a building is making now. */
  product?: number;
  troop?: number;
}

/** The command card's buttons in book order, left to right and top to bottom (Jade's Patch 2: no gaps, Cancel last). */
export type Card = CardEntry[];

/** A card while it is put together: some cards fill fixed places and leave gaps, which close up when it is shown. */
type Slots = Array<CardEntry | null>;

/** The card's commands that work on another player's shared units (the sim's allied orders). */
const ALLIED_ACTIONS = new Set(['attack', 'patrol', 'move', 'gather', 'hunt', 'returnCargo', 'cancel']);

type TargetCommand = 'move' | 'repair' | 'rally' | 'attack' | 'patrol' | 'prospect' | 'cast' | 'hitch' | 'crew' | 'gather' | 'hunt';

/**
 * Pages of the command card: the main card, the build menu (Patch 2: one, in
 * place of Basic and Advanced), a building's K menu (smelting, research and
 * the rest) and the Citadel's Build defense menu (Patch 5, CT-3).
 */
export type CardPage = 'main' | 'build' | 'make' | 'defense';

/**
 * Dig (D): an area dragged on the ground, then confirmed with a left click
 * (Dig: area, depth, preview); or a tunnel chain clicked from point to point
 * (Digging: tunnel chains).
 */
export interface Area {
  /** Global columns where the drag started, and where it is now or ended. */
  from: { x: number; z: number } | null;
  to: { x: number; z: number } | null;
  dragging: boolean;
  /** Dig depth, terrain units. */
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
  /** As in the dig order (terrain units). */
  level: number;
  level2: number;
  /** Ground at the drag start, and the highest and lowest ground in the box (terrain units). */
  start: number;
  top: number;
  low: number;
}

/** A terrain unit in metres (about 11 cm). */
export const TERRAIN_UNIT_M = WU_PER_TERRAIN_UNIT / WU_PER_METRE;
/** Depth and height steps of the + and - buttons and the wheel: 3 units, about 34 cm (s). */
export const AREA_STEP_UNITS = 3;
/** Depth of a new dig: 9 units, about 1 m (s). */
export const AREA_DEFAULT_UNITS = 9;
/** The dig limit: 3 m below the natural ground (Digging and building up the land). */
export const AREA_MAX_UNITS = 27;
/** A dig starts a tunnel when the box rises this far above where the drag started: a face about 2.25 m tall (s). */
export const TUNNEL_FACE_UNITS = 20;
/** A press on the side of land at least this much taller than the ground in front of it (a rise nobody can jump, 5 units) starts a tunnel chain into that face (s). */
export const FACE_MIN_UNITS = 5;

/** The troop types' card actions, their buttons' faces and slots on a Barracks card (a main base shifts them one along for Worker). */
const TROOP_ACTIONS: Readonly<Record<number, readonly [string, string, number]>> = {
  [Troop.Close]: ['trainClose', 'Sword', 0],
  [Troop.Long]: ['trainLong', 'Spear', 1],
  [Troop.Ranger]: ['trainRanger', 'Ranger', 2],
  [Troop.Brawler]: ['trainBrawler', 'Brawler', 3],
  // Patch 2: cavalry trains at the Barracks with the rest, after the brawler.
  [Troop.Cavalry]: ['trainCavalry', 'Cavalry', 4],
};

/** Whether a selectable's type is one of the player's units that wears gear and eats: workers, warriors and mages. */
const geared = (u: Selectable): boolean => u.typeKey === 'worker' || u.typeKey === 'warrior' || u.typeKey.startsWith('mage:');

/** Whether a building trains workers, warriors or mages, which come out to its rally point. */
const trainsUnits = (b: BuildingInfo): boolean =>
  buildingSpec(b.kind).trainsWorkers || b.troops.length > 0 || (b.mages?.length ?? 0) > 0 || b.products.some(([p]) => p === Product.SupportMage || p === Product.BattleMage);

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
  /** Stretches ordered since the chain's first wall, and whether that first click placed a wall (not an old one clicked to go on from). */
  stretches: number;
  placed: boolean;
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
  /** How many buttons the card can show at once, at the smallest size it may shrink them to (hud-layout.ts buttonRoom); 15 when left out. */
  slots?(): CardSize;
}

export interface CardSize {
  /** The most buttons the card shows at once; a longer menu pages. */
  most: number;
}

const CLASSIC_SIZE: CardSize = { most: 15 };

/** Spacing of lights placed along a dragged line: 8 m, so their 5 m claims overlap. */
export const LIGHT_LINE_SPACING_M = 8;

/** "300 softwood lumber, 150 stone" */
export function costLine(cost: Cost): string {
  if (cost.length === 0) return 'free';
  return cost.map(([r, n]) => `${n} ${RESOURCES[r]!.name.toLowerCase()}`).join(', ');
}

function seconds(ws: number): string {
  return ws >= 60 && ws % 60 === 0 ? `${ws / 60} min` : `${ws} s`;
}

export class Commands {
  /** The card's page; in the build menu, the submenu open (-1 for none); the page of a menu too long for the card. */
  menu: { page: CardPage; sub: number; more: number } = { page: 'main', sub: -1, more: 0 };
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

  private size(): CardSize {
    return this.d.slots?.() ?? CLASSIC_SIZE;
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
        this.placing.stretches = 0;
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
      this.menu = this.menu.sub >= 0 && this.menu.page === 'build' ? { page: 'build', sub: -1, more: 0 } : { page: 'main', sub: -1, more: 0 };
      this.d.changed();
      return true;
    }
    return false;
  }

  /** The selection changed: menus, targets and ghosts belong to the old one. */
  reset(): void {
    this.menu = { page: 'main', sub: -1, more: 0 };
    this.targeting = null;
    this.area = null;
    if (this.placing) this.endPlacing();
  }

  // ---- The card ----

  /**
   * The card for the active subgroup, its buttons in book order (Jade's
   * Patch 2: the shell sizes them as squares to fill the card, growing it
   * upward only when they cannot fit at the minimum). A command waiting for
   * its target, a ghost or a dig area puts Cancel (or Done) last.
   */
  card(): Card {
    const active = this.d.activeType();
    const waiting = this.placing !== null || this.targeting !== null || this.area !== null;
    const slots = active === null ? [] : this.slotsFor(active, waiting);
    const out = slots.filter((e): e is CardEntry => e !== null);
    if (waiting) out.push(this.cancelEntry());
    return out;
  }

  private slotsFor(active: string, waiting: boolean): Slots {
    if (this.area && active === 'worker') return this.areaCard();
    if (active === 'worker' || active === 'warrior' || active === 'warrior:crew' || active.startsWith('mage:')) {
      if (this.alliedOnly(active)) return this.alliedCard(active);
      if (this.menu.page === 'build' && active === 'worker') return this.buildMenuCard(waiting);
      return this.unitCard(active);
    }
    if (active.startsWith('engine:')) return this.engineCard();
    if (active.startsWith('building:')) {
      const kind = Number(active.split(':')[1]);
      if (this.menu.page === 'make') return this.makeCard(kind, waiting);
      if (this.menu.page === 'defense') return this.defenseCard(kind, waiting);
      const card = this.buildingCard(kind, waiting);
      // Jade's Patch 3: a card whose one button only opens a bigger menu (the Forge's Smelt) opens on that menu, with no Back.
      if (Commands.lone(card)) return this.makeCard(kind, waiting, false);
      return card;
    }
    return [];
  }

  /**
   * Whether a card is one button that only opens a bigger menu (Jade's
   * Patch 3: "a single button ... which then opens [a] menu ... feels like
   * an extra pointless click"): the Forge's Smelt, the Workshop's Make, the
   * Scholar's Lodge's Research and the Barn's Slaughter, while nothing else
   * is on their cards.
   */
  static lone(card: Slots): boolean {
    const shown = card.filter((e): e is CardEntry => e !== null);
    return shown.length === 1 && shown[0]!.action === 'craft' && shown[0]!.product === undefined;
  }

  /** Whether every selected unit of the active type is another player's, shared with this one. */
  private alliedOnly(active: string): boolean {
    const list = this.d.selection().filter((t) => t.kind === 'unit' && t.typeKey === active);
    return list.length > 0 && list.every((t) => t.owner !== this.d.player);
  }

  /** Shared units take the shared orders only (Allies panel): move, attack, patrol, gather, unload and hunt. */
  private alliedCard(active: string): Slots {
    return this.unitCard(active).filter((e) => e !== null && ALLIED_ACTIONS.has(e.action));
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
        description: `${walls ? 'End the wall chain: the walls already placed stay planned and the workers build them.' : 'End the tunnel: the stretches already marked stay marked and the workers dig them.'} Right click, or a click on the chain's last point, does the same. With Shift held, ${walls ? 'the wall stays on the cursor' : 'Dig stays on'} for a new chain.`,
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

  /**
   * A unit's card (Jade's Patch 2 action menu overhaul): only the buttons her
   * list names, as pictures. Combat troops: Attack, Patrol and Move, then
   * Hunt, Eat and Upgrade equipment. Mages: Attack, Patrol and Move, their
   * school's spells, Eat, Upgrade equipment and rank training. Workers: Move,
   * Gather, Unload, Repair, Dig, Prospect and Build, then Eat, Upgrade
   * equipment and the cart (Patch 3: no rank training, they rank up by
   * working). Artillery crewmen: Attack, Patrol, Move, Crew, Eat and Retrain
   * (Patch 3). [Before Patch 2 every unit also had Stop, Hold and Enter;
   * troops had the weapon and armour upgrades and their Max twins, the
   * ranged-or-melee lock and Cannon crew training.]
   */
  private unitCard(active: string): Slots {
    const t = this.targeting?.command;
    const attack = this.entry(
      'attack',
      'Attack',
      'Then left click a unit to attack it, whoever it is: an enemy, prey, or even one of your own units or an ally\'s. Left click ground to attack-move there: walk, and fight whatever enemy comes in range on the way. Right click or Esc cancels. Press twice (or double click) and each one attacks the nearest enemy it can see.',
      () => this.target('attack', 'attack'),
      { lit: t === 'attack', double: () => this.pickOwn(PickOwn.Attack, 'Each one attacks the nearest enemy it can see.') },
    );
    const patrol = this.entry('patrol', 'Patrol', 'Then left click ground: they walk back and forth between here and there, fighting whatever they meet.', () => this.target('patrol', 'patrol'), { lit: t === 'patrol' });
    const move = this.entry('move', 'Move', 'Then left click ground or the minimap to move there, or a unit to follow it. Right click or Esc cancels. Hold M (or Shift) to give several.', () => this.target('move', 'move'), { lit: t === 'move' });
    if (active === 'worker') {
      const workers = this.workerIds();
      const carrying = workers.some((id) => {
        const u = this.d.game.unit(id);
        return (u !== null && u.carryAmt > 0) || this.bagOf(id).length > 0;
      });
      const unload = 'Take what they carry, and any loot, to the nearest drop-off, then go back to the node or the dig.';
      return [
        move,
        this.entry(
          'gather',
          'Gather',
          'Then left click a tree, rock or bush: the workers gather from it, take each load to the nearest main base or Storehouse and go back for more of the same.\nRight click (or press twice): they fetch the basic materials the camp can use by themselves: wood, sticks, stone and flint, clay, sand and coal as the main base grows, and ore once there is a forge for it, most of what the stock is shortest of, the nearest first. They look only where your side has explored, then farther out round its edge (never more than 25 m into the unknown), and never so far that they could not get home by nightfall; at dusk they come back to the nearest main base, and go out again in the day.',
          () => this.target('gather', 'gather'),
          { lit: t === 'gather', right: () => this.forage(), double: () => this.forage() },
        ),
        carrying
          ? this.entry('returnCargo', 'Unload', unload, () => this.unitOrder({ kind: 'returnCargo' }))
          : this.off('returnCargo', 'Unload', unload, 'They are not carrying anything.'),
        this.entry(
          'repair',
          'Repair',
          'Then left click one of your buildings, engines or cannons to build, upgrade or repair it. A repair uses up the building\'s own materials for the health it gives back: from nothing to whole costs what the building cost.\nRight click: autorepair on or off. Workers on autorepair fix anything of yours that is damaged within 8 m of them, then go back to what they were doing.\nPress twice (or double click): they repair every damaged building nearby, worst first.',
          () => this.target('repair', 'repair'),
          { lit: t === 'repair', double: () => this.repairAll(), right: () => this.autoRepair(workers), auto: workers.length > 0 && workers.every((id) => ((this.d.game.unit(id)?.flags ?? 0) & UnitFlag.AutoRepair) !== 0) },
        ),
        this.entry(
          'dig',
          'Dig',
          'Then left drag over the ground to mark an area. + and - (or the wheel) set the depth, about 34 cm a step, down to the 3 m limit; a see-through box shows the cut. Left click confirms. Clicking the side of a cliff or hillside starts a tunnel instead (D again, or Tunnel, for one on flat ground): click where it goes and each click digs the stretch from the last point, level, straight or diagonal; keep clicking to turn corners, right click ends it. Digging gives Earth, stone or what the ground is made of, which the workers carry to the nearest main base or Storehouse, 25 lb at a time, coming back to dig on. Earth digs with any digging tool; rock needs a stone maul or a pickaxe, marble a bronze pickaxe.',
          () => this.startArea(),
        ),
        this.entry(
          'prospect',
          'Prospect',
          'Then left click the ground: a worker walks there and spends 40 s (20 s with a prospecting hammer) finding out what lies under it. The rating, Poor, Fair, Good or Rich, sets what a mineshaft there brings up (x0.5 to x2.5). Press twice (or double click) and each worker prospects where it stands.',
          () => this.target('prospect', 'prospect'),
          { lit: t === 'prospect', double: () => this.pickOwn(PickOwn.Prospect, 'Prospecting where they stand.') },
        ),
        this.entry('build', 'Build', 'Open the build menu: every building, with walls, gates and towers under Defences and lights under Lights. Each one\'s key is on its button; Esc goes back.', () => this.openMenu('build')),
        this.eatEntry(),
        this.equipEntry(workers),
        this.cartEntry(workers),
      ];
    }
    if (active.startsWith('mage:')) {
      const ids = this.unitIds((u) => u.typeKey === active);
      const school = active === 'mage:battle' ? 2 : 1;
      // F is Fortify and Fireball on this card, so Eat has no key here; it is a click.
      return [attack, patrol, move, ...schoolSpells(school).slice(0, 5).map((spell) => this.spellEntry(ids, spell)), { ...this.eatEntry(), key: '' }, this.equipEntry(ids), this.mageRankEntry(ids)];
    }
    if (active === 'warrior:crew') {
      // The artillery crewman (Patch 2): siege, so no Hunt and no Upgrade equipment (it has no kit); Crew sends it to an engine, and Retrain makes it a worker (Patch 3).
      return [
        attack,
        patrol,
        move,
        this.entry(
          'crew',
          'Crew',
          'Then left click one of your catapults, ballistas or cannons: the crewmen walk to it and stand by it, fire it and push it when nothing hauls it. Only artillery crewmen crew engines. Right clicking the engine does the same.',
          () => this.target('crew', 'crew'),
          { lit: t === 'crew', name: 'Crew an engine' },
        ),
        this.eatEntry(),
        this.retrainEntry(),
      ];
    }
    const troops = this.unitIds((u) => u.typeKey === 'warrior');
    return [
      attack,
      patrol,
      move,
      this.entry(
        'hunt',
        'Hunt',
        'Then left click a wild animal: the warriors hunt it, then go on hunting as usual.\nRight click (or press twice): the warriors go out after game, hares, deer and wild birds, take the meat home when their bags are half full and go out again, looking farther out when nothing is in sight; workers in the selection follow and carry the meat. They never go farther than they could walk back from in dusk\'s 40 s, so they are home by nightfall, and go out again in the day. Wild boar, giant crabs, bears and creatures that guard their ground fight back, so they are left alone unless you pick one.',
        () => this.target('hunt', 'hunt'),
        { lit: t === 'hunt', right: () => this.huntAuto(), double: () => this.huntAuto() },
      ),
      this.eatEntry(),
      this.equipEntry(troops),
    ];
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
        ? 'Then left click a unit: one of yours, an ally\'s, or anyone else\'s that is not an enemy.'
        : s.target === 'point'
          ? 'Then left click the ground where it lands.'
          : s.target === 'counter'
            ? 'Then left click an enemy that is casting.'
            : 'Then left click a unit: an enemy, prey, or even one of your own.';
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
    const desc = `Walk to the nearest main base or storehouse and sit down there to eat for 10 s, with a bar over their heads: 2 food heals half their health over those 10 s, and a remedy or a bandage from the stock heals what is left. Hit by an enemy, they get up at once and their health still comes back.`;
    const where = [...this.d.game.buildings.values()].some((b) => b.owner === this.d.player && b.complete && (b.kind === BuildingKind.MainBase || b.kind === BuildingKind.Storehouse));
    if (!where) return this.off('eat', 'Eat', desc, 'There is no main base or storehouse to eat at.');
    if (this.d.game.food() < EAT_NUTRITION) return this.off('eat', 'Eat', desc, this.d.game.food() === 0 ? 'There is no food.' : `Not enough food (needs ${EAT_NUTRITION}).`);
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

  /** N Hunt: out after game, over and over, home at dusk and out again in the day. */
  private huntAuto(): void {
    const units = this.unitIds();
    if (units.length === 0) return;
    this.targeting = null;
    this.d.send({ kind: 'hunt', player: this.d.player, units, target: 0, auto: 1, queued: this.d.queued() });
    this.d.changed();
  }

  /** G Gather: the workers fetch what the camp needs by themselves. */
  private forage(): void {
    const units = this.workerIds();
    if (units.length === 0) return;
    this.targeting = null;
    this.d.send({ kind: 'forage', player: this.d.player, units, queued: this.d.queued() });
    this.d.changed();
  }

  /** What a unit of the local player's carries as loot: (resource, count) pairs. */
  private bagOf(id: number): Array<[number, number]> {
    return this.d.game.info?.bags.find(([u]) => u === id)?.[1] ?? [];
  }

  /** The selected units as Upgrade equipment sees them, with their ids and the lines they already have an upgrade on the way for. */
  private holders(ids: number[]): EquipmentHolder[] {
    const out: EquipmentHolder[] = [];
    for (const id of ids) {
      const u = this.d.game.unit(id);
      const kind = u ? holderKind(u.kind) : undefined;
      if (!u || !kind) continue;
      const q = this.d.game.queues.get(id) ?? [];
      const pending = (line: number): boolean => q.some((o) => o.t === 'kitUp' && o.line === line);
      out.push({ id, h: { kind, troop: u.troop, w: u.wTier, a: u.aTier }, rank: u.rank, pendingW: pending(Line.Weapon), pendingA: pending(Line.Armour) });
    }
    return out;
  }

  /**
   * Upgrade equipment (Jade's Patch 2): one button for what the Max twins of
   * Upgrade weapon and Upgrade armour did. Each unit gets the best weapon (a
   * worker's tools, a mage's wand) researched that the stock pays for, then
   * the best armour (a mage's robe) from what is left, weapons first for all
   * of them and the highest ranks first, as the sim plans it
   * (equipmentPlans). They walk to the nearest Barracks, Forge or main base
   * (a mage also a Magi Sanctum) and sit tinkering there, with a bar over
   * their heads, for each piece's time.
   */
  private equipEntry(ids: number[]): CardEntry {
    const list = this.holders(ids);
    const kind = list[0]?.h.kind ?? 'warrior';
    const name = 'Upgrade equipment';
    const what = kind === 'worker' ? 'the best tools' : kind === 'mage' ? 'the best wand, then the best robe,' : 'the best weapon, then the best armour,';
    const where = kind === 'mage' ? 'the nearest Barracks, Forge, main base or Magi Sanctum' : 'the nearest Barracks, Forge or main base';
    const plans = equipmentPlans(list, this.d.game.pool(), this.d.game.tech());
    const sent = plans.filter((p) => p.w > 0 || p.a > 0);
    const lines = [
      kind === 'worker'
        ? 'Each one gets the best tools researched that the stock pays for, the highest ranks first.'
        : `Each one gets ${what} researched that the stock pays for: weapons first for all of them, the highest ranks first, then armour from what is left.`,
      `They walk to ${where} and sit tinkering there, with a bar over their heads, for each piece's time. The stock pays now; the old kit goes back to the stock in full when the new one goes on.`,
    ];
    if (sent.length > 0) {
      const p = sent[0]!;
      const h = list.find((x) => x.id === p.id)!.h;
      const pieces = [
        [Line.Weapon, p.w],
        [Line.Armour, p.a],
      ]
        .filter(([, to]) => to! > 0)
        .map(([line, to]) => `${linePiece(h, line!, to!)?.name ?? 'the next tier'} (tier ${to}) for ${costText(mainCost(upgradePieces(h, line!, to!)))}`);
      lines.push(`${sent.length === list.length ? 'All of them' : `${sent.length} of ${list.length}`} can go: the first to ${pieces.join(', and ')}.`);
    }
    const reason = list.length === 0 ? 'Select a unit.' : sent.length === 0 ? (plans[0]?.why ?? 'Nothing to upgrade.') : '';
    const icon = equipIcon(kind);
    if (reason) return { ...this.off('equip', 'Equip', lines.join(' '), reason, name), icon };
    return this.entry('equip', 'Equip', lines.join(' '), () => this.d.send({ kind: 'upgradeEquipment', player: this.d.player, units: list.map((x) => x.id) }), { name, icon });
  }

  /** X: workers fetch a cart from the main base (an ox cart when their ox is hitched), or hand theirs back. */
  private cartEntry(workers: number[]): CardEntry {
    const units = workers.map((id) => this.d.game.unit(id)).filter((u): u is UnitInfo => u !== null);
    const back = units.length > 0 && units.every((u) => u.kit !== 0);
    const desc = back
      ? 'Take the carts back to the main base and hand them in to the stock.'
      : `Walk to the main base and take a cart from the stock: a hand cart carries ${HAND_CART_TENTHS_LB / 10} lb (ten times a load on foot), an ox cart (for a worker with an ox hitched) far more. A cart fills up at the next node of the same kind before the trip home. Make carts at a Workshop.`;
    const name = back ? 'Hand the cart back' : 'Fetch a cart';
    const base = this.d.game.mainBases().some((b) => b.complete);
    if (!base) return this.off('cart', 'Cart', desc, 'There is no main base.', name);
    if (!back && this.d.game.have(Res.HandCart) + this.d.game.have(Res.OxCart) === 0) return this.off('cart', 'Cart', desc, 'There are no carts in the stock (make one at a Workshop).', name);
    const ids = units.filter((u) => (back ? u.kit !== 0 : u.kit === 0)).map((u) => u.id);
    return this.entry('cart', back ? 'Cart back' : 'Cart', desc, () => this.d.send({ kind: 'cart', player: this.d.player, units: ids, back: back ? 1 : 0 }), { name });
  }

  /**
   * A siege engine's or cannon's card (Table 2f): attack and move; Hitch a
   * horse or ox to haul it, or let it go. A Citadel's fixed engine only
   * shoots (Patch 5, CT-3; the cannon ports and their Port button are gone).
   * [Before Patch 2 also Stop and Hold.]
   */
  private engineCard(): Slots {
    const t = this.targeting?.command;
    const ids = this.unitIds((u) => u.typeKey.startsWith('engine:'));
    const u = ids.length > 0 ? this.d.game.unit(ids[0]!) : null;
    const hauled = u !== null && u.partner !== 0;
    if (u !== null && engineSpec(u.mob).mobile >= 0) {
      return [this.entry('attack', 'Attack', 'Then left click a unit in its reach to shoot at it (one of your own too, on this order). It stands on the Citadel\'s engine platform for good, and fires only while its crew stand by it.', () => this.target('attack', 'attack'), { lit: t === 'attack' })];
    }
    return [
      this.entry('attack', 'Attack', 'Then left click a unit to shoot at it (it closes in while hauled or pushed; one of your own too, on this order), or ground to move and shoot whatever comes in range. It fires only while its crew stand by it.', () => this.target('attack', 'attack'), { lit: t === 'attack' }),
      this.entry('move', 'Move', 'Then left click ground. It moves only while a horse or ox is hitched to it, or while enough of its crew push it, and its wheels take gentle slopes, not steps.', () => this.target('move', 'move'), { lit: t === 'move' }),
      hauled
        ? this.entry('hitch', 'Let go', 'Unhitch the horse or ox hauling it.', () => this.d.send({ kind: 'hitch', player: this.d.player, units: ids.slice(0, 1), target: 0, queued: false }), { name: 'Let the animal go' })
        : this.entry('hitch', 'Hitch', 'Then left click one of your horses or oxen: it walks over and hauls the engine wherever it is sent (a horse is faster; an ox is slower but steadier). Right clicking the animal does the same.', () => this.target('hitch', 'hitch'), { lit: t === 'hitch', name: 'Hitch an animal' }),
    ];
  }

  /** Retrain as a worker (Patch 3, Jade): the crewmen walk to the main base, sit with the bar over their heads and get up workers. */
  private retrainEntry(): CardEntry {
    const name = 'Retrain as a worker';
    const desc = `They walk to the main base, sit tinkering for ${Math.round(CREWMAN_RETRAIN_STEPS / 20)} s and get up workers: Labourers with a wooden tool kit, as from the main base. No cost. A new order before the bar is full cancels it.`;
    if (!this.d.game.mainBases().some((b) => b.complete)) return this.off('retrain', 'Retrain', desc, 'Needs a main base.', name);
    return this.entry('retrain', 'Retrain', desc, () => this.d.send({ kind: 'retrain', player: this.d.player, units: this.unitIds((u) => u.typeKey === 'warrior:crew'), queued: this.d.queued() }), { name });
  }

  /**
   * The build menu (Jade's Patch 2: one Build button, fourteen buildings): a
   * button per building, with Defences and Lights opening their submenus. A
   * submenu longer than the card (Defences' 17 choices) shows pages. Each
   * button is on a letter of its own, as everywhere on the card (Jade's
   * Patch 4; before, the key in its place on the keyboard's grid, Q to V,
   * with B Back); Esc is Back.
   */
  private buildMenuCard(waiting: boolean): Slots {
    const slots = menuSlots();
    const sub = this.menu.sub >= 0 ? (slots[this.menu.sub] ?? []) : null;
    const list: CardEntry[] = [];
    if (sub) submenuChoices(sub).forEach((c) => list.push(this.buildEntry(c.spec, c.variant, c.name)));
    else {
      slots.forEach((specs, i) => {
        const group = specs[0]?.group;
        if (specs.length === 1 && !group) list.push(this.buildEntry(specs[0]!, 0, specs[0]!.name));
        else if (specs.length > 0) {
          const name = group ?? specs.map((s) => s.name).join(', ');
          const any = specs.some((s) => this.d.game.info?.buildWhy[s.kind] === '');
          const icon = group === 'Defences' ? BuildingKind.Tower : specs[0]!.kind;
          const action = submenuAction(name);
          list.push({
            action,
            face: name,
            name,
            key: this.key(action),
            menu: true,
            description: group === 'Defences' ? 'Walls, gates and towers of wood, hardwood and stone.' : `${specs.map((s) => s.name).join(', ')}.`,
            icon: { layers: [{ file: buildingIconFile(icon, 1) }] },
            enabled: any,
            reason: any ? '' : (this.d.game.info?.buildWhy[specs[0]!.kind] ?? ''),
            run: () => {
              this.menu = { page: 'build', sub: i, more: 0 };
              this.d.changed();
            },
            grey: () => this.greyed(Greyed.Building, specs[0]!.kind),
          });
        }
      });
    }
    // A ghost or target waiting has its Cancel last instead of Back.
    return this.paged(list, waiting ? [] : [this.backEntry(sub ? 'Back to the build menu.' : 'Back to the worker commands.')]);
  }

  /**
   * A menu longer than the card can show (CardSize.most) in pages: as many as
   * fit with More and the last button (Back, or Cancel while a ghost or a
   * target waits), More (+) turning to the next page.
   */
  private paged(list: CardEntry[], after: CardEntry[]): Slots {
    const most = Math.max(3, this.size().most);
    if (list.length + 1 <= most) return [...list, ...after];
    const per = most - 2;
    const pages = Math.ceil(list.length / per);
    const at = this.menu.more % pages;
    const more: CardEntry = {
      action: MORE_ACTION,
      face: `More ${at + 1}/${pages}`,
      name: 'Next page',
      key: this.key(MORE_ACTION),
      menu: true,
      description: `Page ${at + 1} of ${pages}. Show the next page.`,
      enabled: true,
      reason: '',
      run: () => {
        this.menu = { ...this.menu, more: (at + 1) % pages };
        this.d.changed();
      },
    };
    // More's key turns the page, so a button rebound onto it is a click on this page.
    const page = list.slice(at * per, (at + 1) * per).map((e) => (e.key === more.key ? { ...e, key: '' } : e));
    return [...page, more, ...after];
  }

  /**
   * A building of the build menu. Greyed out while its prerequisite is
   * missing, and (Jade's Patch 3) while the stock cannot pay for it, so it
   * cannot be picked up to place; a click on it then asks those who can
   * sort it out. [Before Patch 3 a building the stock could not pay for
   * showed in red and could still be placed as a plan.]
   */
  private buildEntry(spec: BuildingSpec, variant: number, name: string): CardEntry {
    const l = spec.levels[0]!;
    const cost = this.buildCost(spec.kind);
    const why = this.d.game.info?.buildWhy[spec.kind] ?? spec.comesWith;
    const short = this.d.game.costProblem(cost);
    const lines = [spec.purpose, `Cost: ${costLine(cost)}. Build time: ${seconds(l.ws)} of one worker's work.`];
    if (l.gives) lines.push(`Gives: ${l.gives}.`);
    if (l.supply) lines.push(`Supply +${l.supply}.`);
    if (spec.light) lines.push(`Light ${spec.light.lightM} m${spec.light.claimM ? `, claims ${spec.light.claimM} m while lit` : ''}.`);
    if (Commands.chained(spec.kind)) lines.push(WALL_CHAIN_HELP);
    else if (spec.w === 1 && spec.d === 1) lines.push('Drag to place a line of them, 8 m apart.');
    if (!Commands.chained(spec.kind)) lines.push('Shift + click to place several.');
    const reason = [why, short].filter((x) => x).join(' ');
    const action = placeAction(spec.kind, variant);
    return {
      action,
      face: name,
      name,
      key: this.key(action),
      menu: true,
      description: lines.join(' '),
      icon: buildIcon(spec),
      enabled: reason === '',
      reason,
      run: () => this.startPlacing(spec.kind, variant),
      grey: () => this.greyed(Greyed.Building, spec.kind),
    };
  }

  /** What a new building of a kind costs: its level 1 cost, times one more than the Scholar's Lodges standing for another Lodge (Research: rising facility cost). */
  private buildCost(kind: number): Cost {
    const cost = levelSpec(kind, 1).cost;
    if (kind !== BuildingKind.ScholarsLodge) return cost;
    const m = [...this.d.game.buildings.values()].filter((b) => b.owner === this.d.player && b.kind === kind).length + 1;
    return cost.map(([r, n]) => [r, n * m] as const);
  }

  /** A greyed-out button clicked (Jade's Patch 3): the sim has the units and buildings that can sort out why ask, in bubbles. */
  private greyed(what: number, id: number, building = 0): void {
    this.d.send({ kind: 'greyed', player: this.d.player, what, id, building, units: this.unitIds() });
  }

  /** A building's card: its training, making and research, Rally, Upgrade, Unload and Cancel, in their places before Patch 2 with the gaps closed. */
  private buildingCard(kind: number, waiting: boolean): Slots {
    const card: Slots = Array.from({ length: 15 }, () => null);
    const all = this.buildings().filter((b) => b.kind === kind);
    if (all.length === 0) return card;
    const spec = buildingSpec(kind);
    const first = all[0]!;
    // Production: workers at the main base and the Farm, troops at the Barracks and (tier 1) the main base, mages at the Sanctum.
    const rows: Array<[number, string, string, number]> = [];
    const main = kind === BuildingKind.MainBase;
    if (first.complete) {
      if (spec.trainsWorkers) rows.push([Product.Worker, 'trainWorker', 'Worker', 0]);
      // Mages at a Magi Sanctum, and at a main base of tier 3 and up (Magic), after the main base's troops.
      if (first.products.some(([p]) => p === Product.SupportMage)) {
        const at = main ? 4 : 0;
        rows.push([Product.SupportMage, 'trainSupportMage', 'Support', at], [Product.BattleMage, 'trainBattleMage', 'Battle', at + 1]);
      }
      // Patch 2: the Artillery workshop trains the artillery crewman, first on its card; its engines follow it (Patch 5, flatMake).
      if (first.products.some(([p]) => p === Product.Crewman)) rows.push([Product.Crewman, 'trainCrewman', 'Crewman', 0]);
    }
    for (const [p, action, face, slot] of rows) card[slot] = this.productEntry(all, p, action, face);
    if (first.complete) {
      for (const t of first.troops) {
        const [action, face, slot] = TROOP_ACTIONS[t.troop]!;
        card[slot + (main ? 1 : 0)] = this.troopEntry(all, t.troop, action, face);
      }
      // The Magi Sanctum's cards (Patch 2): S and M train the wand and robe each card shows.
      for (const m of first.mages ?? []) {
        const support = m.school === School.Support;
        card[support ? 0 : 1] = this.mageEntry(all, mageLock(m.school), support ? 'trainSupportMage' : 'trainBattleMage', support ? 'Support' : 'Battle');
      }
    }
    // A Citadel's fixed engines are in its Build defense menu (Patch 5), not with what it makes.
    const made = first.complete ? first.products.filter(([p]) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT && !PLATFORM.has(p)) : [];
    // A main base's mages sit on 4 and 5, so its K button moves along.
    const makeSlot = main ? 7 : 5;
    if (flatMake(kind) && made.length > 0) {
      // Jade's decisions 2.17: a short list is on the card itself, a button each after what the building trains, with no menu.
      let slot = 0;
      for (const [p, why] of made) {
        while (card[slot] !== null && slot < 8) slot++;
        card[slot] = this.productEntry(all, p, makeAction(kind, p), shortFace(productSpec(p).name), why);
      }
    } else if (made.length === 1 && productSpec(made[0]![0]).recipe !== undefined) {
      // Patch 5: a building that makes one good has it on its own card (the main base's Make rope, the Storehouse's Make sticks), not in a menu.
      const [p, why] = made[0]!;
      const name = `Make ${shortFace(productSpec(p).name).toLowerCase()}`;
      card[makeSlot] = { ...this.productEntry(all, p, 'craft', name, why), name };
    } else if (made.length > 0) {
      const what = MAKE_WORDS[kind] ?? ['Make', 'Open the production menu. Each item\'s key is on its button; Esc goes back.'];
      card[makeSlot] = this.entry('craft', what[0], what[1], () => this.openMenu('make'), { name: what[0] });
    }
    // The Citadel's engine platform (Patch 5, Jade's CT-3): its fixed engine, their upgrades and garrison crewmen, in their own menu.
    if (first.complete && first.products.some(([p]) => PLATFORM.has(p))) {
      card[8] = this.entry('buildDefense', 'Defense', 'Open the Build defense menu: a fixed engine for the engine platform on the Citadel\'s top, its upgrades, and garrison artillery crewmen for it. Each one\'s key is on its button; Esc goes back.', () => this.openMenu('defense'), { name: 'Build defense' });
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
        icon: buildingUpgradeIcon(kind, first.level + 1),
        enabled: why === '',
        reason: why,
        run: () => {
          for (const b of all) this.d.send({ kind: 'upgrade', player: this.d.player, building: b.id });
        },
        grey: () => this.greyed(Greyed.Upgrade, 0, first.id),
      };
    }
    if (all.some((b) => b.inside.length > 0)) {
      card[12] = this.entry('unload', 'Unload', 'Let everyone inside out. Click a portrait in the panel to let one out.', () => {
        for (const b of all) if (b.inside.length > 0) this.d.send({ kind: 'unload', player: this.d.player, building: b.id, unit: 0 });
      }, { name: 'Unload All' });
    }
    if (!waiting && (!first.complete || first.upgrading)) {
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
    return card;
  }

  /** A training, making or research button, greyed out with the reason it cannot be queued; a K menu's products are menu buttons. */
  private productEntry(all: BuildingInfo[], p: number, action: string, face: string, why?: string, menu = false): CardEntry {
    const ps = productSpec(p);
    const g = this.d.game;
    const info = g.info;
    const costs = [ps.cost.length > 0 ? costLine(ps.cost) : '', ps.food > 0 ? `${ps.food} food` : ''].filter((x) => x).join(', ') || 'free';
    let reason = '';
    if (ps.research !== undefined && g.researched(ps.research)) reason = 'Already researched.';
    else if (ps.research !== undefined && [...g.buildings.values()].some((b) => b.owner === this.d.player && b.queue.some((q) => q.product === p))) reason = 'Being researched.';
    else if (ps.food > 0 && g.food() < ps.food) reason = `Not enough food (needs ${ps.food}).`;
    // An engine pays its resources and its crew's food (Patch 2).
    if (!reason && (ps.food === 0 || ps.engine !== undefined)) reason = g.costProblem(ps.cost);
    const unit = p === Product.Worker || p === Product.SupportMage || p === Product.BattleMage || p === Product.Crewman || p === Product.GarrisonCrewman;
    // A fixed engine's upgrade brings only the crewmen it adds (Patch 5).
    const crew = ps.engine === undefined ? 0 : ps.upgrade !== undefined ? engineUpgradeCrew(ps.upgrade as Engine, ps.engine as Engine) : engineSpec(ps.engine).crew;
    if (!reason && unit && info && info.supplyUsed >= info.supplyCap) reason = `Not enough supply (${info.supplyUsed} of ${info.supplyCap}). Build farms or upgrade the main base.`;
    if (!reason && crew > 0 && info && info.supplyUsed + crew > info.supplyCap) reason = `Not enough supply for its crew of ${crew} (${info.supplyUsed} of ${info.supplyCap}). Build farms or upgrade the main base.`;
    if (why !== undefined) reason = why;
    if (!reason && all.every((b) => b.queue.length >= 5)) reason = 'The queue is full (5).';
    // Patch 2: a crafting building makes goods at its own pace, with no workers.
    const pace = ps.recipe !== undefined && all[0] ? craftRate(all[0].kind) : 1;
    return {
      action,
      face,
      name: ps.name,
      key: this.key(action),
      ...(menu ? { menu } : {}),
      description: `${ps.tooltip} Cost: ${costs}. Time: ${Math.round(ps.steps / pace / 2) / 10} s. Shift: queue 5.`,
      icon: productIcon(p),
      product: p,
      enabled: reason === '',
      reason,
      run: (press) => this.produce(all, p, press.shift ? 5 : 1),
      grey: () => this.greyed(Greyed.Product, p, all[0]!.id),
    };
  }

  /** A troop type's button: trains the kit picked in the panel (or the building's default), greyed out with why it cannot. */
  private troopEntry(all: BuildingInfo[], troop: number, action: string, face: string): CardEntry {
    const first = all[0]!;
    const c = troopChoice(first, troop);
    const why = troopWhy(this.d.game, first, troop, c.w, c.a);
    const others = all.length > 1 ? ' With several selected, each one trains its own pick, as many as you can afford.' : '';
    const any = all.some((b) => {
      const k = troopChoice(b, troop);
      return troopWhy(this.d.game, b, troop, k.w, k.a) === '';
    });
    return {
      action,
      face,
      name: `Train ${troopName(troop, c.w).toLowerCase()}`,
      key: this.key(action),
      description: `${kitName(troop, c.w, c.a)} (weapon tier ${c.w}, armour tier ${c.a}). Cost: ${troopCostText(first, troop, c.w, c.a)}. Pick the kit in the panel.${others} Shift: queue 5.`,
      icon: trainTroopIcon(troop, c.w),
      troop,
      enabled: any,
      reason: any ? '' : why,
      run: (press) => this.trainTroopAt(all, troop, press.shift ? 5 : 1),
      grey: () => this.greyed(Greyed.Product, troopProduct(troop, c.w, c.a), first.id),
    };
  }

  /** A Sanctum school's button: trains the wand and robe its card shows, greyed out with why it cannot. */
  private mageEntry(all: BuildingInfo[], card: number, action: string, face: string): CardEntry {
    const first = all[0]!;
    const c = cardChoice(first, card);
    const why = cardWhy(this.d.game, first, card, c.w, c.a);
    const others = all.length > 1 ? ' With several selected, each one trains its own pick, as many as you can afford.' : '';
    const any = all.some((b) => {
      const k = cardChoice(b, card);
      return cardWhy(this.d.game, b, card, k.w, k.a) === '';
    });
    const p = cardProduct(card, c.w, c.a);
    return {
      action,
      face,
      name: productSpec(p).name,
      key: this.key(action),
      description: `${cardTrainsText(card, c.w, c.a)} Costs ${cardCostText(card, c.w, c.a)} Pick the wand and robe on the card in the panel.${others} Shift: queue 5.`,
      icon: productIcon(p),
      troop: card,
      enabled: any,
      reason: any ? '' : why,
      run: (press) => this.trainCardAt(all, card, press.shift ? 5 : 1),
      grey: () => this.greyed(Greyed.Product, p, first.id),
    };
  }

  /** The panel's picture button: train a troop type at one building. */
  trainTroop(building: number, troop: number, count: number): void {
    this.trainCard([building], troop, count);
  }

  /** A training card's picture: its unit at these buildings, the shortest queue first. */
  trainCard(buildings: readonly number[], card: number, count: number): void {
    const all = buildings.map((id) => this.d.game.buildings.get(id)).filter((b): b is BuildingInfo => b !== undefined);
    this.trainCardAt(all, card, count);
  }

  private trainTroopAt(all: BuildingInfo[], troop: number, count: number): void {
    this.trainCardAt(all, troop, count);
  }

  /**
   * A card's units, each with its building's own choice: every selected
   * building trains `count` (Jade's Patch 5, GP-15), the shortest queue first
   * each round, so when the stock runs short the buildings that start one are
   * the least busy. The sim takes what the stock pays for and refuses the rest.
   */
  private trainCardAt(all: BuildingInfo[], card: number, count: number): void {
    const ready = all.filter((b) => {
      if (!b.complete) return false;
      const c = cardChoice(b, card);
      return cardOffered(b, card, c.w, c.a);
    });
    this.eachTrains(ready, (b) => {
      const c = cardChoice(b, card);
      return cardProduct(card, c.w, c.a);
    }, count);
  }

  /** `count` rounds of one unit at each building, the shortest queue first in each round (GP-15). */
  private eachTrains(ready: BuildingInfo[], productAt: (b: BuildingInfo) => number, count: number): void {
    for (let k = 0; k < count; k++) {
      for (const b of [...ready].sort((a, c) => a.queue.length - c.queue.length || a.id - c.id)) {
        if (b.queue.length >= 5) continue;
        const product = productAt(b);
        this.d.send({ kind: 'produce', player: this.d.player, building: b.id, product, count: 1 });
        b.queue.push({ product, done: 0, stepsLeft: 0 });
      }
    }
    this.d.changed();
  }

  /**
   * K (smelt, research, make, slaughter): a button per product the
   * building makes, greyed out with the sim's reason, each on a letter from
   * its name (Jade's Patch 4; before, the first 13 on the grid keys Q to C).
   * The card grows upward as far as the screen allows, and past that More
   * (+) shows the next page. Back (Esc) returns, except where the building's
   * card had nothing but K, so it opens here (Patch 3).
   */
  private makeCard(kind: number, waiting: boolean, back = true): Slots {
    const all = this.buildings().filter((b) => b.kind === kind && b.complete);
    const first = all[0];
    const list: CardEntry[] = [];
    if (first) {
      first.products
        .filter(([p]) => p >= RESEARCH_PRODUCT && p < TROOP_PRODUCT)
        .forEach(([p, why]) => list.push(this.productEntry(all, p, makeAction(kind, p), shortFace(productSpec(p).name), why, true)));
    }
    return this.paged(list, waiting || !back ? [] : [this.backEntry('Back to the building commands.')]);
  }

  /**
   * The Citadel's Build defense menu (Patch 5, Jade's CT-3): a button per
   * fixed engine, which builds it while the platform is empty and upgrades
   * the one up there to it when it is higher on the ladder (s), each greyed
   * out with the sim's reason; then Train garrison artillery crewman, greyed
   * unless the engine up there is short of crew. Back (Esc) returns.
   */
  private defenseCard(kind: number, waiting: boolean): Slots {
    const all = this.buildings().filter((b) => b.kind === kind && b.complete && b.products.some(([p]) => PLATFORM.has(p)));
    const first = all[0];
    const list: CardEntry[] = [];
    if (first) {
      const why = (p: number): string => first.products.find(([q]) => q === p)?.[1] ?? 'Only a Citadel has an engine platform.';
      const on = first.fixedEngine ? (this.d.game.unit(first.fixedEngine)?.mob ?? -1) : -1;
      for (const id of FIXED_ENGINES) {
        const name = engineSpec(id).name;
        const p = on >= 0 && upgradeClimbs(on as Engine, id) ? ENGINE_PRODUCT + engineUpgrade(on as Engine, id) : ENGINE_PRODUCT + id;
        list.push({ ...this.productEntry(all, p, defenseAction(id), shortFace(name), why(p), true), name: productSpec(p).name });
      }
      list.push(this.productEntry(all, Product.GarrisonCrewman, defenseAction(-1), 'Garrison', why(Product.GarrisonCrewman), true));
    }
    return this.paged(list, waiting ? [] : [this.backEntry('Back to the building commands.')]);
  }

  private backEntry(description: string): CardEntry {
    return { action: 'back', face: 'Back', name: 'Back', key: 'Escape', menu: true, description, enabled: true, reason: '', run: () => this.back() };
  }

  /** Dig: + and - set the depth or height, Tunnel (D again) clicks out a tunnel chain, Mark confirms, Esc cancels. */
  private areaCard(): Slots {
    const card: Slots = Array.from({ length: 5 }, () => null);
    const a = this.area!;
    const plan = this.areaPlan();
    const chain = a.tunnel || a.chain !== null;
    const tunnel = chain || plan?.tunnel === true;
    const what = tunnel ? 'tunnel height' : 'depth';
    const m = ((tunnel ? a.tunnelUnits : a.units) * TERRAIN_UNIT_M).toFixed(2);
    card[0] = this.entry('deeper', tunnel ? 'Higher' : 'Deeper', `The ${what} is ${m} m. Press for about 34 cm more. The wheel does the same while marking.`, () => this.adjustArea(1), { name: `More ${what}` });
    card[1] = this.entry('shallower', tunnel ? 'Lower' : 'Shallower', `The ${what} is ${m} m. Press for about 34 cm less.`, () => this.adjustArea(-1), { name: `Less ${what}` });
    card[2] = this.entry('tunnel', 'Tunnel', TUNNEL_CHAIN_HELP, () => this.toggleTunnel(), { key: this.key('dig'), lit: chain, name: 'Dig a tunnel' });
    if (chain) return card;
    const ready = plan !== null && !a.dragging;
    const name = tunnel ? 'Dig the tunnel' : 'Dig it out';
    card[4] = {
      action: 'markArea',
      face: 'Mark',
      name,
      key: '',
      description: 'Mark the area for the selected workers. Left clicking the ground does the same.',
      enabled: ready,
      reason: ready ? '' : 'Drag over the ground first.',
      run: () => this.confirmArea(),
    };
    return card;
  }

  // ---- Orders ----

  private unitOrder(o: { kind: 'returnCargo' } | { kind: 'repairAll' }, units = this.workerIds()): void {
    if (units.length === 0) return;
    this.d.send({ ...o, player: this.d.player, units, queued: this.d.queued() } as Order);
  }

  private repairAll(): void {
    this.targeting = null;
    this.unitOrder({ kind: 'repairAll' });
    this.d.message('Repairing every damaged building nearby, worst first.');
    this.d.changed();
  }

  /** Repair's right click (Jade's Patch 5, UI-13): autorepair on for the selected workers, or off when all of them have it. */
  private autoRepair(workers: number[]): void {
    if (workers.length === 0) return;
    const on = workers.some((id) => ((this.d.game.unit(id)?.flags ?? 0) & UnitFlag.AutoRepair) === 0);
    this.targeting = null;
    this.d.send({ kind: 'autoRepair', player: this.d.player, units: workers, on: on ? 1 : 0 });
    this.d.message(on ? 'Autorepair on: they fix anything of yours damaged within 8 m of them.' : 'Autorepair off.');
    this.d.changed();
  }

  /** Produce at the building of the group with the shortest queue (Control groups: spread the work). */
  private produce(all: BuildingInfo[], product: number, count: number): void {
    const ready = all.filter((b) => b.complete);
    if (ready.length === 0) return;
    // A unit or an engine: every selected building makes one (Jade's Patch 5, GP-15); goods and research are shared out as before.
    const ps = productSpec(product);
    if (product === Product.Worker || product === Product.SupportMage || product === Product.BattleMage || product === Product.Crewman || ps.engine !== undefined || troopOf(product) !== undefined) {
      this.eachTrains(ready, () => product, count);
      return;
    }
    for (let k = 0; k < count; k++) {
      ready.sort((a, b) => a.queue.length - b.queue.length || a.id - b.id);
      const b = ready[0]!;
      this.d.send({ kind: 'produce', player: this.d.player, building: b.id, product, count: 1 });
      b.queue.push({ product, done: 0, stepsLeft: 0 });
    }
  }

  private target(command: TargetCommand, action: string): void {
    this.targeting = { command, key: this.key(action) };
    this.d.changed();
  }

  private openMenu(page: CardPage): void {
    this.menu = { page, sub: -1, more: 0 };
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
      case 'repair':
        ok = this.ownBuilding(item) ? this.work(item!) : item && this.ownEngine(item) ? this.mend(item) : false;
        if (!ok) this.d.message('Pick one of your buildings, siege engines or cannons to build or repair.', 'alert');
        break;
      case 'hitch':
        ok = item ? this.hitchTo(item) : false;
        if (!ok) this.d.message('Pick one of your tamed horses or oxen.', 'alert');
        break;
      case 'crew':
        ok = item !== null && this.ownEngine(item) && this.crew(item);
        if (!ok) this.d.message('Pick one of your catapults, ballistas or cannons.', 'alert');
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
        } else ok = item && this.attackable(item) ? this.attack(item) : ground ? this.attackMove(ground) : false;
        break;
      }
      case 'patrol':
        ok = ground ? this.patrol(ground) : false;
        break;
      case 'prospect':
        ok = ground ? this.prospect(ground) : false;
        break;
      case 'gather':
        ok = item?.kind === 'node' && item.resource ? this.gather(item) : false;
        if (!ok) this.d.message('Pick a tree, rock or bush to gather from.', 'alert');
        break;
      case 'hunt':
        ok = item !== null && this.wildAnimal(item) && this.hunt(item, true);
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
    // Jade's Patch 2: a spell used directly on a unit always casts, except that buffs and heals never land on an enemy.
    const target = item && item.kind === 'unit' && item.typeKey !== 'wanderer' && !this.ruin(item) ? entityIdOf(item.key) : null;
    if (s.target === 'ally') {
      if (target !== null && !this.enemy(item!)) return send(target, item!.centre);
      this.d.message(target !== null ? `${s.name} cannot be cast on an enemy.` : `Pick a unit that is not an enemy for ${s.name}.`, 'alert');
      return false;
    }
    if (s.target === 'counter') {
      if (target !== null && this.enemy(item!)) return send(target, item!.centre);
      this.d.message('Pick an enemy that is casting a spell.', 'alert');
      return false;
    }
    // An attack spell on one of the peoples at peace asks first, as Attack does.
    const f = target !== null ? this.peopleAtPeace(item!) : null;
    if (f !== null) {
      this.d.confirmWar(f, () => send(target!, item!.centre));
      return true;
    }
    if (target !== null) return send(target, item!.centre);
    this.d.message(`Pick a unit for ${s.name}.`, 'alert');
    return false;
  }

  /**
   * What Attack used directly on a unit attacks (Jade's Patch 2): any unit,
   * prey, the player's own and allied units as much as monsters and the
   * peoples at war, and what the peoples left (workers break it down).
   * Wanderers are nobody's to fight, so a click on one attack-moves there.
   */
  private attackable(item: Selectable): boolean {
    return item.kind === 'unit' && item.typeKey !== 'wanderer' && entityIdOf(item.key) !== null;
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

  /**
   * Right click on the peoples at peace: any of their buildings (Patch 5,
   * GP-46: "you can click to trade on any of their buildings"), their leader
   * or a caravan opens trade; a mercenary camp the hire box. Selected units
   * with none in reach walk up to the building (s).
   */
  private talkTo(item: Selectable): boolean {
    const f = this.factionOf(item);
    if (!f || f.war || item.owner !== PEOPLES) return false;
    const id = entityIdOf(item.key);
    const trader = item.typeKey.startsWith('peoples:') || id === f.leader;
    if (!trader && f.kind !== FactionKind.ElfCaravan && f.kind !== FactionKind.MercCamp) return false;
    this.d.openPeople(f.id);
    const why = f.kind === FactionKind.MercCamp ? (f.hire?.why ?? '') : f.tradeWhy;
    if (why === OUT_OF_REACH && this.unitIds().length > 0) this.moveTo(item.centre);
    return true;
  }

  /** A wild animal on screen. */
  private wildAnimal(item: Selectable): boolean {
    return item.kind === 'unit' && item.typeKey.startsWith('animal:wild:');
  }

  /** One animal; picked with Hunt's left click (Jade's Patch 5, CT-1), the hunt goes on after it. */
  private hunt(item: Selectable, goOn = false): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds();
    if (target === null || units.length === 0) return false;
    this.d.send({ kind: 'hunt', player: this.d.player, units, target, auto: goOn ? 1 : 0, queued: this.d.queued() });
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

  /** Artillery crewmen in the selection crew an engine: they stand by it to fire it, and push it if nothing hauls it (Patch 2: only they do). */
  private crew(item: Selectable): boolean {
    const target = entityIdOf(item.key);
    const units = this.unitIds((u) => u.typeKey === 'warrior:crew');
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

  /** Whether a selectable is a finished tower, whose top men go up on. */
  private isTower(item: Selectable): boolean {
    const b = this.buildingOf(item);
    return b !== undefined && b.complete && buildingSpec(b.kind).defence === 'tower';
  }

  /** A finished tower, or a main base from tier 2: men go up on its top. */
  private hasTop(item: Selectable): boolean {
    const b = this.buildingOf(item);
    return b !== undefined && b.complete && garrisonRoom(b) > 0;
  }

  private enter(item: Selectable): boolean {
    const b = this.buildingOf(item);
    const units = this.unitIds();
    if (!b || units.length === 0) return false;
    const room = b.complete ? levelSpec(b.kind, b.level).shelters + garrisonRoom(b) : 0;
    if (room === 0) {
      this.d.message(`${b.name} cannot take anyone in. Men go up on towers and on a main base from tier 2; workers shelter in main bases and farms.`, 'alert');
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
   * their load at drop-offs, take up a farm or the mill, relight lights put out;
   * everyone follows friendly units and walks to ground. With only buildings
   * selected, it sets their rally point.
   */
  smart(item: Selectable | null, ground: THREE.Vector3 | null): void {
    const units = this.unitIds();
    if (units.length === 0) {
      if (this.buildings().length > 0) this.rally(item, ground);
      // Their trade menu opens with nothing selected too (it says what is needed).
      else if (item) this.talkTo(item);
      return;
    }
    const workers = this.workerIds();
    const queued = this.d.queued();
    const player = this.d.player;
    // Loot on the ground: the nearest of them with room walk over and pick it up.
    const loot = item ? lootIdOf(item.key) : null;
    if (loot !== null) {
      this.d.send({ kind: 'pickUp', player, units, target: loot, queued });
      this.d.marker(item!.centre, 'target');
      return;
    }
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
        // Patch 2: nobody hauls from a mineshaft; its miners carry their own bags out, so workers right clicking it go to mine.
        if (levelSpec(b.kind, b.level).workers > 0) return send({ kind: 'assign', player, units: workers, building: b.id, queued });
        if (spec.light && !b.lit) return send({ kind: 'relight', player, units: workers, building: b.id, queued });
      }
    }
    // One of the player's towers: everyone on foot goes up on its top (Jade's patch notes 1). With Enter cut in Patch 2, a main
    // base with a top takes men up too; workers alone still walk to it, as their main base is where they work.
    const engines = this.unitIds((u) => u.typeKey.startsWith('engine:'));
    const men = units.length > workers.length + engines.length;
    if (item && engines.length < units.length && this.ownBuilding(item) && (this.isTower(item) || (men && this.hasTop(item))) && this.enter(item)) return;
    // Engines and cannons: an own horse or ox hitches (Patch 5: no engine goes into a building).
    if (item && engines.length > 0 && engines.length === units.length && item.typeKey.startsWith('animal:own:') && this.hitchTo(item)) return;
    if (item && this.ownEngine(item)) {
      // Artillery crewmen crew one of the player's engines (anyone else follows it); workers repair a damaged one.
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

  /** Right click on a marked dig or tunnel: the workers help with it. */
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
    this.d.send({ kind: 'dig', ...box, tunnel: site.kind === SiteKind.Tunnel ? 1 : 0 });
    this.d.marker(at, 'target');
    return true;
  }

  // ---- Dig ----

  startArea(): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
    if (this.placing) this.placing = null;
    this.menu = { page: 'main', sub: -1, more: 0 };
    this.area = { from: null, to: null, dragging: false, units: AREA_DEFAULT_UNITS, tunnelUnits: TUNNEL_HEIGHT_UNITS, tunnel: false, chain: null, stretches: 0, cursor: null };
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
    if (a.chain || a.tunnel) {
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
    if (this.faceAt(ground, c.x, c.z)) {
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
    if (!plan || units.length === 0) return;
    // A click on the chain's last point finishes it.
    if (plan.length === 0) {
      this.back();
      return;
    }
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
    const sig = `${a.from.x},${a.from.z},${a.to.x},${a.to.z},${a.units},${a.tunnelUnits}`;
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
    const tunnel = top - start >= TUNNEL_FACE_UNITS;
    const plan: AreaPlan = { x0, z0, x1, z1, tunnel, level: tunnel ? start : start - a.units, level2: tunnel ? start + a.tunnelUnits : 0, start, top, low };
    this.plan = { sig, plan };
    return plan;
  }

  /** Sends the dig order for the marked area. */
  confirmArea(): void {
    const a = this.area;
    const plan = this.areaPlan();
    const units = this.workerIds();
    if (!a || !plan || units.length === 0) return;
    const box = { player: this.d.player, units, x0: plan.x0, z0: plan.z0, x1: plan.x1, z1: plan.z1, level: plan.level, level2: plan.level2, queued: this.d.queued() };
    this.d.send({ kind: 'dig', ...box, tunnel: plan.tunnel ? 1 : 0 });
    this.d.message(plan.tunnel ? 'Tunnelling into the face.' : `Digging out ${((plan.start - plan.level) * TERRAIN_UNIT_M).toFixed(1)} m deep.`);
    const cx = ((plan.x0 + plan.x1 + 1) / 2) * COLUMN_M;
    const cz = ((plan.z0 + plan.z1 + 1) / 2) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'target');
    // Shift keeps marking for the next area.
    if (this.d.queued()) this.area = { ...a, from: null, to: null, dragging: false };
    else this.area = null;
    this.d.changed();
  }

  /**
   * The words beside the cursor during a chain: what the next click builds or
   * digs and what it costs, and a hint on how to go on or stop (Controls:
   * wall chains; a click on the chain's last point, right click, Esc or Done
   * ends it, so a double click places one wall).
   */
  chainLabel(): { text: string; hint: string; short: boolean } | null {
    const a = this.area;
    if (a && (a.tunnel || a.chain)) {
      const t = this.tunnelPlan();
      if (!t) return { text: 'Click where the tunnel starts', hint: 'Right click to stop', short: false };
      if (t.length === 0) return a.stretches > 0 ? { text: 'Click here again to finish the tunnel', hint: 'Or click further on to dig on', short: false } : { text: 'Click where the tunnel goes', hint: 'Right click to stop', short: false };
      return { text: `${(t.length * COLUMN_M).toFixed(1)} m of tunnel, ${(a.tunnelUnits * TERRAIN_UNIT_M).toFixed(2)} m tall`, hint: 'Click to dig to here, right click to finish', short: false };
    }
    const p = this.placing;
    const plan = this.wallPlan();
    if (!p || !plan || !Commands.chained(p.kind)) return null;
    if (p.chain && plan.length === 0) {
      if (p.stretches > 0) return { text: 'Click here again to finish the wall', hint: 'Or click further on to build on', short: false };
      return { text: p.placed ? 'Click again for just this one' : 'Click again to stop here', hint: 'Or click further on to build a stretch', short: false };
    }
    const est = this.chainEstimate(plan);
    if (est.open === 0 && est.blocked === 0) return p.chain ? { text: 'Walled already', hint: 'Click to go on from its end, right click to finish', short: false } : { text: 'Click to go on from this wall', hint: 'Then click further on to build a stretch', short: false };
    const name = buildingSpec(p.kind).name.toLowerCase();
    const n = Math.min(est.open, est.room);
    const piece = chainPiece(buildingSpec(p.kind)) > 1 ? 'chunk' : 'wall';
    const parts = [est.open === 1 && est.blocked === 0 ? `1 ${name}: ${costLine(est.cost)}` : `${count(est.open, piece)}: ${costLine(est.cost.map(([r, k]) => [r, k * est.open] as const))}`];
    if (est.blocked > 0) parts.push(`${est.blocked} skipped`);
    if (n < est.open) parts.push(n === 0 ? `not enough ${RESOURCES[est.short]!.name.toLowerCase()}` : `enough for ${n}`);
    const hint = p.chain ? 'Click to build to here, right click to finish' : 'Click to place it, then click further on for a stretch';
    return { text: parts.join(', '), hint, short: n < est.open };
  }

  // ---- Placement ----

  startPlacing(kind: number, variant: number): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
    this.area = null;
    this.placing = { kind, variant, x: Number.NaN, z: Number.NaN, dragFrom: null, chain: null, stretches: 0, placed: false, spots: [] };
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

  /** Whether a building kind is placed in chains of stretches, click by click (walls, and the earth rampart's chunks from Patch 5; Building placement: wall chains). */
  static chained(kind: number): boolean {
    return chainPiece(buildingSpec(kind)) > 0;
  }

  /** Each frame while placing: the corner under the cursor and the spots of a drag; asks the sim for tiles when they change. */
  updatePlacing(ground: THREE.Vector3 | null, now: number): Ghost | null {
    const p = this.placing;
    if (!p) return null;
    this.aimPlacing(ground);
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

  /** The footprint corner under a ground point; the shell calls it on each press and release too, so a click lands where it was made even when frames are slow. */
  aimPlacing(ground: THREE.Vector3 | null): void {
    const p = this.placing;
    if (!p || !ground) return;
    const s = footprintDims(p.kind, p.variant);
    p.x = Math.round(ground.x / COLUMN_M - s.w / 2);
    p.z = Math.round(ground.z / COLUMN_M - s.d / 2);
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
      const walled = this.walledColumns();
      return (p.chain ? plan.cells.slice(1) : plan.cells).filter(([x, z]) => !walled.has(`${x},${z}`));
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

  /** The columns with a wall (or an earth rampart) standing or started on them: a stretch passes over them without a word, as the sim does, so a chain can close on its anchor or go on from a wall built before. */
  private walledColumns(): Set<string> {
    const out = new Set<string>();
    for (const b of this.d.game.buildings.values()) {
      const s = buildingSpec(b.kind);
      if (s.defence !== 'wall') continue;
      for (let dz = 0; dz < s.d; dz++) for (let dx = 0; dx < s.w; dx++) out.add(`${b.x + dx},${b.z + dz}`);
    }
    return out;
  }

  /** The wall chain's next stretch: from the anchor towards the cursor, or the one wall under the cursor before the first click. */
  private wallPlan(): StretchPlan | null {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return null;
    if (!p.chain) return { x: p.x, z: p.z, dir: 0, length: 0, cells: [[p.x, p.z]] };
    const snap = snapStretch(p.chain.x, p.chain.z, p.x, p.z, WALL_STRETCH_MAX_COLUMNS);
    // The earth rampart goes a 2 x 2 chunk at a time (Patch 5): its stretch ends on a whole chunk.
    const size = chainPiece(buildingSpec(p.kind));
    const length = snap.length - (snap.length % size);
    return { x: p.chain.x, z: p.chain.z, dir: snap.dir, length, cells: stretchSpots(p.chain.x, p.chain.z, snap.dir, length, size) };
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
    const walled = this.walledColumns();
    let open = 0;
    let blocked = 0;
    const takes = new Set<string>();
    let last: [number, number] | null = null;
    for (const [x, z] of p.chain ? plan.cells.slice(1) : plan.cells) {
      const k = `${x},${z}`;
      if (planned.has(k) || walled.has(k)) continue;
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
    if (!plan) return;
    // A click on the chain's last point finishes it: a double click places one wall.
    if (p.chain && plan.length === 0) {
      this.back();
      return;
    }
    const est = this.chainEstimate(plan);
    if (est.open === 0 && est.blocked === 0) {
      // Walled or planned all along: nothing to send, and the chain goes on from its end.
      const [ex, ez] = stretchEnd(plan.x, plan.z, plan.dir, plan.length);
      if (!p.chain) p.placed = false;
      this.anchorChain(ex, ez);
      return;
    }
    if (est.open === 0) {
      const red = p.spots.find((s) => s.tiles?.some((t) => t !== 0));
      const reason = red?.tiles?.find((t) => t !== 0);
      this.d.message(`Cannot build there: ${BLOCKED_TEXT[reason ?? -1] ?? 'blocked.'}`, 'alert');
      return;
    }
    if (est.room === 0) {
      this.d.message(`Not enough ${RESOURCES[est.short]!.name.toLowerCase()} for another ${buildingSpec(p.kind).name.toLowerCase()} (${costLine(est.cost)} each, counting what is already planned).`, 'alert');
      return;
    }
    this.d.send({ kind: 'wallStretch', player: this.d.player, units, building: p.kind, x: plan.x, z: plan.z, dir: plan.dir, length: plan.length, skip: p.chain ? 1 : 0, queued: p.chain !== null || this.d.queued() });
    if (p.chain) p.stretches++;
    else p.placed = true;
    const [ex, ez] = est.room < est.open && est.last ? est.last : stretchEnd(plan.x, plan.z, plan.dir, plan.length);
    this.anchorChain(ex, ez);
  }

  /** The wall chain's next anchor, marked on the ground. */
  private anchorChain(x: number, z: number): void {
    this.placing!.chain = { x, z };
    const cx = (x + 0.5) * COLUMN_M;
    const cz = (z + 0.5) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'move');
    cue('ui_place');
    this.d.changed();
  }
}

/** The help line of a wall in the build menu. */
const WALL_CHAIN_HELP = 'Click to place one; click it again (or right click) to stop there. Or click further points: each click builds the whole stretch from the last point, straight or diagonal, skipping what is in the way. A click on the last point, right click, Esc or Done ends the chain.';

/** The Tunnel button's help on the dig card. */
const TUNNEL_CHAIN_HELP = 'Dig a tunnel, level: click where it starts (on a cliff or hillside, the floor is the ground in front of it; on flat ground, the ground you click), then click where it goes; each click digs the stretch from the last point, straight or diagonal, 90 cm wide. Keep clicking to turn corners. + and - set its height. A click on the last point, right click, Esc or Done ends it. Press again to dig down instead.';

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

/** A garrison: a tower's slots, or the parapets of a main base from tier 2 (Table 4). */
export function garrisonRoom(b: Pick<BuildingInfo, 'kind' | 'level' | 'complete'>): number {
  if (!b.complete) return 0;
  const spec = buildingSpec(b.kind);
  if (spec.slots) return spec.slots;
  return b.kind === BuildingKind.MainBase && b.level >= PARAPET_TIER ? PARAPET_SLOTS : 0;
}


/** Spell button faces where the name is too long for the button. */
const SPELL_FACES: Record<number, string> = { [Spell.ArcaneBolt]: 'Bolt', [Spell.AreaBlast]: 'Blast', [Spell.Counterspell]: 'Counter' };

/** The K button by building kind: its face and tooltip. */
const MAKE_WORDS: Record<number, [string, string]> = {
  [BuildingKind.ScholarsLodge]: ['Research', 'Open the research menu: every step, greyed out with what it still needs. Research takes the lodge\'s time and stops while the troops starve. Each step\'s key is on its button; Esc goes back.'],
  [BuildingKind.Forge]: ['Smelt', 'Open the forge menu: copper, tin and bronze ingots from the start; wrought iron, charcoal, bricks and glass from main base tier 2; pig iron, iron, steel, carbon steel and gunpowder from tier 3. It works with no workers. Kit is made where a unit trains or upgrades, not here. Each one\'s key is on its button; Esc goes back.'],
  [BuildingKind.Barn]: ['Slaughter', 'Slaughter one of the grown animals of the Barn for its meat and hides. The Barn keeps its breeding pairs longest. Esc goes back.'],
  [BuildingKind.MagiSanctum]: ['Research', 'Open the Magi Sanctum menu: Hexcraft research. Wands and robes are upgraded on the mages themselves. Esc goes back.'],
  [BuildingKind.Workshop]: ['Make', 'Open the workshop menu: planks, leather, rope, bandages and remedies, sticks, carts and trinkets, the better ones with the main base\'s tiers. It works with no workers. Each one\'s key is on its button; More (+) shows the next page; Esc goes back.'],
  [BuildingKind.ArtilleryWorkshop]: ['Engines', 'Open the artillery menu: catapults and ballistas from main base tier 3, bronze and iron cannons at tier 4. It works with no workers. Esc goes back.'],
};

/** What a Citadel makes for its engine platform (Patch 5): its Build defense menu, not its Make. */
const PLATFORM: ReadonlySet<number> = new Set(platformProducts());

/** A short button face from a product name. */
export function shortFace(name: string): string {
  const plain = name.replace(/\s*\(.*\)\s*/, '').trim();
  if (plain.length <= 10) return plain;
  const words = plain.split(' ');
  return words.length > 1 ? `${words[0]!.slice(0, 8)} ${words[words.length - 1]![0]}.` : plain.slice(0, 10);
}

/** A worker's tool kit in words, by tier (Table 2c). */
export function toolKitText(tier: number): string {
  return TOOL_KITS[tier]?.name ?? 'no tools';
}

const BLOCKED_TEXT = ['', 'the ground is too steep.', 'it cannot be built on water.', 'another building is in the way.', 'a tree, rock or bush is in the way.', 'that land is unexplored.'];
