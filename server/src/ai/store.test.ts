import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AiStore, DEFAULT_PROVIDER } from './store.js';

const OPENAI = DEFAULT_PROVIDER;
const provider = (settings: Record<string, string | number | boolean>, id = 'p1', name = 'Local') => ({ id, name, type: 'openai', settings });

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
  it('starts with the default provider without a file', async () => {
    expect((await AiStore.load(file)).read()).toEqual({ providers: [OPENAI], tasks: [] });
  });

  it('saves and reads back providers and tasks', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => {
      content.providers.push(provider({ apiKey: 'sk-test', baseUrl: 'http://localhost:11434/v1' }));
      content.tasks.push({ id: 't-1', name: 'Landmarks' });
    });
    const reloaded = await AiStore.load(file);
    expect(reloaded.read()).toEqual({
      providers: [OPENAI, provider({ apiKey: 'sk-test', baseUrl: 'http://localhost:11434/v1' })],
      tasks: [{ id: 't-1', name: 'Landmarks' }],
    });
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
  });

  it('writes the file readable only by its owner', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => { content.providers[0].settings.apiKey = 'sk-test'; });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('treats an unreadable file as the default', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    expect((await AiStore.load(file)).read()).toEqual({ providers: [OPENAI], tasks: [] });
    expect(console.error).toHaveBeenCalled();
  });

  it('converts the old settings by type into providers and keeps a copy on the first save', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const old = JSON.stringify({ providers: { openai: { apiKey: 'k', nested: { a: 1 } }, ollama: { baseUrl: 'http://x/v1' }, bad: 3 }, tasks: [{ name: 'x' }, { id: 'tags', provider: 'openai' }] });
    fs.writeFileSync(file, old);
    const store = await AiStore.load(file);
    expect(store.read()).toEqual({
      providers: [
        { id: 'openai', name: 'OpenAI', type: 'openai', settings: { apiKey: 'k' } },
        { id: 'ollama', name: 'ollama', type: 'ollama', settings: { baseUrl: 'http://x/v1' } },
      ],
      tasks: [{ id: 'tags', provider: 'openai' }],
    });
    expect(fs.readFileSync(file, 'utf-8')).toBe(old);
    await store.update((content) => { content.providers[1].name = 'Ollama'; });
    expect(fs.readFileSync(`${file}.bak`, 'utf-8')).toBe(old);
    expect(fs.statSync(`${file}.bak`).mode & 0o777).toBe(0o600);
    const next = await AiStore.load(file);
    expect(next.read().providers[1].name).toBe('Ollama');
    await next.update(() => {});
    expect(fs.readFileSync(`${file}.bak`, 'utf-8')).toBe(old);
  });

  it('adds the default provider to old settings that lack it', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ providers: {}, tasks: [] }));
    expect((await AiStore.load(file)).read().providers).toEqual([OPENAI]);
  });

  it('drops providers without an id or type, repeated ids, and values that are not settings', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      providers: [{ id: 'a', type: 'openai', name: 'A', settings: { k: 'v', n: { x: 1 } } }, { id: 'a', type: 'openai', name: 'Again' }, { type: 'openai' }, { id: 'b' }, { id: 'c', type: 'openai' }],
      tasks: [{ name: 'x' }, { id: 'tags' }],
    }));
    expect((await AiStore.load(file)).read()).toEqual({
      providers: [provider({ k: 'v' }, 'a', 'A'), provider({}, 'c', 'c')],
      tasks: [{ id: 'tags' }],
    });
  });

  it('keeps the previous content when a write fails', async () => {
    const store = await AiStore.load(file);
    await store.update((content) => { content.providers[0].settings.apiKey = 'one'; });
    fs.rmSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(path.dirname(file), 'a file where the folder was');
    await expect(store.update((content) => { content.providers[0].settings.apiKey = 'two'; })).rejects.toThrow();
    expect(store.read().providers[0].settings).toEqual({ apiKey: 'one' });
  });
});
