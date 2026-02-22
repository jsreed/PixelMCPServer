import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadAssetFile, saveAssetFile, type AssetFileEnvelope } from './asset-io.js';
import { type Asset } from '../types/asset.js';
import { type Palette } from '../types/palette.js';
import { type Direction } from '../types/tag.js';

describe('asset-io', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelmcp-asset-io-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    function makeTestAsset(): Asset {
        return {
            name: 'test_asset',
            width: 16,
            height: 16,
            perspective: 'flat',
            palette: [[0, 0, 0, 0], [255, 0, 0, 255]] as Palette,
            layers: [
                { id: 0, name: 'img', type: 'image', visible: true, opacity: 255 },
                { id: 1, name: 'tm', type: 'tilemap', visible: true, opacity: 255 },
                { id: 2, name: 'sh', type: 'shape', visible: true, opacity: 255, role: 'hitbox', physics_layer: 1 }
            ],
            frames: [
                { index: 0, duration_ms: 100 },
                { index: 1, duration_ms: 100 }
            ],
            cels: {
                '0/0': { x: 0, y: 0, data: [[0, 1], [1, 0]] },
                '1/0': { grid: [[0, -1], [-1, 2]] },
                '2/0': { shapes: [{ name: 'box', type: 'rect', x: 0, y: 0, width: 10, height: 10 }] },
                '0/1': { link: '0/0' }
            },
            tags: [
                { type: 'frame', name: 'idle', start: 0, end: 1, direction: 'forward' as Direction }
            ]
        };
    }

    it('roundtrips an asset with all cel types', async () => {
        const filePath = path.join(tempDir, 'test.json');
        const original = makeTestAsset();

        await saveAssetFile(filePath, original);
        const loaded = await loadAssetFile(filePath);

        expect(loaded).toEqual(original);
    });

    it('roundtrips tileset fields', async () => {
        const filePath = path.join(tempDir, 'tileset.json');
        const original = makeTestAsset();
        original.tile_width = 16;
        original.tile_height = 16;
        original.tile_count = 5;
        original.tile_physics = {
            physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
            tiles: { '0': { polygon: [[0, 0], [16, 0], [16, 16], [0, 16]] } }
        };
        original.tile_terrain = {
            pattern: 'blob47',
            terrain_name: 'dirt',
            peering_bits: {
                '0': { top: -1, top_right: -1, right: -1, bottom_right: -1, bottom: -1, bottom_left: -1, left: -1, top_left: -1 }
            }
        };

        await saveAssetFile(filePath, original);
        const loaded = await loadAssetFile(filePath);

        expect(loaded).toEqual(original);
    });

    it('updates modified timestamp on save', async () => {
        const filePath = path.join(tempDir, 'time.json');
        const original = makeTestAsset();

        await saveAssetFile(filePath, original);
        const fileContent1 = await fs.readFile(filePath, 'utf8');
        const parsed1 = JSON.parse(fileContent1) as AssetFileEnvelope;

        // Arbitrary delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));

        await saveAssetFile(filePath, original, parsed1.created);
        const fileContent2 = await fs.readFile(filePath, 'utf8');
        const parsed2 = JSON.parse(fileContent2) as AssetFileEnvelope;

        expect(parsed2.created).toBe(parsed1.created);
        expect(parsed2.modified).not.toBe(parsed1.modified);
        expect(parsed2.pixelmcp_version).toBe('1.0');
    });

    it('throws domain error if file not found', async () => {
        const filePath = path.join(tempDir, 'nope.json');
        await expect(loadAssetFile(filePath)).rejects.toThrow("Asset file not found");
    });

    it('throws on invalid JSON', async () => {
        const filePath = path.join(tempDir, 'bad.json');
        await fs.writeFile(filePath, '{ not json ]');
        await expect(loadAssetFile(filePath)).rejects.toThrow("Invalid JSON");
    });

    it('throws on missing required fields', async () => {
        const filePath = path.join(tempDir, 'incomplete.json');
        await fs.writeFile(filePath, '{"pixelmcp_version":"1.0", "name": "foo"}');
        await expect(loadAssetFile(filePath)).rejects.toThrow("required Asset format");
    });

    it('strips envelope fields on load', async () => {
        const filePath = path.join(tempDir, 'envelope.json');
        const original = makeTestAsset();
        await saveAssetFile(filePath, original);

        const loaded = await loadAssetFile(filePath);

        expect(loaded).not.toHaveProperty('pixelmcp_version');
        expect(loaded).not.toHaveProperty('created');
        expect(loaded).not.toHaveProperty('modified');
    });

    it('throws on invalid cel structure (not an object)', async () => {
        const filePath = path.join(tempDir, 'bad_cel.json');
        const original = makeTestAsset() as any;
        original.cels['0/0'] = 'just a string'; // Invalid cel

        await saveAssetFile(filePath, original);
        await expect(loadAssetFile(filePath)).rejects.toThrow("required Asset format");
    });

    it('throws on cel with no valid discriminator (data/grid/shapes/link)', async () => {
        const filePath = path.join(tempDir, 'bad_cel2.json');
        const original = makeTestAsset() as any;
        original.cels['0/0'] = { x: 0, y: 0, wrongField: [] };

        await saveAssetFile(filePath, original);
        await expect(loadAssetFile(filePath)).rejects.toThrow("required Asset format");
    });

    it('retains explicit existingCreated timestamp even if altered in memory', async () => {
        const filePath = path.join(tempDir, 'timestamp.json');
        const original = makeTestAsset();

        // Save with a specific mock timestamp
        const mockTime = "2020-01-01T00:00:00Z";
        await saveAssetFile(filePath, original, mockTime);

        const fileContent = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(fileContent) as AssetFileEnvelope;

        expect(parsed.created).toBe(mockTime);
    });
});
