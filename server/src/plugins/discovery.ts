import fs from 'node:fs';
import path from 'node:path';
import type { PluginSource } from '../../../shared/types.js';
import { readManifest, type PartialManifest, type PluginManifest } from './manifest.js';

/** A plugin folder found at startup. `manifest` is null when the plugin cannot be loaded at all. */
export interface DiscoveredPlugin {
  /** The manifest id; for a plugin that cannot be used, its folder name (made unique) */
  id: string;
  source: PluginSource;
  folder: string;
  manifest: PluginManifest | null;
  /** What could be read of the manifest, for listing */
  partial: PartialManifest;
  error: string | null;
}

async function subfolders(root: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() || (entry.isSymbolicLink() && await isDirectory(path.join(root, entry.name)))) names.push(entry.name);
  }
  return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Finds plugins in the direct subfolders of the bundled and the external root, bundled first, then each
 * root by folder name. Folders without `paloma-plugin.json` are skipped, and a missing root has none.
 * When two plugins share an id, the first one wins and the other gets an error naming the id.
 */
export async function discoverPlugins(bundledRoot: string, externalRoot: string): Promise<DiscoveredPlugin[]> {
  const found: DiscoveredPlugin[] = [];
  const roots: [PluginSource, string][] = [['bundled', bundledRoot]];
  if (path.resolve(externalRoot) !== path.resolve(bundledRoot)) roots.push(['external', externalRoot]);

  for (const [source, root] of roots) {
    for (const name of await subfolders(root)) {
      const folder = path.join(root, name);
      const read = await readManifest(folder);
      if (read.kind === 'missing') continue;
      if (read.kind === 'ok') {
        found.push({ id: read.manifest.id, source, folder, manifest: read.manifest, partial: read.manifest, error: null });
      } else {
        found.push({ id: read.partial.id ?? name, source, folder, manifest: null, partial: read.partial, error: read.reason });
      }
    }
  }

  const winners = new Set<string>();
  for (const plugin of found) {
    if (plugin.manifest && !winners.has(plugin.id)) {
      winners.add(plugin.id);
    } else if (plugin.manifest) {
      plugin.error = `another plugin already uses the id "${plugin.id}"`;
      plugin.manifest = null;
    }
  }

  // Plugins that cannot be used keep their manifest id when it is free, else get a folder-based one
  const taken = new Set(winners);
  for (const plugin of found) {
    if (plugin.manifest) continue;
    const name = path.basename(plugin.folder);
    const candidates = [plugin.id, name, `${plugin.source}/${name}`];
    const id = candidates.find((candidate) => !taken.has(candidate))
      ?? `${plugin.source}/${name}#${found.indexOf(plugin)}`;
    plugin.id = id;
    taken.add(id);
  }
  return found;
}
