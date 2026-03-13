import { describe, it, expect } from 'vitest';
import { isoToPixel, isoFillRhombus } from './isometric.js';

describe('isoToPixel', () => {
  // tile 16×8 — a standard "2:1 dimetric" tile (width = 2× height)
  const TW = 16;
  const TH = 8;

  it('col=0, row=0, elev=0 → screen origin (0,0)', () => {
    const p = isoToPixel(0, 0, 0, TW, TH);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('col=1, row=0 → shifts right and down', () => {
    // x = (1-0) * 8 = 8,  y = (1+0) * 4 = 4
    const p = isoToPixel(1, 0, 0, TW, TH);
    expect(p.x).toBe(8);
    expect(p.y).toBe(4);
  });

  it('col=0, row=1 → shifts left and down', () => {
    // x = (0-1) * 8 = -8,  y = (0+1) * 4 = 4
    const p = isoToPixel(0, 1, 0, TW, TH);
    expect(p.x).toBe(-8);
    expect(p.y).toBe(4);
  });

  it('col=1, row=1 → directly below origin', () => {
    // x = (1-1) * 8 = 0,  y = (1+1) * 4 = 8
    const p = isoToPixel(1, 1, 0, TW, TH);
    expect(p.x).toBe(0);
    expect(p.y).toBe(8);
  });

  it('elevation lifts the tile upward on screen', () => {
    // y = (col+row) * (TH/2) − elev * TH
    // col=0, row=0, elev=1: y = 0 − 1*8 = -8
    const p = isoToPixel(0, 0, 1, TW, TH);
    expect(p.x).toBe(0);
    expect(p.y).toBe(-TH);
  });

  it('linearity: col=2, row=1 → x=8, y=12', () => {
    // x = (2-1) * 8 = 8,  y = (2+1) * 4 = 12
    const p = isoToPixel(2, 1, 0, TW, TH);
    expect(p.x).toBe(8);
    expect(p.y).toBe(12);
  });

  it('linearity: col=3, row=1 → x=16, y=16', () => {
    // x = (3-1) * 8 = 16,  y = (3+1) * 4 = 16
    const p = isoToPixel(3, 1, 0, TW, TH);
    expect(p.x).toBe(16);
    expect(p.y).toBe(16);
  });

  it('elevation with non-zero position: col=2, row=1, elev=2 → x=8, y=-4', () => {
    // x = (2-1) * 8 = 8,  y = (2+1) * 4 − 2*8 = 12 − 16 = -4
    const p = isoToPixel(2, 1, 2, TW, TH);
    expect(p.x).toBe(8);
    expect(p.y).toBe(-4);
  });
});

describe('isoToPixel — non-square tiles (32×16)', () => {
  const TW = 32;
  const TH = 16;

  it('col=1, row=0 → x=16, y=8', () => {
    // x = (1-0) * 16 = 16,  y = (1+0) * 8 = 8
    const p = isoToPixel(1, 0, 0, TW, TH);
    expect(p.x).toBe(16);
    expect(p.y).toBe(8);
  });

  it('col=2, row=1 → x=16, y=24', () => {
    // x = (2-1) * 16 = 16,  y = (2+1) * 8 = 24
    const p = isoToPixel(2, 1, 0, TW, TH);
    expect(p.x).toBe(16);
    expect(p.y).toBe(24);
  });

  it('col=3, row=2 → x=16, y=40', () => {
    // x = (3-2) * 16 = 16,  y = (3+2) * 8 = 40
    const p = isoToPixel(3, 2, 0, TW, TH);
    expect(p.x).toBe(16);
    expect(p.y).toBe(40);
  });

  it('col=4, row=0 → x=64, y=32', () => {
    // x = (4-0) * 16 = 64,  y = (4+0) * 8 = 32
    const p = isoToPixel(4, 0, 0, TW, TH);
    expect(p.x).toBe(64);
    expect(p.y).toBe(32);
  });
});

describe('isoFillRhombus', () => {
  const TW = 4;
  const TH = 4;

  it('returns at least one pixel for a non-zero tile', () => {
    const pixels = isoFillRhombus({ x: 0, y: 0 }, TW, TH);
    expect(pixels.length).toBeGreaterThan(0);
  });

  it('all returned pixels are within the rhombus bounding box', () => {
    const origin = { x: 0, y: 0 };
    const pixels = isoFillRhombus(origin, TW, TH);
    for (const px of pixels) {
      expect(px.x).toBeGreaterThanOrEqual(origin.x);
      expect(px.x).toBeLessThan(origin.x + TW);
      expect(px.y).toBeGreaterThanOrEqual(origin.y);
      expect(px.y).toBeLessThan(origin.y + TH);
    }
  });

  it('fills the centre pixel of a 4x4 rhombus', () => {
    const pixels = isoFillRhombus({ x: 0, y: 0 }, TW, TH);
    const centre = pixels.find((p) => p.x === 2 && p.y === 2);
    expect(centre).toBeDefined();
  });
});
