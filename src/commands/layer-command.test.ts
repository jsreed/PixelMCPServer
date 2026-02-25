import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { LayerCommand } from './layer-command.js';

describe('LayerCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = new AssetClass({
      name: 'test',
      width: 16,
      height: 16,
      perspective: 'flat',
      palette: [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
      ],
      layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
      frames: [{ index: 0, duration_ms: 100 }],
      cels: {},
      tags: [],
    });
  });

  it('execute→undo restores original layer count', () => {
    const cmd = new LayerCommand(asset, () => {
      asset.addLayer({ name: 'extra', type: 'image', visible: true, opacity: 255 });
    });

    expect(asset.layers.length).toBe(1);
    cmd.execute();
    expect(asset.layers.length).toBe(2);
    cmd.undo();
    expect(asset.layers.length).toBe(1);
  });

  it('execute→undo→redo produces same layer structure', () => {
    const cmd = new LayerCommand(asset, () => {
      asset.addLayer({ name: 'extra', type: 'image', visible: true, opacity: 255 });
    });

    cmd.execute();
    const afterLayers = JSON.stringify(asset.layers);
    cmd.undo();
    cmd.execute();
    expect(JSON.stringify(asset.layers)).toBe(afterLayers);
  });

  it('undoes layer removal and restores associated cels', () => {
    asset.addLayer({ name: 'extra', type: 'image', visible: true, opacity: 255 });
    const extraId = asset.layers[1].id;
    asset.setCel(extraId, 0, { x: 0, y: 0, data: [[1]] });

    const cmd = new LayerCommand(asset, () => {
      asset.removeLayer(extraId);
    });

    cmd.execute();
    expect(asset.layers.length).toBe(1);
    cmd.undo();
    expect(asset.layers.length).toBe(2);
    // Cel data should also be restored
    expect(asset.getCel(extraId, 0)).toBeDefined();
  });

  it('undoes layer reorder', () => {
    asset.addLayer({ name: 'overlay', type: 'image', visible: true, opacity: 255 });
    const overlayId = asset.layers[1].id;

    const cmd = new LayerCommand(asset, () => {
      asset.reorderLayer(overlayId, undefined, 0);
    });

    expect(asset.layers[0].name).toBe('base');
    cmd.execute();
    expect(asset.layers[0].name).toBe('overlay');
    cmd.undo();
    expect(asset.layers[0].name).toBe('base');
  });

  it('restores layer tags on undo', () => {
    asset.addLayer({ name: 'overlay', type: 'image', visible: true, opacity: 255 });
    const overlayId = asset.layers[1].id;
    asset.addTag({ name: 'armor', type: 'layer', layers: [overlayId] });

    const cmd = new LayerCommand(asset, () => {
      asset.removeLayer(overlayId);
    });

    expect(asset.tags.length).toBe(1);
    cmd.execute();
    // After removing the layer, tag may be affected
    cmd.undo();
    // Tags should be restored to original state
    expect(asset.tags.length).toBe(1);
    expect(asset.tags[0].name).toBe('armor');
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new LayerCommand(asset, () => {
      asset.addLayer({ name: 'extra', type: 'image', visible: true, opacity: 255 });
    });

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.layers.length).toBe(2);
      cmd.undo();
      expect(asset.layers.length).toBe(1);
    }
  });
});
