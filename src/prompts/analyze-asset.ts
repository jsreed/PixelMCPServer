import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAnalyzeAssetPrompt(server: McpServer): void {
  server.registerPrompt(
    'analyze_asset',
    {
      title: 'Analyze Asset',
      description:
        'Inspect a loaded asset and produce a structured report covering dimensions, layers, palette usage, animation tags, and potential issues.',
      argsSchema: {
        asset_name: z.string().describe('Name of the loaded asset to analyze'),
      },
    },
    (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the asset "${args.asset_name}": query its dimensions, layers, frame count, palette usage, and animation tags. Report any issues such as unused palette entries, empty cels, missing animation frames, or inconsistent layer structure.`,
          },
        },
      ],
    }),
  );
}
