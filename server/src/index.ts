import { config } from './config.js';
import { createApp } from './app.js';
import { FolderScannerService } from './services/FolderScannerService.js';
import { placeResolver } from './services/geocoding.js';
import { pluginRegistry } from './plugins/index.js';
import { openDatabase } from './db/index.js';
import { prepareSetup } from './auth/setup.js';
import { pruneSessions } from './auth/sessions.js';

const app = createApp();

const HOUR_MS = 60 * 60 * 1000;

/** With auth on: the setup code when there are no users, a warning without a login form, and session pruning. */
async function startAuth(): Promise<void> {
  if (config.auth.mode !== 'on') return;
  console.log('🔒 Users are on: every request needs a login or an API token');
  if (!pluginRegistry.getAuthProviders().some((provider) => provider.definition.kind === 'credentials')) {
    console.error('⚠️ No login provider is on, so nobody can log in. Set PALOMA_AUTH=off, restart, and switch on a login plugin.');
  }
  await prepareSetup();
  const prune = () => pruneSessions().catch((err) => console.error('Failed to prune sessions:', err));
  await prune();
  setInterval(prune, HOUR_MS).unref();
}

function listen(): void {
  app.listen(config.port, () => {
    console.log(`🕊️ Paloma Express Server running on http://localhost:${config.port}`);

    // Thumbnails render through the filters of active plugins, so plugins load before scanning
    pluginRegistry.init()
      .then(() => {
        for (const plugin of pluginRegistry.list()) {
          const detail = plugin.error ? `: ${plugin.error}` : plugin.status === 'active' ? ` (${plugin.filters.length} filters)` : '';
          console.log(`🧩 Plugin ${plugin.id} ${plugin.version ?? ''} [${plugin.source}] ${plugin.status}${detail}`);
        }
      })
      .catch((err) => console.error('Failed to load plugins:', err))
      .then(startAuth)
      .catch((err) => console.error('Failed to start users and logins:', err))
      .then(() => FolderScannerService.startConfiguredFolders())
      .catch((err) => {
        console.error('Failed to scan photos folders:', err);
      })
      .finally(() => placeResolver.start().catch((err) => console.error('Failed to start resolving place names:', err)));
  });
}

openDatabase()
  .then(listen)
  .catch((err) => {
    console.error('Failed to open the library database:', err);
    process.exit(1);
  });
