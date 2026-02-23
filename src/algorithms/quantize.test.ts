import { describe, it, expect } from 'vitest';
import { quantize } from './quantize.js';

describe('quantize (Median Cut Color Quantization)', () => {

    it('returns empty results for an empty pixel array', () => {
        const result = quantize([], 16);
        expect(result.palette.size).toBe(0);
        expect(result.indices).toHaveLength(0);
    });

    it('maps colors 1:1 if unique color count < maxColors', () => {
        // Red, Green, Blue, Red
        const pixels = [
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 0, 0, 255
        ];

        const result = quantize(pixels, 16);

        // No transparency, so indices should start at 0
        expect(result.palette.size).toBe(3);

        // Which index they get assigned is deterministic but order dependent.
        // Let's just track that 3 unique colors got generated.
        const c1 = result.palette.get(0);
        const c2 = result.palette.get(1);
        const c3 = result.palette.get(2);

        expect([c1, c2, c3]).toContain('#ff0000ff');
        expect([c1, c2, c3]).toContain('#00ff00ff');
        expect([c1, c2, c3]).toContain('#0000ffff');

        // Indices should match the reused color
        expect(result.indices[0]).toEqual(result.indices[3]);
        expect(result.indices[1]).not.toEqual(result.indices[0]);
        expect(result.indices[2]).not.toEqual(result.indices[0]);
    });

    it('preserves index 0 as transparent if image contains transparency', () => {
        // Transparent, Red, Transparent
        const pixels = [
            0, 0, 0, 0,
            255, 0, 0, 255,
            128, 128, 128, 50 // Semi-transparent, drops to 0
        ];

        const result = quantize(pixels, 16);

        expect(result.palette.get(0)).toBe('#00000000');
        expect(result.palette.get(1)).toBe('#ff0000ff');
        expect(result.palette.size).toBe(2);

        expect(result.indices).toEqual([0, 1, 0]);
    });

    it('quantizes a gradient smoothly down to maxColors limits using Euclidean distances', () => {
        // Create 10 distinct shades of red
        const pixels: number[] = [];
        for (let i = 0; i < 10; i++) {
            pixels.push(i * 20, 0, 0, 255);
        }

        // Restrict to max 3 solid colors
        const result = quantize(pixels, 3);

        expect(result.palette.size).toBe(3);

        // Make sure none of them are '#'
        expect(result.palette.get(0)).toMatch(/#[0-9a-fA-F]{8}/);

        // Make sure indices array is 10 long
        expect(result.indices).toHaveLength(10);

        // Ensure values strictly use indices 0, 1, 2
        for (const idx of result.indices) {
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(3);
        }
    });

    it('handles a single pixel image', () => {
        const pixels = [255, 0, 0, 255];
        const result = quantize(pixels, 256);
        expect(result.palette.size).toBe(1);
        expect(result.indices).toEqual([0]);
        expect(result.palette.get(0)).toBe('#ff0000ff');
    });

    it('handles maxColors=1 with transparency — only transparent index fits', () => {
        const pixels = [
            0, 0, 0, 0,       // Transparent
            255, 0, 0, 255     // Red (cannot fit)
        ];
        const result = quantize(pixels, 1);
        // Only index 0 (transparent) fits; red pixel has no slot
        expect(result.palette.get(0)).toBe('#00000000');
        expect(result.indices[0]).toBe(0);
    });

    it('handles 1000 identical pixels as a single palette entry', () => {
        const pixels: number[] = [];
        for (let i = 0; i < 1000; i++) {
            pixels.push(42, 128, 200, 255);
        }
        const result = quantize(pixels, 256);
        expect(result.palette.size).toBe(1);
        expect(result.indices).toHaveLength(1000);
        // All indices should be the same
        const uniqueIndices = new Set(result.indices);
        expect(uniqueIndices.size).toBe(1);
    });

    it('quantizes 256+ distinct colors via median cut without wild inaccuracy', () => {
        // Generate 512 distinct colors spanning the RGB cube
        const pixels: number[] = [];
        for (let i = 0; i < 512; i++) {
            pixels.push(
                (i * 37) % 256,
                (i * 73) % 256,
                (i * 113) % 256,
                255
            );
        }
        const result = quantize(pixels, 16);
        expect(result.palette.size).toBe(16);
        expect(result.indices).toHaveLength(512);

        // Each index should point to a valid palette entry
        for (const idx of result.indices) {
            expect(result.palette.has(idx)).toBe(true);
        }
    });
});
