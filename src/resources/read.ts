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
