import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAssetTool } from './asset.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';
import { packCelKey } from '../types/cel.js';

// Mock I/O modules
vi.mock('../io/asset-io.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../io/palette-io.js', () => ({
  loadPaletteFile: vi.fn(),
  savePaletteFile: vi.fn(),
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

/** Minimal valid asset for testing */
function buildMockAsset(overrides?: Partial<Asset>): Asset {
  return {
    name: 'test_sprite',
    width: 8,
    height: 8,
    perspective: 'flat' as const,
    palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
    layers: [
      { id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true },
      {
        id: 2,
        name: 'Hitbox',
        type: 'shape' as const,
        opacity: 255,
        visible: true,
        role: 'hitbox',
        physics_layer: 1,
      },
    ],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
      '1/0': {
        x: 0,
        y: 0,
        data: [
          [1, 1, 0, 0, 0, 0, 0, 0],
          [1, 1, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0, 0],
        ],
      },
    },
    ...overrides,
  };
}

describe('asset tool', () => {
  let handler: ToolCallback;
  let workspace: WorkspaceClass;

  beforeEach(() => {
    WorkspaceClass.reset();
    workspace = WorkspaceClass.instance();
    handler = captureToolCallback(registerAssetTool);

    const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
    project.registerAsset('sprite', { path: 'sprites/test.json', type: 'sprite' });
    workspace.setProject(project);

    const asset = AssetClass.fromJSON(buildMockAsset());
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

  // ─── Validation ──────────────────────────────────────────────────

  it('requires asset_name for most actions', async () => {
    const r = await handler({ action: 'info' });
    expect(r.isError).toBe(true);
  });

  it('returns error for unloaded asset', async () => {
    const r = await handler({ action: 'info', asset_name: 'ghost' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('not loaded');
  });

  // ─── info ────────────────────────────────────────────────────────

  it('info returns asset structure', async () => {
    const r = await handler({ action: 'info', asset_name: 'sprite' });
    expect(r.isError).toBeUndefined();
    const data = JSON.parse(r.content[0].text) as {
      name: string;
      width: number;
      layers: unknown[];
      frames: unknown[];
    };
    expect(data.name).toBe('test_sprite');
    expect(data.width).toBe(8);
    expect(data.layers).toHaveLength(2);
    expect(data.frames).toHaveLength(1);
  });

  // ─── get_cel ─────────────────────────────────────────────────────

  it('get_cel returns pixel data', async () => {
    const r = await handler({
      action: 'get_cel',
      asset_name: 'sprite',
      layer_id: 1,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as {
      width: number;
      height: number;
      data: number[][];
      is_linked: boolean;
    };
    expect(data.width).toBe(8);
    expect(data.height).toBe(8);
    expect(data.data[0][0]).toBe(1);
    expect(data.is_linked).toBe(false);
  });

  it('get_cel missing layer_id returns error', async () => {
    const r = await handler({ action: 'get_cel', asset_name: 'sprite', frame_index: 0 });
    expect(r.isError).toBe(true);
  });

  // ─── get_cels (range mode) ───────────────────────────────────────

  it('get_cels range mode returns array', async () => {
    const r = await handler({
      action: 'get_cels',
      asset_name: 'sprite',
      layer_id: 1,
      frame_start: 0,
      frame_end: 0,
    });
    const data = JSON.parse(r.content[0].text) as {
      cels: Array<{ data: unknown }>;
    };
    expect(data.cels).toHaveLength(1);
    expect(data.cels[0].data).toBeDefined();
  });

  // ─── Layer management ────────────────────────────────────────────

  it('add_layer adds a new layer', async () => {
    const r = await handler({
      action: 'add_layer',
      asset_name: 'sprite',
      name: 'Overlay',
      layer_type: 'image',
    });
    expect(r.isError).toBeUndefined();
    const data = JSON.parse(r.content[0].text) as { layer_id: number };
    expect(data.layer_id).toBeDefined();
    expect(getAsset('sprite').layers).toHaveLength(3);
  });

  it('add_layer is undoable', async () => {
    const before = getAsset('sprite').layers.length;
    await handler({
      action: 'add_layer',
      asset_name: 'sprite',
      name: 'Overlay',
      layer_type: 'image',
    });
    expect(getAsset('sprite').layers).toHaveLength(before + 1);
    workspace.undo();
    expect(getAsset('sprite').layers).toHaveLength(before);
  });

  it('add_group adds a group layer', async () => {
    const r = await handler({
      action: 'add_group',
      asset_name: 'sprite',
      name: 'MyGroup',
    });
    expect(r.isError).toBeUndefined();
    const asset = getAsset('sprite');
    const grp = asset.layers.find((l) => l.name === 'MyGroup');
    expect(grp).toBeDefined();
    expect(grp?.type).toBe('group');
  });

  it('remove_layer removes a layer', async () => {
    await handler({ action: 'remove_layer', asset_name: 'sprite', layer_id: 1 });
    const asset = getAsset('sprite');
    expect(asset.layers.find((l) => l.id === 1)).toBeUndefined();
  });

  // ─── Frame management ────────────────────────────────────────────

  it('add_frame appends a frame', async () => {
    const r = await handler({
      action: 'add_frame',
      asset_name: 'sprite',
      duration_ms: 200,
    });
    expect(r.isError).toBeUndefined();
    expect(getAsset('sprite').frames).toHaveLength(2);
  });

  it('remove_frame removes a frame', async () => {
    // Add a frame first
    await handler({ action: 'add_frame', asset_name: 'sprite' });
    expect(getAsset('sprite').frames).toHaveLength(2);
    await handler({ action: 'remove_frame', asset_name: 'sprite', frame_index: 1 });
    expect(getAsset('sprite').frames).toHaveLength(1);
  });

  it('set_frame_duration updates duration', async () => {
    await handler({
      action: 'set_frame_duration',
      asset_name: 'sprite',
      frame_index: 0,
      duration_ms: 250,
    });
    expect(getAsset('sprite').frames[0].duration_ms).toBe(250);
  });

  // ─── Tag management ──────────────────────────────────────────────

  it('add_tag adds a frame tag', async () => {
    await handler({
      action: 'add_tag',
      asset_name: 'sprite',
      name: 'idle',
      tag_type: 'frame',
      tag_start: 0,
      tag_end: 0,
      tag_direction: 'forward',
    });
    const asset = getAsset('sprite');
    expect(asset.tags.find((t) => t.name === 'idle')).toBeDefined();
  });

  it('remove_tag removes a tag', async () => {
    await handler({
      action: 'add_tag',
      asset_name: 'sprite',
      name: 'idle',
      tag_type: 'frame',
      tag_start: 0,
      tag_end: 0,
    });
    await handler({ action: 'remove_tag', asset_name: 'sprite', name: 'idle' });
    const asset = getAsset('sprite');
    expect(asset.tags.find((t) => t.name === 'idle')).toBeUndefined();
  });

  // ─── Shape management ────────────────────────────────────────────

  it('add_shape adds a rect shape', async () => {
    const r = await handler({
      action: 'add_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'box',
      shape_type: 'rect',
      shape_x: 0,
      shape_y: 0,
      shape_width: 8,
      shape_height: 8,
    });
    expect(r.isError).toBeUndefined();
    const shapes = getAsset('sprite').getShapes(2, 0);
    expect(shapes.find((s) => s.name === 'box')).toBeDefined();
  });

  it('get_shapes returns shapes', async () => {
    await handler({
      action: 'add_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'test_rect',
      shape_type: 'rect',
      shape_x: 1,
      shape_y: 1,
      shape_width: 4,
      shape_height: 4,
    });
    const r = await handler({
      action: 'get_shapes',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as { shapes: unknown[] };
    expect(data.shapes.length).toBeGreaterThan(0);
  });

  it('remove_shape removes a shape', async () => {
    await handler({
      action: 'add_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'to_remove',
      shape_type: 'rect',
      shape_x: 0,
      shape_y: 0,
      shape_width: 2,
      shape_height: 2,
    });
    await handler({
      action: 'remove_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'to_remove',
    });
    const shapes = getAsset('sprite').getShapes(2, 0);
    expect(shapes.find((s) => s.name === 'to_remove')).toBeUndefined();
  });

  // ─── Resize ──────────────────────────────────────────────────────

  it('resize changes dimensions', async () => {
    await handler({ action: 'resize', asset_name: 'sprite', width: 16, height: 16 });
    const asset = getAsset('sprite');
    expect(asset.width).toBe(16);
    expect(asset.height).toBe(16);
  });

  it('resize is undoable', async () => {
    await handler({ action: 'resize', asset_name: 'sprite', width: 16, height: 16 });
    workspace.undo();
    const asset = getAsset('sprite');
    expect(asset.width).toBe(8);
    expect(asset.height).toBe(8);
  });

  // ─── detect_banding ──────────────────────────────────────────────

  it('detect_banding returns clean for small pixel data', async () => {
    const r = await handler({
      action: 'detect_banding',
      asset_name: 'sprite',
      layer_id: 1,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as { clean: boolean };
    expect(data.clean).toBe(true);
  });

  // ─── create ──────────────────────────────────────────────────────

  it('create builds a new asset with scaffold', async () => {
    const r = await handler({
      action: 'create',
      name: 'new_sprite',
      width: 16,
      height: 16,
      layers: [
        { name: 'bg', type: 'image' },
        { name: 'fg', type: 'image' },
      ],
      frames: [{ duration_ms: 100 }, { duration_ms: 150 }],
    });

    expect(r.isError).toBeUndefined();
    const asset = workspace.loadedAssets.get('new_sprite');
    expect(asset).toBeDefined();
    expect(asset?.layers).toHaveLength(2);
    expect(asset?.frames).toHaveLength(2);
  });

  // ─── 4.1.8.8 Resource link in response ──────────────────────────

  it('create response includes pixel:// asset resource link', async () => {
    const r = await handler({
      action: 'create',
      name: 'link_test_sprite',
      width: 8,
      height: 8,
    });

    expect(r.isError).toBeUndefined();
    const links = (r.content as Array<{ type: string; uri?: string }>).filter(
      (c) => c.type === 'resource_link',
    );
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.uri).toContain('pixel://view/asset/link_test_sprite');
  });

  // ─── delete ──────────────────────────────────────────────────────

  it('delete removes asset from registry and workspace', async () => {
    await handler({ action: 'delete', asset_name: 'sprite' });
    expect(workspace.loadedAssets.has('sprite')).toBe(false);
    const project = workspace.project;
    expect(project).not.toBeNull();
    const info = project?.info();
    expect(info?.assets['sprite']).toBeUndefined();
  });

  // ─── update_shape ─────────────────────────────────────────────────

  it('update_shape replaces a shape', async () => {
    // Add a shape first
    await handler({
      action: 'add_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'box',
      shape_type: 'rect',
      shape_x: 0,
      shape_y: 0,
      shape_width: 4,
      shape_height: 4,
    });

    // Update it
    const r = await handler({
      action: 'update_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'box',
      shape_type: 'rect',
      shape_x: 1,
      shape_y: 1,
      shape_width: 6,
      shape_height: 6,
    });

    expect(r.isError).toBeUndefined();
    const shapes = getAsset('sprite').getShapes(2, 0);
    const updated = shapes.find((s) => s.name === 'box');
    expect(updated).toBeDefined();
    expect(updated?.type).toBe('rect');
    if (updated?.type === 'rect') {
      expect(updated.x).toBe(1);
      expect(updated.width).toBe(6);
    }
  });

  it('update_shape is undoable', async () => {
    await handler({
      action: 'add_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'box',
      shape_type: 'rect',
      shape_x: 0,
      shape_y: 0,
      shape_width: 4,
      shape_height: 4,
    });
    await handler({
      action: 'update_shape',
      asset_name: 'sprite',
      layer_id: 2,
      frame_index: 0,
      shape_name: 'box',
      shape_type: 'rect',
      shape_x: 2,
      shape_y: 2,
      shape_width: 6,
      shape_height: 6,
    });

    workspace.undo(); // undo update
    const shapes = getAsset('sprite').getShapes(2, 0);
    const box = shapes.find((s) => s.name === 'box');
    expect(box).toBeDefined();
    if (box?.type === 'rect') {
      expect(box.x).toBe(0); // Original position restored
    }
  });

  // ─── detect_banding (positive case) ─────────────────────────────

  it('detect_banding finds banding in staircase pattern', async () => {
    // Build a 16-wide row asset with a synthetic horizontal staircase:
    // each of 4 colors occupies 4 pixels in monotonic index order: 1,1,1,1,3,3,3,3,5,5,5,5,7,7,7,7
    const bandingAsset = AssetClass.fromJSON({
      name: 'banding_test',
      width: 16,
      height: 4,
      perspective: 'flat' as const,
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
      layers: [{ id: 1, name: 'Layer 1', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': {
          x: 0,
          y: 0,
          data: Array.from({ length: 4 }, () => [1, 1, 1, 1, 3, 3, 3, 3, 5, 5, 5, 5, 7, 7, 7, 7]),
        },
      },
    });
    workspace.loadedAssets.set('banding_test', bandingAsset);

    const r = await handler({
      action: 'detect_banding',
      asset_name: 'banding_test',
      layer_id: 1,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as { banding: unknown[] };
    expect(data.banding).toBeDefined();
    expect(data.banding.length).toBeGreaterThan(0);
  });

  // ─── detect_jaggies ──────────────────────────────────────────────

  it('detect_jaggies returns clean for small pixel data', async () => {
    const r = await handler({
      action: 'detect_jaggies',
      asset_name: 'sprite',
      layer_id: 1,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as { clean: boolean };
    expect(data.clean).toBe(true);
  });

  it('detect_jaggies finds jaggies in inconsistent staircase', async () => {
    // Build a 20x8 asset with an inconsistent step pattern:
    // runs of 3,3,2,3 vertical pixels stepping right — the short run is a jaggy
    const jaggyData: number[][] = Array.from({ length: 8 }, () =>
      Array.from({ length: 20 }, () => 0),
    );
    // Run of 3 at x=1
    jaggyData[0][1] = 1;
    jaggyData[1][1] = 1;
    jaggyData[2][1] = 1;
    // Run of 3 at x=2
    jaggyData[3][2] = 1;
    jaggyData[4][2] = 1;
    jaggyData[5][2] = 1;
    // Run of 2 at x=3 (jaggy — inconsistent)
    jaggyData[6][3] = 1;
    jaggyData[7][3] = 1;

    const jaggyAsset = AssetClass.fromJSON({
      name: 'jaggy_test',
      width: 20,
      height: 8,
      perspective: 'flat' as const,
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
      layers: [{ id: 1, name: 'Layer 1', type: 'image' as const, opacity: 255, visible: true }],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: {
        '1/0': { x: 0, y: 0, data: jaggyData },
      },
    });
    workspace.loadedAssets.set('jaggy_test', jaggyAsset);

    const r = await handler({
      action: 'detect_jaggies',
      asset_name: 'jaggy_test',
      layer_id: 1,
      frame_index: 0,
    });
    const data = JSON.parse(r.content[0].text) as { jaggies: unknown[] };
    expect(data.jaggies).toBeDefined();
    expect(data.jaggies.length).toBeGreaterThan(0);
  });

  // ─── set_nine_slice ─────────────────────────────────────────────

  describe('set_nine_slice', () => {
    it('sets nine_slice on asset', async () => {
      const r = await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_top: 2,
        nine_slice_right: 2,
        nine_slice_bottom: 2,
        nine_slice_left: 2,
      });
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as { nine_slice: object };
      expect(data.nine_slice).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
      expect(getAsset('sprite').nine_slice).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    });

    it('merges with existing nine_slice', async () => {
      await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_top: 1,
        nine_slice_right: 2,
        nine_slice_bottom: 1,
        nine_slice_left: 2,
      });
      const r = await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_top: 3,
      });
      expect(r.isError).toBeUndefined();
      const data = JSON.parse(r.content[0].text) as {
        nine_slice: { top: number; right: number; bottom: number; left: number };
      };
      expect(data.nine_slice.top).toBe(3);
      expect(data.nine_slice.right).toBe(2);
      expect(data.nine_slice.bottom).toBe(1);
      expect(data.nine_slice.left).toBe(2);
    });

    it('errors when no margin params provided', async () => {
      const r = await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
      });
      expect(r.isError).toBe(true);
    });

    it('errors when top+bottom >= height', async () => {
      const r = await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_top: 4,
        nine_slice_bottom: 4,
      });
      expect(r.isError).toBe(true);
    });

    it('errors when left+right >= width', async () => {
      const r = await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_left: 5,
        nine_slice_right: 4,
      });
      expect(r.isError).toBe(true);
    });

    it('undo/redo via workspace', async () => {
      await handler({
        action: 'set_nine_slice',
        asset_name: 'sprite',
        nine_slice_top: 2,
        nine_slice_right: 2,
        nine_slice_bottom: 2,
        nine_slice_left: 2,
      });
      expect(getAsset('sprite').nine_slice).toBeDefined();
      workspace.undo();
      expect(getAsset('sprite').nine_slice).toBeUndefined();
      workspace.redo();
      expect(getAsset('sprite').nine_slice).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    });
  });

  // ─── create with nine_slice ───────────────────────────────────────

  it('create with nine_slice params sets nine_slice on asset', async () => {
    const r = await handler({
      action: 'create',
      name: 'ns_sprite',
      width: 16,
      height: 16,
      nine_slice_top: 4,
      nine_slice_right: 4,
      nine_slice_bottom: 4,
      nine_slice_left: 4,
    });
    expect(r.isError).toBeUndefined();
    const asset = workspace.loadedAssets.get('ns_sprite');
    expect(asset?.nine_slice).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
  });

  it('create without nine_slice params has undefined nine_slice', async () => {
    const r = await handler({
      action: 'create',
      name: 'plain_sprite',
      width: 16,
      height: 16,
    });
    expect(r.isError).toBeUndefined();
    const asset = workspace.loadedAssets.get('plain_sprite');
    expect(asset?.nine_slice).toBeUndefined();
  });

  // ─── link_cel ─────────────────────────────────────────────────────────────

  describe('link_cel', () => {
    it('creates a LinkedCel with the correct link key', async () => {
      const asset = getAsset('sprite');
      // Add a second frame
      await handler({ action: 'add_frame', asset_name: 'sprite' });

      const r = await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 1,
        source_layer_id: 1,
        source_frame_index: 0,
      });
      expect(r.isError).toBeUndefined();

      // Raw cel should be a linked cel
      const rawCel = asset.cels[packCelKey(1, 1)];
      expect(rawCel).toBeDefined();
      expect('link' in rawCel).toBe(true);
      if ('link' in rawCel) {
        expect(rawCel.link).toBe('1/0');
      }

      // Resolved cel should match source data
      const resolved = asset.getCel(1, 1);
      const source = asset.getCel(1, 0);
      expect(resolved).toEqual(source);
    });

    it('returns error when source cel does not exist', async () => {
      const r = await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 0,
        source_layer_id: 1,
        source_frame_index: 5,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('Source cel at layer');
    });

    it('rejects self-link', async () => {
      const r = await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 0,
        source_layer_id: 1,
        source_frame_index: 0,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('Cannot link a cel to itself');
    });

    it('rejects layer type mismatch (image vs shape)', async () => {
      const asset = getAsset('sprite');
      // Put a cel on the shape layer so the source-exists check passes
      asset.setCel(2, 0, { shapes: [] });

      const r = await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 0,
        source_layer_id: 2,
        source_frame_index: 0,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('must be the same type');
    });

    it('undo restores original cel data', async () => {
      const asset = getAsset('sprite');
      await handler({ action: 'add_frame', asset_name: 'sprite' });

      // Write data to frame 1 before linking
      const originalData = [
        [5, 6, 0, 0, 0, 0, 0, 0],
        [7, 8, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ];
      asset.setCel(1, 1, { x: 0, y: 0, data: originalData });

      // Link frame 1 to frame 0
      await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 1,
        source_layer_id: 1,
        source_frame_index: 0,
      });

      // Verify it's now linked
      const rawCelAfterLink = asset.cels[packCelKey(1, 1)];
      expect('link' in rawCelAfterLink).toBe(true);

      // Undo
      workspace.undo();

      // Should be restored to original data
      const cel = asset.getCel(1, 1);
      expect(cel).toBeDefined();
      if (cel !== undefined) {
        expect('data' in cel).toBe(true);
        if ('data' in cel) {
          expect(cel.data).toEqual(originalData);
        }
      }
    });

    it('undo removes cel when no cel existed before linking', async () => {
      const asset = getAsset('sprite');
      await handler({ action: 'add_frame', asset_name: 'sprite' });

      // Frame 1 should have no cel for layer 1 initially
      expect(asset.cels[packCelKey(1, 1)]).toBeUndefined();

      await handler({
        action: 'link_cel',
        asset_name: 'sprite',
        layer_id: 1,
        frame_index: 1,
        source_layer_id: 1,
        source_frame_index: 0,
      });

      // Now a linked cel exists
      expect(asset.cels[packCelKey(1, 1)]).toBeDefined();

      // Undo
      workspace.undo();

      // Cel should be removed
      expect(asset.cels[packCelKey(1, 1)]).toBeUndefined();
    });
  });

  // ─── generate_collision_polygon ───────────────────────────────────

  it('generate_collision_polygon traces a solid 2x2 rectangle', async () => {
    // The mock asset has a 2x2 solid block at (0,0) in layer 1
    const r = await handler({
      action: 'generate_collision_polygon',
      asset_name: 'sprite',
      layer_id: 1,
      frame_index: 0,
      target_layer_id: 2,
      epsilon: 0.5,
    });

    expect(r.isError).toBeUndefined();
    const data = JSON.parse(r.content[0].text) as {
      vertices: number;
      target_layer_id: number;
    };
    expect(data.vertices).toBeGreaterThan(0);
    expect(data.target_layer_id).toBe(2);

    // Shape should have been added to layer 2
    const shapes = getAsset('sprite').getShapes(2, 0);
    const collision = shapes.find((s) => s.name === 'collision');
    expect(collision).toBeDefined();
    expect(collision?.type).toBe('polygon');
  });

  it('generate_collision_polygon auto-detects shape layer', async () => {
    // Don't pass target_layer_id — should auto-find the 'hitbox' shape layer (id=2)
    const r = await handler({
      action: 'generate_collision_polygon',
      asset_name: 'sprite',
      layer_id: 1,
      frame_index: 0,
    });

    expect(r.isError).toBeUndefined();
    const data = JSON.parse(r.content[0].text) as { target_layer_id: number };
    expect(data.target_layer_id).toBe(2); // auto-resolved hitbox layer
  });

  it('generate_collision_polygon returns error for empty canvas', async () => {
    // Create an asset with no solid pixels
    const emptyAsset = AssetClass.fromJSON({
      name: 'empty_sprite',
      width: 4,
      height: 4,
      perspective: 'flat' as const,
      palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
      layers: [
        { id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true },
        {
          id: 2,
          name: 'Hitbox',
          type: 'shape' as const,
          opacity: 255,
          visible: true,
          role: 'hitbox',
          physics_layer: 1,
        },
      ],
      frames: [{ index: 0, duration_ms: 100 }],
      tags: [],
      cels: { '1/0': { x: 0, y: 0, data: Array.from({ length: 4 }, () => [0, 0, 0, 0]) } },
    });
    workspace.loadedAssets.set('empty_sprite', emptyAsset);

    const r = await handler({
      action: 'generate_collision_polygon',
      asset_name: 'empty_sprite',
      layer_id: 1,
      frame_index: 0,
      target_layer_id: 2,
    });
    const data = JSON.parse(r.content[0].text) as { vertices: unknown[] };
    // When there are no solid pixels, the handler returns { vertices: [] }
    expect(data.vertices).toHaveLength(0);
  });

  // ─── interpolate_frames ──────────────────────────────────────────

  describe('interpolate_frames', () => {
    function buildMultiFrameAsset() {
      // Asset with 2 frames and 1 image layer, plus 1 shape layer
      const assetData: Asset = {
        name: 'anim_sprite',
        width: 4,
        height: 4,
        perspective: 'flat' as const,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
        layers: [
          { id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true },
          {
            id: 2,
            name: 'Hitbox',
            type: 'shape' as const,
            opacity: 255,
            visible: true,
            role: 'hitbox',
            physics_layer: 1,
          },
        ],
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 150 },
        ],
        tags: [],
        cels: {
          // frame 0: top-left pixel = index 1
          '1/0': {
            x: 0,
            y: 0,
            data: [
              [1, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
          },
          // frame 1: bottom-right pixel = index 2
          '1/1': {
            x: 0,
            y: 0,
            data: [
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 2],
            ],
          },
        },
      };
      const a = AssetClass.fromJSON(assetData);
      workspace.loadedAssets.set('anim_sprite', a);
      return a;
    }

    it('inserts correct number of frames', async () => {
      buildMultiFrameAsset();
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 2,
      });
      expect(r.isError).toBeUndefined();
      const asset = getAsset('anim_sprite');
      // started with 2 frames, inserted 2 → now 4
      expect(asset.frames).toHaveLength(4);
    });

    it('interpolated cels have correct threshold-blended data', async () => {
      buildMultiFrameAsset();
      await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 2,
      });
      const asset = getAsset('anim_sprite');
      // frame 0 = original start (unchanged), frames 1,2 = interpolated, frame 3 = original end
      // i=0: t=1/3 < 0.5 → picks gridA (all 0 except top-left=1)
      const cel1 = asset.getCel(1, 1);
      expect(cel1).toBeDefined();
      if (cel1 && 'data' in cel1) {
        expect(cel1.data[0][0]).toBe(1); // top-left from celA
        expect(cel1.data[3][3]).toBe(0); // bottom-right from celA (transparent)
      }
      // i=1: t=2/3 >= 0.5 → picks gridB (all 0 except bottom-right=2)
      const cel2 = asset.getCel(1, 2);
      expect(cel2).toBeDefined();
      if (cel2 && 'data' in cel2) {
        expect(cel2.data[0][0]).toBe(0); // top-left from celB (transparent)
        expect(cel2.data[3][3]).toBe(2); // bottom-right from celB
      }
    });

    it('inserted frames inherit duration_ms from frame_start', async () => {
      buildMultiFrameAsset();
      await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 1,
      });
      const asset = getAsset('anim_sprite');
      // Inserted frame is at index 1, original frame_end shifts to 2
      expect(asset.frames[1].duration_ms).toBe(100); // inherited from frame_start=0 (100ms)
    });

    it('non-image layers are skipped (no cels set on shape layer)', async () => {
      buildMultiFrameAsset();
      await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 1,
      });
      const asset = getAsset('anim_sprite');
      // Shape layer (id=2) should have no cel at inserted frame index 1
      const shapeCel = asset.getCel(2, 1);
      expect(shapeCel).toBeUndefined();
    });

    it('missing cels treated as transparent', async () => {
      // Asset with a layer that has no cel on frame 0
      const assetData: Asset = {
        name: 'sparse_sprite',
        width: 2,
        height: 2,
        perspective: 'flat' as const,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
        layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 100 },
        ],
        tags: [],
        cels: {
          // only frame 1 has data; frame 0 is missing (treated as all-zero)
          '1/1': {
            x: 0,
            y: 0,
            data: [
              [3, 3],
              [3, 3],
            ],
          },
        },
      };
      const a = AssetClass.fromJSON(assetData);
      workspace.loadedAssets.set('sparse_sprite', a);

      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'sparse_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 2,
      });
      expect(r.isError).toBeUndefined();
      const asset = getAsset('sparse_sprite');
      // i=0: t=1/3 < 0.5 → gridA (all transparent)
      const cel1 = asset.getCel(1, 1);
      expect(cel1).toBeDefined();
      if (cel1 && 'data' in cel1) {
        expect(cel1.data[0][0]).toBe(0);
      }
      // i=1: t=2/3 >= 0.5 → gridB (all 3)
      const cel2 = asset.getCel(1, 2);
      expect(cel2).toBeDefined();
      if (cel2 && 'data' in cel2) {
        expect(cel2.data[0][0]).toBe(3);
      }
    });

    it('undo removes inserted frames', async () => {
      buildMultiFrameAsset();
      await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 3,
      });
      const asset = getAsset('anim_sprite');
      expect(asset.frames).toHaveLength(5); // 2 + 3
      workspace.undo();
      expect(asset.frames).toHaveLength(2); // restored
    });

    it('returns error when asset_name is missing', async () => {
      const r = await handler({
        action: 'interpolate_frames',
        frame_start: 0,
        frame_end: 1,
        count: 1,
      });
      expect(r.isError).toBe(true);
    });

    it('returns error when frame_start is out of range', async () => {
      buildMultiFrameAsset();
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 99,
        frame_end: 1,
        count: 1,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('out of range');
    });

    it('returns error when frame_start >= frame_end', async () => {
      buildMultiFrameAsset();
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 1,
        frame_end: 0,
        count: 1,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('frame_start < frame_end');
    });

    it('returns error when frame_start equals frame_end', async () => {
      buildMultiFrameAsset();
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 0,
        count: 1,
      });
      expect(r.isError).toBe(true);
    });

    it('returns error when count is missing', async () => {
      buildMultiFrameAsset();
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'anim_sprite',
        frame_start: 0,
        frame_end: 1,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('"count"');
    });

    it('resolves LinkedCels and interpolates their data', async () => {
      const assetData: Asset = {
        name: 'linked_sprite',
        width: 2,
        height: 2,
        perspective: 'flat' as const,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
        layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 100 },
          { index: 2, duration_ms: 100 },
        ],
        tags: [],
        cels: {
          '1/0': {
            x: 0,
            y: 0,
            data: [
              [5, 5],
              [5, 5],
            ],
          },
          // frame 1 is a LinkedCel pointing to frame 0
          '1/1': { link: '1/0' },
          '1/2': {
            x: 0,
            y: 0,
            data: [
              [9, 9],
              [9, 9],
            ],
          },
        },
      };
      const a = AssetClass.fromJSON(assetData);
      workspace.loadedAssets.set('linked_sprite', a);

      // Interpolate between frame 1 (LinkedCel → frame 0 data) and frame 2
      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'linked_sprite',
        frame_start: 1,
        frame_end: 2,
        count: 2,
      });
      expect(r.isError).toBeUndefined();
      const asset = getAsset('linked_sprite');
      expect(asset.frames).toHaveLength(5); // 3 + 2

      // i=0: t=1/3 < 0.5 → picks gridA (resolved LinkedCel = all 5)
      const cel1 = asset.getCel(1, 2);
      expect(cel1).toBeDefined();
      if (cel1 && 'data' in cel1) {
        expect(cel1.data[0][0]).toBe(5);
      }
      // i=1: t=2/3 >= 0.5 → picks gridB (all 9)
      const cel2 = asset.getCel(1, 3);
      expect(cel2).toBeDefined();
      if (cel2 && 'data' in cel2) {
        expect(cel2.data[0][0]).toBe(9);
      }
    });

    it('returns error for broken LinkedCel resolution', async () => {
      const assetData: Asset = {
        name: 'broken_link_sprite',
        width: 2,
        height: 2,
        perspective: 'flat' as const,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as Asset['palette'],
        layers: [{ id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true }],
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 100 },
        ],
        tags: [],
        cels: {
          // frame 0 is a LinkedCel pointing to a non-existent source
          '1/0': { link: '1/99' },
          '1/1': {
            x: 0,
            y: 0,
            data: [
              [1, 1],
              [1, 1],
            ],
          },
        },
      };
      const a = AssetClass.fromJSON(assetData);
      workspace.loadedAssets.set('broken_link_sprite', a);

      const r = await handler({
        action: 'interpolate_frames',
        asset_name: 'broken_link_sprite',
        frame_start: 0,
        frame_end: 1,
        count: 1,
      });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('LinkedCel resolution failed');
    });
  });
});
