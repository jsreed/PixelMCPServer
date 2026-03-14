import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class NineSliceCommand implements Command {
  private beforePatch: Pick<Asset, 'nine_slice'>;
  private afterPatch: Pick<Asset, 'nine_slice'> | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = { nine_slice: snapshot.nine_slice };
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = { nine_slice: snapshot.nine_slice };
    }
  }

  undo(): void {
    this.asset._restoreDataPatch(this.beforePatch);
  }
}
