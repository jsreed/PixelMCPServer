/**
 * Generates an array of pixel coordinates representing a circle outline using the Midpoint Circle Algorithm.
 * 
 * @param xc The center x-coordinate (integer).
 * @param yc The center y-coordinate (integer).
 * @param r The radius (integer).
 * @returns An array of `{x, y}` coordinates representing the circle outline outline.
 */
export function midpointCircle(xc: number, yc: number, r: number): Array<{ x: number, y: number }> {
    xc = Math.round(xc);
    yc = Math.round(yc);
    r = Math.round(Math.abs(r));

    if (r === 0) {
        return [{ x: xc, y: yc }];
    }

    const points: Array<{ x: number, y: number }> = [];

    // Helper to add symmetrical points for all 8 octants
    const addSymmetry = (cx: number, cy: number, px: number, py: number) => {
        points.push({ x: cx + px, y: cy + py });
        if (px !== 0) points.push({ x: cx - px, y: cy + py });
        if (py !== 0) points.push({ x: cx + px, y: cy - py });
        if (px !== 0 && py !== 0) points.push({ x: cx - px, y: cy - py });

        if (px !== py) {
            points.push({ x: cx + py, y: cy + px });
            if (py !== 0) points.push({ x: cx - py, y: cy + px });
            if (px !== 0) points.push({ x: cx + py, y: cy - px });
            if (py !== 0 && px !== 0) points.push({ x: cx - py, y: cy - px });
        }
    };

    let x = r;
    let y = 0;
    let err = 1 - x;

    while (y <= x) {
        addSymmetry(xc, yc, x, y);
        y++;
        if (err < 0) {
            err += 2 * y + 1;
        } else {
            x--;
            err += 2 * (y - x + 1);
        }
    }

    // Deduplicate the array (points exactly on the axes/diagonals get pushed multiple times with naive symmetry)
    const unique = new Map<string, { x: number, y: number }>();
    for (const p of points) {
        unique.set(`${p.x},${p.y}`, p);
    }

    return Array.from(unique.values());
}

/**
 * Generates an array of pixel coordinates representing an ellipse outline using the Midpoint Ellipse Algorithm.
 * 
 * @param xc The center x-coordinate (integer).
 * @param yc The center y-coordinate (integer).
 * @param rx The x-radius (integer).
 * @param ry The y-radius (integer).
 * @returns An array of `{x, y}` coordinates representing the ellipse outline.
 */
export function midpointEllipse(xc: number, yc: number, rx: number, ry: number): Array<{ x: number, y: number }> {
    xc = Math.round(xc);
    yc = Math.round(yc);
    rx = Math.round(Math.abs(rx));
    ry = Math.round(Math.abs(ry));

    if (rx === 0 && ry === 0) {
        return [{ x: xc, y: yc }];
    }

    // Degenerate cases (straight lines)
    if (rx === 0) {
        const points = [];
        for (let i = -ry; i <= ry; i++) {
            points.push({ x: xc, y: yc + i });
        }
        return points;
    }
    if (ry === 0) {
        const points = [];
        for (let i = -rx; i <= rx; i++) {
            points.push({ x: xc + i, y: yc });
        }
        return points;
    }

    const points: Array<{ x: number, y: number }> = [];

    // Helper to add symmetrical points for the 4 quadrants
    const addSymmetry = (cx: number, cy: number, px: number, py: number) => {
        points.push({ x: cx + px, y: cy + py });
        if (px !== 0) points.push({ x: cx - px, y: cy + py });
        if (py !== 0) points.push({ x: cx + px, y: cy - py });
        if (px !== 0 && py !== 0) points.push({ x: cx - px, y: cy - py });
    };

    let dx, dy, d1, d2, x, y;
    x = 0;
    y = ry;

    // Initial decision parameter of region 1
    d1 = (ry * ry) - (rx * rx * ry) + (0.25 * rx * rx);
    dx = 2 * ry * ry * x;
    dy = 2 * rx * rx * y;

    // For region 1
    while (dx < dy) {
        addSymmetry(xc, yc, x, y);
        x++;
        dx = dx + (2 * ry * ry);
        if (d1 < 0) {
            d1 = d1 + dx + (ry * ry);
        } else {
            y--;
            dy = dy - (2 * rx * rx);
            d1 = d1 + dx - dy + (ry * ry);
        }
    }

    // Decision parameter of region 2
    d2 = ((ry * ry) * ((x + 0.5) * (x + 0.5))) + ((rx * rx) * ((y - 1) * (y - 1))) - (rx * rx * ry * ry);

    // For region 2
    while (y >= 0) {
        addSymmetry(xc, yc, x, y);
        y--;
        dy = dy - (2 * rx * rx);
        if (d2 > 0) {
            d2 = d2 + (rx * rx) - dy;
        } else {
            x++;
            dx = dx + (2 * ry * ry);
            d2 = d2 + dx - dy + (rx * rx);
        }
    }

    const unique = new Map<string, { x: number, y: number }>();
    for (const p of points) {
        unique.set(`${p.x},${p.y}`, p);
    }

    return Array.from(unique.values());
}
