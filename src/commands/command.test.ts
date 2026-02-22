import { describe, it, expect } from 'vitest';
import { type Command, CommandHistory } from './command.js';

function mockCommand(): Command & { executeCalls: number; undoCalls: number } {
    const cmd = {
        executeCalls: 0,
        undoCalls: 0,
        execute() { cmd.executeCalls++; },
        undo() { cmd.undoCalls++; },
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
        expect(() => { history.undo(); }).toThrow('Nothing to undo');
    });

    it('redo() throws when stack is empty', () => {
        const history = new CommandHistory();
        expect(() => { history.redo(); }).toThrow('Nothing to redo');
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
});
