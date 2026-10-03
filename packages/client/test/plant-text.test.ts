import { PropKind, Stage } from '@blockyrts/sim';
import { describe, expect, it } from 'vitest';
import { minutesText, propDetails, propLabel } from '../src/world/plant-text.ts';

const MINUTE = 60 * 20;

describe('what the panel says about growing plants', () => {
  it('calls a hazel picked bare a hazel sapling that holds nothing yet', () => {
    expect(propLabel(PropKind.Hazel, Stage.Sapling, 0)).toBe('Hazel sapling');
    const lines = propDetails(PropKind.Hazel, Stage.Sapling, 0, 10, 4 * MINUTE + 100);
    expect(lines).toContain('Holds nothing to gather yet: it grows hardwood sticks once it is bigger.');
    expect(lines).toContain('Grows into a young hazel bush in about 4 minutes.');
    expect(lines).toContain('Buildings can go over it: the builder pulls it up first.');
    // Nothing to gather, so no gatherer or tool lines.
    expect(lines.some((l) => l.startsWith('Gatherers'))).toBe(false);
  });

  it('names young trees with what they hold, and grown ones as before', () => {
    expect(propLabel(PropKind.Pine, Stage.Young, 7)).toBe('Young pine (7 softwood lumber)');
    expect(propLabel(PropKind.Pine, Stage.Grown, 20)).toBe('Pine (20 softwood lumber)');
    expect(propLabel(PropKind.Oak, Stage.Sapling, 0)).toBe('Great oak sapling');
    expect(propLabel(PropKind.DeadTree, Stage.Grown, 0)).toBe('Dead tree (no lumber)');
    const young = propDetails(PropKind.Pine, Stage.Young, 7, 20, 30);
    expect(young).toContain('Still growing: 7 of the 20 softwood lumber it holds when grown.');
    // Part-chopped young: 2 of its 7 left, so 15 when grown.
    expect(propDetails(PropKind.Pine, Stage.Young, 2, 20, 30)).toContain('Still growing: 2 of the 15 softwood lumber it holds when grown.');
    expect(young).toContain('Grows into a half-grown pine in under a minute.');
    expect(young.some((l) => l.startsWith('Buildings can go over'))).toBe(false);
    expect(propDetails(PropKind.Pine, Stage.Grown, 20, 20, -1).some((l) => l.startsWith('Grows'))).toBe(false);
  });

  it('says minute and minutes rightly', () => {
    expect(minutesText(MINUTE)).toBe('about 1 minute');
    expect(minutesText(2 * MINUTE)).toBe('about 2 minutes');
    expect(minutesText(MINUTE - 1)).toBe('under a minute');
  });
});
