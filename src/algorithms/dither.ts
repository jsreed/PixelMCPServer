/**
 * Dithering algorithms for indexed-color pixel art.
 *
 * All functions accept two palette indices and produce a 2D array of those
 * indices in various dither patterns. No true-color blending — purely
 * distributing two discrete values across a grid.
 */

/**
 * Generates a checkerboard dither pattern.
 *
 * `(x + y) % 2 === 0` → `color1`, otherwise → `color2`.
 *
 * @param width   Width of the output grid.
 * @param height  Height of the output grid.
 * @param color1  First palette index.
 * @param color2  Second palette index.
 * @returns A `height × width` 2D array of palette indices.
 */
export function checkerboard(
  width: number,
  height: number,
  color1: number,
  color2: number,
): number[][] {
  if (width <= 0 || height <= 0) return [];

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ((x + y) % 2 === 0 ? color1 : color2)),
  );
}

/**
 * Generates a random noise dither pattern.
 *
 * Each pixel has a 50% chance of being `color1` or `color2`.
 *
 * @param width   Width of the output grid.
 * @param height  Height of the output grid.
 * @param color1  First palette index.
 * @param color2  Second palette index.
 * @returns A `height × width` 2D array of palette indices.
 */
export function noise(width: number, height: number, color1: number, color2: number): number[][] {
  if (width <= 0 || height <= 0) return [];

  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => (Math.random() < 0.5 ? color1 : color2)),
  );
}

/**
 * 4×4 Bayer matrix (normalized thresholds in [0, 1]).
 * Standard ordered dither matrix for pixel art.
 */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
];

/**
 * Generates an ordered (Bayer) dither pattern.
 *
 * Uses a 4×4 Bayer matrix tiled across the grid. For each pixel, computes
 * a normalized gradient position `t` (top→bottom) and compares against the
 * Bayer threshold. If `t > threshold`, uses `color2`; otherwise `color1`.
 *
 * @param width   Width of the output grid.
 * @param height  Height of the output grid.
 * @param color1  First palette index (dominant at the top).
 * @param color2  Second palette index (dominant at the bottom).
 * @returns A `height × width` 2D array of palette indices.
 */
export function orderedDither(
  width: number,
  height: number,
  color1: number,
  color2: number,
): number[][] {
  if (width <= 0 || height <= 0) return [];

  return Array.from({ length: height }, (_, y) => {
    const t = height <= 1 ? 0 : y / (height - 1);
    return Array.from({ length: width }, (_, x) => {
      const threshold = BAYER_4X4[y % 4][x % 4];
      return t > threshold ? color2 : color1;
    });
  });
}

/**
 * Generates an error-diffusion (Floyd-Steinberg) dither pattern.
 *
 * Maps a linear gradient from `color1` (top) to `color2` (bottom) and
 * applies Floyd-Steinberg error diffusion to distribute quantization
 * error. Since we have only two palette indices, the diffusion produces a
 * natural-looking gradient from one color to the other.
 *
 * @param width   Width of the output grid.
 * @param height  Height of the output grid.
 * @param color1  First palette index (top of gradient).
 * @param color2  Second palette index (bottom of gradient).
 * @returns A `height × width` 2D array of palette indices.
 */
export function errorDiffusion(
  width: number,
  height: number,
  color1: number,
  color2: number,
): number[][] {
  if (width <= 0 || height <= 0) return [];

  // Build a float error buffer representing the ideal gradient value
  // 0.0 = color1, 1.0 = color2
  const error: number[][] = Array.from({ length: height }, (_, y) => {
    const t = height <= 1 ? 0 : y / (height - 1);
    return new Array<number>(width).fill(t);
  });

  const out: number[][] = Array.from({ length: height }, () => new Array<number>(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const oldVal = error[y][x];
      // Quantize: closest to 0 → color1, closest to 1 → color2
      const quantized = oldVal < 0.5 ? 0 : 1;
      out[y][x] = quantized === 0 ? color1 : color2;

      const err = oldVal - quantized;

      // Floyd-Steinberg error distribution:
      //        * 7/16
      //  3/16 5/16 1/16
      if (x + 1 < width) error[y][x + 1] += err * (7 / 16);
      if (y + 1 < height) {
        if (x - 1 >= 0) error[y + 1][x - 1] += err * (3 / 16);
        error[y + 1][x] += err * (5 / 16);
        if (x + 1 < width) error[y + 1][x + 1] += err * (1 / 16);
      }
    }
  }

  return out;
}
