import { describe, it, expect } from 'vitest';
import { ProjectClass } from './project.js';
import { type ProjectConfig } from '../types/project.js';
import * as path from 'node:path';

describe('ProjectClass', () => {
  const createTempPath = (file: string) => {
    return `/mock/project/${file}`;
  };

  it('creates a new active project', () => {
    const projPath = createTempPath('pixelmcp.json');
    const proj = ProjectClass.create(projPath, 'Test Project');

    expect(proj.name).toBe('Test Project');
    expect(proj.path).toBe(projPath);
    expect(proj.pixelmcp_version).toBe('1.0');
    expect(proj.created).toBeDefined();
    expect(proj.isDirty).toBe(true);
    expect(proj.assets).toEqual({});
  });

  it('initializes from JSON data without mutation', () => {
    const testData: ProjectConfig = {
      pixelmcp_version: '1.0',
      name: 'Loaded Project',
      created: '2026-02-21T12:00:00Z',
      assets: {
        player: { type: 'sprite', path: 'assets/player.json' },
      },
      defaults: { palette: 'endesga-32' },
    };

    const projPath = createTempPath('pixelmcp.json');
    const proj = ProjectClass.fromJSON(projPath, testData);

    expect(proj.name).toBe('Loaded Project');
    expect(proj.isDirty).toBe(false);
    expect(proj.created).toBe('2026-02-21T12:00:00Z');
    const player = proj.assets['player'] as { type: string; path?: string };
    expect(player).toBeDefined();
    expect(player.type).toBe('sprite');

    // Mutate getter response, ensure core data is immune
    const assets = proj.assets;
    delete assets['player'];
    expect(proj.assets['player']).toBeDefined();
  });

  it('registers a new asset with single path', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');
    proj.isDirty = false;

    proj.registerAsset('sword', { type: 'item', path: 'items/sword.json' });

    expect(proj.isDirty).toBe(true);
    const sword = proj.assets['sword'] as { type: string; path?: string };
    expect(sword).toBeDefined();
    expect(sword.type).toBe('item');
    expect(sword.path).toBe('items/sword.json');
  });

  it('registers a variant-based asset with recolor_of', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');

    proj.registerAsset('iron_sword', {
      type: 'weapon',
      variants: {
        standard: 'sprites/iron_sword_std.json',
        slim: 'sprites/iron_sword_slim.json',
      },
    });

    const entry = proj.assets['iron_sword'] as { type: string; variants?: Record<string, string> };
    expect(entry).toBeDefined();
    expect(entry.type).toBe('weapon');
    expect(entry.variants).toBeDefined();
    expect(entry.variants?.['standard']).toBe('sprites/iron_sword_std.json');

    // Register a recolor
    proj.registerAsset('corrupted_ground', {
      type: 'tileset',
      path: 'tilesets/corrupted_ground.json',
      recolor_of: 'ground',
    });

    const recolor = proj.assets['corrupted_ground'] as { type: string; recolor_of?: string };
    expect(recolor.recolor_of).toBe('ground');
  });

  it('removes an asset from the registry', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');
    proj.registerAsset('old_asset', { type: 'sprite', path: 'old.json' });
    proj.isDirty = false;

    proj.removeAsset('old_asset');

    expect(proj.isDirty).toBe(true);
    expect(proj.assets['old_asset']).toBeUndefined();
  });

  it('throws when removing a non-existent asset', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');
    expect(() => {
      proj.removeAsset('ghost');
    }).toThrow();
  });

  it('renames an asset in the registry', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');
    proj.registerAsset('old_name', { type: 'sprite', path: 'sprites/player.json' });
    proj.isDirty = false;

    proj.renameAsset('old_name', 'new_name');

    expect(proj.isDirty).toBe(true);
    expect(proj.assets['old_name']).toBeUndefined();
    const renamed = proj.assets['new_name'] as { type: string; path?: string };
    expect(renamed).toBeDefined();
    expect(renamed.path).toBe('sprites/player.json');
  });

  it('throws when renaming to an existing name', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'My Project');
    proj.registerAsset('a', { type: 'sprite', path: 'a.json' });
    proj.registerAsset('b', { type: 'sprite', path: 'b.json' });
    expect(() => {
      proj.renameAsset('a', 'b');
    }).toThrow();
  });

  it('resolves standard asset paths relative to the project root', () => {
    const testData: ProjectConfig = {
      pixelmcp_version: '1.0',
      name: 'Path Test',
      assets: {
        boss: { type: 'sprite', path: 'assets/boss.json' },
      },
    };

    const dir = '/home/user/workspace/game';
    const projectPath = path.posix.join(dir, 'pixelmcp.json');
    const expectedResolved = path.posix.resolve(dir, 'assets/boss.json');

    const proj = ProjectClass.fromJSON(projectPath, testData);
    expect(proj.resolveAssetPath('boss')).toBe(expectedResolved);
  });

  it('resolves variant asset paths correctly', () => {
    const testData: ProjectConfig = {
      pixelmcp_version: '1.0',
      name: 'Variant Test',
      assets: {
        armor: {
          type: 'equipment',
          variants: {
            standard: 'sprites/armor_std.json',
            slim: 'sprites/armor_slim.json',
          },
        },
      },
    };

    const dir = '/project';
    const projectPath = `${dir}/pixelmcp.json`;
    const proj = ProjectClass.fromJSON(projectPath, testData);

    // Explicit variant request
    expect(proj.resolveAssetPath('armor', 'slim')).toContain('armor_slim.json');
    // Default (first) variant when none provided
    expect(proj.resolveAssetPath('armor')).toContain('armor_std.json');

    // Should throw on invalid variant
    expect(() => {
      proj.resolveAssetPath('armor', 'nonexistent');
    }).toThrow();
  });

  it('detects palette source type correctly', () => {
    // Slug pattern
    const proj1 = ProjectClass.fromJSON(createTempPath('pixelmcp.json'), {
      pixelmcp_version: '1.0',
      name: 'slug',
      assets: {},
      defaults: { palette: 'endesga-32' },
    });
    expect(proj1.getPaletteSource()).toEqual({ type: 'slug', value: 'endesga-32' });

    // File pattern (slash)
    const proj2 = ProjectClass.fromJSON(createTempPath('pixelmcp.json'), {
      pixelmcp_version: '1.0',
      name: 'file-slash',
      assets: {},
      defaults: { palette: 'palettes/custom' },
    });
    expect(proj2.getPaletteSource()).toEqual({ type: 'file', value: 'palettes/custom' });

    // File pattern (extension)
    const proj3 = ProjectClass.fromJSON(createTempPath('pixelmcp.json'), {
      pixelmcp_version: '1.0',
      name: 'file-ext',
      assets: {},
      defaults: { palette: 'my_palette.json' },
    });
    expect(proj3.getPaletteSource()).toEqual({ type: 'file', value: 'my_palette.json' });

    // Undefined
    const proj4 = ProjectClass.fromJSON(createTempPath('pixelmcp.json'), {
      pixelmcp_version: '1.0',
      name: 'empty',
      assets: {},
    });
    expect(proj4.getPaletteSource()).toBeUndefined();
  });

  it('serializes to valid JSON-style objects', () => {
    const proj = ProjectClass.create(createTempPath('pixelmcp.json'), 'Json Test');
    proj.registerAsset('door', { type: 'prop', path: 'props/door.json' });

    const json = proj.toJSON();
    expect(json.name).toBe('Json Test');
    expect(json.pixelmcp_version).toBe('1.0');
    const door = json.assets['door'] as { type: string; path?: string };
    expect(door).toBeDefined();
    expect(door.path).toBe('props/door.json');
  });
});
