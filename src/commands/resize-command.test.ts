import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { ResizeCommand } from './resize-command.js';

describe('ResizeCommand', () => {
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

    it('undoes dimensional changes', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(32, 32);
        });

        expect(asset.width).toBe(16);
        cmd.execute();
        expect(asset.width).toBe(32);
        cmd.undo();
        expect(asset.width).toBe(16);
        cmd.execute();
        expect(asset.width).toBe(32);
    });
});
