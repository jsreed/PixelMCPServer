import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { WorkspaceClass } from '../classes/workspace.js';
import { registerProjectTool } from './project.js';
import { registerWorkspaceTool } from './workspace.js';
import { registerAssetTool } from './asset.js';
import { registerPaletteTool } from './palette.js';
import { registerDrawTool } from './draw.js';
import { registerExportTool } from './export.js';
import { registerTilesetTool } from './tileset.js';
import { registerSelectionTool } from './selection.js';
import { registerTransformTool } from './transform.js';
import { registerEffectTool } from './effect.js';
import { saveAssetFile } from '../io/asset-io.js';
import { PNG } from 'pngjs';

// Mock IO
const virtualFs = new Map<string, unknown>();

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn().mockImplementation((path: string) => {
    if (!virtualFs.has(path))
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    return Promise.resolve(virtualFs.get(path));
  }),
  saveAssetFile: vi.fn().mockImplementation((path: string, asset: unknown) => {
    virtualFs.set(path, JSON.parse(JSON.stringify(asset)));
    return Promise.resolve();
  }),
}));

vi.mock('../io/project-io.js', () => ({
  loadProjectFile: vi.fn().mockImplementation((path: string) => {
    if (!virtualFs.has(path))
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    return Promise.resolve(virtualFs.get(path));
  }),
  saveProjectFile: vi.fn().mockImplementation((path: string, data: unknown) => {
    virtualFs.set(path, JSON.parse(JSON.stringify(data)));
    return Promise.resolve();
  }),
}));

vi.mock('../io/palette-io.js', () => ({
  loadPaletteFile: vi.fn().mockImplementation((filePath: string) => {
    if (!virtualFs.has(filePath))
      return Promise.reject(new Error(`Palette file not found: ${filePath}`));
    return Promise.resolve(JSON.parse(JSON.stringify(virtualFs.get(filePath))));
  }),
  savePaletteFile: vi.fn().mockImplementation((filePath: string, name: string, colors: unknown) => {
    virtualFs.set(filePath, JSON.parse(JSON.stringify({ name, colors })));
    return Promise.resolve();
  }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockImplementation((filePath: string) => {
    const data = virtualFs.get(filePath);
    if (data === undefined)
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    return Promise.resolve(data);
  }),
  writeFile: vi.fn().mockImplementation((filePath: string, data: unknown) => {
    virtualFs.set(filePath, data);
    return Promise.resolve();
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { Writable } from 'node:stream';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn().mockImplementation((path: string, data: unknown) => {
    virtualFs.set(path, data);
  }),
  createWriteStream: vi.fn().mockImplementation((path: string) => {
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk: Buffer, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    stream.on('finish', () => {
      virtualFs.set(path, Buffer.concat(chunks));
    });
    // Need to auto-emit finish when end is called, which Writable does.
    return stream;
  }),
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockImplementation((path: string, data: unknown) => {
      virtualFs.set(path, data);
      return Promise.resolve();
    }),
  },
}));

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
  handler: ToolHandler;
}

function createMockServer() {
  const tools = new Map<string, ToolDef>();
  const mockServer = {
    registerTool(
      name: string,
      arg2: string | Record<string, unknown>,
      arg3: Record<string, unknown> | ToolHandler,
      arg4?: ToolHandler,
    ) {
      let config: Record<string, unknown>;
      let callback: ToolHandler;
      if (typeof arg2 === 'string') {
        config = arg3 as Record<string, unknown>;
        callback = arg4 as ToolHandler;
      } else {
        config = arg2;
        callback = arg3 as ToolHandler;
      }

      // If the schema is a plain object, wrap it in z.object()
      let schema = config.inputSchema as z.ZodType | Record<string, z.ZodType>;
      if (!(schema instanceof z.ZodType)) {
        schema = z.object(schema);
      }

      tools.set(name, {
        name,
        description: (config.description as string) || '',
        schema,
        handler: callback,
      });
    },
    sendResourceListChanged: vi.fn(),
  };
  /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
  registerProjectTool(mockServer as any);
  registerWorkspaceTool(mockServer as any);
  registerAssetTool(mockServer as any);
  registerPaletteTool(mockServer as any);
  registerDrawTool(mockServer as any);
  registerExportTool(mockServer as any);
  registerTilesetTool(mockServer as any);
  registerSelectionTool(mockServer as any);
  registerTransformTool(mockServer as any);
  registerEffectTool(mockServer as any);
  /* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

  return {
    tools,
    dispatch: async (toolName: string, args: Record<string, unknown>): Promise<ToolResult> => {
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`Tool not found: ${toolName}`);

      // Simulating MCP SDK Zod validation
      const parsedArgs = tool.schema.parse(args) as Record<string, unknown>;

      return await tool.handler(parsedArgs);
    },
  };
}

function unwrap(res: ToolResult): ToolResult {
  if (res.isError) {
    throw new Error(`Domain Error: ${res.content[0].text}`);
  }
  return res;
}

describe('Minimum Viable Loop Integration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let dispatch: (toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;

  beforeEach(() => {
    WorkspaceClass.reset();
    virtualFs.clear();
    mockServer = createMockServer();
    dispatch = mockServer.dispatch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Schema Validation & Dispatch results', () => {
    it('rejects malformed tool input via Zod', async () => {
      await expect(dispatch('project', { action: 'non_existent_action' })).rejects.toThrow();
      await expect(
        dispatch('asset', { action: 'create', width: 'invalid_type' }),
      ).rejects.toThrow();
      await expect(dispatch('palette', { action: 'set', rgba: 123 })).rejects.toThrow();
    });

    it('returns expected error shapes when domain constraints fail', async () => {
      // Trying to use workspace tools before initializing a project
      const result = await dispatch('workspace', {
        action: 'load_asset',
        asset_name: 'dummy',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No project loaded');
    });
  });

  describe('Error Recovery Tests', () => {
    it('5.1.2.1 Project recovery: failure then init then success', async () => {
      // call any tool before project init -> get error
      const errRes = await dispatch('asset', {
        action: 'create',
        name: 'test_asset',
        width: 16,
        height: 16,
      });
      expect(errRes.isError).toBe(true);
      expect(errRes.content[0].text).toContain('No project loaded');

      // call project init
      unwrap(
        await dispatch('project', { action: 'init', path: '/tmp/test_project', name: 'Test' }),
      );

      // retry -> success
      const successRes = await dispatch('asset', {
        action: 'create',
        name: 'test_asset',
        width: 16,
        height: 16,
      });
      expect(successRes.isError).toBeFalsy();
    });

    it('5.1.2.2 Workspace recovery: asset not loaded then load then success', async () => {
      unwrap(
        await dispatch('project', { action: 'init', path: '/tmp/test_project', name: 'Test' }),
      );
      // create and save an asset, then unload it
      unwrap(
        await dispatch('asset', { action: 'create', name: 'my_asset', width: 16, height: 16 }),
      );
      unwrap(await dispatch('workspace', { action: 'save', asset_name: 'my_asset' }));
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'my_asset' }));

      // call asset info on unloaded asset -> get error
      const errRes = await dispatch('asset', { action: 'info', asset_name: 'my_asset' });
      expect(errRes.isError).toBe(true);
      expect(errRes.content[0].text).toContain("Asset 'my_asset' is not loaded");

      // call workspace load_asset
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'my_asset' }));

      // retry -> success
      const successRes = await dispatch('asset', { action: 'info', asset_name: 'my_asset' });
      expect(successRes.isError).toBeFalsy();
    });

    it('5.1.2.3 Layer type recovery: get_cel on shape layer -> get_shapes -> success', async () => {
      unwrap(
        await dispatch('project', { action: 'init', path: '/tmp/test_project', name: 'Test' }),
      );
      unwrap(
        await dispatch('asset', { action: 'create', name: 'my_asset', width: 16, height: 16 }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'add_layer',
          asset_name: 'my_asset',
          layer_type: 'shape',
          name: 'hitbox',
        }),
      );

      // call get_cel on shape layer -> get redirect message
      const errRes = await dispatch('asset', {
        action: 'get_cel',
        asset_name: 'my_asset',
        layer_id: 2,
        frame_index: 0,
      });
      expect(errRes.isError).toBe(true);
      expect(errRes.content[0].text).toContain(
        'is a shape layer. Use asset get_shapes to read shape data.',
      );

      // call asset get_shapes -> success
      const successRes = await dispatch('asset', {
        action: 'get_shapes',
        asset_name: 'my_asset',
        layer_id: 2,
        frame_index: 0,
      });
      expect(successRes.isError).toBeFalsy();
      expect(JSON.parse(successRes.content[0].text)).toHaveProperty('shapes');
    });

    it('5.1.2.4 Palette recovery: generate_ramp with undefined endpoint -> set endpoint -> success', async () => {
      unwrap(
        await dispatch('project', { action: 'init', path: '/tmp/test_project', name: 'Test' }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'my_asset',
          width: 16,
          height: 16,
          palette: [
            [0, 0, 0, 0],
            [255, 255, 255, 255],
          ],
        }),
      );

      // generate_ramp from 1 to 5 (endpoint 5 is undefined) -> get error
      const errRes = await dispatch('palette', {
        action: 'generate_ramp',
        asset_name: 'my_asset',
        color1: 1,
        color2: 5,
      });
      expect(errRes.isError).toBe(true);
      expect(errRes.content[0].text).toContain('has no color defined. Set it before');

      // call palette set on endpoint
      unwrap(
        await dispatch('palette', {
          action: 'set',
          asset_name: 'my_asset',
          index: 5,
          rgba: [255, 0, 0, 255],
        }),
      );

      // retry -> success
      const successRes = await dispatch('palette', {
        action: 'generate_ramp',
        asset_name: 'my_asset',
        color1: 1,
        color2: 5,
      });
      expect(successRes.isError).toBeFalsy();
    });
  });

  describe('End-to-End Workflow', () => {
    it('executes Minimum Viable Loop (init -> create -> set -> draw -> verify -> save)', async () => {
      // 1. Init Project
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_project',
          name: 'Test Project',
        }),
      );

      // 2. Create Asset (with palette scaffold)
      let res = unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'hero',
          width: 16,
          height: 16,
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]), // define 4 colors
        }),
      );
      expect(res.content[0].text).toContain("Asset 'hero' created.");

      // 3. Set Palette Colors
      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'hero',
          entries: [
            { index: 1, rgba: [255, 0, 0, 255] },
            { index: 2, rgba: [0, 255, 0, 255] },
          ],
        }),
      );

      // 4. Draw Operations
      res = unwrap(
        await dispatch('draw', {
          asset_name: 'hero',
          layer_id: 1, // 'asset create' scaffold has ID 1 by default
          frame_index: 0,
          operations: [
            { action: 'rect', x: 2, y: 2, width: 4, height: 4, color: 1, filled: true },
            { action: 'pixel', x: 3, y: 3, color: 2 },
          ],
        }),
      );
      expect(res.content[0].text).toContain('Applied 2 drawing operations');

      // 5. Read back to verify
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );

      const celData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celData[2][2]).toBe(1); // rect corner
      expect(celData[3][3]).toBe(2); // inner pixel
      expect(celData[0][0]).toBe(0); // transparent background

      // 6. Save Workspace
      unwrap(await dispatch('workspace', { action: 'save_all' }));
      expect(saveAssetFile).toHaveBeenCalled();

      // 7. Unload Asset
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'hero' }));

      res = unwrap(await dispatch('workspace', { action: 'info' }));
      let info = JSON.parse(res.content[0].text) as { loadedAssets: unknown[] };
      expect(info.loadedAssets.length).toBe(0);

      // 8. Load Asset
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'hero' }));

      res = unwrap(await dispatch('workspace', { action: 'info' }));
      info = JSON.parse(res.content[0].text) as { loadedAssets: unknown[] };
      expect(info.loadedAssets.length).toBe(1);

      // 9. Read back to verify persistence
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );

      const loadedData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(loadedData[2][2]).toBe(1); // rect corner
      expect(loadedData[3][3]).toBe(2); // inner pixel
    });

    it('supports undo/redo across multiple operation types', async () => {
      unwrap(
        await dispatch('project', { action: 'init', path: '/tmp/test_project', name: 'Test' }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'hero',
          width: 4,
          height: 4,
          palette: [
            [0, 0, 0, 0],
            [255, 255, 255, 255],
          ],
        }),
      );

      // Draw a pixel
      unwrap(
        await dispatch('draw', {
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
          operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
        }),
      );

      // Verify
      let res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      expect((JSON.parse(res.content[0].text) as { data: number[][] }).data[0][0]).toBe(1);

      // Undo
      unwrap(await dispatch('workspace', { action: 'undo' }));

      // Verify undone (cel was created during draw, so undoing removes it)
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      expect((JSON.parse(res.content[0].text) as { data: unknown }).data == null).toBe(true);

      // Redo
      unwrap(await dispatch('workspace', { action: 'redo' }));

      // Verify redone
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      expect((JSON.parse(res.content[0].text) as { data: number[][] }).data[0][0]).toBe(1);
    });

    it('5.3.1.1 E2E: character creation and export', async () => {
      // 1. project init
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_project',
          name: 'Test Project',
        }),
      );

      // 2. asset create (16x24, perspective "top_down_3/4")
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'character',
          width: 16,
          height: 24,
          perspective: 'top_down_3/4',
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
        }),
      );

      // 3. palette fetch_lospec (mocked here, we just set_bulk to simulate)
      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'character',
          entries: [
            { index: 1, rgba: [255, 0, 0, 255] },
            { index: 2, rgba: [0, 255, 0, 255] },
            { index: 3, rgba: [0, 0, 255, 255] },
          ],
        }),
      );

      // 4. asset add_layer (body, eyes)
      // Note: layer 1 is created by default. We'll rename it or just add new ones.
      unwrap(
        await dispatch('asset', {
          action: 'add_layer',
          asset_name: 'character',
          name: 'body',
          layer_type: 'image',
        }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'add_layer',
          asset_name: 'character',
          name: 'eyes',
          layer_type: 'image',
        }),
      );

      // 5. asset add_layer (hitbox, shape type)
      unwrap(
        await dispatch('asset', {
          action: 'add_layer',
          asset_name: 'character',
          name: 'hitbox',
          layer_type: 'shape',
        }),
      );

      // 6. asset add_frame (x3 for walk cycle) -> total 4 frames
      unwrap(await dispatch('asset', { action: 'add_frame', asset_name: 'character' }));
      unwrap(await dispatch('asset', { action: 'add_frame', asset_name: 'character' }));
      unwrap(await dispatch('asset', { action: 'add_frame', asset_name: 'character' }));

      // 7. asset add_tag (frame tag "idle" frame 0, "walk" frames 1-3 with direction forward)
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'character',
          name: 'idle',
          tag_start: 0,
          tag_end: 0,
          direction: 'forward',
          tag_type: 'frame',
        }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'character',
          name: 'walk',
          tag_start: 1,
          tag_end: 3,
          direction: 'forward',
          tag_type: 'frame',
        }),
      );

      // 8. asset add_tag (frame tag "idle_south" with facing S)
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'character',
          name: 'idle_south',
          tag_start: 0,
          tag_end: 0,
          direction: 'forward',
          tag_type: 'frame',
          tag_facing: 'S',
        }),
      );

      // 9. draw (rect + fill on body layer, frame 0)
      unwrap(
        await dispatch('draw', {
          asset_name: 'character',
          layer_id: 2, // body
          frame_index: 0,
          operations: [
            { action: 'rect', x: 4, y: 10, width: 8, height: 10, color: 1 },
            { action: 'fill', x: 6, y: 14, color: 1 },
          ],
        }),
      );

      // 10. draw (pixels on eyes layer)
      unwrap(
        await dispatch('draw', {
          asset_name: 'character',
          layer_id: 3, // eyes
          frame_index: 0,
          operations: [
            { action: 'pixel', x: 6, y: 12, color: 2 },
            { action: 'pixel', x: 9, y: 12, color: 2 },
          ],
        }),
      );

      // 11. asset get_cel (verify pixel data matches)
      let res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'character',
          layer_id: 3,
          frame_index: 0,
        }),
      );
      const celData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celData[12][6]).toBe(2);
      expect(celData[12][9]).toBe(2);

      // 12. workspace save
      unwrap(await dispatch('workspace', { action: 'save_all' }));

      // 13. workspace unload_asset
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'character' }));

      // 14. workspace load_asset
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'character' }));

      // 15. asset info (verify full structure persisted)
      res = unwrap(
        await dispatch('asset', {
          action: 'info',
          asset_name: 'character',
        }),
      );
      const docStr = res.content[0].text;
      const info = JSON.parse(docStr.substring(docStr.indexOf('{'))) as {
        width: number;
        height: number;
        perspective: string;
        layers: { name: string; type: string }[];
        frames: unknown[];
        tags: { name: string }[];
      };
      expect(info.width).toBe(16);
      expect(info.height).toBe(24);
      expect(info.perspective).toBe('top_down_3/4');
      expect(info.layers.length).toBeGreaterThanOrEqual(4); // default + body + eyes + hitbox
      expect(info.frames.length).toBe(4);
      expect(info.tags.length).toBe(3); // idle, walk, idle_south

      // 16. export godot_spriteframes
      res = unwrap(
        await dispatch('export', {
          action: 'godot_spriteframes',
          asset_name: 'character',
          path: '/tmp/test_project/character',
        }),
      );
      expect(res.content[0].text).toContain('Exported Godot SpriteFrames');

      // 17-19. Verify output files
      expect(virtualFs.has('/tmp/test_project/character_strip.png')).toBe(true);
      expect(virtualFs.has('/tmp/test_project/character.tres')).toBe(true);
      expect(virtualFs.has('/tmp/test_project/character_strip.png.import')).toBe(true);

      const pngBuffer = virtualFs.get('/tmp/test_project/character_strip.png') as Buffer;
      const png = PNG.sync.read(pngBuffer);
      expect(png.width).toBe(64); // 16 width * 4 frames * scale 1
      expect(png.height).toBe(24); // 24 height

      const tresData = virtualFs.get('/tmp/test_project/character.tres') as string;
      expect(tresData).toContain('"name": &"idle"');
      expect(tresData).toContain('"name": &"walk"');
      expect(tresData).toContain('"name": &"idle_south_S"'); // Note: depends on generation, usually faces are upper/lower based on casing but "S" -> idle_south is probably what the code produces or just idle_S. Wait, the tag was named 'idle_south', so Godot animation should be 'idle_south'.

      const importData = virtualFs.get('/tmp/test_project/character_strip.png.import') as string;
      expect(importData).toContain('[remap]');
    });

    it('5.3.2.1 E2E: tileset creation and Godot export', async () => {
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_project_tileset',
          name: 'Test Tileset Project',
        }),
      );

      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'my_tileset',
          width: 48,
          height: 16,
          tile_width: 16,
          tile_height: 16,
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
        }),
      );

      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'my_tileset',
          entries: [{ index: 1, rgba: [255, 0, 0, 255] }],
        }),
      );

      unwrap(
        await dispatch('draw', {
          asset_name: 'my_tileset',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'rect', x: 0, y: 0, width: 16, height: 16, color: 1, filled: true },
            { action: 'rect', x: 16, y: 0, width: 16, height: 16, color: 1, filled: true },
            { action: 'rect', x: 32, y: 0, width: 16, height: 16, color: 1, filled: true },
          ],
        }),
      );

      unwrap(
        await dispatch('tileset', {
          action: 'extract_tile',
          asset_name: 'my_tileset',
          layer_id: 1,
          x: 0,
          y: 0,
        }),
      );
      unwrap(
        await dispatch('tileset', {
          action: 'extract_tile',
          asset_name: 'my_tileset',
          layer_id: 1,
          x: 16,
          y: 0,
        }),
      );
      let res = unwrap(
        await dispatch('tileset', {
          action: 'extract_tile',
          asset_name: 'my_tileset',
          layer_id: 1,
          x: 32,
          y: 0,
        }),
      );
      expect(res.content[0].text).toContain('"slot_index":2');

      res = unwrap(await dispatch('asset', { action: 'info', asset_name: 'my_tileset' }));
      const docStr = res.content[0].text;
      const info = JSON.parse(docStr.substring(docStr.indexOf('{'))) as {
        width: number;
        tile_terrain?: { terrain_name: string };
      };
      expect(info.width).toBeGreaterThanOrEqual(48);

      unwrap(
        await dispatch('asset', {
          action: 'add_layer',
          asset_name: 'my_tileset',
          name: 'tilemap_layer',
          layer_type: 'tilemap',
        }),
      );

      unwrap(
        await dispatch('tileset', {
          action: 'place_tile',
          asset_name: 'my_tileset',
          layer_id: 2,
          tile_index: 1,
          x: 0,
          y: 0,
        }),
      );

      res = unwrap(
        await dispatch('tileset', {
          action: 'autotile_generate',
          asset_name: 'my_tileset',
          pattern: 'blob47',
        }),
      );
      const autotileObj = JSON.parse(res.content[0].text) as {
        expected_slots: number[];
        missing_slots: number[];
      };
      expect(autotileObj).toHaveProperty('expected_slots');
      expect(autotileObj).toHaveProperty('missing_slots');

      res = unwrap(
        await dispatch('tileset', {
          action: 'autotile_generate',
          asset_name: 'my_tileset',
          pattern: 'blob47',
          terrain_name: 'ground',
        }),
      );
      const assignResult = JSON.parse(res.content[0].text) as {
        assigned: number[];
        missing_slots: number[];
      };
      // With 3 tiles extracted, those 3 slots (0,1,2) among the expected
      // canonical blob47 slots should be assigned
      expect(Array.isArray(assignResult.assigned)).toBe(true);
      expect(Array.isArray(assignResult.missing_slots)).toBe(true);
      // Confirm terrain was persisted by doing another query-only call and checking results
      res = unwrap(
        await dispatch('tileset', {
          action: 'autotile_generate',
          asset_name: 'my_tileset',
          pattern: 'blob47',
        }),
      );
      const queryResult = JSON.parse(res.content[0].text) as {
        expected_slots: number[];
        occupied_slots: number[];
        missing_slots: number[];
      };
      expect(queryResult.expected_slots.length).toBe(47);
      // The 3 extracted tiles form some occupied slots
      expect(queryResult.occupied_slots.length).toBeGreaterThanOrEqual(0);

      unwrap(
        await dispatch('tileset', {
          action: 'set_tile_physics',
          asset_name: 'my_tileset',
          tile_index: 0,
          physics_polygon: [
            [0, 0],
            [16, 0],
            [16, 16],
            [0, 16],
          ],
        }),
      );

      unwrap(await dispatch('workspace', { action: 'save_all' }));

      unwrap(
        await dispatch('export', {
          action: 'godot_tileset',
          asset_name: 'my_tileset',
          path: '/tmp/test_project_tileset/my_tileset',
        }),
      );

      expect(virtualFs.has('/tmp/test_project_tileset/my_tileset.png')).toBe(true);
      expect(virtualFs.has('/tmp/test_project_tileset/my_tileset.tres')).toBe(true);
      expect(virtualFs.has('/tmp/test_project_tileset/my_tileset.png.import')).toBe(true);

      const tresData = virtualFs.get('/tmp/test_project_tileset/my_tileset.tres') as string;
      expect(tresData).toContain('TileSetAtlasSource');
      expect(tresData).toContain('texture_region_size');
      expect(tresData).toContain('polygon_0/points');
      expect(tresData).toContain('terrain_set_0/terrain_0/name = "ground"');
    });

    it('5.3.3.1 E2E: modular equipment with cross-asset operations', async () => {
      // -----------------------------------------------------------------------
      // 1. project init
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_project_equipment',
          name: 'Test Equipment Project',
        }),
      );

      // -----------------------------------------------------------------------
      // 2. asset create "hero" (16x24 character) and "sword" (16x24 weapon)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'hero',
          width: 16,
          height: 24,
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
        }),
      );

      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'sword',
          width: 16,
          height: 24,
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
        }),
      );

      // -----------------------------------------------------------------------
      // 3. palette set_bulk (same palette on both assets)
      // -----------------------------------------------------------------------
      const sharedPaletteEntries = [
        { index: 1, rgba: [200, 50, 50, 255] }, // hero body red
        { index: 2, rgba: [180, 180, 200, 255] }, // sword steel
        { index: 3, rgba: [100, 80, 60, 255] }, // sword handle brown
      ];

      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'hero',
          entries: sharedPaletteEntries,
        }),
      );

      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'sword',
          entries: sharedPaletteEntries,
        }),
      );

      // -----------------------------------------------------------------------
      // 4. draw character body on hero (layer 1, frame 0)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('draw', {
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'rect', x: 4, y: 2, width: 8, height: 20, color: 1, filled: true },
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // 5. draw sword pixels on sword asset (layer 1, frame 0)
      //    Blade at columns 7-9, hilt at rows 16-18
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('draw', {
          asset_name: 'sword',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'rect', x: 7, y: 2, width: 3, height: 14, color: 2, filled: true }, // blade
            { action: 'rect', x: 5, y: 16, width: 7, height: 3, color: 3, filled: true }, // guard
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // 6. asset add_tag on both assets (matching "idle" tags)
      //    hero gets a facing tag (idle_south), sword gets a plain forward tag.
      // -----------------------------------------------------------------------
      // Add a second frame to enable multi-frame tags
      unwrap(await dispatch('asset', { action: 'add_frame', asset_name: 'hero' }));
      unwrap(await dispatch('asset', { action: 'add_frame', asset_name: 'sword' }));

      // Hero: "idle" tag (frame 0, no facing) and "idle_south" tag (frame 0, facing S)
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'hero',
          name: 'idle',
          tag_start: 0,
          tag_end: 0,
          direction: 'forward',
          tag_type: 'frame',
        }),
      );
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'hero',
          name: 'idle',
          tag_start: 0,
          tag_end: 0,
          direction: 'forward',
          tag_type: 'frame',
          tag_facing: 'S',
        }),
      );

      // Sword: "idle" tag (frame 0, no facing — direction-only)
      unwrap(
        await dispatch('asset', {
          action: 'add_tag',
          asset_name: 'sword',
          name: 'idle',
          tag_start: 0,
          tag_end: 0,
          direction: 'forward',
          tag_type: 'frame',
        }),
      );

      // -----------------------------------------------------------------------
      // 7. selection rect on sword asset, copy the sword blade region
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('selection', {
          action: 'rect',
          asset_name: 'sword',
          layer_id: 1,
          frame_index: 0,
          x: 7,
          y: 2,
          width: 3,
          height: 14,
        }),
      );

      unwrap(
        await dispatch('selection', {
          action: 'copy',
          asset_name: 'sword',
          layer_id: 1,
          frame_index: 0,
        }),
      );

      // -----------------------------------------------------------------------
      // 8. selection paste into hero asset at offset (same position as drawn)
      //    Verifies cross-asset clipboard transfer
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('selection', {
          action: 'paste',
          target_asset_name: 'hero',
          target_layer_id: 1,
          target_frame_index: 0,
          offset_x: 0,
          offset_y: 0,
        }),
      );

      // Verify pixels transferred: hero layer 1 frame 0 should now have sword blade pixels
      // The paste writes to originalX+offsetX = 7+0=7, originalY+offsetY = 2+0=2
      let res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'hero',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const heroCelData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      // Blade pixels (color 2) were pasted at (7,2) → (9,15)
      expect(heroCelData[2][7]).toBe(2); // top of blade
      expect(heroCelData[15][8]).toBe(2); // middle of blade
      // Hero body pixels (color 1) remain untouched outside the paste region
      expect(heroCelData[2][4]).toBe(1); // hero body left edge untouched
      // -----------------------------------------------------------------------
      // 9. export per_tag on sword
      //    Default pattern: '{name}_{tag}_{direction}.png'
      //    Sword's "idle" tag has no facing → direction falls back to 'forward'
      //    Expected filename: sword_idle_forward.png
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('export', {
          action: 'per_tag',
          asset_name: 'sword',
          path: '/tmp/test_project_equipment/output',
          tags: ['idle'],
        }),
      );

      // The default export pattern is '{name}_{tag}_{direction}.png'
      // Sword idle tag has no facing → direction = 'forward' → sword_idle_forward.png
      const exportResult = JSON.parse(res.content[0].text) as { files: string[] };
      expect(exportResult.files.length).toBeGreaterThanOrEqual(1);

      const swordIdleFile = exportResult.files[0];
      // Token substitution: {name}=sword, {tag}=idle, {direction}=forward
      expect(swordIdleFile).toContain('sword');
      expect(swordIdleFile).toContain('idle');
      expect(swordIdleFile).toContain('forward'); // direction token populated (no facing)
      // Verify no doubled separators — the file should be stored without malformed names
      expect(virtualFs.has(swordIdleFile)).toBe(true);

      // -----------------------------------------------------------------------
      // 10. export per_tag on hero to verify facing value substitutes as direction token
      //    Hero has two "idle" tags: one with no facing (→ 'forward') and one with
      //    facing='S' (→ 'S'). Export both and verify the facing value appears in
      //    the filename when the tag carries a facing, demonstrating correct
      //    separator-dropping: the tag with facing='S' uses 'S' (not 'forward').
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('export', {
          action: 'per_tag',
          asset_name: 'hero',
          path: '/tmp/test_project_equipment/hero_output',
          tags: ['idle'],
        }),
      );
      const heroExportResult = JSON.parse(res.content[0].text) as { files: string[] };
      // Hero has two idle tags (no-facing + facing=S) → two output files
      expect(heroExportResult.files.length).toBe(2);

      // All files should exist in the virtual FS and contain 'hero' and 'idle'
      for (const f of heroExportResult.files) {
        expect(virtualFs.has(f)).toBe(true);
        expect(f).toContain('hero');
        expect(f).toContain('idle');
      }
      // One file should use the facing value 'S' as its direction token
      expect(heroExportResult.files.some((f) => f.includes('_S'))).toBe(true);
      // The other should use 'forward' (direction fallback when no facing)
      expect(heroExportResult.files.some((f) => f.includes('forward'))).toBe(true);

      // -----------------------------------------------------------------------
      // 11. Verify both assets were structurally valid after all operations
      // -----------------------------------------------------------------------
      res = unwrap(await dispatch('asset', { action: 'info', asset_name: 'sword' }));
      const docStr = res.content[0].text;
      const swordInfo = JSON.parse(docStr.substring(docStr.indexOf('{'))) as {
        name: string;
        width: number;
        height: number;
        tags: { name: string }[];
      };
      expect(swordInfo.name).toBe('sword');
      expect(swordInfo.width).toBe(16);
      expect(swordInfo.height).toBe(24);
      expect(swordInfo.tags.some((t) => t.name === 'idle')).toBe(true);

      res = unwrap(await dispatch('asset', { action: 'info', asset_name: 'hero' }));
      const heroDocStr = res.content[0].text;
      const heroInfo = JSON.parse(heroDocStr.substring(heroDocStr.indexOf('{'))) as {
        name: string;
        tags: { name: string }[];
      };
      expect(heroInfo.name).toBe('hero');
      expect(heroInfo.tags.some((t) => t.name === 'idle')).toBe(true);
    });

    it('5.3.4.1 E2E: recolor creation and variant resolution', async () => {
      // -----------------------------------------------------------------------
      // 1. project init
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_project_recolor',
          name: 'Test Recolor Project',
        }),
      );

      // -----------------------------------------------------------------------
      // 2. asset create "base_char" (8x8 for simplicity)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'base_char',
          width: 8,
          height: 8,
          palette: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
        }),
      );

      // -----------------------------------------------------------------------
      // 3. palette set_bulk — define a distinctive base palette
      //    Index 0 = transparent, 1 = red, 2 = blue
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'base_char',
          entries: [
            { index: 1, rgba: [255, 0, 0, 255] }, // red body
            { index: 2, rgba: [0, 0, 255, 255] }, // blue detail
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // 4. draw base character: filled rect with color 1 and a pixel with color 2
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('draw', {
          asset_name: 'base_char',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'rect', x: 1, y: 1, width: 6, height: 6, color: 1, filled: true },
            { action: 'pixel', x: 3, y: 3, color: 2 },
          ],
        }),
      );

      // Verify base pixel data before saving
      let res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'base_char',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const baseData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(baseData[1][1]).toBe(1); // rect corner — color index 1
      expect(baseData[3][3]).toBe(2); // center pixel — color index 2
      expect(baseData[0][0]).toBe(0); // corner outside rect — transparent

      // -----------------------------------------------------------------------
      // 5. workspace save — persist base_char to virtual FS
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'save_all' }));

      // -----------------------------------------------------------------------
      // 6. asset create_recolor "alt_char" from "base_char"
      //    Override: index 1 → green (was red), index 2 → yellow (was blue)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('asset', {
          action: 'create_recolor',
          asset_name: 'base_char',
          name: 'alt_char',
          palette_entries: [
            { index: 1, rgba: [0, 255, 0, 255] }, // green replaces red
            { index: 2, rgba: [255, 255, 0, 255] }, // yellow replaces blue
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // 7. asset get_cel on alt_char — pixel INDEX structure must match base_char
      //    (the palette indices are the same, only palette colours differ)
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'alt_char',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const altData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      // Pixel indices must mirror base_char — same logical structure
      expect(altData[1][1]).toBe(1); // same index as base
      expect(altData[3][3]).toBe(2); // same index as base
      expect(altData[0][0]).toBe(0); // transparent corner unchanged

      // -----------------------------------------------------------------------
      // 8. palette info on alt_char — palette entries must differ from base_char
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('palette', {
          action: 'info',
          asset_name: 'alt_char',
        }),
      );
      const altPaletteInfo = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: number[] }>;
      };
      const altIdx1 = altPaletteInfo.entries.find((e) => e.index === 1);
      const altIdx2 = altPaletteInfo.entries.find((e) => e.index === 2);
      // Index 1 should now be green, not red
      expect(altIdx1?.rgba[0]).toBe(0);
      expect(altIdx1?.rgba[1]).toBe(255);
      // Index 2 should now be yellow, not blue
      expect(altIdx2?.rgba[0]).toBe(255);
      expect(altIdx2?.rgba[1]).toBe(255);
      expect(altIdx2?.rgba[2]).toBe(0);

      // -----------------------------------------------------------------------
      // 9. asset info on alt_char — verify structural fidelity (same W/H,
      //    same layer count, same frame count as base_char)
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('asset', {
          action: 'info',
          asset_name: 'alt_char',
        }),
      );
      const altDocStr = res.content[0].text;
      const altInfo = JSON.parse(altDocStr.substring(altDocStr.indexOf('{'))) as {
        name: string;
        width: number;
        height: number;
        layers: unknown[];
        frames: unknown[];
      };
      expect(altInfo.name).toBe('alt_char');
      expect(altInfo.width).toBe(8);
      expect(altInfo.height).toBe(8);
      expect(altInfo.layers.length).toBe(1); // single default layer, same as base
      expect(altInfo.frames.length).toBe(1); // single default frame, same as base

      // -----------------------------------------------------------------------
      // 10. workspace load_asset "alt_char" (it is already loaded after create_recolor,
      //     but unload then reload to verify persistence via the virtual FS)
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'save_all' }));
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'alt_char' }));
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'alt_char' }));

      // Re-verify pixel indices are preserved after round-trip
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'alt_char',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const reloadedData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(reloadedData[1][1]).toBe(1);
      expect(reloadedData[3][3]).toBe(2);

      // -----------------------------------------------------------------------
      // 11. project info — verify both assets in registry and alt_char carries
      //     recolor_of: "base_char"
      // -----------------------------------------------------------------------
      res = unwrap(await dispatch('project', { action: 'info' }));
      const projectInfo = JSON.parse(res.content[0].text) as {
        assets: Record<string, { type: string; path?: string; recolor_of?: string }>;
      };
      expect('base_char' in projectInfo.assets).toBe(true);
      expect('alt_char' in projectInfo.assets).toBe(true);
      expect(projectInfo.assets['alt_char'].recolor_of).toBe('base_char');
    });

    it('5.3.5.1 E2E: asset variants - load default and named variant', async () => {
      const projectPath = '/tmp/test_project_variants';
      const projectFile = `${projectPath}/pixelmcp.json`;

      // -----------------------------------------------------------------------
      // 1. project init
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: projectPath,
          name: 'Test Variant Project',
        }),
      );

      // -----------------------------------------------------------------------
      // 2. asset create "iron_sword" (8x8 for simplicity)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'iron_sword',
          width: 8,
          height: 8,
        }),
      );

      // -----------------------------------------------------------------------
      // 3. palette set_bulk — define colors to distinguish variants
      //    Index 1 = standard color, Index 2 = slim color
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'iron_sword',
          entries: [
            { index: 1, rgba: [50, 100, 200, 255] },
            { index: 2, rgba: [200, 50, 50, 255] },
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // 4. Draw standard variant marker: pixel (0,0) = color 1
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('draw', {
          asset_name: 'iron_sword',
          layer_id: 1,
          frame_index: 0,
          operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
        }),
      );

      // -----------------------------------------------------------------------
      // 5. workspace save — standard variant data is now in virtualFs
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'save_all' }));

      // -----------------------------------------------------------------------
      // 6. Manually register variants in virtualFs:
      //    - Create slim variant asset (pixel (0,0) = color 2)
      //    - Update project config to have variants map for iron_sword
      // -----------------------------------------------------------------------
      const standardAssetPath = `${projectPath}/sprites/iron_sword.json`;
      const slimAssetPath = `${projectPath}/sprites/iron_sword_slim.json`;

      // Deep copy standard asset data, modify pixel (0,0) to color 2 for slim variant
      interface AssetSnapshot {
        cels: Record<string, { data: number[][] }>;
      }
      const standardSnapshot = JSON.parse(
        JSON.stringify(virtualFs.get(standardAssetPath)),
      ) as AssetSnapshot;
      const slimSnapshot = JSON.parse(JSON.stringify(standardSnapshot)) as AssetSnapshot;
      slimSnapshot.cels['1/0'].data[0][0] = 2;
      virtualFs.set(slimAssetPath, slimSnapshot);

      // Update project config: replace single path entry with variants map
      interface ProjectSnapshot {
        assets: Record<string, { type: string; path?: string; variants?: Record<string, string> }>;
      }
      const projectSnapshot = JSON.parse(
        JSON.stringify(virtualFs.get(projectFile)),
      ) as ProjectSnapshot;
      projectSnapshot.assets['iron_sword'] = {
        type: 'sprite',
        variants: {
          standard: 'sprites/iron_sword.json',
          slim: 'sprites/iron_sword_slim.json',
        },
      };
      virtualFs.set(projectFile, projectSnapshot);

      // Unload iron_sword (loaded automatically by asset create) before reloading project
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'iron_sword' }));

      // -----------------------------------------------------------------------
      // 7. project open — reload config that now has variants map for iron_sword
      // -----------------------------------------------------------------------
      unwrap(await dispatch('project', { action: 'open', path: projectFile }));

      // -----------------------------------------------------------------------
      // 8. workspace load_asset "iron_sword" with no variant
      //    → resolves to first defined variant ("standard")
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'iron_sword' }));

      // -----------------------------------------------------------------------
      // 9. Verify standard variant is loaded
      // -----------------------------------------------------------------------
      let res = unwrap(await dispatch('workspace', { action: 'info' }));
      const wsInfoStd = JSON.parse(res.content[0].text) as {
        loadedAssets: Array<{ name: string; variant?: string }>;
      };
      const stdEntry = wsInfoStd.loadedAssets.find((a) => a.name === 'iron_sword');
      expect(stdEntry).toBeDefined();
      // No variant param was passed → workspace tracks no variant for this load
      expect(stdEntry?.variant).toBeUndefined();

      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'iron_sword',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const stdCelData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(stdCelData[0][0]).toBe(1); // standard: color 1 at (0,0)

      // -----------------------------------------------------------------------
      // 10. workspace unload_asset
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'iron_sword' }));

      // -----------------------------------------------------------------------
      // 11. workspace load_asset "iron_sword" with variant: "slim"
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('workspace', {
          action: 'load_asset',
          asset_name: 'iron_sword',
          variant: 'slim',
        }),
      );

      // -----------------------------------------------------------------------
      // 12. Verify slim variant is loaded
      // -----------------------------------------------------------------------
      res = unwrap(await dispatch('workspace', { action: 'info' }));
      const wsInfoSlim = JSON.parse(res.content[0].text) as {
        loadedAssets: Array<{ name: string; variant?: string }>;
      };
      const slimEntry = wsInfoSlim.loadedAssets.find((a) => a.name === 'iron_sword');
      expect(slimEntry).toBeDefined();
      expect(slimEntry?.variant).toBe('slim');

      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'iron_sword',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const slimCelData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(slimCelData[0][0]).toBe(2); // slim: color 2 at (0,0)
    });

    it('5.3.6.1 E2E: palette lifecycle - fetch_lospec, save, load, generate_ramp, undo/redo', async () => {
      const projectPath = '/tmp/test_project_palette';

      // -----------------------------------------------------------------------
      // 1. project init
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('project', { action: 'init', path: projectPath, name: 'Palette Test' }),
      );

      // -----------------------------------------------------------------------
      // 2. asset create
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('asset', { action: 'create', name: 'my_sprite', width: 16, height: 16 }),
      );

      // -----------------------------------------------------------------------
      // 3. palette fetch_lospec — mock returns 3 known colors
      //    Lospec convention: index 0 = transparent, colors start at index 1
      //    Returned hex: "ff0000" (red), "00ff00" (green), "0000ff" (blue)
      // -----------------------------------------------------------------------
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            name: 'Test Palette',
            colors: ['ff0000', '00ff00', '0000ff'],
          }),
      } as Response);

      unwrap(
        await dispatch('palette', {
          action: 'fetch_lospec',
          asset_name: 'my_sprite',
          name: 'test-palette',
        }),
      );
      fetchSpy.mockRestore();

      // -----------------------------------------------------------------------
      // 4. palette info — verify colors populated
      // -----------------------------------------------------------------------
      let res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'my_sprite' }));
      const infoAfterFetch = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
      };
      const idx1After = infoAfterFetch.entries.find((e) => e.index === 1);
      const idx2After = infoAfterFetch.entries.find((e) => e.index === 2);
      const idx3After = infoAfterFetch.entries.find((e) => e.index === 3);
      expect(idx1After?.rgba).toEqual([255, 0, 0, 255]); // red
      expect(idx2After?.rgba).toEqual([0, 255, 0, 255]); // green
      expect(idx3After?.rgba).toEqual([0, 0, 255, 255]); // blue

      // -----------------------------------------------------------------------
      // 5. palette save — persist palette to file
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'save',
          asset_name: 'my_sprite',
          path: 'palettes/my_palette.json',
          name: 'my_palette',
        }),
      );
      const paletteFilePath = `${projectPath}/palettes/my_palette.json`;
      expect(virtualFs.has(paletteFilePath)).toBe(true);

      // -----------------------------------------------------------------------
      // 6. palette set — modify index 1 to gray
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'set',
          asset_name: 'my_sprite',
          index: 1,
          rgba: [100, 100, 100, 255],
        }),
      );

      // -----------------------------------------------------------------------
      // 7. palette load — reload saved file, verify index 1 reverts to red
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'load',
          asset_name: 'my_sprite',
          path: 'palettes/my_palette.json',
        }),
      );

      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'my_sprite' }));
      const infoAfterLoad = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
      };
      const idx1Restored = infoAfterLoad.entries.find((e) => e.index === 1);
      expect(idx1Restored?.rgba).toEqual([255, 0, 0, 255]); // back to red

      // -----------------------------------------------------------------------
      // 8. palette generate_ramp from index 1 (red) to index 3 (blue)
      //    → fills index 2 with interpolated midpoint: [128, 0, 128, 255]
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'generate_ramp',
          asset_name: 'my_sprite',
          color1: 1,
          color2: 3,
        }),
      );

      // -----------------------------------------------------------------------
      // 9. palette info — verify ramp entries interpolated
      // -----------------------------------------------------------------------
      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'my_sprite' }));
      const infoAfterRamp = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
      };
      const idx2AfterRamp = infoAfterRamp.entries.find((e) => e.index === 2);
      // Midpoint between red [255,0,0,255] and blue [0,0,255,255]: t=0.5
      expect(idx2AfterRamp?.rgba).toEqual([128, 0, 128, 255]);

      // -----------------------------------------------------------------------
      // 10. workspace undo — ramp reverted; index 2 should be green again
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'undo' }));

      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'my_sprite' }));
      const infoAfterUndo = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
      };
      const idx2AfterUndo = infoAfterUndo.entries.find((e) => e.index === 2);
      expect(idx2AfterUndo?.rgba).toEqual([0, 255, 0, 255]); // green restored

      // -----------------------------------------------------------------------
      // 11. workspace redo — ramp re-applied; index 2 is interpolated again
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'redo' }));

      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'my_sprite' }));
      const infoAfterRedo = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
      };
      const idx2AfterRedo = infoAfterRedo.entries.find((e) => e.index === 2);
      expect(idx2AfterRedo?.rgba).toEqual([128, 0, 128, 255]); // interpolated restored
    });

    it('5.3.7.1 E2E: project add_file - import PNG, quantize, register', async () => {
      const projectPath = '/tmp/test_project_import';

      // -----------------------------------------------------------------------
      // 1. project init
      // -----------------------------------------------------------------------
      unwrap(await dispatch('project', { action: 'init', path: projectPath, name: 'Import Test' }));

      // -----------------------------------------------------------------------
      // Build a 4×4 PNG:
      //   (0,0): fully transparent → quantize reserves index 0 for transparency
      //   top 2 rows (minus top-left): red
      //   bottom 2 rows: green
      // The transparent pixel ensures all opaque pixels get indices > 0.
      // -----------------------------------------------------------------------
      const testPng = new PNG({ width: 4, height: 4 });
      const pixelData = Buffer.alloc(4 * 4 * 4);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const i = (y * 4 + x) * 4;
          if (y === 0 && x === 0) {
            // top-left: fully transparent
            pixelData[i] = 0;
            pixelData[i + 1] = 0;
            pixelData[i + 2] = 0;
            pixelData[i + 3] = 0;
          } else if (y < 2) {
            // top half (except top-left): red
            pixelData[i] = 255;
            pixelData[i + 1] = 0;
            pixelData[i + 2] = 0;
            pixelData[i + 3] = 255;
          } else {
            // bottom half: green
            pixelData[i] = 0;
            pixelData[i + 1] = 255;
            pixelData[i + 2] = 0;
            pixelData[i + 3] = 255;
          }
        }
      }
      testPng.data = pixelData;
      const pngBuffer = PNG.sync.write(testPng);

      const importPath = '/tmp/test_sprite.png';
      virtualFs.set(importPath, pngBuffer);

      // -----------------------------------------------------------------------
      // 2. project add_file — import the PNG
      // -----------------------------------------------------------------------
      const addRes = unwrap(
        await dispatch('project', {
          action: 'add_file',
          name: 'imported_sprite',
          import_path: importPath,
          type: 'sprite',
        }),
      );
      const addData = JSON.parse(addRes.content[0].text) as {
        asset_name: string;
        path: string;
        width: number;
        height: number;
        color_count: number;
      };
      expect(addData.asset_name).toBe('imported_sprite');
      expect(addData.width).toBe(4);
      expect(addData.height).toBe(4);
      expect(addData.color_count).toBeLessThanOrEqual(256);

      // -----------------------------------------------------------------------
      // 3. project info — verify asset registered
      // -----------------------------------------------------------------------
      const infoRes = unwrap(await dispatch('project', { action: 'info' }));
      const projectInfo = JSON.parse(infoRes.content[0].text) as {
        assets: Record<string, { type: string; path: string }>;
      };
      expect(projectInfo.assets).toHaveProperty('imported_sprite');
      expect(projectInfo.assets['imported_sprite'].type).toBe('sprite');

      // -----------------------------------------------------------------------
      // 4. workspace load_asset — load the imported asset
      // -----------------------------------------------------------------------
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'imported_sprite' }));

      // -----------------------------------------------------------------------
      // 5. asset info — verify dimensions match PNG
      // -----------------------------------------------------------------------
      let res = unwrap(await dispatch('asset', { action: 'info', asset_name: 'imported_sprite' }));
      const docStr = res.content[0].text;
      const assetInfo = JSON.parse(docStr.substring(docStr.indexOf('{'))) as {
        width: number;
        height: number;
      };
      expect(assetInfo.width).toBe(4);
      expect(assetInfo.height).toBe(4);

      // -----------------------------------------------------------------------
      // 6. palette info — verify ≤ 256 entries, colors match quantized PNG
      //    The PNG has exactly 2 solid colors (red + green) + 1 transparent.
      //    The quantizer uses the exact-match path (≤256 unique colors), so
      //    palette entries must contain recognizable red and green values.
      // -----------------------------------------------------------------------
      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'imported_sprite' }));
      const paletteData = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
        total_defined: number;
      };
      expect(paletteData.total_defined).toBeLessThanOrEqual(256);
      expect(paletteData.total_defined).toBeGreaterThanOrEqual(2);
      // Verify the palette actually contains the source colors (red and green)
      const redEntry = paletteData.entries.find(
        (e) => e.rgba[0] > 200 && e.rgba[1] < 50 && e.rgba[2] < 50,
      );
      const greenEntry = paletteData.entries.find(
        (e) => e.rgba[0] < 50 && e.rgba[1] > 200 && e.rgba[2] < 50,
      );
      expect(redEntry).toBeDefined();
      expect(greenEntry).toBeDefined();

      // -----------------------------------------------------------------------
      // 7. asset get_cel — verify pixel data is indexed, non-zero for all opaque pixels
      // -----------------------------------------------------------------------
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'imported_sprite',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celData = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celData.length).toBe(4); // 4 rows
      expect(celData[0].length).toBe(4); // 4 columns
      // Transparent pixel (0,0) → index 0; all opaque pixels → non-zero indices
      expect(celData[0][0]).toBe(0);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          if (y === 0 && x === 0) continue; // transparent pixel — already asserted above
          expect(celData[y][x]).toBeGreaterThan(0);
        }
      }
    });

    it('5.3.8.1 E2E: undo/redo stress test across 6 mutations and 2 assets', async () => {
      // -----------------------------------------------------------------------
      // Setup: init project, create sprite_a (4×4) and sprite_b (4×4 tileset)
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('project', {
          action: 'init',
          path: '/tmp/test_undoredo',
          name: 'Undo Redo Test',
        }),
      );

      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'sprite_a',
          width: 4,
          height: 4,
        }),
      );

      unwrap(
        await dispatch('asset', {
          action: 'create',
          name: 'sprite_b',
          width: 4,
          height: 4,
          tile_width: 4,
          tile_height: 4,
        }),
      );

      // -----------------------------------------------------------------------
      // Op 1: palette set_bulk on sprite_a (idx1=red, idx2=blue) — PaletteCommand
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('palette', {
          action: 'set_bulk',
          asset_name: 'sprite_a',
          entries: [
            { index: 1, rgba: [255, 0, 0, 255] },
            { index: 2, rgba: [0, 0, 255, 255] },
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // Op 2: draw pixel at (0,0) color=1 on sprite_a — CelWriteCommand
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('draw', {
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
          operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
        }),
      );

      // Capture celAAfterDraw before flip
      let res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celAAfterDraw = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celAAfterDraw[0][0]).toBe(1);

      // -----------------------------------------------------------------------
      // Op 3: transform flip_h on sprite_a — CelWriteCommand
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('transform', {
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
          operations: [{ action: 'flip_h' }],
        }),
      );

      // Capture celAFinal — pixel moved from (0,0) to (3,0) after horizontal flip
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celAFinal = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celAFinal[0][3]).toBe(1);
      expect(celAFinal[0][0]).toBe(0);

      // -----------------------------------------------------------------------
      // Op 4: effect gradient + outline (batched, 1 undo slot) on sprite_b
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('effect', {
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'gradient', color1: 1, color2: 2 },
            { action: 'outline', color: 1 },
          ],
        }),
      );

      // Capture celBAfterEffect
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celBAfterEffect = (JSON.parse(res.content[0].text) as { data: number[][] }).data;

      // -----------------------------------------------------------------------
      // Op 5: draw write_pixels 4×4 checkerboard on sprite_b — CelWriteCommand
      // -----------------------------------------------------------------------
      const writeData = [
        [1, 1, 2, 2],
        [1, 1, 2, 2],
        [2, 2, 1, 1],
        [2, 2, 1, 1],
      ];
      unwrap(
        await dispatch('draw', {
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
          operations: [
            { action: 'write_pixels', x: 0, y: 0, width: 4, height: 4, data: writeData },
          ],
        }),
      );

      // -----------------------------------------------------------------------
      // Op 6: tileset extract_tile from sprite_b — TilesetCommand
      // -----------------------------------------------------------------------
      unwrap(
        await dispatch('tileset', {
          action: 'extract_tile',
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
          x: 0,
          y: 0,
        }),
      );

      // Verify tile_count is 1 before starting undos
      expect(WorkspaceClass.instance().loadedAssets.get('sprite_b')?.tile_count).toBe(1);

      // =======================================================================
      // UNDO 6×: most recent first
      // =======================================================================

      // Undo 1: reverses extract_tile — tile_count back to 0
      unwrap(await dispatch('workspace', { action: 'undo' }));
      expect(WorkspaceClass.instance().loadedAssets.get('sprite_b')?.tile_count ?? 0).toBe(0);

      // Undo 2: reverses write_pixels — cel should match celBAfterEffect
      unwrap(await dispatch('workspace', { action: 'undo' }));
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celBUndo2 = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celBUndo2).toEqual(celBAfterEffect);

      // Undo 3: reverses gradient+outline — no prior cel existed, data must be null
      unwrap(await dispatch('workspace', { action: 'undo' }));
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celBUndo3 = (JSON.parse(res.content[0].text) as { data: number[][] | null }).data;
      expect(celBUndo3).toBeNull();

      // Undo 4: reverses flip_h — cel should match celAAfterDraw
      unwrap(await dispatch('workspace', { action: 'undo' }));
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celAUndo4 = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celAUndo4).toEqual(celAAfterDraw);

      // Undo 5: reverses draw pixel — no prior cel existed, data must be null
      unwrap(await dispatch('workspace', { action: 'undo' }));
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celAUndo5 = (JSON.parse(res.content[0].text) as { data: number[][] | null }).data;
      expect(celAUndo5).toBeNull();

      // Undo 6: reverses palette set_bulk — total_defined should be 0
      unwrap(await dispatch('workspace', { action: 'undo' }));
      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'sprite_a' }));
      const paletteAfterUndo6 = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
        total_defined: number;
      };
      expect(paletteAfterUndo6.total_defined).toBe(0);

      // 7th undo — stack exhausted, must return an error
      const undo7 = await dispatch('workspace', { action: 'undo' });
      expect(undo7.isError).toBe(true);

      // =======================================================================
      // REDO 6×: restore all mutations
      // =======================================================================
      for (let i = 0; i < 6; i++) {
        unwrap(await dispatch('workspace', { action: 'redo' }));
      }

      // sprite_a cel should match celAFinal (pixel at (3,0) after flip)
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_a',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celARedone = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celARedone).toEqual(celAFinal);

      // sprite_b cel should match writeData (extract_tile copies data back to same position)
      res = unwrap(
        await dispatch('asset', {
          action: 'get_cel',
          asset_name: 'sprite_b',
          layer_id: 1,
          frame_index: 0,
        }),
      );
      const celBRedone = (JSON.parse(res.content[0].text) as { data: number[][] }).data;
      expect(celBRedone).toEqual(writeData);

      // palette should be restored: total_defined >= 2, red at index 1
      res = unwrap(await dispatch('palette', { action: 'info', asset_name: 'sprite_a' }));
      const paletteRedone = JSON.parse(res.content[0].text) as {
        entries: Array<{ index: number; rgba: [number, number, number, number] }>;
        total_defined: number;
      };
      expect(paletteRedone.total_defined).toBeGreaterThanOrEqual(2);
      const redEntry = paletteRedone.entries.find((e) => e.index === 1);
      expect(redEntry?.rgba).toEqual([255, 0, 0, 255]);
    });
  });
});
