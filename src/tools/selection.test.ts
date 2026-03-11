import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { registerSelectionTool } from './selection.js';

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn(),
}));

interface MockServer {
  registerTool: ReturnType<typeof vi.fn>;
}

type HandlerResult = {
  isError?: boolean;
  content?: { text: string }[];
};

describe('selection tool', () => {
  let mockServer: MockServer;
  let registeredHandler: (args: unknown) => Promise<unknown>;
  let workspace: ReturnType<typeof WorkspaceClass.instance>;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();

    // Setup a mock project and asset
    const project = ProjectClass.create('/path/to/project/pixelmcp.json', 'TestProject');
    workspace.setProject(project);

    const asset = AssetClass.fromJSON({
      pixelmcp_version: '1.0',
      name: 'test_asset',
      width: 10,
      height: 10,
      perspective: 'flat',
      tags: [],
      palette: [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        [0, 255, 0, 255],
      ],
      layers: [{ id: 0, name: 'Layer 0', type: 'image', visible: true, opacity: 255 }],
      frames: [{ index: 0, duration_ms: 100 }],
      cels: {},
    } as unknown as Parameters<typeof AssetClass.fromJSON>[0]);
    workspace.loadedAssets.set('test_asset', asset);

    // Put some data in the first cel
    const data: number[][] = Array.from({ length: 10 }, () => new Array<number>(10).fill(0));
    data[2][2] = 1; // Red pixel at (2,2)
    data[3][3] = 2; // Green pixel at (3,3)
    data[4][4] = 1; // Red pixel at (4,4)
    asset.setCel(0, 0, { x: 0, y: 0, data });

    mockServer = {
      registerTool: vi.fn((name: string, arg2: unknown, arg3: unknown, arg4?: unknown) => {
        if (typeof arg2 === 'string') {
          registeredHandler = arg4 as (args: unknown) => Promise<unknown>;
        } else {
          registeredHandler = arg3 as (args: unknown) => Promise<unknown>;
        }
      }),
    };

    registerSelectionTool(mockServer as unknown as Parameters<typeof registerSelectionTool>[0]);
  });

  async function handle(args: unknown): Promise<HandlerResult> {
    return (await registeredHandler(args)) as HandlerResult;
  }

  it('returns error if target asset is not loaded', async () => {
    const r = await handle({
      action: 'rect',
      asset_name: 'missing',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(r.isError).toBe(true);
    const content = r.content;
    if (!content || !content[0]) throw new Error('Missing content');
    expect(content[0].text).toContain('not loaded');
  });

  it('creates a rectangular selection mask', async () => {
    const r = await handle({
      action: 'rect',
      asset_name: 'test_asset',
      x: 2,
      y: 2,
      width: 3,
      height: 3,
    });
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel).not.toBeNull();
    expect(sel?.x).toBe(2);
    expect(sel?.y).toBe(2);
    expect(sel?.width).toBe(3);
    expect(sel?.height).toBe(3);

    // Check mask is all true
    expect(sel?.mask[0]?.[0]).toBe(true);
    expect(sel?.mask[2]?.[2]).toBe(true);
  });

  it('clears selection if rect is out of bounds', async () => {
    workspace.selection = {
      asset_name: 'test_asset',
      layer_id: 0,
      frame_index: 0,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      mask: [[true]],
    };
    await handle({ action: 'rect', asset_name: 'test_asset', x: 20, y: 20, width: 5, height: 5 });
    expect(workspace.selection).toBeNull();
  });

  it('creates an all selection mask', async () => {
    const r = await handle({ action: 'all', asset_name: 'test_asset' });
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);
  });

  it('clears the selection', async () => {
    await handle({ action: 'all', asset_name: 'test_asset' });
    expect(workspace.selection).not.toBeNull();

    const r = await handle({ action: 'clear' });
    expect(r.isError).toBeUndefined();
    expect(workspace.selection).toBeNull();
  });

  it('inverts the selection mask', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    await handle({ action: 'invert', asset_name: 'test_asset' });

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);

    expect(sel?.mask[0]?.[0]).toBe(true); // outer is now true
    expect(sel?.mask[2]?.[2]).toBe(false); // inner is now false
  });

  it('selects by color', async () => {
    // Find all color 1 (red) pixels at (2,2) and (4,4)
    const r = await handle({ action: 'by_color', asset_name: 'test_asset', color: 1 });
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);

    expect(sel?.mask[2]?.[2]).toBe(true);
    expect(sel?.mask[4]?.[4]).toBe(true);
    expect(sel?.mask[3]?.[3]).toBe(false); // color 2
    expect(sel?.mask[0]?.[0]).toBe(false); // color 0
  });

  it('copies to clipboard', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    const r = await handle({ action: 'copy', asset_name: 'test_asset' });
    expect(r.isError).toBeUndefined();

    const clip = workspace.clipboard;
    expect(clip).not.toBeNull();
    expect(clip?.width).toBe(2);
    expect(clip?.height).toBe(2);
    expect(clip?.originalX).toBe(2);

    // Pixels from cel should be in clip data: (2,2) = 1, (3,3) = 2
    expect(clip?.data[0]?.[0]).toBe(1);
    expect(clip?.data[1]?.[1]).toBe(2);
    expect(clip?.data[0]?.[1]).toBe(0);
  });

  it('returns error pasting with empty clipboard', async () => {
    const r = await handle({ action: 'paste', target_asset_name: 'test_asset' });
    expect(r.isError).toBe(true);
    const content = r.content;
    if (!content || !content[0]) throw new Error('Missing content');
    expect(content[0].text).toContain('empty');
  });

  it('cuts selection to clipboard and clears original pixels', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    const r = await handle({ action: 'cut', asset_name: 'test_asset' });
    expect(r.isError).toBeUndefined();

    const clip = workspace.clipboard;
    expect(clip?.width).toBe(2);

    // Verify source pixels are 0
    const asset = workspace.loadedAssets.get('test_asset');
    if (!asset) throw new Error('Asset not found');
    const cel = asset.getCel(0, 0);
    if (!cel) throw new Error('Cel not found');
    const celData = (cel as unknown as { data: number[][] }).data;
    expect(celData[2]?.[2]).toBe(0);
    expect(celData[4]?.[4]).toBe(1); // outside cut region
  });

  it('pastes clipboard with offsets and wraps in undo stack', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    await handle({ action: 'copy', asset_name: 'test_asset' });

    // Paste at offset x+4, y+4 -> original 2+4 = 6
    const r = await handle({
      action: 'paste',
      offset_x: 4,
      offset_y: 4,
      target_asset_name: 'test_asset',
    });
    expect(r.isError).toBeUndefined();

    // Verify destination pixels
    const asset = workspace.loadedAssets.get('test_asset');
    if (!asset) throw new Error('Asset not found');
    const cel = asset.getCel(0, 0);
    if (!cel) throw new Error('Cel not found');
    const celData = (cel as unknown as { data: number[][] }).data;
    expect(celData[6]?.[6]).toBe(1);
    expect(celData[7]?.[7]).toBe(2);

    // Verify it was recorded in undo
    workspace.undo();
    const undoneCel = asset.getCel(0, 0);
    if (!undoneCel) throw new Error('Cel not found');
    const undoneData = (undoneCel as unknown as { data: number[][] }).data;
    expect(undoneData[6]?.[6]).toBe(0);
    expect(undoneData[7]?.[7]).toBe(0);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('cut response includes pixel:// resource link', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    const r = await handle({ action: 'cut', asset_name: 'test_asset' });

    expect(r.isError).toBeUndefined();
    const allContent = (r.content ?? []) as unknown as Array<{ type: string; uri?: string }>;
    const links = allContent.filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/asset/test_asset');
  });

  it('paste response includes pixel:// resource link', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    await handle({ action: 'copy', asset_name: 'test_asset' });
    const r = await handle({ action: 'paste', target_asset_name: 'test_asset' });

    expect(r.isError).toBeUndefined();
    const allContent = (r.content ?? []) as unknown as Array<{ type: string; uri?: string }>;
    const links = allContent.filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/asset/test_asset');
  });
});
