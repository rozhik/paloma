import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PluginState } from './state.js';

let tmp: string;
let file: string;

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_state_test_'));
  file = path.join(tmp, 'data', 'plugins.json');
});

afterEach(async () => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PluginState', () => {
  it('has bundled plugins on and external plugins off by default', async () => {
    const state = await PluginState.load(file);
    expect(state.isEnabled('basic-effects', 'bundled')).toBe(true);
    expect(state.isEnabled('film-grain', 'external')).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('keeps choices across a reload', async () => {
    const state = await PluginState.load(file);
    await state.setEnabled('basic-effects', false);
    await state.setEnabled('film-grain', true);

    const reloaded = await PluginState.load(file);
    expect(reloaded.isEnabled('basic-effects', 'bundled')).toBe(false);
    expect(reloaded.isEnabled('film-grain', 'external')).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      plugins: { 'basic-effects': { enabled: false }, 'film-grain': { enabled: true } },
    });
    expect(fs.readdirSync(path.dirname(file))).toEqual(['plugins.json']);
  });

  it('falls back to defaults for a corrupt file and logs it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    const state = await PluginState.load(file);
    expect(state.isEnabled('basic-effects', 'bundled')).toBe(true);
    expect(state.isEnabled('film-grain', 'external')).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(file));
  });

  it('keeps the previous choice when the file cannot be written', async () => {
    fs.writeFileSync(path.join(tmp, 'data'), 'a file where the folder should be');
    const state = await PluginState.load(file);
    await expect(state.setEnabled('basic-effects', false)).rejects.toThrow();
    expect(state.isEnabled('basic-effects', 'bundled')).toBe(true);
  });
});
