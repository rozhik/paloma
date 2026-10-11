import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import type { AiProviderSummary, AuthProviderInfo, FilterInfo, FilterParamInfo, PluginInfo } from '../../../shared/types.js';
import {
  PLUGIN_API_VERSION, type AiProviderDefinition, type AuthProviderDefinition, type FilterDefinition, type ParamDefinition, type PluginHost, type PluginModule,
} from './api.js';
import { checkContributions } from './contributions.js';
import { discoverPlugins, type DiscoveredPlugin } from './discovery.js';
import { DEFAULT_PLUGIN_LEVEL, localize } from './manifest.js';
import { PluginState } from './state.js';

/** A filter that rendering can use, with the plugin that provides it. */
export interface RegisteredFilter {
  pluginId: string;
  pluginVersion: string;
  definition: FilterDefinition & { params: ParamDefinition[] };
  /** The host given to the plugin, passed to its filters' render() */
  host: PluginHost;
}

/** An auth provider of an active plugin. */
export interface RegisteredAuthProvider {
  pluginId: string;
  definition: AuthProviderDefinition;
}

/** An AI provider of an active plugin. */
export interface RegisteredAiProvider {
  pluginId: string;
  definition: AiProviderDefinition & { settings: NonNullable<AiProviderDefinition['settings']>; modelOptions: NonNullable<AiProviderDefinition['modelOptions']> };
  host: PluginHost;
}

interface PluginEntry {
  discovered: DiscoveredPlugin;
  module: PluginModule | null;
  host: PluginHost;
  loadError: string | null;
  /** Filters returned by the last successful activate(); used while the plugin is on */
  contributed: FilterDefinition[];
  /** Auth providers returned by the last successful activate() */
  providers: AuthProviderDefinition[];
  /** AI providers returned by the last successful activate() */
  aiProviders: AiProviderDefinition[];
  /** Absolute paths of the contributed filters' usable icons, by filter name */
  icons: Map<string, string>;
  contributionWarnings: string[];
  /** Filter-name conflicts, recomputed whenever the set of active plugins changes */
  conflictWarnings: string[];
}

export class PluginRegistryError extends Error {
  constructor(public readonly reason: 'not_found' | 'unavailable' | 'last_login_provider', message: string) {
    super(message);
    this.name = 'PluginRegistryError';
  }
}

export interface PluginRegistryOptions {
  bundledDir: string;
  externalDir: string;
  stateFile: string;
  /** Whether a `credentials` auth provider must stay on (auth is on); switching off the last one is refused */
  requireLoginProvider?: () => boolean;
}

function makeHost(id: string): PluginHost {
  return {
    apiVersion: PLUGIN_API_VERSION,
    sharp,
    log: {
      info: (message) => console.log(`[plugin ${id}] ${message}`),
      warn: (message) => console.warn(`[plugin ${id}] ${message}`),
      error: (message) => console.error(`[plugin ${id}] ${message}`),
    },
  };
}

export function paramInfo(param: ParamDefinition, lang: string): FilterParamInfo {
  const label = localize(param.label, lang);
  switch (param.type) {
    case 'number':
      return { name: param.name, label, type: 'number', min: param.min, max: param.max, step: param.step, default: param.default };
    case 'boolean':
      return { name: param.name, label, type: 'boolean', default: param.default };
    case 'choice':
      return {
        name: param.name,
        label,
        type: 'choice',
        options: param.options.map((option) => ({ value: option.value, label: localize(option.label, lang) })),
        default: param.default,
      };
    case 'rect':
      return { name: param.name, label, type: 'rect', default: { ...param.default } };
  }
}

/** An auth provider as `GET /api/plugins` and `GET /api/auth/status` list it, with texts in `lang`. */
export function authProviderInfo(definition: AuthProviderDefinition, lang: string): AuthProviderInfo {
  return {
    id: definition.id,
    kind: definition.kind,
    label: localize(definition.label, lang),
    fields: definition.kind === 'credentials'
      ? definition.fields.map((field) => ({ name: field.name, label: localize(field.label, lang), type: field.type }))
      : [],
  };
}

/**
 * The real path of a filter's icon when it is an existing `.svg` file inside the plugin folder (also after
 * following symlinks), or why it cannot be used.
 */
export async function resolveFilterIcon(pluginFolder: string, icon: string): Promise<{ file: string } | { problem: string }> {
  const problem = `icon ${JSON.stringify(icon)} is not an .svg file inside the plugin folder`;
  if (path.isAbsolute(icon) || path.extname(icon).toLowerCase() !== '.svg') return { problem };
  try {
    const root = await fs.promises.realpath(pluginFolder);
    const file = await fs.promises.realpath(path.resolve(root, icon));
    if (!file.startsWith(root + path.sep) || !(await fs.promises.stat(file)).isFile()) return { problem };
    return { file };
  } catch {
    return { problem };
  }
}

/**
 * The plugins found at startup and the filters of those that are on. A plugin's module is imported only
 * when it is switched on; switching it off unregisters its filters at once (Node cannot unload the module).
 */
export class PluginRegistry {
  private entries: PluginEntry[] = [];
  private filters = new Map<string, RegisteredFilter>();
  private providers = new Map<string, RegisteredAuthProvider>();
  private aiProviders = new Map<string, RegisteredAiProvider>();
  private state: PluginState;
  private initPromise: Promise<void> | null = null;
  /** Raised on every switch, so callers can tell that available filters may have changed */
  public epoch = 0;

  constructor(private readonly options: PluginRegistryOptions) {
    this.state = new PluginState(options.stateFile);
  }

  /** Discovers plugins and loads those that are on. Safe to call more than once. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      this.state = await PluginState.load(this.options.stateFile);
      this.entries = (await discoverPlugins(this.options.bundledDir, this.options.externalDir)).map((discovered) => ({
        discovered,
        module: null,
        host: makeHost(discovered.id),
        loadError: null,
        contributed: [],
        providers: [],
        aiProviders: [],
        icons: new Map(),
        contributionWarnings: [],
        conflictWarnings: [],
      }));
      for (const entry of this.entries) {
        if (this.isOn(entry)) await this.load(entry);
      }
      this.rebuildFilters();
    })();
    return this.initPromise;
  }

  private isOn(entry: PluginEntry): boolean {
    return entry.discovered.manifest !== null && this.state.isEnabled(entry.discovered.id, entry.discovered.source);
  }

  private isActive(entry: PluginEntry): boolean {
    return this.isOn(entry) && entry.loadError === null && entry.module !== null;
  }

  /** Imports the module if needed and calls activate(); a failure is kept as the plugin's load error. */
  private async load(entry: PluginEntry): Promise<void> {
    const { manifest, id } = entry.discovered;
    if (!manifest) return;
    entry.loadError = null;
    try {
      if (!entry.module) {
        const imported = await import(pathToFileURL(manifest.server).href) as Partial<PluginModule> & { default?: Partial<PluginModule> };
        const activate = imported.activate ?? imported.default?.activate;
        if (typeof activate !== 'function') throw new Error(`${path.basename(manifest.server)} does not export activate()`);
        entry.module = { activate };
      }
      const checked = checkContributions(await entry.module.activate(entry.host));
      entry.contributed = checked.filters;
      entry.providers = checked.authProviders;
      entry.aiProviders = checked.aiProviders;
      entry.icons = new Map();
      for (const filter of checked.filters) {
        if (filter.icon === undefined) continue;
        const resolved = await resolveFilterIcon(entry.discovered.folder, filter.icon);
        if ('file' in resolved) entry.icons.set(filter.name, resolved.file);
        else checked.warnings.push(`filter "${filter.name}": ${resolved.problem}; the filter has no icon`);
      }
      entry.contributionWarnings = checked.warnings;
      for (const warning of checked.warnings) console.warn(`[plugin ${id}] ${warning}`);
    } catch (err) {
      entry.loadError = err instanceof Error ? err.message : String(err);
      entry.contributed = [];
      entry.providers = [];
      entry.aiProviders = [];
      entry.icons = new Map();
      entry.contributionWarnings = [];
      console.error(`Plugin ${id} failed to load: ${entry.loadError}`);
    }
  }

  /**
   * Registers the filters, auth providers and AI providers of active plugins: bundled first, then external by
   * id; a taken filter name or provider id loses.
   */
  private rebuildFilters(): void {
    const order = (entry: PluginEntry) => [entry.discovered.source === 'bundled' ? 0 : 1, entry.discovered.id] as const;
    const active = this.entries.filter((entry) => this.isActive(entry)).sort((a, b) => {
      const [sa, ia] = order(a);
      const [sb, ib] = order(b);
      return sa - sb || (ia < ib ? -1 : ia > ib ? 1 : 0);
    });

    this.filters = new Map();
    this.providers = new Map();
    this.aiProviders = new Map();
    for (const entry of this.entries) entry.conflictWarnings = [];
    for (const entry of active) {
      const manifest = entry.discovered.manifest!;
      for (const definition of entry.contributed) {
        const owner = this.filters.get(definition.name);
        if (owner) {
          entry.conflictWarnings.push(`filter "${definition.name}" is not available: plugin "${owner.pluginId}" already provides it`);
          continue;
        }
        this.filters.set(definition.name, {
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          definition: definition as RegisteredFilter['definition'],
          host: entry.host,
        });
      }
      for (const definition of entry.providers) {
        const owner = this.providers.get(definition.id);
        if (owner) {
          entry.conflictWarnings.push(`auth provider "${definition.id}" is not available: plugin "${owner.pluginId}" already provides it`);
          continue;
        }
        this.providers.set(definition.id, { pluginId: manifest.id, definition });
      }
      for (const definition of entry.aiProviders) {
        const owner = this.aiProviders.get(definition.id);
        if (owner) {
          entry.conflictWarnings.push(`AI provider "${definition.id}" is not available: plugin "${owner.pluginId}" already provides it`);
          continue;
        }
        this.aiProviders.set(definition.id, { pluginId: manifest.id, definition: definition as RegisteredAiProvider['definition'], host: entry.host });
      }
    }
  }

  /** Auth providers of active plugins, bundled first, then external by plugin id. */
  getAuthProviders(): RegisteredAuthProvider[] {
    return [...this.providers.values()];
  }

  getAuthProvider(id: string): RegisteredAuthProvider | undefined {
    return this.providers.get(id);
  }

  /** AI providers of active plugins, bundled first, then external by plugin id. */
  getAiProviders(): RegisteredAiProvider[] {
    return [...this.aiProviders.values()];
  }

  getAiProvider(id: string): RegisteredAiProvider | undefined {
    return this.aiProviders.get(id);
  }

  /**
   * The icon file of a filter, when the plugin is active, provides that filter and its icon is usable.
   * Tells an unknown or inactive plugin apart from a filter without an icon.
   */
  getFilterIcon(pluginId: string, filterName: string): { file: string } | { missing: 'plugin' | 'filter' } {
    const entry = this.find(pluginId);
    if (!entry || !this.isActive(entry)) return { missing: 'plugin' };
    const file = this.filters.get(filterName)?.pluginId === pluginId ? entry.icons.get(filterName) : undefined;
    return file ? { file } : { missing: 'filter' };
  }

  /** The filter with this name from a plugin that is on, if any. */
  getFilter(name: string): RegisteredFilter | undefined {
    return this.filters.get(name);
  }

  private find(id: string): PluginEntry | undefined {
    return this.entries.find((entry) => entry.discovered.id === id);
  }

  private info(entry: PluginEntry, lang: string): PluginInfo {
    const { discovered } = entry;
    const { partial } = discovered;
    const on = this.isOn(entry);
    const status = !discovered.manifest || (on && entry.loadError) ? 'error' : this.isActive(entry) ? 'active' : 'off';
    const level = discovered.manifest?.level ?? partial.level ?? DEFAULT_PLUGIN_LEVEL;
    const filters: FilterInfo[] = status !== 'active' ? [] : entry.contributed
      .filter((definition) => this.filters.get(definition.name)?.pluginId === discovered.id)
      .map((definition) => {
        const info: FilterInfo = {
          name: definition.name,
          label: localize(definition.label, lang),
          group: definition.group,
          params: (definition.params ?? []).map((param) => paramInfo(param, lang)),
          level: definition.level ?? level,
        };
        if (entry.icons.has(definition.name)) {
          const version = encodeURIComponent(partial.version ?? '');
          info.iconUrl = `/api/plugins/${encodeURIComponent(discovered.id)}/filters/${encodeURIComponent(definition.name)}/icon?v=${version}`;
        }
        return info;
      });
    const authProviders: AuthProviderInfo[] = status !== 'active' ? [] : entry.providers
      .filter((definition) => this.providers.get(definition.id)?.pluginId === discovered.id)
      .map((definition) => authProviderInfo(definition, lang));
    const aiProviders: AiProviderSummary[] = status !== 'active' ? [] : entry.aiProviders
      .filter((definition) => this.aiProviders.get(definition.id)?.pluginId === discovered.id)
      .map((definition) => ({ id: definition.id, label: localize(definition.label, lang) }));
    return {
      id: discovered.id,
      name: partial.name ? localize(partial.name, lang) : path.basename(discovered.folder),
      description: partial.description ? localize(partial.description, lang) : '',
      version: partial.version ?? null,
      source: discovered.source,
      level,
      enabled: on,
      status,
      error: discovered.error ?? (on ? entry.loadError : null),
      warnings: on ? [...entry.contributionWarnings, ...entry.conflictWarnings] : [],
      filters,
      authProviders,
      aiProviders,
    };
  }

  /** Every plugin found at startup, with texts in `lang`. */
  list(lang = 'en'): PluginInfo[] {
    return this.entries.map((entry) => this.info(entry, lang));
  }

  get(id: string, lang = 'en'): PluginInfo | undefined {
    const entry = this.find(id);
    return entry && this.info(entry, lang);
  }

  /**
   * Switches a plugin on or off and saves the choice. Switching on loads it (retrying after a load error).
   * Throws PluginRegistryError for an unknown plugin or one that cannot be used, or the state write error.
   */
  async setEnabled(id: string, enabled: boolean, lang = 'en'): Promise<PluginInfo> {
    await this.init();
    const entry = this.find(id);
    if (!entry) throw new PluginRegistryError('not_found', `Plugin ${id} not found`);
    if (!entry.discovered.manifest) {
      throw new PluginRegistryError('unavailable', `Plugin ${id} cannot be used: ${entry.discovered.error}`);
    }
    if (!enabled && this.options.requireLoginProvider?.() && this.isActive(entry)) {
      const remaining = [...this.providers.values()]
        .filter((provider) => provider.pluginId !== id && provider.definition.kind === 'credentials');
      const ownsLogin = [...this.providers.values()].some((provider) => provider.pluginId === id && provider.definition.kind === 'credentials');
      if (ownsLogin && remaining.length === 0) {
        throw new PluginRegistryError('last_login_provider', `Plugin ${id} provides the last login method; at least one must stay on`);
      }
    }
    await this.state.setEnabled(id, enabled);
    if (enabled) await this.load(entry);
    this.rebuildFilters();
    this.epoch += 1;
    console.log(`Plugin ${id} switched ${enabled ? 'on' : 'off'}`);
    return this.info(entry, lang);
  }
}
