import { describe, it, expect } from 'vitest';
import { isValidPaletteIndex, isValidColor } from './palette.js';

describe('Palette Types (src/types/palette.ts)', () => {
  describe('isValidPaletteIndex', () => {
    it('returns true for valid indices', () => {
      expect(isValidPaletteIndex(0)).toBe(true);
      expect(isValidPaletteIndex(128)).toBe(true);
      expect(isValidPaletteIndex(255)).toBe(true);
    });

    it('returns false for out-of-bounds numbers', () => {
      expect(isValidPaletteIndex(-1)).toBe(false);
      expect(isValidPaletteIndex(256)).toBe(false);
      expect(isValidPaletteIndex(1000)).toBe(false);
    });

    it('returns false for non-integers', () => {
      expect(isValidPaletteIndex(1.5)).toBe(false);
      expect(isValidPaletteIndex(NaN)).toBe(false);
      expect(isValidPaletteIndex(Infinity)).toBe(false);
    });
  });

  describe('isValidColor', () => {
    it('returns true for valid RGBA arrays', () => {
      expect(isValidColor([0, 0, 0, 0])).toBe(true);
      expect(isValidColor([255, 255, 255, 255])).toBe(true);
      expect(isValidColor([128, 64, 32, 255])).toBe(true);
    });

    it('returns false for arrays of wrong length', () => {
      expect(isValidColor([])).toBe(false);
      expect(isValidColor([0, 0, 0])).toBe(false);
      expect(isValidColor([0, 0, 0, 0, 0])).toBe(false);
    });

    it('returns false for non-arrays', () => {
      expect(isValidColor(null)).toBe(false);
      expect(isValidColor(undefined)).toBe(false);
      expect(isValidColor('rgba(0,0,0,0)')).toBe(false);
      expect(isValidColor({ r: 0, g: 0, b: 0, a: 0 })).toBe(false);
      expect(isValidColor(123)).toBe(false);
    });

    it('returns false for out-of-bounds channels', () => {
      expect(isValidColor([-1, 0, 0, 0])).toBe(false);
      expect(isValidColor([0, 256, 0, 0])).toBe(false);
    });

    it('returns false for non-integer channels', () => {
      expect(isValidColor([0.5, 0, 0, 0])).toBe(false);
      expect(isValidColor([NaN, 0, 0, 0])).toBe(false);
    });
  });
});
