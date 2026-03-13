import { type Command } from './command.js';

export class RenameCommand implements Command {
  constructor(
    _project: unknown,
    _oldName: string,
    _newName: string,
    private action: () => void,
    private undoAction: () => void,
  ) {}

  execute(): void {
    this.action();
  }

  undo(): void {
    this.undoAction();
  }
}
