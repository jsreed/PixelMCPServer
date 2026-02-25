import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceClass, getWorkspace } from './workspace.js';
import { ProjectClass } from './project.js';
import { type Asset } from '../types/asset.js';
import { type Command } from '../commands/command.js';
import { loadAssetFile, saveAssetFile } from '../io/index.js';

vi.mock('../io/index.js', () => ({
  loadAssetFile: vi.fn(),
  saveAssetFile: vi.fn(),
}));

/** Minimal valid Asset fixture for testing. */
function makeTestAsset(name: string): Asset {
  return {
    name,
    width: 16,
    height: 16,
    perspective: 'flat',
    palette: [[0, 0, 0, 0]],
    layers: [{ id: 1, name: 'base', type: 'image', visible: true, opacity: 255 }],
    frames: [{ index: 0, duration_ms: 100 }],
    cels: {},
    tags: [],
  };
}

function setupMockProject(ws: WorkspaceClass) {
  const projData = {
    pixelmcp_version: '1.0',
    name: 'Test Project',
    assets: {
      player: { type: 'char', path: 'player.json' },
      sword: { type: 'wpn', path: 'sword.json' },
      shield: { type: 'wpn', path: 'shield.json' },
      bow: { type: 'wpn', path: 'bow.json' },
      a: { type: 'misc', path: 'a.json' },
      b: { type: 'misc', path: 'b.json' },
      c: { type: 'misc', path: 'c.json' },
      npc: { type: 'char', path: 'npc.json' },
      armor: { type: 'armor', variants: { slim: 'armor_slim.json', large: 'armor_large.json' } },
      hero: { type: 'char', path: 'hero.json' },
    },
  };
  const proj = ProjectClass.fromJSON('/mock/pixelmcp.json', projData);
  ws.setProject(proj);
}

describe('WorkspaceClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    WorkspaceClass.reset();
    (loadAssetFile as any).mockImplementation(async (path: string) => {
      const name = path.split('/').pop()?.replace('.json', '') || 'unknown';
      const cleanName = name.replace('_slim', '').replace('_large', '');
      return makeTestAsset(cleanName);
    });
    (saveAssetFile as any).mockResolvedValue(undefined);
  });

  it('returns the same singleton instance', () => {
    const a = WorkspaceClass.instance();
    const b = WorkspaceClass.instance();
    expect(a).toBe(b);
  });

  it('getWorkspace() returns the singleton', () => {
    const ws = getWorkspace();
    expect(ws).toBe(WorkspaceClass.instance());
  });

  it('reset clears the singleton', () => {
    const a = WorkspaceClass.instance();
    WorkspaceClass.reset();
    const b = WorkspaceClass.instance();
    expect(a).not.toBe(b);
  });

  it('sets and reads the active project', () => {
    const ws = WorkspaceClass.instance();
    expect(ws.project).toBeNull();

    const proj = ProjectClass.create('/mock/pixelmcp.json', 'Test');
    ws.setProject(proj);
    expect(ws.project).toBe(proj);
  });

  it('loads and retrieves an asset', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);

    await ws.loadAsset('player');

    const asset = ws.getAsset('player');
    expect(asset.name).toBe('player');
    expect(loadAssetFile).toHaveBeenCalledWith('/mock/player.json');
  });

  it('throws when loading asset without active project', async () => {
    const ws = WorkspaceClass.instance();
    await expect(ws.loadAsset('player')).rejects.toThrow('No project loaded');
  });

  it('throws when getting an unloaded asset', () => {
    const ws = WorkspaceClass.instance();
    expect(() => {
      ws.getAsset('ghost');
    }).toThrow('not loaded');
  });

  it('unloads an asset and reports dirty state', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);

    await ws.loadAsset('sword');
    // Not dirty — clean unload
    const result1 = ws.unloadAsset('sword');
    expect(result1.hadUnsavedChanges).toBe(false);
    expect(ws.loadedAssets.has('sword')).toBe(false);

    // Dirty unload
    await ws.loadAsset('shield');
    const shieldAsset = ws.getAsset('shield');
    shieldAsset.addFrame({ index: 1, duration_ms: 200 }); // marks dirty
    const result2 = ws.unloadAsset('shield');
    expect(result2.hadUnsavedChanges).toBe(true);
  });

  it('throws when unloading a non-existent asset', () => {
    const ws = WorkspaceClass.instance();
    expect(() => {
      ws.unloadAsset('ghost');
    }).toThrow('not loaded');
  });

  it('clears selection when unloading the targeted asset', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('player');
    ws.selection = {
      asset_name: 'player',
      layer_id: 1,
      frame_index: 0,
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      mask: [[true]],
    };

    ws.unloadAsset('player');
    expect(ws.selection).toBeNull();
  });

  it('save writes to disk and clears dirty', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('bow');

    const asset = ws.getAsset('bow');
    asset.addFrame({ index: 1, duration_ms: 150 }); // marks dirty
    expect(asset.isDirty).toBe(true);

    const result = await ws.save('bow');
    expect(result.name).toBe('bow');
    expect(result.path).toBe('/mock/bow.json');

    expect(saveAssetFile).toHaveBeenCalledWith('/mock/bow.json', expect.any(Object));
    expect(asset.isDirty).toBe(false);
  });

  it('saveAll writes only dirty assets', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('a');
    await ws.loadAsset('b');
    await ws.loadAsset('c');

    // Only dirty 'a' and 'c'
    ws.getAsset('a').addFrame({ index: 1, duration_ms: 100 });
    ws.getAsset('c').addFrame({ index: 1, duration_ms: 100 });

    const saved = await ws.saveAll();
    const savedNames = saved.map((s) => s.name);

    expect(savedNames).toContain('a');
    expect(savedNames).toContain('c');
    expect(savedNames).not.toContain('b');

    expect(saveAssetFile).toHaveBeenCalledTimes(2);

    expect(ws.getAsset('a').isDirty).toBe(false);
    expect(ws.getAsset('c').isDirty).toBe(false);
    expect(ws.getAsset('b').isDirty).toBe(false);
  });

  describe('undo/redo', () => {
    function mockCommand(): Command & { executeCalls: number; undoCalls: number } {
      const cmd = {
        executeCalls: 0,
        undoCalls: 0,
        execute() {
          cmd.executeCalls++;
        },
        undo() {
          cmd.undoCalls++;
        },
      };
      return cmd;
    }

    it('pushCommand executes the command and updates undoDepth', () => {
      const ws = WorkspaceClass.instance();
      const cmd = mockCommand();
      ws.pushCommand(cmd);
      expect(cmd.executeCalls).toBe(1);
      expect(ws.undoDepth).toBe(1);
      expect(ws.redoDepth).toBe(0);
    });

    it('undo reverses a command and moves it to redo stack', () => {
      const ws = WorkspaceClass.instance();
      const cmd = mockCommand();
      ws.pushCommand(cmd);
      ws.undo();
      expect(cmd.undoCalls).toBe(1);
      expect(ws.undoDepth).toBe(0);
      expect(ws.redoDepth).toBe(1);
    });

    it('redo re-executes an undone command', () => {
      const ws = WorkspaceClass.instance();
      const cmd = mockCommand();
      ws.pushCommand(cmd);
      ws.undo();
      ws.redo();
      expect(cmd.executeCalls).toBe(2);
      expect(ws.undoDepth).toBe(1);
      expect(ws.redoDepth).toBe(0);
    });

    it('undo throws when nothing to undo', () => {
      const ws = WorkspaceClass.instance();
      expect(() => {
        ws.undo();
      }).toThrow('Nothing to undo');
    });

    it('redo throws when nothing to redo', () => {
      const ws = WorkspaceClass.instance();
      expect(() => {
        ws.redo();
      }).toThrow('Nothing to redo');
    });
  });

  it('info returns correct workspace summary', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('hero');

    const summary = ws.info();
    expect(summary.project).not.toBeNull();
    expect(summary.project?.name).toBe('Test Project');
    expect(summary.loadedAssets).toHaveLength(1);
    expect(summary.loadedAssets[0]?.name).toBe('hero');
    expect(summary.undoDepth).toBe(0);
    expect(summary.redoDepth).toBe(0);
    expect(summary.selection).toBeNull();
  });

  it('info reports selection when active', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('npc');
    ws.selection = {
      asset_name: 'npc',
      layer_id: 1,
      frame_index: 0,
      x: 2,
      y: 3,
      width: 4,
      height: 5,
      mask: [
        [true, false],
        [false, true],
      ],
    };

    const summary = ws.info();
    expect(summary.selection).not.toBeNull();
    expect(summary.selection?.asset_name).toBe('npc');
  });

  it('tracks and reports which variant was loaded', async () => {
    const ws = WorkspaceClass.instance();
    setupMockProject(ws);
    await ws.loadAsset('armor', 'slim');
    await ws.loadAsset('sword'); // no variant

    const summary = ws.info();
    const armorEntry = summary.loadedAssets.find((a) => a.name === 'armor');
    const swordEntry = summary.loadedAssets.find((a) => a.name === 'sword');

    expect(armorEntry?.variant).toBe('slim');
    expect(swordEntry?.variant).toBeUndefined();

    // Variant is cleaned up on unload
    ws.unloadAsset('armor');
    const summary2 = ws.info();
    expect(summary2.loadedAssets.find((a) => a.name === 'armor')).toBeUndefined();
  });
});
