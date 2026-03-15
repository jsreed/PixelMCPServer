/**
 * Replaces all occurrences of one palette index with another in a 2D pixel grid.
 *
 * Returns a new grid — the input is never mutated. If `fromColor` equals
 * `toColor`, the returned grid is a deep copy with no modifications.
 *
 * @param data   2D palette-index array (`data[y][x]`).
 * @param fromColor  The palette index to find.
 * @param toColor    The palette index to substitute.
 * @returns A new 2D array with all `fromColor` pixels replaced by `toColor`.
 */
export function colorReplace(data: number[][], fromColor: number, toColor: number): number[][] {
  return data.map((row) => row.map((pixel) => (pixel === fromColor ? toColor : pixel)));
}
