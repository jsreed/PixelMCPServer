import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Cel, packCelKey } from '../types/cel.js';

export class ShapeCommand implements Command {
  private beforeCel: Cel | undefined;
  private afterCel: Cel | undefined | null = null;

  constructor(
    private asset: AssetClass,
    private layerId: number,
    private frameIndex: number,
    private action: () => void,
  ) {
    // Use raw cel access (not getCel) to preserve LinkedCel references.
    // getMutableCel breaks links on write; undo must restore the original link.
    const key = packCelKey(layerId, frameIndex);
    const cel = asset.cels[key] as Cel | undefined;
    this.beforeCel = cel !== undefined ? (JSON.parse(JSON.stringify(cel)) as Cel) : undefined;
  }

  execute(): void {
    if (this.afterCel !== null) {
      this.restore(this.afterCel);
    } else {
      this.action();
      // After the action, any link is already broken — raw and resolved are equivalent here.
      const key = packCelKey(this.layerId, this.frameIndex);
      const cel = this.asset.cels[key] as Cel | undefined;
      this.afterCel = cel !== undefined ? (JSON.parse(JSON.stringify(cel)) as Cel) : undefined;
    }
  }

  undo(): void {
    this.restore(this.beforeCel);
  }

  private restore(state: Cel | undefined): void {
    if (state === undefined) {
      this.asset.removeCel(this.layerId, this.frameIndex);
    } else {
      this.asset.setCel(this.layerId, this.frameIndex, JSON.parse(JSON.stringify(state)) as Cel);
    }
  }
}
