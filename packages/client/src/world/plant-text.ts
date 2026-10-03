// What the selection panel says about a resource node or a growing plant
// (Jade's patch notes 1: a hazel picked bare is a "Hazel sapling" that holds
// nothing until it has grown; plants grow in steps). Pure text from the
// sim's tables, so it can be tested without a page.
import { canBuildOver, growthStages, propInfo, propJob, Stage, stageName, Tool, toolNeeded } from '@blockyrts/sim';

const STEPS_PER_MINUTE = 60 * 20;

/** "about 3 minutes", "about 1 minute", "under a minute". */
export function minutesText(steps: number): string {
  if (steps < STEPS_PER_MINUTE) return 'under a minute';
  const m = Math.round(steps / STEPS_PER_MINUTE);
  return `about ${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** The panel's name for a prop at a stage, with what it holds: "Young pine (7 softwood lumber)", "Hazel sapling". */
export function propLabel(kind: number, stage: number, amount: number): string {
  const info = propInfo(kind);
  const name = stageName(kind, stage);
  if (!info.resource) return info.yield === 0 ? `${name} (no lumber)` : name;
  return amount > 0 ? `${name} (${amount} ${info.resource})` : name;
}

/**
 * The panel's lines for a prop: who can gather it and with what, and for a
 * plant still growing, what it holds against what it will, its next stage
 * and when, and whether a building can go up over it.
 */
export function propDetails(kind: number, stage: number, amount: number, most: number, stepsToNext: number): string[] {
  const info = propInfo(kind);
  const lines: string[] = [];
  if (info.resource && amount > 0) {
    lines.push(`Gatherers: ${info.gatherers} at a time; ${info.perLoad} per load.`);
    lines.push(`Tool needed: ${info.tool === Tool.None ? 'none' : `a ${toolNeeded(propJob(kind), info.tool)} or better`}.`);
  }
  const stages = growthStages(kind);
  if (!stages || stage === Stage.Grown) return lines;
  const k = stages.findIndex((g) => g.stage === stage);
  if (info.resource) {
    // What it holds when grown: its full yield less what has been taken from it (the sim keeps a part-taken plant growing).
    const taken = Math.max(0, Math.floor((most * (stages[k]?.yieldPm ?? 1000)) / 1000) - amount);
    lines.push(amount > 0 ? `Still growing: ${amount} of the ${most - taken} ${info.resource} it holds when grown.` : `Holds nothing to gather yet: it grows ${info.resource} once it is bigger.`);
  }
  const next = k >= 0 ? stages[k + 1] : undefined;
  if (next && stepsToNext > 0) lines.push(`Grows into ${article(stageName(kind, next.stage))} in ${minutesText(stepsToNext)}.`);
  if (canBuildOver(kind, stage)) lines.push(stage === Stage.Seed ? 'Buildings can go over it: it is trampled.' : 'Buildings can go over it: the builder pulls it up first.');
  return lines;
}

/** "a young pine", "an oak", the name lower-cased after the article. */
function article(name: string): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return `${/^[aeiou]/i.test(lower) ? 'an' : 'a'} ${lower}`;
}
