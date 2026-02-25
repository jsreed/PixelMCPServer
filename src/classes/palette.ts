import { type Palette, type Color, isValidColor } from '../types/palette.js';
import * as errors from '../errors.js';

export const MAX_COLORS = 256;

/**
 * Stateful wrapper for a Palette array.
 * Controls mutations, enforces constraints (0-255), and manages serialization.
 */
export class PaletteClass {
  private colors: Palette;

  /**
   * Initializes a new Palette with 256 default transparent colors ([0, 0, 0, 0]).
   */
  constructor() {
    this.colors = Array.from({ length: MAX_COLORS }, () => [0, 0, 0, 0]) as Palette;
  }

  /**
   * Retrieves a copy of the color at the specified index.
   * Throws `colorOutOfRange` if index is invalid.
   */
  get(index: number): Color {
    this.validateIndex(index);
    // Return a copy to prevent manual external mutation of the raw array
    const color = this.colors[index];
    if (color === null) {
      return [0, 0, 0, 0];
    }
    return [...color] as Color;
  }

  /**
   * Sets the color at the specified index.
   * Throws `paletteIndexOutOfRange` if index is invalid, `invalidColor` if the color is invalid.
   */
  set(index: number, color: Color): void {
    this.validateIndex(index);
    if (!isValidColor(color)) {
      throw new Error(errors.invalidColor().content[0].text);
    }
    this.colors[index] = [...color] as Color;
  }

  /**
   * Applies multiple color updates at once.
   */
  setBulk(entries: Array<[number, Color]>): void {
    // Validate all before applying any, to ensure atomicity
    for (const [index, color] of entries) {
      this.validateIndex(index);
      if (!isValidColor(color)) {
        throw new Error(errors.invalidColor().content[0].text);
      }
    }

    for (const [index, color] of entries) {
      this.colors[index] = [...color] as Color;
    }
  }

  /**
   * Swaps the colors at two indices.
   */
  swap(i: number, j: number): void {
    this.validateIndex(i);
    this.validateIndex(j);

    const temp = this.colors[i];
    this.colors[i] = this.colors[j];
    this.colors[j] = temp;
  }

  /**
   * Linearly interpolates RGBA between two palette indices, filling all entries
   * between start and end inclusive. The colors at start and end are preserved.
   * Requires start < end and both endpoints to have defined (non-transparent) colors.
   */
  generateRamp(start: number, end: number): void {
    this.validateIndex(start);
    this.validateIndex(end);
    if (start >= end) {
      throw new Error(errors.generateRampInvalidOrder().content[0].text);
    }

    const c1 = this.get(start);
    const c2 = this.get(end);

    // Check that endpoints have actual colors defined
    if (c1[0] === 0 && c1[1] === 0 && c1[2] === 0 && c1[3] === 0) {
      throw new Error(errors.paletteIndexNoColor(start).content[0].text);
    }
    if (c2[0] === 0 && c2[1] === 0 && c2[2] === 0 && c2[3] === 0) {
      throw new Error(errors.paletteIndexNoColor(end).content[0].text);
    }

    const steps = end - start;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      const a = Math.round(c1[3] + (c2[3] - c1[3]) * t);
      this.colors[start + i] = [r, g, b, a] as Color;
    }
  }

  /**
   * Returns the raw JSON-serializable array.
   */
  toJSON(): Palette {
    // Clone to prevent external mutation of the serialization result
    return this.colors.map((c) => (c ? [...c] : null)) as Palette;
  }

  /**
   * Instantiates a PaletteClass from raw JSON data.
   * Ensures the resulting array is exactly MAX_COLORS long.
   */
  static fromJSON(data: Palette | number[][]): PaletteClass {
    const palette = new PaletteClass();

    // Copy the provided data, up to MAX_COLORS
    const limit = Math.min(data.length, MAX_COLORS);
    for (let i = 0; i < limit; i++) {
      const c = data[i];
      if (c && c.length === 4 && isValidColor(c as Color)) {
        palette.colors[i] = [...(c as Color)] as Color;
      }
    }

    return palette;
  }

  /**
   * Internal helper to throw structured tool errors on out-of-bounds access.
   */
  private validateIndex(index: number): void {
    if (index < 0 || index >= MAX_COLORS || !Number.isInteger(index)) {
      throw new Error(errors.paletteIndexOutOfRange(index).content[0].text);
    }
  }
}
