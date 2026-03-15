import { type Command } from './command.js';
import { CelWriteCommand } from './cel-write-command.js';
import { type AssetClass } from '../classes/asset.js';

export class FrameRangeCommand implements Command {
  private readonly innerCommands: CelWriteCommand[];

  constructor(
    asset: AssetClass,
    layerId: number,
    start: number,
    end: number,
    actionForFrame: (frameIndex: number) => void,
  ) {
    if (start < 0 || end < start || end >= asset.frames.length) {
      throw new Error(
        `frame_range [${String(start)}, ${String(end)}] is invalid. Requires 0 ≤ start ≤ end < frame_count.`,
      );
    }

    this.innerCommands = [];
    for (let f = start; f <= end; f++) {
      this.innerCommands.push(
        new CelWriteCommand(asset, layerId, f, () => {
          actionForFrame(f);
        }),
      );
    }
  }

  execute(): void {
    for (const cmd of this.innerCommands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.innerCommands.length - 1; i >= 0; i--) {
      this.innerCommands[i].undo();
    }
  }
}
