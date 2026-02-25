import { describe, it, expect } from 'vitest';
import { quantize } from './quantize.js';

describe('quantize (Median Cut Color Quantization)', () => {
  it('returns empty results for an empty pixel array', () => {
    const result = quantize([], 16);
    expect(result.palette.size).toBe(0);
    expect(result.indices).toHaveLength(0);
  });

  it('maps colors 1:1 if unique color count < maxColors', () => {
    // Red, Green, Blue, Red
    const pixels = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255];

    const result = quantize(pixels, 16);

    // No transparency, so indices should start at 0
    expect(result.palette.size).toBe(3);

    // Which index they get assigned is deterministic but order dependent.
    // Let's just track that 3 unique colors got generated.
    const c1 = result.palette.get(0);
    const c2 = result.palette.get(1);
    const c3 = result.palette.get(2);

    expect([c1, c2, c3]).toContain('#ff0000ff');
    expect([c1, c2, c3]).toContain('#00ff00ff');
    expect([c1, c2, c3]).toContain('#0000ffff');

    // Indices should match the reused color
    expect(result.indices[0]).toEqual(result.indices[3]);
    expect(result.indices[1]).not.toEqual(result.indices[0]);
    expect(result.indices[2]).not.toEqual(result.indices[0]);
  });

  it('preserves index 0 as transparent if image contains transparency', () => {
    // Transparent, Red, Transparent
    const pixels = [
      0,
      0,
      0,
      0,
      255,
      0,
      0,
      255,
      128,
      128,
      128,
      50, // Semi-transparent, drops to 0
    ];

    const result = quantize(pixels, 16);

    expect(result.palette.get(0)).toBe('#00000000');
    expect(result.palette.get(1)).toBe('#ff0000ff');
    expect(result.palette.size).toBe(2);

    expect(result.indices).toEqual([0, 1, 0]);
  });

  it('quantizes a gradient smoothly down to maxColors limits using Euclidean distances', () => {
    // Create 10 distinct shades of red
    const pixels: number[] = [];
    for (let i = 0; i < 10; i++) {
      pixels.push(i * 20, 0, 0, 255);
    }

    // Restrict to max 3 solid colors
    const result = quantize(pixels, 3);

    expect(result.palette.size).toBe(3);

    // Make sure none of them are '#'
    expect(result.palette.get(0)).toMatch(/#[0-9a-fA-F]{8}/);

    // Make sure indices array is 10 long
    expect(result.indices).toHaveLength(10);

    // Ensure values strictly use indices 0, 1, 2
    for (const idx of result.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it('handles a single pixel image', () => {
    const pixels = [255, 0, 0, 255];
    const result = quantize(pixels, 256);
    expect(result.palette.size).toBe(1);
    expect(result.indices).toEqual([0]);
    expect(result.palette.get(0)).toBe('#ff0000ff');
  });

  it('handles maxColors=1 with transparency — only transparent index fits', () => {
    const pixels = [
      0,
      0,
      0,
      0, // Transparent
      255,
      0,
      0,
      255, // Red (cannot fit)
    ];
    const result = quantize(pixels, 1);
    // Only index 0 (transparent) fits; red pixel has no slot
    expect(result.palette.get(0)).toBe('#00000000');
    expect(result.indices[0]).toBe(0);
  });

  it('handles 1000 identical pixels as a single palette entry', () => {
    const pixels: number[] = [];
    for (let i = 0; i < 1000; i++) {
      pixels.push(42, 128, 200, 255);
    }
    const result = quantize(pixels, 256);
    expect(result.palette.size).toBe(1);
    expect(result.indices).toHaveLength(1000);
    // All indices should be the same
    const uniqueIndices = new Set(result.indices);
    expect(uniqueIndices.size).toBe(1);
  });

  it('quantizes 256+ distinct colors via median cut without wild inaccuracy', () => {
    // Generate 512 distinct colors spanning the RGB cube
    const pixels: number[] = [];
    for (let i = 0; i < 512; i++) {
      pixels.push((i * 37) % 256, (i * 73) % 256, (i * 113) % 256, 255);
    }
    const result = quantize(pixels, 16);
    expect(result.palette.size).toBe(16);
    expect(result.indices).toHaveLength(512);

    // Each index should point to a valid palette entry
    for (const idx of result.indices) {
      expect(result.palette.has(idx)).toBe(true);
    }
  });

  it('round-trip fidelity: re-quantizing the reconstructed RGBA produces the same palette', () => {
    // Create a 6-color image
    const pixels = [
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0,
      255, 255,
    ];

    const result1 = quantize(pixels, 256);

    // Reconstruct RGBA from the quantized result
    const reconstructed: number[] = [];
    for (const idx of result1.indices) {
      const hex = result1.palette.get(idx)!;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a = parseInt(hex.slice(7, 9), 16);
      reconstructed.push(r, g, b, a);
    }

    // Re-quantize — should produce identical palette and indices
    const result2 = quantize(reconstructed, 256);
    expect(result2.palette.size).toBe(result1.palette.size);
    expect(result2.indices).toEqual(result1.indices);
  });

  it('never exceeds 256 palette entries even with massive color diversity', () => {
    // 4096 pixels with unique colors
    const pixels: number[] = [];
    for (let r = 0; r < 16; r++) {
      for (let g = 0; g < 16; g++) {
        for (let b = 0; b < 16; b++) {
          pixels.push(r * 17, g * 17, b * 17, 255);
        }
      }
    }
    // 4096 distinct colors → must reduce to ≤ 256
    const result = quantize(pixels, 256);
    expect(result.palette.size).toBeLessThanOrEqual(256);
    expect(result.indices).toHaveLength(4096);

    // Every index must be valid
    for (const idx of result.indices) {
      expect(result.palette.has(idx)).toBe(true);
    }
  });

  it('handles an all-transparent image — only index 0 in palette', () => {
    const pixels = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      50,
      50,
      50,
      50, // alpha < 128 → transparent
      100,
      100,
      100,
      100, // alpha < 128 → transparent
    ];
    const result = quantize(pixels, 256);
    expect(result.palette.size).toBe(1);
    expect(result.palette.get(0)).toBe('#00000000');
    expect(result.indices).toEqual([0, 0, 0, 0]);
  });

  it('treats pixels with alpha ≥ 128 as solid (threshold boundary)', () => {
    const pixels = [
      255,
      0,
      0,
      127, // alpha < 128 → transparent
      255,
      0,
      0,
      128, // alpha >= 128 → solid red
      0,
      255,
      0,
      200, // alpha >= 128 → solid green
    ];
    const result = quantize(pixels, 256);
    // Index 0 = transparent, then red and green as solid entries
    expect(result.palette.get(0)).toBe('#00000000');
    expect(result.palette.size).toBe(3); // transparent + red + green
    expect(result.indices[0]).toBe(0); // Transparent
    expect(result.indices[1]).not.toBe(0); // Solid red
    expect(result.indices[2]).not.toBe(0); // Solid green
  });

  it('handles maxColors=2 with transparency — exactly 1 slot for solid', () => {
    const pixels = [
      0,
      0,
      0,
      0, // Transparent
      255,
      0,
      0,
      255, // Red
      0,
      0,
      255,
      255, // Blue — will be merged with red into a single slot
    ];
    const result = quantize(pixels, 2);
    expect(result.palette.size).toBe(2);
    expect(result.palette.get(0)).toBe('#00000000');
    expect(result.indices[0]).toBe(0);
    // Both red and blue must map to the single solid slot (index 1)
    expect(result.indices[1]).toBe(1);
    expect(result.indices[2]).toBe(1);
  });

  it('produces deterministic output for identical inputs', () => {
    const pixels = [
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128, 0, 255, 0, 128, 128, 255,
    ];
    const result1 = quantize(pixels, 4);
    const result2 = quantize(pixels, 4);

    expect(result2.palette.size).toBe(result1.palette.size);
    expect(result2.indices).toEqual(result1.indices);
    for (const [key, val] of result1.palette) {
      expect(result2.palette.get(key)).toBe(val);
    }
  });
});
