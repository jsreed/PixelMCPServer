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

});
