import { describe, expect, it } from 'vitest';

import { createStylizedGrassField } from './StylizedEnvironment';

function createDeterministicRandom(): () => number {
  let value = 0x1234_5678;
  return () => {
    value += 0x6d2b_79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('createStylizedGrassField', () => {
  it('preserves backdrop placement when the legacy radius and scale band are explicit', () => {
    const build = (descriptorDriven: boolean) =>
      createStylizedGrassField({
        count: 24,
        time: { value: 0 },
        heightAt: () => 4,
        random: createDeterministicRandom(),
        ...(descriptorDriven
          ? { radiusMeters: 75, minBladeHeight: 0.62, maxBladeHeight: 1.5 }
          : {}),
      });

    const legacy = build(false);
    const descriptorDriven = build(true);

    expect(descriptorDriven.count).toBe(legacy.count);
    expect(Array.from(descriptorDriven.instanceMatrix.array)).toEqual(
      Array.from(legacy.instanceMatrix.array),
    );
  });
});
