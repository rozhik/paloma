import fs from 'node:fs';
import path from 'node:path';
import type { ServerInfo } from '../../../shared/types.js';
import { config, MCP_PATH } from '../config.js';

/** Paloma's version from the repository's package.json, next to `plugins/`; read once. */
let version: Promise<string> | null = null;
export const palomaVersion = (): Promise<string> => (version ??= fs.promises
  .readFile(path.join(path.dirname(config.bundledPluginsDir), 'package.json'), 'utf-8')
  .then((text) => String((JSON.parse(text) as { version?: unknown }).version ?? 'unknown'), () => 'unknown'));

/** `GET /api/server/info`: what the server was started with. */
export async function serverInfo(): Promise<ServerInfo> {
  return {
    version: await palomaVersion(),
    authMode: config.auth.mode,
    photosDirs: [...config.photosDirs],
    excludeDirs: [...config.excludeDirs],
    exportDir: config.exportDir,
    dataDir: config.dataDir,
    pluginsDir: config.pluginsDir,
    sessionDays: config.auth.sessionDays,
    rateLimit: config.auth.rateLimit === 0 ? null : config.auth.rateLimit,
    mcp: { enabled: config.mcp.enabled, path: MCP_PATH },
  };
}
