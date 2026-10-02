import { describe, expect, it } from 'vitest';
import { readManifest } from '../src/assets-manifest.ts';

describe('the assets manifest reader', () => {
  it('reads rows and skips the header and divider', () => {
    const text = [
      '| id | path | cube count | texture size | deviation and reason |',
      '|---|---|---|---|---|',
      '| wolf | models/animals/wolf/wolf.bbmodel | 31 | 64 | kept at 5 cm per unit |',
    ].join('\n');
    expect(readManifest(text)).toEqual([
      { id: 'wolf', path: 'models/animals/wolf/wolf.bbmodel', cubes: '31', texture: '64', deviation: 'kept at 5 cm per unit' },
    ]);
  });
});
