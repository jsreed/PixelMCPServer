import { describe, it, expect } from 'vitest';
import { colorReplace } from './color-replace.js';

describe('colorReplace', () => {
  it('returns an empty array for an empty grid', () => {
    expect(colorReplace([], 1, 2)).toEqual([]);
  });

  it('handles a grid of empty rows', () => {
    expect(colorReplace([[]], 1, 2)).toEqual([[]]);
  });

  it('replaces all matching pixels in a single-pixel grid', () => {
    expect(colorReplace([[5]], 5, 10)).toEqual([[10]]);
  });

  it('leaves non-matching pixels unchanged in a single-pixel grid', () => {
    expect(colorReplace([[3]], 5, 10)).toEqual([[3]]);
  });

  it('returns an identical copy when fromColor equals toColor', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const result = colorReplace(data, 2, 2);
    expect(result).toEqual(data);
  });

  it('returns an unchanged copy when no pixels match fromColor', () => {
    const data = [
      [0, 1, 2],
      [3, 4, 5],
    ];
    const result = colorReplace(data, 99, 10);
    expect(result).toEqual(data);
  });

  it('replaces all pixels when entire grid matches fromColor', () => {
    const data = [
      [7, 7, 7],
      [7, 7, 7],
    ];
    expect(colorReplace(data, 7, 42)).toEqual([
      [42, 42, 42],
      [42, 42, 42],
    ]);
  });

  it('replaces only matching pixels in a mixed grid', () => {
    const data = [
      [0, 1, 2, 3],
      [1, 0, 3, 2],
      [2, 3, 0, 1],
    ];
    expect(colorReplace(data, 1, 99)).toEqual([
      [0, 99, 2, 3],
      [99, 0, 3, 2],
      [2, 3, 0, 99],
    ]);
  });

  it('does not mutate the input array', () => {
    const data = [
      [1, 2],
      [3, 1],
    ];
    const original = data.map((row) => [...row]);
    colorReplace(data, 1, 99);
    expect(data).toEqual(original);
  });

  it('works with palette index boundary values (0, 127, 255)', () => {
    const data = [[0, 127, 255]];
    expect(colorReplace(data, 0, 255)).toEqual([[255, 127, 255]]);
    expect(colorReplace(data, 255, 0)).toEqual([[0, 127, 0]]);
    expect(colorReplace(data, 127, 0)).toEqual([[0, 0, 255]]);
  });

  it('handles a grid where toColor already exists as a different pixel', () => {
    const data = [
      [1, 2, 1],
      [2, 1, 2],
    ];
    expect(colorReplace(data, 1, 2)).toEqual([
      [2, 2, 2],
      [2, 2, 2],
    ]);
  });

  it('handles a large grid correctly', () => {
    const size = 100;
    const data = Array.from({ length: size }, () => new Array<number>(size).fill(5));
    data[50][50] = 10;
    const result = colorReplace(data, 5, 20);
    expect(result[0][0]).toBe(20);
    expect(result[50][50]).toBe(10);
    expect(result[99][99]).toBe(20);
  });
});
