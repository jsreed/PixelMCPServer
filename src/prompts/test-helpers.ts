import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type PromptArgs = Record<string, unknown>;

interface PromptMessage {
  role: string;
  content: { type: string; text: string };
}

interface PromptResult {
  messages: PromptMessage[];
}

type PromptCallback = (args: PromptArgs) => PromptResult;

/** Captures the prompt name and callback from a mock MCP server registration. */
export function capturePromptCallback(registerFn: (server: McpServer) => void): {
  name: string;
  cb: PromptCallback;
} {
  let capturedName = '';
  let capturedCb!: PromptCallback;
  const mockServer = {
    registerPrompt(name: string, _config: unknown, callback: PromptCallback) {
      capturedName = name;
      capturedCb = callback;
    },
  };
  registerFn(mockServer as unknown as McpServer);
  return { name: capturedName, cb: capturedCb };
}
