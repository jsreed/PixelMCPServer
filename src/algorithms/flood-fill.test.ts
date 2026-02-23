import { describe, it, expect } from 'vitest';
import { floodFill } from './flood-fill.js';

describe('floodFill', () => {

    const createMockCanvas = (w: number, h: number, defaultColor = 0): number[][] => {
        return Array.from({ length: h }, () => Array(w).fill(defaultColor));
    };

    const canvasValue = (canvas: number[][]) => (x: number, y: number) => {
        if (y < 0 || y >= canvas.length || x < 0 || x >= canvas[0].length) return null;
        return canvas[y][x];
    };

    it('returns empty array if start point is out of bounds', () => {
        const canvas = createMockCanvas(5, 5);
        expect(floodFill(-1, 0, 5, 5, canvasValue(canvas))).toEqual([]);
        expect(floodFill(0, 5, 5, 5, canvasValue(canvas))).toEqual([]);
    });

    it('fills a bare 1x1 canvas', () => {
        const canvas = createMockCanvas(1, 1, 1);
        const points = floodFill(0, 0, 1, 1, canvasValue(canvas));
        expect(points).toEqual([{ x: 0, y: 0 }]);
    });

    it('fills an empty unbordered canvas entirely', () => {
        const canvas = createMockCanvas(10, 10, 2);
        const points = floodFill(5, 5, 10, 10, canvasValue(canvas));

        expect(points.length).toBe(100);

        // Ensure every coordinate from 0,0 to 9,9 is covered
        const map = new Set(points.map(p => `${p.x},${p.y}`));
        expect(map.size).toBe(100);
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 10; x++) {
                expect(map.has(`${x},${y}`)).toBe(true);
            }
        }
    });

    it('stops exactly at bordered lines', () => {
        const canvas = createMockCanvas(5, 5, 0);
        // Draw a vertical wall at x=2 with color 1
        for (let y = 0; y < 5; y++) canvas[y][2] = 1;

        // Click on the left side
        const leftFill = floodFill(0, 0, 5, 5, canvasValue(canvas));

        // Should fill x=0 and x=1 for all 5 y-coordinates = 10 points
        expect(leftFill).toHaveLength(10);
        for (const p of leftFill) {
            expect(p.x).toBeLessThan(2);
            expect(canvasValue(canvas)(p.x, p.y)).toBe(0);
        }
    });

    it('leaks correctly into U-shapes and concave areas', () => {
        const canvas = createMockCanvas(6, 6, 0);
        /* 
           0 0 0 0 0 0
           0 1 1 1 1 0
           0 1 0 0 1 0
           0 1 0 0 1 0
           0 1 1 0 1 0
           0 0 0 0 0 0
        */
        // Draw the solid "1" U-shape that encircles (2,2) and (3,2)
        canvas[1][1] = 1; canvas[1][2] = 1; canvas[1][3] = 1; canvas[1][4] = 1;
        canvas[2][1] = 1; canvas[2][4] = 1;
        canvas[3][1] = 1; canvas[3][4] = 1;
        canvas[4][1] = 1; canvas[4][2] = 1; canvas[4][3] = 1; canvas[4][4] = 1;

        // Click outside the U-shape (e.g. at 0,0). It should flow EVERYWHERE except the 1s and the inside 0s.
        const outsideFill = floodFill(0, 0, 6, 6, canvasValue(canvas));

        // Total 0s = 36 - 12(ones) = 24.
        // The outside 0s should be 24 - 4 = 20.
        if (outsideFill.length !== 20) {
            console.log("LEAKED outsideFill:", JSON.stringify(outsideFill));
        }
        expect(outsideFill).toHaveLength(20);

        const map = new Set(outsideFill.map(p => `${p.x},${p.y}`));
        // Verify inside cells are NOT touched
        expect(map.has('2,2')).toBe(false);
        expect(map.has('3,2')).toBe(false);
        expect(map.has('2,3')).toBe(false);
        expect(map.has('3,3')).toBe(false);

        // Verify some outside cells ARE touched
        expect(map.has('5,5')).toBe(true);
        expect(map.has('0,5')).toBe(true);
        expect(map.has('2,5')).toBe(true);

        // Verify the walls are NOT touched
        expect(map.has('1,1')).toBe(false);


        // NOW click INSIDE the cup. It should flow and fill exactly the 4 inside cells.
        const insideFill = floodFill(2, 2, 6, 6, canvasValue(canvas));
        if (insideFill.length !== 4) {
            console.log("INSIDE FILL MISSED:", JSON.stringify(insideFill));
        }
        expect(insideFill).toHaveLength(4);
        const insideMap = new Set(insideFill.map(p => `${p.x},${p.y}`));
        expect(insideMap.has('2,2')).toBe(true);
        expect(insideMap.has('3,2')).toBe(true);
        expect(insideMap.has('2,3')).toBe(true);
        expect(insideMap.has('3,3')).toBe(true);
    });

    it('rounds float inputs natively', () => {
        const canvas = createMockCanvas(3, 3, 0);
        const fill = floodFill(1.4, 2.9, 3, 3, canvasValue(canvas));
        // Should evaluate as (1, 3) which is out of bounds
        expect(fill).toHaveLength(0);

        const validFill = floodFill(1.4, 1.9, 3, 3, canvasValue(canvas));
        // Evaluates as (1, 2) which is in bounds, filling the 3x3
        expect(validFill).toHaveLength(9);
    });

    it('fills only the start pixel when surrounded by different colors', () => {
        const canvas = createMockCanvas(3, 3, 1);
        canvas[1][1] = 5; // Center pixel is unique
        const points = floodFill(1, 1, 3, 3, canvasValue(canvas));
        expect(points).toHaveLength(1);
        expect(points[0]).toEqual({ x: 1, y: 1 });
    });

    it('fills from canvas edge correctly', () => {
        const canvas = createMockCanvas(5, 5, 0);
        // Wall at y=2 separating top from bottom
        for (let x = 0; x < 5; x++) canvas[2][x] = 1;

        // Fill from top-left corner
        const topFill = floodFill(0, 0, 5, 5, canvasValue(canvas));
        expect(topFill).toHaveLength(10); // rows 0-1, 5 columns each

        // Fill from bottom-right corner
        const botFill = floodFill(4, 4, 5, 5, canvasValue(canvas));
        expect(botFill).toHaveLength(10); // rows 3-4, 5 columns each
    });

    it('fills from all four canvas corners into same region', () => {
        const canvas = createMockCanvas(4, 4, 0);
        const fromTL = floodFill(0, 0, 4, 4, canvasValue(canvas));
        const fromTR = floodFill(3, 0, 4, 4, canvasValue(canvas));
        const fromBL = floodFill(0, 3, 4, 4, canvasValue(canvas));
        const fromBR = floodFill(3, 3, 4, 4, canvasValue(canvas));

        // All should fill the entire canvas
        expect(fromTL).toHaveLength(16);
        expect(fromTR).toHaveLength(16);
        expect(fromBL).toHaveLength(16);
        expect(fromBR).toHaveLength(16);
    });

    it('does not leak through diagonal gaps (4-way connectivity)', () => {
        const canvas = createMockCanvas(5, 5, 0);
        /*  Diagonal barrier of 1s:
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 1 0
            0 0 0 0 1
        */
        for (let i = 0; i < 5; i++) canvas[i][i] = 1;

        // Fill from (1,0) — top-right region. With 4-way fill it shouldn't leak
        // through the diagonal to (0,1)
        const fill = floodFill(1, 0, 5, 5, canvasValue(canvas));
        const set = new Set(fill.map(p => `${p.x},${p.y}`));

        // The diagonal 1s separate via 4-way: (1,0) connects to upper-right zone
        // (0,1) is below-left of the diagonal — should NOT be reached
        expect(set.has('1,0')).toBe(true);
        expect(set.has('0,1')).toBe(false);
    });

    it('fills a narrow 1-pixel-wide corridor', () => {
        const canvas = createMockCanvas(7, 5, 1);
        // Carve a 1-pixel corridor: row 2, all columns
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 7; x++) {
                canvas[y][x] = 1;
            }
        }
        // Clear a winding path of 0s
        canvas[0][0] = 0;
        canvas[1][0] = 0;
        canvas[2][0] = 0;
        canvas[2][1] = 0;
        canvas[2][2] = 0;
        canvas[2][3] = 0;
        canvas[1][3] = 0;
        canvas[0][3] = 0;

        const fill = floodFill(0, 0, 7, 5, canvasValue(canvas));
        expect(fill).toHaveLength(8);
    });

    it('fills an L-shaped region', () => {
        const canvas = createMockCanvas(5, 5, 1);
        /*  L-shape of 0s:
            0 0 1 1 1
            0 0 1 1 1
            0 0 1 1 1
            0 0 0 0 1
            0 0 0 0 1
        */
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 2; x++) canvas[y][x] = 0;
        }
        for (let x = 2; x < 4; x++) {
            canvas[3][x] = 0;
            canvas[4][x] = 0;
        }

        const fill = floodFill(0, 0, 5, 5, canvasValue(canvas));
        expect(fill).toHaveLength(14); // 10 (left col) + 4 (bottom extension)
    });

    it('handles single-row canvas', () => {
        const canvas = [[0, 0, 1, 0, 0]];
        const fill = floodFill(0, 0, 5, 1, canvasValue(canvas));
        expect(fill).toHaveLength(2);
        const set = new Set(fill.map(p => `${p.x},${p.y}`));
        expect(set.has('0,0')).toBe(true);
        expect(set.has('1,0')).toBe(true);
    });

    it('handles single-column canvas', () => {
        const canvas = [[0], [0], [1], [0], [0]];
        const fill = floodFill(0, 0, 1, 5, canvasValue(canvas));
        expect(fill).toHaveLength(2);
    });

});
