// Orders and the command card (Controls: Unit orders; Command card and
// hotkeys; Building placement; Queuing orders with Shift; Production queues).
// Works out the 15 buttons for the active subgroup, the targeted commands and
// their clicks, the smart right click, and the placement ghost with Shift
// chains and dragged lines of lights. Orders go out through `issue`; what the
// world looks like comes from GameInfo and the selectables under the cursor.
import * as THREE from 'three';
import {
  BuildingKind,
  BUILDINGS,
  buildingSpec,
  levelSpec,
  PRODUCTS,
  Product,
  RANK_TRAINING,
  RESOURCES,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type BuildingSpec,
  type Cost,
  type Order,
} from '@blockyrts/sim';
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

type TargetCommand = 'move' | 'gather' | 'repair' | 'enter' | 'rally';

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
  askPlacement(kind: number, spots: Array<[number, number]>): void;
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

/** The choices of a submenu: each building, and each crop of a farm, in grid order. */
export function submenuChoices(specs: readonly BuildingSpec[]): Array<{ spec: BuildingSpec; variant: number; name: string }> {
  const out: Array<{ spec: BuildingSpec; variant: number; name: string }> = [];
  for (const spec of specs) {
    if (spec.crops && spec.kind !== BuildingKind.HerbBed) spec.crops.forEach((c, v) => out.push({ spec, variant: v, name: c.name }));
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
  menu: { page: 'main' | 'basic' | 'advanced'; sub: number } = { page: 'main', sub: -1 };
  targeting: Targeting | null = null;
  placing: Placing | null = null;
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
      this.menu = this.menu.sub >= 0 ? { page: this.menu.page, sub: -1 } : { page: 'main', sub: -1 };
      this.d.changed();
      return true;
    }
    return false;
  }

  /** The selection changed: menus, targets and ghosts belong to the old one. */
  reset(): void {
    this.menu = { page: 'main', sub: -1 };
    this.targeting = null;
    if (this.placing) this.endPlacing();
  }

  // ---- The card ----

  card(): Card {
    const card: Card = Array.from({ length: 15 }, () => null);
    const active = this.d.activeType();
    if (this.placing || this.targeting) {
      card[14] = this.cancelEntry();
    }
    if (active === null) return card;
    if (active === 'worker' || active === 'warrior') {
      if (this.menu.page !== 'main' && active === 'worker') return this.buildMenuCard(card);
      this.unitCard(card, active);
    } else if (active.startsWith('building:')) {
      this.buildingCard(card, Number(active.split(':')[1]));
    }
    return card;
  }

  private cancelEntry(): CardEntry {
    return {
      action: 'cancel',
      face: 'Cancel',
      name: 'Cancel',
      key: 'Escape',
      description: this.placing ? 'Put the building away without placing it. Right click does the same.' : 'Cancel the command waiting for a target. Right click does the same.',
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
    card[0] = this.off('attack', 'Attack', 'Click an enemy to attack it, or ground to attack-move.', 'Comes with combat (milestone 3).');
    card[1] = this.entry('stop', 'Stop', 'Cancel every queued order; units stand still but fight back.', () => this.stop());
    card[2] = this.off('hold', 'Hold', 'Cancel every order and never move, not even to chase.', 'Comes with combat (milestone 3).', 'Hold Position');
    card[3] = this.off('patrol', 'Patrol', 'Walk back and forth between here and a point, fighting on the way.', 'Comes with combat (milestone 3).');
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
      card[8] = this.off('dig', 'Dig', 'Mark an area to dig out or tunnel into.', 'Comes with digging (milestone 3).');
      card[9] = this.off('prospect', 'Prospect', 'Look for ore under the ground.', 'Comes with mining (milestone 4).');
      card[10] = this.entry('buildBasic', 'Build', 'Open the Basic Structures menu: homes, farms, storage, walls, lights. Grid keys pick a building; B is Back.', () => this.openMenu('basic'), { name: 'Build Basic Structures' });
      card[11] = this.entry('buildAdvanced', 'Adv.', 'Open the Advanced Structures menu: buildings that need rare resources or technology.', () => this.openMenu('advanced'), { name: 'Build Advanced Structures' });
      card[13] = this.rankEntry(workers);
    }
    card[12] = this.entry('enter', 'Enter', 'Then left click a main base or farm to shelter inside. Sheltering units take 10% of the damage the building takes.', () => this.target('enter', 'enter'), { lit: t === 'enter' });
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
    if (spec.w === 1 && spec.d === 1 && spec.light) lines.push('Drag to place a line of them.');
    lines.push('Shift + click to place several.');
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
      run: () => this.startPlacing(spec.kind, variant),
    };
  }

  private buildingCard(card: Card, kind: number): void {
    const all = this.buildings().filter((b) => b.kind === kind);
    if (all.length === 0) return;
    const spec = buildingSpec(kind);
    const first = all[0]!;
    // Production: Workers at the Big House and farms, planks at the mill.
    const products = first.complete ? (spec.trainsWorkers ? [Product.Worker] : kind === BuildingKind.LumberMill ? [Product.PlanksSoftwood, Product.PlanksHardwood] : []) : [];
    const productAction = ['trainWorker', 'planksSoft', 'planksHard'];
    products.forEach((p, i) => {
      const ps = PRODUCTS[p]!;
      const action = productAction[p]!;
      const costs = ps.food > 0 ? `${ps.food} food` : costLine(ps.cost);
      let reason = '';
      if (ps.food > 0 && this.d.game.food() < ps.food) reason = `Not enough food (needs ${ps.food}).`;
      else if (ps.food === 0) reason = this.d.game.costProblem(ps.cost);
      const info = this.d.game.info;
      if (!reason && p === Product.Worker && info && info.supplyUsed >= info.supplyCap) reason = `Not enough supply (${info.supplyUsed} of ${info.supplyCap}). Build or upgrade farms.`;
      if (!reason && all.every((b) => b.queue.length >= 5)) reason = 'The queue is full (5).';
      card[i] = {
        action,
        face: p === Product.Worker ? 'Worker' : p === Product.PlanksSoftwood ? 'Planks S' : 'Planks H',
        name: ps.name,
        key: this.key(action),
        description: `${ps.tooltip} Cost: ${costs}. Time: ${ps.steps / 20} s. Shift: queue 5.`,
        enabled: reason === '',
        reason,
        run: (press) => this.produce(all, p, press.shift ? 5 : 1),
      };
    });
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

  // ---- Orders ----

  private unitOrder(o: { kind: 'returnCargo' } | { kind: 'repairAll' } | { kind: 'trainRank'; building: number }, units = this.workerIds()): void {
    if (units.length === 0) return;
    this.d.send({ ...o, player: this.d.player, units, queued: this.d.queued() } as Order);
  }

  private stop(): void {
    const units = this.unitIds();
    if (units.length > 0) this.d.send({ kind: 'stop', player: this.d.player, units });
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

  private openMenu(page: 'basic' | 'advanced'): void {
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
    }
    if (ok && !this.d.held(t.key) && !this.d.queued()) {
      this.targeting = null;
      this.d.changed();
    }
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
    const room = b.complete ? levelSpec(b.kind, b.level).shelters : 0;
    if (room === 0) {
      this.d.message(`${b.name} cannot shelter anyone. Main bases and farms can.`, 'alert');
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
        if (levelSpec(b.kind, b.level).workers > 0) return send({ kind: 'assign', player, units: workers, building: b.id, queued });
        if (spec.light) return send({ kind: 'refuel', player, units: workers, building: b.id, queued });
      }
    }
    if (item?.kind === 'unit' && item.owner === player && this.follow(item)) return;
    const at = item && item.kind !== 'unit' ? item.centre : ground;
    if (at) this.moveTo(at);
  }

  // ---- Placement ----

  startPlacing(kind: number, variant: number): void {
    if (this.workerIds().length === 0) return;
    this.targeting = null;
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
    const s = buildingSpec(p.kind);
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
      this.d.askPlacement(p.kind, corners);
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
    const s = buildingSpec(p.kind);
    const last = spots[spots.length - 1]!;
    const cx = (last.x + s.w / 2) * COLUMN_M;
    const cz = (last.z + s.d / 2) * COLUMN_M;
    this.d.marker(new THREE.Vector3(cx, this.d.heightAt(cx, cz), cz), 'move');
    // Shift keeps the ghost for the next one; otherwise placement ends.
    if (!queued) this.endPlacing();
  }
}

const BLOCKED_TEXT = ['', 'the ground is too steep.', 'it cannot be built on water.', 'another building is in the way.', 'a tree, rock or bush is in the way.', 'that land is unexplored.'];
