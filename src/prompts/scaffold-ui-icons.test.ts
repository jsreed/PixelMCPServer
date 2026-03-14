import { describe, it, expect } from 'vitest';
import { buildScaffoldUiIconsText, registerScaffoldUiIconsPrompt } from './scaffold-ui-icons.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_ui_icons prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldUiIconsPrompt);
      expect(name).toBe('scaffold_ui_icons');
    });

    it('callback returns messages array with one user message of type text', () => {
      const { cb } = capturePromptCallback(registerScaffoldUiIconsPrompt);
      const result = cb({ name: 'hud_icons' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toContain('asset create');
    });

    it('references export godot_atlas', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toContain('export godot_atlas');
    });

    it('references workspace save', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toContain('workspace save');
    });

    it('references a palette action', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toMatch(/palette (info|fetch_lospec|load)/);
    });
  });

  describe('argument handling', () => {
    it('default icon_size is 16 when omitted', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toContain('16');
    });

    it('custom icon_size appears in text', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons', icon_size: 32 });
      expect(text).toContain('32');
    });

    it('default count generates one asset name', () => {
      const text = buildScaffoldUiIconsText({ name: 'btn' });
      expect(text).toContain('btn_01');
      expect(text).not.toContain('btn_02');
    });

    it('custom count generates correct number of asset names', () => {
      const text = buildScaffoldUiIconsText({ name: 'btn', count: 3 });
      expect(text).toContain('btn_01');
      expect(text).toContain('btn_02');
      expect(text).toContain('btn_03');
      expect(text).not.toContain('btn_04');
    });

    it('asset name is embedded in text', () => {
      const text = buildScaffoldUiIconsText({ name: 'my_icons' });
      expect(text).toContain('my_icons');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file paths containing a slash', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons', palette: 'palettes/ui.json' });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/ui.json"');
    });

    it('uses load for paths ending in .json', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons', palette: 'colors.json' });
      expect(text).toContain('palette load');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldUiIconsText({ name: 'hud_icons' });
      expect(text).toContain('palette info');
    });
  });
});
