// How the sim's integer values read to a person: steps as seconds, basis
// points as percent, world units as metres. Every unit is a fixed scale, so
// a value typed in the editor turns back into the sim's integer exactly
// (rounded to the nearest one the sim can hold).

import { STEPS_PER_SECOND, WU_PER_METRE } from '@blockyrts/sim';

export type UnitId =
  | 'number' | 'seconds' | 'workerSeconds' | 'percentBp' | 'percentPm' | 'percent' | 'metresWu' | 'speed'
  | 'metresCm' | 'metres' | 'squareMetres' | 'health' | 'damage' | 'lbTenths' | 'tenths' | 'xpTenths' | 'level'
  | 'count' | 'nutrition' | 'night' | 'perMilleRaw';

export interface UnitSpec {
  /** Shown after the value; '' for none. */
  suffix: string;
  /** Raw sim value = shown value x scale. */
  scale: number;
  /** Explains the unit in a tooltip. */
  hint: string;
}

export const UNITS: Readonly<Record<UnitId, UnitSpec>> = {
  number: { suffix: '', scale: 1, hint: '' },
  count: { suffix: '', scale: 1, hint: 'a count' },
  level: { suffix: '', scale: 1, hint: 'a level' },
  night: { suffix: '', scale: 1, hint: 'a night number (the first night is night 0)' },
  seconds: { suffix: 's', scale: STEPS_PER_SECOND, hint: `seconds (the sim counts ${STEPS_PER_SECOND} steps a second)` },
  workerSeconds: { suffix: 'ws', scale: 1, hint: 'worker-seconds: one worker for this many seconds, two workers for half' },
  percentBp: { suffix: '%', scale: 100, hint: 'percent (held as basis points, 1% = 100)' },
  percentPm: { suffix: '%', scale: 10, hint: 'percent (held per mille, 1% = 10)' },
  perMilleRaw: { suffix: '‰', scale: 1, hint: 'per mille (1000 = all)' },
  percent: { suffix: '%', scale: 1, hint: 'percent' },
  metresWu: { suffix: 'm', scale: WU_PER_METRE, hint: `metres (held as world units, ${WU_PER_METRE} to a metre)` },
  speed: { suffix: 'm/s', scale: WU_PER_METRE / STEPS_PER_SECOND, hint: 'metres a second (held as world units a step)' },
  metresCm: { suffix: 'm', scale: 100, hint: 'metres (held in centimetres)' },
  metres: { suffix: 'm', scale: 1, hint: 'metres' },
  squareMetres: { suffix: 'm²', scale: 1, hint: 'square metres' },
  health: { suffix: 'HP', scale: 1, hint: 'health points' },
  damage: { suffix: 'dmg', scale: 1, hint: 'damage per hit, before armour' },
  lbTenths: { suffix: 'lb', scale: 10, hint: 'pounds (held in tenths)' },
  tenths: { suffix: '', scale: 10, hint: 'held in tenths' },
  xpTenths: { suffix: 'XP', scale: 10, hint: 'experience (held in tenths)' },
  nutrition: { suffix: 'nutrition', scale: 1, hint: 'nutrition points' },
};

/** The raw value as shown, with no trailing zeros. */
export function toDisplay(raw: number, unit: UnitId): string {
  const { scale } = UNITS[unit];
  if (scale === 1) return String(raw);
  const v = raw / scale;
  // Enough places for the scale (8000 needs 4), then trim.
  const places = Math.ceil(Math.log10(scale)) + 1;
  return String(Number(v.toFixed(places)));
}

/** What a person typed, as the sim's integer, or null when it is not a number. */
export function fromDisplay(text: string, unit: UnitId): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * UNITS[unit].scale);
}

/** The step the number box moves by: one sim unit, shown in the display unit. */
export function displayStep(unit: UnitId): number {
  return 1 / UNITS[unit].scale;
}

/** The value with its unit, for lists: "15 s", "20%", "Yes". */
export function formatValue(raw: number | boolean, unit: UnitId): string {
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  const s = UNITS[unit].suffix;
  return s ? `${toDisplay(raw, unit)} ${s}` : toDisplay(raw, unit);
}
