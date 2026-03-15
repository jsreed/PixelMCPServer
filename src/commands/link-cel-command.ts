import { type Command } from './command.js';
import { type AssetClass } from '../classes/asset.js';
import { type Cel, type LinkedCel, packCelKey } from '../types/cel.js';

export class LinkCelCommand implements Command {
  private readonly beforeCel: Cel | undefined;
  private readonly linkedCel: LinkedCel;

  constructor(
    private readonly asset: AssetClass,
    private readonly targetLayerId: number,
    private readonly targetFrameIndex: number,
    sourceLayerId: number,
    sourceFrameIndex: number,
  ) {
    // Capture existing target cel state (raw, preserving any existing link)
    const key = packCelKey(targetLayerId, targetFrameIndex);
    const existing = asset.cels[key] as Cel | undefined;
    this.beforeCel =
      existing !== undefined ? (JSON.parse(JSON.stringify(existing)) as Cel) : undefined;

    // The linked cel we will write
    this.linkedCel = { link: packCelKey(sourceLayerId, sourceFrameIndex) };
  }

  execute(): void {
    this.asset.setCel(this.targetLayerId, this.targetFrameIndex, this.linkedCel);
  }

  undo(): void {
    if (this.beforeCel === undefined) {
      this.asset.removeCel(this.targetLayerId, this.targetFrameIndex);
    } else {
      this.asset.setCel(
        this.targetLayerId,
        this.targetFrameIndex,
        JSON.parse(JSON.stringify(this.beforeCel)) as Cel,
      );
    }
  }
}
