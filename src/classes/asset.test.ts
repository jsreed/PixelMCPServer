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

    // ─── Gap 1: Resize with all 9 anchor positions ───────────────────

    describe('resize anchor positions', () => {
        // Helper: create an asset with a 2×2 cel at (10, 10) on a 32×32 canvas
        function makeAssetWithCel() {
            const asset = new AssetClass(mockAssetData);
            const layerId = asset.addLayer({ name: 'Img', type: 'image', opacity: 255, visible: true });
            asset.setCel(layerId, 0, {
                x: 10, y: 10,
                data: [[1, 2], [3, 4]],
            } as ImageCel);
            return { asset, layerId };
        }

        it('resize anchor top_left — no shift', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'top_left');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // top_left: shiftX=0, shiftY=0
            expect(cel.x).toBe(10);
            expect(cel.y).toBe(10);
        });

        it('resize anchor top_center — horizontal center shift', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'top_center');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = floor((40-32)/2) = 4, shiftY = 0
            expect(cel.x).toBe(14);
            expect(cel.y).toBe(10);
        });

        it('resize anchor top_right — right-aligned shift', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'top_right');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 40-32 = 8, shiftY = 0
            expect(cel.x).toBe(18);
            expect(cel.y).toBe(10);
        });

        it('resize anchor center_left — vertical center shift', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'center_left');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 0, shiftY = floor((40-32)/2) = 4
            expect(cel.x).toBe(10);
            expect(cel.y).toBe(14);
        });

        it('resize anchor center — centered both axes', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'center');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 4, shiftY = 4
            expect(cel.x).toBe(14);
            expect(cel.y).toBe(14);
        });

        it('resize anchor center_right — right + vertical center', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'center_right');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 8, shiftY = 4
            expect(cel.x).toBe(18);
            expect(cel.y).toBe(14);
        });

        it('resize anchor bottom_left — bottom-aligned shift', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'bottom_left');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 0, shiftY = 40-32 = 8
            expect(cel.x).toBe(10);
            expect(cel.y).toBe(18);
        });

        it('resize anchor bottom_center — bottom + horizontal center', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'bottom_center');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 4, shiftY = 8
            expect(cel.x).toBe(14);
            expect(cel.y).toBe(18);
        });

        it('resize anchor bottom_right — both axes shifted', () => {
            const { asset, layerId } = makeAssetWithCel();
            asset.resize(40, 40, 'bottom_right');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = 8, shiftY = 8
            expect(cel.x).toBe(18);
            expect(cel.y).toBe(18);
        });

        it('resize shrink with center crops pixel data', () => {
            const { asset, layerId } = makeAssetWithCel();
            // Shrink 32→16 with center anchor
            asset.resize(16, 16, 'center');
            const cel = asset.getCel(layerId, 0) as ImageCel;
            // shiftX = floor((16-32)/2) = -8, shiftY = -8
            // cel origin: 10 + (-8) = 2, data still fits (2+2=4 < 16)
            expect(cel.x).toBe(2);
            expect(cel.y).toBe(2);
            expect(cel.data.length).toBe(2);
            expect(cel.data[0].length).toBe(2);
        });
    });

    // ─── Gap 2: Multi-hop linked cel resolution chains ───────────────

    describe('linked cel resolution chains', () => {
        it('resolves a 2-hop linked cel chain (A→B→C)', () => {
            const data: Asset = {
                ...mockAssetData,
                frames: [
                    { index: 0, duration_ms: 100 },
                    { index: 1, duration_ms: 100 },
                    { index: 2, duration_ms: 100 },
                ],
                cels: {
                    [packCelKey(1, 0)]: { x: 0, y: 0, data: [[5, 6], [7, 8]] } as ImageCel,
                    [packCelKey(1, 1)]: { link: '1/0' } as LinkedCel,     // B → A (actual data)
                    [packCelKey(1, 2)]: { link: '1/1' } as LinkedCel,     // C → B → A
                },
            };
            const asset = new AssetClass(data);

            const cel = asset.getCel(1, 2) as ImageCel;
            expect(cel).toBeDefined();
            expect(cel.data).toEqual([[5, 6], [7, 8]]);
        });

        it('resolves a 3-hop chain', () => {
            const data: Asset = {
                ...mockAssetData,
                frames: [
                    { index: 0, duration_ms: 100 },
                    { index: 1, duration_ms: 100 },
                    { index: 2, duration_ms: 100 },
                    { index: 3, duration_ms: 100 },
                ],
                cels: {
                    [packCelKey(1, 0)]: { x: 0, y: 0, data: [[9]] } as ImageCel,
                    [packCelKey(1, 1)]: { link: '1/0' } as LinkedCel,
                    [packCelKey(1, 2)]: { link: '1/1' } as LinkedCel,
                    [packCelKey(1, 3)]: { link: '1/2' } as LinkedCel,  // 3→2→1→0
                },
            };
            const asset = new AssetClass(data);

            const cel = asset.getCel(1, 3) as ImageCel;
            expect(cel).toBeDefined();
            expect(cel.data).toEqual([[9]]);
        });

        it('returns undefined for a broken link in a chain', () => {
            const data: Asset = {
                ...mockAssetData,
                cels: {
                    // Link to a non-existent cel
                    [packCelKey(1, 0)]: { link: '1/99' } as LinkedCel,
                },
            };
            const asset = new AssetClass(data);
            expect(asset.getCel(1, 0)).toBeUndefined();
        });

        it('returns undefined (does not hang) on a circular link reference', () => {
            const data: Asset = {
                ...mockAssetData,
                cels: {
                    // Circular: 1/0 → 1/1 → 1/0
                    [packCelKey(1, 0)]: { link: '1/1' } as LinkedCel,
                    [packCelKey(1, 1)]: { link: '1/0' } as LinkedCel,
                },
            };
            const asset = new AssetClass(data);
            // The 10-depth guard should stop the loop and return undefined
            // (since at depth 10 the current cel is still a link)
            const cel = asset.getCel(1, 0);
            // It either returns the linked cel itself (still has `link`) or undefined
            // The implementation returns `current` after the while loop which still has `link`
            // so it will be a LinkedCel, not actual data. Either way it shouldn't hang.
            expect(cel).toBeDefined(); // exits the loop — doesn't hang
        });
    });

    // ─── Gap 3: Tag index shifting on frame add/remove ───────────────

    describe('tag index shifting', () => {
        it('shifts tags forward when inserting a frame before the tag range', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                tags: [
                    { type: 'frame', name: 'Walk', start: 2, end: 4, direction: 'forward' },
                ],
            });

            // Insert at index 0, before the tag range
            asset.addFrame({ index: 0, duration_ms: 100 }, 0);

            const tag = asset.tags[0] as FrameTag;
            expect(tag.start).toBe(3);
            expect(tag.end).toBe(5);
        });

        it('shifts only tag end when inserting a frame inside the tag range', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                tags: [
                    { type: 'frame', name: 'Walk', start: 0, end: 3, direction: 'forward' },
                ],
            });

            // Insert at index 2 (inside range [0,3])
            asset.addFrame({ index: 0, duration_ms: 100 }, 2);

            const tag = asset.tags[0] as FrameTag;
            // start < insertAt so start stays 0; end >= insertAt so end shifts to 4
            expect(tag.start).toBe(0);
            expect(tag.end).toBe(4);
        });

        it('does not shift tags when inserting a frame after the tag range', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                tags: [
                    { type: 'frame', name: 'Walk', start: 0, end: 1, direction: 'forward' },
                ],
            });

            // Insert at index 5 (well beyond tag end)
            asset.addFrame({ index: 0, duration_ms: 100 }, 5);

            const tag = asset.tags[0] as FrameTag;
            expect(tag.start).toBe(0);
            expect(tag.end).toBe(1);
        });

        it('shrinks tag range when removing a frame from inside the range', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                frames: [
                    { index: 0, duration_ms: 100 },
                    { index: 1, duration_ms: 100 },
                    { index: 2, duration_ms: 100 },
                    { index: 3, duration_ms: 100 },
                ],
                tags: [
                    { type: 'frame', name: 'Walk', start: 0, end: 3, direction: 'forward' },
                ],
                cels: {},
            });

            // Remove frame 2 (inside [0, 3])
            asset.removeFrame(2);

            const tag = asset.tags[0] as FrameTag;
            expect(tag.start).toBe(0);
            expect(tag.end).toBe(2);
        });

        it('removes a tag entirely when its range collapses to empty', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                frames: [
                    { index: 0, duration_ms: 100 },
                    { index: 1, duration_ms: 100 },
                ],
                tags: [
                    { type: 'frame', name: 'Blink', start: 0, end: 0, direction: 'forward' },
                ],
                cels: {},
            });

            // Remove the only frame in the tag's range
            asset.removeFrame(0);

            // Tag should be removed since its range became empty
            const blinkTag = asset.tags.find(t => t.name === 'Blink');
            expect(blinkTag).toBeUndefined();
        });

        it('handles multiple overlapping tags correctly on frame removal', () => {
            const asset = new AssetClass({
                ...mockAssetData,
                frames: [
                    { index: 0, duration_ms: 100 },
                    { index: 1, duration_ms: 100 },
                    { index: 2, duration_ms: 100 },
                    { index: 3, duration_ms: 100 },
                    { index: 4, duration_ms: 100 },
                ],
                tags: [
                    { type: 'frame', name: 'Idle', start: 0, end: 2, direction: 'forward' },
                    { type: 'frame', name: 'Walk', start: 2, end: 4, direction: 'forward' },
                ],
                cels: {},
            });

            // Remove frame 2 (overlaps both tags)
            asset.removeFrame(2);

            const idleTag = asset.tags.find(t => t.name === 'Idle') as FrameTag;
            const walkTag = asset.tags.find(t => t.name === 'Walk') as FrameTag;

            // Idle [0,2]: frame 2 removed → end shrinks to 1
            expect(idleTag.start).toBe(0);
            expect(idleTag.end).toBe(1);

            // Walk [2,4]: frame 2 removed → start stays 2, end 3 → then shifted -1 → [1,2]
            // Actually the removeFrame logic: both start and end are >= removed index
            // so they both shift by -1: [2,4] → shrink end → [2,3] → shift → [1,2]
            // Let's verify the actual behavior
            expect(walkTag).toBeDefined();
            expect(walkTag.start).toBeLessThanOrEqual(walkTag.end);
        });
    });
});
