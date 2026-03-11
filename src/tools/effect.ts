import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';
import { CelWriteCommand } from '../commands/cel-write-command.js';
import { linearGradient } from '../algorithms/gradient.js';
import { checkerboard, noise, orderedDither, errorDiffusion } from '../algorithms/dither.js';
import { generateOutline, cleanupOrphans } from '../algorithms/outline.js';
import { autoAntiAlias } from '../algorithms/auto-aa.js';
import { subpixelShift, smearFrame } from '../algorithms/motion.js';
import { createResourceLink } from '../utils/resource-link.js';

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/** Region parameters shared by gradient/dither effects. */
const regionParams = {
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
};

const gradientOp = z.object({
  action: z.literal('gradient'),
  ...regionParams,
  color1: z.number().int().min(0).max(255),
  color2: z.number().int().min(0).max(255),
  direction: z.enum(['vertical', 'horizontal', 'diagonal_down', 'diagonal_up']).optional(),
});

const checkerboardOp = z.object({
  action: z.literal('checkerboard'),
  ...regionParams,
  color1: z.number().int().min(0).max(255),
  color2: z.number().int().min(0).max(255),
});

const noiseOp = z.object({
  action: z.literal('noise'),
  ...regionParams,
  color1: z.number().int().min(0).max(255),
  color2: z.number().int().min(0).max(255),
});

const orderedDitherOp = z.object({
  action: z.literal('ordered_dither'),
  ...regionParams,
  color1: z.number().int().min(0).max(255),
  color2: z.number().int().min(0).max(255),
});

const errorDiffusionOp = z.object({
  action: z.literal('error_diffusion'),
  ...regionParams,
  color1: z.number().int().min(0).max(255),
  color2: z.number().int().min(0).max(255),
});

const autoAaOp = z.object({
  action: z.literal('auto_aa'),
});

const outlineOp = z.object({
  action: z.literal('outline'),
  color: z.number().int().min(0).max(255),
});

const cleanupOrphansOp = z.object({
  action: z.literal('cleanup_orphans'),
});

const subpixelShiftOp = z.object({
  action: z.literal('subpixel_shift'),
  intensity: z.number().min(0).max(1),
  direction_x: z.number().optional(),
  direction_y: z.number().optional(),
});

const smearFrameOp = z.object({
  action: z.literal('smear_frame'),
  intensity: z.number().min(0).max(1),
  direction_x: z.number().optional(),
  direction_y: z.number().optional(),
});

const effectOperationSchema = z.discriminatedUnion('action', [
  gradientOp,
  checkerboardOp,
  noiseOp,
  orderedDitherOp,
  errorDiffusionOp,
  autoAaOp,
  outlineOp,
  cleanupOrphansOp,
  subpixelShiftOp,
  smearFrameOp,
]);

const effectInputSchema = {
  asset_name: z.string().optional().describe('Target asset name. Defaults to first loaded asset.'),
  layer_id: z.number().int().optional().describe('Target layer ID. Defaults to 0.'),
  frame_index: z.number().int().optional().describe('Target frame index. Defaults to 0.'),
  operations: z.array(effectOperationSchema).min(1).describe('Ordered list of effect operations.'),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Grid = number[][];

/**
 * Resolves region parameters against the cel/canvas dimensions.
 * Returns { rx, ry, rw, rh } clamped to the canvas.
 */
function resolveRegion(
  op: { x?: number; y?: number; width?: number; height?: number },
  canvasW: number,
  canvasH: number,
): { rx: number; ry: number; rw: number; rh: number } {
  const rx = op.x ?? 0;
  const ry = op.y ?? 0;
  const rw = op.width ?? canvasW;
  const rh = op.height ?? canvasH;
  return { rx, ry, rw, rh };
}

/**
 * Extracts a sub-region from a grid.
 */
function extractRegion(grid: Grid, rx: number, ry: number, rw: number, rh: number): Grid {
  const h = grid.length;
  const w = h > 0 ? grid[0].length : 0;
  return Array.from({ length: rh }, (_, r) => {
    const row = new Array<number>(rw).fill(0);
    const srcY = ry + r;
    if (srcY >= 0 && srcY < h) {
      for (let c = 0; c < rw; c++) {
        const srcX = rx + c;
        if (srcX >= 0 && srcX < w) {
          row[c] = grid[srcY][srcX];
        }
      }
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

const effectInputZodSchema = z.object(effectInputSchema);

type EffectInput = z.infer<typeof effectInputZodSchema>;
type EffectOp = z.infer<typeof effectOperationSchema>;

export function registerEffectTool(server: McpServer): void {
  server.registerTool(
    'effect',
    {
      title: 'Effect',
      description:
        'Procedural texturing, dithering, and pixel-art-specific refinement algorithms applied to a cel or selection.',
      inputSchema: effectInputZodSchema,
    },
    (args: EffectInput) => {
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
          `Layer ${String(layerId)} is not an image layer. Effect operations require an image layer.`,
        );
      }

      if (frameIndex < 0 || frameIndex >= asset.frames.length) {
        return errors.frameOutOfRange(frameIndex, assetName, asset.frames.length);
      }

      if (!Array.isArray(args.operations) || args.operations.length === 0) {
        return errors.invalidArgument('operations array is required and must not be empty.');
      }

      try {
        const cmd = new CelWriteCommand(asset, layerId, frameIndex, () => {
          let cel = asset.getMutableCel(layerId, frameIndex);
          if (!cel) {
            const data = Array.from({ length: asset.height }, () =>
              new Array<number>(asset.width).fill(0),
            );
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

          // Convert PaletteClass to raw array for algorithms that need it
          const paletteArray = asset.palette.toJSON();

          for (const op of args.operations) {
            applyEffectOp(op, cel.data, w, h, activeSelection, paletteArray);
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
              message: `Applied ${String(args.operations.length)} effect operations.`,
            }),
          },
          createResourceLink(
            assetName,
            `pixel://view/asset/${assetName}/layer/${String(layerId)}/${String(frameIndex)}`,
          ),
        ],
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Apply a single effect operation
// ---------------------------------------------------------------------------

interface SelectionMask {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: boolean[][];
}

function applyEffectOp(
  op: EffectOp,
  celData: Grid,
  canvasW: number,
  canvasH: number,
  selection: SelectionMask | null,
  palette: unknown[],
): void {
  switch (op.action) {
    case 'gradient':
    case 'checkerboard':
    case 'noise':
    case 'ordered_dither':
    case 'error_diffusion':
      applyRegionEffect(op, celData, canvasW, canvasH, selection);
      break;
    case 'auto_aa':
      applyFullGridEffect(op, celData, canvasW, canvasH, selection, palette);
      break;
    case 'outline':
    case 'cleanup_orphans':
      applyFullGridEffect(op, celData, canvasW, canvasH, selection);
      break;
    case 'subpixel_shift':
    case 'smear_frame':
      applyFullGridEffect(op, celData, canvasW, canvasH, selection);
      break;
  }
}

/**
 * Applies a region-aware effect (gradient/dither). If a selection is active,
 * the effect is further constrained to the intersection of the region and the
 * selection mask.
 */
function applyRegionEffect(
  op: EffectOp & {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color1: number;
    color2: number;
  },
  celData: Grid,
  canvasW: number,
  canvasH: number,
  selection: SelectionMask | null,
): void {
  const { rx, ry, rw, rh } = resolveRegion(op, canvasW, canvasH);

  // Generate the effect pattern at the region size
  let pattern: Grid;
  switch (op.action) {
    case 'gradient':
      pattern = linearGradient(rw, rh, op.color1, op.color2, op.direction);
      break;
    case 'checkerboard':
      pattern = checkerboard(rw, rh, op.color1, op.color2);
      break;
    case 'noise':
      pattern = noise(rw, rh, op.color1, op.color2);
      break;
    case 'ordered_dither':
      pattern = orderedDither(rw, rh, op.color1, op.color2);
      break;
    case 'error_diffusion':
      pattern = errorDiffusion(rw, rh, op.color1, op.color2);
      break;
    default:
      return;
  }

  // Write the pattern into the cel data, respecting selection mask
  for (let r = 0; r < rh; r++) {
    const dstY = ry + r;
    if (dstY < 0 || dstY >= canvasH) continue;
    for (let c = 0; c < rw; c++) {
      const dstX = rx + c;
      if (dstX < 0 || dstX >= canvasW) continue;

      if (selection) {
        // Check if this pixel is within the selection mask
        const selRow = dstY - selection.y;
        const selCol = dstX - selection.x;
        if (
          selRow < 0 ||
          selRow >= selection.height ||
          selCol < 0 ||
          selCol >= selection.width ||
          !selection.mask[selRow][selCol]
        ) {
          continue; // Skip unselected pixels
        }
      }

      celData[dstY][dstX] = pattern[r][c];
    }
  }
}

/**
 * Applies a full-grid effect (outline, auto_aa, cleanup_orphans, motion).
 * If a selection is active, only the selected region is affected.
 */
function applyFullGridEffect(
  op: EffectOp,
  celData: Grid,
  canvasW: number,
  canvasH: number,
  selection: SelectionMask | null,
  palette?: unknown[],
): void {
  if (selection) {
    // Extract the selected sub-region
    const sx = selection.x;
    const sy = selection.y;
    const sw = selection.width;
    const sh = selection.height;

    let subGrid = extractRegion(celData, sx, sy, sw, sh);

    // Apply the effect to the sub-region
    subGrid = applyFullGridAlgorithm(op, subGrid, palette);

    // Write back only at selected pixels
    for (let r = 0; r < sh; r++) {
      const dstY = sy + r;
      if (dstY < 0 || dstY >= canvasH) continue;
      for (let c = 0; c < sw; c++) {
        const dstX = sx + c;
        if (dstX < 0 || dstX >= canvasW) continue;
        if (!selection.mask[r][c]) continue;
        celData[dstY][dstX] = subGrid[r][c];
      }
    }
  } else {
    // Apply to the full canvas
    const result = applyFullGridAlgorithm(op, celData, palette);
    // Copy result back
    for (let r = 0; r < Math.min(canvasH, result.length); r++) {
      for (let c = 0; c < Math.min(canvasW, result[r].length); c++) {
        celData[r][c] = result[r][c];
      }
    }
  }
}

/**
 * Dispatches a full-grid algorithm and returns the resulting grid.
 */
function applyFullGridAlgorithm(op: EffectOp, grid: Grid, palette?: unknown[]): Grid {
  switch (op.action) {
    case 'outline':
      return generateOutline(grid, op.color);
    case 'cleanup_orphans':
      return cleanupOrphans(grid);
    case 'auto_aa':
      return autoAntiAlias(
        grid,
        (palette ?? []) as (import('../algorithms/auto-aa.js').RGBA | null)[],
      );
    case 'subpixel_shift':
      return subpixelShift(grid, op.intensity, op.direction_x, op.direction_y);
    case 'smear_frame':
      return smearFrame(grid, op.intensity, op.direction_x, op.direction_y);
    default:
      return grid;
  }
}
