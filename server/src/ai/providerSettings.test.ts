import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import type { RegisteredAiProvider } from '../plugins/registry.js';
import type { StoredProvider } from './store.js';
import { aiContext, effectiveSettings, envFor, missingSettings, parseSettingsUpdate, providerInfo } from './providerSettings.js';

const DEFAULT_URL = 'https://api.openai.com/v1';

/** Like the bundled OpenAI provider: the key is needed only for OpenAI's own address, unless the environment gives it. */
const provider: RegisteredAiProvider = {
  pluginId: 'ai-openai',
  host: { apiVersion: 1, sharp, log: { info() {}, warn() {}, error() {} } },
  definition: {
    id: 'openai',
    label: { en: 'OpenAI', uk: 'OpenAI' },
    settings: [
      { name: 'apiKey', label: { en: 'API key', uk: 'API-ключ' }, type: 'secret' },
      { name: 'baseUrl', label: 'Base URL', type: 'text', default: DEFAULT_URL },
      { name: 'timeoutSeconds', label: 'Timeout', type: 'number', min: 5, max: 600, default: 60 },
      { name: 'org', label: 'Organization', type: 'text', required: true },
    ],
    missingSettings: ({ settings, env }) => (settings.baseUrl === DEFAULT_URL && !settings.apiKey && !env.OPENAI_API_KEY ? ['apiKey'] : []),
    settingFromEnv: (name, { env }) => name === 'apiKey' && Boolean(env.OPENAI_API_KEY),
    modelOptions: [{ name: 'detail', label: 'Detail', type: 'choice', options: [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }], default: 'auto' }],
    listModels: async () => [],
    run: async () => ({}),
  },
};
const { definition } = provider;
const stored = (settings: StoredProvider['settings'], id = 'openai'): StoredProvider => ({ id, name: 'OpenAI', type: 'openai', settings });

describe('provider settings', () => {
  it('is not configured without a key, naming it', () => {
    expect(missingSettings(definition, { org: 'o' }, {})).toEqual(['apiKey']);
    expect(providerInfo(provider, stored({ org: 'o' }), {})).toMatchObject({ status: 'not_configured', missing: ['apiKey'] });
  });

  it('is configured with a saved key', () => {
    expect(providerInfo(provider, stored({ org: 'o', apiKey: 'sk-1' }), {})).toMatchObject({ status: 'configured', missing: [] });
  });

  it('takes the key from the environment and says so', () => {
    const info = providerInfo(provider, stored({ org: 'o' }), { OPENAI_API_KEY: 'sk-env' });
    expect(info.status).toBe('configured');
    expect(info.settings.find((s) => s.name === 'apiKey')).toMatchObject({ set: false, fromEnv: true, value: null });
  });

  it('needs no key for another address', () => {
    expect(missingSettings(definition, { org: 'o', baseUrl: 'http://localhost:11434/v1' }, {})).toEqual([]);
  });

  it('names a required setting without a value', () => {
    expect(missingSettings(definition, { apiKey: 'k' }, {})).toEqual(['org']);
  });

  it('never lists a secret value', () => {
    const info = providerInfo(provider, stored({ org: 'o', apiKey: 'sk-secret' }), {}, 'uk');
    expect(JSON.stringify(info)).not.toContain('sk-secret');
    expect(info.settings[0]).toMatchObject({ name: 'apiKey', label: 'API-ключ', type: 'secret', set: true, value: null });
    expect(info.settings[1]).toMatchObject({ name: 'baseUrl', value: null, default: DEFAULT_URL });
    expect(info.modelOptions).toEqual([{ name: 'detail', label: 'Detail', type: 'choice', options: [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }], default: 'auto' }]);
  });

  it('fills in defaults for the provider calls, without secrets', () => {
    expect(effectiveSettings(definition, { apiKey: 'k', org: 'o' })).toEqual({ apiKey: 'k', baseUrl: DEFAULT_URL, timeoutSeconds: 60, org: 'o' });
    const ctx = aiContext(provider, stored({ org: 'o' }), { X: '1' }, new AbortController().signal);
    expect(ctx.settings).toEqual({ baseUrl: DEFAULT_URL, timeoutSeconds: 60, org: 'o' });
    expect(ctx.env).toEqual({ X: '1' });
  });

  it('gives the server environment only to the provider openai', () => {
    const env = { OPENAI_API_KEY: 'sk-env' };
    expect(envFor('openai', env)).toBe(env);
    expect(envFor('p-2', env)).toEqual({});
    expect(aiContext(provider, stored({ org: 'o' }, 'p-2'), env, new AbortController().signal).env).toEqual({});
    expect(providerInfo(provider, stored({ org: 'o' }, 'p-2'), env)).toMatchObject({ status: 'not_configured', missing: ['apiKey'] });
    expect(providerInfo(provider, stored({ org: 'o' }), env)).toMatchObject({ id: 'openai', name: 'OpenAI', type: 'openai', available: true, status: 'configured' });
  });
});

describe('parseSettingsUpdate', () => {
  const saved = { apiKey: 'sk-old', org: 'o', baseUrl: 'http://a' };

  it('keeps the saved key when only the base URL changes', () => {
    expect(parseSettingsUpdate(definition, { baseUrl: 'http://b' }, saved, {})).toEqual({ values: { apiKey: 'sk-old', org: 'o', baseUrl: 'http://b' } });
  });

  it('removes the key when it is saved empty', () => {
    expect(parseSettingsUpdate(definition, { apiKey: '' }, saved, {})).toEqual({ values: { org: 'o', baseUrl: 'http://a' } });
  });

  it('replaces the key', () => {
    expect(parseSettingsUpdate(definition, { apiKey: 'sk-new' }, saved, {})).toMatchObject({ values: { apiKey: 'sk-new' } });
  });

  it('refuses a value of the wrong type, naming the setting', () => {
    expect(parseSettingsUpdate(definition, { timeoutSeconds: 'fast' }, saved, {})).toEqual({ field: 'timeoutSeconds', message: 'timeoutSeconds must be a number from 5 to 600' });
    expect(parseSettingsUpdate(definition, { timeoutSeconds: 1000 }, saved, {})).toMatchObject({ field: 'timeoutSeconds' });
  });

  it('refuses an unknown setting and a required one left empty', () => {
    expect(parseSettingsUpdate(definition, { color: 'red' }, saved, {})).toMatchObject({ field: 'color' });
    expect(parseSettingsUpdate(definition, { org: '' }, saved, {})).toEqual({ field: 'org', message: 'org is required' });
  });

  it('drops saved values of settings the provider no longer declares', () => {
    expect(parseSettingsUpdate(definition, {}, { ...saved, old: 'x' }, {})).toEqual({ values: saved });
  });
});
