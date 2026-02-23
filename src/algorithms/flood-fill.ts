/**
 * Generates an array of pixel coordinates representing a filled region using the Scanline Flood Fill pattern.
 * This non-recursive approach pushes horizontal segment bounds to a stack, which prevents call-stack overflow 
 * on large canvases and operates much faster than a naive 4-way flood fill.
 * 
 * @param startX The initial x-coordinate to start filling from.
 * @param startY The initial y-coordinate to start filling from.
 * @param width The maximum width of the canvas bounds.
 * @param height The maximum height of the canvas bounds.
 * @param getPixel A callback to query the color (or any distinctive value) at a specific coordinate.
 * @returns An array of `{x, y}` coordinates representing all the pixels that should be modified by the fill.
 */
export function floodFill(
    startX: number,
    startY: number,
    width: number,
    height: number,
    getPixel: (x: number, y: number) => number | null
): Array<{ x: number, y: number }> {
    startX = Math.round(startX);
    startY = Math.round(startY);

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
        return [];
    }

    const targetColor = getPixel(startX, startY);
    const filledPoints: Array<{ x: number, y: number }> = [];
    const visited = new Set<string>();

    const markVisited = (x: number, y: number) => {
        visited.add(`${x},${y}`);
        filledPoints.push({ x, y });
    };

    const hasVisited = (x: number, y: number) => visited.has(`${x},${y}`);
    const isValid = (x: number, y: number) =>
        x >= 0 && x < width && y >= 0 && y < height && !hasVisited(x, y) && getPixel(x, y) === targetColor;

    if (!isValid(startX, startY)) {
        return [];
    }

    // The stack stores: [x, y] coordinates of known valid pixels
    // Classic strict 4-way scanline queue
    const queue: Array<[number, number]> = [[startX, startY]];

    while (queue.length > 0) {
        let [x, y] = queue.shift()!;

        if (!isValid(x, y)) continue;

        // Move left to the edge of the continuous color block
        let lx = x;
        while (lx > 0 && isValid(lx - 1, y)) {
            lx--;
        }

        // Move right to the edge
        let rx = x;
        while (rx < width - 1 && isValid(rx + 1, y)) {
            rx++;
        }

        // Mark the span
        for (let i = lx; i <= rx; i++) {
            markVisited(i, y);
        }

        // Add 4-way adjacent seeds strictly above and below this span bounds
        const scanAboveAndBelow = (cy: number) => {
            if (cy < 0 || cy >= height) return;

            let inValidSpan = false;
            for (let i = lx; i <= rx; i++) {
                if (isValid(i, cy)) {
                    if (!inValidSpan) {
                        queue.push([i, cy]);
                        inValidSpan = true;
                    }
                } else {
                    inValidSpan = false;
                }
            }
        };

        scanAboveAndBelow(y - 1);
        scanAboveAndBelow(y + 1);
    }

    return filledPoints;
}
