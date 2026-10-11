import { describe, it, expect } from 'vitest';
import type { UserInfo } from '../../../shared/types.js';
import { emptyUserForm, formFromUser, toggled, userInputFromForm } from './userForm.js';

const user: UserInfo = {
  id: 'u1', username: 'ben', displayName: 'Ben', roleId: 'viewer', enabled: true, mustChangePassword: false,
  access: { all: false, folders: ['/photos/2024'], albums: ['trip'] },
  quotas: [
    { kind: 'export_bytes', limit: 500 * 1024 * 1024, effectiveLimit: 500 * 1024 * 1024, used: 0 },
    { kind: 'requests_per_minute', limit: null, effectiveLimit: 600 },
  ],
  personId: null, personName: null, avatarUrl: null,
  createdAt: '', lastLoginAt: null,
};

describe('user form', () => {
  it('shows an existing user with their access and quotas in megabytes', () => {
    expect(formFromUser(user)).toEqual({
      username: 'ben', displayName: 'Ben', roleId: 'viewer', password: '', accessAll: false,
      folders: ['/photos/2024'], albums: ['trip'], exportMb: '500', rate: '', personId: null, personName: null,
    });
  });

  it('turns the form into a request body', () => {
    const changed = { ...formFromUser(user), exportMb: '1024', rate: '120' };
    expect(userInputFromForm(changed, false)).toEqual({ input: {
      displayName: 'Ben', roleId: 'viewer',
      access: { all: false, folders: ['/photos/2024'], albums: ['trip'] },
      quotas: { export_bytes: 1024 * 1024 * 1024, requests_per_minute: 120 }, personId: null,
    } });
  });

  it('adds username and password for a new user and uses the username as the default name', () => {
    const result = userInputFromForm({ ...emptyUserForm(), username: ' carol ', password: 'correct horse' }, true);
    expect(result).toEqual({ input: {
      username: 'carol', password: 'correct horse', displayName: 'carol', roleId: 'viewer', access: { all: true },
      quotas: { export_bytes: null, requests_per_minute: null }, personId: null,
    } });
  });

  it('links and unlinks a person', () => {
    const linked = { ...formFromUser({ ...user, personId: 'aaaaaaaaaaaaaaaa', personName: 'Ben Avery' }) };
    expect(linked).toMatchObject({ personId: 'aaaaaaaaaaaaaaaa', personName: 'Ben Avery' });
    const result = userInputFromForm({ ...linked, personId: null, personName: null }, false);
    expect('input' in result && result.input.personId).toBeNull();
  });

  it('names a quota that is not a number', () => {
    expect(userInputFromForm({ ...emptyUserForm(), exportMb: 'lots' }, false)).toEqual({ invalid: 'exportMb' });
    expect(userInputFromForm({ ...emptyUserForm(), rate: '-5' }, false)).toEqual({ invalid: 'rate' });
  });

  it('toggles list values', () => {
    expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggled(['a'], 'c')).toEqual(['a', 'c']);
  });
});
