import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AiStore } from './store.js';

let tmp: string;
let file: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_ai_store_test_'));
  file = path.join(tmp, 'data', 'ai.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('AiStore', () => {
  it('starts empty without a file', async () => {
    expect((await AiStore.load(file)).read()).toEqual({ providers: {}, tasks: [] });
  });

  it('saves and reads back providers and tasks', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => {
      content.providers.openai = { apiKey: 'sk-test', baseUrl: 'http://localhost:11434/v1' };
      content.tasks.push({ id: 't-1', name: 'Landmarks' });
    });
    const reloaded = await AiStore.load(file);
    expect(reloaded.read()).toEqual({
      providers: { openai: { apiKey: 'sk-test', baseUrl: 'http://localhost:11434/v1' } },
      tasks: [{ id: 't-1', name: 'Landmarks' }],
    });
  });

  it('writes the file readable only by its owner', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => { content.providers.openai = { apiKey: 'sk-test' }; });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('treats an unreadable file as empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    expect((await AiStore.load(file)).read()).toEqual({ providers: {}, tasks: [] });
    expect(console.error).toHaveBeenCalled();
  });

  it('drops values that are not settings and tasks without an id', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ providers: { openai: { apiKey: 'k', nested: { a: 1 } }, bad: 3 }, tasks: [{ name: 'x' }, { id: 'tags' }] }));
    expect((await AiStore.load(file)).read()).toEqual({ providers: { openai: { apiKey: 'k' } }, tasks: [{ id: 'tags' }] });
  });

  it('keeps the previous content when a write fails', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => { content.providers.openai = { apiKey: 'one' }; });
    fs.rmSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.dirname(file), 'a file where the folder was');
    await expect(store.update((content) => { content.providers.openai = { apiKey: 'two' }; })).rejects.toThrow();
    expect(store.read().providers.openai).toEqual({ apiKey: 'one' });
  });
});
