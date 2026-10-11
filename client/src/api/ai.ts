import type {
  AiModelInfo, AiProviderInfo, AiRunInfo, AiRunRequest, AiRunStatus, AiTask, AiTaskInput, PhotoAiResult,
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

export const fetchAiModels = (id: string): Promise<AiModelInfo[]> => apiRequest('GET', `/api/ai/providers/${encodeURIComponent(id)}/models`);

/** Checks that the provider can be used with its saved settings; throws with the provider's message when not. */
export const testAiProvider = (id: string): Promise<{ ok: true }> => apiRequest('POST', `/api/ai/providers/${encodeURIComponent(id)}/test`, {});

export const fetchAiTasks = (): Promise<AiTask[]> => apiRequest('GET', '/api/ai/tasks');

export const createAiTask = (input: AiTaskInput): Promise<AiTask> => apiRequest('POST', '/api/ai/tasks', input);

export const updateAiTask = (id: string, input: AiTaskInput): Promise<AiTask> => apiRequest('PATCH', `/api/ai/tasks/${encodeURIComponent(id)}`, input);

export const deleteAiTask = (id: string): Promise<{ success: true }> => apiRequest('DELETE', `/api/ai/tasks/${encodeURIComponent(id)}`);

/** A built-in task back to its defaults, keeping its provider and model. */
export const resetAiTask = (id: string): Promise<AiTask> => apiRequest('POST', `/api/ai/tasks/${encodeURIComponent(id)}/reset`, {});

/** Starts a run on the server; `lang` is the language answers are in when the task says "the user's". */
export const startAiRun = (request: AiRunRequest, lang: string): Promise<AiRunInfo> => apiRequest('POST', withLang('/api/ai/runs', lang), request);

export const fetchAiRunStatus = (): Promise<AiRunStatus> => apiRequest('GET', '/api/ai/runs/current');

/** Stops the run after the photos in progress. */
export const cancelAiRun = (): Promise<AiRunStatus> => apiRequest('DELETE', '/api/ai/runs/current');

export const fetchPhotoAiResults = (photoId: number): Promise<PhotoAiResult[]> => apiRequest('GET', `/api/photos/${photoId}/ai`);
