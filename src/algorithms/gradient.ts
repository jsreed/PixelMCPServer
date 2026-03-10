/**
 * Linear gradient generator for indexed-color pixel art.
 *
 * Operates on palette indices — distributes two colors across the gradient
 * axis using a threshold (no true-color blending). Returns a new 2D array.
 */

/** Direction of the gradient axis. */
export type GradientDirection = 'vertical' | 'horizontal' | 'diagonal_down' | 'diagonal_up';

/**
 * Generates a linear gradient between two palette indices.
 *
 * For each pixel, computes a normalized position `t ∈ [0, 1]` along the
 * gradient axis.  Pixels with `t < 0.5` receive `color1`; `t >= 0.5`
 * receive `color2`.
 *
 * @param width     Width of the output grid.
 * @param height    Height of the output grid.
 * @param color1    Palette index at the starting edge.
 * @param color2    Palette index at the ending edge.
 * @param direction Gradient axis (default `'vertical'`).
 * @returns A `height × width` 2D array of palette indices.
 */
export function linearGradient(
  width: number,
  height: number,
  color1: number,
  color2: number,
  direction: GradientDirection = 'vertical',
): number[][] {
  if (width <= 0 || height <= 0) return [];

  const out: number[][] = Array.from({ length: height }, () =>
    new Array<number>(width).fill(color1),
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = normalizedPosition(x, y, width, height, direction);
      out[y][x] = t < 0.5 ? color1 : color2;
    }
  }

  return out;
}

/**
 * Computes the normalized position [0, 1] of a pixel along the gradient axis.
 */
function normalizedPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  direction: GradientDirection,
): number {
  switch (direction) {
    case 'vertical':
      return height <= 1 ? 0 : y / (height - 1);
    case 'horizontal':
      return width <= 1 ? 0 : x / (width - 1);
    case 'diagonal_down':
      // Top-left (0,0) → bottom-right (w-1,h-1)
      return width <= 1 && height <= 1
        ? 0
        : (x / Math.max(width - 1, 1) + y / Math.max(height - 1, 1)) / 2;
    case 'diagonal_up':
      // Bottom-left (0,h-1) → top-right (w-1,0)
      return width <= 1 && height <= 1
        ? 0
        : (x / Math.max(width - 1, 1) + (height - 1 - y) / Math.max(height - 1, 1)) / 2;
  }
}
