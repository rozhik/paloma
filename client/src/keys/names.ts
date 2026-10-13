import type { TFunction } from 'i18next';
import type { ActionId, KeymapPresetId, KeymapProblem, KeySectionId } from '../../../shared/types.js';
import { devicePreset } from '../../../shared/keymaps.js';
import { ApiRequestError, describeError } from '../api/http.js';
import { displayChord } from './keymapEdit.js';
import type { FilterAction } from './keymapStore.js';

/** Translation keys built from action ids, which the typed `t` cannot check. */
const text = (t: TFunction, key: string, options?: Record<string, unknown>): string => (t as unknown as (k: string, o?: object) => string)(key, options);

/** An action's name in the active language; a plugin's filter by its own label. */
export function actionName(t: TFunction, id: ActionId, filters: readonly FilterAction[] = []): string {
  const key = `keys.actions.${id}`;
  const name = text(t, key);
  if (name !== key) return name;
  return filters.find((filter) => filter.id === id)?.label ?? id;
}

export const sectionName = (t: TFunction, id: KeySectionId): string => text(t, `keys.sections.${id}`);

export const presetName = (t: TFunction, id: KeymapPresetId): string => t(`keys.presets.${id}.name`);

/** Whether this device shows ⌘ ⌥ ⇧ for modifiers. */
export const isMac = (): boolean => typeof navigator !== 'undefined' && devicePreset(navigator.platform ?? '') === 'mac';

/** A keymap problem as a sentence, with keys as shown and actions by name. */
export function problemText(t: TFunction, problem: KeymapProblem, filters: readonly FilterAction[] = []): string {
  const key = problem.key === undefined ? '' : displayChord(problem.key, isMac());
  const actions = (problem.actions ?? []).map((id) => actionName(t, id, filters)).join(', ');
  return text(t, `keys.problems.${problem.code}`, { key, actions });
}

/** The message for a failed keymap request: each problem the server named, else the usual error message. */
export function keymapError(t: TFunction, err: unknown, filters: readonly FilterAction[] = []): string {
  const problems = err instanceof ApiRequestError ? err.body?.problems : undefined;
  return problems?.length ? problems.map((problem) => problemText(t, problem, filters)).join(' ') : describeError(err, t);
}
