import type { EditStep } from '../../../shared/types.js';
import type { ParamDefinition } from '../plugins/api.js';
import { isRelativeRect } from '../plugins/contributions.js';
import type { RegisteredFilter } from '../plugins/registry.js';

export type FilterLookup = (name: string) => RegisteredFilter | undefined;

/** Where and why a chain is invalid. `index` is the step's position. */
export interface ChainProblem {
  index: number;
  filter?: string;
  param?: string;
  reason: string;
}

export type ChainCheck = { ok: true; steps: EditStep[] } | { ok: false; problem: ChainProblem };
export type StepCheck = { ok: true; params: Record<string, unknown> } | { ok: false; param?: string; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a list of objects that each have a string `filter`: the shape `edits` must have to be used. */
export function isEditChain(value: unknown): value is EditStep[] {
  return Array.isArray(value) && value.every((step) => isPlainObject(step) && typeof step.filter === 'string' && step.filter !== '');
}

function paramValueProblem(param: ParamDefinition, value: unknown): string | null {
  switch (param.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      return value < param.min || value > param.max ? `must be from ${param.min} to ${param.max}` : null;
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'choice':
      return param.options.some((option) => option.value === value)
        ? null
        : `must be one of ${param.options.map((option) => JSON.stringify(option.value)).join(', ')}`;
    case 'rect':
      return isRelativeRect(value) ? null : 'must be a rectangle with left < right and top < bottom, all from 0 to 1';
  }
}

/** Checks one step's parameters against its filter and returns them with defaults filled in. */
export function checkStepParams(step: EditStep, filter: RegisteredFilter): StepCheck {
  const declared = new Map(filter.definition.params.map((param) => [param.name, param]));
  for (const key of Object.keys(step)) {
    if (key !== 'filter' && key !== 'enabled' && !declared.has(key)) return { ok: false, param: key, reason: 'is not a parameter of this filter' };
  }
  const params: Record<string, unknown> = {};
  for (const param of filter.definition.params) {
    const value = step[param.name];
    if (value === undefined) {
      params[param.name] = param.type === 'rect' ? { ...param.default } : param.default;
      continue;
    }
    const problem = paramValueProblem(param, value);
    if (problem) return { ok: false, param: param.name, reason: problem };
    params[param.name] = param.type === 'rect' ? { ...(value as object) } : value;
  }
  return { ok: true, params };
}

/**
 * Validates a chain sent by a client. Steps of available filters get their parameters checked and their
 * defaults filled in; steps of filters that are not available are kept exactly as sent.
 */
export function validateChain(value: unknown, lookup: FilterLookup): ChainCheck {
  if (!Array.isArray(value)) return { ok: false, problem: { index: -1, reason: 'edits must be a list of steps' } };
  const steps: EditStep[] = [];
  for (const [index, step] of value.entries()) {
    if (!isPlainObject(step)) return { ok: false, problem: { index, reason: 'a step must be an object' } };
    if (typeof step.filter !== 'string' || step.filter === '') {
      return { ok: false, problem: { index, reason: 'a step needs a "filter" name' } };
    }
    const { filter } = step;
    if (step.enabled !== undefined && step.enabled !== false) {
      return { ok: false, problem: { index, filter, param: 'enabled', reason: '"enabled" may only be false' } };
    }
    const registered = lookup(filter);
    if (!registered) {
      steps.push(structuredClone(step) as EditStep);
      continue;
    }
    const check = checkStepParams(step as EditStep, registered);
    if (!check.ok) return { ok: false, problem: { index, filter, param: check.param, reason: check.reason } };
    steps.push({ filter, ...(step.enabled === false ? { enabled: false as const } : {}), ...check.params });
  }
  return { ok: true, steps };
}

/** A readable description of a chain problem, for API errors and logs. */
export function describeProblem(problem: ChainProblem): string {
  const where = problem.index >= 0 ? `step ${problem.index + 1}${problem.filter ? ` (${problem.filter})` : ''}` : 'edits';
  return `${where}: ${problem.param ? `"${problem.param}" ` : ''}${problem.reason}`;
}
