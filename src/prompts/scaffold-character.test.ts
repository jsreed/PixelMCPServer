import { describe, it, expect } from 'vitest';
import {
  buildScaffoldCharacterText,
  registerScaffoldCharacterPrompt,
} from './scaffold-character.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_character prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldCharacterPrompt);
      expect(name).toBe('scaffold_character');
    });

    it('callback returns messages array with one user message', () => {
      const { cb } = capturePromptCallback(registerScaffoldCharacterPrompt);
      const result = cb({ name: 'hero' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('asset add_tag');
    });

    it('references palette tool actions', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      // At least one palette action should be mentioned
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('workspace save');
    });
  });

  describe('custom dimensions', () => {
    it('passes through custom width and height', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', width: 32, height: 48 });
      expect(text).toContain('32×48');
    });

    it('defaults to 16×24 when dimensions omitted', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('16×24');
    });

    it('includes asset name in output', () => {
      const text = buildScaffoldCharacterText({ name: 'my_character' });
      expect(text).toContain('my_character');
    });
  });

  describe('4-dir vs 8-dir facing values', () => {
    it('4-directional uses S, N, E, W facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(text).toContain('facing="S"');
      expect(text).toContain('facing="N"');
      expect(text).toContain('facing="E"');
      expect(text).toContain('facing="W"');
    });

    it('4-directional does not include diagonal facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(text).not.toContain('facing="NE"');
      expect(text).not.toContain('facing="SE"');
      expect(text).not.toContain('facing="SW"');
      expect(text).not.toContain('facing="NW"');
    });

    it('8-directional includes all 8 cardinal and diagonal facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '8' });
      expect(text).toContain('facing="S"');
      expect(text).toContain('facing="N"');
      expect(text).toContain('facing="E"');
      expect(text).toContain('facing="W"');
      expect(text).toContain('facing="NE"');
      expect(text).toContain('facing="SE"');
      expect(text).toContain('facing="SW"');
      expect(text).toContain('facing="NW"');
    });

    it('4-dir produces fewer total frames than 8-dir', () => {
      const text4 = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      const text8 = buildScaffoldCharacterText({ name: 'hero', directions: '8' });
      // Extract the total frames count from "X frames total"
      const match4 = /(\d+) frames total/.exec(text4);
      const match8 = /(\d+) frames total/.exec(text8);
      expect(match4).not.toBeNull();
      expect(match8).not.toBeNull();
      if (match4 && match8) {
        expect(Number(match4[1])).toBeLessThan(Number(match8[1]));
      }
    });

    it('4-dir produces exactly 20 frames (4 dirs × 5 frames)', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(text).toContain('20 frames total');
    });

    it('8-dir produces exactly 40 frames (8 dirs × 5 frames)', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '8' });
      expect(text).toContain('40 frames total');
    });

    it('defaults to 4-directional when not specified', () => {
      const textDefault = buildScaffoldCharacterText({ name: 'hero' });
      const text4 = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(textDefault).toBe(text4);
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file paths containing a slash', () => {
      const text = buildScaffoldCharacterText({
        name: 'hero',
        palette: 'palettes/my-palette.json',
      });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/my-palette.json"');
    });

    it('uses load for paths ending in .json', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', palette: 'colors.json' });
      expect(text).toContain('palette load');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('palette info');
    });
  });

  describe('layer structure', () => {
    it('includes body layer (image type)', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('name="body"');
      expect(text).toMatch(/type="image".*name="body"|name="body".*type="image"/);
    });

    it('includes eyes/detail layer', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('name="eyes"');
    });

    it('includes hitbox shape layer', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('name="hitbox"');
      expect(text).toContain('type="shape"');
    });
  });

  describe('animation structure', () => {
    it('creates idle and walk tags for each direction', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      // Should have 4 idle tags and 4 walk tags (one per facing)
      const idleMatches = text.match(/name="idle"/g) ?? [];
      const walkMatches = text.match(/name="walk"/g) ?? [];
      expect(idleMatches.length).toBeGreaterThanOrEqual(4);
      expect(walkMatches.length).toBeGreaterThanOrEqual(4);
    });

    it('includes pixel://view resource URI for the asset', () => {
      const text = buildScaffoldCharacterText({ name: 'my_hero' });
      expect(text).toContain('pixel://view/asset/my_hero');
    });
  });
});
