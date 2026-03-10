import { describe, it, expect } from 'vitest';
import {
  rotate90,
  rotate180,
  rotate270,
  flipHorizontal,
  flipVertical,
  shear,
  shift,
} from './transform.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A 3×2 grid (height=3, width=2):
 *   [1, 2]
 *   [3, 4]
 *   [5, 6]
 */
const RECT_3x2 = [
  [1, 2],
  [3, 4],
  [5, 6],
];

/**
 * A 3×3 square:
 *   [1, 2, 3]
 *   [4, 5, 6]
 *   [7, 8, 9]
 */
const SQUARE_3x3 = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

// ---------------------------------------------------------------------------
// rotate90
// ---------------------------------------------------------------------------

describe('rotate90', () => {
  it('returns empty array for empty input', () => {
    expect(rotate90([])).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(rotate90([[], [], []])).toEqual([]);
  });

  it('rotates a 1×1 grid', () => {
    expect(rotate90([[7]])).toEqual([[7]]);
  });

  it('swaps dimensions for a rectangular grid (3×2 → 2×3)', () => {
    const result = rotate90(RECT_3x2);
    expect(result).toHaveLength(2); // newHeight = oldWidth
    expect(result[0]).toHaveLength(3); // newWidth = oldHeight
  });

  it('rotates a 3×2 rectangle 90° CW correctly', () => {
    // Input (3 rows, 2 cols):      After 90° CW (2 rows, 3 cols):
    //   [1, 2]                       [5, 3, 1]
    //   [3, 4]                       [6, 4, 2]
    //   [5, 6]
    expect(rotate90(RECT_3x2)).toEqual([
      [5, 3, 1],
      [6, 4, 2],
    ]);
  });

  it('rotates a 3×3 square 90° CW correctly', () => {
    // Input:         After 90° CW:
    //   1 2 3          7 4 1
    //   4 5 6          8 5 2
    //   7 8 9          9 6 3
    expect(rotate90(SQUARE_3x3)).toEqual([
      [7, 4, 1],
      [8, 5, 2],
      [9, 6, 3],
    ]);
  });

  it('four rotations of 90° returns the original', () => {
    let result = SQUARE_3x3;
    for (let i = 0; i < 4; i++) result = rotate90(result);
    expect(result).toEqual(SQUARE_3x3);
  });

  it('does not mutate the input', () => {
    const copy = RECT_3x2.map((r) => [...r]);
    rotate90(RECT_3x2);
    expect(RECT_3x2).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// rotate180
// ---------------------------------------------------------------------------

describe('rotate180', () => {
  it('returns empty array for empty input', () => {
    expect(rotate180([])).toEqual([]);
  });

  it('rotates a 1×1 grid', () => {
    expect(rotate180([[42]])).toEqual([[42]]);
  });

  it('preserves dimensions', () => {
    const result = rotate180(RECT_3x2);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
  });

  it('rotates a 3×2 rectangle 180° correctly', () => {
    // Input:       After 180°:
    //   1 2          6 5
    //   3 4          4 3
    //   5 6          2 1
    expect(rotate180(RECT_3x2)).toEqual([
      [6, 5],
      [4, 3],
      [2, 1],
    ]);
  });

  it('rotates a 3×3 square 180° correctly', () => {
    // Input:         After 180°:
    //   1 2 3          9 8 7
    //   4 5 6          6 5 4
    //   7 8 9          3 2 1
    expect(rotate180(SQUARE_3x3)).toEqual([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);
  });

  it('two rotations of 180° returns the original', () => {
    expect(rotate180(rotate180(SQUARE_3x3))).toEqual(SQUARE_3x3);
  });

  it('equals two consecutive rotate90 calls', () => {
    expect(rotate180(SQUARE_3x3)).toEqual(rotate90(rotate90(SQUARE_3x3)));
  });
});

// ---------------------------------------------------------------------------
// rotate270
// ---------------------------------------------------------------------------

describe('rotate270', () => {
  it('returns empty array for empty input', () => {
    expect(rotate270([])).toEqual([]);
  });

  it('rotates a 1×1 grid', () => {
    expect(rotate270([[5]])).toEqual([[5]]);
  });

  it('swaps dimensions for a rectangular grid (3×2 → 2×3)', () => {
    const result = rotate270(RECT_3x2);
    expect(result).toHaveLength(2); // newHeight = oldWidth
    expect(result[0]).toHaveLength(3); // newWidth = oldHeight
  });

  it('rotates a 3×2 rectangle 270° CW correctly', () => {
    // Input (3 rows, 2 cols):      After 270° CW (2 rows, 3 cols):
    //   1 2                           2 4 6
    //   3 4                           1 3 5
    //   5 6
    expect(rotate270(RECT_3x2)).toEqual([
      [2, 4, 6],
      [1, 3, 5],
    ]);
  });

  it('rotates a 3×3 square 270° CW correctly', () => {
    // Input:         After 270° CW:
    //   1 2 3          3 6 9
    //   4 5 6          2 5 8
    //   7 8 9          1 4 7
    expect(rotate270(SQUARE_3x3)).toEqual([
      [3, 6, 9],
      [2, 5, 8],
      [1, 4, 7],
    ]);
  });

  it('rotate90 then rotate270 returns the original', () => {
    expect(rotate270(rotate90(SQUARE_3x3))).toEqual(SQUARE_3x3);
  });

  it('three rotate90 calls equal one rotate270', () => {
    const via90 = rotate90(rotate90(rotate90(SQUARE_3x3)));
    expect(rotate270(SQUARE_3x3)).toEqual(via90);
  });
});

// ---------------------------------------------------------------------------
// flipHorizontal
// ---------------------------------------------------------------------------

describe('flipHorizontal', () => {
  it('returns empty array for empty input', () => {
    expect(flipHorizontal([])).toEqual([]);
  });

  it('flips a 1×1 grid', () => {
    expect(flipHorizontal([[3]])).toEqual([[3]]);
  });

  it('preserves dimensions', () => {
    const result = flipHorizontal(RECT_3x2);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
  });

  it('flips a 3×2 rectangle horizontally', () => {
    // Input:    After flip_h:
    //   1 2        2 1
    //   3 4        4 3
    //   5 6        6 5
    expect(flipHorizontal(RECT_3x2)).toEqual([
      [2, 1],
      [4, 3],
      [6, 5],
    ]);
  });

  it('flips a 3×3 square horizontally', () => {
    expect(flipHorizontal(SQUARE_3x3)).toEqual([
      [3, 2, 1],
      [6, 5, 4],
      [9, 8, 7],
    ]);
  });

  it('double flip returns original', () => {
    expect(flipHorizontal(flipHorizontal(SQUARE_3x3))).toEqual(SQUARE_3x3);
  });

  it('does not mutate the input', () => {
    const copy = RECT_3x2.map((r) => [...r]);
    flipHorizontal(RECT_3x2);
    expect(RECT_3x2).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// flipVertical
// ---------------------------------------------------------------------------

describe('flipVertical', () => {
  it('returns empty array for empty input', () => {
    expect(flipVertical([])).toEqual([]);
  });

  it('flips a 1×1 grid', () => {
    expect(flipVertical([[9]])).toEqual([[9]]);
  });

  it('preserves dimensions', () => {
    const result = flipVertical(RECT_3x2);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
  });

  it('flips a 3×2 rectangle vertically', () => {
    // Input:    After flip_v:
    //   1 2        5 6
    //   3 4        3 4
    //   5 6        1 2
    expect(flipVertical(RECT_3x2)).toEqual([
      [5, 6],
      [3, 4],
      [1, 2],
    ]);
  });

  it('flips a 3×3 square vertically', () => {
    expect(flipVertical(SQUARE_3x3)).toEqual([
      [7, 8, 9],
      [4, 5, 6],
      [1, 2, 3],
    ]);
  });

  it('double flip returns original', () => {
    expect(flipVertical(flipVertical(SQUARE_3x3))).toEqual(SQUARE_3x3);
  });

  it('flip_h then flip_v equals rotate180', () => {
    expect(flipVertical(flipHorizontal(SQUARE_3x3))).toEqual(rotate180(SQUARE_3x3));
  });

  it('does not mutate the input', () => {
    const copy = RECT_3x2.map((r) => [...r]);
    flipVertical(RECT_3x2);
    expect(RECT_3x2).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// shear
// ---------------------------------------------------------------------------

describe('shear', () => {
  it('returns empty array for empty input', () => {
    expect(shear([], 2, 0)).toEqual([]);
  });

  it('returns empty for zero-width rows', () => {
    expect(shear([[], [], []], 2, 0)).toEqual([]);
  });

  it('zero shear returns a copy of the original', () => {
    expect(shear(SQUARE_3x3, 0, 0)).toEqual(SQUARE_3x3);
  });

  it('preserves dimensions after shear', () => {
    const result = shear(RECT_3x2, 1, 0);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
  });

  it('x-shear shifts row 0 by 0 and last row by amountX', () => {
    // 4×1 grid (4 rows, 1 col): [[1],[2],[3],[4]]
    // amountX=3: row 0 shifts 0, row 1: round(3*1/3)=1, row 2: 2, row 3: 3
    // With 1-column output, any non-zero shift pushes the pixel out of bounds → 0
    const col = [[1], [2], [3], [4]];
    const result = shear(col, 3, 0);
    expect(result[0]).toEqual([1]); // shift=0, pixel stays
    expect(result[1]).toEqual([0]); // shift=1, pixel pushed out
    expect(result[2]).toEqual([0]); // shift=2, out
    expect(result[3]).toEqual([0]); // shift=3, out
  });

  it('x-shear on a wider grid shifts correctly', () => {
    // 3×4 grid, amountX=3 (last row shifts by 3)
    // row 0: shift 0 → no change
    // row 1: shift round(3*1/2)=2
    // row 2: shift round(3*2/2)=3
    const data = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
    ];
    const result = shear(data, 3, 0);
    // row 0: no shift → [1,2,3,4]
    expect(result[0]).toEqual([1, 2, 3, 4]);
    // row 1: shift right by 2 → src[x-2]: x=0→src=-2(OOB)=0, x=1→0, x=2→5, x=3→6
    expect(result[1]).toEqual([0, 0, 5, 6]);
    // row 2: shift right by 3 → src[x-3]: x=0..2→OOB=0, x=3→src=0=9
    expect(result[2]).toEqual([0, 0, 0, 9]);
  });

  it('y-shear shifts column 0 by 0 and last column by amountY', () => {
    // 1×4 grid (1 row, 4 cols): [[1,2,3,4]]
    // amountY=3: col 0 shifts 0, col 1: round(3*1/3)=1, col 2: 2, col 3: 3
    // With 1-row output, any non-zero shift pushes pixel out → 0
    const row = [[1, 2, 3, 4]];
    const result = shear(row, 0, 3);
    expect(result[0]).toEqual([1, 0, 0, 0]);
  });

  it('y-shear on a taller grid shifts correctly', () => {
    // 4×3 grid, amountY=3
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    const result = shear(data, 0, 3);
    // col 0: shift 0 → unchanged: 1,4,7,10
    expect(result.map((r) => r[0])).toEqual([1, 4, 7, 10]);
    // col 1: shift round(3*1/2)=2 down → src[y-2]
    // y=0→src=-2(OOB)=0, y=1→0, y=2→src=0=2, y=3→src=1=5
    expect(result.map((r) => r[1])).toEqual([0, 0, 2, 5]);
    // col 2: shift 3 down → y=0..2→0, y=3→src=0=3
    expect(result.map((r) => r[2])).toEqual([0, 0, 0, 3]);
  });

  it('negative x-shear shifts rows left', () => {
    const data = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const result = shear(data, -2, 0);
    // row 0: shift 0 → [1,2,3]
    expect(result[0]).toEqual([1, 2, 3]);
    // row 1: shift round(-2*1/2)=-1 → src[x+1]: x=0→1=2, x=1→5, x=2→6... wait
    // shiftX = round(-2*y / (h-1)), for row1: round(-2*1/2)=-1
    // out[y][x] = data[y][x - shiftX] = data[y][x - (-1)] = data[y][x+1]
    expect(result[1]).toEqual([5, 6, 0]);
    // row 2: shiftX=round(-2*2/2)=-2 → data[y][x+2]
    expect(result[2]).toEqual([9, 0, 0]);
  });

  it('does not mutate the input', () => {
    const copy = SQUARE_3x3.map((r) => [...r]);
    shear(SQUARE_3x3, 1, 1);
    expect(SQUARE_3x3).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// shift
// ---------------------------------------------------------------------------

describe('shift', () => {
  it('returns empty array for empty input', () => {
    expect(shift([], 1, 0)).toEqual([]);
  });

  it('zero shift returns a copy of the original', () => {
    expect(shift(SQUARE_3x3, 0, 0)).toEqual(SQUARE_3x3);
  });

  it('preserves dimensions after shift', () => {
    const result = shift(RECT_3x2, 1, 1);
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
  });

  it('shifts right by 1 (positive amountX)', () => {
    // Input:      After shift right 1:
    //   1 2 3        0 1 2
    //   4 5 6        0 4 5
    //   7 8 9        0 7 8
    expect(shift(SQUARE_3x3, 1, 0)).toEqual([
      [0, 1, 2],
      [0, 4, 5],
      [0, 7, 8],
    ]);
  });

  it('shifts left by 1 (negative amountX)', () => {
    expect(shift(SQUARE_3x3, -1, 0)).toEqual([
      [2, 3, 0],
      [5, 6, 0],
      [8, 9, 0],
    ]);
  });

  it('shifts down by 1 (positive amountY)', () => {
    // Input:      After shift down 1:
    //   1 2 3        0 0 0
    //   4 5 6        1 2 3
    //   7 8 9        4 5 6
    expect(shift(SQUARE_3x3, 0, 1)).toEqual([
      [0, 0, 0],
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('shifts up by 1 (negative amountY)', () => {
    expect(shift(SQUARE_3x3, 0, -1)).toEqual([
      [4, 5, 6],
      [7, 8, 9],
      [0, 0, 0],
    ]);
  });

  it('shifts diagonally (positive amountX and amountY)', () => {
    // Input:      After shift right 1, down 1:
    //   1 2 3        0 0 0
    //   4 5 6        0 1 2
    //   7 8 9        0 4 5
    expect(shift(SQUARE_3x3, 1, 1)).toEqual([
      [0, 0, 0],
      [0, 1, 2],
      [0, 4, 5],
    ]);
  });

  it('large shift displaces all pixels out of bounds', () => {
    expect(shift(SQUARE_3x3, 10, 0)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('shift by full width clears the grid', () => {
    const data = [[1, 2, 3]];
    expect(shift(data, 3, 0)).toEqual([[0, 0, 0]]);
  });

  it('shift by full height clears the grid', () => {
    const data = [[1], [2], [3]];
    expect(shift(data, 0, 3)).toEqual([[0], [0], [0]]);
  });

  it('works correctly on a non-square rectangular grid', () => {
    // RECT_3x2 shifted right by 1:
    //   1 2  →  0 1
    //   3 4  →  0 3
    //   5 6  →  0 5
    expect(shift(RECT_3x2, 1, 0)).toEqual([
      [0, 1],
      [0, 3],
      [0, 5],
    ]);
  });

  it('does not mutate the input', () => {
    const copy = SQUARE_3x3.map((r) => [...r]);
    shift(SQUARE_3x3, 2, 2);
    expect(SQUARE_3x3).toEqual(copy);
  });
});
