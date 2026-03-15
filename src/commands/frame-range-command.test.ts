import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { FrameRangeCommand } from './frame-range-command.js';

function buildMultiFrameAsset(): AssetClass {
  return new AssetClass({
    name: 'test',
    width: 4,
    height: 4,
    perspective: 'flat',
    palette: [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ],
    layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
    frames: [
      { index: 0, duration_ms: 100 },
      { index: 1, duration_ms: 100 },
      { index: 2, duration_ms: 100 },
      { index: 3, duration_ms: 100 },
    ],
    cels: {},
    tags: [],
  });
}

function getCelData(
  asset: AssetClass,
  layerId: number,
  frameIndex: number,
): number[][] | undefined {
  const cel = asset.getCel(layerId, frameIndex);
  if (!cel || !('data' in cel)) return undefined;
  return cel.data;
}

describe('FrameRangeCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = buildMultiFrameAsset();
    // Pre-populate all frames with distinct initial data
    for (let f = 0; f < 4; f++) {
      asset.setCel(1, f, {
        x: 0,
        y: 0,
        data: [
          [f, f, f, f],
          [f, f, f, f],
          [f, f, f, f],
          [f, f, f, f],
        ],
      });
    }
  });

  it('execute applies action to all frames in range', () => {
    const cmd = new FrameRangeCommand(asset, 1, 1, 3, (fi) => {
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [99, 99, 99, 99],
          [99, 99, 99, 99],
          [99, 99, 99, 99],
          [99, 99, 99, 99],
        ],
      });
    });

    cmd.execute();

    // Frame 0 untouched
    expect(getCelData(asset, 1, 0)?.[0][0]).toBe(0);
    // Frames 1–3 updated
    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(99);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(99);
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(99);
  });

  it('undo restores all frames to original state', () => {
    const cmd = new FrameRangeCommand(asset, 1, 1, 3, (fi) => {
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [99, 99, 99, 99],
          [99, 99, 99, 99],
          [99, 99, 99, 99],
          [99, 99, 99, 99],
        ],
      });
    });

    cmd.execute();
    cmd.undo();

    // All frames back to original
    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(1);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(2);
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(3);
  });

  it('redo reapplies changes after undo', () => {
    const cmd = new FrameRangeCommand(asset, 1, 1, 2, (fi) => {
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [77, 77, 77, 77],
          [77, 77, 77, 77],
          [77, 77, 77, 77],
          [77, 77, 77, 77],
        ],
      });
    });

    cmd.execute();
    cmd.undo();
    cmd.execute(); // redo

    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(77);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(77);
  });

  it('does not modify frames outside the range', () => {
    const cmd = new FrameRangeCommand(asset, 1, 1, 2, (fi) => {
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [88, 88, 88, 88],
          [88, 88, 88, 88],
          [88, 88, 88, 88],
          [88, 88, 88, 88],
        ],
      });
    });

    cmd.execute();

    // Frame 0 and frame 3 should be untouched
    expect(getCelData(asset, 1, 0)?.[0][0]).toBe(0);
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(3);
    // Only frames 1 and 2 changed
    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(88);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(88);
  });

  it('handles single-frame range', () => {
    const cmd = new FrameRangeCommand(asset, 1, 2, 2, (fi) => {
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [55, 55, 55, 55],
          [55, 55, 55, 55],
          [55, 55, 55, 55],
          [55, 55, 55, 55],
        ],
      });
    });

    cmd.execute();

    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(1); // unchanged
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(55); // changed
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(3); // unchanged
  });

  it('preserves per-frame cel independence (different initial data per frame)', () => {
    const cmd = new FrameRangeCommand(asset, 1, 0, 3, (fi) => {
      // Each frame gets a different value based on frame index * 10
      const v = fi * 10;
      asset.setCel(1, fi, {
        x: 0,
        y: 0,
        data: [
          [v, v, v, v],
          [v, v, v, v],
          [v, v, v, v],
          [v, v, v, v],
        ],
      });
    });

    cmd.execute();

    expect(getCelData(asset, 1, 0)?.[0][0]).toBe(0);
    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(10);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(20);
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(30);

    cmd.undo();

    // Each frame reverts to its own original data
    expect(getCelData(asset, 1, 0)?.[0][0]).toBe(0);
    expect(getCelData(asset, 1, 1)?.[0][0]).toBe(1);
    expect(getCelData(asset, 1, 2)?.[0][0]).toBe(2);
    expect(getCelData(asset, 1, 3)?.[0][0]).toBe(3);
  });
});
