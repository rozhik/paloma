import fs from 'node:fs';
import path from 'node:path';
import type { AiOutputKind, AiTaskOptions } from '../../../shared/types.js';

export const AI_FILE_NAME = 'ai.json';

export type SettingValue = string | number | boolean;

/** A task as `ai.json` keeps it; built-in tasks are completed from their defaults when read. */
export interface StoredTask {
  id: string;
  builtIn: boolean;
  /** Null: a built-in task's name in the UI language */
  name: string | null;
  output: AiOutputKind;
  inMenu: boolean;
  provider: string | null;
  model: string | null;
  prompt: string;
  modelOptions: Record<string, SettingValue>;
  options: AiTaskOptions;
}

/** A named AI provider as `ai.json` keeps it: an instance of a plugin's provider type with its own settings. */
export interface StoredProvider {
  /** Generated, never changes; tasks refer to it */
  id: string;
  name: string;
  /** The id of the provider type a plugin contributes */
  type: string;
  settings: Record<string, SettingValue>;
}

/** The content of `ai.json`: the named providers (secrets included) and tasks. */
export interface AiFile {
  providers: StoredProvider[];
  tasks: Partial<StoredTask>[];
}

/** The provider that exists on a fresh install and that old settings of `openai` become. */
export const DEFAULT_PROVIDER: StoredProvider = { id: 'openai', name: 'OpenAI', type: 'openai', settings: {} };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSettingValue = (value: unknown): value is SettingValue =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

const settingsOf = (value: unknown): Record<string, SettingValue> =>
  isObject(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => isSettingValue(v))) as Record<string, SettingValue> : {};

/**
 * The usable parts of a parsed `ai.json`. `legacy` says the providers were the old map of settings by type id, which
 * becomes one provider per key (id = key, type = key, name = `OpenAI` for `openai`, else the key).
 */
function parseFile(value: unknown): { file: AiFile; legacy: boolean } {
  if (!isObject(value)) throw new Error('the file is not a JSON object');
  const providers: StoredProvider[] = [];
  let legacy = false;
  if (Array.isArray(value.providers)) {
    for (const entry of value.providers) {
      if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.type !== 'string' || providers.some((p) => p.id === entry.id)) continue;
      providers.push({ id: entry.id, name: typeof entry.name === 'string' && entry.name !== '' ? entry.name : entry.id, type: entry.type, settings: settingsOf(entry.settings) });
    }
  } else {
    legacy = true;
    if (isObject(value.providers)) {
      for (const [id, settings] of Object.entries(value.providers)) {
        if (!isObject(settings)) continue;
        providers.push({ id, name: id === DEFAULT_PROVIDER.id ? DEFAULT_PROVIDER.name : id, type: id, settings: settingsOf(settings) });
      }
    }
    if (!providers.some((p) => p.id === DEFAULT_PROVIDER.id)) providers.unshift(structuredClone(DEFAULT_PROVIDER));
  }
  const tasks = Array.isArray(value.tasks) ? value.tasks.filter((task): task is Partial<StoredTask> => isObject(task) && typeof task.id === 'string') : [];
  return { file: { providers, tasks }, legacy };
}

const freshFile = (): AiFile => ({ providers: [structuredClone(DEFAULT_PROVIDER)], tasks: [] });

/**
 * Provider settings and AI tasks, kept in `ai.json` in the data directory. The file holds secrets, so it is
 * written with mode 0600. An older file that kept settings by provider type is converted when read and copied to
 * `ai.json.bak` before the first save in the new shape. An unreadable file is logged and treated as empty. Changes are written atomically and
 * one at a time; a failed write leaves the previous content in effect.
 */
export class AiStore {
  private writing: Promise<unknown> = Promise.resolve();

  /**
   * @param backup the file held the old shape, so the first save keeps a copy as `<file>.bak`
   */
  constructor(private readonly file: string, private content: AiFile = freshFile(), private backup = false) {}

  static async load(file: string): Promise<AiStore> {
    let text: string;
    try {
      text = await fs.promises.readFile(file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Cannot read ${file}: ${(err as Error).message}`);
      return new AiStore(file);
    }
    try {
      const { file: content, legacy } = parseFile(JSON.parse(text));
      return new AiStore(file, content, legacy);
    } catch (err) {
      console.error(`Ignoring unreadable ${file}, AI providers and tasks use their defaults: ${(err as Error).message}`);
      return new AiStore(file);
    }
  }

  /** A copy of the current content. */
  read(): AiFile {
    return structuredClone(this.content);
  }

  /** Applies `change` to a copy of the content and saves it; the change takes effect only once written. */
  update(change: (content: AiFile) => void): Promise<void> {
    const next = this.writing.then(async () => {
      const content = this.read();
      change(content);
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      if (this.backup) {
        await fs.promises.copyFile(this.file, `${this.file}.bak`);
        await fs.promises.chmod(`${this.file}.bak`, 0o600);
      }
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
      await fs.promises.chmod(tmp, 0o600);
      await fs.promises.rename(tmp, this.file);
      this.content = content;
      this.backup = false;
    });
    this.writing = next.catch(() => {});
    return next;
  }
}
