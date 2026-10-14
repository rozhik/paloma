import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Principal } from '../auth/principal.js';
import { aiGuide } from '../model/guide.js';
import { modelSchema } from '../model/jsonSchema.js';
import { imageLinks } from './images.js';
import { mayUse, runTool, TOOLS } from './tools.js';

export const INSTRUCTIONS = 'Paloma is a local photo library. Read the guide (describe_model, or the paloma://guide resource) before '
  + 'changing anything. Changes go to .paloma.json files in the photo folders; photo files are never changed. Use dryRun '
  + 'with apply_changes before large changes. Image links in results are temporary: they work without a token for '
  + 'uri_valid_time_sec seconds. Text arguments have maximum lengths, given in each tool\'s input schema.';

export const GUIDE_URI = 'paloma://guide';
export const SCHEMA_URI = 'paloma://schema';

/**
 * An MCP server for one request, offering only the tools and resources the principal may use. Image links are
 * made on `baseUrl`, the address the client reached the server on.
 */
export function createMcpServer(principal: Principal, version: string, baseUrl: string): McpServer {
  const server = new McpServer({ name: 'paloma', title: 'Paloma photo library', version }, { instructions: INSTRUCTIONS });
  const links = imageLinks(principal, baseUrl);
  const allowed = TOOLS.filter((candidate) => mayUse(candidate, principal));

  for (const tool of allowed) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: { readOnlyHint: tool.readOnly, destructiveHint: !tool.readOnly, openWorldHint: tool.name === 'start_ai_run' },
    }, (args: Record<string, unknown>) => runTool(tool, args, principal, links));
  }
  // The listed schemas stay the SDK's; calls are checked by runTool, so that an argument over its limit is an
  // `invalid_field` error naming it, as in the REST API, rather than the SDK's free-text validation message
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = allowed.find((candidate) => candidate.name === request.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
    return runTool(tool, request.params.arguments, principal, links);
  });

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
