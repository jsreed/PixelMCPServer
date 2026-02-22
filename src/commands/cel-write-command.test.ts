import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { CelWriteCommand } from './cel-write-command.js';

describe('CelWriteCommand', () => {
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

    it('undoes pixel data changes from undefined to defined', () => {
        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });
        });

        expect(asset.getCel(1, 0)).toBeUndefined();
        cmd.execute();
        expect(asset.getCel(1, 0)).toBeDefined();
        cmd.undo();
        expect(asset.getCel(1, 0)).toBeUndefined();
        cmd.execute();
        expect(asset.getCel(1, 0)).toBeDefined();
    });

    it('undoes pixel data changes from defined to another defined state', () => {
        asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.setCel(1, 0, { x: 0, y: 0, data: [[2, 2]] });
        });

        expect((asset.getCel(1, 0) as any)?.data?.[0]?.[0]).toBe(1);
        cmd.execute();
        expect((asset.getCel(1, 0) as any)?.data?.[0]?.[0]).toBe(2);
        cmd.undo();
        expect((asset.getCel(1, 0) as any)?.data?.[0]?.[0]).toBe(1);
        cmd.execute();
        expect((asset.getCel(1, 0) as any)?.data?.[0]?.[0]).toBe(2);
    });

    it('undoes pixel data changes from defined to undefined', () => {
        asset.setCel(1, 0, { x: 0, y: 0, data: [[1]] });

        const cmd = new CelWriteCommand(asset, 1, 0, () => {
            asset.removeCel(1, 0);
        });

        expect(asset.getCel(1, 0)).toBeDefined();
        cmd.execute();
        expect(asset.getCel(1, 0)).toBeUndefined();
        cmd.undo();
        expect(asset.getCel(1, 0)).toBeDefined();
        cmd.execute();
        expect(asset.getCel(1, 0)).toBeUndefined();
    });
});
