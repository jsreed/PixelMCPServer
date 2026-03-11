import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { getWorkspace } from '../classes/workspace.js';
import { type AssetClass } from '../classes/asset.js';
import { PNG } from 'pngjs';
import { compositeFrame, type CompositeLayer } from '../algorithms/composite.js';
import { buildCompositeLayers, buildPaletteMap } from '../utils/render.js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const TRANSPARENT_1X1_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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

function renderAssetView(
  route: Extract<ResourceRoute, { type: 'asset' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  const buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    0,
  );

  const png = new PNG({ width: asset.width, height: asset.height });
  png.data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const pngBuffer = PNG.sync.write(png);

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: pngBuffer.toString('base64') }],
  };
}

function renderAssetFrameView(
  route: Extract<ResourceRoute, { type: 'asset_frame' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  if (route.frameIndex < 0 || route.frameIndex >= asset.frames.length) {
    throw new Error(`Frame ${String(route.frameIndex)} is out of range`);
  }

  const buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    route.frameIndex,
  );

  const png = new PNG({ width: asset.width, height: asset.height });
  png.data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const pngBuffer = PNG.sync.write(png);

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: pngBuffer.toString('base64') }],
  };
}

function renderLayerInternal(
  asset: AssetClass,
  layerId: number,
  frameIndex: number,
  uri: URL,
): ReadResourceResult {
  const compLayers = buildCompositeLayers(asset);

  const findCompLayer = (layers: CompositeLayer[], id: number): CompositeLayer | undefined => {
    for (const l of layers) {
      if (l.id === id) return l;
      if (l.children) {
        const found = findCompLayer(l.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const compLayer = findCompLayer(compLayers, layerId);
  if (!compLayer) {
    throw new Error(`Layer ${String(layerId)} does not exist`);
  }

  if (compLayer.type !== 'image' && compLayer.type !== 'tilemap') {
    return {
      contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
    };
  }

  const isolatedLayer: CompositeLayer = {
    ...compLayer,
    visible: true,
    opacity: 255,
  };

  const buffer = compositeFrame(
    asset.width,
    asset.height,
    [isolatedLayer],
    buildPaletteMap(asset.palette),
    frameIndex,
  );

  const png = new PNG({ width: asset.width, height: asset.height });
  png.data = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const pngBuffer = PNG.sync.write(png);

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: pngBuffer.toString('base64') }],
  };
}

function renderLayerView(
  route: Extract<ResourceRoute, { type: 'layer' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  return renderLayerInternal(asset, route.layerId, 0, uri);
}

function renderLayerFrameView(
  route: Extract<ResourceRoute, { type: 'layer_frame' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  if (route.frameIndex < 0 || route.frameIndex >= asset.frames.length) {
    throw new Error(`Frame ${String(route.frameIndex)} is out of range`);
  }

  return renderLayerInternal(asset, route.layerId, route.frameIndex, uri);
}

function renderAnimationView(
  route: Extract<ResourceRoute, { type: 'animation' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  const tag = asset.tags.find((t) => t.name === route.tag);
  if (!tag) {
    throw new Error(`Tag '${route.tag}' does not exist on asset '${route.name}'`);
  }
  if (tag.type !== 'frame') {
    throw new Error(`Tag '${route.tag}' is a layer tag, animation requires a frame tag`);
  }

  const sequence: number[] = [];
  const start = tag.start;
  const end = tag.end;
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

  if (sequence.length === 0) {
    throw new Error(`Frame tag '${route.tag}' has no frames`);
  }

  const encoder = GIFEncoder();

  for (const frameIndex of sequence) {
    const frameDetail = asset.frames.find((f) => f.index === frameIndex);
    const durationParam = frameDetail ? frameDetail.duration_ms : 100;

    const buffer = compositeFrame(
      asset.width,
      asset.height,
      buildCompositeLayers(asset),
      buildPaletteMap(asset.palette),
      frameIndex,
    );

    const colorOutput = quantize(buffer, 256, { format: 'rgba4444', oneBitAlpha: true });
    const indexedPixels = applyPalette(buffer, colorOutput);

    encoder.writeFrame(indexedPixels, asset.width, asset.height, {
      palette: colorOutput,
      delay: durationParam,
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
  const base64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/gif', blob: base64 }],
  };
}

function renderPaletteView(
  route: Extract<ResourceRoute, { type: 'palette' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  const cols = 16;
  const rows = 16;
  const swatchSize = 16;
  const width = cols * swatchSize;
  const height = rows * swatchSize;

  const png = new PNG({ width, height });

  for (let idx = 0; idx < 256; idx++) {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const startX = col * swatchSize;
    const startY = row * swatchSize;

    const [r, g, b, a] = asset.palette.get(idx);

    const isEmpty = a === 0 && r === 0 && g === 0 && b === 0;

    for (let sy = 0; sy < swatchSize; sy++) {
      for (let sx = 0; sx < swatchSize; sx++) {
        const x = startX + sx;
        const y = startY + sy;
        const outIdx = (width * y + x) << 2;

        // Checkerboard details
        const checkerSize = 4;
        const isCheckerDark = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
        const bg = isCheckerDark ? 204 : 255;

        // Empty cross logic (a red X)
        let isCross = false;
        if (isEmpty) {
          if ((sx === sy || sx === swatchSize - 1 - sy) && sx >= 2 && sx < swatchSize - 2) {
            isCross = true;
          }
        }

        if (isCross) {
          png.data[outIdx] = 255;
          png.data[outIdx + 1] = 0;
          png.data[outIdx + 2] = 0;
          png.data[outIdx + 3] = 255;
        } else {
          // standard alpha composite over checkerboard
          const alpha = a / 255;
          png.data[outIdx] = Math.round(r * alpha + bg * (1 - alpha));
          png.data[outIdx + 1] = Math.round(g * alpha + bg * (1 - alpha));
          png.data[outIdx + 2] = Math.round(b * alpha + bg * (1 - alpha));
          png.data[outIdx + 3] = 255; // Output PNG is fully opaque
        }
      }
    }
  }

  const pngBuffer = PNG.sync.write(png);

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: pngBuffer.toString('base64') }],
  };
}

function renderTilesetView(
  route: Extract<ResourceRoute, { type: 'tileset' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  const workspace = getWorkspace();
  const asset = workspace.loadedAssets.get(route.name);
  if (!asset) {
    throw new Error(`Asset '${route.name}' is not loaded`);
  }

  if (
    asset.tile_width === undefined ||
    asset.tile_height === undefined ||
    asset.tile_count === undefined
  ) {
    throw new Error(`Asset '${route.name}' is not a tileset`);
  }

  const tw = asset.tile_width;
  const th = asset.tile_height;
  const count = asset.tile_count;

  if (count === 0) {
    return {
      contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
    };
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const outWidth = cols * tw + Math.max(0, cols - 1);
  const outHeight = rows * th + Math.max(0, rows - 1);

  const png = new PNG({ width: outWidth, height: outHeight });

  // Pre-fill with checkerboard and grid lines
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const outIdx = (outWidth * y + x) << 2;

      // Check if we are on a grid line
      const isGridCol = x % (tw + 1) === tw;
      const isGridRow = y % (th + 1) === th;

      if (isGridCol || isGridRow) {
        png.data[outIdx] = 128; // R
        png.data[outIdx + 1] = 128; // G
        png.data[outIdx + 2] = 128; // B
        png.data[outIdx + 3] = 255; // A
      } else {
        // Checkerboard
        const checkerSize = 4;
        const isCheckerDark = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
        const bg = isCheckerDark ? 204 : 255;
        png.data[outIdx] = bg;
        png.data[outIdx + 1] = bg;
        png.data[outIdx + 2] = bg;
        png.data[outIdx + 3] = 255;
      }
    }
  }

  // Composite frame 0 (tileset layers are typically laid out on frame 0)
  const buffer = compositeFrame(
    asset.width,
    asset.height,
    buildCompositeLayers(asset),
    buildPaletteMap(asset.palette),
    0,
  );

  // Copy tiles into grid
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const dstX = col * (tw + 1);
    const dstY = row * (th + 1);

    const srcX = i * tw;
    const srcY = 0; // Tiles are stored horizontally in the asset's image layer

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sx = srcX + x;
        const sy = srcY + y;

        if (sx >= asset.width || sy >= asset.height) continue;

        const srcIdx = (sy * asset.width + sx) << 2;
        const r = buffer[srcIdx];
        const g = buffer[srcIdx + 1];
        const b = buffer[srcIdx + 2];
        const a = buffer[srcIdx + 3];

        if (a > 0) {
          const dx = dstX + x;
          const dy = dstY + y;
          const outIdx = (outWidth * dy + dx) << 2;

          const alpha = a / 255;
          const bgR = png.data[outIdx];
          const bgG = png.data[outIdx + 1];
          const bgB = png.data[outIdx + 2];

          png.data[outIdx] = Math.round(r * alpha + bgR * (1 - alpha));
          png.data[outIdx + 1] = Math.round(g * alpha + bgG * (1 - alpha));
          png.data[outIdx + 2] = Math.round(b * alpha + bgB * (1 - alpha));
          png.data[outIdx + 3] = 255; // Over checkerboard is always opaque
        }
      }
    }
  }

  const pngBuffer = PNG.sync.write(png);

  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: pngBuffer.toString('base64') }],
  };
}
