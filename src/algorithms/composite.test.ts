import { describe, it, expect } from 'vitest';
import { compositeFrame, type CompositeLayer, type PaletteEntry } from './composite.js';

describe('compositeFrame', () => {

    const makePalette = (entries: Record<number, PaletteEntry>) => {
        return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
    };

    const makeLayer = (overrides: Partial<CompositeLayer> & { getPixel: CompositeLayer['getPixel'] }): CompositeLayer => ({
        id: 0,
        type: 'image',
        visible: true,
        opacity: 255,
        ...overrides
    });

    it('returns fully transparent buffer with no layers', () => {
        const buf = compositeFrame(2, 2, [], new Map(), 0);
        expect(buf.length).toBe(16); // 2*2*4
        for (let i = 0; i < buf.length; i++) {
            expect(buf[i]).toBe(0);
        }
    });

    it('renders a single fully opaque layer correctly', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const layer = makeLayer({
            getPixel: () => 1
        });

        const buf = compositeFrame(2, 1, [layer], palette, 0);
        // Pixel 0: (255, 0, 0, 255)
        expect(buf[0]).toBe(255);
        expect(buf[1]).toBe(0);
        expect(buf[2]).toBe(0);
        expect(buf[3]).toBe(255);
        // Pixel 1: same
        expect(buf[4]).toBe(255);
    });

    it('applies layer opacity to source alpha', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        // Layer at 50% opacity (~128)
        const layer = makeLayer({
            opacity: 128,
            getPixel: () => 1
        });

        const buf = compositeFrame(1, 1, [layer], palette, 0);
        // srcA = round(255 * 128 / 255) = 128
        expect(buf[0]).toBe(255);
        expect(buf[1]).toBe(0);
        expect(buf[2]).toBe(0);
        expect(buf[3]).toBe(128);
    });

    it('blends two layers with alpha-over correctly', () => {
        const palette = makePalette({
            1: { r: 0, g: 0, b: 255, a: 255 },   // Blue (bottom)
            2: { r: 255, g: 0, b: 0, a: 128 }     // Semi-transparent red (top)
        });

        const bottom = makeLayer({ id: 0, getPixel: () => 1 });
        const top = makeLayer({ id: 1, getPixel: () => 2 });

        const buf = compositeFrame(1, 1, [bottom, top], palette, 0);

        // Alpha-over: srcA=128, dstA=255
        // outA = 128 + 255 * (1 - 128/255) ≈ 128 + 127 = 255
        // outR = (255*128 + 0*255*(1-128/255)) / 255 ≈ 128
        // outB = (0*128 + 255*255*(1-128/255)) / 255 ≈ 127
        expect(buf[3]).toBe(255); // Full alpha
        expect(buf[0]).toBeGreaterThan(100); // Red present
        expect(buf[2]).toBeGreaterThan(100); // Blue still visible
    });

    it('skips invisible layers entirely', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const layer = makeLayer({
            visible: false,
            getPixel: () => 1
        });

        const buf = compositeFrame(1, 1, [layer], palette, 0);
        // Should be fully transparent
        expect(buf[0]).toBe(0);
        expect(buf[3]).toBe(0);
    });

    it('inherits group visibility — invisible group hides children', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const child = makeLayer({ id: 1, getPixel: () => 1 });
        const group: CompositeLayer = {
            id: 0,
            type: 'group',
            visible: false,
            opacity: 255,
            children: [child],
            getPixel: () => null
        };

        const buf = compositeFrame(1, 1, [group], palette, 0);
        expect(buf[3]).toBe(0); // Child hidden by group
    });

    it('skips shape layers (non-rendered collision geometry)', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const shapeLayer: CompositeLayer = {
            id: 0,
            type: 'shape',
            visible: true,
            opacity: 255,
            getPixel: () => 1
        };

        const buf = compositeFrame(1, 1, [shapeLayer], palette, 0);
        expect(buf[3]).toBe(0); // Shape layers produce no pixels
    });

    it('zero-opacity layer is entirely invisible', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const layer = makeLayer({
            opacity: 0,
            getPixel: () => 1
        });

        const buf = compositeFrame(1, 1, [layer], palette, 0);
        expect(buf[3]).toBe(0);
    });

    it('propagates visibility through nested groups (2+ levels deep)', () => {
        const palette = makePalette({
            1: { r: 255, g: 0, b: 0, a: 255 }
        });

        const child = makeLayer({ id: 2, getPixel: () => 1 });
        const innerGroup: CompositeLayer = {
            id: 1,
            type: 'group',
            visible: true,
            opacity: 255,
            children: [child],
            getPixel: () => null
        };
        const outerGroup: CompositeLayer = {
            id: 0,
            type: 'group',
            visible: false, // This should hide everything
            opacity: 255,
            children: [innerGroup],
            getPixel: () => null
        };

        const buf = compositeFrame(1, 1, [outerGroup], palette, 0);
        expect(buf[3]).toBe(0); // Invisible outer group hides nested child
    });

    it('composites tilemap layers (not just image layers)', () => {
        const palette = makePalette({
            1: { r: 0, g: 255, b: 0, a: 255 }
        });

        const tilemapLayer = makeLayer({
            type: 'tilemap',
            getPixel: () => 1
        });

        const buf = compositeFrame(1, 1, [tilemapLayer], palette, 0);
        expect(buf[0]).toBe(0);
        expect(buf[1]).toBe(255);
        expect(buf[2]).toBe(0);
        expect(buf[3]).toBe(255);
    });

    it('correctly double-scales palette alpha with layer opacity', () => {
        const palette = makePalette({
            1: { r: 255, g: 255, b: 255, a: 128 } // Semi-transparent white
        });

        // Layer at 50% opacity
        const layer = makeLayer({
            opacity: 128,
            getPixel: () => 1
        });

        const buf = compositeFrame(1, 1, [layer], palette, 0);
        // srcA = round(128 * 128 / 255) = round(64.25) = 64
        expect(buf[0]).toBe(255);
        expect(buf[3]).toBe(64);
    });

});
