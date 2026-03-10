import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { dispatchResource } from './read.js';

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
