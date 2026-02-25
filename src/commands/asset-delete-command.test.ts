import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectClass } from '../classes/project.js';
import { AssetDeleteCommand } from './asset-delete-command.js';

describe('AssetDeleteCommand', () => {
  let project: ProjectClass;

  beforeEach(() => {
    project = ProjectClass.create('/mock/pixelmcp.json', 'TestProject');
    project.registerAsset('player', { path: 'assets/player.json', type: 'character' });
    project.registerAsset('sword', { path: 'assets/sword.json', type: 'weapon' });
  });

  it('execute→undo restores registry entry', () => {
    const cmd = new AssetDeleteCommand(project, 'player', () => {
      project.removeAsset('player');
    });

    expect('player' in project.info().assets).toBe(true);
    cmd.execute();
    expect('player' in project.info().assets).toBe(false);
    cmd.undo();
    expect('player' in project.info().assets).toBe(true);
  });

  it('execute→undo→redo removes again', () => {
    const cmd = new AssetDeleteCommand(project, 'player', () => {
      project.removeAsset('player');
    });

    cmd.execute();
    cmd.undo();
    // Re-execute the action callback manually since AssetDeleteCommand.execute() just calls action
    cmd.execute();
    expect('player' in project.info().assets).toBe(false);
  });

  it('restores correct asset type and path on undo', () => {
    const cmd = new AssetDeleteCommand(project, 'player', () => {
      project.removeAsset('player');
    });

    cmd.execute();
    cmd.undo();
    const entry = project.info().assets['player'];
    expect(entry.type).toBe('character');
    expect(entry.path).toBe('assets/player.json');
  });

  it('does not affect other registry entries', () => {
    const cmd = new AssetDeleteCommand(project, 'player', () => {
      project.removeAsset('player');
    });

    cmd.execute();
    expect('sword' in project.info().assets).toBe(true);
    cmd.undo();
    expect('sword' in project.info().assets).toBe(true);
  });

  it('preserves variant-based registry entry on undo', () => {
    project.registerAsset('armor', {
      type: 'armor',
      variants: {
        standard: 'assets/armor/standard.json',
        slim: 'assets/armor/slim.json',
      },
    });

    const cmd = new AssetDeleteCommand(project, 'armor', () => {
      project.removeAsset('armor');
    });

    cmd.execute();
    expect('armor' in project.info().assets).toBe(false);
    cmd.undo();
    const entry = project.info().assets['armor'];
    expect(entry.type).toBe('armor');
    expect(entry.variants).toBeDefined();
    expect(entry.variants?.['standard']).toBe('assets/armor/standard.json');
    expect(entry.variants?.['slim']).toBe('assets/armor/slim.json');
  });
});
