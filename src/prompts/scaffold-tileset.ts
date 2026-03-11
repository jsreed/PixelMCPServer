import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerScaffoldTilesetPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_tileset',
    {
      title: 'Scaffold Tileset',
      description:
        'Guide through creating a tileset asset with a terrain layer, autotile slots, and a physics collision layer.',
      argsSchema: {
        name: z.string().describe('Asset name for the tileset'),
        tile_size: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Tile size in pixels (square), default 16'),
        terrain_name: z
          .string()
          .optional()
          .describe('Name for the primary terrain type (e.g. "grass", "stone")'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a tileset asset named "${args.name}" with ${String(args.tile_size ?? 16)}px tiles${args.terrain_name ? ` for terrain "${args.terrain_name}"` : ''}. Set up the canvas to hold a blob-47 autotile layout, generate autotile slots, draw the base terrain tiles, and add a physics shape layer for collision geometry.`,
          },
        },
      ],
    }),
  );
}
