import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerEffectTool } from './effect.js';
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

function buildAssetWithPixels(): Asset {
  // 4x4 asset with a small filled shape for outline/cleanup/auto_aa tests
  const data = [
    [0, 0, 0, 0],
    [0, 5, 5, 0],
    [0, 5, 5, 0],
    [0, 0, 0, 0],
  ];
  return {
    name: 'test_sprite',
    width: 4,
    height: 4,
    perspective: 'flat',
    palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
    layers: [{ id: 1, name: 'Base', type: 'image', opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
      '1/0': { x: 0, y: 0, data },
    },
  } as unknown as Parameters<(typeof AssetClass)['fromJSON']>[0];
}

describe('effect tool', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerEffectTool);

    const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
    workspace.setProject(project);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function loadAsset(raw?: Asset) {
    const asset = AssetClass.fromJSON(raw ?? buildMockAsset());
    workspace.loadedAssets.set('test_sprite', asset);
    return asset;
  }

  function getCelData() {
    const asset = workspace.loadedAssets.get('test_sprite');
    if (!asset) throw new Error('Asset missing');
    const cel = asset.getCel(1, 0);
    if (!cel) throw new Error('Cel missing');
    return 'data' in cel ? cel.data : null;
  }

  // --- Schema validation ---

  it('returns error if operations missing or empty', async () => {
    loadAsset();
    const r1 = (await handler({ layer_id: 1, frame_index: 0 })) as HandlerResult;
    expect(r1.isError).toBe(true);

    const r2 = (await handler({ layer_id: 1, frame_index: 0, operations: [] })) as HandlerResult;
    expect(r2.isError).toBe(true);
  });

  it('returns error if asset not loaded', async () => {
    const r = (await handler({
      asset_name: 'nonexistent',
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'cleanup_orphans' }],
    })) as HandlerResult;
    expect(r.isError).toBe(true);
  });

  it('returns error if layer not found', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 99,
      frame_index: 0,
      operations: [{ action: 'cleanup_orphans' }],
    })) as HandlerResult;
    expect(r.isError).toBe(true);
  });

  it('returns error if frame out of range', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 5,
      operations: [{ action: 'cleanup_orphans' }],
    })) as HandlerResult;
    expect(r.isError).toBe(true);
  });

  // --- Gradient effects ---

  it('gradient: fills cel with two-color gradient', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'gradient', color1: 1, color2: 2, direction: 'vertical' }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Top rows should be color1=1, bottom rows should be color2=2
    expect(d[0][0]).toBe(1);
    expect(d[7][0]).toBe(2);
  });

  it('gradient: region-constrained only affects sub-area', async () => {
    loadAsset();
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'gradient', x: 2, y: 2, width: 4, height: 4, color1: 3, color2: 4 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Outside the region should still be 0
    expect(d[0][0]).toBe(0);
    expect(d[1][1]).toBe(0);
    // Inside should be 3 or 4
    expect([3, 4]).toContain(d[2][2]);
    expect([3, 4]).toContain(d[5][5]);
  });

  // --- Dither effects ---

  it('checkerboard: produces alternating pattern', async () => {
    loadAsset();
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'checkerboard', color1: 10, color2: 20 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // (0,0) should be color1, (0,1) should be color2, etc.
    expect(d[0][0]).toBe(10);
    expect(d[0][1]).toBe(20);
    expect(d[1][0]).toBe(20);
    expect(d[1][1]).toBe(10);
  });

  it('noise: fills with color1 or color2', async () => {
    loadAsset();
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'noise', color1: 5, color2: 6 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Every pixel should be 5 or 6
    for (const row of d) {
      for (const px of row) {
        expect([5, 6]).toContain(px);
      }
    }
  });

  it('ordered_dither: produces pattern from two colors', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'ordered_dither', color1: 7, color2: 8 }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    for (const row of d) {
      for (const px of row) {
        expect([7, 8]).toContain(px);
      }
    }
  });

  it('error_diffusion: produces pattern from two colors', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'error_diffusion', color1: 11, color2: 12 }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    for (const row of d) {
      for (const px of row) {
        expect([11, 12]).toContain(px);
      }
    }
  });

  // --- Pixel art refinement ---

  it('outline: adds outline around non-transparent pixels', async () => {
    loadAsset(buildAssetWithPixels());
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'outline', color: 3 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Original filled pixels at (1,1), (1,2), (2,1), (2,2) should remain 5
    expect(d[1][1]).toBe(5);
    expect(d[2][2]).toBe(5);
    // Adjacent transparent pixels should now be outline color 3
    expect(d[0][1]).toBe(3); // Above (1,1)
    expect(d[1][0]).toBe(3); // Left of (1,1)
    expect(d[3][1]).toBe(3); // Below (2,1)
  });

  it('cleanup_orphans: removes isolated pixels', async () => {
    // Create asset with a single isolated pixel
    const raw = buildMockAsset();
    (raw as unknown as Record<string, unknown>).width = 4;
    (raw as unknown as Record<string, unknown>).height = 4;
    const data = [
      [0, 0, 0, 0],
      [0, 5, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    (raw.cels as Record<string, unknown>)['1/0'] = { x: 0, y: 0, data };
    loadAsset(raw);

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'cleanup_orphans' }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    expect(d[1][1]).toBe(0); // Orphan was removed
  });

  it('auto_aa: runs without error on asset with palette', async () => {
    loadAsset(buildAssetWithPixels());
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'auto_aa' }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();
  });

  // --- Animation effects ---

  it('subpixel_shift: shifts content by sub-pixel amount', async () => {
    loadAsset(buildAssetWithPixels());
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'subpixel_shift', intensity: 1.0, direction_x: 1, direction_y: 0 }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    // With intensity 1.0 and rightward direction, everything shifts right by 1px
    // Original col 1 pixels (5) should now be at col 2
    expect(d[1][2]).toBe(5);
    expect(d[1][0]).toBe(0); // Shifted out
  });

  it('smear_frame: smears in given direction', async () => {
    loadAsset(buildAssetWithPixels());
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'smear_frame', intensity: 1.0, direction_x: 1, direction_y: 0 }],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Original pixels should still be there
    expect(d[1][1]).toBe(5);
    // Smear should extend rightward into transparent pixels
    expect(d[1][3]).toBe(5);
  });

  // --- Selection mask ---

  it('selection mask: only affects selected pixels', async () => {
    loadAsset();
    // Select only the top-left 4x4 region
    workspace.selection = {
      asset_name: 'test_sprite',
      layer_id: 1,
      frame_index: 0,
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      mask: Array.from({ length: 4 }, () => new Array<boolean>(4).fill(true)),
    };

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'checkerboard', color1: 10, color2: 20 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Inside selection should have the pattern
    expect(d[0][0]).toBe(10);
    expect(d[0][1]).toBe(20);
    // Outside selection should still be 0
    expect(d[0][4]).toBe(0);
    expect(d[4][0]).toBe(0);
  });

  it('selection mask: full-grid effects constrained to selection', async () => {
    loadAsset(buildAssetWithPixels());
    // Select only the center 2x2
    workspace.selection = {
      asset_name: 'test_sprite',
      layer_id: 1,
      frame_index: 0,
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      mask: [
        [true, true],
        [true, true],
      ],
    };

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'outline', color: 8 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Corners of the asset (outside selection) should not be affected
    expect(d[0][0]).toBe(0);
    expect(d[3][3]).toBe(0);
  });

  // --- Batched operations ---

  it('multiple operations: batched in single command', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [
        { action: 'checkerboard', color1: 1, color2: 2 },
        { action: 'outline', color: 3 },
      ],
    })) as HandlerResult;
    expect(r.isError).toBeUndefined();

    const d = getCelData();
    if (!d) throw new Error('No data');
    // Should have checkerboard with outline applied — non-trivial to verify exactly,
    // but data should be non-zero
    const hasNonZero = d.some((row) => row.some((px) => px !== 0));
    expect(hasNonZero).toBe(true);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('response includes pixel:// resource link after successful effect', async () => {
    loadAsset();
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'gradient', color1: 1, color2: 2, direction: 'vertical' }],
    })) as { content?: Array<{ type: string; uri?: string }> };

    const links = (r.content ?? []).filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/');
  });

  // --- Undo/redo ---

  it('undo/redo: reverts and reinstates batched command', async () => {
    loadAsset();
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'checkerboard', color1: 10, color2: 20 }],
    });

    const d1 = getCelData();
    expect(d1?.[0][0]).toBe(10);

    workspace.undo();
    const d2 = getCelData();
    expect(d2?.[0][0]).toBe(0); // Restored to original

    workspace.redo();
    const d3 = getCelData();
    expect(d3?.[0][0]).toBe(10); // Re-applied
  });
});
