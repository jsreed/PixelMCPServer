import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerPaletteTool } from './palette.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';
import * as paletteIo from '../io/palette-io.js';

// Mock I/O
vi.mock('../io/palette-io.js', () => ({
  loadPaletteFile: vi.fn(),
  savePaletteFile: vi.fn(),
}));
vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn(),
}));

// Capture tool callback
interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type ToolCallback = (args: Record<string, unknown>) => Promise<ToolResult>;

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

/** Minimal asset data with a few palette colors set */
const mockAssetData = {
  name: 'test_sprite',
  width: 4,
  height: 4,
  perspective: 'flat' as const,
  palette: Array.from({ length: 256 }, (_, i) => {
    if (i === 1) return [20, 12, 28, 255];
    if (i === 2) return [68, 36, 52, 255];
    if (i === 5) return [200, 100, 50, 255];
    if (i === 10) return [100, 50, 25, 255];
    return [0, 0, 0, 0] as [number, number, number, number];
  }) as Asset['palette'],
  layers: [{ id: 1, name: 'Layer 1', type: 'image' as const, opacity: 255, visible: true }],
  frames: [{ index: 0, duration_ms: 100 }],
  tags: [],
  cels: {
    '1/0': {
      x: 0,
      y: 0,
      data: [
        [1, 1, 2, 0],
        [1, 2, 2, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
  },
};

describe('palette tool', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerPaletteTool);

    // Set up project and load asset
    const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
    project.registerAsset('sprite', { path: 'sprites/test.json', type: 'sprite' });
    workspace.setProject(project);

    // Directly load mock asset into workspace
    const asset = AssetClass.fromJSON(
      JSON.parse(JSON.stringify(mockAssetData)) as typeof mockAssetData,
    );
    workspace.loadedAssets.set('sprite', asset);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getAsset(name: string) {
    const a = workspace.loadedAssets.get(name);
    if (!a) throw new Error(`Asset ${name} not found`);
    return a;
  }

  // ─── validation ──────────────────────────────────────────────────

  it('requires asset_name', async () => {
    const result = await handler({ action: 'info' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('asset_name');
  });

  it('returns error for unloaded asset', async () => {
    const result = await handler({ action: 'info', asset_name: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not loaded');
  });

  // ─── info action ─────────────────────────────────────────────────

  it('info returns defined palette entries with usage counts', async () => {
    const result = await handler({ action: 'info', asset_name: 'sprite' });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as {
      entries: Array<{ index: number; usage: number }>;
    };
    expect(data.entries.length).toBeGreaterThan(0);

    // Index 1 should have usage count 3 (three pixels reference it)
    const idx1 = data.entries.find((e) => e.index === 1);
    expect(idx1).toBeDefined();
    expect(idx1?.usage).toBe(3);

    // Index 2 should have usage count 3
    const idx2 = data.entries.find((e) => e.index === 2);
    expect(idx2).toBeDefined();
    expect(idx2?.usage).toBe(3);
  });

  // ─── set action ──────────────────────────────────────────────────

  it('set updates a palette entry', async () => {
    const result = await handler({
      action: 'set',
      asset_name: 'sprite',
      index: 3,
      rgba: [255, 0, 0, 255],
    });

    expect(result.isError).toBeUndefined();
    const asset = getAsset('sprite');
    expect(asset.palette.get(3)).toEqual([255, 0, 0, 255]);
  });

  it('set without index returns error', async () => {
    const result = await handler({
      action: 'set',
      asset_name: 'sprite',
      rgba: [255, 0, 0, 255],
    });
    expect(result.isError).toBe(true);
  });

  it('set is undoable', async () => {
    const asset = getAsset('sprite');
    const before = asset.palette.get(3);

    await handler({ action: 'set', asset_name: 'sprite', index: 3, rgba: [255, 0, 0, 255] });
    expect(asset.palette.get(3)).toEqual([255, 0, 0, 255]);

    workspace.undo();
    expect(asset.palette.get(3)).toEqual(before);
  });

  // ─── set_bulk action ─────────────────────────────────────────────

  it('set_bulk sets multiple entries', async () => {
    const entries = [
      { index: 3, rgba: [255, 0, 0, 255] },
      { index: 4, rgba: [0, 255, 0, 255] },
    ];
    const result = await handler({ action: 'set_bulk', asset_name: 'sprite', entries });

    expect(result.isError).toBeUndefined();
    const asset = getAsset('sprite');
    expect(asset.palette.get(3)).toEqual([255, 0, 0, 255]);
    expect(asset.palette.get(4)).toEqual([0, 255, 0, 255]);
  });

  // ─── swap action ─────────────────────────────────────────────────

  it('swap exchanges two palette entries', async () => {
    const asset = getAsset('sprite');
    const c1 = asset.palette.get(1);
    const c2 = asset.palette.get(2);

    const result = await handler({
      action: 'swap',
      asset_name: 'sprite',
      index: 1,
      index2: 2,
    });

    expect(result.isError).toBeUndefined();
    expect(asset.palette.get(1)).toEqual(c2);
    expect(asset.palette.get(2)).toEqual(c1);
  });

  // ─── generate_ramp action ────────────────────────────────────────

  it('generate_ramp fills interpolated colors', async () => {
    const asset = getAsset('sprite');
    // Set endpoints
    asset.palette.set(20, [0, 0, 0, 255]);
    asset.palette.set(24, [100, 200, 50, 255]);

    const result = await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 20,
      color2: 24,
    });

    expect(result.isError).toBeUndefined();

    // Midpoint at index 22 should be ~halfway
    const mid = asset.palette.get(22);
    expect(mid[0]).toBe(50);
    expect(mid[1]).toBe(100);
    expect(mid[2]).toBe(25);
    expect(mid[3]).toBe(255);
  });

  it('generate_ramp with invalid order returns error', async () => {
    const result = await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 10,
      color2: 5,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('color1 < color2');
  });

  it('generate_ramp with hue_shift_start and hue_shift_end produces different intermediates', async () => {
    const asset = getAsset('sprite');
    // Set red and blue endpoints
    asset.palette.set(30, [255, 0, 0, 255]);
    asset.palette.set(34, [0, 0, 255, 255]);

    // Get plain ramp intermediates first
    await handler({ action: 'generate_ramp', asset_name: 'sprite', color1: 30, color2: 34 });
    const plainMid = [...asset.palette.get(32)];

    // Undo and redo with hue shift
    workspace.undo();

    const result = await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 30,
      color2: 34,
      hue_shift_start: 60,
      hue_shift_end: -60,
    });

    expect(result.isError).toBeUndefined();

    const shiftedMid = asset.palette.get(32);
    const differs =
      plainMid[0] !== shiftedMid[0] ||
      plainMid[1] !== shiftedMid[1] ||
      plainMid[2] !== shiftedMid[2];
    expect(differs).toBe(true);
  });

  it('generate_ramp with hue shift preserves endpoints', async () => {
    const asset = getAsset('sprite');
    asset.palette.set(40, [255, 0, 0, 255]);
    asset.palette.set(44, [0, 255, 0, 255]);

    await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 40,
      color2: 44,
      hue_shift_start: 90,
      hue_shift_end: 90,
    });

    expect(asset.palette.get(40)).toEqual([255, 0, 0, 255]);
    expect(asset.palette.get(44)).toEqual([0, 255, 0, 255]);
  });

  it('generate_ramp with hue shift includes "(hue-shifted)" in response message', async () => {
    const asset = getAsset('sprite');
    asset.palette.set(50, [255, 0, 0, 255]);
    asset.palette.set(54, [0, 0, 255, 255]);

    const result = await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 50,
      color2: 54,
      hue_shift_start: 30,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).toContain('(hue-shifted)');
  });

  it('generate_ramp without hue shift does not include "(hue-shifted)" in response', async () => {
    const asset = getAsset('sprite');
    asset.palette.set(60, [255, 0, 0, 255]);
    asset.palette.set(64, [0, 0, 255, 255]);

    const result = await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 60,
      color2: 64,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).not.toContain('(hue-shifted)');
  });

  it('hue-shifted ramp is undoable', async () => {
    const asset = getAsset('sprite');
    asset.palette.set(70, [255, 0, 0, 255]);
    asset.palette.set(74, [0, 0, 255, 255]);

    // Record original state of intermediates (should be transparent/zeroed)
    const beforeMid = [...asset.palette.get(72)];

    await handler({
      action: 'generate_ramp',
      asset_name: 'sprite',
      color1: 70,
      color2: 74,
      hue_shift_start: 45,
    });

    // Intermediates should now be set
    const afterMid = asset.palette.get(72);
    expect(afterMid).not.toEqual(beforeMid);

    // Undo should restore original state
    workspace.undo();
    expect(asset.palette.get(72)).toEqual(beforeMid);
  });

  // ─── save action ─────────────────────────────────────────────────

  it('save writes palette to file', async () => {
    vi.mocked(paletteIo.savePaletteFile).mockResolvedValue(undefined);

    const result = await handler({
      action: 'save',
      asset_name: 'sprite',
      path: 'palettes/test.json',
      name: 'test_pal',
    });

    expect(result.isError).toBeUndefined();
    expect(paletteIo.savePaletteFile).toHaveBeenCalledOnce();
  });

  // ─── load action ─────────────────────────────────────────────────

  it('load reads palette from file and applies it', async () => {
    vi.mocked(paletteIo.loadPaletteFile).mockResolvedValue({
      name: 'loaded_pal',
      colors: [[255, 0, 0, 255], [0, 255, 0, 255], null] as unknown as Array<
        [number, number, number, number] | null
      >,
    });

    const result = await handler({
      action: 'load',
      asset_name: 'sprite',
      path: 'palettes/test.json',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).toContain('loaded');

    // Palette should be updated
    const asset = getAsset('sprite');
    expect(asset.palette.get(0)).toEqual([255, 0, 0, 255]);
    expect(asset.palette.get(1)).toEqual([0, 255, 0, 255]);
  });

  it('load with missing file returns error', async () => {
    vi.mocked(paletteIo.loadPaletteFile).mockRejectedValue(
      new Error('Palette file not found: /bad'),
    );

    const result = await handler({
      action: 'load',
      asset_name: 'sprite',
      path: 'palettes/missing.json',
    });

    expect(result.isError).toBe(true);
  });

  // ─── fetch_lospec action ─────────────────────────────────────────

  it('fetch_lospec fetches and applies palette from Lospec API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'test-palette',
          colors: ['ff0000', '00ff00', '0000ff'],
        }),
    } as Response);

    const result = await handler({
      action: 'fetch_lospec',
      asset_name: 'sprite',
      name: 'test-palette',
    });

    expect(result.isError).toBeUndefined();

    const asset = getAsset('sprite');
    expect(asset.palette.get(0)).toEqual([0, 0, 0, 0]); // Index 0 is transparency
    expect(asset.palette.get(1)).toEqual([255, 0, 0, 255]);
    expect(asset.palette.get(2)).toEqual([0, 255, 0, 255]);
    expect(asset.palette.get(3)).toEqual([0, 0, 255, 255]);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('response includes pixel:// palette resource link after set', async () => {
    const result = await handler({
      action: 'set',
      asset_name: 'sprite',
      index: 5,
      rgba: [100, 150, 200, 255],
    });

    expect(result.isError).toBeUndefined();
    const links = (result.content as Array<{ type: string; uri?: string }>).filter(
      (c) => c.type === 'resource_link',
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/palette/');
  });

  it('fetch_lospec handles API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await handler({
      action: 'fetch_lospec',
      asset_name: 'sprite',
      name: 'missing-palette',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('missing-palette');
  });

  // ─── set_color_cycling action ─────────────────────────────────────

  it('set_color_cycling sets entries on asset', async () => {
    const result = await handler({
      action: 'set_color_cycling',
      asset_name: 'sprite',
      color_cycling: [{ start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' }],
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).toContain('1 entry');

    const asset = getAsset('sprite');
    expect(asset.color_cycling).toEqual([
      { start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' },
    ]);
  });

  it('set_color_cycling with empty array clears entries', async () => {
    // First set some entries
    const asset = getAsset('sprite');
    asset.color_cycling = [{ start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' }];

    const result = await handler({
      action: 'set_color_cycling',
      asset_name: 'sprite',
      color_cycling: [],
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).toContain('cleared');
    expect(asset.color_cycling).toBeUndefined();
  });

  it('set_color_cycling with undefined clears entries', async () => {
    const asset = getAsset('sprite');
    asset.color_cycling = [{ start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' }];

    const result = await handler({
      action: 'set_color_cycling',
      asset_name: 'sprite',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text) as { message: string };
    expect(data.message).toContain('cleared');
    expect(asset.color_cycling).toBeUndefined();
  });

  it('set_color_cycling validates start_index < end_index', async () => {
    const result = await handler({
      action: 'set_color_cycling',
      asset_name: 'sprite',
      color_cycling: [{ start_index: 7, end_index: 3, speed_ms: 100, direction: 'forward' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('start_index');
  });

  it('set_color_cycling is undoable', async () => {
    await handler({
      action: 'set_color_cycling',
      asset_name: 'sprite',
      color_cycling: [{ start_index: 0, end_index: 7, speed_ms: 100, direction: 'forward' }],
    });

    const asset = getAsset('sprite');
    expect(asset.color_cycling).toBeDefined();

    workspace.undo();
    expect(asset.color_cycling).toBeUndefined();
  });
});
