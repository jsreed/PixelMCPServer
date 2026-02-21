#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'pixelmcpserver',
  version: '1.0.0',
});

// Tool registrations will go here as src/tools/*.ts modules
// e.g. registerDrawTool(server);

server.registerTool('get_status', { description: 'Get the status of the pixel art editor' }, () => ({
  content: [{ type: 'text', text: 'Pixel MCP Server is running!' }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pixel MCP Server running on stdio');
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
