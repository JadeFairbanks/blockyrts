// The woodsman's Fish and Forage buttons on the screen (Patch 5, Jade's WD-1,
// WD-5 and CT-1): which nodes each works on, and whether his woods order has
// fishing or foraging on.
import { isFish, isForage, Keep, PROPS, STEPS_PER_SECOND, type UnitOrder } from '@blockyrts/sim';

/** What a woods button does: 1 fish, 2 forage (sim orders.ts WoodsOrder.what). */
export type WoodsWhat = 1 | 2;

/** Each prop's node type key (world-view.ts propSelectable: 'node:<its name>') to its kind. */
const KIND_BY_TYPE = new Map(PROPS.map((p) => [`node:${p.name.toLowerCase()}`, p.kind]));

/** What a woodsman does at a node: fish a fish stretch (1), forage wild food (2), or nothing there (0). */
export function woodsWhat(typeKey: string): WoodsWhat | 0 {
  const kind = KIND_BY_TYPE.get(typeKey);
  if (kind === undefined) return 0;
  if (isFish(kind)) return 1;
  return isForage(kind) ? 2 : 0;
}

/** Whether every one of these woodsmen has fishing (1) or foraging (2) on in his woods order now. */
export function woodsOn(queues: ReadonlyMap<number, readonly UnitOrder[]>, ids: readonly number[], what: WoodsWhat): boolean {
  return (
    ids.length > 0 &&
    ids.every((id) => {
      const o = queues.get(id)?.[0];
      return o?.t === 'woods' && (what === 1 ? o.fish : o.forage) !== 0;
    })
  );
}

/** Quarters of food as the screen writes them: 6, 2.5 or 0.25. */
function food(quarters: number): string {
  const v = quarters / 4;
  return quarters % 4 === 0 ? String(v) : quarters % 2 === 0 ? v.toFixed(1) : v.toFixed(2);
}

/**
 * The woodsman's food line (Jade's WD-7): what he brought in against what he
 * ate over the last 10 minutes, or his life if shorter, coloured by Keep
 * (red: he does not pay his keep; yellow; green: more than 3 food over every
 * 3 meals).
 */
export function woodsLineText(l: { brought: number; ate: number; steps: number }): string {
  const s = Math.max(1, Math.round(l.steps / STEPS_PER_SECOND));
  const span = s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
  return `Food in ${food(l.brought)}, eaten ${food(l.ate)} (last ${span})`;
}

/** The colour class of a food line, by sim Keep. */
export function woodsLineClass(keep: number): string {
  return keep === Keep.Red ? 'keep-red' : keep === Keep.Green ? 'keep-green' : 'keep-yellow';
}
