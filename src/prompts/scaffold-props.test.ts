import { describe, it, expect } from 'vitest';
import { buildScaffoldPropsText, registerScaffoldPropsPrompt } from './scaffold-props.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_props prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldPropsPrompt);
      expect(name).toBe('scaffold_props');
    });

    it('callback returns messages array with one user message', () => {
      const { cb } = capturePromptCallback(registerScaffoldPropsPrompt);
      const result = cb({ name: 'barrel' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('asset add_tag');
    });

    it('references palette tool action', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('workspace save');
    });
  });

  describe('prop_type handling', () => {
    it('defaults to decoration when prop_type omitted', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('decoration');
    });

    it('destructible includes breaking and broken states', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', prop_type: 'destructible' });
      expect(text).toContain('breaking');
      expect(text).toContain('broken');
    });

    it('interactable includes closed and open states', () => {
      const text = buildScaffoldPropsText({ name: 'chest', prop_type: 'interactable' });
      expect(text).toContain('closed');
      expect(text).toContain('open');
    });

    it('decoration includes idle state', () => {
      const text = buildScaffoldPropsText({ name: 'flower', prop_type: 'decoration' });
      expect(text).toContain('idle');
    });

    it('destructible has no interaction_area layer', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', prop_type: 'destructible' });
      expect(text).not.toContain('interaction_area');
    });

    it('interactable has interaction_area layer', () => {
      const text = buildScaffoldPropsText({ name: 'chest', prop_type: 'interactable' });
      expect(text).toContain('interaction_area');
    });

    it('decoration has no shape layers', () => {
      const text = buildScaffoldPropsText({ name: 'flower', prop_type: 'decoration' });
      expect(text).not.toContain('type="shape"');
    });
  });

  describe('layer structure', () => {
    it('destructible has base and debris layers', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', prop_type: 'destructible' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="debris"');
    });

    it('interactable has base and detail layers', () => {
      const text = buildScaffoldPropsText({ name: 'chest', prop_type: 'interactable' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="detail"');
    });

    it('decoration has base and detail layers', () => {
      const text = buildScaffoldPropsText({ name: 'flower', prop_type: 'decoration' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="detail"');
    });

    it('destructible has hitbox shape layer', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', prop_type: 'destructible' });
      expect(text).toContain('name="hitbox"');
    });

    it('interactable has hitbox shape layer', () => {
      const text = buildScaffoldPropsText({ name: 'chest', prop_type: 'interactable' });
      expect(text).toContain('name="hitbox"');
    });
  });

  describe('canvas size handling', () => {
    it('defaults to 16×16', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('16×16');
    });

    it('custom sizes appear in text', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', width: 32, height: 24 });
      expect(text).toContain('32×24');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file path', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', palette: 'palettes/props.json' });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/props.json"');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('palette info');
    });
  });

  describe('reference_character', () => {
    it('includes reference character name in text', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', reference_character: 'hero' });
      expect(text).toContain('hero');
    });

    it('includes asset info query for reference character', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', reference_character: 'hero' });
      expect(text).toContain('asset info');
      expect(text).toContain('"hero"');
    });

    it('includes scale guidance when reference_character provided', () => {
      const text = buildScaffoldPropsText({
        name: 'barrel',
        prop_type: 'destructible',
        reference_character: 'hero',
      });
      expect(text).toContain('Scale');
    });

    it('includes reference character view URI when provided', () => {
      const text = buildScaffoldPropsText({ name: 'barrel', reference_character: 'hero' });
      expect(text).toContain('pixel://view/asset/hero');
    });

    it('omits scale consistency step when reference_character absent', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).not.toContain('Scale consistency');
    });
  });

  describe('resource URI', () => {
    it('includes pixel://view/asset URI', () => {
      const text = buildScaffoldPropsText({ name: 'barrel' });
      expect(text).toContain('pixel://view/asset/barrel');
    });
  });
});
