/**
 * Outline generation and orphan cleanup for indexed-color pixel art.
 *
 * All functions operate on `number[][]` (rows of palette indices) and
 * return new arrays without mutating input.
 */

import { rgbaToHsl, hslToRgba } from './color-utils.js';

/** RGBA color tuple. */
export type RGBA = [number, number, number, number];

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
 * Finds the nearest palette entry by RGB squared distance.
 * Skips index 0 (transparent) and null/fully-transparent entries.
 *
 * @returns The best matching palette index, or -1 if none found.
 */
function findNearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: (RGBA | null)[],
): number {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 1; i < palette.length; i++) {
    // skip index 0 (transparent)
    const c = palette[i];
    if (!c || c[3] === 0) continue; // skip null or fully transparent
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
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

/**
 * Selective outline: draws outline pixels using colors hue-shifted toward
 * adjacent sprite pixel hues at reduced luminance.
 *
 * For each transparent (0) pixel adjacent to non-transparent sprite pixels:
 *   - Computes a circular mean of the adjacent sprite hues
 *   - Shifts baseColor's hue 50% toward that mean
 *   - Reduces luminance by 30%
 *   - Finds the nearest palette entry
 *   - Falls back to baseColor if no valid palette entry found
 *
 * @param data      Input grid of palette indices
 * @param palette   Full palette array (up to 256 RGBA entries, null for unset)
 * @param baseColor Palette index for fallback outline color
 * @returns A new grid with selective outlines applied
 */
export function selectiveOutline(data: Grid, palette: (RGBA | null)[], baseColor: number): Grid {
  const height = data.length;
  if (height === 0) return [];
  const width = data[0]?.length ?? 0;
  if (width === 0) return [];

  const out = data.map((row) => [...row]);

  // Collect outline candidate positions (transparent pixels with non-transparent neighbors)
  // Use a Set to avoid duplicates
  const outlinePositions = new Set<number>(); // encoded as y * width + x

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y][x] === 0) continue; // skip transparent pixels
      // This pixel is a sprite pixel — check its transparent neighbors
      for (const [dy, dx] of NEIGHBORS_4) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && data[ny][nx] === 0) {
          outlinePositions.add(ny * width + nx);
        }
      }
    }
  }

  // Get base color RGBA
  const baseRgba = palette[baseColor];

  for (const encoded of outlinePositions) {
    const y = Math.floor(encoded / width);
    const x = encoded % width;

    // Collect adjacent non-transparent neighbors and their RGBAs
    const adjRgbas: RGBA[] = [];
    for (const [dy, dx] of NEIGHBORS_4) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
        const idx = data[ny][nx];
        if (idx !== 0) {
          const rgba = palette[idx];
          if (rgba && rgba[3] > 0) {
            adjRgbas.push(rgba);
          }
        }
      }
    }

    // Should not happen (we collected positions that have non-transparent neighbors)
    // but guard defensively
    if (adjRgbas.length === 0 || !baseRgba) {
      out[y][x] = baseColor;
      continue;
    }

    // Compute circular mean hue of adjacent sprite pixels
    let sinSum = 0;
    let cosSum = 0;
    let validHueCount = 0;
    for (const rgba of adjRgbas) {
      const hsl = rgbaToHsl(rgba[0], rgba[1], rgba[2], rgba[3]);
      if (hsl.s > 0.01) {
        // only include chromatic pixels for hue averaging
        const rad = (hsl.h * Math.PI) / 180;
        sinSum += Math.sin(rad);
        cosSum += Math.cos(rad);
        validHueCount++;
      }
    }

    const baseHsl = rgbaToHsl(baseRgba[0], baseRgba[1], baseRgba[2], baseRgba[3]);

    let blendedHue = baseHsl.h;
    if (validHueCount > 0) {
      // Circular mean hue
      const meanHueRad = Math.atan2(sinSum / validHueCount, cosSum / validHueCount);
      const meanHue = ((meanHueRad * 180) / Math.PI + 360) % 360;

      // Blend base hue 50% toward mean adjacent hue (shortest arc)
      let diff = meanHue - baseHsl.h;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      blendedHue = (((baseHsl.h + diff * 0.5) % 360) + 360) % 360;
    }

    // Reduce luminance by 30%
    const blendedL = baseHsl.l * 0.7;

    // Convert to RGBA
    const [nr, ng, nb] = hslToRgba(blendedHue, baseHsl.s, blendedL, baseHsl.a);

    // Find nearest palette entry
    const nearestIdx = findNearestPaletteIndex(nr, ng, nb, palette);
    out[y][x] = nearestIdx >= 0 ? nearestIdx : baseColor;
  }

  return out;
}
