import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { FrameCommand } from './frame-command.js';

describe('FrameCommand', () => {
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

    it('undoes frame additions', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.addFrame({ index: 1, duration_ms: 150 });
        });

        expect(asset.frames.length).toBe(1);
        cmd.execute();
        expect(asset.frames.length).toBe(2);
        cmd.undo();
        expect(asset.frames.length).toBe(1);
        cmd.execute();
        expect(asset.frames.length).toBe(2);
    });
});
