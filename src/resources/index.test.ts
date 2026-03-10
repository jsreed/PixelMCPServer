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

  describe('Reading (Stubs)', () => {
    it('returns a 1x1 transparent PNG blob for a valid asset URI', async () => {
      const assetTemplate = registered.find((r) => r.name === 'asset_view');
      expect(assetTemplate).toBeDefined();
      if (!assetTemplate) throw new Error('No asset_view template');

      const response = await assetTemplate.readCallback(new URL('pixel://view/asset/hero'), {
        name: 'hero',
      });

      expect(response.contents).toHaveLength(1);
      expect(response.contents[0].uri).toBe('pixel://view/asset/hero');

      // We must cast contents[0] or use "in" operator because length is 1 but TS doesn't know it's Blob contents vs Text
      const content = response.contents[0];
      if ('mimeType' in content) {
        expect(content.mimeType).toBe('image/png');
      }
      if ('blob' in content) {
        expect(content.blob).toBeDefined();
        expect(typeof content.blob).toBe('string');
      }
    });
  });
});
