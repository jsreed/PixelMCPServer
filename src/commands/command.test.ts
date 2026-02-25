import { describe, it, expect } from 'vitest';
import { type Command, CommandHistory } from './command.js';

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

/** A stateful mock command that modifies/restores a shared value. */
function statefulCommand(
  state: { value: number },
  newValue: number,
): Command & { executeCalls: number; undoCalls: number } {
  const before = state.value;
  const cmd = {
    executeCalls: 0,
    undoCalls: 0,
    execute() {
      state.value = newValue;
      cmd.executeCalls++;
    },
    undo() {
      state.value = before;
      cmd.undoCalls++;
    },
  };
  return cmd;
}

describe('CommandHistory', () => {
  it('push() executes the command', () => {
    const history = new CommandHistory();
    const cmd = mockCommand();
    history.push(cmd);
    expect(cmd.executeCalls).toBe(1);
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
  });

  it('push() clears the redo stack', () => {
    const history = new CommandHistory();
    const cmd1 = mockCommand();
    const cmd2 = mockCommand();
    history.push(cmd1);
    history.undo();
    expect(history.redoDepth).toBe(1);

    history.push(cmd2);
    expect(history.redoDepth).toBe(0);
  });

  it('undo() then redo() restores state', () => {
    const history = new CommandHistory();
    const cmd = mockCommand();
    history.push(cmd);

    history.undo();
    expect(cmd.undoCalls).toBe(1);
    expect(history.undoDepth).toBe(0);
    expect(history.redoDepth).toBe(1);

    history.redo();
    expect(cmd.executeCalls).toBe(2);
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
  });

  it('undo() throws when stack is empty', () => {
    const history = new CommandHistory();
    expect(() => {
      history.undo();
    }).toThrow('Nothing to undo');
  });

  it('redo() throws when stack is empty', () => {
    const history = new CommandHistory();
    expect(() => {
      history.redo();
    }).toThrow('Nothing to redo');
  });

  it('enforces max depth by dropping oldest commands', () => {
    const history = new CommandHistory(5);
    const commands: ReturnType<typeof mockCommand>[] = [];
    for (let i = 0; i < 8; i++) {
      const cmd = mockCommand();
      commands.push(cmd);
      history.push(cmd);
    }
    expect(history.undoDepth).toBe(5);
  });

  it('dropped oldest command cannot be undone', () => {
    const state = { value: 0 };
    const history = new CommandHistory(3);

    // Push 4 commands into a depth-3 history — first is dropped
    history.push(statefulCommand(state, 10));
    history.push(statefulCommand(state, 20));
    history.push(statefulCommand(state, 30));
    history.push(statefulCommand(state, 40));
    expect(state.value).toBe(40);
    expect(history.undoDepth).toBe(3);

    // Undo all 3 remaining — oldest (10→20) was dropped
    history.undo();
    expect(state.value).toBe(30);
    history.undo();
    expect(state.value).toBe(20);
    history.undo();
    expect(state.value).toBe(10);
    expect(history.undoDepth).toBe(0);

    // Cannot undo the dropped command
    expect(() => {
      history.undo();
    }).toThrow('Nothing to undo');
  });

  it('clear() resets both stacks', () => {
    const history = new CommandHistory();
    history.push(mockCommand());
    history.push(mockCommand());
    history.undo();

    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(1);

    history.clear();
    expect(history.undoDepth).toBe(0);
    expect(history.redoDepth).toBe(0);
  });

  it('handles multiple undo/redo in sequence', () => {
    const history = new CommandHistory();
    const cmd1 = mockCommand();
    const cmd2 = mockCommand();
    const cmd3 = mockCommand();

    history.push(cmd1);
    history.push(cmd2);
    history.push(cmd3);
    expect(history.undoDepth).toBe(3);

    history.undo(); // undo cmd3
    history.undo(); // undo cmd2
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(2);
    expect(cmd3.undoCalls).toBe(1);
    expect(cmd2.undoCalls).toBe(1);

    history.redo(); // redo cmd2
    expect(cmd2.executeCalls).toBe(2);
    expect(history.undoDepth).toBe(2);
    expect(history.redoDepth).toBe(1);
  });

  it('push after undo discards the redo branch', () => {
    const state = { value: 0 };
    const history = new CommandHistory();

    history.push(statefulCommand(state, 10));
    history.push(statefulCommand(state, 20));
    history.push(statefulCommand(state, 30));
    expect(state.value).toBe(30);

    // Undo back to 10
    history.undo();
    history.undo();
    expect(state.value).toBe(10);
    expect(history.redoDepth).toBe(2);

    // New push branches — redo stack is cleared
    history.push(statefulCommand(state, 99));
    expect(state.value).toBe(99);
    expect(history.redoDepth).toBe(0);
    expect(history.undoDepth).toBe(2); // cmd1 + new cmd

    // Redo of the old branch is gone
    expect(() => {
      history.redo();
    }).toThrow('Nothing to redo');
  });

  it('execute→undo→redo preserves state through full cycle', () => {
    const state = { value: 0 };
    const history = new CommandHistory();

    history.push(statefulCommand(state, 42));
    expect(state.value).toBe(42);

    history.undo();
    expect(state.value).toBe(0);

    history.redo();
    expect(state.value).toBe(42);
  });

  it('interleaved undo/redo maintains correct state', () => {
    const state = { value: 0 };
    const history = new CommandHistory();

    history.push(statefulCommand(state, 1));
    history.push(statefulCommand(state, 2));
    history.push(statefulCommand(state, 3));

    history.undo(); // → 2
    expect(state.value).toBe(2);
    history.redo(); // → 3
    expect(state.value).toBe(3);
    history.undo(); // → 2
    expect(state.value).toBe(2);
    history.undo(); // → 1
    expect(state.value).toBe(1);
    history.redo(); // → 2
    expect(state.value).toBe(2);
  });
});
