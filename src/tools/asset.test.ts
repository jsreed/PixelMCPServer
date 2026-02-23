import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAssetTool } from './asset.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

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
type ToolCallback = (args: Record<string, unknown>) => unknown;
function captureToolCallback(registerFn: (server: any) => void): ToolCallback {
    let cb: ToolCallback | null = null;
    const mockServer = {
        registerTool(_name: string, _config: unknown, callback: ToolCallback) { cb = callback; },
    };
    registerFn(mockServer);
    if (!cb) throw new Error('registerTool callback not captured');
    return cb;
}

/** Minimal valid asset for testing */
function buildMockAsset(overrides?: Partial<Asset>): Asset {
    return {
        name: 'test_sprite',
        width: 8, height: 8,
        perspective: 'flat' as const,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]) as any,
        layers: [
            { id: 1, name: 'Base', type: 'image' as const, opacity: 255, visible: true },
            { id: 2, name: 'Hitbox', type: 'shape' as const, opacity: 255, visible: true, role: 'hitbox', physics_layer: 1 },
        ],
        frames: [{ index: 0, duration_ms: 100 }],
        tags: [],
        cels: {
            '1/0': {
                x: 0, y: 0,
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

    afterEach(() => { vi.restoreAllMocks(); });

    // ─── Validation ──────────────────────────────────────────────────

    it('requires asset_name for most actions', async () => {
        const r = await handler({ action: 'info' }) as any;
        expect(r.isError).toBe(true);
    });

    it('returns error for unloaded asset', async () => {
        const r = await handler({ action: 'info', asset_name: 'ghost' }) as any;
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('not loaded');
    });

    // ─── info ────────────────────────────────────────────────────────

    it('info returns asset structure', async () => {
        const r = await handler({ action: 'info', asset_name: 'sprite' }) as any;
        expect(r.isError).toBeUndefined();
        const data = JSON.parse(r.content[0].text);
        expect(data.name).toBe('test_sprite');
        expect(data.width).toBe(8);
        expect(data.layers).toHaveLength(2);
        expect(data.frames).toHaveLength(1);
    });

    // ─── get_cel ─────────────────────────────────────────────────────

    it('get_cel returns pixel data', async () => {
        const r = await handler({ action: 'get_cel', asset_name: 'sprite', layer_id: 1, frame_index: 0 }) as any;
        const data = JSON.parse(r.content[0].text);
        expect(data.width).toBe(8);
        expect(data.height).toBe(8);
        expect(data.data[0][0]).toBe(1);
        expect(data.is_linked).toBe(false);
    });

    it('get_cel missing layer_id returns error', async () => {
        const r = await handler({ action: 'get_cel', asset_name: 'sprite', frame_index: 0 }) as any;
        expect(r.isError).toBe(true);
    });

    // ─── get_cels (range mode) ───────────────────────────────────────

    it('get_cels range mode returns array', async () => {
        const r = await handler({ action: 'get_cels', asset_name: 'sprite', layer_id: 1, frame_start: 0, frame_end: 0 }) as any;
        const data = JSON.parse(r.content[0].text);
        expect(data.cels).toHaveLength(1);
        expect(data.cels[0].data).toBeDefined();
    });

    // ─── Layer management ────────────────────────────────────────────

    it('add_layer adds a new layer', async () => {
        const r = await handler({ action: 'add_layer', asset_name: 'sprite', name: 'Overlay', layer_type: 'image' }) as any;
        expect(r.isError).toBeUndefined();
        const data = JSON.parse(r.content[0].text);
        expect(data.layer_id).toBeDefined();
        expect(workspace.loadedAssets.get('sprite')!.layers).toHaveLength(3);
    });

    it('add_layer is undoable', async () => {
        const before = workspace.loadedAssets.get('sprite')!.layers.length;
        await handler({ action: 'add_layer', asset_name: 'sprite', name: 'Overlay', layer_type: 'image' });
        expect(workspace.loadedAssets.get('sprite')!.layers).toHaveLength(before + 1);
        workspace.undo();
        expect(workspace.loadedAssets.get('sprite')!.layers).toHaveLength(before);
    });

    it('add_group adds a group layer', async () => {
        const r = await handler({ action: 'add_group', asset_name: 'sprite', name: 'MyGroup' }) as any;
        expect(r.isError).toBeUndefined();
        const asset = workspace.loadedAssets.get('sprite')!;
        const grp = asset.layers.find(l => l.name === 'MyGroup');
        expect(grp).toBeDefined();
        expect(grp!.type).toBe('group');
    });

    it('remove_layer removes a layer', async () => {
        await handler({ action: 'remove_layer', asset_name: 'sprite', layer_id: 1 });
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.layers.find(l => l.id === 1)).toBeUndefined();
    });

    // ─── Frame management ────────────────────────────────────────────

    it('add_frame appends a frame', async () => {
        const r = await handler({ action: 'add_frame', asset_name: 'sprite', duration_ms: 200 }) as any;
        expect(r.isError).toBeUndefined();
        expect(workspace.loadedAssets.get('sprite')!.frames).toHaveLength(2);
    });

    it('remove_frame removes a frame', async () => {
        // Add a frame first
        await handler({ action: 'add_frame', asset_name: 'sprite' });
        expect(workspace.loadedAssets.get('sprite')!.frames).toHaveLength(2);
        await handler({ action: 'remove_frame', asset_name: 'sprite', frame_index: 1 });
        expect(workspace.loadedAssets.get('sprite')!.frames).toHaveLength(1);
    });

    it('set_frame_duration updates duration', async () => {
        await handler({ action: 'set_frame_duration', asset_name: 'sprite', frame_index: 0, duration_ms: 250 });
        expect(workspace.loadedAssets.get('sprite')!.frames[0].duration_ms).toBe(250);
    });

    // ─── Tag management ──────────────────────────────────────────────

    it('add_tag adds a frame tag', async () => {
        await handler({
            action: 'add_tag', asset_name: 'sprite', name: 'idle',
            tag_type: 'frame', tag_start: 0, tag_end: 0, tag_direction: 'forward',
        });
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.tags.find(t => t.name === 'idle')).toBeDefined();
    });

    it('remove_tag removes a tag', async () => {
        await handler({
            action: 'add_tag', asset_name: 'sprite', name: 'idle',
            tag_type: 'frame', tag_start: 0, tag_end: 0,
        });
        await handler({ action: 'remove_tag', asset_name: 'sprite', name: 'idle' });
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.tags.find(t => t.name === 'idle')).toBeUndefined();
    });

    // ─── Shape management ────────────────────────────────────────────

    it('add_shape adds a rect shape', async () => {
        const r = await handler({
            action: 'add_shape', asset_name: 'sprite',
            layer_id: 2, frame_index: 0,
            shape_name: 'box', shape_type: 'rect',
            shape_x: 0, shape_y: 0, shape_width: 8, shape_height: 8,
        }) as any;
        expect(r.isError).toBeUndefined();
        const shapes = workspace.loadedAssets.get('sprite')!.getShapes(2, 0);
        expect(shapes.find(s => s.name === 'box')).toBeDefined();
    });

    it('get_shapes returns shapes', async () => {
        await handler({
            action: 'add_shape', asset_name: 'sprite',
            layer_id: 2, frame_index: 0,
            shape_name: 'test_rect', shape_type: 'rect',
            shape_x: 1, shape_y: 1, shape_width: 4, shape_height: 4,
        });
        const r = await handler({ action: 'get_shapes', asset_name: 'sprite', layer_id: 2, frame_index: 0 }) as any;
        const data = JSON.parse(r.content[0].text);
        expect(data.shapes.length).toBeGreaterThan(0);
    });

    it('remove_shape removes a shape', async () => {
        await handler({
            action: 'add_shape', asset_name: 'sprite',
            layer_id: 2, frame_index: 0,
            shape_name: 'to_remove', shape_type: 'rect',
            shape_x: 0, shape_y: 0, shape_width: 2, shape_height: 2,
        });
        await handler({ action: 'remove_shape', asset_name: 'sprite', layer_id: 2, frame_index: 0, shape_name: 'to_remove' });
        const shapes = workspace.loadedAssets.get('sprite')!.getShapes(2, 0);
        expect(shapes.find(s => s.name === 'to_remove')).toBeUndefined();
    });

    // ─── Resize ──────────────────────────────────────────────────────

    it('resize changes dimensions', async () => {
        await handler({ action: 'resize', asset_name: 'sprite', width: 16, height: 16 });
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.width).toBe(16);
        expect(asset.height).toBe(16);
    });

    it('resize is undoable', async () => {
        await handler({ action: 'resize', asset_name: 'sprite', width: 16, height: 16 });
        workspace.undo();
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.width).toBe(8);
        expect(asset.height).toBe(8);
    });

    // ─── detect_banding ──────────────────────────────────────────────

    it('detect_banding returns clean for small pixel data', async () => {
        const r = await handler({ action: 'detect_banding', asset_name: 'sprite', layer_id: 1, frame_index: 0 }) as any;
        const data = JSON.parse(r.content[0].text);
        expect(data.clean).toBe(true);
    });

    // ─── create ──────────────────────────────────────────────────────

    it('create builds a new asset with scaffold', async () => {
        const r = await handler({
            action: 'create', name: 'new_sprite', width: 16, height: 16,
            layers: [{ name: 'bg', type: 'image' }, { name: 'fg', type: 'image' }],
            frames: [{ duration_ms: 100 }, { duration_ms: 150 }],
        }) as any;

        expect(r.isError).toBeUndefined();
        const asset = workspace.loadedAssets.get('new_sprite');
        expect(asset).toBeDefined();
        expect(asset!.layers).toHaveLength(2);
        expect(asset!.frames).toHaveLength(2);
    });

    // ─── delete ──────────────────────────────────────────────────────

    it('delete removes asset from registry and workspace', async () => {
        await handler({ action: 'delete', asset_name: 'sprite' });
        expect(workspace.loadedAssets.has('sprite')).toBe(false);
        const info = workspace.project!.info();
        expect(info.assets['sprite']).toBeUndefined();
    });
});
