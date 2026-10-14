import type { TFunction } from 'i18next';
import type { TaskInfo } from '../../../shared/types.js';
import { taskName } from '../ai/aiText.js';

type Translate = TFunction | ((key: string, options?: Record<string, unknown>) => string);

/** The last segment of a folder path. */
const folderName = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/** What the task does, in the active language: the AI task's name, or the kind with its photos or folder. */
export function taskTitle(task: TaskInfo, t: Translate): string {
  switch (task.kind) {
    case 'ai': return taskName({ id: task.aiTaskId ?? '', name: task.aiTaskName }, t);
    case 'faces': return t('tasks.title.faces', { count: task.photoCount ?? task.total });
    case 'export': return t('tasks.title.export', { count: task.photoCount ?? task.total });
    case 'scan': return task.folder ? t('tasks.title.scanFolder', { folder: folderName(task.folder) }) : t('tasks.title.scan');
  }
}

/** Who started the task: Paloma for scans, the user's name, or "you". */
export function taskStarter(task: TaskInfo, t: Translate): string {
  if (task.system) return t('tasks.startedBySystem');
  if (task.mine) return t('tasks.startedByYou');
  return task.ownerName ?? t('tasks.startedByUnknown');
}

export const stateLabel = (task: TaskInfo, t: Translate): string => t(`tasks.state.${task.state}`);

/** The message an ended task of the user leaves: what it did, why it stopped, or that it was cancelled. */
export function taskMessage(task: TaskInfo, t: Translate): string {
  const title = taskTitle(task, t);
  if (task.state === 'failed') return t('tasks.message.failed', { task: title, message: task.error ?? '' });
  const parts: string[] = [];
  if (task.state === 'cancelled') parts.push(t('tasks.message.cancelled', { task: title }));
  const details = task.details;
  if (details?.kind === 'ai') {
    if (task.total === 0) return t('ai.run.nothingToDo', { task: title });
    parts.push(t('ai.run.processed', { task: title, count: task.done - task.failed }));
    if (details.tagsAdded > 0) parts.push(t('ai.run.tagsAdded', { count: details.tagsAdded }));
    if (details.descriptionsSet > 0) parts.push(t('ai.run.descriptionsSet', { count: details.descriptionsSet }));
    if (task.failed > 0) parts.push(t('ai.run.failed', { count: task.failed }));
    if (details.inputTokens + details.outputTokens > 0) parts.push(t('ai.run.tokens', { input: details.inputTokens, output: details.outputTokens }));
    if ((details.credits ?? 0) > 0) parts.push(t('ai.run.credits', { credits: details.credits }));
  } else if (details?.kind === 'faces') {
    if (task.total === 0) return t('faces.nothingToDo');
    parts.push(t('faces.found', { faces: details.faces, photos: details.photos }));
    if (task.failed > 0) parts.push(t('faces.failed', { failed: task.failed }));
  } else if (details?.kind === 'export') {
    parts.push(details.quotaExceeded
      ? t('export.quotaPartial', { done: details.files.length, requested: task.photoCount ?? task.total })
      : t('tasks.message.exported', { count: details.files.length, folder: details.outputDir }));
    if (task.failed > 0) parts.push(t('tasks.message.exportFailed', { count: task.failed }));
  } else if (details?.kind === 'scan') {
    parts.push(t('tasks.message.scanned', { task: title, count: details.indexed }));
  }
  return parts.join(' ');
}

/** The share of the task done, from 0 to 1. */
export const progressShare = (task: Pick<TaskInfo, 'done' | 'total'>): number => (task.total > 0 ? Math.min(task.done / task.total, 1) : 0);
