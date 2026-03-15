import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { getWorkspace } from '../classes/workspace.js';
import { type AssetClass } from '../classes/asset.js';
import { packCelKey } from '../types/cel.js';
import * as errors from '../errors.js';

/**
 * Builds the structuredContent payload for a given asset and frame index.
 * For each layer, resolves linked cels and assembles a filtered cels map
 * keyed by "{layerId}/{frameIndex}".
 */
function buildAssetStateForFrame(asset: AssetClass, frameIndex: number): Record<string, unknown> {
  const layers = asset.layers;
  const cels: Record<string, unknown> = {};

  for (const layer of layers) {
    const cel = asset.getCel(layer.id, frameIndex);
    if (cel !== undefined) {
      cels[packCelKey(layer.id, frameIndex)] = cel;
    }
  }

  return {
    asset_name: asset.name,
    width: asset.width,
    height: asset.height,
    perspective: asset.perspective,
    palette: asset.palette.toJSON(),
    layers,
    frames: asset.frames,
    tags: asset.tags,
    frame_index: frameIndex,
    cels,
  };
}

/**
 * Registers the editor app tools on the MCP server.
 *
 * - `open_editor` — loads an asset and returns full state for frame 0
 * - `get_asset_state` — returns cels + metadata for a given frame (UI-only)
 */
export function registerEditorTool(server: McpServer): void {
  // ---- open_editor ----
  registerAppTool(
    server,
    'open_editor',
    {
      title: 'Open Editor',
      description:
        'Opens the inline pixel editor for an asset. Loads the asset if not already loaded and returns full state for frame 0.',
      inputSchema: {
        asset_name: z.string().describe('Logical asset name from the project registry'),
      },
      _meta: {
        ui: { resourceUri: 'ui://pixel-editor/app.html' },
      },
    },
    async ({ asset_name }) => {
      const workspace = getWorkspace();

      if (!workspace.project) {
        return errors.noProjectLoaded();
      }

      // Auto-load if not already in workspace
      if (!workspace.loadedAssets.has(asset_name)) {
        let resolvedPath: string;
        try {
          resolvedPath = workspace.project.resolveAssetPath(asset_name);
        } catch {
          return errors.assetNotInRegistry(asset_name);
        }

        try {
          await workspace.loadAsset(asset_name);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('not found') || msg.includes('ENOENT')) {
            return errors.assetFileNotFound(resolvedPath);
          }
          return errors.domainError(msg);
        }

        server.sendResourceListChanged();
      }

      const asset = workspace.getAsset(asset_name);
      const state = buildAssetStateForFrame(asset, 0);

      const summary = `Opened pixel editor for '${asset_name}' (${String(asset.width)}x${String(asset.height)}, ${asset.perspective}, ${String(asset.layers.length)} layers, ${String(asset.frames.length)} frames).`;

      return {
        content: [{ type: 'text' as const, text: summary }],
        structuredContent: state,
      };
    },
  );

  // ---- get_asset_state ----
  registerAppTool(
    server,
    'get_asset_state',
    {
      title: 'Get Asset State',
      description:
        'Returns cels and metadata for a loaded asset at a given frame. Used by the pixel editor UI.',
      inputSchema: {
        asset_name: z.string().describe('Logical asset name'),
        frame_index: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Frame index to return (default 0)'),
      },
      _meta: {
        ui: { visibility: ['app'] as const },
      },
    },
    ({ asset_name, frame_index }) => {
      const workspace = getWorkspace();
      const asset = workspace.loadedAssets.get(asset_name);

      if (!asset) {
        return errors.assetNotLoaded(asset_name);
      }

      const frameIndex = frame_index ?? 0;
      const frameCount = asset.frames.length;
      if (frameIndex < 0 || frameIndex >= frameCount) {
        return errors.frameOutOfRange(frameIndex, asset_name, frameCount);
      }

      const state = buildAssetStateForFrame(asset, frameIndex);

      const brief = `Asset '${asset_name}' state for frame ${String(frameIndex)}.`;

      return {
        content: [{ type: 'text' as const, text: brief }],
        structuredContent: state,
      };
    },
  );
}
