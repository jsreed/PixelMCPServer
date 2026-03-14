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
const TEST_DIR = path.resolve(__dirname, '../__test__out__export');

function getGifInfo(buffer: Buffer) {
  let frameCount = 0;
  const delays: number[] = [];
  for (let i = 0; i < buffer.length - 8; i++) {
    if (buffer[i] === 0x21 && buffer[i + 1] === 0xf9 && buffer[i + 2] === 0x04) {
      frameCount++;
      const delay = buffer.readUInt16LE(i + 4) * 10;
      delays.push(delay);
    }
  }
  return { frameCount, delays };
}

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
        { index: 2, duration_ms: 100 },
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
        {
          type: 'frame' as const,
          name: 'ping',
          start: 0,
          end: 2,
          direction: 'ping_pong' as const,
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
        '1/2': {
          x: 0,
          y: 0,
          data: [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [1, 1, 1, 1],
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
    const info = getGifInfo(data);
    expect(info.frameCount).toBe(3);
    expect(info.delays).toEqual([100, 100, 100]);
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
    expect(png.width).toBe(12); // 4px * 3 frames
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
        extrude: true,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported atlas');
    const parsed = JSON.parse(result.content[0].text) as { regions: Array<unknown> };
    expect(parsed.regions.length).toBe(1);

    const png = PNG.sync.read(fs.readFileSync(outPath));
    expect(png.width).toBeGreaterThanOrEqual(6);
    expect(png.height).toBeGreaterThanOrEqual(6);
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

    expect(result.content[0].text).toContain('Exported 2 tag sequences');

    // Pattern uses "{name}_{tag}_{direction}.png" with separator-drop for missing direction:
    // idle tag has facing='S' => test_asset_idle_S.png
    // ping tag has no facing  => direction token empty => separator dropped => test_asset_ping.png
    const pngPath1 = path.join(outDir, 'test_asset_idle_S.png');
    const pngPath2 = path.join(outDir, 'test_asset_ping.png');
    expect(fs.existsSync(pngPath1)).toBe(true);
    expect(fs.existsSync(pngPath2)).toBe(true);

    const png1 = PNG.sync.read(fs.readFileSync(pngPath1));
    expect(png1.width).toBe(8); // 2 frames from tag 0-1
    expect(png1.height).toBe(4);

    const png2 = PNG.sync.read(fs.readFileSync(pngPath2));
    expect(png2.width).toBe(16); // ping-pong expands 0-2 to [0, 1, 2, 1] = 4 frames
    expect(png2.height).toBe(4);
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
    expect(tresData).toContain('"name": &"ping"'); // The extra ping_pong tag
    expect(tresData).toContain('"speed": 10.00'); // 1000 / 100 = 10 fps

    const expectedPingFrames = `"frames": [{
"duration": 1.0,
"texture": SubResource("AtlasTexture_f0")
}, {
"duration": 1.0,
"texture": SubResource("AtlasTexture_f1")
}, {
"duration": 1.0,
"texture": SubResource("AtlasTexture_f2")
}, {
"duration": 1.0,
"texture": SubResource("AtlasTexture_f1")
}],
"loop": true,
"name": &"ping"`;
    expect(tresData).toContain(expectedPingFrames);

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
      assetJson.tile_physics = {
        physics_layers: [{ collision_layer: 1, collision_mask: 1 }],
        tiles: {
          '0': {
            polygon: [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
            ],
          },
        },
      };
      assetJson.tile_terrain = {
        pattern: 'blob47',
        terrain_name: 'Grass',
        peering_bits: {
          '0': {
            top: 0,
            top_right: -1,
            right: -1,
            bottom_right: -1,
            bottom: 0,
            bottom_left: -1,
            left: -1,
            top_left: -1,
          },
        },
      };
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
    expect(tresData).toContain(
      'physics_layer_0/polygon_0/points = PackedVector2Array(0, 0, 2, 0, 2, 2, 0, 2)',
    );
    expect(tresData).toContain('0/terrain_set = 0');
    expect(tresData).toContain('0/terrains_peering_bit/top = 0');
    expect(tresData).toContain('0/terrains_peering_bit/bottom = 0');
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

  // ─── godot_ui_frame export ─────────────────────────────────────

  it('exports godot_ui_frame with PNG + import + tres', async () => {
    // Set nine_slice on the test asset
    const asset = workspace.loadedAssets.get('test_asset');
    if (!asset) throw new Error('test_asset not loaded');
    asset.nine_slice = { top: 1, right: 1, bottom: 1, left: 1 };

    const outPrefix = path.join(TEST_DIR, 'ui_frame');
    const result = await exportHandler(
      {
        action: 'godot_ui_frame',
        asset_name: 'test_asset',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported Godot UI frame');

    const parsed = JSON.parse(result.content[0].text) as { files: string[] };
    expect(parsed.files).toHaveLength(3);

    const pngPath = path.join(TEST_DIR, 'ui_frame.png');
    const importPath = pngPath + '.import';
    const tresPath = path.join(TEST_DIR, 'ui_frame.tres');

    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(importPath)).toBe(true);
    expect(fs.existsSync(tresPath)).toBe(true);

    const tresData = fs.readFileSync(tresPath, 'utf8');
    expect(tresData).toContain('type="StyleBoxTexture"');
  });

  it('godot_ui_frame errors when no nine_slice set', async () => {
    // test_asset has no nine_slice by default
    const asset = workspace.loadedAssets.get('test_asset');
    if (!asset) throw new Error('test_asset not loaded');
    asset.nine_slice = undefined;

    const outPrefix = path.join(TEST_DIR, 'ui_frame_no_ns');
    const result = await exportHandler(
      {
        action: 'godot_ui_frame',
        asset_name: 'test_asset',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    const parsed = result.content[0].text;
    expect(parsed).toContain('no nine_slice');
  });

  // ─── godot_atlas export ────────────────────────────────────────

  it('exports godot_atlas with PNG + import + tres', async () => {
    const outPrefix = path.join(TEST_DIR, 'godot_atlas');
    const result = await exportHandler(
      {
        action: 'godot_atlas',
        path: outPrefix,
        scale_factor: 1,
      },
      {} as unknown,
    );

    expect(result.content[0].text).toContain('Exported Godot atlas');

    const parsed = JSON.parse(result.content[0].text) as { files: string[] };
    expect(parsed.files).toHaveLength(3);

    const pngPath = path.join(TEST_DIR, 'godot_atlas.png');
    const importPath = pngPath + '.import';
    const tresPath = path.join(TEST_DIR, 'godot_atlas.tres');

    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.existsSync(importPath)).toBe(true);
    expect(fs.existsSync(tresPath)).toBe(true);

    const tresData = fs.readFileSync(tresPath, 'utf8');
    expect(tresData).toContain('type="AtlasTexture"');
    expect(tresData).toContain('test_asset');
  });

  // ─── E2E Tests ─────────────────────────────────────────────────

  describe('E2E', () => {
    it('UI frame workflow: create → set nine_slice → export → verify tres', async () => {
      // Set nine_slice on test_asset
      const asset = workspace.loadedAssets.get('test_asset');
      if (!asset) throw new Error('test_asset not loaded');
      asset.nine_slice = { top: 1, right: 1, bottom: 1, left: 1 };

      // Export godot_ui_frame
      const outPrefix = path.join(TEST_DIR, 'e2e_ui_frame');
      await exportHandler(
        {
          action: 'godot_ui_frame',
          asset_name: 'test_asset',
          path: outPrefix,
          scale_factor: 2,
        },
        {} as unknown,
      );

      // Verify .tres content has correct scaled margins
      const tresPath = path.join(TEST_DIR, 'e2e_ui_frame.tres');
      const tresData = fs.readFileSync(tresPath, 'utf8');
      expect(tresData).toContain('type="StyleBoxTexture"');
      expect(tresData).toContain('texture_margin_top = 2.0');    // 1 * 2
      expect(tresData).toContain('texture_margin_right = 2.0');
      expect(tresData).toContain('texture_margin_bottom = 2.0');
      expect(tresData).toContain('texture_margin_left = 2.0');
    });

    it('Icon atlas workflow: create 3 assets → export godot_atlas → verify tres', async () => {
      // Create 3 small icon assets and load them
      for (const name of ['icon_sword', 'icon_shield', 'icon_potion']) {
        const iconAsset = AssetClass.fromJSON({
          name,
          width: 4,
          height: 4,
          perspective: 'flat' as const,
          palette: Array.from({ length: 256 }, (_, i) => [i === 1 ? 255 : 0, 0, 0, i === 0 ? 0 : 255]),
          layers: [{ id: 1, name: 'layer1', type: 'image' as const, visible: true, opacity: 255 }],
          frames: [{ index: 0, duration_ms: 100 }],
          tags: [],
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
          },
        } as unknown as import('../types/asset.js').Asset);
        workspace.loadedAssets.set(name, iconAsset);
      }

      // Export godot_atlas
      const outPrefix = path.join(TEST_DIR, 'e2e_atlas');
      const result = await exportHandler(
        {
          action: 'godot_atlas',
          path: outPrefix,
          scale_factor: 1,
        },
        {} as unknown,
      );

      expect(result.content[0].text).toContain('Exported Godot atlas');

      // Verify .tres has sub-resources for all assets
      const tresPath = path.join(TEST_DIR, 'e2e_atlas.tres');
      const tresData = fs.readFileSync(tresPath, 'utf8');

      // Should contain AtlasTexture sub-resources for the loaded assets
      // The atlas packs all loaded assets, so at least 3 (our icons) + test_asset
      const atlasTextureMatches = tresData.match(/type="AtlasTexture"/g) ?? [];
      expect(atlasTextureMatches.length).toBeGreaterThanOrEqual(3);

      // Verify icon names appear (sanitized)
      expect(tresData).toContain('icon_sword');
      expect(tresData).toContain('icon_shield');
      expect(tresData).toContain('icon_potion');
    });
  });
});
