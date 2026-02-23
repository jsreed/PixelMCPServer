import { describe, it, expect } from 'vitest';
import { marchingSquares } from './marching-squares.js';

describe('marchingSquares', () => {

    const createMockSolidFn = (grid: number[][]) => {
        const h = grid.length;
        const w = h > 0 ? grid[0].length : 0;
        return (x: number, y: number) => {
            if (x < 0 || x >= w || y < 0 || y >= h) return false;
            return grid[y][x] === 1;
        };
    };

    it('returns empty array for an empty canvas', () => {
        const grid = [
            [0, 0, 0],
            [0, 0, 0]
        ];
        const polygons = marchingSquares(3, 2, createMockSolidFn(grid));
        expect(polygons).toEqual([]);
    });

    it('traces a single solid pixel as a 1x1 square polygon', () => {
        const grid = [
            [0, 0, 0],
            [0, 1, 0],
            [0, 0, 0]
        ];
        const polygons = marchingSquares(3, 3, createMockSolidFn(grid));

        expect(polygons).toHaveLength(1);
        const poly = polygons[0];

        // Collinear simplification is on, so a 1x1 square should have exactly 5 vertices (V0, V1, V2, V3, V0).
        expect(poly).toHaveLength(5);
        expect(poly[0]).toEqual({ x: 1, y: 1 }); // Top-left of pixel 1,1
        expect(poly[1]).toEqual({ x: 2, y: 1 }); // Top-right
        expect(poly[2]).toEqual({ x: 2, y: 2 }); // Bottom-right
        expect(poly[3]).toEqual({ x: 1, y: 2 }); // Bottom-left
        expect(poly[4]).toEqual({ x: 1, y: 1 }); // Back to Top-left (closed)
    });

    it('traces a solid rectangular block into 5 vertices (4 corners + closure)', () => {
        const grid = [
            [1, 1, 1],
            [1, 1, 1]
        ];
        // 3x2 solid block covering the whole grid.
        const polygons = marchingSquares(3, 2, createMockSolidFn(grid));

        expect(polygons).toHaveLength(1);
        const poly = polygons[0];
        expect(poly).toHaveLength(5);

        // Expected corners: (0,0) -> (3,0) -> (3,2) -> (0,2) -> (0,0)
        expect(poly[0]).toEqual({ x: 0, y: 0 });
        expect(poly[1]).toEqual({ x: 3, y: 0 });
        expect(poly[2]).toEqual({ x: 3, y: 2 });
        expect(poly[3]).toEqual({ x: 0, y: 2 });
        expect(poly[4]).toEqual({ x: 0, y: 0 });
    });

    it('traces independent disconnected blobs into multiple polygons', () => {
        const grid = [
            [1, 0, 1],
            [0, 0, 0],
            [1, 0, 1]
        ];
        // Four corners of the grid
        const polygons = marchingSquares(3, 3, createMockSolidFn(grid));

        expect(polygons).toHaveLength(4);
        // Each should be a 1x1 polygon
        for (const poly of polygons) {
            expect(poly).toHaveLength(5);
        }
    });

    it('traces a hollow donut hole as a separate internal polygon winding counter-clockwise', () => {
        const grid = [
            [1, 1, 1],
            [1, 0, 1],
            [1, 1, 1]
        ];
        // 3x3 solid block with a 1x1 hole at the center.
        const polygons = marchingSquares(3, 3, createMockSolidFn(grid));

        expect(polygons).toHaveLength(2);

        // The algorithm finds the outer bounds first (top-down, left-to-right scan)
        const outer = polygons[0];
        expect(outer).toHaveLength(5);
        expect(outer[0]).toEqual({ x: 0, y: 0 });
        expect(outer[1]).toEqual({ x: 3, y: 0 }); // Notice clockwise winding

        const hole = polygons[1];
        expect(hole).toHaveLength(5);
        // The hole starts at the bottom edge of the top solid row, meaning (1,1) -> (2,1) is the TOP edge of the hole.
        // Wait, the hole tracing should start at the BOTTOM edge of the top-center solid pixel, which is (1, y=0). 
        // Bottom edge of pixel (1,0) is vertices (2, 1) -> (1, 1), direction LEFT (3).
        // Let's verify the actual winding order output.
        expect(hole[0]).toEqual({ x: 2, y: 1 });
        expect(hole[1]).toEqual({ x: 1, y: 1 }); // Moving left (Counter-clockwise winding)
        expect(hole[2]).toEqual({ x: 1, y: 2 }); // Moving down
        expect(hole[3]).toEqual({ x: 2, y: 2 }); // Moving right
        expect(hole[4]).toEqual({ x: 2, y: 1 }); // Moving up (closed)
    });

    it('handles diagonal touch "ambiguity" (checkerboard) continuously without infinitely looping', () => {
        const grid = [
            [1, 0],
            [0, 1]
        ];
        const polygons = marchingSquares(2, 2, createMockSolidFn(grid));

        // This should result in TWO separate 1x1 polygons because Moore Neighborhood tracing (wall follower) 
        // cannot cross diagonal pixel boundaries unless configured to do so for thin lines.
        // By default, touching corners separate blobs.
        expect(polygons).toHaveLength(2);
        expect(polygons[0][0]).toEqual({ x: 0, y: 0 });
        expect(polygons[1][0]).toEqual({ x: 1, y: 1 });
    });

    it('creates complex non-orthogonal simplified shapes cleanly', () => {
        const grid = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0]
        ];
        // A "plus" shape.
        const polygons = marchingSquares(3, 3, createMockSolidFn(grid));

        expect(polygons).toHaveLength(1);
        const poly = polygons[0];

        // A plus has 12 corners, plus 1 for closure.
        expect(poly).toHaveLength(13);

        // Starts top edge of top pixel (1,0)
        expect(poly[0]).toEqual({ x: 1, y: 0 });
        expect(poly[1]).toEqual({ x: 2, y: 0 });
        expect(poly[2]).toEqual({ x: 2, y: 1 });
        expect(poly[3]).toEqual({ x: 3, y: 1 });
        // ... and so on
    });

});
