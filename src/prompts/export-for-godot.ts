import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Builds the step-by-step guidance text for the `export_for_godot` prompt.
 * Extracted as a pure function so it can be unit-tested independently of the MCP SDK.
 *
 * @param args - Prompt arguments provided by the user.
 * @param args.asset_name - Name of the loaded asset to export.
 * @param args.godot_project_path - Optional absolute or relative path to the Godot project root.
 * @returns Markdown-formatted step-by-step instructions for the LLM.
 */
export function buildExportForGodotText(args: {
  asset_name: string;
  godot_project_path?: string;
}): string {
  const assetName = args.asset_name;
  const projectPathStr = args.godot_project_path
    ? ` into project at \`"${args.godot_project_path}"\``
    : '';

  return `Export asset \`"${assetName}"\` for Godot 4${projectPathStr}.

Follow these steps in order, calling the tool actions exactly as described:

---

## Step 1 — Inspect the asset

Call \`asset info\` on \`"${assetName}"\` to determine the asset's structure and contents.
Keep this response on hand to decide which export action to use in Step 2.

---

## Step 2 — Select the correct export action

Based on the \`asset info\` response from Step 1, determine the appropriate export action:

  - **Export as SpriteFrames**: If the asset has **frame tags** defining animations, use \`export godot_spriteframes\`. This will generate a PNG strip, a \`.png.import\` sidecar, and a \`.tres\` SpriteFrames resource.
  - **Export as TileSet**: If the asset has **tile fields** (\`tile_width\`, \`tile_height\`, \`tile_count\` > 0), use \`export godot_tileset\`. This will generate an atlas PNG, a \`.png.import\` sidecar, and a \`.tres\` TileSet resource with embedded collision and terrain data.
  - **Export as Static**: If the asset has neither frame tags nor tile fields, use \`export godot_static\`. This will generate a PNG file and a \`.png.import\` sidecar (no \`.tres\` resource).

---

## Step 3 — Determine the export path

Ensure you pass the correct \`path\` parameter to the chosen \`export\` action.
${
  args.godot_project_path
    ? `Since a Godot project path was provided (\`"${args.godot_project_path}"\`), you should construct a path relative to it or use it as the base directory for the export.`
    : `Since no Godot project path was provided, use the current project directory or default export path.`
}

---

## Step 4 — Execute the export

Call the \`export\` action you chose in Step 2 (e.g., \`godot_spriteframes\`, \`godot_tileset\`, or \`godot_static\`) on \`"${assetName}"\` with the appropriate \`path\` determined in Step 3.

---

## Step 5 — Verify output

After the export is complete, verify that the expected files (PNG, \`.import\`, and optionally \`.tres\`) were generated successfully by checking the returned file paths or standard output.

---

Preview the asset at any time using the resource URIs:
  - Full composite: \`pixel://view/asset/${assetName}\`
`;
}

/**
 * Registers the \`export_for_godot\` MCP prompt with the server.
 *
 * This prompt guides the LLM through exporting a sprite or tileset asset to Godot 4-compatible files: PNG sheets, .import metadata, SpriteFrames resources, and TileSet resources.
 *
 * @param server - The MCP server instance to register the prompt on.
 */
export function registerExportForGodotPrompt(server: McpServer): void {
  server.registerPrompt(
    'export_for_godot',
    {
      title: 'Export for Godot',
      description:
        'Guide through exporting a sprite or tileset asset to Godot 4-compatible files: PNG sheets, .import metadata, SpriteFrames resources, and TileSet resources.',
      argsSchema: {
        asset_name: z.string().describe('Name of the loaded asset to export'),
        godot_project_path: z
          .string()
          .optional()
          .describe('Absolute or relative path to the Godot project root (contains project.godot)'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: buildExportForGodotText({
              asset_name: args.asset_name,
              godot_project_path: args.godot_project_path,
            }),
          },
        },
      ],
    }),
  );
}
