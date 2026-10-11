import { describe, it, expect } from 'vitest';
import { checkContributions } from './contributions.js';

const login = async () => null;
const password = {
  id: 'password', label: { en: 'Password', uk: 'Пароль' }, kind: 'credentials',
  fields: [{ name: 'username', label: 'Username', type: 'text' }, { name: 'password', label: 'Password', type: 'password' }],
  login, setSecret: async () => {}, checkSecret: async () => false,
};
const token = { id: 'token', label: 'API token', kind: 'bearer', authenticate: async () => null };

describe('checkContributions: auth providers', () => {
  it('accepts credentials and bearer providers', () => {
    const checked = checkContributions({ authProviders: [password, token] });
    expect(checked.authProviders.map((p) => p.id)).toEqual(['password', 'token']);
    expect(checked.warnings).toEqual([]);
  });

  it('drops a provider of an unknown kind with a warning naming it', () => {
    const checked = checkContributions({ authProviders: [{ id: 'oidc', label: 'OIDC', kind: 'redirect' }, token] });
    expect(checked.authProviders.map((p) => p.id)).toEqual(['token']);
    expect(checked.warnings).toEqual([expect.stringMatching(/auth provider "oidc" has kind "redirect".*not available/)]);
  });

  it('drops invalid providers', () => {
    const invalid = [
      { ...password, id: 'Bad Id' },
      { ...password, id: 'nolabel', label: 5 },
      { ...password, id: 'nologin', login: undefined },
      { ...password, id: 'nofields', fields: [] },
      { ...password, id: 'badfield', fields: [{ name: 'x', label: 'X', type: 'checkbox' }] },
      { ...password, id: 'halfsecret', checkSecret: undefined },
      { ...token, id: 'noauth', authenticate: 'yes' },
    ];
    const checked = checkContributions({ authProviders: invalid });
    expect(checked.authProviders).toEqual([]);
    expect(checked.warnings).toHaveLength(invalid.length);
  });

  it('keeps the first of two providers with the same id', () => {
    const checked = checkContributions({ authProviders: [token, { ...token, label: 'Other' }] });
    expect(checked.authProviders).toHaveLength(1);
    expect(checked.warnings).toEqual([expect.stringContaining('"token" is declared twice')]);
  });

  it('ignores authProviders that is not a list', () => {
    expect(checkContributions({ authProviders: {} }).warnings).toEqual(['"authProviders" is not a list and is ignored']);
  });
});

describe('checkContributions: AI providers', () => {
  const provider = (extra: Record<string, unknown> = {}) => ({
    id: 'vision',
    label: { en: 'Vision', uk: 'Зір' },
    settings: [
      { name: 'apiKey', label: 'API key', type: 'secret', required: true },
      { name: 'timeout', label: 'Timeout', type: 'number', min: 1, max: 60, default: 30 },
      { name: 'mode', label: 'Mode', type: 'choice', options: [{ value: 'a', label: 'A' }], default: 'a' },
    ],
    modelOptions: [{ name: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.2 }],
    listModels: async () => [],
    run: async () => ({}),
    ...extra,
  });

  it('accepts a valid provider', () => {
    const checked = checkContributions({ aiProviders: [provider()] });
    expect(checked.warnings).toEqual([]);
    expect(checked.aiProviders.map((p) => [p.id, p.settings?.length, p.modelOptions?.length])).toEqual([['vision', 3, 1]]);
  });

  it('fills in empty settings and model options', () => {
    const checked = checkContributions({ aiProviders: [provider({ settings: undefined, modelOptions: undefined })] });
    expect(checked.aiProviders[0]).toMatchObject({ settings: [], modelOptions: [] });
  });

  it('drops a provider without a label with a warning naming it', () => {
    const checked = checkContributions({ aiProviders: [provider({ label: undefined }), provider({ id: 'other' })] });
    expect(checked.aiProviders.map((p) => p.id)).toEqual(['other']);
    expect(checked.warnings).toEqual(['AI provider "vision" has no valid label; the AI provider is not available']);
  });

  it('drops a provider with a setting of an unknown type', () => {
    const checked = checkContributions({ aiProviders: [provider({ settings: [{ name: 'x', label: 'X', type: 'color' }] })] });
    expect(checked.aiProviders).toEqual([]);
    expect(checked.warnings[0]).toContain('setting "x" has unknown type "color"');
  });

  it('refuses a default for a secret', () => {
    const checked = checkContributions({ aiProviders: [provider({ settings: [{ name: 'key', label: 'Key', type: 'secret', default: 'sk' }] })] });
    expect(checked.warnings[0]).toContain('setting "key" is a secret and cannot have a default');
  });

  it('refuses a rectangle model option', () => {
    const rect = { name: 'area', label: 'Area', type: 'rect', default: { left: 0, top: 0, right: 1, bottom: 1 } };
    const checked = checkContributions({ aiProviders: [provider({ modelOptions: [rect] })] });
    expect(checked.aiProviders).toEqual([]);
    expect(checked.warnings[0]).toContain('model option "area" cannot be a rectangle');
  });

  it('needs listModels and run', () => {
    expect(checkContributions({ aiProviders: [provider({ run: undefined })] }).warnings[0]).toContain('has no run function');
    expect(checkContributions({ aiProviders: [provider({ listModels: 'x' })] }).warnings[0]).toContain('has no listModels function');
  });

  it('keeps the first of two providers with the same id', () => {
    const checked = checkContributions({ aiProviders: [provider(), provider({ label: 'Second' })] });
    expect(checked.aiProviders.map((p) => p.label)).toEqual([{ en: 'Vision', uk: 'Зір' }]);
    expect(checked.warnings).toEqual(['AI provider "vision" is declared twice; the second one is ignored']);
  });
});
