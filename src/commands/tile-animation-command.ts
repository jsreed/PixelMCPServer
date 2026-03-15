import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class TileAnimationCommand implements Command {
  private beforePatch: Pick<Asset, 'tile_animation'>;
  private afterPatch: Pick<Asset, 'tile_animation'> | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = { tile_animation: snapshot.tile_animation };
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = { tile_animation: snapshot.tile_animation };
    }
  }

  undo(): void {
    this.asset._restoreDataPatch(this.beforePatch);
  }
}
