import { describe, it, expect } from 'vitest';
import {
  buildScaffoldSideScrollerText,
  registerScaffoldSideScrollerPrompt,
} from './scaffold-side-scroller.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_side_scroller prompt', () => {
  describe('registration', () => {
    it('registers with name scaffold_side_scroller', () => {
      const { name } = capturePromptCallback(registerScaffoldSideScrollerPrompt);
      expect(name).toBe('scaffold_side_scroller');
    });

    it('callback returns one user message with text content', () => {
      const { cb } = capturePromptCallback(registerScaffoldSideScrollerPrompt);
      const result = cb({ name: 'hero' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_frame', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('asset add_frame');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('asset add_tag');
    });

    it('references palette tool action', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('workspace save');
    });
  });

  describe('argument handling', () => {
    it('includes asset name in output', () => {
      const text = buildScaffoldSideScrollerText({ name: 'my_runner' });
      expect(text).toContain('my_runner');
    });

    it('defaults to 32x32 canvas', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('32×32');
    });

    it('custom width and height appear in text (48×64)', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero', width: 48, height: 64 });
      expect(text).toContain('48×64');
    });

    it('uses side_view perspective', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('side_view');
    });
  });

  describe('animation list handling', () => {
    it('default animations include idle', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('idle');
    });

    it('default animations include run', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('run');
    });

    it('default animations include jump_rise', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('jump_rise');
    });

    it('default animations include jump_fall', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('jump_fall');
    });

    it('default animations include land', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('land');
    });

    it('default animations include attack', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('attack');
    });

    it('custom animations override defaults', () => {
      const text = buildScaffoldSideScrollerText({
        name: 'hero',
        animations: ['idle', 'dodge', 'climb'],
      });
      expect(text).toContain('dodge');
      expect(text).toContain('climb');
      expect(text).not.toContain('"run"');
    });

    it('default total frame count is 18 (4+6+1+1+2+4)', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('18 frames total');
    });
  });

  describe('run cycle content', () => {
    it('includes run cycle phase guidance', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toMatch(/contact|passing|high.point/i);
    });
  });

  describe('jump arc content', () => {
    it('includes jump_rise and jump_fall guidance', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('jump_rise');
      expect(text).toContain('jump_fall');
    });
  });

  describe('landing content', () => {
    it('includes squash or recovery guidance for land', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toMatch(/squash|recovery/i);
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file path', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero', palette: 'palettes/char.json' });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/char.json"');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('palette info');
    });
  });

  describe('layer structure', () => {
    it('includes body layer', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('name="body"');
    });

    it('includes details layer', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('name="details"');
    });

    it('includes hitbox shape layer', () => {
      const text = buildScaffoldSideScrollerText({ name: 'hero' });
      expect(text).toContain('name="hitbox"');
      expect(text).toContain('type="shape"');
    });
  });

  describe('resource URIs', () => {
    it('includes pixel://view/asset/{name} URI', () => {
      const text = buildScaffoldSideScrollerText({ name: 'my_runner' });
      expect(text).toContain('pixel://view/asset/my_runner');
    });
  });
});
