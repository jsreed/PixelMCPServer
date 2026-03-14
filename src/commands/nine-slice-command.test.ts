import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { NineSliceCommand } from './nine-slice-command.js';

function makeAsset(): AssetClass {
  return new AssetClass({
    name: 'panel',
    width: 32,
    height: 32,
    perspective: 'flat',
    palette: [[0, 0, 0, 0]],
    layers: [{ id: 1, name: 'layer', type: 'image', visible: true, opacity: 255 }],
    frames: [{ index: 0, duration_ms: 100 }],
    cels: {},
    tags: [],
  });
}

describe('NineSliceCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeAsset();
  });

  it('execute sets nine_slice', () => {
    expect(asset.nine_slice).toBeUndefined();

    const ns = { top: 4, right: 4, bottom: 4, left: 4 };
    const cmd = new NineSliceCommand(asset, () => {
      asset.nine_slice = ns;
    });

    cmd.execute();
    expect(asset.nine_slice).toEqual(ns);
  });

  it('execute→undo restores original state', () => {
    const ns = { top: 4, right: 4, bottom: 4, left: 4 };
    const cmd = new NineSliceCommand(asset, () => {
      asset.nine_slice = ns;
    });

    cmd.execute();
    expect(asset.nine_slice).toEqual(ns);
    cmd.undo();
    expect(asset.nine_slice).toBeUndefined();
  });

  it('execute→undo→redo produces same result', () => {
    const ns = { top: 4, right: 4, bottom: 4, left: 4 };
    const cmd = new NineSliceCommand(asset, () => {
      asset.nine_slice = ns;
    });

    cmd.execute();
    const afterExecute = asset.nine_slice;
    cmd.undo();
    expect(asset.nine_slice).toBeUndefined();
    cmd.execute(); // redo
    expect(asset.nine_slice).toEqual(afterExecute);
  });

  it('undo/redo with pre-existing nine_slice', () => {
    const original = { top: 4, right: 4, bottom: 4, left: 4 };
    asset.nine_slice = original;

    const updated = { top: 8, right: 8, bottom: 8, left: 8 };
    const cmd = new NineSliceCommand(asset, () => {
      asset.nine_slice = updated;
    });

    cmd.execute();
    expect(asset.nine_slice).toEqual(updated);
    cmd.undo();
    expect(asset.nine_slice).toEqual(original);
    cmd.execute(); // redo
    expect(asset.nine_slice).toEqual(updated);
  });
});
