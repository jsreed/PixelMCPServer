import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { TileAlternativeCommand } from './tile-alternative-command.js';
import { type TileAlternatives } from '../types/asset.js';

function makeTilesetAsset(): AssetClass {
  return new AssetClass({
    name: 'tileset',
    width: 16,
    height: 16,
    perspective: 'flat',
    palette: [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
    ],
    layers: [{ id: 1, name: 'tiles', type: 'image', visible: true, opacity: 255 }],
    frames: [{ index: 0, duration_ms: 100 }],
    cels: {
      '1/0': { x: 0, y: 0, data: Array.from({ length: 16 }, () => Array(16).fill(1) as number[]) },
    },
    tags: [],
    tile_width: 16,
    tile_height: 16,
    tile_count: 1,
  });
}

describe('TileAlternativeCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeTilesetAsset();
  });

  it('execute sets tile_alternatives', () => {
    const cmd = new TileAlternativeCommand(asset, () => {
      asset.tile_alternatives = {
        '0': [{ alternative_id: 1, flip_h: true, flip_v: false, transpose: false }],
      };
    });

    expect(asset.tile_alternatives).toBeUndefined();
    cmd.execute();
    expect(asset.tile_alternatives?.['0']).toHaveLength(1);
    expect(asset.tile_alternatives?.['0']?.[0]?.alternative_id).toBe(1);
    expect(asset.tile_alternatives?.['0']?.[0]?.flip_h).toBe(true);
  });

  it('execute then undo restores undefined', () => {
    const cmd = new TileAlternativeCommand(asset, () => {
      asset.tile_alternatives = {
        '0': [{ alternative_id: 1, flip_h: true, flip_v: false, transpose: false }],
      };
    });

    cmd.execute();
    expect(asset.tile_alternatives).toBeDefined();
    cmd.undo();
    expect(asset.tile_alternatives).toBeUndefined();
  });

  it('execute, undo, redo produces same result', () => {
    const alts: TileAlternatives = {
      '0': [{ alternative_id: 1, flip_h: false, flip_v: true, transpose: false }],
    };
    const cmd = new TileAlternativeCommand(asset, () => {
      asset.tile_alternatives = alts;
    });

    cmd.execute();
    const afterState = asset.tile_alternatives;
    cmd.undo();
    expect(asset.tile_alternatives).toBeUndefined();
    cmd.execute(); // redo
    expect(asset.tile_alternatives).toEqual(afterState);
  });

  it('undo with pre-existing tile_alternatives restores original state', () => {
    const original: TileAlternatives = {
      '0': [{ alternative_id: 1, flip_h: false, flip_v: false, transpose: true }],
    };
    asset.tile_alternatives = original;

    const cmd = new TileAlternativeCommand(asset, () => {
      asset.tile_alternatives = {
        '0': [
          { alternative_id: 1, flip_h: false, flip_v: false, transpose: true },
          { alternative_id: 2, flip_h: true, flip_v: true, transpose: false },
        ],
      };
    });

    cmd.execute();
    expect(asset.tile_alternatives?.['0']).toHaveLength(2); // eslint-disable-line
    cmd.undo();
    expect(asset.tile_alternatives).toEqual(original);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new TileAlternativeCommand(asset, () => {
      asset.tile_alternatives = {
        '0': [{ alternative_id: 1, flip_h: true, flip_v: false, transpose: false }],
      };
    });

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.tile_alternatives?.['0']).toHaveLength(1);
      cmd.undo();
      expect(asset.tile_alternatives).toBeUndefined();
    }
  });
});
