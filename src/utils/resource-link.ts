import { type ResourceLink } from '@modelcontextprotocol/sdk/types.js';

/**
 * Creates a ResourceLink ContentBlock for appending to tool results.
 */
export function createResourceLink(name: string, uri: string): ResourceLink {
  return {
    type: 'resource_link',
    name,
    uri,
    mimeType: 'image/png',
  };
}
