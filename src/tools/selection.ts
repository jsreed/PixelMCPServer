import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { requireAsset } from './asset.js';
import { CelWriteCommand } from '../commands/cel-write-command.js';
import * as errors from '../errors.js';
import { type SelectionMask } from '../types/selection.js';

/**
 * Zod schema for selection tool.
 */
const selectionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('rect'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
  }),
  z.object({
    action: z.literal('all'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('clear'),
  }),
  z.object({
    action: z.literal('invert'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('by_color'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
    color: z.number().int().min(0).max(255),
  }),
  z.object({
    action: z.literal('copy'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('cut'),
    asset_name: z.string().optional(),
    layer_id: z.number().int().optional(),
    frame_index: z.number().int().optional(),
  }),
  z.object({
    action: z.literal('paste'),
    target_asset_name: z.string().optional(),
    target_layer_id: z.number().int().optional(),
    target_frame_index: z.number().int().optional(),
    offset_x: z.number().int().optional(),
    offset_y: z.number().int().optional(),
  }),
]);

export function registerSelectionTool(server: McpServer): void {
  server.registerTool(
    'selection',
    {
      title: 'Selection & Clipboard',
      description: 'Edit selection masks and perform clipboard operations.',
      inputSchema: selectionInputSchema,
    },
    async (args) => {
      const workspace = getWorkspace();

      // Clear does not require an asset
      if (args.action === 'clear') {
        workspace.selection = null;
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ message: 'Selection cleared.' }) },
          ],
        };
      }

      // Paste has special targeting
      if (args.action === 'paste') {
        if (!workspace.clipboard) {
          return errors.clipboardEmpty();
        }

        const targetAsset =
          args.target_asset_name ??
          (workspace.loadedAssets.keys().next().value as string | undefined);
        if (!targetAsset) return errors.invalidArgument('No asset loaded to paste into.');

        const assetOrError = requireAsset(workspace, targetAsset);
        if ('isError' in assetOrError) return assetOrError as any;
        const asset = assetOrError;

        const layerId = args.target_layer_id ?? 0;
        const frameIndex = args.target_frame_index ?? 0;

        const ox = args.offset_x ?? 0;
        const oy = args.offset_y ?? 0;

        const clip = workspace.clipboard;
        const pasteX = clip.originalX + ox;
        const pasteY = clip.originalY + oy;

        try {
          const cmd = new CelWriteCommand(asset, layerId, frameIndex, () => {
            let cel = asset.getMutableCel(layerId, frameIndex);
            if (!cel) {
              const data = Array.from({ length: asset.height }, () =>
                new Array(asset.width).fill(0),
              );
              asset.setCel(layerId, frameIndex, { x: 0, y: 0, data });
              cel = asset.getMutableCel(layerId, frameIndex);
            }
            if (!cel || !('data' in cel)) {
              throw new Error('Could not resolve mutable image cel.');
            }

            const data = cel.data;
            const w = asset.width;
            const h = asset.height;

            for (let dy = 0; dy < clip.height; dy++) {
              for (let dx = 0; dx < clip.width; dx++) {
                const px = pasteX + dx;
                const py = pasteY + dy;
                if (px >= 0 && px < w && py >= 0 && py < h) {
                  const color = clip.data[dy][dx];
                  if (color !== 0) {
                    // Assuming 0 is transparent/empty for clipboard drops
                    data[py][px] = color;
                  }
                }
              }
            }
          });

          cmd.execute();
          workspace.pushCommand(cmd);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  message: `Pasted clipboard to layer ${layerId} frame ${frameIndex} at (${pasteX}, ${pasteY}).`,
                }),
              },
            ],
          };
        } catch (e: any) {
          return errors.domainError(e.message);
        }
      }

      // All other actions require a target asset
      const assetName =
        (args as any).asset_name ??
        (workspace.loadedAssets.keys().next().value as string | undefined);
      if (!assetName) return errors.invalidArgument('No asset loaded for selection target.');

      const assetOrError = requireAsset(workspace, assetName);
      if ('isError' in assetOrError) return assetOrError as any;
      const asset = assetOrError;

      const layerId = (args as any).layer_id ?? 0;
      const frameIndex = (args as any).frame_index ?? 0;

      const maskW = asset.width;
      const maskH = asset.height;

      switch (args.action) {
        case 'rect': {
          const { x, y, width, height } = args;
          if (
            width <= 0 ||
            height <= 0 ||
            x >= maskW ||
            y >= maskH ||
            x + width <= 0 ||
            y + height <= 0
          ) {
            workspace.selection = null;
          } else {
            // Clamp bounds
            const cx = Math.max(0, x);
            const cy = Math.max(0, y);
            const cw = Math.min(maskW - cx, Math.min(width, x + width - cx));
            const ch = Math.min(maskH - cy, Math.min(height, y + height - cy));

            if (cw <= 0 || ch <= 0) {
              workspace.selection = null;
            } else {
              const mask = Array.from({ length: ch }, () => new Array(cw).fill(true));
              workspace.selection = {
                asset_name: assetName,
                layer_id: layerId,
                frame_index: frameIndex,
                x: cx,
                y: cy,
                width: cw,
                height: ch,
                mask,
              };
            }
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ message: 'Rectangular selection applied.' }),
              },
            ],
          };
        }
        case 'all': {
          const mask = Array.from({ length: maskH }, () => new Array(maskW).fill(true));
          workspace.selection = {
            asset_name: assetName,
            layer_id: layerId,
            frame_index: frameIndex,
            x: 0,
            y: 0,
            width: maskW,
            height: maskH,
            mask,
          };
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ message: 'Selected all.' }) },
            ],
          };
        }
        case 'invert': {
          let newMask: boolean[][];
          if (
            !workspace.selection ||
            workspace.selection.asset_name !== assetName ||
            workspace.selection.layer_id !== layerId ||
            workspace.selection.frame_index !== frameIndex
          ) {
            // Inverse of nothing is everything
            newMask = Array.from({ length: maskH }, () => new Array(maskW).fill(true));
          } else {
            const s = workspace.selection;
            // Inverse of a masked region implies we now select everything, but "unselect" what was selected.
            // So the new bounds is the whole image.
            newMask = Array.from({ length: maskH }, () => new Array(maskW).fill(true));
            for (let dy = 0; dy < s.height; dy++) {
              for (let dx = 0; dx < s.width; dx++) {
                if (s.mask[dy][dx]) {
                  newMask[s.y + dy][s.x + dx] = false;
                }
              }
            }
          }
          workspace.selection = {
            asset_name: assetName,
            layer_id: layerId,
            frame_index: frameIndex,
            x: 0,
            y: 0,
            width: maskW,
            height: maskH,
            mask: newMask,
          };
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ message: 'Selection inverted.' }) },
            ],
          };
        }
        case 'by_color': {
          const targetColor = args.color;
          const cel = asset.getCel(layerId, frameIndex);

          let newMask: boolean[][] = Array.from({ length: maskH }, () =>
            new Array(maskW).fill(false),
          );
          let found = false;

          if (cel && 'data' in cel) {
            for (let y = 0; y < maskH; y++) {
              for (let x = 0; x < maskW; x++) {
                if (cel.data[y]?.[x] === targetColor) {
                  newMask[y][x] = true;
                  found = true;
                }
              }
            }
          }

          if (found) {
            workspace.selection = {
              asset_name: assetName,
              layer_id: layerId,
              frame_index: frameIndex,
              x: 0,
              y: 0,
              width: maskW,
              height: maskH,
              mask: newMask,
            };
          } else {
            workspace.selection = null;
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ message: `Selection by color ${targetColor} complete.` }),
              },
            ],
          };
        }
        case 'copy': {
          const s = workspace.selection;
          if (
            !s ||
            s.asset_name !== assetName ||
            s.layer_id !== layerId ||
            s.frame_index !== frameIndex
          ) {
            return errors.domainError('No active selection to copy from this layer/frame.');
          }

          const cel = asset.getCel(layerId, frameIndex);
          const clipData: number[][] = Array.from({ length: s.height }, () =>
            new Array(s.width).fill(0),
          );

          if (cel && 'data' in cel) {
            for (let dy = 0; dy < s.height; dy++) {
              for (let dx = 0; dx < s.width; dx++) {
                if (s.mask[dy][dx]) {
                  clipData[dy][dx] = cel.data[s.y + dy]?.[s.x + dx] ?? 0;
                }
              }
            }
          }

          workspace.clipboard = {
            data: clipData,
            width: s.width,
            height: s.height,
            originalX: s.x,
            originalY: s.y,
          };

          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ message: 'Copied to clipboard.' }) },
            ],
          };
        }
        case 'cut': {
          const s = workspace.selection;
          if (
            !s ||
            s.asset_name !== assetName ||
            s.layer_id !== layerId ||
            s.frame_index !== frameIndex
          ) {
            return errors.domainError('No active selection to cut from this layer/frame.');
          }

          const cel = asset.getCel(layerId, frameIndex);
          const clipData: number[][] = Array.from({ length: s.height }, () =>
            new Array(s.width).fill(0),
          );

          if (cel && 'data' in cel) {
            for (let dy = 0; dy < s.height; dy++) {
              for (let dx = 0; dx < s.width; dx++) {
                if (s.mask[dy][dx]) {
                  clipData[dy][dx] = cel.data[s.y + dy]?.[s.x + dx] ?? 0;
                }
              }
            }
          }

          workspace.clipboard = {
            data: clipData,
            width: s.width,
            height: s.height,
            originalX: s.x,
            originalY: s.y,
          };

          try {
            const cmd = new CelWriteCommand(asset, layerId, frameIndex, () => {
              let mutCel = asset.getMutableCel(layerId, frameIndex);
              if (!mutCel) {
                const data = Array.from({ length: asset.height }, () =>
                  new Array(asset.width).fill(0),
                );
                asset.setCel(layerId, frameIndex, { x: 0, y: 0, data });
                mutCel = asset.getMutableCel(layerId, frameIndex);
              }
              if (!mutCel || !('data' in mutCel)) {
                throw new Error('Could not resolve mutable image cel.');
              }

              for (let dy = 0; dy < s.height; dy++) {
                for (let dx = 0; dx < s.width; dx++) {
                  if (s.mask[dy][dx]) {
                    mutCel.data[s.y + dy][s.x + dx] = 0; // Clear the cut pixels
                  }
                }
              }
            });
            cmd.execute();
            workspace.pushCommand(cmd);

            // Cutting also clears the selection mask? The design says: "copies and then clears the selected region."
            // meaning clears the PIXELS, does it clear the selection mask? Assume it keeps the selection active unless specified otherwise.
          } catch (e: any) {
            return errors.domainError(e.message);
          }

          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ message: 'Cut to clipboard.' }) },
            ],
          };
        }
      }

      return errors.invalidArgument(`Unhandled selection action`);
    },
  );
}
