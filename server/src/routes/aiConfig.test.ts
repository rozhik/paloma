import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { seedAiProviders, writeTestPlugin } from '../plugins/testing.js';

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
        return [{ id: 'vision-c' }, { id: 'vision-b', label: 'Vision B' }, { id: 'vision-a' }];
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
  seedAiProviders(path.join(tmpDir, 'data'), [{ id: 'fake', name: 'Fake vision', type: 'fake' }]);
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
    const urls = [
      ['GET', '/ai/providers'], ['POST', '/ai/providers'], ['PATCH', '/ai/providers/fake'], ['DELETE', '/ai/providers/fake'],
      ['PUT', '/ai/providers/fake/settings'], ['GET', '/ai/providers/fake/models'], ['POST', '/ai/providers/fake/test'],
      ['POST', '/ai/providers/fake/models/refresh'], ['POST', '/ai/providers/fake/models'], ['PATCH', '/ai/providers/fake/models/m'],
    ];
    for (const [method, url] of urls) {
      const { status, body } = await eddie.send(method, url, method === 'GET' ? undefined : {});
      expect([status, body.params?.permission], url).toEqual([403, 'plugins.manage']);
    }
  });

  it('lists the provider as not configured without a key', async () => {
    const { status, body } = await anna.get('/ai/providers?lang=uk');
    expect(status).toBe(200);
    expect(body.map((p: { id: string }) => p.id)).toEqual(['openai', 'fake']);
    expect(body[0]).toMatchObject({ name: 'OpenAI', type: 'openai', pluginId: 'ai-openai', label: 'OpenAI', available: true, status: 'not_configured', missing: ['apiKey'] });
    expect(body[1]).toEqual(expect.objectContaining({
      id: 'fake', name: 'Fake vision', type: 'fake', pluginId: 'fake-vision', label: 'Фейковий зір', available: true, status: 'not_configured', missing: ['apiKey'],
    }));
  });

  it('saves a key without ever returning it', async () => {
    const saved = await anna.put('/ai/providers/fake/settings', { apiKey: 'sk-very-secret' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ status: 'configured', missing: [] });
    expect(saved.body.settings[0]).toMatchObject({ name: 'apiKey', set: true, value: null });
    const listed = await anna.get('/ai/providers');
    expect(JSON.stringify([saved.body, listed.body])).not.toContain('sk-very-secret');
    const file = fs.readFileSync(path.join(tmpDir, 'data', 'ai.json'), 'utf-8');
    expect(JSON.parse(file).providers.find((p: { id: string }) => p.id === 'fake').settings.apiKey).toBe('sk-very-secret');
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
    expect(body).toEqual([{ id: 'vision-a', label: 'vision-a' }, { id: 'vision-b', label: 'Vision B' }, { id: 'vision-c', label: 'vision-c' }]);
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

describe('named providers', () => {
  const nameOf = async (id: string) => (await anna.get('/ai/providers')).body.find((p: { id: string }) => p.id === id)?.name;

  it('creates providers of the same type with their own settings', async () => {
    const created = await anna.post('/ai/providers', { type: 'fake', name: '  Second fake ' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Second fake', type: 'fake', available: true, status: 'not_configured', missing: ['apiKey'] });
    expect(created.body.id).toMatch(/^p-[0-9a-f]{8}$/);
    expect((await anna.put(`/ai/providers/${created.body.id}/settings`, { apiKey: 'sk-second' })).body.status).toBe('configured');
    // The first provider of that type is untouched
    expect((await anna.get('/ai/providers')).body.find((p: { id: string }) => p.id === 'fake').status).toBe('configured');
    expect((await anna.delete(`/ai/providers/${created.body.id}`)).status).toBe(200);
    expect(await nameOf(created.body.id)).toBeUndefined();
  });

  it('needs a name that is unique ignoring case, and a type of an active plugin', async () => {
    for (const name of ['', '   ', 'x'.repeat(61), undefined, 5, 'FAKE VISION', 'openai']) {
      const { status, body } = await anna.post('/ai/providers', { type: 'fake', name });
      expect([status, body.params?.field], String(name)).toEqual([400, 'name']);
    }
    for (const type of ['nope', undefined, 7]) {
      const { status, body } = await anna.post('/ai/providers', { type, name: 'Another' });
      expect([status, body.params?.field]).toEqual([400, 'type']);
    }
    expect((await anna.get('/ai/providers')).body.map((p: { id: string }) => p.id)).toEqual(['openai', 'fake']);
  });

  it('renames a provider, keeping its id, settings and the tasks that use it', async () => {
    await anna.patch('/ai/tasks/objects', { provider: 'fake', model: 'vision-a' });
    const renamed = await anna.patch('/ai/providers/fake', { name: 'Renamed fake' });
    expect(renamed.body).toMatchObject({ id: 'fake', name: 'Renamed fake', status: 'configured' });
    expect((await anna.get('/ai/tasks')).body.find((t: { id: string }) => t.id === 'objects')).toMatchObject({ provider: 'fake', ready: true });
    expect((await anna.patch('/ai/providers/fake', { name: 'openai' })).body.params.field).toBe('name');
    expect((await anna.patch('/ai/providers/fake', { name: 'Renamed fake', color: 'red' })).body.params.field).toBe('color');
    expect((await anna.patch('/ai/providers/fake', { name: 'fake VISION' })).status).toBe(200);
    expect((await anna.patch('/ai/providers/nope', { name: 'x' })).status).toBe(404);
  });

  it('refuses to delete a provider a task uses, naming the task', async () => {
    const refused = await anna.delete('/ai/providers/fake');
    expect([refused.status, refused.body.code]).toEqual([409, 'ai_provider_in_use']);
    expect(refused.body.params.tasks).toContain('objects');
    expect(await nameOf('fake')).toBe('fake VISION');
    expect((await anna.delete('/ai/providers/nope')).status).toBe(404);
  });

  it('keeps a provider whose plugin is switched off, as not available', async () => {
    await anna.patch('/plugins/fake-vision', { enabled: false });
    const listed = (await anna.get('/ai/providers')).body.find((p: { id: string }) => p.id === 'fake');
    expect(listed).toMatchObject({ name: 'fake VISION', type: 'fake', available: false, settings: [] });
    expect((await anna.put('/ai/providers/fake/settings', { apiKey: 'x' })).status).toBe(404);
    expect((await anna.post('/ai/providers', { type: 'fake', name: 'Third' })).body.params.field).toBe('type');
    await anna.patch('/plugins/fake-vision', { enabled: true });
    expect((await anna.get('/ai/providers')).body.find((p: { id: string }) => p.id === 'fake')).toMatchObject({ available: true, status: 'configured' });
  });
});

describe('model catalogue', () => {
  const catalog = async (client: TestClient) => (await client.get('/ai/models')).body as { providerId: string; providerName: string; id: string; enabled: boolean; listed: boolean; description: string; prices: object; capabilities: { name: string; grade: number }[] }[];
  const encoded = (id: string) => encodeURIComponent(id);

  it('lists the models the tasks use as enabled, for anyone who can view the library', async () => {
    // vision-a is on the Objects task; vision-b was typed into a custom task earlier
    const models = await catalog(vera);
    expect(models.map((m) => [m.providerId, m.id, m.enabled])).toEqual([['fake', 'vision-a', true], ['fake', 'vision-b', true]]);
    expect(models[0]).toMatchObject({ providerName: 'fake VISION', description: '', prices: {}, capabilities: [], listed: true });
  });

  it('adds the models of the service on refresh, disabled, and shows them only to plugins.manage', async () => {
    const refreshed = await anna.post('/ai/providers/fake/models/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.map((m: { id: string; enabled: boolean }) => [m.id, m.enabled])).toEqual([['vision-a', true], ['vision-b', true], ['vision-c', false]]);
    expect((await catalog(anna)).map((m) => m.id)).toEqual(['vision-a', 'vision-b', 'vision-c']);
    expect((await catalog(vera)).map((m) => m.id)).toEqual(['vision-a', 'vision-b']);
    expect((await catalog(eddie)).map((m) => m.id)).toEqual(['vision-a', 'vision-b']);
  });

  it('does not let a disabled model be ready, and is ready again when enabled', async () => {
    const disabled = await anna.patch('/ai/tasks/description', { provider: 'fake', model: 'vision-c' });
    // A model the list added disabled stays disabled when a task names it
    expect(disabled.body).toMatchObject({ ready: false, problem: 'model_disabled', model: 'vision-c' });
    expect((await anna.patch('/ai/providers/fake/models/vision-c', { enabled: true })).body.enabled).toBe(true);
    expect((await anna.get('/ai/tasks')).body.find((t: { id: string }) => t.id === 'description')).toMatchObject({ ready: true, problem: null });
    await anna.patch('/ai/providers/fake/models/vision-c', { enabled: false });
    expect((await anna.get('/ai/tasks')).body.find((t: { id: string }) => t.id === 'description')).toMatchObject({ ready: false, problem: 'model_disabled' });
    await anna.patch('/ai/tasks/description', { provider: 'fake', model: 'vision-a' });
  });

  it('adds a model by its id, enabled, and edits one with an id that holds slashes and colons', async () => {
    const id = 'library/llava:7b';
    const added = await anna.post('/ai/providers/fake/models', { id });
    expect([added.status, added.body.enabled, added.body.id]).toEqual([201, true, id]);
    expect((await anna.post('/ai/providers/fake/models', { id: '  ' })).status).toBe(400);
    expect((await anna.post('/ai/providers/fake/models', { id })).body.enabled).toBe(true);
    const patched = await anna.patch(`/ai/providers/fake/models/${encoded(id)}`, { description: 'Fast, good at tags' });
    expect(patched.body).toMatchObject({ id, description: 'Fast, good at tags' });
    expect((await catalog(vera)).find((m) => m.id === id)?.description).toBe('Fast, good at tags');
    expect((await anna.patch('/ai/providers/fake/models/missing', { enabled: true })).body.code).toBe('ai_model_not_found');
    expect((await anna.post('/ai/providers/nope/models', { id: 'x' })).status).toBe(404);
  });

  it('saves prices and capabilities, which everyone who can view the library reads', async () => {
    const id = 'vision-a';
    const saved = await anna.patch(`/ai/providers/fake/models/${id}`, {
      prices: { prompt_tokens: 0.15, completion_tokens: 0.6 },
      capabilities: [{ name: 'tags', grade: 80 }, { name: 'objects', grade: 35 }],
    });
    expect(saved.status).toBe(200);
    const seen = (await catalog(vera)).find((m) => m.id === id)!;
    expect(seen.prices).toEqual({ prompt_tokens: 0.15, completion_tokens: 0.6 });
    expect(seen.capabilities).toEqual([{ name: 'objects', grade: 35 }, { name: 'tags', grade: 80 }]);
    // Prices are replaced as a whole; capabilities too
    await anna.patch(`/ai/providers/fake/models/${id}`, { prices: { prompt_tokens: 1 }, capabilities: [{ name: 'tags', grade: 100 }] });
    const next = (await catalog(vera)).find((m) => m.id === id)!;
    expect([next.prices, next.capabilities]).toEqual([{ prompt_tokens: 1 }, [{ name: 'tags', grade: 100 }]]);
  });

  it('refuses invalid input as a whole, naming the field, and changes nothing', async () => {
    const id = 'vision-a';
    const before = JSON.stringify((await catalog(anna)).find((m) => m.id === id));
    const bad: [object, string][] = [
      [{ prices: { prompt_tokens: -1 } }, 'prompt_tokens'],
      [{ prices: { prompt_tokens: 'free' } }, 'prompt_tokens'],
      [{ prices: { cached_tokens: 1 } }, 'cached_tokens'],
      [{ prices: [1] }, 'prices'],
      [{ capabilities: [{ name: 'tags', grade: 120 }] }, 'capabilities'],
      [{ capabilities: [{ name: 'tags', grade: 50.5 }] }, 'capabilities'],
      [{ capabilities: [{ name: 'tags', grade: 1 }, { name: 'Tags', grade: 2 }] }, 'capabilities'],
      [{ capabilities: [{ name: '', grade: 1 }] }, 'capabilities'],
      [{ capabilities: [{ name: 'x'.repeat(41), grade: 1 }] }, 'capabilities'],
      [{ description: 'd'.repeat(2001) }, 'description'],
      [{ enabled: 'yes' }, 'enabled'],
      [{ id: 'other' }, 'id'],
    ];
    for (const [body, field] of bad) {
      const { status, body: error } = await anna.patch(`/ai/providers/fake/models/${id}`, { description: 'changed', ...body });
      expect([status, error.params.field], JSON.stringify(body)).toEqual([400, field]);
    }
    expect(JSON.stringify((await catalog(anna)).find((m) => m.id === id))).toBe(before);
  });

  it('refuses editors changing a model', async () => {
    const { status, body } = await eddie.patch('/ai/providers/fake/models/vision-a', { prices: { prompt_tokens: 0 } });
    expect([status, body.params.permission]).toEqual([403, 'plugins.manage']);
  });

  it('keeps a model the service no longer lists, marked, with its prices; and a failed refresh changes nothing', async () => {
    await anna.put('/ai/providers/fake/settings', { apiKey: 'bad' });
    const failed = await anna.post('/ai/providers/fake/models/refresh');
    expect([failed.status, failed.body.code, failed.body.params.message]).toEqual([502, 'ai_provider_failed', 'Incorrect API key provided']);
    await anna.put('/ai/providers/fake/settings', { apiKey: 'sk-very-secret' });
    expect((await catalog(anna)).find((m) => m.id === 'library/llava:7b')?.listed).toBe(true);
    const refreshed = (await anna.post('/ai/providers/fake/models/refresh')).body as { id: string; listed: boolean; prices: object }[];
    expect(refreshed.map((m) => [m.id, m.listed])).toEqual([['library/llava:7b', false], ['vision-a', true], ['vision-b', true], ['vision-c', true]]);
    expect(refreshed.find((m) => m.id === 'vision-a')?.prices).toEqual({ prompt_tokens: 1 });
  });

  it('removes a provider’s models with the provider', async () => {
    const created = await anna.post('/ai/providers', { type: 'fake', name: 'Temporary' });
    await anna.put(`/ai/providers/${created.body.id}/settings`, { apiKey: 'sk-temp' });
    await anna.post(`/ai/providers/${created.body.id}/models/refresh`);
    expect((await catalog(anna)).filter((m) => m.providerId === created.body.id).length).toBe(3);
    await anna.delete(`/ai/providers/${created.body.id}`);
    expect((await catalog(anna)).filter((m) => m.providerId === created.body.id)).toEqual([]);
  });
});
