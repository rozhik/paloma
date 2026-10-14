import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AiCatalogModel, AiModelInfo, AiProviderInfo, AiTask, AiUsageList, PhotoAiResult } from '../../../shared/types.js';
import type { AiModelOptionDefinition } from '../plugins/api.js';
import { config } from '../config.js';
import { pluginRegistry, type RegisteredAiProvider } from '../plugins/index.js';
import { fail } from '../services/apiError.js';
import { AiStore, AI_FILE_NAME, type AiFile, type StoredProvider, type StoredTask } from './store.js';
import { aiContext, envFor, missingSettings, parseSettingsUpdate, providerInfo, unavailableProviderInfo, type Env } from './providerSettings.js';
import {
  deleteProviderModels, enabledModelKeys, ensureModel, ensureTaskModels, findModel, listCatalog, mergeListedModels, modelKey, ModelInputError,
  modelsWithoutInfo, parseModelInput, updateModel,
} from './models.js';
import {
  applyTaskInput, isBuiltInTask, newTask, resetTask, resolveTasks, taskInfo, TaskInputError, type ProviderState,
} from './tasks.js';
import { deleteTaskResults, photoResults } from './results.js';
import { listUsage } from './usage.js';
import { getApiPhoto } from '../services/photoApi.js';

let storeLoading: Promise<AiStore> | null = null;

/** The server's AI store (`ai.json` in the data directory), loaded on first use. */
export function aiStore(): Promise<AiStore> {
  storeLoading ??= AiStore.load(path.join(config.dataDir, AI_FILE_NAME));
  return storeLoading;
}

/** The environment providers may take values from. */
export const serverEnv = (): Env => process.env;

/** A named provider, or a 404. */
export async function requireStoredProvider(id: string): Promise<StoredProvider> {
  const stored = (await aiStore()).read().providers.find((p) => p.id === id);
  if (!stored) fail(404, 'ai_provider_not_found', `AI provider ${id} not found`, { id });
  return stored;
}

/** A named provider and the provider type of an active plugin it is made from, or a 404. */
export async function requireProvider(id: string): Promise<{ stored: StoredProvider; provider: RegisteredAiProvider }> {
  const stored = await requireStoredProvider(id);
  await pluginRegistry.init();
  const provider = pluginRegistry.getAiProvider(stored.type);
  if (!provider) fail(404, 'ai_provider_not_found', `AI provider ${stored.name} is not available: its plugin is off`, { id });
  return { stored, provider };
}

/** Whether each task's provider is available and configured. */
async function providerStates(content: AiFile): Promise<(id: string | null) => ProviderState | undefined> {
  await pluginRegistry.init();
  return (id) => {
    const stored = id ? content.providers.find((p) => p.id === id) : undefined;
    const provider = stored ? pluginRegistry.getAiProvider(stored.type) : undefined;
    if (!stored || !provider) return undefined;
    return { available: true, configured: missingSettings(provider.definition, stored.settings, envFor(stored.id, serverEnv())).length === 0 };
  };
}

/** The tasks with their readiness. Models the tasks name that the catalogue lacks are added to it, enabled. */
export async function currentTasks(): Promise<{ tasks: StoredTask[]; infos: AiTask[]; content: AiFile }> {
  const content = (await aiStore()).read();
  const state = await providerStates(content);
  const tasks = resolveTasks(content.tasks);
  await ensureTaskModels(tasks);
  const enabled = await enabledModelKeys();
  return {
    tasks,
    infos: tasks.map((task) => taskInfo(task, state(task.provider), !task.provider || !task.model || enabled.has(modelKey(task.provider, task.model)))),
    content,
  };
}

// --- Providers ---

/** `GET /api/ai/providers`: every named provider; one whose plugin is off is listed as not available. */
export async function listAiProviders(lang: string): Promise<AiProviderInfo[]> {
  await pluginRegistry.init();
  const content = (await aiStore()).read();
  return content.providers.map((stored) => {
    const provider = pluginRegistry.getAiProvider(stored.type);
    return provider ? providerInfo(provider, stored, serverEnv(), lang) : unavailableProviderInfo(stored);
  });
}

const MAX_NAME = 60;

/** A provider name that can be used: trimmed, 1 to 60 characters, unique ignoring case (except for `ownId`). */
function checkName(value: unknown, providers: readonly StoredProvider[], ownId?: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim().length > MAX_NAME) {
    fail(400, 'invalid_field', `name must be 1 to ${MAX_NAME} characters`, { field: 'name' });
  }
  const name = value.trim();
  if (providers.some((p) => p.id !== ownId && p.name.toLowerCase() === name.toLowerCase())) {
    fail(400, 'invalid_field', `There is already a provider named ${name}`, { field: 'name' });
  }
  return name;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `POST /api/ai/providers {type, name}`: a new provider of an available type, without settings. */
export async function createAiProvider(body: unknown, lang: string): Promise<AiProviderInfo> {
  await pluginRegistry.init();
  const value = isObject(body) ? body : {};
  const store = await aiStore();
  const name = checkName(value.name, store.read().providers);
  const type = typeof value.type === 'string' ? value.type : '';
  const provider = pluginRegistry.getAiProvider(type);
  if (!provider) fail(400, 'invalid_field', `${type || 'type'} is not an available AI provider type`, { field: 'type' });
  const stored: StoredProvider = { id: `p-${randomUUID().slice(0, 8)}`, name, type, settings: {} };
  await store.update((content) => { content.providers.push(stored); });
  return providerInfo(provider, stored, serverEnv(), lang);
}

/** `PATCH /api/ai/providers/:id {name}`. */
export async function renameAiProvider(id: string, body: unknown, lang: string): Promise<AiProviderInfo> {
  const stored = await requireStoredProvider(id);
  const value = isObject(body) ? body : {};
  for (const field of Object.keys(value)) {
    if (field !== 'name') fail(400, 'invalid_field', `${field} cannot be set`, { field });
  }
  const store = await aiStore();
  const name = checkName(value.name, store.read().providers, id);
  await store.update((content) => { content.providers.find((p) => p.id === id)!.name = name; });
  return (await listAiProviders(lang)).find((p) => p.id === stored.id)!;
}

/** `DELETE /api/ai/providers/:id`: a provider no task uses, with its settings and models. */
export async function deleteAiProvider(id: string): Promise<void> {
  await requireStoredProvider(id);
  const users = resolveTasks((await aiStore()).read().tasks).filter((task) => task.provider === id);
  if (users.length > 0) {
    const names = users.map((task) => task.name ?? task.id).join(', ');
    fail(409, 'ai_provider_in_use', `AI provider ${id} is used by the tasks ${names}`, { id, tasks: users.map((task) => task.id).join(', ') });
  }
  await (await aiStore()).update((content) => { content.providers = content.providers.filter((p) => p.id !== id); });
  await deleteProviderModels(id);
}

/** `PUT /api/ai/providers/:id/settings`. */
export async function saveProviderSettings(id: string, body: unknown, lang: string): Promise<AiProviderInfo> {
  const { stored, provider } = await requireProvider(id);
  const update = parseSettingsUpdate(provider.definition, body, stored.settings, envFor(id, serverEnv()));
  if ('field' in update) fail(400, 'invalid_field', update.message, { field: update.field });
  await (await aiStore()).update((content) => { content.providers.find((p) => p.id === id)!.settings = update.values; });
  return providerInfo(provider, { ...stored, settings: update.values }, serverEnv(), lang);
}

/** The message of an error thrown by a provider, for the administrator. */
const messageOf = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));

const PROVIDER_TIMEOUT_MS = 60_000;

/** Calls a provider function with its context, turning a failure or a timeout into a 502 naming the provider's message. */
async function callProvider<T>(target: { stored: StoredProvider; provider: RegisteredAiProvider }, call: (ctx: ReturnType<typeof aiContext>) => Promise<T>): Promise<T> {
  const { stored, provider } = target;
  // Read again: the settings may have been saved since the provider was looked up
  const current = (await aiStore()).read().providers.find((p) => p.id === stored.id) ?? stored;
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    return await call(aiContext(provider, current, serverEnv(), signal));
  } catch (err) {
    fail(502, 'ai_provider_failed', `${stored.name}: ${messageOf(err)}`, { id: stored.id, message: messageOf(err) });
  }
}

interface Listed {
  id: string;
  label: string;
  info?: Record<string, unknown>;
}

/** What the provider lists now, checked and sorted by id; a 502 when the call fails or the list is malformed. */
async function listFromProvider(target: { stored: StoredProvider; provider: RegisteredAiProvider }): Promise<Listed[]> {
  const models = await callProvider(target, (ctx) => target.provider.definition.listModels(ctx));
  if (!Array.isArray(models)) {
    fail(502, 'ai_provider_failed', `${target.stored.name}: the model list is not a list`, { id: target.stored.id, message: 'the model list is not a list' });
  }
  const seen = new Set<string>();
  return models
    .filter((model) => typeof model?.id === 'string' && model.id !== '' && !seen.has(model.id) && seen.add(model.id))
    .map((model) => ({
      id: model.id, label: typeof model.label === 'string' && model.label !== '' ? model.label : model.id,
      ...(isObject(model.info) ? { info: model.info } : {}),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** `GET /api/ai/providers/:id/models`: the models the provider lists right now, sorted by id. */
export async function listProviderModels(id: string): Promise<AiModelInfo[]> {
  const listed = await listFromProvider(await requireProvider(id));
  return listed.map(({ id: modelId, label }) => ({ id: modelId, label }));
}

/** `POST /api/ai/providers/:id/test`: whether the provider can be used with the saved settings. */
export async function testProvider(id: string): Promise<{ ok: true }> {
  const target = await requireProvider(id);
  await callProvider(target, async (ctx) => {
    if (target.provider.definition.test) await target.provider.definition.test(ctx);
    else await target.provider.definition.listModels(ctx);
  });
  return { ok: true };
}

// --- Models ---

/** Provider ids to names, for the catalogue. */
async function providerNames(): Promise<Map<string, string>> {
  return new Map((await aiStore()).read().providers.map((p) => [p.id, p.name]));
}

/** `GET /api/ai/models`: the catalogue; disabled models only when `includeDisabled`. */
export async function listCatalogModels(includeDisabled: boolean): Promise<AiCatalogModel[]> {
  await currentTasks(); // adds the models the tasks name
  return listCatalog(await providerNames(), includeDisabled);
}

/**
 * `POST /api/ai/providers/:id/models/refresh`: merges the provider's model list, with the details of the models
 * it has none for, into the catalogue. Fails with 502 and changes nothing when the list cannot be read.
 */
export async function refreshProviderModels(id: string): Promise<AiCatalogModel[]> {
  const target = await requireProvider(id);
  const listed = await listFromProvider(target);
  const details = new Map<string, Record<string, unknown>>();
  const { getModel } = target.provider.definition;
  if (getModel) {
    for (const modelId of await modelsWithoutInfo(id, listed.map((model) => model.id))) {
      try {
        const info = await callProvider(target, (ctx) => getModel.call(target.provider.definition, modelId, ctx));
        if (isObject(info)) details.set(modelId, info);
      } catch (err) {
        console.warn(`${target.stored.name}: no details for model ${modelId}: ${messageOf(err)}`);
      }
    }
  }
  await mergeListedModels(id, listed, details);
  return (await listCatalog(new Map([[id, target.stored.name]]), true));
}

/** `POST /api/ai/providers/:id/models {id}`: adds a model by its id, enabled; an existing one is left as it is. */
export async function addProviderModel(id: string, body: unknown): Promise<AiCatalogModel> {
  const stored = await requireStoredProvider(id);
  const modelId = isObject(body) && typeof body.id === 'string' ? body.id.trim() : '';
  if (modelId === '' || modelId.length > 200) fail(400, 'invalid_field', 'id must be a model id', { field: 'id' });
  await ensureModel(id, modelId, true);
  return (await findModel(id, stored.name, modelId))!;
}

/** `PATCH /api/ai/providers/:id/models/:model`: enabled, description, prices and capabilities. */
export async function updateProviderModel(id: string, modelId: string, body: unknown): Promise<AiCatalogModel> {
  const stored = await requireStoredProvider(id);
  let input;
  try {
    input = parseModelInput(body);
  } catch (err) {
    if (err instanceof ModelInputError) fail(400, 'invalid_field', err.message, { field: err.field });
    throw err;
  }
  if (!await updateModel(id, modelId, input)) fail(404, 'ai_model_not_found', `Model ${modelId} not found in ${stored.name}`, { id, model: modelId });
  return (await findModel(id, stored.name, modelId))!;
}

// --- Tasks ---

/** The model options declared by the type of an available provider, for checking task input. */
async function optionsLookup(): Promise<(id: string | null) => AiModelOptionDefinition[] | undefined> {
  await pluginRegistry.init();
  const providers = (await aiStore()).read().providers;
  return (id) => {
    const stored = id ? providers.find((p) => p.id === id) : undefined;
    return stored ? pluginRegistry.getAiProvider(stored.type)?.definition.modelOptions : undefined;
  };
}

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
  const declaredOptions = await optionsLookup();
  const { tasks } = await currentTasks();
  const task = taskInput(() => newTask(body, declaredOptions));
  await saveTasks([...tasks, task]);
  return infoOf(task.id);
}

/** `PATCH /api/ai/tasks/:id`. */
export async function updateAiTask(id: string, body: unknown): Promise<AiTask> {
  const declaredOptions = await optionsLookup();
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
  const { tasks, content } = await currentTasks();
  const names = new Map(content.providers.map((p) => [p.id, p.name]));
  return (await photoResults(photoId, tasks)).map((result) => ({ ...result, provider: names.get(result.provider) ?? result.provider }));
}

// --- Usage ---

const MAX_USAGE_PAGE = 500;

function usageDate(field: string, value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(400, 'invalid_field', `${field} must be a date`, { field });
  return new Date(value).toISOString();
}

function usageText(field: string, value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') fail(400, 'invalid_field', `${field} must be a text`, { field });
  return value;
}

function usageInt(field: string, value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) fail(400, 'invalid_field', `${field} must be a whole number from 0 to ${max}`, { field });
  return n;
}

/**
 * `GET /api/ai/usage`: the model calls matching `from`, `to`, `userId`, `taskId` and `model`, newest first, with
 * totals. Someone without `users.manage` always gets only their own calls; `ownUserId` is their user (null when
 * auth is off, where all calls are the local user's).
 */
export async function aiUsage(query: Record<string, unknown>, access: { all: boolean; ownUserId: string | null }): Promise<AiUsageList> {
  const asked = usageText('userId', query.userId);
  const userId = access.all ? asked : (access.ownUserId ?? undefined);
  return listUsage({
    ...(userId !== undefined ? { userId } : {}),
    from: usageDate('from', query.from), to: usageDate('to', query.to),
    aiTaskId: usageText('taskId', query.taskId), model: usageText('model', query.model),
    limit: usageInt('limit', query.limit, 100, MAX_USAGE_PAGE), offset: usageInt('offset', query.offset, 0, 1_000_000_000),
  });
}
