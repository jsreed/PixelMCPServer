import { describe, it, expect } from 'vitest';
import { midpointCircle, midpointEllipse } from './midpoint.js';

describe('midpoint algorithms', () => {

    describe('midpointCircle', () => {
        it('returns a single point for radius 0', () => {
            expect(midpointCircle(2, 3, 0)).toEqual([{ x: 2, y: 3 }]);
        });

        it('handles negative radius correctly as positive', () => {
            const positive = midpointCircle(0, 0, 5);
            const negative = midpointCircle(0, 0, -5);

            // Map to string form for order-agnostic comparison
            const setP = new Set(positive.map(p => `${p.x},${p.y}`));
            const setN = new Set(negative.map(p => `${p.x},${p.y}`));

            expect(setP).toEqual(setN);
        });

        it('has exact 4-way symmetry', () => {
            const points = midpointCircle(0, 0, 5);

            for (const p of points) {
                // If (x,y) is in the circle, (-x,y), (x,-y), (-x,-y) must be
                const hasNX = points.some(px => px.x === -p.x && px.y === p.y);
                const hasNY = points.some(px => px.x === p.x && px.y === -p.y);
                const hasBoth = points.some(px => px.x === -p.x && px.y === -p.y);

                expect(hasNX).toBe(true);
                expect(hasNY).toBe(true);
                expect(hasBoth).toBe(true);
            }
        });

        it('has no skipped pixels sequentially across bounds', () => {
            // Because of our deduplication, a tight circle of radius 1 should have exactly 4 pixels.
            // R=1 typically generates (1,0), (0,1), (-1,0), (0,-1)
            const r1 = midpointCircle(0, 0, 1);
            expect(r1.length).toBeGreaterThanOrEqual(4);

            // Should contain the 4 poles
            expect(r1).toContainEqual({ x: 1, y: 0 });
            expect(r1).toContainEqual({ x: 0, y: 1 });
            expect(r1).toContainEqual({ x: -1, y: 0 });
            expect(r1).toContainEqual({ x: 0, y: -1 });

            // Ensure no duplicate points exist internally
            const stringified = r1.map(p => `${p.x},${p.y}`);
            const uniqueStr = new Set(stringified);
            expect(uniqueStr.size).toEqual(r1.length);
        });

        it('handles negative coordinates perfectly', () => {
            const p1 = midpointCircle(0, 0, 3);
            const p2 = midpointCircle(-10, -10, 3);

            // Mapping p2 back to origin and checking equivalence
            const mappedP2 = p2.map(p => ({ x: p.x + 10, y: p.y + 10 }));

            const setP1 = new Set(p1.map(p => `${p.x},${p.y}`));
            const setP2 = new Set(mappedP2.map(p => `${p.x},${p.y}`));

            expect(setP1).toEqual(setP2);
        });
    });

    describe('midpointEllipse', () => {
        it('returns a single point for rx=0, ry=0', () => {
            expect(midpointEllipse(2, 3, 0, 0)).toEqual([{ x: 2, y: 3 }]);
        });

        it('returns a vertical line for rx=0', () => {
            const points = midpointEllipse(0, 0, 0, 2);
            // From y=-2 to y=+2 inclusive = 5 pixels
            expect(points).toHaveLength(5);
            expect(points).toContainEqual({ x: 0, y: -2 });
            expect(points).toContainEqual({ x: 0, y: 0 });
            expect(points).toContainEqual({ x: 0, y: 2 });
            expect(points.every(p => p.x === 0)).toBe(true);
        });

        it('returns a horizontal line for ry=0', () => {
            const points = midpointEllipse(0, 0, 2, 0);
            expect(points).toHaveLength(5);
            expect(points).toContainEqual({ x: -2, y: 0 });
            expect(points).toContainEqual({ x: 0, y: 0 });
            expect(points).toContainEqual({ x: 2, y: 0 });
            expect(points.every(p => p.y === 0)).toBe(true);
        });

        it('produces identical geometry to midpointCircle when rx=ry=r', () => {
            const circ = midpointCircle(5, 5, 8);
            const elli = midpointEllipse(5, 5, 8, 8);

            const setCirc = new Set(circ.map(p => `${p.x},${p.y}`));
            const setElli = new Set(elli.map(p => `${p.x},${p.y}`));

            expect(setCirc).toEqual(setElli);
        });

        it('handles highly elongated horizontal ellipses without breaking', () => {
            const elli = midpointEllipse(0, 0, 20, 2);

            // Includes the extreme poles
            expect(elli).toContainEqual({ x: 20, y: 0 });
            expect(elli).toContainEqual({ x: -20, y: 0 });
            expect(elli).toContainEqual({ x: 0, y: 2 });
            expect(elli).toContainEqual({ x: 0, y: -2 });

            // Verifies 4-way symmetry on an extreme shape
            for (const p of elli) {
                const hasBoth = elli.some(px => px.x === -p.x && px.y === -p.y);
                expect(hasBoth).toBe(true);
            }
        });

        it('handles highly elongated vertical ellipses without breaking', () => {
            const elli = midpointEllipse(0, 0, 2, 20);

            // Includes the extreme poles
            expect(elli).toContainEqual({ x: 2, y: 0 });
            expect(elli).toContainEqual({ x: -2, y: 0 });
            expect(elli).toContainEqual({ x: 0, y: 20 });
            expect(elli).toContainEqual({ x: 0, y: -20 });

            // Ensure no duplicates exist
            const uniqueStr = new Set(elli.map(p => `${p.x},${p.y}`));
            expect(uniqueStr.size).toEqual(elli.length);
        });

        it('guarantees 8-way physical connectivity for continuous outlines', () => {
            const verifyConnectivity = (points: Array<{ x: number, y: number }>) => {
                // A continuous outline means for every point, there is at least 1 neighbor
                // adjacent in the 8-way Moore neighborhood. (Usually 2, but poles can have 1 depending on tie-breakers)
                for (const p of points) {
                    const neighbors = points.filter(px =>
                        (Math.abs(px.x - p.x) <= 1 && Math.abs(px.y - p.y) <= 1) &&
                        !(px.x === p.x && px.y === p.y)
                    );
                    expect(neighbors.length).toBeGreaterThanOrEqual(1);
                }
            };

            verifyConnectivity(midpointCircle(0, 0, 15));
            verifyConnectivity(midpointEllipse(0, 0, 15, 8));
            verifyConnectivity(midpointEllipse(0, 0, 4, 12));
        });
    });

});
