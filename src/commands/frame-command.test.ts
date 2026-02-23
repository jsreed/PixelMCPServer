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
            palette: [[0, 0, 0, 0], [255, 0, 0, 255]],
            layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
            frames: [
                { index: 0, duration_ms: 100 },
                { index: 1, duration_ms: 100 },
            ],
            cels: {
                '1/0': { x: 0, y: 0, data: [[1]] },
                '1/1': { x: 0, y: 0, data: [[1, 1]] },
            },
            tags: [
                { name: 'idle', type: 'frame', start: 0, end: 1, direction: 'forward' },
            ],
        });
    });

    it('execute→undo restores original frame count', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.addFrame({ index: 2, duration_ms: 150 });
        });

        expect(asset.frames.length).toBe(2);
        cmd.execute();
        expect(asset.frames.length).toBe(3);
        cmd.undo();
        expect(asset.frames.length).toBe(2);
    });

    it('execute→undo→redo produces same frame structure', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.addFrame({ index: 2, duration_ms: 150 });
        });

        cmd.execute();
        const afterFrames = JSON.stringify(asset.frames);
        cmd.undo();
        cmd.execute();
        expect(JSON.stringify(asset.frames)).toBe(afterFrames);
    });

    it('undoes frame removal and restores cels', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.removeFrame(1);
        });

        cmd.execute();
        expect(asset.frames.length).toBe(1);
        expect(asset.getCel(1, 1)).toBeUndefined();
        cmd.undo();
        expect(asset.frames.length).toBe(2);
        expect(asset.getCel(1, 1)).toBeDefined();
    });

    it('undoes frame removal and restores tag ranges', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.removeFrame(1);
        });

        cmd.execute();
        cmd.undo();
        // Tag range should be fully restored
        const tag = asset.tags[0];
        expect(tag.type === 'frame' && tag.end).toBe(1);
    });

    it('undoes duration change', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.setFrameDuration(0, 500);
        });

        expect(asset.frames[0].duration_ms).toBe(100);
        cmd.execute();
        expect(asset.frames[0].duration_ms).toBe(500);
        cmd.undo();
        expect(asset.frames[0].duration_ms).toBe(100);
    });

    it('multiple undo/redo cycles are idempotent', () => {
        const cmd = new FrameCommand(asset, () => {
            asset.addFrame({ index: 2, duration_ms: 200 });
        });

        for (let i = 0; i < 3; i++) {
            cmd.execute();
            expect(asset.frames.length).toBe(3);
            cmd.undo();
            expect(asset.frames.length).toBe(2);
        }
    });
});
