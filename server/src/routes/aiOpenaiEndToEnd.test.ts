import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import sharp from 'sharp';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/**
 * The bundled OpenAI provider against a stub OpenAI-compatible server: two named providers on different addresses,
 * model refresh, enabling a model, prices, a Tags run, and the usage record and credits that follow.
 */
let cleanup: () => void;
let tmpDir: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let queue: typeof import('../tasks/queue.js');
let anna: TestClient;
let eddie: TestClient;
let stub: http.Server;
let photoId: number;
const requests: { url: string; auth: string | undefined; body: Record<string, unknown> | null }[] = [];

const stubHandler: http.RequestListener = (req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    requests.push({ url: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    const json = (value: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    const url = req.url ?? '';
    if (url.endsWith('/models')) return json({ data: [{ id: 'vision-1', object: 'model', owned_by: 'stub' }, { id: 'vision-2', object: 'model', owned_by: 'stub' }] });
    const one = /\/models\/([^/]+)$/.exec(url);
    if (one) return json({ id: decodeURIComponent(one[1]), object: 'model', owned_by: 'stub', created: 1700000000 });
    if (url.endsWith('/chat/completions')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
      chunk({ choices: [{ delta: { content: '{"tags":[{"name":"sea",' } }] });
      chunk({ choices: [{ delta: { content: '"confidence":0.9}]}' } }] });
      if ((requests.at(-1)?.body?.stream_options as { include_usage?: boolean } | undefined)?.include_usage) {
        chunk({ choices: [], usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000, total_tokens: 1_500_000 } });
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    res.writeHead(404).end();
  });
};

beforeAll(async () => {
  stub = http.createServer(stubHandler);
  await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_ai_e2e_test_', { PALOMA_AUTH: 'on', OPENAI_API_KEY: '', OPENAI_BASE_URL: '' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = await startTestApp();
  queue = await import('../tasks/queue.js');
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const { reapplyFolder } = await import('../services/folderChanges.js');
  const folder = path.join(tmpDir, 'photos', 'a');
  fs.mkdirSync(folder, { recursive: true });
  const folderId = db.insert(schema.folders).values({ path: folder, name: 'a', indexedAt: '' }).returning().get().id;
  await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(folder, 'a.jpg'));
  photoId = db.insert(schema.photos).values({ folderId, filename: 'a.jpg', fileHash: 'h', width: 64, height: 64, createdAt: '' }).returning().get().id;
  fs.writeFileSync(path.join(folder, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: {} }));
  await reapplyFolder(folder);
  const users = await import('../auth/users.js');
  for (const [username, roleId] of [['anna', 'admin'], ['eddie', 'editor']]) await users.createUser({ username, roleId, password: 'correct horse battery' });
  [anna, eddie] = await Promise.all(['anna', 'eddie'].map(async (username) => {
    const c = new TestClient(app.base);
    expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
    return c;
  }));
});

afterAll(async () => {
  await queue.taskQueue.idle();
  await app.close();
  await new Promise((resolve) => stub.close(resolve));
  vi.restoreAllMocks();
  cleanup();
});

describe('OpenAI-compatible providers end to end', () => {
  const base = () => `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

  it('sets up two named providers on different addresses', async () => {
    expect((await anna.put('/ai/providers/openai/settings', { apiKey: 'sk-main', baseUrl: `${base()}/main/v1` })).body).toMatchObject({ name: 'OpenAI', status: 'configured' });
    const ollama = await anna.post('/ai/providers', { type: 'openai', name: 'Local Ollama' });
    expect(ollama.status).toBe(201);
    // No key is needed for a local address, and the environment key is not borrowed
    expect((await anna.put(`/ai/providers/${ollama.body.id}/settings`, { baseUrl: `${base()}/ollama/v1` })).body).toMatchObject({ name: 'Local Ollama', status: 'configured' });
    expect((await anna.get('/ai/providers')).body.map((p: { name: string }) => p.name)).toEqual(['OpenAI', 'Local Ollama']);
  });

  it('refreshes models with their details, then enables one and prices it', async () => {
    const providers = (await anna.get('/ai/providers')).body as { id: string; name: string }[];
    const ollama = providers.find((p) => p.name === 'Local Ollama')!;
    requests.length = 0;
    const refreshed = await anna.post(`/ai/providers/${ollama.id}/models/refresh`);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.map((m: { id: string; enabled: boolean }) => [m.id, m.enabled])).toEqual([['vision-1', false], ['vision-2', false]]);
    expect(refreshed.body[0].info).toMatchObject({ owned_by: 'stub', created: 1700000000 });
    expect(requests.map((r) => r.url)).toEqual(['/ollama/v1/models', '/ollama/v1/models/vision-1', '/ollama/v1/models/vision-2']);
    expect(requests.every((r) => r.auth === undefined)).toBe(true);

    const patched = await anna.patch(`/ai/providers/${ollama.id}/models/vision-1`, {
      enabled: true, description: 'Local vision model', prices: { prompt_tokens: 0.15, completion_tokens: 0.6 }, capabilities: [{ name: 'tags', grade: 80 }],
    });
    expect(patched.body).toMatchObject({ enabled: true, prices: { prompt_tokens: 0.15, completion_tokens: 0.6 } });
    expect((await eddie.get('/ai/models')).body.map((m: { id: string }) => m.id)).toEqual(['vision-1']);
    expect((await anna.patch('/ai/tasks/tags', { provider: ollama.id, model: 'vision-2' })).body).toMatchObject({ ready: false, problem: 'model_disabled' });
    expect((await anna.patch('/ai/tasks/tags', { provider: ollama.id, model: 'vision-1', options: { parallel: 1 } })).body).toMatchObject({ ready: true });
  });

  it('runs Tags: asks for usage, stores the tags, logs the call and reports the credits', async () => {
    requests.length = 0;
    const started = await eddie.post('/ai/runs', { taskId: 'tags', photoIds: [photoId] });
    expect(started.status).toBe(202);
    await queue.taskQueue.whenEnded(started.body.id);
    const chat = requests.filter((r) => r.url.endsWith('/chat/completions'));
    expect(chat.length).toBe(1);
    expect(chat[0].url).toBe('/ollama/v1/chat/completions');
    expect(chat[0].body).toMatchObject({ model: 'vision-1', stream: true, stream_options: { include_usage: true } });

    const task = (await eddie.get('/tasks')).body.tasks.find((t: { id: string }) => t.id === started.body.id);
    expect(task.details).toMatchObject({ tagsAdded: 1, inputTokens: 1_000_000, outputTokens: 500_000, credits: 0.45 });
    expect((await eddie.get(`/photos/${photoId}/ai`)).body[0]).toMatchObject({ provider: 'Local Ollama', model: 'vision-1', tags: [{ name: 'sea', confidence: 0.9 }] });

    const usage = (await eddie.get('/ai/usage')).body;
    expect(usage.records).toEqual([expect.objectContaining({
      queueTaskId: started.body.id, aiTaskId: 'tags', providerName: 'Local Ollama', model: 'vision-1', ok: true,
      tokens: { prompt_tokens: 1_000_000, completion_tokens: 500_000 }, credits: 0.45,
    })]);
    expect(usage.totals).toMatchObject({ calls: 1, credits: 0.45 });
    expect(usage.records[0].userId).toBeTruthy();
  });
});
