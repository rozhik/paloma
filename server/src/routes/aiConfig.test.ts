import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { writeTestPlugin } from '../plugins/testing.js';

// A provider like OpenAI: a secret key, a timeout, model options; listModels fails for the key "bad"
const FAKE_PROVIDER = `
export function activate() {
  return {
    aiProviders: [{
      id: 'fake',
      label: { en: 'Fake vision', uk: 'Фейковий зір' },
      settings: [
        { name: 'apiKey', label: 'API key', type: 'secret', required: true },
        { name: 'timeoutSeconds', label: 'Timeout', type: 'number', min: 5, max: 600, default: 60 },
      ],
      modelOptions: [{ name: 'detail', label: 'Detail', type: 'choice', options: [{ value: 'auto', label: 'Auto' }, { value: 'high', label: 'High' }], default: 'auto' }],
      async listModels(ctx) {
        if (ctx.settings.apiKey === 'bad') throw Object.assign(new Error('Incorrect API key provided'), { kind: 'auth' });
        return [{ id: 'vision-b', label: 'Vision B' }, { id: 'vision-a' }];
      },
      run: async () => ({ tags: [] }),
    }],
  };
}
`;

let cleanup: () => void;
let tmpDir: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let anna: TestClient;
let eddie: TestClient;
let vera: TestClient;

const login = async (username: string) => {
  const c = new TestClient(app.base);
  const res = await c.post('/auth/login/password', { username, password: 'correct horse battery' });
  expect(res.status, `${username} login`).toBe(200);
  return c;
};

beforeAll(async () => {
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_ai_config_routes_test_', { PALOMA_AUTH: 'on', OPENAI_API_KEY: '', OPENAI_BASE_URL: '' }));
  writeTestPlugin(path.join(tmpDir, 'plugins'), 'fake-vision', { module: FAKE_PROVIDER });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = await startTestApp();
  const users = await import('../auth/users.js');
  for (const [username, roleId] of [['anna', 'admin'], ['eddie', 'editor'], ['vera', 'viewer']]) {
    await users.createUser({ username, roleId, password: 'correct horse battery' });
  }
  anna = await login('anna');
  eddie = await login('eddie');
  vera = await login('vera');
  expect((await anna.patch('/plugins/fake-vision', { enabled: true })).status).toBe(200);
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('AI providers API', () => {
  it('needs plugins.manage', async () => {
    for (const [method, url] of [['GET', '/ai/providers'], ['PUT', '/ai/providers/fake/settings'], ['GET', '/ai/providers/fake/models'], ['POST', '/ai/providers/fake/test']]) {
      const { status, body } = await eddie.send(method, url, method === 'GET' ? undefined : {});
      expect([status, body.params?.permission], url).toEqual([403, 'plugins.manage']);
    }
  });

  it('lists the provider as not configured without a key', async () => {
    const { status, body } = await anna.get('/ai/providers?lang=uk');
    expect(status).toBe(200);
    expect(body.map((p: { id: string }) => p.id)).toEqual(['openai', 'fake']);
    expect(body[0]).toMatchObject({ pluginId: 'ai-openai', label: 'OpenAI', status: 'not_configured', missing: ['apiKey'] });
    expect(body[1]).toEqual(expect.objectContaining({ id: 'fake', pluginId: 'fake-vision', label: 'Фейковий зір', status: 'not_configured', missing: ['apiKey'] }));
  });

  it('saves a key without ever returning it', async () => {
    const saved = await anna.put('/ai/providers/fake/settings', { apiKey: 'sk-very-secret' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ status: 'configured', missing: [] });
    expect(saved.body.settings[0]).toMatchObject({ name: 'apiKey', set: true, value: null });
    const listed = await anna.get('/ai/providers');
    expect(JSON.stringify([saved.body, listed.body])).not.toContain('sk-very-secret');
    const file = fs.readFileSync(path.join(tmpDir, 'data', 'ai.json'), 'utf-8');
    expect(JSON.parse(file).providers.fake.apiKey).toBe('sk-very-secret');
  });

  it('keeps the key when only another setting changes', async () => {
    const { body } = await anna.put('/ai/providers/fake/settings', { timeoutSeconds: 30 });
    expect(body).toMatchObject({ status: 'configured' });
    expect(body.settings[1]).toMatchObject({ name: 'timeoutSeconds', value: 30 });
  });

  it('refuses a value of the wrong type, naming the setting', async () => {
    const { status, body } = await anna.put('/ai/providers/fake/settings', { timeoutSeconds: 'fast' });
    expect([status, body.code, body.params.field]).toEqual([400, 'invalid_field', 'timeoutSeconds']);
  });

  it('answers 404 for an unknown provider', async () => {
    expect((await anna.get('/ai/providers/nope/models')).status).toBe(404);
  });

  it('lists the models sorted by id', async () => {
    const { status, body } = await anna.get('/ai/providers/fake/models');
    expect(status).toBe(200);
    expect(body).toEqual([{ id: 'vision-a', label: 'vision-a' }, { id: 'vision-b', label: 'Vision B' }]);
  });

  it('reports a failing service with its message', async () => {
    expect((await anna.post('/ai/providers/fake/test')).body).toEqual({ ok: true });
    await anna.put('/ai/providers/fake/settings', { apiKey: 'bad' });
    const test = await anna.post('/ai/providers/fake/test');
    expect([test.status, test.body.code, test.body.params.message]).toEqual([502, 'ai_provider_failed', 'Incorrect API key provided']);
    expect((await anna.get('/ai/providers/fake/models')).status).toBe(502);
    await anna.put('/ai/providers/fake/settings', { apiKey: 'sk-very-secret' });
  });
});

describe('AI tasks API', () => {
  it('lets ai.run and plugins.manage list tasks, not viewers', async () => {
    expect((await eddie.get('/ai/tasks')).status).toBe(200);
    const refused = await vera.get('/ai/tasks');
    expect([refused.status, refused.body.params.permission]).toEqual([403, 'plugins.manage']);
  });

  it('lists the built-in tasks, not ready until a provider and model are chosen', async () => {
    const { body } = await anna.get('/ai/tasks');
    expect(body.map((t: { id: string; ready: boolean; problem: string }) => [t.id, t.ready, t.problem])).toEqual([
      ['tags', false, 'provider_not_configured'], ['objects', false, 'provider_not_configured'], ['description', false, 'provider_not_configured'],
    ]);
  });

  it('chooses a provider and model and is ready', async () => {
    const { status, body } = await anna.patch('/ai/tasks/objects', { provider: 'fake', model: 'vision-a', modelOptions: { detail: 'high' } });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 'objects', provider: 'fake', model: 'vision-a', modelOptions: { detail: 'high' }, ready: true, problem: null });
  });

  it('refuses editors changing a prompt', async () => {
    const { status, body } = await eddie.patch('/ai/tasks/tags', { prompt: 'x' });
    expect([status, body.params.permission]).toEqual([403, 'plugins.manage']);
  });

  it('refuses an image size out of range', async () => {
    const { status, body } = await anna.patch('/ai/tasks/tags', { options: { imageSize: 4000 } });
    expect([status, body.params.field]).toEqual([400, 'options.imageSize']);
  });

  it('adds, changes and deletes a custom task', async () => {
    const created = await anna.post('/ai/tasks', { name: 'Landmarks', output: 'tags', prompt: 'Name the famous landmarks in this photo', provider: 'fake', model: 'vision-b' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Landmarks', builtIn: false, ready: true, inMenu: true });
    const id = created.body.id;
    expect((await anna.patch(`/ai/tasks/${id}`, { inMenu: false })).body.inMenu).toBe(false);
    const reset = await anna.post(`/ai/tasks/${id}/reset`);
    expect([reset.status, reset.body.code]).toEqual([409, 'ai_task_not_builtin']);
    expect((await anna.delete(`/ai/tasks/${id}`)).status).toBe(200);
    expect((await anna.get('/ai/tasks')).body.map((t: { id: string }) => t.id)).toEqual(['tags', 'objects', 'description']);
    expect((await anna.patch(`/ai/tasks/${id}`, { inMenu: true })).status).toBe(404);
  });

  it('cannot delete a built-in task, and resets one keeping provider and model', async () => {
    const deleted = await anna.delete('/ai/tasks/tags');
    expect([deleted.status, deleted.body.code]).toEqual([409, 'ai_task_builtin']);
    await anna.patch('/ai/tasks/objects', { prompt: 'Changed' });
    const reset = await anna.post('/ai/tasks/objects/reset');
    expect(reset.body).toMatchObject({ provider: 'fake', model: 'vision-a', modelOptions: {} });
    expect(reset.body.prompt).not.toBe('Changed');
  });

  it('is not ready when the provider plugin is switched off', async () => {
    await anna.patch('/plugins/fake-vision', { enabled: false });
    const objects = (await anna.get('/ai/tasks')).body.find((t: { id: string }) => t.id === 'objects');
    expect(objects).toMatchObject({ ready: false, problem: 'provider_unavailable', model: 'vision-a' });
    await anna.patch('/plugins/fake-vision', { enabled: true });
  });
});
