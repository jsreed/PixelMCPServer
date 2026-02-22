import { describe, it, expect } from 'vitest';
import { AssetClass } from './asset.js';
import { type Asset } from '../types/asset.js';
import { type FrameTag } from '../types/tag.js';
import { type Shape, type RectShape } from '../types/shape.js';
import { packCelKey, type TilemapCel, type LinkedCel, type ImageCel } from '../types/cel.js';

const mockAssetData: Asset = {
    name: 'test_asset',
    width: 32,
    height: 32,
    perspective: 'flat',
    palette: Array.from({ length: 256 }, () => [0, 0, 0, 0] as [number, number, number, number]),
    layers: [
        { id: 1, name: 'Background', type: 'image', opacity: 255, visible: true },
        { id: 2, name: 'Characters', type: 'group', opacity: 255, visible: true },
        { id: 3, name: 'Hero', type: 'image', opacity: 255, visible: true }
    ],
    frames: [
        { index: 0, duration_ms: 100 },
        { index: 1, duration_ms: 100 }
    ],
    tags: [
        { type: 'frame', name: 'Idle', start: 0, end: 1, direction: 'forward' }
    ],
    cels: {
        [packCelKey(1, 0)]: { grid: [] } as TilemapCel,
        [packCelKey(3, 0)]: { grid: [] } as TilemapCel,
        [packCelKey(3, 1)]: { link: '3/0' } as LinkedCel
    }
};

describe('AssetClass', () => {
    it('initializes from data without mutating original', () => {
        const data = JSON.parse(JSON.stringify(mockAssetData)) as Asset;
        const asset = new AssetClass(data);

        expect(asset.name).toBe('test_asset');
        expect(asset.layers.length).toBe(3);
        expect(asset.isDirty).toBe(false);

        // Mutate asset, original data shouldn't change
        asset.addLayer({ name: 'New', type: 'image', opacity: 255, visible: true });
        expect(asset.layers.length).toBe(4);
        expect(data.layers.length).toBe(3);
    });

    it('resolves linked cels recursively', () => {
        const asset = new AssetClass(mockAssetData);
        const resolvedCel = asset.getCel(3, 1);

        // It should resolve the linked cel to the actual image cel on frame 0
        expect(resolvedCel).toBeDefined();
        // Check grid instead of data since mock is tilemap shape
        expect(resolvedCel).toHaveProperty('grid');
    });

    it('removes a layer and its cels', () => {
        const asset = new AssetClass({ ...mockAssetData, cels: { ...mockAssetData.cels } });

        asset.removeLayer(2);
        expect(asset.layers.length).toBe(2);

        // Remove layer 3 which has cels
        asset.removeLayer(3);

        // Associated cels should be gone
        expect(asset.getCel(3, 0)).toBeUndefined();
        expect(asset.getCel(1, 0)).toBeDefined();

        expect(asset.isDirty).toBe(true);
    });

    it('removes a frame and shifts tags and cels', () => {
        const asset = new AssetClass({ ...mockAssetData, tags: [...mockAssetData.tags], cels: { ...mockAssetData.cels } });

        // Add a frame so we have 3
        asset.addFrame({ index: 2, duration_ms: 150 });
        expect(asset.frames.length).toBe(3);

        // Tag was 0-1, shouldn't change yet
        const initialTag = asset.tags[0] as FrameTag;
        expect(initialTag.start).toBe(0);
        expect(initialTag.end).toBe(1);

        // Remove frame 0
        asset.removeFrame(0);

        expect(asset.frames.length).toBe(2);

        // Tag 'Idle' should now cover frame 0 (previously frame 1)
        const shiftedTag = asset.tags[0] as FrameTag;
        expect(shiftedTag.start).toBe(0);
        expect(shiftedTag.end).toBe(0);

        // Frame 0 was deleted. The linked cel at layer 3, frame 1 originally 
        // pointed to layer 3, frame 0. When frame 0 is deleted, that linked cel
        // loses its source and is deleted by removeFrame logic. 
        // The former frame 2 (now frame 1) has no cel for layer 3.
        // Let's just assert the link was removed because its source was deleted!
        const celAtFrame0 = asset.getCel(3, 0); // this is the shifted former frame 1
        expect(celAtFrame0).toBeUndefined();

        expect(asset.isDirty).toBe(true);
    });

    it('reorders layers correctly', () => {
        const asset = new AssetClass(mockAssetData);
        asset.reorderLayer(1, undefined, 0);

        expect(asset.layers[0].id).toBe(1);
    });

    it('toJSON serializes correctly', () => {
        const asset = new AssetClass(mockAssetData);
        asset.setPerspective('isometric');

        const json = asset.toJSON();
        expect(json.perspective).toBe('isometric');
        expect(json.palette.length).toBe(256);
    });

    it('supports addGroup and recursive removeLayer', () => {
        const asset = new AssetClass(mockAssetData);
        const parentId = asset.addGroup('ParentGroup');
        const childId = asset.addLayer({ name: 'ChildImage', type: 'image', opacity: 255, visible: true }, parentId);

        expect(asset.layers.find(l => l.id === childId)?.parent_id).toBe(parentId);

        asset.setCel(childId, 0, { grid: [] } as TilemapCel);
        expect(asset.getCel(childId, 0)).toBeDefined();

        asset.removeLayer(parentId);
        expect(asset.layers.find(l => l.id === parentId)).toBeUndefined();
        expect(asset.layers.find(l => l.id === childId)).toBeUndefined();
        expect(asset.getCel(childId, 0)).toBeUndefined();
    });

    it('reorders and reparents layers', () => {
        const asset = new AssetClass(mockAssetData);
        const group1 = asset.addGroup('Group1');
        const group2 = asset.addGroup('Group2');

        asset.reorderLayer(group2, group1, 0); // Move group2 into group1
        expect(asset.layers.find(l => l.id === group2)?.parent_id).toBe(group1);

        // Cyclic reparenting check: try to move group1 into its child group2
        expect(() => { asset.reorderLayer(group1, group2, 0); }).toThrow(/escendant/i);
    });

    it('removes a cel', () => {
        const asset = new AssetClass(mockAssetData);
        expect(asset.getCel(1, 0)).toBeDefined();
        asset.removeCel(1, 0);
        expect(asset.getCel(1, 0)).toBeUndefined();
    });

    it('updates a shape', () => {
        const asset = new AssetClass(mockAssetData);
        const shapeId = asset.addLayer({ name: 'Hitboxes', type: 'shape', opacity: 255, visible: true, role: 'hitbox' });

        const shapeDef: Shape = { type: 'rect', name: 'Hit', x: 0, y: 0, width: 10, height: 10 };
        asset.addShape(shapeId, 0, shapeDef);

        expect((asset.getShapes(shapeId, 0)[0] as RectShape).width).toBe(10);

        asset.updateShape(shapeId, 0, 'Hit', { ...shapeDef, width: 20 });
        expect((asset.getShapes(shapeId, 0)[0] as RectShape).width).toBe(20);
    });

    it('resizes canvas with anchors', () => {
        const asset = new AssetClass(mockAssetData);
        const layerId = asset.addLayer({ name: 'Img', type: 'image', opacity: 255, visible: true });

        asset.setCel(layerId, 0, {
            x: 10, y: 10,
            data: [
                [1, 1],
                [1, 1]
            ]
        } as ImageCel);

        asset.resize(40, 40, 'bottom_right');

        const cel = asset.getCel(layerId, 0) as ImageCel;
        expect(cel.x).toBe(18);
        expect(cel.y).toBe(18);
    });
});
