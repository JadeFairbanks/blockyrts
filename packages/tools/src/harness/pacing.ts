// The balance harness's pacing check and supply at night 110 (Technical
// decisions 11; Balance notes: "Pacing check", "Supply and food at night
// 110"). Everything is worked out from the sim's own tables, so the check
// follows any change to them (the balance editor's, or a hand edit):
//
// - What a unit of each resource costs in worker-seconds: a raw one from its
//   Table 5 node (time per load, per load) plus a walk, a made one from its
//   cheapest recipe (the batch time plus its inputs).
// - Each tier's ladder: the main base levels, buildings and research it needs
//   and the first kits it arms (TIERS below; only the structure lives here,
//   every number comes from the sim). Its labour is the build work (ws) plus
//   the worker-seconds of every material; its research runs in a Scholar's
//   Lodge after the buildings.
// - A steady town of growing size spends a share of its working day on the
//   ladder; the day the cumulative labour is paid, plus the research, is the
//   night the tier lands. The town size and that share are the check's own
//   assumptions (s), printed with the result.
//
// It is an estimate of the doc's kind, not a played game: it says whether a
// change to costs, rates or research times moves a tier a night or ten.
import {
  BuildingKind,
  CYCLE_STEPS,
  DAWN_STEPS,
  DAY_STEPS,
  DUSK_STEPS,
  FACILITY_UPKEEP,
  FARM_TIER_PER_MILLE,
  Item,
  itemSpec,
  levelSpec,
  PLANK_STEPS,
  PROPS,
  RECIPES,
  Res,
  RESEARCH,
  Research,
  RESOURCES,
  buildingSpec,
  STEPS_PER_SECOND,
  type Cost,
} from '@blockyrts/sim';

/** A walk to the node and back with each load: 30 m out (s; the doc's pacing check uses 20 s). */
const WALK_S = 20;
/** Extra walking per load for things that lie farther out, seconds a load (s): Fringe clay, marble and hardwood, Deepwoods vein iron by ox cart, Barrens sulphur. */
const FAR_S: Partial<Record<number, number>> = {
  [Res.HardwoodLumber]: 40,
  [Res.Clay]: 40,
  [Res.Marble]: 60,
  [Res.Saltpetre]: 60,
  [Res.Sulphur]: 600,
  [Res.Coal]: 40,
};
/** Things with no node or recipe to time them by (s): vein iron from a ridge seam or a mineshaft (about 60 s a load of 5 with the walk), a hide from a hunt. */
const FIXED_S: Partial<Record<number, number>> = { [Res.VeinIron]: 12, [Res.Hides]: 40 };

/** Worker-seconds per working day: the day, dusk and dawn (workers shelter at night). */
export const WORK_S_PER_DAY = (DAY_STEPS + DUSK_STEPS + DAWN_STEPS) / STEPS_PER_SECOND;

/** The check's assumptions (s): workers by day, and the share of their day spent on the tech ladder (the rest feeds, guards and lights the town). */
export interface PacingAssumptions {
  /** Workers at the start, and how many more each day (the doc: 6 by day 5 to 6, 10 by day 11 to 13). */
  startWorkers: number;
  workersPerDay: number;
  maxWorkers: number;
  /** Per mille of the working day on the ladder. */
  ladderSharePm: number;
}

export const DEFAULT_ASSUMPTIONS: PacingAssumptions = { startWorkers: 4, workersPerDay: 0.5, maxWorkers: 40, ladderSharePm: 500 };

const sec = (steps: number): number => steps / STEPS_PER_SECOND;

/** Worker-seconds for one unit of a resource: memoised, cheapest way. */
export function resourceCost(): (res: number) => number {
  const memo = new Map<number, number>();
  const busy = new Set<number>();
  const byName = new Map(PROPS.filter((p) => p.perLoad > 0 && p.resource).map((p) => [p.resource, p] as const));
  const cost = (res: number): number => {
    const known = memo.get(res);
    if (known !== undefined) return known;
    if (busy.has(res)) return Infinity;
    busy.add(res);
    let best = Infinity;
    best = FIXED_S[res] ?? Infinity;
    // Planks at the lumber mill: 1 lumber gives 1 plank (Table 2b).
    if (res === Res.Planks) best = sec(PLANK_STEPS) + cost(Res.SoftwoodLumber);
    const info = RESOURCES[res];
    const prop = info ? byName.get(info.name.toLowerCase()) : undefined;
    if (prop) best = Math.min(best, (sec(prop.loadSteps) + WALK_S + (FAR_S[res] ?? 0)) / prop.perLoad);
    for (const r of RECIPES) {
      const out = r.outputs.find(([o]) => o === res);
      if (!out || r.cooked) continue;
      for (const inputs of r.inputs) {
        let c = sec(r.steps);
        for (const [i, n] of inputs) c += n * cost(i);
        best = Math.min(best, c / out[1]);
      }
    }
    busy.delete(res);
    memo.set(res, best);
    return best;
  };
  return cost;
}

/** Worker-seconds to pay a cost. */
function costOf(c: Cost, unit: (res: number) => number): number {
  let s = 0;
  for (const [r, n] of c) s += n * unit(r);
  return s;
}

/** One rung: a building level, a research step, or kits made. */
type Rung = { building: number; level: number } | { research: number } | { item: number; count: number };

/** A tier the pacing check times: its target nights (Balance notes) and the ladder up to it. */
export interface Tier {
  name: string;
  /** Target nights (s, the Balance notes' pacing check). */
  target: readonly [number, number];
  rungs: readonly Rung[];
}

const B = (building: number, level: number): Rung => ({ building, level });
const R = (research: number): Rung => ({ research });
const K = (item: number, count: number): Rung => ({ item, count });
/** Main base levels 2 to n (the Big House is level 1 and comes with the start). */
const base = (n: number): Rung[] => Array.from({ length: n - 1 }, (_, k) => B(BuildingKind.MainBase, k + 2));

/** The ladder (only its structure; every cost, time and rate comes from the sim). Each tier includes the ones before. */
export const TIERS: readonly Tier[] = [
  {
    name: 'Bronze', target: [4, 6],
    rungs: [B(BuildingKind.Forge, 1), B(BuildingKind.ScholarsLodge, 1), R(Research.Bronze), K(Item.SwordBronze, 5), K(Item.ArmourBronzeScale, 5), K(Item.ShieldBronze, 5)],
  },
  {
    name: 'Wrought iron, crossbows and mail', target: [13, 18],
    rungs: [...base(5), B(BuildingKind.Kiln, 1), B(BuildingKind.Forge, 2), B(BuildingKind.Forge, 3), R(Research.Crossbows), K(Item.Crossbow, 4), K(Item.MailWrought, 10)],
  },
  {
    name: 'Steel', target: [25, 30],
    rungs: [B(BuildingKind.MainBase, 6), B(BuildingKind.MainBase, 7), B(BuildingKind.Forge, 4), R(Research.Steel), K(Item.SwordSteel, 8)],
  },
  {
    name: 'Muskets and cannons', target: [40, 48],
    rungs: [B(BuildingKind.PowderMill, 1), B(BuildingKind.MainBase, 8), B(BuildingKind.Foundry, 1), B(BuildingKind.GunneryYard, 1), R(Research.Gunpowder), R(Research.Muskets), R(Research.Cannons), K(Item.MusketSteel, 8)],
  },
];

export interface TierRow {
  tier: string;
  target: string;
  /** Build work (ws) on the ladder for this tier, worker-seconds. */
  buildS: number;
  /** Materials for the buildings, research fees and kits, worker-seconds. */
  materialS: number;
  /** Research time at the Lodge, seconds. */
  researchS: number;
  /** Day the tier lands, and whether that is inside the target. */
  night: number;
  verdict: 'early' | 'on target' | 'late';
}

/** The pacing check: when each tier lands with the sim's current tables. */
export function pacingCheck(a: PacingAssumptions = DEFAULT_ASSUMPTIONS): TierRow[] {
  const unit = resourceCost();
  const rows: TierRow[] = [];
  let needed = 0;
  let paid = 0;
  let day = 0;
  for (const t of TIERS) {
    let buildS = 0;
    let materialS = 0;
    let researchS = 0;
    for (const r of t.rungs) {
      if ('building' in r) {
        const l = levelSpec(r.building, r.level);
        buildS += l.ws;
        materialS += costOf(l.cost, unit);
      } else if ('research' in r) {
        const spec = RESEARCH[r.research]!;
        researchS += sec(spec.steps);
        materialS += costOf(spec.cost, unit);
      } else {
        const it = itemSpec(r.item);
        const recipe = it.recipes[0] ?? [];
        materialS += r.count * (costOf(recipe, unit) + sec(it.steps)) / Math.max(1, it.makes);
      }
    }
    if (!Number.isFinite(buildS + materialS)) throw new Error(`pacing: a cost on the ${t.name} ladder cannot be made from anything`);
    needed += buildS + materialS;
    // Day by day, the town pays the ladder with its share of the working day.
    while (paid < needed) {
      const workers = Math.min(a.maxWorkers, a.startWorkers + a.workersPerDay * day);
      paid += (workers * WORK_S_PER_DAY * a.ladderSharePm) / 1000;
      day++;
    }
    // The research runs after the buildings it needs, a day of Lodge time being the working day.
    const night = Math.ceil(day + researchS / (CYCLE_STEPS / STEPS_PER_SECOND));
    rows.push({
      tier: t.name,
      target: `${t.target[0]} to ${t.target[1]}`,
      buildS: Math.round(buildS),
      materialS: Math.round(materialS),
      researchS: Math.round(researchS),
      night,
      verdict: night < t.target[0] ? 'early' : night > t.target[1] ? 'late' : 'on target',
    });
  }
  return rows;
}

/** The night 110 town (Balance notes): the units it keeps, and the farms and main base that carry them. */
export interface SupplyAssumptions {
  warriors: number;
  mages: number;
  workers: number;
  lodges: number;
  mainBaseLevel: number;
  /** Tier 3 wheat fields. */
  fields: number;
  fieldLevel: number;
}

/** About 105 units (Balance notes): 45 warriors and 6 mages of the night 110 defence, 52 workers, 2 Lodges (s). */
export const NIGHT_110_TOWN: SupplyAssumptions = { warriors: 45, mages: 6, workers: 52, lodges: 2, mainBaseLevel: 10, fields: 10, fieldLevel: 3 };

export interface SupplyRow {
  supplyCap: number;
  supplyUsed: number;
  nutritionPerDay: number;
  /** Nutrition one tier 3 wheat farmer makes a day as bread. */
  perFarmer: number;
  farmersNeeded: number;
  farmersRoom: number;
  ok: boolean;
}

/** Supply and food at night 110 from the sim's tables. */
export function supplyCheck(t: SupplyAssumptions = NIGHT_110_TOWN): SupplyRow {
  const field = levelSpec(BuildingKind.CropField, t.fieldLevel);
  const supplyCap = levelSpec(BuildingKind.MainBase, t.mainBaseLevel).supply + t.fields * field.supply;
  const units = t.warriors + t.mages + t.workers;
  const supplyUsed = units + t.lodges;
  const nutritionPerDay = (units + t.lodges) * FACILITY_UPKEEP;
  const wheat = buildingSpec(BuildingKind.CropField).crops!.find((c) => c.res === Res.Wheat)!;
  const bread = RECIPES.find((r) => r.outputs.some(([o]) => o === Res.Bread))!;
  const wheatPerBread = bread.inputs[0]!.find(([r]) => r === Res.Wheat)![1] / bread.outputs[0]![1];
  const perFarmer = (wheat.perDay * FARM_TIER_PER_MILLE[t.fieldLevel - 1]!) / 1000 / wheatPerBread * RESOURCES[Res.Bread]!.nutrition;
  const farmersNeeded = Math.ceil(nutritionPerDay / perFarmer);
  const farmersRoom = t.fields * field.workers;
  return { supplyCap, supplyUsed, nutritionPerDay, perFarmer, farmersNeeded, farmersRoom, ok: supplyUsed <= supplyCap && farmersNeeded <= farmersRoom && farmersNeeded <= t.workers };
}
