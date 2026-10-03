// Workers' tools by job (Table 2c). A worker has one tool kit tier (Troops
// and gear: workers' tools), which gives it a tool for each job: the axe
// chops, the digging stick, maul or pickaxe breaks (quarrying, digging,
// mining), the mallet or hammer builds, the knife or sickle cuts. Tier 2's
// kit is the flint axe and knife with the stone maul and stone hammer;
// every other tier's is one set doing every job.

import type { MeleeStats } from '../combat/items.ts';
import { toolMelee, toolTierFor } from './kits.ts';
import { Tool, ToolJob } from '../world/props.ts';
import { OrderKind, type EntityStore } from '../state.ts';

type ToolField = 'toolChop' | 'toolBreak' | 'toolBuild' | 'toolCut';
/** The entity field of each job, in ToolJob order. */
export const TOOL_FIELDS: readonly ToolField[] = ['toolChop', 'toolBreak', 'toolBuild', 'toolCut'];

/** The tool (a gear id) a unit holds for a job, or 0. */
export function toolFor(e: EntityStore, i: number, job: ToolJob): number {
  return e[TOOL_FIELDS[job]!][i]!;
}

/** The tier a unit's tool gives a job (Tool.None with no tool for it). */
export function toolTier(e: EntityStore, i: number, job: ToolJob): number {
  return toolTierFor(toolFor(e, i, job), job);
}

/** The distinct tools a unit holds, in job order. */
export function heldTools(e: EntityStore, i: number): number[] {
  const out: number[] = [];
  for (const f of TOOL_FIELDS) {
    const v = e[f][i]!;
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** The tool a worker fights with: the highest damage, then the quicker; 0 for fists. */
export function fightingTool(e: EntityStore, i: number): number {
  let best = 0;
  let bestM = toolMelee(0);
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
  return 0;
}

const METALS = ['copper', 'bronze', 'wrought iron', 'iron', 'steel', 'carbon steel'];
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
  for (let t = tier; t <= Tool.CarbonSteel; t++) {
    const n = toolName(job, t);
    if (n) return n;
  }
  return '';
}
