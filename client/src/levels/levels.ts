import type { ComplexityLevel } from '../../../shared/types.js';

export type Level = ComplexityLevel;

/** Every level, lowest first. Developer is the highest, so it allows everything. */
export const LEVELS = ['child', 'easy', 'normal', 'pro', 'developer'] as const satisfies readonly Level[];

/** Level used when none has been chosen in this browser. */
export const DEFAULT_LEVEL: Level = 'normal';

export const isLevel = (value: unknown): value is Level => LEVELS.includes(value as Level);

/** Whether something tagged `required` is available while `active` is the level. */
export function atLeast(active: Level, required: Level): boolean {
  return LEVELS.indexOf(active) >= LEVELS.indexOf(required);
}
