/**
 * Core types for Indexed Color palettes.
 *
 * Palettes define the colors available to an asset. All pixel data stores
 * palette indices (0-255) rather than raw RGBA values.
 */

/**
 * A palette index must be an integer between 0 and 255 (inclusive).
 * Index 0 is conventionally transparent.
 */
export type PaletteIndex = number;

/**
 * An RGBA color tuple.
 * Each channel is an integer between 0 and 255 (inclusive).
 */
export type Color = [number, number, number, number];

/**
 * A Palette is an array of up to 256 colors.
 * The index in the array is the PaletteIndex.
 * Sparse palettes may have null entries.
 */
export type Palette = Array<Color | null>;

/**
 * Returns true if the index is a valid palette index (integer 0-255).
 */
export function isValidPaletteIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index <= 255;
}

/**
 * Returns true if the channel value is a valid 8-bit color channel (integer 0-255).
 */
function isValidChannel(val: number): boolean {
    return Number.isInteger(val) && val >= 0 && val <= 255;
}

/**
 * Returns true if the color is a valid 4-element RGBA tuple with each channel 0-255.
 */
export function isValidColor(color: unknown): color is Color {
    if (!Array.isArray(color) || color.length !== 4) {
        return false;
    }
    return color.every((channel) => typeof channel === 'number' && isValidChannel(channel));
}
