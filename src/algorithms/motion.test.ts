import { describe, it, expect } from 'vitest';
import { subpixelShift, smearFrame } from './motion.js';

// ---------------------------------------------------------------------------
// subpixelShift
// ---------------------------------------------------------------------------

describe('subpixelShift', () => {
  it('returns empty array for empty input', () => {
    expect(subpixelShift([], 0.5, 1, 0)).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(subpixelShift([[], []], 0.5, 1, 0)).toEqual([]);
  });

  it('zero intensity returns a copy of the original', () => {
    const data = [
      [1, 2],
      [3, 4],
    ];
    const result = subpixelShift(data, 0, 1, 0);
    expect(result).toEqual(data);
  });

  it('shifts content rightward (positive dirX)', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    // intensity=1.0, dir=(1,0) → shift content right by 1 pixel
    const result = subpixelShift(data, 1.0, 1, 0);
    // Each pixel samples from (x-1, y)
    // x=0: src x=-1 → OOB → 0
    // x=1: src x=0 → data[y][0]
    // x=2: src x=1 → data[y][1]
    expect(result[0]).toEqual([0, 1, 2]);
    expect(result[1]).toEqual([0, 4, 5]);
  });

  it('shifts content downward (positive dirY)', () => {
    const data = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const result = subpixelShift(data, 1.0, 0, 1);
    // Each pixel samples from (x, y-1)
    expect(result[0]).toEqual([0, 0]); // y=0: src y=-1 → OOB
    expect(result[1]).toEqual([1, 2]); // y=1: src y=0
    expect(result[2]).toEqual([3, 4]); // y=2: src y=1
  });

  it('shifts content left (negative dirX)', () => {
    const data = [[1, 2, 3]];
    const result = subpixelShift(data, 1.0, -1, 0);
    // shift left by 1: samples from (x+1, y)
    expect(result[0]).toEqual([2, 3, 0]);
  });

  it('handles diagonal direction', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    // dir=(1,1) normalized to (√2/2, √2/2), intensity=1.0
    // offset ≈ (0.707, 0.707), rounded source = (x-1, y-1)
    const result = subpixelShift(data, 1.0, 1, 1);
    // (0,0): src ≈ (-0.7, -0.7) → round to (-1, -1) → OOB → 0
    // (1,1): src ≈ (0.3, 0.3) → round to (0, 0) → data[0][0] = 1
    // (2,2): src ≈ (1.3, 1.3) → round to (1, 1) → data[1][1] = 5
    expect(result[0][0]).toBe(0);
    expect(result[1][1]).toBe(1);
    expect(result[2][2]).toBe(5);
  });

  it('sub-pixel intensity (0.4) with rounding', () => {
    const data = [[1, 2, 3, 4, 5]];
    // intensity=0.4, dir=(1,0): offset=0.4
    // Each pixel samples from (x - 0.4), rounded:
    // x=0: round(-0.4)=0 → data[0][0]=1
    // x=1: round(0.6)=1 → data[0][1]=2
    const result = subpixelShift(data, 0.4, 1, 0);
    expect(result[0][0]).toBe(1); // round(-0.4) = 0 → data[0][0]
    expect(result[0][1]).toBe(2); // round(0.6) = 1 → data[0][1]
  });

  it('preserves dimensions', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const result = subpixelShift(data, 0.5, 1, 0);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(3);
  });

  it('normalizes direction vector', () => {
    const data = [[1, 2, 3]];
    // dir=(10, 0) should behave same as dir=(1, 0) — just direction matters
    const result1 = subpixelShift(data, 1.0, 1, 0);
    const result2 = subpixelShift(data, 1.0, 10, 0);
    expect(result1).toEqual(result2);
  });

  it('does not mutate the input', () => {
    const data = [
      [1, 2],
      [3, 4],
    ];
    const copy = data.map((r) => [...r]);
    subpixelShift(data, 0.5, 1, 0);
    expect(data).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// smearFrame
// ---------------------------------------------------------------------------

describe('smearFrame', () => {
  it('returns empty array for empty input', () => {
    expect(smearFrame([], 0.5, 1, 0)).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(smearFrame([[], []], 0.5, 1, 0)).toEqual([]);
  });

  it('zero intensity returns a copy of the original', () => {
    const data = [
      [1, 0, 0],
      [0, 0, 0],
    ];
    const result = smearFrame(data, 0, 1, 0);
    expect(result).toEqual(data);
  });

  it('smears pixels rightward into transparent areas', () => {
    const data = [[1, 0, 0, 0, 0]];
    const result = smearFrame(data, 1.0, 1, 0);
    // Pixel at (0,0)=1 should extend rightward
    expect(result[0][0]).toBe(1); // original
    // Some trailing pixels should also be 1
    const nonZero = result[0].filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(1);
  });

  it('smears pixels downward', () => {
    const data = [
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    const result = smearFrame(data, 1.0, 0, 1);
    expect(result[0][0]).toBe(1); // original
    // At least one pixel below should get smeared
    const col0 = result.map((r) => r[0]);
    const nonZeroBelow = col0.slice(1).filter((v) => v !== 0).length;
    expect(nonZeroBelow).toBeGreaterThan(0);
  });

  it('does not smear into non-transparent pixels', () => {
    const data = [[1, 2, 0, 0]];
    const result = smearFrame(data, 1.0, 1, 0);
    // Pixel at x=1 should remain 2 (it's non-transparent, not overwritten by smear from x=0)
    expect(result[0][1]).toBe(2);
  });

  it('preserves all original non-transparent pixels', () => {
    const data = [
      [3, 0, 5],
      [0, 2, 0],
    ];
    const result = smearFrame(data, 0.5, 1, 0);
    expect(result[0][0]).toBe(3);
    expect(result[0][2]).toBe(5);
    expect(result[1][1]).toBe(2);
  });

  it('respects direction — leftward smear', () => {
    const data = [[0, 0, 0, 0, 1]];
    const result = smearFrame(data, 1.0, -1, 0);
    expect(result[0][4]).toBe(1); // original
    // Some pixels to the left should get smeared
    const nonZero = result[0].slice(0, 4).filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(0);
  });

  it('preserves dimensions', () => {
    const data = [
      [1, 0, 0],
      [0, 2, 0],
    ];
    const result = smearFrame(data, 0.5, 1, 0);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(3);
  });

  it('does not mutate the input', () => {
    const data = [
      [1, 0, 0],
      [0, 0, 0],
    ];
    const copy = data.map((r) => [...r]);
    smearFrame(data, 0.5, 1, 0);
    expect(data).toEqual(copy);
  });
});
