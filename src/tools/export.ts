import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { requireAsset, isError } from './asset.js';
import * as errors from '../errors.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { PNG } from 'pngjs';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

import { compositeFrame, type CompositeLayer } from '../algorithms/composite.js';
import { buildCompositeLayers, buildPaletteMap } from '../utils/render.js';
import { upscale } from '../algorithms/upscale.js';
import { packRectangles, type PackInput } from '../algorithms/bin-pack.js';
import { resolveExportPattern } from '../algorithms/export-pattern.js';
import { generateGodotImportSidecar } from '../io/godot-import.js';
import * as godotResources from '../io/godot-resources.js';

// ---------------------------------------------------------------------------
// Zod input schema
// ---------------------------------------------------------------------------

const exportInputZodSchema = z.object({
  action: z
    .enum([
      'png',
      'gif',
      'spritesheet_strip',
      'atlas',
      'per_tag',
      'godot_spriteframes',
      'godot_tileset',
      'godot_static',
      'godot_ui_frame',
      'godot_atlas',
      'spritesheet_per_layer',
      'spritesheet_grid',
    ])
    .describe('Export action to perform'),
  asset_name: z.string().optional().describe('Target asset name (required except for atlas)'),
  path: z.string().describe('Output file or directory path'),
  scale_factor: z.number().int().min(1).optional().describe('Scale factor for export (default 1)'),
  frame: z.number().int().min(0).optional().describe('Frame index to export (for png)'),
  pad: z.number().int().optional().describe('Pixel padding for atlas (default 0)'),
  extrude: z.boolean().optional().describe('Extrude edge pixels for atlas (default false)'),
  tags: z.array(z.string()).optional().describe('Optional list of tag names to export for per_tag'),
  layers: z
    .array(z.number().int())
    .optional()
    .describe('Layer IDs to include for spritesheet_per_layer (defaults to all image layers)'),
  columns: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Grid columns for spritesheet_grid (default ceil(sqrt(frame_count)))'),
});

function ok(data: object) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerExportTool(server: McpServer): void {
  server.registerTool(
    'export',
    {
      title: 'Export',
      description: 'Export an asset or workspace assets to various formats.',
      inputSchema: exportInputZodSchema,
    },
    async (args) => {
      const workspace = getWorkspace();

      let scaleFactor = 1;
      if (args.scale_factor && typeof args.scale_factor === 'number') {
        scaleFactor = args.scale_factor;
      }

      const outPath = args.path;

      try {
        if (args.action === 'atlas') {
          return await handleAtlasExport(
            workspace,
            outPath,
            scaleFactor,
            args.pad ?? 0,
            args.extrude === true,
          );
        }

        if (args.action === 'godot_atlas') {
          return await handleGodotAtlasExport(
            workspace,
            outPath,
            scaleFactor,
            args.pad ?? 0,
            args.extrude === true,
          );
        }

        const assetName = args.asset_name;
        if (assetName === undefined) {
          return errors.invalidArgument('asset_name is required for this export action');
        }

        switch (args.action) {
          case 'png':
            return await handlePngExport(
              workspace,
              assetName,
              outPath,
              scaleFactor,
              args.frame ?? 0,
            );
          case 'gif':
            return await handleGifExport(workspace, assetName, outPath, scaleFactor);
          case 'spritesheet_strip':
            return await handleStripExport(workspace, assetName, outPath, scaleFactor);
          case 'per_tag':
            return await handlePerTagExport(workspace, assetName, outPath, scaleFactor, args.tags);
          case 'godot_spriteframes':
            return await handleGodotSpriteframesExport(workspace, assetName, outPath, scaleFactor);
          case 'godot_tileset':
            return await handleGodotTilesetExport(workspace, assetName, outPath, scaleFactor);
          case 'godot_static':
            return await handleGodotStaticExport(workspace, assetName, outPath, scaleFactor);
          case 'godot_ui_frame':
            return await handleGodotUiFrameExport(workspace, assetName, outPath, scaleFactor);
          case 'spritesheet_per_layer':
            return await handlePerLayerStripExport(
              workspace,
              assetName,
              outPath,
              scaleFactor,
              args.layers,
            );
          case 'spritesheet_grid':
            return await handleGridExport(workspace, assetName, outPath, scaleFactor, args.columns);
          default:
            return errors.invalidArgument(`Unknown export action: ${String(args.action)}`);
        }
      } catch (e: unknown) {
        return errors.domainError(e instanceof Error ? e.message : String(e));
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handlePngExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
  frameIndex: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  let buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    Math.min(frameIndex, asset.frames.length - 1),
  );
  if (scaleFactor > 1) {
    buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
  }

  const outWidth = asset.width * scaleFactor;
  const outHeight = asset.height * scaleFactor;

  await writePng(outPath, outWidth, outHeight, buffer);

  return ok({ message: `Exported PNG to '${outPath}'.` });
}

async function handleGifExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const outWidth = asset.width * scaleFactor;
  const outHeight = asset.height * scaleFactor;

  const encoder = GIFEncoder();

  for (const frame of asset.frames) {
    let buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      frame.index,
    );
    if (scaleFactor > 1) {
      buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
    }

    // We need a palette for the GIF, gifenc provides quantize
    // We can extract RGBA arrays for use from our composite RGBA
    // But really we just pass the RGBA pixels directly to quantize if using format 'rgba4444'
    const colorOutput = quantize(buffer, 256, { format: 'rgba4444', oneBitAlpha: true });
    const indexedPixels = applyPalette(buffer, colorOutput);

    encoder.writeFrame(indexedPixels, outWidth, outHeight, {
      palette: colorOutput,
      delay: frame.duration_ms,
      transparent: true,
      transparentIndex:
        colorOutput.findIndex((c: number[]) => c[3] === 0) !== -1
          ? colorOutput.findIndex((c: number[]) => c[3] === 0)
          : 0,
      dispose: -1, // auto
    });
  }

  encoder.finish();
  const bytes = encoder.bytes();

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, bytes);

  return ok({ message: `Exported GIF to '${outPath}'.` });
}

async function handleStripExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const frameCount = asset.frames.length;
  const frameWidth = asset.width * scaleFactor;
  const frameHeight = asset.height * scaleFactor;
  const outWidth = frameWidth * frameCount;
  const outHeight = frameHeight;

  const stripBuffer = new Uint8Array(outWidth * outHeight * 4);

  for (let i = 0; i < frameCount; i++) {
    let buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      i,
    );
    if (scaleFactor > 1) {
      buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
    }

    // copy buffer into strip sequence
    const xOffset = i * frameWidth;
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const srcIdx = (y * frameWidth + x) * 4;
        const dstIdx = (y * outWidth + (xOffset + x)) * 4;
        stripBuffer[dstIdx] = buffer[srcIdx];
        stripBuffer[dstIdx + 1] = buffer[srcIdx + 1];
        stripBuffer[dstIdx + 2] = buffer[srcIdx + 2];
        stripBuffer[dstIdx + 3] = buffer[srcIdx + 3];
      }
    }
  }

  await writePng(outPath, outWidth, outHeight, stripBuffer);

  return ok({ message: `Exported spritesheet strip to '${outPath}'.` });
}

async function handleGridExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
  columns: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const frameCount = asset.frames.length;
  const cols = columns ?? Math.ceil(Math.sqrt(frameCount));

  if (cols < 1) return errors.invalidArgument('spritesheet_grid requires columns ≥ 1.');

  const rows = Math.ceil(frameCount / cols);
  const frameWidth = asset.width * scaleFactor;
  const frameHeight = asset.height * scaleFactor;
  const outWidth = frameWidth * cols;
  const outHeight = frameHeight * rows;

  const gridBuffer = new Uint8Array(outWidth * outHeight * 4);

  for (let i = 0; i < frameCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    let buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      i,
    );
    if (scaleFactor > 1) {
      buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
    }

    const xOffset = col * frameWidth;
    const yOffset = row * frameHeight;
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const srcIdx = (y * frameWidth + x) * 4;
        const dstIdx = ((yOffset + y) * outWidth + (xOffset + x)) * 4;
        gridBuffer[dstIdx] = buffer[srcIdx];
        gridBuffer[dstIdx + 1] = buffer[srcIdx + 1];
        gridBuffer[dstIdx + 2] = buffer[srcIdx + 2];
        gridBuffer[dstIdx + 3] = buffer[srcIdx + 3];
      }
    }
  }

  await writePng(outPath, outWidth, outHeight, gridBuffer);
  return ok({ message: `Exported spritesheet grid to '${outPath}'.` });
}

// ---------------------------------------------------------------------------
// Shared atlas pixel-packing helper
// ---------------------------------------------------------------------------

interface AtlasPixels {
  buffer: Uint8Array;
  width: number;
  height: number;
  placements: ReturnType<typeof packRectangles>['placements'];
}

function buildAtlasPixels(
  workspace: ReturnType<typeof getWorkspace>,
  scaleFactor: number,
  padding: number,
  extrude: boolean,
): AtlasPixels | { error: ReturnType<typeof errors.domainError> } {
  const assetsToPack: PackInput[] = [];
  const rawAssets = Array.from(workspace.loadedAssets.values());
  const extrudeAmount = extrude ? 2 : 0; // 1px on each side

  for (const asset of rawAssets) {
    assetsToPack.push({
      id: asset.name,
      width: asset.width * scaleFactor + extrudeAmount,
      height: asset.height * scaleFactor + extrudeAmount,
    });
  }

  if (assetsToPack.length === 0) {
    return { error: errors.domainError('No loaded assets to pack in atlas.') };
  }

  const scaledPadding = padding * scaleFactor;
  const packResult = packRectangles(assetsToPack, scaledPadding);

  const outWidth = packResult.width;
  const outHeight = packResult.height;
  const atlasBuffer = new Uint8Array(outWidth * outHeight * 4);

  for (const placement of packResult.placements) {
    const asset = workspace.loadedAssets.get(placement.id);
    if (!asset) continue;

    let buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      0,
    );
    if (scaleFactor > 1) {
      buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
    }

    const { x: dstX, y: dstY, width: srcW, height: srcH } = placement;
    const actualW = srcW - extrudeAmount;
    const actualH = srcH - extrudeAmount;
    const startX = dstX + (extrude ? 1 : 0);
    const startY = dstY + (extrude ? 1 : 0);

    // Draw main image
    for (let y = 0; y < actualH; y++) {
      for (let x = 0; x < actualW; x++) {
        const srcIdx = (y * actualW + x) * 4;
        const outIdx = ((startY + y) * outWidth + (startX + x)) * 4;
        atlasBuffer[outIdx] = buffer[srcIdx];
        atlasBuffer[outIdx + 1] = buffer[srcIdx + 1];
        atlasBuffer[outIdx + 2] = buffer[srcIdx + 2];
        atlasBuffer[outIdx + 3] = buffer[srcIdx + 3];
      }
    }

    // Extrude
    if (extrude) {
      // Top and bottom edges
      for (let x = 0; x < actualW; x++) {
        // Top edge
        const topSrcIdx = (0 * actualW + x) * 4;
        const topDstIdx = ((startY - 1) * outWidth + (startX + x)) * 4;
        atlasBuffer[topDstIdx] = buffer[topSrcIdx];
        atlasBuffer[topDstIdx + 1] = buffer[topSrcIdx + 1];
        atlasBuffer[topDstIdx + 2] = buffer[topSrcIdx + 2];
        atlasBuffer[topDstIdx + 3] = buffer[topSrcIdx + 3];
        // Bottom edge
        const botSrcIdx = ((actualH - 1) * actualW + x) * 4;
        const botDstIdx = ((startY + actualH) * outWidth + (startX + x)) * 4;
        atlasBuffer[botDstIdx] = buffer[botSrcIdx];
        atlasBuffer[botDstIdx + 1] = buffer[botSrcIdx + 1];
        atlasBuffer[botDstIdx + 2] = buffer[botSrcIdx + 2];
        atlasBuffer[botDstIdx + 3] = buffer[botSrcIdx + 3];
      }
      // Left and right edges (including corners)
      for (let y = -1; y <= actualH; y++) {
        const clampY = Math.max(0, Math.min(y, actualH - 1));
        // Left edge
        const leftSrcIdx = (clampY * actualW + 0) * 4;
        const leftDstIdx = ((startY + y) * outWidth + (startX - 1)) * 4;
        atlasBuffer[leftDstIdx] = buffer[leftSrcIdx];
        atlasBuffer[leftDstIdx + 1] = buffer[leftSrcIdx + 1];
        atlasBuffer[leftDstIdx + 2] = buffer[leftSrcIdx + 2];
        atlasBuffer[leftDstIdx + 3] = buffer[leftSrcIdx + 3];
        // Right edge
        const rightSrcIdx = (clampY * actualW + actualW - 1) * 4;
        const rightDstIdx = ((startY + y) * outWidth + (startX + actualW)) * 4;
        atlasBuffer[rightDstIdx] = buffer[rightSrcIdx];
        atlasBuffer[rightDstIdx + 1] = buffer[rightSrcIdx + 1];
        atlasBuffer[rightDstIdx + 2] = buffer[rightSrcIdx + 2];
        atlasBuffer[rightDstIdx + 3] = buffer[rightSrcIdx + 3];
      }
    }
  }

  return {
    buffer: atlasBuffer,
    width: outWidth,
    height: outHeight,
    placements: packResult.placements,
  };
}

async function handleAtlasExport(
  workspace: ReturnType<typeof getWorkspace>,
  outPath: string,
  scaleFactor: number,
  padding: number,
  extrude: boolean,
) {
  const result = buildAtlasPixels(workspace, scaleFactor, padding, extrude);
  if ('error' in result) return result.error;

  await writePng(outPath, result.width, result.height, result.buffer);

  return ok({
    message: `Exported atlas to '${outPath}'.`,
    atlas_width: result.width,
    atlas_height: result.height,
    regions: result.placements,
  });
}

async function handlePerTagExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outDir: string,
  scaleFactor: number,
  tagsFilter: string[] | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const projectInfo = workspace.project?.info();
  const exportPattern = projectInfo?.conventions?.export_pattern ?? '{name}_{tag}_{direction}.png';

  const tagsSource = asset.tags.filter((t) => t.type === 'frame');
  let tagsToProcess = tagsSource;
  if (tagsFilter && tagsFilter.length > 0) {
    tagsToProcess = tagsSource.filter((t) => tagsFilter.includes(t.name));
  }

  if (tagsToProcess.length === 0) {
    return errors.domainError('No matching frame tags to export.');
  }

  const generatedFiles: string[] = [];

  for (const tag of tagsToProcess) {
    const start = tag.start;
    const end = tag.end;
    const sequence: number[] = [];
    const dir = tag.direction;
    if (dir === 'forward') {
      for (let i = start; i <= end; i++) sequence.push(i);
    } else if (dir === 'reverse') {
      for (let i = end; i >= start; i--) sequence.push(i);
    } else {
      // ping_pong
      for (let i = start; i <= end; i++) sequence.push(i);
      if (end > start) {
        for (let i = end - 1; i > start; i--) sequence.push(i);
      }
    }

    const count = sequence.length;

    // We compose the frames for the tag as a horizontal strip
    const frameWidth = asset.width * scaleFactor;
    const frameHeight = asset.height * scaleFactor;
    const outWidth = frameWidth * count;
    const outHeight = frameHeight;

    const stripBuffer = new Uint8Array(outWidth * outHeight * 4);

    for (let i = 0; i < count; i++) {
      const frameIndex = sequence[i];
      let buffer = compositeFrame(
        asset.width,
        asset.height,
        buildCompositeLayers(asset),
        buildPaletteMap(asset.palette),
        frameIndex,
      );
      if (scaleFactor > 1) {
        buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
      }

      const xOffset = i * frameWidth;
      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const srcIdx = (y * frameWidth + x) * 4;
          const dstIdx = (y * outWidth + (xOffset + x)) * 4;
          stripBuffer[dstIdx] = buffer[srcIdx];
          stripBuffer[dstIdx + 1] = buffer[srcIdx + 1];
          stripBuffer[dstIdx + 2] = buffer[srcIdx + 2];
          stripBuffer[dstIdx + 3] = buffer[srcIdx + 3];
        }
      }
    }

    const filename = resolveExportPattern(exportPattern, {
      name: assetName,
      tag: tag.name,
      direction: tag.facing ?? '',
      variant: '', // Variants are handled at project load time right now
      frame: '', // Could be multiple frames per tag
    });

    // Safety check - make sure it resolves to something with .png
    const finalFilename = filename.endsWith('.png') ? filename : filename + '.png';

    const fullPath = path.join(outDir, finalFilename);
    await writePng(fullPath, outWidth, outHeight, stripBuffer);
    generatedFiles.push(fullPath);
  }

  return ok({
    message: `Exported ${String(generatedFiles.length)} tag sequences.`,
    files: generatedFiles,
  });
}

async function handlePerLayerStripExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outDir: string,
  scaleFactor: number,
  layerIds: number[] | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  let targetLayers: Array<{ id: number; name: string }>;

  if (layerIds !== undefined && layerIds.length > 0) {
    targetLayers = [];
    for (const id of layerIds) {
      const layer = asset.getLayer(id);
      if (!layer) return errors.layerNotFound(id, assetName);
      if (layer.type !== 'image')
        return errors.domainError(`Layer ${String(id)} is not an image layer.`);
      targetLayers.push({ id: layer.id, name: layer.name });
    }
  } else {
    targetLayers = asset.layers
      .filter((l) => l.type === 'image')
      .map((l) => ({ id: l.id, name: l.name }));
  }

  if (targetLayers.length === 0) {
    return errors.domainError(`Asset '${assetName}' has no image layers to export.`);
  }

  const paletteMap = buildPaletteMap(asset.palette);
  const frameCount = asset.frames.length;
  const frameWidth = asset.width * scaleFactor;
  const frameHeight = asset.height * scaleFactor;
  const outWidth = frameWidth * frameCount;
  const outHeight = frameHeight;
  const generatedFiles: string[] = [];

  for (const target of targetLayers) {
    const singleLayer: CompositeLayer[] = [
      {
        id: target.id,
        type: 'image',
        visible: true,
        opacity: 255,
        getPixel: (x, y, frame) => {
          const cel = asset.getCel(target.id, frame);
          if (!cel || !('data' in cel)) return null;
          const cx = x - cel.x;
          const cy = y - cel.y;
          if (cy >= 0 && cy < cel.data.length && cx >= 0 && cx < (cel.data[cy]?.length ?? 0)) {
            const val = cel.data[cy]?.[cx] ?? 0;
            return val === 0 ? null : val;
          }
          return null;
        },
      },
    ];

    const stripBuffer = new Uint8Array(outWidth * outHeight * 4);

    for (let i = 0; i < frameCount; i++) {
      let buffer = compositeFrame(asset.width, asset.height, singleLayer, paletteMap, i);
      if (scaleFactor > 1) {
        buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
      }

      const xOffset = i * frameWidth;
      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const srcIdx = (y * frameWidth + x) * 4;
          const dstIdx = (y * outWidth + (xOffset + x)) * 4;
          stripBuffer[dstIdx] = buffer[srcIdx];
          stripBuffer[dstIdx + 1] = buffer[srcIdx + 1];
          stripBuffer[dstIdx + 2] = buffer[srcIdx + 2];
          stripBuffer[dstIdx + 3] = buffer[srcIdx + 3];
        }
      }
    }

    const filename = `${assetName}_${target.name}_strip.png`;
    const fullPath = path.join(outDir, filename);
    await writePng(fullPath, outWidth, outHeight, stripBuffer);
    generatedFiles.push(fullPath);
  }

  return ok({
    message: `Exported ${String(generatedFiles.length)} per-layer strips.`,
    files: generatedFiles,
  });
}

async function writePng(outPath: string, width: number, height: number, buffer: Uint8Array) {
  return new Promise<void>((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const png = new PNG({ width, height });
    png.data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const stream = fs.createWriteStream(outPath);
    png.pack().pipe(stream);

    stream.on('finish', () => {
      resolve();
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

async function handleGodotSpriteframesExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const frameCount = asset.frames.length;
  if (frameCount === 0) return errors.domainError('Asset has no frames to export.');

  const frameWidth = asset.width * scaleFactor;
  const frameHeight = asset.height * scaleFactor;
  const outWidth = frameWidth * frameCount;
  const outHeight = frameHeight;

  const stripBuffer = new Uint8Array(outWidth * outHeight * 4);

  for (let i = 0; i < frameCount; i++) {
    let buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      asset.frames[i].index,
    );
    if (scaleFactor > 1) {
      buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
    }

    const xOffset = i * frameWidth;
    for (let y = 0; y < frameHeight; y++) {
      for (let x = 0; x < frameWidth; x++) {
        const srcIdx = (y * frameWidth + x) * 4;
        const dstIdx = (y * outWidth + (xOffset + x)) * 4;
        stripBuffer[dstIdx] = buffer[srcIdx];
        stripBuffer[dstIdx + 1] = buffer[srcIdx + 1];
        stripBuffer[dstIdx + 2] = buffer[srcIdx + 2];
        stripBuffer[dstIdx + 3] = buffer[srcIdx + 3];
      }
    }
  }

  let dirName = path.dirname(outPath);
  let baseName = path.basename(outPath);
  if (outPath.endsWith('/') || outPath.endsWith('\\')) {
    dirName = outPath;
    baseName = assetName;
  }

  const stripPngName = `${baseName}_strip.png`;
  const stripPngPath = path.join(dirName, stripPngName);

  await writePng(stripPngPath, outWidth, outHeight, stripBuffer);

  const importSidecar = generateGodotImportSidecar(stripPngName);
  await fs.promises.writeFile(`${stripPngPath}.import`, importSidecar);

  const tresContent = godotResources.generateGodotSpriteFrames(asset, stripPngName, scaleFactor);
  const tresPath = path.join(dirName, `${baseName}.tres`);
  await fs.promises.writeFile(tresPath, tresContent);

  const generatedFiles = [stripPngPath, `${stripPngPath}.import`, tresPath];

  const shapeLayers = asset.layers.filter((l) => l.type === 'shape');
  if (shapeLayers.length > 0) {
    const shapesContent = godotResources.generateGodotShapesAnimation(asset, scaleFactor);
    if (shapesContent) {
      const shapesPath = path.join(dirName, `${baseName}_shapes.tres`);
      await fs.promises.writeFile(shapesPath, shapesContent);
      generatedFiles.push(shapesPath);
    }
  }

  return ok({
    message: `Exported Godot SpriteFrames to '${outPath}'.`,
    files: generatedFiles,
  });
}

async function handleGodotTilesetExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  if (
    asset.tile_width === undefined ||
    asset.tile_height === undefined ||
    asset.tile_count === undefined
  ) {
    return errors.domainError(`Asset '${assetName}' is not a tileset.`);
  }

  // To export a tileset, we essentially generate an atlas of its current frames.
  // Actually, a tileset is typically a single frame of an image or tilemap layer.
  // We'll export frame 0 composited as the atlas texture.
  let buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    0,
  );
  if (scaleFactor > 1) {
    buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
  }

  const outWidth = asset.width * scaleFactor;
  const outHeight = asset.height * scaleFactor;

  let dirName = path.dirname(outPath);
  let baseName = path.basename(outPath);
  if (outPath.endsWith('/') || outPath.endsWith('\\')) {
    dirName = outPath;
    baseName = assetName;
  }

  const pngName = `${baseName}.png`;
  const pngPath = path.join(dirName, pngName);

  await writePng(pngPath, outWidth, outHeight, buffer);

  const importSidecar = generateGodotImportSidecar(pngName);
  await fs.promises.writeFile(`${pngPath}.import`, importSidecar);

  const tresContent = godotResources.generateGodotTileSet(asset, pngName, scaleFactor);
  const tresPath = path.join(dirName, `${baseName}.tres`);
  await fs.promises.writeFile(tresPath, tresContent);

  return ok({
    message: `Exported Godot TileSet to '${dirName}'.`,
    files: [pngPath, `${pngPath}.import`, tresPath],
  });
}

async function handleGodotStaticExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  let buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    0,
  );
  if (scaleFactor > 1) {
    buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
  }

  const outWidth = asset.width * scaleFactor;
  const outHeight = asset.height * scaleFactor;

  let dirName = path.dirname(outPath);
  let baseName = path.basename(outPath);
  if (outPath.endsWith('/') || outPath.endsWith('\\')) {
    dirName = outPath;
    baseName = assetName;
  }

  const pngName = `${baseName}.png`;
  const pngPath = path.join(dirName, pngName);

  await writePng(pngPath, outWidth, outHeight, buffer);

  const importSidecar = generateGodotImportSidecar(pngName);
  await fs.promises.writeFile(`${pngPath}.import`, importSidecar);

  return ok({
    message: `Exported Godot Static PNG to '${dirName}'.`,
    files: [pngPath, `${pngPath}.import`],
  });
}

async function handleGodotUiFrameExport(
  workspace: ReturnType<typeof getWorkspace>,
  assetName: string,
  outPath: string,
  scaleFactor: number,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  if (!asset.nine_slice) {
    return errors.domainError(
      `Asset '${assetName}' has no nine_slice set. Use asset set_nine_slice first.`,
    );
  }

  let buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    0,
  );
  if (scaleFactor > 1) {
    buffer = upscale(buffer, asset.width, asset.height, scaleFactor);
  }

  const outWidth = asset.width * scaleFactor;
  const outHeight = asset.height * scaleFactor;

  let dirName = path.dirname(outPath);
  let baseName = path.basename(outPath);
  if (outPath.endsWith('/') || outPath.endsWith('\\')) {
    dirName = outPath;
    baseName = assetName;
  }

  const pngName = `${baseName}.png`;
  const pngPath = path.join(dirName, pngName);

  await writePng(pngPath, outWidth, outHeight, buffer);

  const importSidecar = generateGodotImportSidecar(pngName);
  await fs.promises.writeFile(`${pngPath}.import`, importSidecar);

  const tresContent = godotResources.generateGodotStyleBoxTexture(
    pngName,
    asset.nine_slice,
    scaleFactor,
  );
  const tresPath = path.join(dirName, `${baseName}.tres`);
  await fs.promises.writeFile(tresPath, tresContent);

  return ok({
    message: `Exported Godot UI frame (StyleBoxTexture) to '${dirName}'.`,
    files: [pngPath, `${pngPath}.import`, tresPath],
  });
}

async function handleGodotAtlasExport(
  workspace: ReturnType<typeof getWorkspace>,
  outPath: string,
  scaleFactor: number,
  padding: number,
  extrude: boolean,
) {
  const result = buildAtlasPixels(workspace, scaleFactor, padding, extrude);
  if ('error' in result) return result.error;

  let dirName = path.dirname(outPath);
  let baseName = path.basename(outPath);
  if (outPath.endsWith('/') || outPath.endsWith('\\')) {
    dirName = outPath;
    baseName = 'atlas';
  }

  const pngName = `${baseName}.png`;
  const pngPath = path.join(dirName, pngName);

  await writePng(pngPath, result.width, result.height, result.buffer);

  const importSidecar = generateGodotImportSidecar(pngName);
  await fs.promises.writeFile(`${pngPath}.import`, importSidecar);

  const tresContent = godotResources.generateGodotAtlasTextures(pngName, result.placements);
  const tresPath = path.join(dirName, `${baseName}.tres`);
  await fs.promises.writeFile(tresPath, tresContent);

  return ok({
    message: `Exported Godot atlas to '${dirName}'.`,
    atlas_width: result.width,
    atlas_height: result.height,
    regions: result.placements,
    files: [pngPath, `${pngPath}.import`, tresPath],
  });
}
