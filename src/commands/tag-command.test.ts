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
            frames: [{ index: 0, duration_ms: 100 }],
            cels: {},
            tags: []
        });
    });

    it('undoes tag mutations', () => {
        const cmd = new TagCommand(asset, () => {
            asset.addTag({ name: 'idle', type: 'frame', start: 0, end: 0, direction: 'forward' });
        });

        expect(asset.tags.length).toBe(0);
        cmd.execute();
        expect(asset.tags.length).toBe(1);
        cmd.undo();
        expect(asset.tags.length).toBe(0);
        cmd.execute();
        expect(asset.tags.length).toBe(1);
    });
});
