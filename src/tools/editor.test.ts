import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEditorTool } from './editor.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolCallback = (args: Record<string, unknown>) => any;

interface CapturedTool {
  name: string;
  config: Record<string, unknown>;
  callback: ToolCallback;
}

interface HandlerResult {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

function captureEditorTools(): CapturedTool[] {
  const tools: CapturedTool[] = [];
  const mockServer = {
    registerTool(name: string, config: unknown, callback: ToolCallback) {
      tools.push({ name, config: config as Record<string, unknown>, callback });
    },
    sendResourceListChanged() {},
  };
  registerEditorTool(mockServer as unknown as McpServer);
  return tools;
}

function buildMockAsset(): Asset {
  return {
    name: 'test_sprite',
    width: 8,
    height: 8,
    perspective: 'flat',
    palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
    layers: [{ id: 1, name: 'Base', type: 'image', opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
      '1/0': {
        x: 0,
        y: 0,
        data: Array.from({ length: 8 }, () => new Array<number>(8).fill(0)),
      },
    },
  } as unknown as Parameters<(typeof AssetClass)['fromJSON']>[0];
}

describe('editor tool', () => {
  let tools: CapturedTool[];
  let openEditor: ToolCallback;
  let getAssetState: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    tools = captureEditorTools();

    const openEditorTool = tools.find((t) => t.name === 'open_editor');
    const getAssetStateTool = tools.find((t) => t.name === 'get_asset_state');
    if (!openEditorTool || !getAssetStateTool) throw new Error('Tools not captured');
    openEditor = openEditorTool.callback;
    getAssetState = getAssetStateTool.callback;

    const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
    project.registerAsset('test_sprite', { type: 'sprite', path: 'test_sprite.json' });
    workspace.setProject(project);

    const asset = AssetClass.fromJSON(buildMockAsset());
    workspace.loadedAssets.set('test_sprite', asset);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Registration ----

  it('registers open_editor with _meta.ui.resourceUri pointing to pixel editor', () => {
    const tool = tools.find((t) => t.name === 'open_editor');
    expect(tool).toBeDefined();
    if (!tool) throw new Error('open_editor not found');
    const meta = tool.config._meta as Record<string, unknown>;
    // registerAppTool normalizes to both ui.resourceUri and ui/resourceUri
    const ui = meta.ui as Record<string, unknown> | undefined;
    const legacyUri = meta['ui/resourceUri'] as string | undefined;
    const hasResourceUri =
      ui?.resourceUri === 'ui://pixel-editor/app.html' ||
      legacyUri === 'ui://pixel-editor/app.html';
    expect(hasResourceUri).toBe(true);
  });

  it('registers get_asset_state with _meta.ui.visibility containing app', () => {
    const tool = tools.find((t) => t.name === 'get_asset_state');
    expect(tool).toBeDefined();
    if (!tool) throw new Error('get_asset_state not found');
    const meta = tool.config._meta as Record<string, unknown>;
    const ui = meta.ui as Record<string, unknown> | undefined;
    expect(ui?.visibility).toContain('app');
  });

  // ---- open_editor ----

  it('open_editor returns structuredContent with asset state fields', async () => {
    const result = (await openEditor({ asset_name: 'test_sprite' })) as HandlerResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    if (!result.structuredContent) throw new Error('No structuredContent');
    expect(result.structuredContent.asset_name).toBe('test_sprite');
    expect(result.structuredContent.width).toBe(8);
    expect(result.structuredContent.height).toBe(8);
    expect(result.structuredContent.palette).toBeDefined();
    expect(result.structuredContent.layers).toBeDefined();
    expect(result.structuredContent.frames).toBeDefined();
    expect(result.structuredContent.cels).toBeDefined();
  });

  it('open_editor returns content with text summary containing asset name', async () => {
    const result = (await openEditor({ asset_name: 'test_sprite' })) as HandlerResult;
    expect(result.content).toBeDefined();
    if (!result.content) throw new Error('No content');
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain('test_sprite');
  });

  it('open_editor auto-loads an unloaded asset', async () => {
    // Remove from workspace but keep in registry
    workspace.loadedAssets.delete('test_sprite');

    // Mock loadAssetFile to return valid data
    const { loadAssetFile } = await import('../io/asset-io.js');
    (loadAssetFile as ReturnType<typeof vi.fn>).mockResolvedValue(buildMockAsset());

    const result = (await openEditor({ asset_name: 'test_sprite' })) as HandlerResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    if (!result.structuredContent) throw new Error('No structuredContent');
    expect(result.structuredContent.asset_name).toBe('test_sprite');
  });

  it('open_editor returns error when no project is loaded', async () => {
    workspace.setProject(null as unknown as ProjectClass);
    const result = (await openEditor({ asset_name: 'test_sprite' })) as HandlerResult;
    expect(result.isError).toBe(true);
  });

  it('open_editor returns error when asset not in registry', async () => {
    const result = (await openEditor({ asset_name: 'nonexistent' })) as HandlerResult;
    expect(result.isError).toBe(true);
  });

  // ---- get_asset_state ----

  it('get_asset_state returns state for frame 0', () => {
    const result = getAssetState({ asset_name: 'test_sprite' }) as HandlerResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    if (!result.structuredContent) throw new Error('No structuredContent');
    expect(result.structuredContent.asset_name).toBe('test_sprite');
    expect(result.structuredContent.frame_index).toBe(0);
    expect(result.structuredContent.palette).toBeDefined();
    expect(result.structuredContent.layers).toBeDefined();
    expect(result.structuredContent.frames).toBeDefined();
    expect(result.structuredContent.cels).toBeDefined();
  });

  it('get_asset_state returns state for specific frame', () => {
    // Add a second frame
    const asset = workspace.loadedAssets.get('test_sprite');
    if (!asset) throw new Error('Asset not found');
    asset.addFrame({ index: 1, duration_ms: 100 });

    const result = getAssetState({
      asset_name: 'test_sprite',
      frame_index: 1,
    }) as HandlerResult;
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toBeDefined();
    if (!result.structuredContent) throw new Error('No structuredContent');
    expect(result.structuredContent.frame_index).toBe(1);
  });

  it('get_asset_state returns error when asset not loaded', () => {
    const result = getAssetState({ asset_name: 'unknown_asset' }) as HandlerResult;
    expect(result.isError).toBe(true);
  });

  it('get_asset_state returns error on out-of-range frame', () => {
    const result = getAssetState({
      asset_name: 'test_sprite',
      frame_index: 99,
    }) as HandlerResult;
    expect(result.isError).toBe(true);
  });
});
