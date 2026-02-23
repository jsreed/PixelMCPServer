import { describe, it, expect, beforeEach } from 'vitest';
import { AssetClass } from '../classes/asset.js';
import { ShapeCommand } from './shape-command.js';

describe('ShapeCommand', () => {
    let asset: AssetClass;
    let shapeLayerId: number;

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
            tags: [],
        });
        asset.addLayer({ name: 'hitboxes', type: 'shape', visible: true, opacity: 255, role: 'hitbox', physics_layer: 1 });
        shapeLayerId = asset.layers[1].id;
    });

    it('execute→undo restores empty shapes (undefined→defined)', () => {
        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.addShape(shapeLayerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });
        });

        expect(asset.getShapes(shapeLayerId, 0).length).toBe(0);
        cmd.execute();
        expect(asset.getShapes(shapeLayerId, 0).length).toBe(1);
        cmd.undo();
        expect(asset.getShapes(shapeLayerId, 0).length).toBe(0);
    });

    it('execute→undo→redo produces same shape data', () => {
        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.addShape(shapeLayerId, 0, { type: 'rect', name: 'body', x: 4, y: 2, width: 8, height: 12 });
        });

        cmd.execute();
        const afterShapes = JSON.stringify(asset.getShapes(shapeLayerId, 0));
        cmd.undo();
        cmd.execute();
        expect(JSON.stringify(asset.getShapes(shapeLayerId, 0))).toBe(afterShapes);
    });

    it('undoes shape geometry update', () => {
        asset.addShape(shapeLayerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });

        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.updateShape(shapeLayerId, 0, 'body', { type: 'rect', name: 'body', x: 5, y: 5, width: 20, height: 20 });
        });

        cmd.execute();
        expect((asset.getShapes(shapeLayerId, 0)[0] as { x: number }).x).toBe(5);
        cmd.undo();
        expect((asset.getShapes(shapeLayerId, 0)[0] as { x: number }).x).toBe(0);
    });

    it('undoes shape removal (defined→undefined)', () => {
        asset.addShape(shapeLayerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });

        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.removeCel(shapeLayerId, 0);
        });

        expect(asset.getShapes(shapeLayerId, 0).length).toBe(1);
        cmd.execute();
        expect(asset.getShapes(shapeLayerId, 0).length).toBe(0);
        cmd.undo();
        expect(asset.getShapes(shapeLayerId, 0).length).toBe(1);
    });

    it('undoes polygon shape add', () => {
        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.addShape(shapeLayerId, 0, {
                type: 'polygon',
                name: 'outline',
                points: [[0, 0], [10, 0], [10, 10], [0, 10]],
            });
        });

        cmd.execute();
        const shapes = asset.getShapes(shapeLayerId, 0);
        expect(shapes.length).toBe(1);
        expect(shapes[0].type).toBe('polygon');
        cmd.undo();
        expect(asset.getShapes(shapeLayerId, 0).length).toBe(0);
    });

    it('multiple undo/redo cycles are idempotent', () => {
        const cmd = new ShapeCommand(asset, shapeLayerId, 0, () => {
            asset.addShape(shapeLayerId, 0, { type: 'rect', name: 'body', x: 0, y: 0, width: 10, height: 10 });
        });

        for (let i = 0; i < 3; i++) {
            cmd.execute();
            expect(asset.getShapes(shapeLayerId, 0).length).toBe(1);
            cmd.undo();
            expect(asset.getShapes(shapeLayerId, 0).length).toBe(0);
        }
    });
});
