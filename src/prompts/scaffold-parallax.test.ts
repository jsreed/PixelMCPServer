import { describe, it, expect } from 'vitest';
import { buildScaffoldParallaxText, registerScaffoldParallaxPrompt } from './scaffold-parallax.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_parallax prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldParallaxPrompt);
      expect(name).toBe('scaffold_parallax');
    });

    it('callback returns messages array with one user message', () => {
      const { cb } = capturePromptCallback(registerScaffoldParallaxPrompt);
      const result = cb({ name: 'forest_bg' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('asset add_layer');
    });

    it('references palette tool action', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('workspace save');
    });
  });

  describe('layer_count handling', () => {
    it('default (4) contains far_bg, sky, mid, near_fg', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('far_bg');
      expect(text).toContain('"sky"');
      expect(text).toContain('"mid"');
      expect(text).toContain('near_fg');
    });

    it('layer_count=2 contains far_bg and near_fg, does not contain sky or mid as layer names', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', layer_count: 2 });
      expect(text).toContain('far_bg');
      expect(text).toContain('near_fg');
      expect(text).not.toContain('"sky"');
      expect(text).not.toContain('"mid"');
    });

    it('layer_count=5 contains hills', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', layer_count: 5 });
      expect(text).toContain('hills');
    });

    it('layer_count=6 contains mid1 and mid2', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', layer_count: 6 });
      expect(text).toContain('mid1');
      expect(text).toContain('mid2');
    });

    it('layer_count=1 contains background', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', layer_count: 1 });
      expect(text).toContain('background');
    });
  });

  describe('viewport_width handling', () => {
    it('default (320) produces canvas width 640', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('640');
    });

    it('custom viewport_width=256 produces canvas width 512', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', viewport_width: 256 });
      expect(text).toContain('512');
    });
  });

  describe('height handling', () => {
    it('custom height=128 appears in text', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', height: 128 });
      expect(text).toContain('128');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file path', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg', palette: 'palettes/sky.json' });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/sky.json"');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('palette info');
    });
  });

  describe('layer structure', () => {
    it('includes camera_bounds shape layer', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('camera_bounds');
    });
  });

  describe('atmospheric perspective', () => {
    it('mentions desaturated or light for far layers', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/desaturated|light/i);
    });

    it('mentions saturated or dark for near layers', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/saturated|dark/i);
    });
  });

  describe('seamless tiling', () => {
    it('mentions seamless or tiling', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/seamless|tiling/i);
    });

    it('describes canvas width as 2x viewport width', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/2\s*[×x]\s*viewport|2 × viewport/i);
    });
  });

  describe('scroll speeds', () => {
    it('mentions 0.10 for farthest layer', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/0\.10|0\.1[^0-9]/);
    });

    it('mentions 1.00 for nearest layer', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toMatch(/1\.00|1\.0[^0-9]/);
    });
  });

  describe('resource URI', () => {
    it('includes pixel://view/asset URI', () => {
      const text = buildScaffoldParallaxText({ name: 'forest_bg' });
      expect(text).toContain('pixel://view/asset/forest_bg');
    });
  });
});
