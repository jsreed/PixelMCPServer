import { describe, it, expect } from 'vitest';
import { buildAnalyzeAssetText, registerAnalyzeAssetPrompt } from './analyze-asset.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('analyze_asset prompt', () => {
  // ── Registration ────────────────────────────────────────────────────────────

  describe('registration', () => {
    it('registers with the correct prompt name', () => {
      const { name } = capturePromptCallback(registerAnalyzeAssetPrompt);
      expect(name).toBe('analyze_asset');
    });

    it('callback returns a messages array with exactly one entry', () => {
      const { cb } = capturePromptCallback(registerAnalyzeAssetPrompt);
      const result = cb({ asset_name: 'hero' });
      expect(result.messages).toHaveLength(1);
    });

    it('the single message has role "user" and type "text"', () => {
      const { cb } = capturePromptCallback(registerAnalyzeAssetPrompt);
      const result = cb({ asset_name: 'hero' });
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });

    it('callback passes asset_name through to the message text', () => {
      const { cb } = capturePromptCallback(registerAnalyzeAssetPrompt);
      const result = cb({ asset_name: 'my_sprite' });
      expect(result.messages[0].content.text).toContain('my_sprite');
    });
  });

  // ── Required tool references ────────────────────────────────────────────────

  describe('required tool references', () => {
    it('references asset info', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('asset info');
    });

    it('references palette info', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('palette info');
    });

    it('references asset detect_banding', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('asset detect_banding');
    });

    it('references tileset autotile_generate for slot coverage', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'terrain' });
      expect(text).toContain('tileset autotile_generate');
    });

    it('mentions query-only mode (omit terrain_name) for autotile check', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'terrain' });
      // Should describe the query-only mode (no terrain_name)
      expect(text).toMatch(/query.only|omit.*terrain_name|without.*terrain_name/i);
    });
  });

  // ── argument handling ───────────────────────────────────────────────────────

  describe('argument handling', () => {
    it('includes the asset_name in the output text', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'golden_knight' });
      expect(text).toContain('golden_knight');
    });

    it('uses the asset_name in the asset info call description', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'slime' });
      // The text should instruct calling asset info on the specific asset name
      expect(text).toMatch(/asset info.*slime|"slime".*asset info/s);
    });

    it('uses the asset_name in the palette info call description', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'slime' });
      expect(text).toMatch(/palette info.*slime|"slime".*palette info/s);
    });
  });

  // ── Palette analysis section ────────────────────────────────────────────────

  describe('palette analysis section', () => {
    it('instructs checking for unused palette indices', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/unused.*palette|palette.*unused/i);
    });

    it('instructs checking for near-duplicate colors', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/near.duplicate|duplicate.*color/i);
    });

    it('instructs checking ramp continuity', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/ramp.*continuity|continuity.*ramp/i);
    });
  });

  // ── Animation completeness section ──────────────────────────────────────────

  describe('animation completeness section', () => {
    it('instructs checking for out-of-range frame tag indices', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/out.of.range|out of range/i);
    });

    it('instructs checking for frames not covered by any tag', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/not covered|uncovered|no tag/i);
    });

    it('instructs checking for inconsistent frame durations within tags', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/inconsistent.*duration|duration.*inconsistent/i);
    });

    it('instructs verifying layer tag references exist', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/layer tag|layer.*tag/i);
    });
  });

  // ── Tileset check section ───────────────────────────────────────────────────

  describe('tileset slot coverage section', () => {
    it('mentions tile_width and tile_height as the check condition', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'terrain' });
      expect(text).toContain('tile_width');
      expect(text).toContain('tile_height');
    });

    it('references the blob47 pattern for slot coverage', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'terrain' });
      expect(text).toContain('blob47');
    });

    it('mentions expected, occupied, and missing slot lists', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'terrain' });
      expect(text).toContain('expected');
      expect(text).toContain('occupied');
      expect(text).toContain('missing');
    });

    it('instructs skipping tileset step for non-tileset assets', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toMatch(/skip|not applicable/i);
    });
  });

  // ── Structured output format ────────────────────────────────────────────────

  describe('structured critique report format', () => {
    it('instructs outputting a Structural Summary section', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('Structural Summary');
    });

    it('instructs outputting a Palette Issues section', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('Palette Issues');
    });

    it('instructs outputting an Animation Issues section', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('Animation Issues');
    });

    it('instructs outputting a Tileset Issues section', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('Tileset Issues');
    });

    it('instructs outputting a Suggested Fixes section', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      expect(text).toContain('Suggested Fixes');
    });

    it('requires fix suggestions to reference exact tool actions', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'hero' });
      // The output template demonstrates concrete tool-call style fix suggestions
      expect(text).toMatch(/tool (action|call)|asset add_tag|palette set/i);
    });
  });

  // ── Resource URIs ───────────────────────────────────────────────────────────

  describe('resource URIs', () => {
    it('includes the asset composite view URI', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'my_asset' });
      expect(text).toContain('pixel://view/asset/my_asset');
    });

    it('includes the palette swatch view URI', () => {
      const text = buildAnalyzeAssetText({ asset_name: 'my_asset' });
      expect(text).toContain('pixel://view/palette/my_asset');
    });
  });
});
