import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { TileDataCommand } from './tile-data-command.js';
import { type TileCustomData } from '../types/asset.js';

function makeTilesetAsset(): AssetClass {
  return new AssetClass({
    name: 'tileset',
    width: 64,
    height: 16,
    perspective: 'flat',
    palette: [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
    ],
    layers: [{ id: 1, name: 'tiles', type: 'image', visible: true, opacity: 255 }],
    frames: [{ index: 0, duration_ms: 100 }],
    cels: {},
    tags: [],
    tile_width: 16,
    tile_height: 16,
    tile_count: 4,
  });
}

describe('TileDataCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeTilesetAsset();
  });

  it('execute sets tile_custom_data', () => {
    expect(asset.tile_custom_data).toBeUndefined();
    const customData: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 2 } },
    };
    const cmd = new TileDataCommand(asset, () => {
      asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
    });
    cmd.execute();
    expect(asset.tile_custom_data).toEqual(customData);
  });

  it('execute then undo restores undefined', () => {
    const customData: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 2 } },
    };
    const cmd = new TileDataCommand(asset, () => {
      asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
    });
    cmd.execute();
    expect(asset.tile_custom_data).toBeDefined();
    cmd.undo();
    expect(asset.tile_custom_data).toBeUndefined();
  });

  it('execute, undo, redo produces same result', () => {
    const customData: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 2 } },
    };
    const cmd = new TileDataCommand(asset, () => {
      asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
    });
    cmd.execute();
    const after = asset.tile_custom_data;
    cmd.undo();
    expect(asset.tile_custom_data).toBeUndefined();
    cmd.execute(); // redo
    expect(asset.tile_custom_data).toEqual(after);
  });

  it('undo/redo with pre-existing tile_custom_data', () => {
    const original: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 1 } },
    };
    asset.tile_custom_data = original;
    const updated: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 5 } },
    };
    const cmd = new TileDataCommand(asset, () => {
      asset.tile_custom_data = { ...updated, layers: [...updated.layers] };
    });
    cmd.execute();
    expect(asset.tile_custom_data).toEqual(updated);
    cmd.undo();
    expect(asset.tile_custom_data).toEqual(original);
    cmd.execute();
    expect(asset.tile_custom_data).toEqual(updated);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const customData: TileCustomData = {
      layers: [{ name: 'movement_cost', type: 'int' }],
      tiles: { '0': { movement_cost: 3 } },
    };
    const cmd = new TileDataCommand(asset, () => {
      asset.tile_custom_data = { ...customData, layers: [...customData.layers] };
    });
    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.tile_custom_data).toEqual(customData);
      cmd.undo();
      expect(asset.tile_custom_data).toBeUndefined();
    }
  });
});
