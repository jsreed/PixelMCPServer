import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { registerEditorResource } from './editor.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

interface ResourceResult {
  contents: ResourceContent[];
}

interface CapturedResource {
  name: string;
  uri: string;
  config: Record<string, unknown>;
  readCallback: (uri: URL, extra: unknown) => Promise<ResourceResult>;
}

function captureEditorResource(): CapturedResource {
  let captured: CapturedResource | undefined;
  const mockServer = {
    registerResource(
      name: string,
      uri: string,
      config: unknown,
      readCallback: (uri: URL, extra: unknown) => Promise<ResourceResult>,
    ) {
      captured = { name, uri, config: config as Record<string, unknown>, readCallback };
    },
  };
  registerEditorResource(mockServer as unknown as McpServer);
  if (!captured) throw new Error('Resource not captured');
  return captured;
}

describe('editor resource', () => {
  let resource: CapturedResource;

  beforeEach(() => {
    resource = captureEditorResource();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers with URI ui://pixel-editor/app.html', () => {
    expect(resource.uri).toBe('ui://pixel-editor/app.html');
  });

  it('registers with name Pixel Editor', () => {
    expect(resource.name).toBe('Pixel Editor');
  });

  it('registers with correct MIME type', () => {
    expect(resource.config.mimeType).toBe(RESOURCE_MIME_TYPE);
  });

  it('read returns HTML content from disk', async () => {
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('<html><body>test</body></html>');

    const result = await resource.readCallback(
      new URL('ui://pixel-editor/app.html'),
      {},
    );

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toBe('<html><body>test</body></html>');
  });

  it('read returns correct URI in content', async () => {
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('<html></html>');

    const result = await resource.readCallback(
      new URL('ui://pixel-editor/app.html'),
      {},
    );

    expect(result.contents[0].uri).toBe('ui://pixel-editor/app.html');
  });

  it('read propagates fs error when dist not built', async () => {
    const { readFile } = await import('node:fs/promises');
    (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ENOENT: no such file or directory'),
    );

    await expect(
      resource.readCallback(new URL('ui://pixel-editor/app.html'), {}),
    ).rejects.toThrow('ENOENT');
  });
});
