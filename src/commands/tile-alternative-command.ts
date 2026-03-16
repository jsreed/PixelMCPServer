import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class TileAlternativeCommand implements Command {
  private beforePatch: Pick<Asset, 'tile_alternatives'>;
  private afterPatch: Pick<Asset, 'tile_alternatives'> | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = { tile_alternatives: snapshot.tile_alternatives };
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = { tile_alternatives: snapshot.tile_alternatives };
    }
  }

  undo(): void {
    this.asset._restoreDataPatch(this.beforePatch);
  }
}
