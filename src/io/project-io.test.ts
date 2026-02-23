import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { loadProjectFile, saveProjectFile } from './project-io.js';
import { type ProjectConfig } from '../types/project.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '__fixtures__');

describe('project-io', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelmcp-project-io-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    function makeTestProject(): ProjectConfig {
        return {
            pixelmcp_version: '1.0',
            name: 'test_project',
            created: '2020-01-01T00:00:00.000Z',
            conventions: {
                export_pattern: '{name}_{tag}.png'
            },
            defaults: {
                tile_width: 16,
                tile_height: 16,
                export_scale: 1,
                palette: 'endesga-32'
            },
            assets: {
                'hero': { type: 'character', path: 'hero.json' },
                'sword': {
                    type: 'weapon',
                    variants: { 'standard': 'sword_std.json', 'large': 'sword_lrg.json' }
                }
            }
        };
    }

    it('roundtrips a project config', async () => {
        const filePath = path.join(tempDir, 'pixelmcp.json');
        const original = makeTestProject();

        await saveProjectFile(filePath, original);
        const loaded = await loadProjectFile(filePath);

        expect(loaded).toEqual(original);
    });

    it('adds created timestamp if missing on save', async () => {
        const filePath = path.join(tempDir, 'pixelmcp.json');
        const original = makeTestProject();
        delete original.created;

        await saveProjectFile(filePath, original);
        const loaded = await loadProjectFile(filePath);

        expect(loaded.created).toBeDefined();
        // The original should not be mutated
        expect(original.created).toBeUndefined();
    });

    it('throws domain error if file not found', async () => {
        const filePath = path.join(tempDir, 'nope.json');
        await expect(loadProjectFile(filePath)).rejects.toThrow("Project file not found");
    });

    it('throws on invalid JSON', async () => {
        const filePath = path.join(tempDir, 'bad.json');
        await fs.writeFile(filePath, 'foo bar');
        await expect(loadProjectFile(filePath)).rejects.toThrow("Invalid JSON");
    });

    it('throws on missing required fields', async () => {
        const filePath = path.join(tempDir, 'incomplete.json');
        await fs.writeFile(filePath, '{"pixelmcp_version":"1.0", "name": "foo"}');
        await expect(loadProjectFile(filePath)).rejects.toThrow("required Project format");
    });

    // --- Fixture-based tests ---

    describe('fixture: valid-project.json', () => {
        it('loads and parses all top-level fields', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));

            expect(loaded.pixelmcp_version).toBe('1.0');
            expect(loaded.name).toBe('dungeon_crawl');
            expect(loaded.created).toBe('2025-02-01T00:00:00.000Z');
        });

        it('parses conventions', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));

            expect(loaded.conventions).toBeDefined();
            expect(loaded.conventions!.export_pattern).toBe('{name}_{tag}_{direction}.png');
        });

        it('parses defaults', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));

            expect(loaded.defaults).toBeDefined();
            expect(loaded.defaults!.tile_width).toBe(16);
            expect(loaded.defaults!.tile_height).toBe(16);
            expect(loaded.defaults!.export_scale).toBe(2);
            expect(loaded.defaults!.palette).toBe('endesga-32');
        });

        it('parses path-based and variant-based asset entries', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));

            expect(Object.keys(loaded.assets)).toHaveLength(5);

            // Path-based
            expect(loaded.assets['hero'].type).toBe('character');
            expect(loaded.assets['hero'].path).toBe('assets/hero.json');

            // Variant-based
            expect(loaded.assets['armor'].type).toBe('equipment');
            expect(loaded.assets['armor'].variants).toBeDefined();
            expect(loaded.assets['armor'].variants!['standard']).toBe('assets/armor/standard.json');
            expect(loaded.assets['armor'].variants!['slim']).toBe('assets/armor/slim.json');
        });

        it('parses recolor_of field', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));

            expect(loaded.assets['hero_alt'].recolor_of).toBe('hero');
        });

        it('save→reload roundtrip preserves all data', async () => {
            const loaded = await loadProjectFile(path.join(FIXTURES, 'valid-project.json'));
            const outPath = path.join(tempDir, 'roundtrip.json');

            await saveProjectFile(outPath, loaded);
            const reloaded = await loadProjectFile(outPath);

            expect(reloaded).toEqual(loaded);
        });
    });
});
