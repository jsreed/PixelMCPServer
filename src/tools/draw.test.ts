import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerDrawTool } from './draw.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn().mockResolvedValue(undefined),
}));

type ToolCallback = (args: Record<string, unknown>) => unknown;
type HandlerResult = { isError?: boolean; content?: { text: string }[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function captureToolCallback(registerFn: (server: any) => void): ToolCallback {
  let cb!: ToolCallback;
  const mockServer = {
    registerTool(_name: string, _config: unknown, callback: ToolCallback) {
      cb = callback;
    },
  };
  registerFn(mockServer);
  return cb;
}

function buildMockAsset(): Asset {
  return {
    name: 'test_sprite',
    width: 10,
    height: 10,
    perspective: 'flat',
    palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
    layers: [{ id: 1, name: 'Base', type: 'image', opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
      '1/0': {
        x: 0,
        y: 0,
        // Initialize a 10x10 zero-filled array
        data: Array.from({ length: 10 }, () => new Array<number>(10).fill(0)),
      },
    },
  } as unknown as Parameters<(typeof AssetClass)['fromJSON']>[0];
}

describe('draw tool', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerDrawTool);

    const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
    workspace.setProject(project);

    const asset = AssetClass.fromJSON(buildMockAsset());
    workspace.loadedAssets.set('test_sprite', asset);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getCelData() {
    const asset = workspace.loadedAssets.get('test_sprite');
    if (!asset) throw new Error('Asset missing');
    const cel = asset.getCel(1, 0);
    if (!cel) throw new Error('Cel missing');
    return 'data' in cel ? cel.data : null;
  }

  it('returns error if operations missing', async () => {
    const r = (await handler({ layer_id: 1, frame_index: 0 })) as HandlerResult;
    expect(r.isError).toBe(true);
  });

  it('returns error for data dimension mismatch in write_pixels', async () => {
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        {
          action: 'write_pixels',
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          data: [[1, 2]], // only 1 row, but height=2
        },
      ],
    })) as HandlerResult;
    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toContain('dimension');
  });

  it('pixel draws a single pixel', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'pixel', x: 5, y: 5, color: 1 }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[5][5]).toBe(1);
  });

  it('line draws between points', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'line', x: 0, y: 0, x2: 2, y2: 2, color: 2 }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[0][0]).toBe(2);
    expect(data[1][1]).toBe(2);
    expect(data[2][2]).toBe(2);
  });

  it('rect draws an outline', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rect', x: 1, y: 1, width: 3, height: 3, color: 3 }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[1][1]).toBe(3);
    expect(data[1][3]).toBe(3);
    expect(data[3][1]).toBe(3);
    expect(data[3][3]).toBe(3);
    expect(data[2][2]).toBe(0); // center is empty
  });

  it('rect draws filled if requested', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rect', x: 1, y: 1, width: 3, height: 3, color: 4, filled: true }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[1][1]).toBe(4);
    expect(data[2][2]).toBe(4); // center is filled
  });

  it('circle draws an outline and fills', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'circle', x: 4, y: 4, radius: 2, color: 5, filled: true }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[4][4]).toBe(5); // center is filled
    expect(data[4][6]).toBe(5); // edge is filled
  });

  it('ellipse draws an outline and fills', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'ellipse', x: 4, y: 4, width: 3, height: 2, color: 6, filled: true }],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[4][4]).toBe(6); // center is filled
  });

  it('fill performs a flood fill', async () => {
    // Draw a boundary box
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'rect', x: 2, y: 2, width: 5, height: 5, color: 7, filled: false },
        { action: 'fill', x: 4, y: 4, color: 8 },
      ],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[2][2]).toBe(7); // boundary
    expect(data[4][4]).toBe(8); // filled interior
    expect(data[1][1]).toBe(0); // outside untouched
  });

  it('write_pixels bulk places data', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        {
          action: 'write_pixels',
          x: 1,
          y: 1,
          width: 2,
          height: 2,
          data: [
            [9, 9],
            [9, 9],
          ],
        },
      ],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[1][1]).toBe(9);
    expect(data[2][2]).toBe(9);
    expect(data[0][0]).toBe(0);
  });

  it('multiple operations in a single batch', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'pixel', x: 0, y: 0, color: 1 },
        { action: 'pixel', x: 1, y: 1, color: 2 },
      ],
    });
    const data = getCelData();
    if (!data) throw new Error('No data');
    expect(data[0][0]).toBe(1);
    expect(data[1][1]).toBe(2);
  });

  it('undoes and redoes a batched draw operation', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'pixel', x: 0, y: 0, color: 1 },
        { action: 'pixel', x: 1, y: 1, color: 2 },
      ],
    });

    const d1 = getCelData();
    if (!d1) throw new Error('No data');
    expect(d1[0][0]).toBe(1);

    workspace.undo();
    const d2 = getCelData();
    if (!d2) throw new Error('No data');
    expect(d2[0][0]).toBe(0); // Restored

    workspace.redo();
    const d3 = getCelData();
    if (!d3) throw new Error('No data');
    expect(d3[0][0]).toBe(1); // Redone
  });

  it('respects the active selection mask', async () => {
    workspace.selection = {
      asset_name: 'test_sprite',
      layer_id: 1,
      frame_index: 0,
      x: 2,
      y: 2,
      width: 3,
      height: 3,
      mask: [
        [true, true, true],
        [true, false, true],
        [true, true, true],
      ],
    };

    // Try to draw a large filled rect covering the selection and beyond
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rect', x: 0, y: 0, width: 10, height: 10, color: 1, filled: true }],
    });

    const data = getCelData();
    if (!data) throw new Error('No data');

    // Inside selection, mask is true
    expect(data[2][2]).toBe(1);
    expect(data[2][3]).toBe(1);
    expect(data[4][4]).toBe(1);

    // Inside selection bounds, but mask is false
    expect(data[3][3]).toBe(0);

    // Outside selection bounds entirely
    expect(data[0][0]).toBe(0);
    expect(data[5][5]).toBe(0);
  });

  it('ignores selection mask if it targets a different asset', async () => {
    workspace.selection = {
      asset_name: 'different_sprite', // Different asset
      layer_id: 1,
      frame_index: 0,
      x: 2,
      y: 2,
      width: 3,
      height: 3,
      mask: [
        [true, true, true],
        [true, false, true],
        [true, true, true],
      ],
    };

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'pixel', x: 3, y: 3, color: 1 }],
    });

    const data = getCelData();
    if (!data) throw new Error('No data');

    // Should draw because the selection mask doesn't apply to this asset
    expect(data[3][3]).toBe(1);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('response includes pixel:// resource link after successful draw', async () => {
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
    })) as { content?: Array<{ type: string; uri?: string }> };

    const links = (r.content ?? []).filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/');
  });

  // ─── frame_range tests ───────────────────────────────────────────────────

  it('frame_range applies drawing operations across multiple frames', async () => {
    // Add extra frames to the asset
    const asset = workspace.loadedAssets.get('test_sprite');
    if (!asset) throw new Error('Asset missing');
    asset.addFrame({ index: 1, duration_ms: 100 });
    asset.addFrame({ index: 2, duration_ms: 100 });

    const r = (await handler({
      layer_id: 1,
      frame_range: [0, 2],
      operations: [{ action: 'pixel', x: 5, y: 5, color: 42 }],
    })) as HandlerResult;

    expect(r.isError).toBeUndefined();

    // All three frames should have the pixel set
    for (let f = 0; f <= 2; f++) {
      const cel = asset.getCel(1, f);
      expect(cel).toBeDefined();
      if (cel && 'data' in cel) {
        expect(cel.data[5][5]).toBe(42);
      }
    }
  });

  it('frame_range undo/redo restores and reapplies all frames', async () => {
    const asset = workspace.loadedAssets.get('test_sprite');
    if (!asset) throw new Error('Asset missing');
    asset.addFrame({ index: 1, duration_ms: 100 });

    await handler({
      layer_id: 1,
      frame_range: [0, 1],
      operations: [{ action: 'pixel', x: 3, y: 3, color: 7 }],
    });

    // Verify draw applied
    for (let f = 0; f <= 1; f++) {
      const cel = asset.getCel(1, f);
      if (cel && 'data' in cel) expect(cel.data[3][3]).toBe(7);
    }

    workspace.undo();

    // After undo, frame 0 reverts (had data before), frame 1 reverts
    const cel0 = asset.getCel(1, 0);
    if (cel0 && 'data' in cel0) expect(cel0.data[3][3]).toBe(0);

    workspace.redo();

    // After redo, frames are re-applied
    for (let f = 0; f <= 1; f++) {
      const cel = asset.getCel(1, f);
      if (cel && 'data' in cel) expect(cel.data[3][3]).toBe(7);
    }
  });

  it('frame_range and frame_index are mutually exclusive', async () => {
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      frame_range: [0, 0],
      operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
    })) as HandlerResult;

    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toContain('mutually exclusive');
  });

  it('frame_range returns error for invalid bounds', async () => {
    const r = (await handler({
      layer_id: 1,
      frame_range: [0, 99],
      operations: [{ action: 'pixel', x: 0, y: 0, color: 1 }],
    })) as HandlerResult;

    expect(r.isError).toBe(true);
    expect(r.content?.[0]?.text).toContain('invalid');
  });

  it('flood fill respects selection boundaries', async () => {
    workspace.selection = {
      asset_name: 'test_sprite',
      layer_id: 1,
      frame_index: 0,
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      mask: Array.from({ length: 5 }, () => new Array<boolean>(5).fill(true)),
    };

    // Make the right edge of mask false
    for (let y = 0; y < 5; y++) {
      workspace.selection.mask[y][4] = false;
    }

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'fill', x: 2, y: 2, color: 8 }],
    });

    const data = getCelData();
    if (!data) throw new Error('No data');

    expect(data[2][2]).toBe(8); // inside selection
    expect(data[2][3]).toBe(8); // inside selection

    // At x=4, mask is false. So fill should treat it as boundary
    expect(data[2][4]).toBe(0);

    // At x=5, outside the bounding box of selection. Fill should never reach it
    expect(data[2][5]).toBe(0);
  });
});

// ─── Isometric draw operations ───────────────────────────────────────────────

describe('draw tool — isometric operations', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  /** Builds a 20×20 isometric asset with tile_width=4, tile_height=4 */
  function buildIsoAsset() {
    return AssetClass.fromJSON({
      name: 'iso_sprite',
      width: 20,
      height: 20,
      perspective: 'isometric',
      tile_width: 4,
      tile_height: 4,
      palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
      layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: Array.from({ length: 20 }, () => new Array<number>(20).fill(0)),
        },
      },
    } as unknown as Parameters<typeof AssetClass.fromJSON>[0]);
  }

  function getCelData(ws: WorkspaceClass, assetName: string) {
    const asset = ws.loadedAssets.get(assetName);
    if (!asset) throw new Error('Asset missing');
    const cel = asset.getCel(1, 0);
    if (!cel || !('data' in cel)) return null;
    return cel.data;
  }

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerDrawTool);

    const project = ProjectClass.create('/tmp/iso-test/pixelmcp.json', 'IsoProject');
    project.registerAsset('iso_sprite', { path: 'sprites/iso_sprite.json', type: 'sprite' });
    workspace.setProject(project);
    workspace.loadedAssets.set('iso_sprite', buildIsoAsset());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('iso_tile paints pixels for a 4×4 tile at (0,0)', async () => {
    const r = (await handler({
      asset_name: 'iso_sprite',
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'iso_tile', col: 0, row: 0, elevation: 0, color: 5 }],
    })) as HandlerResult;

    expect(r.isError).toBeUndefined();
    const data = getCelData(workspace, 'iso_sprite');
    if (!data) throw new Error('No data');
    // At elevation 0, the rhombus appears at the projected origin.
    // The centre pixel (y=2, x=2) should have been painted.
    const painted = data.flat().some((v) => v === 5);
    expect(painted).toBe(true);
  });

  it('iso_tile returns error on a flat asset', async () => {
    // Add a flat asset
    const flatAsset = AssetClass.fromJSON({
      name: 'flat_sprite',
      width: 8,
      height: 8,
      perspective: 'flat',
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
      layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': { x: 0, y: 0, data: Array.from({ length: 8 }, () => new Array<number>(8).fill(0)) },
      },
    } as unknown as Parameters<typeof AssetClass.fromJSON>[0]);
    workspace.loadedAssets.set('flat_sprite', flatAsset);

    const r = (await handler({
      asset_name: 'flat_sprite',
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'iso_tile', col: 0, row: 0, elevation: 0, color: 1 }],
    })) as HandlerResult;
    expect(r.isError).toBe(true);
  });

  it('iso_cube paints distinct pixels with three different colors', async () => {
    const r = (await handler({
      asset_name: 'iso_sprite',
      layer_id: 1,
      frame_index: 0,
      operations: [
        {
          action: 'iso_cube',
          col: 2,
          row: 2,
          elevation: 0,
          top_color: 3,
          left_color: 4,
          right_color: 5,
        },
      ],
    })) as HandlerResult;

    expect(r.isError).toBeUndefined();
    const data = getCelData(workspace, 'iso_sprite');
    if (!data) throw new Error('No data');
    const flat = data.flat();
    // At least some pixels should have been set (we don't assert exact geometry in integration test)
    expect(flat.some((v) => v === 3 || v === 4 || v === 5)).toBe(true);
  });

  it('iso_wall length=2 along x paints more pixels than length=1', async () => {
    // Length 1 wall
    const before1 = AssetClass.fromJSON({
      name: 'w1',
      width: 40,
      height: 40,
      perspective: 'isometric',
      tile_width: 4,
      tile_height: 4,
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
      layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: Array.from({ length: 40 }, () => new Array<number>(40).fill(0)),
        },
      },
    } as unknown as Parameters<typeof AssetClass.fromJSON>[0]);
    workspace.loadedAssets.set('w1', before1);
    await handler({
      asset_name: 'w1',
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'iso_wall', col: 2, row: 2, length: 1, axis: 'x', height: 2, color: 7 },
      ],
    });
    const count1 = before1.getCel(1, 0) as unknown as { data: number[][] };
    const painted1 = count1.data.flat().filter((v) => v === 7).length;

    // Length 2 wall
    const before2 = AssetClass.fromJSON({
      name: 'w2',
      width: 40,
      height: 40,
      perspective: 'isometric',
      tile_width: 4,
      tile_height: 4,
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
      layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: Array.from({ length: 40 }, () => new Array<number>(40).fill(0)),
        },
      },
    } as unknown as Parameters<typeof AssetClass.fromJSON>[0]);
    workspace.loadedAssets.set('w2', before2);
    await handler({
      asset_name: 'w2',
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'iso_wall', col: 2, row: 2, length: 2, axis: 'x', height: 2, color: 7 },
      ],
    });
    const count2 = before2.getCel(1, 0) as unknown as { data: number[][] };
    const painted2 = count2.data.flat().filter((v) => v === 7).length;

    expect(painted2).toBeGreaterThan(painted1);
  });
});
