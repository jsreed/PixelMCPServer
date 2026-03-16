import { describe, it, expect } from 'vitest';
import { buildScaffoldVfxText, registerScaffoldVfxPrompt } from './scaffold-vfx.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_vfx prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldVfxPrompt);
      expect(name).toBe('scaffold_vfx');
    });

    it('callback returns messages array with one user message', () => {
      const { cb } = capturePromptCallback(registerScaffoldVfxPrompt);
      const result = cb({ name: 'fire_burst' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_frame', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('asset add_frame');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('asset add_tag');
    });

    it('references palette tool action', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('workspace save');
    });
  });

  describe('vfx_type handling', () => {
    it('defaults to explosion when vfx_type omitted', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('explosion');
    });

    it('explosion contains explosion-specific phase terms', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', vfx_type: 'explosion' });
      expect(text).toContain('spawn');
      expect(text).toContain('dissipate');
    });

    it('magic contains magic-specific phase terms', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', vfx_type: 'magic' });
      expect(text).toContain('gather');
      expect(text).toContain('bloom');
    });

    it('hit_spark contains spark-specific phase terms', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', vfx_type: 'hit_spark' });
      expect(text).toContain('scatter');
      expect(text).toMatch(/ember|linger/i);
    });

    it('projectile contains projectile-specific phase terms', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', vfx_type: 'projectile' });
      expect(text).toContain('trail');
      expect(text).toContain('impact');
    });

    it('environmental contains environmental-specific terms', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', vfx_type: 'environmental' });
      expect(text).toMatch(/drift|rise/i);
    });
  });

  describe('frame_count handling', () => {
    it('defaults to 6 frames when omitted', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('6 frames total');
    });

    it('custom frame_count 8 appears in text', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', frame_count: 8 });
      expect(text).toContain('8 frames total');
    });

    it('frame_count 4 allocates exactly one frame per phase', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', frame_count: 4 });
      const frameLines = text
        .split('\n')
        .filter((l) => l.includes('asset add_frame') || l.includes('Frame 0'));
      expect(frameLines).toHaveLength(4);
    });
  });

  describe('canvas size handling', () => {
    it('defaults to 32×32', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('32×32');
    });

    it('custom 64×64 appears in text', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', width: 64, height: 64 });
      expect(text).toContain('64×64');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file path', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst', palette: 'palettes/vfx.json' });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/vfx.json"');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('palette info');
    });
  });

  describe('layer structure', () => {
    it('includes core image layer', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('name="core"');
    });

    it('includes glow image layer', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('name="glow"');
    });

    it('mentions additive blending', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toMatch(/additive/i);
    });
  });

  describe('resource URI', () => {
    it('includes pixel://view/asset URI', () => {
      const text = buildScaffoldVfxText({ name: 'fire_burst' });
      expect(text).toContain('pixel://view/asset/fire_burst');
    });
  });
});
