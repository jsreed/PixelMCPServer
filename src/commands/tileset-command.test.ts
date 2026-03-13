import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { TilesetCommand } from './tileset-command.js';
import { type TilePhysics, type TileTerrain } from '../types/asset.js';

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

describe('TilesetCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeTilesetAsset();
  });

  it('execute→undo restores original width and tile_count', () => {
    const cmd = new TilesetCommand(asset, () => {
      // Simulate extract_tile: extend canvas, increment tile_count
      asset._restoreDataPatch({ width: 32, tile_count: 2 });
    });

    expect(asset.width).toBe(16);
    expect(asset.tile_count).toBe(1);
    cmd.execute();
    expect(asset.width).toBe(32);
    expect(asset.tile_count).toBe(2);
    cmd.undo();
    expect(asset.width).toBe(16);
    expect(asset.tile_count).toBe(1);
  });

  it('execute→undo→redo produces same result', () => {
    const cmd = new TilesetCommand(asset, () => {
      asset._restoreDataPatch({ width: 32, tile_count: 2 });
    });

    cmd.execute();
    const afterWidth = asset.width;
    const afterCount = asset.tile_count;
    cmd.undo();
    cmd.execute(); // redo
    expect(asset.width).toBe(afterWidth);
    expect(asset.tile_count).toBe(afterCount);
  });

  it('restores cel data on undo after tile data change', () => {
    const newCels = {
      '1/0': {
        x: 0,
        y: 0,
        data: Array.from({ length: 16 }, () => Array(16).fill(0) as number[]),
      },
    };
    const cmd = new TilesetCommand(asset, () => {
      asset._restoreDataPatch({ cels: newCels });
    });

    cmd.execute();
    const cel = asset.getCel(1, 0) as { data: number[][] };
    expect(cel.data[0][0]).toBe(0);
    cmd.undo();
    const restored = asset.getCel(1, 0) as { data: number[][] };
    expect(restored.data[0][0]).toBe(1);
  });

  it('adds tile_physics on execute and removes it on undo', () => {
    expect(asset.tile_physics).toBeUndefined();

    const physics: TilePhysics = {
      physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
      tiles: {
        '0': {
          polygon: [
            [0, 0],
            [16, 0],
            [16, 16],
            [0, 16],
          ],
        },
      },
    };
    const cmd = new TilesetCommand(asset, () => {
      asset.tile_physics = physics;
    });

    cmd.execute();
    expect(asset.tile_physics).toBeDefined();
    cmd.undo();
    // tile_physics was not present before — must be cleared on undo
    expect(asset.tile_physics).toBeUndefined();
  });

  it('preserves existing tile_physics on undo', () => {
    const physics: TilePhysics = {
      physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
      tiles: {
        '0': {
          polygon: [
            [0, 0],
            [16, 0],
            [16, 16],
            [0, 16],
          ],
        },
      },
    };
    asset.tile_physics = physics;

    const updatedPhysics: TilePhysics = {
      physics_layers: [{ collision_layer: 2, collision_mask: 2 }],
      tiles: {
        '1': {
          polygon: [
            [0, 0],
            [8, 0],
            [8, 8],
            [0, 8],
          ],
        },
      },
    };
    const cmd = new TilesetCommand(asset, () => {
      asset.tile_physics = updatedPhysics;
    });

    cmd.execute();
    expect(asset.tile_physics).toEqual(updatedPhysics);
    cmd.undo();
    expect(asset.tile_physics).toEqual(physics);
  });

  it('adds tile_terrain on execute and removes it on undo', () => {
    expect(asset.tile_terrain).toBeUndefined();

    const terrain: TileTerrain = {
      pattern: 'blob47',
      terrain_name: 'grass',
      peering_bits: {
        '0': {
          top: -1,
          top_right: -1,
          right: -1,
          bottom_right: -1,
          bottom: -1,
          bottom_left: -1,
          left: -1,
          top_left: -1,
        },
      },
    };
    const cmd = new TilesetCommand(asset, () => {
      asset.tile_terrain = terrain;
    });

    cmd.execute();
    expect(asset.tile_terrain).toBeDefined();
    expect(asset.tile_terrain?.terrain_name).toBe('grass');
    cmd.undo();
    // tile_terrain was not present before — must be cleared on undo
    expect(asset.tile_terrain).toBeUndefined();
  });

  it('redo removes tile_physics that was absent before execute', () => {
    const physics: TilePhysics = {
      physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
      tiles: {
        '0': {
          polygon: [
            [0, 0],
            [16, 0],
            [16, 16],
            [0, 16],
          ],
        },
      },
    };
    const cmd = new TilesetCommand(asset, () => {
      asset.tile_physics = physics;
    });

    cmd.execute();
    cmd.undo();
    expect(asset.tile_physics).toBeUndefined();
    cmd.execute(); // redo — restores the after state (tile_physics present)
    expect(asset.tile_physics).toBeDefined();
  });

  it('sets tile_width/tile_height on execute and clears them on undo when initially undefined', () => {
    // Simulate an asset with no tile dimensions pre-configured
    const asset2 = new AssetClass({
      name: 'plain',
      width: 16,
      height: 16,
      perspective: 'flat',
      palette: [[0, 0, 0, 0]],
      layers: [{ id: 1, name: 'layer', type: 'image', visible: true, opacity: 255 }],
      frames: [{ index: 0, duration_ms: 100 }],
      cels: {},
      tags: [],
      // tile_width and tile_height are intentionally absent
    });

    expect(asset2.tile_width).toBeUndefined();
    expect(asset2.tile_height).toBeUndefined();

    const cmd = new TilesetCommand(asset2, () => {
      if (asset2.tile_width === undefined) asset2.tile_width = 8;
      if (asset2.tile_height === undefined) asset2.tile_height = 8;
    });

    cmd.execute();
    expect(asset2.tile_width).toBe(8);
    expect(asset2.tile_height).toBe(8);

    cmd.undo();
    expect(asset2.tile_width).toBeUndefined();
    expect(asset2.tile_height).toBeUndefined();

    cmd.execute(); // redo
    expect(asset2.tile_width).toBe(8);
    expect(asset2.tile_height).toBe(8);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new TilesetCommand(asset, () => {
      asset._restoreDataPatch({ width: 32, tile_count: 2 });
    });

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.width).toBe(32);
      expect(asset.tile_count).toBe(2);
      cmd.undo();
      expect(asset.width).toBe(16);
      expect(asset.tile_count).toBe(1);
    }
  });
});
