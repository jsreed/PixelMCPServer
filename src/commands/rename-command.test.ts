import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectClass } from '../classes/project.js';
import { RenameCommand } from './rename-command.js';

describe('RenameCommand', () => {
    let project: ProjectClass;

    beforeEach(() => {
        project = ProjectClass.create('/mock/pixelmcp.json', 'TestProject');
        project.registerAsset('test', { path: 'test.json', type: 'character' });
    });

    it('undoes rename execution', () => {
        let renamed = false;
        const cmd = new RenameCommand(
            project,
            'test',
            'renamed_test',
            () => {
                project.renameAsset('test', 'renamed_test');
                renamed = true;
            },
            () => {
                project.renameAsset('renamed_test', 'test');
                renamed = false;
            }
        );

        expect('test' in project.info().assets).toBe(true);
        cmd.execute();
        expect(renamed).toBe(true);
        expect('renamed_test' in project.info().assets).toBe(true);
        expect('test' in project.info().assets).toBe(false);

        cmd.undo();
        expect(renamed).toBe(false);
        expect('test' in project.info().assets).toBe(true);
        expect('renamed_test' in project.info().assets).toBe(false);
    });
});
