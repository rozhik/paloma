import type { TFunction } from 'i18next';
import type { AiOutputKind, AiProviderInfo, AiTask, AiTaskProblem } from '../../../shared/types.js';

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

/** Why a task cannot be started from a menu, in the active language; null when it can. */
export function taskUnavailable(task: Pick<AiTask, 'problem'>, t: Translate): string | null {
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
