import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { WorkspaceClass } from '../classes/workspace.js';
import { registerProjectTool } from './project.js';
import { registerWorkspaceTool } from './workspace.js';
import { registerAssetTool } from './asset.js';
import { registerPaletteTool } from './palette.js';
import { registerDrawTool } from './draw.js';
import { saveAssetFile } from '../io/asset-io.js';
import * as fs from 'node:fs';

// Mock IO
const virtualFs = new Map<string, any>();

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn().mockImplementation(async (path: string) => {
    if (!virtualFs.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return virtualFs.get(path);
  }),
  saveAssetFile: vi.fn().mockImplementation(async (path: string, asset: any) => {
    virtualFs.set(path, JSON.parse(JSON.stringify(asset)));
  }),
}));

vi.mock('../io/project-io.js', () => ({
  loadProjectFile: vi.fn().mockImplementation(async (path: string) => {
    if (!virtualFs.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return virtualFs.get(path);
  }),
  saveProjectFile: vi.fn().mockImplementation(async (path: string, data: any) => {
    virtualFs.set(path, JSON.parse(JSON.stringify(data)));
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
}));

type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (args: any) => Promise<any>;
};

function createMockServer() {
  const tools = new Map<string, ToolDef>();
  const mockServer = {
    registerTool(name: string, arg2: any, arg3: any, arg4?: any) {
      let config;
      let callback;
      if (typeof arg2 === 'string') {
        config = arg3;
        callback = arg4;
      } else {
        config = arg2;
        callback = arg3;
      }

      // If the schema is a plain object, wrap it in z.object()
      let schema = config.inputSchema;
      if (!(schema instanceof z.ZodType)) {
        schema = z.object(schema);
      }

      tools.set(name, { name, description: config.description || '', schema, handler: callback });
    },
  };
  registerProjectTool(mockServer as any);
  registerWorkspaceTool(mockServer as any);
  registerAssetTool(mockServer as any);
  registerPaletteTool(mockServer as any);
  registerDrawTool(mockServer as any);

  return {
    tools,
    dispatch: async (toolName: string, args: any) => {
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`Tool not found: ${toolName}`);

      // Simulating MCP SDK Zod validation
      const parsedArgs = tool.schema.parse(args);

      return await tool.handler(parsedArgs);
    },
  };
}

function unwrap(res: any) {
  if (res && res.isError) {
    throw new Error(`Domain Error: ${res.content[0].text}`);
  }
  return res;
}

describe('Minimum Viable Loop Integration', () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let dispatch: (toolName: string, args: any) => Promise<any>;

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
      const result = (await dispatch('workspace', {
        action: 'load_asset',
        asset_name: 'dummy',
      })) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No project loaded');
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

      const celData = JSON.parse(res.content[0].text).data;
      expect(celData[2][2]).toBe(1); // rect corner
      expect(celData[3][3]).toBe(2); // inner pixel
      expect(celData[0][0]).toBe(0); // transparent background

      // 6. Save Workspace
      unwrap(await dispatch('workspace', { action: 'save_all' }));
      expect(saveAssetFile).toHaveBeenCalled();

      // 7. Unload Asset
      unwrap(await dispatch('workspace', { action: 'unload_asset', asset_name: 'hero' }));

      res = unwrap(await dispatch('workspace', { action: 'info' }));
      let info = JSON.parse(res.content[0].text);
      expect(info.loadedAssets.length).toBe(0);

      // 8. Load Asset
      unwrap(await dispatch('workspace', { action: 'load_asset', asset_name: 'hero' }));

      res = unwrap(await dispatch('workspace', { action: 'info' }));
      info = JSON.parse(res.content[0].text);
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

      const loadedData = JSON.parse(res.content[0].text).data;
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
      expect(JSON.parse(res.content[0].text).data[0][0]).toBe(1);

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
      expect(JSON.parse(res.content[0].text).data == null).toBe(true);

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
      expect(JSON.parse(res.content[0].text).data[0][0]).toBe(1);
    });
  });
});
