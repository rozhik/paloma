import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'node:path';
import { checkContributions } from '../../server/src/plugins/contributions.js';
import { readManifest } from '../../server/src/plugins/manifest.js';
import { checkAnswer } from '../../server/src/ai/answer.js';
import type { AiContext, AiProviderDefinition, AiRequest } from '../../server/src/plugins/api.js';
import * as plugin from './index.js';

const LANGUAGES = ['en', 'zh-Hans', 'es', 'ar', 'pt-BR', 'fr', 'de', 'ja', 'ru', 'id', 'uk'];

const provider = checkContributions(plugin.activate()).aiProviders[0] as AiProviderDefinition;

const ctx = (settings: AiContext['settings'] = {}, env: AiContext['env'] = {}): AiContext => ({
  settings: { baseUrl: plugin.DEFAULT_BASE_URL, timeoutSeconds: 60, ...settings },
  env,
  signal: new AbortController().signal,
  log: { info() {}, warn() {}, error() {} },
});

const request = (output: AiRequest['output']): AiRequest => ({
  model: 'gpt-test',
  prompt: 'Tag this photo in Ukrainian',
  output,
  language: 'Ukrainian',
  maxTags: 10,
  image: { data: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg', width: 1024, height: 768 },
  options: { temperature: 0.2, detail: 'high', maxOutputTokens: 1024 },
});

const reply = (content: string, usage = { prompt_tokens: 812, completion_tokens: 40 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

const errorReply = (status: number, message: string, headers: Record<string, string> = {}, code?: string) =>
  new Response(JSON.stringify({ error: { message, ...(code ? { code } : {}) } }), { status, headers });

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const sentBody = (fn: ReturnType<typeof mockFetch>, call = 0) => JSON.parse((fn.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);
const sentUrl = (fn: ReturnType<typeof mockFetch>, call = 0) => (fn.mock.calls[call] as unknown as [string, RequestInit])[0];
const sentHeaders = (fn: ReturnType<typeof mockFetch>, call = 0) => (fn.mock.calls[call] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ai-openai manifest and contributions', () => {
  it('has a valid manifest with texts in every UI language, on at the Normal level', async () => {
    const read = await readManifest(path.dirname(new URL(import.meta.url).pathname));
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.manifest).toMatchObject({ id: 'ai-openai', level: 'normal' });
    for (const lang of LANGUAGES) expect((read.manifest.description as Record<string, string>)[lang], lang).toBeTruthy();
  });

  it('contributes the openai provider without warnings', () => {
    const checked = checkContributions(plugin.activate());
    expect(checked.warnings).toEqual([]);
    expect(provider.id).toBe('openai');
    expect(provider.settings!.map((s) => [s.name, s.type])).toEqual([['apiKey', 'secret'], ['baseUrl', 'text'], ['timeoutSeconds', 'number']]);
    expect(provider.modelOptions!.map((o) => o.name)).toEqual(['temperature', 'detail', 'maxOutputTokens']);
  });
});

describe('settings', () => {
  it('needs a key only for OpenAI itself', () => {
    expect(provider.missingSettings!(ctx())).toEqual(['apiKey']);
    expect(provider.missingSettings!(ctx({ apiKey: 'sk-1' }))).toEqual([]);
    expect(provider.missingSettings!(ctx({ baseUrl: 'http://localhost:11434/v1' }))).toEqual([]);
  });

  it('takes the key and address from the environment when none is saved', () => {
    expect(provider.missingSettings!(ctx({}, { OPENAI_API_KEY: 'sk-env' }))).toEqual([]);
    expect(provider.settingFromEnv!('apiKey', { env: { OPENAI_API_KEY: 'sk-env' } })).toBe(true);
    expect(provider.settingFromEnv!('baseUrl', { env: {} })).toBe(false);
    expect(plugin.connection(ctx({}, { OPENAI_API_KEY: 'sk-env', OPENAI_BASE_URL: 'http://gpu:8000/v1/' })))
      .toEqual({ baseUrl: 'http://gpu:8000/v1', apiKey: 'sk-env' });
    expect(plugin.connection(ctx({ apiKey: 'sk-saved', baseUrl: 'http://saved/v1' }, { OPENAI_API_KEY: 'sk-env', OPENAI_BASE_URL: 'http://env/v1' })))
      .toEqual({ baseUrl: 'http://saved/v1', apiKey: 'sk-saved' });
  });
});

describe('listModels', () => {
  it('lists the models of the server', async () => {
    const fn = mockFetch(new Response(JSON.stringify({ data: [{ id: 'gpt-b' }, { id: 'gpt-a' }, { nope: 1 }] })));
    expect(await provider.listModels(ctx({ apiKey: 'sk-1' }))).toEqual([{ id: 'gpt-b' }, { id: 'gpt-a' }]);
    expect(sentUrl(fn)).toBe('https://api.openai.com/v1/models');
    expect(sentHeaders(fn).Authorization).toBe('Bearer sk-1');
  });

  it('sends no key to a local server without one', async () => {
    const fn = mockFetch(new Response(JSON.stringify({ data: [] })));
    await provider.listModels(ctx({ baseUrl: 'http://localhost:11434/v1' }));
    expect(sentUrl(fn)).toBe('http://localhost:11434/v1/models');
    expect(sentHeaders(fn).Authorization).toBeUndefined();
  });
});

describe('run', () => {
  it('sends the prompt, image and options with a schema for the output kind', async () => {
    const fn = mockFetch(reply('{"tags":[{"name":"пляж","confidence":0.9}]}'));
    const answer = await provider.run(request('tags'), ctx({ apiKey: 'sk-1' }));
    expect(answer).toEqual({ tags: [{ name: 'пляж', confidence: 0.9 }], usage: { inputTokens: 812, outputTokens: 40 } });
    expect(sentUrl(fn)).toBe('https://api.openai.com/v1/chat/completions');
    const body = sentBody(fn);
    expect(body).toMatchObject({ model: 'gpt-test', temperature: 0.2, max_completion_tokens: 1024 });
    expect(body.messages[1].content[0]).toEqual({ type: 'text', text: 'Tag this photo in Ukrainian' });
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`, detail: 'high' },
    });
    expect(body.response_format.json_schema.name).toBe('paloma_tags');
    expect(body.response_format.json_schema.schema.required).toEqual(['tags']);
  });

  it('turns boxes into rectangles Paloma accepts', async () => {
    mockFetch(reply('{"objects":[{"label":"dog","confidence":0.92,"box":{"left":0.1,"top":0.2,"right":0.5,"bottom":0.9}}]}'));
    const answer = await provider.run(request('objects'), ctx({ apiKey: 'sk-1' }));
    expect(checkAnswer('objects', answer).objects).toEqual([{ label: 'dog', confidence: 0.92, rect: { left: 0.1, top: 0.2, right: 0.5, bottom: 0.9 } }]);
  });

  it('reads a text answer, also wrapped in a code block', async () => {
    mockFetch(reply('```json\n{"text": "Двоє дітей на піщаному пляжі"}\n```'));
    expect((await provider.run(request('text'), ctx({ apiKey: 'sk-1' }))).text).toBe('Двоє дітей на піщаному пляжі');
  });

  it('retries without response_format and temperature when the server refuses them', async () => {
    const fn = mockFetch(
      errorReply(400, "Unsupported parameter: 'temperature' is not supported with this model."),
      errorReply(400, 'response_format is not supported'),
      reply('{"tags":[]}'),
    );
    await provider.run(request('tags'), ctx({ apiKey: 'sk-1' }));
    expect(fn).toHaveBeenCalledTimes(3);
    const last = sentBody(fn, 2);
    expect(last.temperature).toBeUndefined();
    expect(last.response_format).toBeUndefined();
    expect(last.messages[1].content[0].text).toContain('Answer only with JSON like {"tags"');
  });

  it('says how a call failed', async () => {
    mockFetch(errorReply(401, 'Incorrect API key provided'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'bad' }))).rejects.toMatchObject({ kind: 'auth', message: 'Incorrect API key provided' });

    mockFetch(errorReply(429, 'Rate limit reached', { 'retry-after': '3' }));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'rate-limit', retryAfterMs: 3000 });

    mockFetch(errorReply(429, 'You exceeded your current quota', {}, 'insufficient_quota'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'auth' });

    mockFetch(new TypeError('fetch failed'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'unreachable' });

    mockFetch(errorReply(503, 'Overloaded'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'unreachable' });

    mockFetch(errorReply(400, 'Invalid image'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'other', message: 'Invalid image' });

    mockFetch(reply('I cannot see the photo'));
    await expect(provider.run(request('tags'), ctx({ apiKey: 'sk-1' }))).rejects.toMatchObject({ kind: 'bad-answer' });
  });
});
