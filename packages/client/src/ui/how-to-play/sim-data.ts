// The sim's modules for How to Play, bundled in at build time (only into
// How to Play's own chunk, which loads when the page opens): the pages read
// the live tables, so a rebuild picks up every change and every new table.
import type { SimDocs, SimModules } from '@blockyrts/balance';
import { docs } from 'virtual:sim-exports';

const raw = import.meta.glob<Record<string, unknown>>(['../../../../sim/src/**/*.ts', '!../../../../sim/src/**/*.test.ts'], { eager: true });

export const simModules: SimModules = Object.fromEntries(Object.entries(raw).map(([path, mod]) => [path.replace(/^.*\/sim\/src\//, ''), mod]));
export const simDocs: SimDocs = docs;
