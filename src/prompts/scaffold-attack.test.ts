import { describe, it, expect } from 'vitest';
import { buildScaffoldAttackText, registerScaffoldAttackPrompt } from './scaffold-attack.js';
import { capturePromptCallback } from './test-helpers.js';

describe('scaffold_attack prompt', () => {
  describe('registration', () => {
    it('registers with name scaffold_attack', () => {
      const { name } = capturePromptCallback(registerScaffoldAttackPrompt);
      expect(name).toBe('scaffold_attack');
    });

    it('callback returns one user message with text content', () => {
      const { cb } = capturePromptCallback(registerScaffoldAttackPrompt);
      const result = cb({ name: 'hero_attack' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_frame', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('asset add_frame');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('asset add_tag');
    });

    it('references effect smear_frame', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toMatch(/smear/);
    });

    it('references a palette action', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references draw tool', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('workspace save');
    });
  });

  describe('attack_type handling', () => {
    it('defaults to melee_slash when attack_type omitted', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('melee_slash');
    });

    it('all 4 types produce different text', () => {
      const slash = buildScaffoldAttackText({ name: 'a', attack_type: 'melee_slash' });
      const thrust = buildScaffoldAttackText({ name: 'a', attack_type: 'melee_thrust' });
      const ranged = buildScaffoldAttackText({ name: 'a', attack_type: 'ranged' });
      const magic = buildScaffoldAttackText({ name: 'a', attack_type: 'magic_cast' });
      expect(slash).not.toBe(thrust);
      expect(slash).not.toBe(ranged);
      expect(slash).not.toBe(magic);
      expect(thrust).not.toBe(ranged);
      expect(thrust).not.toBe(magic);
      expect(ranged).not.toBe(magic);
    });

    it('melee_slash contains slash-specific terms', () => {
      const text = buildScaffoldAttackText({ name: 'a', attack_type: 'melee_slash' });
      expect(text).toMatch(/arc|slash/i);
    });

    it('melee_thrust contains thrust-specific terms', () => {
      const text = buildScaffoldAttackText({ name: 'a', attack_type: 'melee_thrust' });
      expect(text).toMatch(/thrust|extend/i);
    });

    it('ranged contains ranged-specific terms', () => {
      const text = buildScaffoldAttackText({ name: 'a', attack_type: 'ranged' });
      expect(text).toMatch(/projectile|release/i);
    });

    it('magic_cast contains magic-specific terms', () => {
      const text = buildScaffoldAttackText({ name: 'a', attack_type: 'magic_cast' });
      expect(text).toMatch(/channel|energy|burst/i);
    });
  });

  describe('frame_count handling', () => {
    it('defaults to 6 frames when omitted', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('6 frames total');
    });

    it('custom frame_count 8 appears in text', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack', frame_count: 8 });
      expect(text).toContain('8 frames total');
    });

    it('frame_count 4 still allocates phases', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack', frame_count: 4 });
      expect(text).toContain('4 frames total');
      // All phases should still be mentioned
      expect(text).toContain('anticipate');
    });
  });

  describe('weapon_asset handling', () => {
    it('includes weapon_asset name when provided', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack', weapon_asset: 'iron_sword' });
      expect(text).toContain('iron_sword');
    });

    it('references asset info on weapon_asset', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack', weapon_asset: 'iron_sword' });
      expect(text).toContain('asset info');
      expect(text).toContain('iron_sword');
    });

    it('no weapon_asset section in text when not provided', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).not.toContain('Weapon cross-reference');
    });
  });

  describe('layer structure', () => {
    it('includes body image layer', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('name="body"');
      expect(text).toMatch(/type="image".*name="body"|name="body".*type="image"/s);
    });

    it('includes trail image layer', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('name="trail"');
    });

    it('includes hitbox shape layer', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('name="hitbox"');
      expect(text).toContain('type="shape"');
    });
  });

  describe('resource URIs', () => {
    it('includes pixel://view/asset/{name} URI', () => {
      const text = buildScaffoldAttackText({ name: 'hero_attack' });
      expect(text).toContain('pixel://view/asset/hero_attack');
    });
  });
});
