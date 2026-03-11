import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerTransformTool } from './transform.js';
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
    width: 4,
    height: 4,
    perspective: 'flat',
    palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
    layers: [{ id: 1, name: 'Base', type: 'image', opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
      '1/0': {
        x: 0,
        y: 0,
        data: [
          [1, 2, 3, 4],
          [5, 6, 7, 8],
          [9, 10, 11, 12],
          [13, 14, 15, 16],
        ],
      },
    },
  } as unknown as Parameters<(typeof AssetClass)['fromJSON']>[0];
}

describe('transform tool', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerTransformTool);

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

  it('returns error if operations missing or empty', async () => {
    const r1 = (await handler({ layer_id: 1, frame_index: 0 })) as HandlerResult;
    expect(r1.isError).toBe(true);

    const r2 = (await handler({ layer_id: 1, frame_index: 0, operations: [] })) as HandlerResult;
    expect(r2.isError).toBe(true);
  });

  it('returns error if shear or shift miss amounts', async () => {
    const r1 = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'shear' }],
    })) as HandlerResult;
    expect(r1.isError).toBe(true);

    const r2 = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'shift' }],
    })) as HandlerResult;
    expect(r2.isError).toBe(true);
  });

  it('rotate: applies 90 degree rotation', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rotate', angle: 90 }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [13, 9, 5, 1],
      [14, 10, 6, 2],
      [15, 11, 7, 3],
      [16, 12, 8, 4],
    ]);
  });

  it('flip_h: flips horizontally', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'flip_h' }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [4, 3, 2, 1],
      [8, 7, 6, 5],
      [12, 11, 10, 9],
      [16, 15, 14, 13],
    ]);
  });

  it('flip_v: flips vertically', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'flip_v' }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [13, 14, 15, 16],
      [9, 10, 11, 12],
      [5, 6, 7, 8],
      [1, 2, 3, 4],
    ]);
  });

  it('shear: applies shear offset', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'shear', amount_x: 2 }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    // row 0: shift = round(2 * 0 / 3) = 0
    // row 1: shift = round(2 * 1 / 3) = 1
    // row 2: shift = round(2 * 2 / 3) = 1
    // row 3: shift = round(2 * 3 / 3) = 2
    expect(d).toEqual([
      [1, 2, 3, 4],
      [0, 5, 6, 7],
      [0, 9, 10, 11],
      [0, 0, 13, 14],
    ]);
  });

  it('shift: applies translation offset', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'shift', amount_x: 1, amount_y: 1 }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [0, 0, 0, 0],
      [0, 1, 2, 3],
      [0, 5, 6, 7],
      [0, 9, 10, 11],
    ]);
  });

  it('multiple operations: batch rotate + flip', async () => {
    // 90 deg rotate gives:
    // [13, 9, 5, 1]
    // [14, 10, 6, 2]
    // [15, 11, 7, 3]
    // [16, 12, 8, 4]
    // Then flip_h gives:
    // [1, 5, 9, 13]
    // [2, 6, 10, 14]
    // [3, 7, 11, 15]
    // [4, 8, 12, 16]
    // Which is the transpose of the original matrix
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rotate', angle: 90 }, { action: 'flip_h' }],
    });
    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [1, 5, 9, 13],
      [2, 6, 10, 14],
      [3, 7, 11, 15],
      [4, 8, 12, 16],
    ]);
  });

  it('selection mask: only transforms selected region', async () => {
    // Select inner 2x2
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

    // Before inner 2x2:
    // [6, 7]
    // [10, 11]

    // flip_h on the sub-region gives:
    // [7, 6]
    // [11, 10]

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'flip_h' }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [1, 2, 3, 4],
      [5, 7, 6, 8],
      [9, 11, 10, 12],
      [13, 14, 15, 16],
    ]);
  });

  it('selection mask: clears original masked area if transformed region is smaller/rotated', async () => {
    // Select a 3x2 area
    workspace.selection = {
      asset_name: 'test_sprite',
      layer_id: 1,
      frame_index: 0,
      x: 0,
      y: 0,
      width: 3,
      height: 2,
      mask: [
        [true, true, true],
        [true, true, true],
      ],
    };

    // Before 3x2:
    // [1, 2, 3]
    // [5, 6, 7]

    // Rotate 90 deg gives 2x3:
    // [5, 1]
    // [6, 2]
    // [7, 3]

    // If we write this back to the top-left of the bounding box (0,0), it occupies:
    // row 0: [5, 1], col 2 was mask=true, so it must be CLEAR (0)
    // row 1: [6, 2], col 2 was mask=true, so it must be CLEAR (0)
    // row 2 is outside bounding box height? Wait, the selection is 3x2. My write-back loops min(subH, outH) which is min(2, 3) = 2!!
    // Wait, the specification: if a 3x2 is rotated to 2x3, it should either draw the full 2x3,
    // or clip. Usually it's drawn, but bounded by the mask.
    // If bounded by the mask, row 2 is outside the mask.

    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rotate', angle: 90 }],
    });

    const d = getCelData();
    if (!d) throw new Error('No data');

    expect(d).toEqual([
      [5, 1, 0, 4], // col 2 is cleared
      [6, 2, 0, 8], // col 2 is cleared
      [9, 10, 11, 12],
      [13, 14, 15, 16],
    ]);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('response includes pixel:// resource link after successful transform', async () => {
    const r = (await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'flip_h' }],
    })) as { content?: Array<{ type: string; uri?: string }> };

    const links = (r.content ?? []).filter((c) => c.type === 'resource_link');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/');
  });

  it('undo/redo: reverts and reinstates batched command', async () => {
    await handler({
      layer_id: 1,
      frame_index: 0,
      operations: [{ action: 'rotate', angle: 90 }, { action: 'flip_h' }],
    });

    const d1 = getCelData();
    expect(d1?.[0][1]).toBe(5);

    workspace.undo();
    const d2 = getCelData();
    expect(d2?.[0][1]).toBe(2); // restored to original

    workspace.redo();
    const d3 = getCelData();
    expect(d3?.[0][1]).toBe(5); // re-applied
  });
});
