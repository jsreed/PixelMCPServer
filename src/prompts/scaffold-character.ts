import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerScaffoldCharacterPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_character',
    {
      title: 'Scaffold Character',
      description:
        'Guide through creating a base character sprite with directional walk/idle animations, structured layers, and a palette.',
      argsSchema: {
        name: z.string().describe('Asset name for the character sprite'),
        directions: z
          .enum(['4', '8'])
          .optional()
          .describe('Number of directional facings: "4" or "8", default "4"'),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas width in pixels, default 16'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Canvas height in pixels, default 24'),
        palette: z
          .string()
          .optional()
          .describe('Lospec palette slug or path to a .json palette file'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a character sprite asset named "${args.name}" (${String(args.width ?? 16)}×${String(args.height ?? 24)} px, ${args.directions ?? '4'}-directional).${args.palette ? ` Use palette: ${args.palette}.` : ''} Set up layers (outline, fill, shadow, highlight), define idle and walk animation tags for each facing, then draw the base frames.`,
          },
        },
      ],
    }),
  );
}
