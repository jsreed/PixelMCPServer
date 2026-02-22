import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { ShapeCommand } from './shape-command.js';

describe('ShapeCommand', () => {
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

    it('undoes shape edits from undefined to defined', () => {
        asset.addLayer({ name: 'hitboxes', type: 'shape', visible: true, opacity: 255, role: 'hitbox', physics_layer: 1 });
        const layerId = asset.layers[1].id;

        const cmd = new ShapeCommand(asset, layerId, 0, () => {
            asset.addShape(layerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });
        });

        expect(asset.getShapes(layerId, 0).length).toBe(0);
        cmd.execute();
        expect(asset.getShapes(layerId, 0).length).toBe(1);
        cmd.undo();
        expect(asset.getShapes(layerId, 0).length).toBe(0);
        cmd.execute();
        expect(asset.getShapes(layerId, 0).length).toBe(1);
    });

    it('undoes shape edits from defined to another defined state', () => {
        asset.addLayer({ name: 'hitboxes', type: 'shape', visible: true, opacity: 255, role: 'hitbox', physics_layer: 1 });
        const layerId = asset.layers[1].id;
        asset.addShape(layerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });

        const cmd = new ShapeCommand(asset, layerId, 0, () => {
            asset.updateShape(layerId, 0, 'body', { type: 'rect', name: 'body', x: 5, y: 5, width: 20, height: 20 });
        });

        expect((asset.getShapes(layerId, 0)[0] as any).x).toBe(0);
        cmd.execute();
        expect((asset.getShapes(layerId, 0)[0] as any).x).toBe(5);
        cmd.undo();
        expect((asset.getShapes(layerId, 0)[0] as any).x).toBe(0);
        cmd.execute();
        expect((asset.getShapes(layerId, 0)[0] as any).x).toBe(5);
    });

    it('undoes shape edits from defined to undefined', () => {
        asset.addLayer({ name: 'hitboxes', type: 'shape', visible: true, opacity: 255, role: 'hitbox', physics_layer: 1 });
        const layerId = asset.layers[1].id;
        asset.addShape(layerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });

        const cmd = new ShapeCommand(asset, layerId, 0, () => {
            asset.removeCel(layerId, 0); // remove the entire cel
        });

        expect(asset.getShapes(layerId, 0).length).toBe(1);
        cmd.execute();
        expect(asset.getShapes(layerId, 0).length).toBe(0);
        cmd.undo();
        expect(asset.getShapes(layerId, 0).length).toBe(1);
        cmd.execute();
        expect(asset.getShapes(layerId, 0).length).toBe(0);
    });
});
