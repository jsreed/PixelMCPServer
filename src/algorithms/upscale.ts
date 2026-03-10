/**
 * Performs a nearest-neighbor upscale on a flat RGBA buffer.
 * Each pixel in the original buffer is expanded into an N x N block of the same color.
 *
 * @param buffer The original 1D Uint8Array representing RGBA pixels.
 * @param width The original width in pixels.
 * @param height The original height in pixels.
 * @param scaleFactor The multiplier for the image dimensions (e.g., 2 means double size). Must be >= 1.
 * @returns A new Uint8Array containing the upscaled RGBA image data.
 */
export function upscale(
  buffer: Uint8Array,
  width: number,
  height: number,
  scaleFactor: number,
): Uint8Array {
  if (scaleFactor < 1 || !Number.isInteger(scaleFactor)) {
    throw new Error('scaleFactor must be an integer >= 1');
  }

  if (scaleFactor === 1) {
    return new Uint8Array(buffer);
  }

  const outWidth = width * scaleFactor;
  const outHeight = height * scaleFactor;
  const outBuffer = new Uint8Array(outWidth * outHeight * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = buffer[srcIdx];
      const g = buffer[srcIdx + 1];
      const b = buffer[srcIdx + 2];
      const a = buffer[srcIdx + 3];

      for (let dy = 0; dy < scaleFactor; dy++) {
        for (let dx = 0; dx < scaleFactor; dx++) {
          const outX = x * scaleFactor + dx;
          const outY = y * scaleFactor + dy;
          const dstIdx = (outY * outWidth + outX) * 4;

          outBuffer[dstIdx] = r;
          outBuffer[dstIdx + 1] = g;
          outBuffer[dstIdx + 2] = b;
          outBuffer[dstIdx + 3] = a;
        }
      }
    }
  }

  return outBuffer;
}
