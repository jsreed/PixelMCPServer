import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { WorkspaceClass } from '../classes/workspace.js';
import { AssetClass } from '../classes/asset.js';
import { registerResources } from './index.js';
import { PNG } from 'pngjs';

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
        tags: [{ type: 'frame', name: 'idle', start: 0, end: 1, direction: 'forward' }],
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
      const animationTemplate = registered.find((r) => r.name === 'animation_view');

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

      expect(animationTemplate?.template.listCallback).toBeDefined();
      if (!animationTemplate?.template.listCallback) throw new Error('No listCallback');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const animationList = await animationTemplate.template.listCallback({} as any);
      const animationUris = (animationList.resources as Resource[]).map((r) => r.uri);
      expect(animationUris).toContain('pixel://view/animation/hero/idle');
      expect(animationUris).not.toContain('pixel://view/animation/tree/idle');
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
        tags: [
          { type: 'frame', name: 'walk', start: 0, end: 1, direction: 'forward' },
          { type: 'layer', name: 'meta', layers: [1] },
        ],
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

    it('returns a valid PNG blob for a specific layer at frame 0', async () => {
      const layerTemplate = registered.find((r) => r.name === 'layer_view');
      expect(layerTemplate).toBeDefined();
      if (!layerTemplate) throw new Error('No layer_view template');

      const response = await layerTemplate.readCallback(
        new URL('pixel://view/asset/hero/layer/1'),
        {
          name: 'hero',
          layer_id: '1',
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

    it('returns a valid PNG blob for a specific layer at a specific frame', async () => {
      const layerFrameTemplate = registered.find((r) => r.name === 'layer_frame_view');
      expect(layerFrameTemplate).toBeDefined();
      if (!layerFrameTemplate) throw new Error('No layer_frame_view template');

      const response = await layerFrameTemplate.readCallback(
        new URL('pixel://view/asset/hero/layer/1/1'),
        {
          name: 'hero',
          layer_id: '1',
          frame_index: '1',
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

    it('returns a 1x1 transparent PNG for non-image/tilemap layers', async () => {
      const layerTemplate = registered.find((r) => r.name === 'layer_view');
      if (!layerTemplate) throw new Error('No layer_view template');

      const workspace = WorkspaceClass.instance();
      const hero = workspace.loadedAssets.get('hero');
      hero?.addLayer({ name: 'Shapes', type: 'shape', visible: true, opacity: 255 });
      const newLayerId = hero?.layers.find((l) => l.type === 'shape')?.id.toString() ?? '2';

      const response = await layerTemplate.readCallback(
        new URL(`pixel://view/asset/hero/layer/${newLayerId}`),
        {
          name: 'hero',
          layer_id: newLayerId,
        },
      );

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      expect(content.mimeType).toBe('image/png');
      if ('blob' in content) {
        expect(content.blob).toBe(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        );
      }
    });

    it('throws error for invalid layer', () => {
      const layerTemplate = registered.find((r) => r.name === 'layer_view');
      if (!layerTemplate) throw new Error('no layer_view template');
      expect(() =>
        layerTemplate.readCallback(new URL('pixel://view/asset/hero/layer/999'), {
          name: 'hero',
          layer_id: '999',
        }),
      ).toThrow('Layer 999 does not exist');
    });

    it('throws error for out of bounds frame in layer view', () => {
      const layerFrameTemplate = registered.find((r) => r.name === 'layer_frame_view');
      if (!layerFrameTemplate) throw new Error('no layer_frame_view template');
      expect(() =>
        layerFrameTemplate.readCallback(new URL('pixel://view/asset/hero/layer/1/99'), {
          name: 'hero',
          layer_id: '1',
          frame_index: '99',
        }),
      ).toThrow('Frame 99 is out of range');
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

    it('returns a valid GIF blob for a valid animation URI', async () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      expect(animationTemplate).toBeDefined();
      if (!animationTemplate) throw new Error('No animation_view template');

      const response = await animationTemplate.readCallback(
        new URL('pixel://view/animation/hero/walk'),
        {
          name: 'hero',
          tag: 'walk',
        },
      );

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      if ('mimeType' in content) {
        expect(content.mimeType).toBe('image/gif');
      }
      if ('blob' in content) {
        expect(content.blob).toBeDefined();
        expect(typeof content.blob).toBe('string');
        expect(content.blob.length).toBeGreaterThan(100);
      }
    });

    it('throws error for invalid tag in animation view', () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      if (!animationTemplate) throw new Error('no animation_view template');
      expect(() =>
        animationTemplate.readCallback(new URL('pixel://view/animation/hero/unknown_tag'), {
          name: 'hero',
          tag: 'unknown_tag',
        }),
      ).toThrow("Tag 'unknown_tag' does not exist on asset 'hero'");
    });

    it('throws error if tag is a layer tag in animation view', () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      if (!animationTemplate) throw new Error('no animation_view template');
      expect(() =>
        animationTemplate.readCallback(new URL('pixel://view/animation/hero/meta'), {
          name: 'hero',
          tag: 'meta',
        }),
      ).toThrow("Tag 'meta' is a layer tag, animation requires a frame tag");
    });

    it('throws error for invalid asset in animation view', () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      if (!animationTemplate) throw new Error('no animation_view template');
      expect(() =>
        animationTemplate.readCallback(new URL('pixel://view/animation/unknown/walk'), {
          name: 'unknown',
          tag: 'walk',
        }),
      ).toThrow("Asset 'unknown' is not loaded");
    });

    it('returns a valid PNG blob for a valid palette URI', async () => {
      const paletteTemplate = registered.find((r) => r.name === 'palette_view');
      expect(paletteTemplate).toBeDefined();
      if (!paletteTemplate) throw new Error('No palette_view template');

      const response = await paletteTemplate.readCallback(new URL('pixel://view/palette/hero'), {
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
        const buffer = Buffer.from(content.blob, 'base64');
        const png = PNG.sync.read(buffer);
        expect(png.width).toBe(256);
        expect(png.height).toBe(256);
      }
    });

    it('throws error for invalid asset in palette view', () => {
      const paletteTemplate = registered.find((r) => r.name === 'palette_view');
      if (!paletteTemplate) throw new Error('no palette_view template');
      expect(() =>
        paletteTemplate.readCallback(new URL('pixel://view/palette/unknown'), {
          name: 'unknown',
        }),
      ).toThrow("Asset 'unknown' is not loaded");
    });

    it('returns a valid PNG blob for a valid tileset URI', async () => {
      const workspace = WorkspaceClass.instance();
      const asset = new AssetClass({
        name: 'tree',
        width: 64, // 4 tiles wide
        height: 16,
        perspective: 'flat',
        tile_width: 16,
        tile_height: 16,
        tile_count: 3, // 3 tiles total
        palette: Array.from(
          { length: 256 },
          () => [0, 0, 0, 0] as [number, number, number, number],
        ),
        layers: [{ id: 1, type: 'image', name: 'Tile Map', visible: true, opacity: 255 }],
        frames: [{ index: 0, duration_ms: 100 }],
        tags: [],
        cels: {
          '1/0': {
            x: 0,
            y: 0,
            data: Array.from({ length: 16 }, () => new Array<number>(64).fill(1)),
          },
        },
      });
      // Just set one color in palette so it's not transparent
      asset.palette.set(1, [255, 0, 0, 255]);
      workspace.loadedAssets.set('tree', asset);

      const tilesetTemplate = registered.find((r) => r.name === 'tileset_view');
      expect(tilesetTemplate).toBeDefined();
      if (!tilesetTemplate) throw new Error('No tileset_view template');

      const response = await tilesetTemplate.readCallback(new URL('pixel://view/tileset/tree'), {
        name: 'tree',
      });

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      if ('mimeType' in content) {
        expect(content.mimeType).toBe('image/png');
      }
      if ('blob' in content) {
        expect(content.blob).toBeDefined();
        expect(typeof content.blob).toBe('string');
        const buffer = Buffer.from(content.blob, 'base64');
        const png = PNG.sync.read(buffer);

        // 3 tiles -> sqrt(3) ~ 1.732 -> 2 columns
        // ceil(3 / 2) -> 2 rows
        // width: 2 cols * 16px + 1px gap = 33
        // height: 2 rows * 16px + 1px gap = 33
        expect(png.width).toBe(33);
        expect(png.height).toBe(33);
      }
    });

    it('throws error for invalid asset in tileset view', () => {
      const tilesetTemplate = registered.find((r) => r.name === 'tileset_view');
      if (!tilesetTemplate) throw new Error('no tileset_view template');
      expect(() =>
        tilesetTemplate.readCallback(new URL('pixel://view/tileset/unknown'), {
          name: 'unknown',
        }),
      ).toThrow("Asset 'unknown' is not loaded");
    });

    it('throws error for non-tileset asset in tileset view', () => {
      const tilesetTemplate = registered.find((r) => r.name === 'tileset_view');
      if (!tilesetTemplate) throw new Error('no tileset_view template');

      // 'hero' is already mock-loaded but it lacks tile_width/height/count
      expect(() =>
        tilesetTemplate.readCallback(new URL('pixel://view/tileset/hero'), {
          name: 'hero',
        }),
      ).toThrow("Asset 'hero' is not a tileset");
    });

    // ── 4.1.8.3 Asset view PNG dimensions ─────────────────────────────────

    it('asset view PNG has correct dimensions matching asset width/height (16×16)', async () => {
      const assetTemplate = registered.find((r) => r.name === 'asset_view');
      if (!assetTemplate) throw new Error('No asset_view template');

      const response = await assetTemplate.readCallback(new URL('pixel://view/asset/hero'), {
        name: 'hero',
      });

      const content = response.contents[0];
      if ('blob' in content) {
        const png = PNG.sync.read(Buffer.from(content.blob, 'base64'));
        expect(png.width).toBe(16);
        expect(png.height).toBe(16);
      }
    });

    // ── 4.1.8.4 Layer view isolation ──────────────────────────────────────

    it('layer view renders only the requested layer, not other layers', async () => {
      const workspace = WorkspaceClass.instance();
      const hero = workspace.loadedAssets.get('hero');
      if (!hero) throw new Error('hero not loaded');

      // Add a second layer with palette index 50 at pixel (0,0)
      hero.addLayer({ name: 'Layer 2', type: 'image', visible: true, opacity: 255 });
      const layer2 = hero.layers.find((l) => l.name === 'Layer 2');
      if (!layer2) throw new Error('Layer 2 not added');

      hero.setCel(layer2.id, 0, {
        x: 0,
        y: 0,
        data: [
          [50, 0],
          [0, 0],
        ],
      } as Parameters<typeof hero.setCel>[2]);

      const layerTemplate = registered.find((r) => r.name === 'layer_view');
      if (!layerTemplate) throw new Error('No layer_view template');

      const response = await layerTemplate.readCallback(
        new URL('pixel://view/asset/hero/layer/1'),
        {
          name: 'hero',
          layer_id: '1',
        },
      );

      const content = response.contents[0];
      if ('blob' in content) {
        const png = PNG.sync.read(Buffer.from(content.blob, 'base64'));
        // palette[1] = [1, 1, 1, 255]; palette[50] = [50, 50, 50, 255]
        // pixel (0,0) should show layer 1's value (index 1) not layer 2's (index 50)
        const pixelOffset = 0; // (y=0 * width=16 + x=0) * 4
        expect(png.data[pixelOffset]).toBe(1); // R from palette[1]
        expect(png.data[pixelOffset + 1]).toBe(1); // G
        expect(png.data[pixelOffset + 2]).toBe(1); // B
        expect(png.data[pixelOffset + 3]).toBe(255); // A
      }
    });

    it('layer_frame_view resolves linked cels and returns a valid PNG', async () => {
      const workspace = WorkspaceClass.instance();
      const hero = workspace.loadedAssets.get('hero');
      if (!hero) throw new Error('hero not loaded');

      // Replace cel 1/1 with a linked cel pointing to 1/0
      hero.setCel(1, 1, { link: '1/0' } as Parameters<typeof hero.setCel>[2]);

      const layerFrameTemplate = registered.find((r) => r.name === 'layer_frame_view');
      if (!layerFrameTemplate) throw new Error('No layer_frame_view template');

      const response = await layerFrameTemplate.readCallback(
        new URL('pixel://view/asset/hero/layer/1/1'),
        { name: 'hero', layer_id: '1', frame_index: '1' },
      );

      expect(response.contents).toHaveLength(1);
      const content = response.contents[0];
      expect(content.mimeType).toBe('image/png');
      if ('blob' in content) {
        const png = PNG.sync.read(Buffer.from(content.blob, 'base64'));
        expect(png.width).toBe(16);
        expect(png.height).toBe(16);
      }
    });

    // ── 4.1.8.5 Animation GIF frame count and per-frame delays ────────────

    it('animation GIF contains the correct number of frames (2 for walk tag)', async () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      if (!animationTemplate) throw new Error('No animation_view template');

      const response = await animationTemplate.readCallback(
        new URL('pixel://view/animation/hero/walk'),
        { name: 'hero', tag: 'walk' },
      );

      const content = response.contents[0];
      if ('blob' in content) {
        const bytes = Buffer.from(content.blob, 'base64');
        // Count Graphic Control Extension blocks (0x21 0xF9) — one per frame
        let gceCount = 0;
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
            gceCount++;
          }
        }
        // walk tag spans frames 0–1 → 2 GCE blocks
        expect(gceCount).toBe(2);
      }
    });

    it('animation GIF encodes correct per-frame delay (100ms = 10 centiseconds = 0x0A 0x00)', async () => {
      const animationTemplate = registered.find((r) => r.name === 'animation_view');
      if (!animationTemplate) throw new Error('No animation_view template');

      const response = await animationTemplate.readCallback(
        new URL('pixel://view/animation/hero/walk'),
        { name: 'hero', tag: 'walk' },
      );

      const content = response.contents[0];
      if ('blob' in content) {
        const bytes = Buffer.from(content.blob, 'base64');
        // GCE block: 0x21 0xF9 0x04 <flags> <delay_lo> <delay_hi> <transparent> 0x00
        // Find first GCE block and check delay bytes at offsets +4 and +5
        let gcePos = -1;
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
            gcePos = i;
            break;
          }
        }
        expect(gcePos).toBeGreaterThanOrEqual(0);
        // 100ms ÷ 10 = 10 centiseconds = 0x0A (little-endian: lo=0x0A, hi=0x00)
        expect(bytes[gcePos + 4]).toBe(0x0a); // delay lo
        expect(bytes[gcePos + 5]).toBe(0x00); // delay hi
      }
    });
  });
});
