import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ProjectClass } from '../classes/project.js';
import { getWorkspace } from '../classes/workspace.js';
import { loadProjectFile, saveProjectFile } from '../io/project-io.js';
import * as errors from '../errors.js';
import * as path from 'node:path';

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
    action: z.enum(['init', 'open', 'info']).describe(
        'Action to perform: init (create new project), open (load existing), info (show current project)'
    ),
    path: z.string().optional().describe(
        'For init: project directory path. For open: path to pixelmcp.json'
    ),
    name: z.string().optional().describe(
        'Project name (used by init; defaults to directory name)'
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
