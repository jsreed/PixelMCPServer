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

        it('known pixel coords for radius 1', () => {
            const points = midpointCircle(0, 0, 1);
            const set = new Set(points.map(p => `${p.x},${p.y}`));
            // R=1 circle: the 4 cardinal pixels
            expect(set).toContain('1,0');
            expect(set).toContain('-1,0');
            expect(set).toContain('0,1');
            expect(set).toContain('0,-1');
            expect(points).toHaveLength(4);
        });

        it('known pixel coords for radius 3', () => {
            const points = midpointCircle(0, 0, 3);
            const set = new Set(points.map(p => `${p.x},${p.y}`));
            // Cardinal poles
            expect(set).toContain('3,0');
            expect(set).toContain('-3,0');
            expect(set).toContain('0,3');
            expect(set).toContain('0,-3');
            // Known octant pixel (3,1) and its reflections
            expect(set).toContain('3,1');
            expect(set).toContain('-3,1');
            expect(set).toContain('1,3');
            expect(set).toContain('-1,3');
        });

        it('all points lie within expected distance from center', () => {
            for (const r of [2, 5, 10, 20]) {
                const points = midpointCircle(0, 0, r);
                for (const p of points) {
                    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
                    // Discrete circle points should be within 1 pixel of the ideal radius
                    expect(dist).toBeGreaterThanOrEqual(r - 1);
                    expect(dist).toBeLessThanOrEqual(r + 1);
                }
            }
        });

        it('no duplicate points', () => {
            for (const r of [1, 3, 5, 8, 12]) {
                const points = midpointCircle(0, 0, r);
                const set = new Set(points.map(p => `${p.x},${p.y}`));
                expect(set.size).toBe(points.length);
            }
        });

        it('pixel count increases with radius', () => {
            let prevCount = 0;
            for (const r of [1, 2, 3, 5, 8, 12]) {
                const count = midpointCircle(0, 0, r).length;
                expect(count).toBeGreaterThan(prevCount);
                prevCount = count;
            }
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

        it('known poles for rx=4, ry=2 ellipse', () => {
            const points = midpointEllipse(0, 0, 4, 2);
            const set = new Set(points.map(p => `${p.x},${p.y}`));
            // Cardinal poles must be present
            expect(set).toContain('4,0');
            expect(set).toContain('-4,0');
            expect(set).toContain('0,2');
            expect(set).toContain('0,-2');
        });

        it('all points lie near the ideal ellipse boundary', () => {
            const rx = 10, ry = 6;
            const points = midpointEllipse(0, 0, rx, ry);
            for (const p of points) {
                // Ellipse equation: (x/rx)^2 + (y/ry)^2 should be close to 1
                const norm = (p.x / rx) ** 2 + (p.y / ry) ** 2;
                // Allow discrete rasterization tolerance
                expect(norm).toBeGreaterThanOrEqual(0.5);
                expect(norm).toBeLessThanOrEqual(1.6);
            }
        });

        it('no duplicate points for various sizes', () => {
            const cases: [number, number][] = [[3, 2], [5, 8], [10, 4], [7, 7]];
            for (const [rx, ry] of cases) {
                const points = midpointEllipse(0, 0, rx, ry);
                const set = new Set(points.map(p => `${p.x},${p.y}`));
                expect(set.size).toBe(points.length);
            }
        });

        it('center offset shifts all points uniformly', () => {
            const base = midpointEllipse(0, 0, 6, 3);
            const shifted = midpointEllipse(10, 20, 6, 3);
            const baseSet = new Set(base.map(p => `${p.x},${p.y}`));
            const shiftedBack = new Set(shifted.map(p => `${p.x - 10},${p.y - 20}`));
            expect(baseSet).toEqual(shiftedBack);
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
