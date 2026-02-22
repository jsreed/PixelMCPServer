import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadProjectFile, saveProjectFile } from './project-io.js';
import { type ProjectConfig } from '../types/project.js';

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
});
