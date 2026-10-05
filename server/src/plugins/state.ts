import fs from 'node:fs';
import path from 'node:path';
import type { PluginSource } from '../../../shared/types.js';

export const STATE_FILE_NAME = 'plugins.json';

interface StateFile {
  plugins: Record<string, { enabled: boolean }>;
}

/**
 * The user's on/off choice per plugin id, kept in `plugins.json` in the data directory. A plugin without a
 * choice is on when bundled and off when external. An unreadable file is logged and treated as empty.
 */
export class PluginState {
  private choices: Record<string, boolean> = {};

  constructor(private readonly file: string) {
    this.load();
  }

  private load(): void {
    let text: string;
    try {
      text = fs.readFileSync(this.file, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`Cannot read ${this.file}: ${(err as Error).message}`);
      return;
    }
    try {
      const parsed = JSON.parse(text) as Partial<StateFile>;
      if (typeof parsed.plugins !== 'object' || parsed.plugins === null || Array.isArray(parsed.plugins)) {
        throw new Error('"plugins" is not an object');
      }
      for (const [id, choice] of Object.entries(parsed.plugins)) {
        if (typeof choice?.enabled === 'boolean') this.choices[id] = choice.enabled;
      }
    } catch (err) {
      console.error(`Ignoring unreadable ${this.file}, plugins use their defaults: ${(err as Error).message}`);
    }
  }

  isEnabled(id: string, source: PluginSource): boolean {
    return this.choices[id] ?? source === 'bundled';
  }

  /** Saves the choice atomically; throws if the file cannot be written, leaving the choice unchanged. */
  setEnabled(id: string, enabled: boolean): void {
    const next = { ...this.choices, [id]: enabled };
    const data: StateFile = { plugins: {} };
    for (const key of Object.keys(next).sort()) data.plugins[key] = { enabled: next[key] };

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
    this.choices = next;
  }
}
