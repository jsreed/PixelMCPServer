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
            palette: [[0, 0, 0, 0]],
            layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
            frames: [{ index: 0, duration_ms: 100 }],
            cels: {},
            tags: []
        });
    });

    it('undoes structural layer changes', () => {
        const cmd = new LayerCommand(asset, () => {
            asset.addLayer({ name: 'extra', type: 'image', visible: true, opacity: 255 });
        });

        expect(asset.layers.length).toBe(1);
        cmd.execute();
        expect(asset.layers.length).toBe(2);
        cmd.undo();
        expect(asset.layers.length).toBe(1);
        cmd.execute();
        expect(asset.layers.length).toBe(2);
    });
});
