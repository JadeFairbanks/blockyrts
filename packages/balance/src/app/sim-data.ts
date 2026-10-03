// The sim's modules, bundled in at build time: the editor reads the live
// tables, so a rebuild picks up every change and every new table.
import { docs, commit, builtAt } from 'virtual:sim-docs';
import type { SimModules } from '../core/catalog.ts';
import type { SimDocs } from '../core/docs.ts';

const raw = import.meta.glob<Record<string, unknown>>(['../../../sim/src/**/*.ts', '!../../../sim/src/**/*.test.ts'], { eager: true });

export const simModules: SimModules = Object.fromEntries(
  Object.entries(raw).map(([path, mod]) => [path.replace(/^.*\/sim\/src\//, ''), mod]),
);
export const simDocs: SimDocs = docs;
export { commit, builtAt };
