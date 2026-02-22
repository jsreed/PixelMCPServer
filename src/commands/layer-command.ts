import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class LayerCommand implements Command {
    private beforePatch: Pick<Asset, 'layers' | 'tags' | 'cels'>;
    private afterPatch: Pick<Asset, 'layers' | 'tags' | 'cels'> | null = null;

    constructor(private asset: AssetClass, private action: () => void) {
        const snapshot = asset.toJSON();
        this.beforePatch = {
            layers: snapshot.layers,
            tags: snapshot.tags,
            cels: snapshot.cels
        };
    }

    execute(): void {
        if (this.afterPatch !== null) {
            this.asset._restoreDataPatch(this.afterPatch);
        } else {
            this.action();
            const snapshot = this.asset.toJSON();
            this.afterPatch = {
                layers: snapshot.layers,
                tags: snapshot.tags,
                cels: snapshot.cels
            };
        }
    }

    undo(): void {
        this.asset._restoreDataPatch(this.beforePatch);
    }
}
