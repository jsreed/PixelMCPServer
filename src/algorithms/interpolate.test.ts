import { describe, it, expect } from 'vitest';
import { interpolateFrames } from './interpolate.js';

describe('interpolateFrames', () => {
  // 1. count=0 returns empty array
  it('returns empty array when count=0', () => {
    const a = [[1, 2]];
    const b = [[3, 4]];
    expect(interpolateFrames(a, b, 0)).toEqual([]);
  });

  // 2. count < 0 returns empty array
  it('returns empty array when count is negative', () => {
    const a = [[1, 2]];
    const b = [[3, 4]];
    expect(interpolateFrames(a, b, -1)).toEqual([]);
  });

  // 3. Empty input grids return empty array
  it('returns empty array for empty input grids', () => {
    expect(interpolateFrames([], [], 2)).toEqual([]);
  });

  // 4. Dimension mismatch returns empty array
  it('returns empty array when grids differ in height', () => {
    const a = [[1, 2]];
    const b = [
      [3, 4],
      [5, 6],
    ];
    expect(interpolateFrames(a, b, 1)).toEqual([]);
  });

  it('returns empty array when grids differ in width', () => {
    const a = [[1, 2]];
    const b = [[3, 4, 5]];
    expect(interpolateFrames(a, b, 1)).toEqual([]);
  });

  // 5. count=1: t=0.5 picks celB (t < 0.5 is false at exactly 0.5)
  it('count=1 picks celB values (t=0.5 is not < 0.5)', () => {
    const a = [[1, 1]];
    const b = [[2, 2]];
    const result = interpolateFrames(a, b, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([[2, 2]]);
  });

  // 6. count=2: t=1/3 picks celA, t=2/3 picks celB
  it('count=2 produces correct threshold blend', () => {
    const a = [[1, 1]];
    const b = [[2, 2]];
    const result = interpolateFrames(a, b, 2);
    expect(result).toHaveLength(2);
    // i=0: t=1/3 < 0.5 → celA
    expect(result[0]).toEqual([[1, 1]]);
    // i=1: t=2/3 >= 0.5 → celB
    expect(result[1]).toEqual([[2, 2]]);
  });

  // 7. Both pixels transparent => 0
  it('returns transparent frames when both grids are all-zero', () => {
    const a = [[0, 0]];
    const b = [[0, 0]];
    const result = interpolateFrames(a, b, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([[0, 0]]);
    expect(result[1]).toEqual([[0, 0]]);
  });

  // 8. celA non-zero, celB zero => early frames celA, late frames 0
  it('early frames use celA when celA is non-zero and celB is zero', () => {
    const a = [[5, 5]];
    const b = [[0, 0]];
    const result = interpolateFrames(a, b, 2);
    // i=0: t=1/3 < 0.5 → celA value 5
    expect(result[0]).toEqual([[5, 5]]);
    // i=1: t=2/3 >= 0.5 → celB value 0
    expect(result[1]).toEqual([[0, 0]]);
  });

  // 9. celA zero, celB non-zero => early frames 0, late frames celB
  it('late frames use celB when celA is zero and celB is non-zero', () => {
    const a = [[0, 0]];
    const b = [[7, 7]];
    const result = interpolateFrames(a, b, 2);
    // i=0: t=1/3 < 0.5 → celA value 0
    expect(result[0]).toEqual([[0, 0]]);
    // i=1: t=2/3 >= 0.5 → celB value 7
    expect(result[1]).toEqual([[7, 7]]);
  });

  // 10. Both non-zero different => early celA, late celB
  it('blends from celA to celB for non-zero different values', () => {
    const a = [[3, 3]];
    const b = [[9, 9]];
    const result = interpolateFrames(a, b, 2);
    expect(result[0]).toEqual([[3, 3]]);
    expect(result[1]).toEqual([[9, 9]]);
  });

  // 11. Does not mutate input arrays
  it('does not mutate input grids', () => {
    const a = [[1, 2]];
    const b = [[3, 4]];
    const aCopy = [[1, 2]];
    const bCopy = [[3, 4]];
    interpolateFrames(a, b, 3);
    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  // 12. Preserves grid dimensions
  it('output frames have the same dimensions as input', () => {
    const a = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const b = [
      [7, 8, 9],
      [10, 11, 12],
    ];
    const result = interpolateFrames(a, b, 3);
    expect(result).toHaveLength(3);
    for (const frame of result) {
      expect(frame).toHaveLength(2);
      expect(frame[0]).toHaveLength(3);
      expect(frame[1]).toHaveLength(3);
    }
  });
});
