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
function captureToolCallback(registerFn: (server: any) => void): ToolCallback {
    let cb: ToolCallback | null = null;
    const mockServer = {
        registerTool(_name: string, _desc: string, _config: unknown, callback: ToolCallback) { cb = callback; },
    };
    registerFn(mockServer);
    if (!cb) throw new Error('registerTool callback not captured');
    return cb;
}

function buildMockAsset(): Asset {
    return {
        name: 'test_sprite',
        width: 10, height: 10,
        perspective: 'flat',
        palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]) as any,
        layers: [
            { id: 1, name: 'Base', type: 'image', opacity: 255, visible: true },
        ],
        frames: [{ index: 0, duration_ms: 100 }],
        tags: [],
        cels: {
            '1/0': {
                x: 0, y: 0,
                // Initialize a 10x10 zero-filled array
                data: Array.from({ length: 10 }, () => Array(10).fill(0)),
            },
        },
    };
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

    afterEach(() => { vi.restoreAllMocks(); });

    function getCelData() {
        const cel = workspace.loadedAssets.get('test_sprite')!.getCel(1, 0);
        return 'data' in cel! ? cel.data : null;
    }

    it('returns error if operations missing', async () => {
        const r = await handler({ layer_id: 1, frame_index: 0 }) as any;
        expect(r.isError).toBe(true);
    });

    it('returns error for data dimension mismatch in write_pixels', async () => {
        const r = await handler({
            layer_id: 1, frame_index: 0,
            operations: [{
                action: 'write_pixels',
                x: 0, y: 0, width: 2, height: 2,
                data: [[1, 2]] // only 1 row, but height=2
            }]
        }) as any;
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toContain('dimension');
    });

    it('pixel draws a single pixel', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'pixel', x: 5, y: 5, color: 1 }]
        });
        const data = getCelData()!;
        expect(data[5][5]).toBe(1);
    });

    it('line draws between points', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'line', x: 0, y: 0, x2: 2, y2: 2, color: 2 }]
        });
        const data = getCelData()!;
        expect(data[0][0]).toBe(2);
        expect(data[1][1]).toBe(2);
        expect(data[2][2]).toBe(2);
    });

    it('rect draws an outline', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'rect', x: 1, y: 1, width: 3, height: 3, color: 3 }]
        });
        const data = getCelData()!;
        expect(data[1][1]).toBe(3);
        expect(data[1][3]).toBe(3);
        expect(data[3][1]).toBe(3);
        expect(data[3][3]).toBe(3);
        expect(data[2][2]).toBe(0); // center is empty
    });

    it('rect draws filled if requested', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'rect', x: 1, y: 1, width: 3, height: 3, color: 4, filled: true }]
        });
        const data = getCelData()!;
        expect(data[1][1]).toBe(4);
        expect(data[2][2]).toBe(4); // center is filled
    });

    it('circle draws an outline and fills', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'circle', x: 4, y: 4, radius: 2, color: 5, filled: true }]
        });
        const data = getCelData()!;
        expect(data[4][4]).toBe(5); // center is filled
        expect(data[4][6]).toBe(5); // edge is filled
    });

    it('ellipse draws an outline and fills', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{ action: 'ellipse', x: 4, y: 4, width: 3, height: 2, color: 6, filled: true }]
        });
        const data = getCelData()!;
        expect(data[4][4]).toBe(6); // center is filled
    });

    it('fill performs a flood fill', async () => {
        // Draw a boundary box
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [
                { action: 'rect', x: 2, y: 2, width: 5, height: 5, color: 7, filled: false },
                { action: 'fill', x: 4, y: 4, color: 8 }
            ]
        });
        const data = getCelData()!;
        expect(data[2][2]).toBe(7); // boundary
        expect(data[4][4]).toBe(8); // filled interior
        expect(data[1][1]).toBe(0); // outside untouched
    });

    it('write_pixels bulk places data', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [{
                action: 'write_pixels',
                x: 1, y: 1,
                width: 2, height: 2,
                data: [
                    [9, 9],
                    [9, 9]
                ]
            }]
        });
        const data = getCelData()!;
        expect(data[1][1]).toBe(9);
        expect(data[2][2]).toBe(9);
        expect(data[0][0]).toBe(0);
    });

    it('multiple operations in a single batch', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [
                { action: 'pixel', x: 0, y: 0, color: 1 },
                { action: 'pixel', x: 1, y: 1, color: 2 },
            ]
        });
        const data = getCelData()!;
        expect(data[0][0]).toBe(1);
        expect(data[1][1]).toBe(2);
    });

    it('undoes and redoes a batched draw operation', async () => {
        await handler({
            layer_id: 1, frame_index: 0,
            operations: [
                { action: 'pixel', x: 0, y: 0, color: 1 },
                { action: 'pixel', x: 1, y: 1, color: 2 },
            ]
        });

        expect(getCelData()![0][0]).toBe(1);

        workspace.undo();
        expect(getCelData()![0][0]).toBe(0); // Restored

        workspace.redo();
        expect(getCelData()![0][0]).toBe(1); // Redone
    });
});
