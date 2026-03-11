import { describe, it, expect } from 'vitest';
import { buildScaffoldTilesetText, registerScaffoldTilesetPrompt } from './scaffold-tileset.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Capture the prompt callback from the server registration
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

describe('scaffold_tileset prompt', () => {
  describe('registration', () => {
    it('registers with correct name', () => {
      const { name } = capturePromptCallback(registerScaffoldTilesetPrompt);
      expect(name).toBe('scaffold_tileset');
    });

    it('callback returns messages array with one user message of type text', () => {
      const { cb } = capturePromptCallback(registerScaffoldTilesetPrompt);
      const result = cb({ name: 'grass' });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });
  });

  describe('required tool references', () => {
    it('references asset create', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('asset create');
    });

    it('references tile_width and tile_height', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('tile_width');
      expect(text).toContain('tile_height');
    });

    it('references autotile_generate', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('autotile_generate');
    });

    it('references godot_tileset export', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('godot_tileset');
    });

    it('references workspace save', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('workspace save');
    });

    it('references a palette action', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toMatch(/palette (info|fetch_lospec|load)/);
    });
  });

  describe('argument handling', () => {
    it('terrain_name defaults to asset name when omitted', () => {
      const text = buildScaffoldTilesetText({ name: 'stone' });
      expect(text).toContain('terrain_name="stone"');
    });

    it('custom terrain_name overrides asset name', () => {
      const text = buildScaffoldTilesetText({ name: 'stone', terrain_name: 'rocky' });
      expect(text).toContain('terrain_name="rocky"');
      expect(text).not.toContain('terrain_name="stone"');
    });

    it('custom tile_size appears in text', () => {
      const text = buildScaffoldTilesetText({ name: 'grass', tile_size: 32 });
      expect(text).toContain('32');
    });

    it('default tile_size is 16 when omitted', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('16');
    });

    it('asset name is included in output', () => {
      const text = buildScaffoldTilesetText({ name: 'my_tileset' });
      expect(text).toContain('my_tileset');
    });
  });

  describe('palette instructions', () => {
    it('uses fetch_lospec for Lospec slug (no slash, no .json)', () => {
      const text = buildScaffoldTilesetText({ name: 'grass', palette: 'endesga-32' });
      expect(text).toContain('palette fetch_lospec');
      expect(text).toContain('slug="endesga-32"');
    });

    it('uses load for file paths containing a slash', () => {
      const text = buildScaffoldTilesetText({
        name: 'grass',
        palette: 'palettes/terrain.json',
      });
      expect(text).toContain('palette load');
      expect(text).toContain('path="palettes/terrain.json"');
    });

    it('uses load for paths ending in .json', () => {
      const text = buildScaffoldTilesetText({ name: 'grass', palette: 'colors.json' });
      expect(text).toContain('palette load');
    });

    it('falls back to palette info when no palette specified', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('palette info');
    });
  });

  describe('blob47 content', () => {
    it('mentions blob47', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      expect(text).toContain('blob47');
    });

    it('describes the 8-bit neighbor bitmask', () => {
      const text = buildScaffoldTilesetText({ name: 'grass' });
      // Should explain the bitmask system
      expect(text).toMatch(/bitmask|8-bit/);
    });

    it('includes the tileset resource URI for the asset', () => {
      const text = buildScaffoldTilesetText({ name: 'my_tiles' });
      expect(text).toContain('pixel://view/tileset/my_tiles');
    });
  });
});
