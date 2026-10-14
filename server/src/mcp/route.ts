import type { Request, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from '../config.js';
import { need, principalOf } from '../auth/middleware.js';
import { apiError } from '../services/apiError.js';
import { palomaVersion } from '../services/serverInfo.js';
import { asyncRoute } from '../routes/asyncRoute.js';
import { createMcpServer } from './server.js';
import { baseUrlOf } from './images.js';
import { sendLinkImage } from './media.js';

/**
 * Whether a request may come from where its `Origin` says: no origin (not a browser), the server's own, or the
 * configured client origin. Keeps web pages from driving a local Paloma through a visitor's browser.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.get('origin');
  if (origin === undefined) return true;
  return origin === `${req.protocol}://${req.get('host')}` || (config.auth.clientOrigin !== null && origin === config.auth.clientOrigin);
}

const notAllowed = { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this server is stateless; POST JSON-RPC messages' }, id: null };

/**
 * Registers `/mcp` (MCP Streamable HTTP, stateless) when `PALOMA_MCP` is on. With users on, only API tokens are
 * accepted; each tool checks its own permission.
 */
export function registerMcpRoutes(router: Router): void {
  if (!config.mcp.enabled) return;

  router.post('/mcp', need('library.view', { tokenOnly: true }), asyncRoute(async (req, res) => {
    if (!originAllowed(req)) return res.status(403).json(apiError('origin_not_allowed', 'Requests from this web page are not allowed'));
    const server = createMcpServer(principalOf(res), await palomaVersion(), baseUrlOf(req));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }));

  // Temporary image links: the link itself is the credential, so no token, cookie or Origin check here
  router.get('/mcp/media/:link', need('public'), asyncRoute(sendLinkImage));

  // No server-sent stream or session to end in stateless mode
  router.get('/mcp', need('library.view', { tokenOnly: true }), (req, res) => {
    res.status(405).set('Allow', 'POST').json(notAllowed);
  });
  router.delete('/mcp', need('library.view', { tokenOnly: true }), (req, res) => {
    res.status(405).set('Allow', 'POST').json(notAllowed);
  });
}
