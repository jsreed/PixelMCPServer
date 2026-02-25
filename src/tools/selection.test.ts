import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { registerSelectionTool } from './selection.js';
import * as errors from '../errors.js';

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn(),
}));

describe('selection tool', () => {
  let mockServer: any;
  let registeredHandler: (args: any) => Promise<any>;
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
      layers: [{ id: 0, _sync: { type: 'image', visible: true, locked: false, opacity: 255 } }],
      frames: [{ index: 0 }],
      cels: {},
    } as any);
    workspace.loadedAssets.set('test_asset', asset);

    // Put some data in the first cel
    const data = Array.from({ length: 10 }, () => new Array(10).fill(0));
    data[2][2] = 1; // Red pixel at (2,2)
    data[3][3] = 2; // Green pixel at (3,3)
    data[4][4] = 1; // Red pixel at (4,4)
    asset.setCel(0, 0, { x: 0, y: 0, data });

    mockServer = {
      registerTool: vi.fn((name: string, arg2: any, arg3: any, arg4?: any) => {
        if (typeof arg2 === 'string') {
          registeredHandler = arg4;
        } else {
          registeredHandler = arg3;
        }
      }),
    };

    registerSelectionTool(mockServer);
  });

  async function handle(args: any) {
    return await registeredHandler(args);
  }

  it('returns error if target asset is not loaded', async () => {
    const r = (await handle({
      action: 'rect',
      asset_name: 'missing',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    })) as any;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('not loaded');
  });

  it('creates a rectangular selection mask', async () => {
    const r = (await handle({
      action: 'rect',
      asset_name: 'test_asset',
      x: 2,
      y: 2,
      width: 3,
      height: 3,
    })) as any;
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel).not.toBeNull();
    expect(sel?.x).toBe(2);
    expect(sel?.y).toBe(2);
    expect(sel?.width).toBe(3);
    expect(sel?.height).toBe(3);

    // Check mask is all true
    expect(sel?.mask[0][0]).toBe(true);
    expect(sel?.mask[2][2]).toBe(true);
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
    const r = (await handle({ action: 'all', asset_name: 'test_asset' })) as any;
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);
  });

  it('clears the selection', async () => {
    await handle({ action: 'all', asset_name: 'test_asset' });
    expect(workspace.selection).not.toBeNull();

    const r = (await handle({ action: 'clear' })) as any;
    expect(r.isError).toBeUndefined();
    expect(workspace.selection).toBeNull();
  });

  it('inverts the selection mask', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    await handle({ action: 'invert', asset_name: 'test_asset' });

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);

    expect(sel?.mask[0][0]).toBe(true); // outer is now true
    expect(sel?.mask[2][2]).toBe(false); // inner is now false
  });

  it('selects by color', async () => {
    // Find all color 1 (red) pixels at (2,2) and (4,4)
    const r = (await handle({ action: 'by_color', asset_name: 'test_asset', color: 1 })) as any;
    expect(r.isError).toBeUndefined();

    const sel = workspace.selection;
    expect(sel?.width).toBe(10);
    expect(sel?.height).toBe(10);

    expect(sel?.mask[2][2]).toBe(true);
    expect(sel?.mask[4][4]).toBe(true);
    expect(sel?.mask[3][3]).toBe(false); // color 2
    expect(sel?.mask[0][0]).toBe(false); // color 0
  });

  it('copies to clipboard', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    const r = (await handle({ action: 'copy', asset_name: 'test_asset' })) as any;
    expect(r.isError).toBeUndefined();

    const clip = workspace.clipboard;
    expect(clip).not.toBeNull();
    expect(clip?.width).toBe(2);
    expect(clip?.height).toBe(2);
    expect(clip?.originalX).toBe(2);

    // Pixels from cel should be in clip data: (2,2) = 1, (3,3) = 2
    expect(clip?.data[0][0]).toBe(1);
    expect(clip?.data[1][1]).toBe(2);
    expect(clip?.data[0][1]).toBe(0);
  });

  it('returns error pasting with empty clipboard', async () => {
    const r = (await handle({ action: 'paste', target_asset_name: 'test_asset' })) as any;
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('empty');
  });

  it('cuts selection to clipboard and clears original pixels', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    const r = (await handle({ action: 'cut', asset_name: 'test_asset' })) as any;
    expect(r.isError).toBeUndefined();

    const clip = workspace.clipboard;
    expect(clip?.width).toBe(2);

    // Verify source pixels are 0
    const asset = workspace.loadedAssets.get('test_asset')!;
    const cel = asset.getCel(0, 0)! as any;
    expect(cel.data[2][2]).toBe(0);
    expect(cel.data[4][4]).toBe(1); // outside cut region
  });

  it('pastes clipboard with offsets and wraps in undo stack', async () => {
    await handle({ action: 'rect', asset_name: 'test_asset', x: 2, y: 2, width: 2, height: 2 });
    await handle({ action: 'copy', asset_name: 'test_asset' });

    // Paste at offset x+4, y+4 -> original 2+4 = 6
    const r = (await handle({
      action: 'paste',
      offset_x: 4,
      offset_y: 4,
      target_asset_name: 'test_asset',
    })) as any;
    expect(r.isError).toBeUndefined();

    // Verify destination pixels
    const asset = workspace.loadedAssets.get('test_asset')!;
    const cel = asset.getCel(0, 0)! as any;
    expect(cel.data[6][6]).toBe(1);
    expect(cel.data[7][7]).toBe(2);

    // Verify it was recorded in undo
    workspace.undo();
    const undoneCel = asset.getCel(0, 0)! as any;
    expect(undoneCel.data[6][6]).toBe(0);
    expect(undoneCel.data[7][7]).toBe(0);
  });
});
