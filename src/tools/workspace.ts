import { z } from 'zod';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getWorkspace } from '../classes/workspace.js';
import * as errors from '../errors.js';

/**
 * Zod input schema for the `workspace` tool.
 *
 * Actions: info, load_asset, unload_asset, save, save_all, undo, redo
 */
const workspaceInputSchema = {
  action: z
    .enum(['info', 'load_asset', 'unload_asset', 'save', 'save_all', 'undo', 'redo'])
    .describe('Action to perform on the workspace session'),
  asset_name: z
    .string()
    .optional()
    .describe('Logical asset name (required for load_asset, unload_asset, save)'),
  variant: z
    .string()
    .optional()
    .describe('Variant key for multi-variant assets (used with load_asset)'),
};

/**
 * Registers the `workspace` tool on the MCP server.
 */
export function registerWorkspaceTool(server: McpServer): void {
  server.registerTool(
    'workspace',
    {
      title: 'Workspace',
      description:
        'In-memory editing session management. Load/unload assets, save, undo/redo, and query session state.',
      inputSchema: workspaceInputSchema,
    },
    async (args) => {
      const workspace = getWorkspace();

      switch (args.action) {
        case 'info':
          return handleInfo(workspace);
        case 'load_asset':
          return handleLoadAsset(workspace, args.asset_name, args.variant);
        case 'unload_asset':
          return handleUnloadAsset(workspace, args.asset_name);
        case 'save':
          return handleSave(workspace, args.asset_name);
        case 'save_all':
          return handleSaveAll(workspace);
        case 'undo':
          return handleUndo(workspace);
        case 'redo':
          return handleRedo(workspace);
        default:
          return errors.invalidArgument(`Unknown workspace action: ${String(args.action)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

type Workspace = ReturnType<typeof getWorkspace>;

function handleInfo(workspace: Workspace) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(workspace.info()),
      },
    ],
  };
}

async function handleLoadAsset(
  workspace: Workspace,
  assetName: string | undefined,
  variant: string | undefined,
) {
  if (!assetName) {
    return errors.invalidArgument('workspace load_asset requires "asset_name".');
  }
  if (!workspace.project) {
    return errors.noProjectLoaded();
  }

  try {
    await workspace.loadAsset(assetName, variant);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Check for known domain error patterns
    if (msg.includes('not found in project registry')) {
      return errors.assetNotInRegistry(assetName);
    }
    if (msg.includes('not found') || msg.includes('ENOENT')) {
      return errors.assetFileNotFound(assetName);
    }
    return errors.domainError(msg);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Asset '${assetName}' loaded.`,
          variant: variant ?? null,
        }),
      },
    ],
  };
}

function handleUnloadAsset(workspace: Workspace, assetName: string | undefined) {
  if (!assetName) {
    return errors.invalidArgument('workspace unload_asset requires "asset_name".');
  }

  try {
    const result = workspace.unloadAsset(assetName);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: `Asset '${assetName}' unloaded.`,
            hadUnsavedChanges: result.hadUnsavedChanges,
          }),
        },
      ],
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not loaded')) {
      return errors.assetNotLoaded(assetName);
    }
    return errors.domainError(msg);
  }
}

async function handleSave(workspace: Workspace, assetName: string | undefined) {
  if (!assetName) {
    return errors.invalidArgument('workspace save requires "asset_name".');
  }
  if (!workspace.project) {
    return errors.noProjectLoaded();
  }

  try {
    const result = await workspace.save(assetName);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: `Asset '${assetName}' saved.`,
            path: result.path,
          }),
        },
      ],
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not loaded')) {
      return errors.assetNotLoaded(assetName);
    }
    return errors.domainError(msg);
  }
}

async function handleSaveAll(workspace: Workspace) {
  if (!workspace.project) {
    return errors.noProjectLoaded();
  }

  const results = await workspace.saveAll();
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: `Saved ${String(results.length)} asset(s).`,
          saved: results,
        }),
      },
    ],
  };
}

function handleUndo(workspace: Workspace) {
  try {
    workspace.undo();
  } catch {
    return errors.domainError('Nothing to undo.');
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: 'Undo successful.',
          undoDepth: workspace.undoDepth,
          redoDepth: workspace.redoDepth,
        }),
      },
    ],
  };
}

function handleRedo(workspace: Workspace) {
  try {
    workspace.redo();
  } catch {
    return errors.domainError('Nothing to redo.');
  }
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          message: 'Redo successful.',
          undoDepth: workspace.undoDepth,
          redoDepth: workspace.redoDepth,
        }),
      },
    ],
  };
}
