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

/** The content of `ai.json`: provider settings by provider id (secrets included) and tasks. */
export interface AiFile {
  providers: Record<string, Record<string, SettingValue>>;
  tasks: Partial<StoredTask>[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSettingValue = (value: unknown): value is SettingValue =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));

/** The usable parts of a parsed `ai.json`. */
function parseFile(value: unknown): AiFile {
  if (!isObject(value)) throw new Error('the file is not a JSON object');
  const providers: AiFile['providers'] = {};
  if (isObject(value.providers)) {
    for (const [id, settings] of Object.entries(value.providers)) {
      if (!isObject(settings)) continue;
      providers[id] = Object.fromEntries(Object.entries(settings).filter(([, v]) => isSettingValue(v))) as Record<string, SettingValue>;
    }
  }
  const tasks = Array.isArray(value.tasks) ? value.tasks.filter((task): task is Partial<StoredTask> => isObject(task) && typeof task.id === 'string') : [];
  return { providers, tasks };
}

/**
 * Provider settings and AI tasks, kept in `ai.json` in the data directory. The file holds secrets, so it is
 * written with mode 0600. An unreadable file is logged and treated as empty. Changes are written atomically and
 * one at a time; a failed write leaves the previous content in effect.
 */
export class AiStore {
  private writing: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string, private content: AiFile = { providers: {}, tasks: [] }) {}

  static async load(file: string): Promise<AiStore> {
    let text: string;
    try {
      text = await fs.promises.readFile(file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Cannot read ${file}: ${(err as Error).message}`);
      return new AiStore(file);
    }
    try {
      return new AiStore(file, parseFile(JSON.parse(text)));
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
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600 });
      await fs.promises.chmod(tmp, 0o600);
      await fs.promises.rename(tmp, this.file);
      this.content = content;
    });
    this.writing = next.catch(() => {});
    return next;
  }
}
