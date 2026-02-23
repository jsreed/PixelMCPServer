/**
 * Calculates the perpendicular distance from a point to a line segment defined by two points.
 */
function perpendicularDistance(
    point: { x: number, y: number },
    lineStart: { x: number, y: number },
    lineEnd: { x: number, y: number }
): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    // If the line segment is actually a single point
    if (dx === 0 && dy === 0) {
        return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    // Calculate the perpendicular distance
    const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
}

/**
 * Simplifies a polyline (or polygon contour) by reducing the number of vertices using the Ramer-Douglas-Peucker algorithm.
 * 
 * @param points An array of vertices representing the polyline or polygon.
 * @param epsilon The maximum perpendicular distance a point can deviation from the simplified line segment 
 *                before it is preserved. A value of `0` returns the original unsimplified points.
 * @returns A new array containing the structurally significant simplified vertices.
 */
export function simplifyPolygon(
    points: Array<{ x: number, y: number }>,
    epsilon: number
): Array<{ x: number, y: number }> {
    if (points.length <= 2 || epsilon <= 0) {
        return [...points];
    }

    // For perfectly closed polygons (where the first and last points are identical),
    // the distance from any point to the segment `Start->End` is 0 (or just the distance to the point).
    // The classic RDP fails here because the segment is a dot.
    // To handle closed polygons reliably, we first find the point furthest from the start vertex,
    // establishing the "major axis" of the polygon, then run RDP on the two halves independently.
    const isClosed = (points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y);

    if (isClosed) {
        let maxDist = 0;
        let splitIndex = 0;

        for (let i = 1; i < points.length - 1; i++) {
            const dist = Math.sqrt((points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2);
            if (dist > maxDist) {
                maxDist = dist;
                splitIndex = i;
            }
        }

        // If it's closed but essentially a dot itself, just return it
        if (splitIndex === 0) return [points[0], points[points.length - 1]];

        const firstHalf = simplifyPolygonOpen(points.slice(0, splitIndex + 1), epsilon);
        const secondHalf = simplifyPolygonOpen(points.slice(splitIndex), epsilon);

        // Combine them (the splitIndex point is duplicated at the end of firstHalf and start of secondHalf)
        return [...firstHalf.slice(0, -1), ...secondHalf];
    } else {
        return simplifyPolygonOpen(points, epsilon);
    }
}

/**
 * The core recursive RDP algorithm for an open polyline segment.
 */
function simplifyPolygonOpen(
    points: Array<{ x: number, y: number }>,
    epsilon: number
): Array<{ x: number, y: number }> {
    if (points.length <= 2) return [...points];

    let maxDistance = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const distance = perpendicularDistance(points[i], points[0], points[end]);
        if (distance > maxDistance) {
            maxDistance = distance;
            index = i;
        }
    }

    // If max distance is greater than the tolerance, we must recursively simplify both sides
    if (maxDistance > epsilon) {
        const left = simplifyPolygonOpen(points.slice(0, index + 1), epsilon);
        const right = simplifyPolygonOpen(points.slice(index), epsilon);

        // Combine (drop the redundant shared vertex at the boundary)
        return [...left.slice(0, -1), ...right];
    } else {
        // Discard all intermediate points, keeping only the start and end of this segment
        return [points[0], points[end]];
    }
}
