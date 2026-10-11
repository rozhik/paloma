import path from 'node:path';
import type { AiModelInfo, AiProviderInfo, AiTask, PhotoAiResult } from '../../../shared/types.js';
import { config } from '../config.js';
import { pluginRegistry, type RegisteredAiProvider } from '../plugins/index.js';
import { fail } from '../services/apiError.js';
import { AiStore, AI_FILE_NAME, type AiFile, type StoredTask } from './store.js';
import { aiContext, missingSettings, parseSettingsUpdate, providerInfo, type Env } from './providerSettings.js';
import {
  applyTaskInput, isBuiltInTask, newTask, resetTask, resolveTasks, taskInfo, TaskInputError, type ProviderState,
} from './tasks.js';
import { deleteTaskResults, photoResults } from './results.js';
import { getApiPhoto } from '../services/photoApi.js';

let storeLoading: Promise<AiStore> | null = null;

/** The server's AI store (`ai.json` in the data directory), loaded on first use. */
export function aiStore(): Promise<AiStore> {
  storeLoading ??= AiStore.load(path.join(config.dataDir, AI_FILE_NAME));
  return storeLoading;
}

/** The environment providers may take values from. */
export const serverEnv = (): Env => process.env;

/** An AI provider of an active plugin, or a 404. */
export async function requireProvider(id: string): Promise<RegisteredAiProvider> {
  await pluginRegistry.init();
  const provider = pluginRegistry.getAiProvider(id);
  if (!provider) fail(404, 'ai_provider_not_found', `AI provider ${id} not found or its plugin is off`, { id });
  return provider;
}

/** Whether each task's provider is available and configured. */
async function providerStates(content: AiFile): Promise<(id: string | null) => ProviderState | undefined> {
  await pluginRegistry.init();
  return (id) => {
    const provider = id ? pluginRegistry.getAiProvider(id) : undefined;
    if (!provider) return undefined;
    return { available: true, configured: missingSettings(provider.definition, content.providers[provider.definition.id] ?? {}, serverEnv()).length === 0 };
  };
}

/** The tasks with their readiness. */
export async function currentTasks(): Promise<{ tasks: StoredTask[]; infos: AiTask[]; content: AiFile }> {
  const content = (await aiStore()).read();
  const state = await providerStates(content);
  const tasks = resolveTasks(content.tasks);
  return { tasks, infos: tasks.map((task) => taskInfo(task, state(task.provider))), content };
}

// --- Providers ---

/** `GET /api/ai/providers`. */
export async function listAiProviders(lang: string): Promise<AiProviderInfo[]> {
  await pluginRegistry.init();
  const content = (await aiStore()).read();
  return pluginRegistry.getAiProviders().map((provider) => providerInfo(provider, content.providers[provider.definition.id], serverEnv(), lang));
}

/** `PUT /api/ai/providers/:id/settings`. */
export async function saveProviderSettings(id: string, body: unknown, lang: string): Promise<AiProviderInfo> {
  const provider = await requireProvider(id);
  const store = await aiStore();
  const update = parseSettingsUpdate(provider.definition, body, store.read().providers[id] ?? {}, serverEnv());
  if ('field' in update) fail(400, 'invalid_field', update.message, { field: update.field });
  await store.update((content) => { content.providers[id] = update.values; });
  return providerInfo(provider, update.values, serverEnv(), lang);
}

/** The message of an error thrown by a provider, for the administrator. */
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));

const PROVIDER_TIMEOUT_MS = 60_000;

/** Calls a provider function with its context, turning a failure or a timeout into a 502 naming the provider's message. */
async function callProvider<T>(provider: RegisteredAiProvider, call: (ctx: ReturnType<typeof aiContext>) => Promise<T>): Promise<T> {
  const saved = (await aiStore()).read().providers[provider.definition.id] ?? {};
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    return await call(aiContext(provider, saved, serverEnv(), signal));
  } catch (err) {
    fail(502, 'ai_provider_failed', `${provider.definition.id}: ${messageOf(err)}`, { id: provider.definition.id, message: messageOf(err) });
  }
}

/** `GET /api/ai/providers/:id/models`: the provider's models, sorted by id. */
export async function listProviderModels(id: string): Promise<AiModelInfo[]> {
  const provider = await requireProvider(id);
  const models = await callProvider(provider, (ctx) => provider.definition.listModels(ctx));
  if (!Array.isArray(models)) fail(502, 'ai_provider_failed', `${id}: the model list is not a list`, { id, message: 'the model list is not a list' });
  return models
    .filter((model) => typeof model?.id === 'string' && model.id !== '')
    .map((model) => ({ id: model.id, label: typeof model.label === 'string' && model.label !== '' ? model.label : model.id }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `POST /api/ai/providers/:id/test`: whether the provider can be used with the saved settings. */
export async function testProvider(id: string): Promise<{ ok: true }> {
  const provider = await requireProvider(id);
  await callProvider(provider, async (ctx) => {
    if (provider.definition.test) await provider.definition.test(ctx);
    else await provider.definition.listModels(ctx);
  });
  return { ok: true };
}

// --- Tasks ---

/** The model options declared by an available provider, for checking task input. */
const declaredOptions = (id: string | null) => (id ? pluginRegistry.getAiProvider(id)?.definition.modelOptions : undefined);

function taskInput<T>(apply: () => T): T {
  try {
    return apply();
  } catch (err) {
    if (err instanceof TaskInputError) fail(400, 'invalid_field', err.message, { field: err.field });
    throw err;
  }
}

/** Saves the tasks: every built-in one and the custom ones, in order. */
async function saveTasks(tasks: StoredTask[]): Promise<void> {
  await (await aiStore()).update((content) => { content.tasks = tasks; });
}

async function findTask(id: string): Promise<{ tasks: StoredTask[]; task: StoredTask }> {
  const { tasks } = await currentTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) fail(404, 'ai_task_not_found', `AI task ${id} not found`, { id });
  return { tasks, task };
}

async function infoOf(id: string): Promise<AiTask> {
  return (await currentTasks()).infos.find((task) => task.id === id)!;
}

/** `GET /api/ai/tasks`. */
export async function listAiTasks(): Promise<AiTask[]> {
  return (await currentTasks()).infos;
}

/** `POST /api/ai/tasks`: adds a custom task. */
export async function createAiTask(body: unknown): Promise<AiTask> {
  await pluginRegistry.init();
  const { tasks } = await currentTasks();
  const task = taskInput(() => newTask(body, declaredOptions));
  await saveTasks([...tasks, task]);
  return infoOf(task.id);
}

/** `PATCH /api/ai/tasks/:id`. */
export async function updateAiTask(id: string, body: unknown): Promise<AiTask> {
  await pluginRegistry.init();
  const { tasks, task } = await findTask(id);
  const changed = taskInput(() => applyTaskInput(task, body, declaredOptions));
  await saveTasks(tasks.map((t) => (t.id === id ? changed : t)));
  return infoOf(id);
}

/** `DELETE /api/ai/tasks/:id`: deletes a custom task and its stored results; tags and descriptions stay. */
export async function deleteAiTask(id: string): Promise<void> {
  const { tasks, task } = await findTask(id);
  if (task.builtIn) fail(409, 'ai_task_builtin', `${id} is a built-in task and cannot be deleted`, { id });
  await saveTasks(tasks.filter((t) => t.id !== id));
  await deleteTaskResults(id);
}

/** `POST /api/ai/tasks/:id/reset`: a built-in task back to its defaults, keeping its provider and model. */
export async function resetAiTask(id: string): Promise<AiTask> {
  const { tasks, task } = await findTask(id);
  if (!isBuiltInTask(id)) fail(409, 'ai_task_not_builtin', `${id} is not a built-in task and has no defaults`, { id });
  await saveTasks(tasks.map((t) => (t.id === id ? resetTask(task) : t)));
  return infoOf(id);
}

// --- Results ---

/** `GET /api/photos/:id/ai`: the photo's results on its current content, one per task, in task order. */
export async function photoAiResults(photoId: number): Promise<PhotoAiResult[]> {
  if (!Number.isInteger(photoId) || !await getApiPhoto(photoId)) fail(404, 'photo_not_found', 'Photo not found');
  const { tasks } = await currentTasks();
  return photoResults(photoId, tasks);
}
