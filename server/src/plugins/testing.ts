import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PLUGIN_API_VERSION, type PluginHost, type PluginModule } from './api.js';
import { checkContributions } from './contributions.js';
import type { RegisteredFilter } from './registry.js';
import type { FilterLookup } from '../services/editChain.js';

/** Test helper: writes a plugin folder with a manifest and an ESM module. */
export function writeTestPlugin(
  root: string,
  folderName: string,
  options: { id?: string; manifest?: Record<string, unknown>; module?: string; version?: string } = {},
): string {
  const folder = path.join(root, folderName);
  fs.mkdirSync(folder, { recursive: true });
  const manifest = {
    id: options.id ?? folderName,
    name: { en: `Plugin ${folderName}`, uk: `Плагін ${folderName}` },
    description: `Test plugin ${folderName}`,
    version: options.version ?? '1.0.0',
    apiVersion: 1,
    server: 'index.js',
    ...options.manifest,
  };
  fs.writeFileSync(path.join(folder, 'paloma-plugin.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  fs.writeFileSync(path.join(folder, 'index.js'), options.module ?? 'export function activate() { return {}; }\n');
  return folder;
}

/** Test helper: runs a plugin module's activate() and returns a filter lookup for RenderService. */
export async function lookupOfPlugin(module: { activate: PluginModule['activate'] }, pluginId: string): Promise<FilterLookup> {
  const host: PluginHost = { apiVersion: PLUGIN_API_VERSION, sharp, log: { info() {}, warn() {}, error() {} } };
  const { filters, warnings } = checkContributions(await module.activate(host));
  if (warnings.length > 0) throw new Error(`Plugin ${pluginId}: ${warnings.join('; ')}`);
  const map = new Map<string, RegisteredFilter>(filters.map((definition) => [definition.name, {
    pluginId,
    pluginVersion: 'test',
    definition: definition as RegisteredFilter['definition'],
    host,
  }]));
  return (name) => map.get(name);
}

/** sharp for tests outside the server package, which cannot resolve it themselves */
export { sharp };
