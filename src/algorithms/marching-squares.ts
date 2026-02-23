/**
 * Represents a sequence of connected pixel coordinates forming a closed polygon contour.
 */
export type Polygon = Array<{ x: number, y: number }>;

/**
 * Generates an array of closed polygons representing the external and internal (hole) contours
 * of solid pixel regions on a 2D grid using the Marching Squares algorithm.
 * 
 * @param width The width of the grid workspace.
 * @param height The height of the grid workspace.
 * @param isSolid A function that returns true if the specified coordinate is considered "solid" (e.g., non-transparent).
 * @returns An array of polygons, where each polygon is an ordered array of vertex coordinates.
 */
export function marchingSquares(
    width: number,
    height: number,
    isSolid: (x: number, y: number) => boolean
): Polygon[] {
    const polygons: Polygon[] = [];

    // To prevent tracing the same contour, we track the *edges* we've traversed.
    // An edge is uniquely identified by its direction from a specific grid cell corner.
    // Grid cells correspond directly to pixels (x, y) where x, y are the integer coordinates of the pixel.
    // The "marching squares" evaluate the 4 corners forming a 1x1 cell between 4 pixels.
    // A grid cell (cx, cy) evaluates pixels: (cx-1, cy-1), (cx, cy-1), (cx-1, cy), (cx, cy).

    // Instead of classic marching squares over arbitrary iso-levels, for a binary pixel grid
    // it's far easier and perfectly equivalent to use Moore Neighborhood Tracing or 
    // a "wall follower" algorithm spanning the pixel edges themselves.
    // Let's implement Wall Follower on the grid edges.

    // A visited edge is defined by "x,y,direction", where direction is the side of the pixel (0=top, 1=right, 2=bottom, 3=left).
    const visitedEdges = new Set<string>();

    // Directions: 0=Up, 1=Right, 2=Down, 3=Left (pointing along the edge)
    // When tracing the perimeter of a solid pixel, we keep our "hand" on the wall (the solid pixel).
    // If we trace clockwise (external perimeters) or counter-clockwise (internal holes).

    const checkSolid = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return isSolid(x, y);
    };

    // Edge tracking keys
    const edgeKey = (px: number, py: number, dir: number) => `${px},${py},${dir}`;

    // Helper to trace a single continuous contour starting from a known unvisited edge
    const traceContour = (startX: number, startY: number, startDir: number): Polygon => {
        const polygon: Polygon = [];

        let cx = startX;
        let cy = startY;
        let dir = startDir;

        // Wall follower logic: 
        // We are currently at grid point (cx, cy) moving in `dir`.
        // The solid pixel we are tracing is ALWAYS to our "right" relative to the direction of travel.
        // Wait, pixel corners are discrete. Let's define the coordinate system precisely:
        // A pixel (px, py) occupies the square from (px, py) to (px+1, py+1).
        // Vertices of the polygon will be exactly these corner coordinates.

        // So a pixel at (px, py) has 4 edges:
        // Top edge: from (px, py) to (px+1, py). Direction = 1 (Right) if the solid pixel is BELOW it (px, py).
        // Right edge: from (px+1, py) to (px+1, py+1). Direction = 2 (Down) if solid pixel is LEFT of it.
        // Bottom edge: from (px+1, py+1) to (px, py+1). Direction = 3 (Left) if solid pixel is ABOVE it.
        // Left edge: from (px, py+1) to (px, py). Direction = 0 (Up) if solid pixel is RIGHT of it.
        // This creates a clockwise winding for external contours.

        // So we trace polygon *vertices* (vx, vy).
        let vx = startX;
        let vy = startY;

        while (true) {
            // Add vertex to polygon. (We will simplify collinear points later).
            polygon.push({ x: vx, y: vy });

            // Depending on current direction, identify the pixel we are "holding onto" (the wall)
            // and the pixel "in front" of the wall.
            let wallPx = -1, wallPy = -1;
            let frontPx = -1, frontPy = -1;
            let diagPx = -1, diagPy = -1; // The pixel diagonal to the current vertex

            if (dir === 1) { // Moving Right on Top edge
                wallPx = vx; wallPy = vy;       // Pixel below the edge (the solid wall we found)
                frontPx = vx; frontPy = vy - 1; // Pixel above the edge
                diagPx = vx + 1; diagPy = vy - 1;
            } else if (dir === 2) { // Moving Down on Right edge
                wallPx = vx - 1; wallPy = vy;   // Pixel left of edge
                frontPx = vx; frontPy = vy;     // Pixel right of edge
                diagPx = vx; diagPy = vy + 1;
            } else if (dir === 3) { // Moving Left on Bottom edge
                wallPx = vx - 1; wallPy = vy - 1; // Pixel above edge
                frontPx = vx - 1; frontPy = vy;   // Pixel below edge
                diagPx = vx - 2; diagPy = vy;
            } else if (dir === 0) { // Moving Up on Left edge
                wallPx = vx; wallPy = vy - 1;     // Pixel right of edge
                frontPx = vx - 1; frontPy = vy - 1; // Pixel left of edge
                diagPx = vx - 1; diagPy = vy - 2;
            }

            // Mark the *wall pixel's* appropriate edge as visited to prevent retracing
            // Which edge of wallPx is this? It's the one corresponding to dir.
            // (If moving Right (1), it's the Top edge of wallPx. Let's just store the vertex + direction)
            visitedEdges.add(`${vx},${vy},${dir}`);

            // Move the vertex forward
            if (dir === 0) vy--;
            else if (dir === 1) vx++;
            else if (dir === 2) vy++;
            else if (dir === 3) vx--;

            // To prevent hopping diagonally independent pixels, the wall follower must only traverse
            // edges that definitely separate SOLID (on the right) from EMPTY (on the left).
            // A vertex has 4 outgoing edges (0=Up, 1=Right, 2=Down, 3=Left).
            // We want to make the tightest Right turn possible (wall follower on right).
            // This means we check: Turn Right, Go Straight, Turn Left.

            // To evaluate if an outgoing edge is valid, its Right-hand pixel must be SOLID, 
            // and its Left-hand pixel must be EMPTY.
            const isValidEdge = (outDir: number) => {
                if (outDir === 0) return !checkSolid(vx - 1, vy - 1) && checkSolid(vx, vy - 1); // Up
                if (outDir === 1) return !checkSolid(vx, vy - 1) && checkSolid(vx, vy);         // Right
                if (outDir === 2) return !checkSolid(vx, vy) && checkSolid(vx - 1, vy);         // Down
                if (outDir === 3) return !checkSolid(vx - 1, vy) && checkSolid(vx - 1, vy - 1); // Left
                return false;
            };

            // Order of preference to hug the wall on the right (turn right, straight, turn left)
            const rightTurn = (dir + 1) % 4;
            const straight = dir;
            const leftTurn = (dir + 3) % 4;

            if (isValidEdge(rightTurn)) {
                dir = rightTurn;
            } else if (isValidEdge(straight)) {
                dir = straight;
            } else if (isValidEdge(leftTurn)) {
                dir = leftTurn;
            } else {
                // Dead end (1-pixel wide line end). Turn completely around.
                dir = (dir + 2) % 4;
            }

            // Check if we have returned to the start
            if (vx === startX && vy === startY && dir === startDir) {
                break;
            }
        }

        // Close the loop explicitly by adding the start vertex again if it's not the last one
        if (polygon.length > 0) {
            const last = polygon[polygon.length - 1];
            if (last.x !== polygon[0].x || last.y !== polygon[0].y) {
                polygon.push({ x: polygon[0].x, y: polygon[0].y });
            }
        }

        return polygon;
    };

    // Scan the grid to find untraced edges.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (isSolid(x, y)) {
                // Check the top edge of this pixel.
                // If it's an external boundary (the pixel above is empty or out of bounds)
                // AND we haven't traced it yet.
                if (!checkSolid(x, y - 1)) {
                    // The vertex for the "top" edge starts at the Top-Left corner of the pixel, which is (x, y)
                    // The direction is Right (1).
                    if (!visitedEdges.has(`${x},${y},1`)) {
                        polygons.push(traceContour(x, y, 1));
                    }
                }

                // Check the bottom edge of this pixel (for internal holes).
                // If the pixel below is empty, the bottom edge is a boundary.
                if (!checkSolid(x, y + 1)) {
                    // The vertex for the "bottom" edge starts at the Bottom-Right corner, which is (x+1, y+1)
                    // The direction is Left (3).
                    // This creates a counter-clockwise winding for holes.
                    if (!visitedEdges.has(`${x + 1},${y + 1},3`)) {
                        polygons.push(traceContour(x + 1, y + 1, 3));
                    }
                }
            }
        }
    }

    // Optional: collinear point reduction could be done here, 
    // but the design document specifies an explicit RDP (Ramer-Douglas-Peucker) step 1.5.5 for simplification.
    // However, it's highly efficient to strip perfectly orthogonal collinear points right here.
    return polygons.map(simplifyOrthogonal);
}

/**
 * Strips perfectly straight intermediate vertices.
 * E.g. A(0,0) -> B(1,0) -> C(2,0) becomes A(0,0) -> C(2,0).
 */
export function simplifyOrthogonal(polygon: Polygon): Polygon {
    if (polygon.length <= 2) return polygon;

    const simplified: Polygon = [polygon[0]];

    for (let i = 1; i < polygon.length - 1; i++) {
        const prev = simplified[simplified.length - 1];
        const curr = polygon[i];
        const next = polygon[i + 1];

        // If the direction vector from prev->curr is identical to curr->next, curr is redundant.
        const dx1 = Math.sign(curr.x - prev.x);
        const dy1 = Math.sign(curr.y - prev.y);
        const dx2 = Math.sign(next.x - curr.x);
        const dy2 = Math.sign(next.y - curr.y);

        if (dx1 !== dx2 || dy1 !== dy2) {
            simplified.push(curr);
        }
    }

    simplified.push(polygon[polygon.length - 1]);
    return simplified;
}
