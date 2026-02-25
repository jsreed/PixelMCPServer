import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { TagCommand } from './tag-command.js';

describe('TagCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = new AssetClass({
      name: 'test',
      width: 16,
      height: 16,
      perspective: 'flat',
      palette: [[0, 0, 0, 0]],
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
  });

  it('execute→undo restores empty tag list', () => {
    const cmd = new TagCommand(asset, () => {
      asset.addTag({ name: 'idle', type: 'frame', start: 0, end: 1, direction: 'forward' });
    });

    expect(asset.tags.length).toBe(0);
    cmd.execute();
    expect(asset.tags.length).toBe(1);
    cmd.undo();
    expect(asset.tags.length).toBe(0);
  });

  it('execute→undo→redo produces same tag', () => {
    const cmd = new TagCommand(asset, () => {
      asset.addTag({
        name: 'walk',
        type: 'frame',
        start: 0,
        end: 3,
        direction: 'ping_pong',
        facing: 'S',
      });
    });

    cmd.execute();
    const afterTags = JSON.stringify(asset.tags);
    cmd.undo();
    cmd.execute();
    expect(JSON.stringify(asset.tags)).toBe(afterTags);
  });

  it('undoes tag removal', () => {
    asset.addTag({ name: 'idle', type: 'frame', start: 0, end: 1, direction: 'forward' });

    const cmd = new TagCommand(asset, () => {
      asset.removeTag('idle');
    });

    expect(asset.tags.length).toBe(1);
    cmd.execute();
    expect(asset.tags.length).toBe(0);
    cmd.undo();
    expect(asset.tags.length).toBe(1);
    expect(asset.tags[0].name).toBe('idle');
  });

  it('preserves tag properties including facing and direction through undo', () => {
    const cmd = new TagCommand(asset, () => {
      asset.addTag({
        name: 'attack',
        type: 'frame',
        start: 2,
        end: 3,
        direction: 'forward',
        facing: 'NE',
      });
    });

    cmd.execute();
    cmd.undo();
    cmd.execute();
    const tag = asset.tags[0];
    expect(tag.name).toBe('attack');
    expect(tag.type === 'frame' && tag.start).toBe(2);
    expect(tag.type === 'frame' && tag.end).toBe(3);
    expect(tag.type === 'frame' && tag.direction).toBe('forward');
    expect(tag.type === 'frame' && tag.facing).toBe('NE');
  });

  it('undoes layer tag operations', () => {
    asset.addLayer({ name: 'overlay', type: 'image', visible: true, opacity: 255 });
    const overlayId = asset.layers[1].id;

    const cmd = new TagCommand(asset, () => {
      asset.addTag({ name: 'armor', type: 'layer', layers: [1, overlayId] });
    });

    cmd.execute();
    expect(asset.tags.length).toBe(1);
    expect(asset.tags[0].name).toBe('armor');
    cmd.undo();
    expect(asset.tags.length).toBe(0);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new TagCommand(asset, () => {
      asset.addTag({ name: 'idle', type: 'frame', start: 0, end: 1, direction: 'forward' });
    });

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect(asset.tags.length).toBe(1);
      cmd.undo();
      expect(asset.tags.length).toBe(0);
    }
  });
});
