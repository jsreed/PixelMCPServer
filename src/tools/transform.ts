import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';
import { CelWriteCommand } from '../commands/cel-write-command.js';
import { rotate90, rotate180, rotate270, flipHorizontal, flipVertical, shear, shift, type Grid } from '../algorithms/transform.js';

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const rotateOp = z.object({
  action: z.literal('rotate'),
  angle: z.union([z.literal(90), z.literal(180), z.literal(270)]),
});

const flipHOp = z.object({
  action: z.literal('flip_h'),
});

const flipVOp = z.object({
  action: z.literal('flip_v'),
});

const shearOp = z.object({
  action: z.literal('shear'),
  amount_x: z.number().int().optional(),
  amount_y: z.number().int().optional(),
});

const shiftOp = z.object({
  action: z.literal('shift'),
  amount_x: z.number().int().optional(),
  amount_y: z.number().int().optional(),
});

const transformOperationSchema = z.discriminatedUnion('action', [
  rotateOp,
  flipHOp,
  flipVOp,
  shearOp,
  shiftOp,
]);

const transformInputSchema = {
  asset_name: z.string().optional().describe('Target asset name. Defaults to first loaded asset.'),
  layer_id: z.number().int().optional().describe('Target layer ID. Defaults to 0.'),
  frame_index: z.number().int().optional().describe('Target frame index. Defaults to 0.'),
  operations: z.array(transformOperationSchema).min(1).describe('Ordered list of transform operations.'),
};

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

const transformInputZodSchema = z.object(transformInputSchema);

type TransformInput = z.infer<typeof transformInputZodSchema>;

export function registerTransformTool(server: McpServer): void {
  server.registerTool(
    'transform',
    {
      title: 'Transform',
      description: 'Geometric transformations (rotate, flip, shear, shift) applied to a cel or selection.',
      inputSchema: transformInputZodSchema,
    },
    (args: TransformInput) => {
      const workspace = getWorkspace();

      let assetName = args.asset_name;
      if (!assetName) {
        if (workspace.loadedAssets.size === 0) {
          return errors.domainError('No assets loaded in workspace.');
        }
        assetName = workspace.loadedAssets.keys().next().value as string;
      }

      const asset = workspace.loadedAssets.get(assetName);
      if (!asset) return errors.assetNotLoaded(assetName);

      const layerId = args.layer_id ?? 0;
      const frameIndex = args.frame_index ?? 0;

      const layer = asset.layers.find((l) => l.id === layerId);
      if (!layer) return errors.layerNotFound(layerId, assetName);
      if (layer.type !== 'image') {
        return errors.domainError(
          `Layer ${String(layerId)} is not an image layer. Transform operations require an image layer.`,
        );
      }

      if (frameIndex < 0 || frameIndex >= asset.frames.length) {
        return errors.frameOutOfRange(frameIndex, assetName, asset.frames.length);
      }

      if (!Array.isArray(args.operations) || args.operations.length === 0) {
        return errors.invalidArgument('operations array is required and must not be empty.');
      }

      // Pre-validate combinations
      for (const op of args.operations) {
        if (op.action === 'shear' || op.action === 'shift') {
          if ((op.amount_x ?? 0) === 0 && (op.amount_y ?? 0) === 0) {
            return errors.invalidArgument(`${op.action} requires at least one of amount_x or amount_y to be non-zero.`);
          }
        }
      }

      try {
        const cmd = new CelWriteCommand(asset, layerId, frameIndex, () => {
          let cel = asset.getMutableCel(layerId, frameIndex);
          if (!cel) {
            const data = Array.from({ length: asset.height }, () => new Array<number>(asset.width).fill(0));
            asset.setCel(layerId, frameIndex, { x: 0, y: 0, data });
            cel = asset.getMutableCel(layerId, frameIndex);
          }
          if (!cel || !('data' in cel)) {
            throw new Error('Could not resolve mutable image cel.');
          }

          const h = asset.height;
          const w = asset.width;

          // Expand cel data to full asset size
          while (cel.data.length < h) cel.data.push(new Array<number>(w).fill(0));
          for (let row = 0; row < h; row++) {
            while (cel.data[row].length < w) cel.data[row].push(0);
          }

          const activeSelection =
            workspace.selection &&
            workspace.selection.asset_name === assetName &&
            workspace.selection.layer_id === layerId &&
            workspace.selection.frame_index === frameIndex
              ? workspace.selection
              : null;

          // Start with the full grid
          let currentGrid: Grid = cel.data;

          if (activeSelection) {
            // Extract only the selected sub-region
            const subW = activeSelection.width;
            const subH = activeSelection.height;
            const sx = activeSelection.x;
            const sy = activeSelection.y;
            currentGrid = Array.from({ length: subH }, (_, r) => {
              const row = new Array<number>(subW).fill(0);
              const cy = sy + r;
              if (cy >= 0 && cy < h) {
                for (let c = 0; c < subW; c++) {
                  const cx = sx + c;
                  if (cx >= 0 && cx < w && activeSelection.mask[r][c]) {
                    row[c] = cel.data[cy][cx];
                  }
                }
              }
              return row;
            });
          }

          for (const op of args.operations) {
            switch (op.action) {
              case 'rotate':
                if (op.angle === 90) currentGrid = rotate90(currentGrid);
                else if (op.angle === 180) currentGrid = rotate180(currentGrid);
                else if (op.angle === 270) currentGrid = rotate270(currentGrid);
                break;
              case 'flip_h':
                currentGrid = flipHorizontal(currentGrid);
                break;
              case 'flip_v':
                currentGrid = flipVertical(currentGrid);
                break;
              case 'shear':
                currentGrid = shear(currentGrid, op.amount_x ?? 0, op.amount_y ?? 0);
                break;
              case 'shift':
                currentGrid = shift(currentGrid, op.amount_x ?? 0, op.amount_y ?? 0);
                break;
            }
          }

          if (activeSelection) {
            // Write the transformed sub-region back onto the canvas, respecting the mask.
            // Note: If rotation changes dimensions of a non-square selection, the user
            // will get clipping against the original bounding box. This is standard behavior
            // for masked transforms in grid-aligned pixel space.
            const subW = activeSelection.width;
            const subH = activeSelection.height;
            const sx = activeSelection.x;
            const sy = activeSelection.y;
            
            const outH = currentGrid.length;
            const outW = outH > 0 ? currentGrid[0].length : 0;

            // FIRST: clear the original selected pixels to prevent ghosting
            for (let r = 0; r < subH; r++) {
              const cy = sy + r;
              if (cy >= 0 && cy < h) {
                for (let c = 0; c < subW; c++) {
                  const cx = sx + c;
                  if (cx >= 0 && cx < w && activeSelection.mask[r][c]) {
                    cel.data[cy][cx] = 0;
                  }
                }
              }
            }

            // THEN: write the new transformed pixels (clipped to the selection mask)
            for (let r = 0; r < Math.min(subH, outH); r++) {
              const cy = sy + r;
              if (cy >= 0 && cy < h) {
                for (let c = 0; c < Math.min(subW, outW); c++) {
                  const cx = sx + c;
                  if (cx >= 0 && cx < w && activeSelection.mask[r][c]) {
                     cel.data[cy][cx] = currentGrid[r][c];
                  }
                }
              }
            }
          } else {
            // Write full grid back. Clear entire canvas first to prevent ghost pixels
            // when rotating a non-square grid.
            for (let r = 0; r < h; r++) {
              for (let c = 0; c < w; c++) {
                cel.data[r][c] = 0;
              }
            }
            
            const outH = currentGrid.length;
            const outW = outH > 0 ? currentGrid[0].length : 0;
            for (let r = 0; r < Math.min(h, outH); r++) {
              for (let c = 0; c < Math.min(w, outW); c++) {
                cel.data[r][c] = currentGrid[r][c];
              }
            }
          }
        });

        workspace.pushCommand(cmd);
      } catch (e: unknown) {
        return errors.domainError(e instanceof Error ? e.message : String(e));
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              message: `Applied ${String(args.operations.length)} transform operations.`,
            }),
          },
        ],
      };
    },
  );
}
