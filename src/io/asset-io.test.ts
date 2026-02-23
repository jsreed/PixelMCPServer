import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { loadAssetFile, saveAssetFile, type AssetFileEnvelope } from './asset-io.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';
import { type Palette } from '../types/palette.js';
import { type Direction } from '../types/tag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '__fixtures__');

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

    // --- Fixture-based tests ---

    describe('fixture: valid-asset.json', () => {
        it('loads and parses all expected fields', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded.name).toBe('hero_sprite');
            expect(loaded.width).toBe(32);
            expect(loaded.height).toBe(32);
            expect(loaded.perspective).toBe('flat');
        });

        it('strips envelope fields', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded).not.toHaveProperty('pixelmcp_version');
            expect(loaded).not.toHaveProperty('created');
            expect(loaded).not.toHaveProperty('modified');
        });

        it('parses palette with correct length and colors', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded.palette).toHaveLength(5);
            expect(loaded.palette[0]).toEqual([0, 0, 0, 0]);
            expect(loaded.palette[4]).toEqual([255, 255, 255, 255]);
        });

        it('parses all three layer types', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded.layers).toHaveLength(3);
            expect(loaded.layers[0].type).toBe('image');
            expect(loaded.layers[1].type).toBe('image');
            expect(loaded.layers[2].type).toBe('shape');
            expect(loaded.layers[1].opacity).toBe(200);
            expect(loaded.layers[2].visible).toBe(false);
        });

        it('parses frames with varying durations', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded.frames).toHaveLength(3);
            expect(loaded.frames[2].duration_ms).toBe(150);
        });

        it('parses all cel types: image, linked, shape', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            // Image cel with origin offset
            const imgCel = loaded.cels['2/0'] as any;
            expect(imgCel.x).toBe(2);
            expect(imgCel.y).toBe(2);
            expect(imgCel.data).toEqual([[2, 3], [3, 4]]);

            // Linked cel
            const linkedCel = loaded.cels['2/1'] as any;
            expect(linkedCel.link).toBe('2/0');

            // Shape cel
            const shapeCel = loaded.cels['3/0'] as any;
            expect(shapeCel.shapes).toHaveLength(1);
            expect(shapeCel.shapes[0].type).toBe('rect');
        });

        it('parses frame tags, layer tags, and facing', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));

            expect(loaded.tags).toHaveLength(3);

            const idle = loaded.tags[0] as any;
            expect(idle.type).toBe('frame');
            expect(idle.name).toBe('idle');
            expect(idle.direction).toBe('forward');

            const attack = loaded.tags[1] as any;
            expect(attack.facing).toBe('right');

            const layerTag = loaded.tags[2] as any;
            expect(layerTag.type).toBe('layer');
            expect(layerTag.layers).toEqual([1, 2]);
        });

        it('can be constructed into AssetClass', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));
            const asset = new AssetClass(loaded);

            expect(asset.name).toBe('hero_sprite');
            expect(asset.width).toBe(32);
            expect(asset.layers).toHaveLength(3);
            expect(asset.frames).toHaveLength(3);
        });

        it('save→reload roundtrip preserves all data', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));
            const outPath = path.join(tempDir, 'roundtrip.json');

            await saveAssetFile(outPath, loaded);
            const reloaded = await loadAssetFile(outPath);

            expect(reloaded).toEqual(loaded);
        });
    });

    describe('fixture: valid-asset-tileset.json', () => {
        it('loads tileset-specific fields', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset-tileset.json'));

            expect(loaded.tile_width).toBe(16);
            expect(loaded.tile_height).toBe(16);
            expect(loaded.tile_count).toBe(8);
        });

        it('parses tile_physics with polygon and navigation data', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset-tileset.json'));

            expect(loaded.tile_physics).toBeDefined();
            expect(loaded.tile_physics!.physics_layers).toHaveLength(1);
            expect(loaded.tile_physics!.tiles['0'].polygon).toEqual([[0, 0], [16, 0], [16, 16], [0, 16]]);
            expect(loaded.tile_physics!.tiles['3'].navigation_polygon).toBeDefined();
        });

        it('parses tile_terrain with peering bits', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset-tileset.json'));

            expect(loaded.tile_terrain).toBeDefined();
            expect(loaded.tile_terrain!.pattern).toBe('blob47');
            expect(loaded.tile_terrain!.terrain_name).toBe('grass');
            expect(loaded.tile_terrain!.peering_bits['0'].top).toBe(0);
            expect(loaded.tile_terrain!.peering_bits['1'].top).toBe(-1);
        });

        it('save→reload roundtrip preserves tileset metadata', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset-tileset.json'));
            const outPath = path.join(tempDir, 'tileset-rt.json');

            await saveAssetFile(outPath, loaded);
            const reloaded = await loadAssetFile(outPath);

            expect(reloaded).toEqual(loaded);
        });
    });

    describe('AssetClass toJSON→save→load roundtrip', () => {
        it('preserves asset after class mutations', async () => {
            const loaded = await loadAssetFile(path.join(FIXTURES, 'valid-asset.json'));
            const asset = new AssetClass(loaded);

            // Mutate the asset
            asset.addLayer({ name: 'overlay', type: 'image', visible: true, opacity: 128 });
            asset.setCel(asset.layers[3].id, 0, { x: 0, y: 0, data: [[4, 4], [4, 4]] });

            // Serialize, save, reload
            const json = asset.toJSON();
            const outPath = path.join(tempDir, 'mutated.json');
            await saveAssetFile(outPath, json);
            const reloaded = await loadAssetFile(outPath);

            expect(reloaded.layers).toHaveLength(4);
            expect(reloaded.layers[3].name).toBe('overlay');
            expect((reloaded.cels[`${String(asset.layers[3].id)}/0`] as any).data).toEqual([[4, 4], [4, 4]]);
        });
    });
});
