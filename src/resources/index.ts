import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { getWorkspace } from '../classes/workspace.js';

const TRANSPARENT_1X1_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// ---------------------------------------------------------------------------
// 4.1.1.4 URI parser & dispatch
// ---------------------------------------------------------------------------

export type ResourceRoute =
  | { type: 'asset'; name: string }
  | { type: 'asset_frame'; name: string; frameIndex: number }
  | { type: 'layer'; name: string; layerId: number }
  | { type: 'layer_frame'; name: string; layerId: number; frameIndex: number }
  | { type: 'animation'; name: string; tag: string }
  | { type: 'palette'; name: string }
  | { type: 'tileset'; name: string };

/**
 * Dispatches a structured ResourceRoute to the appropriate renderer function.
 * (Phase 4.1.2+ will implement actual image rendering here).
 */
export function dispatchResource(
  route: ResourceRoute,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  switch (route.type) {
    case 'asset':
      return renderAssetView(route, uri);
    case 'asset_frame':
      return renderAssetFrameView(route, uri);
    case 'layer':
      return renderLayerView(route, uri);
    case 'layer_frame':
      return renderLayerFrameView(route, uri);
    case 'animation':
      return renderAnimationView(route, uri);
    case 'palette':
      return renderPaletteView(route, uri);
    case 'tileset':
      return renderTilesetView(route, uri);
  }
}

// ---------------------------------------------------------------------------
// Renderers (Stubbed for 4.1.1)
// ---------------------------------------------------------------------------

function renderAssetView(
  _route: Extract<ResourceRoute, { type: 'asset' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderAssetFrameView(
  _route: Extract<ResourceRoute, { type: 'asset_frame' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderLayerView(
  _route: Extract<ResourceRoute, { type: 'layer' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderLayerFrameView(
  _route: Extract<ResourceRoute, { type: 'layer_frame' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderAnimationView(
  _route: Extract<ResourceRoute, { type: 'animation' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/gif', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderPaletteView(
  _route: Extract<ResourceRoute, { type: 'palette' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderTilesetView(
  _route: Extract<ResourceRoute, { type: 'tileset' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

// ---------------------------------------------------------------------------
// 4.1.1.1 Resource Templates & 4.1.1.2 Resource Listing
// ---------------------------------------------------------------------------

/**
 * Registers all resource templates for MCP clients to discover and read.
 */
export function registerResources(server: McpServer): void {
  // 1. Asset View
  server.registerResource(
    'asset_view',
    new ResourceTemplate('pixel://view/asset/{name}', {
      list: () => {
        const workspace = getWorkspace();
        return {
          resources: Array.from(workspace.loadedAssets.keys()).map((name) => ({
            uri: `pixel://view/asset/${name}`,
            name: `Asset: ${name}`,
            mimeType: 'image/png',
          })),
        };
      },
    }),
    { description: 'Renders the composed asset at frame 0' },
    (uri, variables) => {
      const name = variables.name as string;
      return dispatchResource({ type: 'asset', name }, uri);
    },
  );

  // 2. Asset Frame View
  server.registerResource(
    'asset_frame_view',
    new ResourceTemplate('pixel://view/asset/{name}/frame/{index}', {
      list: undefined,
    }),
    { description: 'Renders the composed asset at a specific frame index' },
    (uri, variables) => {
      const name = variables.name as string;
      const frameIndex = parseInt(variables.index as string, 10);
      return dispatchResource({ type: 'asset_frame', name, frameIndex }, uri);
    },
  );

  // 3. Layer View
  server.registerResource(
    'layer_view',
    new ResourceTemplate('pixel://view/asset/{name}/layer/{layer_id}', {
      list: undefined,
    }),
    { description: 'Renders a specific layer at frame 0 in isolation' },
    (uri, variables) => {
      const name = variables.name as string;
      const layerId = parseInt(variables.layer_id as string, 10);
      return dispatchResource({ type: 'layer', name, layerId }, uri);
    },
  );

  // 3.1 Layer Frame View
  server.registerResource(
    'layer_frame_view',
    new ResourceTemplate('pixel://view/asset/{name}/layer/{layer_id}/{frame_index}', {
      list: undefined,
    }),
    { description: 'Renders a specific layer at a specific frame in isolation' },
    (uri, variables) => {
      const name = variables.name as string;
      const layerId = parseInt(variables.layer_id as string, 10);
      const frameIndex = parseInt(variables.frame_index as string, 10);
      return dispatchResource({ type: 'layer_frame', name, layerId, frameIndex }, uri);
    },
  );

  // 4. Animation View
  server.registerResource(
    'animation_view',
    new ResourceTemplate('pixel://view/animation/{name}/{tag}', {
      list: undefined,
    }),
    { description: 'Renders a specific frame tag as an animated GIF' },
    (uri, variables) => {
      const name = variables.name as string;
      const tag = variables.tag as string;
      return dispatchResource({ type: 'animation', name, tag }, uri);
    },
  );

  // 5. Palette View
  server.registerResource(
    'palette_view',
    new ResourceTemplate('pixel://view/palette/{name}', {
      list: () => {
        const workspace = getWorkspace();
        return {
          resources: Array.from(workspace.loadedAssets.keys()).map((name) => ({
            uri: `pixel://view/palette/${name}`,
            name: `Palette: ${name}`,
            mimeType: 'image/png',
          })),
        };
      },
    }),
    { description: 'Renders the asset palette as a swatch grid' },
    (uri, variables) => {
      const name = variables.name as string;
      return dispatchResource({ type: 'palette', name }, uri);
    },
  );

  // 6. Tileset View
  server.registerResource(
    'tileset_view',
    new ResourceTemplate('pixel://view/tileset/{name}', {
      list: () => {
        const workspace = getWorkspace();
        const resources = [];
        for (const [name, asset] of workspace.loadedAssets) {
          if (asset.tile_width !== undefined && asset.tile_height !== undefined) {
            resources.push({
              uri: `pixel://view/tileset/${name}`,
              name: `Tileset: ${name}`,
              mimeType: 'image/png',
            });
          }
        }
        return { resources };
      },
    }),
    { description: 'Renders all tiles in the asset as a grid' },
    (uri, variables) => {
      const name = variables.name as string;
      return dispatchResource({ type: 'tileset', name }, uri);
    },
  );
}
