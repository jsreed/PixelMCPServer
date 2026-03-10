import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Asset } from '../types/asset.js';

export class TilesetCommand implements Command {
  private beforePatch: Pick<Asset, 'cels' | 'width' | 'height' | 'tile_count'> & Partial<Asset>;
  private afterPatch:
    | (Pick<Asset, 'cels' | 'width' | 'height' | 'tile_count'> & Partial<Asset>)
    | null = null;

  constructor(
    private asset: AssetClass,
    private action: () => void,
  ) {
    const snapshot = asset.toJSON();
    this.beforePatch = {
      cels: snapshot.cels,
      width: snapshot.width,
      height: snapshot.height,
      tile_count: snapshot.tile_count,
    };
    if (snapshot.tile_physics !== undefined) this.beforePatch.tile_physics = snapshot.tile_physics;
    if (snapshot.tile_terrain !== undefined) this.beforePatch.tile_terrain = snapshot.tile_terrain;
  }

  execute(): void {
    if (this.afterPatch !== null) {
      this.asset._restoreDataPatch(this.afterPatch);
    } else {
      this.action();
      const snapshot = this.asset.toJSON();
      this.afterPatch = {
        cels: snapshot.cels,
        width: snapshot.width,
        height: snapshot.height,
        tile_count: snapshot.tile_count,
      };
      if (snapshot.tile_physics !== undefined) this.afterPatch.tile_physics = snapshot.tile_physics;
      else this.afterPatch.tile_physics = undefined; // Force restore to undefined

      if (snapshot.tile_terrain !== undefined) this.afterPatch.tile_terrain = snapshot.tile_terrain;
      else this.afterPatch.tile_terrain = undefined;
    }
  }

  undo(): void {
    // We need to ensure that properties missing in the snapshot are cleared on undo as well
    const patch = { ...this.beforePatch };
    if (!('tile_physics' in patch)) patch.tile_physics = undefined;
    if (!('tile_terrain' in patch)) patch.tile_terrain = undefined;
    this.asset._restoreDataPatch(patch);
  }
}
