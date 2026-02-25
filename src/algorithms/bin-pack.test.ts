import { describe, it, expect } from 'vitest';
import { packRectangles } from './bin-pack.js';

describe('packRectangles (Shelf Bin-Packing)', () => {
  it('returns zero-size atlas for empty input', () => {
    const result = packRectangles([]);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(result.placements).toHaveLength(0);
  });

  it('places a single rectangle at origin', () => {
    const result = packRectangles([{ id: 'a', width: 32, height: 16 }]);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toEqual({ id: 'a', x: 0, y: 0, width: 32, height: 16 });
    expect(result.width).toBe(32);
    expect(result.height).toBe(16);
  });

  it('packs uniform rectangles without overlaps', () => {
    const rects = [
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
      { id: 'c', width: 10, height: 10 },
      { id: 'd', width: 10, height: 10 },
    ];
    const result = packRectangles(rects);

    expect(result.placements).toHaveLength(4);

    // Verify no overlaps
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        const a = result.placements[i];
        const b = result.placements[j];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps, `Rects ${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('packs mixed-size rectangles sorted by height', () => {
    const rects = [
      { id: 'small', width: 8, height: 8 },
      { id: 'tall', width: 16, height: 64 },
      { id: 'wide', width: 64, height: 16 },
    ];
    const result = packRectangles(rects);

    expect(result.placements).toHaveLength(3);

    // The tallest rect should be placed first due to sorting
    const tallPlacement = result.placements.find((p) => p.id === 'tall')!;
    expect(tallPlacement.x).toBe(0);
    expect(tallPlacement.y).toBe(0);

    // All placements should fit within the reported atlas dimensions
    for (const p of result.placements) {
      expect(p.x + p.width).toBeLessThanOrEqual(result.width);
      expect(p.y + p.height).toBeLessThanOrEqual(result.height);
    }
  });

  it('respects padding between items', () => {
    const rects = [
      { id: 'a', width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 },
    ];
    const noPad = packRectangles(rects, 0);
    const withPad = packRectangles(rects, 4);

    // With padding, the atlas should be larger
    const noPadArea = noPad.width * noPad.height;
    const withPadArea = withPad.width * withPad.height;
    expect(withPadArea).toBeGreaterThan(noPadArea);

    // Verify the gap between the two placements
    const a = withPad.placements.find((p) => p.id === 'a')!;
    const b = withPad.placements.find((p) => p.id === 'b')!;

    // They should be separated by at least `padding` pixels
    if (a.y === b.y) {
      // Same shelf
      const gap = Math.abs(b.x - (a.x + a.width));
      expect(gap).toBeGreaterThanOrEqual(4);
    } else {
      // Different shelves
      const gap = Math.abs(b.y - (a.y + a.height));
      expect(gap).toBeGreaterThanOrEqual(4);
    }
  });

  it('includes all input rectangles in the output', () => {
    const rects = Array.from({ length: 20 }, (_, i) => ({
      id: `rect_${i}`,
      width: 8 + (i % 5) * 4,
      height: 8 + (i % 3) * 8,
    }));

    const result = packRectangles(rects);
    expect(result.placements).toHaveLength(20);

    const ids = new Set(result.placements.map((p) => p.id));
    for (const r of rects) {
      expect(ids.has(r.id), `Missing rect ${r.id}`).toBe(true);
    }
  });

  it('handles a single rect wider than the calculated target width', () => {
    const rects = [
      { id: 'huge', width: 500, height: 10 },
      { id: 'small', width: 10, height: 10 },
    ];
    const result = packRectangles(rects);

    expect(result.placements).toHaveLength(2);
    // The huge rect should still be placed
    const huge = result.placements.find((p) => p.id === 'huge')!;
    expect(huge.x).toBe(0);
    expect(huge.y).toBe(0);
    expect(huge.x + huge.width).toBeLessThanOrEqual(result.width);
  });

  it('packs one giant and many tiny rects without overlaps', () => {
    const rects = [
      { id: 'giant', width: 64, height: 64 },
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `tiny_${i}`,
        width: 4,
        height: 4,
      })),
    ];
    const result = packRectangles(rects);
    expect(result.placements).toHaveLength(17);

    // Verify no overlaps
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        const a = result.placements[i];
        const b = result.placements[j];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps, `Rects ${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('all placements have non-negative coordinates', () => {
    const rects = Array.from({ length: 30 }, (_, i) => ({
      id: `r_${i}`,
      width: 5 + (i % 7) * 3,
      height: 5 + (i % 5) * 4,
    }));
    const result = packRectangles(rects, 2);

    for (const p of result.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
});
