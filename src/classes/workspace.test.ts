import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceClass, getWorkspace } from './workspace.js';
import { ProjectClass } from './project.js';
import { type Asset } from '../types/asset.js';

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

describe('WorkspaceClass', () => {

    beforeEach(() => {
        WorkspaceClass.reset();
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

    it('loads and retrieves an asset', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('player', makeTestAsset('player'));

        const asset = ws.getAsset('player');
        expect(asset.name).toBe('player');
    });

    it('throws when getting an unloaded asset', () => {
        const ws = WorkspaceClass.instance();
        expect(() => { ws.getAsset('ghost'); }).toThrow('not loaded');
    });

    it('unloads an asset and reports dirty state', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('sword', makeTestAsset('sword'));

        // Not dirty — clean unload
        const result1 = ws.unloadAsset('sword');
        expect(result1.hadUnsavedChanges).toBe(false);
        expect(ws.loadedAssets.has('sword')).toBe(false);

        // Dirty unload
        ws.loadAsset('shield', makeTestAsset('shield'));
        const shieldAsset = ws.getAsset('shield');
        shieldAsset.addFrame({ index: 1, duration_ms: 200 }); // marks dirty
        const result2 = ws.unloadAsset('shield');
        expect(result2.hadUnsavedChanges).toBe(true);
    });

    it('throws when unloading a non-existent asset', () => {
        const ws = WorkspaceClass.instance();
        expect(() => { ws.unloadAsset('ghost'); }).toThrow('not loaded');
    });

    it('clears selection when unloading the targeted asset', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('player', makeTestAsset('player'));
        ws.selection = {
            asset_name: 'player', layer_id: 1, frame_index: 0,
            x: 0, y: 0, width: 8, height: 8,
            mask: [[true]],
        };

        ws.unloadAsset('player');
        expect(ws.selection).toBeNull();
    });

    it('save returns serialized data and clears dirty', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('bow', makeTestAsset('bow'));
        const asset = ws.getAsset('bow');
        asset.addFrame({ index: 1, duration_ms: 150 }); // marks dirty
        expect(asset.isDirty).toBe(true);

        const data = ws.save('bow');
        expect(data.name).toBe('bow');
        expect(asset.isDirty).toBe(false);
    });

    it('saveAll returns serialized data for dirty assets', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('a', makeTestAsset('a'));
        ws.loadAsset('b', makeTestAsset('b'));
        ws.loadAsset('c', makeTestAsset('c'));

        // Only dirty 'a' and 'c'
        ws.getAsset('a').addFrame({ index: 1, duration_ms: 100 });
        ws.getAsset('c').addFrame({ index: 1, duration_ms: 100 });

        const saved = ws.saveAll();
        const savedNames = saved.map((s) => s.name);
        expect(savedNames).toContain('a');
        expect(savedNames).toContain('c');
        expect(savedNames).not.toContain('b');
        // Each entry should have serialized data
        for (const entry of saved) {
            expect(entry.data).toBeDefined();
            expect(entry.data.name).toBe(entry.name);
        }
        expect(ws.getAsset('a').isDirty).toBe(false);
        expect(ws.getAsset('c').isDirty).toBe(false);
    });

    it('undo and redo throw (stubbed for Phase 1.3)', () => {
        const ws = WorkspaceClass.instance();
        expect(() => { ws.undo(); }).toThrow('not yet implemented');
        expect(() => { ws.redo(); }).toThrow('not yet implemented');
    });

    it('info returns correct workspace summary', () => {
        const ws = WorkspaceClass.instance();
        const proj = ProjectClass.create('/mock/pixelmcp.json', 'My Game');
        ws.setProject(proj);
        ws.loadAsset('hero', makeTestAsset('hero'));

        const summary = ws.info();
        expect(summary.project).not.toBeNull();
        expect(summary.project?.name).toBe('My Game');
        expect(summary.loadedAssets).toHaveLength(1);
        expect(summary.loadedAssets[0]?.name).toBe('hero');
        expect(summary.undoDepth).toBe(0);
        expect(summary.redoDepth).toBe(0);
        expect(summary.selection).toBeNull();
    });

    it('info reports selection when active', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('npc', makeTestAsset('npc'));
        ws.selection = {
            asset_name: 'npc', layer_id: 1, frame_index: 0,
            x: 2, y: 3, width: 4, height: 5,
            mask: [[true, false], [false, true]],
        };

        const summary = ws.info();
        expect(summary.selection).not.toBeNull();
        expect(summary.selection?.asset_name).toBe('npc');
    });

    it('tracks and reports which variant was loaded', () => {
        const ws = WorkspaceClass.instance();
        ws.loadAsset('armor', makeTestAsset('armor'), 'slim');
        ws.loadAsset('sword', makeTestAsset('sword')); // no variant

        const summary = ws.info();
        const armorEntry = summary.loadedAssets.find(a => a.name === 'armor');
        const swordEntry = summary.loadedAssets.find(a => a.name === 'sword');

        expect(armorEntry?.variant).toBe('slim');
        expect(swordEntry?.variant).toBeUndefined();

        // Variant is cleaned up on unload
        ws.unloadAsset('armor');
        const summary2 = ws.info();
        expect(summary2.loadedAssets.find(a => a.name === 'armor')).toBeUndefined();
    });

});
