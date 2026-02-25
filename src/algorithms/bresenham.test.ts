import { describe, it, expect } from 'vitest';
import { bresenhamLine } from './bresenham.js';

describe('bresenhamLine', () => {
  it('returns a single point if start and end are the same', () => {
    expect(bresenhamLine(0, 0, 0, 0)).toEqual([{ x: 0, y: 0 }]);
    expect(bresenhamLine(5, -5, 5, -5)).toEqual([{ x: 5, y: -5 }]);
  });

  it('generates a horizontal line', () => {
    expect(bresenhamLine(0, 0, 5, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
    ]);
  });

  it('generates a horizontal line backwards', () => {
    expect(bresenhamLine(5, 0, 0, 0)).toEqual([
      { x: 5, y: 0 },
      { x: 4, y: 0 },
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('generates a vertical line', () => {
    expect(bresenhamLine(2, 2, 2, 5)).toEqual([
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 2, y: 5 },
    ]);
  });

  it('generates a vertical line backwards', () => {
    expect(bresenhamLine(2, 5, 2, 2)).toEqual([
      { x: 2, y: 5 },
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
    ]);
  });

  it('generates a perfect diagonal', () => {
    expect(bresenhamLine(0, 0, 3, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('generates a perfect diagonal backwards', () => {
    expect(bresenhamLine(3, 3, 0, 0)).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
  });

  it('generates a shallow slope (dx > dy)', () => {
    // e.g., drawing from (0,0) to (4,2)
    expect(bresenhamLine(0, 0, 4, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 }, // or (1,1) depending on exact tie-breaking, but mathematically correct for integer raster
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
    ]);
  });

  it('generates a steep slope (dy > dx)', () => {
    // e.g., drawing from (0,0) to (2,4)
    expect(bresenhamLine(0, 0, 2, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 4 },
    ]);
  });

  it('draws into negative coordinates natively', () => {
    expect(bresenhamLine(-2, -2, 0, 0)).toEqual([
      { x: -2, y: -2 },
      { x: -1, y: -1 },
      { x: 0, y: 0 },
    ]);
  });

  it('rounds float inputs to integers automatically', () => {
    // e.g., slightly off-integer
    expect(bresenhamLine(0.1, 0.4, 3.2, 2.9)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('generates an anti-diagonal (positive x, negative y)', () => {
    expect(bresenhamLine(0, 3, 3, 0)).toEqual([
      { x: 0, y: 3 },
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 0 },
    ]);
  });

  it('line length always equals max(|dx|,|dy|) + 1 for arbitrary coords', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 10, 0], // horizontal
      [0, 0, 0, 10], // vertical
      [0, 0, 10, 10], // diagonal
      [0, 0, 10, 3], // shallow
      [0, 0, 3, 10], // steep
      [-5, -5, 5, 5], // crossing origin
      [3, 7, 15, 2], // arbitrary
    ];
    for (const [x0, y0, x1, y1] of cases) {
      const points = bresenhamLine(x0, y0, x1, y1);
      const expected = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
      expect(points).toHaveLength(expected);
    }
  });

  it('always starts at (x0,y0) and ends at (x1,y1)', () => {
    const cases: [number, number, number, number][] = [
      [1, 2, 8, 5],
      [8, 5, 1, 2],
      [-3, 4, 6, -2],
    ];
    for (const [x0, y0, x1, y1] of cases) {
      const points = bresenhamLine(x0, y0, x1, y1);
      expect(points[0]).toEqual({ x: x0, y: y0 });
      expect(points[points.length - 1]).toEqual({ x: x1, y: y1 });
    }
  });

  describe('exhaustive octant permutations', () => {
    const testOctant = (name: string, dx: number, dy: number) => {
      it(`draws exactly max(|dx|,|dy|) + 1 pixels and reaches target cleanly for ${name}`, () => {
        const points = bresenhamLine(0, 0, dx, dy);
        const expectedLength = Math.max(Math.abs(dx), Math.abs(dy)) + 1;

        // Assert length is correct (no skipped pixels, no duplicates)
        expect(points).toHaveLength(expectedLength);

        // Assert bounds
        expect(points[0]).toEqual({ x: 0, y: 0 });
        expect(points[points.length - 1]).toEqual({ x: dx, y: dy });

        // Assert connectivity (no diagonal jumps where both x and y change by > 1 or skipping)
        for (let i = 1; i < points.length; i++) {
          const diffX = Math.abs(points[i].x - points[i - 1].x);
          const diffY = Math.abs(points[i].y - points[i - 1].y);

          expect(diffX <= 1).toBe(true);
          expect(diffY <= 1).toBe(true);
          expect(diffX + diffY).toBeGreaterThan(0); // Cannot be same pixel twice
        }
      });
    };

    // Octants 1-8
    testOctant('Octant 1 (E -> NE)', 5, 2);
    testOctant('Octant 2 (NE -> N)', 2, 5);
    testOctant('Octant 3 (N -> NW)', -2, 5);
    testOctant('Octant 4 (NW -> W)', -5, 2);
    testOctant('Octant 5 (W -> SW)', -5, -2);
    testOctant('Octant 6 (SW -> S)', -2, -5);
    testOctant('Octant 7 (S -> SE)', 2, -5);
    testOctant('Octant 8 (SE -> E)', 5, -2);
  });
});
