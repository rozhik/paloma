import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiTask, MeResponse, Permission, Photo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { useAuthStore } from '../auth/authStore.js';
import { DEFAULT_UI_SETTINGS, useUiSettings } from '../settings/uiSettings.js';
import { AiMenu, AiMenuItems } from './AiMenu.js';
import { useAiTasks } from './aiTasks.js';

const task = (patch: Partial<AiTask>): AiTask => ({
  id: 'tags', builtIn: true, name: null, output: 'tags', inMenu: true, provider: 'openai', model: 'gpt-x', prompt: 'p', modelOptions: {},
  options: { imageSize: 1024, language: 'user', parallel: 2 }, ready: true, problem: null, ...patch,
});
const photos = [{ id: 1 }, { id: 2 }] as Photo[];
const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

/** Sets a store's state also for static rendering, which reads the initial state. */
function patch<T extends object>(store: { setState: (p: Partial<T>) => void; getInitialState: () => T }, value: Partial<T>) {
  store.setState(value);
  Object.assign(store.getInitialState(), value);
}

function setLevel(level: typeof DEFAULT_UI_SETTINGS.level) {
  patch(useUiSettings, { level });
}

function signIn(permissions: Permission[]) {
  const me: MeResponse = {
    mode: 'on', via: 'session',
    user: { id: 'u', username: 'ben', displayName: 'Ben', roleId: 'r', roleName: 'R', mustChangePassword: false, personId: null, personName: null, personVisible: false, avatarUrl: null },
    permissions, access: { all: true }, quotas: [],
  };
  patch(useAuthStore, { me, phase: 'ready' });
}

beforeAll(async () => {
  await initI18n('en');
  patch(useAiTasks, { tasks: [task({})], loading: Promise.resolve() });
});

afterEach(() => {
  setLevel(DEFAULT_UI_SETTINGS.level);
  patch(useAuthStore, { me: null, phase: 'loading' });
});

describe('AI menu in grid headers', () => {
  it('is offered at Normal next to Find faces', () => {
    expect(html(<AiMenu photos={photos} />)).toContain(i18n.t('ai.menu.button'));
  });

  it('is not offered at Easy, for viewers, or on an empty grid', () => {
    setLevel('easy');
    expect(html(<AiMenu photos={photos} />)).toBe('');
    setLevel('normal');
    signIn(['library.view']);
    expect(html(<AiMenu photos={photos} />)).toBe('');
    signIn(['library.view', 'ai.run']);
    expect(html(<AiMenu photos={[]} />)).toBe('');
    expect(html(<AiMenu photos={photos} />)).toContain(i18n.t('ai.menu.button'));
  });
});

describe('AI menu items', () => {
  it('lists each task and Run again for it', () => {
    const markup = html(<AiMenuItems tasks={[task({}), task({ id: 't-1', builtIn: false, name: 'Landmarks' })]} onRun={() => {}} />);
    expect(markup).toContain(i18n.t('ai.task.tags'));
    expect(markup).toContain('Landmarks');
    expect(markup).toContain(i18n.t('ai.menu.runAgain'));
    expect(markup.match(/data-ai-task="t-1"/g)).toHaveLength(2);
    expect(markup.match(/data-ai-again="true"/g)).toHaveLength(2);
  });

  it('disables a task that is not ready and says why', () => {
    const markup = html(<AiMenuItems tasks={[task({ ready: false, problem: 'provider_not_configured' })]} onRun={() => {}} />);
    expect(markup).toContain(i18n.t('ai.problem.provider_not_configured'));
    expect(markup).toMatch(/data-ai-task="tags"[^>]*aria-disabled="true"/);
  });

  it('keeps ready tasks available: a run started while another exists waits in the queue', () => {
    const markup = html(<AiMenuItems tasks={[task({})]} onRun={() => {}} />);
    expect(markup).not.toMatch(/data-ai-task="tags"[^>]*aria-disabled="true"/);
  });

  it('links to the AI settings only for those who may configure them', () => {
    expect(html(<AiMenuItems tasks={[]} onRun={() => {}} />)).toContain(i18n.t('ai.menu.settings'));
    signIn(['library.view', 'ai.run']);
    const markup = html(<AiMenuItems tasks={[]} onRun={() => {}} />);
    expect(markup).not.toContain(i18n.t('ai.menu.settings'));
    expect(markup).toContain(i18n.t('ai.menu.empty'));
  });
});
