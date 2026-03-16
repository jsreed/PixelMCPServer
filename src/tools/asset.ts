import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { AssetClass } from '../classes/asset.js';
import { LayerCommand } from '../commands/layer-command.js';
import { FrameCommand } from '../commands/frame-command.js';
import { TagCommand } from '../commands/tag-command.js';
import { ShapeCommand } from '../commands/shape-command.js';
import { ResizeCommand } from '../commands/resize-command.js';
import { RenameCommand } from '../commands/rename-command.js';
import { AssetDeleteCommand } from '../commands/asset-delete-command.js';
import { NineSliceCommand } from '../commands/nine-slice-command.js';
import { LinkCelCommand } from '../commands/link-cel-command.js';
import { saveAssetFile } from '../io/asset-io.js';
import { loadPaletteFile } from '../io/palette-io.js';
import { marchingSquares, simplifyOrthogonal } from '../algorithms/marching-squares.js';
import { simplifyPolygon } from '../algorithms/ramer-douglas-peucker.js';
import { detectBanding } from '../algorithms/banding.js';
import { interpolateFrames } from '../algorithms/interpolate.js';
import * as errors from '../errors.js';
import { createResourceLink } from '../utils/resource-link.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { type Asset, type Perspective, type Anchor, type NineSlice } from '../types/asset.js';
import { type Color } from '../types/palette.js';
import { type Frame } from '../types/frame.js';
import { type Tag, type Facing } from '../types/tag.js';
import { type Shape } from '../types/shape.js';
import { type Cel, packCelKey } from '../types/cel.js';

// ---------------------------------------------------------------------------
// Zod input schema
// ---------------------------------------------------------------------------

const assetInputSchema = {
  action: z
    .enum([
      'info',
      'get_cel',
      'get_cels',
      'detect_banding',
      'generate_collision_polygon',
      'create',
      'resize',
      'rename',
      'duplicate',
      'create_recolor',
      'delete',
      'add_layer',
      'add_group',
      'remove_layer',
      'reorder_layer',
      'add_frame',
      'remove_frame',
      'set_frame_duration',
      'add_tag',
      'remove_tag',
      'add_shape',
      'update_shape',
      'remove_shape',
      'get_shapes',
      'set_nine_slice',
      'link_cel',
      'interpolate_frames',
    ])
    .describe('Asset action to perform'),
  asset_name: z.string().optional().describe('Target asset name'),
  name: z
    .string()
    .optional()
    .describe(
      'New name (for rename, duplicate, create, add_layer, add_group, add_tag, shape_name)',
    ),
  delete_file: z.boolean().optional().describe('For delete: also remove file from disk'),
  width: z.number().int().optional().describe('Canvas width (create, resize)'),
  height: z.number().int().optional().describe('Canvas height (create, resize)'),
  anchor: z
    .enum([
      'top_left',
      'top_center',
      'top_right',
      'center_left',
      'center',
      'center_right',
      'bottom_left',
      'bottom_center',
      'bottom_right',
    ])
    .optional()
    .describe('Resize anchor'),
  layer_id: z.number().int().optional().describe('Target layer ID'),
  layer_type: z.enum(['image', 'tilemap', 'shape']).optional().describe('Layer type for add_layer'),
  layer_role: z.string().optional().describe('Role for shape layers'),
  layer_physics_layer: z.number().int().optional().describe('Physics layer for shape layers'),
  parent_layer_id: z.number().int().optional().describe('Parent group layer ID'),
  position: z.number().int().optional().describe('Position for reorder_layer'),
  frame_index: z.number().int().optional().describe('Target frame index'),
  frame_start: z.number().int().optional().describe('Frame range start for get_cels'),
  frame_end: z.number().int().optional().describe('Frame range end for get_cels'),
  cels: z
    .array(z.object({ layer_id: z.number().int(), frame_index: z.number().int() }))
    .optional()
    .describe('Explicit cel list for get_cels'),
  duration_ms: z.number().int().optional().describe('Frame duration in ms'),
  tag_type: z.enum(['frame', 'layer']).optional().describe('Tag type'),
  tag_start: z.number().int().optional().describe('Frame tag start'),
  tag_end: z.number().int().optional().describe('Frame tag end'),
  tag_layers: z.array(z.number().int()).optional().describe('Layer IDs for layer tags'),
  tag_direction: z
    .enum(['forward', 'reverse', 'ping_pong'])
    .optional()
    .describe('Playback direction'),
  tag_facing: z
    .enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
    .optional()
    .describe('Facing direction'),
  perspective: z
    .string()
    .optional()
    .describe('Drawing convention (flat, top_down, isometric, etc.)'),
  tile_width: z.number().int().optional().describe('Tile/iso cell width'),
  tile_height: z.number().int().optional().describe('Tile/iso cell height'),
  nine_slice_top: z.number().int().min(0).optional().describe('Nine-slice top margin in pixels'),
  nine_slice_right: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Nine-slice right margin in pixels'),
  nine_slice_bottom: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Nine-slice bottom margin in pixels'),
  nine_slice_left: z.number().int().min(0).optional().describe('Nine-slice left margin in pixels'),
  source_layer_id: z.number().int().optional().describe('Source layer for link_cel'),
  source_frame_index: z.number().int().optional().describe('Source frame for link_cel'),
  palette: z.array(z.array(z.number().int())).optional().describe('Initial palette for create'),
  layers: z
    .array(z.object({ name: z.string(), type: z.enum(['image', 'tilemap', 'shape']) }))
    .optional()
    .describe('Initial layers for create'),
  frames: z
    .array(z.object({ duration_ms: z.number().int() }))
    .optional()
    .describe('Initial frames for create'),
  tags: z.array(z.any()).optional().describe('Initial tags for create'),
  shape_name: z.string().optional().describe('Shape name'),
  shape_type: z.enum(['rect', 'polygon']).optional().describe('Shape geometry type'),
  shape_x: z.number().int().optional(),
  shape_y: z.number().int().optional(),
  shape_width: z.number().int().optional(),
  shape_height: z.number().int().optional(),
  shape_points: z
    .array(z.array(z.number().int()))
    .optional()
    .describe('Polygon vertices [[x,y],...]'),
  epsilon: z.number().optional().describe('RDP simplification tolerance'),
  target_layer_id: z.number().int().optional().describe('Target shape layer for collision polygon'),
  palette_file: z.string().optional().describe('Palette file path for create_recolor'),
  palette_slug: z.string().optional().describe('Lospec slug for create_recolor'),
  palette_entries: z
    .array(z.object({ index: z.number().int(), rgba: z.array(z.number().int()) }))
    .optional()
    .describe('Inline palette overrides for create_recolor'),
  count: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Number of intermediate frames (interpolate_frames)'),
};

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

type Workspace = ReturnType<typeof getWorkspace>;
type LoadedAsset = NonNullable<ReturnType<Workspace['loadedAssets']['get']>>;

export function registerAssetTool(server: McpServer): void {
  server.registerTool(
    'asset',
    {
      title: 'Asset',
      description:
        'Query and modify asset structure (layers, frames, tags, shapes), create/delete/duplicate assets, resize, rename, and detect artifacts.',
      inputSchema: assetInputSchema,
    },
    async (args) => {
      const workspace = getWorkspace();

      switch (args.action) {
        // --- Read-only ---
        case 'info':
          return handleInfo(workspace, args.asset_name);
        case 'get_cel':
          return handleGetCel(workspace, args.asset_name, args.layer_id, args.frame_index);
        case 'get_cels':
          return handleGetCels(
            workspace,
            args.asset_name,
            args.layer_id,
            args.frame_start,
            args.frame_end,
            args.cels as Array<{ layer_id: number; frame_index: number }> | undefined,
          );
        case 'get_shapes':
          return handleGetShapes(workspace, args.asset_name, args.layer_id, args.frame_index);
        case 'detect_banding':
          return handleDetectBanding(workspace, args.asset_name, args.layer_id, args.frame_index);

        // --- Create / Lifecycle ---
        case 'create':
          return handleCreate(workspace, args);
        case 'rename':
          return handleRename(workspace, args.asset_name, args.name);
        case 'duplicate':
          return handleDuplicate(workspace, args.asset_name, args.name);
        case 'create_recolor':
          return handleCreateRecolor(workspace, args);
        case 'delete':
          return handleDelete(workspace, args.asset_name, args.delete_file);

        // --- Structure ---
        case 'resize':
          return handleResize(
            workspace,
            args.asset_name,
            args.width,
            args.height,
            args.anchor as Anchor | undefined,
          );
        case 'add_layer':
          return handleAddLayer(workspace, args);
        case 'add_group':
          return handleAddGroup(
            workspace,
            args.asset_name,
            args.name,
            args.parent_layer_id,
            args.position,
          );
        case 'remove_layer':
          return handleRemoveLayer(workspace, args.asset_name, args.layer_id);
        case 'reorder_layer':
          return handleReorderLayer(
            workspace,
            args.asset_name,
            args.layer_id,
            args.parent_layer_id,
            args.position,
          );
        case 'add_frame':
          return handleAddFrame(workspace, args.asset_name, args.frame_index, args.duration_ms);
        case 'remove_frame':
          return handleRemoveFrame(workspace, args.asset_name, args.frame_index);
        case 'set_frame_duration':
          return handleSetFrameDuration(
            workspace,
            args.asset_name,
            args.frame_index,
            args.duration_ms,
          );
        case 'add_tag':
          return handleAddTag(workspace, args);
        case 'remove_tag':
          return handleRemoveTag(
            workspace,
            args.asset_name,
            args.name,
            args.tag_facing as Facing | undefined,
          );

        // --- Shapes ---
        case 'add_shape':
          return handleAddShape(workspace, args);
        case 'update_shape':
          return handleUpdateShape(workspace, args);
        case 'remove_shape':
          return handleRemoveShape(
            workspace,
            args.asset_name,
            args.layer_id,
            args.frame_index,
            args.shape_name,
          );
        case 'generate_collision_polygon':
          return handleGenerateCollisionPolygon(workspace, args);
        case 'set_nine_slice':
          return handleSetNineSlice(workspace, args);
        case 'link_cel':
          return handleLinkCel(workspace, args);
        case 'interpolate_frames':
          return handleInterpolateFrames(workspace, args);

        default:
          return errors.invalidArgument(`Unknown asset action: ${String(args.action)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function requireAsset(
  workspace: Workspace,
  assetName: string | undefined,
): LoadedAsset | ReturnType<typeof errors.domainError> {
  if (!assetName) return errors.invalidArgument('asset requires "asset_name".');
  const asset = workspace.loadedAssets.get(assetName);
  if (!asset) return errors.assetNotLoaded(assetName);
  return asset;
}

export function isError(val: unknown): val is { isError: true } {
  return typeof val === 'object' && val !== null && 'isError' in val;
}

function ok(data: object) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function okWithAssetLink(data: object, assetName: string) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(data) },
      createResourceLink(assetName, `pixel://view/asset/${assetName}`),
    ],
  };
}

// ---------------------------------------------------------------------------
// Read-only actions
// ---------------------------------------------------------------------------

function handleInfo(workspace: Workspace, assetName: string | undefined) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  return ok({
    name: asset.name,
    width: asset.width,
    height: asset.height,
    perspective: asset.perspective,
    layers: asset.layers,
    frames: asset.frames,
    tags: asset.tags,
    palette_colors: asset.paletteUsageCounts().filter((_, i) => {
      const c = asset.palette.get(i);
      return c[0] !== 0 || c[1] !== 0 || c[2] !== 0 || c[3] !== 0;
    }).length,
  });
}

function handleGetCel(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  frameIndex: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined) return errors.invalidArgument('get_cel requires "layer_id".');
  if (frameIndex === undefined) return errors.invalidArgument('get_cel requires "frame_index".');

  const layer = asset.getLayer(layerId);
  if (!layer) return errors.layerNotFound(layerId, asset.name);
  if (layer.type === 'shape') return errors.layerIsShapeLayer(layerId);

  if (frameIndex < 0 || frameIndex >= asset.frames.length) {
    return errors.frameOutOfRange(frameIndex, asset.name, asset.frames.length);
  }

  // Check if it's a linked cel (before resolution)
  const rawKey = packCelKey(layerId, frameIndex);
  const rawCels = asset.cels;
  const rawCel = rawCels[rawKey] as unknown as { link?: string } | undefined;
  const isLinked = rawCel !== undefined && 'link' in rawCel;
  const linkSource = isLinked ? rawCel.link : undefined;

  const cel = asset.getCel(layerId, frameIndex);
  if (!cel) return ok({ layer_id: layerId, frame_index: frameIndex, data: null });

  if ('data' in cel) {
    return ok({
      layer_id: layerId,
      frame_index: frameIndex,
      x: cel.x,
      y: cel.y,
      width: cel.data[0]?.length ?? 0,
      height: cel.data.length,
      data: cel.data,
      is_linked: isLinked,
      ...(isLinked ? { link_source: linkSource } : {}),
    });
  }

  // Shape or tilemap cel
  return ok({ layer_id: layerId, frame_index: frameIndex, cel, is_linked: isLinked });
}

function handleGetCels(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  frameStart: number | undefined,
  frameEnd: number | undefined,
  celsList: Array<{ layer_id: number; frame_index: number }> | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const targets: Array<{ layer_id: number; frame_index: number }> = [];
  if (celsList && celsList.length > 0) {
    targets.push(...celsList);
  } else if (layerId !== undefined && frameStart !== undefined && frameEnd !== undefined) {
    for (let f = frameStart; f <= frameEnd; f++) {
      targets.push({ layer_id: layerId, frame_index: f });
    }
  } else {
    return errors.invalidArgument(
      'get_cels requires either "cels" array or "layer_id" + "frame_start" + "frame_end".',
    );
  }

  // Validate layers
  for (const t of targets) {
    const layer = asset.getLayer(t.layer_id);
    if (!layer) return errors.layerNotFound(t.layer_id, asset.name);
    if (layer.type === 'shape') return errors.layerIsShapeLayer(t.layer_id);
    if (t.frame_index < 0 || t.frame_index >= asset.frames.length) {
      return errors.frameOutOfRange(t.frame_index, asset.name, asset.frames.length);
    }
  }

  const results = targets.map((t) => {
    const cel = asset.getCel(t.layer_id, t.frame_index);
    if (!cel || !('data' in cel)) {
      return { layer_id: t.layer_id, frame_index: t.frame_index, data: null };
    }
    return {
      layer_id: t.layer_id,
      frame_index: t.frame_index,
      x: cel.x,
      y: cel.y,
      width: cel.data[0]?.length ?? 0,
      height: cel.data.length,
      data: cel.data,
    };
  });

  return ok({ cels: results });
}

function handleGetShapes(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  frameIndex: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined) return errors.invalidArgument('get_shapes requires "layer_id".');
  if (frameIndex === undefined) return errors.invalidArgument('get_shapes requires "frame_index".');

  return ok({ shapes: asset.getShapes(layerId, frameIndex) });
}

function handleDetectBanding(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  frameIndex: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined) return errors.invalidArgument('detect_banding requires "layer_id".');
  if (frameIndex === undefined)
    return errors.invalidArgument('detect_banding requires "frame_index".');

  const layer = asset.getLayer(layerId);
  if (!layer) return errors.layerNotFound(layerId, asset.name);

  if (frameIndex < 0 || frameIndex >= asset.frames.length) {
    return errors.frameOutOfRange(frameIndex, asset.name, asset.frames.length);
  }

  const cel = asset.getCel(layerId, frameIndex);
  if (!cel || !('data' in cel)) return ok({ clean: true });

  const data = cel.data;
  const w = data[0]?.length ?? 0;
  const h = data.length;
  if (w === 0 || h === 0) return ok({ clean: true });

  const getPixel = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return null;
    return data[y][x];
  };

  const regions = detectBanding(w, h, getPixel);
  if (regions.length === 0) return ok({ clean: true });
  return ok({ banding: regions });
}

// ---------------------------------------------------------------------------
// Create / Lifecycle actions
// ---------------------------------------------------------------------------

async function handleCreate(workspace: Workspace, args: Record<string, unknown>) {
  if (!workspace.project) return errors.noProjectLoaded();
  if (!args.name) return errors.invalidArgument('asset create requires "name".');
  if (!args.width || !args.height)
    return errors.invalidArgument('asset create requires "width" and "height".');

  const name = args.name as string;
  const w = args.width as number;
  const h = args.height as number;
  const perspective = (args.perspective ?? 'flat') as Perspective;

  // Build asset data
  const assetData: Asset = {
    name,
    width: w,
    height: h,
    perspective,
    palette: Array.from({ length: 256 }, () => [0, 0, 0, 0]),
    layers: [],
    frames: [],
    tags: [],
    cels: {},
  };

  if (args.tile_width) assetData.tile_width = args.tile_width as number;
  if (args.tile_height) assetData.tile_height = args.tile_height as number;
  const nsTop = args.nine_slice_top as number | undefined;
  const nsRight = args.nine_slice_right as number | undefined;
  const nsBottom = args.nine_slice_bottom as number | undefined;
  const nsLeft = args.nine_slice_left as number | undefined;
  if (
    nsTop !== undefined ||
    nsRight !== undefined ||
    nsBottom !== undefined ||
    nsLeft !== undefined
  ) {
    assetData.nine_slice = {
      top: nsTop ?? 0,
      right: nsRight ?? 0,
      bottom: nsBottom ?? 0,
      left: nsLeft ?? 0,
    };
  }

  // Apply initial palette
  const paletteArgs = args.palette as number[][] | undefined;
  if (paletteArgs) {
    for (let i = 0; i < paletteArgs.length && i < 256; i++) {
      const c = paletteArgs[i] as number[] | undefined;
      if (c?.length === 4) {
        assetData.palette[i] = c as [number, number, number, number];
      }
    }
  }

  const asset = AssetClass.fromJSON(assetData);

  // Add initial layers
  if (args.layers && Array.isArray(args.layers)) {
    for (const l of args.layers as Array<{ name: string; type: string }>) {
      asset.addLayer({
        name: l.name,
        type: l.type as 'image' | 'tilemap' | 'shape',
        opacity: 255,
        visible: true,
      });
    }
  } else {
    // Default layer
    asset.addLayer({ name: 'Layer 1', type: 'image', opacity: 255, visible: true });
  }

  // Add initial frames
  if (args.frames && Array.isArray(args.frames)) {
    for (const f of args.frames as Array<{ duration_ms: number }>) {
      asset.addFrame({ index: asset.frames.length, duration_ms: f.duration_ms } as Frame);
    }
  } else {
    asset.addFrame({ index: 0, duration_ms: 100 } as Frame);
  }

  // Add initial tags
  if (args.tags && Array.isArray(args.tags)) {
    for (const t of args.tags as Tag[]) {
      asset.addTag(t);
    }
  }

  // Save to disk and register
  const projectDir = path.dirname(workspace.project.path);
  const filePath = path.join(projectDir, 'sprites', `${name}.json`);
  await saveAssetFile(filePath, asset.toJSON());
  workspace.project.registerAsset(name, {
    path: path.relative(path.dirname(workspace.project.path), filePath),
    type: 'sprite',
  });

  // Load into workspace
  workspace.loadedAssets.set(name, asset);

  return okWithAssetLink({ message: `Asset '${name}' created.`, path: filePath }, name);
}

function handleRename(
  workspace: Workspace,
  assetName: string | undefined,
  newName: string | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (!newName) return errors.invalidArgument('asset rename requires "name" (new name).');
  if (!workspace.project) return errors.noProjectLoaded();

  const project = workspace.project;
  const oldName = assetName as string;

  try {
    // Compute file paths
    const info = project.info();
    const entry = info.assets[oldName];
    const projectDir = path.dirname(project.path);
    const oldFilePath = entry.path ? path.resolve(projectDir, entry.path) : null;
    const newFilePath = oldFilePath
      ? path.join(path.dirname(oldFilePath), `${newName}.json`)
      : null;

    const cmd = new RenameCommand(
      project,
      oldName,
      newName,
      () => {
        asset.name = newName;
        project.renameAsset(oldName, newName);
        workspace.loadedAssets.delete(oldName);
        workspace.loadedAssets.set(newName, asset);
        if (oldFilePath && newFilePath) {
          fs.renameSync(oldFilePath, newFilePath);
          // Update registry path
          const newRelPath = path.relative(projectDir, newFilePath);
          const updatedInfo = project.info();
          const entryForNew = updatedInfo.assets[newName];
          project.removeAsset(newName);
          project.registerAsset(newName, { ...entryForNew, path: newRelPath });
        }
      },
      () => {
        asset.name = oldName;
        project.renameAsset(newName, oldName);
        workspace.loadedAssets.delete(newName);
        workspace.loadedAssets.set(oldName, asset);
        if (oldFilePath && newFilePath) {
          fs.renameSync(newFilePath, oldFilePath);
          const newRelPath = path.relative(projectDir, oldFilePath);
          const updatedInfo = project.info();
          const entryForOld = updatedInfo.assets[oldName];
          project.removeAsset(oldName);
          project.registerAsset(oldName, { ...entryForOld, path: newRelPath });
        }
      },
    );
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Asset renamed from '${oldName}' to '${newName}'.` });
}

async function handleDuplicate(
  workspace: Workspace,
  assetName: string | undefined,
  newName: string | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (!newName) return errors.invalidArgument('asset duplicate requires "name" (new name).');
  if (!workspace.project) return errors.noProjectLoaded();

  const project = workspace.project;
  const info = project.info();
  const entry = info.assets[assetName as string];
  const projectDir = path.dirname(project.path);

  // Clone asset data
  const clonedData = JSON.parse(JSON.stringify(asset.toJSON())) as Asset;
  clonedData.name = newName;

  const newAsset = AssetClass.fromJSON(clonedData);
  const oldFilePath = entry.path ? path.resolve(projectDir, entry.path) : null;
  const newFilePath = oldFilePath
    ? path.join(path.dirname(oldFilePath), `${newName}.json`)
    : path.join(projectDir, `${newName}.json`);
  const newRelPath = path.relative(projectDir, newFilePath);

  await saveAssetFile(newFilePath, newAsset.toJSON());
  project.registerAsset(newName, { type: entry.type, path: newRelPath });
  workspace.loadedAssets.set(newName, newAsset);

  return ok({
    message: `Asset '${assetName as string}' duplicated as '${newName}'.`,
    path: newFilePath,
  });
}

async function handleCreateRecolor(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (!args.name) return errors.invalidArgument('asset create_recolor requires "name".');
  if (!workspace.project) return errors.noProjectLoaded();

  const project = workspace.project;
  const sourceName = args.asset_name as string;
  const newName = args.name as string;

  if (
    !args.palette_file &&
    !args.palette_slug &&
    !(Array.isArray(args.palette_entries) && args.palette_entries.length > 0)
  ) {
    return errors.noRecolorPaletteSource();
  }

  // Clone asset
  const clonedData = JSON.parse(JSON.stringify(asset.toJSON())) as Asset;
  clonedData.name = newName;
  const newAsset = AssetClass.fromJSON(clonedData);

  // Apply palette sources in order: file → slug → entries
  if (args.palette_file) {
    const projectDir = path.dirname(project.path);
    const palPath = path.resolve(projectDir, args.palette_file as string);
    try {
      const palData = await loadPaletteFile(palPath);
      for (let i = 0; i < palData.colors.length && i < 256; i++) {
        const c = palData.colors[i];
        if (c) newAsset.palette.set(i, c);
      }
    } catch {
      return errors.paletteFileNotFound(palPath);
    }
  }

  if (args.palette_slug) {
    try {
      const response = await fetch(
        `https://lospec.com/palette-list/${args.palette_slug as string}.json`,
      );
      if (response.ok) {
        const ldata = (await response.json()) as { colors: string[] };
        newAsset.palette.set(0, [0, 0, 0, 0] as Color);
        for (let i = 0; i < ldata.colors.length && i < 255; i++) {
          const hex = ldata.colors[i];
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          newAsset.palette.set(i + 1, [r, g, b, 255] as Color);
        }
      }
    } catch {
      /* ignore lospec errors for layered sources */
    }
  }

  if (args.palette_entries && Array.isArray(args.palette_entries)) {
    for (const e of args.palette_entries as Array<{ index: number; rgba: number[] }>) {
      newAsset.palette.set(e.index, e.rgba as unknown as Color);
    }
  }

  // Save, register, load
  const info = project.info();
  const entry = info.assets[sourceName];
  const projectDir = path.dirname(project.path);
  const srcPath = entry.path ? path.resolve(projectDir, entry.path) : null;
  const newFilePath = srcPath
    ? path.join(path.dirname(srcPath), `${newName}.json`)
    : path.join(projectDir, `${newName}.json`);
  const newRelPath = path.relative(projectDir, newFilePath);

  await saveAssetFile(newFilePath, newAsset.toJSON());
  project.registerAsset(newName, { type: entry.type, path: newRelPath, recolor_of: sourceName });
  workspace.loadedAssets.set(newName, newAsset);

  return ok({ message: `Recolor '${newName}' created from '${sourceName}'.`, path: newFilePath });
}

function handleDelete(
  workspace: Workspace,
  assetName: string | undefined,
  deleteFile: boolean | undefined,
) {
  if (!assetName) return errors.invalidArgument('asset delete requires "asset_name".');
  if (!workspace.project) return errors.noProjectLoaded();

  const project = workspace.project;
  const info = project.info();
  if (!(assetName in info.assets)) return errors.assetNotInRegistry(assetName);

  const entry = info.assets[assetName];
  const cmd = new AssetDeleteCommand(project, assetName, () => {
    workspace.loadedAssets.delete(assetName);
    project.removeAsset(assetName);
    if (deleteFile && entry.path) {
      const projectDir = path.dirname(project.path);
      const filePath = path.resolve(projectDir, entry.path);
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  });
  workspace.pushCommand(cmd);

  return ok({ message: `Asset '${assetName}' deleted.`, file_deleted: deleteFile ?? false });
}

// ---------------------------------------------------------------------------
// Structural actions
// ---------------------------------------------------------------------------

function handleResize(
  workspace: Workspace,
  assetName: string | undefined,
  width: number | undefined,
  height: number | undefined,
  anchor: Anchor | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (!width || !height)
    return errors.invalidArgument('asset resize requires "width" and "height".');

  try {
    const cmd = new ResizeCommand(asset, () => {
      asset.resize(width, height, anchor ?? 'top_left');
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink(
    { message: `Asset '${assetName as string}' resized to ${String(width)}x${String(height)}.` },
    assetName as string,
  );
}

function handleAddLayer(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (!args.name) return errors.invalidArgument('asset add_layer requires "name".');
  if (!args.layer_type) return errors.invalidArgument('asset add_layer requires "layer_type".');

  let newId: number = -1;
  try {
    const cmd = new LayerCommand(asset, () => {
      newId = asset.addLayer(
        {
          name: args.name as string,
          type: args.layer_type as 'image' | 'tilemap' | 'shape',
          opacity: 255,
          visible: true,
          role: args.layer_role as string | undefined,
          physics_layer: args.layer_physics_layer as number | undefined,
        },
        args.parent_layer_id as number | undefined,
        args.position as number | undefined,
      );
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink(
    { message: `Layer '${args.name as string}' added.`, layer_id: newId },
    args.asset_name as string,
  );
}

function handleAddGroup(
  workspace: Workspace,
  assetName: string | undefined,
  name: string | undefined,
  parentId: number | undefined,
  index: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (!name) return errors.invalidArgument('asset add_group requires "name".');

  let newId: number = -1;
  try {
    const cmd = new LayerCommand(asset, () => {
      newId = asset.addGroup(name, parentId, index);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Group '${name}' added.`, layer_id: newId });
}

function handleRemoveLayer(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined)
    return errors.invalidArgument('asset remove_layer requires "layer_id".');

  try {
    const cmd = new LayerCommand(asset, () => {
      asset.removeLayer(layerId);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink({ message: `Layer ${String(layerId)} removed.` }, assetName as string);
}

function handleReorderLayer(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  parentId: number | undefined,
  position: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined)
    return errors.invalidArgument('asset reorder_layer requires "layer_id".');
  if (position === undefined)
    return errors.invalidArgument('asset reorder_layer requires "position".');

  try {
    const cmd = new LayerCommand(asset, () => {
      asset.reorderLayer(layerId, parentId, position);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Layer ${String(layerId)} reordered.` });
}

function handleAddFrame(
  workspace: Workspace,
  assetName: string | undefined,
  frameIndex: number | undefined,
  durationMs: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const duration = durationMs ?? 100;
  let insertedAt: number = -1;
  try {
    const cmd = new FrameCommand(asset, () => {
      insertedAt = asset.addFrame(
        { index: frameIndex ?? asset.frames.length, duration_ms: duration } as Frame,
        frameIndex,
      );
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink(
    { message: `Frame added at index ${String(insertedAt)}.`, frame_index: insertedAt },
    assetName as string,
  );
}

function handleRemoveFrame(
  workspace: Workspace,
  assetName: string | undefined,
  frameIndex: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (frameIndex === undefined)
    return errors.invalidArgument('asset remove_frame requires "frame_index".');

  try {
    const cmd = new FrameCommand(asset, () => {
      asset.removeFrame(frameIndex);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink({ message: `Frame ${String(frameIndex)} removed.` }, assetName as string);
}

function handleSetFrameDuration(
  workspace: Workspace,
  assetName: string | undefined,
  frameIndex: number | undefined,
  durationMs: number | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (frameIndex === undefined)
    return errors.invalidArgument('asset set_frame_duration requires "frame_index".');
  if (durationMs === undefined)
    return errors.invalidArgument('asset set_frame_duration requires "duration_ms".');

  try {
    const cmd = new FrameCommand(asset, () => {
      asset.setFrameDuration(frameIndex, durationMs);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Frame ${String(frameIndex)} duration set to ${String(durationMs)}ms.` });
}

function handleAddTag(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (!args.name) return errors.invalidArgument('asset add_tag requires "name".');
  if (!args.tag_type) return errors.invalidArgument('asset add_tag requires "tag_type".');

  try {
    let tag: Tag;
    if (args.tag_type === 'frame') {
      if (args.tag_start === undefined || args.tag_end === undefined) {
        return errors.invalidArgument('Frame tag requires "tag_start" and "tag_end".');
      }
      tag = {
        name: args.name as string,
        type: 'frame',
        start: args.tag_start as number,
        end: args.tag_end as number,
        direction: (args.tag_direction ?? 'forward') as 'forward' | 'reverse' | 'ping_pong',
        facing: args.tag_facing as Facing | undefined,
      };
    } else {
      if (!args.tag_layers || !Array.isArray(args.tag_layers)) {
        return errors.invalidArgument('Layer tag requires "tag_layers".');
      }
      tag = {
        name: args.name as string,
        type: 'layer',
        layers: args.tag_layers as number[],
      };
    }

    const cmd = new TagCommand(asset, () => {
      asset.addTag(tag);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Tag '${args.name as string}' added.` });
}

function handleRemoveTag(
  workspace: Workspace,
  assetName: string | undefined,
  name: string | undefined,
  facing: Facing | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (!name) return errors.invalidArgument('asset remove_tag requires "name".');

  try {
    const cmd = new TagCommand(asset, () => {
      asset.removeTag(name, facing);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Tag '${name}' removed.` });
}

// ---------------------------------------------------------------------------
// Shape actions
// ---------------------------------------------------------------------------

function handleAddShape(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (args.layer_id === undefined)
    return errors.invalidArgument('asset add_shape requires "layer_id".');
  if (args.frame_index === undefined)
    return errors.invalidArgument('asset add_shape requires "frame_index".');
  if (!args.shape_name) return errors.invalidArgument('asset add_shape requires "shape_name".');
  if (!args.shape_type) return errors.invalidArgument('asset add_shape requires "shape_type".');

  let shape: Shape;
  if (args.shape_type === 'rect') {
    shape = {
      name: args.shape_name as string,
      type: 'rect',
      x: (args.shape_x ?? 0) as number,
      y: (args.shape_y ?? 0) as number,
      width: (args.shape_width ?? 1) as number,
      height: (args.shape_height ?? 1) as number,
    };
  } else {
    if (!args.shape_points) return errors.invalidArgument('Polygon shape requires "shape_points".');
    shape = {
      name: args.shape_name as string,
      type: 'polygon',
      points: args.shape_points as [number, number][],
    };
  }

  const lid = args.layer_id as number;
  const fi = args.frame_index as number;
  try {
    const cmd = new ShapeCommand(asset, lid, fi, () => {
      asset.addShape(lid, fi, shape);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Shape '${args.shape_name as string}' added.` });
}

function handleUpdateShape(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (args.layer_id === undefined)
    return errors.invalidArgument('asset update_shape requires "layer_id".');
  if (args.frame_index === undefined)
    return errors.invalidArgument('asset update_shape requires "frame_index".');
  if (!args.shape_name) return errors.invalidArgument('asset update_shape requires "shape_name".');

  let shape: Shape;
  if (args.shape_type === 'rect') {
    shape = {
      name: args.shape_name as string,
      type: 'rect',
      x: (args.shape_x ?? 0) as number,
      y: (args.shape_y ?? 0) as number,
      width: (args.shape_width ?? 1) as number,
      height: (args.shape_height ?? 1) as number,
    };
  } else {
    if (!args.shape_points) return errors.invalidArgument('Polygon shape requires "shape_points".');
    shape = {
      name: args.shape_name as string,
      type: 'polygon',
      points: args.shape_points as [number, number][],
    };
  }

  const lid = args.layer_id as number;
  const fi = args.frame_index as number;
  try {
    const cmd = new ShapeCommand(asset, lid, fi, () => {
      asset.updateShape(lid, fi, args.shape_name as string, shape);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Shape '${args.shape_name as string}' updated.` });
}

function handleRemoveShape(
  workspace: Workspace,
  assetName: string | undefined,
  layerId: number | undefined,
  frameIndex: number | undefined,
  shapeName: string | undefined,
) {
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;
  if (layerId === undefined)
    return errors.invalidArgument('asset remove_shape requires "layer_id".');
  if (frameIndex === undefined)
    return errors.invalidArgument('asset remove_shape requires "frame_index".');
  if (!shapeName) return errors.invalidArgument('asset remove_shape requires "shape_name".');

  try {
    const cmd = new ShapeCommand(asset, layerId, frameIndex, () => {
      asset.removeShape(layerId, frameIndex, shapeName);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({ message: `Shape '${shapeName}' removed.` });
}

function handleGenerateCollisionPolygon(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;
  if (args.layer_id === undefined)
    return errors.invalidArgument('generate_collision_polygon requires "layer_id".');
  if (args.frame_index === undefined)
    return errors.invalidArgument('generate_collision_polygon requires "frame_index".');

  const sourceLayerId = args.layer_id as number;
  const frameIndex = args.frame_index as number;
  const eps = (args.epsilon ?? 1.0) as number;
  const shapeName = (args.shape_name ?? 'collision') as string;

  // Get source pixel data
  const cel = asset.getCel(sourceLayerId, frameIndex);
  if (!cel || !('data' in cel)) return errors.domainError('No pixel data at source layer/frame.');

  const data = cel.data;
  const w = data[0]?.length ?? 0;
  const h = data.length;

  // Determine target shape layer
  let targetLayerId = args.target_layer_id as number | undefined;
  if (targetLayerId === undefined) {
    // Find first shape layer with role "hitbox"
    const shapeLayers = asset.layers.filter((l) => l.type === 'shape');
    const hitbox = shapeLayers.find((l) => 'role' in l && l.role === 'hitbox');
    if (hitbox) {
      targetLayerId = hitbox.id;
    } else if (shapeLayers.length > 0) {
      targetLayerId = shapeLayers[0].id;
    } else {
      return errors.invalidArgument(
        'No shape layer found. Provide "target_layer_id" or add a shape layer.',
      );
    }
  }

  // Trace contours
  const isSolid = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    return data[y][x] !== 0;
  };

  const contours = marchingSquares(w, h, isSolid);
  if (contours.length === 0) return ok({ message: 'No solid pixels found.', vertices: [] });

  // Take the largest contour
  let largest = contours[0];
  for (const c of contours) {
    if (c.length > largest.length) largest = c;
  }

  // Simplify: orthogonal first, then RDP
  const simplified = simplifyOrthogonal(largest);
  const xyPoints = simplified.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));
  const rdpResult = simplifyPolygon(xyPoints, eps);

  // Convert {x,y} objects to [x,y] tuples for Shape type
  const tuplePoints = rdpResult.map(
    (p: { x: number; y: number }) => [p.x, p.y] as [number, number],
  );

  // Write as shape
  const shape: Shape = { name: shapeName, type: 'polygon', points: tuplePoints };
  try {
    const cmd = new ShapeCommand(asset, targetLayerId, frameIndex, () => {
      asset.addShape(targetLayerId, frameIndex, shape);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return ok({
    message: `Collision polygon '${shapeName}' generated.`,
    vertices: tuplePoints.length,
    target_layer_id: targetLayerId,
  });
}

// ---------------------------------------------------------------------------
// set_nine_slice
// ---------------------------------------------------------------------------

function handleSetNineSlice(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;

  const top = args.nine_slice_top as number | undefined;
  const right = args.nine_slice_right as number | undefined;
  const bottom = args.nine_slice_bottom as number | undefined;
  const left = args.nine_slice_left as number | undefined;

  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return errors.invalidArgument(
      'set_nine_slice requires at least one margin param (nine_slice_top, nine_slice_right, nine_slice_bottom, nine_slice_left).',
    );
  }

  // Merge with existing nine_slice, defaulting unspecified margins to 0
  const existing = asset.nine_slice;
  const newTop = top ?? existing?.top ?? 0;
  const newRight = right ?? existing?.right ?? 0;
  const newBottom = bottom ?? existing?.bottom ?? 0;
  const newLeft = left ?? existing?.left ?? 0;

  if (newTop + newBottom >= asset.height) {
    return errors.invalidArgument(
      `nine_slice top+bottom (${String(newTop)}+${String(newBottom)}=${String(newTop + newBottom)}) must be less than asset height (${String(asset.height)}).`,
    );
  }
  if (newLeft + newRight >= asset.width) {
    return errors.invalidArgument(
      `nine_slice left+right (${String(newLeft)}+${String(newRight)}=${String(newLeft + newRight)}) must be less than asset width (${String(asset.width)}).`,
    );
  }

  const nineSlice: NineSlice = { top: newTop, right: newRight, bottom: newBottom, left: newLeft };
  const cmd = new NineSliceCommand(asset, () => {
    asset.nine_slice = nineSlice;
  });
  workspace.pushCommand(cmd);

  return ok({
    message: `Nine-slice set on '${asset.name}'.`,
    nine_slice: nineSlice,
  });
}

// ---------------------------------------------------------------------------
// link_cel
// ---------------------------------------------------------------------------

function handleLinkCel(workspace: Workspace, args: Record<string, unknown>) {
  const asset = requireAsset(workspace, args.asset_name as string | undefined);
  if (isError(asset)) return asset;

  const layerId = args.layer_id as number | undefined;
  const frameIndex = args.frame_index as number | undefined;
  const sourceLayerId = args.source_layer_id as number | undefined;
  const sourceFrameIndex = args.source_frame_index as number | undefined;

  if (layerId === undefined) return errors.invalidArgument('link_cel requires "layer_id".');
  if (frameIndex === undefined) return errors.invalidArgument('link_cel requires "frame_index".');
  if (sourceLayerId === undefined)
    return errors.invalidArgument('link_cel requires "source_layer_id".');
  if (sourceFrameIndex === undefined)
    return errors.invalidArgument('link_cel requires "source_frame_index".');

  // Validate target layer exists
  const targetLayer = asset.getLayer(layerId);
  if (!targetLayer) return errors.layerNotFound(layerId, asset.name);

  // Validate source layer exists
  const sourceLayer = asset.getLayer(sourceLayerId);
  if (!sourceLayer) return errors.layerNotFound(sourceLayerId, asset.name);

  // Reject self-link
  if (layerId === sourceLayerId && frameIndex === sourceFrameIndex) {
    return errors.linkCelSelf();
  }

  // Validate source cel exists (raw check, NOT resolved through getCel)
  const sourceKey = packCelKey(sourceLayerId, sourceFrameIndex);
  const rawCels = asset.cels;
  const sourceCel = rawCels[sourceKey] as Cel | undefined;
  if (sourceCel === undefined) {
    return errors.linkCelSourceNotFound(sourceLayerId, sourceFrameIndex, asset.name);
  }

  // Validate source and target layers have the same type
  if (sourceLayer.type !== targetLayer.type) {
    return errors.linkCelLayerTypeMismatch(sourceLayerId, layerId);
  }

  const cmd = new LinkCelCommand(asset, layerId, frameIndex, sourceLayerId, sourceFrameIndex);
  workspace.pushCommand(cmd);

  return ok({
    message: `Linked cel at layer ${String(layerId)}/frame ${String(frameIndex)} → layer ${String(sourceLayerId)}/frame ${String(sourceFrameIndex)}.`,
  });
}

// ---------------------------------------------------------------------------
// interpolate_frames
// ---------------------------------------------------------------------------

function handleInterpolateFrames(workspace: Workspace, args: Record<string, unknown>) {
  const assetName = args.asset_name as string | undefined;
  const asset = requireAsset(workspace, assetName);
  if (isError(asset)) return asset;

  const frameStart = args.frame_start as number | undefined;
  const frameEnd = args.frame_end as number | undefined;
  const count = args.count as number | undefined;

  if (frameStart === undefined)
    return errors.invalidArgument('interpolate_frames requires "frame_start".');
  if (frameEnd === undefined)
    return errors.invalidArgument('interpolate_frames requires "frame_end".');
  if (count === undefined || count < 1)
    return errors.invalidArgument('interpolate_frames requires "count" >= 1.');
  if (frameStart < 0 || frameStart >= asset.frames.length)
    return errors.frameOutOfRange(frameStart, asset.name, asset.frames.length);
  if (frameEnd < 0 || frameEnd >= asset.frames.length)
    return errors.frameOutOfRange(frameEnd, asset.name, asset.frames.length);
  if (frameStart >= frameEnd)
    return errors.invalidArgument('interpolate_frames requires frame_start < frame_end.');

  const duration = asset.frames[frameStart].duration_ms;
  const w = asset.width;
  const h = asset.height;

  // Helper to expand an ImageCel to full canvas grid
  function expandCelToCanvas(cel: { x: number; y: number; data: number[][] }): number[][] {
    const grid: number[][] = Array.from({ length: h }, () => new Array<number>(w).fill(0));
    for (let r = 0; r < cel.data.length; r++) {
      for (let c = 0; c < cel.data[r].length; c++) {
        const gy = cel.y + r;
        const gx = cel.x + c;
        if (gy >= 0 && gy < h && gx >= 0 && gx < w) {
          grid[gy][gx] = cel.data[r][c];
        }
      }
    }
    return grid;
  }

  // Pre-compute interpolated data for all image layers BEFORE mutating
  const layerInterpolations: Array<{ layerId: number; frames: number[][][] }> = [];

  for (const layer of asset.layers) {
    if (layer.type !== 'image') continue;

    // Check raw cel to distinguish LinkedCel from missing
    const rawCels = asset.cels;
    const rawCelA = rawCels[packCelKey(layer.id, frameStart)] as Cel | undefined;
    const rawCelB = rawCels[packCelKey(layer.id, frameEnd)] as Cel | undefined;

    // If raw cel is a LinkedCel and resolution fails, error
    if (rawCelA !== undefined && 'link' in rawCelA) {
      const resolved = asset.getCel(layer.id, frameStart);
      if (resolved === undefined) {
        return errors.domainError(
          `LinkedCel resolution failed for layer ${String(layer.id)} at frame ${String(frameStart)}.`,
        );
      }
    }
    if (rawCelB !== undefined && 'link' in rawCelB) {
      const resolved = asset.getCel(layer.id, frameEnd);
      if (resolved === undefined) {
        return errors.domainError(
          `LinkedCel resolution failed for layer ${String(layer.id)} at frame ${String(frameEnd)}.`,
        );
      }
    }

    // Resolve cels (getCel auto-resolves LinkedCels)
    const celA = asset.getCel(layer.id, frameStart);
    const celB = asset.getCel(layer.id, frameEnd);

    // If resolved cel exists but is not an ImageCel, error
    if (celA !== undefined && !('data' in celA)) {
      return errors.domainError(
        `Cel at layer ${String(layer.id)}/frame ${String(frameStart)} is not an ImageCel.`,
      );
    }
    if (celB !== undefined && !('data' in celB)) {
      return errors.domainError(
        `Cel at layer ${String(layer.id)}/frame ${String(frameEnd)} is not an ImageCel.`,
      );
    }

    // Expand to full canvas (missing cel = all transparent)
    const gridA =
      celA !== undefined && 'data' in celA
        ? expandCelToCanvas(celA)
        : Array.from({ length: h }, () => new Array<number>(w).fill(0));
    const gridB =
      celB !== undefined && 'data' in celB
        ? expandCelToCanvas(celB)
        : Array.from({ length: h }, () => new Array<number>(w).fill(0));

    const interpolated = interpolateFrames(gridA, gridB, count);
    layerInterpolations.push({ layerId: layer.id, frames: interpolated });
  }

  // Wrap the mutation in a single FrameCommand for atomic undo/redo
  try {
    const cmd = new FrameCommand(asset, () => {
      // Insert count new frames at frame_start + 1
      for (let i = 0; i < count; i++) {
        asset.addFrame(
          { index: frameStart + 1 + i, duration_ms: duration } as Frame,
          frameStart + 1 + i,
        );
      }
      // Set interpolated cels for each image layer
      for (const { layerId, frames } of layerInterpolations) {
        for (let i = 0; i < frames.length; i++) {
          asset.setCel(layerId, frameStart + 1 + i, {
            x: 0,
            y: 0,
            data: frames[i],
          });
        }
      }
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return okWithAssetLink(
    {
      message: `Inserted ${String(count)} interpolated frame(s) between frames ${String(frameStart)} and ${String(frameEnd + count)}.`,
      frame_start: frameStart,
      frame_end: frameEnd + count,
      count,
    },
    assetName as string,
  );
}
