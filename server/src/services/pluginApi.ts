import type { ApiError, PluginInfo } from '../../../shared/types.js';
import { pluginRegistry, PluginRegistryError } from '../plugins/index.js';
import { apiError } from './apiError.js';
import { normalizeLang } from './placeCache.js';

export type PluginResult<T> = { status: 200; body: T } | { status: 400 | 404 | 409 | 500; body: ApiError };

/** `GET /api/plugins`: every plugin found at startup, with texts in `lang`. */
export async function listPlugins(lang: unknown): Promise<PluginInfo[]> {
  await pluginRegistry.init();
  return pluginRegistry.list(normalizeLang(lang));
}

/**
 * `GET /api/plugins/:id/filters/:name/icon`: the file of a filter's icon. Only an active plugin's usable icon
 * (an .svg inside its folder) is ever returned.
 */
export async function filterIcon(id: string, filter: string): Promise<{ status: 200; file: string } | { status: 404; body: ApiError }> {
  await pluginRegistry.init();
  const icon = pluginRegistry.getFilterIcon(id, filter);
  if ('file' in icon) return { status: 200, file: icon.file };
  return icon.missing === 'plugin'
    ? { status: 404, body: apiError('plugin_not_found', `Plugin ${id} not found or not active`, { id }) }
    : { status: 404, body: apiError('filter_not_found', `Plugin ${id} has no icon for filter ${filter}`, { id, filter }) };
}

/** `PATCH /api/plugins/:id` with `{"enabled": boolean}`: switches a plugin on or off. */
export async function switchPlugin(id: string, body: unknown, lang: unknown): Promise<PluginResult<PluginInfo>> {
  const enabled = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== 'boolean' || Object.keys(body as object).length !== 1) {
    return { status: 400, body: apiError('plugin_invalid_body', 'Body must be {"enabled": true} or {"enabled": false}') };
  }
  try {
    return { status: 200, body: await pluginRegistry.setEnabled(id, enabled, normalizeLang(lang)) };
  } catch (err) {
    if (err instanceof PluginRegistryError && err.reason === 'not_found') {
      return { status: 404, body: apiError('plugin_not_found', `Plugin ${id} not found`, { id }) };
    }
    if (err instanceof PluginRegistryError) {
      return { status: 409, body: apiError('plugin_unavailable', err.message, { id }) };
    }
    console.error(`Failed to switch plugin ${id}:`, err);
    return { status: 500, body: apiError('internal', 'Failed to save the plugin setting', { message: (err as Error).message }) };
  }
}
