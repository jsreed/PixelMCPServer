/**
 * Outline generation and orphan cleanup for indexed-color pixel art.
 *
 * All functions operate on `number[][]` (rows of palette indices) and
 * return new arrays without mutating input.
 */

/** Type alias for a 2D grid of palette indices (row-major). */
type Grid = number[][];

/** 4-connected neighbor offsets (N, E, S, W). */
const NEIGHBORS_4: readonly [number, number][] = [
  [-1, 0], // up
  [1, 0], // down
  [0, -1], // left
  [0, 1], // right
];

/**
 * Generates an outline around non-transparent pixels.
 *
 * Scans for pixels with value !== 0 (non-transparent). For every
 * transparent (0) neighbor in 4-connected adjacency, writes `color`
 * to that position. Does not expand canvas dimensions.
 *
 * @param data  Input grid of palette indices.
 * @param color Palette index for the outline pixels.
 * @returns A new grid with outlines applied.
 */
export function generateOutline(data: Grid, color: number): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0].length;
  if (width === 0) return [];

  // Copy input
  const out = data.map((row) => [...row]);

  // Collect outline positions first to avoid interfering with the scan
  const outlinePixels: [number, number][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y][x] === 0) continue; // skip transparent pixels

      for (const [dy, dx] of NEIGHBORS_4) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && data[ny][nx] === 0) {
          outlinePixels.push([ny, nx]);
        }
      }
    }
  }

  // Write outline
  for (const [y, x] of outlinePixels) {
    out[y][x] = color;
  }

  return out;
}

/**
 * Removes isolated single pixels (orphans).
 *
 * A pixel is considered an orphan if it has no same-color neighbors
 * in 4-connected adjacency. Orphan pixels are set to 0 (transparent).
 *
 * @param data Input grid of palette indices.
 * @returns A new grid with orphan pixels removed.
 */
export function cleanupOrphans(data: Grid): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0].length;
  if (width === 0) return [];

  const out = data.map((row) => [...row]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = data[y][x];
      if (color === 0) continue; // skip transparent

      let hasSameColorNeighbor = false;
      for (const [dy, dx] of NEIGHBORS_4) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && data[ny][nx] === color) {
          hasSameColorNeighbor = true;
          break;
        }
      }

      if (!hasSameColorNeighbor) {
        out[y][x] = 0;
      }
    }
  }

  return out;
}
