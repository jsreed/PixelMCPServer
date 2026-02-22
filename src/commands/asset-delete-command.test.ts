import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectClass } from '../classes/project.js';
import { AssetDeleteCommand } from './asset-delete-command.js';

describe('AssetDeleteCommand', () => {
    let project: ProjectClass;

    beforeEach(() => {
        project = ProjectClass.create('/mock/pixelmcp.json', 'TestProject');
        project.registerAsset('test', { path: 'test.json', type: 'character' });
    });

    it('undoes registry removal', () => {
        let deleted = false;
        const cmd = new AssetDeleteCommand(project, 'test', () => {
            project.removeAsset('test');
            deleted = true;
        });

        expect('test' in project.info().assets).toBe(true);
        cmd.execute();
        expect(deleted).toBe(true);
        expect('test' in project.info().assets).toBe(false);
        cmd.undo();
        expect('test' in project.info().assets).toBe(true);
    });
});
