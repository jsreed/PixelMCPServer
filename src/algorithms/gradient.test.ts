import { describe, it, expect } from 'vitest';
import { linearGradient } from './gradient.js';

describe('linearGradient', () => {
  it('returns empty array for zero dimensions', () => {
    expect(linearGradient(0, 4, 1, 2)).toEqual([]);
    expect(linearGradient(4, 0, 1, 2)).toEqual([]);
    expect(linearGradient(-1, 4, 1, 2)).toEqual([]);
  });

  it('returns correct dimensions', () => {
    const result = linearGradient(8, 6, 1, 2, 'vertical');
    expect(result).toHaveLength(6);
    for (const row of result) {
      expect(row).toHaveLength(8);
    }
  });

  it('contains only color1 and color2', () => {
    const result = linearGradient(10, 10, 3, 7, 'vertical');
    for (const row of result) {
      for (const pixel of row) {
        expect([3, 7]).toContain(pixel);
      }
    }
  });

  // --- Vertical ---

  it('vertical: top row is color1, bottom row is color2', () => {
    const result = linearGradient(4, 6, 1, 2, 'vertical');
    // Top row — all color1
    for (const px of result[0]) expect(px).toBe(1);
    // Bottom row — all color2
    for (const px of result[result.length - 1]) expect(px).toBe(2);
  });

  it('vertical: each row is uniform (all same color)', () => {
    const result = linearGradient(5, 8, 1, 2, 'vertical');
    for (const row of result) {
      const first = row[0];
      expect(row.every((v) => v === first)).toBe(true);
    }
  });

  it('vertical: transition happens roughly at the midpoint', () => {
    const result = linearGradient(1, 10, 1, 2, 'vertical');
    // First rows should be mostly color1, last rows mostly color2
    expect(result[0][0]).toBe(1);
    expect(result[9][0]).toBe(2);
  });

  // --- Horizontal ---

  it('horizontal: left column is color1, right column is color2', () => {
    const result = linearGradient(6, 4, 1, 2, 'horizontal');
    // Left column — all color1
    for (const row of result) expect(row[0]).toBe(1);
    // Right column — all color2
    for (const row of result) expect(row[result[0].length - 1]).toBe(2);
  });

  it('horizontal: each column is uniform', () => {
    const result = linearGradient(8, 5, 1, 2, 'horizontal');
    for (let x = 0; x < 8; x++) {
      const first = result[0][x];
      for (let y = 1; y < 5; y++) {
        expect(result[y][x]).toBe(first);
      }
    }
  });

  // --- Diagonal down ---

  it('diagonal_down: top-left is color1, bottom-right is color2', () => {
    const result = linearGradient(6, 6, 1, 2, 'diagonal_down');
    expect(result[0][0]).toBe(1);
    expect(result[5][5]).toBe(2);
  });

  // --- Diagonal up ---

  it('diagonal_up: bottom-left is color1, top-right is color2', () => {
    const result = linearGradient(6, 6, 1, 2, 'diagonal_up');
    expect(result[5][0]).toBe(1);
    expect(result[0][5]).toBe(2);
  });

  // --- Edge case: 1×1 ---

  it('1×1 grid returns color1', () => {
    const result = linearGradient(1, 1, 5, 9, 'vertical');
    expect(result).toEqual([[5]]);
  });

  // --- Edge case: same color ---

  it('same color1 and color2 produces uniform grid', () => {
    const result = linearGradient(4, 4, 3, 3, 'horizontal');
    for (const row of result) {
      expect(row.every((v) => v === 3)).toBe(true);
    }
  });
});
