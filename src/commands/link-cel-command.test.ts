import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { LinkCelCommand } from './link-cel-command.js';
import { packCelKey } from '../types/cel.js';

describe('LinkCelCommand', () => {
  let asset: AssetClass;

  beforeEach(() => {
    asset = new AssetClass({
      name: 'test',
      width: 4,
      height: 4,
      perspective: 'flat',
      palette: [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
      ],
      layers: [
        { id: 1, name: 'base', type: 'image', visible: true, opacity: 255 },
        { id: 2, name: 'tiles', type: 'tilemap', visible: true, opacity: 255 },
      ],
      frames: [
        { index: 0, duration_ms: 100 },
        { index: 1, duration_ms: 100 },
      ],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: [
            [1, 0],
            [0, 1],
          ],
        },
      },
      tags: [],
    });
  });

  it('execute creates a LinkedCel at the target position', () => {
    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();

    const raw = asset.cels[packCelKey(1, 1)];
    expect(raw).toBeDefined();
    expect('link' in raw).toBe(true);
    if ('link' in raw) {
      expect(raw.link).toBe('1/0');
    }
  });

  it('resolved cel after execute matches the source cel data', () => {
    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();

    const resolved = asset.getCel(1, 1);
    const source = asset.getCel(1, 0);
    expect(resolved).toEqual(source);
  });

  it('undo restores undefined when no cel existed before', () => {
    expect(asset.cels[packCelKey(1, 1)]).toBeUndefined();

    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();
    expect(asset.cels[packCelKey(1, 1)]).toBeDefined();

    cmd.undo();
    expect(asset.cels[packCelKey(1, 1)]).toBeUndefined();
  });

  it('undo restores original cel data when cel existed before', () => {
    const originalData = [
      [2, 2],
      [2, 2],
    ];
    asset.setCel(1, 1, { x: 0, y: 0, data: originalData });

    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();

    // Verify linked
    const raw = asset.cels[packCelKey(1, 1)];
    expect('link' in raw).toBe(true);

    cmd.undo();

    const restored = asset.getCel(1, 1);
    expect(restored).toBeDefined();
    if (restored !== undefined && 'data' in restored) {
      expect(restored.data).toEqual(originalData);
    } else {
      expect.fail('Expected restored cel to have pixel data');
    }
  });

  it('undo restores an existing linked cel that was replaced', () => {
    // Pre-existing link at 1/1 pointing to some other cel
    asset.setCel(1, 1, { link: '2/0' });

    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();

    const rawAfter = asset.cels[packCelKey(1, 1)];
    expect('link' in rawAfter).toBe(true);
    if ('link' in rawAfter) {
      expect(rawAfter.link).toBe('1/0');
    }

    cmd.undo();

    const rawRestored = asset.cels[packCelKey(1, 1)];
    expect('link' in rawRestored).toBe(true);
    if ('link' in rawRestored) {
      expect(rawRestored.link).toBe('2/0');
    }
  });

  it('execute→undo→redo produces the linked cel again', () => {
    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();
    cmd.undo();
    cmd.execute(); // redo

    const raw = asset.cels[packCelKey(1, 1)];
    expect('link' in raw).toBe(true);
    if ('link' in raw) {
      expect(raw.link).toBe('1/0');
    }
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      const raw = asset.cels[packCelKey(1, 1)];
      expect('link' in raw).toBe(true);

      cmd.undo();
      expect(asset.cels[packCelKey(1, 1)]).toBeUndefined();
    }
  });

  it('does not affect other cels on different layers/frames', () => {
    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);
    cmd.execute();
    cmd.undo();

    // Original source cel should be unchanged
    const source = asset.getCel(1, 0);
    expect(source).toBeDefined();
    if (source !== undefined && 'data' in source) {
      expect(source.data).toEqual([
        [1, 0],
        [0, 1],
      ]);
    } else {
      expect.fail('Expected source cel to have pixel data');
    }
  });

  it('snapshot isolation: modifying target after construction does not affect undo', () => {
    asset.setCel(1, 1, { x: 0, y: 0, data: [[3, 3]] });

    const cmd = new LinkCelCommand(asset, 1, 1, 1, 0);

    // Mutate the target cel after construction (before execute)
    asset.setCel(1, 1, { x: 5, y: 5, data: [[9, 9]] });

    cmd.execute();
    cmd.undo();

    // Should restore the snapshot taken at construction time (before the mutation)
    const restored = asset.getCel(1, 1);
    expect(restored).toBeDefined();
    if (restored !== undefined && 'data' in restored) {
      expect(restored.data).toEqual([[3, 3]]);
    } else {
      expect.fail('Expected restored cel to have pixel data');
    }
  });
});
