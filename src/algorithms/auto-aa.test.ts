import { describe, it, expect } from 'vitest';
import { autoAntiAlias, type RGBA } from './auto-aa.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal palette for testing.
 * Index 0: transparent
 * Index 1: dark  (lum ≈ 30)
 * Index 2: mid   (lum ≈ 128)
 * Index 3: light (lum ≈ 225)
 */
function testPalette(): (RGBA | null)[] {
  const p: (RGBA | null)[] = new Array(256).fill(null);
  p[0] = [0, 0, 0, 0];       // transparent
  p[1] = [30, 30, 30, 255];   // dark
  p[2] = [128, 128, 128, 255]; // mid
  p[3] = [225, 225, 225, 255]; // light
  return p;
}

// ---------------------------------------------------------------------------
// autoAntiAlias
// ---------------------------------------------------------------------------

describe('autoAntiAlias', () => {
  it('returns empty array for empty input', () => {
    expect(autoAntiAlias([], testPalette())).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(autoAntiAlias([[], []], testPalette())).toEqual([]);
  });

  it('returns unchanged grid when no convex corners exist', () => {
    // Horizontal line — no L-shapes
    const data = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    expect(autoAntiAlias(data, testPalette())).toEqual(data);
  });

  it('detects convex corner on an L-shaped boundary', () => {
    // An L-shape: pixel at (1,1) has same-color neighbors N=(0,1) and E=(1,2)
    // and the diagonal NE=(0,2) is a different color
    const palette = testPalette();
    const data = [
      [0, 1, 3, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ];
    const result = autoAntiAlias(data, palette);

    // Pixel (0,1) has same-color neighbors S=(1,1). It only has 1 same-color
    // neighbor, so it's NOT a convex corner (needs exactly 2 forming an L).
    // Pixel (1,1) has same-color neighbors N=(0,1) and E=(1,2) — that's an L-shape.
    // The diagonal NE = (0,2) is color 3, which is different from color 1.
    // So (1,1) should get an intermediate color.
    // luminance(1) ≈ 30, luminance(3) ≈ 225, target ≈ 127.5
    // Index 2 has luminance ≈ 128 — closest match
    expect(result[1][1]).toBe(2);
  });

  it('does not modify straight edges', () => {
    // Straight vertical line — no convex corners
    const data = [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ];
    const result = autoAntiAlias(data, testPalette());
    expect(result).toEqual(data);
  });

  it('does not modify concave (inside) corners', () => {
    // Filled 3×3 block — all interior pixels have 4 same-color neighbors
    // Edge pixels have 2-3, but they're straight or concave, not convex L-shapes
    // with a DIFFERENT color at the diagonal
    const data = [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ];
    const result = autoAntiAlias(data, testPalette());
    expect(result).toEqual(data);
  });

  it('returns original when no intermediate palette color exists', () => {
    // Only two colors in palette — no intermediate available
    const palette: (RGBA | null)[] = new Array(256).fill(null);
    palette[0] = [0, 0, 0, 0];
    palette[1] = [0, 0, 0, 255];
    palette[3] = [255, 255, 255, 255];

    const data = [
      [0, 1, 3, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ];
    const result = autoAntiAlias(data, palette);
    // No intermediate found — pixel unchanged
    expect(result[1][1]).toBe(1);
  });

  it('all-transparent grid returns unchanged', () => {
    const data = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(autoAntiAlias(data, testPalette())).toEqual(data);
  });

  it('does not mutate the input', () => {
    const data = [
      [0, 1, 3, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ];
    const copy = data.map((r) => [...r]);
    autoAntiAlias(data, testPalette());
    expect(data).toEqual(copy);
  });
});
