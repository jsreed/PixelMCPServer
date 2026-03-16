/**
 * Animation interpolation algorithms for indexed-color pixel art.
 *
 * All functions operate on `number[][]` (rows of palette indices) and
 * return new arrays without mutating input.
 */

/** Type alias for a 2D grid of palette indices (row-major). */
type Grid = number[][];

/**
 * Generates intermediate frames between two pixel grids using threshold blending.
 *
 * For each intermediate frame `i` (0-indexed), computes `t = (i + 1) / (count + 1)`.
 * Each pixel is taken from `celA` when `t < 0.5`, otherwise from `celB`.
 *
 * This naturally handles transparency: when celA has index 0 and celB has a
 * non-zero value, early frames keep the transparent pixel and late frames
 * adopt celB's value.
 *
 * @param celA   Starting frame grid of palette indices.
 * @param celB   Ending frame grid of palette indices.
 * @param count  Number of intermediate frames to generate.
 * @returns An array of `count` grids, or `[]` for invalid inputs.
 */
export function interpolateFrames(celA: Grid, celB: Grid, count: number): Grid[] {
  if (count <= 0) return [];

  const height = celA.length;
  if (height === 0) return [];
  const width = celA[0]?.length ?? 0;
  if (width === 0) return [];

  // Dimension mismatch check
  if (celB.length !== height) return [];
  if ((celB[0]?.length ?? 0) !== width) return [];

  const result: Grid[] = [];

  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const frame: Grid = Array.from({ length: height }, (_, y) => {
      const rowA = celA[y];
      const rowB = celB[y];
      return Array.from({ length: width }, (__, x) => (t < 0.5 ? rowA[x] : rowB[x]));
    });
    result.push(frame);
  }

  return result;
}
