import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class TagCommand implements Command {
    private beforePatch: Pick<Asset, 'tags'>;
    private afterPatch: Pick<Asset, 'tags'> | null = null;

    constructor(private asset: AssetClass, private action: () => void) {
        this.beforePatch = { tags: asset.toJSON().tags };
    }

    execute(): void {
        if (this.afterPatch !== null) {
            this.asset._restoreDataPatch(this.afterPatch);
        } else {
            this.action();
            this.afterPatch = { tags: this.asset.toJSON().tags };
        }
    }

    undo(): void {
        this.asset._restoreDataPatch(this.beforePatch);
    }
}
