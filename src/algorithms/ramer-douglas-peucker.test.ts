import { describe, it, expect } from 'vitest';
import { simplifyPolygon } from './ramer-douglas-peucker.js';

describe('simplifyPolygon (Ramer-Douglas-Peucker)', () => {

    it('returns the original array if epsilon is <= 0 or points <= 2', () => {
        const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];

        expect(simplifyPolygon(points, 0)).toEqual(points);
        expect(simplifyPolygon(points, -1)).toEqual(points);

        const short = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
        expect(simplifyPolygon(short, 10)).toEqual(short);
        // Ensure new array instance
        expect(simplifyPolygon(short, 10)).not.toBe(short);
    });

    it('simplifies perfectly collinear points with any epsilon > 0', () => {
        const line = [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 5, y: 5 },
            { x: 10, y: 10 }
        ];

        const output = simplifyPolygon(line, 0.1);
        expect(output).toHaveLength(2);
        expect(output[0]).toEqual({ x: 0, y: 0 });
        expect(output[1]).toEqual({ x: 10, y: 10 });
    });

    it('retains structural corners correctly based on epsilon tolerance', () => {
        const lShape = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 5, y: 0 },   // Straight line segment
            { x: 10, y: 0 },  // CORNER
            { x: 10, y: 5 },  // Straight line segment
            { x: 10, y: 10 }
        ];

        // A tight epsilon should collapse the straight lines but keep the corner
        const tight = simplifyPolygon(lShape, 0.5);
        expect(tight).toHaveLength(3);
        expect(tight).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 }
        ]);

        // A massive epsilon (e.g. 15) should simply draw a straight line from 0,0 to 10,10,
        // ignoring the distance of the (10,0) corner entirely!
        // Distance from (10,0) to line [(0,0)->(10,10)] is ~7.07
        const loose = simplifyPolygon(lShape, 8.0);
        expect(loose).toHaveLength(2);
        expect(loose).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 10 }
        ]);

        // Epsilon 7.0 should barely keep it
        const barely = simplifyPolygon(lShape, 7.0);
        expect(barely).toHaveLength(3);
    });

    it('handles strictly closed polygons effectively using the major axis split', () => {
        const closedSquare = [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 10, y: 0 }, // Top Edge
            { x: 10, y: 5 },
            { x: 10, y: 10 }, // Right Edge
            { x: 5, y: 10 },
            { x: 0, y: 10 }, // Bottom Edge
            { x: 0, y: 5 },
            { x: 0, y: 0 }  // Closed back to start
        ];

        const simplified = simplifyPolygon(closedSquare, 0.5);

        expect(simplified).toHaveLength(5);
        expect(simplified[0]).toEqual({ x: 0, y: 0 });
        expect(simplified[1]).toEqual({ x: 10, y: 0 });
        expect(simplified[2]).toEqual({ x: 10, y: 10 });
        expect(simplified[3]).toEqual({ x: 0, y: 10 });
        expect(simplified[4]).toEqual({ x: 0, y: 0 }); // Retains the closing link
    });

    it('smooths a jagged circle approximation based on epsilon', () => {
        // A rough octagon approximating a circle
        const circle = [
            { x: 3, y: 0 },
            { x: 7, y: 0 },
            { x: 10, y: 3 },
            { x: 10, y: 7 },
            { x: 7, y: 10 },
            { x: 3, y: 10 },
            { x: 0, y: 7 },
            { x: 0, y: 3 },
            { x: 3, y: 0 } // Closed
        ];

        // An epsilon of 1.0 shouldn't be enough to cut corners, keeping the octagon
        const octagon = simplifyPolygon(circle, 1.0);
        expect(octagon).toHaveLength(9);

        // A higher epsilon should cut the shallow diagonal corners, effectively turning it into a square
        const square = simplifyPolygon(circle, 3.5);
        expect(square).toHaveLength(5);
    });

    it('increasing epsilon monotonically reduces or maintains vertex count', () => {
        // Zigzag polyline with known deviations
        const zigzag = [
            { x: 0, y: 0 },
            { x: 2, y: 3 },
            { x: 4, y: 0 },
            { x: 6, y: 5 },
            { x: 8, y: 0 },
            { x: 10, y: 4 },
            { x: 12, y: 0 },
        ];

        let prevCount = zigzag.length;
        for (const eps of [0.5, 1.0, 2.0, 3.0, 5.0, 10.0]) {
            const simplified = simplifyPolygon(zigzag, eps);
            expect(simplified.length).toBeLessThanOrEqual(prevCount);
            // Must always retain start and end
            expect(simplified[0]).toEqual(zigzag[0]);
            expect(simplified[simplified.length - 1]).toEqual(zigzag[zigzag.length - 1]);
            prevCount = simplified.length;
        }
    });

    it('very small epsilon preserves all structural vertices', () => {
        const triangle = [
            { x: 0, y: 0 },
            { x: 5, y: 10 },
            { x: 10, y: 0 },
        ];
        // Epsilon tiny but > 0
        const result = simplifyPolygon(triangle, 0.001);
        expect(result).toHaveLength(3);
        expect(result).toEqual(triangle);
    });

    it('very large epsilon reduces to just endpoints (open polyline)', () => {
        const wavy = [
            { x: 0, y: 0 },
            { x: 2, y: 1 },
            { x: 4, y: -1 },
            { x: 6, y: 2 },
            { x: 8, y: -2 },
            { x: 10, y: 0 },
        ];
        const result = simplifyPolygon(wavy, 100);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ x: 0, y: 0 });
        expect(result[1]).toEqual({ x: 10, y: 0 });
    });

    it('simplifies a closed polygon with many collinear edges to just corners', () => {
        // Rectangle with many intermediate points on each edge
        const rect = [
            { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 0 },
            { x: 8, y: 2 }, { x: 8, y: 4 }, { x: 8, y: 6 },
            { x: 6, y: 6 }, { x: 4, y: 6 }, { x: 2, y: 6 }, { x: 0, y: 6 },
            { x: 0, y: 4 }, { x: 0, y: 2 },
            { x: 0, y: 0 }, // closed
        ];
        const simplified = simplifyPolygon(rect, 0.1);
        expect(simplified).toHaveLength(5); // 4 corners + closure
    });

    it('handles single-point and two-point inputs gracefully', () => {
        const single = [{ x: 5, y: 5 }];
        expect(simplifyPolygon(single, 1.0)).toEqual([{ x: 5, y: 5 }]);

        const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
        expect(simplifyPolygon(two, 1.0)).toEqual(two);
    });

    it('no simplified point deviates more than epsilon from original segments', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 3, y: 4 },
            { x: 5, y: 1 },
            { x: 8, y: 6 },
            { x: 10, y: 0 },
        ];
        const eps = 2.0;
        const simplified = simplifyPolygon(points, eps);

        // Every original point must be within eps of some segment of the simplified polyline
        for (const p of points) {
            let minDist = Infinity;
            for (let i = 0; i < simplified.length - 1; i++) {
                const a = simplified[i];
                const b = simplified[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len2 = dx * dx + dy * dy;
                if (len2 === 0) {
                    minDist = Math.min(minDist, Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2));
                } else {
                    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
                    const projX = a.x + t * dx;
                    const projY = a.y + t * dy;
                    minDist = Math.min(minDist, Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2));
                }
            }
            // Allow small floating point tolerance
            expect(minDist).toBeLessThanOrEqual(eps + 0.001);
        }
    });

});
