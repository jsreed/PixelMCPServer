import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';
import { getWorkspace } from '../classes/workspace.js';

export class FrameCommand implements Command {
  private beforePatch: Pick<Asset, 'frames' | 'tags' | 'cels'>;
  private afterPatch: Pick<Asset, 'frames' | 'tags' | 'cels'> | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = {
      frames: snapshot.frames,
      tags: snapshot.tags,
      cels: snapshot.cels,
    };
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = {
        frames: snapshot.frames,
        tags: snapshot.tags,
        cels: snapshot.cels,
      };
    }
    getWorkspace().validateSelection(this.asset.name);
  }

  undo(): void {
    this.asset._restoreDataPatch(this.beforePatch);
    getWorkspace().validateSelection(this.asset.name);
  }
}
