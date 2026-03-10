/**
 * Pure geometric transformation functions for 2D palette-index arrays.
 *
 * All functions operate on `number[][]` (rows of palette indices) where
 * `data[y][x]` is the palette index at column x, row y.
 * All functions return a new array and do not mutate the input.
 */

/** Type alias for a 2D grid of palette indices (row-major). */
export type Grid = number[][];

/**
 * Creates a new `rows × cols` grid filled with `fill` (default 0).
 */
function createGrid(rows: number, cols: number, fill = 0): Grid {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(fill));
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * Rotates a 2D palette-index grid 90° clockwise.
 *
 * Mapping: output[x][height - 1 - y] = input[y][x]
 * Output dimensions: newWidth = height, newHeight = width.
 *
 * @param data Input grid (number of rows × number of columns).
 * @returns A new rotated grid.
 */
export function rotate90(data: Grid): Grid {
  const height = data.length;
  const width = height > 0 ? data[0].length : 0;
  if (height === 0 || width === 0) return [];

  const out = createGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 90° CW: new position (x, height-1-y)
      out[x][height - 1 - y] = data[y][x];
    }
  }
  return out;
}

/**
 * Rotates a 2D palette-index grid 180°.
 *
 * Mapping: output[height - 1 - y][width - 1 - x] = input[y][x]
 * Output dimensions unchanged.
 *
 * @param data Input grid.
 * @returns A new rotated grid.
 */
export function rotate180(data: Grid): Grid {
  const height = data.length;
  const width = height > 0 ? data[0].length : 0;
  if (height === 0 || width === 0) return [];

  const out = createGrid(height, width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[height - 1 - y][width - 1 - x] = data[y][x];
    }
  }
  return out;
}

/**
 * Rotates a 2D palette-index grid 270° clockwise (equivalently 90° CCW).
 *
 * Mapping: output[width - 1 - x][y] = input[y][x]
 * Output dimensions: newWidth = height, newHeight = width.
 *
 * @param data Input grid.
 * @returns A new rotated grid.
 */
export function rotate270(data: Grid): Grid {
  const height = data.length;
  const width = height > 0 ? data[0].length : 0;
  if (height === 0 || width === 0) return [];

  const out = createGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 270° CW: new position (width-1-x, y)
      out[width - 1 - x][y] = data[y][x];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flipping
// ---------------------------------------------------------------------------

/**
 * Flips a 2D palette-index grid horizontally (mirrors left↔right).
 *
 * Each row is reversed in place on a copy. Output dimensions unchanged.
 *
 * @param data Input grid.
 * @returns A new horizontally flipped grid.
 */
export function flipHorizontal(data: Grid): Grid {
  return data.map((row) => [...row].reverse());
}

/**
 * Flips a 2D palette-index grid vertically (mirrors top↔bottom).
 *
 * The order of rows is reversed. Output dimensions unchanged.
 *
 * @param data Input grid.
 * @returns A new vertically flipped grid.
 */
export function flipVertical(data: Grid): Grid {
  return [...data].reverse().map((row) => [...row]);
}

// ---------------------------------------------------------------------------
// Shear
// ---------------------------------------------------------------------------

/**
 * Shears a 2D palette-index grid by pixel offsets.
 *
 * - **X-shear** (`amountX`): row `y` shifts right by
 *   `round(amountX * y / max(height - 1, 1))` pixels.
 * - **Y-shear** (`amountY`): column `x` shifts down by
 *   `round(amountY * x / max(width - 1, 1))` pixels.
 *
 * X-shear is applied first; the intermediate result feeds into y-shear.
 * Out-of-bounds pixels are filled with palette index `0`.
 * Output dimensions are unchanged (pixels outside bounds are clipped).
 *
 * At least one of `amountX` or `amountY` should be non-zero.
 *
 * @param data    Input grid.
 * @param amountX Horizontal shear offset (total shift at the last row).
 * @param amountY Vertical shear offset (total shift at the last column).
 * @returns A new sheared grid.
 */
export function shear(data: Grid, amountX = 0, amountY = 0): Grid {
  const height = data.length;
  const width = height > 0 ? data[0].length : 0;
  if (height === 0 || width === 0) return [];

  // --- X-shear ---
  let intermediate: Grid = createGrid(height, width);
  const hDivisor = Math.max(height - 1, 1);
  for (let y = 0; y < height; y++) {
    const shiftX = Math.round((amountX * y) / hDivisor);
    for (let x = 0; x < width; x++) {
      const srcX = x - shiftX;
      intermediate[y][x] = srcX >= 0 && srcX < width ? data[y][srcX] : 0;
    }
  }

  // --- Y-shear ---
  if (amountY === 0) return intermediate;

  const out: Grid = createGrid(height, width);
  const wDivisor = Math.max(width - 1, 1);
  for (let x = 0; x < width; x++) {
    const shiftY = Math.round((amountY * x) / wDivisor);
    for (let y = 0; y < height; y++) {
      const srcY = y - shiftY;
      out[y][x] = srcY >= 0 && srcY < height ? intermediate[srcY][x] : 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shift (Translation)
// ---------------------------------------------------------------------------

/**
 * Translates a 2D palette-index grid by a pixel offset.
 *
 * Pixels that move outside the canvas are lost. Vacated pixels are filled
 * with palette index `0`. No wrapping is applied.
 *
 * At least one of `amountX` or `amountY` should be non-zero.
 *
 * @param data    Input grid.
 * @param amountX Horizontal shift in pixels (positive = right).
 * @param amountY Vertical shift in pixels (positive = down).
 * @returns A new translated grid.
 */
export function shift(data: Grid, amountX = 0, amountY = 0): Grid {
  const height = data.length;
  const width = height > 0 ? data[0].length : 0;
  if (height === 0 || width === 0) return [];

  const out = createGrid(height, width);
  for (let y = 0; y < height; y++) {
    const srcY = y - amountY;
    if (srcY < 0 || srcY >= height) continue;
    for (let x = 0; x < width; x++) {
      const srcX = x - amountX;
      if (srcX < 0 || srcX >= width) continue;
      out[y][x] = data[srcY][srcX];
    }
  }
  return out;
}
