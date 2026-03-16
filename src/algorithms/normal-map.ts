/**
 * Normal map generation from an RGBA pixel buffer using Sobel operators.
 *
 * Converts luminance gradients to tangent-space RGB normals in OpenGL Y-up
 * convention (compatible with Godot's normal map format).
 *
 * The input and output are flat Uint8Array buffers in RGBA order,
 * `width * height * 4` bytes each.
 */

const SOBEL_X = [
  [-1, 0, 1],
  [-2, 0, 2],
  [-1, 0, 1],
];

const SOBEL_Y = [
  [-1, -2, -1],
  [0, 0, 0],
  [1, 2, 1],
];

/** Maximum possible Sobel magnitude: 4 * 255 = 1020. */
const MAX_SOBEL = 4 * 255;

/**
 * Generates a tangent-space normal map from an RGBA pixel buffer.
 *
 * Algorithm:
 * 1. Build a grayscale luminance array: L = 0.299*R + 0.587*G + 0.114*B.
 *    Transparent pixels (A === 0) contribute luminance 0.
 * 2. Apply 3×3 Sobel operators (dx, dy) with replicated-edge clamping.
 * 3. Map gradients to OpenGL Y-up tangent-space normals and encode as RGB.
 *
 * Output encoding:
 *   R = ((dx / MAX_SOBEL) + 1.0) * 0.5 * 255   (X component)
 *   G = ((-dy / MAX_SOBEL) + 1.0) * 0.5 * 255  (Y component, negated for Y-up)
 *   B = 255                                      (Z component, always pointing out)
 *   A = 255
 *
 * Edge cases:
 * - 0×0 input returns an empty Uint8Array(0).
 * - 1×1 input returns a flat normal (128, 128, 255, 255) — no gradient possible.
 *
 * @param rgbaBuffer  Input RGBA pixel data, length must be width * height * 4.
 * @param width       Image width in pixels.
 * @param height      Image height in pixels.
 * @returns           New Uint8Array of length width * height * 4 with RGBA normal data.
 */
export function generateNormalMap(
  rgbaBuffer: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (width === 0 || height === 0) {
    return new Uint8Array(0);
  }

  const pixelCount = width * height;
  const output = new Uint8Array(pixelCount * 4);

  // Build luminance array
  const luminance = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    const a = rgbaBuffer[base + 3] ?? 0;
    if (a === 0) {
      luminance[i] = 0;
    } else {
      const r = rgbaBuffer[base] ?? 0;
      const g = rgbaBuffer[base + 1] ?? 0;
      const b = rgbaBuffer[base + 2] ?? 0;
      luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  // Apply Sobel operators
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = 0;
      let dy = 0;

      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          // Clamp border lookups (replicate edge pixels)
          const sy = Math.max(0, Math.min(y + ky - 1, height - 1));
          const sx = Math.max(0, Math.min(x + kx - 1, width - 1));
          const lum = luminance[sy * width + sx] ?? 0;
          dx += (SOBEL_X[ky]?.[kx] ?? 0) * lum;
          dy += (SOBEL_Y[ky]?.[kx] ?? 0) * lum;
        }
      }

      const nx = dx / MAX_SOBEL;
      const ny = -dy / MAX_SOBEL; // negated for Y-up convention

      const outIdx = (y * width + x) * 4;
      output[outIdx] = Math.round((nx + 1.0) * 0.5 * 255);
      output[outIdx + 1] = Math.round((ny + 1.0) * 0.5 * 255);
      output[outIdx + 2] = 255;
      output[outIdx + 3] = 255;
    }
  }

  return output;
}
