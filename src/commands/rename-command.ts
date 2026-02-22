import { type Command } from './command.js';
import { type ProjectClass } from '../classes/project.js';
import { type AssetRegistryEntry } from '../types/project.js';

export class RenameCommand implements Command {
    private registryEntry: AssetRegistryEntry;

    constructor(
        private project: ProjectClass,
        private oldName: string,
        private newName: string,
        private action: () => void,
        private undoAction: () => void
    ) {
        const info = project.info();
        this.registryEntry = JSON.parse(JSON.stringify(info.assets[oldName]));
    }

    execute(): void {
        this.action();
    }

    undo(): void {
        this.undoAction();
    }
}
