import { describe, it, expect } from 'vitest';
import {
  buildScaffoldEquipmentText,
  registerScaffoldEquipmentPrompt,
} from './scaffold-equipment.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Captures the prompt name and callback from a mock MCP server registration. */
type PromptArgs = Record<string, unknown>;
interface PromptMessage {
  role: string;
  content: { type: string; text: string };
}
interface PromptResult {
  messages: PromptMessage[];
}
type PromptCallback = (args: PromptArgs) => PromptResult;

function capturePromptCallback(registerFn: (server: McpServer) => void): {
  name: string;
  cb: PromptCallback;
} {
  let capturedName = '';
  let capturedCb!: PromptCallback;
  const mockServer = {
    registerPrompt(name: string, _config: unknown, callback: PromptCallback) {
      capturedName = name;
      capturedCb = callback;
    },
  };
  registerFn(mockServer as unknown as McpServer);
  return { name: capturedName, cb: capturedCb };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scaffold_equipment prompt', () => {
  // ── Registration ─────────────────────────────────────────────────────────

  describe('registration', () => {
    it('registers with the correct prompt name', () => {
      const { name } = capturePromptCallback(registerScaffoldEquipmentPrompt);
      expect(name).toBe('scaffold_equipment');
    });

    it('callback returns a messages array with exactly one entry', () => {
      const { cb } = capturePromptCallback(registerScaffoldEquipmentPrompt);
      const result = cb({ name: 'iron_sword' });
      expect(result.messages).toHaveLength(1);
    });

    it('the single message has role "user" and type "text"', () => {
      const { cb } = capturePromptCallback(registerScaffoldEquipmentPrompt);
      const result = cb({ name: 'iron_sword' });
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  // ── Required tool references ──────────────────────────────────────────────

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toContain('asset create');
    });

    it('references asset add_layer', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toContain('asset add_layer');
    });

    it('references asset add_tag', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toContain('asset add_tag');
    });

    it('references at least one palette action', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toMatch(/palette (info|set_bulk|fetch_lospec|load)/);
    });

    it('references the draw tool', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toContain('draw');
    });

    it('references workspace save', () => {
      const text = buildScaffoldEquipmentText({ name: 'iron_sword' });
      expect(text).toContain('workspace save');
    });
  });

  // ── Argument handling ─────────────────────────────────────────────────────

  describe('argument handling', () => {
    it('includes the asset name in the output text', () => {
      const text = buildScaffoldEquipmentText({ name: 'golden_axe' });
      expect(text).toContain('golden_axe');
    });

    it('defaults to "weapon" type when type is omitted', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword' });
      // weapon preset produces a "grip" layer
      expect(text).toContain('grip');
    });

    it('includes reference_character name when provided', () => {
      const text = buildScaffoldEquipmentText({
        name: 'sword',
        reference_character: 'hero',
      });
      expect(text).toContain('hero');
    });

    it('instructs the LLM to call asset info on the reference character', () => {
      const text = buildScaffoldEquipmentText({
        name: 'sword',
        reference_character: 'hero',
      });
      expect(text).toContain('asset info');
      expect(text).toContain('"hero"');
    });

    it('uses static 32×32 default dimensions when no reference_character provided', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword' });
      expect(text).toContain('32');
    });

    it('does not mention asset info for reference character when reference_character is absent', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword' });
      // Should not instruct querying a reference — no character to query
      expect(text).not.toContain('reference_character');
    });
  });

  // ── Equipment type layer structures ───────────────────────────────────────

  describe('equipment type layer structure', () => {
    it('weapon type produces base, detail, and grip layers', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword', type: 'weapon' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="detail"');
      expect(text).toContain('name="grip"');
    });

    it('weapon type gives grip layer a role of interaction_point', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword', type: 'weapon' });
      expect(text).toContain('role="interaction_point"');
    });

    it('armor_head type produces base, visor, and attachment layers', () => {
      const text = buildScaffoldEquipmentText({ name: 'helmet', type: 'armor_head' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="visor"');
      expect(text).toContain('name="attachment"');
    });

    it('armor_head type gives attachment layer a role of attachment_point', () => {
      const text = buildScaffoldEquipmentText({ name: 'helmet', type: 'armor_head' });
      expect(text).toContain('role="attachment_point"');
    });

    it('armor_chest type produces base, overlay, and attachment layers', () => {
      const text = buildScaffoldEquipmentText({ name: 'chestplate', type: 'armor_chest' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="overlay"');
      expect(text).toContain('name="attachment"');
    });

    it('cape type produces base, overlay, and attachment layers', () => {
      const text = buildScaffoldEquipmentText({ name: 'red_cape', type: 'cape' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="overlay"');
      expect(text).toContain('name="attachment"');
    });

    it('cape type does NOT produce a grip layer', () => {
      const text = buildScaffoldEquipmentText({ name: 'red_cape', type: 'cape' });
      expect(text).not.toContain('name="grip"');
    });

    it('unknown type falls back to base/detail/bounds layers', () => {
      const text = buildScaffoldEquipmentText({ name: 'ring', type: 'ring' });
      expect(text).toContain('name="base"');
      expect(text).toContain('name="detail"');
      expect(text).toContain('name="bounds"');
    });

    it('unknown type gives bounds layer role of attachment_point', () => {
      const text = buildScaffoldEquipmentText({ name: 'ring', type: 'ring' });
      expect(text).toContain('role="attachment_point"');
    });
  });

  // ── Directional tag instructions ──────────────────────────────────────────

  describe('directional frame tags', () => {
    it('static mode includes S, N, E, W idle facing tags', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword' });
      expect(text).toContain('facing="S"');
      expect(text).toContain('facing="N"');
      expect(text).toContain('facing="E"');
      expect(text).toContain('facing="W"');
    });

    it('reference_character mode instructs mirroring the character tags', () => {
      const text = buildScaffoldEquipmentText({
        name: 'sword',
        reference_character: 'hero',
      });
      // Should NOT list explicit S/N/E/W — instead tells LLM to mirror
      expect(text).toContain('asset add_tag');
      // Language about mirroring / aligning frames
      expect(text).toMatch(/mirror|replicate|align/i);
    });
  });

  // ── Palette instructions ──────────────────────────────────────────────────

  describe('palette instructions', () => {
    it('falls back to palette info when no reference_character is provided', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword' });
      expect(text).toContain('palette info');
    });

    it('mentions palette sharing when reference_character is provided', () => {
      const text = buildScaffoldEquipmentText({
        name: 'sword',
        reference_character: 'hero',
      });
      // Should mention palette sharing / alignment with reference character
      expect(text).toMatch(/share|align|match/i);
    });

    it('always mentions palette info as a fallback check', () => {
      const text = buildScaffoldEquipmentText({
        name: 'sword',
        reference_character: 'hero',
      });
      expect(text).toContain('palette info');
    });
  });

  // ── Resource URIs ────────────────────────────────────────────────────────

  describe('resource URIs', () => {
    it('includes pixel://view/asset/{name} URI for the equipment asset', () => {
      const text = buildScaffoldEquipmentText({ name: 'my_sword' });
      expect(text).toContain('pixel://view/asset/my_sword');
    });

    it('includes the reference character view URI when reference_character provided', () => {
      const text = buildScaffoldEquipmentText({
        name: 'my_sword',
        reference_character: 'my_hero',
      });
      expect(text).toContain('pixel://view/asset/my_hero');
    });
  });

  // ── Variant hints ─────────────────────────────────────────────────────────

  describe('variant hints', () => {
    it('weapon type mentions create_recolor for variants', () => {
      const text = buildScaffoldEquipmentText({ name: 'sword', type: 'weapon' });
      expect(text).toContain('create_recolor');
    });

    it('armor_head type mentions create_recolor for variants', () => {
      const text = buildScaffoldEquipmentText({ name: 'helmet', type: 'armor_head' });
      expect(text).toContain('create_recolor');
    });

    it('armor_chest type mentions create_recolor for variants', () => {
      const text = buildScaffoldEquipmentText({ name: 'chestplate', type: 'armor_chest' });
      expect(text).toContain('create_recolor');
    });

    it('cape type mentions create_recolor for variants', () => {
      const text = buildScaffoldEquipmentText({ name: 'red_cape', type: 'cape' });
      expect(text).toContain('create_recolor');
    });

    it('unknown type does NOT mention create_recolor', () => {
      const text = buildScaffoldEquipmentText({ name: 'ring', type: 'ring' });
      expect(text).not.toContain('create_recolor');
    });
  });
});
