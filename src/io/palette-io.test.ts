import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { loadPaletteFile, savePaletteFile } from './palette-io.js';
import { type Palette, type Color } from '../types/palette.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '__fixtures__');

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
      [0, 255, 0, 255],
    ];

    await savePaletteFile(filePath, 'test_palette', colors);
    const loaded = await loadPaletteFile(filePath);

    expect(loaded.name).toBe('test_palette');
    expect(loaded.colors).toEqual(colors);
  });

  it('roundtrips a sparse palette with nulls', async () => {
    const filePath = path.join(tempDir, 'sparse.json');
    const colors: Palette = [[0, 0, 0, 0], null, null, [0, 255, 0, 255]];

    await savePaletteFile(filePath, 'sparse_palette', colors);
    const loaded = await loadPaletteFile(filePath);

    expect(loaded.colors).toEqual(colors);
  });

  it('throws domain error if file not found', async () => {
    const filePath = path.join(tempDir, 'nope.json');
    await expect(loadPaletteFile(filePath)).rejects.toThrow('Palette file not found');
  });

  it('throws on invalid JSON', async () => {
    const filePath = path.join(tempDir, 'bad.json');
    await fs.writeFile(filePath, '{ not json ]');
    await expect(loadPaletteFile(filePath)).rejects.toThrow('Invalid JSON');
  });

  it('throws on missing required object wrappers (name, colors)', async () => {
    const filePath = path.join(tempDir, 'incomplete.json');
    await fs.writeFile(filePath, '{"name":"foo"}'); // Missing colors array
    await expect(loadPaletteFile(filePath)).rejects.toThrow('required Palette format');
  });

  it('throws if colors array is too large (> 256)', async () => {
    const filePath = path.join(tempDir, 'toolarge.json');
    const colors = new Array<Color>(257).fill([255, 255, 255, 255]);

    // Save bypassing validation using raw fs:
    await fs.writeFile(filePath, JSON.stringify({ name: 'big', colors }));

    await expect(loadPaletteFile(filePath)).rejects.toThrow('required Palette format');
  });

  it('throws on invalid color format in array', async () => {
    const filePath = path.join(tempDir, 'bad_color.json');

    // E.g., not an array of 4, or values not 0-255
    const badColors = [
      [0, 0, 0, 0],
      [255, 0, 0], // Missing alpha
    ];
    await fs.writeFile(filePath, JSON.stringify({ name: 'bad_c', colors: badColors }));
    await expect(loadPaletteFile(filePath)).rejects.toThrow('required Palette format');

    const badColors2 = [
      [255, 255, 255, 255],
      [300, 0, 0, 0], // Value out of range
    ];
    await fs.writeFile(filePath, JSON.stringify({ name: 'bad_c2', colors: badColors2 }));
    await expect(loadPaletteFile(filePath)).rejects.toThrow('required Palette format');
  });

  // --- Fixture-based tests ---

  describe('fixture: valid-palette.json', () => {
    it('loads and parses name and color count', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette.json'));

      expect(loaded.name).toBe('dungeon_16');
      expect(loaded.colors).toHaveLength(17);
    });

    it('parses first and last colors correctly', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette.json'));

      expect(loaded.colors[0]).toEqual([0, 0, 0, 0]);
      expect(loaded.colors[16]).toEqual([255, 255, 255, 255]);
    });

    it('all colors have valid RGBA tuples', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette.json'));

      for (const color of loaded.colors) {
        if (color === null) continue;
        expect(color).toHaveLength(4);
        for (const c of color) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    });

    it('save→reload roundtrip preserves all data', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette.json'));
      const outPath = path.join(tempDir, 'roundtrip.json');

      await savePaletteFile(outPath, loaded.name, loaded.colors);
      const reloaded = await loadPaletteFile(outPath);

      expect(reloaded).toEqual(loaded);
    });
  });

  describe('fixture: valid-palette-sparse.json', () => {
    it('loads sparse palette with null entries', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette-sparse.json'));

      expect(loaded.name).toBe('sparse_test');
      expect(loaded.colors).toHaveLength(7);
      expect(loaded.colors[1]).toBeNull();
      expect(loaded.colors[2]).toBeNull();
      expect(loaded.colors[4]).toBeNull();
    });

    it('non-null entries are valid colors', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette-sparse.json'));

      expect(loaded.colors[0]).toEqual([0, 0, 0, 0]);
      expect(loaded.colors[3]).toEqual([255, 0, 0, 255]);
      expect(loaded.colors[5]).toEqual([0, 255, 0, 255]);
      expect(loaded.colors[6]).toEqual([0, 0, 255, 255]);
    });

    it('save→reload roundtrip preserves null entries', async () => {
      const loaded = await loadPaletteFile(path.join(FIXTURES, 'valid-palette-sparse.json'));
      const outPath = path.join(tempDir, 'sparse-rt.json');

      await savePaletteFile(outPath, loaded.name, loaded.colors);
      const reloaded = await loadPaletteFile(outPath);

      expect(reloaded).toEqual(loaded);
    });
  });
});
