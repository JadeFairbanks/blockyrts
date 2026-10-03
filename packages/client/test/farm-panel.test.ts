import { describe, expect, it } from 'vitest';
import { Res } from '@blockyrts/sim';
import { durationText, harvestText, itemsText } from '../src/hud/farm-panel.ts';
import type { FarmInfo } from '../src/messages.ts';

const farm = (o: Partial<FarmInfo> = {}): FarmInfo => ({ res: Res.Wheat, items: 6, food: 12, grows: true, done: 500, stepsLeft: 4400, band: '', ...o });

describe('the farm panel', () => {
  it('says a time with the right plurals', () => {
    expect(durationText(1)).toBe('1 second');
    expect(durationText(45)).toBe('45 seconds');
    expect(durationText(59.2)).toBe('1 minute');
    expect(durationText(60)).toBe('1 minute');
    expect(durationText(61)).toBe('1 minute 1 second');
    expect(durationText(120)).toBe('2 minutes');
    expect(durationText(220)).toBe('3 minutes 40 seconds');
  });

  it('names one item or many', () => {
    expect(itemsText(6, Res.Wheat)).toBe('6 wheat');
    expect(itemsText(1, Res.Wheat)).toBe('1 wheat');
    expect(itemsText(8, Res.Potatoes)).toBe('8 potatoes');
    expect(itemsText(1, Res.Potatoes)).toBe('1 potato');
    expect(itemsText(1, Res.Eggs)).toBe('1 egg');
    expect(itemsText(4, Res.Herbs)).toBe('4 medicinal herbs');
  });

  it('says when the harvest comes, how much and its food value', () => {
    expect(harvestText(farm())).toBe('In 3 minutes 40 seconds, 6 wheat will be produced, giving a food value of 12.');
    expect(harvestText(farm({ res: Res.Flax, food: 0, stepsLeft: 20 }))).toBe('In 1 second, 6 flax will be produced.');
    expect(harvestText(farm({ res: Res.Eggs, items: 1, food: 1, stepsLeft: 1200 }))).toBe('In 1 minute, 1 egg will be laid, giving a food value of 1.');
  });

  it('says why the bar stands still, and nothing where nothing grows', () => {
    expect(harvestText(farm({ stepsLeft: 0 }))).toBe('No farmer at work, so the bar stands still. When it fills, 6 wheat will be produced, giving a food value of 12.');
    expect(harvestText(farm({ grows: false, items: 0, food: 0, stepsLeft: 0 }))).toBe('');
  });
});
