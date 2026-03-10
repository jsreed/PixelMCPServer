/**
 * Automatic anti-aliasing for indexed-color pixel art.
 *
 * Detects convex corners on color boundaries and places an intermediate
 * palette color at those positions to smooth transitions.
 *
 * Operates on `number[][]` (rows of palette indices). Returns a new
 * array without mutating input.
 */

/** RGBA color tuple. */
export type RGBA = [number, number, number, number];

/** Type alias for a 2D grid of palette indices (row-major). */
type Grid = number[][];

/** 4-connected neighbor offsets as [dy, dx]. */
const ORTHO: readonly [number, number][] = [
  [-1, 0], // N
  [0, 1], // E
  [1, 0], // S
  [0, -1], // W
];

/**
 * Pairs of orthogonal neighbors that form an L-shape at a pixel,
 * along with the diagonal that bridges them.
 *
 * Each entry: [neighborA_idx, neighborB_idx, diagonal_dy, diagonal_dx]
 *   where neighborA_idx / neighborB_idx index into ORTHO.
 */
const L_SHAPES: readonly [number, number, number, number][] = [
  [0, 1, -1, 1], // N + E  → NE diagonal
  [1, 2, 1, 1], // E + S  → SE diagonal
  [2, 3, 1, -1], // S + W  → SW diagonal
  [3, 0, -1, -1], // W + N  → NW diagonal
];

/**
 * Computes the luminance of an RGBA color (BT.601 formula).
 */
function luminance(c: RGBA): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/**
 * Automatically anti-aliases convex corners on color boundaries.
 *
 * For each pixel, checks if it sits at a convex corner — i.e., it has
 * exactly two same-color orthogonal neighbors that are perpendicular
 * (forming an L-shape), and the diagonal between those neighbors is a
 * different color. At such positions, finds the nearest existing palette
 * entry whose luminance falls between the two boundary colors and places
 * it there.
 *
 * Does not modify concave regions or straight edges.
 *
 * @param data    Input grid of palette indices.
 * @param palette Array of up to 256 RGBA entries (null entries are skipped).
 * @returns A new grid with anti-aliased corners.
 */
export function autoAntiAlias(data: Grid, palette: (RGBA | null)[]): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0].length;
  if (width === 0) return [];

  const out = data.map((row) => [...row]);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerColor = data[y][x];
      if (centerColor === 0) continue; // skip transparent

      // Count same-color orthogonal neighbors and their positions
      const sameNeighborIndices: number[] = [];
      for (let i = 0; i < ORTHO.length; i++) {
        const [dy, dx] = ORTHO[i];
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && data[ny][nx] === centerColor) {
          sameNeighborIndices.push(i);
        }
      }

      // Convex corner: exactly 2 same-color orthogonal neighbors forming an L
      if (sameNeighborIndices.length !== 2) continue;

      // Check if the two neighbors form an L-shape
      for (const [aIdx, bIdx, dDy, dDx] of L_SHAPES) {
        if (
          (sameNeighborIndices[0] === aIdx && sameNeighborIndices[1] === bIdx) ||
          (sameNeighborIndices[0] === bIdx && sameNeighborIndices[1] === aIdx)
        ) {
          // Check that the diagonal is a different color
          const diagY = y + dDy;
          const diagX = x + dDx;
          if (diagY < 0 || diagY >= height || diagX < 0 || diagX >= width) continue;

          const diagColor = data[diagY][diagX];
          if (diagColor === centerColor) continue; // Not a convex corner

          // Find an intermediate palette entry
          const centerRGBA = palette[centerColor];
          const diagRGBA = palette[diagColor];
          if (!centerRGBA || !diagRGBA) continue;

          const centerLum = luminance(centerRGBA);
          const diagLum = luminance(diagRGBA);
          const minLum = Math.min(centerLum, diagLum);
          const maxLum = Math.max(centerLum, diagLum);
          const targetLum = (centerLum + diagLum) / 2;

          // Search palette for nearest entry between the two luminances
          let bestIndex = -1;
          let bestDist = Infinity;

          for (let i = 0; i < palette.length; i++) {
            if (i === centerColor || i === diagColor) continue;
            const entry = palette[i];
            if (!entry || entry[3] === 0) continue; // skip null/transparent

            const entryLum = luminance(entry);
            if (entryLum >= minLum && entryLum <= maxLum) {
              const dist = Math.abs(entryLum - targetLum);
              if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
              }
            }
          }

          if (bestIndex >= 0) {
            out[y][x] = bestIndex;
          }

          break; // Only process the first matching L-shape
        }
      }
    }
  }

  return out;
}
