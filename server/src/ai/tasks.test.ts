import { describe, it, expect } from 'vitest';
import type { AiModelOptionDefinition } from '../plugins/api.js';
import {
  DEFAULT_PROMPTS, applyTaskInput, builtInDefaults, effectiveModelOptions, newTask, resetTask, resolveTasks, runLanguage, taskFingerprint,
  taskInfo, TaskInputError,
} from './tasks.js';

const OPTIONS: AiModelOptionDefinition[] = [
  { name: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, default: 0.2 },
  { name: 'detail', label: 'Detail', type: 'choice', options: [{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }], default: 'auto' },
];
const declared = (provider: string | null) => (provider === 'openai' ? OPTIONS : undefined);

const fieldOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof TaskInputError) return err.field;
    throw err;
  }
  return null;
};

describe('resolveTasks', () => {
  it('has the three built-in tasks with their defaults', () => {
    const tasks = resolveTasks([]);
    expect(tasks.map((t) => [t.id, t.output, t.builtIn, t.name, t.provider, t.model])).toEqual([
      ['tags', 'tags', true, null, 'openai', null],
      ['objects', 'objects', true, null, 'openai', null],
      ['description', 'text', true, null, 'openai', null],
    ]);
    expect(tasks[0].options).toEqual({ imageSize: 1024, language: 'user', parallel: 2, maxTags: 10, minConfidence: 0.5 });
    expect(tasks[1].options).toEqual({ imageSize: 1024, language: 'user', parallel: 2, minConfidence: 0.5, labelsAsTags: false });
    expect(tasks[2].options).toEqual({ imageSize: 1024, language: 'user', parallel: 2, textTarget: 'description-if-empty' });
  });

  it('completes a saved built-in task and keeps custom ones after the built-ins', () => {
    const tasks = resolveTasks([
      { id: 'landmarks', builtIn: false, name: 'Landmarks', output: 'tags', prompt: 'Name landmarks', options: { maxTags: 3 } as never },
      { id: 'tags', prompt: 'Changed', model: 'gpt-x', output: 'text' },
    ]);
    expect(tasks.map((t) => t.id)).toEqual(['tags', 'objects', 'description', 'landmarks']);
    expect(tasks[0]).toMatchObject({ prompt: 'Changed', model: 'gpt-x', output: 'tags', builtIn: true });
    expect(tasks[3]).toMatchObject({ name: 'Landmarks', builtIn: false, inMenu: true, options: { maxTags: 3, imageSize: 1024 } });
  });
});

describe('readiness', () => {
  const tags = builtInDefaults('tags');

  it('is ready with an available, configured provider and a model', () => {
    expect(taskInfo({ ...tags, model: 'gpt-x' }, { available: true, configured: true })).toMatchObject({ ready: true, problem: null });
  });

  it('says why it is not ready', () => {
    expect(taskInfo({ ...tags, model: 'gpt-x' }, undefined).problem).toBe('provider_unavailable');
    expect(taskInfo({ ...tags, model: 'gpt-x' }, { available: true, configured: false }).problem).toBe('provider_not_configured');
    expect(taskInfo(tags, { available: true, configured: true }).problem).toBe('no_model');
    expect(taskInfo({ ...tags, provider: null }, undefined).problem).toBe('no_provider');
  });
});

describe('applyTaskInput', () => {
  const tags = builtInDefaults('tags');

  it('changes the prompt, model and options', () => {
    const next = applyTaskInput(tags, { prompt: 'New', model: 'gpt-x', options: { maxTags: 5, language: 'en' }, modelOptions: { detail: 'high' } }, declared);
    expect(next).toMatchObject({ prompt: 'New', model: 'gpt-x', options: { maxTags: 5, language: 'en' }, modelOptions: { detail: 'high' } });
  });

  it('refuses an image size out of range, naming it', () => {
    expect(fieldOf(() => applyTaskInput(tags, { options: { imageSize: 4000 } }, declared))).toBe('options.imageSize');
  });

  it('refuses options of another output kind and unknown fields', () => {
    expect(fieldOf(() => applyTaskInput(tags, { options: { textTarget: 'none' } }, declared))).toBe('options.textTarget');
    expect(fieldOf(() => applyTaskInput(tags, { color: 'red' }, declared))).toBe('color');
  });

  it('refuses changing the output of a built-in task', () => {
    expect(fieldOf(() => applyTaskInput(tags, { output: 'text' }, declared))).toBe('output');
  });

  it('checks model options against the provider', () => {
    expect(fieldOf(() => applyTaskInput(tags, { modelOptions: { temperature: 5 } }, declared))).toBe('modelOptions.temperature');
    expect(fieldOf(() => applyTaskInput(tags, { modelOptions: { seed: 1 } }, declared))).toBe('modelOptions.seed');
  });

  it('clears model options when the provider changes', () => {
    const withOptions = { ...tags, modelOptions: { detail: 'high' } };
    expect(applyTaskInput(withOptions, { provider: 'local' }, declared).modelOptions).toEqual({});
  });

  it('lets a built-in task take back its default name with null', () => {
    expect(applyTaskInput({ ...tags, name: 'Keywords' }, { name: null }, declared).name).toBeNull();
  });
});

describe('custom tasks', () => {
  it('creates a task with a name, output and prompt', () => {
    const task = newTask({ name: 'Landmarks', output: 'tags', prompt: 'Name the famous landmarks in this photo' }, declared);
    expect(task).toMatchObject({ builtIn: false, name: 'Landmarks', output: 'tags', inMenu: true, options: { maxTags: 10 } });
    expect(task.id).toMatch(/^t-[0-9a-f]{8}$/);
  });

  it('needs a name, output and prompt', () => {
    expect(fieldOf(() => newTask({ output: 'tags', prompt: 'x' }, declared))).toBe('name');
    expect(fieldOf(() => newTask({ name: 'X', prompt: 'x' }, declared))).toBe('output');
    expect(fieldOf(() => newTask({ name: 'X', output: 'boxes', prompt: 'x' }, declared))).toBe('output');
    expect(fieldOf(() => newTask({ name: 'X', output: 'text' }, declared))).toBe('prompt');
  });

  it('gives a task whose output changes the options of its new kind', () => {
    const task = newTask({ name: 'X', output: 'tags', prompt: 'x' }, declared);
    expect(applyTaskInput(task, { output: 'text' }, declared).options).toEqual({ imageSize: 1024, language: 'user', parallel: 2, textTarget: 'description-if-empty' });
  });
});

describe('reset', () => {
  it('brings back the defaults, keeping the provider and model', () => {
    const changed = { ...builtInDefaults('tags'), prompt: 'Changed', provider: 'local', model: 'llava', options: { ...builtInDefaults('tags').options, maxTags: 3 } };
    expect(resetTask(changed)).toEqual({ ...builtInDefaults('tags'), provider: 'local', model: 'llava' });
    expect(resetTask(changed).prompt).toBe(DEFAULT_PROMPTS.tags);
  });
});

describe('fingerprint', () => {
  const task = { ...builtInDefaults('tags'), model: 'gpt-x' };
  const options = effectiveModelOptions(task, OPTIONS);
  const base = taskFingerprint(task, options, 'en');

  it('fills in the provider defaults', () => {
    expect(options).toEqual({ temperature: 0.2, detail: 'auto' });
  });

  it('stays the same when only the name, menu switch or other options change', () => {
    const renamed = applyTaskInput(task, { name: 'Keywords', inMenu: false, options: { maxTags: 3, minConfidence: 0.9, parallel: 4 } }, declared);
    expect(taskFingerprint(renamed, effectiveModelOptions(renamed, OPTIONS), 'en')).toBe(base);
  });

  it('changes with the prompt, model, model options, image size and language', () => {
    const changed = [
      applyTaskInput(task, { prompt: 'Other' }, declared),
      applyTaskInput(task, { model: 'gpt-y' }, declared),
      applyTaskInput(task, { modelOptions: { detail: 'high' } }, declared),
      applyTaskInput(task, { options: { imageSize: 512 } }, declared),
    ].map((t) => taskFingerprint(t, effectiveModelOptions(t, OPTIONS), 'en'));
    changed.push(taskFingerprint(task, options, 'uk'));
    expect(new Set([base, ...changed]).size).toBe(6);
  });

  it('uses the fixed language or the user language', () => {
    expect(runLanguage(task, 'uk')).toBe('uk');
    expect(runLanguage(applyTaskInput(task, { options: { language: 'en' } }, declared), 'uk')).toBe('en');
  });
});
