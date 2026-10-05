// The night's threat budget for nights 1 to 100, worked out by the sim's own
// formula (combat/spawn.ts nightBudgetTenths) from the editor's current
// terms, so a changed term shows its effect on every night at once.

import { pathKey, type RawValue } from './schema.ts';
import type { SimModules } from './catalog.ts';

export const BUDGET_MODULE = 'combat/spawn.ts';
export const BUDGET_EXPORT = 'NIGHT_BUDGET';
export const BUDGET_NIGHTS = 100;

type Terms = Record<string, number>;
type Formula = (night: number, terms: Terms) => number;

export interface BudgetNight {
  night: number;
  /** Threat in tenths with the current terms. */
  tenths: number;
  /** Threat in tenths with the terms as the tables have them. */
  tableTenths: number;
}

export interface BudgetView {
  /** The terms as now set, by key (startTenths, rampTenths, ...). */
  terms: Terms;
  nights: BudgetNight[];
}

/** The terms' field ids, by key, or null when the sim has no night budget table. */
export function budgetFieldIds(mods: SimModules): Record<string, string> | null {
  const table = mods[BUDGET_MODULE]?.[BUDGET_EXPORT];
  if (!table || typeof table !== 'object') return null;
  return Object.fromEntries(Object.keys(table).map((k) => [k, pathKey(BUDGET_MODULE, [BUDGET_EXPORT, k])]));
}

/** Nights 1 to 100 with the current terms (`value` reads a field's current value) and with the tables' own. */
export function budgetView(mods: SimModules, value: (id: string) => RawValue | undefined): BudgetView | null {
  const mod = mods[BUDGET_MODULE];
  const ids = budgetFieldIds(mods);
  const formula = mod?.nightBudgetTenths as Formula | undefined;
  if (!mod || !ids || typeof formula !== 'function') return null;
  const table = mod[BUDGET_EXPORT] as Terms;
  const terms: Terms = {};
  for (const [k, id] of Object.entries(ids)) {
    const v = value(id);
    terms[k] = typeof v === 'number' ? v : table[k]!;
  }
  const nights: BudgetNight[] = [];
  for (let n = 1; n <= BUDGET_NIGHTS; n++) nights.push({ night: n, tenths: formula(n, terms), tableTenths: formula(n, table) });
  return { terms, nights };
}

/** The formula as it reads with the current terms: "12 + 1 × (n − 1) + 3n + 0.04n²". */
export function budgetFormulaText(t: Terms): string {
  const num = (x: number, scale: number): string => String(Number((x / scale).toFixed(3)));
  const parts = [num(t.startTenths ?? 0, 10)];
  if (t.rampTenths) parts.push(`${t.rampTenths === 10 ? '' : `${num(t.rampTenths, 10)} × `}(n − 1)`);
  if (t.perNightTenths) parts.push(`${num(t.perNightTenths, 10)}n`);
  if (t.curveThousandths) parts.push(`${num(t.curveThousandths, 1000)}n²`);
  const scale = t.scalePct ?? 100;
  return `${parts.join(' + ')}${scale === 100 ? '' : `, × ${scale}%`}`;
}
