import { describe, expect, it } from 'vitest';
import {
  applyBox,
  applyClick,
  inBox,
  isDoubleClick,
  isDrag,
  pickAt,
  priorityFilter,
  sameTypeInView,
  type ScreenItem,
  type SelInfo,
} from '../src/selection/rules.ts';
import { entityIdOf } from '../src/selection/types.ts';

const ME = 0;
type T = SelInfo;

function item(key: string, kind: T['kind'], owner: number, typeKey: string, x: number, y: number, depth = 10, half = 5): ScreenItem<T> {
  return { item: { key, kind, owner, typeKey }, rect: { x0: x - half, y0: y - half, x1: x + half, y1: y + half }, x, y, depth };
}

const w1 = item('e:1', 'unit', ME, 'worker', 100, 100);
const w2 = item('e:2', 'unit', ME, 'worker', 140, 100);
const war = item('e:3', 'unit', ME, 'warrior', 180, 100);
const hall = item('e:4', 'building', ME, 'hall', 300, 300, 10, 30);
const enemy = item('e:5', 'unit', 1, 'worker', 120, 160);
const pine1 = item('p:0:1', 'node', 255, 'node:pine', 400, 100);
const pine2 = item('p:0:2', 'node', 255, 'node:pine', 440, 120);
const rock = item('p:0:3', 'node', 255, 'node:stone', 480, 140);
const all = [w1, w2, war, hall, enemy, pine1, pine2, rock];
const keys = (list: readonly T[]): string[] => list.map((t) => t.key);

describe('click versus drag', () => {
  it('is a click under 4 px and a drag from 4 px', () => {
    expect(isDrag({ x: 10, y: 10 }, { x: 13, y: 10 })).toBe(false);
    expect(isDrag({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false); // 2.83 px
    expect(isDrag({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(true);
    expect(isDrag({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true); // 4.24 px
  });
});

describe('double click', () => {
  it('needs two clicks within 0.3 s and 4 px', () => {
    const a = { t: 1000, x: 50, y: 50 };
    expect(isDoubleClick(null, a)).toBe(false);
    expect(isDoubleClick(a, { t: 1300, x: 52, y: 51 })).toBe(true);
    expect(isDoubleClick(a, { t: 1301, x: 50, y: 50 })).toBe(false);
    expect(isDoubleClick(a, { t: 1100, x: 54, y: 50 })).toBe(false);
  });
});

describe('picking', () => {
  it('uses a padded hit area', () => {
    expect(pickAt(all, { x: 108, y: 100 })?.item.key).toBe('e:1'); // 3 px outside the box, inside the padding
    expect(pickAt(all, { x: 100, y: 125 })).toBeNull();
  });
  it('takes the one nearest the camera on overlap', () => {
    const near = item('e:9', 'unit', ME, 'worker', 102, 100, 5);
    expect(pickAt([w1, near], { x: 101, y: 100 })?.item.key).toBe('e:9');
    expect(pickAt([near, w1], { x: 101, y: 100 })?.item.key).toBe('e:9');
  });
  it('takes a unit behind a building over the building', () => {
    const house = item('b:7', 'building', ME, 'building:0:1', 100, 100, 5, 40);
    const behind = item('e:8', 'unit', ME, 'worker', 120, 90, 9);
    const enemyBehind = item('e:10', 'unit', 1, 'worker', 118, 92, 8);
    expect(pickAt([house, behind], { x: 120, y: 90 })?.item.key).toBe('e:8');
    // The nearest of the units under the point, own or not.
    expect(pickAt([house, behind, enemyBehind], { x: 119, y: 91 })?.item.key).toBe('e:10');
    // Away from any unit, the building.
    expect(pickAt([house, behind], { x: 80, y: 120 })?.item.key).toBe('b:7');
    // A resource node in front still wins by distance, as before.
    const tree = item('p:0:9', 'node', 255, 'node:pine', 120, 90, 2);
    expect(pickAt([house, behind, tree], { x: 120, y: 90 })?.item.key).toBe('p:0:9');
  });
  it('counts a thing in a box if any part of its hit area is inside', () => {
    expect(keys(inBox(all, { x0: 0, y0: 0, x1: 92, y1: 200 }).map((s) => s.item))).toEqual(['e:1']);
    expect(inBox(all, { x0: 0, y0: 0, x1: 80, y1: 80 })).toEqual([]);
  });
});

describe('priority rules', () => {
  const start = { x: 0, y: 0 };
  it('takes only own units when there are any', () => {
    expect(keys(priorityFilter(all, ME, start))).toEqual(['e:1', 'e:2', 'e:3']);
  });
  it('else own buildings', () => {
    expect(keys(priorityFilter([hall, enemy, pine1], ME, start))).toEqual(['e:4']);
  });
  it('else the single thing nearest the drag start', () => {
    expect(keys(priorityFilter([enemy, pine1, pine2], ME, { x: 450, y: 125 }))).toEqual(['p:0:2']);
    expect(keys(priorityFilter([enemy, pine1, pine2], ME, { x: 0, y: 200 }))).toEqual(['e:5']);
    expect(priorityFilter([], ME, start)).toEqual([]);
  });
});

describe('clicks', () => {
  const none = { shift: false, ctrl: false, double: false };
  it('replaces the selection', () => {
    expect(keys(applyClick([w1.item, w2.item], war.item, none, all, ME))).toEqual(['e:3']);
  });
  it('Shift toggles one', () => {
    expect(keys(applyClick([w1.item], w2.item, { ...none, shift: true }, all, ME))).toEqual(['e:1', 'e:2']);
    expect(keys(applyClick([w1.item, w2.item], w1.item, { ...none, shift: true }, all, ME))).toEqual(['e:2']);
  });
  it('Shift on something that cannot join selects it alone', () => {
    expect(keys(applyClick([w1.item], enemy.item, { ...none, shift: true }, all, ME))).toEqual(['e:5']);
  });
  it('double click and Ctrl select all own units of that type in view', () => {
    expect(keys(applyClick([], w1.item, { ...none, double: true }, all, ME))).toEqual(['e:1', 'e:2']);
    expect(keys(applyClick([war.item], w2.item, { ...none, ctrl: true }, all, ME))).toEqual(['e:1', 'e:2']);
  });
  it('double click on a resource node selects the nodes of its type', () => {
    expect(keys(applyClick([], pine2.item, { ...none, double: true }, all, ME))).toEqual(['p:0:1', 'p:0:2']);
  });
  it('double click on an enemy only inspects that one', () => {
    expect(keys(applyClick([], enemy.item, { ...none, double: true }, all, ME))).toEqual(['e:5']);
  });
  it('Ctrl + Shift adds the whole type, or removes it if the clicked one is selected', () => {
    const both = { ...none, ctrl: true, shift: true };
    expect(keys(applyClick([war.item], w1.item, both, all, ME))).toEqual(['e:3', 'e:1', 'e:2']);
    expect(keys(applyClick([war.item, w1.item, w2.item], w2.item, both, all, ME))).toEqual(['e:3']);
  });
  it('same type includes the clicked thing even if it is not in the list', () => {
    expect(keys(sameTypeInView([w2], w1.item, ME))).toEqual(['e:1', 'e:2']);
  });
});

describe('boxes', () => {
  it('an empty box keeps the selection', () => {
    expect(keys(applyBox([w1.item], [], false, ME))).toEqual(['e:1']);
  });
  it('replaces, or adds with Shift', () => {
    expect(keys(applyBox([w1.item], [war.item], false, ME))).toEqual(['e:3']);
    expect(keys(applyBox([w1.item], [war.item, w1.item], true, ME))).toEqual(['e:1', 'e:3']);
  });
  it('Shift never mixes an inspected thing into own units', () => {
    expect(keys(applyBox([w1.item], [pine1.item], true, ME))).toEqual(['e:1']);
    expect(keys(applyBox([], [pine1.item], true, ME))).toEqual(['p:0:1']);
  });
});

describe('keys', () => {
  it('reads entity ids', () => {
    expect(entityIdOf('e:12')).toBe(12);
    expect(entityIdOf('p:3:4')).toBeNull();
    expect(entityIdOf('e:x')).toBeNull();
  });
});
