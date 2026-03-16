import { describe, it, expect } from 'vitest';
import { generateNormalMap } from './normal-map.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flat RGBA Uint8Array from an array of [r, g, b, a] tuples. */
function makeRgba(pixels: [number, number, number, number][]): Uint8Array {
  const buf = new Uint8Array(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    buf[i * 4] = p[0];
    buf[i * 4 + 1] = p[1];
    buf[i * 4 + 2] = p[2];
    buf[i * 4 + 3] = p[3];
  }
  return buf;
}

/** Extract pixel [r, g, b, a] from output buffer at (x, y). */
function getPixel(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [buf[i] ?? 0, buf[i + 1] ?? 0, buf[i + 2] ?? 0, buf[i + 3] ?? 0];
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('generateNormalMap edge cases', () => {
  it('returns empty Uint8Array for 0×0 input', () => {
    const result = generateNormalMap(new Uint8Array(0), 0, 0);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it('returns flat normal (128, 128, 255, 255) for 1×1 input', () => {
    const input = makeRgba([[200, 100, 50, 255]]);
    const result = generateNormalMap(input, 1, 1);
    expect(result.length).toBe(4);
    expect(getPixel(result, 1, 0, 0)).toEqual([128, 128, 255, 255]);
  });

  it('returns flat normal for 1×1 transparent pixel', () => {
    const input = makeRgba([[0, 0, 0, 0]]);
    const result = generateNormalMap(input, 1, 1);
    expect(getPixel(result, 1, 0, 0)).toEqual([128, 128, 255, 255]);
  });
});

// ---------------------------------------------------------------------------
// Output dimensions
// ---------------------------------------------------------------------------

describe('generateNormalMap output dimensions', () => {
  it('output length matches width * height * 4', () => {
    const w = 5;
    const h = 7;
    const input = new Uint8Array(w * h * 4).fill(128);
    const result = generateNormalMap(input, w, h);
    expect(result.length).toBe(w * h * 4);
  });

  it('output length matches for 3×3 input', () => {
    const input = new Uint8Array(3 * 3 * 4).fill(200);
    const result = generateNormalMap(input, 3, 3);
    expect(result.length).toBe(3 * 3 * 4);
  });
});

// ---------------------------------------------------------------------------
// Flat surface (uniform color)
// ---------------------------------------------------------------------------

describe('generateNormalMap flat surface', () => {
  it('uniform opaque image → all pixels are (128, 128, 255, 255)', () => {
    const w = 4;
    const h = 4;
    // All same color — zero gradient everywhere
    const basePixel: [number, number, number, number] = [180, 90, 45, 255];
    const pixels: [number, number, number, number][] = Array.from(
      { length: w * h },
      () => basePixel,
    );
    const input = makeRgba(pixels);
    const result = generateNormalMap(input, w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(getPixel(result, w, x, y)).toEqual([128, 128, 255, 255]);
      }
    }
  });

  it('all transparent pixels → all pixels are (128, 128, 255, 255)', () => {
    const w = 3;
    const h = 3;
    const transparentPixel: [number, number, number, number] = [0, 0, 0, 0];
    const pixels: [number, number, number, number][] = Array.from(
      { length: w * h },
      () => transparentPixel,
    );
    const input = makeRgba(pixels);
    const result = generateNormalMap(input, w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(getPixel(result, w, x, y)).toEqual([128, 128, 255, 255]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Gradient inputs
// ---------------------------------------------------------------------------

describe('generateNormalMap gradient inputs', () => {
  it('horizontal gradient (left-to-right luminance ramp): center pixel R > 128', () => {
    // 3×3 with columns: lum 0, 128, 255 (left to right)
    // Sobel X at center should detect positive dx → R > 128
    const pixels: [number, number, number, number][] = [
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
    ];
    const input = makeRgba(pixels);
    const result = generateNormalMap(input, 3, 3);
    const [r, g] = getPixel(result, 3, 1, 1);
    // Positive X gradient → R > 128
    expect(r).toBeGreaterThan(128);
    // No vertical gradient → G ≈ 128 (allow small tolerance due to Sobel weights)
    expect(g).toBeGreaterThanOrEqual(120);
    expect(g).toBeLessThanOrEqual(136);
  });

  it('vertical gradient (top-to-bottom luminance ramp): center pixel G < 128', () => {
    // 3×3 with rows: lum 0, 128, 255 (top to bottom)
    // Sobel Y at center gives positive dy → negated for Y-up → G < 128
    const pixels: [number, number, number, number][] = [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [128, 128, 128, 255],
      [128, 128, 128, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ];
    const input = makeRgba(pixels);
    const result = generateNormalMap(input, 3, 3);
    const [r, g] = getPixel(result, 3, 1, 1);
    // Positive Y gradient, negated for Y-up → G < 128
    expect(g).toBeLessThan(128);
    // No horizontal gradient → R ≈ 128
    expect(r).toBeGreaterThanOrEqual(120);
    expect(r).toBeLessThanOrEqual(136);
  });
});

// ---------------------------------------------------------------------------
// Output invariants
// ---------------------------------------------------------------------------

describe('generateNormalMap output invariants', () => {
  it('all output pixels have B = 255 and A = 255', () => {
    const w = 5;
    const h = 5;
    // Mix of different colors to exercise the algorithm
    const input = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      input[i * 4] = (i * 53) % 256;
      input[i * 4 + 1] = (i * 97) % 256;
      input[i * 4 + 2] = (i * 137) % 256;
      input[i * 4 + 3] = 255;
    }
    const result = generateNormalMap(input, w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [, , b, a] = getPixel(result, w, x, y);
        expect(b).toBe(255);
        expect(a).toBe(255);
      }
    }
  });

  it('does not mutate the input buffer', () => {
    const w = 3;
    const h = 3;
    const basePixel: [number, number, number, number] = [100, 150, 200, 255];
    const pixels: [number, number, number, number][] = Array.from(
      { length: w * h },
      () => basePixel,
    );
    const input = makeRgba(pixels);
    const inputCopy = new Uint8Array(input);
    generateNormalMap(input, w, h);
    expect(input).toEqual(inputCopy);
  });
});
