import { describe, it, expect } from 'vitest';
import { buildScaffoldUiFrameText, registerScaffoldUiFramePrompt } from './scaffold-ui-frame.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_ui_frame prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldUiFramePrompt);
      expect(name).toBe('scaffold_ui_frame');
    });

    it('callback returns messages array with one user message of type text', () => {
      const { cb } = capturePromptCallback(registerScaffoldUiFramePrompt);
      const result = cb({ name: 'button_frame' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('asset create');
    });

    it('references asset set_nine_slice', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('asset set_nine_slice');
    });

    it('references export godot_ui_frame', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('export godot_ui_frame');
    });

    it('references workspace save', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('workspace save');
    });

    it('references a palette action', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toMatch(/palette (info|fetch_lospec|load)/);
    });
  });

  describe('argument handling', () => {
    it('default width is 48 when omitted', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('48');
    });

    it('default height is 48 when omitted', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('48');
    });

    it('custom width appears in text', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame', width: 64 });
      expect(text).toContain('64');
    });

    it('custom height appears in text', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame', height: 32 });
      expect(text).toContain('32');
    });

    it('asset name is embedded in text', () => {
      const text = buildScaffoldUiFrameText({ name: 'my_frame' });
      expect(text).toContain('my_frame');
    });
  });

  describe('nine-slice content', () => {
    it('explains the nine-slice concept', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toMatch(/nine.slice|9.slice/i);
    });

    it('includes the asset preview URI', () => {
      const text = buildScaffoldUiFrameText({ name: 'my_frame' });
      expect(text).toContain('pixel://view/asset/my_frame');
    });

    it('margin is floor(min(w,h) / 6) for default 48×48', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      // floor(min(48,48) / 6) = 8
      expect(text).toContain('top: 8');
      expect(text).toContain('bottom: 8');
    });

    it('margin is derived from smaller dimension for non-square frames', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame', width: 96, height: 24 });
      // floor(min(96,24) / 6) = 4
      expect(text).toContain('top: 4');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file paths containing a slash', () => {
      const text = buildScaffoldUiFrameText({
        name: 'button_frame',
        palette: 'palettes/ui.json',
      });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/ui.json"');
    });

    it('uses load for paths ending in .json', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame', palette: 'colors.json' });
      expect(text).toContain('palette load');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldUiFrameText({ name: 'button_frame' });
      expect(text).toContain('palette info');
    });
  });
});
