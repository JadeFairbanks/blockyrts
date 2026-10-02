// Workers' tools by job (Table 2c; Equipping units: tools by job). A worker
// holds one tool for each job: the axe chops, the digging stick, maul or
// pickaxe breaks (quarrying, digging, mining), the mallet or hammer builds,
// the knife or sickle cuts. A tier's set (hardwood, then copper upward) is
// one item that does every job; the stone maul, the stone hammer and the
// flint axe and knife each do only theirs, so one set item can sit in some
// jobs while single tools sit in the others.

import { Item, ITEMS, itemSpec, Slot, toolMelee, toolTierFor, type MeleeStats } from '../combat/items.ts';
import { Tool, TOOL_JOBS, ToolJob } from '../world/props.ts';
import { OrderKind, type EntityStore } from '../state.ts';

type ToolField = 'toolChop' | 'toolBreak' | 'toolBuild' | 'toolCut';
/** The entity field of each job, in ToolJob order. */
export const TOOL_FIELDS: readonly ToolField[] = ['toolChop', 'toolBreak', 'toolBuild', 'toolCut'];

/** The tool item a unit holds for a job, or 0. */
export function toolFor(e: EntityStore, i: number, job: ToolJob): number {
  return e[TOOL_FIELDS[job]!][i]!;
}

/** The tier a unit's tool gives a job (Tool.None with no tool for it). */
export function toolTier(e: EntityStore, i: number, job: ToolJob): number {
  return toolTierFor(toolFor(e, i, job), job);
}

/** The distinct tool items a unit holds, in job order. */
export function heldTools(e: EntityStore, i: number): number[] {
  const out: number[] = [];
  for (const f of TOOL_FIELDS) {
    const v = e[f][i]!;
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Whether a unit holds an item in any job. */
function holds(e: EntityStore, i: number, item: number): boolean {
  for (const f of TOOL_FIELDS) if (e[f][i] === item) return true;
  return false;
}

/**
 * Puts a tool on: it fills every job it does (all of them for a set). The
 * tools it pushes out of every job go back to the stock. 0 hands every tool in.
 */
export function putOnTool(e: EntityStore, i: number, item: number, stock: Int32Array): void {
  const before = heldTools(e, i);
  const jobs = item ? (itemSpec(item).jobs ?? 0) : (1 << TOOL_JOBS) - 1;
  for (let j = 0; j < TOOL_JOBS; j++) if ((jobs & (1 << j)) !== 0) e[TOOL_FIELDS[j]!][i] = item;
  for (const old of before) if (old !== item && !holds(e, i, old)) stock[old] = stock[old]! + 1;
}

/** Tool items in stock, the best tier first (then the lower id). */
function toolsInStock(stock: Int32Array): number[] {
  return ITEMS.filter((it) => it.slot === Slot.Tool && it.tool !== undefined && stock[it.id]! > 0)
    .sort((a, b) => b.tool! - a.tool! || a.id - b.id)
    .map((it) => it.id);
}

/**
 * Equip Best for a worker's tools (s): going down the stock from the best
 * tier, each tool is taken if it beats what the worker has for one of its
 * jobs, and goes only into the jobs it beats. So a copper set replaces a
 * flint axe and a stone maul alike, a flint axe and knife beat the hardwood
 * axe and hoe but leave the hardwood digging stick and mallet, and a worker
 * with nothing takes the hardwood set for whatever the better tools left
 * empty. Returns how many tools it would take; with `take`, takes them from
 * the stock and puts them on, handing in what they replace.
 */
export function bestTools(e: EntityStore, i: number, stock: Int32Array, take: boolean): number {
  const tiers: number[] = [];
  for (let j = 0; j < TOOL_JOBS; j++) tiers.push(toolTier(e, i, j as ToolJob));
  const picks: Array<{ item: number; jobs: number }> = [];
  for (const id of toolsInStock(stock)) {
    const sp = itemSpec(id);
    let jobs = 0;
    for (let j = 0; j < TOOL_JOBS; j++) {
      if ((sp.jobs! & (1 << j)) !== 0 && sp.tool! > tiers[j]!) {
        jobs |= 1 << j;
        tiers[j] = sp.tool!;
      }
    }
    if (jobs) picks.push({ item: id, jobs });
  }
  if (!take) return picks.length;
  const before = heldTools(e, i);
  for (const p of picks) {
    stock[p.item] = stock[p.item]! - 1;
    for (let j = 0; j < TOOL_JOBS; j++) if ((p.jobs & (1 << j)) !== 0) e[TOOL_FIELDS[j]!][i] = p.item;
  }
  for (const old of before) if (!holds(e, i, old)) stock[old] = stock[old]! + 1;
  return picks.length;
}

/** The tool a worker fights with: the highest damage, then the quicker; 0 for fists. */
export function fightingTool(e: EntityStore, i: number): number {
  let best: number = Item.None;
  let bestM = toolMelee(Item.None);
  for (const item of heldTools(e, i)) {
    const m = toolMelee(item);
    if (m.damage > bestM.damage || (m.damage === bestM.damage && m.attackSteps < bestM.attackSteps)) {
      best = item;
      bestM = m;
    }
  }
  return best;
}

/** A worker's blow with its fighting tool, or its fists. */
export function workerMelee(e: EntityStore, i: number): MeleeStats {
  return toolMelee(fightingTool(e, i));
}

/** The tool a worker has in hand for what it is doing now (Seeing equipment), or 0. */
export function toolInHand(e: EntityStore, i: number): number {
  const q = e.queue[i]![0];
  if (q && (q.t === 'work' || q.t === 'repairAll' || q.t === 'refuel') && e.order[i] === OrderKind.Chop) return toolFor(e, i, ToolJob.Build);
  switch (e.order[i]) {
    case OrderKind.Chop:
      return toolFor(e, i, ToolJob.Chop);
    case OrderKind.Mine:
    case OrderKind.Dig:
      return toolFor(e, i, ToolJob.Break);
    case OrderKind.Farm:
      return toolFor(e, i, ToolJob.Cut);
    case OrderKind.Attack:
      return fightingTool(e, i);
  }
  return Item.None;
}

const METALS = ['copper', 'bronze', 'bloom iron', 'wrought iron', 'refined iron', 'steel', 'high-quality steel'];
/** Each job's tool by tier from hardwood to flint (Table 2c); copper and up are the metal's axe, pickaxe, hammer and sickle. */
const EARLY: readonly (readonly string[])[] = [
  ['hardwood axe', '', 'flint axe'],
  ['digging stick', 'stone maul', ''],
  ['hardwood mallet', 'stone hammer', ''],
  ['hardwood hoe', '', 'flint knife'],
];
const METAL_TOOL = ['axe', 'pickaxe', 'hammer', 'sickle'];

/** The name of the tool a job takes at a tier, as "Tool needed" says it ("stone maul", "copper pickaxe"); '' where that tier has none. */
export function toolName(job: ToolJob, tier: number): string {
  if (tier <= Tool.None) return '';
  if (tier < Tool.Copper) return EARLY[job]![tier - Tool.Hardwood] ?? '';
  return `${METALS[tier - Tool.Copper]} ${METAL_TOOL[job]}`;
}

/** The weakest tool that does a job at a tier or better: the stone maul for copper ore, a flint axe for birch. */
export function toolNeeded(job: ToolJob, tier: number): string {
  for (let t = tier; t <= Tool.HighQualitySteel; t++) {
    const n = toolName(job, t);
    if (n) return n;
  }
  return '';
}
