import { type Command } from './command.js';
import { type ProjectClass } from '../classes/project.js';
import { type AssetRegistryEntry } from '../types/project.js';

export class AssetDeleteCommand implements Command {
  private registryEntry: AssetRegistryEntry;

  constructor(
    private project: ProjectClass,
    private assetName: string,
    private action: () => void,
  ) {
    const info = project.info();
    this.registryEntry = JSON.parse(JSON.stringify(info.assets[assetName]));
  }

  execute(): void {
    this.action(); // Perform the delete
  }

  undo(): void {
    this.project.registerAsset(this.assetName, this.registryEntry);
  }
}
