import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { CelWriteCommand } from './cel-write-command.js';

describe('CelWriteCommand', () => {
    let asset: AssetClass;

    beforeEach(() => {
        asset = new AssetClass({
            name: 'test',
            width: 4,
            height: 4,
            perspective: 'flat',
            palette: [[0, 0, 0, 0], [255, 0, 0, 255], [0, 255, 0, 255]],
            layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
            frames: [
                { index: 0, duration_ms: 100 },
                { index: 1, duration_ms: 100 },
            ],
            cels: {},
            tags: [],
        });
    });

    it('execute→undo restores undefined cel', () => {
        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[1, 1], [1, 1]] });
        });

        expect(asset.getCel(1, 0)).toBeUndefined();
        cmd.execute();
        expect(asset.getCel(1, 0)).toBeDefined();
        cmd.undo();
        expect(asset.getCel(1, 0)).toBeUndefined();
    });

    it('execute→undo→redo produces same pixel data', () => {
        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[1, 2], [2, 1]] });
        });

        cmd.execute();
        const afterData = JSON.stringify(asset.getCel(1, 0));
        cmd.undo();
        cmd.execute();
        expect(JSON.stringify(asset.getCel(1, 0))).toBe(afterData);
    });

    it('undoes overwrite of existing pixel data', () => {
        asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[2, 2], [2, 2]] });
        });

        cmd.execute();
        expect((asset.getCel(1, 0) as { data: number[][] }).data).toEqual([[2, 2], [2, 2]]);
        cmd.undo();
        expect((asset.getCel(1, 0) as { data: number[][] }).data).toEqual([[1]]);
    });

    it('undoes cel removal (defined→undefined)', () => {
        asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.removeCel(1, 0);
        });

        cmd.execute();
        expect(asset.getCel(1, 0)).toBeUndefined();
        cmd.undo();
        expect(asset.getCel(1, 0)).toBeDefined();
        expect((asset.getCel(1, 0) as { data: number[][] }).data).toEqual([[1]]);
    });

    it('does not affect cels on other layers or frames', () => {
        asset.setCel(1, 1, { x: 0, y: 0, data: [[2]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });
        });

        cmd.execute();
        cmd.undo();
        // Frame 1 cel should be untouched
        expect((asset.getCel(1, 1) as { data: number[][] }).data).toEqual([[2]]);
    });

    it('captures cel origin offset for undo', () => {
        asset.setCel(1, 0, { x: 2, y: 3, data: [[1]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[2, 2], [2, 2]] });
        });

        cmd.execute();
        expect((asset.getCel(1, 0) as { x: number }).x).toBe(0);
        cmd.undo();
        expect((asset.getCel(1, 0) as { x: number }).x).toBe(2);
        expect((asset.getCel(1, 0) as { y: number }).y).toBe(3);
    });

    it('multiple undo/redo cycles are idempotent', () => {
        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });
        });

        for (let i = 0; i < 3; i++) {
            cmd.execute();
            expect(asset.getCel(1, 0)).toBeDefined();
            cmd.undo();
            expect(asset.getCel(1, 0)).toBeUndefined();
        }
    });
});
