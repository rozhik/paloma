import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiCatalogModel, AiProviderInfo, AiTask } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { ServerSettingsView } from '../components/ServerSettingsView.js';
import { ProviderCard, ProvidersPanel, changedValues, providerTypes } from './ProvidersPanel.js';
import { ModelView } from './ModelsPanel.js';
import { draftOfModel, isChanged, modelInput } from './modelDraft.js';
import { TasksList } from './AiSection.js';
import { draftOf, optionsForOutput, taskInput } from './TaskEditor.js';
import { providerAddress, taskName } from './aiText.js';

const openai: AiProviderInfo = {
  id: 'openai', name: 'OpenAI', type: 'openai', pluginId: 'ai-openai', label: 'OpenAI', available: true, status: 'configured', missing: [],
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

describe('named providers', () => {
  it('shows a provider by its name, with its type and plugin, and Rename and Delete', () => {
    const markup = html(<ProviderCard provider={{ ...openai, id: 'p-1', name: 'Local Ollama' }} onSaved={() => {}} />);
    expect(markup).toContain('Local Ollama');
    expect(markup).toContain(i18n.t('ai.providers.typePlugin', { type: 'OpenAI', plugin: 'ai-openai' }));
    expect(markup).toContain(i18n.t('ai.providers.rename'));
    expect(markup).toContain(i18n.t('ai.providers.delete'));
    expect(markup).toContain(i18n.t('ai.providers.privacyAddress', { name: 'Local Ollama', address: 'https://api.openai.com/v1' }));
  });

  it('says a provider whose plugin is off is kept but not available, without a settings form', () => {
    const off: AiProviderInfo = { ...openai, available: false, settings: [], pluginId: '', label: 'openai', status: 'not_configured' };
    const markup = html(<ProviderCard provider={off} onSaved={() => {}} />);
    expect(markup).toContain(i18n.t('ai.providers.pluginOff'));
    expect(markup).toContain(i18n.t('ai.providers.unavailable'));
    expect(markup).not.toContain(i18n.t('ai.providers.test'));
  });

  it('offers adding a provider of each type a plugin contributes, once', () => {
    const types = providerTypes([{ id: 'openai', label: 'OpenAI' }, { id: 'openai', label: 'OpenAI' }, { id: 'other', label: 'Other' }]);
    expect(types).toEqual([{ id: 'openai', label: 'OpenAI' }, { id: 'other', label: 'Other' }]);
    const markup = html(<ProvidersPanel providers={[openai]} types={types} onSaved={() => {}} />);
    expect(markup).toContain(i18n.t('ai.providers.addTitle'));
    expect(markup).toContain('<option value="other">Other</option>');
    expect(markup).not.toContain(i18n.t('ai.providers.none'));
  });
});

const model: AiCatalogModel = {
  providerId: 'openai', providerName: 'OpenAI', id: 'gpt-x', enabled: true, listed: true, description: 'Fast, good at tags',
  info: { owned_by: 'openai', created: 1700000000 }, prices: { prompt_tokens: 0.15, completion_tokens: 0.6 },
  capabilities: [{ name: 'tags', grade: 80 }, { name: 'objects', grade: 35 }],
};

describe('models', () => {
  it('shows a model read-only: description, prices per million tokens, graded capabilities and information', () => {
    const markup = html(<ModelView model={model} />);
    expect(markup).toContain('gpt-x');
    expect(markup).toContain('Fast, good at tags');
    expect(markup).toContain(i18n.t('ai.models.perMillion', { credits: 0.15 }));
    expect(markup).toContain(i18n.t('ai.models.perMillion', { credits: 0.6 }));
    expect(markup).toMatch(/aria-label="tags"[^>]*aria-valuenow="80"/);
    expect(markup).toContain('owned_by');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<button');
  });

  it('turns an editor draft into numbers, an empty price into 0, and sees when nothing changed', () => {
    const draft = draftOfModel(model);
    expect(isChanged(draft, model)).toBe(false);
    expect(modelInput(draft)).toEqual({
      enabled: true, description: 'Fast, good at tags', prices: { prompt_tokens: 0.15, completion_tokens: 0.6 },
      capabilities: [{ name: 'tags', grade: 80 }, { name: 'objects', grade: 35 }],
    });
    const edited = { ...draft, prices: { prompt_tokens: '', completion_tokens: '1.25' }, capabilities: [...draft.capabilities, { name: ' ocr ', grade: '' }] };
    expect(isChanged(edited, model)).toBe(true);
    const input = modelInput(edited);
    expect(input.prices).toEqual({ prompt_tokens: 0, completion_tokens: 1.25 });
    expect(input.capabilities?.[2]).toMatchObject({ name: 'ocr' });
    expect(Number.isNaN(input.capabilities?.[2].grade)).toBe(true);
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

  it('says a task whose model is disabled is not ready', () => {
    const markup = html(<TasksList tasks={[task({ ready: false, problem: 'model_disabled' })]} providers={[openai]} onEdit={() => {}} onReset={() => {}} onDelete={() => {}} />);
    expect(markup).toContain(i18n.t('ai.problem.model_disabled'));
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
