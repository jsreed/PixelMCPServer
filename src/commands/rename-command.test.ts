import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectClass } from '../classes/project.js';
import { RenameCommand } from './rename-command.js';

describe('RenameCommand', () => {
  let project: ProjectClass;

  beforeEach(() => {
    project = ProjectClass.create('/mock/pixelmcp.json', 'TestProject');
    project.registerAsset('player', { path: 'assets/player.json', type: 'character' });
  });

  it('execute→undo restores original name', () => {
    const cmd = new RenameCommand(
      project,
      'player',
      'hero',
      () => {
        project.renameAsset('player', 'hero');
      },
      () => {
        project.renameAsset('hero', 'player');
      },
    );

    expect('player' in project.info().assets).toBe(true);
    cmd.execute();
    expect('hero' in project.info().assets).toBe(true);
    expect('player' in project.info().assets).toBe(false);
    cmd.undo();
    expect('player' in project.info().assets).toBe(true);
    expect('hero' in project.info().assets).toBe(false);
  });

  it('execute→undo→redo produces same rename', () => {
    const cmd = new RenameCommand(
      project,
      'player',
      'hero',
      () => {
        project.renameAsset('player', 'hero');
      },
      () => {
        project.renameAsset('hero', 'player');
      },
    );

    cmd.execute();
    cmd.undo();
    cmd.execute();
    expect('hero' in project.info().assets).toBe(true);
    expect('player' in project.info().assets).toBe(false);
  });

  it('preserves asset type and path through rename cycle', () => {
    const cmd = new RenameCommand(
      project,
      'player',
      'hero',
      () => {
        project.renameAsset('player', 'hero');
      },
      () => {
        project.renameAsset('hero', 'player');
      },
    );

    cmd.execute();
    const entry = project.info().assets['hero'];
    expect(entry.type).toBe('character');
    expect(entry.path).toBe('assets/player.json');

    cmd.undo();
    const restored = project.info().assets['player'];
    expect(restored.type).toBe('character');
    expect(restored.path).toBe('assets/player.json');
  });

  it('multiple undo/redo cycles are idempotent', () => {
    const cmd = new RenameCommand(
      project,
      'player',
      'hero',
      () => {
        project.renameAsset('player', 'hero');
      },
      () => {
        project.renameAsset('hero', 'player');
      },
    );

    for (let i = 0; i < 3; i++) {
      cmd.execute();
      expect('hero' in project.info().assets).toBe(true);
      cmd.undo();
      expect('player' in project.info().assets).toBe(true);
    }
  });
});
