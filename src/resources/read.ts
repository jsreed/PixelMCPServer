import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { getWorkspace } from '../classes/workspace.js';
import { PNG } from 'pngjs';
import { compositeFrame } from '../algorithms/composite.js';
import { buildCompositeLayers, buildPaletteMap } from '../utils/render.js';

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

function renderLayerView(
  _route: Extract<ResourceRoute, { type: 'layer' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderLayerFrameView(
  _route: Extract<ResourceRoute, { type: 'layer_frame' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/png', blob: TRANSPARENT_1X1_PNG_B64 }],
  };
}

function renderAnimationView(
  _route: Extract<ResourceRoute, { type: 'animation' }>,
  uri: URL,
): ReadResourceResult | Promise<ReadResourceResult> {
  return {
    contents: [{ uri: uri.toString(), mimeType: 'image/gif', blob: TRANSPARENT_1X1_PNG_B64 }],
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
