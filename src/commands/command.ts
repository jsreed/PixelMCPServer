/**
 * Command interface for the undo/redo system.
 *
 * Concrete implementations capture an immutable snapshot of the before-state
 * at creation time. `execute()` applies the mutation; `undo()` restores
 * the captured snapshot.
 */
export interface Command {
  execute(): void;
  undo(): void;
}

/**
 * Manages undo/redo stacks of Command objects.
 *
 * `push()` executes the command and adds it to the undo stack.
 * New pushes clear the redo stack (branching invalidates the redo path).
 * Stack depth is capped at `maxDepth` — oldest commands are dropped.
 */
export class CommandHistory {
  private _undoStack: Command[] = [];
  private _redoStack: Command[] = [];
  private readonly _maxDepth: number;

  constructor(maxDepth: number = 100) {
    this._maxDepth = maxDepth;
  }

  push(cmd: Command): void {
    cmd.execute();
    this._undoStack.push(cmd);
    this._redoStack = [];
    if (this._undoStack.length > this._maxDepth) {
      this._undoStack.shift();
    }
  }

  undo(): void {
    const cmd = this._undoStack.pop();
    if (cmd === undefined) {
      throw new Error('Nothing to undo');
    }
    cmd.undo();
    this._redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this._redoStack.pop();
    if (cmd === undefined) {
      throw new Error('Nothing to redo');
    }
    cmd.execute();
    this._undoStack.push(cmd);
  }

  get undoDepth(): number {
    return this._undoStack.length;
  }

  get redoDepth(): number {
    return this._redoStack.length;
  }

  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
  }
}
