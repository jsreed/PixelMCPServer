import { describe, it, expect } from 'vitest';
import { checkerboard, noise, orderedDither, errorDiffusion } from './dither.js';

// ---------------------------------------------------------------------------
// checkerboard
// ---------------------------------------------------------------------------

describe('checkerboard', () => {
  it('returns empty array for zero dimensions', () => {
    expect(checkerboard(0, 4, 1, 2)).toEqual([]);
    expect(checkerboard(4, 0, 1, 2)).toEqual([]);
  });

  it('returns correct dimensions', () => {
    const result = checkerboard(6, 4, 1, 2);
    expect(result).toHaveLength(4);
    for (const row of result) expect(row).toHaveLength(6);
  });

  it('alternates colors: (0,0)=color1, (1,0)=color2, (0,1)=color2, (1,1)=color1', () => {
    const result = checkerboard(4, 4, 10, 20);
    expect(result[0][0]).toBe(10);
    expect(result[0][1]).toBe(20);
    expect(result[1][0]).toBe(20);
    expect(result[1][1]).toBe(10);
  });

  it('contains only the two specified colors', () => {
    const result = checkerboard(5, 5, 3, 7);
    for (const row of result) {
      for (const px of row) {
        expect([3, 7]).toContain(px);
      }
    }
  });

  it('1×1 grid returns color1', () => {
    expect(checkerboard(1, 1, 5, 9)).toEqual([[5]]);
  });

  it('produces the expected 3×3 pattern', () => {
    // (x+y)%2==0 → color1=1, else color2=2
    expect(checkerboard(3, 3, 1, 2)).toEqual([
      [1, 2, 1],
      [2, 1, 2],
      [1, 2, 1],
    ]);
  });
});

// ---------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------

describe('noise', () => {
  it('returns empty array for zero dimensions', () => {
    expect(noise(0, 4, 1, 2)).toEqual([]);
    expect(noise(4, 0, 1, 2)).toEqual([]);
  });

  it('returns correct dimensions', () => {
    const result = noise(8, 6, 1, 2);
    expect(result).toHaveLength(6);
    for (const row of result) expect(row).toHaveLength(8);
  });

  it('contains only the two specified colors', () => {
    const result = noise(20, 20, 4, 8);
    for (const row of result) {
      for (const px of row) {
        expect([4, 8]).toContain(px);
      }
    }
  });

  it('statistical distribution is roughly 50/50 on large grids', () => {
    const result = noise(100, 100, 0, 1);
    let count0 = 0;
    for (const row of result) for (const px of row) if (px === 0) count0++;
    const ratio = count0 / 10000;
    // Allow generous tolerance (~30-70%) to avoid flaky tests
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });
});

// ---------------------------------------------------------------------------
// orderedDither
// ---------------------------------------------------------------------------

describe('orderedDither', () => {
  it('returns empty array for zero dimensions', () => {
    expect(orderedDither(0, 4, 1, 2)).toEqual([]);
    expect(orderedDither(4, 0, 1, 2)).toEqual([]);
  });

  it('returns correct dimensions', () => {
    const result = orderedDither(8, 8, 1, 2);
    expect(result).toHaveLength(8);
    for (const row of result) expect(row).toHaveLength(8);
  });

  it('contains only the two specified colors', () => {
    const result = orderedDither(16, 16, 5, 10);
    for (const row of result) {
      for (const px of row) {
        expect([5, 10]).toContain(px);
      }
    }
  });

  it('top rows are predominantly color1 (gradient starts at color1)', () => {
    const result = orderedDither(8, 20, 1, 2);
    // First row: t=0, all Bayer thresholds > 0 → all color1
    for (const px of result[0]) {
      expect(px).toBe(1);
    }
  });

  it('bottom rows are predominantly color2', () => {
    const result = orderedDither(8, 20, 1, 2);
    // Last row: t=1, t > all Bayer thresholds (max is 15/16 = 0.9375) → all color2
    const lastRow = result[result.length - 1];
    for (const px of lastRow) {
      expect(px).toBe(2);
    }
  });

  it('1×1 grid: t=0, threshold=0/16=0, t > threshold is false → color1', () => {
    expect(orderedDither(1, 1, 3, 7)).toEqual([[3]]);
  });

  it('produces increasing color2 prevalence from top to bottom', () => {
    const result = orderedDither(16, 16, 1, 2);
    // Count color2 per row — should be roughly non-decreasing
    const counts = result.map((row) => row.filter((px) => px === 2).length);
    // First row count should be ≤ last row count
    expect(counts[0]).toBeLessThanOrEqual(counts[counts.length - 1]);
  });
});

// ---------------------------------------------------------------------------
// errorDiffusion
// ---------------------------------------------------------------------------

describe('errorDiffusion', () => {
  it('returns empty array for zero dimensions', () => {
    expect(errorDiffusion(0, 4, 1, 2)).toEqual([]);
    expect(errorDiffusion(4, 0, 1, 2)).toEqual([]);
  });

  it('returns correct dimensions', () => {
    const result = errorDiffusion(8, 8, 1, 2);
    expect(result).toHaveLength(8);
    for (const row of result) expect(row).toHaveLength(8);
  });

  it('contains only the two specified colors', () => {
    const result = errorDiffusion(16, 16, 5, 10);
    for (const row of result) {
      for (const px of row) {
        expect([5, 10]).toContain(px);
      }
    }
  });

  it('top rows are predominantly color1', () => {
    const result = errorDiffusion(16, 20, 1, 2);
    // First row should be mostly color1 (t = 0)
    const color1Count = result[0].filter((px) => px === 1).length;
    expect(color1Count).toBeGreaterThan(result[0].length / 2);
  });

  it('bottom rows are predominantly color2', () => {
    const result = errorDiffusion(16, 20, 1, 2);
    const lastRow = result[result.length - 1];
    const color2Count = lastRow.filter((px) => px === 2).length;
    expect(color2Count).toBeGreaterThan(lastRow.length / 2);
  });

  it('1×1 grid: t=0 → quantizes to color1', () => {
    expect(errorDiffusion(1, 1, 3, 7)).toEqual([[3]]);
  });

  it('produces error propagation visible as gradual transition', () => {
    const result = errorDiffusion(16, 16, 0, 1);
    // Count color2 per row — should generally increase
    const counts = result.map((row) => row.filter((px) => px === 1).length);
    // First half should have fewer color2 than second half
    const firstHalf = counts.slice(0, 8).reduce((a, b) => a + b, 0);
    const secondHalf = counts.slice(8).reduce((a, b) => a + b, 0);
    expect(firstHalf).toBeLessThanOrEqual(secondHalf);
  });
});
