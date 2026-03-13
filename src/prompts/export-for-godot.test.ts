import { describe, it, expect } from 'vitest';
import { buildExportForGodotText, registerExportForGodotPrompt } from './export-for-godot.js';
import { capturePromptCallback } from './test-helpers.js';

describe('export_for_godot prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerExportForGodotPrompt);
      expect(name).toBe('export_for_godot');
    });

    it('callback returns messages array with one user message', () => {
      const { cb } = capturePromptCallback(registerExportForGodotPrompt);
      const result = cb({ asset_name: 'hero' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset info', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('asset info');
    });

    it('references godot_spriteframes export', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('export godot_spriteframes');
    });

    it('references godot_tileset export', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('export godot_tileset');
    });

    it('references godot_static export', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('export godot_static');
    });
  });

  describe('path parameter logic', () => {
    it('includes godot_project_path when provided', () => {
      const text = buildExportForGodotText({
        asset_name: 'hero',
        godot_project_path: '/my/godot/game',
      });
      expect(text).toContain('/my/godot/game');
      expect(text).toContain('construct a path relative to it');
    });

    it('provides fallback behavior when godot_project_path is omitted', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('Since no Godot project path was provided');
      expect(text).toContain('use the current project directory');
    });
  });

  describe('output format', () => {
    it('includes asset name in output', () => {
      const text = buildExportForGodotText({ asset_name: 'my_asset' });
      expect(text).toContain('my_asset');
    });

    it('includes pixel://view resource URI', () => {
      const text = buildExportForGodotText({ asset_name: 'hero' });
      expect(text).toContain('pixel://view/asset/hero');
    });
  });
});
