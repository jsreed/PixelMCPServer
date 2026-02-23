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

});
