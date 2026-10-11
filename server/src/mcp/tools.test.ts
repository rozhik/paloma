import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { writeTestPlugin } from '../plugins/testing.js';
import { buildLibrary, type TestLibrary } from '../model/testLibrary.js';
import type { AiAnswer, AiRequest } from '../plugins/api.js';
import { connectMcp } from './testClient.js';

/**
 * MCP tools with users on, through API tokens: anna (admin) makes the tokens; `viewer` has library.view only,
 * `editor` every editor permission; `lim` is an editor who sees folder `home` only.
 */
type Fake = (request: AiRequest) => Promise<AiAnswer> | AiAnswer;
const fake = globalThis as unknown as { __aiFake: Fake };
const FAKE_PROVIDER = `
export function activate() {
  return { aiProviders: [{ id: 'fake', label: 'Fake vision', listModels: async () => [{ id: 'm' }], run: (request, ctx) => globalThis.__aiFake(request, ctx) }] };
}
`;

let cleanup: () => void;
let tmpDir: string;
let app: Awaited<ReturnType<typeof startTestApp>>;
let lib: TestLibrary;
let viewer: Client;
let editor: Client;
let lim: Client;
let runner: typeof import('../ai/runner.js');

const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';
const ROY = 'b8e4117cf1d6615b';

type ToolResult = { isError?: boolean; content: { type: string; text?: string; data?: string; mimeType?: string }[]; structuredContent?: Record<string, unknown> };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const json = (result: ToolResult) => JSON.parse(result.content.find((item) => item.type === 'text')!.text!);

beforeAll(async () => {
  ({ cleanup, tmpDir } = await openTestDatabase('paloma_mcp_tools_test_', { PALOMA_AUTH: 'on', OPENAI_API_KEY: '', OPENAI_BASE_URL: '' }));
  writeTestPlugin(path.join(tmpDir, 'plugins'), 'fake-vision', { module: FAKE_PROVIDER });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  app = await startTestApp();
  runner = await import('../ai/runner.js');
  runner.timing.sleep = async () => {};
  lib = await buildLibrary(path.join(tmpDir, 'photos'), {
    trip: {
      photos: { sunrise: { dateTaken: '2024-05-09T06:00:00', width: 1000, height: 750 }, birds: { dateTaken: '2024-05-08T06:00:00' } },
      sidecar: {
        albums: { [BIRDS]: { name: 'Birds' } },
        people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
        photos: { 'sunrise.jpg': { caption: 'Sunrise over hills', albums: [BIRDS] }, 'birds.jpg': { albums: [BIRDS], faces: [{ person: ROY }] } },
      },
    },
    home: { photos: { cat: { dateTaken: '2023-01-01T10:00:00' } } },
  });
  for (const [folder, stem, width, height] of [['trip', 'sunrise', 1000, 750], ['trip', 'birds', 400, 300], ['home', 'cat', 400, 300]] as const) {
    await sharp({ create: { width, height, channels: 3, background: '#468' } }).jpeg().toFile(path.join(lib.dir[folder], `${stem}.jpg`));
  }

  const users = await import('../auth/users.js');
  await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' });
  await users.createUser({ username: 'limmy', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: [lib.dir.home] } });
  const session = async (username: string) => {
    const c = new TestClient(app.base);
    expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
    return c;
  };
  const anna = await session('anna');
  const token = async (client: TestClient, permissions: string[]) => (await client.post('/auth/tokens', { name: permissions.join(','), permissions })).body.value as string;
  viewer = await connectMcp(app.base, await token(anna, ['library.view']));
  editor = await connectMcp(app.base, await token(anna, ['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'ai.run', 'export']));
  lim = await connectMcp(app.base, await token(await session('limmy'), ['library.view', 'photos.edit']));
  expect((await anna.patch('/plugins/fake-vision', { enabled: true })).status).toBe(200);
  expect((await anna.patch('/ai/tasks/tags', { provider: 'fake', model: 'm' })).body.ready).toBe(true);
});

afterAll(async () => {
  await runner.aiRunner.idle();
  for (const client of [viewer, editor, lim]) await client?.close();
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('tool list', () => {
  it('offers a view-only token only the reading tools', async () => {
    const names = (await viewer.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['describe_model', 'get_objects', 'library_stats', 'list_objects', 'search_photos', 'view_photo']);
  });

  it('offers an editor token every tool', async () => {
    const names = (await editor.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['apply_changes', 'start_ai_run', 'get_ai_run', 'cancel_ai_run', 'list_ai_tasks', 'export_photos']));
  });

  it('describes every input of every tool', async () => {
    for (const tool of (await editor.listTools()).tools) {
      for (const [name, property] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((property as { description?: string }).description, `${tool.name}.${name}`).toEqual(expect.any(String));
      }
    }
  });
});

describe('reading tools', () => {
  it('describes the model with the guide and the schema', async () => {
    const result = await call(viewer, 'describe_model');
    expect(result.content[0].text).toContain('# Paloma photo library');
    expect(JSON.parse(result.content[1].text!).$defs.PhotoDocument).toBeDefined();
  });

  it('searches photos by text', async () => {
    const body = json(await call(viewer, 'search_photos', { query: 'sunrise', limit: 20 }));
    expect(body.total).toBe(1);
    expect(body.items).toEqual([expect.objectContaining({ type: 'photo', id: lib.id.sunrise, caption: 'Sunrise over hills' })]);
  });

  it('lists ids that are not found', async () => {
    const body = json(await call(viewer, 'get_objects', { type: 'photo', ids: [lib.id.cat, 99999] }));
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([lib.id.cat]);
    expect(body.notFound).toEqual([99999]);
  });

  it('lists albums', async () => {
    const body = json(await call(viewer, 'list_objects', { type: 'album' }));
    expect(body.items).toEqual([expect.objectContaining({ id: BIRDS, name: 'Birds', photoCount: 2 })]);
  });

  it('gives the statistics of an album', async () => {
    const body = json(await call(viewer, 'library_stats', { album: BIRDS }));
    expect(body).toMatchObject({ photoCount: 2, takenFrom: '2024-05-08T06:00:00', takenTo: '2024-05-09T06:00:00' });
    expect(body.people).toEqual([expect.objectContaining({ id: ROY, name: 'Roy Avery' })]);
  });

  it('shows a user with limited access only their part of the library', async () => {
    const body = json(await call(lim, 'search_photos', {}));
    expect(body.items.map((item: { id: number }) => item.id)).toEqual([lib.id.cat]);
    expect(json(await call(lim, 'get_objects', { type: 'photo', ids: [lib.id.sunrise] })).notFound).toEqual([lib.id.sunrise]);
  });
});

describe('view_photo', () => {
  it('returns a JPEG fitted in maxSize and the document', async () => {
    const result = await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 800 });
    const image = result.content.find((item) => item.type === 'image')!;
    expect(image.mimeType).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(image.data!, 'base64')).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 800, 600]);
    expect(json(result)).toMatchObject({ type: 'photo', id: lib.id.sunrise });
  });

  it('renders unsaved edits without saving them', async () => {
    const before = fs.readFileSync(path.join(lib.dir.trip, '.paloma.json'), 'utf-8');
    const result = await call(viewer, 'view_photo', { id: lib.id.sunrise, maxSize: 800, edits: [{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }] });
    const meta = await sharp(Buffer.from(result.content[0].data!, 'base64')).metadata();
    // The left half of 1000×750, already within 800, is not enlarged
    expect([meta.width, meta.height]).toEqual([500, 750]);
    expect(fs.readFileSync(path.join(lib.dir.trip, '.paloma.json'), 'utf-8')).toBe(before);
  });

  it('reports invalid edits and photos the user cannot see', async () => {
    const invalid = await call(viewer, 'view_photo', { id: lib.id.sunrise, edits: [{ filter: 'brightness', amount: 500 }] });
    expect([invalid.isError, json(invalid).code]).toEqual([true, 'edits_invalid']);
    const unseen = await call(lim, 'view_photo', { id: lib.id.sunrise });
    expect([unseen.isError, json(unseen).code]).toEqual([true, 'object_not_found']);
  });
});

describe('apply_changes', () => {
  it('lists before and after in a dry run and writes nothing', async () => {
    const before = fs.existsSync(path.join(lib.dir.home, '.paloma.json'));
    const body = json(await call(editor, 'apply_changes', {
      dryRun: true, changes: [{ op: 'update', type: 'photo', ids: [lib.id.cat, lib.id.birds], set: { tags: { add: ['sea'] } } }],
    }));
    expect(body.dryRun).toBe(true);
    expect(body.results[0].objects).toEqual([
      { id: lib.id.cat, changes: { tags: { from: [], to: ['sea'] } } },
      { id: lib.id.birds, changes: { tags: { from: [], to: ['sea'] } } },
    ]);
    expect(fs.existsSync(path.join(lib.dir.home, '.paloma.json'))).toBe(before);
  });

  it('returns the code, change and field of an invalid change', async () => {
    const result = await call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.cat, set: { fileName: 'x.jpg' } }] });
    expect(result.isError).toBe(true);
    expect(json(result)).toMatchObject({ code: 'read_only_field', params: { index: 0, field: 'fileName' } });
  });

  it('applies a changeset', async () => {
    const body = json(await call(editor, 'apply_changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.cat, set: { star: true } }] }));
    expect(body.results[0].objects).toEqual([{ id: lib.id.cat, changes: { star: { from: false, to: true } } }]);
    expect(lib.readSidecar('home').photos['cat.jpg']).toMatchObject({ star: true });
  });
});

describe('AI and export tools', () => {
  it('runs Tags on photos and reports the progress', async () => {
    fake.__aiFake = () => ({ tags: [{ name: 'gray', confidence: 0.9 }] });
    const tasks = json(await call(editor, 'list_ai_tasks')).tasks;
    expect(tasks).toContainEqual(expect.objectContaining({ id: 'tags', ready: true }));
    const started = json(await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.cat, lib.id.birds] }));
    expect(started).toMatchObject({ taskId: 'tags', total: 2 });
    await runner.aiRunner.idle();
    expect(json(await call(editor, 'get_ai_run'))).toMatchObject({ current: null, last: { state: 'finished', done: 2 } });
  });

  it('refuses a second run while one is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fake.__aiFake = async () => {
      await gate;
      return { tags: [] };
    };
    json(await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.sunrise], again: true }));
    const second = await call(editor, 'start_ai_run', { taskId: 'tags', photoIds: [lib.id.cat], again: true });
    expect([second.isError, json(second).code]).toEqual([true, 'ai_run_in_progress']);
    release();
    await runner.aiRunner.idle();
  });

  it('exports into the export folder and refuses a folder outside it', async () => {
    const body = json(await call(editor, 'export_photos', { photoIds: [lib.id.cat], outputDir: 'trip-2024', resizeWidth: 100 }));
    expect(body).toMatchObject({ success: true, count: 1, files: [path.join('trip-2024', 'exported_cat.jpg')] });
    const outside = await call(editor, 'export_photos', { photoIds: [lib.id.cat], outputDir: '../../etc' });
    expect([outside.isError, json(outside).params]).toEqual([true, { field: 'outputDir' }]);
  });
});

describe('resources', () => {
  it('serves the guide and the schema as the REST endpoints do', async () => {
    const guide = await viewer.readResource({ uri: 'paloma://guide' });
    expect(guide.contents[0]).toMatchObject({ mimeType: 'text/markdown' });
    const { aiGuide } = await import('../model/guide.js');
    expect((guide.contents[0] as { text: string }).text).toBe(aiGuide());
    const schema = await viewer.readResource({ uri: 'paloma://schema' });
    expect(JSON.parse((schema.contents[0] as { text: string }).text).$id).toBe('paloma://schema');
  });
});
