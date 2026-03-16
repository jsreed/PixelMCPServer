/**
 * Generates a 256×N RGBA lookup texture for runtime palette swapping.
 *
 * Each row N contains 256 pixels where pixel X has the RGBA color of
 * palette index X from the Nth palette source.
 *
 * @param palettes  Array of palettes. Each palette is an array of [r,g,b,a] tuples.
 * @returns         Flat RGBA Uint8Array of size 256 * palettes.length * 4.
 */
export function generatePaletteLUT(
  palettes: Array<Array<[number, number, number, number]>>,
): Uint8Array {
  const rowCount = palettes.length;
  if (rowCount === 0) {
    return new Uint8Array(0);
  }

  const width = 256;
  const buffer = new Uint8Array(width * rowCount * 4);

  for (let r = 0; r < rowCount; r++) {
    const palette = palettes[r];
    for (let c = 0; c < width; c++) {
      const offset = (r * width + c) * 4;
      if (c < palette.length) {
        const color = palette[c];
        buffer[offset] = color[0];
        buffer[offset + 1] = color[1];
        buffer[offset + 2] = color[2];
        buffer[offset + 3] = color[3];
      }
      // else: remains [0,0,0,0] from Uint8Array initialization
    }
  }

  return buffer;
}
