import crypto from 'node:crypto';
import type { AiOutputKind, AiTask, AiTaskOptions, AiTaskProblem, AiTextTarget } from '../../../shared/types.js';
import type { AiModelOptionDefinition } from '../plugins/api.js';
import type { SettingValue, StoredTask } from './store.js';

export const BUILT_IN_IDS = ['tags', 'objects', 'description'] as const;
const OUTPUTS: readonly AiOutputKind[] = ['tags', 'objects', 'text'];
const TEXT_TARGETS: readonly AiTextTarget[] = ['description-if-empty', 'description-always', 'none'];
const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const MAX_NAME = 100;
const MAX_MODEL = 200;
const MAX_PROMPT = 20000;
/** The provider built-in tasks use until an administrator chooses another */
export const DEFAULT_PROVIDER = 'openai';

export const DEFAULT_PROMPTS: Record<(typeof BUILT_IN_IDS)[number], string> = {
  tags: 'List up to {maxTags} short tags that describe this photo: the main subjects, objects, scene, kind of place, activity, '
    + 'season, time of day and mood. Write the tags in {language}, in lowercase except for proper names, each one to three words, '
    + 'with your confidence from 0 to 1. Prefer tags from this list when they fit: {libraryTags}.',
  objects: 'Find the distinct objects, animals and people in this photo. For each one give a short label in {language}, '
    + 'its bounding box as fractions of the image width and height (left, top, right, bottom, from 0 to 1, measured from the '
    + 'top left corner), and your confidence from 0 to 1.',
  description: 'Describe this photo in one or two sentences in {language}, as a caption in a family photo album: who or what '
    + 'is shown, where, and what is happening. Do not start with "This photo" or "The image".',
};

const OUTPUT_OF: Record<(typeof BUILT_IN_IDS)[number], AiOutputKind> = { tags: 'tags', objects: 'objects', description: 'text' };

/** The options a task of this output kind has, with their defaults. */
export function defaultOptions(output: AiOutputKind): AiTaskOptions {
  const common = { imageSize: 1024, language: 'user', parallel: 2 };
  if (output === 'tags') return { ...common, maxTags: 10, minConfidence: 0.5 };
  if (output === 'objects') return { ...common, minConfidence: 0.5, labelsAsTags: false };
  return { ...common, textTarget: 'description-if-empty' };
}

const isBuiltIn = (id: string): id is (typeof BUILT_IN_IDS)[number] => (BUILT_IN_IDS as readonly string[]).includes(id);

/** A built-in task as it is before any change. */
export function builtInDefaults(id: (typeof BUILT_IN_IDS)[number]): StoredTask {
  const output = OUTPUT_OF[id];
  return {
    id, builtIn: true, name: null, output, inMenu: true, provider: DEFAULT_PROVIDER, model: null,
    prompt: DEFAULT_PROMPTS[id], modelOptions: {}, options: defaultOptions(output),
  };
}

/** The options of `options` that apply to the output kind, the others at their defaults. */
function optionsFor(output: AiOutputKind, options: Partial<AiTaskOptions> | undefined): AiTaskOptions {
  const defaults = defaultOptions(output);
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof AiTaskOptions)[]) {
    if (options?.[key] !== undefined) (result as Record<string, unknown>)[key] = options[key];
  }
  return result;
}

/** The tasks of `ai.json`: built-in ones first, completed from their defaults, then the custom ones in order. */
export function resolveTasks(stored: readonly Partial<StoredTask>[]): StoredTask[] {
  const builtIns = BUILT_IN_IDS.map((id) => {
    const saved = stored.find((task) => task.id === id);
    const defaults = builtInDefaults(id);
    if (!saved) return defaults;
    return {
      ...defaults,
      ...Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)),
      id, builtIn: true, output: defaults.output,
      options: optionsFor(defaults.output, saved.options),
      modelOptions: { ...(saved.modelOptions ?? {}) },
    } as StoredTask;
  });
  const custom = stored.filter((task) => !isBuiltIn(task.id!) && typeof task.output === 'string' && OUTPUTS.includes(task.output))
    .map((task) => ({
      id: task.id!, builtIn: false, name: typeof task.name === 'string' ? task.name : task.id!, output: task.output!,
      inMenu: task.inMenu !== false, provider: task.provider ?? null, model: task.model ?? null, prompt: task.prompt ?? '',
      modelOptions: { ...(task.modelOptions ?? {}) }, options: optionsFor(task.output!, task.options),
    }));
  return [...builtIns, ...custom];
}

/** What the readiness of a task depends on. */
export interface ProviderState {
  available: boolean;
  configured: boolean;
}

/** Why a task cannot run; `modelEnabled` is false when the provider's catalogue has the task's model disabled. */
export function taskProblem(task: StoredTask, provider: ProviderState | undefined, modelEnabled = true): AiTaskProblem | null {
  if (!task.provider) return 'no_provider';
  if (!provider?.available) return 'provider_unavailable';
  if (!provider.configured) return 'provider_not_configured';
  if (!task.model) return 'no_model';
  if (!modelEnabled) return 'model_disabled';
  return null;
}

/** A task as the API shows it. */
export function taskInfo(task: StoredTask, provider: ProviderState | undefined, modelEnabled = true): AiTask {
  const problem = taskProblem(task, provider, modelEnabled);
  return { ...structuredClone(task), ready: problem === null, problem };
}

export class TaskInputError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'TaskInputError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function intIn(field: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TaskInputError(field, `${field} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

/** Checks the `options` of a task input against the output kind; unknown and inapplicable options are refused. */
function parseOptions(output: AiOutputKind, current: AiTaskOptions, value: unknown): AiTaskOptions {
  if (value === undefined) return optionsFor(output, current);
  if (!isObject(value)) throw new TaskInputError('options', 'options must be an object');
  const result = optionsFor(output, current);
  const allowed = Object.keys(defaultOptions(output));
  for (const [key, option] of Object.entries(value)) {
    const field = `options.${key}`;
    if (!allowed.includes(key)) throw new TaskInputError(field, `${key} is not an option of ${output} tasks`);
    switch (key) {
      case 'imageSize': result.imageSize = intIn(field, option, 256, 2048); break;
      case 'parallel': result.parallel = intIn(field, option, 1, 8); break;
      case 'maxTags': result.maxTags = intIn(field, option, 1, 50); break;
      case 'language':
        if (typeof option !== 'string' || (option !== 'user' && !LANGUAGE_TAG.test(option))) {
          throw new TaskInputError(field, 'language must be "user" or a language tag such as "en"');
        }
        result.language = option;
        break;
      case 'minConfidence':
        if (typeof option !== 'number' || !(option >= 0 && option <= 1)) throw new TaskInputError(field, 'minConfidence must be a number from 0 to 1');
        result.minConfidence = option;
        break;
      case 'labelsAsTags':
        if (typeof option !== 'boolean') throw new TaskInputError(field, 'labelsAsTags must be true or false');
        result.labelsAsTags = option;
        break;
      case 'textTarget':
        if (!TEXT_TARGETS.includes(option as AiTextTarget)) throw new TaskInputError(field, `textTarget must be one of ${TEXT_TARGETS.join(', ')}`);
        result.textTarget = option as AiTextTarget;
        break;
    }
  }
  return result;
}

/** Checks model option values against the provider's declarations; without them (provider off) they are kept as sent. */
function parseModelOptions(value: unknown, declared: readonly AiModelOptionDefinition[] | undefined): Record<string, SettingValue> {
  if (!isObject(value)) throw new TaskInputError('modelOptions', 'modelOptions must be an object');
  const result: Record<string, SettingValue> = {};
  for (const [name, option] of Object.entries(value)) {
    const field = `modelOptions.${name}`;
    if (option === null) continue;
    if (!declared) {
      if (typeof option !== 'string' && typeof option !== 'number' && typeof option !== 'boolean') throw new TaskInputError(field, `${name} must be a text, number or boolean`);
      result[name] = option;
      continue;
    }
    const definition = declared.find((d) => d.name === name);
    if (!definition) throw new TaskInputError(field, `${name} is not a model option of this provider`);
    const ok = definition.type === 'number'
      ? typeof option === 'number' && option >= definition.min && option <= definition.max
      : definition.type === 'boolean' ? typeof option === 'boolean' : definition.options.some((o) => o.value === option);
    if (!ok) throw new TaskInputError(field, `${name} has a value this provider does not accept`);
    result[name] = option as SettingValue;
  }
  return result;
}

function parseNullableText(field: string, value: unknown, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new TaskInputError(field, `${field} must be a non-empty text of at most ${max} characters, or null`);
  }
  return value.trim();
}

/**
 * Applies a `POST`/`PATCH /api/ai/tasks` body to a task (a new custom task for `POST`). `declaredOptions` is
 * the model options of the task's provider after the change, or undefined when that provider is not available.
 * Throws TaskInputError naming the field.
 */
export function applyTaskInput(
  task: StoredTask, body: unknown, declaredOptions: (provider: string | null) => readonly AiModelOptionDefinition[] | undefined,
): StoredTask {
  if (!isObject(body)) throw new TaskInputError('', 'Body must be an object');
  const known = ['name', 'output', 'inMenu', 'provider', 'model', 'prompt', 'modelOptions', 'options'];
  for (const key of Object.keys(body)) if (!known.includes(key)) throw new TaskInputError(key, `${key} is not a field of a task`);
  const next = structuredClone(task);

  if (body.name !== undefined) {
    const name = parseNullableText('name', body.name, MAX_NAME);
    if (name === null && !task.builtIn) throw new TaskInputError('name', 'name must be a non-empty text');
    next.name = name;
  }
  if (body.output !== undefined) {
    if (!OUTPUTS.includes(body.output as AiOutputKind)) throw new TaskInputError('output', `output must be one of ${OUTPUTS.join(', ')}`);
    if (task.builtIn && body.output !== task.output) throw new TaskInputError('output', 'The output of a built-in task cannot change');
    next.output = body.output as AiOutputKind;
  }
  if (body.inMenu !== undefined) {
    if (typeof body.inMenu !== 'boolean') throw new TaskInputError('inMenu', 'inMenu must be true or false');
    next.inMenu = body.inMenu;
  }
  if (body.provider !== undefined) {
    if (body.provider !== null && (typeof body.provider !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(body.provider))) {
      throw new TaskInputError('provider', 'provider must be a provider id or null');
    }
    if (body.provider !== task.provider) next.modelOptions = {};
    next.provider = body.provider as string | null;
  }
  if (body.model !== undefined) next.model = parseNullableText('model', body.model, MAX_MODEL);
  if (body.prompt !== undefined) {
    if (typeof body.prompt !== 'string' || body.prompt.trim() === '' || body.prompt.length > MAX_PROMPT) {
      throw new TaskInputError('prompt', `prompt must be a non-empty text of at most ${MAX_PROMPT} characters`);
    }
    next.prompt = body.prompt;
  }
  if (body.modelOptions !== undefined) next.modelOptions = parseModelOptions(body.modelOptions, declaredOptions(next.provider));
  next.options = parseOptions(next.output, next.output === task.output ? task.options : defaultOptions(next.output), body.options);
  return next;
}

/** A new custom task from a `POST /api/ai/tasks` body; it needs a name, output and prompt. */
export function newTask(body: unknown, declaredOptions: Parameters<typeof applyTaskInput>[2]): StoredTask {
  const value = isObject(body) ? body : {};
  if (value.name === undefined || value.name === null) throw new TaskInputError('name', 'name must be a non-empty text');
  if (value.output === undefined) throw new TaskInputError('output', `output must be one of ${OUTPUTS.join(', ')}`);
  if (value.prompt === undefined) throw new TaskInputError('prompt', 'prompt must be a non-empty text');
  const output = OUTPUTS.includes(value.output as AiOutputKind) ? value.output as AiOutputKind : 'tags';
  const base: StoredTask = {
    id: `t-${crypto.randomBytes(6).toString('hex').slice(0, 8)}`, builtIn: false, name: 'x', output, inMenu: true,
    provider: DEFAULT_PROVIDER, model: null, prompt: 'x', modelOptions: {}, options: defaultOptions(output),
  };
  return applyTaskInput(base, body, declaredOptions);
}

/** A built-in task reset to its defaults, keeping its provider and model. */
export function resetTask(task: StoredTask): StoredTask {
  if (!isBuiltIn(task.id)) throw new Error(`${task.id} is not a built-in task`);
  return { ...builtInDefaults(task.id), provider: task.provider, model: task.model };
}

export { isBuiltIn as isBuiltInTask };

/** Model options with the provider's defaults filled in for those the task leaves unset. */
export function effectiveModelOptions(task: StoredTask, declared: readonly AiModelOptionDefinition[]): Record<string, SettingValue> {
  const result: Record<string, SettingValue> = {};
  for (const option of declared) result[option.name] = task.modelOptions[option.name] ?? option.default;
  return result;
}

/**
 * What a result depends on: provider, model, prompt, model options, image size and the language the run uses.
 * A result with another fingerprint counts as not processed.
 */
export function taskFingerprint(task: StoredTask, modelOptions: Record<string, SettingValue>, language: string): string {
  const sorted = Object.fromEntries(Object.entries(modelOptions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const key = JSON.stringify([task.provider, task.model, task.prompt, sorted, task.options.imageSize, language]);
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** The language tag a run uses: the task's fixed language, or the UI language of the user who starts it. */
export function runLanguage(task: StoredTask, userLanguage: string): string {
  return task.options.language === 'user' ? userLanguage : task.options.language;
}
