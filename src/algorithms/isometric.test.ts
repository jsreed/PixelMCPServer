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
        const centre = pixels.find(p => p.x === 2 && p.y === 2);
        expect(centre).toBeDefined();
    });
});
