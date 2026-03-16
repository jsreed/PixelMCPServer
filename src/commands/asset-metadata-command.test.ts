import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { AssetMetadataCommand } from './asset-metadata-command.js';
import { type ColorCycleEntry } from '../types/asset.js';

function makeAsset(): AssetClass {
  return new AssetClass({
    name: 'sprite',
    width: 16,
    height: 16,
    perspective: 'flat',
    palette: [[0, 0, 0, 0]],
    layers: [{ id: 1, name: 'layer', type: 'image', visible: true, opacity: 255 }],
    frames: [{ index: 0, duration_ms: 100 }],
    cels: {},
    tags: [],
  });
}

describe('AssetMetadataCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeAsset();
  });

  it('execute sets color_cycling', () => {
    expect(asset.color_cycling).toBeUndefined();

    const entries: ColorCycleEntry[] = [
      { start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' },
    ];
    const cmd = new AssetMetadataCommand(asset, () => {
      asset.color_cycling = entries;
    });

    cmd.execute();
    expect(asset.color_cycling).toEqual(entries);
  });

  it('execute→undo restores original state', () => {
    const entries: ColorCycleEntry[] = [
      { start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' },
    ];
    const cmd = new AssetMetadataCommand(asset, () => {
      asset.color_cycling = entries;
    });

    cmd.execute();
    expect(asset.color_cycling).toEqual(entries);
    cmd.undo();
    expect(asset.color_cycling).toBeUndefined();
  });

  it('execute→undo→redo produces same result', () => {
    const entries: ColorCycleEntry[] = [
      { start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' },
    ];
    const cmd = new AssetMetadataCommand(asset, () => {
      asset.color_cycling = entries;
    });

    cmd.execute();
    const afterExecute = asset.color_cycling;
    cmd.undo();
    expect(asset.color_cycling).toBeUndefined();
    cmd.execute(); // redo
    expect(asset.color_cycling).toEqual(afterExecute);
  });

  it('undo/redo with pre-existing color_cycling', () => {
    const original: ColorCycleEntry[] = [
      { start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' },
    ];
    asset.color_cycling = original;

    const updated: ColorCycleEntry[] = [
      { start_index: 10, end_index: 20, speed_ms: 200, direction: 'ping_pong' },
    ];
    const cmd = new AssetMetadataCommand(asset, () => {
      asset.color_cycling = updated;
    });

    cmd.execute();
    expect(asset.color_cycling).toEqual(updated);
    cmd.undo();
    expect(asset.color_cycling).toEqual(original);
    cmd.execute(); // redo
    expect(asset.color_cycling).toEqual(updated);
  });
});
