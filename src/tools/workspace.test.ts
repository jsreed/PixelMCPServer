import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerWorkspaceTool } from './workspace.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { ProjectClass } from '../classes/project.js';
import { AssetClass } from '../classes/asset.js';
import * as assetIo from '../io/asset-io.js';

// Mock asset I/O so tests don't touch disk
vi.mock('../io/asset-io.js', () => ({
    loadAssetFile: vi.fn(),
    saveAssetFile: vi.fn(),
}));

// Capture the tool callback from registerTool
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

/** Minimal asset data for testing */
const mockAssetData = {
    name: 'test_sprite',
    width: 16,
    height: 16,
    perspective: 'flat' as const,
    palette: Array.from({ length: 256 }, () => [0, 0, 0, 0] as [number, number, number, number]),
    layers: [{ id: 1, name: 'Background', type: 'image' as const, opacity: 255, visible: true }],
    frames: [{ index: 0, duration_ms: 100 }],
    tags: [],
    cels: {},
};

describe('workspace tool', () => {
    let handler: ToolCallback;
    let workspace: WorkspaceClass;

    beforeEach(() => {
        WorkspaceClass.reset();
        workspace = WorkspaceClass.instance();
        handler = captureToolCallback(registerWorkspaceTool);

        // Default mock: loadAssetFile returns valid asset data
        vi.mocked(assetIo.loadAssetFile).mockResolvedValue(mockAssetData);
        vi.mocked(assetIo.saveAssetFile).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Helper: set up a project with a registered asset */
    function setupProject() {
        const project = ProjectClass.create('/tmp/test/pixelmcp.json', 'TestProject');
        project.registerAsset('player', { path: 'sprites/player.json', type: 'character' });
        workspace.setProject(project);
        return project;
    }

    // ─── info action ─────────────────────────────────────────────────

    it('info returns workspace state', async () => {
        setupProject();

        const result = await handler({ action: 'info' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.project.name).toBe('TestProject');
        expect(text.loadedAssets).toEqual([]);
        expect(text.undoDepth).toBe(0);
    });

    it('info works even without a project loaded', async () => {
        const result = await handler({ action: 'info' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.project).toBeNull();
    });

    // ─── load_asset action ───────────────────────────────────────────

    it('load_asset loads an asset into the workspace', async () => {
        setupProject();

        const result = await handler({ action: 'load_asset', asset_name: 'player' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('player');
        expect(text.message).toContain('loaded');

        expect(workspace.loadedAssets.has('player')).toBe(true);
    });

    it('load_asset without asset_name returns error', async () => {
        setupProject();

        const result = await handler({ action: 'load_asset' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('asset_name');
    });

    it('load_asset without project returns noProjectLoaded', async () => {
        const result = await handler({ action: 'load_asset', asset_name: 'player' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No project loaded');
    });

    it('load_asset with unregistered name returns assetNotInRegistry', async () => {
        setupProject();

        const result = await handler({ action: 'load_asset', asset_name: 'ghost' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found in project registry');
    });

    // ─── unload_asset action ─────────────────────────────────────────

    it('unload_asset removes a loaded asset', async () => {
        setupProject();
        await workspace.loadAsset('player');

        const result = await handler({ action: 'unload_asset', asset_name: 'player' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('unloaded');
        expect(text.hadUnsavedChanges).toBe(false);
        expect(workspace.loadedAssets.has('player')).toBe(false);
    });

    it('unload_asset on dirty asset reports unsaved changes', async () => {
        setupProject();
        await workspace.loadAsset('player');
        workspace.getAsset('player').isDirty = true;

        const result = await handler({ action: 'unload_asset', asset_name: 'player' }) as any;

        const text = JSON.parse(result.content[0].text);
        expect(text.hadUnsavedChanges).toBe(true);
    });

    it('unload_asset without asset_name returns error', async () => {
        const result = await handler({ action: 'unload_asset' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('asset_name');
    });

    it('unload_asset on not-loaded asset returns assetNotLoaded', async () => {
        setupProject();

        const result = await handler({ action: 'unload_asset', asset_name: 'ghost' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not loaded');
    });

    // ─── save action ─────────────────────────────────────────────────

    it('save persists a loaded asset', async () => {
        setupProject();
        await workspace.loadAsset('player');
        workspace.getAsset('player').isDirty = true;

        const result = await handler({ action: 'save', asset_name: 'player' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('saved');
        expect(text.path).toBeDefined();

        // Asset should no longer be dirty
        expect(workspace.getAsset('player').isDirty).toBe(false);
    });

    it('save without asset_name returns error', async () => {
        const result = await handler({ action: 'save' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('asset_name');
    });

    it('save without project returns noProjectLoaded', async () => {
        const result = await handler({ action: 'save', asset_name: 'player' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No project loaded');
    });

    // ─── save_all action ─────────────────────────────────────────────

    it('save_all saves all dirty assets', async () => {
        setupProject();
        await workspace.loadAsset('player');
        workspace.getAsset('player').isDirty = true;

        const result = await handler({ action: 'save_all' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('1 asset(s)');
        expect(text.saved.length).toBe(1);
    });

    it('save_all without project returns noProjectLoaded', async () => {
        const result = await handler({ action: 'save_all' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No project loaded');
    });

    // ─── undo / redo actions ─────────────────────────────────────────

    it('undo with empty stack returns error', async () => {
        const result = await handler({ action: 'undo' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Nothing to undo');
    });

    it('redo with empty stack returns error', async () => {
        const result = await handler({ action: 'redo' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Nothing to redo');
    });

    it('undo after push returns success with stack depths', async () => {
        // Push a mock command
        workspace.pushCommand({
            execute: () => { },
            undo: () => { },
        });

        const result = await handler({ action: 'undo' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toBe('Undo successful.');
        expect(text.undoDepth).toBe(0);
        expect(text.redoDepth).toBe(1);
    });

    it('redo after undo returns success', async () => {
        workspace.pushCommand({
            execute: () => { },
            undo: () => { },
        });
        workspace.undo();

        const result = await handler({ action: 'redo' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toBe('Redo successful.');
        expect(text.undoDepth).toBe(1);
        expect(text.redoDepth).toBe(0);
    });
});
