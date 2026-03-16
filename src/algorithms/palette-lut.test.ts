import { describe, it, expect } from 'vitest';
import { generatePaletteLUT } from './palette-lut.js';

describe('generatePaletteLUT', () => {
  it('empty input returns Uint8Array(0)', () => {
    const result = generatePaletteLUT([]);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(0);
  });

  it('single palette produces 256*1*4 bytes with correct pixel values', () => {
    const palette: [number, number, number, number][] = Array.from({ length: 256 }, (_, i) => [
      i,
      255 - i,
      0,
      255,
    ]);
    const result = generatePaletteLUT([palette]);

    expect(result.byteLength).toBe(256 * 1 * 4);

    // Check a few specific entries
    // Index 0: [0, 255, 0, 255]
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(255);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(255);

    // Index 1: [1, 254, 0, 255]
    expect(result[4]).toBe(1);
    expect(result[5]).toBe(254);
    expect(result[6]).toBe(0);
    expect(result[7]).toBe(255);

    // Index 10: [10, 245, 0, 255]
    expect(result[40]).toBe(10);
    expect(result[41]).toBe(245);
  });

  it('multiple palettes produce 256*N*4 bytes with correct cross-row lookups', () => {
    const palette0: [number, number, number, number][] = Array.from({ length: 256 }, () => [
      255, 0, 0, 255,
    ]);
    const palette1: [number, number, number, number][] = Array.from({ length: 256 }, () => [
      0, 255, 0, 255,
    ]);
    const palette2: [number, number, number, number][] = Array.from({ length: 256 }, () => [
      0, 0, 255, 255,
    ]);

    const result = generatePaletteLUT([palette0, palette1, palette2]);

    expect(result.byteLength).toBe(256 * 3 * 4);

    // Row 0 (offset 0): all red
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(255);

    // Row 1 (offset 256*4): all green
    const row1Start = 256 * 4;
    expect(result[row1Start]).toBe(0);
    expect(result[row1Start + 1]).toBe(255);
    expect(result[row1Start + 2]).toBe(0);
    expect(result[row1Start + 3]).toBe(255);

    // Row 2 (offset 256*2*4): all blue
    const row2Start = 256 * 2 * 4;
    expect(result[row2Start]).toBe(0);
    expect(result[row2Start + 1]).toBe(0);
    expect(result[row2Start + 2]).toBe(255);
    expect(result[row2Start + 3]).toBe(255);
  });

  it('short palette fills defined entries correctly and leaves rest as zero', () => {
    const shortPalette: [number, number, number, number][] = [
      [10, 20, 30, 255],
      [40, 50, 60, 200],
      [70, 80, 90, 128],
      [100, 110, 120, 64],
    ];

    const result = generatePaletteLUT([shortPalette]);

    expect(result.byteLength).toBe(256 * 1 * 4);

    // Index 0
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(30);
    expect(result[3]).toBe(255);

    // Index 3
    expect(result[12]).toBe(100);
    expect(result[13]).toBe(110);
    expect(result[14]).toBe(120);
    expect(result[15]).toBe(64);

    // Index 4 onwards: [0, 0, 0, 0]
    expect(result[16]).toBe(0);
    expect(result[17]).toBe(0);
    expect(result[18]).toBe(0);
    expect(result[19]).toBe(0);

    // Index 255: [0, 0, 0, 0]
    expect(result[255 * 4]).toBe(0);
    expect(result[255 * 4 + 1]).toBe(0);
    expect(result[255 * 4 + 2]).toBe(0);
    expect(result[255 * 4 + 3]).toBe(0);
  });

  it('full 256-entry palette has all slots correct', () => {
    const fullPalette: [number, number, number, number][] = Array.from({ length: 256 }, (_, i) => [
      i,
      i,
      i,
      255,
    ]);

    const result = generatePaletteLUT([fullPalette]);

    for (let i = 0; i < 256; i++) {
      expect(result[i * 4]).toBe(i);
      expect(result[i * 4 + 1]).toBe(i);
      expect(result[i * 4 + 2]).toBe(i);
      expect(result[i * 4 + 3]).toBe(255);
    }
  });

  it('output dimensions are correct: width=256, height=palette count', () => {
    const p1: [number, number, number, number][] = Array.from({ length: 256 }, () => [0, 0, 0, 0]);
    const p2: [number, number, number, number][] = Array.from({ length: 256 }, () => [0, 0, 0, 0]);
    const p5: [number, number, number, number][][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 256 }, () => [0, 0, 0, 0] as [number, number, number, number]),
    );

    expect(generatePaletteLUT([p1]).byteLength).toBe(256 * 1 * 4);
    expect(generatePaletteLUT([p1, p2]).byteLength).toBe(256 * 2 * 4);
    expect(generatePaletteLUT(p5).byteLength).toBe(256 * 5 * 4);
  });

  it('does not mutate the input palettes', () => {
    const palette: [number, number, number, number][] = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ];
    const originalFirst: [number, number, number, number] = [1, 2, 3, 4];
    const originalSecond: [number, number, number, number] = [5, 6, 7, 8];

    generatePaletteLUT([palette]);

    expect(palette[0]).toEqual(originalFirst);
    expect(palette[1]).toEqual(originalSecond);
    expect(palette.length).toBe(2);
  });
});
