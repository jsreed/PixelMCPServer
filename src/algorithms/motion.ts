/**
 * Motion effect algorithms for indexed-color pixel art animation.
 *
 * All functions operate on `number[][]` (rows of palette indices) and
 * return new arrays without mutating input.
 */

/** Type alias for a 2D grid of palette indices (row-major). */
type Grid = number[][];

/**
 * Normalizes a 2D direction vector.  Returns `[1, 0]` for zero-length input.
 */
function normalize(dx: number, dy: number): [number, number] {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [1, 0];
  return [dx / len, dy / len];
}

/**
 * Shifts pixel data by a sub-pixel amount along a direction vector.
 *
 * For each pixel, samples the source grid at a position offset by
 * `intensity` pixels in the opposite direction. This effectively shifts
 * the image content by a fractional pixel amount in the given direction.
 *
 * At `intensity = 1.0`, the shift is up to 1 full pixel. The direction
 * vector is normalized internally — only direction matters, not magnitude.
 *
 * @param data       Input grid of palette indices.
 * @param intensity  Shift magnitude in pixels (0.0–1.0).
 * @param dirX       X component of direction vector (default 1).
 * @param dirY       Y component of direction vector (default 0).
 * @returns A new grid with the shift applied.
 */
export function subpixelShift(
  data: Grid,
  intensity: number,
  dirX = 1,
  dirY = 0,
): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0].length;
  if (width === 0) return [];
  if (intensity <= 0) return data.map((row) => [...row]);

  const [ndx, ndy] = normalize(dirX, dirY);
  const offsetX = ndx * intensity;
  const offsetY = ndy * intensity;

  const out: Grid = Array.from({ length: height }, () =>
    new Array<number>(width).fill(0),
  );

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sample from the source at the offset position (opposite direction)
      const srcX = x - offsetX;
      const srcY = y - offsetY;

      // Use nearest-neighbor sampling (round to integer coords)
      const sx = Math.round(srcX);
      const sy = Math.round(srcY);

      if (sy >= 0 && sy < height && sx >= 0 && sx < width) {
        out[y][x] = data[sy][sx];
      }
      // Out-of-bounds → stays 0 (transparent)
    }
  }

  return out;
}

/**
 * Applies directional motion blur (smear) along a direction vector.
 *
 * For each non-transparent pixel, extends it by `N` pixels in the
 * given direction (where `N = ceil(intensity * max(width, height) * 0.25)`).
 * Later pixels in scan order overwrite earlier smear trails.
 *
 * The direction vector is normalized internally.
 *
 * @param data       Input grid of palette indices.
 * @param intensity  Smear strength (0.0–1.0).
 * @param dirX       X component of direction vector (default 1).
 * @param dirY       Y component of direction vector (default 0).
 * @returns A new grid with smear applied.
 */
export function smearFrame(
  data: Grid,
  intensity: number,
  dirX = 1,
  dirY = 0,
): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0].length;
  if (width === 0) return [];
  if (intensity <= 0) return data.map((row) => [...row]);

  const [ndx, ndy] = normalize(dirX, dirY);
  const maxDim = Math.max(width, height);
  const smearLen = Math.ceil(intensity * maxDim * 0.25);

  // Start with a copy so non-smeared pixels are preserved
  const out: Grid = data.map((row) => [...row]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = data[y][x];
      if (color === 0) continue; // skip transparent

      // Extend this pixel along the direction
      for (let step = 1; step <= smearLen; step++) {
        const tx = Math.round(x + ndx * step);
        const ty = Math.round(y + ndy * step);
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) break;

        // Only smear into transparent pixels to preserve foreground
        if (out[ty][tx] === 0) {
          out[ty][tx] = color;
        }
      }
    }
  }

  return out;
}
