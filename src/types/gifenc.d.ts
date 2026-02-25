/**
 * Type declarations for gifenc (mattdesl/gifenc) v1.0.3
 * Pure JavaScript GIF encoder with built-in color quantization.
 * @see https://github.com/mattdesl/gifenc
 */

declare module 'gifenc' {
  /** An RGB color tuple [r, g, b] with values 0–255. */
  type RGBColor = [number, number, number];

  /** An RGBA color tuple [r, g, b, a] with values 0–255. */
  type RGBAColor = [number, number, number, number];

  /** A palette is an array of RGB or RGBA tuples (max 256 entries). */
  type Palette = RGBColor[] | RGBAColor[];

  /** Quantization format controlling the color space binning. */
  type QuantizeFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  /** Options for GIFEncoder constructor. */
  interface GIFEncoderOptions {
    /** Initial byte buffer capacity. Defaults to 4096. */
    initialCapacity?: number;
    /** If true (default), automatically write header on first writeFrame. */
    auto?: boolean;
  }

  /** Options for writeFrame(). */
  interface WriteFrameOptions {
    /** Per-frame palette. Required on the first frame. */
    palette?: Palette;
    /** Frame delay in milliseconds. Internally divided by 10 for centiseconds. */
    delay?: number;
    /** Whether to enable transparency. Defaults to false. */
    transparent?: boolean;
    /** Palette index to treat as transparent. Defaults to 0. */
    transparentIndex?: number;
    /** Loop count: -1 = once, 0 = forever, >0 = count. Defaults to 0. */
    repeat?: number;
    /** Bit depth for the color table. Defaults to 8. */
    colorDepth?: number;
    /** Disposal method: -1 = auto, 0 = none, 1 = keep, 2 = background, 3 = previous. */
    dispose?: number;
    /** Whether this is the first frame (manual mode only). */
    first?: boolean;
  }

  /** The GIF encoder instance returned by GIFEncoder(). */
  interface GIFEncoderInstance {
    /** Reset the encoder, clearing all buffered data. */
    reset(): void;
    /** Write the GIF trailer byte. Call after all frames are written. */
    finish(): void;
    /** Returns a copy of the encoded GIF data as a Uint8Array. */
    bytes(): Uint8Array;
    /** Returns a view (no copy) of the encoded GIF data. */
    bytesView(): Uint8Array;
    /** The underlying ArrayBuffer. */
    readonly buffer: ArrayBuffer;
    /** Write the GIF89a header manually (not needed in auto mode). */
    writeHeader(): void;
    /**
     * Write a single frame.
     * @param index - Uint8Array of palette indices (one per pixel, length = width × height).
     * @param width - Frame width in pixels.
     * @param height - Frame height in pixels.
     * @param opts - Frame options (palette, delay, transparency, etc.).
     */
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void;
  }

  /** Create a new GIF encoder. */
  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;

  /** Options for the quantize function. */
  interface QuantizeOptions {
    /** Color space format. Defaults to 'rgb565'. */
    format?: QuantizeFormat;
    /** If true (default), fully transparent pixels get their RGB set to clearAlphaColor. */
    clearAlpha?: boolean;
    /** RGB value to use for cleared alpha pixels. Defaults to 0x00. */
    clearAlphaColor?: number;
    /** Alpha threshold below which pixels are fully transparent. Defaults to 0. */
    clearAlphaThreshold?: number;
    /** Snap alpha to 0 or 255. Can be boolean or a threshold number. */
    oneBitAlpha?: boolean | number;
    /** Whether to use sqrt of bin counts. Defaults to true. */
    useSqrt?: boolean;
  }

  /**
   * Quantize RGBA pixel data into a palette of at most maxColors entries.
   * @param rgba - Uint8Array or Uint8ClampedArray of RGBA pixel data.
   * @param maxColors - Maximum palette size (up to 256).
   * @param opts - Quantization options.
   * @returns A palette array of [r, g, b] or [r, g, b, a] tuples.
   */
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: QuantizeOptions,
  ): Palette;

  /** Options for prequantize. */
  interface PrequantizeOptions {
    /** Rounding step for RGB channels. Defaults to 5. */
    roundRGB?: number;
    /** Rounding step for alpha channel. Defaults to 10. */
    roundAlpha?: number;
    /** Snap alpha to 0 or 255. Can be boolean or a threshold number. */
    oneBitAlpha?: boolean | number | null;
  }

  /**
   * Pre-process RGBA data by rounding colors, reducing unique color count before quantization.
   * Mutates the input array in-place.
   */
  export function prequantize(
    rgba: Uint8Array | Uint8ClampedArray,
    opts?: PrequantizeOptions,
  ): void;

  /**
   * Map RGBA pixel data to palette indices.
   * @param rgba - Uint8Array of RGBA pixel data.
   * @param palette - The color palette to map against.
   * @param format - Binning format. Defaults to 'rgb565'.
   * @returns A Uint8Array of palette indices (one per pixel).
   */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: QuantizeFormat,
  ): Uint8Array;

  /** Distance function signature for nearest color lookups. */
  type DistanceFunction = (a: number[], b: number[]) => number;

  /**
   * Find the index of the nearest color in a palette.
   * @returns The palette index of the nearest color.
   */
  export function nearestColorIndex(
    colors: Palette,
    pixel: number[],
    distanceFn?: DistanceFunction,
  ): number;

  /**
   * Find the nearest color in a palette.
   * @returns The nearest color entry.
   */
  export function nearestColor(
    colors: Palette,
    pixel: number[],
    distanceFn?: DistanceFunction,
  ): number[];

  /**
   * Find the nearest color index and its squared distance.
   * @returns [index, distanceSquared]
   */
  export function nearestColorIndexWithDistance(
    colors: Palette,
    pixel: number[],
    distanceFn?: DistanceFunction,
  ): [number, number];

  /**
   * Snap palette colors that are within a threshold to known reference colors.
   * Mutates the palette in-place.
   */
  export function snapColorsToPalette(
    palette: Palette,
    knownColors: number[][],
    threshold?: number,
  ): void;

  export default GIFEncoder;
}
