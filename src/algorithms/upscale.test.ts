import { describe, it, expect } from 'vitest';
import { upscale } from './upscale.js';

describe('upscale algorithm', () => {
  it('returns a copy of the buffer when scaleFactor is 1', () => {
    const input = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const output = upscale(input, 2, 1, 1);
    expect(output).toBeInstanceOf(Uint8Array);
    expect(output).not.toBe(input); // Should be a new instance
    expect(output).toEqual(input);
  });

  it('rejects invalid scale factors', () => {
    const input = new Uint8Array([255, 0, 0, 255]);
    expect(() => upscale(input, 1, 1, 0)).toThrow();
    expect(() => upscale(input, 1, 1, -1)).toThrow();
    expect(() => upscale(input, 1, 1, 1.5)).toThrow();
  });

  it('scales a 1x1 image by 2x', () => {
    // 1 pixel: Red
    const input = new Uint8Array([255, 0, 0, 255]);
    const output = upscale(input, 1, 1, 2);

    expect(output.length).toBe(2 * 2 * 4);

    // All 4 pixels should be Red
    for (let i = 0; i < 4; i++) {
      expect(output[i * 4]).toBe(255);
      expect(output[i * 4 + 1]).toBe(0);
      expect(output[i * 4 + 2]).toBe(0);
      expect(output[i * 4 + 3]).toBe(255);
    }
  });

  it('scales a 2x2 image by 2x correctly mapping pixels', () => {
    // 2x2 image
    // R G
    // B W
    const input = new Uint8Array([
      255,
      0,
      0,
      255, // R
      0,
      255,
      0,
      255, // G
      0,
      0,
      255,
      255, // B
      255,
      255,
      255,
      255, // W
    ]);

    const output = upscale(input, 2, 2, 2);

    expect(output.length).toBe(4 * 4 * 4); // 4x4 output

    // Helper to get pixel from output buffer at (x,y) for width 4
    const getPixel = (x: number, y: number) => {
      const idx = (y * 4 + x) * 4;
      return [output[idx], output[idx + 1], output[idx + 2], output[idx + 3]];
    };

    // Check top-left block (Red)
    expect(getPixel(0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(1, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(0, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(1, 1)).toEqual([255, 0, 0, 255]);

    // Check top-right block (Green)
    expect(getPixel(2, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(3, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(2, 1)).toEqual([0, 255, 0, 255]);
    expect(getPixel(3, 1)).toEqual([0, 255, 0, 255]);

    // Check bottom-left block (Blue)
    expect(getPixel(0, 2)).toEqual([0, 0, 255, 255]);
    expect(getPixel(1, 2)).toEqual([0, 0, 255, 255]);
    expect(getPixel(0, 3)).toEqual([0, 0, 255, 255]);
    expect(getPixel(1, 3)).toEqual([0, 0, 255, 255]);

    // Check bottom-right block (White)
    expect(getPixel(2, 2)).toEqual([255, 255, 255, 255]);
    expect(getPixel(3, 2)).toEqual([255, 255, 255, 255]);
    expect(getPixel(2, 3)).toEqual([255, 255, 255, 255]);
    expect(getPixel(3, 3)).toEqual([255, 255, 255, 255]);
  });

  it('scales a 2x1 image by 4x correctly', () => {
    // 2x1 image
    // Yellow, Cyan
    const input = new Uint8Array([
      255,
      255,
      0,
      255, // Y
      0,
      255,
      255,
      255, // C
    ]);

    const output = upscale(input, 2, 1, 4);

    expect(output.length).toBe(8 * 4 * 4); // 8x4 output

    const getPixel = (x: number, y: number) => {
      const idx = (y * 8 + x) * 4;
      return [output[idx], output[idx + 1], output[idx + 2], output[idx + 3]];
    };

    // First 4 columns should be Yellow, next 4 columns Cyan
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getPixel(x, y)).toEqual([255, 255, 0, 255]); // Yellow
      }
      for (let x = 4; x < 8; x++) {
        expect(getPixel(x, y)).toEqual([0, 255, 255, 255]); // Cyan
      }
    }
  });
});
