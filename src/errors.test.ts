import { describe, it, expect } from 'vitest';
import * as errors from './errors.js';

describe('Shared Error Factory (src/errors.ts)', () => {
  it('domainError helper constructs the correct shape', () => {
    const err = errors.domainError('Test message');
    expect(err).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Test message' }],
    });
  });

  describe('project tool errors', () => {
    it('noProjectLoaded', () => {
      expect(errors.noProjectLoaded().content[0].text).toBe(
        'No project loaded. Call project init or project open first.',
      );
    });

    it('projectFileNotFound', () => {
      expect(errors.projectFileNotFound('path/to/missing.json').content[0].text).toBe(
        'Project file not found: path/to/missing.json',
      );
    });
  });

  describe('workspace tool errors', () => {
    it('assetNotInRegistry', () => {
      expect(errors.assetNotInRegistry('foo').content[0].text).toBe(
        "Asset 'foo' not found in project registry.",
      );
    });

    it('assetFileNotFound', () => {
      expect(errors.assetFileNotFound('missing.json').content[0].text).toBe(
        'Asset file not found: missing.json',
      );
    });

    it('assetNotLoaded', () => {
      expect(errors.assetNotLoaded('foo').content[0].text).toBe(
        "Asset 'foo' is not loaded in the workspace.",
      );
    });
  });

  describe('asset tool errors', () => {
    it('layerIsShapeLayer', () => {
      expect(errors.layerIsShapeLayer(2).content[0].text).toBe(
        'Layer 2 is a shape layer. Use asset get_shapes to read shape data.',
      );
    });

    it('layerNotFound', () => {
      expect(errors.layerNotFound(1, 'foo').content[0].text).toBe(
        "Layer 1 does not exist in asset 'foo'.",
      );
    });

    it('frameOutOfRange', () => {
      expect(errors.frameOutOfRange(5, 'foo', 2).content[0].text).toBe(
        "Frame 5 is out of range. Asset 'foo' has 2 frame(s).",
      );
    });

    it('notAGroupLayer', () => {
      expect(errors.notAGroupLayer(0).content[0].text).toBe(
        'Layer 0 is not a group layer and cannot be a parent.',
      );
    });

    it('notAnImageLayer', () => {
      expect(errors.notAnImageLayer(1).content[0].text).toBe(
        'Layer 1 is not an image layer. Provide an image layer as the pixel source.',
      );
    });

    it('noShapeLayerFound', () => {
      expect(errors.noShapeLayerFound('foo').content[0].text).toBe(
        "No target shape layer specified and no hitbox shape layer found in asset 'foo'.",
      );
    });

    it('notAShapeLayer', () => {
      expect(errors.notAShapeLayer(0).content[0].text).toBe('Layer 0 is not a shape layer.');
    });

    it('noRecolorPaletteSource', () => {
      expect(errors.noRecolorPaletteSource().content[0].text).toBe(
        'At least one palette source (palette_file, palette_slug, or palette_entries) is required for create_recolor.',
      );
    });
  });

  describe('draw & effect tool errors', () => {
    it('colorOutOfRange', () => {
      expect(errors.colorOutOfRange(256).content[0].text).toBe(
        'Color index 256 is out of range (0–255).',
      );
    });

    it('writePixelsDimensionMismatch', () => {
      expect(errors.writePixelsDimensionMismatch(5, 5, 8, 8).content[0].text).toBe(
        'write_pixels data dimensions (5×5) do not match declared width×height (8×8).',
      );
    });
  });

  describe('palette tool errors', () => {
    it('paletteIndexOutOfRange', () => {
      expect(errors.paletteIndexOutOfRange(-1).content[0].text).toBe(
        'Palette index -1 is out of range (0–255).',
      );
    });

    it('paletteIndexNoColor', () => {
      expect(errors.paletteIndexNoColor(10).content[0].text).toBe(
        'Palette index 10 has no color defined. Set it before generating a ramp.',
      );
    });

    it('generateRampInvalidOrder', () => {
      expect(errors.generateRampInvalidOrder().content[0].text).toBe(
        'generate_ramp requires color1 < color2.',
      );
    });

    it('lospecNotFound', () => {
      expect(errors.lospecNotFound('endesga-32').content[0].text).toBe(
        "Lospec palette 'endesga-32' not found or API unavailable.",
      );
    });

    it('paletteFileNotFound', () => {
      expect(errors.paletteFileNotFound('missing.json').content[0].text).toBe(
        'Palette file not found: missing.json',
      );
    });

    it('invalidPaletteFile', () => {
      expect(errors.invalidPaletteFile('bad.json').content[0].text).toBe(
        'Invalid palette file: bad.json. Expected { name, colors } with colors as [[r,g,b,a], ...].',
      );
    });
  });

  describe('tileset tool errors', () => {
    it('notATileset', () => {
      expect(errors.notATileset('foo').content[0].text).toBe(
        "Asset 'foo' has no tile dimensions. Create the asset with tile_width/tile_height via asset create.",
      );
    });

    it('autotilePatternRequired', () => {
      expect(errors.autotilePatternRequired().content[0].text).toBe(
        'autotile_generate requires a pattern (blob47, 4side, or 4corner).',
      );
    });

    it('tileIndexNotFound', () => {
      expect(errors.tileIndexNotFound(50, 'foo').content[0].text).toBe(
        "Tile index 50 does not exist in tileset 'foo'.",
      );
    });
  });

  describe('export tool errors', () => {
    it('cannotWritePath', () => {
      expect(errors.cannotWritePath('/root/nopermission.png').content[0].text).toBe(
        'Cannot write to path: /root/nopermission.png',
      );
    });
  });

  describe('selection tool errors', () => {
    it('clipboardEmpty', () => {
      expect(errors.clipboardEmpty().content[0].text).toBe(
        'Clipboard is empty. Copy or cut a selection first.',
      );
    });

    it('targetAssetNotLoaded', () => {
      expect(errors.targetAssetNotLoaded('foo').content[0].text).toBe(
        "Target asset 'foo' is not loaded in the workspace.",
      );
    });
  });
});
