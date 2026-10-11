import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ServerInfo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { ServerSection, ServerSettingsView } from './ServerSettingsView.js';

const info: ServerInfo = {
  version: '1.0.0', authMode: 'on', photosDirs: ['/photos/family', '/photos/work'], excludeDirs: [],
  exportDir: '/data/export', dataDir: '/data', pluginsDir: '/data/plugins', sessionDays: 30, rateLimit: 300,
  mcp: { enabled: true, path: '/api/mcp' },
};

beforeAll(async () => {
  await initI18n('en');
});

describe('Server settings', () => {
  it('shows the configuration read-only, saying it comes from .env', () => {
    const markup = renderToStaticMarkup(<ServerSection info={info} />);
    for (const text of ['/photos/family', '/photos/work', '/data/export', '>300<', '1.0.0', i18n.t('server.usersOn'), i18n.t('server.none')]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toContain(i18n.t('server.envHint').replace(/'/g, '&#x27;'));
    expect(markup).not.toContain('<input');
  });

  it('shows no limit and users off', () => {
    const markup = renderToStaticMarkup(<ServerSection info={{ ...info, authMode: 'off', rateLimit: null }} />);
    expect(markup).toContain(i18n.t('server.usersOff'));
    expect(markup).toContain(i18n.t('server.unlimited'));
  });

  it('shows MCP on with its address and that clients need a token', () => {
    const markup = renderToStaticMarkup(<ServerSection info={info} origin="http://localhost:3000" />);
    expect(markup).toContain(i18n.t('server.mcpOn'));
    expect(markup).toContain('http://localhost:3000/api/mcp');
    expect(markup).toContain(i18n.t('server.mcpToken'));
  });

  it('shows MCP off without an address', () => {
    const markup = renderToStaticMarkup(<ServerSection info={{ ...info, mcp: { enabled: false, path: '/api/mcp' } }} origin="http://localhost:3000" />);
    expect(markup).toContain(i18n.t('server.mcpOff'));
    expect(markup).not.toContain('/api/mcp');
  });

  it('has the Plugins section', () => {
    const markup = renderToStaticMarkup(<ServerSettingsView />);
    expect(markup).toContain(i18n.t('server.title'));
    expect(markup).toContain(i18n.t('plugins.title'));
  });
});
