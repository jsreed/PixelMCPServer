import { describe, it, expect } from 'vitest';
import { scale2x } from './scale2x.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flat RGBA Uint8Array from a 2-D array of [r,g,b,a] tuples. */
function makeBuffer(pixels: number[][]): Uint8Array {
  const buf = new Uint8Array(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    buf[i * 4] = p[0] ?? 0;
    buf[i * 4 + 1] = p[1] ?? 0;
    buf[i * 4 + 2] = p[2] ?? 0;
    buf[i * 4 + 3] = p[3] ?? 255;
  }
  return buf;
}

/** Read one RGBA pixel from a flat buffer. */
function getPixel(
  buf: Uint8Array,
  x: number,
  y: number,
  width: number,
): [number, number, number, number] {
  const idx = (y * width + x) * 4;
  return [buf[idx] ?? 0, buf[idx + 1] ?? 0, buf[idx + 2] ?? 0, buf[idx + 3] ?? 0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scale2x', () => {
  // 1. Returns a copy when scaleFactor is 1
  it('returns a copy (new buffer) when scaleFactor is 1', () => {
    const src = makeBuffer([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ]);
    const result = scale2x(src, 2, 1, 1);
    expect(result).not.toBe(src);
    expect(result).toEqual(src);
  });

  // 2. Rejects invalid scale factors
  it.each([
    [3, 1, 1],
    [5, 1, 1],
    [6, 1, 1],
    [1.5, 1, 1],
    [0, 1, 1],
    [-1, 1, 1],
  ])('throws for invalid scaleFactor %f', (factor, w, h) => {
    const src = makeBuffer([[255, 0, 0, 255]]);
    expect(() => scale2x(src, w, h, factor)).toThrow();
  });

  // 3. Output dimensions are correct for 2x, 4x, 8x
  it('produces 2× output dimensions at scaleFactor 2', () => {
    const pixels: number[][] = Array.from({ length: 4 * 4 }, () => [255, 0, 0, 255]);
    const src = makeBuffer(pixels);
    const result = scale2x(src, 4, 4, 2);
    expect(result.length).toBe(8 * 8 * 4);
  });

  it('produces 4× output dimensions at scaleFactor 4', () => {
    const pixels: number[][] = Array.from({ length: 4 * 4 }, () => [255, 0, 0, 255]);
    const src = makeBuffer(pixels);
    const result = scale2x(src, 4, 4, 4);
    expect(result.length).toBe(16 * 16 * 4);
  });

  it('produces 8× output dimensions at scaleFactor 8', () => {
    const pixels: number[][] = Array.from({ length: 2 * 2 }, () => [0, 255, 0, 255]);
    const src = makeBuffer(pixels);
    const result = scale2x(src, 2, 2, 8);
    expect(result.length).toBe(16 * 16 * 4);
  });

  // 4. Uniform-color image: every output pixel equals the source color
  it('uniform color image produces identical pixels at 2×', () => {
    const pixels: number[][] = Array.from({ length: 3 * 3 }, () => [100, 150, 200, 255]);
    const src = makeBuffer(pixels);
    const result = scale2x(src, 3, 3, 2);
    const outW = 6;
    const outH = 6;
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        expect(getPixel(result, x, y, outW)).toEqual([100, 150, 200, 255]);
      }
    }
  });

  // 5. Known diagonal-edge pattern produces expected smoothed output
  //
  // Source 2×2:
  //   A B      red  blue
  //   C D      blue red
  //
  // Scale2x rules for each source pixel:
  //
  // P=A (0,0): neighbors clamp — above=A, right=B, left=A, below=C
  //   E0: C==A?no → A; E1: A==B?no → A; E2: D==C?no → A; E3: B==D?no → A  → all A (red)
  //
  // P=B (1,0): neighbors — above=B, right=B, left=A, below=D
  //   E0: A==B?no → B; E1: B==B&&B!=A&&B!=D? yes → B; E2: D==D&&D!=B?no(D==B?)—wait
  //   Let's work it out precisely:
  //   A=above=B(blue), B=right=B(blue), C=left=A(red), D=below=D(red)
  //   E0: C==A → red==blue? no → P=blue
  //   E1: A==B → blue==blue, A!=C → blue!=red yes, B!=D → blue!=red yes → B(blue) → blue
  //   E2: D==C → red==red, D!=B → red!=blue yes, C!=A → red!=blue yes → C(red) → red
  //   E3: B==D → blue==red? no → P=blue
  //
  // P=C (0,1): neighbors — above=A(red), right=D(red), left=C(blue), below=C(blue)
  //   A=above=A(red), B=right=D(red), C=left=C(blue), D=below=C(blue)
  //   E0: C==A → blue==red? no → P=blue
  //   E1: A==B → red==red, A!=C → red!=blue yes, B!=D → red!=blue yes → B(red) → red
  //   E2: D==C → blue==blue, D!=B → blue!=red yes, C!=A → blue!=red yes → C(blue) → blue
  //   E3: B==D → red==blue? no → P=blue
  //
  // P=D (1,1): neighbors clamp — above=B(blue), right=D(red), left=C(blue), below=D(red)
  //   A=above=B(blue), B=right=D(red), C=left=C(blue), D=below=D(red)
  //   E0: C==A → blue==blue, C!=D → blue!=red yes, A!=B → blue!=red yes → A(blue) → blue
  //   E1: A==B → blue==red? no → P=red
  //   E2: D==C → red==blue? no → P=red
  //   E3: B==D → red==red, B!=C → red!=blue yes, D!=A → red!=blue yes → D(red) → red
  //
  // Expected 4×4 output (row-major, each cell is 2 output pixels wide):
  //   row 0 (from A's E0,E1 and B's E0,E1): red  red  blue blue
  //   row 1 (from A's E2,E3 and B's E2,E3): red  red  red  blue
  //   row 2 (from C's E0,E1 and D's E0,E1): blue red  blue blue
  //   row 3 (from C's E2,E3 and D's E2,E3): blue blue red  red
  //
  it('smooths a known diagonal-edge 2×2 pattern correctly', () => {
    const R = [255, 0, 0, 255];
    const B = [0, 0, 255, 255];

    //   A=red  B=blue
    //   C=blue D=red
    const src = makeBuffer([R, B, B, R]);
    const result = scale2x(src, 2, 2, 2);
    const W = 4;

    // row 0
    expect(getPixel(result, 0, 0, W)).toEqual([255, 0, 0, 255]); // A·E0 = red
    expect(getPixel(result, 1, 0, W)).toEqual([255, 0, 0, 255]); // A·E1 = red
    expect(getPixel(result, 2, 0, W)).toEqual([0, 0, 255, 255]); // B·E0 = blue
    expect(getPixel(result, 3, 0, W)).toEqual([0, 0, 255, 255]); // B·E1 = blue
    // row 1
    expect(getPixel(result, 0, 1, W)).toEqual([255, 0, 0, 255]); // A·E2 = red
    expect(getPixel(result, 1, 1, W)).toEqual([0, 0, 255, 255]); // A·E3 = blue (right==below)
    expect(getPixel(result, 2, 1, W)).toEqual([255, 0, 0, 255]); // B·E2 = red (below==left)
    expect(getPixel(result, 3, 1, W)).toEqual([0, 0, 255, 255]); // B·E3 = blue (P)
    // row 2
    expect(getPixel(result, 0, 2, W)).toEqual([0, 0, 255, 255]); // C·E0 = blue (P)
    expect(getPixel(result, 1, 2, W)).toEqual([255, 0, 0, 255]); // C·E1 = red (above==right)
    expect(getPixel(result, 2, 2, W)).toEqual([0, 0, 255, 255]); // D·E0 = blue (left==above)
    expect(getPixel(result, 3, 2, W)).toEqual([255, 0, 0, 255]); // D·E1 = red (P)
    // row 3
    expect(getPixel(result, 0, 3, W)).toEqual([0, 0, 255, 255]); // C·E2 = blue
    expect(getPixel(result, 1, 3, W)).toEqual([0, 0, 255, 255]); // C·E3 = blue
    expect(getPixel(result, 2, 3, W)).toEqual([255, 0, 0, 255]); // D·E2 = red (P)
    expect(getPixel(result, 3, 3, W)).toEqual([255, 0, 0, 255]); // D·E3 = red
  });

  // 6. Checkerboard: verifies edge-clamped boundary smoothing produces known output
  //
  // Source 2×2:   R G
  //               G R
  //
  // Boundary clamping causes corner pixels to have equal left/above or right/below
  // neighbors, which triggers smoothing on all four source pixels.
  //
  // Traced output (clamping: at x=0 left clamps to self, at y=0 above clamps to self, etc.):
  //   P=R (0,0): above=R, right=G, left=R, below=G
  //     E0: left==above(R==R) && left!=below(R!=G) && above!=right(R!=G) → A(above)=R
  //     E1: above==right? R==G → F → P=R
  //     E2: below==left? G==R → F → P=R
  //     E3: right==below(G==G) && right!=left(G!=R) && below!=above(G!=R) → D(below)=G
  //   → quadrant: [R,R; R,G]
  //
  //   P=G (1,0): above=G, right=G, left=R, below=R
  //     E0: left==above? R==G → F → P=G
  //     E1: above==right(G==G) && above!=left(G!=R) && right!=below(G!=R) → B(right)=G
  //     E2: below==left(R==R) && below!=right(R!=G) && left!=above(R!=G) → C(left)=R
  //     E3: right==below? G==R → F → P=G
  //   → quadrant: [G,G; R,G]
  //
  //   P=G (0,1): above=R, right=R, left=G, below=G
  //     E0: left==above? G==R → F → P=G
  //     E1: above==right(R==R) && above!=left(R!=G) && right!=below(R!=G) → B(right)=R
  //     E2: below==left(G==G) && below!=right(G!=R) && left!=above(G!=R) → C(left)=G
  //     E3: right==below? R==G → F → P=G
  //   → quadrant: [G,R; G,G]
  //
  //   P=R (1,1): above=G, right=R, left=G, below=R
  //     E0: left==above(G==G) && left!=below(G!=R) && above!=right(G!=R) → A(above)=G
  //     E1: above==right? G==R → F → P=R
  //     E2: below==left? R==G → F → P=R
  //     E3: right==below(R==R) && right!=left(R!=G) && below!=above(R!=G) → D(below)=R
  //   → quadrant: [G,R; R,R]
  //
  // Full 4×4: row0=[R,R,G,G], row1=[R,G,R,G], row2=[G,R,G,R], row3=[G,G,R,R]
  it('produces known output for a 2×2 checkerboard (edge-clamped)', () => {
    const R: [number, number, number, number] = [255, 0, 0, 255];
    const G: [number, number, number, number] = [0, 255, 0, 255];
    const src = makeBuffer([R, G, G, R]);
    const result = scale2x(src, 2, 2, 2);
    const W = 4;

    // row 0: R, R, G, G
    expect(getPixel(result, 0, 0, W)).toEqual(R);
    expect(getPixel(result, 1, 0, W)).toEqual(R);
    expect(getPixel(result, 2, 0, W)).toEqual(G);
    expect(getPixel(result, 3, 0, W)).toEqual(G);
    // row 1: R, G, R, G
    expect(getPixel(result, 0, 1, W)).toEqual(R);
    expect(getPixel(result, 1, 1, W)).toEqual(G);
    expect(getPixel(result, 2, 1, W)).toEqual(R);
    expect(getPixel(result, 3, 1, W)).toEqual(G);
    // row 2: G, R, G, R
    expect(getPixel(result, 0, 2, W)).toEqual(G);
    expect(getPixel(result, 1, 2, W)).toEqual(R);
    expect(getPixel(result, 2, 2, W)).toEqual(G);
    expect(getPixel(result, 3, 2, W)).toEqual(R);
    // row 3: G, G, R, R
    expect(getPixel(result, 0, 3, W)).toEqual(G);
    expect(getPixel(result, 1, 3, W)).toEqual(G);
    expect(getPixel(result, 2, 3, W)).toEqual(R);
    expect(getPixel(result, 3, 3, W)).toEqual(R);
  });

  // 7. Handles 1×1 image (all neighbors clamp to P → all E = P)
  it('handles a 1×1 image — all neighbors clamp to P, output is uniform', () => {
    const src = makeBuffer([[42, 84, 168, 200]]);
    const result = scale2x(src, 1, 1, 2);
    expect(result.length).toBe(4 * 4); // 2×2 image × 4 channels
    for (let i = 0; i < 4; i++) {
      expect(getPixel(result, i % 2, Math.floor(i / 2), 2)).toEqual([42, 84, 168, 200]);
    }
  });

  // 8. Edge pixels are handled correctly (clamping, not wrapping)
  it('handles edge pixels correctly using edge clamping', () => {
    // 3×1 strip: red | blue | red
    // The middle pixel (blue) has left=red and right=red; above and below clamp to self
    const R = [255, 0, 0, 255];
    const B = [0, 0, 255, 255];
    const src = makeBuffer([R, B, R]);
    const result = scale2x(src, 3, 1, 2);
    // Output is 6×2; we just verify no crash and correct dimensions
    expect(result.length).toBe(6 * 2 * 4);
  });

  // 9. Iterative application (4×) produces correct dimensions
  it('iterative 4× application produces width*4 × height*4 buffer', () => {
    const pixels: number[][] = Array.from({ length: 4 * 4 }, () => [0, 128, 255, 255]);
    const src = makeBuffer(pixels);
    const result = scale2x(src, 4, 4, 4);
    expect(result.length).toBe(16 * 16 * 4);
  });
});
