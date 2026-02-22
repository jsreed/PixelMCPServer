import { type Command } from './command.js';
import { type PaletteClass } from '../classes/palette.js';
import { type Palette, type Color } from '../types/palette.js';

export class PaletteCommand implements Command {
    private beforeState: Palette;
    private afterState: Palette | null = null;

    constructor(private palette: PaletteClass, private action: () => void) {
        this.beforeState = palette.toJSON();
    }

    execute(): void {
        if (this.afterState !== null) {
            this.restore(this.afterState);
        } else {
            this.action();
            this.afterState = this.palette.toJSON();
        }
    }

    undo(): void {
        this.restore(this.beforeState);
    }

    private restore(state: Palette): void {
        const entries = state.map((c, i) => [i, c ?? [0, 0, 0, 0]] as [number, Color]);
        this.palette.setBulk(entries);
    }
}
