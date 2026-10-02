import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/gen-number-tables.ts';

describe('packages/sim/src/data/number-tables.ts', () => {
  it('is up to date with docs/blueprint.md (run pnpm --filter @blockyrts/tools gen:tables)', () => {
    const committed = readFileSync(fileURLToPath(new URL('../../sim/src/data/number-tables.ts', import.meta.url)), 'utf8');
    expect(committed === generate()).toBe(true);
  });
});
