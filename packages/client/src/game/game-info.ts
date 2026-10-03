// The screen's copy of the game: the latest state and info messages from the
// sim worker, indexed for the HUD (buildings by id, units by id, order
// lists). Read-only for everything but main.ts, which feeds it.
import { BuildingKind, footprintRect, FOODS, haveOf, itemQuarters, QUARTERS, RESEARCH, RESOURCES, UnitKind, type Research, type TechView, type UnitOrder } from '@blockyrts/sim';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage, type PeopleInfo, type StateMessage } from '../messages.ts';

export interface UnitInfo {
  id: number;
  owner: number;
  kind: number;
  /** wu */
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  rank: number;
  /** The tool (gear id) held for each job (ToolJob order: chop, break, build, cut), 0 for none. */
  tools: [number, number, number, number];
  carryRes: number;
  carryAmt: number;
  inside: number;
  act: number;
  order: number;
  mob: number;
  /** Gear ids (GEAR) in the weapon, ranged, shield and armour slots. */
  weapon: number;
  ranged: number;
  shield: number;
  /** Troops: the type (Troop); 0 for everything else. Weapon (tool kit, wand) and armour (robe) tiers. */
  troop: number;
  wTier: number;
  aTier: number;
  /** An upgrade under way: per mille of its bar, its line + 1 (0 for none), the tier it goes to. */
  upDone: number;
  upLine: number;
  upTo: number;
  flags: number;
  lock: number;
  skills: number;
  ammo: number;
  target: number;
  armour: number;
  kit: number;
  partner: number;
  /** Mages: School, mana and the bar's most (whole points), 1 + the spell being cast or 0, the beam's target or 0; spells on the unit (SpellOn bits). */
  school: number;
  mana: number;
  maxMana: number;
  cast: number;
  beam: number;
  spells: number;
  /** The faction of one of the peoples' units or buildings (and of one they left), else 0. */
  group: number;
  /** What it rides (Mount) and the mount's health and most; an engine's crew standing by (plus 1000 when hauled). */
  mount: number;
  mountHp: number;
  mountMax: number;
  crew: number;
  /** A unit that eats: its meal in quarters of nutrition, else 0; and the step it began starving, or 0. */
  meal: number;
  hungry: number;
}

const EMPTY_POOL = new Int32Array(RESOURCES.length);

export class GameInfo {
  step = 0;
  info: InfoMessage | null = null;
  readonly buildings = new Map<number, BuildingInfo>();
  readonly queues = new Map<number, UnitOrder[]>();
  private state: StateMessage | null = null;
  private readonly unitIndex = new Map<number, number>();
  private readonly listeners: ((info: InfoMessage) => void)[] = [];

  constructor(readonly player: number) {}

  onState(msg: StateMessage): void {
    this.state = msg;
    this.step = msg.step;
    this.unitIndex.clear();
    for (let i = 0; i < msg.count; i++) this.unitIndex.set(msg.data[i * STATE_STRIDE + S.id]!, i);
  }

  onInfo(msg: InfoMessage): void {
    this.info = msg;
    this.buildings.clear();
    for (const b of msg.buildings) this.buildings.set(b.id, b);
    this.queues.clear();
    for (const [id, q] of msg.queues) this.queues.set(id, q);
    for (const fn of this.listeners) fn(msg);
  }

  onInfoUpdate(fn: (info: InfoMessage) => void): void {
    this.listeners.push(fn);
  }

  /** A unit's row of the latest state message (STATE_STRIDE values, a view: copy it to keep it), or null when it is gone. */
  unitRow(id: number): Int32Array | null {
    const i = this.unitIndex.get(id);
    const s = this.state;
    if (i === undefined || !s) return null;
    return s.data.subarray(i * STATE_STRIDE, (i + 1) * STATE_STRIDE);
  }

  unit(id: number): UnitInfo | null {
    const i = this.unitIndex.get(id);
    const s = this.state;
    if (i === undefined || !s) return null;
    const d = s.data;
    const o = i * STATE_STRIDE;
    return {
      id,
      owner: d[o + S.owner]!,
      kind: d[o + S.kind]!,
      x: d[o + S.x]!,
      y: d[o + S.y]!,
      z: d[o + S.z]!,
      hp: d[o + S.hp]!,
      maxHp: d[o + S.maxHp]!,
      rank: d[o + S.rank]!,
      tools: [d[o + S.toolChop]!, d[o + S.toolBreak]!, d[o + S.toolBuild]!, d[o + S.toolCut]!],
      carryRes: d[o + S.carryRes]!,
      carryAmt: d[o + S.carryAmt]!,
      inside: d[o + S.inside]!,
      act: d[o + S.act]!,
      order: d[o + S.order]!,
      mob: d[o + S.mob]!,
      weapon: d[o + S.weapon]!,
      ranged: d[o + S.ranged]!,
      shield: d[o + S.shield]!,
      troop: d[o + S.troop]!,
      wTier: d[o + S.wTier]!,
      aTier: d[o + S.aTier]!,
      upDone: d[o + S.upDone]!,
      upLine: d[o + S.upLine]!,
      upTo: d[o + S.upTo]!,
      flags: d[o + S.flags]!,
      lock: d[o + S.lock]!,
      skills: d[o + S.skills]!,
      ammo: d[o + S.ammo]!,
      target: d[o + S.target]!,
      armour: d[o + S.armour]!,
      kit: d[o + S.kit]!,
      partner: d[o + S.partner]!,
      school: d[o + S.school]!,
      mana: d[o + S.mana]!,
      maxMana: d[o + S.maxMana]!,
      cast: d[o + S.cast]!,
      beam: d[o + S.beam]!,
      spells: d[o + S.spells]!,
      group: d[o + S.group]!,
      mount: d[o + S.mount]!,
      mountHp: d[o + S.mountHp]!,
      mountMax: d[o + S.mountMax]!,
      crew: d[o + S.crew]!,
      meal: d[o + S.meal]!,
      hungry: d[o + S.hungry]!,
    };
  }

  /** A mage's spells: each with why it cannot be cast now ('' when it can) and the steps until it is ready. */
  spells(id: number): Array<[number, string, number]> {
    return this.info?.spells.find(([m]) => m === id)?.[1] ?? [];
  }

  /** Why a mage cannot go for her next rank yet (experience, or the top rank), or ''. */
  mageRankWhy(id: number): string {
    return this.info?.mageRanks.find(([m]) => m === id)?.[1] ?? '';
  }

  /** One of the neutral peoples the local player knows, by faction id. */
  faction(id: number): PeopleInfo | null {
    if (!id) return null;
    return this.info?.peoples.find((f) => f.id === id) ?? null;
  }

  /** Every unit id, in state order. */
  unitIds(): number[] {
    return [...this.unitIndex.keys()];
  }

  /** How much of a resource the local player has (of every kind together for a recipe's "meat" or "fish"). */
  have(res: number): number {
    return this.info ? haveOf(this.info.pool, res) : 0;
  }

  /** The local player's pool, for the kit plans (an empty one before the first info). */
  pool(): Int32Array {
    return this.info?.pool ?? EMPTY_POOL;
  }

  /** The research and best forge the kit needs are checked against. */
  tech(): TechView {
    return { research: this.info?.research ?? 0, forge: this.info?.forge ?? 0, researchName: (r: Research) => RESEARCH[r]!.name };
  }

  /** Whether the local player has a research done. */
  researched(r: number): boolean {
    return r === 0 || ((this.info?.research ?? 0) & (1 << r)) !== 0;
  }

  /** Food (nutrition) that can be spent on training and eating: every food not kept back, the rest of started items included, in whole food. */
  food(): number {
    return Math.floor(this.foodQuarters(true) / QUARTERS);
  }

  /** The Food counter: the food value of everything in stock, kept back or not, in whole food (rounded down). */
  foodValue(): number {
    return Math.floor(this.foodQuarters(false) / QUARTERS);
  }

  private foodQuarters(eatable: boolean): number {
    const info = this.info;
    if (!info) return 0;
    let n = 0;
    for (const f of FOODS) if (!eatable || !info.kept.includes(f)) n += (info.pool[f] ?? 0) * itemQuarters(f) + (info.open[f] ?? 0);
    return n;
  }

  /** The first resource of a cost the player is short of, or -1. */
  shortOf(cost: ReadonlyArray<readonly [number, number]>): number {
    for (const [res, n] of cost) if (this.have(res) < n) return res;
    return -1;
  }

  /** "Not enough stone (needs 150, have 40)." or ''. */
  costProblem(cost: ReadonlyArray<readonly [number, number]>): string {
    const r = this.shortOf(cost);
    if (r < 0) return '';
    const need = cost.find(([res]) => res === r)![1];
    return `Not enough ${RESOURCES[r]!.name.toLowerCase()} (needs ${need}, you have ${this.have(r)}).`;
  }

  /** The local player's own workers that have nothing to do: no orders, not inside. */
  idleWorkers(): number[] {
    const out: number[] = [];
    for (const id of this.unitIndex.keys()) {
      const u = this.unit(id)!;
      if (u.owner !== this.player || u.kind !== UnitKind.Worker || u.inside !== 0) continue;
      if ((this.queues.get(id)?.length ?? 0) === 0) out.push(id);
    }
    return out;
  }

  /** The local player's main bases, oldest first. */
  mainBases(): BuildingInfo[] {
    return [...this.buildings.values()].filter((b) => b.owner === this.player && b.kind === BuildingKind.MainBase);
  }

  /** Highest complete main base level the local player has. */
  mainBaseLevel(): number {
    let best = 0;
    for (const b of this.mainBases()) if (b.complete && b.level > best) best = b.level;
    return best;
  }

  /** A building's centre in metres. */
  static centre(b: Pick<BuildingInfo, 'kind' | 'x' | 'z'> & Partial<Pick<BuildingInfo, 'variant' | 'level' | 'upgrading'>>, columnM: number): { x: number; z: number } {
    // The footprint its level (or upgrade) takes, which may have grown round where it was placed.
    const [x0, z0, x1, z1] = footprintRect(b);
    return { x: ((x0 + x1 + 1) / 2) * columnM, z: ((z0 + z1 + 1) / 2) * columnM };
  }
}
