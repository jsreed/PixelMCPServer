import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { TileAnimationCommand } from './tile-animation-command.js';
import { type TileAnimation } from '../types/asset.js';

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

describe('TileAnimationCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = makeTilesetAsset();
  });

  it('execute sets tile_animation', () => {
    expect(asset.tile_animation).toBeUndefined();
    const anim: TileAnimation = { '0': { frame_count: 4, frame_duration_ms: 200, separation: 0 } };
    const cmd = new TileAnimationCommand(asset, () => {
      asset.tile_animation = { ...anim };
    });
    cmd.execute();
    expect(asset.tile_animation).toEqual(anim);
  });

  it('execute then undo restores undefined', () => {
    const anim: TileAnimation = { '0': { frame_count: 4, frame_duration_ms: 200, separation: 0 } };
    const cmd = new TileAnimationCommand(asset, () => {
      asset.tile_animation = { ...anim };
    });
    cmd.execute();
    expect(asset.tile_animation).toBeDefined();
    cmd.undo();
    expect(asset.tile_animation).toBeUndefined();
  });

  it('execute, undo, redo produces same result', () => {
    const anim: TileAnimation = { '0': { frame_count: 4, frame_duration_ms: 200, separation: 0 } };
    const cmd = new TileAnimationCommand(asset, () => {
      asset.tile_animation = { ...anim };
    });
    cmd.execute();
    const after = asset.tile_animation;
    cmd.undo();
    expect(asset.tile_animation).toBeUndefined();
    cmd.execute(); // redo
    expect(asset.tile_animation).toEqual(after);
  });

  it('undo/redo with pre-existing tile_animation', () => {
    const original: TileAnimation = {
      '0': { frame_count: 2, frame_duration_ms: 100, separation: 0 },
    };
    asset.tile_animation = original;
    const updated: TileAnimation = {
      '0': { frame_count: 4, frame_duration_ms: 200, separation: 2 },
    };
    const cmd = new TileAnimationCommand(asset, () => {
      asset.tile_animation = { ...updated };
    });
    cmd.execute();
    expect(asset.tile_animation).toEqual(updated);
    cmd.undo();
    expect(asset.tile_animation).toEqual(original);
    cmd.execute();
    expect(asset.tile_animation).toEqual(updated);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const anim: TileAnimation = { '0': { frame_count: 3, frame_duration_ms: 150, separation: 0 } };
    const cmd = new TileAnimationCommand(asset, () => {
      asset.tile_animation = { ...anim };
    });
    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.tile_animation).toEqual(anim);
      cmd.undo();
      expect(asset.tile_animation).toBeUndefined();
    }
  });
});
