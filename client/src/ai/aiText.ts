import type { TFunction } from 'i18next';
import type { AiOutputKind, AiProviderInfo, AiRunInfo, AiTask, AiTaskProblem } from '../../../shared/types.js';

type Translate = TFunction | ((key: string, options?: Record<string, unknown>) => string);

const BUILT_IN = ['tags', 'objects', 'description'];

/** A task's name: its own, or for a built-in task never renamed, its name in the active language. */
export function taskName(task: Pick<AiTask, 'id' | 'name'> | { id: string; name: string | null }, t: Translate): string {
  if (task.name !== null) return task.name;
  return BUILT_IN.includes(task.id) ? t(`ai.task.${task.id}`) : task.id;
}

export const outputLabel = (output: AiOutputKind, t: Translate): string => t(`ai.output.${output}`);

/** Why a task cannot run, in the active language. */
export const problemLabel = (problem: AiTaskProblem, t: Translate): string => t(`ai.problem.${problem}`);

/** Why a task cannot be started from a menu now, in the active language; null when it can. */
export function taskUnavailable(task: Pick<AiTask, 'problem'>, running: boolean, t: Translate): string | null {
  if (running) return t('ai.menu.running');
  return task.problem ? problemLabel(task.problem, t) : null;
}

/** The placeholders a prompt can use, in the order the editor lists them. */
export const PROMPT_PLACEHOLDERS = ['language', 'maxTags', 'photoTags', 'description', 'libraryTags'] as const;

/** Where a provider sends photos: the value of its address setting, saved or default, if it has one. */
export function providerAddress(provider: AiProviderInfo): string | null {
  const setting = provider.settings.find((s) => /url|address|host/i.test(s.name) && (s.type === 'text'));
  if (!setting) return null;
  if (typeof setting.value === 'string' && setting.value !== '') return setting.value;
  if (setting.fromEnv) return null;
  return typeof setting.default === 'string' ? setting.default : null;
}

/** The message a finished run leaves. */
export function runMessage(run: AiRunInfo, t: Translate): string {
  const name = taskName({ id: run.taskId, name: run.taskName }, t);
  if (run.state === 'stopped') return t('ai.run.stoppedError', { task: name, message: run.error ?? '' });
  if (run.total === 0) return t('ai.run.nothingToDo', { task: name });
  const parts = [t('ai.run.processed', { task: name, count: run.done - run.failed })];
  if (run.state === 'cancelled') parts.unshift(t('ai.run.cancelled'));
  if (run.tagsAdded > 0) parts.push(t('ai.run.tagsAdded', { count: run.tagsAdded }));
  if (run.descriptionsSet > 0) parts.push(t('ai.run.descriptionsSet', { count: run.descriptionsSet }));
  if (run.failed > 0) parts.push(t('ai.run.failed', { count: run.failed }));
  if (run.inputTokens + run.outputTokens > 0) parts.push(t('ai.run.tokens', { input: run.inputTokens, output: run.outputTokens }));
  return parts.join(' ');
}
