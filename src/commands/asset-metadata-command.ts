import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class AssetMetadataCommand implements Command {
  private beforePatch: Pick<Asset, 'color_cycling'>;
  private afterPatch: Pick<Asset, 'color_cycling'> | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = { color_cycling: snapshot.color_cycling };
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = { color_cycling: snapshot.color_cycling };
    }
  }

  undo(): void {
    this.asset._restoreDataPatch(this.beforePatch);
  }
}
