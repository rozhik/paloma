import type {
  AiCatalogModel, AiCatalogModelInput, AiModelInfo, AiProviderInfo, AiRunRequest, AiTask, AiTaskInput, AiUsageList, PhotoAiResult, TaskInfo,
} from '../../../shared/types.js';
import { apiRequest } from './http.js';

const withLang = (url: string, lang: string) => `${url}?${new URLSearchParams({ lang })}`;

/** The AI providers of active plugins with their settings; secrets only as set or not set. */
export const fetchAiProviders = (lang: string): Promise<AiProviderInfo[]> => apiRequest('GET', withLang('/api/ai/providers', lang));

/**
 * Saves a provider's settings. A secret left out keeps its value; `''` or `null` removes a value.
 */
export const saveAiProviderSettings = (id: string, values: Record<string, string | number | boolean | null>, lang: string): Promise<AiProviderInfo> =>
  apiRequest('PUT', withLang(`/api/ai/providers/${encodeURIComponent(id)}/settings`, lang), values);

/** Adds a named provider of a type a plugin contributes; its settings are empty until saved. */
export const createAiProvider = (type: string, name: string, lang: string): Promise<AiProviderInfo> =>
  apiRequest('POST', withLang('/api/ai/providers', lang), { type, name });

export const renameAiProvider = (id: string, name: string, lang: string): Promise<AiProviderInfo> =>
  apiRequest('PATCH', withLang(`/api/ai/providers/${encodeURIComponent(id)}`, lang), { name });

/** Deletes a provider no task uses, with its settings and models. */
export const deleteAiProvider = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/ai/providers/${encodeURIComponent(id)}`);

/** The model catalogue: enabled models, and disabled ones too for whoever manages plugins. */
export const fetchCatalogModels = (): Promise<AiCatalogModel[]> => apiRequest('GET', '/api/ai/models');

/** Asks the provider for its models and merges them into its catalogue; responds with the provider's catalogue. */
export const refreshAiModels = (providerId: string): Promise<AiCatalogModel[]> =>
  apiRequest('POST', `/api/ai/providers/${encodeURIComponent(providerId)}/models/refresh`, {});

export const addAiModel = (providerId: string, id: string): Promise<AiCatalogModel> =>
  apiRequest('POST', `/api/ai/providers/${encodeURIComponent(providerId)}/models`, { id });

export const updateAiModel = (providerId: string, modelId: string, input: AiCatalogModelInput): Promise<AiCatalogModel> =>
  apiRequest('PATCH', `/api/ai/providers/${encodeURIComponent(providerId)}/models/${encodeURIComponent(modelId)}`, input);

/** The model calls of the user (everyone's for users.manage), newest first, with totals. */
export const fetchAiUsage = (params: { limit?: number; offset?: number } = {}): Promise<AiUsageList> => {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return apiRequest('GET', `/api/ai/usage${query.size > 0 ? `?${query}` : ''}`);
};

export const fetchAiModels = (id: string): Promise<AiModelInfo[]> => apiRequest('GET', `/api/ai/providers/${encodeURIComponent(id)}/models`);

/** Checks that the provider can be used with its saved settings; throws with the provider's message when not. */
export const testAiProvider = (id: string): Promise<{ ok: true }> => apiRequest('POST', `/api/ai/providers/${encodeURIComponent(id)}/test`, {});

export const fetchAiTasks = (): Promise<AiTask[]> => apiRequest('GET', '/api/ai/tasks');

export const createAiTask = (input: AiTaskInput): Promise<AiTask> => apiRequest('POST', '/api/ai/tasks', input);

export const updateAiTask = (id: string, input: AiTaskInput): Promise<AiTask> => apiRequest('PATCH', `/api/ai/tasks/${encodeURIComponent(id)}`, input);

export const deleteAiTask = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/ai/tasks/${encodeURIComponent(id)}`);

/** A built-in task back to its defaults, keeping its provider and model. */
export const resetAiTask = (id: string): Promise<AiTask> => apiRequest('POST', `/api/ai/tasks/${encodeURIComponent(id)}/reset`, {});

/**
 * Adds a run to the server's task queue; `lang` is the language answers are in when the task says "the user's".
 * Following, pausing and cancelling it goes through the tasks API.
 */
export const startAiRun = (request: AiRunRequest, lang: string): Promise<TaskInfo> => apiRequest('POST', withLang('/api/ai/runs', lang), request);

export const fetchPhotoAiResults = (photoId: number): Promise<PhotoAiResult[]> => apiRequest('GET', `/api/photos/${photoId}/ai`);
