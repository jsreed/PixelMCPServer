import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

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
          role: 'user',
          content: {
            type: 'text',
            text: `Export asset "${args.asset_name}" for Godot 4${args.godot_project_path ? ` into project at "${args.godot_project_path}"` : ''}. Determine whether it is a sprite or tileset, export the appropriate PNG sheet(s), generate SpriteFrames or TileSet resources, and write the .import metadata files so Godot recognises the assets without re-importing.`,
          },
        },
      ],
    }),
  );
}
