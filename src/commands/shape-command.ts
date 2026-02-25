import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Cel } from '../types/cel.js';

export class ShapeCommand implements Command {
  private beforeCel: Cel | undefined;
  private afterCel: Cel | undefined | null = null;

  constructor(
    private asset: AssetClass,
    private layerId: number,
    private frameIndex: number,
    private action: () => void,
  ) {
    const cel = asset.getCel(layerId, frameIndex);
    this.beforeCel = cel ? JSON.parse(JSON.stringify(cel)) : undefined;
  }

  execute(): void {
    if (this.afterCel !== null) {
      this.restore(this.afterCel);
    } else {
      this.action();
      const cel = this.asset.getCel(this.layerId, this.frameIndex);
      this.afterCel = cel ? JSON.parse(JSON.stringify(cel)) : undefined;
    }
  }

  undo(): void {
    this.restore(this.beforeCel);
  }

  private restore(state: Cel | undefined): void {
    if (state === undefined) {
      this.asset.removeCel(this.layerId, this.frameIndex);
    } else {
      this.asset.setCel(this.layerId, this.frameIndex, JSON.parse(JSON.stringify(state)));
    }
  }
}
