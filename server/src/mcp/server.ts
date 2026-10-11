import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Principal } from '../auth/principal.js';
import { aiGuide } from '../model/guide.js';
import { modelSchema } from '../model/jsonSchema.js';
import { mayUse, runTool, TOOLS } from './tools.js';

export const INSTRUCTIONS = 'Paloma is a local photo library. Read the guide (describe_model, or the paloma://guide resource) before '
  + 'changing anything. Changes go to .paloma.json files in the photo folders; photo files are never changed. Use dryRun '
  + 'with apply_changes before large changes.';

export const GUIDE_URI = 'paloma://guide';
export const SCHEMA_URI = 'paloma://schema';

/** An MCP server for one request, offering only the tools and resources the principal may use. */
export function createMcpServer(principal: Principal, version: string): McpServer {
  const server = new McpServer({ name: 'paloma', title: 'Paloma photo library', version }, { instructions: INSTRUCTIONS });

  for (const tool of TOOLS.filter((candidate) => mayUse(candidate, principal))) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: { readOnlyHint: tool.readOnly, destructiveHint: !tool.readOnly, openWorldHint: tool.name === 'start_ai_run' },
    }, (args: Record<string, unknown>) => runTool(tool, args, principal));
  }

  if (principal.permissions.has('library.view')) {
    server.registerResource('guide', GUIDE_URI, {
      title: 'Guide for AI clients', description: 'How the library is organised and how to change it safely', mimeType: 'text/markdown',
    }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: aiGuide() }] }));
    server.registerResource('schema', SCHEMA_URI, {
      title: 'Object model schema', description: 'JSON Schema of photos, albums, people, folders, tags and changesets', mimeType: 'application/json',
    }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(modelSchema()) }] }));
  }
  return server;
}
