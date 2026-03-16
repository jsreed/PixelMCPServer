/**
 * Scale2x (AdvMAME2x) upscaling algorithm.
 *
 * Produces a 2x enlargement that smooths diagonal edges rather than simply
 * replicating pixels.  Multiple passes can be chained to achieve 4x, 8x, etc.
 * (any power-of-2 scale factor).
 *
 * References: https://www.scale2x.it/algorithm
 */

/**
 * Compare 4 bytes (one RGBA pixel) starting at two offsets within the same buffer.
 * Returns true only when all four channels are identical.
 */
function pixelsEqual(buffer: Uint8Array, idxA: number, idxB: number): boolean {
  return (
    buffer[idxA] === buffer[idxB] &&
    buffer[idxA + 1] === buffer[idxB + 1] &&
    buffer[idxA + 2] === buffer[idxB + 2] &&
    buffer[idxA + 3] === buffer[idxB + 3]
  );
}

/**
 * Apply one Scale2x pass: doubles the dimensions of a flat RGBA pixel buffer.
 *
 * Neighbor naming convention (matches the canonical Scale2x spec):
 *   A = pixel above P
 *   B = pixel to the right of P
 *   C = pixel to the left of P
 *   D = pixel below P
 *
 * Output 2×2 block for P:
 *   E0 (top-left)     = (C==A && C!=D && A!=B) ? A : P
 *   E1 (top-right)    = (A==B && A!=C && B!=D) ? B : P
 *   E2 (bottom-left)  = (D==C && D!=B && C!=A) ? C : P
 *   E3 (bottom-right) = (B==D && B!=C && D!=A) ? D : P
 */
function scale2xPass(buffer: Uint8Array, width: number, height: number): Uint8Array {
  const outWidth = width * 2;
  const outHeight = height * 2;
  const out = new Uint8Array(outWidth * outHeight * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = (y * width + x) * 4;

      // Neighbor indices — clamp to edge for boundary pixels
      const aIdx = (Math.max(y - 1, 0) * width + x) * 4; // above
      const bIdx = (y * width + Math.min(x + 1, width - 1)) * 4; // right
      const cIdx = (y * width + Math.max(x - 1, 0)) * 4; // left
      const dIdx = (Math.min(y + 1, height - 1) * width + x) * 4; // below

      // pixelsEqual is symmetric: C==A is A==C, D==C is C==D
      const ca = pixelsEqual(buffer, cIdx, aIdx);
      const cd = pixelsEqual(buffer, cIdx, dIdx);
      const ab = pixelsEqual(buffer, aIdx, bIdx);
      const bd = pixelsEqual(buffer, bIdx, dIdx);
      const bc = pixelsEqual(buffer, bIdx, cIdx);
      const da = pixelsEqual(buffer, dIdx, aIdx);

      // E0: top-left output pixel
      const e0Idx = (y * 2 * outWidth + x * 2) * 4;
      // E1: top-right output pixel
      const e1Idx = (y * 2 * outWidth + (x * 2 + 1)) * 4;
      // E2: bottom-left output pixel
      const e2Idx = ((y * 2 + 1) * outWidth + x * 2) * 4;
      // E3: bottom-right output pixel
      const e3Idx = ((y * 2 + 1) * outWidth + (x * 2 + 1)) * 4;

      // Determine source indices for each of the four output pixels
      const e0Src = ca && !cd && !ab ? aIdx : pIdx;
      const e1Src = ab && !ca && !bd ? bIdx : pIdx;
      const e2Src = cd && !bd && !ca ? cIdx : pIdx;
      const e3Src = bd && !bc && !da ? dIdx : pIdx;

      // Write E0
      out[e0Idx] = buffer[e0Src];
      out[e0Idx + 1] = buffer[e0Src + 1];
      out[e0Idx + 2] = buffer[e0Src + 2];
      out[e0Idx + 3] = buffer[e0Src + 3];

      // Write E1
      out[e1Idx] = buffer[e1Src];
      out[e1Idx + 1] = buffer[e1Src + 1];
      out[e1Idx + 2] = buffer[e1Src + 2];
      out[e1Idx + 3] = buffer[e1Src + 3];

      // Write E2
      out[e2Idx] = buffer[e2Src];
      out[e2Idx + 1] = buffer[e2Src + 1];
      out[e2Idx + 2] = buffer[e2Src + 2];
      out[e2Idx + 3] = buffer[e2Src + 3];

      // Write E3
      out[e3Idx] = buffer[e3Src];
      out[e3Idx + 1] = buffer[e3Src + 1];
      out[e3Idx + 2] = buffer[e3Src + 2];
      out[e3Idx + 3] = buffer[e3Src + 3];
    }
  }

  return out;
}

/**
 * Apply Scale2x iteratively to reach any power-of-2 scale factor.
 *
 * @param buffer     Flat RGBA pixel buffer (Uint8Array).
 * @param width      Source image width in pixels.
 * @param height     Source image height in pixels.
 * @param scaleFactor Target scale multiplier.  Must be an integer, a power of 2, and >= 1.
 * @returns A new Uint8Array with dimensions (width * scaleFactor) × (height * scaleFactor).
 */
export function scale2x(
  buffer: Uint8Array,
  width: number,
  height: number,
  scaleFactor: number,
): Uint8Array {
  if (!Number.isInteger(scaleFactor)) {
    throw new Error('scale2x: scaleFactor must be an integer');
  }
  if (scaleFactor < 1) {
    throw new Error('scale2x: scaleFactor must be >= 1');
  }
  if ((scaleFactor & (scaleFactor - 1)) !== 0) {
    throw new Error('scale2x: scaleFactor must be a power of 2');
  }

  if (scaleFactor === 1) {
    return new Uint8Array(buffer);
  }

  let current = buffer;
  let currentWidth = width;
  let currentHeight = height;
  let remaining = scaleFactor;

  while (remaining > 1) {
    current = scale2xPass(current, currentWidth, currentHeight);
    currentWidth *= 2;
    currentHeight *= 2;
    remaining /= 2;
  }

  return current;
}
