import { describe, it, expect } from 'vitest';
import { detectBanding } from './banding.js';

describe('detectBanding', () => {
  const createMockGridFn = (grid: number[][]) => {
    const h = grid.length;
    const w = h > 0 ? grid[0].length : 0;
    return (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return null;
      return grid[y][x];
    };
  };

  it('returns empty array for clean solid images', () => {
    const grid = [
      [1, 1, 1],
      [1, 1, 1],
    ];
    const result = detectBanding(3, 2, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('returns empty array for high-frequency noise/dither', () => {
    // Alternating 1s and 2s (checkerboard dither)
    const grid = [
      [1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2],
    ];
    // Run lengths are all 1, which the scanner rejects immediately.
    const result = detectBanding(3, 2, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('flags horizontal banding correctly forming a bounding box', () => {
    // A rigid staircase: [1,1,1] -> [2,2,2] -> [3,3,3]
    // This is 3 consecutive bands.
    const grid = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 2, 2, 2, 3, 3, 3], // Band sequence starts at x=1, ends at x=9
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];

    const result = detectBanding(10, 3, createMockGridFn(grid));

    expect(result).toHaveLength(1); // One bounding region found

    const region = result[0];
    expect(region.x).toBe(1);
    expect(region.y).toBe(1);
    expect(region.width).toBe(9); // Spans 3 runs of length 3 = 9 pixels
    expect(region.height).toBe(1);
    expect(region.severity).toBe('low'); // Since it's only 3 bands
  });

  it('detects high-severity vertical banding scaling', () => {
    // 6 distinct vertical chunks stepping downwards
    // 5 is the background color, so index shifts are 1->2->3->4->5->6 monotonic
    const grid = [
      [1, 5, 5],
      [1, 5, 5],
      [2, 5, 5],
      [2, 5, 5],
      [3, 5, 5],
      [3, 5, 5],
      [4, 5, 5],
      [4, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
      [6, 5, 5],
      [6, 5, 5],
    ];

    const result = detectBanding(3, 12, createMockGridFn(grid));

    expect(result).toHaveLength(1);
    const region = result[0];
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.width).toBe(1);
    expect(region.height).toBe(12);
    expect(region.severity).toBe('high'); // >= 6 bands = high
  });

  it('merges adjacent banding rows into a single taller bounding box', () => {
    // Two consecutive rows doing the exact same horizontal banding artifact.
    // It should merge them into a height=2 block.
    const grid = [
      [1, 1, 2, 2, 3, 3],
      [1, 1, 2, 2, 3, 3],
      [0, 0, 0, 0, 0, 0],
    ];

    const result = detectBanding(6, 3, createMockGridFn(grid));

    // Horizontal scan will detect row 0 and row 1 individually.
    // The algorithm should merge.
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(6);
    expect(r.height).toBe(2);
  });

  it('ignores non-monotonic sequences', () => {
    // E.g. 1 -> 2 -> 1 -> 2
    // Since the indices don't step uniformly in one direction, it's not a gradient
    const grid = [[1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2]];

    const result = detectBanding(12, 1, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('does not leak stale pDelta across transparent gaps', () => {
    // Row with a monotonic staircase, then a null gap, then another unrelated sequence.
    // The second sequence should NOT inherit the direction from the first.
    const grid = [[1, 1, 2, 2, 3, 3, 0, 0, 5, 5, 4, 4, 3, 3]];
    // First half: 1->2->3 (ascending, 3 bands) = banding
    // Gap: 0s (nullish)
    // Second half: 5->4->3 (descending, 3 bands) = banding but separate region
    const getPixel = createMockGridFn(grid);
    const result = detectBanding(14, 1, getPixel);

    // Should detect 2 separate regions (not merged through the null gap)
    expect(result.length).toBeGreaterThanOrEqual(1);

    // The first region should not extend past the null gap
    const firstRegion = result[0];
    expect(firstRegion.x + firstRegion.width).toBeLessThanOrEqual(6);
  });

  it('detects both horizontal and vertical banding on the same image', () => {
    // Right columns have horizontal banding on row 0; left column has vertical banding
    // Make them far apart so they don't merge.
    const grid = [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 10, 10, 11, 11, 12, 12],
      [1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ];
    const result = detectBanding(15, 7, createMockGridFn(grid));

    // Should find at least 2 regions (horizontal + vertical)
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('detects descending monotonic staircases', () => {
    // 3→2→1 (descending, 3 bands)
    const grid = [[3, 3, 3, 2, 2, 2, 1, 1, 1]];
    const result = detectBanding(9, 1, createMockGridFn(grid));
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('low');
  });

  it('does not flag 2-band sequences (below MIN_BANDS threshold)', () => {
    // Only 2 bands → should NOT be detected
    const grid = [[1, 1, 1, 2, 2, 2]];
    const result = detectBanding(6, 1, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('does not flag large contrast gaps (delta ≥ 10 between adjacent bands)', () => {
    // [1,1, 12,12, 23,23] — jumps of 11 between bands are intentional transitions
    const grid = [[1, 1, 12, 12, 23, 23]];
    const result = detectBanding(6, 1, createMockGridFn(grid));
    expect(result).toEqual([]);
  });

  it('returns empty array for a 0×0 image without crashing', () => {
    const result = detectBanding(0, 0, () => null);
    expect(result).toEqual([]);
  });
});
