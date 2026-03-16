import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import { PaletteCommand } from '../commands/palette-command.js';
import { AssetMetadataCommand } from '../commands/asset-metadata-command.js';
import { loadPaletteFile, savePaletteFile } from '../io/palette-io.js';
import * as errors from '../errors.js';
import * as path from 'node:path';
import { type Color } from '../types/palette.js';
import { type ColorCycleEntry } from '../types/asset.js';
import { createResourceLink } from '../utils/resource-link.js';

/**
 * Zod input schema for the `palette` tool.
 */
const paletteInputSchema = {
  action: z
    .enum([
      'info',
      'set',
      'set_bulk',
      'swap',
      'generate_ramp',
      'load',
      'save',
      'fetch_lospec',
      'set_color_cycling',
    ])
    .describe('Palette action to perform'),
  asset_name: z.string().optional().describe('Target asset name'),
  index: z.number().int().optional().describe('Palette index (0-255) for set/swap'),
  index2: z.number().int().optional().describe('Second palette index for swap'),
  rgba: z.array(z.number().int()).optional().describe('RGBA color [r, g, b, a], each 0-255'),
  entries: z
    .array(
      z.object({
        index: z.number().int(),
        rgba: z.array(z.number().int()),
      }),
    )
    .optional()
    .describe('Array of {index, rgba} for set_bulk'),
  color1: z.number().int().optional().describe('Start palette index for generate_ramp'),
  color2: z.number().int().optional().describe('End palette index for generate_ramp'),
  hue_shift_start: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe('Hue rotation degrees (-360 to +360) for start color in generate_ramp'),
  hue_shift_end: z
    .number()
    .min(-360)
    .max(360)
    .optional()
    .describe('Hue rotation degrees (-360 to +360) for end color in generate_ramp'),
  name: z.string().optional().describe('Palette name for save, or Lospec slug for fetch_lospec'),
  path: z.string().optional().describe('File path for load/save (relative to pixelmcp.json)'),
  color_cycling: z
    .array(
      z.object({
        start_index: z.number().int().min(0).max(255),
        end_index: z.number().int().min(0).max(255),
        speed_ms: z.number().min(1),
        direction: z.enum(['forward', 'reverse', 'ping_pong']),
      }),
    )
    .optional()
    .describe('Color cycling entries for set_color_cycling'),
};

/**
 * Registers the `palette` tool on the MCP server.
 */
export function registerPaletteTool(server: McpServer): void {
  server.registerTool(
    'palette',
    {
      title: 'Palette',
      description:
        'Query and manage the indexed color palette. Actions: info, set, set_bulk, swap, generate_ramp, load, save, fetch_lospec, set_color_cycling.',
      inputSchema: paletteInputSchema,
    },
    async (args) => {
      const workspace = getWorkspace();

      // All palette actions require an asset_name
      if (!args.asset_name) {
        return errors.invalidArgument('palette requires "asset_name".');
      }

      const asset = workspace.loadedAssets.get(args.asset_name);
      if (!asset) {
        return errors.assetNotLoaded(args.asset_name);
      }

      switch (args.action) {
        case 'info':
          return handleInfo(asset);
        case 'set':
          return handleSet(workspace, asset, args.index, args.rgba);
        case 'set_bulk':
          return handleSetBulk(
            workspace,
            asset,
            args.entries as Array<{ index: number; rgba: number[] }> | undefined,
          );
        case 'swap':
          return handleSwap(workspace, asset, args.index, args.index2);
        case 'generate_ramp':
          return handleGenerateRamp(
            workspace,
            asset,
            args.color1,
            args.color2,
            args.hue_shift_start,
            args.hue_shift_end,
          );
        case 'load':
          return handleLoad(workspace, asset, args.path);
        case 'save':
          return handleSave(workspace, asset, args.path, args.name);
        case 'fetch_lospec':
          return handleFetchLospec(workspace, asset, args.name);
        case 'set_color_cycling':
          return handleSetColorCycling(
            workspace,
            asset,
            args.color_cycling as ColorCycleEntry[] | undefined,
          );
        default:
          return errors.invalidArgument(`Unknown palette action: ${String(args.action)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Workspace = ReturnType<typeof getWorkspace>;
type Asset = NonNullable<ReturnType<Workspace['loadedAssets']['get']>>;

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handleInfo(asset: Asset) {
  const palette = asset.palette.toJSON();
  const usageCounts = asset.paletteUsageCounts();

  // Build a compact representation: entries with non-transparent colors or actual pixel usage
  const entries: Array<{ index: number; rgba: [number, number, number, number]; usage: number }> =
    [];
  for (let i = 0; i < 256; i++) {
    const c = palette[i];
    const usage = usageCounts[i];
    if (c && (c[0] !== 0 || c[1] !== 0 || c[2] !== 0 || c[3] !== 0 || usage > 0)) {
      entries.push({ index: i, rgba: c as [number, number, number, number], usage });
    }
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ entries, total_defined: entries.length }),
      },
    ],
  };
}

function handleSet(
  workspace: Workspace,
  asset: Asset,
  index: number | undefined,
  rgba: number[] | undefined,
) {
  if (index === undefined) {
    return errors.invalidArgument('palette set requires "index".');
  }
  if (!rgba || rgba.length !== 4) {
    return errors.invalidArgument('palette set requires "rgba" as [r, g, b, a].');
  }

  const color = rgba as unknown as Color;
  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.set(index, color);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ message: `Palette index ${String(index)} set.` }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}

function handleSetBulk(
  workspace: Workspace,
  asset: Asset,
  entries: Array<{ index: number; rgba: number[] }> | undefined,
) {
  if (!entries || entries.length === 0) {
    return errors.invalidArgument('palette set_bulk requires "entries" array.');
  }

  const bulkEntries: Array<[number, Color]> = entries.map((e) => [
    e.index,
    e.rgba as unknown as Color,
  ]);
  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.setBulk(bulkEntries);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ message: `${String(entries.length)} palette entries set.` }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}

function handleSwap(
  workspace: Workspace,
  asset: Asset,
  index: number | undefined,
  index2: number | undefined,
) {
  if (index === undefined || index2 === undefined) {
    return errors.invalidArgument('palette swap requires "index" and "index2".');
  }

  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.swap(index, index2);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Swapped palette indices ${String(index)} and ${String(index2)}.`,
        }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}

function handleGenerateRamp(
  workspace: Workspace,
  asset: Asset,
  color1: number | undefined,
  color2: number | undefined,
  hueShiftStart: number | undefined,
  hueShiftEnd: number | undefined,
) {
  if (color1 === undefined || color2 === undefined) {
    return errors.invalidArgument('palette generate_ramp requires "color1" and "color2".');
  }

  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.generateRamp(color1, color2, hueShiftStart, hueShiftEnd);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  const hueShifted = hueShiftStart !== undefined || hueShiftEnd !== undefined;
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Ramp generated from index ${String(color1)} to ${String(color2)}${hueShifted ? ' (hue-shifted)' : ''}.`,
        }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}

async function handleLoad(workspace: Workspace, asset: Asset, filePath: string | undefined) {
  if (!filePath) {
    return errors.invalidArgument('palette load requires "path".');
  }
  if (!workspace.project) {
    return errors.noProjectLoaded();
  }

  // Resolve relative to pixelmcp.json
  const projectDir = path.dirname(workspace.project.path);
  const resolvedPath = path.resolve(projectDir, filePath);

  let paletteData;
  try {
    paletteData = await loadPaletteFile(resolvedPath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) {
      return errors.paletteFileNotFound(resolvedPath);
    }
    if (msg.includes('format') || msg.includes('Format')) {
      return errors.invalidPaletteFile(resolvedPath);
    }
    return errors.domainError(msg);
  }

  // Apply palette entries via command
  const bulkEntries: Array<[number, Color]> = [];
  for (let i = 0; i < paletteData.colors.length && i < 256; i++) {
    const c = paletteData.colors[i];
    if (c) {
      bulkEntries.push([i, c]);
    }
  }

  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.setBulk(bulkEntries);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Palette loaded from '${filePath}' (${String(bulkEntries.length)} colors).`,
          name: paletteData.name,
        }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}

async function handleSave(
  workspace: Workspace,
  asset: Asset,
  filePath: string | undefined,
  paletteName: string | undefined,
) {
  if (!filePath) {
    return errors.invalidArgument('palette save requires "path".');
  }
  if (!workspace.project) {
    return errors.noProjectLoaded();
  }

  const projectDir = path.dirname(workspace.project.path);
  const resolvedPath = path.resolve(projectDir, filePath);
  const name = paletteName ?? path.basename(filePath, '.json');

  try {
    await savePaletteFile(resolvedPath, name, asset.palette.toJSON());
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ message: `Palette saved to '${filePath}'.`, path: resolvedPath }),
      },
    ],
  };
}

function handleSetColorCycling(
  workspace: Workspace,
  asset: Asset,
  entries: ColorCycleEntry[] | undefined,
) {
  // Validate entries
  if (entries !== undefined) {
    for (const entry of entries) {
      if (entry.start_index >= entry.end_index) {
        return errors.invalidArgument(
          `Color cycling: start_index (${String(entry.start_index)}) must be less than end_index (${String(entry.end_index)}).`,
        );
      }
    }
  }

  try {
    const cmd = new AssetMetadataCommand(asset, () => {
      asset.color_cycling = entries && entries.length > 0 ? entries : undefined;
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  const message =
    entries && entries.length > 0
      ? `Color cycling set with ${String(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'}.`
      : 'Color cycling cleared.';

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ message }),
      },
    ],
  };
}

async function handleFetchLospec(workspace: Workspace, asset: Asset, slug: string | undefined) {
  if (!slug) {
    return errors.invalidArgument('palette fetch_lospec requires "name" (Lospec slug).');
  }

  let data;
  try {
    const response = await fetch(`https://lospec.com/palette-list/${slug}.json`);
    if (!response.ok) {
      return errors.lospecNotFound(slug);
    }
    data = (await response.json()) as { name: string; colors: string[] };
  } catch {
    return errors.lospecNotFound(slug);
  }

  if (!Array.isArray(data.colors)) {
    return errors.lospecNotFound(slug);
  }

  // Parse hex strings to RGBA: Lospec returns hex without '#', no alpha
  const bulkEntries: Array<[number, Color]> = [];
  // Index 0 is typically reserved for transparency
  bulkEntries.push([0, [0, 0, 0, 0] as Color]);
  for (let i = 0; i < data.colors.length && i < 255; i++) {
    const hex = data.colors[i];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    bulkEntries.push([i + 1, [r, g, b, 255] as Color]);
  }

  try {
    const cmd = new PaletteCommand(asset.palette, () => {
      asset.palette.setBulk(bulkEntries);
    });
    workspace.pushCommand(cmd);
  } catch (e: unknown) {
    return errors.domainError(e instanceof Error ? e.message : String(e));
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Lospec palette '${data.name}' applied (${String(data.colors.length)} colors, index 0 reserved for transparency).`,
          palette_name: data.name,
          color_count: data.colors.length,
        }),
      },
      createResourceLink(asset.name, `pixel://view/palette/${asset.name}`),
    ],
  };
}
