#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Minimal Express req/res types — Express 5 ships no .d.ts declarations
interface HttpReq extends IncomingMessage {
  body?: unknown;
}
interface HttpRes extends ServerResponse {
  status(code: number): HttpRes;
  json(body: unknown): void;
  send(body: string): void;
}

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
import { registerEditorTool } from './tools/editor.js';
import { registerResources } from './resources/index.js';
import { registerEditorResource } from './resources/editor.js';
import { registerScaffoldCharacterPrompt } from './prompts/scaffold-character.js';
import { registerScaffoldTilesetPrompt } from './prompts/scaffold-tileset.js';
import { registerScaffoldEquipmentPrompt } from './prompts/scaffold-equipment.js';
import { registerAnalyzeAssetPrompt } from './prompts/analyze-asset.js';
import { registerExportForGodotPrompt } from './prompts/export-for-godot.js';
import { registerScaffoldUiIconsPrompt } from './prompts/scaffold-ui-icons.js';
import { registerScaffoldUiFramePrompt } from './prompts/scaffold-ui-frame.js';

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
registerEditorTool(server);
registerResources(server);
registerEditorResource(server);

// Register all prompt handlers
registerScaffoldCharacterPrompt(server);
registerScaffoldTilesetPrompt(server);
registerScaffoldEquipmentPrompt(server);
registerAnalyzeAssetPrompt(server);
registerExportForGodotPrompt(server);
registerScaffoldUiIconsPrompt(server);
registerScaffoldUiFramePrompt(server);

const useHttp = process.argv.includes('--http');
const HTTP_PORT = 3001;

function startHttpTransport(): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const app = createMcpExpressApp();
  let transport: StreamableHTTPServerTransport | null = null;

  // POST /mcp — JSON-RPC requests
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.post('/mcp', async (req: HttpReq, res: HttpRes) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && transport) {
        await transport.handleRequest(req, res, req.body);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });
        transport.onclose = () => {
          transport = null;
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No active session' },
          id: null,
        });
      }
    } catch (error: unknown) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.get('/mcp', async (req: HttpReq, res: HttpRes) => {
    if (!transport) {
      res.status(400).send('No active session');
      return;
    }
    await transport.handleRequest(req, res);
  });

  // DELETE /mcp — session termination
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.delete('/mcp', async (req: HttpReq, res: HttpRes) => {
    if (!transport) {
      res.status(400).send('No active session');
      return;
    }
    await transport.handleRequest(req, res);
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  app.listen(HTTP_PORT, () => {
    console.error(`Pixel MCP Server running on http://127.0.0.1:${String(HTTP_PORT)}/mcp`);
  });
}

async function main() {
  if (useHttp) {
    startHttpTransport();
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Pixel MCP Server running on stdio');
  }
}

process.on('SIGINT', () => {
  console.error('Shutting down...');
  process.exit(0);
});

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
