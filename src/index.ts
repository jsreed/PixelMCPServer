#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Tool registration imports — uncomment as each tool is implemented:
import { registerProjectTool } from './tools/project.js';
import { registerWorkspaceTool } from './tools/workspace.js';
import { registerAssetTool } from './tools/asset.js';
import { registerPaletteTool } from './tools/palette.js';
import { registerDrawTool } from './tools/draw.js';
import { registerSelectionTool } from './tools/selection.js';
import { registerTransformTool } from './tools/transform.js';
import { registerEffectTool } from './tools/effect.js';
import { registerTilesetTool } from './tools/tileset.js';
import { registerExportTool } from './tools/export.js';
import { registerResources } from './resources/index.js';
import { registerScaffoldCharacterPrompt } from './prompts/scaffold-character.js';
import { registerScaffoldTilesetPrompt } from './prompts/scaffold-tileset.js';
import { registerScaffoldEquipmentPrompt } from './prompts/scaffold-equipment.js';
import { registerAnalyzeAssetPrompt } from './prompts/analyze-asset.js';
import { registerExportForGodotPrompt } from './prompts/export-for-godot.js';

// Create the MCP server instance
const server = new McpServer({
  name: 'PixelMCPServer',
  version: '1.0.0',
});

// Register all tool handlers
registerProjectTool(server);
registerWorkspaceTool(server);
registerAssetTool(server);
registerPaletteTool(server);
registerDrawTool(server);
registerSelectionTool(server);
registerTransformTool(server);
registerEffectTool(server);
registerTilesetTool(server);
registerExportTool(server);
registerResources(server);

// Register all prompt handlers
registerScaffoldCharacterPrompt(server);
registerScaffoldTilesetPrompt(server);
registerScaffoldEquipmentPrompt(server);
registerAnalyzeAssetPrompt(server);
registerExportForGodotPrompt(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pixel MCP Server running on stdio');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
