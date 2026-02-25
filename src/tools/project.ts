import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectClass } from '../classes/project.js';
import { getWorkspace } from '../classes/workspace.js';
import { loadProjectFile, saveProjectFile } from '../io/project-io.js';
import { saveAssetFile } from '../io/asset-io.js';
import { quantize } from '../algorithms/quantize.js';
import * as errors from '../errors.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { PNG } from 'pngjs';

/**
 * Zod input schema for the `project` tool.
 *
 * Uses a flat shape with an `action` enum discriminator.
 * - `init`: path required (project directory)
 * - `open`: path required (pixelmcp.json file path)
 * - `info`: no additional args
 * - `add_file`: deferred to Phase 2.5.5
 */
const projectInputSchema = {
    action: z.enum(['init', 'open', 'info', 'add_file']).describe(
        'Action to perform: init (create new project), open (load existing), info (show current project), add_file (import external PNG)'
    ),
    path: z.string().optional().describe(
        'For init: project directory path. For open: path to pixelmcp.json'
    ),
    name: z.string().optional().describe(
        'Project name (used by init; defaults to directory name). For add_file: the logical asset registry name.'
    ),
    import_path: z.string().optional().describe(
        'For add_file: path to the PNG file to import (absolute or relative to cwd).'
    ),
    type: z.string().optional().describe(
        'For add_file: free-string asset type for the registry entry (e.g. "character", "tileset").'
    ),
};

/**
 * Registers the `project` tool on the MCP server.
 */
export function registerProjectTool(server: McpServer): void {
    server.registerTool(
        'project',
        {
            title: 'Project',
            description: 'Manage on-disk project configuration and asset registry. Actions: init, open, info.',
            inputSchema: projectInputSchema,
        },
        async (args) => {
            const workspace = getWorkspace();

            switch (args.action) {
                case 'init':
                    return handleInit(workspace, args.path, args.name);
                case 'open':
                    return handleOpen(workspace, args.path);
                case 'info':
                    return handleInfo(workspace);
                case 'add_file':
                    return handleAddFile(workspace, args.name, args.import_path, args.type);
                default:
                    return errors.invalidArgument(`Unknown project action: ${String(args.action)}`);
            }
        },
    );
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleInit(
    workspace: ReturnType<typeof getWorkspace>,
    dirPath: string | undefined,
    projectName: string | undefined,
) {
    if (!dirPath) {
        return errors.invalidArgument('project init requires a "path" (project directory).');
    }

    const resolvedDir = path.resolve(dirPath);
    const filePath = path.join(resolvedDir, 'pixelmcp.json');
    const name = projectName ?? path.basename(resolvedDir);

    const project = ProjectClass.create(filePath, name);
    await saveProjectFile(filePath, project.toJSON());
    workspace.setProject(project);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                message: `Project '${name}' initialized.`,
                path: filePath,
            }),
        }],
    };
}

async function handleOpen(
    workspace: ReturnType<typeof getWorkspace>,
    filePath: string | undefined,
) {
    if (!filePath) {
        return errors.invalidArgument('project open requires a "path" to pixelmcp.json.');
    }

    const resolvedPath = path.resolve(filePath);

    let data;
    try {
        data = await loadProjectFile(resolvedPath);
    } catch {
        return errors.projectFileNotFound(resolvedPath);
    }

    const project = ProjectClass.fromJSON(resolvedPath, data);
    workspace.setProject(project);

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                message: `Project '${project.name}' opened.`,
                path: resolvedPath,
                assets: Object.keys(data.assets).length,
            }),
        }],
    };
}

function handleInfo(workspace: ReturnType<typeof getWorkspace>) {
    if (!workspace.project) {
        return errors.noProjectLoaded();
    }

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify(workspace.project.info()),
        }],
    };
}

// ---------------------------------------------------------------------------
// add_file handler
// ---------------------------------------------------------------------------

async function handleAddFile(
    workspace: ReturnType<typeof getWorkspace>,
    assetName: string | undefined,
    importPath: string | undefined,
    assetType: string | undefined,
) {
    if (!workspace.project) {
        return errors.noProjectLoaded();
    }
    if (!assetName) {
        return errors.invalidArgument('project add_file requires a "name" (logical asset registry name).');
    }
    if (!importPath) {
        return errors.invalidArgument('project add_file requires an "import_path" (path to PNG file).');
    }

    const resolvedImport = path.resolve(importPath);

    // 1. Read the PNG file
    let buf: Buffer;
    try {
        buf = await fs.readFile(resolvedImport);
    } catch {
        return errors.domainError(`Cannot read PNG file: ${resolvedImport}`);
    }

    let png: { width: number; height: number; data: Buffer };
    try {
        png = PNG.sync.read(buf);
    } catch {
        return errors.domainError(`Failed to decode PNG: ${resolvedImport}`);
    }

    const { width, height, data: rawData } = png;

    // 2. Quantize RGBA pixels → indexed palette (max 256, index 0 = transparent)
    const result = quantize(rawData as unknown as number[], 256);

    // 3. Build full 256-entry RGBA palette array
    const palette: [number, number, number, number][] = Array.from(
        { length: 256 },
        () => [0, 0, 0, 0] as [number, number, number, number]
    );
    for (const [idx, hex] of result.palette.entries()) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const a = parseInt(hex.slice(7, 9), 16);
        palette[idx] = [r, g, b, a];
    }

    // 4. Reshape flat indices into 2D row-major array
    const celData: number[][] = [];
    for (let y = 0; y < height; y++) {
        const row: number[] = [];
        for (let x = 0; x < width; x++) {
            row.push(result.indices[y * width + x]);
        }
        celData.push(row);
    }

    // 5. Determine asset file path (same dir as source PNG)
    const projectDir = path.dirname(workspace.project.path);
    const assetFilePath = path.join(path.dirname(resolvedImport), `${assetName}.json`);
    const assetRelPath = path.relative(projectDir, assetFilePath);

    // 6. Build Asset data
    const asset = {
        name: assetName,
        width,
        height,
        perspective: 'flat' as const,
        palette,
        layers: [{ id: 1, name: 'Layer 1', type: 'image' as const, opacity: 255, visible: true }],
        frames: [{ index: 0, duration_ms: 100 }],
        tags: [],
        cels: {
            '1/0': { x: 0, y: 0, data: celData },
        },
    };

    // 7. Save asset file
    try {
        await saveAssetFile(assetFilePath, asset);
    } catch (e: unknown) {
        return errors.domainError(`Failed to save asset file: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 8. Register in project registry
    workspace.project.registerAsset(assetName, {
        path: assetRelPath,
        type: assetType ?? 'sprite',
    });

    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({
                asset_name: assetName,
                path: assetRelPath,
                width,
                height,
                color_count: result.palette.size,
            }),
        }],
    };
}

