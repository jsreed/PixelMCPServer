import { z } from 'zod';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';
import { CelWriteCommand } from '../commands/cel-write-command.js';
import { bresenhamLine } from '../algorithms/bresenham.js';
import { midpointCircle, midpointEllipse } from '../algorithms/midpoint.js';
import { floodFill } from '../algorithms/flood-fill.js';

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

const drawOperationSchema = z.discriminatedUnion('action', [
    pixelOp, lineOp, rectOp, circleOp, ellipseOp, fillOp, writePixelsOp,
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
                            case 'fill': {
                                const points = floodFill(op.x, op.y, w, h, (x, y) => {
                                    if (x < 0 || x >= w || y < 0 || y >= h) return null;
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
