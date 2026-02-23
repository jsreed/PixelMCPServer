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
