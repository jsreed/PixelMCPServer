import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { registerExportTool } from './export.js';
import { AssetClass } from '../classes/asset.js';
import { ProjectClass } from '../classes/project.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
// imported nothing from gifenc

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(__dirname, '../__test_out__');

describe('Export Tool', () => {
  let server: McpServer;
  let workspace: ReturnType<typeof getWorkspace>;
  let exportHandler: (
    args: Record<string, unknown>,
    extra: unknown,
  ) => Promise<{ content: { text: string }[] }>;

  beforeEach(() => {
    // Construct fake MCP server to capture the registered handler
    server = {
      registerTool: (
        _name: string,
        _opts: unknown,
        handler: (
          args: Record<string, unknown>,
          extra: unknown,
        ) => Promise<{ content: { text: string }[] }>,
      ) => {
        exportHandler = handler;
      },
    } as unknown as McpServer;

    workspace = getWorkspace();
    workspace.loadedAssets.clear();

    // Create a dummy project
    const project = ProjectClass.create(path.join(TEST_DIR, 'pixelmcp.json'), 'Test Project');
    workspace.project = project;

    // Create an asset with some content
    const assetData = {
      name: 'test_asset',
      width: 4,
      height: 4,
      perspective: 'flat' as const,
      palette: Array.from({ length: 256 }, (_, i) => [i === 1 ? 255 : 0, 0, 0, i === 0 ? 0 : 255]),
      layers: [{ id: 1, name: 'layer1', type: 'image' as const, visible: true, opacity: 255 }],
      frames: [
        { index: 0, duration_ms: 100 },
        { index: 1, duration_ms: 100 },
      ],
      tags: [
        {
          type: 'frame' as const,
          name: 'idle',
          start: 0,
          end: 1,
          direction: 'forward' as const,
          facing: 'S' as const,
        },
      ],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: [
            [1, 1, 0, 0],
            [1, 1, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
        },
        '1/1': {
          x: 0,
          y: 0,
          data: [
            [0, 0, 1, 1],
            [0, 0, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
        },
      },
    };
    workspace.loadedAssets.set(
      'test_asset',
      AssetClass.fromJSON(assetData as unknown as import('../types/asset.js').Asset),
    );

    registerExportTool(server);
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it('exports a single PNG correctly', async () => {
    const outPath = path.join(TEST_DIR, 'out.png');
    const result = await exportHandler(
      {
        action: 'png',
        asset_name: 'test_asset',
        path: outPath,
        scale_factor: 2,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported PNG');
    expect(fs.existsSync(outPath)).toBe(true);

    const data = fs.readFileSync(outPath);
    const png = PNG.sync.read(data);

    // Original uses scale_factor=2 on a 4x4 image
    expect(png.width).toBe(8);
    expect(png.height).toBe(8);

    // Pixel check (scaled index 1 color: [255, 0, 0, 255])
    // The top-left 2x2 of the original was red, so top-left 4x4 of the upscaled is red.
    const idx = (0 * png.width + 0) * 4;
    expect(png.data[idx]).toBe(255);
    expect(png.data[idx + 1]).toBe(0);
    expect(png.data[idx + 2]).toBe(0);
    expect(png.data[idx + 3]).toBe(255);
  });

  it('exports a GIF correctly', async () => {
    const outPath = path.join(TEST_DIR, 'out.gif');
    const result = await exportHandler(
      {
        action: 'gif',
        asset_name: 'test_asset',
        path: outPath,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported GIF');
    expect(fs.existsSync(outPath)).toBe(true);
    const data = fs.readFileSync(outPath);
    expect(data.length).toBeGreaterThan(0);
  });

  it('exports a spritesheet strip correctly', async () => {
    const outPath = path.join(TEST_DIR, 'strip.png');
    const result = await exportHandler(
      {
        action: 'spritesheet_strip',
        asset_name: 'test_asset',
        path: outPath,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported spritesheet strip');
    const png = PNG.sync.read(fs.readFileSync(outPath));
    expect(png.width).toBe(8); // 4px * 2 frames
    expect(png.height).toBe(4);
  });

  it('exports an atlas correctly', async () => {
    const outPath = path.join(TEST_DIR, 'atlas.png');
    const result = await exportHandler(
      {
        action: 'atlas',
        asset_name: 'test_asset', // Ignored really, because atlas takes from workspace
        path: outPath,
        scale_factor: 1,
        pad: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported atlas');
    const parsed = JSON.parse(result.content[0].text) as { regions: Array<unknown> };
    expect(parsed.regions.length).toBe(1);

    const png = PNG.sync.read(fs.readFileSync(outPath));
    expect(png.width).toBeGreaterThanOrEqual(4);
    expect(png.height).toBeGreaterThanOrEqual(4);
  });

  it('exports per_tag sequences correctly', async () => {
    const outDir = path.join(TEST_DIR, 'per_tag');
    const result = await exportHandler(
      {
        action: 'per_tag',
        asset_name: 'test_asset',
        path: outDir,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported 1 tag sequences');

    // Pattern uses "{name}_{tag}_{direction}.png" -> test_asset_idle_S.png
    const pngPath = path.join(outDir, 'test_asset_idle_S.png');
    expect(fs.existsSync(pngPath)).toBe(true);

    const png = PNG.sync.read(fs.readFileSync(pngPath));
    expect(png.width).toBe(8); // 2 frames from tag 0-1
    expect(png.height).toBe(4);
  });

  it('exports godot_spriteframes correctly', async () => {
    const outPrefix = path.join(TEST_DIR, 'godot_spriteframes');
    const result = await exportHandler(
      {
        action: 'godot_spriteframes',
        asset_name: 'test_asset',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported Godot SpriteFrames');

    const parsed = JSON.parse(result.content[0].text) as { files: string[] };
    expect(parsed.files).toHaveLength(3); // strip, import, tres

    const stripPath = outPrefix + '_strip.png';
    const importPath = stripPath + '.import';
    const tresPath = outPrefix + '.tres';

    expect(fs.existsSync(stripPath)).toBe(true);
    expect(fs.existsSync(importPath)).toBe(true);
    expect(fs.existsSync(tresPath)).toBe(true);

    const tresData = fs.readFileSync(tresPath, 'utf8');
    expect(tresData).toContain('[gd_resource type="SpriteFrames"');
    expect(tresData).toContain('"name": &"idle_S"'); // Uses facing tag S

    const importData = fs.readFileSync(importPath, 'utf8');
    expect(importData).toContain('[remap]');
    expect(importData).toContain('compress/mode=0');
  });

  it('exports godot_tileset correctly', async () => {
    // Add tileset metadata to the test asset by reloading it
    const assetJson = workspace.loadedAssets.get('test_asset')?.toJSON();
    if (assetJson) {
      assetJson.tile_width = 2;
      assetJson.tile_height = 2;
      assetJson.tile_count = 4;
      workspace.loadedAssets.set('test_asset', AssetClass.fromJSON(assetJson));
    }

    const outPrefix = path.join(TEST_DIR, 'godot_tileset');
    const result = await exportHandler(
      {
        action: 'godot_tileset',
        asset_name: 'test_asset',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported Godot TileSet');

    const parsed = JSON.parse(result.content[0].text) as { files: string[] };
    expect(parsed.files).toHaveLength(3);

    const pngPath = outPrefix + '.png';
    const importPath = pngPath + '.import';
    const tresPath = outPrefix + '.tres';

    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(importPath)).toBe(true);
    expect(fs.existsSync(tresPath)).toBe(true);

    const tresData = fs.readFileSync(tresPath, 'utf8');
    expect(tresData).toContain('[gd_resource type="TileSet"');
    expect(tresData).toContain('tile_size = Vector2i(2, 2)');
  });

  it('exports godot_static correctly', async () => {
    const outPrefix = path.join(TEST_DIR, 'godot_static');
    const result = await exportHandler(
      {
        action: 'godot_static',
        asset_name: 'test_asset',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported Godot Static PNG');

    const parsed = JSON.parse(result.content[0].text) as { files: string[] };
    expect(parsed.files).toHaveLength(2);

    const pngPath = outPrefix + '.png';
    const importPath = pngPath + '.import';

    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(importPath)).toBe(true);
  });
});
