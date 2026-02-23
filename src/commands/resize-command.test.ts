import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { ResizeCommand } from './resize-command.js';

describe('ResizeCommand', () => {
    let asset: AssetClass;

    beforeEach(() => {
        asset = new AssetClass({
            name: 'test',
            width: 8,
            height: 8,
            perspective: 'flat',
            palette: [[0, 0, 0, 0], [255, 0, 0, 255]],
            layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
            frames: [{ index: 0, duration_ms: 100 }],
            cels: {
                '1/0': {
                    x: 0,
                    y: 0,
                    data: [
                        [1, 1, 0, 0, 0, 0, 0, 0],
                        [1, 1, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                        [0, 0, 0, 0, 0, 0, 0, 0],
                    ],
                },
            },
            tags: [],
        });
    });

    it('execute→undo restores original dimensions', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(16, 16);
        });

        expect(asset.width).toBe(8);
        expect(asset.height).toBe(8);
        cmd.execute();
        expect(asset.width).toBe(16);
        expect(asset.height).toBe(16);
        cmd.undo();
        expect(asset.width).toBe(8);
        expect(asset.height).toBe(8);
    });

    it('execute→undo→redo produces same dimensions', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(32, 24);
        });

        cmd.execute();
        expect(asset.width).toBe(32);
        cmd.undo();
        cmd.execute();
        expect(asset.width).toBe(32);
        expect(asset.height).toBe(24);
    });

    it('restores cel pixel data on undo after grow', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(16, 16);
        });

        cmd.execute();
        cmd.undo();
        const cel = asset.getCel(1, 0) as { data: number[][] };
        expect(cel.data[0][0]).toBe(1);
        expect(cel.data[0][1]).toBe(1);
        expect(cel.data[1][0]).toBe(1);
        expect(cel.data.length).toBe(8);
        expect(cel.data[0].length).toBe(8);
    });

    it('restores cel pixel data on undo after shrink', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(4, 4);
        });

        cmd.execute();
        // After shrink, we lose data outside bounds
        cmd.undo();
        // Undo should fully restore original data
        const cel = asset.getCel(1, 0) as { data: number[][] };
        expect(cel.data.length).toBe(8);
        expect(cel.data[0].length).toBe(8);
        expect(cel.data[0][0]).toBe(1);
    });

    it('multiple undo/redo cycles are idempotent', () => {
        const cmd = new ResizeCommand(asset, () => {
            asset.resize(16, 16);
        });

        for (let i = 0; i < 3; i++) {
            cmd.execute();
            expect(asset.width).toBe(16);
            cmd.undo();
            expect(asset.width).toBe(8);
        }
    });
});
