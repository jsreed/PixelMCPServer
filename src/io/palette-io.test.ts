import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadPaletteFile, savePaletteFile } from './palette-io.js';
import { type Palette, type Color } from '../types/palette.js';

describe('palette-io', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pixelmcp-palette-io-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('roundtrips a basic palette', async () => {
        const filePath = path.join(tempDir, 'base.json');
        const colors: Palette = [
            [0, 0, 0, 0],
            [255, 0, 0, 255],
            [0, 255, 0, 255]
        ];

        await savePaletteFile(filePath, 'test_palette', colors);
        const loaded = await loadPaletteFile(filePath);

        expect(loaded.name).toBe('test_palette');
        expect(loaded.colors).toEqual(colors);
    });

    it('roundtrips a sparse palette with nulls', async () => {
        const filePath = path.join(tempDir, 'sparse.json');
        const colors: Palette = [
            [0, 0, 0, 0],
            null,
            null,
            [0, 255, 0, 255]
        ];

        await savePaletteFile(filePath, 'sparse_palette', colors);
        const loaded = await loadPaletteFile(filePath);

        expect(loaded.colors).toEqual(colors);
    });

    it('throws domain error if file not found', async () => {
        const filePath = path.join(tempDir, 'nope.json');
        await expect(loadPaletteFile(filePath)).rejects.toThrow("Palette file not found");
    });

    it('throws on invalid JSON', async () => {
        const filePath = path.join(tempDir, 'bad.json');
        await fs.writeFile(filePath, '{ not json ]');
        await expect(loadPaletteFile(filePath)).rejects.toThrow("Invalid JSON");
    });

    it('throws on missing required object wrappers (name, colors)', async () => {
        const filePath = path.join(tempDir, 'incomplete.json');
        await fs.writeFile(filePath, '{"name":"foo"}'); // Missing colors array
        await expect(loadPaletteFile(filePath)).rejects.toThrow("required Palette format");
    });

    it('throws if colors array is too large (> 256)', async () => {
        const filePath = path.join(tempDir, 'toolarge.json');
        const colors = new Array<Color>(257).fill([255, 255, 255, 255]);

        // Save bypassing validation using raw fs:
        await fs.writeFile(filePath, JSON.stringify({ name: 'big', colors }));

        await expect(loadPaletteFile(filePath)).rejects.toThrow("required Palette format");
    });

    it('throws on invalid color format in array', async () => {
        const filePath = path.join(tempDir, 'bad_color.json');

        // E.g., not an array of 4, or values not 0-255
        const badColors = [
            [0, 0, 0, 0],
            [255, 0, 0] // Missing alpha
        ];
        await fs.writeFile(filePath, JSON.stringify({ name: 'bad_c', colors: badColors }));
        await expect(loadPaletteFile(filePath)).rejects.toThrow("required Palette format");

        const badColors2 = [
            [255, 255, 255, 255],
            [300, 0, 0, 0] // Value out of range
        ];
        await fs.writeFile(filePath, JSON.stringify({ name: 'bad_c2', colors: badColors2 }));
        await expect(loadPaletteFile(filePath)).rejects.toThrow("required Palette format");
    });

});
