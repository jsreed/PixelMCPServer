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
