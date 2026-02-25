/**
 * Generates an array of pixel coordinates representing a line segment using Bresenham's algorithm.
 *
 * @param x0 The starting x-coordinate (integer).
 * @param y0 The starting y-coordinate (integer).
 * @param x1 The ending x-coordinate (integer).
 * @param y1 The ending y-coordinate (integer).
 * @returns An array of `{x, y}` coordinates representing the line.
 */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Ensure inputs are integers
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);

  const dx = Math.abs(endX - x);
  const dy = Math.abs(endY - y);
  const sx = x < endX ? 1 : -1;
  const sy = y < endY ? 1 : -1;

  let err = dx - dy;

  while (true) {
    points.push({ x, y });
    if (x === endX && y === endY) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return points;
}
