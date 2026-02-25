import { describe, it, expect, beforeEach } from 'vitest';
import { PaletteClass } from '../classes/palette.js';
import { PaletteCommand } from './palette-command.js';

describe('PaletteCommand', () => {
  let palette: PaletteClass;

  beforeEach(() => {
    palette = new PaletteClass();
  });

  it('execute→undo restores original color', () => {
    const cmd = new PaletteCommand(palette, () => {
      palette.set(1, [255, 0, 0, 255]);
    });

    expect(palette.get(1)).toEqual([0, 0, 0, 0]);
    cmd.execute();
    expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    cmd.undo();
    expect(palette.get(1)).toEqual([0, 0, 0, 0]);
  });

  it('execute→undo→redo produces same result as initial execute', () => {
    const cmd = new PaletteCommand(palette, () => {
      palette.set(1, [255, 0, 0, 255]);
    });

    cmd.execute();
    const afterExecute = palette.get(1);
    cmd.undo();
    cmd.execute(); // redo path
    expect(palette.get(1)).toEqual(afterExecute);
  });

  it('undoes bulk color replacement', () => {
    const cmd = new PaletteCommand(palette, () => {
      palette.setBulk([
        [1, [255, 0, 0, 255]],
        [2, [0, 255, 0, 255]],
      ]);
    });

    cmd.execute();
    expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    expect(palette.get(2)).toEqual([0, 255, 0, 255]);
    cmd.undo();
    expect(palette.get(1)).toEqual([0, 0, 0, 0]);
    expect(palette.get(2)).toEqual([0, 0, 0, 0]);
    cmd.execute();
    expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    expect(palette.get(2)).toEqual([0, 255, 0, 255]);
  });

  it('undoes swap operation', () => {
    palette.set(1, [255, 0, 0, 255]);
    palette.set(2, [0, 255, 0, 255]);

    const cmd = new PaletteCommand(palette, () => {
      palette.swap(1, 2);
    });

    cmd.execute();
    expect(palette.get(1)).toEqual([0, 255, 0, 255]);
    expect(palette.get(2)).toEqual([255, 0, 0, 255]);
    cmd.undo();
    expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    expect(palette.get(2)).toEqual([0, 255, 0, 255]);
  });

  it('preserves unmodified palette entries through undo', () => {
    palette.set(5, [100, 100, 100, 255]);

    const cmd = new PaletteCommand(palette, () => {
      palette.set(1, [255, 0, 0, 255]);
    });

    cmd.execute();
    cmd.undo();
    // Entry 5 should be untouched
    expect(palette.get(5)).toEqual([100, 100, 100, 255]);
  });

  it('handles overwriting an existing non-default color', () => {
    palette.set(3, [50, 50, 50, 255]);

    const cmd = new PaletteCommand(palette, () => {
      palette.set(3, [200, 200, 200, 255]);
    });

    cmd.execute();
    expect(palette.get(3)).toEqual([200, 200, 200, 255]);
    cmd.undo();
    expect(palette.get(3)).toEqual([50, 50, 50, 255]);
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new PaletteCommand(palette, () => {
      palette.set(1, [255, 0, 0, 255]);
    });

    cmd.execute();
    cmd.undo();
    cmd.execute();
    cmd.undo();
    cmd.execute();
    expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    cmd.undo();
    expect(palette.get(1)).toEqual([0, 0, 0, 0]);
  });
});
