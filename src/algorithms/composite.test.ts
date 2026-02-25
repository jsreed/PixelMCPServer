import { describe, it, expect } from 'vitest';
import { compositeFrame, type CompositeLayer, type PaletteEntry } from './composite.js';

describe('compositeFrame', () => {
  const makePalette = (entries: Record<number, PaletteEntry>) => {
    return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
  };

  const makeLayer = (
    overrides: Partial<CompositeLayer> & { getPixel: CompositeLayer['getPixel'] },
  ): CompositeLayer => ({
    id: 0,
    type: 'image',
    visible: true,
    opacity: 255,
    ...overrides,
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
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const layer = makeLayer({
      getPixel: () => 1,
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
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    // Layer at 50% opacity (~128)
    const layer = makeLayer({
      opacity: 128,
      getPixel: () => 1,
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
      1: { r: 0, g: 0, b: 255, a: 255 }, // Blue (bottom)
      2: { r: 255, g: 0, b: 0, a: 128 }, // Semi-transparent red (top)
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
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const layer = makeLayer({
      visible: false,
      getPixel: () => 1,
    });

    const buf = compositeFrame(1, 1, [layer], palette, 0);
    // Should be fully transparent
    expect(buf[0]).toBe(0);
    expect(buf[3]).toBe(0);
  });

  it('inherits group visibility — invisible group hides children', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const child = makeLayer({ id: 1, getPixel: () => 1 });
    const group: CompositeLayer = {
      id: 0,
      type: 'group',
      visible: false,
      opacity: 255,
      children: [child],
      getPixel: () => null,
    };

    const buf = compositeFrame(1, 1, [group], palette, 0);
    expect(buf[3]).toBe(0); // Child hidden by group
  });

  it('skips shape layers (non-rendered collision geometry)', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const shapeLayer: CompositeLayer = {
      id: 0,
      type: 'shape',
      visible: true,
      opacity: 255,
      getPixel: () => 1,
    };

    const buf = compositeFrame(1, 1, [shapeLayer], palette, 0);
    expect(buf[3]).toBe(0); // Shape layers produce no pixels
  });

  it('zero-opacity layer is entirely invisible', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const layer = makeLayer({
      opacity: 0,
      getPixel: () => 1,
    });

    const buf = compositeFrame(1, 1, [layer], palette, 0);
    expect(buf[3]).toBe(0);
  });

  it('propagates visibility through nested groups (2+ levels deep)', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
    });

    const child = makeLayer({ id: 2, getPixel: () => 1 });
    const innerGroup: CompositeLayer = {
      id: 1,
      type: 'group',
      visible: true,
      opacity: 255,
      children: [child],
      getPixel: () => null,
    };
    const outerGroup: CompositeLayer = {
      id: 0,
      type: 'group',
      visible: false, // This should hide everything
      opacity: 255,
      children: [innerGroup],
      getPixel: () => null,
    };

    const buf = compositeFrame(1, 1, [outerGroup], palette, 0);
    expect(buf[3]).toBe(0); // Invisible outer group hides nested child
  });

  it('composites tilemap layers (not just image layers)', () => {
    const palette = makePalette({
      1: { r: 0, g: 255, b: 0, a: 255 },
    });

    const tilemapLayer = makeLayer({
      type: 'tilemap',
      getPixel: () => 1,
    });

    const buf = compositeFrame(1, 1, [tilemapLayer], palette, 0);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(255);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(255);
  });

  it('correctly double-scales palette alpha with layer opacity', () => {
    const palette = makePalette({
      1: { r: 255, g: 255, b: 255, a: 128 }, // Semi-transparent white
    });

    // Layer at 50% opacity
    const layer = makeLayer({
      opacity: 128,
      getPixel: () => 1,
    });

    const buf = compositeFrame(1, 1, [layer], palette, 0);
    // srcA = round(128 * 128 / 255) = round(64.25) = 64
    expect(buf[0]).toBe(255);
    expect(buf[3]).toBe(64);
  });

  it('supports linked cels via shared getPixel callbacks', () => {
    // Two layers sharing the same getPixel → simulates linked cels
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 128 },
    });

    const sharedGetPixel = (x: number, _y: number, _f: number) => (x === 0 ? 1 : null);

    const layer1 = makeLayer({ id: 0, opacity: 255, getPixel: sharedGetPixel });
    const layer2 = makeLayer({ id: 1, opacity: 255, getPixel: sharedGetPixel });

    const buf = compositeFrame(2, 1, [layer1, layer2], palette, 0);

    // Pixel 0: two semi-transparent red layers composited
    expect(buf[0]).toBe(255); // Red channel
    expect(buf[3]).toBeGreaterThan(128); // Alpha built up from two 128-alpha layers
    // Pixel 1: both layers return null → transparent
    expect(buf[7]).toBe(0);
  });

  it('handles sparse cels (getPixel returns null for most pixels)', () => {
    const palette = makePalette({
      1: { r: 0, g: 255, b: 0, a: 255 },
    });

    // Only pixel (1,1) has data
    const layer = makeLayer({
      getPixel: (x: number, y: number) => (x === 1 && y === 1 ? 1 : null),
    });

    const buf = compositeFrame(3, 3, [layer], palette, 0);

    // Only pixel (1,1) should have color — offset = (1*3+1)*4 = 16
    expect(buf[16]).toBe(0); // R
    expect(buf[17]).toBe(255); // G
    expect(buf[18]).toBe(0); // B
    expect(buf[19]).toBe(255); // A

    // Pixel (0,0) should be transparent
    expect(buf[3]).toBe(0);
    // Pixel (2,2) should be transparent
    expect(buf[35]).toBe(0);
  });

  it('composites three layers in correct bottom-to-top order', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 }, // Red
      2: { r: 0, g: 255, b: 0, a: 255 }, // Green
      3: { r: 0, g: 0, b: 255, a: 255 }, // Blue
    });

    // Bottom=red, middle=green, top=blue (all opaque)
    // The topmost opaque layer should completely cover
    const bottom = makeLayer({ id: 0, getPixel: () => 1 });
    const middle = makeLayer({ id: 1, getPixel: () => 2 });
    const top = makeLayer({ id: 2, getPixel: () => 3 });

    const buf = compositeFrame(1, 1, [bottom, middle, top], palette, 0);
    // Blue wins (top, fully opaque)
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(255);
    expect(buf[3]).toBe(255);
  });

  it('passes frameIndex to getPixel correctly', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
      2: { r: 0, g: 255, b: 0, a: 255 },
    });

    // Return different palette index depending on frame
    const layer = makeLayer({
      getPixel: (_x: number, _y: number, frame: number) => (frame === 0 ? 1 : 2),
    });

    const buf0 = compositeFrame(1, 1, [layer], palette, 0);
    expect(buf0[0]).toBe(255); // Red for frame 0
    expect(buf0[1]).toBe(0);

    const buf3 = compositeFrame(1, 1, [layer], palette, 3);
    expect(buf3[0]).toBe(0);
    expect(buf3[1]).toBe(255); // Green for frame 3
  });

  it('visible group with mixed visible/invisible children', () => {
    const palette = makePalette({
      1: { r: 255, g: 0, b: 0, a: 255 },
      2: { r: 0, g: 255, b: 0, a: 255 },
    });

    const visibleChild = makeLayer({ id: 1, getPixel: () => 1 });
    const invisibleChild = makeLayer({ id: 2, visible: false, getPixel: () => 2 });
    const group: CompositeLayer = {
      id: 0,
      type: 'group',
      visible: true,
      opacity: 255,
      children: [visibleChild, invisibleChild],
      getPixel: () => null,
    };

    const buf = compositeFrame(1, 1, [group], palette, 0);
    // Red (visible child), not green (invisible child)
    expect(buf[0]).toBe(255);
    expect(buf[1]).toBe(0);
    expect(buf[3]).toBe(255);
  });
});
