import path from 'node:path';
import { config } from '../config.js';
import { PluginRegistry } from './registry.js';
import { STATE_FILE_NAME } from './state.js';

export { PluginRegistry, PluginRegistryError, type RegisteredAiProvider, type RegisteredAuthProvider, type RegisteredFilter } from './registry.js';

/** The server's plugins: bundled ones from the repo and external ones from PALOMA_PLUGINS_DIR. */
export const pluginRegistry = new PluginRegistry({
  bundledDir: config.bundledPluginsDir,
  externalDir: config.pluginsDir,
  stateFile: path.join(config.dataDir, STATE_FILE_NAME),
  requireLoginProvider: () => config.auth.mode === 'on',
});
