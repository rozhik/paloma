import type { FilterGroup, RelativeRect } from '../../../shared/types.js';
import type { AuthProviderDefinition, FilterDefinition, ParamDefinition, PluginContributions } from './api.js';
import { COMPLEXITY_LEVELS, isComplexityLevel, isLocalizedText } from './manifest.js';

const FILTER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GROUPS: readonly FilterGroup[] = ['basic', 'tuning', 'effects'];
const KNOWN_KEYS = new Set(['filters', 'authProviders']);
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;
const PROVIDER_KINDS = ['credentials', 'bearer'];
/** Keys of an edit step that are not parameters */
const RESERVED_PARAMS = new Set(['filter', 'enabled']);

export interface CheckedContributions {
  filters: FilterDefinition[];
  authProviders: AuthProviderDefinition[];
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRelativeRect(value: unknown): value is RelativeRect {
  if (!isPlainObject(value)) return false;
  const { left, top, right, bottom } = value;
  const inRange = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  return inRange(left) && inRange(top) && inRange(right) && inRange(bottom) && left < right && top < bottom;
}

/** Why a parameter definition is unusable, or null when it is fine. */
function paramProblem(param: unknown, seen: Set<string>): string | null {
  if (!isPlainObject(param)) return 'a parameter is not an object';
  const { name } = param;
  if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return `parameter name ${JSON.stringify(name)} is invalid`;
  if (RESERVED_PARAMS.has(name)) return `parameter name "${name}" is reserved`;
  if (seen.has(name)) return `parameter "${name}" is declared twice`;
  seen.add(name);
  if (!isLocalizedText(param.label)) return `parameter "${name}" has no valid label`;

  const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  switch (param.type) {
    case 'number': {
      const { min, max, step } = param;
      if (!isNumber(min) || !isNumber(max) || !isNumber(step) || min > max || step <= 0) {
        return `parameter "${name}" needs numbers min <= max and step > 0`;
      }
      if (!isNumber(param.default) || param.default < min || param.default > max) return `parameter "${name}" has a default outside its range`;
      return null;
    }
    case 'boolean':
      return typeof param.default === 'boolean' ? null : `parameter "${name}" needs a boolean default`;
    case 'choice': {
      const { options } = param;
      if (!Array.isArray(options) || options.length === 0) return `parameter "${name}" needs options`;
      const values = new Set<unknown>();
      for (const option of options) {
        if (!isPlainObject(option) || !(typeof option.value === 'string' || isNumber(option.value)) || !isLocalizedText(option.label)) {
          return `parameter "${name}" has an option without a value or label`;
        }
        values.add(option.value);
      }
      return values.has(param.default) ? null : `parameter "${name}" has a default that is not one of its options`;
    }
    case 'rect':
      return isRelativeRect(param.default) ? null : `parameter "${name}" needs a default rectangle within 0..1`;
    default:
      return `parameter "${name}" has unknown type ${JSON.stringify(param.type)}`;
  }
}

/** Why a filter definition is unusable, or null when it is fine. */
function filterProblem(filter: unknown): string | null {
  if (!isPlainObject(filter)) return 'a filter is not an object';
  const { name } = filter;
  if (typeof name !== 'string' || !FILTER_NAME.test(name)) return `filter name ${JSON.stringify(name)} is invalid`;
  if (!isLocalizedText(filter.label)) return `filter "${name}" has no valid label`;
  if (!GROUPS.includes(filter.group as FilterGroup)) return `filter "${name}" has unknown group ${JSON.stringify(filter.group)}`;
  if (typeof filter.render !== 'function') return `filter "${name}" has no render function`;
  if (filter.level !== undefined && !isComplexityLevel(filter.level)) {
    return `filter "${name}" has level ${JSON.stringify(filter.level)}, which is not one of ${COMPLEXITY_LEVELS.join(', ')}`;
  }
  if (filter.params !== undefined && !Array.isArray(filter.params)) return `filter "${name}" has params that are not a list`;
  const seen = new Set<string>();
  for (const param of (filter.params as unknown[] | undefined) ?? []) {
    const problem = paramProblem(param, seen);
    if (problem) return `filter "${name}": ${problem}`;
  }
  return null;
}

/** Why an auth provider definition is unusable, or null when it is fine. */
function providerProblem(provider: unknown): string | null {
  if (!isPlainObject(provider)) return 'an auth provider is not an object';
  const { id } = provider;
  if (typeof id !== 'string' || !PROVIDER_ID.test(id)) return `auth provider id ${JSON.stringify(id)} is invalid`;
  if (!isLocalizedText(provider.label)) return `auth provider "${id}" has no valid label`;
  if (!PROVIDER_KINDS.includes(provider.kind as string)) {
    return `auth provider "${id}" has kind ${JSON.stringify(provider.kind)}, which is not one of ${PROVIDER_KINDS.join(', ')}`;
  }
  if (provider.kind === 'bearer') {
    return typeof provider.authenticate === 'function' ? null : `auth provider "${id}" has no authenticate function`;
  }
  if (typeof provider.login !== 'function') return `auth provider "${id}" has no login function`;
  if ((typeof provider.setSecret === 'function') !== (typeof provider.checkSecret === 'function')) {
    return `auth provider "${id}" must have both setSecret and checkSecret, or neither`;
  }
  if (!Array.isArray(provider.fields) || provider.fields.length === 0) return `auth provider "${id}" has no fields`;
  const names = new Set<string>();
  for (const field of provider.fields) {
    if (!isPlainObject(field) || typeof field.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.name)
      || !isLocalizedText(field.label) || (field.type !== 'text' && field.type !== 'password') || names.has(field.name)) {
      return `auth provider "${id}" has an invalid field`;
    }
    names.add(field.name);
  }
  return null;
}

function checkProviders(value: unknown, warnings: string[]): AuthProviderDefinition[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push('"authProviders" is not a list and is ignored');
    return [];
  }
  const providers: AuthProviderDefinition[] = [];
  const ids = new Set<string>();
  for (const provider of value) {
    const problem = providerProblem(provider);
    if (problem) {
      warnings.push(`${problem}; the provider is not available`);
    } else if (ids.has(provider.id)) {
      warnings.push(`auth provider "${provider.id}" is declared twice; the second one is ignored`);
    } else {
      ids.add(provider.id);
      providers.push(provider);
    }
  }
  return providers;
}

/**
 * Checks what a plugin's `activate` returned against plugin API v1. Throws when it is not an object.
 * Unusable filters and auth providers and unknown keys are dropped with a warning, so the rest of the plugin still works.
 */
export function checkContributions(value: unknown): CheckedContributions {
  if (!isPlainObject(value)) throw new Error('activate() must return an object of contributions');
  const contributions = value as PluginContributions & Record<string, unknown>;
  const warnings: string[] = [];
  for (const key of Object.keys(contributions)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`"${key}" is not supported by plugin API 1 and is ignored`);
  }

  const filters: FilterDefinition[] = [];
  if (contributions.filters !== undefined && !Array.isArray(contributions.filters)) {
    warnings.push('"filters" is not a list and is ignored');
  } else {
    const names = new Set<string>();
    for (const filter of contributions.filters ?? []) {
      const problem = filterProblem(filter);
      if (problem) {
        warnings.push(`${problem}; the filter is ignored`);
      } else if (names.has(filter.name)) {
        warnings.push(`filter "${filter.name}" is declared twice; the second one is ignored`);
      } else {
        names.add(filter.name);
        const checked = { ...filter, params: (filter.params ?? []) as ParamDefinition[] };
        if (checked.icon !== undefined && (typeof checked.icon !== 'string' || checked.icon === '')) {
          warnings.push(`filter "${filter.name}": icon is not a file path; the filter has no icon`);
          delete checked.icon;
        }
        filters.push(checked);
      }
    }
  }
  const authProviders = checkProviders(contributions.authProviders, warnings);
  return { filters, authProviders, warnings };
}
