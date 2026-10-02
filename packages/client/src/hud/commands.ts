// Orders and the command card (Controls: Unit orders; Command card and
// hotkeys; Building placement; Queuing orders with Shift; Production queues).
// Works out the 15 buttons for the active subgroup, the targeted commands and
// their clicks, the smart right click, and the placement ghost with Shift
// chains and dragged lines of lights. Orders go out through `issue`; what the
// world looks like comes from GameInfo and the selectables under the cursor.
import * as THREE from 'three';
import {
  ARCHERY,
  BuildingKind,
  BUILDINGS,
  buildingSpec,
  CRAFT_PRODUCT,
  footprintDims,
  Item,
  itemSpec,
  ITEMS,
  levelSpec,
  MONSTERS,
  Product,
  productSpec,
  RANK_TRAINING,
  RECIPE_PRODUCT,
  REFURBISH_PRODUCT,
  RESEARCH,
  RESEARCH_PRODUCT,
  Research,
  RESOURCES,
  SiteKind,
  SITE_MAX_COLUMNS,
  Slot,
  SLOT_NAMES,
  speciesSpec,
  toolItem,
  UnitKind,
  WU_PER_COLUMN,
  WU_PER_METRE,
  WU_PER_TERRAIN_UNIT,
  type BuildingSpec,
  type Cost,
  type ItemSpec,
  type Order,
} from '@blockyrts/sim';
import type { UnitInfo } from '../game/game-info.ts';
import type { GameInfo } from '../game/game-info.ts';
import { GRID_CODES, keyFor } from '../input/bindings.ts';
import type { BuildingInfo } from '../messages.ts';
import { buildingIdOf, entityIdOf, type Selectable } from '../selection/types.ts';
import type { Settings } from '../settings/settings.ts';
import type { Ghost, GhostSpot } from '../world/buildings-view.ts';
import { COLUMN_M } from '../world/mesher.ts';
import type { ButtonPress } from './buttons.ts';

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

type TargetCommand = 'move' | 'gather' | 'repair' | 'enter' | 'rally' | 'attack' | 'patrol' | 'prospect' | 'hunt';

/** Pages of the command card: the main card, the build menus, the K and F pages of a Big House, and the I equipment panel. */
export type CardPage = 'main' | 'basic' | 'advanced' | 'craft' | 'refurbish' | 'equip' | 'make';

/** Dig (D) and earthworks: an area dragged on the ground, then confirmed with a left click (Dig: area, depth, preview, tunnels). */
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
  /** Dig pressed on a cliff face: the face column, the way out of the face (one of x or z is +-1) and the ground in front of it, terrain units. */
  face: { x: number; z: number; nx: number; nz: number; floor: number } | null;
  /** How far a tunnel into a face goes, columns. */
  tunnelColumns: number;
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
/** Tunnel height: 2.25 m by default, at least 2 m of headroom (s). */
export const TUNNEL_UNITS = 20;
const TUNNEL_MIN_UNITS = 18;
const TUNNEL_MAX_UNITS = 36;
/** A press on the side of land at least this much taller than the ground in front of it (a rise nobody can jump, 5 units) marks a tunnel into that face (s). */
export const FACE_MIN_UNITS = 5;
/** How far a new tunnel into a face goes: 6 columns, 2.7 m; + and - change it 2 columns (90 cm) at a time (s). */
export const TUNNEL_COLUMNS = 6;
const TUNNEL_COLUMNS_STEP = 2;
const EARTHWORK_NAMES = ['Earth bank', 'Earth ramp', 'Fill', 'Lumber ramp', 'Stone ramp'];
/** Earthworks variants shaped as a ramp: earth, lumber and stone. */
const rampVariant = (v: number): boolean => v === 1 || v === 3 || v === 4;

/** Units by kind: which slots the I panel shows. */
const WORKER_SLOTS: readonly Slot[] = [Slot.Tool, Slot.Boots, Slot.Torch, Slot.Armour, Slot.Helmet, Slot.Kit];
const WARRIOR_SLOTS: readonly Slot[] = [Slot.Weapon, Slot.Backup, Slot.Ranged, Slot.Shield, Slot.Boots, Slot.Ammo, Slot.Torch, Slot.Armour, Slot.Helmet, Slot.Case];
const LOCK_FACES = ['Auto', 'Melee', 'Ranged'];

export interface Targeting {
  command: TargetCommand;
  /** The hotkey that started it: holding it keeps the command for the next click. */
  key: string;
}

export interface Placing {
  kind: number;
  variant: number;
  /** Corner of the footprint under the cursor, global columns. */
  x: number;
  z: number;
  /** A dragged line of lights: where the drag started, or null. */
  dragFrom: { x: number; z: number } | null;
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
      if (t.kind !== 'unit' || t.owner !== this.d.player || !filter(t)) continue;
      const id = entityIdOf(t.key);
      if (id !== null) out.push(id);
    }
    return out;
  }

  /** Own buildings in the selection, as the sim last described them. */
  buildings(): BuildingInfo[] {
    const out: BuildingInfo[] = [];
    for (const t of this.d.selection()) {
      if (t.kind !== 'building' || t.owner !== this.d.player) continue;
      const id = buildingIdOf(t.key);
      const b = id === null ? undefined : this.d.game.buildings.get(id);
      if (b) out.push(b);
    }
    return out;
  }

  /** Esc: back out of a target, a ghost or a submenu; true if there was one. */
  back(): boolean {
    if (this.area) {
      this.endArea();
      return true;
    }
    if (this.placing) {
      this.endPlacing();
      return true;
    }
    if (this.targeting) {
      this.targeting = null;
      this.d.changed();
      return true;
    }
    if (this.menu.page !== 'main') {
      const menus = this.menu.page === 'basic' || this.menu.page === 'advanced' || this.menu.page === 'equip';
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
    if (active === 'worker' || active === 'warrior') {
      if (this.menu.page === 'equip') return this.equipCard(card);
      if ((this.menu.page === 'basic' || this.menu.page === 'advanced') && active === 'worker') return this.buildMenuCard(card);
      this.unitCard(card, active);
    } else if (active.startsWith('building:')) {
      const kind = Number(active.split(':')[1]);
      if (this.menu.page === 'craft' || this.menu.page === 'refurbish' || this.menu.page === 'make') return this.makeCard(card, kind, this.menu.page);
      this.buildingCard(card, kind);
    }
    return card;
  }

  private cancelEntry(): CardEntry {
    return {
      action: 'cancel',
      face: 'Cancel',
      name: 'Cancel',
      key: 'Escape',
      description: this.placing
        ? 'Put the building away without placing it. Right click does the same.'
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
    card[0] = this.entry('attack', 'Attack', 'Then left click an enemy to attack it, or ground to attack-move there: walk, and fight whatever comes in range on the way. Right click or Esc cancels.', () => this.target('attack', 'attack'), { lit: t === 'attack' });
    card[1] = this.entry('stop', 'Stop', 'Cancel every queued order; units stand still but fight back.', () => this.stop());
    card[2] = this.entry('hold', 'Hold', 'Cancel every order and never move, not even to chase: they fight only what comes in reach.', () => this.hold(), { name: 'Hold Position' });
    card[3] = this.entry('patrol', 'Patrol', 'Then left click ground: they walk back and forth between here and there, fighting whatever they meet.', () => this.target('patrol', 'patrol'), { lit: t === 'patrol' });
    card[4] = this.entry('move', 'Move', 'Then left click ground or the minimap to move there, or a unit to follow it. Right click or Esc cancels. Hold M (or Shift) to give several.', () => this.target('move', 'move'), { lit: t === 'move' });
    if (active === 'worker') {
      const workers = this.workerIds();
      const carrying = workers.some((id) => {
        const u = this.d.game.unit(id);
        return u !== null && u.carryAmt > 0;
      });
      card[5] = this.entry('gather', 'Gather', 'Then left click a tree, rock or bush. Gatherers carry 25 lb loads to the nearest drop-off and come back until it runs out, then try the nearest node of the same kind.', () => this.target('gather', 'gather'), { lit: t === 'gather' });
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
        'Then left drag over the ground to mark an area. + and - (or the wheel) set the depth, about 34 cm a step, down to the 3 m limit; a see-through box shows the cut. Left click confirms. Pressing on the side of a cliff or hillside digs a tunnel into it instead, from the ground in front: drag along the face for its width, and + and - set how far in it goes. Digging gives Earth, stone or what the ground is made of.',
        () => this.startArea('dig', 0),
      );
      card[9] = this.entry(
        'prospect',
        'Prospect',
        'Then left click the ground: a worker walks there and spends 40 s (20 s with a prospecting hammer) finding out what lies under it. The rating, Poor, Fair, Good or Rich, sets what a mineshaft there brings up (x0.5 to x2.5).',
        () => this.target('prospect', 'prospect'),
        { lit: t === 'prospect' },
      );
      card[10] = this.entry('buildBasic', 'Build', 'Open the Basic Structures menu: homes, farms, storage, walls, lights. Grid keys pick a building; B is Back.', () => this.openMenu('basic'), { name: 'Build Basic Structures' });
      card[11] = this.entry('buildAdvanced', 'Adv.', 'Open the Advanced Structures menu: buildings that need rare resources or technology.', () => this.openMenu('advanced'), { name: 'Build Advanced Structures' });
      card[13] = this.equipBestEntry();
      if (!card[14]) card[14] = this.equipmentEntry();
    } else {
      card[5] = this.equipBestEntry();
      card[6] = this.equipmentEntry();
      card[7] = this.lockEntry();
      card[8] = this.archeryEntry();
      card[9] = this.entry(
        'hunt',
        'Hunt',
        'Then left click an animal: the warriors chase it down, and workers in the selection follow and carry the meat home. Press twice (or double click) and they keep hunting the nearest game within 40 m, bringing the meat home each time. Bears and creatures that guard their ground are left alone unless clicked. A hunt ends at dusk.',
        () => this.target('hunt', 'hunt'),
        { lit: t === 'hunt', double: () => this.huntAuto() },
      );
      card[10] = this.eatEntry();
    }
    card[12] = this.entry(
      'enter',
      'Enter',
      'Then left click a building to go inside. Workers shelter in main bases and farms and take 10% of the damage the building takes. Ranged warriors garrison towers (4) and the parapets of a level 3 main base (8) and shoot from the top.',
      () => this.target('enter', 'enter'),
      { lit: t === 'enter' },
    );
  }

  private eatEntry(): CardEntry {
    const units = this.unitIds((u) => u.typeKey === 'worker' || u.typeKey === 'warrior');
    const desc = `Walk to the nearest main base, storehouse or kitchen and eat: 2 food heals half their health over 10 s, and a remedy or a bandage from the stock heals what is left.`;
    const where = [...this.d.game.buildings.values()].some((b) => b.owner === this.d.player && b.complete && (b.kind === BuildingKind.MainBase || b.kind === BuildingKind.Storehouse || b.kind === BuildingKind.Cooking));
    if (!where) return this.off('eat', 'Eat', desc, 'There is no main base, storehouse or kitchen to eat at.');
    if (this.d.game.food() < 1) return this.off('eat', 'Eat', desc, 'There is no food.');
    return this.entry('eat', 'Eat', desc, () => this.d.send({ kind: 'eat', player: this.d.player, units, building: 0, queued: this.d.queued() }));
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

  private equipBestEntry(): CardEntry {
    const units = this.unitIds((u) => u.typeKey === 'worker' || u.typeKey === 'warrior');
    const desc =
      'Every selected unit gets the best equipment in the stock that it can use, the highest ranks first, and walks to the nearest main base to collect it. Hand-picked items are left alone.';
    const base = this.d.game.mainBases().some((b) => b.complete);
    if (!base) return this.off('equipBest', 'Equip', desc, 'There is no main base to collect equipment at.', 'Equip Best');
    return this.entry('equipBest', 'Equip', desc, () => {
      if (units.length === 0) return;
      this.d.send({ kind: 'equipBest', player: this.d.player, units });
    }, { name: 'Equip Best' });
  }

  private equipmentEntry(): CardEntry {
    const units = this.unitIds((u) => u.typeKey === 'worker' || u.typeKey === 'warrior');
    const desc = 'With one unit selected: what it wears and holds, and the items in the stock that fit each slot. Pick one and the unit walks to the main base to collect it.';
    if (units.length !== 1) return this.off('equipment', 'Gear', desc, 'Select a single unit.', 'Equipment');
    return this.entry('equipment', 'Gear', desc, () => {
      this.menu = { page: 'equip', sub: -1 };
      this.d.changed();
    }, { name: 'Equipment' });
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

  private archeryEntry(): CardEntry {
    const name = 'Train in archery';
    const desc = `Send them to a Barracks to learn the bow, one at a time: ${ARCHERY.food} food and ${ARCHERY.steps / 20} s each. Slings and javelins need no training.`;
    const untrained = this.unitIds((u) => u.typeKey === 'warrior').filter((id) => ((this.d.game.unit(id)?.skills ?? 0) & 1) === 0);
    if (untrained.length === 0) return this.off('archery', 'Archery', desc, 'They are already trained in archery.', name);
    if (!this.d.game.researched(Research.FlintTools)) return this.off('archery', 'Archery', desc, "Needs Flint tools researched first (Scholar's Lodge).", name);
    const barracks = [...this.d.game.buildings.values()].find((b) => b.owner === this.d.player && b.kind === BuildingKind.Barracks && b.complete);
    if (!barracks) return this.off('archery', 'Archery', desc, 'Needs a Barracks.', name);
    if (this.d.game.food() < ARCHERY.food) return this.off('archery', 'Archery', desc, `Not enough food (needs ${ARCHERY.food}).`, name);
    return this.entry('archery', 'Archery', desc, () => this.d.send({ kind: 'trainSkill', player: this.d.player, units: untrained, building: barracks.id, skill: 1, queued: this.d.queued() }), { name });
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
    else if (spec.w === 1 && spec.d === 1) lines.push(spec.light ? 'Drag to place a line of them, 8 m apart.' : 'Drag to place a line, a column at a time.');
    if (!spec.site) lines.push('Shift + click to place several.');
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
    // Production: workers and warriors at the Big House, workers at farms, planks at the mill, warriors at the Barracks, research at the lodge.
    const rows: Array<[number, string, string, number]> = [];
    if (first.complete) {
      if (spec.trainsWorkers) rows.push([Product.Worker, 'trainWorker', 'Worker', 0]);
      if (kind === BuildingKind.MainBase || kind === BuildingKind.Barracks) rows.push([Product.Warrior, 'trainWarrior', 'Warrior', 1]);
      if (kind === BuildingKind.LumberMill) rows.push([Product.PlanksSoftwood, 'planksSoft', 'Planks S', 0], [Product.PlanksHardwood, 'planksHard', 'Planks H', 1]);
    }
    for (const [p, action, face, slot] of rows) card[slot] = this.productEntry(all, p, action, face);
    if (first.complete && kind === BuildingKind.MainBase) {
      card[5] = this.entry('craft', 'Craft', 'Open the crafting menu: tools, weapons, shields, boots, arrows, torches, fishing gear and carts for the equipment stock. Grid keys pick an item; V shows the next page; B is Back.', () => this.openMenu('craft'), { name: 'Craft' });
      card[6] = this.entry('refurbish', 'Refurb.', 'Take items out of the stock and get back everything they were made from, ten times faster than making them.', () => this.openMenu('refurbish'), { name: 'Refurbish' });
    } else if (first.complete && first.products.some(([p]) => p >= RESEARCH_PRODUCT && (p < REFURBISH_PRODUCT || p >= RECIPE_PRODUCT))) {
      const what = MAKE_WORDS[kind] ?? ['Make', 'Open the production menu. Grid keys pick one; V shows the next page; B is Back.'];
      card[5] = this.entry('craft', what[0], what[1], () => this.openMenu('make'), { name: what[0] });
      if (first.products.some(([p]) => p >= REFURBISH_PRODUCT && p < RECIPE_PRODUCT)) {
        card[6] = this.entry('refurbish', 'Refurb.', 'Take items out of the stock and get back everything they were made from, ten times faster than making them.', () => this.openMenu('refurbish'), { name: 'Refurbish' });
      }
    }
    if (first.complete && spec.trainsWorkers) {
      card[9] = this.entry('rally', 'Rally', 'Then left click ground, a unit or a resource node: new workers go there (and gather, on a node). Shift adds a waypoint. Right click with the building selected does the same.', () => this.target('rally', 'rally'), {
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
    const making = ps.item !== undefined && p < REFURBISH_PRODUCT;
    const costs = ps.food > 0 ? `${ps.food} food` : making ? itemSpec(ps.item!).recipes.map(costLine).join(', or ') : costLine(ps.cost);
    const takes = making || ps.item === undefined ? (ps.items ?? []) : [];
    let reason = '';
    if (ps.research !== undefined && g.researched(ps.research)) reason = 'Already researched.';
    else if (ps.research !== undefined && [...g.buildings.values()].some((b) => b.owner === this.d.player && b.queue.some((q) => q.product === p))) reason = 'Being researched.';
    else if (making && !g.researched(itemSpec(ps.item!).research)) reason = `Needs ${RESEARCH[itemSpec(ps.item!).research]!.name} researched first (Scholar's Lodge).`;
    else if (ps.food > 0 && g.food() < ps.food) reason = `Not enough food (needs ${ps.food}).`;
    else if (making) reason = itemSpec(ps.item!).recipes.some((r) => g.shortOf(r) < 0) ? '' : g.costProblem(itemSpec(ps.item!).recipes[0] ?? []);
    else if (ps.food === 0) reason = g.costProblem(ps.cost);
    if (!reason && p >= REFURBISH_PRODUCT && g.stock(ps.item!) < (ps.items?.[0]?.[1] ?? 1)) reason = 'None in the equipment stock.';
    for (const [it, n] of takes) if (!reason && g.stock(it) < n) reason = `Needs ${n === 1 ? 'a' : n} ${itemSpec(it).name.toLowerCase()} in the equipment stock.`;
    if (!reason && (p === Product.Worker || p === Product.Warrior) && info && info.supplyUsed >= info.supplyCap) reason = `Not enough supply (${info.supplyUsed} of ${info.supplyCap}). Build or upgrade farms.`;
    if (why !== undefined) reason = why;
    if (!reason && all.every((b) => b.queue.length >= 5)) reason = 'The queue is full (5).';
    const stock = ps.item !== undefined ? ` In stock: ${g.stock(ps.item)}.` : '';
    const extra = takes.length > 0 ? ` and ${takes.map(([it, n]) => `${n} ${itemSpec(it).name.toLowerCase()}`).join(', ')} from the stock` : '';
    const what = p >= REFURBISH_PRODUCT ? ps.tooltip : `${ps.tooltip} Cost: ${costs}${extra}.`;
    return {
      action,
      face,
      name: ps.name,
      key: grid !== undefined ? GRID_CODES[grid]! : this.key(action),
      grid: grid !== undefined,
      description: `${what} Time: ${Math.round(ps.steps / 2) / 10} s.${stock} Shift: queue 5.`,
      enabled: reason === '',
      reason,
      run: (press) => this.produce(all, p, press.shift ? 5 : 1),
    };
  }

  /**
   * K (craft, cook, research, slaughter) and F (refurbish): a button per
   * product the building makes, 13 to a page, greyed out with the sim's
   * reason; V shows the next page and B is Back.
   */
  private makeCard(card: Card, kind: number, page: 'craft' | 'refurbish' | 'make'): Card {
    const all = this.buildings().filter((b) => b.kind === kind && b.complete);
    const first = all[0];
    if (first) {
      const list = first.products.filter(([p]) => {
        if (page === 'refurbish') return p >= REFURBISH_PRODUCT && p < RECIPE_PRODUCT;
        if (page === 'craft') return p >= CRAFT_PRODUCT && p < REFURBISH_PRODUCT;
        return p >= RESEARCH_PRODUCT && (p < REFURBISH_PRODUCT || p >= RECIPE_PRODUCT);
      });
      const pages = Math.max(1, Math.ceil(list.length / MAKE_PER_PAGE));
      const at = Math.max(0, this.menu.sub) % pages;
      list.slice(at * MAKE_PER_PAGE, (at + 1) * MAKE_PER_PAGE).forEach(([p, why], k) => {
        const ps = productSpec(p);
        const face = ps.item !== undefined ? shortName(itemSpec(ps.item)) : shortFace(ps.name);
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

  /** I: a button per slot of the one selected unit; a slot opens the items in stock that fit it. */
  private equipCard(card: Card): Card {
    const ids = this.unitIds((u) => u.typeKey === 'worker' || u.typeKey === 'warrior');
    const u = ids.length === 1 ? this.d.game.unit(ids[0]!) : null;
    card[14] = this.backEntry(this.menu.sub >= 0 ? 'Back to the slots.' : 'Back to the unit commands.');
    if (!u) return card;
    const slots = u.kind === UnitKind.Worker ? WORKER_SLOTS : WARRIOR_SLOTS;
    const load = `Carrying ${carriedLb(u)} lb of gear (over 50 lb slows them down, up to 40% at 100 lb).`;
    if (this.menu.sub < 0) {
      slots.forEach((slot, k) => {
        const worn = wornItem(u, slot);
        const munition = u.ranged ? itemSpec(u.ranged).ranged?.munition : undefined;
        const quiver = munition === 'arrows' || munition === 'bolts';
        const shots = munition === 'bolts' ? 'bolts' : 'arrows';
        const now = slot === Slot.Ammo ? (quiver ? `${u.ammo} ${shots} (${u.ammoItem ? itemSpec(u.ammoItem).name.toLowerCase() : 'none'})` : 'no quiver or bolt case') : worn ? itemSpec(worn).name : 'nothing';
        card[k] = {
          action: `slot-${slot}`,
          face: slot === Slot.Ammo ? `${munition === 'bolts' ? 'Bolts' : 'Arrows'} ${quiver ? u.ammo : '-'}` : worn ? shortName(itemSpec(worn)) : `(${SLOT_NAMES[slot]})`,
          name: SLOT_NAMES[slot]!,
          key: GRID_CODES[k]!,
          grid: true,
          description: `${SLOT_NAMES[slot]}: ${now}. Click to pick from the stock. ${load}`,
          enabled: true,
          reason: '',
          run: () => {
            this.menu = { page: 'equip', sub: slot };
            this.d.changed();
          },
        };
      });
      card[11] = this.eatEntry();
      card[12] = this.equipBestEntry();
      if (u.kind === UnitKind.Worker) card[13] = this.rankEntry([u.id]);
      return card;
    }
    const slot = this.menu.sub as Slot;
    const worn = wornItem(u, slot);
    if (worn && slot !== Slot.Ammo && slot !== Slot.Torch) {
      card[0] = {
        action: 'unequip',
        face: 'Take off',
        name: `Take off the ${itemSpec(worn).name.toLowerCase()}`,
        key: GRID_CODES[0],
        grid: true,
        description: 'The unit hands it in at the main base, and Equip Best leaves the slot empty after this.',
        enabled: true,
        reason: '',
        run: () => this.handPick(u, slot, 0),
      };
    }
    let k = 1;
    for (const it of ITEMS) {
      if (k >= 14) break;
      if (!fitsSlot(it, slot) || this.d.game.stock(it.id) <= 0) continue;
      const untrained = (it.ranged?.skill ?? 0) !== 0 && (u.skills & it.ranged!.skill) === 0;
      const at = k++;
      card[at] = {
        action: `pick-${it.id}`,
        face: shortName(it),
        name: it.name,
        key: GRID_CODES[at]!,
        grid: true,
        description: `In stock: ${this.d.game.stock(it.id)}. Weighs ${it.weightTenthsLb / 10} lb${it.makes > 1 ? ' each' : ''}.${untrained ? ` This unit cannot shoot it until it is trained${it.ranged?.munition === 'bolts' ? ' with the crossbow' : ' in archery'}.` : ''} The unit walks to the main base to collect it.`,
        enabled: true,
        reason: '',
        run: () => this.handPick(u, slot, it.id),
      };
    }
    if (k === 1 && !card[0]) card[1] = this.off('none', 'None', `Nothing in the stock fits the ${SLOT_NAMES[slot]!.toLowerCase()} slot.`, 'Craft some at the Big House (K).');
    return card;
  }

  private handPick(u: UnitInfo, slot: number, item: number): void {
    this.d.send({ kind: 'equipItem', player: this.d.player, unit: u.id, slot, item });
    this.d.message(item ? `Off to the main base to collect the ${itemSpec(item).name.toLowerCase()}.` : `Handing in the ${SLOT_NAMES[slot]!.toLowerCase()} at the main base.`);
    this.menu = { page: 'equip', sub: -1 };
    this.d.changed();
  }

  /** Dig and earthworks: + and - set the depth or height, Mark confirms, Esc cancels. */
  private areaCard(card: Card): Card {
    const a = this.area!;
    const plan = this.areaPlan();
    const tunnel = plan?.tunnel === true;
    const what = a.mode === 'dig' ? (tunnel ? 'tunnel height' : 'depth') : 'height';
    const fixed = a.mode === 'earthwork' && a.variant !== 0;
    const m = ((tunnel ? a.tunnelUnits : a.units) * TERRAIN_UNIT_M).toFixed(2);
    const down = a.mode === 'dig' && !tunnel;
    if (a.face) {
      const far = (a.tunnelColumns * COLUMN_M).toFixed(1);
      card[0] = this.entry('deeper', 'Further', `The tunnel goes ${far} m into the face. Press for 90 cm more. The wheel does the same while marking.`, () => this.adjustArea(1), { name: 'Tunnel further' });
      card[1] = this.entry('shallower', 'Shorter', `The tunnel goes ${far} m into the face. Press for 90 cm less.`, () => this.adjustArea(-1), { name: 'Tunnel less far' });
    } else if (!fixed) {
      card[0] = this.entry('deeper', down ? 'Deeper' : 'Higher', `The ${what} is ${m} m. Press for about 34 cm more. The wheel does the same while marking.`, () => this.adjustArea(1), { name: `More ${what}` });
      card[1] = this.entry('shallower', down ? 'Shallower' : 'Lower', `The ${what} is ${m} m. Press for about 34 cm less.`, () => this.adjustArea(-1), { name: `Less ${what}` });
    }
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
    if (units.length > 0) this.d.send({ kind: 'hold', player: this.d.player, units });
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
        ok = this.ownBuilding(item) ? this.work(item!) : false;
        if (!ok) this.d.message('Pick one of your buildings to build or repair.', 'alert');
        break;
      case 'enter':
        ok = this.ownBuilding(item) ? this.enter(item!) : false;
        break;
      case 'rally':
        ok = this.rally(item, ground);
        break;
      case 'attack':
        ok = item && this.enemy(item) ? this.attack(item) : ground ? this.attackMove(ground) : false;
        break;
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
    }
    if (ok && !this.d.held(t.key) && !this.d.queued()) {
      this.targeting = null;
      this.d.changed();
    }
  }

  /** A unit the local player's units fight: monsters (other players are allies in this co-op game). */
  private enemy(item: Selectable): boolean {
    return item.kind === 'unit' && item.owner === MONSTERS;
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
    const bs = this.buildings().filter((b) => b.complete && buildingSpec(b.kind).trainsWorkers);
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
          const carts = workers.filter((id) => {
            const k = this.d.game.unit(id)?.kit ?? 0;
            return k === Item.HandCart || k === Item.OxCart;
          });
          const full = b.assigned >= levelSpec(b.kind, b.level).workers;
          if (full || carts.length > 0) return send({ kind: 'haul', player, units: full ? workers : carts, building: b.id, queued });
        }
        if (levelSpec(b.kind, b.level).workers > 0) return send({ kind: 'assign', player, units: workers, building: b.id, queued });
        if (spec.light) return send({ kind: 'refuel', player, units: workers, building: b.id, queued });
      }
    }
    if (item && this.enemy(item) && this.attack(item)) return;
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
    const site = this.d.game.info?.sites.find((s) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1);
    if (!site) return false;
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
    this.area = { mode, variant, from: null, to: null, dragging: false, units: AREA_DEFAULT_UNITS, tunnelUnits: TUNNEL_UNITS, face: null, tunnelColumns: TUNNEL_COLUMNS };
    this.d.changed();
  }

  endArea(): void {
    this.area = null;
    this.d.changed();
  }

  /** Each frame while marking: the column under the cursor while dragging. */
  updateArea(ground: THREE.Vector3 | null): void {
    const a = this.area;
    if (!a || !a.dragging || !ground) return;
    const x = Math.floor(ground.x / COLUMN_M);
    const z = Math.floor(ground.z / COLUMN_M);
    if (a.to && a.to.x === x && a.to.z === z) return;
    a.to = { x, z };
    this.d.changed();
  }

  /** Left button down while marking: start a drag, or confirm one already marked. */
  areaDown(ground: THREE.Vector3 | null): void {
    const a = this.area;
    if (!a) return;
    if (a.from && a.to && !a.dragging) {
      this.confirmArea();
      return;
    }
    if (!ground) return;
    const c = { x: Math.floor(ground.x / COLUMN_M), z: Math.floor(ground.z / COLUMN_M) };
    a.from = c;
    a.to = { ...c };
    a.face = a.mode === 'dig' ? this.faceAt(ground, c.x, c.z) : null;
    a.dragging = true;
    this.d.changed();
  }

  /**
   * Whether a point the cursor picked is on the side of a cliff or hillside
   * rather than on top of the ground: below its column's top, on the edge of
   * the column next to lower ground at least FACE_MIN_UNITS down. Returns the
   * face and the ground in front of it, or null.
   */
  private faceAt(p: THREE.Vector3, x: number, z: number): Area['face'] {
    const units = (wx: number, wz: number): number => Math.round(this.d.heightAt((wx + 0.5) * COLUMN_M, (wz + 0.5) * COLUMN_M) / TERRAIN_UNIT_M);
    const top = units(x, z);
    if (p.y / TERRAIN_UNIT_M > top - 1) return null;
    // Which side of the column the point is on: the nearest edge with low ground beyond it.
    const fx = p.x / COLUMN_M - x;
    const fz = p.z / COLUMN_M - z;
    let best: Area['face'] = null;
    let bestD = 0.2;
    for (const [nx, nz, d] of [[-1, 0, fx], [1, 0, 1 - fx], [0, -1, fz], [0, 1, 1 - fz]] as const) {
      const floor = units(x + nx, z + nz);
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
    if (a.face) a.tunnelColumns = Math.max(TUNNEL_COLUMNS_STEP, Math.min(SITE_MAX_COLUMNS, a.tunnelColumns + dir * TUNNEL_COLUMNS_STEP));
    else if (this.areaPlan()?.tunnel) a.tunnelUnits = Math.max(TUNNEL_MIN_UNITS, Math.min(TUNNEL_MAX_UNITS, a.tunnelUnits + dir * AREA_STEP_UNITS));
    else a.units = Math.max(AREA_STEP_UNITS, Math.min(AREA_MAX_UNITS, a.units + dir * AREA_STEP_UNITS));
    this.d.changed();
  }

  /** What the area would mark: its box, levels and the ground in it (cached until it changes). */
  areaPlan(): AreaPlan | null {
    const a = this.area;
    if (!a || !a.from || !a.to) return null;
    const f = a.face;
    const sig = `${a.mode},${a.variant},${a.from.x},${a.from.z},${a.to.x},${a.to.z},${a.units},${a.tunnelUnits},${f ? `${f.x},${f.z},${f.nx},${f.nz},${a.tunnelColumns}` : ''}`;
    if (sig === this.plan.sig) return this.plan.plan;
    const lim = SITE_MAX_COLUMNS - 1;
    if (f) {
      // A tunnel into the face: as wide as the drag along the face, as long as tunnelColumns into it, floored at the ground in front.
      const across = f.nx !== 0 ? a.to.z - f.z : a.to.x - f.x;
      const span = Math.max(-lim, Math.min(lim, across));
      const deep = (a.tunnelColumns - 1) * -(f.nx + f.nz);
      const [ax0, ax1] = [Math.min(0, span), Math.max(0, span)];
      const [d0, d1] = [Math.min(0, deep), Math.max(0, deep)];
      const x0 = f.nx !== 0 ? f.x + d0 : f.x + ax0;
      const x1 = f.nx !== 0 ? f.x + d1 : f.x + ax1;
      const z0 = f.nx !== 0 ? f.z + ax0 : f.z + d0;
      const z1 = f.nx !== 0 ? f.z + ax1 : f.z + d1;
      const plan: AreaPlan = { x0, z0, x1, z1, tunnel: true, level: f.floor, level2: f.floor + a.tunnelUnits, axis: 0, start: f.floor, top: f.floor, low: f.floor, earth: 0 };
      this.plan = { sig, plan };
      return plan;
    }
    const tx = a.from.x + Math.max(-lim, Math.min(lim, a.to.x - a.from.x));
    const tz = a.from.z + Math.max(-lim, Math.min(lim, a.to.z - a.from.z));
    const x0 = Math.min(a.from.x, tx);
    const x1 = Math.max(a.from.x, tx);
    const z0 = Math.min(a.from.z, tz);
    const z1 = Math.max(a.from.z, tz);
    const g = (x: number, z: number): number => Math.round(this.d.heightAt((x + 0.5) * COLUMN_M, (z + 0.5) * COLUMN_M) / TERRAIN_UNIT_M);
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
      this.d.message(a.face ? `Tunnelling ${(a.tunnelColumns * COLUMN_M).toFixed(1)} m into the face.` : plan.tunnel ? 'Tunnelling into the face.' : `Digging out ${((plan.start - plan.level) * TERRAIN_UNIT_M).toFixed(1)} m deep.`);
    } else {
      const [res, what, where] = HEAP_STUFF[a.variant] ?? HEAP_STUFF[0]!;
      if (this.d.game.have(res) < plan.earth) this.d.message(`Not enough ${what} yet (needs ${plan.earth}): the workers heap what there is and wait for more. ${where}`, 'alert');
      this.d.send({ kind: 'earthwork', ...box, variant: a.variant, axis: plan.axis });
    }
    const cx = ((plan.x0 + plan.x1 + 1) / 2) * COLUMN_M;
    const cz = ((plan.z0 + plan.z1 + 1) / 2) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'target');
    // Shift keeps marking for the next area.
    if (this.d.queued()) this.area = { ...a, from: null, to: null, dragging: false, face: null };
    else this.area = null;
    this.d.changed();
  }

  // ---- Placement ----

  startPlacing(kind: number, variant: number): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
    this.area = null;
    this.placing = { kind, variant, x: Number.NaN, z: Number.NaN, dragFrom: null, spots: [] };
    this.placeAsked = '';
    this.d.changed();
  }

  endPlacing(): void {
    this.placing = null;
    this.d.changed();
  }

  /** Whether a building kind is placed in lines by dragging (1 x 1 lights and walls). */
  static draggable(kind: number): boolean {
    const s = buildingSpec(kind);
    return s.w === 1 && s.d === 1;
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

  /** The corners being placed: one, or a line from the drag start to the cursor. */
  private spotCorners(): Array<[number, number]> {
    const p = this.placing!;
    if (!p.dragFrom) return [[p.x, p.z]];
    if (!buildingSpec(p.kind).light) return wallLine(p.dragFrom.x, p.dragFrom.z, p.x, p.z, WALL_LINE_MAX);
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

  /** Left button down while placing: start a line drag for lights. */
  placeDown(): void {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return;
    if (Commands.draggable(p.kind)) p.dragFrom = { x: p.x, z: p.z };
  }

  /** Left button up while placing: place if every tile is green and it can be paid for. */
  placeUp(): void {
    const p = this.placing;
    if (!p || Number.isNaN(p.x)) return;
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
    // Shift keeps the ghost for the next one; otherwise placement ends.
    if (!queued) this.endPlacing();
  }
}

/** Columns in one dragged wall line (s). */
const WALL_LINE_MAX = 80;

/**
 * Columns from one corner to another, every column, stepping one axis at a
 * time so the line has no diagonal gaps that a monster could squeeze through.
 */
export function wallLine(x0: number, z0: number, x1: number, z1: number, max: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[x0, z0]];
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = Math.sign(x1 - x0);
  const sz = Math.sign(z1 - z0);
  let x = x0;
  let z = z0;
  let err = dx - dz;
  while ((x !== x1 || z !== z1) && out.length < max) {
    // Move along whichever axis keeps closest to the straight line.
    if (2 * err >= dz - dx && x !== x1) {
      err -= dz;
      x += sx;
    } else {
      err += dx;
      z += sz;
    }
    out.push([x, z]);
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

/** The K button by building kind: its face and tooltip. */
const MAKE_WORDS: Record<number, [string, string]> = {
  [BuildingKind.ScholarsLodge]: ['Research', 'Open the research menu: every step, greyed out with what it still needs. Research takes the lodge\'s time and stops while the troops starve. V shows the next page; B is Back.'],
  [BuildingKind.Forge]: ['Smelt', 'Open the forge menu: smelting ore into ingots, and the tools, weapons and armour this level can make. Needs workers inside. V shows the next page; B is Back.'],
  [BuildingKind.Cooking]: ['Cook', 'Open the cooking menu: raw food into food with more nutrition, burning lumber or coal. V shows the next page; B is Back.'],
  [BuildingKind.LivestockFarm]: ['Slaughter', 'Slaughter one of the grown animals of the farm for its meat and hides. The farm keeps its breeding pairs longest. B is Back.'],
  [BuildingKind.Kiln]: ['Fire', 'Open the kiln menu: charcoal, bricks and glass. Needs workers inside. B is Back.'],
  [BuildingKind.Tannery]: ['Tan', 'Open the tannery menu: leather, rope, boots, leather armour and caps, bolt cases. Needs workers inside. V shows the next page; B is Back.'],
  [BuildingKind.HerbalistHut]: ['Brew', 'Open the herbalist menu: bandages, remedies and poison. Needs workers inside. B is Back.'],
  [BuildingKind.Workshop]: ['Make', 'Open the workshop menu: carts, crossbows, ramp steps, lanterns and trinkets. Needs workers inside. V shows the next page; B is Back.'],
};

/** A short button face from a product name. */
export function shortFace(name: string): string {
  const plain = name.replace(/\s*\(.*\)\s*/, '').trim();
  if (plain.length <= 10) return plain;
  const words = plain.split(' ');
  return words.length > 1 ? `${words[0]!.slice(0, 8)} ${words[words.length - 1]![0]}.` : plain.slice(0, 10);
}

/** A short face for an item button. */
export function shortName(it: ItemSpec): string {
  const faces: Record<number, string> = {
    [Item.ToolsHardwood]: 'Tools H',
    [Item.ToolsStone]: 'Tools S',
    [Item.ToolsFlint]: 'Tools F',
    [Item.Club]: 'Club',
    [Item.SpearHardwood]: 'Spear H',
    [Item.AxeFlint]: 'Axe F',
    [Item.SpearFlint]: 'Spear F',
    [Item.Sling]: 'Sling',
    [Item.JavelinsFlint]: 'Javelins',
    [Item.Bow]: 'Bow',
    [Item.ArrowsFlint]: 'Arrows',
    [Item.ArrowsFire]: 'Fire arr.',
    [Item.Boots]: 'Boots',
    [Item.ShieldWicker]: 'Wicker',
    [Item.ShieldWood]: 'Shield W',
    [Item.HandTorch]: 'Torch',
  };
  return faces[it.id] ?? it.name;
}

/** Whether an item goes in a slot (a backup weapon is a one-handed melee weapon). */
export function fitsSlot(it: ItemSpec, slot: Slot): boolean {
  if (it.id === Item.None) return false;
  if (slot === Slot.Backup) return it.slot === Slot.Weapon && it.melee?.oneHanded === true;
  return it.slot === slot;
}

/** What a unit has in a slot, as the screen knows it. */
export function wornItem(u: UnitInfo, slot: Slot): number {
  switch (slot) {
    case Slot.Tool:
      return toolItem(u.tool);
    case Slot.Weapon:
      return u.weapon;
    case Slot.Backup:
      return u.backup;
    case Slot.Ranged:
      return u.ranged;
    case Slot.Shield:
      return u.shield;
    case Slot.Boots:
      return u.boots;
    case Slot.Torch:
      return u.torch ? Item.HandTorch : Item.None;
    case Slot.Armour:
      return u.armour;
    case Slot.Helmet:
      return u.helmet;
    case Slot.Case:
      return u.boltCase;
    case Slot.Kit:
      return u.kit;
    default:
      return u.ammo > 0 ? u.ammoItem : Item.None;
  }
}

/** Pounds of gear a unit carries (Table 12 weights; arrows a tenth of a pound each). */
export function carriedLb(u: UnitInfo): number {
  let tenths = 0;
  for (const slot of [Slot.Tool, Slot.Weapon, Slot.Backup, Slot.Ranged, Slot.Shield, Slot.Boots, Slot.Torch, Slot.Armour, Slot.Helmet, Slot.Case, Slot.Kit] as const) {
    const it = wornItem(u, slot);
    if (it) tenths += itemSpec(it).weightTenthsLb;
  }
  if (u.ammoItem) tenths += u.ammo * itemSpec(u.ammoItem).weightTenthsLb;
  return Math.round(tenths) / 10;
}

const BLOCKED_TEXT = ['', 'the ground is too steep.', 'it cannot be built on water.', 'another building is in the way.', 'a tree, rock or bush is in the way.', 'that land is unexplored.'];
