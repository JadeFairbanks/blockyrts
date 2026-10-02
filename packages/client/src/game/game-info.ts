// The screen's copy of the game: the latest state and info messages from the
// sim worker, indexed for the HUD (buildings by id, units by id, order
// lists). Read-only for everything but main.ts, which feeds it.
import { BuildingKind, buildingSpec, FOODS, RESOURCES, UnitKind, type UnitOrder } from '@blockyrts/sim';
import { S, STATE_STRIDE, type BuildingInfo, type InfoMessage, type StateMessage } from '../messages.ts';

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
  tool: number;
  carryRes: number;
  carryAmt: number;
  inside: number;
  act: number;
  order: number;
  mob: number;
  weapon: number;
  backup: number;
  ranged: number;
  shield: number;
  boots: number;
  torch: boolean;
  flags: number;
  lock: number;
  skills: number;
  ammo: number;
  target: number;
}

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
      tool: d[o + S.tool]!,
      carryRes: d[o + S.carryRes]!,
      carryAmt: d[o + S.carryAmt]!,
      inside: d[o + S.inside]!,
      act: d[o + S.act]!,
      order: d[o + S.order]!,
      mob: d[o + S.mob]!,
      weapon: d[o + S.weapon]!,
      backup: d[o + S.backup]!,
      ranged: d[o + S.ranged]!,
      shield: d[o + S.shield]!,
      boots: d[o + S.boots]!,
      torch: d[o + S.torch] === 1,
      flags: d[o + S.flags]!,
      lock: d[o + S.lock]!,
      skills: d[o + S.skills]!,
      ammo: d[o + S.ammo]!,
      target: d[o + S.target]!,
    };
  }

  /** Every unit id, in state order. */
  unitIds(): number[] {
    return [...this.unitIndex.keys()];
  }

  /** How much of a resource the local player has. */
  have(res: number): number {
    return this.info?.pool[res] ?? 0;
  }

  /** How many of an item the local player has in the equipment stock. */
  stock(item: number): number {
    return this.info?.items[item] ?? 0;
  }

  /** Whether the local player has a research done. */
  researched(r: number): boolean {
    return r === 0 || ((this.info?.research ?? 0) & (1 << r)) !== 0;
  }

  /** Food items in the pool. */
  food(): number {
    let n = 0;
    for (const f of FOODS) n += this.have(f);
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
  static centre(b: Pick<BuildingInfo, 'kind' | 'x' | 'z'>, columnM: number): { x: number; z: number } {
    const s = buildingSpec(b.kind);
    return { x: (b.x + s.w / 2) * columnM, z: (b.z + s.d / 2) * columnM };
  }
}
