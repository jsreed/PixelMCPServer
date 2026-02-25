import { describe, it, expect } from 'vitest';
import { PaletteClass } from './palette.js';
import type { Color } from '../types/palette.js';

describe('PaletteClass', () => {
  it('initializes with 256 default transparent colors', () => {
    const palette = new PaletteClass();
    const json = palette.toJSON();
    expect(json.length).toBe(256);
    expect(json[0]).toEqual([0, 0, 0, 0]);
    expect(json[255]).toEqual([0, 0, 0, 0]);
  });

  it('gets and sets colors correctly', () => {
    const palette = new PaletteClass();
    palette.set(10, [255, 0, 0, 255]);

    expect(palette.get(10)).toEqual([255, 0, 0, 255]);

    // Original shouldn't be mutated if returned copy is changed
    const copy = palette.get(10);
    copy[0] = 100;
    expect(palette.get(10)).toEqual([255, 0, 0, 255]);
  });

  it('set validates index bounds', () => {
    const palette = new PaletteClass();
    // MCP tool errors come back with a specific content structure, so we just
    // assert that something is thrown. In a real integration test, we'll verify
    // the MCP error format. For internal methods, throwing is sufficient.
    expect(() => {
      palette.set(-1, [255, 255, 255, 255]);
    }).toThrow();
    expect(() => {
      palette.set(256, [255, 255, 255, 255]);
    }).toThrow();
    expect(() => {
      palette.set(1.5, [255, 255, 255, 255]);
    }).toThrow();
  });

  it('set validates color values', () => {
    const palette = new PaletteClass();
    // Validate that isValidColor handles these runtime errors
    const invalidValues1 = [300, 0, 0, 255] as unknown as Color;
    const invalidValues2 = [0, 0, 0] as unknown as Color;

    expect(() => {
      palette.set(5, invalidValues1);
    }).toThrow();
    expect(() => {
      palette.set(5, invalidValues2);
    }).toThrow(); // missing alpha
  });

  it('setBulk applies multiple updates', () => {
    const palette = new PaletteClass();
    palette.setBulk([
      [1, [10, 20, 30, 255]],
      [2, [40, 50, 60, 255]],
    ]);

    expect(palette.get(1)).toEqual([10, 20, 30, 255]);
    expect(palette.get(2)).toEqual([40, 50, 60, 255]);
  });

  it('swap exchanges two colors', () => {
    const palette = new PaletteClass();
    palette.set(1, [255, 0, 0, 255]);
    palette.set(2, [0, 255, 0, 255]);

    palette.swap(1, 2);

    expect(palette.get(1)).toEqual([0, 255, 0, 255]);
    expect(palette.get(2)).toEqual([255, 0, 0, 255]);
  });

  it('toJSON / fromJSON roundtrip', () => {
    const palette = new PaletteClass();
    palette.set(55, [12, 34, 56, 78]);

    const json = palette.toJSON();
    const restored = PaletteClass.fromJSON(json);

    expect(restored.get(55)).toEqual([12, 34, 56, 78]);
    expect(restored.toJSON().length).toBe(256);
  });

  it('fromJSON truncates arrays longer than 256', () => {
    const tooLong = Array.from({ length: 300 }, () => [255, 255, 255, 255]);
    const restored = PaletteClass.fromJSON(tooLong);
    expect(restored.toJSON().length).toBe(256);
  });
});
