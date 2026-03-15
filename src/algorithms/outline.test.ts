import { describe, it, expect } from 'vitest';
import { generateOutline, cleanupOrphans, selectiveOutline, type RGBA } from './outline.js';

// ---------------------------------------------------------------------------
// generateOutline
// ---------------------------------------------------------------------------

describe('generateOutline', () => {
  it('returns empty array for empty input', () => {
    expect(generateOutline([], 5)).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(generateOutline([[], []], 5)).toEqual([]);
  });

  it('all-transparent grid returns unchanged (no outline needed)', () => {
    const data = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(generateOutline(data, 5)).toEqual(data);
  });

  it('outlines a single pixel in the center', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = generateOutline(data, 5);
    // Original pixel unchanged
    expect(result[1][1]).toBe(1);
    // 4-connected neighbors get outline
    expect(result[0][1]).toBe(5); // above
    expect(result[2][1]).toBe(5); // below
    expect(result[1][0]).toBe(5); // left
    expect(result[1][2]).toBe(5); // right
    // Diagonals stay transparent
    expect(result[0][0]).toBe(0);
    expect(result[0][2]).toBe(0);
    expect(result[2][0]).toBe(0);
    expect(result[2][2]).toBe(0);
  });

  it('pixel at edge — outline does not go out of bounds', () => {
    const data = [
      [1, 0, 0],
      [0, 0, 0],
    ];
    const result = generateOutline(data, 3);
    expect(result[0][0]).toBe(1); // original
    expect(result[0][1]).toBe(3); // right neighbor
    expect(result[1][0]).toBe(3); // below neighbor
    // No crash or out-of-bounds writes
  });

  it('pixel at corner (0,0) — outlines only valid neighbors', () => {
    const data = [[1]];
    const result = generateOutline(data, 9);
    // Only cell is the original — no room for outline
    expect(result[0][0]).toBe(1);
  });

  it('does not overwrite existing non-transparent pixels', () => {
    const data = [
      [1, 2],
      [0, 0],
    ];
    const result = generateOutline(data, 5);
    expect(result[0][0]).toBe(1); // preserved
    expect(result[0][1]).toBe(2); // preserved (non-transparent isn't overwritten)
    expect(result[1][0]).toBe(5); // outline of pixel (0,0)
    expect(result[1][1]).toBe(5); // outline of pixel (0,1)
  });

  it('outlines a filled rectangle', () => {
    const data = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const result = generateOutline(data, 9);
    // Interior should be unchanged
    expect(result[2][2]).toBe(1);
    // Outline ring
    expect(result[0][1]).toBe(9);
    expect(result[0][2]).toBe(9);
    expect(result[0][3]).toBe(9);
    expect(result[1][0]).toBe(9);
    expect(result[1][4]).toBe(9);
    expect(result[4][1]).toBe(9);
    expect(result[4][2]).toBe(9);
    expect(result[4][3]).toBe(9);
    // Corners should remain transparent (diagonal not 4-connected)
    expect(result[0][0]).toBe(0);
    expect(result[0][4]).toBe(0);
    expect(result[4][0]).toBe(0);
    expect(result[4][4]).toBe(0);
  });

  it('does not mutate the input', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const copy = data.map((r) => [...r]);
    generateOutline(data, 5);
    expect(data).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// cleanupOrphans
// ---------------------------------------------------------------------------

describe('cleanupOrphans', () => {
  it('returns empty array for empty input', () => {
    expect(cleanupOrphans([])).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(cleanupOrphans([[], []])).toEqual([]);
  });

  it('all-transparent grid returns unchanged', () => {
    const data = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(cleanupOrphans(data)).toEqual(data);
  });

  it('removes an isolated single pixel', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = cleanupOrphans(data);
    expect(result[1][1]).toBe(0); // orphan removed
  });

  it('preserves pixels with same-color neighbors', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 1],
      [0, 0, 0],
    ];
    const result = cleanupOrphans(data);
    expect(result[1][1]).toBe(1); // has neighbor to the right
    expect(result[1][2]).toBe(1); // has neighbor to the left
  });

  it('removes multiple isolated pixels', () => {
    const data = [
      [1, 0, 2],
      [0, 0, 0],
      [3, 0, 4],
    ];
    const result = cleanupOrphans(data);
    // All four corners are isolated
    expect(result[0][0]).toBe(0);
    expect(result[0][2]).toBe(0);
    expect(result[2][0]).toBe(0);
    expect(result[2][2]).toBe(0);
  });

  it('considers only same-color neighbors (different color does not count)', () => {
    const data = [
      [0, 2, 0],
      [2, 1, 2],
      [0, 2, 0],
    ];
    const result = cleanupOrphans(data);
    // Center pixel (1) has no same-color neighbors — it's an orphan
    expect(result[1][1]).toBe(0);
    // The four 2s also are orphans of each other only if they have no same-color neighbors
    // Let's check: (0,1)=2 neighbors are (0,0)=0, (0,2)=0, (1,1)=1 — no same-color → orphan
    expect(result[0][1]).toBe(0);
  });

  it('preserves a 2×2 block', () => {
    const data = [
      [0, 0, 0, 0],
      [0, 3, 3, 0],
      [0, 3, 3, 0],
      [0, 0, 0, 0],
    ];
    const result = cleanupOrphans(data);
    expect(result[1][1]).toBe(3);
    expect(result[1][2]).toBe(3);
    expect(result[2][1]).toBe(3);
    expect(result[2][2]).toBe(3);
  });

  it('preserves a line of pixels', () => {
    const data = [
      [0, 0, 0, 0, 0],
      [0, 5, 5, 5, 0],
      [0, 0, 0, 0, 0],
    ];
    const result = cleanupOrphans(data);
    expect(result[1][1]).toBe(5);
    expect(result[1][2]).toBe(5);
    expect(result[1][3]).toBe(5);
  });

  it('does not mutate the input', () => {
    const data = [
      [0, 0],
      [0, 1],
    ];
    const copy = data.map((r) => [...r]);
    cleanupOrphans(data);
    expect(data).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// selectiveOutline
// ---------------------------------------------------------------------------

/** Builds a minimal test palette for selective outline tests */
function makeTestPalette(): (RGBA | null)[] {
  const p: (RGBA | null)[] = new Array<RGBA | null>(256).fill(null);
  p[0] = [0, 0, 0, 0]; // transparent
  p[1] = [255, 0, 0, 255]; // red  (h≈0)
  p[2] = [0, 255, 0, 255]; // green (h≈120)
  p[3] = [0, 0, 255, 255]; // blue (h≈240)
  p[4] = [40, 40, 40, 255]; // dark gray (base outline, achromatic)
  p[5] = [20, 20, 20, 255]; // very dark gray (nearest to darkened gray)
  p[6] = [30, 10, 10, 255]; // very dark reddish
  p[7] = [10, 30, 10, 255]; // very dark greenish
  p[8] = [128, 128, 128, 255]; // mid gray
  return p;
}

describe('selectiveOutline', () => {
  it('returns empty array for empty input', () => {
    expect(selectiveOutline([], makeTestPalette(), 4)).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(selectiveOutline([[], []], makeTestPalette(), 4)).toEqual([]);
  });

  it('all-transparent grid returns unchanged copy', () => {
    const data = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const result = selectiveOutline(data, makeTestPalette(), 4);
    expect(result).toEqual(data);
  });

  it('no-transparent grid (fully filled) returns unchanged copy', () => {
    const data = [
      [1, 1],
      [1, 1],
    ];
    const result = selectiveOutline(data, makeTestPalette(), 4);
    expect(result).toEqual(data);
  });

  it('single sprite pixel — surrounding transparent pixels get outline', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const palette = makeTestPalette();
    const result = selectiveOutline(data, palette, 4);
    // Center sprite pixel is unchanged
    expect(result[1][1]).toBe(1);
    // All 4 neighbors should be set to some non-zero outline color
    expect(result[0][1]).not.toBe(0);
    expect(result[2][1]).not.toBe(0);
    expect(result[1][0]).not.toBe(0);
    expect(result[1][2]).not.toBe(0);
    // Diagonals stay transparent (4-connected only)
    expect(result[0][0]).toBe(0);
    expect(result[0][2]).toBe(0);
    expect(result[2][0]).toBe(0);
    expect(result[2][2]).toBe(0);
  });

  it('does not mutate input', () => {
    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const copy = data.map((r) => [...r]);
    selectiveOutline(data, makeTestPalette(), 4);
    expect(data).toEqual(copy);
  });

  it('sprite pixel at edge — no out-of-bounds writes', () => {
    const data = [
      [1, 0],
      [0, 0],
    ];
    const result = selectiveOutline(data, makeTestPalette(), 4);
    // Should not throw, and corner pixel is unchanged
    expect(result[0][0]).toBe(1);
    expect(result[0][1]).not.toBe(0); // right neighbor outlined
    expect(result[1][0]).not.toBe(0); // bottom neighbor outlined
  });

  it('achromatic neighbors — only darkens without hue shift', () => {
    // palette[8] = mid gray (achromatic); base outline is palette[4] = dark gray
    const data = [
      [0, 0, 0],
      [0, 8, 0], // sprite is mid-gray (achromatic)
      [0, 0, 0],
    ];
    const palette = makeTestPalette();
    const result = selectiveOutline(data, palette, 4);
    // Since neighbor is achromatic, no hue blend — base hue stays, L is reduced
    // Expect some dark palette entry (not transparent)
    expect(result[0][1]).not.toBe(0);
    expect(result[1][0]).not.toBe(0);
  });

  it('falls back to baseColor when palette has no valid entries besides transparent', () => {
    const sparseP: (RGBA | null)[] = new Array<RGBA | null>(256).fill(null);
    sparseP[0] = [0, 0, 0, 0]; // transparent
    sparseP[4] = [40, 40, 40, 255]; // only valid entry (base color)
    sparseP[1] = [255, 0, 0, 255]; // sprite color

    const data = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const result = selectiveOutline(data, sparseP, 4);
    // With only palette[4] as valid entry, nearest match will be 4 (the base color)
    expect(result[0][1]).toBe(4);
    expect(result[1][0]).toBe(4);
    expect(result[1][2]).toBe(4);
    expect(result[2][1]).toBe(4);
  });

  it('hue-shifted: red sprite makes outline more reddish than achromatic base', () => {
    // Adjacent sprite is red (h≈0), base outline is gray (achromatic h=0)
    // Hue shift goes toward red, luminance reduced
    // p[6] = [30, 10, 10] is very dark reddish — expect it to be nearest match for reddish dark
    const palette = makeTestPalette();
    const data = [
      [0, 1, 0], // 1 = red sprite
      [1, 0, 1],
      [0, 1, 0],
    ];
    // Center transparent pixel (1,1) is surrounded by red pixels
    const result = selectiveOutline(data, palette, 4);
    // The outline at (1,1) should be non-transparent
    expect(result[1][1]).not.toBe(0);
  });
});
