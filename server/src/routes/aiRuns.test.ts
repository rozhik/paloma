import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { writeTestPlugin } from '../plugins/testing.js';
import type { AiAnswer, AiRequest } from '../plugins/api.js';

/**
 * AI runs through the API with a fake provider whose answers the tests set in `globalThis.__aiFake`. Photos are
 * told apart by width: folder `a` has a100, a120, a140; folder `b` has b160, b180; folder `c` has c200…c260.
 * anna: admin; eddie: editor; vera: viewer; lim: editor with folder a only.
 */
type Fake = (request: AiRequest) => Promise<AiAnswer> | AiAnswer;
const fake = globalThis as unknown as { __aiFake: Fake };

const FAKE_PROVIDER = `
export function activate() {
  return {
    aiProviders: [{
      id: 'fake',
      label: 'Fake vision',
      listModels: async () => [{ id: 'm' }],
      run: (request, ctx) => globalThis.__aiFake(request, ctx),
    }],
  };
}
`;

let cleanup: () => void;
let tmpDir: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let runner: typeof import('../ai/runner.js');
let anna: TestClient;
let eddie: TestClient;
let vera: TestClient;
let lim: TestClient;
const id: Record<string, number> = {};
const dir: Record<string, string> = {};

const login = async (username: string) => {
  const c = new TestClient(app.base);
  expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  return c;
};

const ids = (...names: string[]) => names.map((name) => id[name]);
const folderIds = (folder: string) => Object.keys(id).filter((name) => name.startsWith(folder)).map((name) => id[name]);
const sidecar = (folder: string) => JSON.parse(fs.readFileSync(path.join(dir[folder], '.paloma.json'), 'utf-8'));

/** Starts a run and waits for it to end; returns the start response and how the run ended. */
async function runToEnd(client: TestClient, body: Record<string, unknown>) {
  const started = await client.post('/ai/runs?lang=uk', body);
  await runner.aiRunner.idle();
  const status = await client.get('/ai/runs/current');
  return { started, last: status.body.last, current: status.body.current };
}

beforeAll(async () => {
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_ai_runs_test_', { PALOMA_AUTH: 'on', OPENAI_API_KEY: '', OPENAI_BASE_URL: '' }));
  writeTestPlugin(path.join(tmpDir, 'plugins'), 'fake-vision', { module: FAKE_PROVIDER });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  app = await startTestApp();
  runner = await import('../ai/runner.js');
  runner.timing.sleep = async () => {};
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const { reapplyFolder } = await import('../services/folderChanges.js');

  const widths: Record<string, number[]> = { a: [100, 120, 140], b: [160, 180], c: [200, 210, 220, 230, 240, 250, 260] };
  for (const [folder, list] of Object.entries(widths)) {
    dir[folder] = path.join(tmpDir, 'photos', folder);
    fs.mkdirSync(dir[folder], { recursive: true });
    const folderId = db.insert(schema.folders).values({ path: dir[folder], name: folder, indexedAt: '' }).returning().get().id;
    for (const width of list) {
      const name = `${folder}${width}`;
      await sharp({ create: { width, height: 100, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(dir[folder], `${name}.jpg`));
      id[name] = db.insert(schema.photos).values({ folderId, filename: `${name}.jpg`, fileHash: `hash-${name}`, width, height: 100, createdAt: '' }).returning().get().id;
    }
    fs.writeFileSync(path.join(dir[folder], '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: {} }));
    await reapplyFolder(dir[folder]);
  }

  const users = await import('../auth/users.js');
  for (const [username, roleId] of [['anna', 'admin'], ['eddie', 'editor'], ['vera', 'viewer']]) {
    await users.createUser({ username, roleId, password: 'correct horse battery' });
  }
  await users.createUser({ username: 'lim', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: [dir.a] } });
  [anna, eddie, vera, lim] = await Promise.all(['anna', 'eddie', 'vera', 'lim'].map(login));
  expect((await anna.patch('/plugins/fake-vision', { enabled: true })).status).toBe(200);
});

afterAll(async () => {
  await runner.aiRunner.idle();
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

beforeEach(() => {
  fake.__aiFake = (request) => ({ tags: [{ name: `w${request.image.width}`, confidence: 0.9 }, { name: 'gray', confidence: 0.8 }], usage: { inputTokens: 100, outputTokens: 5 } });
});

describe('starting runs', () => {
  it('needs ai.run', async () => {
    for (const [method, url] of [['POST', '/ai/runs'], ['GET', '/ai/runs/current'], ['DELETE', '/ai/runs/current']]) {
      const { status, body } = await vera.send(method, url, method === 'POST' ? {} : undefined);
      expect([status, body.params?.permission], url).toEqual([403, 'ai.run']);
    }
  });

  it('refuses a task that is not ready, and an unknown task', async () => {
    const notReady = await anna.post('/ai/runs', { taskId: 'tags', photoIds: ids('a100') });
    expect([notReady.status, notReady.body.code, notReady.body.params.problem]).toEqual([400, 'ai_task_not_ready', 'provider_not_configured']);
    expect((await anna.post('/ai/runs', { taskId: 'nope', photoIds: ids('a100') })).status).toBe(404);
    expect((await anna.post('/ai/runs', { taskId: 'tags', photoIds: [] })).status).toBe(400);
  });

  it('runs Tags on a folder: results stored, tags added to the sidecar, summary kept', async () => {
    for (const task of ['tags', 'objects', 'description']) {
      expect((await anna.patch(`/ai/tasks/${task}`, { provider: 'fake', model: 'm' })).body.ready).toBe(true);
    }
    const { started, last, current } = await runToEnd(eddie, { taskId: 'tags', photoIds: folderIds('a') });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ taskId: 'tags', state: 'running', total: 3 });
    expect(current).toBeNull();
    expect(last).toMatchObject({ state: 'finished', total: 3, done: 3, failed: 0, tagsAdded: 6, inputTokens: 300, outputTokens: 15 });
    expect(last.photoIds.sort()).toEqual(folderIds('a').sort());
    expect(sidecar('a').photos['a120.jpg'].keywords).toEqual(['w120', 'gray']);
    const results = await eddie.get(`/photos/${id.a120}/ai`);
    expect(results.body).toEqual([expect.objectContaining({ taskId: 'tags', provider: 'fake', model: 'm', tags: [{ name: 'w120', confidence: 0.9 }, { name: 'gray', confidence: 0.8 }] })]);
  });

  it('sends the prompt in the language of the user, with the photo upright and resized', async () => {
    const seen: AiRequest[] = [];
    fake.__aiFake = (request) => { seen.push(request); return { tags: [] }; };
    await runToEnd(eddie, { taskId: 'tags', photoIds: ids('b160'), again: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ model: 'm', output: 'tags', language: 'Ukrainian', maxTags: 10, image: { mimeType: 'image/jpeg', width: 160, height: 100 } });
    expect(seen[0].prompt).toContain('in Ukrainian');
    expect(seen[0].prompt).toContain('w100');
  });

  it('skips photos already processed with the same configuration, unless run again', async () => {
    expect((await runToEnd(eddie, { taskId: 'tags', photoIds: folderIds('a') })).last).toMatchObject({ total: 0, state: 'finished' });
    expect((await runToEnd(eddie, { taskId: 'tags', photoIds: folderIds('a'), again: true })).last).toMatchObject({ total: 3, tagsAdded: 0 });
    await anna.patch('/ai/tasks/tags', { prompt: 'Other prompt' });
    expect((await runToEnd(eddie, { taskId: 'tags', photoIds: folderIds('a') })).last).toMatchObject({ total: 3 });
  });

  it('refuses a second run while one is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fake.__aiFake = async () => { await gate; return { tags: [] }; };
    const first = await eddie.post('/ai/runs', { taskId: 'tags', photoIds: ids('b160'), again: true });
    expect(first.status).toBe(202);
    const second = await anna.post('/ai/runs', { taskId: 'objects', photoIds: ids('b180') });
    expect([second.status, second.body.code]).toEqual([409, 'ai_run_in_progress']);
    expect((await anna.get('/ai/runs/current')).body.current).toMatchObject({ taskId: 'tags', state: 'running', total: 1, done: 0 });
    release();
    await runner.aiRunner.idle();
  });
});

describe('cancel, failures and retries', () => {
  it('cancels after the photo in progress, and a new run does the rest', async () => {
    await anna.patch('/ai/tasks/objects', { options: { parallel: 1 } });
    let calls = 0;
    fake.__aiFake = () => {
      calls += 1;
      if (calls === 2) runner.aiRunner.cancel();
      return { objects: [{ label: 'dog', rect: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 }, confidence: 0.9 }] };
    };
    const { last } = await runToEnd(eddie, { taskId: 'objects', photoIds: folderIds('a') });
    expect(last).toMatchObject({ state: 'cancelled', total: 3, done: 2 });
    const resumed = await runToEnd(eddie, { taskId: 'objects', photoIds: folderIds('a') });
    expect(resumed.last).toMatchObject({ state: 'finished', total: 1, done: 1 });
    const objects = (await eddie.get(`/photos/${id.a100}/ai`)).body.find((r: { taskId: string }) => r.taskId === 'objects');
    expect(objects.objects).toEqual([{ label: 'dog', rect: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 }, confidence: 0.9 }]);
  });

  it('keeps going when one photo fails', async () => {
    fake.__aiFake = (request) => {
      if (request.image.width === 120) throw new Error('Invalid image');
      return { text: 'A grey square' };
    };
    const { last } = await runToEnd(eddie, { taskId: 'description', photoIds: folderIds('a') });
    expect(last).toMatchObject({ state: 'finished', done: 3, failed: 1, descriptionsSet: 2, failures: [{ photoId: id.a120, message: 'Invalid image' }] });
    expect(sidecar('a').photos['a100.jpg'].caption).toBe('A grey square');
  });

  it('stops after five photos in a row refuse the credentials', async () => {
    await anna.patch('/ai/tasks/tags', { options: { parallel: 1 } });
    fake.__aiFake = () => { throw Object.assign(new Error('Incorrect API key provided'), { kind: 'auth' }); };
    const { last } = await runToEnd(eddie, { taskId: 'tags', photoIds: folderIds('c') });
    expect(last).toMatchObject({ state: 'stopped', total: 7, done: 5, failed: 5, error: 'Incorrect API key provided' });
  });

  it('retries a photo when the service asks to slow down', async () => {
    let calls = 0;
    fake.__aiFake = () => {
      calls += 1;
      if (calls <= 2) throw Object.assign(new Error('Rate limit reached'), { kind: 'rate-limit', retryAfterMs: 10 });
      return { tags: [{ name: 'retried' }] };
    };
    const { last } = await runToEnd(eddie, { taskId: 'tags', photoIds: ids('b180'), again: true });
    expect(last).toMatchObject({ state: 'finished', done: 1, failed: 0, tagsAdded: 1 });
    expect(calls).toBe(3);
  });

  it('gives up on a photo after three retries', async () => {
    fake.__aiFake = () => { throw Object.assign(new Error('Rate limit reached'), { kind: 'rate-limit' }); };
    const { last } = await runToEnd(eddie, { taskId: 'tags', photoIds: ids('b180'), again: true });
    expect(last).toMatchObject({ done: 1, failed: 1, failures: [{ photoId: id.b180, message: 'Rate limit reached' }] });
  });
});

describe('library access', () => {
  it('processes and shows only the photos the user can see', async () => {
    const { started, last } = await runToEnd(lim, { taskId: 'tags', photoIds: [...folderIds('a'), ...folderIds('b')], again: true });
    expect(started.body.total).toBe(3);
    expect(last.photoIds.sort()).toEqual(folderIds('a').sort());
    expect((await lim.get(`/photos/${id.b160}/ai`)).status).toBe(404);
    expect((await lim.get(`/photos/${id.a100}/ai`)).status).toBe(200);
  });
});
