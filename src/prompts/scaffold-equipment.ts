import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerScaffoldEquipmentPrompt(server: McpServer): void {
  server.registerPrompt(
    'scaffold_equipment',
    {
      title: 'Scaffold Equipment',
      description:
        'Guide through creating an equipment or item sprite sized and layered to match a reference character.',
      argsSchema: {
        name: z.string().describe('Asset name for the equipment sprite'),
        type: z
          .string()
          .optional()
          .describe('Equipment category (e.g. "sword", "shield", "helmet")'),
        reference_character: z
          .string()
          .optional()
          .describe('Asset name of the character this equipment is designed for'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create an equipment sprite asset named "${args.name}"${args.type ? ` (type: ${args.type})` : ''}${args.reference_character ? `, sized to match character asset "${args.reference_character}"` : ''}. Set up outline and fill layers, match the canvas dimensions to the reference character if provided, and draw the item sprite.`,
          },
        },
      ],
    }),
  );
}
