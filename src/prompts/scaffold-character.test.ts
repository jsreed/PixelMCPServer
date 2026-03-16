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
    it('4-directional has S, N, E, W in the algorithm facings list', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(text).toContain('"S"');
      expect(text).toContain('"N"');
      expect(text).toContain('"E"');
      expect(text).toContain('"W"');
    });

    it('4-directional does not include diagonal facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '4' });
      expect(text).not.toContain('"NE"');
      expect(text).not.toContain('"SE"');
      expect(text).not.toContain('"SW"');
      expect(text).not.toContain('"NW"');
    });

    it('8-directional includes all 8 cardinal and diagonal facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', directions: '8' });
      expect(text).toContain('"S"');
      expect(text).toContain('"N"');
      expect(text).toContain('"E"');
      expect(text).toContain('"W"');
      expect(text).toContain('"NE"');
      expect(text).toContain('"SE"');
      expect(text).toContain('"SW"');
      expect(text).toContain('"NW"');
    });

    it('defaults to 4-directional when not specified — no diagonal facings', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).not.toContain('"NE"');
      expect(text).not.toContain('"SE"');
      expect(text).not.toContain('"SW"');
      expect(text).not.toContain('"NW"');
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
    it('includes pixel://view resource URI for the asset', () => {
      const text = buildScaffoldCharacterText({ name: 'my_hero' });
      expect(text).toContain('pixel://view/asset/my_hero');
    });
  });

  describe('animation selection — menu path', () => {
    it('shows animation menu when animations not provided', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('Movement');
      expect(text).toContain('Combat');
      expect(text).toContain('Interaction');
      expect(text).toContain('Special');
      expect(text).toContain('idle_variant');
    });

    it('menu includes all 15 animation states', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      const names = [
        'idle',
        'walk',
        'run',
        'crouch',
        'jump',
        'attack',
        'hurt',
        'death',
        'block',
        'dash',
        'interact',
        'talk',
        'idle_variant',
        'cast',
        'emote',
      ];
      for (const animName of names) {
        expect(text).toContain(animName);
      }
    });
  });

  describe('animation selection — override path', () => {
    it('skips menu when animations provided', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', animations: ['idle', 'walk'] });
      expect(text).not.toContain('Interaction');
      expect(text).not.toContain('Special');
    });

    it('lists provided animations when animations override given', () => {
      const text = buildScaffoldCharacterText({
        name: 'hero',
        animations: ['idle', 'walk', 'attack'],
      });
      expect(text).toContain('idle');
      expect(text).toContain('walk');
      expect(text).toContain('attack');
    });

    it('falls back to menu when animations array is empty', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', animations: [] });
      expect(text).toContain('Movement');
      expect(text).toContain('Combat');
    });

    it('labels unknown animation names as custom', () => {
      const text = buildScaffoldCharacterText({ name: 'hero', animations: ['idle', 'fly'] });
      expect(text).toContain('fly');
      expect(text).toContain('custom');
    });

    it('description appears in header but not as step 4 hint when animations also provided', () => {
      const text = buildScaffoldCharacterText({
        name: 'hero',
        description: 'a brave warrior',
        animations: ['idle', 'walk'],
      });
      expect(text).toContain('Character: "a brave warrior"');
      expect(text).not.toContain('Character description:');
    });
  });

  describe('description argument', () => {
    it('includes description in prompt text when provided', () => {
      const text = buildScaffoldCharacterText({
        name: 'hero',
        description: 'shopkeeper NPC who sweeps',
      });
      expect(text).toContain('shopkeeper NPC who sweeps');
    });

    it('does not include Character label when description omitted', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).not.toContain('Character:');
    });
  });

  describe('frame layout algorithm', () => {
    it('includes algorithm explanation', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('framesPerDir');
      expect(text).toContain('totalFrames');
    });

    it('includes worked example with correct arithmetic', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      // framesPerDir = 8, total = 32 for the example
      expect(text).toContain('32');
      // S idle starts at 0
      expect(text).toMatch(/S\s*\|\s*idle\s*\|\s*0\s*\|\s*0/);
      // S walk: 1-4
      expect(text).toMatch(/S\s*\|\s*walk\s*\|\s*1\s*\|\s*4/);
      // S attack: 5-7
      expect(text).toMatch(/S\s*\|\s*attack\s*\|\s*5\s*\|\s*7/);
      // N idle: 8-8
      expect(text).toMatch(/N\s*\|\s*idle\s*\|\s*8\s*\|\s*8/);
      // W attack: 29-31
      expect(text).toMatch(/W\s*\|\s*attack\s*\|\s*29\s*\|\s*31/);
    });

    it('teaches asset add_frame and asset add_tag', () => {
      const text = buildScaffoldCharacterText({ name: 'hero' });
      expect(text).toContain('asset add_frame');
      expect(text).toContain('asset add_tag');
    });
  });
});
