import { z } from 'zod';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';
import { CelWriteCommand } from '../commands/cel-write-command.js';
import { bresenhamLine } from '../algorithms/bresenham.js';
import { midpointCircle, midpointEllipse } from '../algorithms/midpoint.js';
import { floodFill } from '../algorithms/flood-fill.js';
import { isoToPixel, isoFillRhombus } from '../algorithms/isometric.js';

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

const baseOp = {
    color: z.number().int().min(0).max(255).describe('Palette index (0-255)'),
};

const pixelOp = z.object({
    action: z.literal('pixel'),
    x: z.number().int(),
    y: z.number().int(),
    ...baseOp,
});

const lineOp = z.object({
    action: z.literal('line'),
    x: z.number().int(),
    y: z.number().int(),
    x2: z.number().int(),
    y2: z.number().int(),
    ...baseOp,
});

const rectOp = z.object({
    action: z.literal('rect'),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    filled: z.boolean().optional(),
    ...baseOp,
});

const circleOp = z.object({
    action: z.literal('circle'),
    x: z.number().int(),
    y: z.number().int(),
    radius: z.number().int().min(0),
    filled: z.boolean().optional(),
    ...baseOp,
});

const ellipseOp = z.object({
    action: z.literal('ellipse'),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().min(0),     // radius x
    height: z.number().int().min(0),    // radius y
    filled: z.boolean().optional(),
    ...baseOp,
});

const fillOp = z.object({
    action: z.literal('fill'),
    x: z.number().int(),
    y: z.number().int(),
    ...baseOp,
});

const writePixelsOp = z.object({
    action: z.literal('write_pixels'),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    data: z.array(z.array(z.number().int().min(0).max(255))),
});

const isoTileOp = z.object({
    action: z.literal('iso_tile'),
    col: z.number().int(),
    row: z.number().int(),
    elevation: z.number().int().optional().default(0),
    ...baseOp,
});

const isoCubeOp = z.object({
    action: z.literal('iso_cube'),
    col: z.number().int(),
    row: z.number().int(),
    elevation: z.number().int().optional().default(0),
    top_color: z.number().int().min(0).max(255),
    left_color: z.number().int().min(0).max(255),
    right_color: z.number().int().min(0).max(255),
});

const isoWallOp = z.object({
    action: z.literal('iso_wall'),
    col: z.number().int(),
    row: z.number().int(),
    length: z.number().int().min(1),
    axis: z.enum(['x', 'y']),
    height: z.number().int().min(1).optional().default(1),
    ...baseOp,
});

const drawOperationSchema = z.discriminatedUnion('action', [
    pixelOp, lineOp, rectOp, circleOp, ellipseOp, fillOp, writePixelsOp,
    isoTileOp, isoCubeOp, isoWallOp,
]);

const drawInputSchema = {
    asset_name: z.string().optional().describe('Target asset name. Defaults to first loaded asset.'),
    layer_id: z.number().int().optional().describe('Target layer ID. Defaults to 0.'),
    frame_index: z.number().int().optional().describe('Target frame index. Defaults to 0.'),
    operations: z.array(drawOperationSchema).min(1).describe('Ordered list of drawing operations.'),
};

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

const drawInputZodSchema = z.object(drawInputSchema);

export function registerDrawTool(server: any) {
    server.registerTool(
        'draw',
        'Batched pixel manipulation operations (pixel, line, rect, circle, ellipse, fill, write_pixels)',
        { inputSchema: drawInputZodSchema },
        async (args: Record<string, any>) => {
            const workspace = getWorkspace();

            // Default target resolution
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

            const layer = asset.layers.find(l => l.id === layerId);
            if (!layer) return errors.layerNotFound(layerId, assetName);
            if (layer.type !== 'image') {
                return errors.domainError(`Layer ${layerId} is not an image layer. Draw operations require an image layer.`);
            }

            if (frameIndex < 0 || frameIndex >= asset.frames.length) {
                return errors.frameOutOfRange(frameIndex, assetName, asset.frames.length);
            }

            if (!Array.isArray(args.operations) || args.operations.length === 0) {
                return errors.invalidArgument('operations array is required and must not be empty.');
            }

            // Pre-validate all operations before beginning mutation bundle
            for (const op of args.operations) {
                if (op.action === 'write_pixels') {
                    const dh = op.data.length;
                    const dw = dh > 0 ? op.data[0].length : 0;
                    if (op.height !== dh || op.width !== dw) {
                        return errors.writePixelsDimensionMismatch(dw, dh, op.width, op.height);
                    }
                }
            }

            // Command wrapping - cel modifications are batched
            try {
                const cmd = new CelWriteCommand(asset, layerId, frameIndex, () => {
                    let cel = asset.getMutableCel(layerId, frameIndex);
                    if (!cel) {
                        const data = Array.from({ length: asset.height }, () => new Array(asset.width).fill(0));
                        asset.setCel(layerId, frameIndex, { x: 0, y: 0, data });
                        cel = asset.getMutableCel(layerId, frameIndex);
                    }
                    if (!cel || !('data' in cel)) {
                        throw new Error('Could not resolve mutable image cel.');
                    }

                    const data = cel.data;
                    const w = asset.width;  // Use asset dimensions to constrain drawing
                    const h = asset.height;

                    const activeSelection = workspace.selection &&
                        workspace.selection.asset_name === assetName &&
                        workspace.selection.layer_id === layerId &&
                        workspace.selection.frame_index === frameIndex
                        ? workspace.selection : null;

                    // Ensure cel data is initialized to full size
                    // (getMutableCel should handle this generally, but ensure safety)
                    while (data.length < h) data.push(new Array(w).fill(0));
                    for (let row = 0; row < h; row++) {
                        while (data[row].length < w) data[row].push(0);
                    }

                    // Helper to softly write a pixel if within bounds
                    const putPixel = (px: number, py: number, color: number) => {
                        px = Math.round(px);
                        py = Math.round(py);

                        if (activeSelection) {
                            const sx = px - activeSelection.x;
                            const sy = py - activeSelection.y;
                            if (sx < 0 || sx >= activeSelection.width || sy < 0 || sy >= activeSelection.height) {
                                return; // Outside selection bounds
                            }
                            if (!activeSelection.mask[sy][sx]) {
                                return; // Not selected
                            }
                        }

                        if (px >= 0 && px < w && py >= 0 && py < h) {
                            data[py][px] = color;
                        }
                    };

                    for (const op of args.operations) {
                        switch (op.action) {
                            case 'pixel': {
                                putPixel(op.x, op.y, op.color);
                                break;
                            }
                            case 'line': {
                                const points = bresenhamLine(op.x, op.y, op.x2, op.y2);
                                for (const p of points) putPixel(p.x, p.y, op.color);
                                break;
                            }
                            case 'rect': {
                                if (op.filled) {
                                    for (let y = op.y; y < op.y + op.height; y++) {
                                        for (let x = op.x; x < op.x + op.width; x++) {
                                            putPixel(x, y, op.color);
                                        }
                                    }
                                } else {
                                    const rw = op.width;
                                    const rh = op.height;
                                    for (let x = 0; x < rw; x++) {
                                        putPixel(op.x + x, op.y, op.color);
                                        putPixel(op.x + x, op.y + rh - 1, op.color);
                                    }
                                    for (let y = 0; y < rh; y++) {
                                        putPixel(op.x, op.y + y, op.color);
                                        putPixel(op.x + rw - 1, op.y + y, op.color);
                                    }
                                }
                                break;
                            }
                            case 'circle': {
                                const points = midpointCircle(op.x, op.y, op.radius);
                                if (op.filled) {
                                    // Group by Y to draw horizontal scanlines
                                    const yMap = new Map<number, { minX: number, maxX: number }>();
                                    for (const p of points) {
                                        if (!yMap.has(p.y)) {
                                            yMap.set(p.y, { minX: p.x, maxX: p.x });
                                        } else {
                                            const entry = yMap.get(p.y)!;
                                            entry.minX = Math.min(entry.minX, p.x);
                                            entry.maxX = Math.max(entry.maxX, p.x);
                                        }
                                    }
                                    for (const [y, range] of yMap) {
                                        for (let x = range.minX; x <= range.maxX; x++) {
                                            putPixel(x, y, op.color);
                                        }
                                    }
                                } else {
                                    for (const p of points) putPixel(p.x, p.y, op.color);
                                }
                                break;
                            }
                            case 'ellipse': {
                                const points = midpointEllipse(op.x, op.y, op.width, op.height);
                                if (op.filled) {
                                    const yMap = new Map<number, { minX: number, maxX: number }>();
                                    for (const p of points) {
                                        if (!yMap.has(p.y)) {
                                            yMap.set(p.y, { minX: p.x, maxX: p.x });
                                        } else {
                                            const entry = yMap.get(p.y)!;
                                            entry.minX = Math.min(entry.minX, p.x);
                                            entry.maxX = Math.max(entry.maxX, p.x);
                                        }
                                    }
                                    for (const [y, range] of yMap) {
                                        for (let x = range.minX; x <= range.maxX; x++) {
                                            putPixel(x, y, op.color);
                                        }
                                    }
                                } else {
                                    for (const p of points) putPixel(p.x, p.y, op.color);
                                }
                                break;
                            }
                            case 'iso_tile': {
                                if (asset.perspective !== 'isometric') {
                                    throw new Error('iso_tile requires asset perspective = "isometric".');
                                }
                                const tw = asset.tile_width;
                                const th = asset.tile_height;
                                if (!tw || !th) throw new Error('iso_tile requires asset tile_width and tile_height.');
                                const origin = isoToPixel(op.col, op.row, op.elevation ?? 0, tw, th);
                                for (const px of isoFillRhombus(origin, tw, th)) {
                                    putPixel(px.x, px.y, op.color);
                                }
                                break;
                            }
                            case 'iso_cube': {
                                if (asset.perspective !== 'isometric') {
                                    throw new Error('iso_cube requires asset perspective = "isometric".');
                                }
                                const tw = asset.tile_width;
                                const th = asset.tile_height;
                                if (!tw || !th) throw new Error('iso_cube requires asset tile_width and tile_height.');
                                const elev = op.elevation ?? 0;
                                const hw = Math.floor(tw / 2);
                                const hh = Math.floor(th / 2);

                                // Top face — flat rhombus lifted by one tile height
                                const topOrigin = isoToPixel(op.col, op.row, elev + 1, tw, th);
                                for (const px of isoFillRhombus(topOrigin, tw, th)) {
                                    putPixel(px.x, px.y, op.top_color);
                                }

                                // Left face — parallelogram on the SW side of the cube
                                // Top edge = bottom edge of the top-face
                                const leftTopLeft = { x: topOrigin.x + hw, y: topOrigin.y + th - 1 };
                                const leftTopRight = { x: topOrigin.x + tw - 1, y: topOrigin.y + hh };
                                for (let vy = 0; vy < th; vy++) {
                                    const x1 = leftTopLeft.x - Math.round(vy * (hw / th));
                                    const x2 = leftTopRight.x - Math.round(vy * (hw / th));
                                    for (let px = Math.min(x1, x2); px <= Math.max(x1, x2); px++) {
                                        putPixel(px, leftTopLeft.y + vy, op.left_color);
                                    }
                                }

                                // Right face — parallelogram on the SE side of the cube
                                for (let vy = 0; vy < th; vy++) {
                                    const x1 = leftTopLeft.x + Math.round(vy * (hw / th));
                                    const x2 = (topOrigin.x) + Math.round(vy * (hw / th));
                                    for (let px = Math.min(x1, x2); px <= Math.max(x1, x2); px++) {
                                        putPixel(px, leftTopLeft.y + vy, op.right_color);
                                    }
                                }
                                break;
                            }
                            case 'iso_wall': {
                                if (asset.perspective !== 'isometric') {
                                    throw new Error('iso_wall requires asset perspective = "isometric".');
                                }
                                const tw = asset.tile_width;
                                const th = asset.tile_height;
                                if (!tw || !th) throw new Error('iso_wall requires asset tile_width and tile_height.');
                                const elev = 0;
                                const wallH = op.height ?? 1;

                                // Draw one tile-wide segment at each grid position along the axis
                                for (let i = 0; i < op.length; i++) {
                                    const c = op.axis === 'x' ? op.col + i : op.col;
                                    const r = op.axis === 'y' ? op.row + i : op.row;

                                    // Stack wall face panels vertically for each elevation step
                                    for (let e = elev; e < elev + wallH; e++) {
                                        // Origin of this wall segment = top face at this elevation
                                        const origin = isoToPixel(c, r, e + 1, tw, th);
                                        const hw = Math.floor(tw / 2);
                                        const hh = Math.floor(th / 2);

                                        if (op.axis === 'x') {
                                            // x-axis wall: left face of the tile (SW slope)
                                            for (let vy = 0; vy < th; vy++) {
                                                const x1 = origin.x + hw - Math.round(vy * (hw / th));
                                                const x2 = origin.x + tw - Math.round(vy * (hw / th));
                                                for (let px = x1; px < x2; px++) {
                                                    putPixel(px, origin.y + hh + vy, op.color);
                                                }
                                            }
                                        } else {
                                            // y-axis wall: right face of the tile (SE slope)
                                            for (let vy = 0; vy < th; vy++) {
                                                const x1 = origin.x + Math.round(vy * (hw / th));
                                                const x2 = origin.x + hw + Math.round(vy * (hw / th));
                                                for (let px = x1; px < x2; px++) {
                                                    putPixel(px, origin.y + hh + vy, op.color);
                                                }
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                            case 'fill': {
                                if (activeSelection) {
                                    // Bail early if seed is outside the selection
                                    const seedSx = op.x - activeSelection.x;
                                    const seedSy = op.y - activeSelection.y;
                                    if (
                                        seedSx < 0 || seedSx >= activeSelection.width ||
                                        seedSy < 0 || seedSy >= activeSelection.height ||
                                        !activeSelection.mask[seedSy][seedSx]
                                    ) {
                                        break;
                                    }
                                }

                                const points = floodFill(op.x, op.y, w, h, (x, y) => {
                                    if (x < 0 || x >= w || y < 0 || y >= h) return null;

                                    // Treat pixels outside the selection as a hard boundary
                                    if (activeSelection) {
                                        const sx = x - activeSelection.x;
                                        const sy = y - activeSelection.y;
                                        if (
                                            sx < 0 || sx >= activeSelection.width ||
                                            sy < 0 || sy >= activeSelection.height ||
                                            !activeSelection.mask[sy][sx]
                                        ) {
                                            return null;
                                        }
                                    }

                                    return data[y][x];
                                });
                                for (const p of points) putPixel(p.x, p.y, op.color);
                                break;
                            }
                            case 'write_pixels': {
                                // Pre-validated above, safe to write
                                const ox = op.x ?? 0;
                                const oy = op.y ?? 0;
                                for (let dy = 0; dy < op.height; dy++) {
                                    for (let dx = 0; dx < op.width; dx++) {
                                        putPixel(ox + dx, oy + dy, op.data[dy][dx]);
                                    }
                                }
                                break;
                            }
                        }
                    }
                });

                workspace.pushCommand(cmd);

            } catch (e: unknown) {
                return errors.domainError(e instanceof Error ? e.message : String(e));
            }

            return {
                content: [{ type: 'text', text: JSON.stringify({ message: `Applied ${args.operations.length} drawing operations.` }) }]
            };
        }
    );
}
