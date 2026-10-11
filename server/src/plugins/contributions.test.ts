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
