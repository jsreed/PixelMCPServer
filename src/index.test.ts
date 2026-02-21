import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('PixelMCPServer', () => {
  it('should instantiate McpServer without errors', () => {
    const server = new McpServer({
      name: 'pixelmcpserver',
      version: '1.0.0',
    });

    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(McpServer);
  });
});
