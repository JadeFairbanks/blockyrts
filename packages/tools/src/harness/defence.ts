// The balance harness's wave versus defence checks (Technical decisions 11;
// Balance notes: "Wave versus a reasonable defence"). For a night N it
// builds a fixture town round the start pocket's Big House: the main base at
// the tier the pacing check expects by then, a closed ring of walls with
// towers at the corners, and the defence the Balance notes name for that
// night (warriors at their tier and rank, crossbows and muskets in the
// towers, mages, cannons). Then it jumps the clock to the end of day N, lets
// the night spawner plan and spend night N's single-player budget as in
// play, runs to dawn and reports what happened. Everything goes through the
// sim package exactly as in a game, so a run is deterministic: the same
// seed and night always give the same row.
import {
  addCrewman,
  PARAPET_TIER,
  addEngine,
  addMage,
  addWarrior,
  applyKit,
  Blocked,
  BuildingKind,
  buildingCentre,
  buildingTop,
  clockAt,
  createWorld,
  CYCLE_STEPS,
  DAY_STEPS,
  DUSK_STEPS,
  Engine,
  engineSpec,
  floorDiv,
  gearSpec,
  maxHealth,
  OVER_WALL_REACH,
  Mob,
  mobSpec,
  MONSTERS,
  Moves,
  nightBudgetTenths,
  Period,
  placeBuilding,
  placementBlocked,
  Res,
  Research,
  School,
  setMageRank,
  Shot,
  standY,
  stepOffSolid,
  step,
  Troop,
  UnitKind,
  WARRIOR_HEALTH_BY_RANK,
  WU_PER_COLUMN,
  WU_PER_METRE,
  type Building,
  type Order,
  type SimState,
} from '@blockyrts/sim';

/** A troop's kit (Troops and gear): its type and its weapon and armour tiers. */
export interface Kit {
  troop: number;
  weapon: number;
  armour: number;
}

/** The defence the Balance notes set against a night (s, from "Wave versus a reasonable defence"). */
export interface Defence {
  night: number;
  /** Main base tier by then (the pacing check). */
  baseLevel: number;
  wall: number;
  tower: number;
  /** Columns between the main base's footprint and the wall ring. */
  pad: number;
  /** Melee warriors: how many with each kit, and their rank. */
  melee: Array<[number, Kit]>;
  rank: number;
  /** Ranged warriors in the towers (crossbows or muskets). */
  ranged: Array<[number, Kit]>;
  /** Support and battle mages, and their rank. */
  mages: { support: number; battle: number; rank: number };
  /** Cannons: on the ground inside the ring, or up in the Citadel's ports. */
  cannons: { kind: number; count: number; ports: boolean };
  /** Workers stand and fight inside the fence (night 0) or shelter in the main base. */
  workersFight: boolean;
  /** What the Balance notes say the defence is, for the report. */
  note: string;
}

// The Balance notes' kits as troop types and tiers (Troops and gear; the notes were written with the old items:
// flint spear, bronze, wrought iron and mail, high-quality steel, which is carbon steel, tier 8, now).
const CUDGEL: Kit = { troop: Troop.Close, weapon: 1, armour: 0 };
/** Night 0's spear, to stab over the fence: long melee tier 1, which the Big House trains (the notes' flint spear is tier 2). */
const HARDWOOD_SPEAR: Kit = { troop: Troop.Long, weapon: 1, armour: 0 };
const BRONZE_SWORD: Kit = { troop: Troop.Close, weapon: 4, armour: 4 };
const BRONZE_SPEAR: Kit = { troop: Troop.Long, weapon: 4, armour: 4 };
const WROUGHT_SWORD: Kit = { troop: Troop.Close, weapon: 5, armour: 5 };
const WROUGHT_SPEAR: Kit = { troop: Troop.Long, weapon: 5, armour: 5 };
const STEEL_SWORD: Kit = { troop: Troop.Close, weapon: 8, armour: 8 };
const STEEL_HALBERD: Kit = { troop: Troop.Long, weapon: 8, armour: 8 };
/** Night 20's archers: the crossbow is steel (ranger tier 7) now, so wrought-iron arrowheads on a recurve bow. */
const WROUGHT_BOW: Kit = { troop: Troop.Ranger, weapon: 5, armour: 5 };
const CROSSBOW: Kit = { troop: Troop.Ranger, weapon: 7, armour: 7 };
const MUSKET: Kit = { troop: Troop.Ranger, weapon: 8, armour: 7 };

/** The Balance notes' reasonable defence for each checked night (s). */
export const DEFENCES: readonly Defence[] = [
  {
    night: 0, baseLevel: 1, wall: BuildingKind.Wall, tower: 0, pad: 4, melee: [[3, CUDGEL], [1, HARDWOOD_SPEAR]], rank: 1, ranged: [],
    mages: { support: 0, battle: 0, rank: 1 }, cannons: { kind: 0, count: 0, ports: false }, workersFight: true,
    note: 'the 3 starting warriors (wooden cudgels), 1 fire-hardened spear trained at the Big House, 4 workers, wooden fence',
  },
  {
    night: 10, baseLevel: 2, wall: BuildingKind.WallHardwood, tower: 0, pad: 4, melee: [[3, BRONZE_SWORD], [3, BRONZE_SPEAR]], rank: 2, ranged: [],
    mages: { support: 0, battle: 0, rank: 1 }, cannons: { kind: 0, count: 0, ports: false }, workersFight: false,
    note: '6 warriors in bronze behind a hardwood fence',
  },
  {
    night: 20, baseLevel: 3, wall: BuildingKind.WallStone, tower: BuildingKind.TowerStone, pad: 5, melee: [[5, WROUGHT_SWORD], [5, WROUGHT_SPEAR]], rank: 2,
    ranged: [[4, WROUGHT_BOW]], mages: { support: 0, battle: 0, rank: 1 }, cannons: { kind: 0, count: 0, ports: false }, workersFight: false,
    note: '10 warriors in wrought iron and mail, 4 rangers (wrought-iron arrowheads), the first stone walls',
  },
  {
    night: 40, baseLevel: 3, wall: BuildingKind.WallStone, tower: BuildingKind.TowerStone, pad: 6, melee: [[8, STEEL_SWORD], [8, STEEL_HALBERD]], rank: 3,
    ranged: [[8, CROSSBOW]], mages: { support: 1, battle: 2, rank: 3 }, cannons: { kind: 0, count: 0, ports: false }, workersFight: false,
    note: '16 steel warriors, 8 crossbows, 3 mages, stone walls',
  },
  {
    night: 60, baseLevel: 4, wall: BuildingKind.WallStone, tower: BuildingKind.TowerStone, pad: 7, melee: [[12, STEEL_SWORD], [13, STEEL_HALBERD]], rank: 4,
    ranged: [[8, MUSKET]], mages: { support: 2, battle: 2, rank: 4 }, cannons: { kind: Engine.IronCannon, count: 2, ports: false }, workersFight: false,
    note: '25 carbon steel warriors, 8 muskets, 2 cannons, 4 mages, stone walls',
  },
  {
    night: 80, baseLevel: 4, wall: BuildingKind.WallStone, tower: BuildingKind.TowerStone, pad: 8, melee: [[15, STEEL_SWORD], [15, STEEL_HALBERD]], rank: 4,
    ranged: [[15, MUSKET]], mages: { support: 2, battle: 4, rank: 5 }, cannons: { kind: Engine.IronCannon, count: 4, ports: true }, workersFight: false,
    note: '30 carbon steel warriors at Elite, 15 muskets, 4 cannons in the Citadel ports, 6 mages',
  },
  {
    night: 110, baseLevel: 4, wall: BuildingKind.WallStone, tower: BuildingKind.TowerStone, pad: 8, melee: [[15, STEEL_SWORD], [15, STEEL_HALBERD]], rank: 5,
    ranged: [[15, MUSKET]], mages: { support: 0, battle: 6, rank: 6 }, cannons: { kind: Engine.IronCannon, count: 4, ports: true }, workersFight: false,
    note: '30 Hero warriors, 15 muskets, 4 cannons in the Citadel ports, 6 battle mages (and Morvath)',
  },
];

export function defenceFor(night: number): Defence {
  const d = DEFENCES.find((x) => x.night === night);
  if (!d) throw new Error(`no defence for night ${night}; checked nights are ${DEFENCES.map((x) => x.night).join(', ')}`);
  return d;
}

/** One run's row (Technical decisions 11: losses, time to first breach, mobs alive at dawn, resources spent). */
export interface NightRow {
  seed: number;
  night: number;
  budgetTenths: number;
  /** Threat the spawner planned for the night (tenths): the edge's 80% plus any lair share. */
  plannedTenths: number;
  mobs: number;
  mobsHp: number;
  killed: number;
  aliveAtDawn: number;
  warriors: number;
  warriorsLost: number;
  mages: number;
  magesLost: number;
  workersLost: number;
  wallColumns: number;
  wallsLost: number;
  gaps: number;
  /** Seconds into the night: the first wall column broken, and the first monster inside the ring (-1: never). */
  firstWallBreakS: number;
  firstInsideS: number;
  baseHpLostPct: number;
  /** Morvath (night 110): killed in the night, and his health left at dawn (per mille). */
  bossKilled: boolean;
  bossHpPm: number;
  /** What the night's shots were: arrows, crossbow bolts, musket balls and cannonballs (Patch 2: none of them comes from the stock). */
  arrowsShot: number;
  boltsShot: number;
  musketShots: number;
  cannonShots: number;
  outcome: 'held' | 'breached' | 'lost';
}

interface Ring {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const isBoss = (mob: number): boolean => mob === Mob.Morvath || mob === Mob.MorvathAloft;
const flies = (mob: number): boolean => {
  const m = mobSpec(mob).moves;
  return m === Moves.LowFlyer || m === Moves.HighFlyer;
};

function mainBase(s: SimState): Building {
  const b = s.buildings.list.find((q) => q.owner === 0 && q.kind === BuildingKind.MainBase);
  if (!b) throw new Error('no main base');
  return b;
}

const colCentre = (c: number): number => c * WU_PER_COLUMN + (WU_PER_COLUMN >> 1);

/** The gate that goes with each wall. */
const GATE_FOR: Record<number, number> = {
  [BuildingKind.Wall]: BuildingKind.Gate,
  [BuildingKind.WallHardwood]: BuildingKind.GateHardwood,
  [BuildingKind.WallStone]: BuildingKind.GateStone,
};

/** Monsters that go off when they die or reach the wall: one warrior meets them, not a crowd. */
const GOES_OFF: ReadonlySet<number> = new Set([Mob.BloatedCorpse, Mob.SkeletonBomber]);

/** Columns inside the wall a spear or halberd stands to stab over it, inside its reach (there is no minimum range now). */
const STAB_INSET = 3;

/** How near (wu) a spear or halberd gets to its stabbing spot before it holds: half a metre, so it ends inside its reach of the wall. */
const STAB_NEAR = WU_PER_METRE >> 1;

/** How far out (columns) the warriors sally against an archer: about 20 m. */
const SALLY_COLUMNS = 44;

/** Sets a unit down on a column, where it then stands. */
function setDown(s: SimState, i: number, cx: number, cz: number): void {
  const e = s.entities;
  e.x[i] = colCentre(cx);
  e.z[i] = colCentre(cz);
  e.y[i] = standY(s, e.x[i]!, e.z[i]!);
  // Never inside a building's walls (the Big House's sheds, since patch notes 1): the nearest free column, as in play.
  stepOffSolid(s, i);
  e.homeX[i] = e.x[i]!;
  e.homeZ[i] = e.z[i]!;
}

function giveKit(s: SimState, i: number, kit: Kit, rank: number): void {
  const e = s.entities;
  e.troop[i] = kit.troop;
  e.wTier[i] = kit.weapon;
  e.aTier[i] = kit.armour;
  applyKit(e, i, 'warrior');
  e.rank[i] = rank;
  e.hp[i] = WARRIOR_HEALTH_BY_RANK[rank]!;
  e.maxHp[i] = WARRIOR_HEALTH_BY_RANK[rank]!;
}

/** Spots one column inside the ring, spread evenly round it, `n` of them (rounds of the inner rings when there are more than fit). */
function ringSpots(r: Ring, n: number, inset: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const x0 = r.x0 + inset;
  const z0 = r.z0 + inset;
  const x1 = r.x1 - inset;
  const z1 = r.z1 - inset;
  const perim: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x++) perim.push([x, z0]);
  for (let z = z0 + 1; z <= z1; z++) perim.push([x1, z]);
  for (let x = x1 - 1; x >= x0; x--) perim.push([x, z1]);
  for (let z = z1 - 1; z > z0; z--) perim.push([x0, z]);
  for (let k = 0; k < n; k++) out.push(perim[floorDiv(k * perim.length, Math.max(1, n))]!);
  return out;
}

/** The fixture town for a night on a fresh world from a seed; returns the state at the end of the day before. */
export function buildFixture(seed: number, d: Defence): { state: SimState; ring: Ring; gaps: number; towers: Building[] } {
  const s = createWorld(seed);
  const p = s.players[0]!;
  const b = mainBase(s);
  b.level = d.baseLevel;
  b.complete = true;
  b.hp = maxHealth(b);
  const ring: Ring = { x0: b.x - d.pad, z0: b.z - d.pad, x1: b.x + 13 + d.pad, z1: b.z + 13 + d.pad };
  // Towers at the four corners, walls between (resource props in the way are cleared, as the M3 checks do).
  const towers: Building[] = [];
  const inTower = new Set<string>();
  if (d.tower) {
    for (const [tx, tz] of [[ring.x0 - 1, ring.z0 - 1], [ring.x1 - 1, ring.z0 - 1], [ring.x0 - 1, ring.z1 - 1], [ring.x1 - 1, ring.z1 - 1]] as const) {
      const r = placementBlocked(s, 0, d.tower, tx, tz);
      if (r !== Blocked.None && r !== Blocked.Node) continue;
      towers.push(placeBuilding(s, 0, d.tower, 0, tx, tz, true));
      for (let x = tx; x < tx + 3; x++) for (let z = tz; z < tz + 3; z++) inTower.add(`${x},${z}`);
    }
  }
  // A gate, 3 columns wide, in the middle of the south side: the warriors sally through it.
  const gateKind = GATE_FOR[d.wall]!;
  const gx = (ring.x0 + ring.x1 >> 1) - 1;
  const gr = placementBlocked(s, 0, gateKind, gx, ring.z1);
  if (gr === Blocked.None || gr === Blocked.Node) {
    placeBuilding(s, 0, gateKind, 0, gx, ring.z1, true);
    for (let x = gx; x < gx + 3; x++) inTower.add(`${x},${ring.z1}`);
  }
  let gaps = 0;
  for (let x = ring.x0; x <= ring.x1; x++) {
    for (let z = ring.z0; z <= ring.z1; z++) {
      if (x !== ring.x0 && x !== ring.x1 && z !== ring.z0 && z !== ring.z1) continue;
      if (inTower.has(`${x},${z}`)) continue;
      const r = placementBlocked(s, 0, d.wall, x, z);
      if (r === Blocked.None || r === Blocked.Node) placeBuilding(s, 0, d.wall, 0, x, z, true);
      else if (s.buildings.footprintAt(x, z) === 0) gaps++;
    }
  }
  // The three start warriors and four workers: the warriors join the defence; workers fight on night 0, else shelter.
  const e = s.entities;
  const starters: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Warrior) starters.push(i);
  // Melee along the inside of the wall; ranged into the towers; mages and cannons a step further in.
  const melee: Array<[Kit, number]> = [];
  for (const [n, kit] of d.melee) for (let k = 0; k < n; k++) melee.push([kit, d.rank]);
  const spots = ringSpots(ring, melee.length, STAB_INSET);
  melee.forEach(([kit, rank], k) => {
    const [cx, cz] = spots[k]!;
    const i = k < starters.length ? starters[k]! : addWarrior(s, 0, colCentre(cx), colCentre(cz));
    if (k < starters.length) setDown(s, i, cx, cz);
    giveKit(s, i, kit, rank);
  });
  const orders: Order[] = [];
  const rangedIds: number[] = [];
  const inner = ringSpots(ring, 16, 3);
  let q = 0;
  for (const [n, kit] of d.ranged) {
    for (let k = 0; k < n; k++) {
      const [cx, cz] = inner[q++ % inner.length]!;
      const i = addWarrior(s, 0, colCentre(cx), colCentre(cz));
      giveKit(s, i, kit, d.rank);
      rangedIds.push(e.id[i]!);
    }
  }
  // Four to a tower.
  towers.forEach((t, k) => {
    const units = rangedIds.slice(k * 4, k * 4 + 4);
    if (units.length > 0) orders.push({ kind: 'enter', player: 0, units, building: t.id });
  });
  // Mages up on the main base's parapets (8 places from tier 2), where a bolt clears the wall; the Arcane bolt flies flat
  // and cannot clear a wall from the ground, so a mage down there walks out of the gate to find a shot.
  const mageSpots = ringSpots(ring, d.mages.support + d.mages.battle, STAB_INSET + 1);
  const mageIds: number[] = [];
  for (let k = 0; k < d.mages.support + d.mages.battle; k++) {
    const [cx, cz] = mageSpots[k]!;
    const i = addMage(s, 0, colCentre(cx), colCentre(cz), k < d.mages.support ? School.Support : School.Battle);
    setMageRank(s, i, d.mages.rank);
    mageIds.push(e.id[i]!);
  }
  if (mageIds.length > 0 && d.baseLevel >= PARAPET_TIER) orders.push({ kind: 'enter', player: 0, units: mageIds, building: b.id });
  // Cannons: up in the Citadel's ports (the corners of its roof), or on the ground inside the ring; each with its own crew
  // of artillery crewmen, as every cannon rolls out (Patch 2: only they crew engines).
  if (d.cannons.count > 0) {
    const [bx, bz] = buildingCentre(b);
    const groundSpots = ringSpots(ring, d.cannons.count, 4);
    for (let k = 0; k < d.cannons.count; k++) {
      let i: number;
      if (d.cannons.ports) {
        i = addEngine(s, 0, d.cannons.kind, bx, bz);
        e.inside[i] = b.id;
        e.x[i] = bx + ((k & 1) * 2 - 1) * 2 * WU_PER_METRE;
        e.z[i] = bz + ((k & 2) - 1) * 2 * WU_PER_METRE;
        e.y[i] = buildingTop(b);
      } else {
        const [cx, cz] = groundSpots[k]!;
        i = addEngine(s, 0, d.cannons.kind, colCentre(cx), colCentre(cz));
      }
      for (let c = 0; c < engineSpec(d.cannons.kind).crew; c++) {
        const j = addCrewman(s, 0, e.x[i]! + (c * 2 - 1) * WU_PER_METRE, e.z[i]! + 3 * WU_PER_METRE, i);
        stepOffSolid(s, j);
      }
    }
  }
  // Stock: food and the research the gear needs (Patch 2: no attack uses ammunition, so no munitions).
  // Patch 2: 5000 farm fare at 2 nutrition each, the 2000 bread at 5 from before Patch 2.
  p.pool[Res.FarmFare] = p.pool[Res.FarmFare]! + 5000;
  for (const r of [Research.Bronze, Research.Crossbows, Research.Steel, Research.CarbonSteel, Research.Gunpowder, Research.Muskets, Research.Cannons]) p.research |= 1 << r;
  // Workers shelter in the main base unless they fight (night 0).
  const workers: number[] = [];
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === UnitKind.Worker) workers.push(e.id[i]!);
  // They start round the Big House, some of them where the ring now runs: everyone is set down inside it first.
  // Night 0's workers stand together beside the warrior's place, so they fight as one band.
  const [hx, hz] = spots[0] ?? [ring.x0 + STAB_INSET, ring.z0 + STAB_INSET];
  workers.forEach((id, k) => setDown(s, e.indexOf(id), hx + 1 + (k & 1), hz + 1 + (k >> 1)));
  if (!d.workersFight) orders.push({ kind: 'enter', player: 0, units: workers, building: b.id });
  // The clock to two minutes before dusk on day N, then everyone takes up their places.
  s.step = d.night * CYCLE_STEPS + DAY_STEPS - 2400;
  step(s, orders);
  for (let k = 1; k < 2400 - 1; k++) step(s);
  return { state: s, ring, gaps, towers };
}

/**
 * The scripted defence (Technical decisions 11): what a steady player does
 * through the night, twice a second. Melee warriors keep to their places
 * along the wall and hold; two of the nearest (three against a big one) step
 * to the inside of the wall where a monster is at it and hold there,
 * stabbing over; anything that gets inside is set upon by the three nearest,
 * and on night 0 by the workers near it. Ranged units in the towers, the
 * cannons and the mages fight by themselves.
 */
export class ScriptedDefence {
  private readonly home = new Map<number, [number, number]>();
  /** Warriors whose weapon reaches over a wall (spears, halberds). */
  private readonly poles = new Set<number>();
  private readonly workerHome = new Map<number, [number, number]>();

  constructor(
    private readonly s: SimState,
    private readonly ring: Ring,
    private readonly workersFight: boolean,
  ) {
    const e = s.entities;
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== 0 || e.hp[i]! <= 0 || e.inside[i] !== 0) continue;
      if (e.kind[i] === UnitKind.Warrior && !e.ranged[i] && !isCrew(s, i)) {
        this.home.set(e.id[i]!, [e.x[i]!, e.z[i]!]);
        if ((gearSpec(e.weapon[i]!).melee?.reach ?? 0) >= OVER_WALL_REACH) this.poles.add(e.id[i]!);
      }
      if (e.kind[i] === UnitKind.Worker && workersFight) this.workerHome.set(e.id[i]!, [e.x[i]!, e.z[i]!]);
    }
  }

  private col(wu: number): number {
    return floorDiv(wu, WU_PER_COLUMN);
  }

  private inside(cx: number, cz: number): boolean {
    const r = this.ring;
    return cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1;
  }

  /** How far a column is outside the ring, in columns (0 inside or on it). */
  private outside(cx: number, cz: number): number {
    const r = this.ring;
    return Math.max(r.x0 - cx, cx - r.x1, r.z0 - cz, cz - r.z1, 0);
  }

  private alive(map: Map<number, [number, number]>): Map<number, number> {
    const e = this.s.entities;
    const out = new Map<number, number>();
    for (const id of [...map.keys()]) {
      const i = e.indexOf(id);
      if (i >= 0 && e.hp[i]! > 0) out.set(id, i);
      else map.delete(id);
    }
    return out;
  }

  orders(): Order[] {
    const s = this.s;
    const e = s.entities;
    const out: Order[] = [];
    const r = this.ring;
    const free = this.alive(this.home);
    const idle = this.alive(this.workerHome);
    const nearest = (pool: Map<number, number>, x: number, z: number, n: number, within = Infinity): number[] => {
      const list = [...pool]
        .map(([id, i]) => [id, (e.x[i]! - x) ** 2 + (e.z[i]! - z) ** 2] as const)
        .filter(([, d2]) => d2 <= within)
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const pick = list.slice(0, n).map(([id]) => id);
      for (const id of pick) pool.delete(id);
      return pick;
    };
    const mobs: Array<[number, number]> = [];
    for (let i = 0; i < e.count; i++) {
      if (e.owner[i] !== MONSTERS || e.kind[i] !== UnitKind.Mob || e.hp[i]! <= 0) continue;
      if (mobSpec(e.mob[i]!).moves === Moves.HighFlyer) continue;
      mobs.push([i, this.outside(this.col(e.x[i]!), this.col(e.z[i]!))]);
    }
    // Inside first, then those at the wall, nearest the wall first.
    mobs.sort((a, b) => a[1] - b[1] || e.id[a[0]]! - e.id[b[0]]!);
    for (const [i, out2] of mobs) {
      const cx = this.col(e.x[i]!);
      const cz = this.col(e.z[i]!);
      // A bat over the fence is fought like one inside it.
      if ((out2 === 0 && this.inside(cx, cz)) || (flies(e.mob[i]!) && out2 <= 3)) {
        const units = nearest(free, e.x[i]!, e.z[i]!, 3);
        // Night 0: the workers near it gang up on it too.
        units.push(...nearest(idle, e.x[i]!, e.z[i]!, 4, (12 * WU_PER_METRE) ** 2));
        for (const id of units) this.attack(out, id, e.id[i]!);
        continue;
      }
      if (flies(e.mob[i]!)) continue;
      // An archer standing off and shooting in: the nearest swords go out through the gate and cut it down.
      if (mobSpec(e.mob[i]!).range > 0 && out2 > 2 && out2 <= SALLY_COLUMNS) {
        const swords = new Map([...free].filter(([id]) => !this.poles.has(id)));
        const pick = nearest(swords.size > 0 ? swords : free, e.x[i]!, e.z[i]!, 2);
        for (const id of pick) {
          free.delete(id);
          this.attack(out, id, e.id[i]!);
        }
        continue;
      }
      if (out2 > 6) continue;
      // At the wall: spears and halberds take the spot inside it opposite the monster and stab over.
      const sx = Math.min(r.x1 - STAB_INSET, Math.max(r.x0 + STAB_INSET, cx));
      const sz = Math.min(r.z1 - STAB_INSET, Math.max(r.z0 + STAB_INSET, cz));
      const big = e.maxHp[i]! >= 200;
      const poles = new Map([...free].filter(([id]) => this.poles.has(id)));
      for (const id of nearest(poles, colCentre(sx), colCentre(sz), GOES_OFF.has(e.mob[i]!) ? 1 : big ? 3 : 2)) {
        free.delete(id);
        this.goTo(out, id, colCentre(sx), colCentre(sz), STAB_NEAR);
      }
    }
    // The rest go back to their places.
    for (const [id] of free) this.goTo(out, id, ...this.home.get(id)!);
    for (const [id] of idle) this.goTo(out, id, ...this.workerHome.get(id)!);
    return out;
  }

  /** Attack a monster, unless already on it. */
  private attack(out: Order[], id: number, target: number): void {
    const e = this.s.entities;
    const o = e.queue[e.indexOf(id)]![0];
    if (o?.t === 'attack' && o.id === target) return;
    out.push({ kind: 'attack', player: 0, units: [id], target });
  }

  /** Walk to a spot and hold there, once within `near` of it (wu; 1.5 m unless given). */
  private goTo(out: Order[], id: number, x: number, z: number, near = (WU_PER_METRE * 3) >> 1): void {
    const e = this.s.entities;
    const i = e.indexOf(id);
    if (i < 0) return;
    const o = e.queue[i]![0];
    const d2 = (e.x[i]! - x) ** 2 + (e.z[i]! - z) ** 2;
    if (d2 <= near ** 2) {
      if (o?.t !== 'hold') out.push({ kind: 'hold', player: 0, units: [id] });
      return;
    }
    if (o?.t === 'move' && o.x === x && o.z === z) return;
    out.push({ kind: 'move', player: 0, units: [id], x, z });
  }
}

/** Whether a warrior has orders to crew an engine. */
function isCrew(s: SimState, i: number): boolean {
  return s.entities.queue[i]!.some((o) => o.t === 'crew');
}

function countIn(s: SimState, kind: number): number {
  const e = s.entities;
  let n = 0;
  for (let i = 0; i < e.count; i++) if (e.owner[i] === 0 && e.kind[i] === kind && e.hp[i]! > 0) n++;
  return n;
}

/** Wall columns and gates standing. */
function wallCount(s: SimState, kind: number): number {
  return s.buildings.list.filter((b) => b.owner === 0 && (b.kind === kind || b.kind === GATE_FOR[kind]) && b.hp > 0).length;
}

/** Runs one night against its fixture: through dusk and the night to the first step of dawn. */
export function runNight(seed: number, night: number): NightRow {
  const d = defenceFor(night);
  const { state: s, ring, gaps } = buildFixture(seed, d);
  const e = s.entities;
  const b = mainBase(s);
  const baseHp = b.hp;
  const warriors = countIn(s, UnitKind.Warrior);
  const mages = countIn(s, UnitKind.Mage);
  const workers = countIn(s, UnitKind.Worker);
  const walls = wallCount(s, d.wall);
  // No attack uses ammunition (Patch 2): the player's shots are counted as they leave.
  const shots = { arrows: 0, bolts: 0, balls: 0, cannon: 0 };
  const counted = new WeakSet<object>();
  const countShots = (): void => {
    for (const pr of s.projectiles) {
      if (pr.owner !== 0 || counted.has(pr)) continue;
      counted.add(pr);
      if (pr.shot === Shot.Arrow || pr.shot === Shot.SlingStone) shots.arrows++;
      else if (pr.shot === Shot.Bolt) shots.bolts++;
      else if (pr.shot === Shot.MusketBall) shots.balls++;
      else if (pr.shot === Shot.Cannonball) shots.cannon++;
    }
  };
  const nightStart = d.night * CYCLE_STEPS + DAY_STEPS + DUSK_STEPS;
  // Through dusk to nightfall, when the spawner plans the night.
  while (s.step < nightStart + 1) step(s);
  let planned = 0;
  let mobs = 0;
  let mobsHp = 0;
  for (const sp of s.spawns) {
    if (sp.player !== 0) continue;
    planned += mobSpec(sp.mob).threatTenths;
  }
  const seen = new Set<number>();
  let firstWall = -1;
  let firstInside = -1;
  let killed = 0;
  let bossKilled = false;
  let bossHpPm = 0;
  const inside = (x: number, z: number): boolean => {
    const cx = floorDiv(x, WU_PER_COLUMN);
    const cz = floorDiv(z, WU_PER_COLUMN);
    return cx > ring.x0 && cx < ring.x1 && cz > ring.z0 && cz < ring.z1;
  };
  // Only the night's own monsters count: lair dwellers and creatures already about at nightfall are left out.
  let firstId = 0;
  for (let i = 0; i < e.count; i++) firstId = Math.max(firstId, e.id[i]!);
  // Morvath comes at dusk, before the rest of the wave: he counts whatever his id.
  const ofTheNight = (i: number): boolean => e.owner[i] === MONSTERS && e.kind[i] === UnitKind.Mob && e.hp[i]! > 0 && (e.id[i]! > firstId || isBoss(e.mob[i]!));
  const live = new Map<number, number>();
  const script = new ScriptedDefence(s, ring, d.workersFight);
  while (clockAt(s.step).period === Period.Night && s.over === 0) {
    step(s, s.step % 10 === 0 ? script.orders() : undefined);
    countShots();
    const t = s.step - nightStart;
    if (firstWall < 0 && wallCount(s, d.wall) < walls) firstWall = t;
    const now = new Set<number>();
    for (let i = 0; i < e.count; i++) {
      if (!ofTheNight(i)) continue;
      const id = e.id[i]!;
      now.add(id);
      if (!seen.has(id)) {
        seen.add(id);
        mobs++;
        mobsHp += e.maxHp[i]!;
      }
      if (isBoss(e.mob[i]!)) {
        bossHpPm = floorDiv(e.hp[i]! * 1000, Math.max(1, e.maxHp[i]!));
      }
      if (firstInside < 0 && !flies(e.mob[i]!) && inside(e.x[i]!, e.z[i]!)) firstInside = t;
    }
    for (const [id, mob] of live) {
      if (now.has(id)) continue;
      killed++;
      if (isBoss(mob)) bossKilled = true;
    }
    live.clear();
    for (let i = 0; i < e.count; i++) if (ofTheNight(i)) live.set(e.id[i]!, e.mob[i]!);
  }
  const lost = (before: number, kind: number): number => before - countIn(s, kind);
  const wallsLost = walls - wallCount(s, d.wall);
  const baseLost = b.hp > 0 ? floorDiv((baseHp - b.hp) * 100, baseHp) : 100;
  const row: NightRow = {
    seed,
    night,
    budgetTenths: nightBudgetTenths(night),
    plannedTenths: planned,
    mobs,
    mobsHp,
    killed,
    aliveAtDawn: live.size,
    warriors,
    warriorsLost: lost(warriors, UnitKind.Warrior),
    mages,
    magesLost: lost(mages, UnitKind.Mage),
    workersLost: lost(workers, UnitKind.Worker),
    wallColumns: walls,
    wallsLost,
    gaps,
    firstWallBreakS: firstWall < 0 ? -1 : Math.round(firstWall / 20),
    firstInsideS: firstInside < 0 ? -1 : Math.round(firstInside / 20),
    baseHpLostPct: baseLost,
    bossKilled,
    bossHpPm: bossKilled ? 0 : bossHpPm,
    arrowsShot: shots.arrows,
    boltsShot: shots.bolts,
    musketShots: shots.balls,
    cannonShots: shots.cannon,
    // Breached: a wall column or the gate broken (climbers getting over a whole wall is part of the plan on early nights).
    outcome: s.over !== 0 || b.hp <= 0 ? 'lost' : wallsLost > 0 ? 'breached' : 'held',
  };
  return row;
}

export const NIGHT_COLUMNS: ReadonlyArray<keyof NightRow> = [
  'seed', 'night', 'budgetTenths', 'plannedTenths', 'mobs', 'mobsHp', 'killed', 'aliveAtDawn', 'warriors', 'warriorsLost', 'mages', 'magesLost', 'workersLost',
  'wallColumns', 'wallsLost', 'gaps', 'firstWallBreakS', 'firstInsideS', 'baseHpLostPct', 'bossKilled', 'bossHpPm', 'arrowsShot', 'boltsShot', 'musketShots', 'cannonShots', 'outcome',
];
