import { describe, it, expect, beforeEach } from 'vitest';
import { PaletteClass } from '../classes/palette.js';
import { PaletteCommand } from './palette-command.js';

describe('PaletteCommand', () => {
    let palette: PaletteClass;

    beforeEach(() => {
        palette = new PaletteClass();
    });

    it('undoes color replacement', () => {
        const cmd = new PaletteCommand(palette, () => {
            palette.set(1, [255, 0, 0, 255]);
        });

        expect(palette.get(1)).toEqual([0, 0, 0, 0]);
        cmd.execute();
        expect(palette.get(1)).toEqual([255, 0, 0, 255]);
        cmd.undo();
        expect(palette.get(1)).toEqual([0, 0, 0, 0]);
        cmd.execute(); // redo
        expect(palette.get(1)).toEqual([255, 0, 0, 255]);
    });

    it('undoes bulk color replacement with null entries properly mapped', () => {
        const cmd = new PaletteCommand(palette, () => {
            palette.setBulk([
                [1, [255, 0, 0, 255]],
                [2, [0, 255, 0, 255]]
            ]);
        });

        expect(palette.get(1)).toEqual([0, 0, 0, 0]);
        expect(palette.get(2)).toEqual([0, 0, 0, 0]);
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
});
