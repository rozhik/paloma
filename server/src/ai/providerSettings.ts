import type { AiModelOptionInfo, AiProviderInfo, AiSettingInfo } from '../../../shared/types.js';
import type { AiContext, AiSettingDefinition, PluginLog } from '../plugins/api.js';
import { localize } from '../plugins/manifest.js';
import { paramInfo, type RegisteredAiProvider } from '../plugins/registry.js';
import type { SettingValue, StoredProvider } from './store.js';

export type ProviderDefinition = RegisteredAiProvider['definition'];
export type Env = Record<string, string | undefined>;
type Saved = Record<string, SettingValue>;

/** The id of the provider that may take values from the server environment (`OPENAI_API_KEY`, `OPENAI_BASE_URL`). */
export const ENV_PROVIDER_ID = 'openai';

/** The environment a provider sees: the server's for the provider `openai`, nothing for the others. */
export const envFor = (providerId: string, env: Env): Env => (providerId === ENV_PROVIDER_ID ? env : {});

const hasValue = (value: SettingValue | undefined): value is SettingValue => value !== undefined && value !== '';

/** Whether the provider says the environment gives a setting that has no saved value. */
function fromEnv(definition: ProviderDefinition, name: string, env: Env): boolean {
  try {
    return definition.settingFromEnv?.(name, { env }) === true;
  } catch {
    return false;
  }
}

/** The saved values of the declared settings, with the defaults of the others filled in. */
export function effectiveSettings(definition: ProviderDefinition, saved: Saved = {}): Saved {
  const values: Saved = {};
  for (const setting of definition.settings) {
    const value = saved[setting.name];
    if (hasValue(value)) values[setting.name] = value;
    else if (setting.default !== undefined && setting.type !== 'secret') values[setting.name] = setting.default;
  }
  return values;
}

/**
 * The settings that still need a value: required ones without a saved value that the environment does not give,
 * and those the provider names for the current values. Empty when the provider is configured.
 */
export function missingSettings(definition: ProviderDefinition, saved: Saved, env: Env): string[] {
  const missing = definition.settings
    .filter((setting) => setting.required && !hasValue(saved[setting.name]) && !fromEnv(definition, setting.name, env))
    .map((setting) => setting.name);
  let named: unknown = [];
  try {
    named = definition.missingSettings?.({ settings: effectiveSettings(definition, saved), env }) ?? [];
  } catch {
    named = [];
  }
  for (const name of Array.isArray(named) ? named : []) {
    if (typeof name === 'string' && !missing.includes(name)) missing.push(name);
  }
  return missing;
}

function settingInfo(definition: ProviderDefinition, setting: AiSettingDefinition, saved: Saved, env: Env, lang: string): AiSettingInfo {
  const value = saved[setting.name];
  const info: AiSettingInfo = {
    name: setting.name,
    label: localize(setting.label, lang),
    type: setting.type,
    required: setting.required === true,
    value: setting.type === 'secret' || !hasValue(value) ? null : value,
  };
  if (setting.help !== undefined) info.help = localize(setting.help, lang);
  if (setting.default !== undefined) info.default = setting.default;
  if (setting.min !== undefined) info.min = setting.min;
  if (setting.max !== undefined) info.max = setting.max;
  if (setting.options) info.options = setting.options.map((option) => ({ value: option.value, label: localize(option.label, lang) }));
  if (setting.type === 'secret') info.set = hasValue(value);
  if (!hasValue(value) && fromEnv(definition, setting.name, env)) info.fromEnv = true;
  return info;
}

/** A provider as `GET /api/ai/providers` lists it: secrets only as set or not set. */
export function providerInfo(provider: RegisteredAiProvider, stored: StoredProvider, env: Env = {}, lang = 'en'): AiProviderInfo {
  const { definition } = provider;
  const providerEnv = envFor(stored.id, env);
  const missing = missingSettings(definition, stored.settings, providerEnv);
  return {
    id: stored.id,
    name: stored.name,
    type: definition.id,
    pluginId: provider.pluginId,
    label: localize(definition.label, lang),
    available: true,
    settings: definition.settings.map((setting) => settingInfo(definition, setting, stored.settings, providerEnv, lang)),
    status: missing.length === 0 ? 'configured' : 'not_configured',
    missing,
    modelOptions: definition.modelOptions.map((option) => paramInfo(option, lang) as AiModelOptionInfo),
  };
}

/** A provider whose type no active plugin contributes: it keeps its settings and models but cannot be used. */
export function unavailableProviderInfo(stored: StoredProvider): AiProviderInfo {
  return {
    id: stored.id, name: stored.name, type: stored.type, pluginId: '', label: stored.type, available: false, settings: [],
    status: 'not_configured', missing: [], modelOptions: [],
  };
}

export type SettingsUpdate = { values: Saved } | { field: string; message: string };

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Why a value cannot be saved for a setting, or null when it can. */
function valueProblem(setting: AiSettingDefinition, value: unknown): string | null {
  switch (setting.type) {
    case 'text':
    case 'secret':
      return typeof value === 'string' && value.length <= 10000 ? null : 'a text';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'true or false';
    case 'number': {
      const range = `a number${setting.min !== undefined ? ` from ${setting.min}` : ''}${setting.max !== undefined ? ` to ${setting.max}` : ''}`;
      if (!isNumber(value)) return range;
      return (setting.min !== undefined && value < setting.min) || (setting.max !== undefined && value > setting.max) ? range : null;
    }
    case 'choice':
      return setting.options?.some((option) => option.value === value) ? null : `one of ${setting.options?.map((o) => JSON.stringify(o.value)).join(', ')}`;
  }
}

/**
 * The settings to save from a `PUT .../settings` body of setting names to values. A secret left out keeps its
 * saved value and an empty one removes it; `null` or an empty text removes any value. A value of the wrong type,
 * an unknown name, or a required setting left without a value fails naming the setting.
 */
export function parseSettingsUpdate(definition: ProviderDefinition, body: unknown, saved: Saved, env: Env): SettingsUpdate {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { field: '', message: 'Body must be an object of settings' };
  const values: Saved = Object.fromEntries(Object.entries(saved).filter(([name]) => definition.settings.some((s) => s.name === name)));
  for (const [name, value] of Object.entries(body)) {
    const setting = definition.settings.find((s) => s.name === name);
    if (!setting) return { field: name, message: `${name} is not a setting of ${definition.id}` };
    if (value === null || value === '') {
      delete values[name];
      continue;
    }
    const problem = valueProblem(setting, value);
    if (problem) return { field: name, message: `${name} must be ${problem}` };
    values[name] = value as SettingValue;
  }
  for (const setting of definition.settings) {
    // A secret that is not sent keeps its value; other settings that are not sent keep theirs too
    if (setting.required && !hasValue(values[setting.name]) && !fromEnv(definition, setting.name, env)) {
      return { field: setting.name, message: `${setting.name} is required` };
    }
  }
  return { values };
}

/** What a provider call gets: settings with defaults, the environment, an abort signal and a log. */
export function aiContext(provider: RegisteredAiProvider, stored: StoredProvider, env: Env, signal: AbortSignal): AiContext {
  const log: PluginLog = provider.host.log;
  return { settings: effectiveSettings(provider.definition, stored.settings), env: envFor(stored.id, env), signal, log };
}
