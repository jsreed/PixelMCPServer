import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { AssetClass } from '../classes/asset.js';
import { registerResources } from './index.js';

interface RegisteredResourceMock {
  name: string;
  template: ResourceTemplate;
  config: unknown;
  readCallback: (
    uri: URL,
    variables: Record<string, string>,
  ) => Promise<ReadResourceResult> | ReadResourceResult;
}

function captureRegisteredResources(): RegisteredResourceMock[] {
  const templates: RegisteredResourceMock[] = [];
  const mockServer = {
    registerResource(
      name: string,
      template: ResourceTemplate,
      config: unknown,
      readCallback: (
        uri: URL,
        variables: Record<string, string>,
      ) => Promise<ReadResourceResult> | ReadResourceResult,
    ) {
      templates.push({ name, template, config, readCallback });
    },
  };
  registerResources(mockServer as unknown as McpServer);
  return templates;
}

describe('MCP Resources', () => {
  let registered: RegisteredResourceMock[];

  beforeEach(() => {
    // Reset workspace
    WorkspaceClass.reset();
    registered = captureRegisteredResources();
  });

  describe('Discovery', () => {
    it('registers expected templates', () => {
      expect(registered).toBeDefined();
      const uris = registered.map(
        (t) =>
          (t.template as unknown as { uriTemplate: { template: string } }).uriTemplate.template,
      );
      expect(uris).toContain('pixel://view/asset/{name}');
      expect(uris).toContain('pixel://view/asset/{name}/layer/{layer_id}');
      expect(uris).toContain('pixel://view/asset/{name}/layer/{layer_id}/{frame_index}');
      expect(uris).toContain('pixel://view/asset/{name}/frame/{index}');
      expect(uris).toContain('pixel://view/animation/{name}/{tag}');
      expect(uris).toContain('pixel://view/palette/{name}');
      expect(uris).toContain('pixel://view/tileset/{name}');
    });

    it('returns available concrete resources based on workspace state', async () => {
      const workspace = WorkspaceClass.instance();

      const asset1 = new AssetClass({
        name: 'hero',
        width: 16,
        height: 16,
        perspective: 'flat',
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
        layers: [],
        frames: [],
        tags: [],
        cels: {},
      });

      const asset2 = new AssetClass({
        name: 'tree',
        width: 32,
        height: 32,
        perspective: 'flat',
        tile_width: 16,
        tile_height: 16,
        palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
        layers: [],
        frames: [],
        tags: [],
        cels: {},
      });

      workspace.loadedAssets.set('hero', asset1);
      workspace.loadedAssets.set('tree', asset2);

      // Find the templates with a listCallback
      const assetTemplate = registered.find((r) => r.name === 'asset_view');
      const paletteTemplate = registered.find((r) => r.name === 'palette_view');
      const tilesetTemplate = registered.find((r) => r.name === 'tileset_view');

      expect(assetTemplate?.template.listCallback).toBeDefined();
      if (!assetTemplate?.template.listCallback) throw new Error('No listCallback');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const assetList = await assetTemplate.template.listCallback({} as any);
      const assetUris = (assetList.resources as Resource[]).map((r) => r.uri);
      expect(assetUris).toContain('pixel://view/asset/hero');
      expect(assetUris).toContain('pixel://view/asset/tree');

      expect(paletteTemplate?.template.listCallback).toBeDefined();
      if (!paletteTemplate?.template.listCallback) throw new Error('No listCallback');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const paletteList = await paletteTemplate.template.listCallback({} as any);
      const paletteUris = (paletteList.resources as Resource[]).map((r) => r.uri);
      expect(paletteUris).toContain('pixel://view/palette/hero');
      expect(paletteUris).toContain('pixel://view/palette/tree');

      expect(tilesetTemplate?.template.listCallback).toBeDefined();
      if (!tilesetTemplate?.template.listCallback) throw new Error('No listCallback');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const tilesetList = await tilesetTemplate.template.listCallback({} as any);
      const tilesetUris = (tilesetList.resources as Resource[]).map((r) => r.uri);
      expect(tilesetUris).toContain('pixel://view/tileset/tree');
      expect(tilesetUris).not.toContain('pixel://view/tileset/hero');
    });
  });

  describe('Reading', () => {
    beforeEach(() => {
      const workspace = WorkspaceClass.instance();
      const asset = new AssetClass({
        name: 'hero',
        width: 16,
        height: 16,
        perspective: 'flat',
        palette: Array.from({ length: 256 }, (_, i) => [i, i, i, 255]),
        layers: [{ id: 1, type: 'image', name: 'Layer 1', visible: true, opacity: 255 }],
        frames: [
          { index: 0, duration_ms: 100 },
          { index: 1, duration_ms: 100 },
        ],
        tags: [],
        cels: {
          '1/0': {
            x: 0,
            y: 0,
            data: [
              [1, 2],
              [3, 4],
            ],
          },
          '1/1': {
            x: 0,
            y: 0,
            data: [
              [5, 6],
              [7, 8],
            ],
          },
        },
      });
      workspace.loadedAssets.set('hero', asset);
    });

    it('returns a valid PNG blob for a valid asset URI at frame 0', async () => {
      const assetTemplate = registered.find((r) => r.name === 'asset_view');
      expect(assetTemplate).toBeDefined();
      if (!assetTemplate) throw new Error('No asset_view template');

      const response = await assetTemplate.readCallback(new URL('pixel://view/asset/hero'), {
        name: 'hero',
      });

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      if ('mimeType' in content) {
        expect(content.mimeType).toBe('image/png');
      }
      if ('blob' in content) {
        expect(content.blob).toBeDefined();
        expect(typeof content.blob).toBe('string');
        expect(content.blob.length).toBeGreaterThan(100);
      }
    });

    it('returns a valid PNG blob for a specific frame', async () => {
      const frameTemplate = registered.find((r) => r.name === 'asset_frame_view');
      expect(frameTemplate).toBeDefined();
      if (!frameTemplate) throw new Error('No asset_frame_view template');

      const response = await frameTemplate.readCallback(
        new URL('pixel://view/asset/hero/frame/1'),
        {
          name: 'hero',
          index: '1',
        },
      );

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      if ('mimeType' in content) {
        expect(content.mimeType).toBe('image/png');
      }
      if ('blob' in content) {
        expect(content.blob).toBeDefined();
        expect(typeof content.blob).toBe('string');
        expect(content.blob.length).toBeGreaterThan(100);
      }
    });

    it('throws error for invalid asset', () => {
      const assetTemplate = registered.find((r) => r.name === 'asset_view');
      if (!assetTemplate) throw new Error('no assetTemplate');
      expect(() =>
        assetTemplate.readCallback(new URL('pixel://view/asset/unknown'), { name: 'unknown' }),
      ).toThrow("Asset 'unknown' is not loaded");
    });

    it('throws error for out of bounds frame', () => {
      const frameTemplate = registered.find((r) => r.name === 'asset_frame_view');
      if (!frameTemplate) throw new Error('no frameTemplate');
      expect(() =>
        frameTemplate.readCallback(new URL('pixel://view/asset/hero/frame/99'), {
          name: 'hero',
          index: '99',
        }),
      ).toThrow('Frame 99 is out of range');
    });
  });
});
