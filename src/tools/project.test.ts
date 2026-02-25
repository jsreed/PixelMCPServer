import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerProjectTool } from './project.js';
import { WorkspaceClass } from '../classes/workspace.js';
import * as projectIo from '../io/project-io.js';

// Mock file I/O so tests don't touch disk
vi.mock('../io/project-io.js', () => ({
    loadProjectFile: vi.fn(),
    saveProjectFile: vi.fn(),
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

describe('project tool', () => {
    let handler: ToolCallback;

    beforeEach(() => {
        WorkspaceClass.reset();
        vi.mocked(projectIo.saveProjectFile).mockResolvedValue(undefined);
        handler = captureToolCallback(registerProjectTool);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ─── init action ─────────────────────────────────────────────────

    it('init creates project and sets it on workspace', async () => {
        const result = await handler({ action: 'init', path: '/tmp/test-project' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('initialized');
        expect(text.path).toContain('pixelmcp.json');

        // Project should be set on workspace
        const ws = WorkspaceClass.instance();
        expect(ws.project).not.toBeNull();
        expect(ws.project!.name).toBe('test-project');
    });

    it('init uses custom name when provided', async () => {
        const result = await handler({ action: 'init', path: '/tmp/foo', name: 'MyGame' }) as any;

        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('MyGame');
        expect(WorkspaceClass.instance().project!.name).toBe('MyGame');
    });

    it('init without path returns error', async () => {
        const result = await handler({ action: 'init' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('path');
    });

    it('init calls saveProjectFile', async () => {
        vi.mocked(projectIo.saveProjectFile).mockClear();
        await handler({ action: 'init', path: '/tmp/proj' });

        expect(projectIo.saveProjectFile).toHaveBeenCalledOnce();
        const [savePath] = vi.mocked(projectIo.saveProjectFile).mock.calls[0];
        expect(savePath).toContain('pixelmcp.json');
    });

    // ─── open action ─────────────────────────────────────────────────

    it('open loads project from file', async () => {
        vi.mocked(projectIo.loadProjectFile).mockResolvedValue({
            pixelmcp_version: '1.0',
            name: 'Loaded Game',
            assets: { player: { path: 'sprites/player.json', type: 'character' } },
        });

        const result = await handler({ action: 'open', path: '/game/pixelmcp.json' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.message).toContain('Loaded Game');
        expect(text.assets).toBe(1);

        const ws = WorkspaceClass.instance();
        expect(ws.project!.name).toBe('Loaded Game');
    });

    it('open without path returns error', async () => {
        const result = await handler({ action: 'open' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('path');
    });

    it('open with missing file returns projectFileNotFound', async () => {
        vi.mocked(projectIo.loadProjectFile).mockRejectedValue(new Error('ENOENT'));

        const result = await handler({ action: 'open', path: '/missing/pixelmcp.json' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not found');
    });

    // ─── info action ─────────────────────────────────────────────────

    it('info returns project data when project is loaded', async () => {
        // Init a project first
        await handler({ action: 'init', path: '/tmp/info-test' });

        const result = await handler({ action: 'info' }) as any;

        expect(result.isError).toBeUndefined();
        const text = JSON.parse(result.content[0].text);
        expect(text.name).toBe('info-test');
    });

    it('info without project returns noProjectLoaded error', async () => {
        const result = await handler({ action: 'info' }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No project loaded');
    });
});

// ─── add_file action ─────────────────────────────────────────────────────────

import * as pngjs from 'pngjs';
import * as fsModule from 'node:fs/promises';
import * as assetIo from '../io/asset-io.js';

vi.mock('pngjs', () => ({
    PNG: {
        sync: {
            read: vi.fn(),
        },
    },
}));

vi.mock('node:fs/promises', async () => ({
    ...(await vi.importActual('node:fs/promises')),
    readFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../io/asset-io.js', () => ({
    loadAssetFile: vi.fn(),
    saveAssetFile: vi.fn().mockResolvedValue(undefined),
}));

function makeRgbaBuffer(w: number, h: number, colors: [number, number, number, number][]): Buffer {
    const buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const [r, g, b, a] = colors[i % colors.length];
        buf[i * 4 + 0] = r;
        buf[i * 4 + 1] = g;
        buf[i * 4 + 2] = b;
        buf[i * 4 + 3] = a;
    }
    return buf;
}

describe('project tool — add_file', () => {
    let handler: ToolCallback;

    beforeEach(() => {
        WorkspaceClass.reset();
        vi.mocked(projectIo.saveProjectFile).mockResolvedValue(undefined);
        vi.mocked(assetIo.saveAssetFile).mockResolvedValue(undefined);
        handler = captureToolCallback(registerProjectTool);

        // Always pre-init a project so most tests don't have to
        vi.mocked(projectIo.saveProjectFile).mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function initProject() {
        await handler({ action: 'init', path: '/tmp/game' });
    }

    function mockPng(w = 2, h = 2, colors: [number, number, number, number][] = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]]) {
        vi.mocked(fsModule.readFile as any).mockResolvedValue(Buffer.alloc(8));
        vi.mocked(pngjs.PNG.sync.read).mockReturnValue({
            width: w,
            height: h,
            data: makeRgbaBuffer(w, h, colors),
        } as any);
    }

    it('add_file happy path registers asset and returns metadata', async () => {
        await initProject();
        mockPng();

        const result = await handler({
            action: 'add_file',
            name: 'hero',
            import_path: '/tmp/game/sprites/hero.png',
            type: 'character',
        }) as any;

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.asset_name).toBe('hero');
        expect(data.width).toBe(2);
        expect(data.height).toBe(2);
        expect(data.color_count).toBeGreaterThan(0);
        expect(data.color_count).toBeLessThanOrEqual(256);

        // Asset registered in project
        const ws = WorkspaceClass.instance();
        const info = ws.project!.info();
        expect(info.assets['hero']).toBeDefined();
        expect(info.assets['hero'].type).toBe('character');
    });

    it('add_file palette count is always ≤ 256', async () => {
        await initProject();
        // 300 unique colors — should be reduced to ≤ 256
        const colors: [number, number, number, number][] = Array.from(
            { length: 300 },
            (_, i) => [i % 256, (i * 3) % 256, (i * 7) % 256, 255]
        );
        mockPng(20, 15, colors);

        const result = await handler({
            action: 'add_file',
            name: 'big_sprite',
            import_path: '/tmp/game/big_sprite.png',
        }) as any;

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.color_count).toBeLessThanOrEqual(256);
    });

    it('add_file without name returns error', async () => {
        await initProject();
        const result = await handler({
            action: 'add_file',
            import_path: '/tmp/hero.png',
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('name');
    });

    it('add_file without import_path returns error', async () => {
        await initProject();
        const result = await handler({
            action: 'add_file',
            name: 'hero',
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('import_path');
    });

    it('add_file without loaded project returns error', async () => {
        const result = await handler({
            action: 'add_file',
            name: 'hero',
            import_path: '/tmp/hero.png',
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No project loaded');
    });

    it('add_file returns error when PNG file cannot be read', async () => {
        await initProject();
        vi.mocked(fsModule.readFile as any).mockRejectedValue(new Error('ENOENT'));

        const result = await handler({
            action: 'add_file',
            name: 'missing',
            import_path: '/tmp/no_such_file.png',
        }) as any;

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Cannot read PNG');
    });
});

