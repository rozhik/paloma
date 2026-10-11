import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiProviderInfo, AiRunInfo, AiTask } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { ServerSettingsView } from '../components/ServerSettingsView.js';
import { ProviderCard, ProvidersPanel, changedValues } from './ProvidersPanel.js';
import { TasksList } from './AiSection.js';
import { draftOf, optionsForOutput, taskInput } from './TaskEditor.js';
import { providerAddress, runMessage, taskName } from './aiText.js';

const openai: AiProviderInfo = {
  id: 'openai', pluginId: 'ai-openai', label: 'OpenAI', status: 'configured', missing: [],
  settings: [
    { name: 'apiKey', label: 'API key', type: 'secret', required: false, value: null, set: true },
    { name: 'baseUrl', label: 'Server address', type: 'text', required: false, value: null, default: 'https://api.openai.com/v1' },
    { name: 'timeoutSeconds', label: 'Timeout', type: 'number', required: false, value: 30, default: 60, min: 5, max: 600 },
  ],
  modelOptions: [{ name: 'detail', label: 'Detail', type: 'choice', options: [{ value: 'auto', label: 'Auto' }], default: 'auto' }],
};

const task = (patch: Partial<AiTask>): AiTask => ({
  id: 'tags', builtIn: true, name: null, output: 'tags', inMenu: true, provider: 'openai', model: 'gpt-x', prompt: 'p', modelOptions: {},
  options: { imageSize: 1024, language: 'user', parallel: 2, maxTags: 10, minConfidence: 0.5 }, ready: true, problem: null, ...patch,
});

const html = (node: React.ReactElement) => renderToStaticMarkup(node).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

beforeAll(async () => {
  await initI18n('en');
});

describe('Server settings AI section', () => {
  it('is part of Server settings', () => {
    expect(html(<ServerSettingsView />)).toContain(i18n.t('ai.title'));
  });

  it('says to switch on an AI plugin when there is no provider', () => {
    expect(html(<ProvidersPanel providers={[]} onSaved={() => {}} />)).toContain(i18n.t('ai.providers.none'));
  });

  it('shows a saved key only as saved, with an empty field, and where photos go', () => {
    const markup = html(<ProviderCard provider={openai} onSaved={() => {}} />);
    expect(markup).toContain(`placeholder="${i18n.t('ai.providers.secretSet')}"`);
    expect(markup).toMatch(/type="password"[^>]*value=""/);
    expect(markup).toContain(i18n.t('ai.providers.configured'));
    expect(markup).toContain(i18n.t('ai.providers.privacyAddress', { name: 'OpenAI', address: 'https://api.openai.com/v1' }));
    expect(markup).toContain(i18n.t('ai.providers.test'));
  });

  it('names missing settings of a provider that is not set up', () => {
    const markup = html(<ProviderCard provider={{ ...openai, status: 'not_configured', missing: ['apiKey'] }} onSaved={() => {}} />);
    expect(markup).toContain(i18n.t('ai.providers.missing', { list: 'API key' }));
  });

  it('sends a secret only when typed or removed, and numbers as numbers', () => {
    expect(changedValues(openai, {})).toEqual({});
    expect(changedValues(openai, { apiKey: '', baseUrl: 'http://localhost:11434/v1' })).toEqual({ baseUrl: 'http://localhost:11434/v1' });
    expect(changedValues(openai, { apiKey: 'sk-new', timeoutSeconds: '90' })).toEqual({ apiKey: 'sk-new', timeoutSeconds: 90 });
    expect(changedValues(openai, { apiKey: null, baseUrl: '' })).toEqual({ apiKey: null, baseUrl: null });
  });

  it('says where photos go from the address setting', () => {
    expect(providerAddress({ ...openai, settings: [{ ...openai.settings[1], value: 'http://gpu:8000/v1' }] })).toBe('http://gpu:8000/v1');
    expect(providerAddress({ ...openai, settings: [openai.settings[0]] })).toBeNull();
  });
});

describe('tasks list', () => {
  const tasks = [
    task({}),
    task({ id: 't-1', builtIn: false, name: 'Landmarks', ready: false, problem: 'no_model', model: null, inMenu: false }),
  ];
  const list = () => html(<TasksList tasks={tasks} providers={[openai]} onEdit={() => {}} onReset={() => {}} onDelete={() => {}} />);

  it('names built-in tasks in the UI language and custom ones by their name', () => {
    const markup = list();
    expect(markup).toContain(i18n.t('ai.task.tags'));
    expect(markup).toContain('Landmarks');
    expect(taskName({ id: 'description', name: null }, i18n.t.bind(i18n))).toBe('Description');
  });

  it('offers Reset for built-in tasks and Delete only for custom ones', () => {
    const markup = list();
    expect(markup.split(i18n.t('ai.tasks.reset')).length - 1).toBe(1);
    expect(markup.split(`>${i18n.t('ai.tasks.delete')}<`).length - 1).toBe(1);
  });

  it('says why a task is not ready', () => {
    const markup = list();
    expect(markup).toContain(i18n.t('ai.problem.no_model'));
    expect(markup).toContain(i18n.t('ai.tasks.ready'));
    expect(markup).toContain(i18n.t('ai.tasks.notInMenu'));
  });
});

describe('task editor', () => {
  it('never sends the output of a built-in task, and sends a default name as null', () => {
    const input = taskInput(draftOf(task({}), [openai]), task({}));
    expect(input.output).toBeUndefined();
    expect(input.name).toBeNull();
    expect(input).toMatchObject({ provider: 'openai', model: 'gpt-x', prompt: 'p' });
  });

  it('starts a new task with the first provider and sends its output', () => {
    const draft = { ...draftOf(null, [openai]), name: ' Landmarks ', prompt: 'Name landmarks' };
    expect(taskInput(draft, null)).toMatchObject({ name: 'Landmarks', output: 'tags', provider: 'openai', model: null });
  });

  it('keeps only the options of the output kind', () => {
    const options = { imageSize: 512, language: 'en', parallel: 3, maxTags: 5, minConfidence: 0.7 };
    expect(optionsForOutput('text', options)).toEqual({ imageSize: 512, language: 'en', parallel: 3, textTarget: 'description-if-empty' });
    expect(optionsForOutput('objects', options)).toEqual({ imageSize: 512, language: 'en', parallel: 3, minConfidence: 0.7, labelsAsTags: false });
  });
});

describe('run message', () => {
  const run: AiRunInfo = {
    id: 'r', taskId: 'tags', taskName: null, output: 'tags', state: 'finished', total: 30, done: 30, failed: 2, tagsAdded: 95,
    descriptionsSet: 0, inputTokens: 1000, outputTokens: 50, error: null, failures: [], photoIds: [], startedAt: '', endedAt: '',
  };
  const t = i18n.t.bind(i18n) as never;

  it('says how many photos were processed, tags added and photos failed', () => {
    const message = runMessage(run, t);
    expect(message).toContain(i18n.t('ai.run.processed', { task: 'Tags', count: 28 }));
    expect(message).toContain(i18n.t('ai.run.tagsAdded', { count: 95 }));
    expect(message).toContain(i18n.t('ai.run.failed', { count: 2 }));
    expect(message).toContain(i18n.t('ai.run.tokens', { input: 1000, output: 50 }));
  });

  it('shows the provider error of a stopped run', () => {
    expect(runMessage({ ...run, state: 'stopped', error: 'Incorrect API key provided' }, t))
      .toBe(i18n.t('ai.run.stoppedError', { task: 'Tags', message: 'Incorrect API key provided' }));
  });
});
