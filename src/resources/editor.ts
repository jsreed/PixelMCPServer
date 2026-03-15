import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

const APP_HTML_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/app/app.html');

export function registerEditorResource(server: McpServer): void {
  registerAppResource(
    server,
    'Pixel Editor',
    'ui://pixel-editor/app.html',
    { description: 'Interactive pixel art editor UI' },
    async () => ({
      contents: [
        {
          uri: 'ui://pixel-editor/app.html',
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(APP_HTML_PATH, 'utf-8'),
        },
      ],
    }),
  );
}
