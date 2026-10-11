import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeResponse } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { AuthGate, LoginPage, SetupPage, newPasswordProblem } from './AuthPages.js';
import { useAuthStore } from './authStore.js';

/** Sets the auth state for a server render: zustand renders its initial state there, so that is changed too. */
function setAuth(patch: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState(patch);
  Object.assign(useAuthStore.getInitialState(), patch);
}

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  setAuth({ phase: 'loading', status: null, me: null, lastUserId: null });
});

const password = {
  id: 'password', kind: 'credentials' as const, label: 'Password',
  fields: [{ name: 'username', label: 'Username', type: 'text' as const }, { name: 'password', label: 'Password', type: 'password' as const }],
};
const pin = { id: 'pin', kind: 'credentials' as const, label: 'PIN login', fields: [{ name: 'pin', label: 'PIN', type: 'password' as const }] };

describe('LoginPage', () => {
  it('has one form per login provider, with its fields', () => {
    const markup = renderToStaticMarkup(<LoginPage providers={[password, pin]} />);
    expect(markup.match(/<form/g)).toHaveLength(2);
    expect(markup).toContain('id="login-password-username"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('id="login-pin-pin"');
    expect(markup).toContain('PIN login');
  });

  it('says when no way to log in is on', () => {
    expect(renderToStaticMarkup(<LoginPage providers={[]} />)).toContain(i18n.t('auth.noProviders'));
  });
});

describe('SetupPage', () => {
  it('scrolls by itself when the window is lower than the page', () => {
    const markup = renderToStaticMarkup(<SetupPage />);
    // The page, not <body>, scrolls; the card is centered with margins, which keep its top reachable
    expect(markup).toMatch(/<main class="[^"]*\bvh-100\b[^"]*\boverflow-auto\b/);
    expect(markup.match(/<main class="([^"]*)"/)![1]).not.toContain('align-items-center');
    expect(markup).toMatch(/class="card [^"]*\bm-auto\b/);
  });

  it('asks for the setup code, username, name and the password twice', () => {
    const markup = renderToStaticMarkup(<SetupPage />);
    for (const id of ['setup-code', 'setup-username', 'setup-name', 'setup-password', 'setup-again']) expect(markup, id).toContain(`id="${id}"`);
  });
});

describe('newPasswordProblem', () => {
  it('needs 8 characters and the same password twice', () => {
    expect(newPasswordProblem('short', 'short')).toBe('auth.passwordHint');
    expect(newPasswordProblem('correct horse', 'correct house')).toBe('auth.passwordsDiffer');
    expect(newPasswordProblem('correct horse', 'correct horse')).toBeNull();
  });
});

describe('AuthGate', () => {
  const page = () => renderToStaticMarkup(<AuthGate><p>the app</p></AuthGate>);

  it('shows the page each phase needs, and the app only when ready', () => {
    expect(page()).toContain(i18n.t('auth.loading'));
    setAuth({ phase: 'setup' });
    expect(page()).toContain(i18n.t('auth.setupTitle'));
    setAuth({ phase: 'login', status: { mode: 'on', setupPending: false, providers: [password] } });
    expect(page()).toContain(i18n.t('auth.loginTitle'));
    setAuth({ phase: 'changePassword' });
    expect(page()).toContain(i18n.t('auth.changePasswordTitle'));
    setAuth({ phase: 'error' });
    expect(page()).toContain(i18n.t('auth.serverError'));
    setAuth({ phase: 'ready', me: { mode: 'off' } as MeResponse });
    expect(page()).toBe('<p>the app</p>');
  });
});
