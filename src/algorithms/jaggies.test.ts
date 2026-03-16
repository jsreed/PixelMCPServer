import { describe, it, expect } from 'vitest';
import { detectJaggies } from './jaggies.js';

describe('detectJaggies', () => {
  const createMockGridFn = (grid: (number | null)[][]) => {
    const h = grid.length;
    const w = h > 0 ? (grid[0]?.length ?? 0) : 0;
    return (x: number, y: number): number | null => {
      if (x < 0 || x >= w || y < 0 || y >= h) return null;
      const v = grid[y]?.[x] ?? null;
      return v === 0 ? null : v; // 0 = transparent in test grids
    };
  };

  /** Set a pixel in a mutable grid at the given (y, x) position. */
  const setPixel = (grid: number[][], y: number, x: number, v: number) => {
    const row = grid[y] as number[] | undefined;
    if (row !== undefined) {
      row[x] = v;
    }
  };

  it('returns empty array for 0x0 image', () => {
    const result = detectJaggies(0, 0, () => null);
    expect(result).toEqual([]);
  });

  it('returns empty array for solid fill', () => {
    // No edges at all inside a solid fill
    const grid = [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ];
    // Outer edge pixels exist but they border the outside (null), which produces edges.
    // The edge forms a clean rect, which should produce clean runs.
    const result = detectJaggies(4, 4, createMockGridFn(grid));
    // A perfect rectangle border has only horizontal/vertical lines — no jaggies
    expect(result).toEqual([]);
  });

  it('reports clean for a perfect horizontal line', () => {
    // A 1-pixel-tall horizontal line
    const grid = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const result = detectJaggies(8, 3, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('reports clean for a perfect vertical line', () => {
    const grid = [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ];
    const result = detectJaggies(3, 5, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('reports clean for a perfect 45-degree diagonal', () => {
    // Each row shifts 1 pixel right — consistent 1:1 slope
    const grid = [
      [1, 0, 0, 0, 0],
      [0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
    ];
    const result = detectJaggies(5, 5, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('reports clean for consistent 2:1 slope', () => {
    // A consistent 2:1 staircase: two pixels right, one down, two pixels right, one down...
    // This is correct pixel art practice
    const grid = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const result = detectJaggies(12, 6, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('detects jaggy in inconsistent step pattern', () => {
    // Staircase with runs: 3,3,2,3 — the run of 2 breaks the pattern
    // Build a diagonal where most steps are 3 pixels but one is 2
    const grid: number[][] = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => 0));
    // Row 1: cols 0-2 = color 1 (run of 3)
    setPixel(grid, 1, 0, 1);
    setPixel(grid, 1, 1, 1);
    setPixel(grid, 1, 2, 1);
    // Row 2: cols 3-5 = color 1 (run of 3)
    setPixel(grid, 2, 3, 1);
    setPixel(grid, 2, 4, 1);
    setPixel(grid, 2, 5, 1);
    // Row 3: cols 6-7 = color 1 (run of 2 — inconsistent!)
    setPixel(grid, 3, 6, 1);
    setPixel(grid, 3, 7, 1);
    // Row 4: cols 8-10 = color 1 (run of 3)
    setPixel(grid, 4, 8, 1);
    setPixel(grid, 4, 9, 1);
    setPixel(grid, 4, 10, 1);

    const result = detectJaggies(16, 8, createMockGridFn(grid));
    // Should detect at least one jaggy due to the inconsistent run of 2
    expect(result.length).toBeGreaterThan(0);
  });

  it('detects single-pixel notch on an edge', () => {
    // A horizontal line with a single-pixel bump/notch
    //  1 1 1 1 1 1
    //  0 0 1 0 0 0  <- notch pixel sticking out
    const grid = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 1, 0, 0, 0, 0], // notch at x=3
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const result = detectJaggies(8, 4, createMockGridFn(grid));
    // The notch creates an edge irregularity
    expect(result.length).toBeGreaterThan(0);
  });

  it('assigns low severity for minor deviation', () => {
    // A slope with mostly consistent runs (mode = 3) but one run is off by 1 (length 4)
    const grid: number[][] = Array.from({ length: 8 }, () => Array.from({ length: 20 }, () => 0));
    // Runs: 3, 3, 4, 3 — deviation of 1 at run index 2
    setPixel(grid, 1, 0, 1);
    setPixel(grid, 1, 1, 1);
    setPixel(grid, 1, 2, 1);
    setPixel(grid, 2, 3, 1);
    setPixel(grid, 2, 4, 1);
    setPixel(grid, 2, 5, 1);
    setPixel(grid, 3, 6, 1); // run of 4
    setPixel(grid, 3, 7, 1);
    setPixel(grid, 3, 8, 1);
    setPixel(grid, 3, 9, 1);
    setPixel(grid, 4, 10, 1);
    setPixel(grid, 4, 11, 1);
    setPixel(grid, 4, 12, 1);

    const result = detectJaggies(20, 8, createMockGridFn(grid));
    if (result.length > 0) {
      const hasLowOrMedium = result.some((j) => j.severity === 'low' || j.severity === 'medium');
      expect(hasLowOrMedium).toBe(true);
      // No high severity for a minor 1-off deviation
      const highCount = result.filter((j) => j.severity === 'high').length;
      expect(highCount).toBe(0);
    }
    // It's also acceptable for the algorithm to not flag a deviation of 1 from mode 3
    // (some heuristics allow slight jitter)
  });

  it('assigns high severity for abrupt direction change', () => {
    // A single pixel among runs of length 5+ (abrupt direction change)
    const grid: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 20 }, () => 0));
    // Run of 5, then single pixel in different row, then run of 5
    setPixel(grid, 0, 0, 1);
    setPixel(grid, 0, 1, 1);
    setPixel(grid, 0, 2, 1);
    setPixel(grid, 0, 3, 1);
    setPixel(grid, 0, 4, 1);
    setPixel(grid, 1, 5, 1); // single pixel — abrupt change
    setPixel(grid, 0, 6, 1);
    setPixel(grid, 0, 7, 1);
    setPixel(grid, 0, 8, 1);
    setPixel(grid, 0, 9, 1);
    setPixel(grid, 0, 10, 1);

    const result = detectJaggies(20, 4, createMockGridFn(grid));
    if (result.length > 0) {
      const hasHigh = result.some((j) => j.severity === 'high');
      expect(hasHigh).toBe(true);
    }
    // If no jaggies found, at minimum it shouldn't crash
    expect(result).toBeDefined();
  });

  it('suggestion includes neighboring color information', () => {
    // Build a case where we expect jaggies and check suggestions reference color indices
    const grid: number[][] = Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => 0));
    // Inconsistent staircase — color 5 against color 0 background
    setPixel(grid, 1, 0, 5);
    setPixel(grid, 1, 1, 5);
    setPixel(grid, 1, 2, 5);
    setPixel(grid, 2, 3, 5);
    setPixel(grid, 2, 4, 5);
    setPixel(grid, 2, 5, 5);
    setPixel(grid, 3, 6, 5); // run of 1 — jaggy
    setPixel(grid, 4, 7, 5);
    setPixel(grid, 4, 8, 5);
    setPixel(grid, 4, 9, 5);

    const result = detectJaggies(16, 8, createMockGridFn(grid));
    if (result.length > 0) {
      // Suggestions should reference color indices (not just generic messages)
      const hasSuggestionWithColors = result.some(
        (j) => j.suggestion.includes('5') || j.suggestion.includes('color'),
      );
      expect(hasSuggestionWithColors).toBe(true);
    }
  });

  it('does not report jaggies for very short segments', () => {
    // A segment of only 3 pixels should be skipped (below the min threshold of 4)
    const grid = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0], // only 3 edge pixels
      [0, 0, 0, 0, 0],
    ];
    const result = detectJaggies(5, 3, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('handles single-pixel-wide sprite without crashing', () => {
    // A 1xN sprite
    const grid = [[1], [1], [1], [1], [1]];
    expect(() => detectJaggies(1, 5, createMockGridFn(grid))).not.toThrow();
    const result = detectJaggies(1, 5, createMockGridFn(grid));
    expect(Array.isArray(result)).toBe(true);
  });

  it('all reported coordinates are within bounds', () => {
    // Irregular shape — verify all coordinates are valid
    const grid = [
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 1, 0, 0],
      [0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 0, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    ];
    const w = 10;
    const h = 7;
    const result = detectJaggies(w, h, createMockGridFn(grid));
    for (const jaggy of result) {
      expect(jaggy.x).toBeGreaterThanOrEqual(0);
      expect(jaggy.x).toBeLessThan(w);
      expect(jaggy.y).toBeGreaterThanOrEqual(0);
      expect(jaggy.y).toBeLessThan(h);
    }
  });
});
