import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { WorkspaceClass } from '../classes/workspace.js';
import { registerProjectTool } from './project.js';
import { registerWorkspaceTool } from './workspace.js';
import { registerAssetTool } from './asset.js';
import { registerPaletteTool } from './palette.js';
import { registerDrawTool } from './draw.js';
import { saveAssetFile } from '../io/asset-io.js';

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

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
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
  };
  /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
  registerProjectTool(mockServer as any);
  registerWorkspaceTool(mockServer as any);
  registerAssetTool(mockServer as any);
  registerPaletteTool(mockServer as any);
  registerDrawTool(mockServer as any);
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
  });
});
