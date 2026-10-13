import type { FaceDetectResponse, TaskInfo, TaskList } from '../../../shared/types.js';
import { apiRequest } from './http.js';

const taskUrl = (id: string, action = '') => `/api/tasks/${encodeURIComponent(id)}${action}`;

/** The task queue as this user sees it: running, waiting and paused tasks in order, then ended tasks. */
export const fetchTasks = (): Promise<TaskList> => apiRequest('GET', '/api/tasks');

export const pauseTask = (id: string): Promise<TaskInfo> => apiRequest('POST', taskUrl(id, '/pause'), {});

export const resumeTask = (id: string): Promise<TaskInfo> => apiRequest('POST', taskUrl(id, '/resume'), {});

/** Moves a waiting or paused task before another one, or to the end with null. */
export const moveTask = (id: string, before: string | null): Promise<TaskInfo> => apiRequest('POST', taskUrl(id, '/move'), { before });

/** Cancels a task, or removes an ended one from the list (then the task is null). */
export const cancelTask = (id: string): Promise<{ task: TaskInfo | null }> => apiRequest('DELETE', taskUrl(id));

/** Adds a face detection task for the photos that still need it; null when none does. */
export const startFaceDetection = (photoIds: number[]): Promise<FaceDetectResponse> => apiRequest('POST', '/api/faces/detect', { photoIds });
