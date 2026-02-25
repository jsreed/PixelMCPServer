import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerPaletteTool } from './palette.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import * as paletteIo from '../io/palette-io.js';
import * as assetIo from '../io/asset-io.js';

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
type ToolCallback = (args: Record<string, unknown>) => unknown;

function captureToolCallback(registerFn: (server: any) => void): ToolCallback {
    let cb: ToolCallback | null = null;
    const mockServer = {
        registerTool(_name: string, _config: unknown, callback: ToolCallback) {
            cb = callback;
        },
    };
    registerFn(mockServer);
    if (!cb) throw new Error('registerTool callback not captured');
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
        return [0, 0, 0, 0];
    }),
    layers: [{ id: 1, name: 'Layer 1', type: 'image' as const, opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {
        '1/0': {
            x: 0, y: 0,
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
        const asset = AssetClass.fromJSON(JSON.parse(JSON.stringify(mockAssetData)));
        workspace.loadedAssets.set('sprite', asset);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ─── validation ──────────────────────────────────────────────────

    it('requires asset_name', async () => {
        const result = await handler({ action: 'info' }) as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('asset_name');
    });

    it('returns error for unloaded asset', async () => {
        const result = await handler({ action: 'info', asset_name: 'ghost' }) as any;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not loaded');
    });

    // ─── info action ─────────────────────────────────────────────────

    it('info returns defined palette entries with usage counts', async () => {
        const result = await handler({ action: 'info', asset_name: 'sprite' }) as any;

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.entries.length).toBeGreaterThan(0);

        // Index 1 should have usage count 3 (three pixels reference it)
        const idx1 = data.entries.find((e: any) => e.index === 1);
        expect(idx1).toBeDefined();
        expect(idx1.usage).toBe(3);

        // Index 2 should have usage count 3
        const idx2 = data.entries.find((e: any) => e.index === 2);
        expect(idx2).toBeDefined();
        expect(idx2.usage).toBe(3);
    });

    // ─── set action ──────────────────────────────────────────────────

    it('set updates a palette entry', async () => {
        const result = await handler({ action: 'set', asset_name: 'sprite', index: 3, rgba: [255, 0, 0, 255] }) as any;

        expect(result.isError).toBeUndefined();
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.palette.get(3)).toEqual([255, 0, 0, 255]);
    });

    it('set without index returns error', async () => {
        const result = await handler({ action: 'set', asset_name: 'sprite', rgba: [255, 0, 0, 255] }) as any;
        expect(result.isError).toBe(true);
    });

    it('set is undoable', async () => {
        const asset = workspace.loadedAssets.get('sprite')!;
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
        const result = await handler({ action: 'set_bulk', asset_name: 'sprite', entries }) as any;

        expect(result.isError).toBeUndefined();
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.palette.get(3)).toEqual([255, 0, 0, 255]);
        expect(asset.palette.get(4)).toEqual([0, 255, 0, 255]);
    });

    // ─── swap action ─────────────────────────────────────────────────

    it('swap exchanges two palette entries', async () => {
        const asset = workspace.loadedAssets.get('sprite')!;
        const c1 = asset.palette.get(1);
        const c2 = asset.palette.get(2);

        const result = await handler({ action: 'swap', asset_name: 'sprite', index: 1, index2: 2 }) as any;

        expect(result.isError).toBeUndefined();
        expect(asset.palette.get(1)).toEqual(c2);
        expect(asset.palette.get(2)).toEqual(c1);
    });

    // ─── generate_ramp action ────────────────────────────────────────

    it('generate_ramp fills interpolated colors', async () => {
        const asset = workspace.loadedAssets.get('sprite')!;
        // Set endpoints
        asset.palette.set(20, [0, 0, 0, 255]);
        asset.palette.set(24, [100, 200, 50, 255]);

        const result = await handler({
            action: 'generate_ramp', asset_name: 'sprite', color1: 20, color2: 24,
        }) as any;

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
            action: 'generate_ramp', asset_name: 'sprite', color1: 10, color2: 5,
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('color1 < color2');
    });

    // ─── save action ─────────────────────────────────────────────────

    it('save writes palette to file', async () => {
        vi.mocked(paletteIo.savePaletteFile).mockResolvedValue(undefined);

        const result = await handler({
            action: 'save', asset_name: 'sprite', path: 'palettes/test.json', name: 'test_pal',
        }) as any;

        expect(result.isError).toBeUndefined();
        expect(paletteIo.savePaletteFile).toHaveBeenCalledOnce();
    });

    // ─── load action ─────────────────────────────────────────────────

    it('load reads palette from file and applies it', async () => {
        vi.mocked(paletteIo.loadPaletteFile).mockResolvedValue({
            name: 'loaded_pal',
            colors: [[255, 0, 0, 255], [0, 255, 0, 255], null] as any,
        });

        const result = await handler({
            action: 'load', asset_name: 'sprite', path: 'palettes/test.json',
        }) as any;

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.message).toContain('loaded');

        // Palette should be updated
        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.palette.get(0)).toEqual([255, 0, 0, 255]);
        expect(asset.palette.get(1)).toEqual([0, 255, 0, 255]);
    });

    it('load with missing file returns error', async () => {
        vi.mocked(paletteIo.loadPaletteFile).mockRejectedValue(new Error('Palette file not found: /bad'));

        const result = await handler({
            action: 'load', asset_name: 'sprite', path: 'palettes/missing.json',
        }) as any;

        expect(result.isError).toBe(true);
    });

    // ─── fetch_lospec action ─────────────────────────────────────────

    it('fetch_lospec fetches and applies palette from Lospec API', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                name: 'test-palette',
                colors: ['ff0000', '00ff00', '0000ff']
            })
        } as Response);

        const result = await handler({
            action: 'fetch_lospec', asset_name: 'sprite', name: 'test-palette',
        }) as any;

        expect(result.isError).toBeUndefined();

        const asset = workspace.loadedAssets.get('sprite')!;
        expect(asset.palette.get(0)).toEqual([0, 0, 0, 0]); // Index 0 is transparency
        expect(asset.palette.get(1)).toEqual([255, 0, 0, 255]);
        expect(asset.palette.get(2)).toEqual([0, 255, 0, 255]);
        expect(asset.palette.get(3)).toEqual([0, 0, 255, 255]);
    });

    it('fetch_lospec handles API errors', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        } as Response);

        const result = await handler({
            action: 'fetch_lospec', asset_name: 'sprite', name: 'missing-palette',
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('missing-palette');
    });
});
